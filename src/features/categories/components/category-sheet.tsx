"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { Controller, useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORY_ICON_NAMES, CATEGORY_ICONS, CategoryIcon } from "@/features/categories/components/category-icon";
import {
  parentOptions,
  suggestCategoryColor,
  toCategoryFormValues,
  toCreateCategoryInput,
  toUpdateCategoryPayload,
} from "@/features/categories/form";
import { useCreateCategory, useUpdateCategory } from "@/features/categories/hooks/use-categories";
import {
  CATEGORY_COLORS,
  CATEGORY_KIND_LABELS,
  CATEGORY_KINDS,
  CATEGORY_NATURE_LABELS,
  CATEGORY_NATURES,
  categoryFormSchema,
  type CategoryColor,
  type CategoryFormValues,
  type CategoryKind,
} from "@/features/categories/schemas";
import type { CategoryDTO } from "@/features/categories/types";
import { cssColor } from "@/lib/color";
import { cn } from "@/lib/utils";

export type CategorySheetTarget =
  | { mode: "create"; kind: CategoryKind; parentId: string }
  | { mode: "edit"; category: CategoryDTO };

const COLOR_NAMES: Record<CategoryColor, string> = {
  "chart-1": "Índigo",
  "chart-2": "Cian",
  "chart-3": "Verde",
  "chart-4": "Ámbar",
  "chart-5": "Naranja",
  "chart-6": "Gris",
};

const NO_PARENT = "__none__";

interface CategorySheetProps {
  /** null = cerrado. */
  target: CategorySheetTarget | null;
  categories: CategoryDTO[];
  onClose: () => void;
}

