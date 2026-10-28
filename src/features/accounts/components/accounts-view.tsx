"use client";

import { Archive, ChevronRight, MoreHorizontal, Pencil, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSheet } from "@/features/accounts/components/account-sheet";
import { archivedAccounts, creditUsage, groupAccounts, netWorth } from "@/features/accounts/calc";
import { useAccountActions, useAccountsOverview } from "@/features/accounts/hooks/use-accounts";
import type { AccountDTO } from "@/features/accounts/types";
import { cssColor } from "@/lib/color";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AccountsViewProps {
  baseCurrency: string;
  locale: string;
}

/** Estado del Sheet: cerrado, creando o editando una cuenta. */
type SheetState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; account: AccountDTO };

/** Página de cuentas: patrimonio neto, grupos por tipo, archivadas y Sheet de alta/edición. */
export function AccountsView({ baseCurrency, locale }: AccountsViewProps) {
  const { data, isPending, isError, refetch, isRefetching } = useAccountsOverview();
  const { archive, restore } = useAccountActions();
  const [sheet, setSheet] = useState<SheetState>({ mode: "closed" });

  const accounts = data ?? [];
  const groups = groupAccounts(accounts, baseCurrency);
  const archived = archivedAccounts(accounts);
  const worth = netWorth(accounts, baseCurrency);
  const openCreate = () => setSheet({ mode: "create" });

  let body: React.ReactNode;
  if (isPending) {
    body = <AccountsSkeleton />;
  } else if (isError) {
    body = (
      <EmptyState
        message="No se pudo cargar."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            Reintentar
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {groups.length === 0 ? (
          <EmptyState
            className="rounded-lg border bg-card py-12"
            message="Aún no tienes cuentas."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                Añadir cuenta
              </Button>
            }
          />
        ) : (
          <>
            <section aria-labelledby="net-worth" className="flex flex-col gap-1 border-b pb-5">
              <h2 id="net-worth" className="text-[13px] leading-5 text-muted-foreground">
                Patrimonio neto
              </h2>
              <Money
                value={worth.total}
                currency={baseCurrency}
                locale={locale}
                className="text-[32px] leading-9 font-semibold tracking-[-0.02em]"
              />
              <p className="text-xs leading-4 text-muted-foreground">
                Suma de las cuentas incluidas; las tarjetas restan lo que debes.
                {worth.excludedOtherCurrency > 0
                  ? ` No incluye ${worth.excludedOtherCurrency === 1 ? "1 cuenta" : `${worth.excludedOtherCurrency} cuentas`} en otra moneda.`
                  : null}
              </p>
            </section>

            {groups.map((group) => (
              <AccountGroupSection
                key={group.type}
                label={group.label}
                subtotal={group.subtotal}
                partialSubtotal={group.hasOtherCurrencies}
                baseCurrency={baseCurrency}
                locale={locale}
              >
                {group.accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    locale={locale}
                    onEdit={() => setSheet({ mode: "edit", account })}
                    onArchive={() => archive(account)}
                  />
                ))}
              </AccountGroupSection>
            ))}
          </>
        )}

        {archived.length > 0 ? (
          <ArchivedSection accounts={archived} locale={locale} onRestore={(account) => void restore(account)} />
        ) : null}
      </>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-[15px] leading-[22px] font-semibold">Cuentas</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus aria-hidden />
          Añadir cuenta
        </Button>
      </header>

      {body}

      <AccountSheet
        open={sheet.mode !== "closed"}
        account={sheet.mode === "edit" ? sheet.account : null}
        accounts={accounts}
        baseCurrency={baseCurrency}
        onOpenChange={(open) => {
          if (!open) setSheet({ mode: "closed" });
        }}
      />
    </div>
  );
}

function AccountGroupSection({
  label,
  subtotal,
  partialSubtotal,
  baseCurrency,
  locale,
  children,
}: {
  label: string;
  subtotal: number;
  partialSubtotal: boolean;
  baseCurrency: string;
  locale: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 px-1">
        <h2 id={id} className="text-[15px] leading-[22px] font-semibold">
          {label}
        </h2>
        <span className="text-[13px] leading-5 text-muted-foreground" title={partialSubtotal ? "Sólo cuentas en la moneda base" : undefined}>
          <span className="sr-only">Subtotal: </span>
          <Money value={subtotal} currency={baseCurrency} locale={locale} />
          {partialSubtotal ? " *" : null}
        </span>
      </div>
      <ul className="divide-y rounded-lg border bg-card">{children}</ul>
    </section>
  );
}

function AccountDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full bg-muted-foreground"
      style={cssColor(color) ? { backgroundColor: cssColor(color)! } : undefined}
    />
  );
}

function accountMeta(account: AccountDTO): string {
  return [account.institution, account.last4 ? `•••• ${account.last4}` : null].filter(Boolean).join(" · ");
}

function AccountRow({
  account,
  locale,
  onEdit,
  onArchive,
}: {
  account: AccountDTO;
  locale: string;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const meta = accountMeta(account);
  const usage = creditUsage(account);
  const money = (value: number) => formatMoney(value, { currency: account.currency, locale });

  return (
    <li className="flex items-center gap-1 pr-2 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/50 motion-reduce:transition-none">
      <Link
        href={`/transactions?account=${encodeURIComponent(account.id)}`}
        className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg py-2.5 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <AccountDot color={account.color} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] leading-5 font-medium" title={account.name}>
            {account.name}
          </span>
          {meta ? <span className="truncate text-xs leading-4 text-muted-foreground">{meta}</span> : null}
        </span>
        <span className="flex flex-col items-end">
          <Money value={account.balance} currency={account.currency} locale={locale} className="text-[13px] leading-5 font-medium" />
          {!account.includeInNetWorth ? (
            <span className="text-xs leading-4 text-muted-foreground">Fuera del patrimonio</span>
          ) : null}
        </span>
        {usage ? (
          <span className="col-span-2 col-start-2 flex flex-col gap-1.5 pb-0.5">
            <span className="text-xs leading-4 text-muted-foreground">
              usado <span className="num">{money(usage.used)}</span> de <span className="num">{money(usage.limit)}</span>
            </span>
            <span
              role="progressbar"
              aria-label={`Cupo usado de ${account.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(usage.ratio * 100))}
              aria-valuetext={`${Math.round(usage.ratio * 100)} %`}
              className="block h-1 w-full max-w-64 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn("block h-full rounded-full", usage.warning ? "bg-warning" : "bg-foreground/60")}
                style={{ width: `${Math.min(100, usage.ratio * 100)}%` }}
              />
            </span>
          </span>
        ) : null}
      </Link>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${account.name}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onArchive}>
            <Archive aria-hidden />
            Archivar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function ArchivedSection({
  accounts,
  locale,
  onRestore,
}: {
  accounts: AccountDTO[];
  locale: string;
  onRestore: (account: AccountDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <section className="flex flex-col gap-2">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-md px-1 text-[13px] leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-90")}
          />
          Archivadas
          <span className="num">({accounts.length})</span>
        </button>
      </h2>
      {open ? (
        <ul id={listId} className="divide-y rounded-lg border">
          {accounts.map((account) => {
            const meta = accountMeta(account);
            return (
              <li key={account.id} className="flex items-center gap-3 py-2 pr-2 pl-3 text-muted-foreground">
                <AccountDot color={account.color} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] leading-5" title={account.name}>
                    {account.name}
                  </span>
                  {meta ? <span className="truncate text-xs leading-4">{meta}</span> : null}
                </span>
                <Money value={account.balance} currency={account.currency} locale={locale} className="text-[13px] leading-5" />
                <Button variant="ghost" size="sm" onClick={() => onRestore(account)} aria-label={`Restaurar ${account.name}`}>
                  <RotateCcw aria-hidden />
                  Restaurar
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function AccountsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2 border-b pb-5">
        <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
        <Skeleton className="h-9 w-56 motion-reduce:animate-none" />
      </div>
      {[2, 1].map((rows, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32 motion-reduce:animate-none" />
          <div className="divide-y rounded-lg border">
            {Array.from({ length: rows }, (_, j) => (
              <div key={j} className="flex items-center gap-3 px-3 py-3.5">
                <Skeleton className="size-2 rounded-full motion-reduce:animate-none" />
                <Skeleton className="h-4 flex-1 motion-reduce:animate-none" />
                <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
