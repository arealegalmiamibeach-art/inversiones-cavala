"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearEvento, editarEvento } from "@/lib/actions/eventos";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";

export function FechaProximaDiligencia({ procesoId, fecha, eventoId, hora, onCambio }: {
  procesoId: string; fecha?: string | null; eventoId?: string; hora?: string | null; onCambio?: () => void;
}) {
  const router = useRouter();
  const editable = puedeEscribir(useAcceso("evento"));
  const [valor, setValor] = useState(fecha ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [idGuardado, setIdGuardado] = useState(eventoId);
  useEffect(() => { setValor(fecha ?? ""); setIdGuardado(eventoId); }, [fecha, eventoId, procesoId]);
  async function guardar(nueva: string) {
    if (!nueva) {
      setValor(fecha ?? "");
      if (fecha) setError("La diligencia necesita una fecha. Puedes cancelarla desde Diligencias y audiencias.");
      return;
    }
    if (nueva === (fecha ?? "")) return;
    setGuardando(true);
    setError("");
    try {
      const resultado = idGuardado
        ? await editarEvento(idGuardado, { fecha: nueva, procesoId })
        : await crearEvento({ procesoId, fecha: nueva, hora, titulo: "Próxima diligencia" });
      if (!resultado.ok) { setError(resultado.error); return; }
      if ("id" in resultado && typeof resultado.id === "string") setIdGuardado(resultado.id);
      onCambio?.();
      router.refresh();
      window.dispatchEvent(new Event("registros-actualizados"));
    } catch { setError("No se pudo guardar la fecha"); }
    finally { setGuardando(false); }
  }
  return <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <input aria-label="Fecha de próxima diligencia" type="date" value={valor} disabled={!editable || guardando} className="glass-input min-w-[150px] text-xs" onChange={(e) => setValor(e.target.value)} onBlur={() => void guardar(valor)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    {guardando && <span className="text-xs text-white/50">Guardando…</span>}
    {error && <p role="alert" className="text-xs text-red-300">{error} <button type="button" onClick={() => void guardar(valor)}>Reintentar</button></p>}
  </div>;
}
