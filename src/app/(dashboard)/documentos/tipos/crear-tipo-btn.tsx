"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { crearTipoDocumento } from "../tipos-custom";

export function CrearTipoBtn() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  useEffect(() => {
    if (!resultado) return;
    const t = setTimeout(() => setResultado(null), 3000);
    return () => clearTimeout(t);
  }, [resultado]);

  useEffect(() => {
    if (!abierto) return;
    function onClickOutside(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setAbierto(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [abierto]);

  function handleCrear() {
    const limpio = nombre.trim();
    if (!limpio) return;
    startTransition(async () => {
      const res = await crearTipoDocumento(limpio);
      if (res.ok) {
        setResultado({ ok: true, texto: `Tipo "${limpio}" creado` });
        setNombre("");
        setAbierto(false);
        router.refresh();
      } else {
        setResultado({ ok: false, texto: res.error ?? "Error" });
      }
    });
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-600/20 px-3 py-2 text-xs font-semibold text-brand-200 transition-colors hover:bg-brand-600/30 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" />
        Nuevo tipo
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/[0.12] bg-[#11131c] p-3 shadow-glass-lg">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">
            Crear tipo de documento
          </p>
          <input
            ref={inputRef}
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCrear()}
            placeholder="Ej: Planos topográficos"
            className="view-control mb-2 w-full"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setAbierto(false); setNombre(""); }}
              className="rounded-lg px-2.5 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCrear}
              disabled={pending || !nombre.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Crear
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium",
            resultado.ok
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/20 bg-red-500/10 text-red-300"
          )}
        >
          {resultado.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {resultado.texto}
        </div>
      )}
    </div>
  );
}
