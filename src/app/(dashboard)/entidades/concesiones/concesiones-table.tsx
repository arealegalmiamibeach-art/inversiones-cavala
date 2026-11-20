"use client";

import { useRegistroActualizado } from "@/components/ui/use-registro-actualizado";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedSelect, { type DropdownOption } from "@/components/ui/great-ui-animated-select";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import { Activity, ExternalLink, Gem, Hash, MapPin, NotebookPen, Ruler, Shapes } from "lucide-react";
import { PropertyPill } from "@/components/ui/property-pill";
import { useOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import { etiquetaDeOpcion, opcionesDeFiltro } from "@/components/ui/opciones-filtro";
import { EntityPropertyList, EntityPropertyRow, EntitySection, EntitySheet } from "@/components/ui/entity-sheet";
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
import { SUSTANCIA_OPCIONES, ESTADO_OPCIONES } from "./opciones";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas, type PropiedadPersonalizada, type PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";

type Concesion = {
  id: string;
  nombre: string;
  codigo: string | null;
  hectareas: number | null;
  sustancia: string | null;
  estado: string | null;
  ubicacion: string | null;
  url_ubicacion: string | null;
};

const REVALIDAR = "/entidades/concesiones";

/** Color con el que las sustancias de siempre se ven en el filtro; las nuevas usan el neutro. */
const RELLENO_SUSTANCIA: Record<string, string> = { metal: "#f59e0b", no_metal: "#94a3b8" };

export function ConcesionesTable({ concesiones, adjuntosPorId = {}, relacionesPorId = {}, propiedadesIniciales }: { concesiones: Concesion[]; adjuntosPorId?: Record<string, number>; relacionesPorId?: Record<string, EntidadRelacion[]>; propiedadesIniciales?: PropiedadesPersonalizadasCargadas }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sustanciaFiltro, setSustanciaFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  // Los filtros salen de las opciones vigentes de cada columna, así que lo que
  // se añade, renombra o elimina en "Editar propiedad" se refleja aquí.
  const sustanciaOpciones = useOpcionesColumna("concesiones_mineras", "sustancia", SUSTANCIA_OPCIONES);
  const estadoOpciones = useOpcionesColumna("concesiones_mineras", "estado", ESTADO_OPCIONES);

  const sustanciaSelectOptions: DropdownOption[] = useMemo(
    () => opcionesDeFiltro(sustanciaOpciones, concesiones.map((c) => c.sustancia), "Todas", (valor) => RELLENO_SUSTANCIA[valor] ?? "rgba(0,0,0,0.3)"),
    [concesiones, sustanciaOpciones],
  );

  const estadoSelectOptions: DropdownOption[] = useMemo(
    () => opcionesDeFiltro(estadoOpciones, concesiones.map((c) => c.estado), "Todos", () => "rgba(0,0,0,0.3)"),
    [concesiones, estadoOpciones],
  );

  const concesionesFiltradas = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("es-PE");
    return concesiones.filter((c) => {
      if (sustanciaFiltro && c.sustancia !== sustanciaFiltro) return false;
      if (estadoFiltro && c.estado !== estadoFiltro) return false;
      if (query) {
        const haystack = `${c.nombre ?? ""} ${c.codigo ?? ""}`.toLocaleLowerCase("es-PE");
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [concesiones, estadoFiltro, q, sustanciaFiltro]);

  const hayFiltros = q.trim() !== "" || sustanciaFiltro !== "" || estadoFiltro !== "";

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
        onMouseLeave={() => { if (!q && !sustanciaFiltro && !estadoFiltro) setSpotlightOpen(false); }}
      >
        <motion.div
          layout="size"
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="spotlight-search flex-1 min-w-[150px] z-10 relative overflow-hidden rounded-full"
        >
          <SuggestiveSearch
            value={q}
            onChange={setQ}
            onFocusChange={(f) => { if (f) setSpotlightOpen(true); }}
            suggestions={["Buscar concesión…", "Buscar por código…"]}
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
                  placeholder="Sustancia"
                  options={sustanciaSelectOptions}
                  width={155}
                  triggerHeight={32}
                  itemHeight={34}
                  itemGap={3}
                  value={sustanciaFiltro || null}
                  onSelect={(opt) => setSustanciaFiltro(opt.id === "__all__" ? "" : opt.id)}
                />
              </div>
              <div className="shrink-0 relative z-30">
                <AnimatedSelect
                  placeholder="Estado"
                  options={estadoSelectOptions}
                  width={155}
                  triggerHeight={32}
                  itemHeight={34}
                  itemGap={3}
                  value={estadoFiltro || null}
                  onSelect={(opt) => setEstadoFiltro(opt.id === "__all__" ? "" : opt.id)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const columns: RecordColumn<Concesion>[] = [
    {
      id: "nombre",
      label: "Nombre",
      render: (concesion) => <InlineEditableText tabla="concesiones_mineras" id={concesion.id} campo="nombre" valorInicial={concesion.nombre} revalidar={REVALIDAR} className="min-w-[190px] font-medium text-white" onOpen={() => setAbierto(concesion.id)} />,
      sortValue: (concesion) => concesion.nombre,
      filterValue: (concesion) => concesion.nombre,
      stopRowClick: true,
    },
    {
      id: "codigo",
      label: "Código",
      render: (concesion) => <InlineEditableText tabla="concesiones_mineras" id={concesion.id} campo="codigo" valorInicial={concesion.codigo} revalidar={REVALIDAR} placeholder="—" className="font-mono text-xs text-white/75" />,
      sortValue: (concesion) => concesion.codigo,
      filterValue: (concesion) => concesion.codigo,
      stopRowClick: true,
    },
    {
      id: "sustancia",
      tipo: "seleccion",
      label: "Sustancia",
      render: (concesion) => <PropertyPill tabla="concesiones_mineras" id={concesion.id} campo="sustancia" valor={concesion.sustancia} opciones={SUSTANCIA_OPCIONES} revalidar={REVALIDAR} />,
      catalogoOpciones: { tabla: "concesiones_mineras", campo: "sustancia", base: SUSTANCIA_OPCIONES },
      sortValue: (concesion) => concesion.sustancia,
      filterValue: (concesion) => concesion.sustancia,
      stopRowClick: true,
    },
    {
      id: "hectareas",
      label: "Hectáreas",
      render: (concesion) => (
        <InlineEditableText
          tabla="concesiones_mineras"
          id={concesion.id}
          campo="hectareas"
          valorInicial={concesion.hectareas === null ? "" : String(concesion.hectareas)}
          revalidar={REVALIDAR}
          inputType="number"
          min={0}
          step="0.0001"
          placeholder="—"
          className="tabular-nums text-white/80"
          renderValor={(valor) => `${Number(valor).toLocaleString("es-PE")} ha`}
        />
      ),
      sortValue: (concesion) => concesion.hectareas,
      filterValue: (concesion) => concesion.hectareas,
      stopRowClick: true,
    },
    {
      id: "estado",
      tipo: "seleccion",
      label: "Estado",
      render: (concesion) => <PropertyPill tabla="concesiones_mineras" id={concesion.id} campo="estado" valor={concesion.estado} opciones={ESTADO_OPCIONES} revalidar={REVALIDAR} />,
      catalogoOpciones: { tabla: "concesiones_mineras", campo: "estado", base: ESTADO_OPCIONES },
      sortValue: (concesion) => concesion.estado,
      filterValue: (concesion) => concesion.estado,
      stopRowClick: true,
    },
    {
      id: "ubicacion",
      label: "Ubicación",
      render: (concesion) => <InlineEditableText tabla="concesiones_mineras" id={concesion.id} campo="ubicacion" valorInicial={concesion.ubicacion} revalidar={REVALIDAR} placeholder="—" className="min-w-[190px] text-xs text-white/75" />,
      sortValue: (concesion) => concesion.ubicacion,
      filterValue: (concesion) => concesion.ubicacion,
      stopRowClick: true,
    },
    {
      id: "url_ubicacion",
      label: "Ubicación (mapa)",
      render: (concesion) => <InlineEditableText tabla="concesiones_mineras" id={concesion.id} campo="url_ubicacion" valorInicial={concesion.url_ubicacion} revalidar={REVALIDAR} placeholder="—" className="min-w-[220px] text-xs text-white/75" />,
      sortValue: (concesion) => concesion.url_ubicacion,
      filterValue: (concesion) => concesion.url_ubicacion,
      stopRowClick: true,
    },
    ...columnasRelacion<Concesion>({ entidadTipo: "concesion", relacionesPorId: relacionesPorId, idDe: (concesion) => concesion.id, excluir: ["concesion"] }),
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Adjuntos",
      render: (concesion) => <AttachmentCount count={adjuntosPorId[concesion.id] ?? 0} />,
      sortValue: (concesion) => adjuntosPorId[concesion.id] ?? 0,
      filterValue: (concesion) => adjuntosPorId[concesion.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (concesion) => (
        <AccionesRegistro
          href={`/entidades/concesiones/${concesion.id}`}
          clave="concesiones_mineras"
          id={concesion.id}
          nombre={concesion.nombre}
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
      <RecordsTable rows={concesionesFiltradas} columns={columns} entidadTipo="concesion" propiedadesIniciales={propiedadesIniciales}
        slotIzquierda={slotFiltros}
        acciones={(filas) => (
          <div className="flex items-center gap-1.5">
            <CrearRegistro clave="concesiones_mineras" className={BOTON_NUEVO_CLASE} />
            <ExportMenu nombre="concesiones-mineras" filtros={descripcionFiltros([["Búsqueda", q], ["Sustancia", etiquetaDeOpcion(sustanciaOpciones, sustanciaFiltro)], ["Estado", etiquetaDeOpcion(estadoOpciones, estadoFiltro)]])} titulo="Concesiones mineras — Inversiones Cavala" columnas={columnasDesdeTabla(columns)} filas={filas} />
          </div>
        )} rowKey={(concesion) => concesion.id} onRowClick={(concesion) => setAbierto(concesion.id)} storageKey="concesiones" countLabel={`${concesionesFiltradas.length} concesión${concesionesFiltradas.length !== 1 ? "es" : ""}${hayFiltros ? ` · filtrado de ${concesiones.length}` : ""}`} defaultHidden={["ubicacion", "url_ubicacion", ...columnasRelacionVacias(relacionesPorId)]} nuevoEnGrupo={(grupo) => <NuevoEnGrupo clave="concesiones_mineras" grupo={grupo} />} />
      <ConcesionSheet id={abierto} onClose={() => setAbierto(null)} />
    </>
  );
}

function ConcesionSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [concesion, setConcesion] = useState<Record<string, any> | null>(null);
  useRegistroActualizado("concesiones_mineras", id, setConcesion);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [propiedades, setPropiedades] = useState<PropiedadPersonalizada[]>([]);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!id) {
      setConcesion(null);
      setCategorias(null);
      setPropiedades([]);
      setValoresPersonalizados({});
      return;
    }
    setConcesion(null);
    setCategorias(null);
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase
      .from("concesiones_mineras")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => { if (vigente) setConcesion(data); });
    cargarCategoriasEntidad(supabase, "concesion", [id]).then((porId) => { if (vigente) setCategorias(porId[id] ?? []); });
    cargarPropiedadesPersonalizadas(supabase, "concesion", [id]).then((c) => {
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
    const c = await cargarPropiedadesPersonalizadas(createClient(), "concesion", [id]);
    setPropiedades(c.definiciones);
    setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
  }

  return (
    <EntitySheet
      open={id !== null}
      onClose={onClose}
      historial={id ? { tabla: "concesiones_mineras", registroId: id, titulo: concesion?.nombre ?? undefined } : undefined}
      titulo={concesion?.nombre ?? "Cargando…"}
      tituloEditor={concesion ? <EditableText tabla="concesiones_mineras" id={concesion.id} campo="nombre" valorInicial={concesion.nombre} revalidar={REVALIDAR} appearance="title" placeholder="Nombre de la concesión" /> : undefined}
      subtitulo={concesion?.codigo}
      icono={
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/15">
          <Gem className="h-5 w-5 text-amber-300" />
        </div>
      }
    >
      {!concesion ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : (
        <>
          <EntityPropertyList ordenKey="concesion" entidadTipo="concesion">
            <EntityPropertyRow icon={<Shapes className="h-3.5 w-3.5" />} label="Sustancia" campo="sustancia">
              <PropertyPill tabla="concesiones_mineras" id={concesion.id} campo="sustancia" valor={concesion.sustancia} opciones={SUSTANCIA_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Activity className="h-3.5 w-3.5" />} label="Estado" campo="estado">
              <PropertyPill tabla="concesiones_mineras" id={concesion.id} campo="estado" valor={concesion.estado} opciones={ESTADO_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Ruler className="h-3.5 w-3.5" />} label="Hectáreas" campo="hectareas">
              <EditableText tabla="concesiones_mineras" id={concesion.id} campo="hectareas" valorInicial={concesion.hectareas == null ? "" : String(concesion.hectareas)} revalidar={REVALIDAR} inputType="number" min={0} step="0.0001" placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="Código" campo="codigo">
              <EditableText tabla="concesiones_mineras" id={concesion.id} campo="codigo" valorInicial={concesion.codigo} revalidar={REVALIDAR} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Ubicación" campo="ubicacion">
              <EditableText tabla="concesiones_mineras" id={concesion.id} campo="ubicacion" valorInicial={concesion.ubicacion} revalidar={REVALIDAR} placeholder="Sin ubicación" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<ExternalLink className="h-3.5 w-3.5" />} label="Ubicación (mapa)" campo="url_ubicacion">
              <EditableText tabla="concesiones_mineras" id={concesion.id} campo="url_ubicacion" valorInicial={concesion.url_ubicacion} revalidar={REVALIDAR} placeholder="https://…" />
            </EntityPropertyRow>
            <FilasPropiedadesPersonalizadas
              entidadTipo="concesion"
              entidadId={concesion.id}
              propiedades={propiedades}
              valores={valoresPersonalizados}
              onCreada={recargarPropiedades}
            />
          </EntityPropertyList>

          <div>
            <DocumentosYRelaciones
              entidadTipo="concesion"
              entidadId={concesion.id}
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
              tabla="concesiones_mineras"
              id={concesion.id}
              campo="extra.notas"
              valorInicial={concesion.extra?.notas}
              revalidar={REVALIDAR}
              placeholder="Anota vigencias, pagos, observaciones de campo…"
            />
          </EntitySection>

          <EliminarRegistro clave="concesiones_mineras" id={concesion.id} nombre={concesion.nombre} onEliminado={onClose} />

          <Link href={`/entidades/concesiones/${concesion.id}`} className="inline-block text-xs text-brand-300 hover:text-brand-200">
            Ver ficha completa →
          </Link>
        </>
      )}
    </EntitySheet>
  );
}
