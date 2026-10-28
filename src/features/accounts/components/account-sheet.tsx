"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { ACCOUNT_TYPE_LABELS } from "@/features/accounts/calc";
import { suggestColor, toCreateInput, toFormValues, toUpdatePayload } from "@/features/accounts/form";
import { useCreateAccount, useUpdateAccount } from "@/features/accounts/hooks/use-accounts";
import {
  ACCOUNT_COLORS,
  ACCOUNT_TYPES,
  accountFormSchema,
  type AccountColor,
  type AccountFormValues,
} from "@/features/accounts/schemas";
import type { AccountDTO } from "@/features/accounts/types";
import { cssColor } from "@/lib/color";
import { cn } from "@/lib/utils";

const COMMON_CURRENCIES = ["COP", "USD", "EUR", "MXN", "ARS", "CLP", "PEN", "BRL", "GBP"];

const COLOR_NAMES: Record<AccountColor, string> = {
  "chart-1": "Índigo",
  "chart-2": "Cian",
  "chart-3": "Verde",
  "chart-4": "Ámbar",
  "chart-5": "Naranja",
  "chart-6": "Gris",
};

interface AccountSheetProps {
  open: boolean;
  /** Cuenta a editar; null = nueva. */
  account: AccountDTO | null;
  /** Todas las cuentas (para sugerir un color libre). */
  accounts: AccountDTO[];
  baseCurrency: string;
  onOpenChange: (open: boolean) => void;
}

