import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Contenedor del tooltip de los gráficos: tokens de popover, borde hairline y
 * cifras tabulares. Flota, así que lleva una sombra suave (docs §3).
 */
export function ChartTooltip({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "num min-w-44 rounded-md border bg-popover px-3 py-2 text-xs leading-4 text-popover-foreground shadow-md",
        className,
      )}
    >
      {title ? <p className="mb-1.5 font-medium">{title}</p> : null}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

interface ChartTooltipRowProps {
  label: ReactNode;
  value: ReactNode;
  /** Color del marcador (CSS: `var(--income)`, …). Sin color, no hay marcador. */
  color?: string;
  /** Marcador como raya (series de línea) en lugar de cuadrado. */
  line?: boolean;
  muted?: boolean;
}

export function ChartTooltipRow({ label, value, color, line, muted }: ChartTooltipRowProps) {
  return (
    <div className={cn("flex items-center gap-2", muted && "text-muted-foreground")}>
      {color ? (
        <span
          aria-hidden
          className={cn("shrink-0", line ? "h-0.5 w-2.5 rounded-full" : "size-2 rounded-[2px]")}
          style={{ background: color }}
        />
      ) : (
        <span aria-hidden className="w-2.5 shrink-0" />
      )}
      <span className="flex-1">{label}</span>
      <span className="font-medium whitespace-nowrap">{value}</span>
    </div>
  );
}
