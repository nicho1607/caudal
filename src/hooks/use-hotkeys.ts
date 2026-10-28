"use client";

// Atajos globales de teclado. Reglas (QA-001): se ignoran mientras se escribe
// (input, textarea, select, contenteditable) y cuando ya hay un diálogo, menú o
// popover abierto, para no abrir uno encima de otro.
import { useEffect, useRef } from "react";

/** "n", "mod+k" (Cmd en macOS, Ctrl en el resto), "shift+?"… */
export type Hotkey = string;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']");
}

/** Hay un diálogo, sheet, menú o listbox abierto (los que están animando su cierre no cuentan). */
export function isOverlayOpen(doc: Document = document): boolean {
  return !!doc.querySelector(
    ["dialog", "alertdialog", "menu", "listbox"].map((role) => `[role='${role}']:not([data-state='closed'])`).join(", "),
  );
}

export function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  const parts = hotkey.toLowerCase().split("+");
  const key = parts.pop()!;
  const mod = parts.includes("mod");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt");
  const modPressed = event.metaKey || event.ctrlKey;
  if (mod !== modPressed || shift !== event.shiftKey || alt !== event.altKey) return false;
  return event.key.toLowerCase() === key;
}

export interface HotkeyBinding {
  keys: Hotkey;
  handler: (event: KeyboardEvent) => void;
}

/** Registra los atajos en `window`. El handler más reciente se usa sin re-suscribir. */
export function useHotkeys(bindings: HotkeyBinding[]) {
  const ref = useRef(bindings);
  useEffect(() => {
    ref.current = bindings;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      if (isTypingTarget(event.target) || isOverlayOpen()) return;
      const binding = ref.current.find((b) => matchesHotkey(event, b.keys));
      if (!binding) return;
      event.preventDefault();
      binding.handler(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
