"use client";

import { useRegistroActualizado } from "@/components/ui/use-registro-actualizado";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck, Building2, Contact, CreditCard, FileKey2,
  Landmark, MapPin, Tag, User, UserRound,
  type LucideIcon,
} from "lucide-react";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { EntityPropertyList, EntityPropertyRow, EntitySheet } from "@/components/ui/entity-sheet";
import { EditableText } from "@/components/ui/editable-text";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { columnasRelacion, columnasRelacionVacias } from "@/components/ui/columnas-relacion";
import { AttachmentCount, RecordsTable, type RecordColumn } from "@/components/ui/records-table";
import { BOTON_NUEVO_CLASE, CrearRegistro, NuevoEnGrupo } from "@/components/ui/crear-registro";
import { ExportMenu } from "@/components/ui/export-menu";
import { columnasDesdeTabla, descripcionFiltros } from "@/lib/export/tabla";
import { createClient } from "@/lib/supabase/client";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import { cargarCategoriasEntidad, type CategoriaGrupo } from "@/lib/relaciones/agrupar";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { AccionesRegistro, EliminarRegistro } from "@/components/ui/eliminar-registro";
import { etiquetaTipoPropietario, valorTipoPropietario } from "@/lib/propietarios/tipo";
import { opcionesTipoPropietario, type TipoPropietarioCatalogo } from "@/lib/propietarios/tipos-catalogo";
import { EditorTiposPropietario } from "@/components/ui/editor-tipos-propietario";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas, type PropiedadPersonalizada, type PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedSelect, { type DropdownOption } from "@/components/ui/great-ui-animated-select";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import { useUrlFilter } from "@/components/ui/use-url-filter";
import { useOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import { etiquetaDeOpcion, opcionesDeFiltro } from "@/components/ui/opciones-filtro";
import { TIPO_PERSONA_OPCIONES } from "./opciones";

type Propietario = {
  id: string;
  nombre: string;
  es_propio: boolean | null;
  tipo_persona: string | null;
  extra: Record<string, unknown> | null;
};

type DatosEmpresa = Record<string, any>;

/** Color con el que los tipos de persona de siempre se ven en el filtro; los nuevos usan el neutro. */
const RELLENO_TIPO_PERSONA: Record<string, string> = { natural: "#3b82f6", juridica: "#8b5cf6" };

const REVALIDAR = "/entidades/propietarios";


// Propiedades de datos fiscales (viven en `datos_empresas`, no en `propietarios`).
const CAMPOS_EMPRESA: { campo: string; label: string; icon: LucideIcon }[] = [
  { campo: "razon_social",      label: "Razón social",     icon: Building2 },
  { campo: "ruc",                label: "RUC",               icon: Landmark },
  { campo: "dni",                label: "DNI",               icon: Contact },
  { campo: "gerente",            label: "Gerente",           icon: UserRound },
  { campo: "direccion_fiscal",   label: "Dirección fiscal",  icon: MapPin },
  { campo: "partida_registral",  label: "Partida registral", icon: FileKey2 },
  { campo: "cuenta_bancaria",    label: "Cuenta bancaria",   icon: CreditCard },
];


export function PropietariosTable({
  propietarios,
  count,
  q,
  tipo,
  persona,
  adjuntosPorId = {},
  relacionesPorId = {},
  datosEmpresasPorId = {},
  tiposPropietario = [],
  propiedadesIniciales,
}: {
  propietarios: Propietario[];
  count: number;
  q?: string;
  tipo?: string;
  persona?: string;
  adjuntosPorId?: Record<string, number>;
  relacionesPorId?: Record<string, EntidadRelacion[]>;
  datosEmpresasPorId?: Record<string, DatosEmpresa>;
  tiposPropietario?: TipoPropietarioCatalogo[];
  propiedadesIniciales?: PropiedadesPersonalizadasCargadas;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [busq, setBusq] = useState(q ?? "");
  const [tipoFiltro, setTipoFiltro] = useState(
    tipo === "propio" ? "Propio" : tipo === "tercero" ? "Tercero" : tipo ?? ""
  );
  const [personaFiltro, setPersonaFiltro] = useState(persona ?? "");
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const { update: updateUrlFilter } = useUrlFilter();

  useEffect(() => setBusq(q ?? ""), [q]);
  useEffect(() => {
    setTipoFiltro(tipo === "propio" ? "Propio" : tipo === "tercero" ? "Tercero" : tipo ?? "");
  }, [tipo]);
  useEffect(() => setPersonaFiltro(persona ?? ""), [persona]);

  // El filtro de persona sale de las opciones vigentes de la columna, así que
  // lo que se añade, renombra o elimina en "Editar propiedad" se refleja aquí.
  const personaOpciones = useOpcionesColumna("propietarios", "tipo_persona", TIPO_PERSONA_OPCIONES);
  const personaSelectOptions: DropdownOption[] = useMemo(
    () => opcionesDeFiltro(personaOpciones, propietarios.map((p) => p.tipo_persona), "Todas", (valor) => RELLENO_TIPO_PERSONA[valor] ?? "rgba(0,0,0,0.3)"),
    [personaOpciones, propietarios],
  );

  // Propio y Tercero (fijos) + los tipos personalizados del catálogo, con su id y sus usos
  // para editarlos, reordenarlos y eliminarlos desde el propio desplegable.
  const opcionesTipo = useMemo(() => opcionesTipoPropietario(tiposPropietario), [tiposPropietario]);

  const tipoSelectOptions: DropdownOption[] = useMemo(() => [
    { id: "__all__", label: "Todos", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(255,255,255,0.15)" /></svg> },
    { id: "Propio", label: "Propio", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="#6b8afd" /></svg> },
    { id: "Tercero", label: "Tercero", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(255,255,255,0.3)" /></svg> },
    ...tiposPropietario.map((tipo) => tipo.nombre).filter((t) => t !== "Propio" && t !== "Tercero").map((t) => ({
      id: t, label: t,
      icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="#22d3ee" /></svg>,
    })),
  ], [tiposPropietario]);

  const propietariosFiltrados = useMemo(() => {
    const query = busq.trim().toLocaleLowerCase("es-PE");
    return propietarios.filter((p) => {
      if (tipoFiltro && etiquetaTipoPropietario(p) !== tipoFiltro) return false;
      if (personaFiltro && p.tipo_persona !== personaFiltro) return false;
      if (query && !p.nombre.toLocaleLowerCase("es-PE").includes(query)) return false;
      return true;
    });
  }, [propietarios, busq, personaFiltro, tipoFiltro]);

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
        onMouseLeave={() => { if (!busq && !tipoFiltro && !personaFiltro) setSpotlightOpen(false); }}
      >
        <motion.div
          layout="size"
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="spotlight-search flex-1 min-w-[150px] z-10 relative overflow-hidden rounded-full"
        >
          <SuggestiveSearch value={busq} onChange={(value) => { setBusq(value); updateUrlFilter("q", value, 300); }}
            onFocusChange={(f) => { if (f) setSpotlightOpen(true); }}
            suggestions={["Buscar propietario…", "Buscar por nombre…"]}
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
                <AnimatedSelect placeholder="Tipo" options={tipoSelectOptions}
                  width={155} triggerHeight={32} itemHeight={34} itemGap={3}
                  value={tipoFiltro || null}
                  onSelect={(opt) => {
                    const value = opt.id === "__all__" ? "" : opt.id;
                    setTipoFiltro(value);
                    updateUrlFilter("tipo", value === "Propio" ? "propio" : value === "Tercero" ? "tercero" : value);
                  }} />
              </div>
              <div className="shrink-0 relative z-30">
                <AnimatedSelect placeholder="Persona" options={personaSelectOptions}
                  width={155} triggerHeight={32} itemHeight={34} itemGap={3}
                  value={personaFiltro || null}
                  onSelect={(opt) => {
                    const value = opt.id === "__all__" ? "" : opt.id;
                    setPersonaFiltro(value);
                    updateUrlFilter("persona", value);
                  }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const columns: RecordColumn<Propietario>[] = [
    {
      id: "nombre",
      label: "Nombre",
      render: (propietario) => <InlineEditableText tabla="propietarios" id={propietario.id} campo="nombre" valorInicial={propietario.nombre} revalidar={REVALIDAR} className="min-w-[190px] font-medium text-white" onOpen={() => setAbierto(propietario.id)} />,
      sortValue: (propietario) => propietario.nombre,
      filterValue: (propietario) => propietario.nombre,
      stopRowClick: true,
    },
    {
      id: "es_propio",
      tipo: "seleccion",
      label: "Tipo",
      render: (propietario) => <PropertyPill tabla="propietarios" id={propietario.id} campo="es_propio" valor={valorTipoPropietario(propietario)} opciones={opcionesTipo} revalidar={REVALIDAR} gestion={{ tipo: "tipo-propietario" }} crearOpciones />,
      // "Editar propiedad": Propio y Tercero fijos y los tipos personalizados editables.
      editorOpcionesPersonalizado: <EditorTiposPropietario tipos={tiposPropietario} />,
      sortValue: (propietario) => etiquetaTipoPropietario(propietario),
      filterValue: (propietario) => etiquetaTipoPropietario(propietario),
      preFillParaGrupo: (valor) => valor === "Propio"
        ? { es_propio: true }
        : valor === "Tercero"
          ? { es_propio: false }
          : { es_propio: valor, extra: { tipo_propietario: valor } },
      stopRowClick: true,
    },
    {
      id: "tipo_persona",
      tipo: "seleccion",
      label: "Tipo de persona",
      render: (propietario) => <PropertyPill tabla="propietarios" id={propietario.id} campo="tipo_persona" valor={propietario.tipo_persona} opciones={TIPO_PERSONA_OPCIONES} revalidar={REVALIDAR} />,
      catalogoOpciones: { tabla: "propietarios", campo: "tipo_persona", base: TIPO_PERSONA_OPCIONES },
      sortValue: (propietario) => propietario.tipo_persona,
      filterValue: (propietario) => propietario.tipo_persona,
      stopRowClick: true,
    },
    ...CAMPOS_EMPRESA.map((campo): RecordColumn<Propietario> => ({
      id: `empresa_${campo.campo}`,
      label: campo.label,
      render: (propietario) => {
        const empresa = datosEmpresasPorId[propietario.id];
        const valor = empresa?.[campo.campo];
        return <InlineEditableText tabla="datos_empresas" id={String(empresa?.id ?? propietario.id)} propietarioId={propietario.id} campo={campo.campo} valorInicial={valor == null ? null : String(valor)} revalidar={REVALIDAR} placeholder="—" className="min-w-[150px] text-white/85" />;
      },
      sortValue: (propietario) => datosEmpresasPorId[propietario.id]?.[campo.campo] ?? null,
      filterValue: (propietario) => datosEmpresasPorId[propietario.id]?.[campo.campo] ?? null,
      stopRowClick: true,
    })),
    ...columnasRelacion<Propietario>({ entidadTipo: "propietario", relacionesPorId, idDe: (propietario) => propietario.id, excluir: ["propietario"] }),
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Adjuntos",
      render: (propietario) => <AttachmentCount count={adjuntosPorId[propietario.id] ?? 0} />,
      sortValue: (propietario) => adjuntosPorId[propietario.id] ?? 0,
      filterValue: (propietario) => adjuntosPorId[propietario.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (propietario) => (
        <AccionesRegistro
          href={`/entidades/propietarios/${propietario.id}`}
          clave="propietarios"
          id={propietario.id}
          nombre={propietario.nombre}
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

  const defaultHidden = [
    ...CAMPOS_EMPRESA.map((campo) => `empresa_${campo.campo}`),
    ...columnasRelacionVacias(relacionesPorId),
  ];

  return (
    <>
      <RecordsTable rows={propietariosFiltrados} columns={columns} entidadTipo="propietario" propiedadesIniciales={propiedadesIniciales}
        slotIzquierda={slotFiltros}
        acciones={(filas) => (
          <div className="flex items-center gap-1.5">
            <CrearRegistro clave="propietarios" className={BOTON_NUEVO_CLASE} />
            <ExportMenu nombre="propietarios" filtros={descripcionFiltros([["Búsqueda", busq], ["Tipo", tipoFiltro], ["Persona", etiquetaDeOpcion(personaOpciones, personaFiltro)]])} titulo="Propietarios — Inversiones Cavala" columnas={columnasDesdeTabla(columns)} filas={filas} />
          </div>
        )} rowKey={(propietario) => propietario.id} onRowClick={(propietario) => setAbierto(propietario.id)} storageKey="propietarios" countLabel={`${propietariosFiltrados.length} propietario${propietariosFiltrados.length !== 1 ? "s" : ""}${busq || tipoFiltro || personaFiltro ? ` · filtrado de ${count}` : ""}`} defaultHidden={defaultHidden} nuevoEnGrupo={(grupo) => <NuevoEnGrupo clave="propietarios" grupo={grupo} />} />
      <PropietarioSheet id={abierto} opcionesTipo={opcionesTipo} onClose={() => setAbierto(null)} />
    </>
  );
}

function PropietarioSheet({ id, opcionesTipo, onClose }: { id: string | null; opcionesTipo: OpcionPill[]; onClose: () => void }) {
  const [propietario, setPropietario] = useState<Record<string, any> | null>(null);
  useRegistroActualizado("propietarios", id, setPropietario);
  const [empresa, setEmpresa] = useState<Record<string, any> | null>(null);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [propiedades, setPropiedades] = useState<PropiedadPersonalizada[]>([]);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!id) {
      setPropietario(null);
      setEmpresa(null);
      setCategorias(null);
      setPropiedades([]);
      setValoresPersonalizados({});
      return;
    }
    setPropietario(null);
    setEmpresa(null);
    setCategorias(null);
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase
      .from("propietarios")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => { if (vigente) setPropietario(data); });
    // Los datos fiscales viven en una tabla aparte: en el origen las columnas
    // RUC/DNI/gerente de propietarios están vacías.
    supabase
      .from("datos_empresas")
      .select("*")
      .eq("propietario_id", id)
      .order("id")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (vigente) setEmpresa(data); });
    cargarCategoriasEntidad(supabase, "propietario", [id]).then((porId) => { if (vigente) setCategorias(porId[id] ?? []); });
    cargarPropiedadesPersonalizadas(supabase, "propietario", [id]).then((c) => {
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
    const c = await cargarPropiedadesPersonalizadas(createClient(), "propietario", [id]);
    setPropiedades(c.definiciones);
    setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
  }

  const esJuridica = propietario?.tipo_persona === "juridica";

  return (
    <EntitySheet
      open={id !== null}
      onClose={onClose}
      historial={id ? { tabla: "propietarios", registroId: id, titulo: propietario?.nombre ?? undefined } : undefined}
      titulo={propietario?.nombre ?? "Cargando…"}
      tituloEditor={propietario ? <EditableText tabla="propietarios" id={propietario.id} campo="nombre" valorInicial={propietario.nombre} revalidar={REVALIDAR} appearance="title" placeholder="Nombre del propietario" /> : undefined}
      icono={
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/15">
          {esJuridica ? <Building2 className="h-5 w-5 text-brand-300" /> : <User className="h-5 w-5 text-brand-300" />}
        </div>
      }
    >
      {!propietario ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : (
        <>
          <EntityPropertyList ordenKey="propietario" entidadTipo="propietario">
            <EntityPropertyRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Tipo" campo="es_propio">
              <PropertyPill tabla="propietarios" id={propietario.id} campo="es_propio" valor={valorTipoPropietario(propietario)} opciones={opcionesTipo} revalidar={REVALIDAR} gestion={{ tipo: "tipo-propietario" }} crearOpciones />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Tipo de persona" campo="tipo_persona">
              <PropertyPill tabla="propietarios" id={propietario.id} campo="tipo_persona" valor={propietario.tipo_persona} opciones={TIPO_PERSONA_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            {CAMPOS_EMPRESA.map((campo) => (
              <EntityPropertyRow key={campo.campo} icon={<campo.icon className="h-3.5 w-3.5" />} label={campo.label} campo={campo.campo} align={campo.campo === "direccion_fiscal" || campo.campo === "cuenta_bancaria" ? "start" : "center"}>
                <EditableText
                  tabla="datos_empresas"
                  id={String(empresa?.id ?? propietario.id)}
                  propietarioId={propietario.id}
                  campo={campo.campo}
                  valorInicial={empresa?.[campo.campo]}
                  revalidar={REVALIDAR}
                  placeholder="—"
                />
              </EntityPropertyRow>
            ))}
            <FilasPropiedadesPersonalizadas
              entidadTipo="propietario"
              entidadId={propietario.id}
              propiedades={propiedades}
              valores={valoresPersonalizados}
              onCreada={recargarPropiedades}
            />
          </EntityPropertyList>

          <div>
            <DocumentosYRelaciones
              entidadTipo="propietario"
              entidadId={propietario.id}
              categorias={categorias}
              titulo="Documentos y relaciones"
              permitirCrearTipo
              vistaLateral
            />
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Notas</h3>
            <NotionBlockEditor
              tabla="propietarios"
              id={propietario.id}
              campo="extra.notas"
              valorInicial={propietario.extra?.notas}
              revalidar={REVALIDAR}
            />
          </div>

          <EliminarRegistro clave="propietarios" id={propietario.id} nombre={propietario.nombre} onEliminado={onClose} />

          <Link href={`/entidades/propietarios/${propietario.id}`} className="inline-block text-xs text-brand-300 hover:text-brand-200">
            Ver ficha completa →
          </Link>
        </>
      )}
    </EntitySheet>
  );
}
