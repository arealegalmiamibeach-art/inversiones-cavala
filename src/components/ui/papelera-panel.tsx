"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Car,
  ChevronDown,
  FileText,
  Gavel,
  Gem,
  Landmark,
  Loader2,
  MapPin,
  Paperclip,
  RotateCcw,
  ScrollText,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  listarPapelera,
  purgarDePapelera,
  restaurarDePapelera,
  vaciarVencidos,
} from "@/lib/actions/papelera";
import {
  DIAS_RETENCION,
  diasParaPurga,
  nombreActorPapelera,
  normalizar,
  tipoPapelera,
  type FilaPapelera,
} from "@/lib/papelera";
import { tiempoRelativo } from "@/lib/historial";
import { cn } from "@/lib/utils";

const ICONOS: Record<string, LucideIcon> = {
  Users,
  MapPin,
  Car,
  Gem,
  UserCheck,
  Landmark,
  Gavel,
  ScrollText,
  FileText,
  CalendarClock,
  Paperclip,
  Trash2,
};

type Pendiente = { tabla: string; id: string; accion: "restaurar" | "purgar" };

export function PapeleraPanel({ children }: { children: (abrir: () => void) => React.ReactNode }) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [filas, setFilas] = useState<FilaPapelera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [filtroActor, setFiltroActor] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [confirmar, setConfirmar] = useState<FilaPapelera | null>(null);
  const [vaciando, setVaciando] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMontado(true), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const res = await listarPapelera();
    if (res.ok) setFilas(res.filas);
    else setError(res.error);
    setCargando(false);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    void cargar();
    cerrarRef.current?.focus();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", onEscape);
    };
  }, [abierto, cargar]);

  // Al cerrar se limpia el filtrado para que la próxima apertura no herede
  // una búsqueda vieja que haga parecer la papelera vacía.
  useEffect(() => {
    if (abierto) return;
    setBusqueda("");
    setFiltroTipo(null);
    setFiltroActor(null);
    setConfirmar(null);
  }, [abierto]);

  const actores = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const fila of filas) {
      if (fila.actorId) mapa.set(fila.actorId, nombreActorPapelera(fila));
    }
    return [...mapa].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [filas]);

  const tipos = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const fila of filas) cuenta.set(fila.tabla, (cuenta.get(fila.tabla) ?? 0) + 1);
    return [...cuenta]
      .map(([tabla, total]) => ({ tabla, total, label: tipoPapelera(tabla).label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [filas]);

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda.trim());
    return filas.filter((fila) => {
      if (filtroTipo && fila.tabla !== filtroTipo) return false;
      if (filtroActor && fila.actorId !== filtroActor) return false;
      if (termino && !normalizar(fila.nombre).includes(termino)) return false;
      return true;
    });
  }, [filas, busqueda, filtroTipo, filtroActor]);

  const vencidos = useMemo(() => filas.filter((f) => diasParaPurga(f.eliminadoEn) <= 0).length, [filas]);

  const quitarLocal = useCallback((tabla: string, id: string) => {
    setFilas((actuales) => actuales.filter((f) => !(f.tabla === tabla && f.id === id)));
  }, []);

  async function restaurar(fila: FilaPapelera) {
    setPendiente({ tabla: fila.tabla, id: fila.id, accion: "restaurar" });
    setError(null);
    const res = await restaurarDePapelera(fila.tabla, fila.id);
    setPendiente(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    quitarLocal(fila.tabla, fila.id);
    router.refresh();
  }

  async function purgar(fila: FilaPapelera) {
    setConfirmar(null);
    setPendiente({ tabla: fila.tabla, id: fila.id, accion: "purgar" });
    setError(null);
    const res = await purgarDePapelera(fila.tabla, fila.id);
    setPendiente(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    quitarLocal(fila.tabla, fila.id);
    router.refresh();
  }

  async function vaciar() {
    setVaciando(true);
    setError(null);
    const res = await vaciarVencidos();
    setVaciando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await cargar();
    router.refresh();
  }

  const panel = (
    <div className="fixed inset-0 z-[95]">
      <button
        type="button"
        aria-label="Cerrar papelera"
        onClick={() => setAbierto(false)}
        className="absolute inset-0 h-full w-full cursor-default bg-black/55 backdrop-blur-[2px] animate-fade-in"
      />
      <aside
        role="dialog"
        aria-label="Papelera"
        className="absolute right-0 top-0 flex h-full w-[min(30rem,100vw)] flex-col border-l border-white/10 bg-[#0d0f16] shadow-glass-lg animate-slide-in-right"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Papelera</p>
            <p className="mt-0.5 text-[11px] text-white/40">
              {cargando
                ? "Cargando…"
                : filas.length === 0
                  ? "Vacía"
                  : `${filas.length} elemento${filas.length === 1 ? "" : "s"}${
                      visibles.length !== filas.length ? ` · ${visibles.length} visible${visibles.length === 1 ? "" : "s"}` : ""
                    }`}
            </p>
          </div>
          <button
            ref={cerrarRef}
            type="button"
            onClick={() => setAbierto(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {filas.length > 0 && (
          <div className="shrink-0 space-y-2 border-b border-white/10 px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en la papelera"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-[13px] text-white/90 placeholder:text-white/30 outline-none transition-colors hover:bg-white/[0.06] focus:border-brand-400/40 focus:bg-white/[0.06]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FiltroMenu
                etiqueta="Tipo"
                valor={filtroTipo}
                valorLabel={filtroTipo ? tipoPapelera(filtroTipo).label : null}
                opciones={tipos.map((t) => ({ value: t.tabla, label: `${t.label} (${t.total})` }))}
                onElegir={setFiltroTipo}
              />
              <FiltroMenu
                etiqueta="Eliminado por"
                valor={filtroActor}
                valorLabel={actores.find((a) => a.id === filtroActor)?.nombre ?? null}
                opciones={actores.map((a) => ({ value: a.id, label: a.nombre }))}
                onElegir={setFiltroActor}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="flex shrink-0 items-start gap-2 border-b border-red-400/20 bg-red-500/10 px-4 py-2.5 text-[11px] leading-relaxed text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-200/60 hover:text-red-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="scrollbar-glass min-h-0 flex-1 overflow-y-auto">
          {cargando && filas.length === 0 ? (
            <ul className="space-y-3 px-4 py-4">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex gap-3">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-white/5" />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-white/5" />
                  </div>
                </li>
              ))}
            </ul>
          ) : visibles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
              <Trash2 className="h-7 w-7 text-white/15" />
              <p className="text-xs text-white/45">
                {filas.length === 0 ? "La papelera está vacía" : "Nada coincide con el filtro"}
              </p>
              <p className="text-[11px] leading-relaxed text-white/25">
                {filas.length === 0
                  ? "Lo que elimines aparece aquí y se puede restaurar."
                  : "Prueba con otro término o quita los filtros."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {visibles.map((fila) => (
                <FilaTrash
                  key={`${fila.tabla}:${fila.id}`}
                  fila={fila}
                  pendiente={
                    pendiente && pendiente.tabla === fila.tabla && pendiente.id === fila.id
                      ? pendiente.accion
                      : null
                  }
                  onRestaurar={() => void restaurar(fila)}
                  onPurgar={() => setConfirmar(fila)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-white/35">
            Se conserva {DIAS_RETENCION} días antes del borrado definitivo.
          </p>
          {vencidos > 0 && (
            <button
              type="button"
              onClick={() => void vaciar()}
              disabled={vaciando}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {vaciando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Vaciar {vencidos} vencido{vencidos === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </aside>

      {confirmar && (
        <ConfirmarPurga fila={confirmar} onCancelar={() => setConfirmar(null)} onConfirmar={() => void purgar(confirmar)} />
      )}
    </div>
  );

  return (
    <>
      {children(() => setAbierto(true))}
      {abierto && montado && createPortal(panel, document.body)}
    </>
  );
}

function FilaTrash({
  fila,
  pendiente,
  onRestaurar,
  onPurgar,
}: {
  fila: FilaPapelera;
  pendiente: "restaurar" | "purgar" | null;
  onRestaurar: () => void;
  onPurgar: () => void;
}) {
  const tipo = tipoPapelera(fila.tabla);
  const Icono = ICONOS[tipo.icono] ?? Trash2;
  const dias = diasParaPurga(fila.eliminadoEn);
  const urgente = dias <= 7;

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.035]">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
        <Icono className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white/90" title={fila.nombre}>
          {fila.nombre}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-white/40">
          {tipo.label} · {nombreActorPapelera(fila)} · {tiempoRelativo(fila.eliminadoEn)}
        </p>
        <p className={cn("mt-0.5 text-[10px]", urgente ? "text-amber-300/80" : "text-white/25")}>
          {dias <= 0 ? "Vencido — listo para borrado definitivo" : `Se borra en ${dias} día${dias === 1 ? "" : "s"}`}
          {fila.adjuntos > 0 && ` · ${fila.adjuntos} adjunto${fila.adjuntos === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
        <button
          type="button"
          onClick={onRestaurar}
          disabled={pendiente !== null}
          title="Restaurar"
          aria-label={`Restaurar ${fila.nombre}`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          {pendiente === "restaurar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onPurgar}
          disabled={pendiente !== null}
          title="Eliminar definitivamente"
          aria-label={`Eliminar definitivamente ${fila.nombre}`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
        >
          {pendiente === "purgar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </li>
  );
}

function ConfirmarPurga({
  fila,
  onCancelar,
  onConfirmar,
}: {
  fila: FilaPapelera;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const tipo = tipoPapelera(fila.tabla);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
      <button type="button" aria-label="Cancelar" onClick={onCancelar} className="absolute inset-0 bg-black/60" />
      <div
        role="alertdialog"
        aria-label="Confirmar borrado definitivo"
        className="relative w-full max-w-sm rounded-xl border border-white/10 bg-[#11131c] p-5 shadow-glass-lg"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
            <AlertTriangle className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Eliminar definitivamente</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/60">
              {tipo.label} <span className="font-medium text-white/85">«{fila.nombre}»</span> se borra de forma
              permanente. Esta acción no se puede deshacer.
            </p>
            {fila.adjuntos > 0 && (
              <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200">
                También se eliminarán sus {fila.adjuntos} archivo{fila.adjuntos === 1 ? "" : "s"} adjunto
                {fila.adjuntos === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="rounded-lg bg-red-500/85 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500"
          >
            Eliminar definitivamente
          </button>
        </div>
      </div>
    </div>
  );
}

function FiltroMenu({
  etiqueta,
  valor,
  valorLabel,
  opciones,
  onElegir,
}: {
  etiqueta: string;
  valor: string | null;
  valorLabel: string | null;
  opciones: { value: string; label: string }[];
  onElegir: (valor: string | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function onClickAfuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickAfuera);
    return () => document.removeEventListener("mousedown", onClickAfuera);
  }, [abierto]);

  if (opciones.length === 0) return null;

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
          valor
            ? "border-brand-400/35 bg-brand-500/15 text-brand-200 hover:bg-brand-500/25"
            : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/85"
        )}
      >
        {valor ? valorLabel : etiqueta}
        {valor ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Quitar filtro ${etiqueta}`}
            onClick={(e) => {
              e.stopPropagation();
              onElegir(null);
              setAbierto(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onElegir(null);
                setAbierto(false);
              }
            }}
            className="-mr-0.5 rounded p-0.5 hover:bg-white/15"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} />
        )}
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-52 overflow-y-auto rounded-xl border border-white/10 bg-[#151720] p-1 shadow-glass-lg">
          {opciones.map((op) => (
            <button
              key={op.value}
              type="button"
              onClick={() => {
                onElegir(op.value === valor ? null : op.value);
                setAbierto(false);
              }}
              className={cn(
                "block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors",
                op.value === valor ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/[0.07] hover:text-white"
              )}
            >
              {op.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
