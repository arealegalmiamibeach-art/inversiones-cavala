"use client";

import { Printer } from "lucide-react";

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="fixed right-6 top-6 z-[210] flex items-center gap-2 rounded-xl bg-[#1F3864] px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_30px_-6px_rgba(0,0,0,.5)] transition-colors hover:bg-[#28497f] print:hidden"
    >
      <Printer className="h-4 w-4" />
      Imprimir / Guardar como PDF
    </button>
  );
}
