"use client";

import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TransactionTarget } from "@/features/transactions/form";
import { useTransactionActions } from "@/features/transactions/hooks/use-transactions";

interface TransactionRowActionsProps {
  target: TransactionTarget;
  /** Texto de la fila para el aria-label del botón ("Acciones de Éxito"). */
  label: string;
  /** Abre el Sheet de edición (lo controla el contenedor: un único Sheet por lista). */
  onEdit: (id: string) => void;
  className?: string;
}

/** Menú ⋯ de una fila: Editar, Duplicar, Eliminar (con Deshacer en el toast). */
export function TransactionRowActions({ target, label, onEdit, className }: TransactionRowActionsProps) {
  const { remove, duplicate } = useTransactionActions();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={className}
          aria-label={`Acciones de ${label}`}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => onEdit(target.id)}>
          <Pencil aria-hidden />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void duplicate(target.id)}>
          <Copy aria-hidden />
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => remove(target)}>
          <Trash2 aria-hidden />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
