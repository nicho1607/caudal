"use client";

import { ArrowLeftRight, Minus, Moon, Plus, Search } from "lucide-react";
import { useState } from "react";

import { NAV_ITEMS } from "@/components/shell/nav-items";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { QuickAddFormType } from "@/features/quick-add/form";

export type PaletteAction =
  | { kind: "quick-add"; type: QuickAddFormType }
  | { kind: "navigate"; href: string }
  | { kind: "search"; query: string }
  | { kind: "theme" };

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: PaletteAction) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border px-1 font-sans text-[11px] leading-4 tracking-normal">{children}</kbd>;
}

/** Paleta ⌘K: acciones rápidas, navegación por secciones y búsqueda en movimientos. */
export function CommandPalette({ open, onOpenChange, onAction, onCloseAutoFocus }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="top-[15%] translate-y-0 gap-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Paleta de comandos</DialogTitle>
          <DialogDescription>Busca una acción, una sección o un movimiento.</DialogDescription>
        </DialogHeader>
        {open ? <PaletteBody onAction={onAction} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ onAction }: { onAction: (action: PaletteAction) => void }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  return (
    <Command loop className="rounded-none! bg-transparent">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Busca una acción o un movimiento…" />
      <CommandList className="max-h-[min(24rem,60svh)]">
        {/* Con texto siempre queda «Buscar … en movimientos». */}
        {trimmed ? null : <CommandEmpty>Sin resultados.</CommandEmpty>}
        <CommandGroup heading="Acciones">
          <CommandItem
            value="nueva transaccion gasto movimiento"
            onSelect={() => onAction({ kind: "quick-add", type: "EXPENSE" })}
          >
            <Minus aria-hidden />
            Nueva transacción
            <CommandShortcut>
              <Kbd>N</Kbd>
            </CommandShortcut>
          </CommandItem>
          <CommandItem value="nuevo ingreso" onSelect={() => onAction({ kind: "quick-add", type: "INCOME" })}>
            <Plus aria-hidden />
            Nuevo ingreso
          </CommandItem>
          <CommandItem
            value="nueva transferencia entre cuentas"
            onSelect={() => onAction({ kind: "quick-add", type: "TRANSFER" })}
          >
            <ArrowLeftRight aria-hidden />
            Nueva transferencia
          </CommandItem>
          <CommandItem value="cambiar tema claro oscuro" onSelect={() => onAction({ kind: "theme" })}>
            <Moon aria-hidden />
            Cambiar tema
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ir a">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={`ir a ${item.label}`}
              onSelect={() => onAction({ kind: "navigate", href: item.href })}
            >
              <item.icon aria-hidden />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {trimmed ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Movimientos" forceMount>
              <CommandItem
                forceMount
                value={`buscar movimientos ${trimmed}`}
                onSelect={() => onAction({ kind: "search", query: trimmed })}
              >
                <Search aria-hidden />
                <span className="truncate">
                  Buscar «{trimmed}» en movimientos
                </span>
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
      <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> navegar
        </span>
        <span>
          <Kbd>↵</Kbd> abrir
        </span>
        <span>
          <Kbd>Esc</Kbd> cerrar
        </span>
      </div>
    </Command>
  );
}
