import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata: Metadata = { title: "Metas · Caudal" };

export default function GoalsPage() {
  return <PagePlaceholder title="Metas" description="Aquí podrás seguir tus objetivos de ahorro." />;
}
