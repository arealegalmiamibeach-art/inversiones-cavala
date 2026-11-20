"use client";

import { useRegistroActualizado } from "@/components/ui/use-registro-actualizado";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedSelect, { type DropdownOption } from "@/components/ui/great-ui-animated-select";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import { Archive, CalendarDays, CircleDollarSign, CornerDownRight, Crosshair, FolderArchive, Hash, MapPin, Shapes, Tag, UserRound } from "lucide-react";
import { PropertyPill } from "@/components/ui/property-pill";
import { useOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import { etiquetaDeOpcion, opcionesDeFiltro } from "@/components/ui/opciones-filtro";
import { EntityPropertyList, EntityPropertyRow, EntitySheet } from "@/components/ui/entity-sheet";
import { EditableText } from "@/components/ui/editable-text";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { AccionesRegistro, EliminarRegistro } from "@/components/ui/eliminar-registro";
import { cargarCategoriasEntidad, type CategoriaGrupo } from "@/lib/relaciones/agrupar";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import { columnasRelacion, columnasRelacionVacias } from "@/components/ui/columnas-relacion";
import { AttachmentCount, RecordsTable, type RecordColumn } from "@/components/ui/records-table";
import { BOTON_NUEVO_CLASE, CrearRegistro, NuevoEnGrupo } from "@/components/ui/crear-registro";
import { ExportMenu } from "@/components/ui/export-menu";
import { columnasDesdeTabla, descripcionFiltros } from "@/lib/export/tabla";
import { createClient } from "@/lib/supabase/client";
import { TIPO_PREDIO_OPCIONES, REGISTRADO_OPCIONES, A_NOMBRE_DE_OPCIONES, SI_NO_OPCIONES } from "./opciones";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas, type PropiedadPersonalizada, type PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";
import { useUrlFilter } from "@/components/ui/use-url-filter";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import { JerarquiaPredio } from "./jerarquia-predio";
import { cn } from "@/lib/utils";

type Predio = {
  id: string;
  nombre: string;
  n_partida: string | null;
  tipo_predio: string | null;
  registrado: boolean | null;
  a_nombre_de: string | null;
  predio_padre_id: string | null;
  ubicacion: string | null;
  coordenadas: string | null;
  fecha_adquisicion: string | null;
  monto_copia_literal: number | null;
  detalles: string | null;
  archivador_drive: boolean | null;
  archivador_fisico: boolean | null;
};

const REVALIDAR = "/entidades/predios";

const REGISTRADO_SELECT_OPTIONS: DropdownOption[] = [
  { id: "__all__", label: "Registrado y no", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(0,0,0,0.15)" /></svg> },
  { id: "si", label: "Registrado", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="#10b981" /></svg> },
  { id: "no", label: "No registrado", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="#f59e0b" /></svg> },
];

/** Color con el que los tipos de siempre se ven en el filtro; los nuevos usan el neutro. */
const RELLENO_TIPO_PREDIO: Record<string, string> = { urbano: "#10b981", rural: "#84cc16" };

export function PrediosTable({
  predios,
  count,
  q: qProp,
  tipo,
  registrado,
  adjuntosPorId = {},
  relacionesPorId = {},
  propiedadesIniciales,
}: {
  predios: Predio[];
  count: number;
  q?: string;
  tipo?: string;
  registrado?: string;
  adjuntosPorId?: Record<string, number>;
  relacionesPorId?: Record<string, EntidadRelacion[]>;
  propiedadesIniciales?: PropiedadesPersonalizadasCargadas;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState(qProp ?? "");
  const [tipoFiltro, setTipoFiltro] = useState(tipo ?? "");
  const [registradoFiltro, setRegistradoFiltro] = useState(registrado ?? "");
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const { update: updateUrlFilter } = useUrlFilter();

  useEffect(() => setQ(qProp ?? ""), [qProp]);
  useEffect(() => setTipoFiltro(tipo ?? ""), [tipo]);
  useEffect(() => setRegistradoFiltro(registrado ?? ""), [registrado]);

  // El filtro de tipo sale de las opciones vigentes de la columna, así que lo
  // que se añade, renombra o elimina en "Editar propiedad" se refleja aquí.
  const tipoOpciones = useOpcionesColumna("predios", "tipo_predio", TIPO_PREDIO_OPCIONES);
  const tipoSelectOptions: DropdownOption[] = useMemo(
    () => opcionesDeFiltro(tipoOpciones, predios.map((predio) => predio.tipo_predio), "Todos", (valor) => RELLENO_TIPO_PREDIO[valor] ?? "rgba(0,0,0,0.3)"),
    [tipoOpciones, predios],
  );

  const prediosFiltrados = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("es-PE");
    return predios.filter((predio) => {
      if (tipoFiltro && predio.tipo_predio !== tipoFiltro) return false;
      if (registradoFiltro === "si" && predio.registrado !== true) return false;
      if (registradoFiltro === "no" && predio.registrado !== false) return false;
      if (query) {
        const haystack = `${predio.nombre} ${predio.n_partida ?? ""}`.toLocaleLowerCase("es-PE");
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [predios, q, registradoFiltro, tipoFiltro]);

  const hayFiltros = q.trim() !== "" || tipoFiltro !== "" || registradoFiltro !== "";

  const porId = useMemo(() => new Map(predios.map((predio) => [predio.id, predio])), [predios]);

  const jerarquia = useMemo(() => {
    const padrePorHijo = new Map<string, string>();
    for (const predio of predios) {
      const padreId = predio.predio_padre_id;
      if (!padreId || padreId === predio.id || !porId.has(padreId)) continue;
      padrePorHijo.set(predio.id, padreId);
    }

    // Rompe cualquier ciclo heredado de la migración para conservar al menos
    // una raíz visible y evitar una recursión infinita al desplegar.
    for (const predio of predios) {
      const recorrido = new Set<string>();
      let actual = predio.id;
      while (padrePorHijo.has(actual)) {
        if (recorrido.has(actual)) {
          padrePorHijo.delete(actual);
          break;
        }
        recorrido.add(actual);
        actual = padrePorHijo.get(actual)!;
      }
    }

    const hijosPorPadre = new Map<string, Predio[]>();
    for (const predio of predios) {
      const padreId = padrePorHijo.get(predio.id);
      if (!padreId) continue;
      const hijos = hijosPorPadre.get(padreId);
      if (hijos) hijos.push(predio);
      else hijosPorPadre.set(padreId, [predio]);
    }
    return { padrePorHijo, hijosPorPadre };
  }, [porId, predios]);

  const hijosDe = (id: string) => jerarquia.hijosPorPadre.get(id) ?? [];
  const esHijoVisible = (predio: Predio) => jerarquia.padrePorHijo.has(predio.id);

  // Al filtrar se incorporan los ancestros de cada coincidencia. Así buscar
  // una partida hija muestra su ruta aunque el padre estuviera contraído.
  const idsIncluidosPorFiltro = useMemo(() => {
    if (!hayFiltros) return null;
    const incluidos = new Set(prediosFiltrados.map((predio) => predio.id));
    for (const predio of prediosFiltrados) {
      let padreId = jerarquia.padrePorHijo.get(predio.id);
      while (padreId && !incluidos.has(padreId)) {
        incluidos.add(padreId);
        padreId = jerarquia.padrePorHijo.get(padreId);
      }
    }
    return incluidos;
  }, [hayFiltros, jerarquia.padrePorHijo, prediosFiltrados]);

  // Igual que en Contratos MBP-Otros: sólo se pintan las raíces y cada nivel
  // aparece inmediatamente debajo de su padre cuando se abre el triángulo.
  const filas = useMemo(() => {
    const salida: Predio[] = [];
    const vistos = new Set<string>();
    const agregar = (predio: Predio) => {
      if (vistos.has(predio.id)) return;
      vistos.add(predio.id);
      salida.push(predio);
      const hijos = jerarquia.hijosPorPadre.get(predio.id) ?? [];
      if (idsIncluidosPorFiltro) {
        for (const hijo of hijos) if (idsIncluidosPorFiltro.has(hijo.id)) agregar(hijo);
        return;
      }
      if (expandidos.has(predio.id)) for (const hijo of hijos) agregar(hijo);
    };

    for (const predio of predios) {
      if (!jerarquia.padrePorHijo.has(predio.id) && (!idsIncluidosPorFiltro || idsIncluidosPorFiltro.has(predio.id))) agregar(predio);
    }
    return salida;
  }, [expandidos, idsIncluidosPorFiltro, jerarquia, predios]);

  const subprediosTotales = jerarquia.padrePorHijo.size;

  function alternar(id: string) {
    setExpandidos((actuales) => {
      const siguientes = new Set(actuales);
      if (siguientes.has(id)) siguientes.delete(id);
      else siguientes.add(id);
      return siguientes;
    });
  }

  const slotFiltros = (
    <div className="spotlight-filter-shell flex min-w-0 flex-1 max-w-[580px] items-center">
      <svg width="0" height="0" className="absolute">
        <filter id="blob-toolbar-predios">
          <feGaussianBlur stdDeviation="10" in="SourceGraphic" />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9" result="blob" />
          <feBlend in="SourceGraphic" in2="blob" />
        </filter>
      </svg>
      <div
        className="spotlight-toolbar flex flex-1 items-center gap-3 [&>div]:bg-[#eeeadf] [&>div]:rounded-full [&>div]:backdrop-blur-xl"
        style={{ filter: "url(#blob-toolbar-predios)" }}
        onMouseEnter={() => setSpotlightOpen(true)}
        onMouseLeave={() => { if (!q && !tipoFiltro && !registradoFiltro) setSpotlightOpen(false); }}
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
            suggestions={["Buscar predio…", "Buscar partida…"]}
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
                  placeholder="Tipo"
                  options={tipoSelectOptions}
                  width={155}
                  triggerHeight={32}
                  itemHeight={34}
                  itemGap={3}
                  value={tipoFiltro || null}
                  onSelect={(opt) => {
                    const value = opt.id === "__all__" ? "" : opt.id;
                    setTipoFiltro(value);
                    updateUrlFilter("tipo", value);
                  }}
                />
              </div>
              <div className="shrink-0 relative z-30">
                <AnimatedSelect
                  placeholder="Registro"
                  options={REGISTRADO_SELECT_OPTIONS}
                  width={155}
                  triggerHeight={32}
                  itemHeight={34}
                  itemGap={3}
                  value={registradoFiltro || null}
                  onSelect={(opt) => {
                    const value = opt.id === "__all__" ? "" : opt.id;
                    setRegistradoFiltro(value);
                    updateUrlFilter("registrado", value);
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const columns: RecordColumn<Predio>[] = [
    {
      id: "nombre",
      label: "Nombre",
      render: (predio) => {
        const hijos = hijosDe(predio.id);
        const anidado = esHijoVisible(predio);
        const desplegado = idsIncluidosPorFiltro
          ? hijos.some((hijo) => idsIncluidosPorFiltro.has(hijo.id))
          : expandidos.has(predio.id);
        return (
          <div className={cn("flex min-w-[190px] items-center gap-1.5", anidado && "pl-5")}>
            {hijos.length > 0 ? (
              <button
                type="button"
                title={desplegado ? "Ocultar subpredios" : `Ver ${hijos.length} subpredio${hijos.length === 1 ? "" : "s"}`}
                aria-label={desplegado ? `Ocultar subpredios de ${predio.nombre}` : `Ver subpredios de ${predio.nombre}`}
                onClick={(evento) => {
                  evento.stopPropagation();
                  alternar(predio.id);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <TrianguloDesplegable abierto={desplegado} />
              </button>
            ) : anidado ? (
              <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            <div className={cn("min-w-0 flex-1", anidado && "opacity-85")}>
              <InlineEditableText tabla="predios" id={predio.id} campo="nombre" valorInicial={predio.nombre} revalidar={REVALIDAR} className="font-medium text-white" onOpen={() => setAbierto(predio.id)} />
            </div>
            {hijos.length > 0 && (
              <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold text-white/60">
                {hijos.length}
              </span>
            )}
          </div>
        );
      },
      sortValue: (predio) => predio.nombre,
      filterValue: (predio) => predio.nombre,
      stopRowClick: true,
    },
    {
      id: "n_partida",
      label: "N° de partida",
      render: (predio) => <InlineEditableText tabla="predios" id={predio.id} campo="n_partida" valorInicial={predio.n_partida} revalidar={REVALIDAR} placeholder="—" className="font-mono text-xs text-white/75" />,
      sortValue: (predio) => predio.n_partida,
      filterValue: (predio) => predio.n_partida,
      stopRowClick: true,
    },
    {
      id: "tipo_predio",
      tipo: "seleccion",
      label: "Tipo",
      render: (predio) => <PropertyPill tabla="predios" id={predio.id} campo="tipo_predio" valor={predio.tipo_predio} opciones={TIPO_PREDIO_OPCIONES} revalidar={REVALIDAR} />,
      catalogoOpciones: { tabla: "predios", campo: "tipo_predio", base: TIPO_PREDIO_OPCIONES },
      sortValue: (predio) => predio.tipo_predio,
      filterValue: (predio) => predio.tipo_predio,
      stopRowClick: true,
    },
    {
      id: "registrado",
      // Booleano de dos estados (Registrado / No registrado): no admite más opciones.
      tipo: "booleano",
      tipoFijo: true,
      label: "Estado",
      render: (predio) => <PropertyPill tabla="predios" id={predio.id} campo="registrado" valor={predio.registrado} opciones={REGISTRADO_OPCIONES} revalidar={REVALIDAR} />,
      sortValue: (predio) => predio.registrado,
      filterValue: (predio) => predio.registrado,
      stopRowClick: true,
    },
    {
      id: "a_nombre_de",
      tipo: "seleccion",
      label: "A nombre de",
      render: (predio) => <PropertyPill tabla="predios" id={predio.id} campo="a_nombre_de" valor={predio.a_nombre_de} opciones={A_NOMBRE_DE_OPCIONES} revalidar={REVALIDAR} />,
      catalogoOpciones: { tabla: "predios", campo: "a_nombre_de", base: A_NOMBRE_DE_OPCIONES },
      sortValue: (predio) => predio.a_nombre_de,
      filterValue: (predio) => predio.a_nombre_de,
      stopRowClick: true,
    },
    {
      id: "ubicacion",
      label: "Ubicación",
      render: (predio) => <InlineEditableText tabla="predios" id={predio.id} campo="ubicacion" valorInicial={predio.ubicacion} revalidar={REVALIDAR} placeholder="—" className="min-w-[190px] text-xs text-white/75" />,
      sortValue: (predio) => predio.ubicacion,
      filterValue: (predio) => predio.ubicacion,
      stopRowClick: true,
    },
    {
      id: "coordenadas",
      label: "Coordenadas",
      render: (predio) => <InlineEditableText tabla="predios" id={predio.id} campo="coordenadas" valorInicial={predio.coordenadas} revalidar={REVALIDAR} placeholder="—" className="min-w-[170px] font-mono text-xs text-white/75" />,
      sortValue: (predio) => predio.coordenadas,
      filterValue: (predio) => predio.coordenadas,
      stopRowClick: true,
    },
    {
      id: "fecha_adquisicion",
      label: "Fecha de adquisición",
      render: (predio) => <InlineEditableText tabla="predios" id={predio.id} campo="fecha_adquisicion" valorInicial={predio.fecha_adquisicion} revalidar={REVALIDAR} inputType="date" placeholder="—" className="whitespace-nowrap text-xs text-white/75" />,
      sortValue: (predio) => predio.fecha_adquisicion ? new Date(predio.fecha_adquisicion) : null,
      filterValue: (predio) => predio.fecha_adquisicion,
      stopRowClick: true,
    },
    {
      id: "monto_copia_literal",
      label: "Monto copia literal",
      render: (predio) => <InlineEditableText tabla="predios" id={predio.id} campo="monto_copia_literal" valorInicial={predio.monto_copia_literal == null ? "" : String(predio.monto_copia_literal)} revalidar={REVALIDAR} inputType="number" min={0} step="0.01" placeholder="—" className="whitespace-nowrap font-mono text-xs text-white/75" />,
      sortValue: (predio) => predio.monto_copia_literal,
      filterValue: (predio) => predio.monto_copia_literal,
      stopRowClick: true,
    },
    {
      id: "detalles",
      label: "Detalles",
      render: (predio) => <InlineEditableText tabla="predios" id={predio.id} campo="detalles" valorInicial={predio.detalles} revalidar={REVALIDAR} placeholder="—" className="min-w-[220px] max-w-[340px] line-clamp-2 text-xs text-white/75" />,
      sortValue: (predio) => predio.detalles,
      filterValue: (predio) => predio.detalles,
      stopRowClick: true,
    },
    {
      id: "archivador_drive",
      // Sí/No: no admite más opciones.
      tipo: "booleano",
      tipoFijo: true,
      label: "Archivador Drive",
      render: (predio) => <PropertyPill tabla="predios" id={predio.id} campo="archivador_drive" valor={predio.archivador_drive} opciones={SI_NO_OPCIONES} revalidar={REVALIDAR} />,
      sortValue: (predio) => predio.archivador_drive,
      filterValue: (predio) => predio.archivador_drive ? "Sí" : "No",
      stopRowClick: true,
    },
    {
      id: "archivador_fisico",
      // Sí/No: no admite más opciones.
      tipo: "booleano",
      tipoFijo: true,
      label: "Archivador físico",
      render: (predio) => <PropertyPill tabla="predios" id={predio.id} campo="archivador_fisico" valor={predio.archivador_fisico} opciones={SI_NO_OPCIONES} revalidar={REVALIDAR} />,
      sortValue: (predio) => predio.archivador_fisico,
      filterValue: (predio) => predio.archivador_fisico ? "Sí" : "No",
      stopRowClick: true,
    },
    ...columnasRelacion<Predio>({ entidadTipo: "predio", relacionesPorId, idDe: (predio) => predio.id, excluir: ["predio"] }),
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Adjuntos",
      render: (predio) => <AttachmentCount count={adjuntosPorId[predio.id] ?? 0} />,
      sortValue: (predio) => adjuntosPorId[predio.id] ?? 0,
      filterValue: (predio) => adjuntosPorId[predio.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (predio) => (
        <AccionesRegistro
          href={`/entidades/predios/${predio.id}`}
          clave="predios"
          id={predio.id}
          nombre={predio.nombre}
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
      <RecordsTable rows={filas} columns={columns} entidadTipo="predio" propiedadesIniciales={propiedadesIniciales}
        slotIzquierda={slotFiltros}
        acciones={(filas) => (
          <div className="flex items-center gap-1.5">
            <CrearRegistro clave="predios" className={BOTON_NUEVO_CLASE} />
            <ExportMenu nombre="predios" filtros={descripcionFiltros([["Búsqueda", q], ["Tipo", etiquetaDeOpcion(tipoOpciones, tipoFiltro)], ["Registrado", registradoFiltro]])} titulo="Predios — Inversiones Cavala" columnas={columnasDesdeTabla(columns)} filas={filas} />
          </div>
        )} rowKey={(predio) => predio.id} rowParentKey={(predio) => jerarquia.padrePorHijo.get(predio.id) ?? null} onRowClick={(predio) => setAbierto(predio.id)} storageKey="predios" countLabel={hayFiltros ? `${prediosFiltrados.length.toLocaleString("es-PE")} predio${prediosFiltrados.length !== 1 ? "s" : ""} · filtrado de ${count}` : etiquetaConteoPredios(Math.max(count - subprediosTotales, 0), subprediosTotales)} defaultHidden={["ubicacion", "coordenadas", "fecha_adquisicion", "monto_copia_literal", "detalles", "archivador_drive", "archivador_fisico", ...columnasRelacionVacias(relacionesPorId)]} nuevoEnGrupo={(grupo) => <NuevoEnGrupo clave="predios" grupo={grupo} />} />
      <PredioSheet id={abierto} onClose={() => setAbierto(null)} />
    </>
  );
}

function etiquetaConteoPredios(predios: number, subpredios: number) {
  const base = `${predios.toLocaleString("es-PE")} predio${predios !== 1 ? "s" : ""}`;
  const anidados = subpredios > 0
    ? ` · ${subpredios.toLocaleString("es-PE")} subpredio${subpredios !== 1 ? "s" : ""} anidado${subpredios !== 1 ? "s" : ""}`
    : "";
  return `${base}${anidados}`;
}

function PredioSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [predio, setPredio] = useState<Record<string, any> | null>(null);
  useRegistroActualizado("predios", id, setPredio);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [propiedades, setPropiedades] = useState<PropiedadPersonalizada[]>([]);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!id) {
      setPredio(null);
      setCategorias(null);
      setPropiedades([]);
      setValoresPersonalizados({});
      return;
    }
    setPredio(null);
    setCategorias(null);
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase
      .from("predios")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => { if (vigente) setPredio(data); });
    cargarCategoriasEntidad(supabase, "predio", [id]).then((porId) => { if (vigente) setCategorias(porId[id] ?? []); });
    cargarPropiedadesPersonalizadas(supabase, "predio", [id]).then((c) => {
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
    const c = await cargarPropiedadesPersonalizadas(createClient(), "predio", [id]);
    setPropiedades(c.definiciones);
    setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
  }

  return (
    <EntitySheet
      open={id !== null}
      onClose={onClose}
      historial={id ? { tabla: "predios", registroId: id, titulo: predio?.nombre ?? undefined } : undefined}
      titulo={predio?.nombre ?? "Cargando…"}
      tituloEditor={predio ? <EditableText tabla="predios" id={predio.id} campo="nombre" valorInicial={predio.nombre} revalidar={REVALIDAR} appearance="title" placeholder="Nombre del predio" /> : undefined}
      subtitulo={predio?.n_partida ? `Partida ${predio.n_partida}` : undefined}
      icono={
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/15">
          <MapPin className="h-5 w-5 text-emerald-300" />
        </div>
      }
    >
      {!predio ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : (
        <>
          <EntityPropertyList ordenKey="predio" entidadTipo="predio">
            <EntityPropertyRow icon={<Shapes className="h-3.5 w-3.5" />} label="Tipo" campo="tipo_predio">
              <PropertyPill tabla="predios" id={predio.id} campo="tipo_predio" valor={predio.tipo_predio} opciones={TIPO_PREDIO_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Estado" campo="registrado">
              <PropertyPill tabla="predios" id={predio.id} campo="registrado" valor={predio.registrado} opciones={REGISTRADO_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<UserRound className="h-3.5 w-3.5" />} label="A nombre de" campo="a_nombre_de">
              <PropertyPill tabla="predios" id={predio.id} campo="a_nombre_de" valor={predio.a_nombre_de} opciones={A_NOMBRE_DE_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="N° de partida" campo="n_partida">
              <EditableText tabla="predios" id={predio.id} campo="n_partida" valorInicial={predio.n_partida} revalidar={REVALIDAR} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Ubicación" campo="ubicacion">
              <EditableText tabla="predios" id={predio.id} campo="ubicacion" valorInicial={predio.ubicacion} revalidar={REVALIDAR} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Crosshair className="h-3.5 w-3.5" />} label="Coordenadas" campo="coordenadas">
              <EditableText tabla="predios" id={predio.id} campo="coordenadas" valorInicial={predio.coordenadas} revalidar={REVALIDAR} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Fecha de adquisición" campo="fecha_adquisicion">
              <EditableText tabla="predios" id={predio.id} campo="fecha_adquisicion" valorInicial={predio.fecha_adquisicion} revalidar={REVALIDAR} inputType="date" placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Monto copia literal" campo="monto_copia_literal">
              <EditableText tabla="predios" id={predio.id} campo="monto_copia_literal" valorInicial={predio.monto_copia_literal == null ? "" : String(predio.monto_copia_literal)} revalidar={REVALIDAR} inputType="number" min={0} step="0.01" placeholder="0.00" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Archive className="h-3.5 w-3.5" />} label="Archivador Drive" campo="archivador_drive">
              <PropertyPill tabla="predios" id={predio.id} campo="archivador_drive" valor={predio.archivador_drive} opciones={SI_NO_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<FolderArchive className="h-3.5 w-3.5" />} label="Archivador físico" campo="archivador_fisico">
              <PropertyPill tabla="predios" id={predio.id} campo="archivador_fisico" valor={predio.archivador_fisico} opciones={SI_NO_OPCIONES} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <FilasPropiedadesPersonalizadas
              entidadTipo="predio"
              entidadId={predio.id}
              propiedades={propiedades}
              valores={valoresPersonalizados}
              onCreada={recargarPropiedades}
            />
          </EntityPropertyList>

          <JerarquiaPredio predioId={predio.id} />

          <div>
            <DocumentosYRelaciones
              entidadTipo="predio"
              entidadId={predio.id}
              categorias={categorias}
              titulo="Documentos y relaciones"
              permitirCrearTipo
              vistaLateral
            />
          </div>

          <NotionBlockEditor
            tabla="predios"
            id={predio.id}
            campo="detalles"
            valorInicial={predio.detalles}
            revalidar={REVALIDAR}
            placeholder="Sin detalles"
          />

          <EliminarRegistro clave="predios" id={predio.id} nombre={predio.nombre} onEliminado={onClose} />

          <Link href={`/entidades/predios/${predio.id}`} className="inline-block text-xs text-brand-300 hover:text-brand-200">
            Ver ficha completa →
          </Link>
        </>
      )}
    </EntitySheet>
  );
}
