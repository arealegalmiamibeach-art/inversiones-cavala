"use client";

import { RelacionField } from "@/components/ui/relacion-field";

import { useRegistroActualizado } from "@/components/ui/use-registro-actualizado";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedSelect, { type DropdownOption } from "@/components/ui/great-ui-animated-select";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import Link from "next/link";
import { AlertTriangle, Archive, CalendarCheck, CalendarClock, Car, FileSignature, FolderArchive, Hash, Shapes, ShieldCheck, UserRound, Wrench } from "lucide-react";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { EntityPropertyList, EntityPropertyRow, EntityPropertyValue, EntitySection, EntitySheet } from "@/components/ui/entity-sheet";
import { EditableText } from "@/components/ui/editable-text";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { AccionesRegistro, EliminarRegistro } from "@/components/ui/eliminar-registro";
import { cargarCategoriasEntidad, type CategoriaGrupo } from "@/lib/relaciones/agrupar";
import { columnasRelacion, columnasRelacionVacias } from "@/components/ui/columnas-relacion";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import { AttachmentCount, RecordsTable, type RecordColumn } from "@/components/ui/records-table";
import { BOTON_NUEVO_CLASE, CrearRegistro, NuevoEnGrupo } from "@/components/ui/crear-registro";
import { ExportMenu } from "@/components/ui/export-menu";
import { columnasDesdeTabla, descripcionFiltros } from "@/lib/export/tabla";
import { createClient } from "@/lib/supabase/client";
import { cn, diasHastaFechaISO } from "@/lib/utils";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import {
  arrendamientoPrincipal,
  arrendatariosUnicos,
  colorSemaforo,
  diasMinimos,
  DIAS_POR_VENCER,
  DIAS_VENCE_PRONTO,
  type Arrendamiento,
} from "@/lib/vehiculos/arrendamientos";
import { ArrendamientosSection, formatFechaArrendamiento } from "./arrendamientos-section";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas, type PropiedadPersonalizada, type PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";

const SI_NO_OPCIONES: OpcionPill[] = [
  { value: "true",  label: "Sí", className: "bg-emerald-500/15 text-emerald-300" },
  { value: "false", label: "No", className: "bg-white/10 text-white/70" },
];

type Vehiculo = {
  id: string;
  placa: string;
  marca_modelo: string | null;
  categoria: string | null;
  responsable: string | null;
  soat_vence: string | null;
  poliza_vence: string | null;
  anio: number | null;
  n_serie: string | null;
  n_partida: string | null;
  revision_tecnica: string | null;
  detalle: string | null;
  archivador_drive: boolean | null;
  archivador_fisico: boolean | null;
};

const CATEGORIA_OPCIONES: OpcionPill[] = [
  { value: "Línea amarilla",  label: "Línea amarilla",  className: "bg-amber-500/15 text-amber-300" },
  { value: "Vehículo pesado", label: "Vehículo pesado", className: "bg-indigo-500/15 text-indigo-300" },
];

const RESPONSABLE_OPCIONES: OpcionPill[] = [
  { value: "cava",   label: "CAVA",   className: "bg-blue-500/15 text-blue-300" },
  { value: "dipier", label: "DIPIER", className: "bg-violet-500/15 text-violet-300" },
  { value: "lcv",    label: "LCV",    className: "bg-emerald-500/15 text-emerald-300" },
];

const TEXTO_SEMAFORO: Record<string, string> = {
  rojo: "text-red-300",
  ambar: "text-amber-300",
  neutro: "text-white/70",
};

const ESTADO_TEXTO: Record<string, string> = {
  vigente: "vigente",
  por_vencer: "por vencer",
  vencido: "vencido",
  sin_fecha: "sin fecha",
};

type Vista = "todos" | "arrendamiento" | "soat" | "poliza" | "revision";

const VISTAS: { id: Vista; label: string; icono: typeof Car }[] = [
  { id: "arrendamiento", label: "Con arrendamiento",      icono: FileSignature },
  { id: "soat",          label: "Vencimiento de SOAT",    icono: ShieldCheck },
  { id: "poliza",        label: "Vencimiento de póliza",  icono: CalendarClock },
  { id: "revision",      label: "Vencimiento de revisión técnica", icono: Wrench },
];

