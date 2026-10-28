import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata: Metadata = { title: "Ajustes · Caudal" };

export default function SettingsPage() {
  return <PagePlaceholder title="Ajustes" description="Aquí podrás cambiar tu moneda, categorías y reglas." />;
}
