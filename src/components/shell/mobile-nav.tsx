"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarContent, type SidebarAccount } from "./sidebar-content";

/** Por debajo de md (768 px) el sidebar vive en un drawer lateral. */
export function MobileNav({ accounts }: { accounts: SidebarAccount[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="w-72 gap-0 bg-sidebar p-0">
        <SheetTitle className="sr-only">Menú</SheetTitle>
        <SheetDescription className="sr-only">Secciones y saldos de tus cuentas</SheetDescription>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-4 right-3" aria-label="Cerrar menú">
            <X aria-hidden />
          </Button>
        </SheetClose>
        <SidebarContent accounts={accounts} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
