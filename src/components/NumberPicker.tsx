import { Button } from "@/components/ui/button";

interface NumberPickerProps {
  maxNumber: number;
  onSelect: (number: number) => void;
  disabled?: boolean;
}

const NumberPicker = ({ maxNumber, onSelect, disabled }: NumberPickerProps) => {
  // Génère les chiffres de 2 à maxNumber inclus
  const numbers = Array.from({ length: maxNumber - 1 }, (_, i) => i + 2);

  return (
    <div className="grid grid-cols-3 gap-4 w-full max-w-md mx-auto animate-slide-up">
      {numbers.map((num) => (
        <Button
          key={num}
          onClick={() => onSelect(num)}
          disabled={disabled}
          className="h-24 text-4xl font-bold bg-card hover:bg-muted border-2 border-primary/20 hover:border-primary transition-all duration-300 hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--card)), hsl(var(--muted)))',
          }}
        >
          {num}
        </Button>
      ))}
    </div>
  );
};

export default NumberPicker;
