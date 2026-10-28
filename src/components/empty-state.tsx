import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Una línea que explica qué falta (docs §3). */
  message: string;
  action?: ReactNode;
  className?: string;
}

/** Estado vacío de un widget: mensaje breve centrado y, opcionalmente, un CTA. */
export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center", className)}>
      <p className="text-[13px] leading-5 text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
