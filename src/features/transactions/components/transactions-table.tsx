"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo } from "react";

import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionRowActions } from "@/features/transactions/components/transaction-row-actions";
import { transactionTitle, type TransactionTableSort } from "@/features/transactions/filters";
import type { TransactionDTO } from "@/features/transactions/types";
import { cssColor } from "@/lib/color";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const AMOUNT_TONE: Record<TransactionDTO["type"], string> = {
  INCOME: "text-income",
  EXPENSE: "text-expense",
  TRANSFER: "text-transfer",
};

/** Fecha corta; con año si no es el del día de hoy ("27 oct" / "27 oct 2025"). */
function rowDate(iso: string, locale: string, currentYear: string) {
  const short = formatShortDate(iso, locale);
  return iso.slice(0, 4) === currentYear ? short : `${short} ${iso.slice(0, 4)}`;
}

function TransactionAmount({ t, locale, className }: { t: TransactionDTO; locale: string; className?: string }) {
  const value = Number(t.amount);
  return (
    <Money
      value={t.type === "TRANSFER" ? Math.abs(value) : value}
      currency={t.currency}
      locale={locale}
      signed={t.type === "INCOME"}
      className={cn("font-mono text-[13px] font-medium", AMOUNT_TONE[t.type], className)}
    />
  );
}

function CategoryLabel({ t }: { t: TransactionDTO }) {
  if (t.type === "TRANSFER") return <span className="truncate text-muted-foreground">Transferencia</span>;
  if (!t.category) return <span className="truncate text-muted-foreground">Sin categoría</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={t.category.color ? { backgroundColor: cssColor(t.category.color) ?? undefined } : undefined}
      />
      <span className="truncate" title={t.category.name}>
        {t.category.name}
      </span>
      {t.autoCategorized ? (
        <span className="shrink-0 text-muted-foreground" title="Categoría asignada automáticamente">
          <span aria-hidden>✦</span>
          <span className="sr-only">(asignada automáticamente)</span>
        </span>
      ) : null}
    </span>
  );
}

function TagList({ tags }: { tags: TransactionDTO["tags"] }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex h-5 max-w-28 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-xs text-muted-foreground"
        >
          {tag.color ? (
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: cssColor(tag.color) ?? undefined }} />
          ) : null}
          <span className="truncate">{tag.name}</span>
        </span>
      ))}
    </span>
  );
}

function Title({ t }: { t: TransactionDTO }) {
  const title = transactionTitle(t);
  // Con payee, la descripción (si aporta algo) va detrás en gris.
  const detail = t.type !== "TRANSFER" && t.payee && t.description && t.description !== title ? t.description : null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium" title={title}>
        {title}
      </span>
      {detail ? (
        <span className="min-w-0 shrink-[2] truncate text-muted-foreground max-md:hidden" title={detail}>
          {detail}
        </span>
      ) : null}
      {t.status === "PENDING" ? <span className="shrink-0 text-xs text-muted-foreground">Pendiente</span> : null}
    </span>
  );
}

interface SortHeaderProps {
  label: string;
  column: "date" | "amount";
  sort: TransactionTableSort;
  onSort: (sort: TransactionTableSort) => void;
  align?: "left" | "right";
}

/** Cabecera ordenable (orden en el servidor): desc → asc → desc… */
function SortHeader({ label, column, sort, onSort, align = "left" }: SortHeaderProps) {
  const [current, order] = sort.split("-") as ["date" | "amount", "asc" | "desc"];
  const active = current === column;
  const Icon = !active ? ArrowUpDown : order === "desc" ? ArrowDown : ArrowUp;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-mx-2 h-7 px-2 font-medium text-muted-foreground", active && "text-foreground", align === "right" && "flex-row-reverse")}
      onClick={() => onSort(active && order === "desc" ? `${column}-asc` : `${column}-desc`)}
    >
      {label}
      <Icon aria-hidden className={cn("size-3.5", !active && "opacity-50")} />
    </Button>
  );
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, TransactionDTO>();

// Anchos y alineación por columna (la tabla es table-fixed: no hay scroll horizontal).
const COLUMN_CLASS: Record<string, string> = {
  date: "w-24",
  description: "w-auto",
  category: "w-[18%]",
  account: "w-[14%]",
  tags: "w-[12%]",
  amount: "w-36 text-right",
  actions: "w-10",
};

interface TransactionsTableProps {
  rows: TransactionDTO[];
  locale: string;
  today: string;
  sort: TransactionTableSort;
  onSort: (sort: TransactionTableSort) => void;
  onEdit: (id: string) => void;
  /** Refetch con datos previos visibles (cambio de filtros). */
  stale?: boolean;
}

const sortDirection = (sort: TransactionTableSort, column: "date" | "amount") =>
  sort.startsWith(column) ? (sort.endsWith("desc") ? "descending" : "ascending") : undefined;

