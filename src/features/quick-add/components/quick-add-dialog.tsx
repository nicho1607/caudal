"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAccounts } from "@/features/accounts/hooks/use-accounts";
import type { AccountDTO } from "@/features/accounts/types";
import { useCategories } from "@/features/categories/hooks/use-categories";
import {
  matchTags,
  quickAddFormSchema,
  toCreateInput,
  type QuickAddFormType,
  type QuickAddFormValues,
} from "@/features/quick-add/form";
import { parseAmountText, parseQuickAdd } from "@/features/quick-add/parse";
import { useTags } from "@/features/tags/hooks/use-tags";
import type { CreateTransactionInput } from "@/features/transactions/schemas";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/** Radix Select no admite value "": centinela para "Sin categoría". */
const NO_CATEGORY = "__none";
const LAST_ACCOUNT_KEY = "caudal:quick-add:last-account";

type Field = keyof QuickAddFormValues;

/** Estado completo del formulario, para reabrirlo tal cual si el guardado falla. */
export interface QuickAddDraft {
  text: string;
  values: QuickAddFormValues;
  manual: Field[];
}

export interface QuickAddSubmission {
  input: CreateTransactionInput;
  /** Categoría sugerida que el servidor aplicará (para la fila optimista). */
  suggestedCategoryId: string | null;
  draft: QuickAddDraft;
  /** Ctrl/Cmd+Enter: guardar y seguir añadiendo. */
  keepOpen: boolean;
}

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tipo con el que se abre ("Nuevo ingreso"). */
  initialType: QuickAddFormType;
  draft: QuickAddDraft | null;
  /** Hoy en la zona horaria del usuario (yyyy-mm-dd). */
  today: string;
  currency: string;
  locale: string;
  onSubmit: (submission: QuickAddSubmission) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

