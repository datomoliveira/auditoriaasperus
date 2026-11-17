import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../hooks/useCountUp";

const LINES = [
  "inicializando núcleo",
  "montando sandbox isolada",
  "carregando assinaturas owasp",
  "conectando roteador de ia",
  "pronto",
];

interface IntroProps {
  onDone: () => void;
}

export function Intro({ onDone }: IntroProps) {
  const reduce = usePrefersReducedMotion();
  const [line, setLine] = useState(0);
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const letters = "SENTINEL".split("");

  useEffect(() => {
    if (reduce) {
      if (!done.current) {
        done.current = true;
        onDone();
      }
      return;
    }

    const timers: number[] = [];
    LINES.forEach((_, i) => timers.push(window.setTimeout(() => setLine(i), i * 420)));

    const duration = 2200;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(Math.round(t * 100));
      if (t < 1) raf = requestAnimationFrame(step);
      else timers.push(window.setTimeout(() => setLeaving(true), 150));
    };
    raf = requestAnimationFrame(step);

    const skip = () => setLeaving(true);
    window.addEventListener("keydown", skip);
    return () => {
      timers.forEach((t) => clearTimeout(t));
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", skip);
    };
  }, [reduce, onDone]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col justify-between bg-ink px-6 py-8 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-10 sm:py-10 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      onTransitionEnd={() => {
        if (leaving && !done.current) {
          done.current = true;
          onDone();
        }
      }}
      role="status"
      aria-label="Inicializando o Sentinel"
    >
      <div className="flex items-start justify-between">
        <span className="data-label">Sentinel / inicialização</span>
        <span className="data-label tabular">{String(progress).padStart(3, "0")}%</span>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="flex items-end gap-[0.02em]" aria-label="Sentinel">
          {letters.map((ch, i) => (
            <span
              key={i}
              className="animate-rise display text-[13vw] font-medium leading-[0.9] text-bone sm:text-[9rem]"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              {ch}
            </span>
          ))}
          <span className="animate-blink mb-[2.2vw] ml-3 h-[2.4vw] w-[2.4vw] bg-signal sm:mb-4 sm:h-4 sm:w-4" />
        </div>

        <div className="rule mt-8 max-w-3xl" />

        <ol className="mt-5 max-w-3xl space-y-1.5">
          {LINES.map((l, i) => (
            <li
              key={l}
              className={`font-mono text-[12px] transition-opacity duration-300 ${
                i <= line ? "text-bone-dim opacity-100" : "opacity-0"
              }`}
            >
              <span className="text-signal">→</span> {l}
              {i === line && <span className="animate-blink">_</span>}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-end justify-between gap-6">
        <button
          type="button"
          onClick={() => setLeaving(true)}
          className="data-label link-underline transition-colors hover:text-bone"
        >
          Pular
        </button>

        <div className="relative hidden h-24 w-24 shrink-0 sm:block">
          <span className="absolute inset-0 rounded-full border border-rule" />
          <span className="absolute inset-3 rounded-full border border-rule" />
          <span className="absolute inset-0 animate-spin-slow rounded-full border-t border-signal" />
          <span className="animate-sweep absolute inset-x-0 top-1/2 h-px bg-signal/60" />
        </div>
      </div>
    </div>
  );
}

export default Intro;