/**
 * Tabla de movimientos (≥ 768 px) y lista apilada (< 768 px) sobre las mismas
 * filas. Filas de 40 px, importes a la derecha en Geist Mono tabular.
 */
export function TransactionsTable({ rows, locale, today, sort, onSort, onEdit, stale }: TransactionsTableProps) {
  const year = today.slice(0, 4);
  const columns = useMemo(
    () => [
      helper.display({
        id: "date",
        header: () => <SortHeader label="Fecha" column="date" sort={sort} onSort={onSort} />,
        cell: ({ row }) => (
          <span className="num text-xs text-muted-foreground">{rowDate(row.original.date, locale, year)}</span>
        ),
      }),
      helper.display({
        id: "description",
        header: () => "Descripción",
        cell: ({ row }) => <Title t={row.original} />,
      }),
      helper.display({
        id: "category",
        header: () => "Categoría",
        cell: ({ row }) => <CategoryLabel t={row.original} />,
      }),
      helper.display({
        id: "account",
        header: () => "Cuenta",
        cell: ({ row }) =>
          row.original.type === "TRANSFER" ? null : (
            <span className="block truncate text-muted-foreground" title={row.original.account.name}>
              {row.original.account.name}
            </span>
          ),
      }),
      helper.display({
        id: "tags",
        header: () => "Etiquetas",
        cell: ({ row }) => <TagList tags={row.original.tags} />,
      }),
      helper.display({
        id: "amount",
        header: () => <SortHeader label="Importe" column="amount" sort={sort} onSort={onSort} align="right" />,
        cell: ({ row }) => <TransactionAmount t={row.original} locale={locale} />,
      }),
      helper.display({
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <TransactionRowActions
            target={{ id: row.original.id, transferGroupId: row.original.transferGroupId }}
            label={transactionTitle(row.original)}
            onEdit={onEdit}
            className="text-muted-foreground"
          />
        ),
      }),
    ],
    [locale, year, sort, onSort, onEdit],
  );

  const table = useTable({ features, columns, data: rows, getRowId: (t) => t.id });

  return (
    <div className={cn("transition-opacity motion-reduce:transition-none", stale && "opacity-60")} aria-busy={stale}>
      {/* ≥ 768 px: tabla */}
      <table className="hidden w-full table-fixed border-collapse text-[13px] leading-5 md:table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b">
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  aria-sort={
                    header.column.id === "date" || header.column.id === "amount"
                      ? (sortDirection(sort, header.column.id) ?? "none")
                      : undefined
                  }
                  className={cn("h-10 px-2 text-left text-xs font-medium text-muted-foreground", COLUMN_CLASS[header.column.id])}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              data-transaction-id={row.id}
              className="h-10 border-b last:border-b-0 hover:bg-muted/40 has-aria-expanded:bg-muted/40"
            >
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className={cn("overflow-hidden px-2", COLUMN_CLASS[cell.column.id])}>
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* < 768 px: lista apilada (sin scroll horizontal) */}
      <ul aria-label="Movimientos" className="md:hidden">
        {rows.map((t) => (
          <li
            key={t.id}
            data-transaction-id={t.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 border-b py-2 text-[13px] leading-5 last:border-b-0"
          >
            <Title t={t} />
            <TransactionAmount t={t} locale={locale} className="text-right" />
            <TransactionRowActions
              target={{ id: t.id, transferGroupId: t.transferGroupId }}
              label={transactionTitle(t)}
              onEdit={onEdit}
              className="-mr-1.5 row-span-2 text-muted-foreground"
            />
            {/* Segunda línea bajo título e importe: fecha · categoría · cuenta (+ etiquetas). */}
            <div className="col-span-2 min-w-0">
              <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <span className="num shrink-0">{rowDate(t.date, locale, year)}</span>
                <span aria-hidden>·</span>
                <span className="flex min-w-0 max-w-[65%] shrink-0">
                  <CategoryLabel t={t} />
                </span>
                {t.type !== "TRANSFER" ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="min-w-0 truncate">{t.account.name}</span>
                  </>
                ) : null}
              </p>
              {t.tags.length > 0 ? (
                <div className="mt-1">
                  <TagList tags={t.tags} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TransactionsTableSkeleton() {
  return (
    <div aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 border-b px-2 last:border-b-0 md:h-10">
          <Skeleton className="hidden h-3 w-14 md:block motion-reduce:animate-none" />
          <Skeleton className="h-3.5 flex-1 motion-reduce:animate-none" />
          <Skeleton className="hidden h-3.5 w-[18%] md:block motion-reduce:animate-none" />
          <Skeleton className="hidden h-3.5 w-[14%] md:block motion-reduce:animate-none" />
          <Skeleton className="h-3.5 w-24 motion-reduce:animate-none" />
          <span className="size-7" />
        </div>
      ))}
    </div>
  );
}
