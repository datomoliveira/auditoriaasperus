import { cn } from "../lib/cn";

const STAGES = [
  "Criando um espaço seguro para a análise",
  "Procurando falhas de segurança conhecidas",
  "Procurando senhas e chaves expostas",
  "Preparando as correções",
];

interface ScanningOverlayProps {
  stage: string;
}

function activeIndex(stage: string) {
  if (stage.includes("Criando")) return 0;
  if (stage.includes("falhas")) return 1;
  if (stage.includes("senhas")) return 2;
  if (stage.includes("correções")) return 3;
  return 0;
}

/**
 * Overlay de execução — mesmo mundo do dossiê: tela cheia, régua, mono para
 * dados. Sem vidro, sem card, sem anel de progresso decorativo.
 */
export function ScanningOverlay({ stage }: ScanningOverlayProps) {
  const active = activeIndex(stage);

  return (
    <div className="animate-fade fixed inset-0 z-[90] flex flex-col justify-between bg-ink px-6 py-8 sm:px-10 sm:py-10">
      <div className="flex items-start justify-between">
        <span className="data-label">Sentinel / analisando seu projeto</span>
        <span className="data-label flex items-center gap-2">
          <span className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-signal" />
          em andamento
        </span>
      </div>

      <div className="max-w-3xl">
        <span className="data-label">o que está acontecendo agora</span>
        <p className="display mt-3 text-[1.75rem] leading-tight text-bone sm:text-[2.25rem]">
          {stage || "começando"}
          <span className="animate-blink ml-1 text-signal">_</span>
        </p>

        <ol className="mt-10">
          {STAGES.map((s, i) => {
            const done = i < active;
            const current = i === active;
            return (
              <li
                key={s}
                className="rule flex items-center gap-4 py-3.5 first:border-t-0"
              >
                <span className="data-label tabular w-8 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "text-[14px] transition-colors",
                    current && "text-bone",
                    done && "text-bone-faint line-through decoration-bone-faint/40",
                    !done && !current && "text-bone-faint",
                  )}
                >
                  {s}
                </span>
                <span className="data-label ml-auto shrink-0">
                  {done ? "feito" : current ? "agora" : "na fila"}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-end justify-between gap-6">
        <span className="data-label max-w-md leading-relaxed">
          seu projeto fica guardado à parte e é apagado assim que a análise termina
        </span>
        <div className="relative hidden h-20 w-20 shrink-0 sm:block">
          <span className="absolute inset-0 rounded-full border border-rule" />
          <span className="absolute inset-3 rounded-full border border-rule" />
          <span className="animate-spin-slow absolute inset-0 rounded-full border-t border-signal" />
        </div>
      </div>
    </div>
  );
}

export default ScanningOverlay;
