import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  /** Color vía `currentColor`: pasa una clase de texto semántica (`text-income`, …). */
  className?: string;
}

const W = 100;
const H = 32;
const PAD = 2; // margen vertical para que el trazo no se recorte en los extremos

/**
 * Sparkline SVG sin ejes: trazo de 1.5 px en `currentColor` y relleno plano al 8 %
 * (sin gradiente, docs §3). Escala horizontal libre (`preserveAspectRatio="none"`)
 * con trazo que no se deforma (`vector-effect: non-scaling-stroke`).
 */
export function Sparkline({ values, className }: SparklineProps) {
  if (values.length < 2) return <div aria-hidden className={cn("h-8", className)} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const x = (i: number) => (i / (values.length - 1)) * W;
  // Serie plana → línea centrada.
  const y = (v: number) => (span === 0 ? H / 2 : PAD + (1 - (v - min) / span) * (H - PAD * 2));

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const area = `${line}L${W},${H}L0,${H}Z`;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full overflow-visible", className)}
    >
      <path d={area} fill="currentColor" fillOpacity={0.08} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
