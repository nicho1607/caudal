"use client";

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacetedFilter, type FacetOption } from "@/components/data-table/faceted-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/features/accounts/hooks/use-accounts";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { useTags } from "@/features/tags/hooks/use-tags";
import { DateRangeFilter } from "@/features/transactions/components/date-range-filter";
import { cssColor } from "@/lib/color";
import type { TransactionFilters } from "@/features/transactions/filters";
import type { useTransactionFilters } from "@/features/transactions/hooks/use-transaction-list";

const SEARCH_DEBOUNCE_MS = 250;

const TYPE_OPTIONS: FacetOption[] = [
  { value: "EXPENSE", label: "Gastos" },
  { value: "INCOME", label: "Ingresos" },
  { value: "TRANSFER", label: "Transferencias" },
];

/** Búsqueda con debounce: el borrador es local y la URL se actualiza a los 250 ms. */
function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // Cambio externo (Limpiar filtros, atrás/adelante): adoptar el valor de la URL.
  if (value !== synced) {
    setSynced(value);
    if (value.trim() !== draft.trim()) setDraft(value);
  }

  useEffect(() => {
    if (draft.trim() === value.trim()) return;
    const id = setTimeout(() => onChange(draft.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [draft, value, onChange]);

  return (
    <div className="relative w-full sm:w-64">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && draft) {
            e.preventDefault();
            setDraft("");
            onChange("");
          }
        }}
        placeholder="Buscar movimientos"
        aria-label="Buscar por descripción, notas o comercio"
        className="h-8 pl-8 text-[13px] [&::-webkit-search-cancel-button]:hidden"
        maxLength={100}
      />
    </div>
  );
}

interface TransactionsToolbarProps {
  filters: TransactionFilters;
  setFilters: ReturnType<typeof useTransactionFilters>["setFilters"];
  range: { from?: string; to?: string; isMonth: boolean };
  monthLabel: string;
  today: string;
  locale: string;
  active: boolean;
  onClear: () => void;
}

/** Búsqueda, rango de fechas, facetas (tipo, cuenta, categoría, etiqueta) y reset. Todo en la URL. */
export function TransactionsToolbar({
  filters,
  setFilters,
  range,
  monthLabel,
  today,
  locale,
  active,
  onClear,
}: TransactionsToolbarProps) {
  const accounts = useAccounts();
  const categories = useCategories();
  const tags = useTags();
  const setQuery = useCallback((q: string) => void setFilters({ q: q || null }), [setFilters]);

  const accountOptions = useMemo<FacetOption[]>(
    () => (accounts.data ?? []).map((a) => ({ value: a.id, label: a.name, color: cssColor(a.color) })),
    [accounts.data],
  );
  const categoryOptions = useMemo<FacetOption[]>(
    () =>
      (categories.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        color: cssColor(c.color),
        depth: c.parentId ? 1 : 0,
      })),
    [categories.data],
  );
  const tagOptions = useMemo<FacetOption[]>(
    () => (tags.data ?? []).map((t) => ({ value: t.id, label: t.name, color: cssColor(t.color) })),
    [tags.data],
  );

  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <SearchInput value={filters.q} onChange={setQuery} />
      <DateRangeFilter
        from={range.from}
        to={range.to}
        isMonth={range.isMonth}
        monthLabel={monthLabel}
        today={today}
        locale={locale}
        onChange={({ from, to }) => setFilters({ from, to })}
      />
      <FacetedFilter
        title="Tipo"
        options={TYPE_OPTIONS}
        selected={filters.type}
        onChange={(type) => setFilters({ type: type.length ? (type as TransactionFilters["type"]) : null })}
      />
      {accountOptions.length > 0 ? (
        <FacetedFilter
          title="Cuenta"
          options={accountOptions}
          selected={filters.account}
          onChange={(account) => setFilters({ account: account.length ? account : null })}
        />
      ) : null}
      {categoryOptions.length > 0 ? (
        <FacetedFilter
          title="Categoría"
          options={categoryOptions}
          selected={filters.category}
          onChange={(category) => setFilters({ category: category.length ? category : null })}
          searchable
        />
      ) : null}
      {/* Sin etiquetas creadas la faceta no aporta nada: se oculta. */}
      {tagOptions.length > 0 ? (
        <FacetedFilter
          title="Etiqueta"
          options={tagOptions}
          selected={filters.tag}
          onChange={(tag) => setFilters({ tag: tag.length ? tag : null })}
          searchable={tagOptions.length > 8}
        />
      ) : null}
      {active ? (
        <Button variant="ghost" onClick={onClear} className="text-muted-foreground">
          Limpiar filtros
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