/** Sheet lateral de alta / edición de una cuenta. */
export function AccountSheet({ open, account, accounts, baseCurrency, onOpenChange }: AccountSheetProps) {
  // Se conserva el último estado para que el contenido no cambie durante la animación de cierre.
  const [last, setLast] = useState<{ account: AccountDTO | null; seq: number }>({ account, seq: 0 });
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLast((prev) => ({ account, seq: prev.seq + 1 }));
  }
  const current = open ? account : last.account;
  const editing = current !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 sm:max-w-md"
        onOpenAutoFocus={(event) => {
          // Foco en el nombre (por defecto Radix enfoca el primer botón: Cerrar).
          const name = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-autofocus]");
          if (name) {
            event.preventDefault();
            name.focus();
          }
        }}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-[15px] leading-[22px] font-semibold">
            {editing ? "Editar cuenta" : "Nueva cuenta"}
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            {editing ? "Los cambios se reflejan en todos los movimientos de la cuenta." : "Añade una cuenta, tarjeta o bolsillo de efectivo."}
          </SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Cerrar">
            <X aria-hidden />
          </Button>
        </SheetClose>
        <AccountForm
          key={`${current?.id ?? "new"}:${last.seq}`}
          account={current}
          baseCurrency={baseCurrency}
          defaultColor={suggestColor(accounts)}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function AccountForm({
  account,
  baseCurrency,
  defaultColor,
  onDone,
}: {
  account: AccountDTO | null;
  baseCurrency: string;
  defaultColor: AccountColor;
  onDone: () => void;
}) {
  const uid = useId();
  const fieldId = (name: keyof AccountFormValues) => `${uid}-${name}`;
  const { mutateAsync: create } = useCreateAccount();
  const { mutateAsync: update } = useUpdateAccount();
  const locked = account?.hasTransactions ?? false;

  const [initialValues] = useState(() => toFormValues(account, baseCurrency, defaultColor));
  const form = useForm({ resolver: zodResolver(accountFormSchema), defaultValues: initialValues });
  const { register, control, handleSubmit, formState } = form;
  const { errors, isSubmitting } = formState;
  const type = useWatch({ control, name: "type" });
  const currency = useWatch({ control, name: "currency" });

  const currencies = Array.from(new Set([baseCurrency, ...(account ? [account.currency] : []), ...COMMON_CURRENCIES]));

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (account) {
        const patch = toUpdatePayload(values, account);
        if (patch) {
          await update({ id: account.id, input: patch });
          toast("Cambios guardados");
        }
      } else {
        const created = await create(toCreateInput(values));
        toast("Cuenta creada", { description: created.name });
      }
      onDone();
    } catch (error) {
      toast.error(account ? "No se pudieron guardar los cambios" : "No se pudo crear la cuenta", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });

  const invalid = (name: keyof AccountFormValues) =>
    errors[name] ? { "aria-invalid": true, "aria-describedby": `${fieldId(name)}-error` } : {};
  const lockedHint = locked ? "No se puede cambiar: la cuenta ya tiene movimientos." : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <Field id={fieldId("name")} label="Nombre" error={errors.name?.message}>
          <Input
            id={fieldId("name")}
            autoComplete="off"
            placeholder="Bancolombia Ahorros"
            data-autofocus
            {...register("name")}
            {...invalid("name")}
          />
        </Field>

        <Field id={fieldId("type")} label="Tipo" hint={lockedHint}>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={locked}>
                <SelectTrigger
                  id={fieldId("type")}
                  ref={field.ref}
                  className="w-full"
                  onBlur={field.onBlur}
                  aria-describedby={locked ? `${fieldId("type")}-hint` : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-[1fr_9rem]">
          <Field id={fieldId("institution")} label="Entidad" error={errors.institution?.message}>
            <Input
              id={fieldId("institution")}
              autoComplete="off"
              placeholder="Opcional"
              {...register("institution")}
              {...invalid("institution")}
            />
          </Field>
          {type !== "CASH" ? (
            <Field id={fieldId("last4")} label="Últimos 4 dígitos" error={errors.last4?.message}>
              <Input
                id={fieldId("last4")}
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                placeholder="Opcional"
                className="num"
                {...register("last4")}
                {...invalid("last4")}
              />
            </Field>
          ) : null}
        </div>

        <Field
          id={fieldId("currency")}
          label="Moneda"
          error={errors.currency?.message}
          hint={
            lockedHint ??
            (currency !== baseCurrency
              ? `Multimoneda aún es limitada: esta cuenta no suma al patrimonio en ${baseCurrency} y por ahora no admite movimientos.`
              : undefined)
          }
        >
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={locked}>
                <SelectTrigger id={fieldId("currency")} ref={field.ref} className="w-full" onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                      {c === baseCurrency ? " · moneda base" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2">
          <Field
            id={fieldId("initialBalance")}
            label={`Saldo inicial (${currency})`}
            error={errors.initialBalance?.message}
            hint={type === "CREDIT_CARD" ? "Si ya debes algo, escríbelo en negativo." : undefined}
          >
            <Input
              id={fieldId("initialBalance")}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              className="num"
              {...register("initialBalance")}
              {...invalid("initialBalance")}
            />
          </Field>
          {type === "CREDIT_CARD" ? (
            <Field id={fieldId("creditLimit")} label={`Cupo (${currency})`} error={errors.creditLimit?.message}>
              <Input
                id={fieldId("creditLimit")}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Opcional"
                className="num"
                {...register("creditLimit")}
                {...invalid("creditLimit")}
              />
            </Field>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-[13px] leading-none font-medium">Color</legend>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLORS.map((color) => (
              <label key={color} className="relative cursor-pointer" title={COLOR_NAMES[color]}>
                <input
                  type="radio"
                  value={color}
                  aria-label={COLOR_NAMES[color]}
                  className="peer sr-only"
                  {...register("color")}
                />
                <span
                  aria-hidden
                  className="block size-7 rounded-full ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring"
                  style={{ backgroundColor: cssColor(color)! }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={fieldId("includeInNetWorth")} className="text-[13px]">
              Incluir en el patrimonio neto
            </Label>
            <p className="text-xs text-muted-foreground">Desactívalo para cuentas que no son tuyas o que no quieres sumar.</p>
          </div>
          <Controller
            control={control}
            name="includeInNetWorth"
            render={({ field }) => (
              <Switch
                id={fieldId("includeInNetWorth")}
                ref={field.ref}
                checked={field.value}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
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
          {isSubmitting ? "Guardando…" : account ? "Guardar" : "Crear cuenta"}
        </Button>
      </SheetFooter>
    </form>
  );
}
