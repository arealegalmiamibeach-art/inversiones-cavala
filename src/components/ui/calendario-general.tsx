"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ComponentType } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, CalendarDays, CalendarPlus, List, Loader2, X, ArrowRight, FileText, ChevronDown,
  ExternalLink, Clock, Tag, CircleDot, Coins, CalendarClock, FolderOpen, Scale, User, Briefcase, Car, AlignLeft, Info,
  Pencil, Trash2, Check, AlertTriangle, Video, RotateCcw, Users,
} from "lucide-react";
import { exportarCalendarioPDF } from "@/lib/calendario-export";
import { crearEvento, editarEvento, cerrarEvento, eliminarEvento } from "@/lib/actions/eventos";
import {
  CLASES_ESTADO,
  CierreDiligencia,
  FormularioDiligencia,
  borradorDesdeEvento,
  type BorradorDiligencia,
  type ResponsableOpcion,
} from "@/components/ui/diligencias-panel";
import { ESTADOS_DILIGENCIA } from "@/lib/procesos/eventos";
import {
  BotonReabrirVencimiento,
  ChipCierre,
  FormularioCierreVencimiento,
  autoriaCierre,
} from "@/components/ui/cierre-vencimiento";
import { cn } from "@/lib/utils";
import {
  type EventoCalendario,
  type DiligenciaCalendario,
  type CategoriaEvento,
  CATEGORIA_META,
  CATEGORIAS,
  MATERIA_OPCIONES,
  DIAS_SEMANA,
  MESES,
  agruparPorDia,
  claveDia,
  esMismoDia,
  fechaLocalDesdeISO,
  generarGrillaMes,
  hoyEnLima,
  proximosDias,
  estadoCierreEvento,
} from "@/lib/calendario";

const DIAS_AGENDA = 90;

export type ProcesoOpcion = { id: string; etiqueta: string };

/** Ya se registró qué pasó (para atenuar barras y filas; no depende del rol). */
function estaCerrado(evento: EventoCalendario): boolean {
  return estadoCierreEvento(evento, { vencimientosEditables: [], puedeCerrarDiligencias: false, hoy: "" }).cerrado;
}

/** Las diligencias con expediente se abren en la ficha del proceso; éstas no tienen otra ficha que el calendario. */
function esDiligenciaSinExpediente(evento: EventoCalendario): boolean {
  return !!evento.diligencia && !evento.diligencia.procesoId;
}

