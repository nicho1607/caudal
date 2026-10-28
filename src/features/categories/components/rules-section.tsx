"use client";

import { Pencil, Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { CategoryDot } from "@/features/categories/components/categories-section";
import { RuleSheet } from "@/features/categories/components/rule-sheet";
import { useCategoriesOverview } from "@/features/categories/hooks/use-categories";
import { useCategorizationRules, useUpdateRule } from "@/features/categories/hooks/use-categorization-rules";
import { RULE_FIELD_LABELS, RULE_MATCH_LABELS, RULE_SOURCE_LABELS } from "@/features/categories/schemas";
import type { CategorizationRuleDTO } from "@/features/categories/types";
import { cn } from "@/lib/utils";

type SheetState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; rule: CategorizationRuleDTO };

interface RulesSectionProps {
  locale: string;
}

/** Ajustes › Reglas de categorización: tabla (lista apilada en móvil), switch "activa" y Sheet. */
export function RulesSection({ locale }: RulesSectionProps) {
  const { data, isPending, isError, refetch, isRefetching } = useCategorizationRules();
  const categories = useCategoriesOverview().data ?? [];
  const { mutateAsync: updateRule } = useUpdateRule();
  const [sheet, setSheet] = useState<SheetState>({ mode: "closed" });
  const headingId = useId();
  const rules = data ?? [];
  const numberFormat = new Intl.NumberFormat(locale, { useGrouping: "always" } as Intl.NumberFormatOptions);

  const toggle = async (rule: CategorizationRuleDTO, isActive: boolean) => {
    try {
      await updateRule({ id: rule.id, input: { isActive } });
      toast(isActive ? "Regla activada" : "Regla desactivada", { description: rule.pattern });
    } catch (error) {
      toast.error("No se pudo cambiar la regla", { description: error instanceof Error ? error.message : undefined });
    }
  };

  let body: React.ReactNode;
  if (isPending) {
    body = <RulesSkeleton />;
  } else if (isError) {
    body = (
      <EmptyState
        message="No se pudieron cargar las reglas."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            Reintentar
          </Button>
        }
      />
    );
  } else if (rules.length === 0) {
    body = (
      <EmptyState
        className="rounded-lg border bg-card py-10"
        message="Aún no tienes reglas de categorización."
        action={
          <Button size="sm" onClick={() => setSheet({ mode: "create" })}>
            <Plus aria-hidden />
            Nueva regla
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full table-fixed border-collapse text-[13px] leading-5">
          <caption className="sr-only">Reglas de categorización en orden de evaluación</caption>
          <thead className="hidden border-b text-left text-xs leading-4 text-muted-foreground md:table-header-group">
            <tr>
              <th scope="col" className="w-[24%] py-2 pl-3 font-medium">
                Patrón
              </th>
              <th scope="col" className="w-[11%] py-2 font-medium">
                Campo
              </th>
              <th scope="col" className="w-[14%] py-2 font-medium">
                Coincidencia
              </th>
              <th scope="col" className="py-2 font-medium">
                Categoría
              </th>
              <th scope="col" className="w-[11%] py-2 font-medium">
                Origen
              </th>
              <th scope="col" className="w-[9%] py-2 pr-4 text-right font-medium">
                Aciertos
              </th>
              <th scope="col" className="w-[8%] py-2 font-medium">
                Activa
              </th>
              <th scope="col" className="w-11 py-2 pr-2">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                hits={numberFormat.format(rule.hitCount)}
                onToggle={(value) => void toggle(rule, value)}
                onEdit={() => setSheet({ mode: "edit", rule })}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-[15px] leading-[22px] font-semibold">
            Reglas de categorización
          </h2>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Se aplican al guardar un movimiento sin categoría: primero las tuyas, luego los comercios conocidos, las
            aprendidas y las del sistema.
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setSheet({ mode: "create" })}>
          <Plus aria-hidden />
          Nueva regla
        </Button>
      </header>
      {body}
      <RuleSheet
        open={sheet.mode !== "closed"}
        rule={sheet.mode === "edit" ? sheet.rule : null}
        categories={categories}
        onOpenChange={(open) => !open && setSheet({ mode: "closed" })}
      />
    </section>
  );
}

function RuleRow({
  rule,
  hits,
  onToggle,
  onEdit,
}: {
  rule: CategorizationRuleDTO;
  hits: string;
  onToggle: (value: boolean) => void;
  onEdit: () => void;
}) {
  const switchId = useId();
  const label = `regla «${rule.pattern}»`;
  return (
    <tr
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 py-2.5 pr-2 pl-3 md:table-row md:py-0",
        !rule.isActive && "text-muted-foreground",
      )}
    >
      <td className="col-start-1 row-start-1 min-w-0 md:py-2 md:pl-3">
        <span className="block truncate font-mono text-[12.5px]" title={rule.pattern}>
          {rule.pattern}
        </span>
      </td>
      <td className="col-start-1 row-start-2 text-xs leading-4 text-muted-foreground md:text-[13px] md:leading-5">
        <span className="md:hidden">
          {RULE_FIELD_LABELS[rule.field]} · {RULE_MATCH_LABELS[rule.match].toLowerCase()} · {RULE_SOURCE_LABELS[rule.source]} ·{" "}
          <span className="num">{hits}</span> {rule.hitCount === 1 ? "acierto" : "aciertos"}
        </span>
        <span className="hidden md:inline">{RULE_FIELD_LABELS[rule.field]}</span>
      </td>
      <td className="hidden text-muted-foreground md:table-cell">{RULE_MATCH_LABELS[rule.match]}</td>
      <td className="col-start-1 row-start-3 min-w-0 md:py-2">
        <span className="flex min-w-0 items-center gap-2">
          <CategoryDot color={rule.category.color} />
          <span className="truncate" title={rule.category.name}>
            {rule.category.name}
          </span>
          {rule.category.archived ? <span className="shrink-0 text-xs text-muted-foreground">(archivada)</span> : null}
        </span>
      </td>
      <td className="hidden text-muted-foreground md:table-cell">{RULE_SOURCE_LABELS[rule.source]}</td>
      <td className="hidden pr-4 text-right md:table-cell">
        <span className="num">{hits}</span>
      </td>
      <td className="col-start-2 row-span-3 row-start-1 md:py-2">
        <label htmlFor={switchId} className="sr-only">
          Activar {label}
        </label>
        <Switch id={switchId} checked={rule.isActive} onCheckedChange={onToggle} />
      </td>
      <td className="col-start-3 row-span-3 row-start-1 md:py-2 md:pr-2">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Editar ${label}`}>
          <Pencil aria-hidden />
        </Button>
      </td>
    </tr>
  );
}

function RulesSkeleton() {
  return (
    <div className="divide-y rounded-lg border" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
          <Skeleton className="h-4 flex-1 motion-reduce:animate-none" />
          <Skeleton className="h-5 w-9 rounded-full motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
