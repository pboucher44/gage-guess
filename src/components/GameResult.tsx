import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import confetti from "canvas-confetti";

interface GameResultProps {
  match: boolean;
  numbers: [number, number];
  canReverse: boolean;
  isHost: boolean;
  onReverse: () => void;
  onReset: () => void;
}

const GameResult = ({ match, numbers, canReverse, isHost, onReverse, onReset }: GameResultProps) => {
  useEffect(() => {
    if (match) {
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          clearInterval(interval);
          return;
        }

        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#FF6B35', '#00D9FF', '#4ADE80'],
        });
        
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#FF6B35', '#00D9FF', '#4ADE80'],
        });
      }, 50);

      return () => clearInterval(interval);
    }
  }, [match]);

  return (
    <div className="flex flex-col items-center justify-center gap-8 animate-slide-up">
      <div className="text-center">
        <h2 className="text-6xl font-bold mb-4">
          {match ? "🎉 MATCH ! 🎉" : "❌ Pas de Match"}
        </h2>
        <div className="flex gap-8 justify-center mb-4">
          <div className="text-center">
            <p className="text-muted-foreground mb-2">Joueur 1</p>
            <div className="text-7xl font-bold bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent animate-pulse-glow">
              {numbers[0]}
            </div>
          </div>
          <div className="text-7xl font-bold text-muted-foreground">vs</div>
          <div className="text-center">
            <p className="text-muted-foreground mb-2">Joueur 2</p>
            <div className="text-7xl font-bold bg-gradient-to-br from-secondary to-primary bg-clip-text text-transparent animate-pulse-glow">
              {numbers[1]}
            </div>
          </div>
        </div>
        {match && (
          <p className="text-2xl text-accent mt-6">
            C'est le moment du gage ! 🎭
          </p>
        )}
      </div>

      {!match && canReverse && isHost && (
        <Button
          onClick={onReverse}
          size="lg"
          className="text-2xl py-8 px-12 bg-gradient-to-r from-secondary to-accent hover:opacity-90 transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg"
        >
          🔄 Reverse !
        </Button>
      )}

      {!match && !canReverse && (
        <div className="text-center">
          <h3 className="text-4xl font-bold text-destructive mb-4">GAME OVER</h3>
          <p className="text-xl text-muted-foreground">Reverse déjà utilisé !</p>
        </div>
      )}

      {isHost && (match || !canReverse) && (
        <Button
          onClick={onReset}
          size="lg"
          className="text-xl py-6 px-10 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all duration-300"
        >
          Nouvelle Partie
        </Button>
      )}
    </div>
  );
};

export default GameResult;
