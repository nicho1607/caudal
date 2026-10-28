import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata: Metadata = { title: "Movimientos · Caudal" };

export default function TransactionsPage() {
  return <PagePlaceholder title="Movimientos" description="Aquí podrás buscar, filtrar y editar todos tus movimientos." />;
}
