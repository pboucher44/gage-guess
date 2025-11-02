import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const rooms: Map<string, Room> = (globalThis as unknown as { __gageGuessRooms?: Map<string, Room> }).__gageGuessRooms ?? new Map<string, Room>();
(globalThis as unknown as { __gageGuessRooms?: Map<string, Room> }).__gageGuessRooms = rooms;

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

function broadcastToRoom(room: Room, message: any, excludeId?: string) {
  const messageStr = JSON.stringify(message);
  room.players.forEach(player => {
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

  socket.onmessage = (event) => {
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

          currentRoom = {
            code: roomCode,
            maxNumber: data.maxNumber,
            players: [currentPlayer],
            hasUsedReverse: false,
            state: 'waiting',
          };

          rooms.set(roomCode, currentRoom);
          console.log("Room created with code:", roomCode);
          console.log("Total rooms:", rooms.size);

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
          console.log("Available rooms:", Array.from(rooms.keys()));
          const room = rooms.get(requestedCode);
          if (!room) {
            console.log("Room not found for code:", requestedCode);
            socket.send(JSON.stringify({
              type: 'error',
              message: `Room not found. Code: ${requestedCode}. Available: ${Array.from(rooms.keys()).join(', ')}`,
            }));
            return;
          }

          if (room.players.length >= 2) {
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

          room.players.push(currentPlayer);
          currentRoom = room;

          socket.send(JSON.stringify({
            type: 'room_joined',
            code: room.code,
            playerId: newPlayerId,
            maxNumber: room.maxNumber,
          }));

          broadcastToRoom(room, {
            type: 'player_joined',
            playerCount: room.players.length,
          }, newPlayerId);

          if (room.players.length === 2) {
            room.state = 'playing';
            broadcastToRoom(room, {
              type: 'game_start',
              maxNumber: room.maxNumber,
            });
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

          broadcastToRoom(currentRoom, {
            type: 'player_ready',
            playerId: currentPlayer.id,
          });

          const allReady = currentRoom.players.every(p => p.number !== undefined);
          if (allReady) {
            const [player1, player2] = currentRoom.players;
            const isMatch = player1.number === player2.number;

            if (isMatch) {
              currentRoom.state = 'gameover';
              broadcastToRoom(currentRoom, {
                type: 'game_result',
                match: true,
                numbers: [player1.number, player2.number],
              });
            } else {
              currentRoom.state = 'result';
              broadcastToRoom(currentRoom, {
                type: 'game_result',
                match: false,
                numbers: [player1.number, player2.number],
                canReverse: !currentRoom.hasUsedReverse,
              });
            }
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

          currentRoom.hasUsedReverse = true;
          const newMax = Math.max(2, Math.ceil(currentRoom.maxNumber / 2));
          currentRoom.maxNumber = newMax;
          currentRoom.state = 'playing';
          
          currentRoom.players.forEach(p => p.number = undefined);

          broadcastToRoom(currentRoom, {
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

          currentRoom.hasUsedReverse = false;
          currentRoom.state = 'playing';
          currentRoom.players.forEach(p => p.number = undefined);

          broadcastToRoom(currentRoom, {
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

  socket.onclose = () => {
    console.log("WebSocket connection closed");
    if (currentRoom && currentPlayer) {
      currentRoom.players = currentRoom.players.filter(p => p.id !== currentPlayer?.id);
      
      if (currentRoom.players.length === 0) {
        rooms.delete(currentRoom.code);
      } else {
        broadcastToRoom(currentRoom, {
          type: 'player_left',
          playerCount: currentRoom.players.length,
        });
      }
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  return response;
});
