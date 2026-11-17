import { useCountUp } from "../hooks/useCountUp";

interface ScoreReadoutProps {
  score: number;
}

function verdict(score: number) {
  if (score >= 85) return { label: "Blindado", color: "#E9E6DF" };
  if (score >= 70) return { label: "Atenção", color: "#F2C14E" };
  if (score >= 50) return { label: "Vulnerável", color: "#FF8A3D" };
  return { label: "Crítico", color: "#FF4D2E" };
}

export function ScoreReadout({ score }: ScoreReadoutProps) {
  const animated = useCountUp(score, 1200);
  const v = verdict(score);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="display text-[5.5rem] font-medium leading-[0.85] tabular text-bone">
          {animated}
        </span>
        <span className="data-label mb-2">/ 100</span>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <span className="data-label">veredito</span>
        <span className="text-[13px] font-medium" style={{ color: v.color }}>
          {v.label}
        </span>
      </div>

      {/* escala de medição */}
      <div className="mt-6">
        <div className="relative h-3">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule-strong" />
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-bone-dim"
            style={{ width: `${score}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-bone"
            style={{ left: `calc(${score}% - 0.5px)` }}
          />
          {[0, 25, 50, 75, 100].map((t) => (
            <span
              key={t}
              className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-rule-strong"
              style={{ left: `${t}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between">
          {[0, 25, 50, 75, 100].map((t) => (
            <span key={t} className="data-label tabular">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ScoreReadout;
