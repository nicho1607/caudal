// Punto de entrada único para abrir el formulario "Nueva transacción" desde
// cualquier CTA (estados vacíos, atajos). Quien implemente Quick Add escucha el
// evento en `window`; hasta entonces el CTA no hace nada visible.

export const QUICK_ADD_EVENT = "caudal:quick-add";

export interface QuickAddDetail {
  /** Tipo preseleccionado en el formulario, si el CTA lo sugiere. */
  type?: "INCOME" | "EXPENSE" | "TRANSFER";
}

export function requestQuickAdd(detail: QuickAddDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<QuickAddDetail>(QUICK_ADD_EVENT, { detail }));
}
