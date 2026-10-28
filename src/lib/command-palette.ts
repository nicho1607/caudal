// Abre la paleta de comandos (⌘K) desde cualquier botón (p. ej. "Buscar" del
// topbar). La escucha CommandCenter, montado una vez en el layout de (app).

export const COMMAND_PALETTE_EVENT = "caudal:command-palette";

export function requestCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT));
}
