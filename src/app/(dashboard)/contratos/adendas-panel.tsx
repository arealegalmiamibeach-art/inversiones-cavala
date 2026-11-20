"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CornerDownRight, FilePlus2, Loader2, ScrollText, Trash2, X } from "lucide-react";
import { EntityFileBlocks } from "@/components/ui/file-preview";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import { crearAdenda, eliminarAdenda } from "@/lib/actions/contratos";
import { CLASE_LABEL, type ClaseAdenda } from "@/lib/contratos/adendas";
import { calcularVigencia } from "@/lib/contratos/vigencia";
import { cn } from "@/lib/utils";

export type AdendaResumen = {
  id: string;
  nombre: string;
  clase: ClaseAdenda;
  creadaEnApp: boolean;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
  monto: number | null;
  moneda: string | null;
  adjuntos: number;
};

function formatFecha(fecha: string | null) {
  return fecha
    ? new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : null;
}

function formatMonto(monto: number | null, moneda: string | null) {
  if (!monto) return null;
  return `${moneda === "USD" ? "$ " : "S/ "}${Number(monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
}

export function ClaseBadge({ clase }: { clase: ClaseAdenda }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        clase === "resolucion" ? "bg-rose-500/15 text-rose-200" : "bg-indigo-500/15 text-indigo-200"
      )}
    >
      {CLASE_LABEL[clase]}
    </span>
  );
}

/**
 * Sección "Adendas y resoluciones" de un contrato: árbol de documentos hijos
 * con sus archivos, y el alta de nuevos. Se usa igual en el panel lateral de
 * la tabla y en la ficha `/contratos/[id]`.
 *
 * Es una sección apilada más (no una pestaña) con su propio encabezado
 * plegable — mismo patrón que las categorías desplegables de Propietarios.
 * Empieza abierta sólo si ya tiene adendas; si no, queda colapsada para no
 * ocupar espacio en los contratos que nunca tienen (la mayoría).
 */
export function AdendasPanel({
  contratoId,
  contratoNombre,
  adendas,
  padre,
}: {
  contratoId: string;
  contratoNombre: string;
  adendas: AdendaResumen[];
  padre?: { id: string; nombre: string } | null;
}) {
  const router = useRouter();
  const rol = useAcceso("contrato");
  const editable = puedeEscribir(rol);
  const [seccionAbierta, setSeccionAbierta] = useState(adendas.length > 0);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState<{ clase: ClaseAdenda; nombre: string } | null>(null);
  // Como el resto de bajas del panel: primero se confirma, después se borra.
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciarGuardado] = useTransition();

  function abrirFormulario(clase: ClaseAdenda) {
    setError(null);
    setNueva({ clase, nombre: `${CLASE_LABEL[clase]}: ${contratoNombre}`.slice(0, 240) });
  }

  function confirmar() {
    if (!nueva) return;
    const datos = nueva;
    setError(null);
    iniciarGuardado(async () => {
      const resultado = await crearAdenda({ padreId: contratoId, clase: datos.clase, nombre: datos.nombre });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setNueva(null);
      setAbierta(resultado.id);
      router.refresh();
    });
  }

  function borrar(adendaId: string) {
    setError(null);
    setConfirmarBorrado(null);
    iniciarGuardado(async () => {
      const resultado = await eliminarAdenda(adendaId);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      if (abierta === adendaId) setAbierta(null);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/10">
      <button
        type="button"
        onClick={() => setSeccionAbierta((a) => !a)}
        aria-expanded={seccionAbierta}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.035]"
      >
        <ScrollText className="h-4 w-4 shrink-0 text-white/45" />
        <span className="flex-1 truncate text-[12.5px] font-semibold text-white/85">Adendas y resoluciones</span>
        <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-white/55">{adendas.length}</span>
        <TrianguloDesplegable abierto={seccionAbierta} className="text-white/40" />
      </button>

      {seccionAbierta && (
        <div className="space-y-3 border-t border-white/[0.06] p-3">
          {padre && (
            <Link
              href={`/contratos/${padre.id}`}
              className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-white/70 transition-colors hover:border-brand-400/25 hover:text-white"
            >
              <CornerDownRight className="h-3.5 w-3.5 rotate-180 text-brand-300" />
              Este documento es una adenda de <span className="font-medium text-white/90">{padre.nombre}</span>
            </Link>
          )}

          {adendas.length === 0 ? (
            <div className="glass-empty rounded-xl border-white/[0.08] py-8">
              <ScrollText className="h-6 w-6 text-white/25" />
              <p className="mt-2 text-[12px] text-white/60">Este contrato no tiene adendas ni resoluciones registradas.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {adendas.map((adenda) => {
                const expandida = abierta === adenda.id;
                const { estado, seguimiento } = calcularVigencia(adenda.fecha_vencimiento);
                return (
                  <li key={adenda.id} className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
                    <div className="flex items-center gap-2 px-2.5 py-2">
                      <button
                        type="button"
                        onClick={() => setAbierta(expandida ? null : adenda.id)}
                        aria-expanded={expandida}
                        className="group/adenda flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <TrianguloDesplegable abierto={expandida} className="text-white/45 transition-colors group-hover/adenda:text-white" />
                        <ClaseBadge clase={adenda.clase} />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90 transition-colors group-hover/adenda:text-white">{adenda.nombre}</span>
                        {adenda.adjuntos > 0 && (
                          <span className="shrink-0 text-[10px] text-white/50">{adenda.adjuntos} adj.</span>
                        )}
                      </button>
                      <Link
                        href={`/contratos/${adenda.id}`}
                        className="shrink-0 text-[10px] font-medium text-brand-300 hover:text-brand-200"
                      >
                        Ficha →
                      </Link>
                    </div>

                    {expandida && (
                      <div className="space-y-3 border-t border-white/[0.06] px-3 py-3">
                        <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                          <Dato label="Inicio" valor={formatFecha(adenda.fecha_inicio)} />
                          <Dato label="Vencimiento" valor={formatFecha(adenda.fecha_vencimiento)} />
                          <Dato label="Monto" valor={formatMonto(adenda.monto, adenda.moneda)} />
                          <Dato
                            label="Seguimiento"
                            valor={estado === "sin_fecha" ? null : seguimiento}
                            alerta={estado === "vencido"}
                          />
                        </dl>

                        <EntityFileBlocks
                          entidadTipo="contrato"
                          entidadId={adenda.id}
                          permitirSubida={editable}
                          vacioMensaje="Sube aquí el PDF de esta adenda"
                          permitirCarpetas
                        />

                        {editable && adenda.creadaEnApp && (
                          confirmarBorrado === adenda.id ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/[0.08] px-2.5 py-1.5">
                              <span className="text-[10px] font-medium text-red-200">
                                ¿Enviar esta {CLASE_LABEL[adenda.clase].toLocaleLowerCase("es-PE")} a la papelera?
                              </span>
                              <button
                                type="button"
                                onClick={() => borrar(adenda.id)}
                                disabled={guardando}
                                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold text-red-100 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                              >
                                {guardando && <Loader2 className="h-3 w-3 animate-spin" />} Sí, eliminar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmarBorrado(null)}
                                disabled={guardando}
                                aria-label="Cancelar eliminación"
                                className="flex h-5 w-5 items-center justify-center rounded text-white/55 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmarBorrado(adenda.id)}
                              disabled={guardando}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/[0.08] px-2.5 py-1.5 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" /> Eliminar
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {editable && (
            nueva ? (
              <div className="space-y-2 rounded-xl border border-brand-400/20 bg-brand-500/[0.06] p-3">
                <label className="block text-[11px] font-medium text-white/75">
                  Nombre de la {CLASE_LABEL[nueva.clase].toLocaleLowerCase("es-PE")}
                </label>
                <input
                  autoFocus
                  value={nueva.nombre}
                  maxLength={240}
                  onChange={(evento) => setNueva({ ...nueva, nombre: evento.target.value })}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter") confirmar();
                    if (evento.key === "Escape") {
                      // Escape cancela sólo este formulario, no el panel lateral entero.
                      evento.preventDefault();
                      setNueva(null);
                    }
                  }}
                  className="view-control h-9 w-full"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={confirmar}
                    disabled={guardando || nueva.nombre.trim().length === 0}
                    className="glass-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] disabled:opacity-50"
                  >
                    {guardando && <Loader2 className="h-3 w-3 animate-spin" />} Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => setNueva(null)}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.06] hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <BotonAlta onClick={() => abrirFormulario("adenda")}>+ Agregar adenda</BotonAlta>
                <BotonAlta onClick={() => abrirFormulario("resolucion")}>+ Agregar resolución</BotonAlta>
              </div>
            )
          )}

          {error && (
            <p className="flex items-center gap-1.5 text-[11px] text-red-300">
              <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BotonAlta({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-white/80 transition-colors hover:border-brand-400/30 hover:bg-brand-500/[0.1] hover:text-white"
    >
      <FilePlus2 className="h-3.5 w-3.5 text-brand-300" />
      {children}
    </button>
  );
}

function Dato({ label, valor, alerta = false }: { label: string; valor: string | null; alerta?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] text-white/50">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", alerta ? "text-amber-300" : "text-white/85")}>{valor ?? "—"}</dd>
    </div>
  );
}
