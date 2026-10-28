import { Sparkline } from "@/components/charts/sparkline";
import { Money } from "@/components/money";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardData, Kpi } from "@/features/dashboard/types";
import { formatPercent, relativeChange } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "income" | "expense";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  income: "text-income",
  expense: "text-expense",
};

// Una franja, no cuatro cards: en ≥ xl es una rejilla con divisores verticales y
// el saldo más ancho; por debajo, un carrusel horizontal con scroll-snap. El corte
// es xl y no md porque con el sidebar de 256 px, entre 768 y 1280 px los cuatro
// segmentos no caben con importes de 7–8 cifras (el saldo se recortaba a 1024 px).
const STRIP =
  "flex snap-x snap-mandatory divide-x overflow-x-auto overscroll-x-contain rounded-lg border bg-card [scrollbar-width:none] xl:grid xl:grid-cols-[1.35fr_1fr_1fr_1fr] xl:overflow-visible [&::-webkit-scrollbar]:hidden";
const DELTA_ROW = "flex items-end gap-3";
const SEGMENT = "flex min-w-0 shrink-0 basis-[80%] snap-start flex-col gap-1 px-4 py-4 sm:basis-[45%] xl:basis-auto xl:px-5";

/** "2026-10" → nombre corto del mes anterior ("sept") en el locale del usuario. */
function previousMonthLabel(month: string, locale: string) {
  const [y, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 2, 1)),
  );
  return label.replace(/\.$/, "");
}

interface KpiSegmentProps {
  label: string;
  kpi: Kpi;
  /** true si subir es bueno (saldo, ingresos, ahorro); false para gastos. */
  upIsGood: boolean;
  sparkTone: Tone;
  hero?: boolean;
  meta?: string;
  data: Pick<DashboardData, "currency" | "locale">;
  vsLabel: string;
}

function KpiSegment({ label, kpi, upIsGood, sparkTone, hero, meta, data, vsLabel }: KpiSegmentProps) {
  const change = relativeChange(kpi.value, kpi.previous);
  const rounded = change === null ? null : Math.round(change * 1000) / 1000;
  const deltaTone: Tone =
    rounded === null || rounded === 0 ? "neutral" : rounded > 0 === upIsGood ? "income" : "expense";
  const sign = rounded === null || rounded === 0 ? "" : rounded > 0 ? "+" : "−";

  return (
    <div className={SEGMENT}>
      <div className="flex items-baseline justify-between gap-2 text-[13px] leading-5">
        <span className="truncate text-muted-foreground">{label}</span>
        {meta ? <span className="num shrink-0 text-xs text-muted-foreground">{meta}</span> : null}
      </div>
      <Money
        value={kpi.value}
        currency={data.currency}
        locale={data.locale}
        className={cn(
          "font-semibold text-foreground",
          hero ? "text-[32px] leading-9 tracking-[-0.02em]" : "text-[22px] leading-7",
        )}
      />
      <div className={cn(DELTA_ROW, hero ? "mt-1" : "mt-2")}>
        <p className="shrink-0 text-xs leading-4 text-muted-foreground">
          {rounded === null ? (
            <>Sin datos de {vsLabel}</>
          ) : (
            <>
              <span className={cn("num font-medium", deltaTone !== "neutral" && TONE_TEXT[deltaTone])}>
                {sign}
                {formatPercent(Math.abs(rounded), data.locale)}
              </span>{" "}
              vs {vsLabel}
            </>
          )}
        </p>
        <Sparkline values={kpi.sparkline.map((p) => p.value)} className={cn("min-w-10 flex-1", TONE_TEXT[sparkTone])} />
      </div>
    </div>
  );
}

interface KpiStripProps {
  data: DashboardData;
}

export function KpiStrip({ data }: KpiStripProps) {
  const { kpis } = data;
  const vsLabel = previousMonthLabel(data.month, data.locale);
  const common = { data, vsLabel };

  return (
    <section aria-label="Indicadores del mes" className={STRIP}>
      <KpiSegment label="Saldo total" kpi={kpis.totalBalance} upIsGood sparkTone="neutral" hero {...common} />
      <KpiSegment label="Ingresos" kpi={kpis.monthIncome} upIsGood sparkTone="income" {...common} />
      <KpiSegment label="Gastos" kpi={kpis.monthExpense} upIsGood={false} sparkTone="expense" {...common} />
      <KpiSegment
        label="Ahorro neto"
        kpi={kpis.netSavings}
        upIsGood
        sparkTone={kpis.netSavings.value < 0 ? "expense" : "income"}
        meta={`Tasa ${formatPercent(data.health.savingsRate, data.locale)}`}
        {...common}
      />
    </section>
  );
}

/** Misma forma que la franja final (sin spinner). */
export function KpiStripSkeleton() {
  return (
    <div aria-hidden className={STRIP}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={SEGMENT}>
          <Skeleton className="h-5 w-24 motion-reduce:animate-none" />
          <Skeleton className={cn("motion-reduce:animate-none", i === 0 ? "h-9 w-44" : "h-7 w-32")} />
          <div className={cn(DELTA_ROW, i === 0 ? "mt-1" : "mt-2")}>
            <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
            <Skeleton className="h-8 min-w-10 flex-1 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}
