import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata: Metadata = { title: "Cuentas · Caudal" };

export default function AccountsPage() {
  return <PagePlaceholder title="Cuentas" description="Aquí podrás gestionar tus cuentas y ver el saldo de cada una." />;
}
