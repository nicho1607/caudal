"use client";

import { PlusCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface FacetOption {
  value: string;
  label: string;
  /** Color (CSS) del punto delante de la etiqueta. */
  color?: string | null;
  /** Nivel de sangría (subcategorías = 1). */
  depth?: number;
}

interface FacetedFilterProps {
  title: string;
  options: FacetOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Muestra el buscador del popover (listas largas). */
  searchable?: boolean;
  className?: string;
}

/**
 * Filtro por facetas de una toolbar de tabla: botón con borde discontinuo y
 * popover con opciones marcables (multi-selección). Sin estado propio: el valor
 * vive en la URL del contenedor.
 */
export function FacetedFilter({ title, options, selected, onChange, searchable, className }: FacetedFilterProps) {
  const selectedSet = new Set(selected);
  const selectedOptions = options.filter((o) => selectedSet.has(o.value));

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(options.map((o) => o.value).filter((v) => next.has(v)));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("border-dashed", className)}>
          <PlusCircle aria-hidden />
          {title}
          {selectedOptions.length > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              {selectedOptions.length > 2 ? (
                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                  {selectedOptions.length} seleccionados
                </Badge>
              ) : (
                selectedOptions.map((o) => (
                  <Badge key={o.value} variant="secondary" className="max-w-32 rounded-sm px-1 font-normal">
                    <span className="truncate">{o.label}</span>
                  </Badge>
                ))
              )}
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          {searchable ? <CommandInput placeholder={title} /> : null}
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedSet.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => toggle(option.value)}
                    data-checked={isSelected}
                    style={option.depth ? { paddingLeft: `${0.5 + option.depth}rem` } : undefined}
                  >
                    {option.color !== undefined ? (
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full bg-muted-foreground"
                        style={option.color ? { backgroundColor: option.color } : undefined}
                      />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                    {isSelected ? <span className="sr-only">(seleccionado)</span> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedOptions.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    Quitar filtro
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
