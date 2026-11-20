"use client";

import { RelacionField } from "@/components/ui/relacion-field";

import { useRegistroActualizado } from "@/components/ui/use-registro-actualizado";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedSelect, { type DropdownOption } from "@/components/ui/great-ui-animated-select";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import { Activity, AlertTriangle, BadgeCheck, BriefcaseBusiness, CalendarDays, CircleDollarSign, Contact, FileText, Mail, NotebookPen, UserCheck, WalletCards } from "lucide-react";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { useOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import { etiquetaDeOpcion, opcionesDeFiltro } from "@/components/ui/opciones-filtro";
import { MODALIDAD_OPCIONES } from "./opciones";
import { EntityPropertyList, EntityPropertyRow, EntityPropertyValue, EntitySection, EntitySheet } from "@/components/ui/entity-sheet";
import { EditableText } from "@/components/ui/editable-text";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { AccionesRegistro, EliminarRegistro } from "@/components/ui/eliminar-registro";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { cargarCategoriasEntidad, type CategoriaGrupo } from "@/lib/relaciones/agrupar";
import { columnasRelacion, columnasRelacionVacias } from "@/components/ui/columnas-relacion";
import { ENTIDADES, type EntidadRelacion } from "@/lib/relaciones/contratos";
import { AttachmentCount, RecordsTable, type RecordColumn } from "@/components/ui/records-table";
import { BOTON_NUEVO_CLASE, CrearRegistro, NuevoEnGrupo } from "@/components/ui/crear-registro";
import { ExportMenu } from "@/components/ui/export-menu";
import { columnasDesdeTabla, descripcionFiltros } from "@/lib/export/tabla";
import { createClient } from "@/lib/supabase/client";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas, type PropiedadPersonalizada, type PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";
import { useUrlFilter } from "@/components/ui/use-url-filter";
import { diasHastaFechaISO } from "@/lib/utils";
import type { ContratoVigenciaResumen } from "@/lib/relaciones/contratos";
import type { EstadoVigencia } from "@/lib/contratos/vigencia";

type Persona = {
  id: string;
  nombre: string;
  dni: string | null;
  remuneracion: number | null;
  cargo: string | null;
  correo: string | null;
  modalidad: string | null;
  activo: boolean | null;
  contrato_inicio: string | null;
  contrato_fin: string | null;
  firmado: string | null;
};

function formatoRemuneracion(valor: number | string | null | undefined) {
  return valor ? `S/ ${Number(valor).toLocaleString("es-PE", { minimumFractionDigits: 2 })}` : null;
}

const ACTIVO_OPCIONES: OpcionPill[] = [
  { value: "true",  label: "Activo", className: "bg-emerald-500/15 text-emerald-300" },
  { value: "false", label: "Cesado", className: "bg-white/10 text-white/70" },
];

// `firmado` es texto libre: los `value` son los strings exactos que trajo la migración.
const FIRMADO_OPCIONES: OpcionPill[] = [
  { value: "Ambas firmas completas", label: "Firmado",     className: "bg-emerald-500/15 text-emerald-300" },
  { value: "Sin Firmar",             label: "Sin firmar",  className: "bg-amber-500/15 text-amber-300" },
];

const REVALIDAR = "/entidades/personal";

/** Color con el que las modalidades de siempre se ven en el filtro; las nuevas usan el neutro. */
const RELLENO_MODALIDAD: Record<string, string> = { planilla: "#3b82f6", locador: "#8b5cf6" };

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  return diasHastaFechaISO(fecha);
}

const ETIQUETA_VIGENCIA: Record<EstadoVigencia, string> = {
  vigente: "Vigente",
  vencido: "Vencido",
  sin_fecha: "Sin fecha",
};

const BADGE_VIGENCIA: Record<EstadoVigencia, string> = {
  vigente: "bg-emerald-500/15 text-emerald-200",
  vencido: "bg-amber-500/15 text-amber-200",
  sin_fecha: "bg-white/10 text-white/45",
};

