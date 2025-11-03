import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Player {
  id: string;
  socket: WebSocket;
  isHost: boolean;
  number?: number;
}

interface Room {
  code: string;
  maxNumber: number;
  players: Player[];
  hasUsedReverse: boolean;
  state: 'waiting' | 'playing' | 'result' | 'gameover';
}

// Active WebSocket connections tracked in memory
type GlobalWithSockets = typeof globalThis & {
  __gageGuessSockets?: Map<string, Player>;
};

const globalScope = globalThis as GlobalWithSockets;

if (!globalScope.__gageGuessSockets) {
  globalScope.__gageGuessSockets = new Map<string, Player>();
}

const sockets = globalScope.__gageGuessSockets;

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

async function getRoomPlayers(roomCode: string): Promise<Player[]> {
  const { data } = await supabase
    .from('game_players')
    .select('*')
    .eq('room_code', roomCode);
  
  return (data || [])
    .filter(p => sockets.has(p.player_id))
    .map(p => ({
      id: p.player_id,
      socket: sockets.get(p.player_id)!.socket,
      isHost: p.is_host,
      number: p.number,
    }));
}

async function broadcastToRoom(roomCode: string, message: any, excludeId?: string) {
  const players = await getRoomPlayers(roomCode);
  const messageStr = JSON.stringify(message);
  players.forEach(player => {
    if (player.id !== excludeId && player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(messageStr);
    }
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 400, headers: corsHeaders });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  let currentPlayer: Player | null = null;
  let currentRoom: Room | null = null;

  socket.onopen = () => {
    console.log("WebSocket connection opened");
  };

  socket.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("Received message:", data);

      switch (data.type) {
        case 'create':
          const roomCode = normalizeRoomCode(generateRoomCode());
          const playerId = crypto.randomUUID();
          
          currentPlayer = {
            id: playerId,
            socket,
            isHost: true,
          };
          
          sockets.set(playerId, currentPlayer);

          // Create room in database
          const { error: roomError } = await supabase
            .from('game_rooms')
            .insert({
              code: roomCode,
              max_number: data.maxNumber,
              has_used_reverse: false,
              state: 'waiting',
            });

          if (roomError) {
            console.error("Error creating room:", roomError);
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Failed to create room',
            }));
            return;
          }

          // Add player to database
          await supabase
            .from('game_players')
            .insert({
              room_code: roomCode,
              player_id: playerId,
              is_host: true,
            });

          currentRoom = {
            code: roomCode,
            maxNumber: data.maxNumber,
            players: [currentPlayer],
            hasUsedReverse: false,
            state: 'waiting',
          };

          console.log("Room created with code:", roomCode);

          socket.send(JSON.stringify({
            type: 'room_created',
            code: roomCode,
            playerId,
            maxNumber: data.maxNumber,
          }));
          break;

        case 'join':
          if (typeof data.code !== 'string') {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Invalid room code',
            }));
            return;
          }

          const requestedCode = normalizeRoomCode(data.code);
          console.log("Join request for code:", requestedCode);
          
          // Check if room exists in database
          const { data: roomData, error: roomFetchError } = await supabase
            .from('game_rooms')
            .select('*')
            .eq('code', requestedCode)
            .single();

          if (roomFetchError || !roomData) {
            console.log("Room not found for code:", requestedCode);
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Room not found',
            }));
            return;
          }

          // Check player count
          const { data: playersData } = await supabase
            .from('game_players')
            .select('*')
            .eq('room_code', requestedCode);

          if (playersData && playersData.length >= 2) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Room is full',
            }));
            return;
          }

          const newPlayerId = crypto.randomUUID();
          currentPlayer = {
            id: newPlayerId,
            socket,
            isHost: false,
          };
          
          sockets.set(newPlayerId, currentPlayer);

          // Add player to database
          await supabase
            .from('game_players')
            .insert({
              room_code: requestedCode,
              player_id: newPlayerId,
              is_host: false,
            });

          currentRoom = {
            code: requestedCode,
            maxNumber: roomData.max_number,
            players: await getRoomPlayers(requestedCode),
            hasUsedReverse: roomData.has_used_reverse,
            state: roomData.state as any,
          };

          socket.send(JSON.stringify({
            type: 'room_joined',
            code: requestedCode,
            playerId: newPlayerId,
            maxNumber: roomData.max_number,
          }));

          await broadcastToRoom(requestedCode, {
            type: 'player_joined',
            playerCount: currentRoom.players.length,
          }, newPlayerId);

          if (currentRoom.players.length === 2) {
            await supabase
              .from('game_rooms')
              .update({ state: 'playing' })
              .eq('code', requestedCode);
            
            // Send game_start to current player
            socket.send(JSON.stringify({
              type: 'game_start',
              maxNumber: roomData.max_number,
            }));
              
            // Also broadcast to other players
            await broadcastToRoom(requestedCode, {
              type: 'game_start',
              maxNumber: roomData.max_number,
            }, newPlayerId);
          }
          break;

        case 'submit_number':
          if (!currentRoom || !currentPlayer) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Not in a room',
            }));
            return;
          }

          currentPlayer.number = data.number;
          
          // Update player number in database
          await supabase
            .from('game_players')
            .update({ number: data.number })
            .eq('room_code', currentRoom.code)
            .eq('player_id', currentPlayer.id);

          await broadcastToRoom(currentRoom.code, {
            type: 'player_ready',
            playerId: currentPlayer.id,
          });

          // Check if all ready
          const { data: allPlayers } = await supabase
            .from('game_players')
            .select('*')
            .eq('room_code', currentRoom.code);

          const allReady = allPlayers && allPlayers.every(p => p.number !== null);
          if (allReady && allPlayers.length === 2) {
            const [player1, player2] = allPlayers;
            const isMatch = player1.number === player2.number;

            const newState = isMatch ? 'gameover' : 'result';
            await supabase
              .from('game_rooms')
              .update({ state: newState })
              .eq('code', currentRoom.code);

            await broadcastToRoom(currentRoom.code, {
              type: 'game_result',
              match: isMatch,
              numbers: [player1.number, player2.number],
              canReverse: !currentRoom.hasUsedReverse,
            });
          }
          break;

        case 'reverse':
          if (!currentRoom || !currentPlayer || !currentPlayer.isHost) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Only host can reverse',
            }));
            return;
          }

          if (currentRoom.hasUsedReverse) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Reverse already used',
            }));
            return;
          }

          const newMax = Math.max(2, Math.ceil(currentRoom.maxNumber / 2));
          
          // Update room in database
          await supabase
            .from('game_rooms')
            .update({
              has_used_reverse: true,
              max_number: newMax,
              state: 'playing',
            })
            .eq('code', currentRoom.code);

          // Reset player numbers
          await supabase
            .from('game_players')
            .update({ number: null })
            .eq('room_code', currentRoom.code);

          currentRoom.hasUsedReverse = true;
          currentRoom.maxNumber = newMax;
          currentRoom.state = 'playing';

          await broadcastToRoom(currentRoom.code, {
            type: 'reverse_activated',
            newMaxNumber: newMax,
          });
          break;

        case 'reset':
          if (!currentRoom || !currentPlayer || !currentPlayer.isHost) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Only host can reset',
            }));
            return;
          }

          // Reset room in database
          await supabase
            .from('game_rooms')
            .update({
              has_used_reverse: false,
              state: 'playing',
            })
            .eq('code', currentRoom.code);

          // Reset player numbers
          await supabase
            .from('game_players')
            .update({ number: null })
            .eq('room_code', currentRoom.code);

          currentRoom.hasUsedReverse = false;
          currentRoom.state = 'playing';

          await broadcastToRoom(currentRoom.code, {
            type: 'game_reset',
            maxNumber: currentRoom.maxNumber,
          });
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message',
      }));
    }
  };

  socket.onclose = async () => {
    console.log("WebSocket connection closed");
    if (currentRoom && currentPlayer) {
      // Remove player from database
      await supabase
        .from('game_players')
        .delete()
        .eq('room_code', currentRoom.code)
        .eq('player_id', currentPlayer.id);

      sockets.delete(currentPlayer.id);

      // Check remaining players
      const { data: remainingPlayers } = await supabase
        .from('game_players')
        .select('*')
        .eq('room_code', currentRoom.code);
      
      if (!remainingPlayers || remainingPlayers.length === 0) {
        // Delete room if empty
        await supabase
          .from('game_rooms')
          .delete()
          .eq('code', currentRoom.code);
      } else {
        await broadcastToRoom(currentRoom.code, {
          type: 'player_left',
          playerCount: remainingPlayers.length,
        });
      }
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  return response;
});
