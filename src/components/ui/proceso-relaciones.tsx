"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Car, Check, Link2, Loader2, MapPin, Plus, Search, Unlink, Users, X, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import { desvincularProceso, vincularProceso, type TipoRelacionProceso } from "@/lib/actions/vinculos";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import { cn } from "@/lib/utils";

type OpcionRelacion = {
  id: string;
  nombre: string;
  detalle: string;
};

type ConfigRelacion = {
  singular: string;
  plural: string;
  tabla: string;
  campoNombre: string;
  select: string;
  href: string;
  Icono: LucideIcon;
  mapear: (fila: Record<string, unknown>) => OpcionRelacion;
};

const CONFIG: Record<TipoRelacionProceso, ConfigRelacion> = {
  propietario: {
    singular: "propietario",
    plural: "Propietarios",
    tabla: "propietarios",
    campoNombre: "nombre",
    select: "id, nombre, tipo_persona, es_propio",
    href: "/entidades/propietarios",
    Icono: Users,
    mapear: (fila) => ({
      id: String(fila.id),
      nombre: String(fila.nombre || "Sin nombre"),
      detalle: [
        // Un tipo agregado desde "Editar propiedad" se ve con su nombre guardado.
        fila.tipo_persona === "natural" ? "Persona natural" : fila.tipo_persona === "juridica" ? "Persona jurídica" : typeof fila.tipo_persona === "string" && fila.tipo_persona.trim() ? fila.tipo_persona.trim() : null,
        fila.es_propio === true ? "Propio" : fila.es_propio === false ? "Tercero" : null,
      ].filter(Boolean).join(" · "),
    }),
  },
  predio: {
    singular: "predio",
    plural: "Predios",
    tabla: "predios",
    campoNombre: "nombre",
    select: "id, nombre, n_partida, ubicacion",
    href: "/entidades/predios",
    Icono: MapPin,
    mapear: (fila) => ({
      id: String(fila.id),
      nombre: String(fila.nombre || "Sin nombre"),
      detalle: [fila.n_partida && `Partida ${fila.n_partida}`, fila.ubicacion].filter(Boolean).join(" · "),
    }),
  },
  vehiculo: {
    singular: "vehículo",
    plural: "Vehículos",
    tabla: "vehiculos",
    campoNombre: "placa",
    select: "id, placa, marca_modelo, categoria",
    href: "/entidades/vehiculos",
    Icono: Car,
    mapear: (fila) => ({
      id: String(fila.id),
      nombre: String(fila.placa || "Sin placa"),
      detalle: [fila.marca_modelo, fila.categoria].filter(Boolean).join(" · "),
    }),
  },
};

export const TIPOS_RELACION_PROCESO = ["propietario", "predio", "vehiculo"] as const;

export function relacionesProcesoPorTipo(relaciones: EntidadRelacion[], tipo: TipoRelacionProceso) {
  const unicas = new Map<string, EntidadRelacion>();
  for (const relacion of relaciones) {
    if (relacion.entidadTipo === tipo && !unicas.has(relacion.entidadId)) {
      unicas.set(relacion.entidadId, relacion);
    }
  }
  return Array.from(unicas.values());
}

/**
 * Propiedad de relación reutilizada en tabla, panel lateral y ficha. El botón
 * abre un selector global para que no quede recortado por el scroll de tabla.
 */
