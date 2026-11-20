"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { DialogoPanel } from "./dialogo-panel";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ENTIDADES, type EntidadRelacion } from "@/lib/relaciones/contratos";
import { vincularRelacion, desvincularRelacion } from "@/lib/actions/vinculos";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";

/**
 * Chips visibles antes de "+N más". Una celda con todos (los ~400 predios de
 * LCV) pesaba miles de nodos: Propietarios llegaba a 3,6 MB de HTML con 23 filas.
 */
export const CHIPS_VISIBLES = 5;

/** "+N más" / "Ver menos" de una lista de chips recortada a `CHIPS_VISIBLES`. */
export function BotonMasChips({ ocultos, expandido, onAlternar }: { ocultos: number; expandido: boolean; onAlternar: () => void }) {
  if (ocultos <= 0) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAlternar(); }}
      aria-expanded={expandido}
      className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white"
    >
      {expandido ? "Ver menos" : `+${ocultos} más`}
    </button>
  );
}

/** El mismo vínculo se lee y edita desde la tabla, la ficha y el panel. */
export function RelacionField({ entidadTipo, entidadId, tipo, relaciones, rol, label }: {
  entidadTipo: string; entidadId: string; tipo: string; relaciones: EntidadRelacion[]; rol?: string | null;
  /** Nombre visible de la propiedad (p. ej. "Contratante/Arrendador"); por defecto el rol o la entidad. */
  label?: string;
}) {
  const router = useRouter();
  const accesoOrigen = useAcceso(entidadTipo);
  const accesoDestino = useAcceso(tipo);
  const editable = puedeEscribir(accesoOrigen) && puedeEscribir(accesoDestino);
  const [items, setItems] = useState(relaciones);
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<{ id: string; nombre: string }[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const config = ENTIDADES[tipo];
  useEffect(() => setItems(relaciones), [relaciones]);
  useEffect(() => {
    if (!abierto || !config) return;
    let vigente = true;
    setOpciones(null);
    const supabase = createClient();
    void fetchAllRows((from, to) => supabase.from(config.tabla).select(`id, ${config.nombreCampo}`).order(config.nombreCampo).order("id").range(from, to))
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) { setError("No se pudieron cargar las relaciones"); setOpciones([]); return; }
        setOpciones((data as unknown as Record<string, string>[] ?? []).map((r) => ({ id: r.id, nombre: r[config.nombreCampo] || "Sin nombre" })));
      }).catch(() => { if (vigente) { setError("No se pudieron cargar las relaciones"); setOpciones([]); } });
    return () => { vigente = false; };
  }, [abierto, config]);

  async function cambiar(id: string, nombre: string, quitar: boolean) {
    setGuardando(true);
    setError("");
    try {
      const resultado = quitar
        ? await desvincularRelacion(entidadTipo, entidadId, tipo, id, rol)
        : await vincularRelacion(entidadTipo, entidadId, tipo, id, rol);
      if (!resultado.ok) { setError(resultado.error); return; }
      setItems((actual) => quitar ? actual.filter((r) => r.entidadId !== id) : [...actual, {
        id: `${tipo}:${id}:${rol ?? ""}`, entidadId: id, entidadTipo: tipo, entidadNombre: nombre,
        entidadTipoLabel: config.label, rol: rol ?? null, rolLabel: rol ?? config.label, href: `${config.href}/${id}`,
      }]);
      if (!quitar) {
        setAbierto(false);
        setBusqueda("");
      }
      router.refresh();
      window.dispatchEvent(new Event("registros-actualizados"));
    } catch { setError("No se pudo guardar la relación"); }
    finally { setGuardando(false); }
  }
  if (!config) return null;
  const unicos = [...new Map(items.map((r) => [r.entidadId, r])).values()];
  const visibles = expandido ? unicos : unicos.slice(0, CHIPS_VISIBLES);
  return <div className="min-w-[170px]" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-1">
      {visibles.map((r) => <span key={r.entidadId} className="glass-chip inline-flex items-center gap-1">
        <Link href={r.href}>{r.entidadNombre}</Link>
        {editable && <button type="button" disabled={guardando} aria-label={`Desvincular ${r.entidadNombre}`} onClick={() => void cambiar(r.entidadId, r.entidadNombre, true)}><X className="h-3 w-3" /></button>}
      </span>)}
      <BotonMasChips ocultos={unicos.length - CHIPS_VISIBLES} expandido={expandido} onAlternar={() => setExpandido((v) => !v)} />
      {!unicos.length && <span className="text-white/35">—</span>}
      {editable && <button type="button" disabled={guardando} aria-label={`Editar relación: ${label ?? rol ?? config.label}`} title={`Vincular ${label ?? rol ?? config.label}`} className="rounded p-1 text-white/60 hover:bg-white/10" onClick={() => { setError(""); setAbierto(true); }}><Plus className="h-3.5 w-3.5" /></button>}
    </div>
    {error && !abierto && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {abierto && <DialogoPanel titulo={`Vincular ${label ?? rol ?? config.label}`} onClose={() => { if (!guardando) setAbierto(false); }}>
      <input autoFocus aria-label="Buscar relación" placeholder="Buscar…" className="glass-input mb-3" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      {error && <p role="alert" className="mb-2 text-xs text-red-300">{error}</p>}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {opciones === null ? <p className="text-xs text-white/50">Cargando…</p> : opciones.filter((o) => !(tipo === entidadTipo && o.id === entidadId) && o.nombre.toLocaleLowerCase("es").includes(busqueda.toLocaleLowerCase("es"))).map((o) => {
          const seleccionado = items.some((r) => r.entidadId === o.id);
          return <button key={o.id} type="button" disabled={guardando} aria-pressed={seleccionado} className={`block w-full rounded px-2 py-2 text-left text-xs text-white hover:bg-white/10 disabled:opacity-50 ${seleccionado ? "bg-white/[0.08]" : ""}`} onClick={() => void cambiar(o.id, o.nombre, seleccionado)}>{seleccionado ? "✓ " : "+ "}{o.nombre}</button>;
        })}
      </div>
    </DialogoPanel>}
  </div>;
}
