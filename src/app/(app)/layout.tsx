import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { SidebarContent } from "@/components/shell/sidebar-content";
import { Topbar } from "@/components/shell/topbar";
import { CommandCenter } from "@/features/quick-add/components/command-center";
import { getSessionUser } from "@/server/auth";
import { listAccountBalances } from "@/server/services/account.service";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Datos por usuario y por petición: nunca prerenderizar el shell en build.
  await connection();
  const user = await getSessionUser();
  const accounts = await listAccountBalances(user.id);

  return (
    <div className="flex min-h-svh w-full">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 overflow-y-auto border-r bg-sidebar md:block">
        <SidebarContent accounts={accounts} locale={user.locale} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar accounts={accounts} locale={user.locale} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
      {/* Quick Add (N) y paleta de comandos (Cmd/Ctrl+K), una sola vez para todo el shell. */}
      <Suspense fallback={null}>
        <CommandCenter currency={user.baseCurrency} locale={user.locale} timezone={user.timezone} />
      </Suspense>
    </div>
  );
}