export function RelacionProcesoField({
  procesoId,
  tipo,
  relaciones,
  compacta = false,
}: {
  procesoId: string;
  tipo: TipoRelacionProceso;
  relaciones: EntidadRelacion[];
  compacta?: boolean;
}) {
  const router = useRouter();
  const rol = useAcceso("proceso");
  const editable = puedeEscribir(rol);
  const config = CONFIG[tipo];
  const [items, setItems] = useState(relaciones);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciarTransicion] = useTransition();

  useEffect(() => setItems(relaciones), [relaciones]);

  function quitar(evento: React.MouseEvent, relacion: EntidadRelacion) {
    evento.preventDefault();
    evento.stopPropagation();
    setError("");
    setQuitando(relacion.entidadId);
    iniciarTransicion(async () => {
      const resultado = await desvincularProceso(procesoId, tipo, relacion.entidadId);
      setQuitando(null);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setItems((actuales) => actuales.filter((item) => item.entidadId !== relacion.entidadId));
      // El panel "Archivos del expediente" del sheet lateral carga sus
      // categorías una sola vez; este aviso lo hace releerlas (igual que
      // `relacion-field.tsx` en contratos). Sin él, Propietarios/Predios/
      // Vehículos quedaban desfasados hasta cerrar y reabrir el panel.
      window.dispatchEvent(new Event("registros-actualizados"));
      router.refresh();
    });
  }

  const visibles = compacta ? items.slice(0, 2) : items;

  return (
    <div role="presentation" className="min-w-0" onClick={(evento) => evento.stopPropagation()} onKeyDown={(evento) => evento.stopPropagation()}>
      <div className={cn("flex min-w-[150px] flex-wrap items-center gap-1.5", compacta && "max-w-[260px]") }>
        {visibles.map((relacion) => (
          <span
            key={`${relacion.entidadTipo}:${relacion.entidadId}`}
            className="group/relation inline-flex max-w-[210px] items-center rounded-md border border-brand-400/20 bg-brand-500/10 text-[11px] font-medium text-brand-100 transition-colors hover:border-brand-400/35 hover:bg-brand-500/15"
          >
            <Link
              href={relacion.href}
              title={relacion.entidadNombre}
              className="flex min-w-0 items-center gap-1 py-1 pl-2"
            >
              <Link2 className="h-3 w-3 shrink-0 text-brand-300" />
              <span className="truncate">{relacion.entidadNombre}</span>
            </Link>
            {editable && (
              <button
                type="button"
                onClick={(evento) => quitar(evento, relacion)}
                disabled={pendiente && quitando === relacion.entidadId}
                title={`Desvincular ${config.singular}`}
                aria-label={`Desvincular ${relacion.entidadNombre}`}
                className="mx-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/45 opacity-0 transition-all hover:bg-white/10 hover:text-white group-hover/relation:opacity-100 focus:opacity-100 disabled:opacity-60"
              >
                {quitando === relacion.entidadId ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
              </button>
            )}
          </span>
        ))}
        {compacta && items.length > visibles.length && (
          <span className="rounded-md bg-white/[0.07] px-1.5 py-1 text-[10px] text-white/65">+{items.length - visibles.length}</span>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => { setError(""); setSelectorAbierto(true); }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-dashed border-white/20 px-2 py-1 text-[11px] text-white/60 transition-colors hover:border-brand-400/40 hover:bg-brand-500/10 hover:text-brand-100",
              compacta && items.length > 0 && "h-6 w-6 justify-center p-0"
            )}
            title={`Vincular ${config.singular}`}
          >
            <Plus className="h-3 w-3" />
            {(!compacta || items.length === 0) && <span>{items.length === 0 ? `Vincular ${config.singular}` : "Vincular otro"}</span>}
          </button>
        )}
        {!editable && items.length === 0 && <span className="text-[12px] text-white/45">—</span>}
      </div>
      {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}

      {selectorAbierto && (
        <SelectorRelacion
          procesoId={procesoId}
          tipo={tipo}
          vinculados={items}
          onClose={() => setSelectorAbierto(false)}
          onVinculado={(opcion) => {
            setItems((actuales) => actuales.some((item) => item.entidadId === opcion.id)
              ? actuales
              : [...actuales, {
                  id: `proceso:${procesoId}:${tipo}:${opcion.id}`,
                  rol: null,
                  rolLabel: config.singular,
                  entidadTipo: tipo,
                  entidadTipoLabel: config.singular,
                  entidadId: opcion.id,
                  entidadNombre: opcion.nombre,
                  href: `${config.href}/${opcion.id}`,
                }]);
            window.dispatchEvent(new Event("registros-actualizados"));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

export function ProcesoRelacionesPanel({
  procesoId,
  relaciones,
}: {
  procesoId: string;
  relaciones: EntidadRelacion[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {TIPOS_RELACION_PROCESO.map((tipo) => {
        const config = CONFIG[tipo];
        const Icono = config.Icono;
        const items = relacionesProcesoPorTipo(relaciones, tipo);
        return (
          <div key={tipo} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <Icono className="h-4 w-4 text-brand-300" />
              <span className="text-xs font-semibold text-white/80">{config.plural}</span>
              <span className="ml-auto rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/55">{items.length}</span>
            </div>
            <RelacionProcesoField procesoId={procesoId} tipo={tipo} relaciones={items} />
          </div>
        );
      })}
    </div>
  );
}

function SelectorRelacion({
  procesoId,
  tipo,
  vinculados,
  onClose,
  onVinculado,
}: {
  procesoId: string;
  tipo: TipoRelacionProceso;
  vinculados: EntidadRelacion[];
  onClose: () => void;
  onVinculado: (opcion: OpcionRelacion) => void;
}) {
  const config = CONFIG[tipo];
  const Icono = config.Icono;
  const [opciones, setOpciones] = useState<OpcionRelacion[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    function cerrarConEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") onClose();
    }
    document.addEventListener("keydown", cerrarConEscape);
    return () => document.removeEventListener("keydown", cerrarConEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelado = false;
    const supabase = createClient();
    supabase
      .from(config.tabla)
      .select(config.select)
      .order(config.campoNombre)
      .limit(1000)
      .then(({ data, error: errorCarga }) => {
        if (cancelado) return;
        if (errorCarga) {
          setError("No se pudieron cargar los registros disponibles.");
          setOpciones([]);
          return;
        }
        setOpciones(((data ?? []) as unknown as Record<string, unknown>[]).map(config.mapear));
      });
    return () => { cancelado = true; };
  }, [config]);

  const idsVinculados = useMemo(() => new Set(vinculados.map((item) => item.entidadId)), [vinculados]);
  const filtradas = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es-PE");
    return (opciones ?? []).filter((opcion) =>
      !idsVinculados.has(opcion.id) && (!q || `${opcion.nombre} ${opcion.detalle}`.toLocaleLowerCase("es-PE").includes(q))
    );
  }, [idsVinculados, opciones, query]);

  async function seleccionar(opcion: OpcionRelacion) {
    setError("");
    setGuardando(opcion.id);
    const resultado = await vincularProceso(procesoId, tipo, opcion.id);
    setGuardando(null);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    onVinculado(opcion);
    onClose();
  }

  return createPortal(
    <div data-entity-sheet-portal className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Vincular ${config.singular}`}>
      <button type="button" aria-label="Cerrar selector" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(680px,88vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.13] bg-[#11131d]/95 shadow-[0_30px_100px_rgba(0,0,0,.7)] backdrop-blur-2xl">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-500/10">
            <Icono className="h-4 w-4 text-brand-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white">Vincular {config.singular}</h2>
            <p className="mt-0.5 text-[11px] text-white/50">Selecciona un registro existente para relacionarlo con el proceso.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/55 hover:bg-white/[0.08] hover:text-white" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/[0.07] p-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 focus-within:border-brand-400/35">
            <Search className="h-4 w-4 shrink-0 text-white/35" />
            <input
              autoFocus
              value={query}
              onChange={(evento) => setQuery(evento.target.value)}
              placeholder={`Buscar ${config.plural.toLocaleLowerCase("es-PE")}…`}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />
          </label>
        </div>

        <div className="scrollbar-glass min-h-48 flex-1 overflow-y-auto p-2">
          {opciones === null ? (
            <div className="flex h-40 items-center justify-center gap-2 text-xs text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
          ) : filtradas.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
              <Check className="mb-2 h-6 w-6 text-white/20" />
              <p className="text-xs text-white/55">{query ? "No hay coincidencias." : `No quedan ${config.plural.toLocaleLowerCase("es-PE")} por vincular.`}</p>
            </div>
          ) : (
            filtradas.map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                disabled={guardando !== null}
                onClick={() => seleccionar(opcion)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50"
              >
                <Link2 className="h-4 w-4 shrink-0 text-brand-300/70" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white/90">{opcion.nombre}</span>
                  {opcion.detalle && <span className="mt-0.5 block truncate text-[11px] text-white/45">{opcion.detalle}</span>}
                </span>
                {guardando === opcion.id ? <Loader2 className="h-4 w-4 animate-spin text-brand-300" /> : <Plus className="h-4 w-4 text-white/35" />}
              </button>
            ))
          )}
        </div>
        {error && (
          <div className="flex items-center gap-2 border-t border-red-400/15 bg-red-500/[0.08] px-4 py-2.5 text-[11px] text-red-200">
            <Unlink className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
