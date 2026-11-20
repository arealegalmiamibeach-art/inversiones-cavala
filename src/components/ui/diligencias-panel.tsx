"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import { crearEvento, editarEvento, eliminarEvento, cerrarEvento } from "@/lib/actions/eventos";
import {
  ESTADOS_DILIGENCIA,
  TIPOS_DILIGENCIA,
  type EstadoDiligencia,
  type EventoProceso,
} from "@/lib/procesos/eventos";
import {
  diasHasta,
  nivelUrgencia,
  type DiligenciaDetectada,
} from "@/lib/procesos/diligencias";
import { diasHabilesHasta, nombreFeriado, sumarDiasHabiles } from "@/lib/feriados";
import { CLASES_URGENCIA, formatearFechaCorta, textoDias } from "@/lib/procesos/resumen";
import { cn } from "@/lib/utils";

export type ResponsableOpcion = { id: string; nombre: string };

export type BorradorDiligencia = {
  fecha: string;
  hora: string;
  tipo_diligencia: string;
  titulo: string;
  responsable_id: string;
  dias_aviso: number;
  notificar: boolean;
};

export function borradorDesdeEvento(evento: EventoProceso): BorradorDiligencia {
  return {
    fecha: evento.fecha,
    hora: evento.hora ?? "",
    tipo_diligencia: evento.tipo_diligencia ?? "",
    // Si la descripción es sólo el tipo copiado al crear, se deja vacía para que siga al tipo nuevo.
    titulo: evento.titulo === (evento.tipo_diligencia ?? "Diligencia") ? "" : evento.titulo,
    responsable_id: evento.responsable_id ?? "",
    dias_aviso: evento.dias_aviso,
    notificar: evento.notificar,
  };
}

const BORRADOR_VACIO: BorradorDiligencia = {
  fecha: "",
  hora: "",
  tipo_diligencia: "",
  titulo: "",
  responsable_id: "",
  dias_aviso: 10,
  notificar: true,
};

/** Cierres posibles desde la fila, en el orden en que se usan de verdad. */
const CIERRES: EstadoDiligencia[] = ["REALIZADA", "REPROGRAMADA", "INCUMPLIDA", "CANCELADA"];

export const CLASES_ESTADO: Record<EstadoDiligencia, string> = {
  PENDIENTE: "bg-white/[0.06] text-white/55",
  REALIZADA: "bg-emerald-500/15 text-emerald-300",
  REPROGRAMADA: "bg-amber-500/15 text-amber-300",
  INCUMPLIDA: "bg-red-500/15 text-red-300",
  CANCELADA: "bg-white/[0.06] text-white/40",
};

