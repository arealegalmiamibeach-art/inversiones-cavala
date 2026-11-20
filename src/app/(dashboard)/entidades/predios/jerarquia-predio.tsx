"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownRight, Landmark, Plus, X } from "lucide-react";
import { DialogoPanel } from "@/components/ui/dialogo-panel";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { asignarPredioMatriz } from "@/lib/actions/predios";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";

type PredioBreve = { id: string; nombre: string; n_partida: string | null; predio_padre_id: string | null };

const CAMPOS = "id, nombre, n_partida, predio_padre_id";

/**
 * Predio matriz y subpredios independizados de un predio. Desde la matriz se
 * agregan sus subpredios; desde un subpredio se elige su matriz. Ambos
 * escriben la misma columna (`predio_padre_id` del hijo), que es la que la
 * tabla de Predios usa para anidar con el triángulo desplegable.
 */
export function JerarquiaPredio({ predioId }: { predioId: string }) {
  const router = useRouter();
  const editable = puedeEscribir(useAcceso("predio"));
  const [matriz, setMatriz] = useState<PredioBreve | null>(null);
  const [subpredios, setSubpredios] = useState<PredioBreve[] | null>(null);
  const [selector, setSelector] = useState<"matriz" | "subpredio" | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [{ data: propio }, { data: hijos }] = await Promise.all([
      supabase.from("predios").select(CAMPOS).eq("id", predioId).maybeSingle(),
      supabase.from("predios").select(CAMPOS).eq("predio_padre_id", predioId).order("nombre"),
    ]);
    let padre: PredioBreve | null = null;
    if (propio?.predio_padre_id) {
      const { data } = await supabase.from("predios").select(CAMPOS).eq("id", propio.predio_padre_id).maybeSingle();
      padre = data;
    }
    return { padre, hijos: hijos ?? [] };
  }, [predioId]);

  useEffect(() => {
    let vigente = true;
    setMatriz(null);
    setSubpredios(null);
    setError("");
    void cargar().then(({ padre, hijos }) => {
      if (!vigente) return;
      setMatriz(padre);
      setSubpredios(hijos);
    }).catch(() => { if (vigente) { setSubpredios([]); setError("No se pudieron cargar los subpredios"); } });
    return () => { vigente = false; };
  }, [cargar]);

  async function guardar(subpredioId: string, matrizId: string | null) {
    setGuardando(true);
    setError("");
    try {
      const resultado = await asignarPredioMatriz(subpredioId, matrizId);
      if (!resultado.ok) { setError(resultado.error); return false; }
      const { padre, hijos } = await cargar();
      setMatriz(padre);
      setSubpredios(hijos);
      router.refresh();
      window.dispatchEvent(new Event("registros-actualizados"));
      return true;
    } catch {
      setError("No se pudo guardar el cambio");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Predio matriz y subpredios</h3>
      <div className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-white/50">
            <Landmark className="h-3.5 w-3.5" /> Predio matriz
          </span>
          {subpredios === null ? (
            <span className="text-xs text-white/35">Cargando…</span>
          ) : matriz ? (
            <span className="glass-chip inline-flex items-center gap-1">
              <Link href={`/entidades/predios/${matriz.id}`}>{matriz.nombre}</Link>
              {editable && (
                <button type="button" disabled={guardando} aria-label={`Quitar ${matriz.nombre} como predio matriz`} title="Quitar predio matriz" onClick={() => void guardar(predioId, null)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ) : (
            <span className="text-xs text-white/35">—</span>
          )}
          {editable && subpredios !== null && (
            <button type="button" disabled={guardando} onClick={() => { setError(""); setSelector("matriz"); }} className="rounded p-1 text-white/60 hover:bg-white/10 disabled:opacity-50" title={matriz ? "Cambiar predio matriz" : "Asignar predio matriz"} aria-label={matriz ? "Cambiar predio matriz" : "Asignar predio matriz"}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-white/50">
              <CornerDownRight className="h-3.5 w-3.5" /> Subpredios independizados
            </span>
            {subpredios && subpredios.length > 0 && (
              <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold text-white/60">{subpredios.length}</span>
            )}
            {editable && subpredios !== null && (
              <button type="button" disabled={guardando} onClick={() => { setError(""); setSelector("subpredio"); }} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" /> Agregar subpredio
              </button>
            )}
          </div>
          {subpredios === null ? null : subpredios.length === 0 ? (
            <p className="pl-5 text-xs text-white/35">Sin subpredios vinculados</p>
          ) : (
            <ul className="space-y-1">
              {subpredios.map((hijo) => (
                <li key={hijo.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <CornerDownRight className="h-3 w-3 shrink-0 text-white/25" />
                  <Link href={`/entidades/predios/${hijo.id}`} className="min-w-0 flex-1 truncate text-xs text-white/85 hover:text-brand-300">{hijo.nombre}</Link>
                  {hijo.n_partida && <span className="shrink-0 font-mono text-[10px] text-white/40">{hijo.n_partida}</span>}
                  {editable && (
                    <button type="button" disabled={guardando} aria-label={`Desvincular ${hijo.nombre}`} title="Desvincular subpredio" onClick={() => void guardar(hijo.id, null)} className="rounded p-0.5 text-white/40 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 focus:opacity-100 disabled:opacity-50">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && !selector && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </div>

      {selector && (
        <SelectorPredio
          titulo={selector === "matriz" ? "Elegir predio matriz" : "Agregar subpredio"}
          predioId={predioId}
          modo={selector}
          seleccionados={selector === "matriz" ? (matriz ? [matriz.id] : []) : (subpredios ?? []).map((h) => h.id)}
          guardando={guardando}
          error={error}
          onElegir={async (otro) => {
            const ok = selector === "matriz" ? await guardar(predioId, otro.id) : await guardar(otro.id, predioId);
            if (ok && selector === "matriz") setSelector(null);
          }}
          onClose={() => { if (!guardando) setSelector(null); }}
        />
      )}
    </div>
  );
}

function SelectorPredio({ titulo, predioId, modo, seleccionados, guardando, error, onElegir, onClose }: {
  titulo: string;
  predioId: string;
  modo: "matriz" | "subpredio";
  seleccionados: string[];
  guardando: boolean;
  error: string;
  onElegir: (predio: PredioBreve) => void;
  onClose: () => void;
}) {
  const [predios, setPredios] = useState<PredioBreve[] | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let vigente = true;
    const supabase = createClient();
    void fetchAllRows((from, to) => supabase.from("predios").select(CAMPOS).order("nombre").order("id").range(from, to))
      .then(({ data }) => { if (vigente) setPredios((data as PredioBreve[] | null) ?? []); })
      .catch(() => { if (vigente) setPredios([]); });
    return () => { vigente = false; };
  }, []);

  // Se excluyen el propio predio y los que formarían un ciclo: como matriz no
  // sirve un subpredio suyo (a cualquier nivel); como subpredio, ninguno de
  // sus ancestros. El servidor lo vuelve a validar.
  const excluidos = useMemo(() => {
    const fuera = new Set<string>([predioId]);
    if (!predios) return fuera;
    const porId = new Map(predios.map((p) => [p.id, p]));
    if (modo === "subpredio") {
      let actual = porId.get(predioId)?.predio_padre_id ?? null;
      while (actual && !fuera.has(actual)) {
        fuera.add(actual);
        actual = porId.get(actual)?.predio_padre_id ?? null;
      }
    } else {
      const hijosPorPadre = new Map<string, string[]>();
      for (const p of predios) {
        if (!p.predio_padre_id) continue;
        hijosPorPadre.set(p.predio_padre_id, [...(hijosPorPadre.get(p.predio_padre_id) ?? []), p.id]);
      }
      const pendientes = [predioId];
      while (pendientes.length) {
        for (const hijo of hijosPorPadre.get(pendientes.pop()!) ?? []) {
          if (fuera.has(hijo)) continue;
          fuera.add(hijo);
          pendientes.push(hijo);
        }
      }
    }
    return fuera;
  }, [modo, predioId, predios]);

  const nombrePorId = useMemo(() => new Map((predios ?? []).map((p) => [p.id, p.nombre])), [predios]);
  const texto = busqueda.trim().toLocaleLowerCase("es");
  const opciones = (predios ?? []).filter((p) =>
    !excluidos.has(p.id) && `${p.nombre} ${p.n_partida ?? ""}`.toLocaleLowerCase("es").includes(texto)
  );

  return (
    <DialogoPanel titulo={titulo} onClose={onClose}>
      <input autoFocus aria-label="Buscar predio" placeholder="Buscar por nombre o partida…" className="glass-input mb-3" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      {error && <p role="alert" className="mb-2 text-xs text-red-300">{error}</p>}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {predios === null ? (
          <p className="text-xs text-white/50">Cargando…</p>
        ) : opciones.length === 0 ? (
          <p className="text-xs text-white/50">Sin resultados</p>
        ) : opciones.map((p) => {
          const seleccionado = seleccionados.includes(p.id);
          // Al agregarlo como subpredio, se mueve desde su matriz actual: se avisa.
          const matrizActual = modo === "subpredio" && p.predio_padre_id && !seleccionado ? nombrePorId.get(p.predio_padre_id) : null;
          return (
            <button
              key={p.id}
              type="button"
              disabled={guardando || seleccionado}
              aria-pressed={seleccionado}
              onClick={() => onElegir(p)}
              className={`block w-full rounded px-2 py-2 text-left text-xs text-white hover:bg-white/10 disabled:cursor-default ${seleccionado ? "bg-white/[0.08]" : ""} ${guardando ? "opacity-50" : ""}`}
            >
              <span>{seleccionado ? "✓ " : "+ "}{p.nombre}</span>
              {p.n_partida && <span className="ml-2 font-mono text-[10px] text-white/40">{p.n_partida}</span>}
              {matrizActual && <span className="block pl-3 text-[10px] text-amber-300/70">Hoy es subpredio de {matrizActual}</span>}
            </button>
          );
        })}
      </div>
    </DialogoPanel>
  );
}
