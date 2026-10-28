"use client";

import { addMonths, format, isValid, parse } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";

import { Button } from "@/components/ui/button";

const MONTH_FORMAT = "yyyy-MM";

function parseMonth(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return fallback;
  const date = parse(value, MONTH_FORMAT, fallback);
  return isValid(date) ? date : fallback;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Mes activo en `?month=YYYY-MM` (sin parámetro = mes en curso). Las vistas que
 * dependan del mes leen el mismo parámetro con nuqs.
 */
export function MonthSwitcher() {
  const [month, setMonth] = useQueryState("month", parseAsString);
  const currentMonth = format(new Date(), MONTH_FORMAT);
  const selected = parseMonth(month, parse(currentMonth, MONTH_FORMAT, new Date()));
  const selectedKey = format(selected, MONTH_FORMAT);
  const isCurrent = selectedKey === currentMonth;

  const go = (delta: number) => {
    const next = format(addMonths(selected, delta), MONTH_FORMAT);
    void setMonth(next === currentMonth ? null : next);
  };

  return (
    <div className="flex items-center gap-1">
      <p aria-live="polite" className="min-w-0 truncate text-[15px] leading-[22px] font-semibold">
        <time dateTime={selectedKey}>
          <span className="sm:hidden">{capitalize(format(selected, "MMM yyyy", { locale: es }))}</span>
          <span className="hidden sm:inline">{capitalize(format(selected, "MMMM yyyy", { locale: es }))}</span>
        </time>
      </p>
      <div className="flex items-center">
        <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} aria-label="Mes anterior">
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => go(1)}
          disabled={isCurrent}
          aria-label="Mes siguiente"
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
