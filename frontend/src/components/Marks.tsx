/**
 * Marcas próprias — SVG geométrico de traço fino (1.4px), sem biblioteca de ícones.
 * Substituem o vocabulário genérico de ícones de linha por sinais desenhados.
 */

interface MarkProps {
  className?: string;
}

/** Logotipo: visor / retícula com núcleo sólido. */
export function MarkLogo({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 9V4h5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M20 9V4h-5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 15v5h5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M20 15v5h-5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10.3" y="10.3" width="3.4" height="3.4" fill="currentColor" />
    </svg>
  );
}

/** Exportar: seta para a linha de base. */
export function MarkExport({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 3v11.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 10 12 14.5 16.5 10" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Reiniciar: arco aberto com ponta. */
export function MarkReset({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.4-5.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M20 4.5V10h-5.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Alerta: haste com ponto sólido. */
export function MarkAlert({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 4.5v10.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11.2" y="18" width="1.6" height="1.6" fill="currentColor" />
    </svg>
  );
}
