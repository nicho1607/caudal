"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts } from "@/features/accounts/hooks/use-accounts";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { changedFields, toFormValues, toUpdatePayload } from "@/features/transactions/form";
import { useTransaction, useUpdateTransaction } from "@/features/transactions/hooks/use-transactions";
import { transactionFormSchema, type TransactionFormValues } from "@/features/transactions/schemas";
import type { TransactionDTO } from "@/features/transactions/types";
import { cn } from "@/lib/utils";

/** Radix Select no admite value "" en un item: centinela para "Sin categoría". */
const NO_CATEGORY = "__none";

interface TransactionSheetProps {
  /** Movimiento a editar; null = cerrado. */
  transactionId: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Sheet lateral de edición de un movimiento (lo comparten el dashboard y la tabla). */
export function TransactionSheet({ transactionId, onOpenChange }: TransactionSheetProps) {
  const open = transactionId !== null;
  // Se conserva el último id para que el contenido no desaparezca durante la animación de cierre.
  const [lastId, setLastId] = useState(transactionId);
  if (transactionId !== null && transactionId !== lastId) setLastId(transactionId);
  const { data, isPending, isError, refetch } = useTransaction(transactionId ?? lastId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-[15px] leading-[22px] font-semibold">
            {data?.type === "TRANSFER" ? "Editar transferencia" : "Editar movimiento"}
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            {data?.type === "TRANSFER"
              ? "Los cambios de importe, fecha y notas se aplican a las dos cuentas."
              : "Corrige los datos del movimiento."}
          </SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Cerrar">
            <X aria-hidden />
          </Button>
        </SheetClose>

        {isPending ? (
          <FormSkeleton />
        ) : isError || !data ? (
          <div role="alert" className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-[13px] leading-5">No se pudo cargar.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <TransactionEditForm
            key={`${data.id}:${data.updatedAt}`}
            transaction={data}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-4" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-24 motion-reduce:animate-none" />
          <Skeleton className="h-8 w-full motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
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
      ) : null}
    </div>
  );
}

function TransactionEditForm({ transaction, onDone }: { transaction: TransactionDTO; onDone: () => void }) {
  const uid = useId();
  const fieldId = (name: keyof TransactionFormValues) => `${uid}-${name}`;
  const isTransfer = transaction.type === "TRANSFER";
  const accounts = useAccounts();
  const categories = useCategories({ enabled: !isTransfer });
  const { mutateAsync: update } = useUpdateTransaction();

  const initialValues = toFormValues(transaction);
  const form = useForm({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: initialValues,
  });
  const { register, control, handleSubmit, formState } = form;
  const { errors, isSubmitting } = formState;

  const accountOptions = (accounts.data ?? []).map((a) => ({ id: a.id, name: a.name }));
  // La cuenta actual puede estar archivada (no sale en la lista): se conserva.
  if (!accountOptions.some((a) => a.id === transaction.account.id)) {
    accountOptions.unshift({ id: transaction.account.id, name: transaction.account.name });
  }
  const categoryOptions = (categories.data ?? []).filter((c) => c.kind === transaction.type);

  const onSubmit = handleSubmit(async (values) => {
    const patch = toUpdatePayload(values, changedFields(values, initialValues), transaction.type);
    if (!patch) {
      onDone();
      return;
    }
    try {
      await update({ id: transaction.id, input: patch });
      toast("Cambios guardados");
      onDone();
    } catch (error) {
      toast.error("No se pudieron guardar los cambios", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });

  const invalid = (name: keyof TransactionFormValues) =>
    errors[name] ? { "aria-invalid": true, "aria-describedby": `${fieldId(name)}-error` } : {};

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <Field id={fieldId("description")} label="Descripción" error={errors.description?.message}>
          <Input id={fieldId("description")} autoComplete="off" {...register("description")} {...invalid("description")} />
        </Field>

        {!isTransfer && (
          <Field id={fieldId("payee")} label="Comercio o pagador" error={errors.payee?.message}>
            <Input id={fieldId("payee")} autoComplete="off" {...register("payee")} {...invalid("payee")} />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2">
          <Field id={fieldId("amount")} label={`Importe (${transaction.currency})`} error={errors.amount?.message}>
            <Input
              id={fieldId("amount")}
              inputMode="decimal"
              autoComplete="off"
              className="num"
              {...register("amount")}
              {...invalid("amount")}
            />
          </Field>
          <Field id={fieldId("date")} label="Fecha" error={errors.date?.message}>
            <Input id={fieldId("date")} type="date" className="num" {...register("date")} {...invalid("date")} />
          </Field>
        </div>

        <Field
          id={fieldId("accountId")}
          label={
            isTransfer
              ? transaction.transfer?.direction === "in"
                ? "Cuenta de destino"
                : "Cuenta de origen"
              : "Cuenta"
          }
          error={errors.accountId?.message}
        >
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={fieldId("accountId")} className="w-full" onBlur={field.onBlur} {...invalid("accountId")}>
                  <SelectValue placeholder="Elige una cuenta" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {accountOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {isTransfer && transaction.transfer ? (
            <p className="text-xs text-muted-foreground">
              {transaction.transfer.direction === "in" ? "Desde" : "Hacia"} {transaction.transfer.counterpartAccount.name}
            </p>
          ) : null}
        </Field>

        {!isTransfer && (
          <Field id={fieldId("categoryId")} label="Categoría" error={errors.categoryId?.message}>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select
                  value={field.value || NO_CATEGORY}
                  onValueChange={(v) => field.onChange(v === NO_CATEGORY ? "" : v)}
                >
                  <SelectTrigger id={fieldId("categoryId")} className="w-full" onBlur={field.onBlur}>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-72">
                    <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id} className={cn(c.parentId && "pl-6")}>
                        {c.name}
                      </SelectItem>
                    ))}
                    {/* La categoría actual aún no está en la lista mientras carga. */}
                    {transaction.category && !categoryOptions.some((c) => c.id === transaction.category!.id) ? (
                      <SelectItem value={transaction.category.id}>{transaction.category.name}</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        )}

        <Field id={fieldId("notes")} label="Notas" error={errors.notes?.message}>
          <Textarea id={fieldId("notes")} rows={3} {...register("notes")} {...invalid("notes")} />
        </Field>
      </div>

      <SheetFooter className="flex-row justify-end border-t">
        <SheetClose asChild>
          <Button type="button" variant="outline">
            Cancelar
          </Button>
        </SheetClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : "Guardar"}
        </Button>
      </SheetFooter>
    </form>
  );
}
