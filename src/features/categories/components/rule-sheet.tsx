"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, X } from "lucide-react";
import { useId, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { activeTree, testRule, toCreateRuleInput, toRuleFormValues, toUpdateRulePayload } from "@/features/categories/form";
import { useCreateRule, useUpdateRule } from "@/features/categories/hooks/use-categorization-rules";
import {
  CATEGORY_KIND_LABELS,
  CATEGORY_KINDS,
  RULE_FIELD_LABELS,
  RULE_FIELDS,
  RULE_MATCH_LABELS,
  RULE_MATCHES,
  RULE_SOURCE_LABELS,
  ruleFormSchema,
  type RuleFormValues,
} from "@/features/categories/schemas";
import type { CategorizationRuleDTO, CategoryDTO } from "@/features/categories/types";
import { cn } from "@/lib/utils";

interface RuleSheetProps {
  open: boolean;
  /** null = nueva regla. */
  rule: CategorizationRuleDTO | null;
  categories: CategoryDTO[];
  onOpenChange: (open: boolean) => void;
}

/** Sheet de alta / edición de una regla, con prueba en vivo. Las SYSTEM sólo permiten activar/desactivar. */
export function RuleSheet({ open, rule, categories, onOpenChange }: RuleSheetProps) {
  const [last, setLast] = useState<{ rule: CategorizationRuleDTO | null; seq: number }>({ rule, seq: 0 });
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLast((prev) => ({ rule, seq: prev.seq + 1 }));
  }
  const current = open ? rule : last.rule;
  const system = current?.source === "SYSTEM";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 sm:max-w-md"
        onOpenAutoFocus={(event) => {
          const first = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-autofocus]");
          if (first) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-[15px] leading-[22px] font-semibold">
            {current ? "Editar regla" : "Nueva regla"}
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            {system
              ? "Las reglas del sistema sólo se pueden activar o desactivar."
              : current
                ? `Origen: ${RULE_SOURCE_LABELS[current.source].toLowerCase()}.`
                : "Asigna una categoría a los movimientos cuyo comercio o descripción coincida."}
          </SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Cerrar">
            <X aria-hidden />
          </Button>
        </SheetClose>
        <RuleForm
          key={`${current?.id ?? "new"}:${last.seq}`}
          rule={current}
          categories={categories}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function RuleForm({
  rule,
  categories,
  onDone,
}: {
  rule: CategorizationRuleDTO | null;
  categories: CategoryDTO[];
  onDone: () => void;
}) {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const { mutateAsync: create } = useCreateRule();
  const { mutateAsync: update } = useUpdateRule();
  const system = rule?.source === "SYSTEM";
  const [sample, setSample] = useState("");

  const [initialValues] = useState(() => toRuleFormValues(rule));
  const form = useForm({ resolver: zodResolver(ruleFormSchema), defaultValues: initialValues });
  const { register, control, handleSubmit, formState } = form;
  const { errors, isSubmitting } = formState;
  const [field, match, pattern] = useWatch({ control, name: ["field", "match", "pattern"] });
  const result = testRule({ field, match, pattern }, sample);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (rule) {
        const patch = toUpdateRulePayload(values, rule);
        if (patch) {
          await update({ id: rule.id, input: patch });
          toast("Cambios guardados");
        }
      } else {
        const created = await create(toCreateRuleInput(values));
        toast("Regla creada", { description: `${created.pattern} → ${created.category.name}` });
      }
      onDone();
    } catch (error) {
      toast.error(rule ? "No se pudieron guardar los cambios" : "No se pudo crear la regla", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });

  const invalid = (name: keyof RuleFormValues) =>
    errors[name] ? { "aria-invalid": true, "aria-describedby": `${fieldId(name)}-error` } : {};
  const errorText = (name: keyof RuleFormValues) =>
    errors[name] ? (
      <p id={`${fieldId(name)}-error`} className="text-xs text-destructive">
        {errors[name]?.message}
      </p>
    ) : null;

  // La categoría actual puede estar archivada: se sigue mostrando para no perderla.
  const currentCategory = rule ? categories.find((c) => c.id === rule.category.id) : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId("field")} className="text-[13px]">
              Campo
            </Label>
            <Controller
              control={control}
              name="field"
              render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange} disabled={system}>
                  <SelectTrigger id={fieldId("field")} ref={f.ref} className="w-full" onBlur={f.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {RULE_FIELDS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {RULE_FIELD_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId("match")} className="text-[13px]">
              Coincidencia
            </Label>
            <Controller
              control={control}
              name="match"
              render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange} disabled={system}>
                  <SelectTrigger id={fieldId("match")} ref={f.ref} className="w-full" onBlur={f.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {RULE_MATCHES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {RULE_MATCH_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId("pattern")} className="text-[13px]">
            Patrón
          </Label>
          <Input
            id={fieldId("pattern")}
            autoComplete="off"
            spellCheck={false}
            placeholder={match === "REGEX" ? "^uber\\s*(eats)?" : "rappi"}
            className="font-mono"
            disabled={system}
            data-autofocus={system ? undefined : true}
            {...register("pattern")}
            {...invalid("pattern")}
          />
          {errorText("pattern") ?? (
            <p className="text-xs text-muted-foreground">
              {match === "REGEX"
                ? "Sin distinguir mayúsculas; se prueba contra el texto original y el normalizado."
                : "Sin distinguir mayúsculas ni tildes; se guarda normalizado."}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <Label htmlFor={fieldId("sample")} className="text-[13px]">
            Prueba
          </Label>
          <Input
            id={fieldId("sample")}
            autoComplete="off"
            spellCheck={false}
            placeholder={field === "PAYEE" ? "RAPPI*RESTAURANTE 99881" : "Pedido Rappi almuerzo"}
            value={sample}
            onChange={(event) => setSample(event.target.value)}
            aria-describedby={`${fieldId("sample")}-result`}
            data-autofocus={system ? true : undefined}
            className="bg-background"
          />
          <p id={`${fieldId("sample")}-result`} aria-live="polite" className="flex items-center gap-1.5 text-xs leading-4">
            {result.matches === null ? (
              <span className="text-muted-foreground">
                Escribe un {field === "PAYEE" ? "comercio" : "texto"} de ejemplo para ver si la regla coincide.
              </span>
            ) : result.matches ? (
              <>
                <Check aria-hidden className="size-3.5 text-income" />
                <span className="font-medium text-income">Coincide</span>
              </>
            ) : (
              <>
                <X aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">No coincide</span>
              </>
            )}
          </p>
          {sample.trim() && result.normalized ? (
            <p className="text-xs leading-4 text-muted-foreground">
              Se compara: <span className="font-mono">{result.normalized}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId("categoryId")} className="text-[13px]">
            Categoría
          </Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field: f }) => (
              <Select value={f.value} onValueChange={f.onChange} disabled={system}>
                <SelectTrigger
                  id={fieldId("categoryId")}
                  ref={f.ref}
                  className="w-full"
                  onBlur={f.onBlur}
                  aria-invalid={errors.categoryId ? true : undefined}
                >
                  <SelectValue placeholder="Elige una categoría" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  {CATEGORY_KINDS.map((kind) => (
                    <SelectGroup key={kind}>
                      <SelectLabel>{CATEGORY_KIND_LABELS[kind]}</SelectLabel>
                      {activeTree(categories, kind).flatMap(({ category, children }) => [
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>,
                        ...children.map((child) => (
                          <SelectItem key={child.id} value={child.id} className="pl-6">
                            {child.name}
                          </SelectItem>
                        )),
                      ])}
                    </SelectGroup>
                  ))}
                  {rule && (!currentCategory || currentCategory.archivedAt) ? (
                    <SelectItem value={rule.category.id}>{rule.category.name} (archivada)</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            )}
          />
          {errorText("categoryId")}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId("priority")} className="text-[13px]">
            Prioridad
          </Label>
          <Input
            id={fieldId("priority")}
            inputMode="numeric"
            autoComplete="off"
            className={cn("num w-28")}
            disabled={system}
            {...register("priority")}
            {...invalid("priority")}
          />
          {errorText("priority") ?? (
            <p className="text-xs text-muted-foreground">Menor se evalúa antes. Tus reglas van por defecto en 100.</p>
          )}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={fieldId("isActive")} className="text-[13px]">
              Activa
            </Label>
            <p className="text-xs text-muted-foreground">Desactívala para dejar de aplicarla sin perderla.</p>
          </div>
          <Controller
            control={control}
            name="isActive"
            render={({ field: f }) => (
              <Switch
                id={fieldId("isActive")}
                ref={f.ref}
                checked={f.value}
                onCheckedChange={f.onChange}
                onBlur={f.onBlur}
                className="mt-0.5"
              />
            )}
          />
        </div>
      </div>

      <SheetFooter className="flex-row justify-end border-t">
        <SheetClose asChild>
          <Button type="button" variant="outline">
            Cancelar
          </Button>
        </SheetClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : rule ? "Guardar" : "Crear regla"}
        </Button>
      </SheetFooter>
    </form>
  );
}
