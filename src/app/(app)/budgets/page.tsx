import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata: Metadata = { title: "Presupuestos · Caudal" };

export default function BudgetsPage() {
  return <PagePlaceholder title="Presupuestos" description="Aquí podrás fijar límites por categoría y seguir tu ritmo de gasto." />;
}