export function CalendarioGeneral({
  eventos,
  procesos = [],
  responsables = [],
  feriados = [],
  puedeCrear = false,
  vencimientosEditables = [],
}: {
  eventos: EventoCalendario[];
  /** Expedientes a los que se puede colgar una diligencia nueva. */
  procesos?: ProcesoOpcion[];
  responsables?: ResponsableOpcion[];
  /** Feriados extraordinarios ("YYYY-MM-DD") para el cómputo de plazos al editar. */
  feriados?: string[];
  puedeCrear?: boolean;
  /** Categorías cuyos vencimientos este rol puede cerrar ("contrato", "vehiculo"…). */
  vencimientosEditables?: string[];
}) {
  const hoy = useMemo(() => hoyEnLima(), []);
  const feriadosSet = useMemo(() => new Set(feriados), [feriados]);
  const [alta, setAlta] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<EventoCalendario | null>(null);
  const [vista, setVista] = useState<"mes" | "agenda">("mes");
  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [categoriasOff, setCategoriasOff] = useState<Set<CategoriaEvento>>(new Set());
  const [materia, setMateria] = useState("");
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  // Día que se sigue dibujando mientras el panel se pliega, para que el cierre
  // también se anime en vez de desaparecer de golpe.
  const [diaVisible, setDiaVisible] = useState<string | null>(null);
  // El detalle de un evento se ancla al elemento pulsado (como Google
  // Calendar), no al centro de la pantalla: por eso se guarda el nodo origen.
  const [popover, setPopover] = useState<{ evento: EventoCalendario; ancla: HTMLElement } | null>(null);

  const abrirEvento = useCallback((evento: EventoCalendario, e: { currentTarget: HTMLElement }) => {
    setPopover({ evento, ancla: e.currentTarget });
  }, []);

  const abrirFichaDiligencia = useCallback((evento: EventoCalendario) => {
    setPopover(null);
    setEdicion(evento);
  }, []);

  useEffect(() => {
    if (diaSeleccionado) setDiaVisible(diaSeleccionado);
  }, [diaSeleccionado]);

  function alternarCategoria(cat: CategoriaEvento) {
    setCategoriasOff((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const eventosFiltrados = useMemo(
    () =>
      eventos.filter((e) => {
        if (categoriasOff.has(e.categoria)) return false;
        if (e.categoria === "proceso" && materia && e.materia !== materia) return false;
        return true;
      }),
    [eventos, categoriasOff, materia]
  );

  const porDia = useMemo(() => agruparPorDia(eventosFiltrados), [eventosFiltrados]);
  const grilla = useMemo(() => generarGrillaMes(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  // La grilla se parte en semanas para poder desplegar el panel del día justo
  // debajo de su propia fila, como hace Google Calendar.
  const semanas = useMemo(
    () => Array.from({ length: grilla.length / 7 }, (_, i) => grilla.slice(i * 7, i * 7 + 7)),
    [grilla]
  );
  const agenda = useMemo(() => proximosDias(eventosFiltrados, DIAS_AGENDA), [eventosFiltrados]);
  const agendaPorDia = useMemo(() => agruparPorDia(agenda), [agenda]);

  const eventosDelDia = diaVisible ? porDia.get(diaVisible) ?? [] : [];

  function irAHoy() {
    setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDiaSeleccionado(claveDia(hoy));
  }
  function mesAnterior() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  }
  function mesSiguiente() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  }

  return (
    <div className="glass-panel p-5">
      {/* Encabezado: navegación + conmutador de vista */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-semibold text-white/85">Calendario general</h3>
        </div>

        <div className="flex items-center gap-2">
          {vista === "mes" && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={mesAnterior}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[8.5rem] text-center text-xs font-medium capitalize text-white/75">
                {MESES[cursor.getMonth()]} {cursor.getFullYear()}
              </span>
              <button
                type="button"
                onClick={mesSiguiente}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={irAHoy}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Hoy
          </button>
          {puedeCrear && (
            <button
              type="button"
              onClick={() => setAlta(claveDia(hoy))}
              className="flex items-center gap-1.5 rounded-lg border border-brand-400/30 bg-brand-500/15 px-2.5 py-1 text-xs font-medium text-brand-200 transition-colors hover:border-brand-400/50 hover:bg-brand-500/25 hover:text-white"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Nueva diligencia
            </button>
          )}
          <button
            type="button"
            onClick={() => exportarCalendarioPDF(eventosFiltrados, { anio: cursor.getFullYear(), mes: cursor.getMonth() })}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <FileText className="h-3.5 w-3.5" />
            Exportar PDF
          </button>
          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setVista("mes")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                vista === "mes" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Mes
            </button>
            <button
              type="button"
              onClick={() => setVista("agenda")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                vista === "agenda" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
              )}
            >
              <List className="h-3.5 w-3.5" /> Agenda
            </button>
          </div>
        </div>
      </div>

      {/* Filtros: categorías + materia de proceso */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CATEGORIAS.map((cat) => {
          const meta = CATEGORIA_META[cat];
          const activo = !categoriasOff.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => alternarCategoria(cat)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                activo ? meta.chipActivo : "border-white/10 bg-white/[0.03] text-white/35 hover:text-white/60"
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", activo ? meta.dot : "bg-white/25")} />
              {meta.label}
            </button>
          );
        })}

        <select
          value={materia}
          onChange={(e) => setMateria(e.target.value)}
          disabled={categoriasOff.has("proceso")}
          className="view-control ml-auto w-auto max-w-[11rem] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <option value="">Todas las materias</option>
          {MATERIA_OPCIONES.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      </div>

      {vista === "mes" ? (
        <>
          {/* Cabecera de días */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold uppercase tracking-wide text-white/35">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-1.5">{d}</div>
            ))}
          </div>

          {/* Rejilla del mes, semana por semana — cada evento es una barra con
              su título, como en Google Calendar, no un punto de color. Al
              pulsar un día, su detalle se despliega bajo esa misma semana. */}
          <div className="space-y-1.5">
            {semanas.map((semana, indiceSemana) => {
              const clavesSemana = semana.map(claveDia);
              const abierto = diaSeleccionado !== null && clavesSemana.includes(diaSeleccionado);
              const dibuja = diaVisible !== null && clavesSemana.includes(diaVisible);

              return (
                <div key={`semana-${indiceSemana}`} className="space-y-1.5">
                  <div className="grid grid-cols-7 gap-1.5">
                    {semana.map((dia) => {
                      const clave = claveDia(dia);
                      const eventosDia = porDia.get(clave) ?? [];
                      const enMesActual = dia.getMonth() === cursor.getMonth();
                      const esHoy = esMismoDia(dia, hoy);
                      const seleccionado = diaSeleccionado === clave;
                      const MAX_VISIBLES = 3;
                      const visibles = eventosDia.slice(0, MAX_VISIBLES);
                      const restantes = eventosDia.length - visibles.length;

                      return (
                        <div
                          key={clave}
                          role="button"
                          tabIndex={0}
                          aria-expanded={seleccionado}
                          aria-label={`${formatoFechaLarga(clave)} — ${eventosDia.length} evento${eventosDia.length === 1 ? "" : "s"}`}
                          onClick={() => setDiaSeleccionado(seleccionado ? null : clave)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            setDiaSeleccionado(seleccionado ? null : clave);
                          }}
                          className={cn(
                            "group flex min-h-[6.5rem] cursor-pointer flex-col items-stretch gap-1 overflow-hidden rounded-lg border px-1.5 py-1.5 text-left align-top outline-none transition-all duration-200 focus-visible:ring-1 focus-visible:ring-brand-400/60 sm:min-h-[7.5rem]",
                            enMesActual ? "border-white/10 bg-white/[0.02]" : "border-transparent bg-transparent opacity-40 hover:opacity-70",
                            seleccionado
                              ? "border-brand-400/60 bg-brand-500/10 shadow-[inset_0_0_0_1px_rgba(96,165,250,.18)]"
                              : "hover:border-white/25 hover:bg-white/[0.06]"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                                esHoy
                                  ? "bg-brand-500 text-white"
                                  : seleccionado
                                    ? "bg-white/15 text-white"
                                    : "text-white/60 group-hover:bg-white/10 group-hover:text-white/90"
                              )}
                            >
                              {dia.getDate()}
                            </span>
                            {eventosDia.length > 0 && (
                              <ChevronDown
                                className={cn(
                                  "h-3 w-3 shrink-0 text-white/30 transition-transform duration-200",
                                  seleccionado ? "rotate-180 text-brand-300" : "opacity-0 group-hover:opacity-100"
                                )}
                              />
                            )}
                          </div>
                          {visibles.length > 0 && (
                            <div className="mt-0.5 flex min-w-0 flex-col gap-1">
                              {visibles.map((ev) => (
                                <button
                                  key={ev.id}
                                  type="button"
                                  title={ev.titulo}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirEvento(ev, e);
                                  }}
                                  className={cn(
                                    "truncate rounded px-1.5 py-[3px] text-left text-[10.5px] font-medium leading-none transition-transform hover:scale-[1.015] hover:brightness-110",
                                    CATEGORIA_META[ev.categoria].barra,
                                    // Vencimiento ya atendido: sigue en su día, pero apagado.
                                    estaCerrado(ev) && "line-through opacity-45 hover:opacity-80"
                                  )}
                                >
                                  {ev.titulo}
                                </button>
                              ))}
                              {restantes > 0 && (
                                <span className="px-1.5 text-[10px] font-medium text-white/45 transition-colors group-hover:text-white/70">
                                  +{restantes} más
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desplegable del día: crece en su sitio (grid 0fr → 1fr),
                      sin superponerse al resto de la página. */}
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                      abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                    onTransitionEnd={() => {
                      if (!abierto && dibuja) setDiaVisible(null);
                    }}
                  >
                    <div className="overflow-hidden">
                      {dibuja && diaVisible && (
                        <PanelDia
                          clave={diaVisible}
                          eventos={eventosDelDia}
                          abierto={abierto}
                          onCerrar={() => setDiaSeleccionado(null)}
                          onAbrirEvento={abrirEvento}
                          onAbrirDiligencia={puedeCrear ? abrirFichaDiligencia : undefined}
                          onAgregar={puedeCrear ? () => setAlta(diaVisible) : undefined}
                          vencimientosEditables={vencimientosEditables}
                          puedeCerrarDiligencias={puedeCrear}
                          hoy={claveDia(hoy)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="scrollbar-glass max-h-[26rem] space-y-4 overflow-y-auto pr-1">
          {agendaPorDia.size === 0 ? (
            <p className="py-10 text-center text-xs text-white/35">Sin eventos en los próximos {DIAS_AGENDA} días.</p>
          ) : (
            Array.from(agendaPorDia.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([clave, evs]) => (
                <div key={clave}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/35">
                    {formatoFechaLarga(clave)}
                  </p>
                  <ul className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.02]">
                    {evs.map((ev) => (
                      <EventoItem key={ev.id} evento={ev} onAbrir={abrirEvento} />
                    ))}
                  </ul>
                </div>
              ))
          )}
        </div>
      )}

      {popover && (
        <EventoPopover
          key={popover.evento.id}
          evento={popover.evento}
          ancla={popover.ancla}
          onCerrar={() => setPopover(null)}
          onAbrirDiligencia={puedeCrear ? () => abrirFichaDiligencia(popover.evento) : undefined}
          puedeCerrarVencimiento={
            !!popover.evento.vencimiento &&
            estadoCierreEvento(popover.evento, { vencimientosEditables, puedeCerrarDiligencias: puedeCrear, hoy: claveDia(hoy) }).editable
          }
          puedeCerrarDiligencia={puedeCrear}
        />
      )}
      {edicion?.diligencia && (
        <ModalDiligencia
          key={edicion.id}
          evento={edicion}
          diligencia={edicion.diligencia}
          responsables={responsables}
          feriados={feriadosSet}
          onCerrar={() => setEdicion(null)}
        />
      )}
      {alta && (
        <ModalNuevaDiligencia
          fecha={alta}
          procesos={procesos}
          responsables={responsables}
          onCerrar={() => setAlta(null)}
        />
      )}
    </div>
  );
}

/**
 * Alta de una diligencia desde el propio calendario.
 *
 * Antes sólo se podía agendar algo entrando a la ficha de un expediente, así
 * que nada que no colgara de un proceso —una junta, un vencimiento de poder,
 * una reunión— tenía forma de entrar al calendario.
 */
function ModalNuevaDiligencia({
  fecha,
  procesos,
  responsables,
  onCerrar,
}: {
  fecha: string;
  procesos: ProcesoOpcion[];
  responsables: ResponsableOpcion[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [campos, setCampos] = useState({
    fecha,
    hora: "",
    titulo: "",
    tipo_diligencia: "",
    procesoId: "",
    responsable_id: "",
    dias_aviso: 10,
  });

  useEffect(() => {
    setMontado(true);
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onCerrar]);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const res = await crearEvento({
        procesoId: campos.procesoId || null,
        fecha: campos.fecha,
        hora: campos.hora || null,
        titulo: campos.titulo || null,
        tipo_diligencia: campos.tipo_diligencia || null,
        responsable_id: campos.responsable_id || null,
        dias_aviso: campos.dias_aviso,
        notificar: true,
      });
      if (!res.ok) { setError(res.error); return; }
      onCerrar();
      router.refresh();
    });
  }

  if (!montado) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nueva diligencia"
        onClick={(e) => e.stopPropagation()}
        className="glass-panel w-full max-w-md space-y-3 p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white/90">Nueva diligencia</h3>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-white/60">Fecha *</span>
            <input
              type="date"
              value={campos.fecha}
              onChange={(e) => setCampos((c) => ({ ...c, fecha: e.target.value }))}
              className="view-control h-8"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-white/60">Hora</span>
            <input
              type="time"
              value={campos.hora}
              onChange={(e) => setCampos((c) => ({ ...c, hora: e.target.value }))}
              className="view-control h-8"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/60">Descripción *</span>
          <input
            value={campos.titulo}
            maxLength={240}
            onChange={(e) => setCampos((c) => ({ ...c, titulo: e.target.value }))}
            placeholder="Audiencia única, vencimiento de poder…"
            className="view-control h-8"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/60">Expediente</span>
          <select
            value={campos.procesoId}
            onChange={(e) => setCampos((c) => ({ ...c, procesoId: e.target.value }))}
            className="view-control h-8"
          >
            <option value="">Sin expediente</option>
            {procesos.map((p) => (
              <option key={p.id} value={p.id}>{p.etiqueta}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-white/60">Responsable</span>
            <select
              value={campos.responsable_id}
              onChange={(e) => setCampos((c) => ({ ...c, responsable_id: e.target.value }))}
              className="view-control h-8"
            >
              <option value="">Sin asignar</option>
              {responsables.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-white/60">Avisar con (días)</span>
            <input
              type="number"
              min={0}
              max={90}
              value={campos.dias_aviso}
              onChange={(e) => setCampos((c) => ({ ...c, dias_aviso: Number(e.target.value) }))}
              className="view-control h-8"
            />
          </label>
        </div>

        {error && (
          <p className="text-[11px] text-red-300">{error}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente || !campos.fecha || !campos.titulo.trim()}
            className="glass-btn-primary px-3 py-1.5 text-[11px] disabled:opacity-50"
          >
            {pendiente ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />}
            Guardar
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg px-2.5 py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Ficha de una diligencia sin expediente. Las que cuelgan de un proceso se
 * gestionan en la ficha de ese proceso; éstas no tenían dónde abrirse y "Ver
 * ficha completa" devolvía al mismo dashboard sin hacer nada.
 */
function ModalDiligencia({
  evento,
  diligencia,
  responsables,
  feriados,
  onCerrar,
}: {
  evento: EventoCalendario;
  diligencia: DiligenciaCalendario;
  responsables: ResponsableOpcion[];
  feriados: ReadonlySet<string>;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [modo, setModo] = useState<"ver" | "editar" | "cerrar">("ver");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    setMontado(true);
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onCerrar]);

  function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    iniciar(async () => {
      const res = await accion();
      if (!res.ok) { setError(res.error); return; }
      onCerrar();
      router.refresh();
    });
  }

  function guardar(b: BorradorDiligencia) {
    ejecutar(() => editarEvento(diligencia.id, {
      fecha: b.fecha,
      hora: b.hora || null,
      tipo_diligencia: b.tipo_diligencia || null,
      titulo: b.titulo || null,
      responsable_id: b.responsable_id || null,
      dias_aviso: b.dias_aviso,
      notificar: b.notificar,
    }));
  }

  if (!montado) return null;

  // Fecha, hora y estado ya van en la cabecera.
  const campos = (evento.detalle ?? []).filter((c) => c.label !== "Hora" && c.label !== "Estado");
  const fechaLarga = formatoFechaLarga(diligencia.fecha);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={diligencia.titulo}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel scrollbar-glass max-h-[calc(100vh-2rem)] w-full max-w-lg space-y-3 overflow-y-auto p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Diligencia sin expediente</p>
            <h3 className="mt-0.5 break-words text-sm font-semibold text-white/90">{diligencia.titulo}</h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="font-semibold text-white/80">
            {fechaLarga.charAt(0).toUpperCase()}{fechaLarga.slice(1)} de {diligencia.fecha.slice(0, 4)}
          </span>
          {diligencia.hora && <span className="text-white/60">{diligencia.hora} h</span>}
          <span className={cn("rounded px-1.5 text-[9px] font-medium uppercase", CLASES_ESTADO[diligencia.estado])}>
            {ESTADOS_DILIGENCIA[diligencia.estado]}
          </span>
          {!diligencia.notificar && (
            <span className="rounded bg-white/[0.06] px-1.5 text-[9px] font-medium uppercase text-white/40">sin aviso</span>
          )}
        </div>

        {diligencia.vencidaSinCerrar && (
          <p className="flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/[0.08] px-3 py-2 text-[11px] text-red-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Pasó de fecha sin cerrarse. Seguirá en las alertas hasta que indiques qué ocurrió.
          </p>
        )}

        {modo === "editar" ? (
          <FormularioDiligencia
            inicial={borradorDesdeEvento(diligencia)}
            responsables={responsables}
            feriados={feriados}
            guardando={pendiente}
            onGuardar={guardar}
            onCancelar={() => { setModo("ver"); setError(null); }}
          />
        ) : (
          <>
            {(campos.length > 0 || evento.enlace) && (
              <div className="space-y-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                {campos.map((campo) => (
                  <FilaDetalle
                    key={campo.label}
                    icono={ICONO_CAMPO[campo.label] ?? Info}
                    valor={campo.valor}
                    etiqueta={campo.label}
                  />
                ))}
                {evento.enlace && <FilaEnlace enlace={evento.enlace} />}
              </div>
            )}

            {modo === "cerrar" ? (
              <CierreDiligencia
                guardando={pendiente}
                onCerrar={(estado, resultado) => ejecutar(() => cerrarEvento(diligencia.id, estado, { resultado }))}
                onCancelar={() => { setModo("ver"); setError(null); }}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                {diligencia.estado === "PENDIENTE" ? (
                  <button
                    type="button"
                    onClick={() => setModo("cerrar")}
                    className="glass-btn-primary px-3 py-1.5 text-[11px]"
                  >
                    <Check className="h-3 w-3" /> Registrar qué pasó
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => ejecutar(() => cerrarEvento(diligencia.id, "PENDIENTE"))}
                    disabled={pendiente}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    {pendiente && <Loader2 className="h-3 w-3 animate-spin" />}
                    Reabrir
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setModo("editar"); setConfirmarBorrado(false); setError(null); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <span className="ml-auto flex items-center gap-1">
                  {confirmarBorrado ? (
                    <>
                      <span className="text-[11px] font-medium text-red-200">¿Eliminar?</span>
                      <button
                        type="button"
                        onClick={() => ejecutar(() => eliminarEvento(diligencia.id))}
                        disabled={pendiente}
                        className="rounded px-2 py-1 text-[11px] font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-40"
                      >
                        {pendiente ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sí"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmarBorrado(false)}
                        className="rounded p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Cancelar eliminación"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmarBorrado(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-red-500/15 hover:text-red-300"
                    >
                      <Trash2 className="h-3 w-3" /> Eliminar
                    </button>
                  )}
                </span>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-[11px] text-red-300">
            <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Detalle del día desplegado dentro de la rejilla (no es un popup): muestra la
 * fecha en grande y la lista de lo que cae ese día, al estilo de Google
 * Calendar, con acceso directo a la ficha de cada registro.
 */
function PanelDia({
  clave,
  eventos,
  abierto,
  onCerrar,
  onAbrirEvento,
  onAbrirDiligencia,
  onAgregar,
  vencimientosEditables,
  puedeCerrarDiligencias,
  hoy,
}: {
  clave: string;
  eventos: EventoCalendario[];
  abierto: boolean;
  onCerrar: () => void;
  onAbrirEvento: AbrirEvento;
  onAbrirDiligencia?: (evento: EventoCalendario) => void;
  onAgregar?: () => void;
  vencimientosEditables: readonly string[];
  /** Mismo permiso que editar diligencias ("procesos" con administrar). */
  puedeCerrarDiligencias: boolean;
  /** "YYYY-MM-DD" de hoy en Lima: lo vencido y sin cerrar resalta su botón. */
  hoy: string;
}) {
  const fecha = fechaLocalDesdeISO(clave);
  const [cerrandoId, setCerrandoId] = useState<string | null>(null);
  const diaSemana = DIAS_SEMANA[(fecha.getDay() + 6) % 7];

  // El panel monta ya "abierto" (el alto lo anima el contenedor), así que la
  // entrada del contenido necesita su propio primer frame para transicionar.
  const [entrado, setEntrado] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntrado(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const mostrar = abierto && entrado;

  return (
    <div
      className={cn(
        "mt-1 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 transition-transform duration-300 ease-out motion-reduce:transition-none",
        mostrar ? "translate-y-0" : "-translate-y-1"
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3 border-b border-white/[0.06] pb-2">
        <p className="min-w-0 truncate text-[12px] font-medium capitalize text-white/75">
          {diaSemana} {fecha.getDate()} de {MESES[fecha.getMonth()]}
          <span className="ml-1.5 font-normal normal-case text-white/35">
            · {eventos.length === 0 ? "sin eventos" : `${eventos.length} evento${eventos.length === 1 ? "" : "s"}`}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {onAgregar && (
            <button
              type="button"
              onClick={onAgregar}
              className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/65 transition-colors hover:border-brand-400/40 hover:bg-brand-500/15 hover:text-white"
            >
              <CalendarPlus className="h-3 w-3" /> Agregar
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar detalle del día"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {eventos.length === 0 ? (
        <p className="py-4 text-center text-xs text-white/35">No hay nada agendado este día.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/10 bg-white/[0.015]">
          {eventos.map((ev, indice) => {
            const meta = CATEGORIA_META[ev.categoria];
            const cierre = ev.vencimiento?.cierre;
            const diligencia = ev.diligencia;
            const { cerrado, cerrable, vencidoSinCerrar } = estadoCierreEvento(ev, {
              vencimientosEditables,
              puedeCerrarDiligencias,
              hoy,
            });
            return (
              <li
                key={ev.id}
                style={{ transitionDelay: mostrar ? `${Math.min(indice, 10) * 18}ms` : "0ms" }}
                className={cn(
                  "transition-all duration-200 ease-out motion-reduce:transition-none",
                  mostrar ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                )}
              >
                <div className="group flex items-center gap-2.5 px-3 py-[7px] transition-colors hover:bg-white/[0.04]">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot, cerrado && "opacity-50")} />
                  <button
                    type="button"
                    onClick={(e) => onAbrirEvento(ev, e)}
                    className="flex min-w-0 flex-1 items-baseline gap-2 text-left outline-none"
                  >
                    <span className={cn("truncate text-[12.5px] font-medium", cerrado ? "text-white/45 line-through" : "text-white/90")}>
                      {ev.titulo}
                    </span>
                    <span className="shrink-0 truncate text-[11px] text-white/40">
                      <span className={meta.text}>{meta.label}</span>
                      {ev.subtitulo ? ` · ${ev.subtitulo}` : ""}
                    </span>
                  </button>
                  {cierre && <ChipCierre cierre={cierre} className="shrink-0" />}
                  {diligencia && diligencia.estado !== "PENDIENTE" && (
                    <span className={cn("shrink-0 rounded px-1.5 text-[9px] font-medium uppercase", CLASES_ESTADO[diligencia.estado])}>
                      {ESTADOS_DILIGENCIA[diligencia.estado]}
                    </span>
                  )}
                  {cerrable && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setCerrandoId((id) => (id === ev.id ? null : ev.id)); }}
                      title={diligencia ? "Registrar qué pasó con esta diligencia" : "Registrar qué pasó con este vencimiento"}
                      aria-expanded={cerrandoId === ev.id}
                      className={cn(
                        "flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-colors focus-visible:opacity-100",
                        vencidoSinCerrar || cerrandoId === ev.id
                          ? "bg-red-500/15 text-red-200 hover:bg-red-500/30 hover:text-white"
                          : "text-white/50 opacity-0 hover:bg-white/15 hover:text-white group-hover:opacity-100"
                      )}
                    >
                      <Check className="h-3 w-3" />
                      <span className="hidden sm:inline">Registrar qué pasó</span>
                    </button>
                  )}
                  {esDiligenciaSinExpediente(ev) ? (
                    onAbrirDiligencia && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAbrirDiligencia(ev); }}
                        aria-label={`Abrir diligencia ${ev.titulo}`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/25 opacity-0 transition-colors hover:bg-white/10 hover:text-white group-hover:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )
                  ) : (
                    <Link
                      href={ev.href}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Ver ficha de ${ev.titulo}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/25 opacity-0 transition-colors hover:bg-white/10 hover:text-white group-hover:opacity-100"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
                {cerrandoId === ev.id && diligencia && (
                  <CierreDiligenciaCalendario
                    diligencia={diligencia}
                    onListo={() => setCerrandoId(null)}
                    onCancelar={() => setCerrandoId(null)}
                    className="mx-3 mb-2"
                  />
                )}
                {cerrandoId === ev.id && !diligencia && ev.vencimiento && (
                  <FormularioCierreVencimiento
                    alertaId={ev.vencimiento.alertaId}
                    fecha={ev.fecha}
                    onListo={() => setCerrandoId(null)}
                    onCancelar={() => setCerrandoId(null)}
                    className="mx-3 mb-2"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EventoItem({ evento, onAbrir }: { evento: EventoCalendario; onAbrir: AbrirEvento }) {
  const meta = CATEGORIA_META[evento.categoria];
  return (
    <li>
      <button
        type="button"
        onClick={(e) => onAbrir(evento, e)}
        className="flex w-full items-center gap-2.5 px-1 py-2 text-left transition-colors hover:bg-white/5"
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot, estaCerrado(evento) && "opacity-50")} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", estaCerrado(evento) ? "text-white/45 line-through" : "text-white/90")}>
            {evento.titulo}
          </p>
          {evento.subtitulo && <p className="truncate text-xs text-white/40">{evento.subtitulo}</p>}
        </div>
        {evento.vencimiento?.cierre && <ChipCierre cierre={evento.vencimiento.cierre} className="shrink-0" />}
        {evento.diligencia && evento.diligencia.estado !== "PENDIENTE" && (
          <span className={cn("shrink-0 rounded px-1.5 text-[9px] font-medium uppercase", CLASES_ESTADO[evento.diligencia.estado])}>
            {ESTADOS_DILIGENCIA[evento.diligencia.estado]}
          </span>
        )}
        <span className={cn("shrink-0 text-[10px] font-semibold uppercase tracking-wide", meta.text)}>
          {meta.label}
        </span>
      </button>
    </li>
  );
}

function formatoFechaLarga(claveISO: string): string {
  const [anio, mes, dia] = claveISO.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  const diaSemana = DIAS_SEMANA[(fecha.getDay() + 6) % 7];
  return `${diaSemana} ${dia} de ${MESES[mes - 1]}`;
}

/** Abrir el detalle de un evento anclado al elemento que se pulsó. */
type AbrirEvento = (evento: EventoCalendario, e: { currentTarget: HTMLElement }) => void;

/** Icono para cada campo de `detalle`, al estilo de las filas de Google Calendar. */
const ICONO_CAMPO: Record<string, ComponentType<{ className?: string }>> = {
  "Hora": Clock,
  "Fecha": CalendarDays,
  "Tipo": Tag,
  "Tipo de diligencia": Tag,
  "Propiedad": Tag,
  "Estado": CircleDot,
  "Monto": Coins,
  "Vencimiento": CalendarClock,
  "Vencimiento SOAT": CalendarClock,
  "Vencimiento de póliza": CalendarClock,
  "Revisión técnica": CalendarClock,
  "Inicio": CalendarClock,
  "Inicio de contrato": CalendarClock,
  "Fin de contrato": CalendarClock,
  "Expediente": FolderOpen,
  "Asunto": FileText,
  "Materia": Scale,
  "Juzgado": Scale,
  "Responsable": User,
  // Partes del proceso de la diligencia (ver `partesDeProceso`).
  "Demandante": User,
  "Demandado": User,
  "Imputado": User,
  "Agraviado": User,
  "Solicitante": User,
  "Destinatario": User,
  "Propietarios": Users,
  "Abogado": User,
  "Cargo": Briefcase,
  "Marca / Modelo": Car,
  "Detalle": AlignLeft,
  "Resultado": Check,
  "Origen": Info,
};

/** Ancho del popover y margen mínimo contra los bordes de la ventana. */
const POPOVER_ANCHO = 368;
const POPOVER_MARGEN = 12;

/**
 * Detalle de un evento como ventanita anclada al propio evento —el patrón de
 * Google Calendar— en vez del modal centrado que había antes: aparece junto a
 * lo que se pulsó, con el resto del calendario a la vista.
 *
 * Estos eventos no son reuniones (son contratos, vehículos, documentos…), así
 * que las filas del cuerpo muestran sus campos en lugar de invitados.
 */
function EventoPopover({
  evento,
  ancla,
  onCerrar,
  onAbrirDiligencia,
  puedeCerrarVencimiento = false,
  puedeCerrarDiligencia = false,
}: {
  evento: EventoCalendario;
  ancla: HTMLElement;
  onCerrar: () => void;
  /** Sin permiso de edición no se pasa: la diligencia sin expediente no tiene otra ficha. */
  onAbrirDiligencia?: () => void;
  puedeCerrarVencimiento?: boolean;
  puedeCerrarDiligencia?: boolean;
}) {
  const [montado, setMontado] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; origen: string } | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const salidaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMontado(true), []);

  // El cierre también se anima: se apaga primero y se desmonta al terminar.
  const cerrar = useCallback(() => {
    setVisible(false);
    if (salidaRef.current) clearTimeout(salidaRef.current);
    salidaRef.current = setTimeout(onCerrar, 150);
  }, [onCerrar]);

  useEffect(() => () => { if (salidaRef.current) clearTimeout(salidaRef.current); }, []);

  // Posición: debajo del evento si cabe, encima si no, siempre dentro de la
  // ventana. Se recalcula al hacer scroll o redimensionar para no despegarse.
  useLayoutEffect(() => {
    if (!montado) return;
    function ubicar() {
      const caja = cajaRef.current;
      if (!caja || !ancla.isConnected) return;
      const r = ancla.getBoundingClientRect();
      const ancho = caja.offsetWidth;
      const alto = caja.offsetHeight;
      const maxLeft = Math.max(POPOVER_MARGEN, window.innerWidth - ancho - POPOVER_MARGEN);
      const left = Math.min(Math.max(POPOVER_MARGEN, r.left + r.width / 2 - ancho / 2), maxLeft);

      let top = r.bottom + 8;
      let haciaArriba = false;
      if (top + alto > window.innerHeight - POPOVER_MARGEN) {
        const arriba = r.top - 8 - alto;
        if (arriba >= POPOVER_MARGEN) {
          top = arriba;
          haciaArriba = true;
        } else {
          top = Math.max(POPOVER_MARGEN, window.innerHeight - alto - POPOVER_MARGEN);
        }
      }
      // La animación de escala nace del punto del calendario que se pulsó.
      const anclaX = Math.min(Math.max(r.left + r.width / 2 - left, 18), Math.max(18, ancho - 18));
      setPos({ top, left, origen: `${anclaX}px ${haciaArriba ? alto : 0}px` });
    }
    ubicar();
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
    // El formulario de cierre cambia el alto: hay que volver a ubicarlo.
  }, [montado, ancla, evento, registrando]);

  // La entrada se anima una sola vez, en cuanto hay posición: los recálculos
  // posteriores (scroll, resize) no deben reiniciarla.
  const animadoRef = useRef(false);
  useEffect(() => {
    if (!pos || animadoRef.current) return;
    animadoRef.current = true;
    const frame = requestAnimationFrame(() => {
      setVisible(true);
      cerrarRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pos]);

  // Cierra al pulsar fuera (sin capa oscura: el calendario sigue usable) o con Escape.
  useEffect(() => {
    function fuera(e: MouseEvent) {
      const destino = e.target as Node;
      if (cajaRef.current?.contains(destino) || ancla.contains(destino)) return;
      cerrar();
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [ancla, cerrar]);

  if (!montado) return null;

  const meta = CATEGORIA_META[evento.categoria];
  const fecha = fechaLocalDesdeISO(evento.fecha);
  const diaSemana = DIAS_SEMANA[(fecha.getDay() + 6) % 7];
  const fechaLarga = `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)}, ${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
  const campos = evento.detalle ?? [];

  return createPortal(
    <div
      ref={cajaRef}
      role="dialog"
      aria-label={evento.titulo}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: `min(${POPOVER_ANCHO}px, calc(100vw - ${POPOVER_MARGEN * 2}px))`,
        transformOrigin: pos?.origen ?? "center top",
        visibility: pos ? "visible" : "hidden",
      }}
      className={cn(
        "fixed z-[90] overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#25272c] shadow-[0_24px_70px_-10px_rgba(0,0,0,.75)]",
        "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
        visible ? "scale-100 opacity-100" : "scale-[0.94] opacity-0"
      )}
    >
      {/* Barra de acciones, arriba a la derecha como en Google Calendar */}
      <div className="flex items-center justify-end gap-0.5 px-2.5 pt-2.5">
        {esDiligenciaSinExpediente(evento) ? (
          onAbrirDiligencia && (
            <button
              type="button"
              onClick={onAbrirDiligencia}
              title="Ver y editar diligencia"
              aria-label="Ver y editar diligencia"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/65 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-brand-400/60"
            >
              <Pencil className="h-[17px] w-[17px]" />
            </button>
          )
        ) : (
          <Link
            href={evento.href}
            onClick={cerrar}
            title="Ver ficha completa"
            aria-label="Ver ficha completa"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/65 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-brand-400/60"
          >
            <ExternalLink className="h-[18px] w-[18px]" />
          </Link>
        )}
        <button
          ref={cerrarRef}
          type="button"
          onClick={cerrar}
          title="Cerrar"
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/65 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-brand-400/60"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Título con el cuadradito de color de la categoría */}
      <div className="flex gap-4 px-5 pt-1">
        <span className={cn("mt-[9px] h-3.5 w-3.5 shrink-0 rounded-[3px]", meta.dot)} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[19px] font-medium leading-[1.3] text-white">{evento.titulo}</h3>
          <p className="mt-0.5 text-[13px] text-white/55">{fechaLarga}</p>
        </div>
      </div>

      {/* Filas de datos: icono + valor, con la etiqueta en tono menor */}
      <div className="space-y-3 px-5 pb-5 pt-4">
        {evento.subtitulo && <FilaDetalle icono={Info} valor={evento.subtitulo} />}
        {campos.map((campo) => (
          <FilaDetalle
            key={campo.label}
            icono={ICONO_CAMPO[campo.label] ?? Info}
            valor={campo.valor}
            etiqueta={campo.label}
          />
        ))}
        {evento.enlace && <FilaEnlace enlace={evento.enlace} />}
        <FilaDetalle icono={CalendarDays} valor={meta.label} />
        {evento.diligencia && puedeCerrarDiligencia && (
          <SeccionDiligencia
            diligencia={evento.diligencia}
            abierto={registrando}
            onAbrir={setRegistrando}
            onListo={cerrar}
          />
        )}
        {evento.vencimiento && (
          <SeccionVencimiento
            evento={evento}
            vencimiento={evento.vencimiento}
            puedeCerrar={puedeCerrarVencimiento}
            abierto={registrando}
            onAbrir={setRegistrando}
            onListo={cerrar}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Cierre de una diligencia desde el calendario: el mismo de la ficha del
 * proceso (Realizada, Reprogramada…), sin tener que entrar al expediente.
 */
function CierreDiligenciaCalendario({
  diligencia,
  onListo,
  onCancelar,
  className,
}: {
  diligencia: DiligenciaCalendario;
  onListo: () => void;
  onCancelar: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <div className={className}>
      <CierreDiligencia
        guardando={pendiente}
        onCerrar={(estado, resultado) => {
          setError(null);
          iniciar(async () => {
            const res = await cerrarEvento(diligencia.id, estado, { resultado, procesoId: diligencia.procesoId });
            if (!res.ok) { setError(res.error); return; }
            onListo();
            router.refresh();
          });
        }}
        onCancelar={onCancelar}
      />
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-300">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

/** Pie del popover de una diligencia: cerrarla o, si ya se cerró, reabrirla. */
function SeccionDiligencia({
  diligencia,
  abierto,
  onAbrir,
  onListo,
}: {
  diligencia: DiligenciaCalendario;
  abierto: boolean;
  onAbrir: (abierto: boolean) => void;
  onListo: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (diligencia.estado !== "PENDIENTE") {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
        <span className={cn("rounded px-1.5 text-[10px] font-medium uppercase", CLASES_ESTADO[diligencia.estado])}>
          {ESTADOS_DILIGENCIA[diligencia.estado]}
        </span>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            setError(null);
            iniciar(async () => {
              const res = await cerrarEvento(diligencia.id, "PENDIENTE", { procesoId: diligencia.procesoId });
              if (!res.ok) { setError(res.error); return; }
              onListo();
              router.refresh();
            });
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white/85 disabled:opacity-40"
        >
          {pendiente ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          Reabrir
        </button>
        {error && <span className="text-[10px] text-red-300">{error}</span>}
      </div>
    );
  }

  return (
    <div className="border-t border-white/[0.07] pt-3">
      {abierto ? (
        <CierreDiligenciaCalendario diligencia={diligencia} onListo={onListo} onCancelar={() => onAbrir(false)} />
      ) : (
        <button type="button" onClick={() => onAbrir(true)} className="glass-btn-primary px-3 py-1.5 text-[11px]">
          <Check className="h-3 w-3" /> Registrar qué pasó
        </button>
      )}
    </div>
  );
}

/** Pie del popover de un vencimiento: qué pasó con él, o el botón para registrarlo. */
function SeccionVencimiento({
  evento,
  vencimiento,
  puedeCerrar,
  abierto,
  onAbrir,
  onListo,
}: {
  evento: EventoCalendario;
  vencimiento: NonNullable<EventoCalendario["vencimiento"]>;
  puedeCerrar: boolean;
  abierto: boolean;
  onAbrir: (abierto: boolean) => void;
  onListo: () => void;
}) {
  const { cierre, alertaId } = vencimiento;
  if (cierre) {
    return (
      <div className="flex items-start gap-4 border-t border-white/[0.07] pt-3">
        <Check className="mt-[2px] h-[17px] w-[17px] shrink-0 text-white/40" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] leading-snug text-white/85">
            <ChipCierre cierre={cierre} className="text-[10px]" />
            {cierre.nota && <span className="break-words">{cierre.nota}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-[11px] text-white/40">
            {autoriaCierre(cierre)}
            {puedeCerrar && <BotonReabrirVencimiento alertaId={alertaId} fecha={evento.fecha} onListo={onListo} />}
          </p>
        </div>
      </div>
    );
  }
  if (!puedeCerrar) return null;
  return (
    <div className="border-t border-white/[0.07] pt-3">
      {abierto ? (
        <FormularioCierreVencimiento
          alertaId={alertaId}
          fecha={evento.fecha}
          onListo={onListo}
          onCancelar={() => onAbrir(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => onAbrir(true)}
          className="glass-btn-primary px-3 py-1.5 text-[11px]"
        >
          <Check className="h-3 w-3" /> Registrar qué pasó
        </button>
      )}
    </div>
  );
}

function FilaEnlace({ enlace }: { enlace: string }) {
  return (
    <div className="flex items-start gap-4">
      <Video className="mt-[2px] h-[17px] w-[17px] shrink-0 text-white/40" />
      <a
        href={enlace}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 break-all text-[13.5px] leading-snug text-brand-300 underline-offset-2 transition-colors hover:text-brand-200 hover:underline"
      >
        {enlace.replace(/^https?:\/\//, "").replace(/\/$/, "")}
      </a>
    </div>
  );
}

function FilaDetalle({
  icono: Icono,
  valor,
  etiqueta,
}: {
  icono: ComponentType<{ className?: string }>;
  valor: string;
  etiqueta?: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <Icono className="mt-[2px] h-[17px] w-[17px] shrink-0 text-white/40" />
      <p className="min-w-0 flex-1 whitespace-pre-line break-words text-[13.5px] leading-snug text-white/85">
        {valor}
        {etiqueta && <span className="ml-1.5 text-[11px] text-white/35">· {etiqueta}</span>}
      </p>
    </div>
  );
}