/** Columnas ocultas por defecto en cada vista (la captura de Notion muestra sólo lo pertinente). */
const CAMPOS_DETALLE_OCULTOS = ["anio", "n_serie", "n_partida", "revision_tecnica", "detalle", "archivador_drive", "archivador_fisico"];
const OCULTAS_POR_VISTA: Record<Vista, string[]> = {
  todos:         ["propietarios", "arrendatario", "contrato", "inicio", "termino", "soat", "poliza", ...CAMPOS_DETALLE_OCULTOS],
  arrendamiento: ["categoria", "responsable", "arrendamiento", "vencimientos", "adjuntos", "soat", "poliza", ...CAMPOS_DETALLE_OCULTOS],
  soat:          ["categoria", "propietarios", "arrendatario", "contrato", "inicio", "termino", "vencimientos", "poliza", "adjuntos", ...CAMPOS_DETALLE_OCULTOS],
  poliza:        ["categoria", "propietarios", "arrendatario", "contrato", "inicio", "termino", "vencimientos", "soat", "adjuntos", ...CAMPOS_DETALLE_OCULTOS],
  revision:      ["categoria", "propietarios", "arrendatario", "contrato", "inicio", "termino", "vencimientos", "soat", "poliza", "adjuntos", ...CAMPOS_DETALLE_OCULTOS.filter((c) => c !== "revision_tecnica")],
};

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  return diasHastaFechaISO(fecha);
}

/** Sin `label` muestra sólo los días ("244d" / "vencido"): la celda Vencimientos ya rotula cada fila. */
function VencimientoBadge({ fecha, label }: { fecha: string | null; label?: string }) {
  const dias = diasRestantes(fecha);
  if (dias === null) return null;
  const color = dias <= 15 ? "bg-red-500/15 text-red-300" : dias <= 30 ? "bg-amber-500/15 text-amber-300" : "bg-white/10 text-white/45";
  return (
    <span className={`badge ${color} gap-1`}>
      <AlertTriangle className="h-3 w-3" />
      {label ? `${label} ` : null}{dias <= 0 ? "vencido" : `${dias}d`}
    </span>
  );
}

/**
 * Fila "SOAT" / "Póliza" / "Rev. téc." de la celda Vencimientos: la fecha real, editable ahí
 * mismo, con la insignia de días de siempre. La insignia va dentro de
 * `renderValor` para que se actualice al instante con lo que se acaba de
 * escribir, sin esperar a que la página se revalide.
 */
function FilaVencimiento({ vehiculoId, campo, etiqueta, fecha }: {
  vehiculoId: string;
  campo: "soat_vence" | "poliza_vence" | "revision_tecnica";
  etiqueta: string;
  fecha: string | null;
}) {
  const editable = puedeEscribir(useAcceso("vehiculos"));
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-white/40">{etiqueta}</span>
      <InlineEditableText
        tabla="vehiculos"
        id={vehiculoId}
        campo={campo}
        valorInicial={fecha}
        revalidar="/entidades/vehiculos"
        inputType="date"
        placeholder="—"
        // El `!` pisa el hover de 6% del botón base, casi invisible sobre el fondo oscuro.
        className={cn("text-xs text-white/80", editable && "hover:!bg-white/10 hover:text-white")}
        renderValor={(valor) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {formatFechaArrendamiento(valor)}
            <VencimientoBadge fecha={valor} />
          </span>
        )}
      />
    </div>
  );
}

/** Fecha de SOAT/póliza/revisión técnica con el mismo semáforo que las insignias (roja si venció o vence pronto). */
function FechaVencimiento({ fecha }: { fecha: string | null }) {
  const dias = diasRestantes(fecha);
  if (dias === null) return <span className="text-white/35">—</span>;
  const color = dias <= DIAS_VENCE_PRONTO ? "text-red-300" : dias <= DIAS_POR_VENCER ? "text-amber-300" : "text-white/70";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", color)}>
      {dias <= DIAS_POR_VENCER && <AlertTriangle className="h-3 w-3 shrink-0" />}
      {formatFechaArrendamiento(fecha)}
    </span>
  );
}

/** Término del contrato coloreado: rojo si venció o vence en ≤30 días, ámbar si ≤90. */
function FechaTermino({ arrendamiento }: { arrendamiento: Arrendamiento | null }) {
  if (!arrendamiento) return <span className="text-white/35">—</span>;
  const color = colorSemaforo(arrendamiento);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", TEXTO_SEMAFORO[color])}>
      {color !== "neutro" && <AlertTriangle className="h-3 w-3 shrink-0" />}
      {formatFechaArrendamiento(arrendamiento.fechaFin)}
    </span>
  );
}

function ArrendamientoCelda({ lista }: { lista: Arrendamiento[] }) {
  if (lista.length === 0) return <span className="text-white/35">—</span>;
  const principal = arrendamientoPrincipal(lista);
  return (
    <div className="space-y-1">
      <span className="badge gap-1 bg-emerald-500/15 text-emerald-300">
        <FileSignature className="h-3 w-3" />
        Sí · {lista.length} contrato{lista.length !== 1 ? "s" : ""}
      </span>
      <p className="truncate text-[11px] text-white/60">{principal?.arrendatario ?? "Arrendatario sin dato"}</p>
      <FechaTermino arrendamiento={principal} />
    </div>
  );
}

