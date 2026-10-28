import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WidgetCardProps {
  /** `data-slot` estable del hueco de la rejilla (lo usan los tests y el layout). */
  slot: string;
  title: string;
  /** Controles a la derecha del título (toggle de rango, enlace "Ver todos"…). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Contenedor de un widget del dashboard: borde hairline, título h2 y acciones. */
export function WidgetCard({ slot, title, actions, className, children }: WidgetCardProps) {
  const headingId = `slot-${slot}`;
  return (
    <section
      data-slot={slot}
      aria-labelledby={headingId}
      className={cn("flex min-h-56 min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 lg:p-5", className)}
    >
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={headingId} className="text-[15px] leading-[22px] font-semibold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Estado de error de un widget (docs §3): "No se pudo cargar. [Reintentar]". */
export function WidgetError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
      <p className="text-[13px] leading-5">No se pudo cargar.</p>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
        Reintentar
      </Button>
    </div>
  );
}
