"use client";

import { Plus, Search } from "lucide-react";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobileNav } from "./mobile-nav";
import { MonthSwitcher } from "./month-switcher";
import type { SidebarAccount } from "./sidebar-content";
import { ThemeToggle } from "./theme-toggle";

function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cn(
        "hidden h-5 min-w-5 items-center justify-center rounded border px-1 font-sans text-[11px] leading-none sm:inline-flex",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// Búsqueda (⌘K) y "Nueva" (N) quedan inertes hasta QA-001 (paleta + Quick Add).
export function Topbar({ accounts, locale }: { accounts: SidebarAccount[]; locale: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-6">
      <MobileNav accounts={accounts} locale={locale} />
      <Suspense fallback={<div className="h-8 w-40" />}>
        <MonthSwitcher />
      </Suspense>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Button
          variant="outline"
          className="h-8 gap-2 px-2 text-muted-foreground max-sm:size-8 max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent sm:w-56 sm:justify-start"
          aria-label="Buscar"
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search aria-hidden />
          <span className="hidden sm:inline">Buscar</span>
          <Kbd className="ml-auto text-muted-foreground">⌘K</Kbd>
        </Button>
        <ThemeToggle />
        <Button className="h-8 gap-2 max-sm:size-8 max-sm:px-0" aria-label="Nueva transacción" aria-keyshortcuts="N">
          <Plus aria-hidden />
          <span className="hidden sm:inline">Nueva</span>
          <Kbd className="border-primary-foreground/25 text-primary-foreground/70">N</Kbd>
        </Button>
      </div>
    </header>
  );
}