function readLastAccount(): string | null {
  try {
    return window.localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export function rememberAccount(id: string) {
  try {
    window.localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    // almacenamiento no disponible: sólo se pierde la preferencia
  }
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function QuickAddDialog(props: QuickAddDialogProps) {
  const { open, onOpenChange, onCloseAutoFocus } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="top-[max(1rem,8svh)] max-h-[calc(100svh-2rem)] translate-y-0 gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        <DialogHeader className="gap-1 border-b px-4 py-3">
          <DialogTitle className="text-[15px] leading-[22px] font-semibold">Nuevo movimiento</DialogTitle>
          <DialogDescription className="text-[13px]">
            Escríbelo en una línea y revisa los campos antes de guardar.
          </DialogDescription>
        </DialogHeader>
        {open ? <QuickAddForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function QuickAddForm({ initialType, draft, today, currency, locale, onSubmit }: QuickAddDialogProps) {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const textRef = useRef<HTMLInputElement>(null);

  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories();
  const tagsQuery = useTags();
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categories = categoriesQuery.data ?? [];
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);

  const defaultAccountId = useMemo(() => {
    const last = readLastAccount();
    return accounts.find((a) => a.id === last)?.id ?? accounts[0]?.id ?? "";
  }, [accounts]);

  const currencyOf = (accountId: string) => accounts.find((a) => a.id === accountId)?.currency;
  // El schema sólo comprueba que el importe se pueda interpretar; el redondeo a
  // la moneda real de la cuenta lo hace toCreateInput al guardar.
  const [schema] = useState(() => quickAddFormSchema());

  const blank = (type: QuickAddFormType, accountId: string): QuickAddFormValues => ({
    type,
    description: "",
    payee: "",
    amount: "",
    date: today,
    accountId,
    toAccountId: "",
    categoryId: "",
    notes: "",
  });

  const form = useForm<QuickAddFormValues>({
    resolver: zodResolver(schema),
    defaultValues: draft?.values ?? blank(initialType, defaultAccountId),
  });
  const { register, control, handleSubmit, setValue, getValues, reset, formState } = form;
  const { errors } = formState;

  const [text, setText] = useState(draft?.text ?? "");
  /** Campos que el usuario tocó a mano: el texto libre ya no los sobrescribe. */
  const manual = useRef(new Set<Field>(draft?.manual ?? []));
  const [categoryChosen, setCategoryChosen] = useState(draft?.manual.includes("categoryId") ?? false);
  const baseType = useRef(initialType);

  // Las cuentas pueden llegar después de abrir: rellenar la cuenta por defecto.
  useEffect(() => {
    if (!getValues("accountId") && defaultAccountId) setValue("accountId", defaultAccountId);
  }, [defaultAccountId, getValues, setValue]);

  const parsed = useMemo(
    () => parseQuickAdd(text, { currency, today, accounts }),
    [text, currency, today, accounts],
  );
  const tagMatch = useMemo(() => matchTags(parsed.tags, tags), [parsed.tags, tags]);

  const applyParsed = (value: string) => {
    const p = parseQuickAdd(value, { currency, today, accounts });
    const set = (name: Field, v: string) => {
      if (!manual.current.has(name)) setValue(name, v, { shouldValidate: formState.isSubmitted });
    };
    set("amount", p.amount ?? "");
    set("description", p.description);
    set("date", p.date ?? today);
    set("accountId", p.accountId ?? defaultAccountId);
    // Sin pista en el texto se vuelve al tipo con el que se abrió (p. ej. "Nuevo ingreso").
    if (!manual.current.has("type")) setValue("type", p.type ?? baseType.current);
  };

  const markManual = (name: Field) => manual.current.add(name);

  const type = useWatch({ control, name: "type" });
  const accountId = useWatch({ control, name: "accountId" });
  const amount = useWatch({ control, name: "amount" });
  const description = useWatch({ control, name: "description" });
  const payee = useWatch({ control, name: "payee" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const isTransfer = type === "TRANSFER";
  const accountCurrency = currencyOf(accountId) ?? currency;
  const amountPreview = parseAmountText(amount ?? "", accountCurrency);

  // Sugerencia de categoría mientras se escribe (300 ms de debounce).
  const suggestKey = useDebouncedValue(JSON.stringify([payee.trim(), description.trim()]), 300);
  const suggestInput = useMemo(() => {
    const [p, d] = JSON.parse(suggestKey) as [string, string];
    return { payee: p, description: d };
  }, [suggestKey]);
  const suggestEnabled = !isTransfer && !!(suggestInput.payee || suggestInput.description);
  const suggestion = useQuery({
    queryKey: queryKeys.categorize.suggest(suggestInput),
    queryFn: () => {
      const params = new URLSearchParams();
      if (suggestInput.payee) params.set("payee", suggestInput.payee);
      if (suggestInput.description) params.set("description", suggestInput.description);
      return apiFetch<{ categoryId: string; source: string } | null>(`/api/v1/categorize/suggest?${params}`);
    },
    enabled: suggestEnabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const categoryOptions = categories.filter((c) => c.kind === type);
  const suggestedId =
    suggestEnabled && suggestion.data && categoryOptions.some((c) => c.id === suggestion.data!.categoryId)
      ? suggestion.data.categoryId
      : null;
  const shownCategoryId = categoryChosen ? categoryId : (suggestedId ?? "");
  const showingSuggestion = !categoryChosen && !!suggestedId;

  const submit = (keepOpen: boolean) =>
    handleSubmit((values) => {
      const input = toCreateInput(values, {
        currency: currencyOf(values.accountId) ?? currency,
        categoryChosen,
        tagIds: tagMatch.ids,
        unknownTags: tagMatch.unknown,
      });
      rememberAccount(values.accountId);
      onSubmit({
        input,
        suggestedCategoryId: categoryChosen ? null : suggestedId,
        draft: {
          text,
          values: { ...values, categoryId: shownCategoryId },
          manual: [...manual.current, ...(categoryChosen ? (["categoryId"] as Field[]) : [])],
        },
        keepOpen,
      });
      if (keepOpen) {
        manual.current = new Set(values.type !== baseType.current ? (["type"] as Field[]) : []);
        setCategoryChosen(false);
        setText("");
        reset(blank(values.type, values.accountId));
        textRef.current?.focus();
      }
    });

  const invalid = (name: Field) =>
    errors[name] ? { "aria-invalid": true, "aria-describedby": `${fieldId(name)}-error` } : {};
  const errorText = (name: Field) =>
    errors[name]?.message ? (
      <p id={`${fieldId(name)}-error`} className="text-xs text-destructive">
        {errors[name]?.message}
      </p>
    ) : null;

  const mod = isMac() ? "⌘" : "Ctrl";
  const accountOptions = (exclude?: string) =>
    accounts.filter((a: AccountDTO) => a.id !== exclude).map((a) => (
      <SelectItem key={a.id} value={a.id}>
        {a.name}
      </SelectItem>
    ));

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false)();
      }}
      // En captura, antes que Radix: Enter en un select cerrado guarda (Espacio o
      // flechas siguen abriéndolo); Cmd/Ctrl+Enter guarda y deja el diálogo abierto.
      onKeyDownCapture={(e) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        const target = e.target as HTMLElement;
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          void submit(true)();
        } else if (target.getAttribute("role") === "combobox" && target.getAttribute("aria-expanded") !== "true") {
          e.preventDefault();
          void submit(false)();
        }
      }}
      className="flex flex-col"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId("text")} className="sr-only">
            Movimiento en texto libre
          </Label>
          <Input
            id={fieldId("text")}
            ref={textRef}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={text}
            placeholder="almuerzo 18.500 efectivo ayer #trabajo"
            aria-describedby={fieldId("text-hint")}
            className="h-10 text-[15px]"
            onChange={(e) => {
              setText(e.target.value);
              applyParsed(e.target.value);
            }}
          />
          <p id={fieldId("text-hint")} className="text-xs text-muted-foreground">
            Usa <span className="font-medium text-foreground">+</span> o «nómina» para ingresos, «ayer» o «15/10» para la
            fecha y <span className="font-medium text-foreground">#</span> para etiquetas.
          </p>
        </div>

        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={field.value}
              onValueChange={(v) => {
                if (!v) return;
                markManual("type");
                field.onChange(v);
              }}
              aria-label="Tipo de movimiento"
              className="w-full"
            >
              {(
                [
                  ["EXPENSE", "Gasto"],
                  ["INCOME", "Ingreso"],
                  ["TRANSFER", "Transferencia"],
                ] as const
              ).map(([value, label]) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className="flex-1 text-muted-foreground data-[state=on]:text-foreground"
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        />

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId("amount")} className="text-[13px]">
              Importe ({accountCurrency})
            </Label>
            <Input
              id={fieldId("amount")}
              inputMode="decimal"
              autoComplete="off"
              className="num"
              onInput={() => markManual("amount")}
              {...register("amount")}
              {...invalid("amount")}
            />
            {errorText("amount") ?? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {amountPreview && amountPreview.sign !== "-" ? (
                  <Money
                    value={type === "EXPENSE" ? -amountPreview.value : amountPreview.value}
                    currency={accountCurrency}
                    locale={locale}
                    signed={type === "INCOME"}
                    className={cn(type === "INCOME" ? "text-income" : type === "EXPENSE" ? "text-expense" : "text-transfer")}
                  />
                ) : (
                  " "
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId("date")} className="text-[13px]">
              Fecha
            </Label>
            <Input
              id={fieldId("date")}
              type="date"
              className="num"
              onInput={() => markManual("date")}
              {...register("date")}
              {...invalid("date")}
            />
            {errorText("date")}
          </div>
        </div>

        <div className={cn("grid grid-cols-1 gap-3", isTransfer && "min-[420px]:grid-cols-2")}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId("accountId")} className="text-[13px]">
              {isTransfer ? "Desde" : "Cuenta"}
            </Label>
            <Controller
              control={control}
              name="accountId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    markManual("accountId");
                    field.onChange(v);
                  }}
                >
                  <SelectTrigger
                    ref={field.ref}
                    id={fieldId("accountId")}
                    className="w-full"
                    onBlur={field.onBlur} {...invalid("accountId")}>
                    <SelectValue placeholder={accountsQuery.isPending ? "Cargando…" : "Elige una cuenta"} />
                  </SelectTrigger>
                  <SelectContent position="popper">{accountOptions()}</SelectContent>
                </Select>
              )}
            />
            {errorText("accountId")}
          </div>
          {isTransfer ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={fieldId("toAccountId")} className="text-[13px]">
                Hacia
              </Label>
              <Controller
                control={control}
                name="toAccountId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      ref={field.ref}
                      id={fieldId("toAccountId")}
                      className="w-full"
                      onBlur={field.onBlur}
                      {...invalid("toAccountId")}
                    >
                      <SelectValue placeholder="Cuenta de destino" />
                    </SelectTrigger>
                    <SelectContent position="popper">{accountOptions(accountId)}</SelectContent>
                  </Select>
                )}
              />
              {errorText("toAccountId")}
            </div>
          ) : null}
        </div>

        <div className={cn("grid grid-cols-1 gap-3", !isTransfer && "min-[420px]:grid-cols-2")}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId("description")} className="text-[13px]">
              Descripción
            </Label>
            <Input
              id={fieldId("description")}
              autoComplete="off"
              onInput={() => markManual("description")}
              {...register("description")}
              {...invalid("description")}
            />
            {errorText("description")}
          </div>
          {!isTransfer ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={fieldId("payee")} className="text-[13px]">
                Comercio o pagador
              </Label>
              <Input
                id={fieldId("payee")}
                autoComplete="off"
                placeholder="Opcional"
                onInput={() => markManual("payee")}
              {...register("payee")}
                {...invalid("payee")}
              />
              {errorText("payee")}
            </div>
          ) : null}
        </div>

        {!isTransfer ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId("categoryId")} className="text-[13px]">
              Categoría
            </Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select
                  value={shownCategoryId || NO_CATEGORY}
                  onValueChange={(v) => {
                    setCategoryChosen(true);
                    field.onChange(v === NO_CATEGORY ? "" : v);
                  }}
                >
                  <SelectTrigger
                    id={fieldId("categoryId")}
                    className="w-full"
                    onBlur={field.onBlur}
                    aria-describedby={showingSuggestion ? fieldId("category-hint") : undefined}
                  >
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-72">
                    <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id} className={cn(c.parentId && "pl-6")}>
                        {c.name}
                        {c.id === suggestedId ? (
                          <span aria-label="sugerida" className="text-muted-foreground">
                            ✦
                          </span>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p id={fieldId("category-hint")} className="flex min-h-4 items-center gap-1 text-xs text-muted-foreground">
              {showingSuggestion ? (
<>
                  <span aria-hidden>✦</span>
                  Sugerida según tus reglas. Cámbiala si no es correcta.
                </>
              ) : categoryChosen ? null : suggestEnabled && suggestion.isFetching ? (
                "Buscando categoría…"
              ) : null}
            </p>
          </div>
        ) : null}

        {parsed.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Etiquetas">
            {parsed.tags.map((tag) => {
              const known = !tagMatch.unknown.includes(tag);
              return (
                <span
                  key={tag}
                  className={cn(
                    "inline-flex h-6 items-center rounded-md border px-2 text-xs",
                    known ? "text-foreground" : "border-dashed text-muted-foreground",
                  )}
                >
                  #{tag}
                </span>
              );
            })}
            {tagMatch.unknown.length > 0 ? (
              <span className="text-xs text-muted-foreground">Las etiquetas nuevas se guardan en las notas.</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter className="mx-0 mb-0 flex-row items-center justify-between gap-2 px-4 py-3 sm:justify-between">
        <p className="hidden text-xs text-muted-foreground sm:block">
          <kbd className="rounded border px-1 font-sans">↵</kbd> guardar ·{" "}
          <kbd className="rounded border px-1 font-sans">{mod} ↵</kbd> guardar y añadir otro
        </p>
        <div className="ml-auto flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" disabled={accounts.length === 0}>
            Guardar
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
