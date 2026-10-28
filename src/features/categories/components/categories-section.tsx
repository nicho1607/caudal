"use client";

import { Archive, ChevronRight, CornerDownRight, MoreHorizontal, Pencil, Plus, RotateCcw } from "lucide-react";
import { useId, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/features/categories/components/category-icon";
import { CategorySheet, type CategorySheetTarget } from "@/features/categories/components/category-sheet";
import { activeTree, archivedTree, type CategoryTreeNode } from "@/features/categories/form";
import { useCategoriesOverview, useCategoryActions } from "@/features/categories/hooks/use-categories";
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS, CATEGORY_NATURE_LABELS } from "@/features/categories/schemas";
import type { CategoryDTO } from "@/features/categories/types";
import { cssColor } from "@/lib/color";
import { cn } from "@/lib/utils";

/** Ajustes › Categorías: árbol Gastos / Ingresos, archivadas plegadas y Sheet de alta/edición. */
export function CategoriesSection() {
  const { data, isPending, isError, refetch, isRefetching } = useCategoriesOverview();
  const { archive, restore } = useCategoryActions();
  const [sheet, setSheet] = useState<CategorySheetTarget | null>(null);
  const headingId = useId();

  const categories = data ?? [];
  const archived = archivedTree(categories);

  let body: React.ReactNode;
  if (isPending) {
    body = <CategoriesSkeleton />;
  } else if (isError) {
    body = (
      <EmptyState
        message="No se pudieron cargar las categorías."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            Reintentar
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {CATEGORY_KINDS.map((kind) => {
          const tree = activeTree(categories, kind);
          return (
            <KindGroup key={kind} label={CATEGORY_KIND_LABELS[kind]}>
              {tree.length === 0 ? (
                <li className="px-3 py-3 text-[13px] leading-5 text-muted-foreground">
                  Aún no tienes categorías de {CATEGORY_KIND_LABELS[kind].toLowerCase()}.
                </li>
              ) : (
                tree.map((node) => (
                  <ParentRow
                    key={node.category.id}
                    node={node}
                    onEdit={(category) => setSheet({ mode: "edit", category })}
                    onAddChild={(parent) => setSheet({ mode: "create", kind: parent.kind, parentId: parent.id })}
                    onArchive={(category, childCount) => archive(category, { childCount })}
                  />
                ))
              )}
            </KindGroup>
          );
        })}
        {archived.length > 0 ? (
          <ArchivedCategories nodes={archived} categories={categories} onRestore={(c) => void restore(c)} />
        ) : null}
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-[15px] leading-[22px] font-semibold">
            Categorías
          </h2>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Dos niveles: categorías principales y sus subcategorías. Archivar no borra movimientos ni presupuestos.
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setSheet({ mode: "create", kind: "EXPENSE", parentId: "" })}>
          <Plus aria-hidden />
          Nueva categoría
        </Button>
      </header>
      {body}
      <CategorySheet target={sheet} categories={categories} onClose={() => setSheet(null)} />
    </section>
  );
}

function KindGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="px-1 text-[13px] leading-5 font-medium text-muted-foreground">
        {label}
      </h3>
      <ul className="divide-y rounded-lg border bg-card">{children}</ul>
    </div>
  );
}

export function CategoryDot({ color, className }: { color: string | null; className?: string }) {
  const css = cssColor(color);
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full bg-muted-foreground", className)}
      style={css ? { backgroundColor: css } : undefined}
    />
  );
}

function CategoryLine({ category, child = false }: { category: CategoryDTO; child?: boolean }) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-2.5", child && "pl-6")}>
      {child ? <CornerDownRight aria-hidden className="-ml-4 size-3.5 shrink-0 text-muted-foreground/60" /> : null}
      <CategoryDot color={category.color} />
      <CategoryIcon name={category.icon} className="text-muted-foreground" />
      <span className={cn("truncate text-[13px] leading-5", !child && "font-medium")} title={category.name}>
        {category.name}
      </span>
      <span className="ml-auto shrink-0 pl-2 text-xs leading-4 text-muted-foreground">
        <span className="sr-only">Naturaleza: </span>
        {CATEGORY_NATURE_LABELS[category.nature]}
      </span>
    </span>
  );
}

