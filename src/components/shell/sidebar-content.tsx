"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { cn } from "@/lib/utils";

import { formatMoney } from "@/lib/format";
import { isNavItemActive, NAV_ITEMS } from "./nav-items";

export interface SidebarAccount {
  id: string;
  name: string;
  currency: string;
  color: string | null;
  balance: number;
}

// Sólo tokens conocidos: el color de la cuenta viene de BD.
const ACCOUNT_DOT = /^chart-[1-6]$/;

interface SidebarContentProps {
  accounts: SidebarAccount[];
  /** Se llama al pulsar un enlace (cierra el drawer en móvil). */
  onNavigate?: () => void;
}

export function SidebarContent({ accounts, onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  // El mes elegido en la topbar se conserva al cambiar de sección.
  const [month] = useQueryState("month", parseAsString);
  const withMonth = (href: string) => (month ? `${href}?month=${encodeURIComponent(month)}` : href);

  return (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <Link
        href={withMonth("/dashboard")}
        onClick={onNavigate}
        className="flex h-8 items-center gap-2 rounded-md px-2 text-[15px] leading-[22px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M2 10c2-4 4-4 6 0s4 4 6 0" strokeLinecap="round" />
          </svg>
        </span>
        Caudal
      </Link>

      <nav aria-label="Principal">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isNavItemActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={withMonth(href)}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    active
                      ? "bg-sidebar-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="sidebar-accounts" className="flex flex-col gap-1 border-t pt-4">
        <h2 id="sidebar-accounts" className="px-2 pb-1 text-xs text-muted-foreground">
          Tus cuentas
        </h2>
        {accounts.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Aún no hay cuentas.</p>
        ) : (
          <ul className="flex flex-col">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex h-8 items-center justify-between gap-2 px-2 text-[13px] leading-5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
                    style={
                      account.color && ACCOUNT_DOT.test(account.color)
                        ? { backgroundColor: `var(--${account.color})` }
                        : undefined
                    }
                  />
                  <span className="truncate">{account.name}</span>
                </span>
                <span className="num shrink-0 text-muted-foreground">
                  {formatMoney(account.balance, { currency: account.currency })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
