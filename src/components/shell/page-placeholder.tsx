interface PagePlaceholderProps {
  title: string;
  description: string;
}

/** Cabecera de sección + aviso de "en construcción" para rutas aún sin contenido. */
export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[15px] leading-[22px] font-semibold">{title}</h1>
      <div className="flex min-h-48 flex-col items-start justify-center gap-1 rounded-lg border border-dashed px-6 py-10">
        <p className="text-[13px] leading-5 font-medium">Esta sección está en construcción.</p>
        <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