function formatFechaCorta(fecha: string | null): string {
  if (!fecha) return "sin fecha";
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Una tarjeta por contrato (nombre + vigencia en vivo), calco de la
 * propiedad "Contratos de Personal" en Notion — pero consolidada: en vez de
 * repartir nombre y estado en columnas separadas (relación + rollup), cada
 * documento es una sola tarjeta con su propio estado.
 */
function ContratoCard({ contrato }: { contrato: ContratoVigenciaResumen }) {
  return (
    <Link
      href={`/contratos/${contrato.id}`}
      onClick={(event) => event.stopPropagation()}
      title={`${formatFechaCorta(contrato.fechaInicio)} – ${formatFechaCorta(contrato.fechaVencimiento)}`}
      className="glass-chip gap-1.5"
    >
      <FileText className="h-3 w-3 shrink-0 text-white/40" />
      <span className="whitespace-nowrap">{contrato.nombre}</span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_VIGENCIA[contrato.estado]}`}>
        {ETIQUETA_VIGENCIA[contrato.estado]}
      </span>
    </Link>
  );
}

function ContratosCards({ contratos }: { contratos: ContratoVigenciaResumen[] }) {
  if (contratos.length === 0) return <span className="text-xs text-white/35">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5 py-0.5">
      {contratos.map((contrato) => <ContratoCard key={contrato.id} contrato={contrato} />)}
    </div>
  );
}

export function PersonalTable({ personal, count, q: qProp, modalidad, activo, adjuntosPorId = {}, contratosPorPersonalId = {}, relacionesPorId = {}, propiedadesIniciales }: { personal: Persona[]; count: number; q?: string; modalidad?: string; activo?: string; adjuntosPorId?: Record<string, number>; contratosPorPersonalId?: Record<string, ContratoVigenciaResumen[]>; relacionesPorId?: Record<string, EntidadRelacion[]>; propiedadesIniciales?: PropiedadesPersonalizadasCargadas }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [q, setQ] = useState(qProp ?? "");
  const [modalidadFiltro, setModalidadFiltro] = useState(modalidad ?? "");
  const [estadoFiltro, setEstadoFiltro] = useState(activo === "si" ? "Activo" : activo === "no" ? "Cesado" : "");
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const { update: updateUrlFilter } = useUrlFilter();

  useEffect(() => setQ(qProp ?? ""), [qProp]);
  useEffect(() => setModalidadFiltro(modalidad ?? ""), [modalidad]);
  useEffect(() => setEstadoFiltro(activo === "si" ? "Activo" : activo === "no" ? "Cesado" : ""), [activo]);

  // El filtro de modalidad sale de las opciones vigentes de la columna, así que
  // lo que se añade, renombra o elimina en "Editar propiedad" se refleja aquí.
  const modalidadOpciones = useOpcionesColumna("personal", "modalidad", MODALIDAD_OPCIONES);
  const modalidadSelectOptions: DropdownOption[] = useMemo(
    () => opcionesDeFiltro(modalidadOpciones, personal.map((persona) => persona.modalidad), "Todas", (valor) => RELLENO_MODALIDAD[valor] ?? "rgba(0,0,0,0.3)"),
    [modalidadOpciones, personal],
  );

  const estadoOptions: DropdownOption[] = useMemo(() => [
    { id: "__all__", label: "Todos", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(0,0,0,0.15)" /></svg> },
    { id: "Activo",  label: "Activo",  icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="#10b981" /></svg> },
    { id: "Cesado",  label: "Cesado",  icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(0,0,0,0.25)" /></svg> },
  ], []);

  const personalFiltrado = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("es-PE");
    return personal.filter((persona) => {
      if (modalidadFiltro && persona.modalidad !== modalidadFiltro) return false;
      if (estadoFiltro) {
        const esActivo = persona.activo === true ? "Activo" : "Cesado";
        if (esActivo !== estadoFiltro) return false;
      }
      if (query) {
        const haystack = `${persona.nombre} ${persona.cargo ?? ""}`.toLocaleLowerCase("es-PE");
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [estadoFiltro, modalidadFiltro, personal, q]);

  const hayFiltros = q.trim() !== "" || modalidadFiltro !== "" || estadoFiltro !== "";

  const slotFiltros = (
    <div className="spotlight-filter-shell flex min-w-0 flex-1 max-w-[580px] items-center">
      <svg width="0" height="0" className="absolute">
        <filter id="blob-toolbar-personal">
          <feGaussianBlur stdDeviation="10" in="SourceGraphic" />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9" result="blob" />
          <feBlend in="SourceGraphic" in2="blob" />
        </filter>
      </svg>
      <div
        className="spotlight-toolbar flex flex-1 items-center gap-3 [&>div]:bg-[#eeeadf] [&>div]:rounded-full [&>div]:backdrop-blur-xl"
        style={{ filter: "url(#blob-toolbar-personal)" }}
        onMouseEnter={() => setSpotlightOpen(true)}
        onMouseLeave={() => { if (!q && !modalidadFiltro && !estadoFiltro) setSpotlightOpen(false); }}
      >
        <motion.div
          layout="size"
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="spotlight-search flex-1 min-w-[150px] z-10 relative overflow-hidden rounded-full"
        >
          <SuggestiveSearch
            value={q}
            onChange={(value) => { setQ(value); updateUrlFilter("q", value, 300); }}
            onFocusChange={(f) => { if (f) setSpotlightOpen(true); }}
            suggestions={["Buscar personal…", "Buscar por cargo…"]}
            effect="typewriter"
            typeDurationMs={600}
            pauseAfterTypeMs={2000}
            className="w-full"
          />
        </motion.div>
        <AnimatePresence>
          {spotlightOpen && (
            <motion.div
              key="filters-group"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 322, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              className="spotlight-filters flex shrink-0 items-center gap-3"
            >
              <div className="shrink-0 relative z-40">
                <AnimatedSelect
                  placeholder="Modalidad"
                  options={modalidadSelectOptions}
                  width={155}
                  triggerHeight={32}
                  itemHeight={34}
                  itemGap={3}
                  value={modalidadFiltro || null}
                  onSelect={(opt) => {
                    const value = opt.id === "__all__" ? "" : opt.id;
                    setModalidadFiltro(value);
                    updateUrlFilter("modalidad", value);
                  }}
                />
              </div>
              <div className="shrink-0 relative z-30">
                <AnimatedSelect
                  placeholder="Estado"
                  options={estadoOptions}
                  width={155}
                  triggerHeight={32}
                  itemHeight={34}
                  itemGap={3}
                  value={estadoFiltro || null}
                  onSelect={(opt) => {
                    const value = opt.id === "__all__" ? "" : opt.id;
                    setEstadoFiltro(value);
                    updateUrlFilter("activo", value === "Activo" ? "si" : value === "Cesado" ? "no" : "");
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const columns: RecordColumn<Persona>[] = [
    {
      id: "nombre",
      label: "Nombre",
      render: (persona) => <InlineEditableText tabla="personal" id={persona.id} campo="nombre" valorInicial={persona.nombre} revalidar={REVALIDAR} className="min-w-[190px] font-medium text-white" onOpen={() => setAbierto(persona.id)} />,
      sortValue: (persona) => persona.nombre,
      filterValue: (persona) => persona.nombre,
      stopRowClick: true,
    },
    // La edición de datos de personal exige administrar esta sección.
    {
      id: "dni",
      label: "DNI",
      render: (persona) => <InlineEditableText tabla="personal" id={persona.id} campo="dni" valorInicial={persona.dni} revalidar={REVALIDAR} />,
      stopRowClick: true,
      sortValue: (persona) => persona.dni,
      filterValue: (persona) => persona.dni,
    },
    {
      id: "cargo",
      label: "Cargo",
      render: (persona) => <InlineEditableText tabla="personal" id={persona.id} campo="cargo" valorInicial={persona.cargo} revalidar={REVALIDAR} placeholder="—" className="text-white/80" />,
      sortValue: (persona) => persona.cargo,
      filterValue: (persona) => persona.cargo,
      stopRowClick: true,
    },
    {
      id: "contratos",
      label: "Contratos de Personal",
      render: (persona) => <RelacionField entidadTipo="personal" entidadId={persona.id} tipo="contrato" relaciones={(relacionesPorId[persona.id] ?? []).filter((r) => r.entidadTipo === "contrato")} />,
      sortValue: (persona) => (contratosPorPersonalId[persona.id] ?? []).length,
      filterValue: (persona) => (contratosPorPersonalId[persona.id] ?? []).map((c) => c.nombre).join(" "),
      tipo: "relacion",
      tipoFijo: true,
      relacionEntidadLabel: ENTIDADES.contrato.label,
      stopRowClick: true,
    },
    {
      id: "modalidad",
      tipo: "seleccion",
      label: "Modalidad",
      render: (persona) => <PropertyPill tabla="personal" id={persona.id} campo="modalidad" valor={persona.modalidad} opciones={MODALIDAD_OPCIONES} revalidar={REVALIDAR} />,
      catalogoOpciones: { tabla: "personal", campo: "modalidad", base: MODALIDAD_OPCIONES },
      sortValue: (persona) => persona.modalidad,
      filterValue: (persona) => persona.modalidad,
      stopRowClick: true,
    },
    {
      id: "remuneracion",
      label: "Remuneración",
      render: (persona) => <InlineEditableText tabla="personal" id={persona.id} campo="remuneracion" valorInicial={persona.remuneracion == null ? "" : String(persona.remuneracion)} revalidar={REVALIDAR} inputType="number" min={0} step="0.01" renderValor={(v) => formatoRemuneracion(Number(v))} />,
      stopRowClick: true,
      sortValue: (persona) => persona.remuneracion,
      filterValue: (persona) => persona.remuneracion,
    },
    {
      id: "activo",
      // Booleano de dos estados (Activo/Cesado): no admite más opciones.
      tipo: "booleano",
      tipoFijo: true,
      label: "Estado",
      render: (persona) => <PropertyPill tabla="personal" id={persona.id} campo="activo" valor={persona.activo} opciones={ACTIVO_OPCIONES} revalidar={REVALIDAR} />,
      sortValue: (persona) => persona.activo,
      filterValue: (persona) => persona.activo ? "Activo" : "Cesado",
      stopRowClick: true,
    },
    {
      id: "contrato_fin",
      label: "Fin de contrato",
      render: (persona) => {
        return (
          <InlineEditableText
            tabla="personal"
            id={persona.id}
            campo="contrato_fin"
            valorInicial={persona.contrato_fin}
            revalidar={REVALIDAR}
            inputType="date"
            placeholder="—"
            renderValor={(valor) => {
              const dias = diasRestantes(valor);
              return <span className={`inline-flex items-center gap-1 text-xs font-medium ${dias !== null && dias <= 30 ? "text-red-300" : "text-white/75"}`}>{dias !== null && dias <= 30 && <AlertTriangle className="h-3 w-3" />}{new Date(valor + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</span>;
            }}
          />
        );
      },
      sortValue: (persona) => persona.contrato_fin ? new Date(persona.contrato_fin) : null,
      filterValue: (persona) => persona.contrato_fin,
      stopRowClick: true,
    },
    {
      id: "correo",
      label: "Correo",
      render: (persona) => <InlineEditableText tabla="personal" id={persona.id} campo="correo" valorInicial={persona.correo} revalidar={REVALIDAR} placeholder="—" className="min-w-[210px] text-xs text-white/75" />,
      sortValue: (persona) => persona.correo,
      filterValue: (persona) => persona.correo,
      stopRowClick: true,
    },
    {
      id: "contrato_inicio",
      label: "Inicio de contrato",
      render: (persona) => <InlineEditableText tabla="personal" id={persona.id} campo="contrato_inicio" valorInicial={persona.contrato_inicio} revalidar={REVALIDAR} inputType="date" placeholder="—" className="whitespace-nowrap text-xs text-white/75" />,
      sortValue: (persona) => persona.contrato_inicio ? new Date(persona.contrato_inicio) : null,
      filterValue: (persona) => persona.contrato_inicio,
      stopRowClick: true,
    },
    {
      id: "firmado",
      tipo: "seleccion",
      label: "Firmado",
      render: (persona) => <PropertyPill tabla="personal" id={persona.id} campo="firmado" valor={persona.firmado} opciones={FIRMADO_OPCIONES} revalidar={REVALIDAR} />,
      catalogoOpciones: { tabla: "personal", campo: "firmado", base: FIRMADO_OPCIONES },
      sortValue: (persona) => persona.firmado,
      filterValue: (persona) => persona.firmado,
      stopRowClick: true,
    },
    ...columnasRelacion<Persona>({ entidadTipo: "personal", relacionesPorId: relacionesPorId, idDe: (persona) => persona.id, excluir: ["personal", "contrato"] }),
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Adjuntos",
      render: (persona) => <AttachmentCount count={adjuntosPorId[persona.id] ?? 0} />,
      sortValue: (persona) => adjuntosPorId[persona.id] ?? 0,
      filterValue: (persona) => adjuntosPorId[persona.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (persona) => (
        <AccionesRegistro
          href={`/entidades/personal/${persona.id}`}
          clave="personal"
          id={persona.id}
          nombre={persona.nombre}
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

  return (
    <>
      <RecordsTable rows={personalFiltrado} columns={columns} entidadTipo="personal" propiedadesIniciales={propiedadesIniciales}
        slotIzquierda={slotFiltros}
        acciones={(filas) => (
          <div className="flex items-center gap-1.5">
            <CrearRegistro clave="personal" className={BOTON_NUEVO_CLASE} />
            <ExportMenu nombre="personal" filtros={descripcionFiltros([["Búsqueda", q], ["Modalidad", etiquetaDeOpcion(modalidadOpciones, modalidadFiltro)], ["Estado", estadoFiltro]])} titulo="Personal — Inversiones Cavala" columnas={columnasDesdeTabla(columns)} filas={filas} />
          </div>
        )} rowKey={(persona) => persona.id} onRowClick={(persona) => setAbierto(persona.id)} storageKey="personal" countLabel={`${personalFiltrado.length} registro${personalFiltrado.length !== 1 ? "s" : ""}${hayFiltros ? ` · filtrado de ${count}` : ""}`} defaultHidden={["correo", "contrato_inicio", "firmado", ...columnasRelacionVacias(relacionesPorId)]} nuevoEnGrupo={(grupo) => <NuevoEnGrupo clave="personal" grupo={grupo} />} />
      <PersonalSheet id={abierto} onClose={() => setAbierto(null)} />
    </>
  );
}

function PersonalSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [persona, setPersona] = useState<Record<string, any> | null>(null);
  useRegistroActualizado("personal", id, setPersona);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [propiedades, setPropiedades] = useState<PropiedadPersonalizada[]>([]);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!id) {
      setPersona(null);
      setCategorias(null);
      setPropiedades([]);
      setValoresPersonalizados({});
      return;
    }
    setPersona(null);
    setCategorias(null);
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase
      .from("personal")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => { if (vigente) setPersona(data); });
    cargarCategoriasEntidad(supabase, "personal", [id]).then((porId) => { if (vigente) setCategorias(porId[id] ?? []); });
    cargarPropiedadesPersonalizadas(supabase, "personal", [id]).then((c) => {
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
    const c = await cargarPropiedadesPersonalizadas(createClient(), "personal", [id]);
    setPropiedades(c.definiciones);
    setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
  }

  return (
    <EntitySheet
      open={id !== null}
      onClose={onClose}
      historial={id ? { tabla: "personal", registroId: id, titulo: persona?.nombre ?? undefined } : undefined}
      titulo={persona?.nombre ?? "Cargando…"}
      tituloEditor={persona ? <EditableText tabla="personal" id={persona.id} campo="nombre" valorInicial={persona.nombre} revalidar={REVALIDAR} appearance="title" placeholder="Nombre" /> : undefined}
      subtitulo={persona?.cargo}
      icono={
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/15">
          <UserCheck className="h-5 w-5 text-emerald-300" />
        </div>
      }
    >
      {!persona ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : (
        <>
          <EntityPropertyList ordenKey="personal" entidadTipo="personal">
            <EntityPropertyRow icon={<WalletCards className="h-3.5 w-3.5" />} label="Modalidad" campo="modalidad">
              <PropertyPill tabla="personal" id={persona.id} campo="modalidad" valor={persona.modalidad} opciones={MODALIDAD_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Activity className="h-3.5 w-3.5" />} label="Estado" campo="activo">
              <PropertyPill tabla="personal" id={persona.id} campo="activo" valor={persona.activo} opciones={ACTIVO_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Firmado" campo="firmado">
              <PropertyPill tabla="personal" id={persona.id} campo="firmado" valor={persona.firmado} opciones={FIRMADO_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<BriefcaseBusiness className="h-3.5 w-3.5" />} label="Cargo" campo="cargo">
              <EditableText tabla="personal" id={persona.id} campo="cargo" valorInicial={persona.cargo} revalidar={REVALIDAR} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Mail className="h-3.5 w-3.5" />} label="Correo" campo="correo">
              <EditableText tabla="personal" id={persona.id} campo="correo" valorInicial={persona.correo} revalidar={REVALIDAR} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Contact className="h-3.5 w-3.5" />} label="DNI" campo="dni">
              <EditableText tabla="personal" id={persona.id} campo="dni" valorInicial={persona.dni} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Remuneración" campo="remuneracion">
              <EditableText tabla="personal" id={persona.id} campo="remuneracion" valorInicial={persona.remuneracion == null ? "" : String(persona.remuneracion)} revalidar={REVALIDAR} inputType="number" min={0} step="0.01" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Inicio de contrato" campo="contrato_inicio">
              <EditableText tabla="personal" id={persona.id} campo="contrato_inicio" valorInicial={persona.contrato_inicio} revalidar={REVALIDAR} inputType="date" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Fin de contrato" campo="contrato_fin">
              <EditableText tabla="personal" id={persona.id} campo="contrato_fin" valorInicial={persona.contrato_fin} revalidar={REVALIDAR} inputType="date" />
            </EntityPropertyRow>
            <FilasPropiedadesPersonalizadas
              entidadTipo="personal"
              entidadId={persona.id}
              propiedades={propiedades}
              valores={valoresPersonalizados}
              onCreada={recargarPropiedades}
            />
          </EntityPropertyList>

          <div>
            <DocumentosYRelaciones
              entidadTipo="personal"
              entidadId={persona.id}
              categorias={categorias}
              titulo="Documentos y relaciones"
              permitirCrearTipo
              vistaLateral
            />
          </div>

          <EntitySection
            icon={<NotebookPen className="h-3.5 w-3.5" />}
            title="Notas y particularidades"
            description="Se guarda solo, sin confirmar."
          >
            <NotionBlockEditor
              tabla="personal"
              id={persona.id}
              campo="extra.notas"
              valorInicial={persona.extra?.notas}
              revalidar={REVALIDAR}
              placeholder="Anota acuerdos, incidencias o pendientes de esta persona…"
            />
          </EntitySection>

          <EliminarRegistro clave="personal" id={persona.id} nombre={persona.nombre} onEliminado={onClose} />

          <Link href={`/entidades/personal/${persona.id}`} className="inline-block text-xs text-brand-300 hover:text-brand-200">
            Ver ficha completa →
          </Link>
        </>
      )}
    </EntitySheet>
  );
}
