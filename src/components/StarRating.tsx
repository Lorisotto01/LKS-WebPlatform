import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  /** Valore corrente (1..5). */
  value: number;
  /** Se passato, le stelle sono cliccabili e modificano il voto. */
  onChange?: (value: number) => void;
  /** Dimensione icona in px (default 20). */
  size?: number;
  className?: string;
}

/** Selettore/visualizzatore a stelle (max 5). Interattivo se `onChange` è fornito. */
export function StarRating({ value, onChange, size = 20, className = "" }: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === "function";
  const shown = hover || value;

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} role={interactive ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        return (
          <button
            key={n}
            type="button"
            disabled={!interactive}
            aria-label={`${n} ${n === 1 ? "stella" : "stelle"}`}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => interactive && setHover(n)}
            onMouseLeave={() => interactive && setHover(0)}
            className={interactive ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"}
          >
            <Star
              style={{ width: size, height: size }}
              className={filled ? "fill-warning text-warning" : "fill-transparent text-muted-foreground/40"}
            />
          </button>
        );
      })}
    </div>
  );
}
