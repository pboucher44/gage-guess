import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { GameWebSocket } from "@/utils/websocket";
import NumberPicker from "@/components/NumberPicker";
import GameResult from "@/components/GameResult";

type GameState = 'menu' | 'create' | 'join' | 'waiting' | 'playing' | 'result';

const Index = () => {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>('menu');
  const [ws, setWs] = useState<GameWebSocket | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [maxNumber, setMaxNumber] = useState(9);
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [gameResult, setGameResult] = useState<{
    match: boolean;
    numbers: [number, number];
    canReverse: boolean;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (ws) {
        ws.disconnect();
      }
    };
  }, [ws]);

  const handleMessage = (data: any) => {
    console.log("Received:", data);

    switch (data.type) {
      case 'room_created':
        setRoomCode(data.code);
        setPlayerId(data.playerId);
        setIsHost(true);
        setMaxNumber(data.maxNumber);
        setGameState('waiting');
        toast({
          title: "Room créée !",
          description: `Code: ${data.code}`,
        });
        break;

      case 'room_joined':
        setRoomCode(data.code);
        setPlayerId(data.playerId);
        setIsHost(false);
        setMaxNumber(data.maxNumber);
        setGameState('waiting');
        toast({
          title: "Room rejointe !",
          description: "En attente du second joueur...",
        });
        break;

      case 'player_joined':
        toast({
          title: "Joueur connecté !",
          description: "La partie peut commencer",
        });
        break;

      case 'game_start':
        setGameState('playing');
        setMaxNumber(data.maxNumber);
        toast({
          title: "C'est parti !",
          description: "Choisissez votre chiffre",
        });
        break;

      case 'player_ready':
        if (data.playerId !== playerId) {
          setOpponentReady(true);
        }
        break;

      case 'game_result':
        setGameResult({
          match: data.match,
          numbers: data.numbers,
          canReverse: data.canReverse || false,
        });
        setGameState('result');
        setPlayerReady(false);
        setOpponentReady(false);
        break;

      case 'reverse_activated':
        setMaxNumber(data.newMaxNumber);
        setSelectedNumber(null);
        setGameState('playing');
        toast({
          title: "Reverse activé !",
          description: `Nouveau maximum: ${data.newMaxNumber}`,
        });
        break;

      case 'game_reset':
        setGameState('playing');
        setSelectedNumber(null);
        setGameResult(null);
        setPlayerReady(false);
        setOpponentReady(false);
        toast({
          title: "Nouvelle partie !",
          description: "Choisissez votre chiffre",
        });
        break;

      case 'player_left':
        toast({
          title: "Joueur déconnecté",
          description: "L'autre joueur a quitté la partie",
          variant: "destructive",
        });
        setGameState('menu');
        break;

      case 'error':
        toast({
          title: "Erreur",
          description: data.message,
          variant: "destructive",
        });
        break;
    }
  };

  const createRoom = () => {
    const socket = new GameWebSocket(handleMessage, (error) => {
      toast({
        title: "Erreur de connexion",
        description: "Impossible de se connecter au serveur",
        variant: "destructive",
      });
    });
    
    socket.connect();
    setWs(socket);
    
    setTimeout(() => {
      socket.send({ type: 'create', maxNumber });
    }, 500);
  };

  const joinRoom = () => {
    if (!joinCode) {
      toast({
        title: "Code requis",
        description: "Veuillez entrer un code de room",
        variant: "destructive",
      });
      return;
    }

    const socket = new GameWebSocket(handleMessage, (error) => {
      toast({
        title: "Erreur de connexion",
        description: "Impossible de se connecter au serveur",
        variant: "destructive",
      });
    });
    socket.connect();
    setWs(socket);
    
    setTimeout(() => {
      const formattedCode = joinCode.trim().toUpperCase();
      console.log("Joining room with code:", formattedCode);
      socket.send({ type: 'join', code: formattedCode });
    }, 500);
  };

  const submitNumber = (number: number) => {
    setSelectedNumber(number);
    setPlayerReady(true);
    ws?.send({ type: 'submit_number', number });
    toast({
      title: "Chiffre envoyé !",
      description: "En attente de l'autre joueur...",
    });
  };

  const handleReverse = () => {
    ws?.send({ type: 'reverse' });
  };

  const handleReset = () => {
    ws?.send({ type: 'reset' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-8 bg-card/80 backdrop-blur-sm shadow-2xl border-2 border-primary/20">
        {gameState === 'menu' && (
          <div className="flex flex-col gap-6 animate-slide-up">
            <h1 className="text-6xl font-bold text-center mb-8 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Pour Combien ?
            </h1>
            <Button
              onClick={() => setGameState('create')}
              size="lg"
              className="text-2xl py-8 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              Créer une Room
            </Button>
            <Button
              onClick={() => setGameState('join')}
              size="lg"
              variant="secondary"
              className="text-2xl py-8 bg-gradient-to-r from-secondary to-accent hover:opacity-90 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              Rejoindre une Room
            </Button>
          </div>
        )}

        {gameState === 'create' && (
          <div className="flex flex-col gap-6 animate-slide-up">
            <h2 className="text-4xl font-bold text-center mb-4">Créer une Room</h2>
            <div className="space-y-4">
              <label className="text-xl">Chiffre maximum (2-9)</label>
              <Input
                type="number"
                min="2"
                max="9"
                value={maxNumber}
                onChange={(e) => setMaxNumber(Math.min(9, Math.max(2, parseInt(e.target.value) || 2)))}
                className="text-2xl p-6 text-center bg-muted border-2 border-primary/30"
              />
            </div>
            <Button
              onClick={createRoom}
              size="lg"
              className="text-2xl py-8 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all duration-300"
            >
              Créer
            </Button>
            <Button
              onClick={() => setGameState('menu')}
              size="lg"
              variant="secondary"
              className="text-xl py-6"
            >
              Retour
            </Button>
          </div>
        )}

        {gameState === 'join' && (
          <div className="flex flex-col gap-6 animate-slide-up">
            <h2 className="text-4xl font-bold text-center mb-4">Rejoindre une Room</h2>
            <Input
              type="text"
              placeholder="CODE DE LA ROOM"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="text-2xl p-6 text-center uppercase bg-muted border-2 border-secondary/30"
            />
            <Button
              onClick={joinRoom}
              size="lg"
              className="text-2xl py-8 bg-gradient-to-r from-secondary to-accent hover:opacity-90 transition-all duration-300"
            >
              Rejoindre
            </Button>
            <Button
              onClick={() => setGameState('menu')}
              size="lg"
              variant="secondary"
              className="text-xl py-6"
            >
              Retour
            </Button>
          </div>
        )}

        {gameState === 'waiting' && (
          <div className="flex flex-col gap-6 items-center animate-slide-up">
            <h2 className="text-4xl font-bold text-center">En attente...</h2>
            <div className="text-center p-8 bg-muted rounded-2xl border-2 border-primary">
              <p className="text-xl text-muted-foreground mb-2">Code de la room:</p>
              <p className="text-6xl font-bold tracking-wider bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent animate-pulse-glow">
                {roomCode}
              </p>
            </div>
            <p className="text-xl text-muted-foreground">
              Partagez ce code avec votre ami !
            </p>
            <div className="text-sm text-muted-foreground/60 mt-4 p-4 bg-background/50 rounded">
              <p>⚠️ Important : Les deux joueurs doivent rester sur cette page</p>
              <p>Si vous rafraîchissez, la room sera perdue</p>
            </div>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-4xl font-bold text-center">
              Choisissez un chiffre (2-{maxNumber})
            </h2>
            {playerReady && (
              <div className="text-center p-6 bg-accent/20 rounded-xl border-2 border-accent">
                <p className="text-2xl font-bold text-accent">
                  Votre choix: {selectedNumber}
                </p>
                <p className="text-lg text-muted-foreground mt-2">
                  {opponentReady ? "Révélation en cours..." : "En attente de l'autre joueur..."}
                </p>
              </div>
            )}
            <NumberPicker
              maxNumber={maxNumber}
              onSelect={submitNumber}
              disabled={playerReady}
            />
          </div>
        )}

        {gameState === 'result' && gameResult && (
          <GameResult
            match={gameResult.match}
            numbers={gameResult.numbers}
            canReverse={gameResult.canReverse}
            isHost={isHost}
            onReverse={handleReverse}
            onReset={handleReset}
          />
        )}
      </Card>
    </div>
  );
};

export default Index;