function textoArrendamiento(lista: Arrendamiento[]): string {
  if (lista.length === 0) return "sin contrato no";
  return [
    "sí con arrendamiento",
    ...lista.map((a) => [a.arrendatario, a.arrendador, a.nombre, ESTADO_TEXTO[a.estadoVigencia]].filter(Boolean).join(" ")),
  ].join(" ");
}

export function VehiculosTable({
  vehiculos,
  count,
  adjuntosPorId = {},
  arrendamientosPorId = {},
  propietariosPorId = {},
  relacionesPorId = {},
  propiedadesIniciales,
}: {
  vehiculos: Vehiculo[];
  count: number;
  adjuntosPorId?: Record<string, number>;
  arrendamientosPorId?: Record<string, Arrendamiento[]>;
  propietariosPorId?: Record<string, { id: string; nombre: string; href: string }[]>;
  relacionesPorId?: Record<string, EntidadRelacion[]>;
  propiedadesIniciales?: PropiedadesPersonalizadasCargadas;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("todos");
  const [busq, setBusq] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [responsableFiltro, setResponsableFiltro] = useState("");
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  const arrendamientosDe = (id: string) => arrendamientosPorId[id] ?? [];

  // Cada vista filtra y reordena en cliente sobre el listado completo ya cargado.
  const filas = useMemo(() => {
    const porFecha = (campo: "soat_vence" | "poliza_vence" | "revision_tecnica") => (a: Vehiculo, b: Vehiculo) => {
      const fa = a[campo], fb = b[campo];
      if (!fa && !fb) return a.placa.localeCompare(b.placa, "es-PE");
      if (!fa) return 1;
      if (!fb) return -1;
      return fa.localeCompare(fb);
    };
    if (vista === "arrendamiento") {
      return vehiculos
        .filter((vehiculo) => (arrendamientosPorId[vehiculo.id] ?? []).length > 0)
        .sort((a, b) => {
          const da = diasMinimos(arrendamientosPorId[a.id]);
          const db = diasMinimos(arrendamientosPorId[b.id]);
          if (da === null && db === null) return a.placa.localeCompare(b.placa, "es-PE");
          if (da === null) return 1;
          if (db === null) return -1;
          return da - db;
        });
    }
    if (vista === "soat")   return [...vehiculos].sort(porFecha("soat_vence"));
    if (vista === "poliza") return [...vehiculos].sort(porFecha("poliza_vence"));
    if (vista === "revision") return [...vehiculos].sort(porFecha("revision_tecnica"));
    return vehiculos;
  }, [arrendamientosPorId, vehiculos, vista]);

  const responsableSelectOptions: DropdownOption[] = useMemo(() => {
    const valores = Array.from(new Set(vehiculos.map((v) => v.responsable).filter(Boolean) as string[])).sort();
    const colorMap: Record<string, string> = { cava: "#3b82f6", dipier: "#8b5cf6", lcv: "#10b981" };
    return [
      { id: "__all__", label: "Todos los responsables", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(255,255,255,0.15)" /></svg> },
      ...valores.map((v) => ({
        id: v,
        label: v.toUpperCase(),
        icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill={colorMap[v.toLowerCase()] ?? "rgba(255,255,255,0.25)"} /></svg>,
      })),
    ];
  }, [vehiculos]);

  const categoriaSelectOptions: DropdownOption[] = useMemo(() => {
    const valores = Array.from(new Set(vehiculos.map((v) => v.categoria).filter(Boolean) as string[])).sort();
    return [
      { id: "__all__", label: "Todas las categorías", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(0,0,0,0.15)" /></svg> },
      ...valores.map((value) => ({
        id: value,
        label: value,
        icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="#f59e0b" /></svg>,
      })),
    ];
  }, [vehiculos]);

  const filasFiltradas = useMemo(() => {
    const query = busq.trim().toLocaleLowerCase("es-PE");
    return filas.filter((v) => {
      if (categoriaFiltro && v.categoria !== categoriaFiltro) return false;
      if (responsableFiltro && v.responsable !== responsableFiltro) return false;
      if (query && !`${v.placa ?? ""} ${v.marca_modelo ?? ""}`.toLocaleLowerCase("es-PE").includes(query)) return false;
      return true;
    });
  }, [filas, busq, categoriaFiltro, responsableFiltro]);

  const slotFiltros = (
    <div className="spotlight-filter-shell flex min-w-0 flex-1 max-w-[580px] items-center">
      <svg width="0" height="0" className="absolute">
        <filter id="blob-toolbar">
          <feGaussianBlur stdDeviation="10" in="SourceGraphic" />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9" result="blob" />
          <feBlend in="SourceGraphic" in2="blob" />
        </filter>
      </svg>
      <div
        className="spotlight-toolbar flex flex-1 items-center gap-3 [&>div]:bg-[#eeeadf] [&>div]:rounded-full [&>div]:backdrop-blur-xl"
        style={{ filter: "url(#blob-toolbar)" }}
        onMouseEnter={() => setSpotlightOpen(true)}
        onMouseLeave={() => { if (!busq && !categoriaFiltro && !responsableFiltro) setSpotlightOpen(false); }}
      >
        <motion.div
          layout="size"
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="spotlight-search flex-1 min-w-[150px] z-10 relative overflow-hidden rounded-full"
        >
          <SuggestiveSearch value={busq} onChange={setBusq}
            onFocusChange={(f) => { if (f) setSpotlightOpen(true); }}
            suggestions={["Buscar por placa…", "Buscar vehículo…"]}
            effect="typewriter" typeDurationMs={600} pauseAfterTypeMs={2000}
            className="w-full" />
        </motion.div>
        <AnimatePresence>
          {spotlightOpen && (
            <motion.div key="filters-group"
              initial={{ width: 0, opacity: 0 }} animate={{ width: 322, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              className="spotlight-filters flex shrink-0 items-center gap-3">
              <div className="shrink-0 relative z-40">
                <AnimatedSelect placeholder="Categoría" options={categoriaSelectOptions}
                  width={155} triggerHeight={32} itemHeight={34} itemGap={3}
                  value={categoriaFiltro || null}
                  onSelect={(opt) => setCategoriaFiltro(opt.id === "__all__" ? "" : opt.id)} />
              </div>
              <div className="shrink-0 relative z-30">
                <AnimatedSelect placeholder="Responsable" options={responsableSelectOptions}
                  width={155} triggerHeight={32} itemHeight={34} itemGap={3}
                  value={responsableFiltro || null}
                  onSelect={(opt) => setResponsableFiltro(opt.id === "__all__" ? "" : opt.id)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const columns: RecordColumn<Vehiculo>[] = [
    {
      id: "placa",
      label: "Placa / Serie",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="placa" valorInicial={vehiculo.placa} revalidar="/entidades/vehiculos" className="min-w-[130px] font-mono font-semibold text-white" onOpen={() => setAbierto(vehiculo.id)} />,
      sortValue: (vehiculo) => vehiculo.placa,
      filterValue: (vehiculo) => vehiculo.placa,
      stopRowClick: true,
    },
    {
      id: "marca_modelo",
      label: "Marca / Modelo",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="marca_modelo" valorInicial={vehiculo.marca_modelo} revalidar="/entidades/vehiculos" placeholder="—" className="min-w-[170px] text-white/85" />,
      sortValue: (vehiculo) => vehiculo.marca_modelo,
      filterValue: (vehiculo) => vehiculo.marca_modelo,
      stopRowClick: true,
    },
    {
      id: "propietarios",
      label: "Propietarios",
      render: (vehiculo) => <RelacionField entidadTipo="vehiculo" entidadId={vehiculo.id} tipo="propietario" relaciones={(relacionesPorId[vehiculo.id] ?? []).filter((r) => r.entidadTipo === "propietario")} />,
      sortValue: (vehiculo) => (propietariosPorId[vehiculo.id] ?? [])[0]?.nombre ?? null,
      filterValue: (vehiculo) => (propietariosPorId[vehiculo.id] ?? []).map((dueno) => dueno.nombre).join(" "),
      tipo: "relacion",
      tipoFijo: true,
      stopRowClick: true,
    },
    {
      id: "categoria",
      tipo: "seleccion",
      label: "Categoría",
      render: (vehiculo) => <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="categoria" valor={vehiculo.categoria} opciones={CATEGORIA_OPCIONES} revalidar="/entidades/vehiculos" />,
      catalogoOpciones: { tabla: "vehiculos", campo: "categoria", base: CATEGORIA_OPCIONES },
      sortValue: (vehiculo) => vehiculo.categoria,
      filterValue: (vehiculo) => vehiculo.categoria,
      stopRowClick: true,
    },
    {
      id: "responsable",
      tipo: "seleccion",
      label: "Responsable",
      render: (vehiculo) => <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="responsable" valor={vehiculo.responsable} opciones={RESPONSABLE_OPCIONES} revalidar="/entidades/vehiculos" />,
      catalogoOpciones: { tabla: "vehiculos", campo: "responsable", base: RESPONSABLE_OPCIONES },
      sortValue: (vehiculo) => vehiculo.responsable,
      filterValue: (vehiculo) => vehiculo.responsable,
      stopRowClick: true,
    },
    {
      id: "arrendamiento",
      label: "Arrendamiento",
      render: (vehiculo) => <ArrendamientoCelda lista={arrendamientosDe(vehiculo.id)} />,
      // Ordena por el contrato más urgente; los que no tienen fecha quedan al final.
      sortValue: (vehiculo) => diasMinimos(arrendamientosPorId[vehiculo.id]),
      filterValue: (vehiculo) => textoArrendamiento(arrendamientosDe(vehiculo.id)),
    },
    {
      id: "arrendatario",
      label: "Arrendatario",
      render: (vehiculo) => {
        const arrendatarios = arrendatariosUnicos(arrendamientosDe(vehiculo.id));
        if (arrendatarios.length === 0) return <span className="text-white/35">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {arrendatarios.map((persona) => (
              <Link key={persona.id} href={persona.href} onClick={(event) => event.stopPropagation()} className="glass-chip">
                {persona.nombre}
              </Link>
            ))}
          </div>
        );
      },
      sortValue: (vehiculo) => arrendamientoPrincipal(arrendamientosPorId[vehiculo.id])?.arrendatario ?? null,
      filterValue: (vehiculo) => arrendamientosDe(vehiculo.id).map((a) => a.arrendatario ?? "").join(" "),
      tipo: "relacion",
      tipoFijo: true,
      stopRowClick: true,
    },
    {
      id: "contrato",
      label: "Contrato",
      render: (vehiculo) => {
        const lista = arrendamientosDe(vehiculo.id);
        if (lista.length === 0) return <span className="text-white/35">—</span>;
        return (
          <div className="flex flex-col gap-0.5">
            {lista.map((a) => (
              <Link key={a.contratoId} href={a.href} className="truncate text-xs text-brand-300 hover:text-brand-200">
                {a.nombre}
              </Link>
            ))}
          </div>
        );
      },
      sortValue: (vehiculo) => arrendamientoPrincipal(arrendamientosPorId[vehiculo.id])?.nombre ?? null,
      filterValue: (vehiculo) => arrendamientosDe(vehiculo.id).map((a) => a.nombre).join(" "),
      tipo: "relacion",
      tipoFijo: true,
      stopRowClick: true,
    },
    {
      id: "inicio",
      label: "Inicio",
      render: (vehiculo) => {
        const principal = arrendamientoPrincipal(arrendamientosPorId[vehiculo.id]);
        return <span className="text-xs text-white/70">{principal ? formatFechaArrendamiento(principal.fechaInicio) : "—"}</span>;
      },
      sortValue: (vehiculo) => arrendamientoPrincipal(arrendamientosPorId[vehiculo.id])?.fechaInicio ?? null,
      filterValue: (vehiculo) => arrendamientosDe(vehiculo.id).map((a) => a.fechaInicio ?? "").join(" "),
    },
    {
      id: "termino",
      label: "Término",
      render: (vehiculo) => <FechaTermino arrendamiento={arrendamientoPrincipal(arrendamientosPorId[vehiculo.id])} />,
      sortValue: (vehiculo) => diasMinimos(arrendamientosPorId[vehiculo.id]),
      filterValue: (vehiculo) => arrendamientosDe(vehiculo.id).map((a) => `${a.fechaFin ?? ""} ${ESTADO_TEXTO[a.estadoVigencia]}`).join(" "),
    },
    {
      id: "vencimientos",
      label: "Vencimientos",
      render: (vehiculo) => (
        <div className="flex flex-col gap-1">
          <FilaVencimiento vehiculoId={vehiculo.id} campo="soat_vence" etiqueta="SOAT" fecha={vehiculo.soat_vence} />
          <FilaVencimiento vehiculoId={vehiculo.id} campo="poliza_vence" etiqueta="Póliza" fecha={vehiculo.poliza_vence} />
          <FilaVencimiento vehiculoId={vehiculo.id} campo="revision_tecnica" etiqueta="Rev. téc." fecha={vehiculo.revision_tecnica} />
        </div>
      ),
      sortValue: (vehiculo) => vehiculo.soat_vence ?? vehiculo.poliza_vence ?? vehiculo.revision_tecnica,
      filterValue: (vehiculo) => [vehiculo.soat_vence, vehiculo.poliza_vence, vehiculo.revision_tecnica].filter(Boolean).join(" "),
      stopRowClick: true,
    },
    {
      id: "soat",
      label: "SOAT vence",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="soat_vence" valorInicial={vehiculo.soat_vence} revalidar="/entidades/vehiculos" inputType="date" placeholder="—" renderValor={(valor) => <FechaVencimiento fecha={valor} />} />,
      sortValue: (vehiculo) => vehiculo.soat_vence,
      filterValue: (vehiculo) => vehiculo.soat_vence,
      stopRowClick: true,
    },
    {
      id: "poliza",
      label: "Póliza vence",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="poliza_vence" valorInicial={vehiculo.poliza_vence} revalidar="/entidades/vehiculos" inputType="date" placeholder="—" renderValor={(valor) => <FechaVencimiento fecha={valor} />} />,
      sortValue: (vehiculo) => vehiculo.poliza_vence,
      filterValue: (vehiculo) => vehiculo.poliza_vence,
      stopRowClick: true,
    },
    {
      id: "anio",
      label: "Año",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="anio" valorInicial={vehiculo.anio == null ? "" : String(vehiculo.anio)} revalidar="/entidades/vehiculos" inputType="number" min={1800} max={2200} step={1} placeholder="—" className="font-mono text-xs text-white/75" />,
      sortValue: (vehiculo) => vehiculo.anio,
      filterValue: (vehiculo) => vehiculo.anio,
      stopRowClick: true,
    },
    {
      id: "n_serie",
      label: "N° de serie",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="n_serie" valorInicial={vehiculo.n_serie} revalidar="/entidades/vehiculos" placeholder="—" className="min-w-[150px] font-mono text-xs text-white/75" />,
      sortValue: (vehiculo) => vehiculo.n_serie,
      filterValue: (vehiculo) => vehiculo.n_serie,
      stopRowClick: true,
    },
    {
      id: "n_partida",
      label: "N° de partida",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="n_partida" valorInicial={vehiculo.n_partida} revalidar="/entidades/vehiculos" placeholder="—" className="min-w-[150px] font-mono text-xs text-white/75" />,
      sortValue: (vehiculo) => vehiculo.n_partida,
      filterValue: (vehiculo) => vehiculo.n_partida,
      stopRowClick: true,
    },
    {
      id: "revision_tecnica",
      label: "Revisión técnica",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="revision_tecnica" valorInicial={vehiculo.revision_tecnica} revalidar="/entidades/vehiculos" inputType="date" placeholder="—" renderValor={(valor) => <FechaVencimiento fecha={valor} />} />,
      sortValue: (vehiculo) => vehiculo.revision_tecnica,
      filterValue: (vehiculo) => vehiculo.revision_tecnica,
      stopRowClick: true,
    },
    {
      id: "detalle",
      label: "Detalle",
      render: (vehiculo) => <InlineEditableText tabla="vehiculos" id={vehiculo.id} campo="detalle" valorInicial={vehiculo.detalle} revalidar="/entidades/vehiculos" placeholder="—" className="min-w-[220px] max-w-[340px] line-clamp-2 text-xs text-white/75" />,
      sortValue: (vehiculo) => vehiculo.detalle,
      filterValue: (vehiculo) => vehiculo.detalle,
      stopRowClick: true,
    },
    {
      id: "archivador_drive",
      // Sí/No: no admite más opciones.
      tipo: "booleano",
      tipoFijo: true,
      label: "Archivador Drive",
      render: (vehiculo) => <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="archivador_drive" valor={vehiculo.archivador_drive} opciones={SI_NO_OPCIONES} revalidar="/entidades/vehiculos" />,
      sortValue: (vehiculo) => vehiculo.archivador_drive,
      filterValue: (vehiculo) => vehiculo.archivador_drive ? "Sí" : "No",
      stopRowClick: true,
    },
    {
      id: "archivador_fisico",
      // Sí/No: no admite más opciones.
      tipo: "booleano",
      tipoFijo: true,
      label: "Archivador físico",
      render: (vehiculo) => <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="archivador_fisico" valor={vehiculo.archivador_fisico} opciones={SI_NO_OPCIONES} revalidar="/entidades/vehiculos" />,
      sortValue: (vehiculo) => vehiculo.archivador_fisico,
      filterValue: (vehiculo) => vehiculo.archivador_fisico ? "Sí" : "No",
      stopRowClick: true,
    },
    ...columnasRelacion<Vehiculo>({ entidadTipo: "vehiculo", relacionesPorId: relacionesPorId, idDe: (vehiculo) => vehiculo.id, excluir: ["vehiculo", "propietario"] }),
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Adjuntos",
      render: (vehiculo) => <AttachmentCount count={adjuntosPorId[vehiculo.id] ?? 0} />,
      sortValue: (vehiculo) => adjuntosPorId[vehiculo.id] ?? 0,
      filterValue: (vehiculo) => adjuntosPorId[vehiculo.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (vehiculo) => (
        <AccionesRegistro
          href={`/entidades/vehiculos/${vehiculo.id}`}
          clave="vehiculos"
          id={vehiculo.id}
          nombre={vehiculo.placa}
          onEliminado={() => setAbierto(null)}
        />
      ),
      className: "sticky right-0 z-[2] border-l border-white/[0.06] bg-[#10121a]/95 text-right backdrop-blur-sm",
      headerClassName: "sticky right-0 z-10 border-l border-white/[0.06] bg-[#151824]/95 text-right backdrop-blur-sm",
      hideable: false,
      reorderable: false,
      stopRowClick: true,
    },
  ];

  const etiquetaVista = VISTAS.find((v) => v.id === vista)?.label ?? "";
  const hayFiltros = busq !== "" || categoriaFiltro !== "" || responsableFiltro !== "";
  const countLabel = vista === "todos"
    ? `${filasFiltradas.length} vehículo${filasFiltradas.length !== 1 ? "s" : ""}${hayFiltros ? ` · filtrado de ${count}` : ""}`
    : `${filasFiltradas.length} de ${count} vehículos · ${etiquetaVista}${hayFiltros ? " · filtrado" : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto scrollbar-glass" aria-label="Vistas rápidas de vehículos">
        {VISTAS.map((item) => {
          const Icono = item.icono;
          const activa = vista === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setVista((actual) => actual === item.id ? "todos" : item.id)}
              aria-pressed={activa}
              title={activa ? "Quitar esta vista rápida" : item.label}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                activa
                  ? "border-brand-400/30 bg-brand-500/15 text-brand-100"
                  : "border-white/[0.1] bg-white/[0.03] text-white/70 hover:bg-white/[0.07] hover:text-white"
              )}
            >
              <Icono className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <RecordsTable
        rows={filasFiltradas}
        columns={columns}
        entidadTipo="vehiculo"
        propiedadesIniciales={propiedadesIniciales}
        slotIzquierda={slotFiltros}
        acciones={(filas) => (
          <div className="flex items-center gap-1.5">
            <CrearRegistro clave="vehiculos" className={BOTON_NUEVO_CLASE} />
            <ExportMenu nombre="vehiculos" filtros={descripcionFiltros([["Búsqueda", busq], ["Categoría", categoriaFiltro], ["Responsable", responsableFiltro]])} titulo="Vehículos — Inversiones Cavala" columnas={columnasDesdeTabla(columns)} filas={filas} />
          </div>
        )}
        rowKey={(vehiculo) => vehiculo.id}
        onRowClick={(vehiculo) => setAbierto(vehiculo.id)}
        storageKey={`vehiculos-${vista}`}
        defaultHidden={[...OCULTAS_POR_VISTA[vista], ...columnasRelacionVacias(relacionesPorId)]}
        countLabel={countLabel}
        nuevoEnGrupo={(grupo) => <NuevoEnGrupo clave="vehiculos" grupo={grupo} />}
      />
      <VehiculoSheet id={abierto} arrendamientos={abierto ? arrendamientosDe(abierto) : []} onClose={() => setAbierto(null)} />
    </>
  );
}

function VehiculoSheet({ id, arrendamientos, onClose }: { id: string | null; arrendamientos: Arrendamiento[]; onClose: () => void }) {
  const [vehiculo, setVehiculo] = useState<Record<string, any> | null>(null);
  useRegistroActualizado("vehiculos", id, setVehiculo);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [propiedades, setPropiedades] = useState<PropiedadPersonalizada[]>([]);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!id) {
      setVehiculo(null);
      setCategorias(null);
      setPropiedades([]);
      setValoresPersonalizados({});
      return;
    }
    setVehiculo(null);
    setCategorias(null);
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase
      .from("vehiculos")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => { if (vigente) setVehiculo(data); });
    cargarCategoriasEntidad(supabase, "vehiculo", [id]).then((porId) => { if (vigente) setCategorias(porId[id] ?? []); });
    cargarPropiedadesPersonalizadas(supabase, "vehiculo", [id]).then((c) => {
      if (!vigente) return;
      setPropiedades(c.definiciones);
      setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
    });
    return () => {
      vigente = false;
    };
  }, [id]);

  async function recargarPropiedades() {
    if (!id) return;
    const c = await cargarPropiedadesPersonalizadas(createClient(), "vehiculo", [id]);
    setPropiedades(c.definiciones);
    setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
  }

  const revalidar = "/entidades/vehiculos";

  return (
    <EntitySheet
      open={id !== null}
      onClose={onClose}
      historial={id ? { tabla: "vehiculos", registroId: id, titulo: vehiculo?.placa ?? undefined } : undefined}
      titulo={vehiculo?.placa ?? "Cargando…"}
      tituloEditor={vehiculo ? <EditableText tabla="vehiculos" id={vehiculo.id} campo="placa" valorInicial={vehiculo.placa} revalidar={revalidar} appearance="title" placeholder="Placa o serie" /> : undefined}
      subtitulo={vehiculo?.marca_modelo}
      icono={
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/15">
          <Car className="h-5 w-5 text-brand-300" />
        </div>
      }
    >
      {!vehiculo ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : (
        <>
          <EntityPropertyList ordenKey="vehiculo" entidadTipo="vehiculo">
            <EntityPropertyRow icon={<Car className="h-3.5 w-3.5" />} label="Marca / Modelo" campo="marca_modelo">
              <EditableText tabla="vehiculos" id={vehiculo.id} campo="marca_modelo" valorInicial={vehiculo.marca_modelo} revalidar={revalidar} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Shapes className="h-3.5 w-3.5" />} label="Categoría" campo="categoria">
              <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="categoria" valor={vehiculo.categoria} opciones={CATEGORIA_OPCIONES} revalidar={revalidar} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<UserRound className="h-3.5 w-3.5" />} label="Responsable" campo="responsable">
              <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="responsable" valor={vehiculo.responsable} opciones={RESPONSABLE_OPCIONES} revalidar={revalidar} />
            </EntityPropertyRow>
            {(vehiculo.soat_vence || vehiculo.poliza_vence || vehiculo.revision_tecnica) && (
              <EntityPropertyRow icon={<CalendarCheck className="h-3.5 w-3.5" />} label="Vencimientos" campo="vencimientos">
                <div className="flex flex-wrap gap-1 py-0.5">
                  <VencimientoBadge fecha={vehiculo.soat_vence} label="SOAT" />
                  <VencimientoBadge fecha={vehiculo.poliza_vence} label="Póliza" />
                  <VencimientoBadge fecha={vehiculo.revision_tecnica} label="Rev. técnica" />
                </div>
              </EntityPropertyRow>
            )}
            <EntityPropertyRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="SOAT vence" campo="soat">
              <EditableText tabla="vehiculos" id={vehiculo.id} campo="soat_vence" valorInicial={vehiculo.soat_vence} revalidar={revalidar} inputType="date" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CalendarClock className="h-3.5 w-3.5" />} label="Póliza vence" campo="poliza">
              <EditableText tabla="vehiculos" id={vehiculo.id} campo="poliza_vence" valorInicial={vehiculo.poliza_vence} revalidar={revalidar} inputType="date" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<FileSignature className="h-3.5 w-3.5" />} label="Arrendamiento" campo="arrendamiento">
              <EntityPropertyValue>
                {arrendamientos.length > 0
                  ? `Sí · ${arrendamientos.length} contrato${arrendamientos.length !== 1 ? "s" : ""}`
                  : "—"}
              </EntityPropertyValue>
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CalendarCheck className="h-3.5 w-3.5" />} label="Año" campo="anio">
              <EditableText tabla="vehiculos" id={vehiculo.id} campo="anio" valorInicial={vehiculo.anio == null ? "" : String(vehiculo.anio)} revalidar={revalidar} inputType="number" min={1800} max={2200} step={1} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="N° de serie" campo="n_serie">
              <EditableText tabla="vehiculos" id={vehiculo.id} campo="n_serie" valorInicial={vehiculo.n_serie} revalidar={revalidar} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="N° de partida" campo="n_partida">
              <EditableText tabla="vehiculos" id={vehiculo.id} campo="n_partida" valorInicial={vehiculo.n_partida} revalidar={revalidar} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Wrench className="h-3.5 w-3.5" />} label="Revisión técnica" campo="revision_tecnica">
              <EditableText tabla="vehiculos" id={vehiculo.id} campo="revision_tecnica" valorInicial={vehiculo.revision_tecnica} revalidar={revalidar} inputType="date" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Archive className="h-3.5 w-3.5" />} label="Archivador Drive" campo="archivador_drive">
              <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="archivador_drive" valor={vehiculo.archivador_drive} opciones={SI_NO_OPCIONES} revalidar={revalidar} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<FolderArchive className="h-3.5 w-3.5" />} label="Archivador físico" campo="archivador_fisico">
              <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="archivador_fisico" valor={vehiculo.archivador_fisico} opciones={SI_NO_OPCIONES} revalidar={revalidar} />
            </EntityPropertyRow>
            <FilasPropiedadesPersonalizadas
              entidadTipo="vehiculo"
              entidadId={vehiculo.id}
              propiedades={propiedades}
              valores={valoresPersonalizados}
              onCreada={recargarPropiedades}
            />
          </EntityPropertyList>

          <div>
            <DocumentosYRelaciones
              entidadTipo="vehiculo"
              entidadId={vehiculo.id}
              categorias={categorias}
              titulo="Documentos y relaciones"
              permitirCrearTipo
              vistaLateral
            />
          </div>

          <EntitySection
            icon={<FileSignature className="h-3.5 w-3.5" />}
            title="Arrendamientos"
            description="Contratos de arrendamiento vinculados a este vehículo."
          >
            <ArrendamientosSection arrendamientos={arrendamientos} />
          </EntitySection>

          <NotionBlockEditor
            tabla="vehiculos"
            id={vehiculo.id}
            campo="detalle"
            valorInicial={vehiculo.detalle}
            revalidar={revalidar}
            placeholder="Sin detalle"
          />

          <EliminarRegistro clave="vehiculos" id={vehiculo.id} nombre={vehiculo.placa} onEliminado={onClose} />

          <Link href={`/entidades/vehiculos/${vehiculo.id}`} className="inline-block text-xs text-brand-300 hover:text-brand-200">
            Ver ficha completa →
          </Link>
        </>
      )}
    </EntitySheet>
  );
}