/** Sheet lateral de alta / edición de una categoría o subcategoría. */
export function CategorySheet({ target, categories, onClose }: CategorySheetProps) {
  // Se conserva el último destino para que el contenido no cambie durante la animación de cierre.
  const [last, setLast] = useState<{ target: CategorySheetTarget | null; seq: number }>({ target, seq: 0 });
  if (target && target !== last.target) setLast((prev) => ({ target, seq: prev.seq + 1 }));
  const current = target ?? last.target;
  const editing = current?.mode === "edit";
  const isChild = current?.mode === "edit" ? !!current.category.parentId : !!current?.parentId;
  const parentName =
    current?.mode === "create" && current.parentId ? categories.find((c) => c.id === current.parentId)?.name : undefined;

  const title = editing ? (isChild ? "Editar subcategoría" : "Editar categoría") : parentName ? "Nueva subcategoría" : "Nueva categoría";
  const description = editing
    ? "Los cambios se reflejan en todos los movimientos de la categoría."
    : parentName
      ? `Dentro de «${parentName}».`
      : "Crea una categoría principal o elige una categoría padre para que sea subcategoría.";

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
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
          <SheetTitle className="text-[15px] leading-[22px] font-semibold">{title}</SheetTitle>
          <SheetDescription className="text-[13px]">{description}</SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Cerrar">
            <X aria-hidden />
          </Button>
        </SheetClose>
        {current ? (
          <CategoryForm
            key={last.seq}
            target={current}
            categories={categories}
            onDone={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function CategoryForm({
  target,
  categories,
  onDone,
}: {
  target: CategorySheetTarget;
  categories: CategoryDTO[];
  onDone: () => void;
}) {
  const uid = useId();
  const fieldId = (name: keyof CategoryFormValues) => `${uid}-${name}`;
  const { mutateAsync: create } = useCreateCategory();
  const { mutateAsync: update } = useUpdateCategory();
  const category = target.mode === "edit" ? target.category : null;
  const hasChildren = category ? categories.some((c) => c.parentId === category.id) : false;

  const [initialValues] = useState(() =>
    toCategoryFormValues(category, {
      kind: target.mode === "create" ? target.kind : "EXPENSE",
      parentId: target.mode === "create" ? target.parentId : "",
      color:
        target.mode === "create" && target.parentId
          ? ((categories.find((c) => c.id === target.parentId)?.color as CategoryColor | null) ?? "chart-1")
          : suggestCategoryColor(categories, CATEGORY_COLORS),
    }),
  );
  const form = useForm({ resolver: zodResolver(categoryFormSchema), defaultValues: initialValues });
  const { register, control, handleSubmit, setValue, getValues, formState } = form;
  const { errors, isSubmitting } = formState;
  const kind = useWatch({ control, name: "kind" });
  const parentId = useWatch({ control, name: "parentId" });

  const kindLocked = !!category && (category.inUse || hasChildren);
  const kindHint = category?.inUse
    ? "No se puede cambiar: la categoría ya tiene movimientos o presupuestos."
    : hasChildren
      ? "No se puede cambiar: tiene subcategorías."
      : undefined;
  const parents = parentOptions(categories, kind, category?.id);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (category) {
        const patch = toUpdateCategoryPayload(values, category);
        if (patch) {
          await update({ id: category.id, input: patch });
          toast("Cambios guardados");
        }
      } else {
        const created = await create(toCreateCategoryInput(values));
        toast(created.parentId ? "Subcategoría creada" : "Categoría creada", { description: created.name });
      }
      onDone();
    } catch (error) {
      toast.error(category ? "No se pudieron guardar los cambios" : "No se pudo crear la categoría", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId("name")} className="text-[13px]">
            Nombre
          </Label>
          <Input
            id={fieldId("name")}
            autoComplete="off"
            placeholder={parentId ? "Domicilios" : "Alimentación"}
            data-autofocus
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${fieldId("name")}-error` : undefined}
            {...register("name")}
          />
          {errors.name ? (
            <p id={`${fieldId("name")}-error`} className="text-xs text-destructive">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label id={`${fieldId("kind")}-label`} className="text-[13px]">
            Tipo
          </Label>
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={field.value}
                disabled={kindLocked || !!parentId}
                aria-labelledby={`${fieldId("kind")}-label`}
                aria-describedby={kindHint || parentId ? `${fieldId("kind")}-hint` : undefined}
                onValueChange={(value) => {
                  if (!value) return;
                  field.onChange(value);
                  // Un padre de otro tipo deja de ser válido.
                  const current = getValues("parentId");
                  if (current && categories.find((c) => c.id === current)?.kind !== value) setValue("parentId", "");
                }}
                className="w-full"
              >
                {CATEGORY_KINDS.map((k) => (
                  <ToggleGroupItem
                    key={k}
                    value={k}
                    className="flex-1 text-muted-foreground data-[state=on]:text-foreground"
                  >
                    {CATEGORY_KIND_LABELS[k]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
          {kindHint || parentId ? (
            <p id={`${fieldId("kind")}-hint`} className="text-xs text-muted-foreground">
              {kindHint ?? "Una subcategoría tiene el mismo tipo que su categoría padre."}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId("parentId")} className="text-[13px]">
            Categoría padre
          </Label>
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => (
              <Select
                value={field.value || NO_PARENT}
                onValueChange={(value) => {
                  const next = value === NO_PARENT ? "" : value;
                  field.onChange(next);
                  const parent = categories.find((c) => c.id === next);
                  if (parent) setValue("kind", parent.kind);
                }}
                disabled={hasChildren}
              >
                <SelectTrigger
                  id={fieldId("parentId")}
                  ref={field.ref}
                  className="w-full"
                  onBlur={field.onBlur}
                  aria-describedby={hasChildren ? `${fieldId("parentId")}-hint` : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={NO_PARENT}>Ninguna (categoría principal)</SelectItem>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {hasChildren ? (
            <p id={`${fieldId("parentId")}-hint`} className="text-xs text-muted-foreground">
              Tiene subcategorías, así que se queda como categoría principal (máximo dos niveles).
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label id={`${fieldId("nature")}-label`} className="text-[13px]">
            Naturaleza
          </Label>
          <Controller
            control={control}
            name="nature"
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={field.value}
                onValueChange={(value) => value && field.onChange(value)}
                aria-labelledby={`${fieldId("nature")}-label`}
                className="w-full"
              >
                {CATEGORY_NATURES.map((n) => (
                  <ToggleGroupItem key={n} value={n} className="flex-1 text-muted-foreground data-[state=on]:text-foreground">
                    {CATEGORY_NATURE_LABELS[n]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
          <p className="text-xs text-muted-foreground">Fijo: se repite cada mes por un importe parecido (arriendo, internet).</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-[13px] leading-none font-medium">Color</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((color) => (
              <label key={color} className="relative cursor-pointer" title={COLOR_NAMES[color]}>
                <input type="radio" value={color} aria-label={COLOR_NAMES[color]} className="peer sr-only" {...register("color")} />
                <span
                  aria-hidden
                  className="block size-7 rounded-full ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring"
                  style={{ backgroundColor: cssColor(color)! }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-[13px] leading-none font-medium">Icono</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1.5">
            <IconOption value="" label="Sin icono" register={register("icon")} />
            {CATEGORY_ICON_NAMES.map((name) => (
              <IconOption key={name} value={name} label={CATEGORY_ICONS[name]!.label} register={register("icon")} />
            ))}
          </div>
        </fieldset>
      </div>

      <SheetFooter className="flex-row justify-end border-t">
        <SheetClose asChild>
          <Button type="button" variant="outline">
            Cancelar
          </Button>
        </SheetClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : category ? "Guardar" : parentId ? "Crear subcategoría" : "Crear categoría"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function IconOption({
  value,
  label,
  register,
}: {
  value: string;
  label: string;
  register: UseFormRegisterReturn<"icon">;
}) {
  return (
    <label className="relative cursor-pointer" title={label}>
      <input type="radio" value={value} aria-label={label} className="peer sr-only" {...register} />
      <span
        aria-hidden
        className={cn(
          "flex size-9 items-center justify-center rounded-md border text-muted-foreground transition-colors motion-reduce:transition-none",
          "hover:bg-muted peer-checked:border-foreground peer-checked:bg-muted peer-checked:text-foreground",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
        )}
      >
        {value ? <CategoryIcon name={value} /> : <span className="text-xs">—</span>}
      </span>
    </label>
  );
}
