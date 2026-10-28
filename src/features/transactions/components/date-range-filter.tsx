"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

interface DateRangeFilterProps {
  /** Rango efectivo (explícito o el del mes seleccionado). */
  from?: string;
  to?: string;
  /** El rango viene del selector de mes (no hay from/to en la URL). */
  isMonth: boolean;
  /** Etiqueta del mes seleccionado ("octubre 2026"). */
  monthLabel: string;
  /** Hoy (yyyy-mm-dd) para los atajos. */
  today: string;
  locale: string;
  onChange: (range: { from: string | null; to: string | null }) => void;
}

/**
 * Rango de fechas de la toolbar. Sin rango explícito muestra el mes del
 * selector del topbar; elegir días o un atajo fija `?from`/`?to`, y
 * "Mes seleccionado" los quita para volver a seguir al selector.
 */
export function DateRangeFilter({ from, to, isMonth, monthLabel, today, locale, onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const year = today.slice(0, 4);
  const label = isMonth
    ? monthLabel
    : from && to
      ? `${formatShortDate(from, locale)}${from.slice(0, 4) !== year ? ` ${from.slice(0, 4)}` : ""} – ${formatShortDate(to, locale)}${to.slice(0, 4) !== year ? ` ${to.slice(0, 4)}` : ""}`
      : from
        ? `Desde ${formatShortDate(from, locale)}`
        : `Hasta ${formatShortDate(to ?? today, locale)}`;

  const selected: DateRange | undefined = from ? { from: fromIso(from), to: to ? fromIso(to) : undefined } : undefined;

  const presets: { label: string; apply: () => void }[] = [
    { label: "Mes seleccionado", apply: () => onChange({ from: null, to: null }) },
    { label: "Últimos 30 días", apply: () => onChange({ from: addDays(today, -29), to: today }) },
    { label: "Últimos 90 días", apply: () => onChange({ from: addDays(today, -89), to: today }) },
    { label: "Este año", apply: () => onChange({ from: `${year}-01-01`, to: today }) },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start", !isMonth && "border-foreground/30")}>
          <CalendarDays aria-hidden />
          <span className="num first-letter:uppercase">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-wrap gap-1 border-b p-2 sm:w-40 sm:flex-col sm:border-r sm:border-b-0">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => {
                  preset.apply();
                  setOpen(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            locale={es}
            numberOfMonths={1}
            defaultMonth={selected?.from ?? (to ? fromIso(to) : fromIso(today))}
            selected={selected}
            onSelect={(range) => {
              if (!range?.from) return onChange({ from: null, to: null });
              onChange({ from: toIso(range.from), to: range.to ? toIso(range.to) : toIso(range.from) });
              if (range.to && range.to.getTime() !== range.from.getTime()) setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
