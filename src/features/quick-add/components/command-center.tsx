"use client";

// Monta una sola vez (layout de (app)) el diálogo Quick Add y la paleta ⌘K, y
// conecta sus disparadores: atajos N y Cmd/Ctrl+K, el evento `caudal:quick-add`
// (requestQuickAdd) y `caudal:command-palette` (botón "Buscar" del topbar).
import { useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { AccountDTO } from "@/features/accounts/types";
import type { CategoryOptionDTO } from "@/features/categories/types";
import { CommandPalette, type PaletteAction } from "@/features/quick-add/components/command-palette";
import {
  QuickAddDialog,
  type QuickAddDraft,
  type QuickAddSubmission,
} from "@/features/quick-add/components/quick-add-dialog";
import type { QuickAddFormType } from "@/features/quick-add/form";
import type { TagDTO } from "@/features/tags/types";
import { useCreateTransactionOptimistic, useDeleteTransaction } from "@/features/transactions/hooks/use-transactions";
import { previewTransaction } from "@/features/transactions/optimistic";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { COMMAND_PALETTE_EVENT } from "@/lib/command-palette";
import { formatMoney } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { QUICK_ADD_EVENT, type QuickAddDetail } from "@/lib/quick-add";

/** yyyy-mm-dd de hoy en la zona horaria del usuario. */
function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(),
    );
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Inténtalo de nuevo.");

/** Elemento que tenía el foco (el disparador), para devolvérselo al cerrar. */
function activeTrigger(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

interface QuickAddState {
  open: boolean;
  type: QuickAddFormType;
  draft: QuickAddDraft | null;
  today: string;
}

export function CommandCenter({ currency, locale, timezone }: { currency: string; locale: string; timezone: string }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [month] = useQueryState("month", parseAsString);

  const [quickAdd, setQuickAdd] = useState<QuickAddState>({ open: false, type: "EXPENSE", draft: null, today: "" });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const quickAddTrigger = useRef<HTMLElement | null>(null);
  const paletteTrigger = useRef<HTMLElement | null>(null);
  /** La paleta se cierra para abrir otro diálogo: no devolver el foco al disparador. */
  const handingOff = useRef(false);

  // Sin useAccounts()/useCategories() aquí: este componente vive en el layout y
  // crearía esas queries antes de que el HydrationBoundary de la página las
  // hidrate (la hidratación se aplazaría a un efecto → error de hidratación).
  // El formulario las pide al abrirse; al guardar se leen de la caché.
  const queryClient = useQueryClient();
  const { mutateAsync: createAsync } = useCreateTransactionOptimistic();
  const { mutateAsync: deleteAsync } = useDeleteTransaction();

  const openQuickAdd = useCallback(
    (type: QuickAddFormType = "EXPENSE", draft: QuickAddDraft | null = null, trigger = activeTrigger()) => {
      quickAddTrigger.current = trigger;
      setQuickAdd({ open: true, type: draft?.values.type ?? type, draft, today: todayIn(timezone) });
    },
    [timezone],
  );

  const openPalette = useCallback(() => {
    paletteTrigger.current = activeTrigger();
    setPaletteOpen(true);
  }, []);

  useEffect(() => {
    const onQuickAdd = (event: Event) => openQuickAdd((event as CustomEvent<QuickAddDetail>).detail?.type ?? "EXPENSE");
    const onPalette = () => openPalette();
    window.addEventListener(QUICK_ADD_EVENT, onQuickAdd);
    window.addEventListener(COMMAND_PALETTE_EVENT, onPalette);
    return () => {
      window.removeEventListener(QUICK_ADD_EVENT, onQuickAdd);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onPalette);
    };
  }, [openQuickAdd, openPalette]);

  useHotkeys([
    { keys: "n", handler: () => openQuickAdd() },
    { keys: "mod+k", handler: () => openPalette() },
  ]);

  const restoreFocus = (ref: React.RefObject<HTMLElement | null>, event: Event) => {
    const el = ref.current;
    if (el?.isConnected) {
      event.preventDefault();
      el.focus();
    }
  };

  const withMonth = (href: string, params: Record<string, string> = {}) => {
    const search = new URLSearchParams(params);
    if (month) search.set("month", month);
    const qs = search.toString();
    return qs ? `${href}?${qs}` : href;
  };

  const onPaletteAction = (action: PaletteAction) => {
    if (action.kind === "quick-add") {
      handingOff.current = true;
      setPaletteOpen(false);
      // El foco vuelve al disparador de la paleta cuando se cierre Quick Add.
      const trigger = paletteTrigger.current;
      window.setTimeout(() => openQuickAdd(action.type, null, trigger), 0);
      return;
    }
    setPaletteOpen(false);
    if (action.kind === "theme") setTheme(resolvedTheme === "dark" ? "light" : "dark");
    else if (action.kind === "navigate") router.push(withMonth(action.href));
    else router.push(withMonth("/transactions", { q: action.query }));
  };

  const onSubmit = ({ input, suggestedCategoryId, draft, keepOpen }: QuickAddSubmission) => {
    const preview = previewTransaction(input, {
      accounts: queryClient.getQueryData<AccountDTO[]>(queryKeys.accounts.list()) ?? [],
      categories: queryClient.getQueryData<CategoryOptionDTO[]>(queryKeys.categories.list()) ?? [],
      tags: queryClient.getQueryData<TagDTO[]>(queryKeys.tags.list()) ?? [],
      suggestedCategoryId,
    });
    if (!keepOpen) setQuickAdd((s) => ({ ...s, open: false }));

    const pending = createAsync({ input, preview });
    const amount = Number(preview.amount);
    const label = preview.description ?? preview.payee?.name ?? (input.type === "TRANSFER" ? "Transferencia" : "");
    const toastId = toast("Movimiento guardado", {
      description: [label, formatMoney(input.type === "TRANSFER" ? -amount : amount, { currency: preview.currency, locale })]
        .filter(Boolean)
        .join(" · "),
      duration: 5000,
      action: {
        label: "Deshacer",
        onClick: () => {
          // Si el POST aún está en vuelo, borrar en cuanto termine.
          pending
            .then((created) => deleteAsync({ id: created.id, transferGroupId: created.transferGroupId }))
            .catch((error) => toast.error("No se pudo deshacer", { description: errorMessage(error) }));
        },
      },
    });
    pending.catch((error) => {
      toast.dismiss(toastId);
      toast.error("No se pudo guardar el movimiento", {
        description: errorMessage(error),
        action: { label: "Revisar", onClick: () => openQuickAdd(draft.values.type, draft, null) },
      });
    });
  };

  return (
    <>
      <QuickAddDialog
        open={quickAdd.open}
        onOpenChange={(open) => setQuickAdd((s) => ({ ...s, open }))}
        initialType={quickAdd.type}
        draft={quickAdd.draft}
        today={quickAdd.today}
        currency={currency}
        locale={locale}
        onSubmit={onSubmit}
        onCloseAutoFocus={(event) => restoreFocus(quickAddTrigger, event)}
      />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onAction={onPaletteAction}
        onCloseAutoFocus={(event) => {
          if (handingOff.current) {
            handingOff.current = false;
            event.preventDefault();
            return;
          }
          restoreFocus(paletteTrigger, event);
        }}
      />
    </>
  );
}
