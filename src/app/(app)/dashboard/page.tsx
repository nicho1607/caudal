import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata: Metadata = { title: "Resumen · Caudal" };

export default function DashboardPage() {
  return <PagePlaceholder title="Resumen" description="Aquí verás tu saldo, el ritmo de gasto del mes y los últimos movimientos." />;
}