export function DiligenciasPanel({
  procesoId,
  eventos,
  detectadas,
  hoy,
  responsables = [],
  feriados = [],
  onCambio,
}: {
  procesoId: string;
  eventos: EventoProceso[];
  detectadas: DiligenciaDetectada[];
  hoy: string;
  responsables?: ResponsableOpcion[];
  /** Feriados extraordinarios ("YYYY-MM-DD"); los fijos los calcula `lib/feriados`. */
  feriados?: string[];
  /** El panel lateral carga los eventos en el cliente: `router.refresh()` no los recarga, así que avisa aquí. */
  onCambio?: () => void;
}) {
  const editable = puedeEscribir(useAcceso("proceso"));
  const router = useRouter();
  const refrescar = () => {
    router.refresh();
    onCambio?.();
  };
  const [creando, setCreando] = useState(false);
  const [borradorInicial, setBorradorInicial] = useState<BorradorDiligencia>(BORRADOR_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [cerrandoId, setCerrandoId] = useState<string | null>(null);
  // Borrar una audiencia al primer clic era demasiado fácil de hacer sin
  // querer (y sólo un administrador puede recuperarla de la papelera).
  const [confirmarBorradoId, setConfirmarBorradoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [verDetectadas, setVerDetectadas] = useState(false);

  const feriadosSet = useMemo(() => new Set(feriados), [feriados]);

  function abrirAlta(prefill: BorradorDiligencia = BORRADOR_VACIO) {
    setBorradorInicial(prefill);
    setEditandoId(null);
    setCreando(true);
    setError(null);
  }

  // Fechas del texto libre que aún no tienen una diligencia registrada.
  const fechasRegistradas = new Set(eventos.map((e) => e.fecha));
  const detectadasPendientes = detectadas.filter((d) => !fechasRegistradas.has(d.fechaISO));
  const sinCerrar = eventos.filter((e) => e.vencidaSinCerrar).length;

  function crear(borrador: BorradorDiligencia) {
    setError(null);
    iniciar(async () => {
      const res = await crearEvento({
        procesoId,
        fecha: borrador.fecha,
        hora: borrador.hora || null,
        tipo_diligencia: borrador.tipo_diligencia || null,
        titulo: borrador.titulo || null,
        responsable_id: borrador.responsable_id || null,
        dias_aviso: borrador.dias_aviso,
        notificar: borrador.notificar,
      });
      if (!res.ok) { setError(res.error); return; }
      setCreando(false);
      refrescar();
    });
  }

  function guardarEdicion(id: string, borrador: BorradorDiligencia) {
    setError(null);
    iniciar(async () => {
      const res = await editarEvento(id, {
        procesoId,
        fecha: borrador.fecha,
        hora: borrador.hora || null,
        tipo_diligencia: borrador.tipo_diligencia || null,
        titulo: borrador.titulo || null,
        responsable_id: borrador.responsable_id || null,
        dias_aviso: borrador.dias_aviso,
        notificar: borrador.notificar,
      });
      if (!res.ok) { setError(res.error); return; }
      setEditandoId(null);
      refrescar();
    });
  }

  function cerrar(id: string, estado: EstadoDiligencia, resultado?: string) {
    setError(null);
    iniciar(async () => {
      const res = await cerrarEvento(id, estado, { resultado, procesoId });
      if (!res.ok) { setError(res.error); return; }
      setCerrandoId(null);
      refrescar();
    });
  }

  function borrar(id: string) {
    setError(null);
    iniciar(async () => {
      const res = await eliminarEvento(id, procesoId);
      if (!res.ok) { setError(res.error); return; }
      refrescar();
    });
  }

  return (
    <div className="space-y-3">
      {sinCerrar > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/[0.08] px-3 py-2 text-[11px] text-red-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {sinCerrar} diligencia{sinCerrar === 1 ? "" : "s"} pasó de fecha sin cerrarse. Seguirá en las alertas hasta que indiques qué ocurrió.
        </p>
      )}

      {eventos.length === 0 && detectadasPendientes.length === 0 && !creando && (
        <p className="text-xs text-white/50">
          No hay diligencias registradas. {editable && "Agrega la próxima audiencia o vencimiento para que entre en las alertas y el calendario."}
        </p>
      )}

      {eventos.length > 0 && (
        <ul className="space-y-2">
          {eventos.map((evento) => {
            const clases = CLASES_URGENCIA[evento.vencidaSinCerrar ? "vencida" : evento.nivel];
            if (editandoId === evento.id) {
              return (
                <li key={evento.id}>
                  <FormularioDiligencia
                    inicial={borradorDesdeEvento(evento)}
                    responsables={responsables}
                    feriados={feriadosSet}
                    guardando={pendiente}
                    onGuardar={(b) => guardarEdicion(evento.id, b)}
                    onCancelar={() => setEditandoId(null)}
                  />
                </li>
              );
            }
            return (
              <li key={evento.id} className={cn("rounded-lg border px-3 py-2", clases.borde, clases.fondo)}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", clases.punto)} />
                  <span className={cn("text-xs font-semibold tabular-nums", clases.texto)}>
                    {formatearFechaCorta(evento.fecha)}
                  </span>
                  {evento.hora && <span className="text-[11px] text-white/70">{evento.hora} h</span>}
                  <span className="text-[11px] text-white/45">· {textoDias(evento.dias)}</span>
                  <span className={cn("rounded px-1.5 text-[9px] font-medium uppercase", CLASES_ESTADO[evento.estado])}>
                    {ESTADOS_DILIGENCIA[evento.estado]}
                  </span>
                  {!evento.notificar && (
                    <span className="rounded bg-white/[0.06] px-1.5 text-[9px] font-medium uppercase text-white/40">sin aviso</span>
                  )}
                  {editable && (
                    <span className="ml-auto flex items-center gap-1">
                      {confirmarBorradoId === evento.id ? (
                        <>
                          <span className="text-[10px] font-medium text-red-200">¿Eliminar?</span>
                          <button
                            type="button"
                            onClick={() => { setConfirmarBorradoId(null); borrar(evento.id); }}
                            disabled={pendiente}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-40"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmarBorradoId(null)}
                            className="rounded p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                            title="Cancelar"
                            aria-label="Cancelar eliminación"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setEditandoId(evento.id); setCreando(false); setError(null); }}
                            className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                            title="Editar"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmarBorradoId(evento.id)}
                            disabled={pendiente}
                            className="rounded p-1 text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] font-medium text-white/85">{evento.titulo}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-white/55">
                  {evento.tipo_diligencia && <span>{evento.tipo_diligencia}</span>}
                  {evento.responsable && <span>· {evento.responsable}</span>}
                  {evento.resultado && <span>· {evento.resultado}</span>}
                </p>

                {editable && evento.estado === "PENDIENTE" && (
                  cerrandoId === evento.id ? (
                    <CierreDiligencia
                      guardando={pendiente}
                      onCerrar={(estado, resultado) => cerrar(evento.id, estado, resultado)}
                      onCancelar={() => setCerrandoId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCerrandoId(evento.id)}
                      className={cn(
                        "mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        evento.vencidaSinCerrar
                          ? "bg-red-500/15 text-red-200 hover:bg-red-500/25"
                          : "text-white/45 hover:bg-white/[0.08] hover:text-white/80"
                      )}
                    >
                      <Check className="h-3 w-3" /> Registrar qué pasó
                    </button>
                  )
                )}

                {editable && evento.estado !== "PENDIENTE" && (
                  <button
                    type="button"
                    onClick={() => cerrar(evento.id, "PENDIENTE")}
                    disabled={pendiente}
                    className="mt-1.5 text-[10px] text-white/35 transition-colors hover:text-white/70 disabled:opacity-40"
                  >
                    Reabrir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (creando ? (
        <FormularioDiligencia
          key={`${borradorInicial.fecha}|${borradorInicial.titulo}`}
          inicial={borradorInicial}
          responsables={responsables}
          feriados={feriadosSet}
          guardando={pendiente}
          onGuardar={crear}
          onCancelar={() => { setCreando(false); setError(null); }}
        />
      ) : (
        <button
          type="button"
          onClick={() => abrirAlta()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-white/80 transition-colors hover:border-brand-400/30 hover:bg-brand-500/[0.1] hover:text-white"
        >
          <CalendarPlus className="h-3.5 w-3.5 text-brand-300" />
          Agregar diligencia
        </button>
      ))}

      {error && (
        <p className="flex items-center gap-1.5 text-[11px] text-red-300">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}

      {detectadasPendientes.length > 0 && (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setVerDetectadas((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-white/55 transition-colors hover:text-white/80"
          >
            <TrianguloDesplegable abierto={verDetectadas} />
            {detectadasPendientes.length} fecha{detectadasPendientes.length === 1 ? "" : "s"} detectada{detectadasPendientes.length === 1 ? "" : "s"} en el texto del expediente
          </button>
          {verDetectadas && (
            <ul className="space-y-1.5 border-t border-white/[0.06] p-3">
              {detectadasPendientes.map((d) => {
                const dias = diasHasta(d.fechaISO, hoy);
                const clases = CLASES_URGENCIA[nivelUrgencia(dias)];
                return (
                  <li key={d.fechaISO} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", clases.punto)} />
                      <span className={cn("text-[11px] font-semibold tabular-nums", clases.texto)}>{formatearFechaCorta(d.fechaISO)}</span>
                      {d.hora && <span className="text-[11px] text-white/70">{d.hora} h</span>}
                      <span className="text-[11px] text-white/45">· {textoDias(dias)}</span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => abrirAlta({ ...BORRADOR_VACIO, fecha: d.fechaISO, hora: d.hora ?? "", titulo: d.texto.slice(0, 240) })}
                          className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-brand-300 transition-colors hover:bg-brand-500/10 hover:text-brand-200"
                        >
                          Registrar
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/55">{d.texto}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Cierre de una diligencia ────────────────────────────────────────────────

export function CierreDiligencia({
  guardando,
  onCerrar,
  onCancelar,
}: {
  guardando: boolean;
  onCerrar: (estado: EstadoDiligencia, resultado?: string) => void;
  onCancelar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoDiligencia>("REALIZADA");
  const [resultado, setResultado] = useState("");

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/[0.1] bg-white/[0.03] p-2.5">
      <div className="flex flex-wrap gap-1">
        {CIERRES.map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => setEstado(opcion)}
            className={cn(
              "rounded px-2 py-1 text-[10px] font-medium transition-colors",
              estado === opcion ? CLASES_ESTADO[opcion] : "text-white/45 hover:bg-white/[0.08] hover:text-white/80"
            )}
          >
            {ESTADOS_DILIGENCIA[opcion]}
          </button>
        ))}
      </div>
      <input
        value={resultado}
        maxLength={500}
        onChange={(e) => setResultado(e.target.value)}
        placeholder="Qué pasó (opcional): resultado, nueva fecha, motivo…"
        className="view-control h-8"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={guardando}
          onClick={() => onCerrar(estado, resultado || undefined)}
          className="glass-btn-primary px-2.5 py-1 text-[10px] disabled:opacity-50"
        >
          {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Cerrar diligencia
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Formulario reutilizable (alta y edición) ────────────────────────────────

export function FormularioDiligencia({
  inicial,
  responsables,
  feriados,
  guardando,
  onGuardar,
  onCancelar,
}: {
  inicial: BorradorDiligencia;
  responsables: ResponsableOpcion[];
  feriados: ReadonlySet<string>;
  guardando: boolean;
  onGuardar: (b: BorradorDiligencia) => void;
  onCancelar: () => void;
}) {
  const [b, setB] = useState<BorradorDiligencia>(inicial);
  const set = <K extends keyof BorradorDiligencia>(k: K, v: BorradorDiligencia[K]) =>
    setB((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onGuardar(b); }}
      className="space-y-2.5 rounded-xl border border-brand-400/20 bg-brand-500/[0.06] p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/60">Fecha *</span>
          <input type="date" required value={b.fecha} onChange={(e) => set("fecha", e.target.value)} className="view-control h-8" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/60">Hora</span>
          <input type="time" value={b.hora} onChange={(e) => set("hora", e.target.value)} className="view-control h-8" />
        </label>
      </div>

      <CalculadoraPlazo feriados={feriados} onFecha={(fecha) => set("fecha", fecha)} />

      {b.fecha && <AvisoDiaNoHabil fecha={b.fecha} feriados={feriados} />}

      <label className="block">
        <span className="mb-1 block text-[10px] font-medium text-white/60">Tipo de diligencia</span>
        <input
          list="tipos-diligencia"
          value={b.tipo_diligencia}
          maxLength={120}
          onChange={(e) => set("tipo_diligencia", e.target.value)}
          placeholder="Audiencia, vencimiento de plazo…"
          className="view-control h-8"
        />
        <datalist id="tipos-diligencia">
          {TIPOS_DILIGENCIA.map((t) => <option key={t} value={t} />)}
        </datalist>
      </label>

      <label className="block">
        <span className="mb-1 block text-[10px] font-medium text-white/60">Descripción</span>
        <input
          value={b.titulo}
          maxLength={240}
          onChange={(e) => set("titulo", e.target.value)}
          placeholder="Opcional — se usa el tipo si se deja vacío"
          className="view-control h-8"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/60">Responsable</span>
          <select
            value={b.responsable_id}
            onChange={(e) => set("responsable_id", e.target.value)}
            className="view-control h-8"
          >
            <option value="">Sin asignar</option>
            {responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/60">Avisar con</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={90}
              value={b.dias_aviso}
              onChange={(e) => set("dias_aviso", Number(e.target.value))}
              className="view-control h-8 w-16"
            />
            <span className="text-[10px] text-white/50">días de anticipación</span>
          </div>
        </label>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-white/70">
        <input type="checkbox" checked={b.notificar} onChange={(e) => set("notificar", e.target.checked)} className="h-3.5 w-3.5 rounded border-white/20 bg-white/10" />
        Incluir en alertas y correo diario
      </label>

      <div className="flex items-center gap-2 pt-0.5">
        <button type="submit" disabled={guardando || !b.fecha} className="glass-btn-primary px-3 py-1.5 text-[11px] disabled:opacity-50">
          {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Guardar
        </button>
        <button type="button" onClick={onCancelar} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white">
          <X className="h-3 w-3" /> Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Plazo en días hábiles: hasta ahora la fecha de vencimiento había que
 * calcularla a mano fuera del sistema, contando feriados y fines de semana.
 */
function CalculadoraPlazo({
  feriados,
  onFecha,
}: {
  feriados: ReadonlySet<string>;
  onFecha: (fecha: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [notificacion, setNotificacion] = useState("");
  const [dias, setDias] = useState(5);

  const vencimiento = notificacion ? sumarDiasHabiles(notificacion, dias, feriados) : "";

  if (!abierta) {
    return (
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="text-[10px] font-medium text-brand-300 transition-colors hover:text-brand-200"
      >
        Calcular por plazo en días hábiles
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/60">Notificado el</span>
          <input type="date" value={notificacion} onChange={(e) => setNotificacion(e.target.value)} className="view-control h-8" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-white/60">Días hábiles</span>
          <input type="number" min={0} max={90} value={dias} onChange={(e) => setDias(Number(e.target.value))} className="view-control h-8" />
        </label>
      </div>
      {vencimiento && (
        <p className="text-[11px] text-white/70">
          Vence el <span className="font-semibold text-white">{formatearFechaCorta(vencimiento)}</span>
          <span className="text-white/45"> · sin contar sábados, domingos ni feriados</span>
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!vencimiento}
          onClick={() => { onFecha(vencimiento); setAbierta(false); }}
          className="rounded bg-brand-500/20 px-2 py-1 text-[10px] font-medium text-brand-200 transition-colors hover:bg-brand-500/30 disabled:opacity-40"
        >
          Usar esta fecha
        </button>
        <button
          type="button"
          onClick={() => setAbierta(false)}
          className="rounded px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

/** Avisa si la fecha elegida cae en día no hábil: casi siempre es un error de cómputo. */
function AvisoDiaNoHabil({ fecha, feriados }: { fecha: string; feriados: ReadonlySet<string> }) {
  const feriado = nombreFeriado(fecha);
  const esExtraordinario = feriados.has(fecha);
  const habiles = diasHabilesHasta(fecha, fecha);
  if (habiles === null) return null;
  if (!feriado && !esExtraordinario) {
    const [anio, mes, dia] = fecha.split("-").map(Number);
    const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) return null;
    return <p className="text-[10px] text-amber-300/90">Esa fecha cae en fin de semana.</p>;
  }
  return (
    <p className="text-[10px] text-amber-300/90">
      Esa fecha es feriado{feriado ? `: ${feriado}` : ""}.
    </p>
  );
}