function RowMenu({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${name}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ParentRow({
  node,
  onEdit,
  onAddChild,
  onArchive,
}: {
  node: CategoryTreeNode;
  onEdit: (category: CategoryDTO) => void;
  onAddChild: (parent: CategoryDTO) => void;
  onArchive: (category: CategoryDTO, childCount: number) => void;
}) {
  const { category, children } = node;
  const isChildOfArchived = category.parentId !== null; // padre archivado: se muestra como principal
  return (
    <li>
      <div className="flex items-center gap-2 py-2 pr-2 pl-3">
        <CategoryLine category={category} />
        <RowMenu name={category.name}>
          <DropdownMenuItem onSelect={() => onEdit(category)}>
            <Pencil aria-hidden />
            Editar
          </DropdownMenuItem>
          {!isChildOfArchived ? (
            <DropdownMenuItem onSelect={() => onAddChild(category)}>
              <Plus aria-hidden />
              Añadir subcategoría
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => onArchive(category, children.length)}>
            <Archive aria-hidden />
            Archivar
          </DropdownMenuItem>
        </RowMenu>
      </div>
      {children.length > 0 ? (
        <ul className="divide-y border-t" aria-label={`Subcategorías de ${category.name}`}>
          {children.map((child) => (
            <li key={child.id} className="flex items-center gap-2 py-2 pr-2 pl-3">
              <CategoryLine category={child} child />
              <RowMenu name={child.name}>
                <DropdownMenuItem onSelect={() => onEdit(child)}>
                  <Pencil aria-hidden />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onArchive(child, 0)}>
                  <Archive aria-hidden />
                  Archivar
                </DropdownMenuItem>
              </RowMenu>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ArchivedCategories({
  nodes,
  categories,
  onRestore,
}: {
  nodes: CategoryTreeNode[];
  categories: CategoryDTO[];
  onRestore: (category: CategoryDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const count = nodes.reduce((n, node) => n + 1 + node.children.length, 0);
  const nameOf = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name : undefined);

  const restoreButton = (category: CategoryDTO, blockedBy?: string) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onRestore(category)}
      disabled={!!blockedBy}
      title={blockedBy ? `Restaura primero «${blockedBy}»` : undefined}
      aria-label={`Restaurar ${category.name}`}
    >
      <RotateCcw aria-hidden />
      Restaurar
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-md px-1 text-[13px] leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight aria-hidden className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
          Archivadas
          <span className="num">({count})</span>
        </button>
      </h3>
      {open ? (
        <ul id={listId} className="divide-y rounded-lg border text-muted-foreground">
          {nodes.map(({ category, children }) => (
            <li key={category.id}>
              <div className="flex items-center gap-2 py-1.5 pr-2 pl-3">
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <CategoryDot color={category.color} />
                  <CategoryIcon name={category.icon} />
                  <span className="truncate text-[13px] leading-5">
                    {category.parentId && nameOf(category.parentId) ? `${nameOf(category.parentId)} › ` : ""}
                    {category.name}
                  </span>
                  <span className="shrink-0 text-xs leading-4">· {CATEGORY_KIND_LABELS[category.kind]}</span>
                </span>
                {restoreButton(category)}
              </div>
              {children.map((child) => (
                <div key={child.id} className="flex items-center gap-2 border-t py-1.5 pr-2 pl-9">
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <CategoryDot color={child.color} />
                    <CategoryIcon name={child.icon} />
                    <span className="truncate text-[13px] leading-5">{child.name}</span>
                  </span>
                  {restoreButton(child, category.name)}
                </div>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {[5, 2].map((rows, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-20 motion-reduce:animate-none" />
          <div className="divide-y rounded-lg border">
            {Array.from({ length: rows }, (_, j) => (
              <div key={j} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="size-2 rounded-full motion-reduce:animate-none" />
                <Skeleton className="h-4 flex-1 motion-reduce:animate-none" />
                <Skeleton className="h-4 w-14 motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
