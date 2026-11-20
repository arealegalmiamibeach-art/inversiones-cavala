"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function DialogoPanel({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function cerrar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onClose();
    }
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, [onClose]);

  return createPortal(
    <div data-entity-sheet-portal className="fixed inset-0 z-[125] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Cerrar" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.13] bg-[#11131d] p-4 shadow-[0_30px_100px_rgba(0,0,0,.72)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{titulo}</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.08] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
