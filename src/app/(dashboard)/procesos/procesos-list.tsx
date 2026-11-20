"use client";

import { useRegistroActualizado } from "@/components/ui/use-registro-actualizado";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, BriefcaseBusiness, Building2, CalendarClock, Car, ClipboardList, Gavel, Landmark, MapPin, Tag, UserRound, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedSelect, { type DropdownOption } from "@/components/ui/great-ui-animated-select";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import { PropertyPill } from "@/components/ui/property-pill";
import { EntityPropertyList, EntityPropertyRow, EntitySection, EntitySheet } from "@/components/ui/entity-sheet";
import { EditableText } from "@/components/ui/editable-text";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { columnasRelacion, columnasRelacionVacias } from "@/components/ui/columnas-relacion";
import { AttachmentCount, RecordsTable, type RecordColumn } from "@/components/ui/records-table";
import { BOTON_NUEVO_CLASE, CrearRegistro, NuevoEnGrupo } from "@/components/ui/crear-registro";
import { ExportMenu } from "@/components/ui/export-menu";
import { columnasDesdeTabla } from "@/lib/export/tabla";
import { createClient } from "@/lib/supabase/client";
import { RelacionProcesoField, relacionesProcesoPorTipo } from "@/components/ui/proceso-relaciones";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { cargarCategoriasEntidad, type CategoriaGrupo } from "@/lib/relaciones/agrupar";
import { AccionesRegistro, EliminarRegistro } from "@/components/ui/eliminar-registro";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import type { PropiedadPersonalizada, PropiedadesPersonalizadasCargadas, ValoresPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { diligenciasDeProceso, hoyISO, proximaDiligencia, type DiligenciaDetectada, type NivelUrgencia } from "@/lib/procesos/diligencias";
import { CLASES_URGENCIA, formatearFechaCorta, textoDias } from "@/lib/procesos/resumen";
import { MATERIAS, MATERIA_OPCIONES } from "./opciones";
import { useOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import { colorPuntoEstados, opcionesEstadoPill, type EstadoProceso } from "@/lib/procesos/estados";
import { EditorEstadosProcesos } from "./editor-estados";
import { DiligenciasPanel, type ResponsableOpcion } from "@/components/ui/diligencias-panel";
import { cargarEventosDeProceso, type EventoProceso } from "@/lib/procesos/eventos";
import { PARTES_PROCESO, partesDeMateria, partesDeProceso, valorParte } from "@/lib/procesos/partes";
import { proximaDiligenciaRegistrada } from "@/lib/procesos/eventos";
import { FechaProximaDiligencia } from "@/components/ui/fecha-proxima-diligencia";

type Proceso = {
  id: string;
  materia: string;
  expediente: string | null;
  asunto: string | null;
  estado: string | null;
  juzgado: string | null;
  abogado: string | null;
  estudio: string | null;
  diligencia: string | null;
  descripcion: string | null;
  extra?: Record<string, unknown> | null;
};

type ProximaDiligencia = DiligenciaDetectada & { dias: number; nivel: NivelUrgencia; eventoId?: string };

export function ProcesosList({
  procesos,
  eventosPorProceso = {},
  adjuntosPorId = {},
  relacionesPorProceso = {},
  propiedadesPersonalizadas = [],
  valoresPropiedadesPorProceso = {},
  estadosProcesos = [],
  mostrarFiltroMateria = true,
  materiaFija,
  storageKey = "procesos",
  revalidar = "/procesos",
}: {
  procesos: Proceso[];
  eventosPorProceso?: Record<string, EventoProceso[]>;
  adjuntosPorId?: Record<string, number>;
  relacionesPorProceso?: Record<string, EntidadRelacion[]>;
  propiedadesPersonalizadas?: PropiedadPersonalizada[];
  valoresPropiedadesPorProceso?: ValoresPropiedadesPersonalizadas;
  estadosProcesos?: EstadoProceso[];
  /** En /procesos/materia/[materia] la materia ya está fijada por la ruta. */
  mostrarFiltroMateria?: boolean;
  /** Clave de la materia cuando la ruta ya la fija (no hay selector). Alimenta el reporte PDF. */
  materiaFija?: string;
  storageKey?: string;
  revalidar?: string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [materiaFiltro, setMateriaFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [abrirFechas, setAbrirFechas] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const fechasRef = useRef<HTMLDivElement>(null);

  // Las diligencias se extraen del texto libre (`diligencia` y `descripcion`): se
  // calculan una sola vez por lista y se reutilizan en columna y filtros.
  const proximas = useMemo(() => {
    const hoy = hoyISO();
    const mapa = new Map<string, ProximaDiligencia | null>();
    for (const proceso of procesos) mapa.set(proceso.id, proximaDiligenciaRegistrada(proceso, eventosPorProceso[proceso.id] ?? [], hoy));
    return mapa;
  }, [procesos, eventosPorProceso]);

  const estadosDisponibles = useMemo(
    () =>
      Array.from(new Set(procesos.map((p) => (p.estado ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es-PE")
      ),
    [procesos]
  );

  const colorPunto = useMemo(() => colorPuntoEstados(estadosProcesos), [estadosProcesos]);
  // Cada materia ofrece sus propios estados: se resuelven por la materia de la
  // fila (en "Todos los procesos" conviven filas de varias materias).
  const opcionesEstadoDe = useMemo(() => {
    const porMateria = new Map<string | null, ReturnType<typeof opcionesEstadoPill>>();
    return (materia: string | null) => {
      const guardadas = porMateria.get(materia);
      if (guardadas) return guardadas;
      const opciones = opcionesEstadoPill(estadosProcesos, materia);
      porMateria.set(materia, opciones);
      return opciones;
    };
  }, [estadosProcesos]);

  // Etiquetas de Materia: las del catálogo editable en cuanto alguien las
  // renombra desde "Editar propiedad"; mientras tanto, las del código.
  const materiaOpciones = useOpcionesColumna("procesos", "materia", MATERIA_OPCIONES);
  const materiaEtiquetas = useMemo(
    () => Object.fromEntries(materiaOpciones.map((opcion) => [opcion.value, opcion.label])),
    [materiaOpciones]
  );
  const etiquetaMateria = (clave: string) => materiaEtiquetas[clave] ?? MATERIAS[clave] ?? clave;

  const estadoSelectOptions: DropdownOption[] = useMemo(() => [
    { id: "__all__", label: "Todos", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(255,255,255,0.15)" /></svg> },
    ...estadosDisponibles.map((e) => ({
      id: e, label: e,
      icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill={colorPunto[e] ?? "rgba(255,255,255,0.25)"} /></svg>,
    })),
  ], [estadosDisponibles, colorPunto]);

  const materiaSelectOptions: DropdownOption[] = useMemo(() => [
    { id: "__all__", label: "Todas", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(255,255,255,0.15)" /></svg> },
    ...materiaOpciones.map((opcion) => ({
      id: opcion.value, label: opcion.label,
      icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(99,140,255,0.5)" /></svg>,
    })),
  ], [materiaOpciones]);

  const procesosFiltrados = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("es-PE");
    return procesos.filter((proceso) => {
      if (materiaFiltro && proceso.materia !== materiaFiltro) return false;
      if (estadoFiltro && proceso.estado !== estadoFiltro) return false;
      if (desde || hasta) {
        const proxima = proximas.get(proceso.id);
        if (!proxima) return false;
        if (desde && proxima.fechaISO < desde) return false;
        if (hasta && proxima.fechaISO > hasta) return false;
      }
      if (query) {
        // Las partes entran a la búsqueda: buscar a un demandado encuentra sus procesos.
        const partes = PARTES_PROCESO.map((parte) => valorParte(proceso.extra, parte.clave) ?? "").join(" ");
        const haystack = `${proceso.expediente ?? ""} ${proceso.asunto ?? ""} ${partes}`.toLocaleLowerCase("es-PE");
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [procesos, q, materiaFiltro, estadoFiltro, desde, hasta, proximas]);

  // El reporte PDF debe reflejar lo que el usuario está viendo: la materia
  // fija de la ruta (o la elegida en el selector), y el resto de filtros
  // activos de la tabla. La búsqueda de texto libre no tiene equivalente en
  // el reporte, así que no viaja — el resto sí.
  const hrefReporte = useMemo(() => {
    const materia = materiaFija || materiaFiltro;
    const params = new URLSearchParams();
    if (materia) params.set("materia", materia);
    if (estadoFiltro) params.set("estado", estadoFiltro);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const query = params.toString();
    return query ? `/procesos/reporte?${query}` : "/procesos/reporte";
  }, [materiaFija, materiaFiltro, estadoFiltro, desde, hasta]);

  const partesBase = partesDeMateria(materiaFija ?? null);
  const partesColumnas = PARTES_PROCESO.filter((parte) => partesBase.some((base) => base.clave === parte.clave) || procesos.some((proceso) => valorParte(proceso.extra, parte.clave)));

  const columns: RecordColumn<Proceso>[] = [
    {
      id: "expediente",
      label: "Expediente",
      render: (proceso) => (
        <InlineEditableText
          tabla="procesos"
          id={proceso.id}
          campo="expediente"
          valorInicial={proceso.expediente}
          revalidar={revalidar}
          placeholder="Sin expediente"
          className="min-w-[165px] font-mono text-sm font-semibold text-white/95"
          onOpen={() => setAbierto(proceso.id)}
        />
      ),
      sortValue: (proceso) => proceso.expediente,
      filterValue: (proceso) => proceso.expediente,
      stopRowClick: true,
    },
    {
      id: "proxima_diligencia",
      label: "Próxima diligencia",
      tipo: "fecha",
      tipoFijo: true,
      stopRowClick: true,
      render: (proceso) => <FechaProximaDiligencia procesoId={proceso.id} fecha={proximas.get(proceso.id)?.fechaISO} eventoId={proximas.get(proceso.id)?.eventoId} hora={proximas.get(proceso.id)?.hora} />,
      // Ordena por fecha; los procesos sin fecha detectada quedan al final.
      sortValue: (proceso) => proximas.get(proceso.id)?.fechaISO ?? "9999-12-31",
      filterValue: (proceso) => {
        const proxima = proximas.get(proceso.id);
        return proxima?.fechaISO ?? "";
      },
    },
    {
      id: "materia",
      label: "Materia",
      render: (proceso) => <PropertyPill tabla="procesos" id={proceso.id} campo="materia" valor={proceso.materia} opciones={MATERIA_OPCIONES} revalidar={revalidar} />,
      sortValue: (proceso) => proceso.materia,
      filterValue: (proceso) => etiquetaMateria(proceso.materia),
      tipo: "seleccion",
      stopRowClick: true,
      catalogoOpciones: { tabla: "procesos", campo: "materia", base: MATERIA_OPCIONES },
    },
    {
      id: "estado",
      label: "Estado",
      render: (proceso) => (
        <PropertyPill tabla="procesos" id={proceso.id} campo="estado" valor={proceso.estado} opciones={opcionesEstadoDe(proceso.materia)} gestion={{ tipo: "estado-proceso", materia: proceso.materia }} revalidar={revalidar} />
      ),
      sortValue: (proceso) => proceso.estado,
      filterValue: (proceso) => proceso.estado,
      preFillParaGrupo: (valor) => ({ estado: valor }),
      tipo: "seleccion",
      stopRowClick: true,
      editorOpcionesPersonalizado: (
        <EditorEstadosProcesos estados={estadosProcesos} materiaFija={materiaFija ?? null} etiquetaMateria={etiquetaMateria} />
      ),
    },
    {
      id: "asunto",
      label: "Asunto / Juzgado",
      render: (proceso) => (
        <div className="min-w-[210px] max-w-[320px]">
          <InlineEditableText tabla="procesos" id={proceso.id} campo="asunto" valorInicial={proceso.asunto} revalidar={revalidar} placeholder="Sin asunto" className="truncate text-xs text-white/80" />
          <InlineEditableText tabla="procesos" id={proceso.id} campo="juzgado" valorInicial={proceso.juzgado} revalidar={revalidar} placeholder="Sin juzgado" className="mt-0.5 truncate text-[10px] text-white/60" />
        </div>
      ),
      sortValue: (proceso) => proceso.asunto,
      filterValue: (proceso) => `${proceso.asunto ?? ""} ${proceso.juzgado ?? ""}`,
      stopRowClick: true,
    },
    {
      id: "abogado",
      label: "Abogado",
      render: (proceso) => <InlineEditableText tabla="procesos" id={proceso.id} campo="abogado" valorInicial={proceso.abogado} revalidar={revalidar} placeholder="—" className="text-white/85" />,
      sortValue: (proceso) => proceso.abogado,
      filterValue: (proceso) => proceso.abogado,
      stopRowClick: true,
    },
    {
      id: "estudio",
      label: "Estudio",
      render: (proceso) => <InlineEditableText tabla="procesos" id={proceso.id} campo="estudio" valorInicial={proceso.estudio} revalidar={revalidar} placeholder="—" className="text-white/85" />,
      sortValue: (proceso) => proceso.estudio,
      filterValue: (proceso) => proceso.estudio,
      stopRowClick: true,
    },
    {
      id: "diligencia",
      label: "Diligencia",
      render: (proceso) => <InlineEditableText tabla="procesos" id={proceso.id} campo="diligencia" valorInicial={proceso.diligencia} revalidar={revalidar} placeholder="—" className="min-w-[180px] text-white/85" />,
      sortValue: (proceso) => proceso.diligencia,
      filterValue: (proceso) => proceso.diligencia,
      stopRowClick: true,
    },
    {
      id: "descripcion",
      label: "Descripción",
      render: (proceso) => <InlineEditableText tabla="procesos" id={proceso.id} campo="descripcion" valorInicial={proceso.descripcion} revalidar={revalidar} placeholder="—" className="max-w-[220px] line-clamp-2 text-xs leading-5 text-white/75" />,
      sortValue: (proceso) => proceso.descripcion,
      filterValue: (proceso) => proceso.descripcion,
      stopRowClick: true,
    },
    // Partes (demandante, imputado…): las de la materia de la ruta, o todas
    // en "Todos los procesos". El panel y la ficha usan el mismo catálogo.
    ...partesColumnas.map<RecordColumn<Proceso>>((parte) => ({
      id: `extra:${parte.clave}`,
      label: parte.label,
      render: (proceso) => (
        <InlineEditableText
          tabla="procesos"
          id={proceso.id}
          campo={`extra.${parte.clave}`}
          valorInicial={valorParte(proceso.extra, parte.clave)}
          revalidar={revalidar}
          placeholder="—"
          className="min-w-[170px] max-w-[280px] whitespace-pre-wrap text-xs leading-5 text-white/80"
        />
      ),
      sortValue: (proceso) => valorParte(proceso.extra, parte.clave),
      filterValue: (proceso) => valorParte(proceso.extra, parte.clave),
      stopRowClick: true,
    })),
    ...columnasRelacion<Proceso>({ entidadTipo: "proceso", relacionesPorId: relacionesPorProceso, idDe: (proceso) => proceso.id, excluir: ["proceso"] }),
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Archivos",
      render: (proceso) => <AttachmentCount count={adjuntosPorId[proceso.id] ?? 0} />,
      sortValue: (proceso) => adjuntosPorId[proceso.id] ?? 0,
      filterValue: (proceso) => adjuntosPorId[proceso.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (proceso) => (
        <AccionesRegistro
          href={`/procesos/${proceso.id}`}
          clave="procesos"
          id={proceso.id}
          nombre={proceso.expediente ?? proceso.asunto ?? "Proceso"}
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

  const hayFiltros = q.trim() !== "" || materiaFiltro !== "" || estadoFiltro !== "" || desde !== "" || hasta !== "";

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (!fechasRef.current?.contains(e.target as Node)) setAbrirFechas(false);
    }
    if (abrirFechas) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [abrirFechas]);

  function limpiar() {
    setQ("");
    setMateriaFiltro("");
    setEstadoFiltro("");
    setDesde("");
    setHasta("");
  }

  const filtersWidth = mostrarFiltroMateria ? 489 : 322;

  const slotFiltros = (
    <div className="spotlight-filter-shell flex min-w-0 flex-1 max-w-[680px] items-center">
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
        onMouseLeave={() => { if (!q && !estadoFiltro && !materiaFiltro && !desde && !hasta) setSpotlightOpen(false); }}
      >
        <motion.div
          layout="size"
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="spotlight-search flex-1 min-w-[150px] z-10 relative overflow-hidden rounded-full"
        >
          <SuggestiveSearch value={q} onChange={setQ}
            onFocusChange={(f) => { if (f) setSpotlightOpen(true); }}
            suggestions={["Buscar expediente…", "Buscar por asunto…"]}
            effect="typewriter" typeDurationMs={600} pauseAfterTypeMs={2000}
            className="w-full" />
        </motion.div>
        <AnimatePresence>
          {spotlightOpen && (
            <motion.div key="filters-group"
              initial={{ width: 0, opacity: 0 }} animate={{ width: filtersWidth, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              className="spotlight-filters flex shrink-0 items-center gap-3">

              {/* Estados */}
              <div className="shrink-0 relative z-40">
                <AnimatedSelect placeholder="Estados" options={estadoSelectOptions}
                  width={155} triggerHeight={32} itemHeight={34} itemGap={3}
                  value={estadoFiltro || null}
                  onSelect={(opt) => setEstadoFiltro(opt.id === "__all__" ? "" : opt.id)} />
              </div>

              {/* Materia (solo cuando mostrarFiltroMateria) */}
              {mostrarFiltroMateria && (
                <div className="shrink-0 relative z-30">
                  <AnimatedSelect placeholder="Materia" options={materiaSelectOptions}
                    width={155} triggerHeight={32} itemHeight={34} itemGap={3}
                    value={materiaFiltro || null}
                    onSelect={(opt) => setMateriaFiltro(opt.id === "__all__" ? "" : opt.id)} />
                </div>
              )}

              {/* Diligencias */}
              <div ref={fechasRef} className="relative select-none shrink-0 z-20" style={{ width: 155 }}>
                <motion.div
                  className="pointer-events-none absolute left-0 overflow-hidden rounded-b-xl border-x border-b border-[#d9d4c8] bg-[#eeeadf] shadow-sm"
                  style={{ top: 32, width: 155 }}
                  initial={false}
                  animate={{ height: abrirFechas ? 130 + (desde || hasta ? 36 : 0) : 0, opacity: abrirFechas ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 28 }}
                />
                <button
                  type="button"
                  onClick={() => setAbrirFechas((v) => !v)}
                  aria-expanded={abrirFechas}
                  className={`flex h-8 w-full items-center justify-between gap-2 px-4 text-[13px] font-semibold tracking-wide transition-all duration-200 active:scale-95 ${
                    abrirFechas ? "rounded-t-xl rounded-b-none border border-neutral-200" : "rounded-full"
                  } ${
                    desde || hasta ? "border border-blue-300 bg-blue-50 text-blue-700" : "bg-[#eeeadf] text-neutral-800 hover:bg-[#e5e0d4]"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <CalendarClock className="h-4 w-4 shrink-0 text-neutral-500" />
                    <span>{desde || hasta ? `${desde ? formatearFechaCorta(desde) : "…"} – ${hasta ? formatearFechaCorta(hasta) : "…"}` : "Diligencias"}</span>
                  </span>
                </button>
                {(desde || hasta) && (
                  <button
                    type="button"
                    aria-label="Quitar rango de diligencias"
                    onClick={() => { setDesde(""); setHasta(""); }}
                    className="absolute right-2 top-1.5 z-30 flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                  >
                    ×
                  </button>
                )}
                <motion.div
                  className="absolute left-0 z-20 overflow-hidden px-3 pb-3 pt-2"
                  style={{ top: 32, width: 155 }}
                  initial={false}
                  animate={{ opacity: abrirFechas ? 1 : 0, pointerEvents: abrirFechas ? "auto" : "none" }}
                  transition={{ type: "spring", stiffness: 220, damping: 28 }}
                >
                  <p className="mb-2 text-[10px] font-medium text-neutral-400">Rango</p>
                  <div className="space-y-1.5">
                    <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Diligencias desde" className="h-8 w-full rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] px-2 text-xs text-neutral-800 outline-none focus:border-neutral-400" />
                    <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Diligencias hasta" className="h-8 w-full rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] px-2 text-xs text-neutral-800 outline-none focus:border-neutral-400" />
                  </div>
                  {(desde || hasta) && (
                    <button type="button" onClick={() => { setDesde(""); setHasta(""); setAbrirFechas(false); }} className="mt-2 w-full rounded-lg py-1.5 text-[10px] font-medium text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700">Limpiar</button>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <>
      {procesos.length === 0 ? (
        // Sin procesos no se monta la tabla, y con ella se iba el único
        // "Nuevo proceso" de la página: una materia vacía no tenía forma de
        // recibir su primer expediente.
        <div className="glass-empty">
          <Gavel className="h-10 w-10 text-white/15 mb-3" />
          <p className="text-sm font-medium text-white/45">Todavía no hay procesos aquí</p>
          <CrearRegistro
            clave="procesos"
            className={`${BOTON_NUEVO_CLASE} mt-4`}
            valoresIniciales={materiaFija ? { materia: materiaFija } : undefined}
            camposOcultos={materiaFija ? ["materia"] : []}
          />
        </div>
      ) : (
        <RecordsTable
          rows={procesosFiltrados}
          columns={columns}
          entidadTipo="proceso"
          subtipoPropiedades={materiaFija}
          subtipoPropiedadesLabel={materiaFija ? etiquetaMateria(materiaFija) : undefined}
          propiedadesIniciales={propiedadesPersonalizadas.length > 0 ? { definiciones: propiedadesPersonalizadas, valoresPorEntidad: valoresPropiedadesPorProceso } : undefined}
          slotIzquierda={slotFiltros}
          acciones={(filas) => (
            <div className="flex items-center gap-1.5">
              <CrearRegistro
                clave="procesos"
                className={BOTON_NUEVO_CLASE}
                valoresIniciales={materiaFija ? { materia: materiaFija } : undefined}
                camposOcultos={materiaFija ? ["materia"] : []}
              />
              <ExportMenu nombre="procesos-judiciales" titulo="Procesos judiciales — Inversiones Cavala" hrefPdf={hrefReporte} columnas={columnasDesdeTabla(columns)} filas={filas} />
            </div>
          )}
          rowKey={(proceso) => proceso.id}
          onRowClick={(proceso) => setAbierto(proceso.id)}
          storageKey={storageKey}
          countLabel={`${procesosFiltrados.length} proceso${procesosFiltrados.length !== 1 ? "s" : ""}${hayFiltros ? ` · filtrado de ${procesos.length}` : ""}`}
          defaultHidden={["abogado", "estudio", "diligencia", ...(materiaFija ? [] : partesColumnas.map((parte) => `extra:${parte.clave}`)), ...columnasRelacionVacias(relacionesPorProceso)]}
          nuevoEnGrupo={(grupo) => <NuevoEnGrupo clave="procesos" grupo={grupo} valoresBase={materiaFija ? { materia: materiaFija } : undefined} />}
        />
      )}

      <ProcesoSheet
        id={abierto}
        onClose={() => setAbierto(null)}
        revalidar={revalidar}
        relaciones={abierto ? relacionesPorProceso[abierto] ?? [] : []}
        propiedadesPersonalizadas={propiedadesPersonalizadas}
        valoresPersonalizados={abierto ? valoresPropiedadesPorProceso[abierto] ?? {} : {}}
        estadosProcesos={estadosProcesos}
      />
    </>
  );
}


export function ProcesoSheet({
  id,
  onClose,
  revalidar,
  relaciones,
  propiedadesPersonalizadas,
  valoresPersonalizados,
  estadosProcesos = [],
}: {
  id: string | null;
  onClose: () => void;
  revalidar: string;
  relaciones: EntidadRelacion[];
  propiedadesPersonalizadas: PropiedadPersonalizada[];
  valoresPersonalizados: Record<string, unknown>;
  estadosProcesos?: EstadoProceso[];
}) {
  const [proceso, setProceso] = useState<Record<string, any> | null>(null);
  useRegistroActualizado("procesos", id, setProceso);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [eventos, setEventos] = useState<EventoProceso[] | null>(null);
  const [responsables, setResponsables] = useState<ResponsableOpcion[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  const materiaOpciones = useOpcionesColumna("procesos", "materia", MATERIA_OPCIONES);
  const etiquetaMateria = (clave: string) => materiaOpciones.find((opcion) => opcion.value === clave)?.label ?? MATERIAS[clave] ?? clave;
  const procesoVigenteRef = useRef<string | null>(null);

  async function cargarDiligencias(procesoId: string) {
    const lista = await cargarEventosDeProceso(createClient(), procesoId, hoyISO());
    if (procesoVigenteRef.current === procesoId) setEventos(lista);
  }

  // Responsables y feriados no dependen del proceso: se leen una vez.
  useEffect(() => {
    const supabase = createClient();
    supabase.from("perfiles").select("id, nombre, correo").eq("activo", true).order("nombre").then(({ data }) =>
      setResponsables((data ?? []).map((p) => ({
        id: p.id as string,
        nombre: (p.nombre as string | null) || (p.correo as string | null) || "Sin nombre",
      })))
    );
    supabase.from("feriados").select("fecha").eq("nacional", true).then(({ data }) =>
      setFeriados((data ?? []).map((f) => f.fecha as string))
    );
  }, []);

  useEffect(() => {
    procesoVigenteRef.current = id;
    if (!id) {
      setProceso(null);
      setCategorias(null);
      setEventos(null);
      return;
    }
    setProceso(null);
    setCategorias(null);
    setEventos(null);
    void cargarDiligencias(id);
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase
      .from("procesos")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => { if (vigente) setProceso(data); });
    cargarCategoriasEntidad(supabase, "proceso", [id]).then((porId) => { if (vigente) setCategorias(porId[id] ?? []); });
    return () => {
      vigente = false;
    };
  }, [id]);

  return (
    <EntitySheet
      open={id !== null}
      onClose={onClose}
      historial={id ? { tabla: "procesos", registroId: id, titulo: proceso?.expediente ?? undefined } : undefined}
      titulo={proceso?.expediente ?? "Sin número de expediente"}
      tituloEditor={proceso ? (
        <EditableText tabla="procesos" id={proceso.id} campo="expediente" valorInicial={proceso.expediente} revalidar={revalidar} appearance="title" placeholder="Sin número de expediente" />
      ) : undefined}
      subtitulo={proceso ? etiquetaMateria(proceso.materia) : undefined}
      icono={
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/15">
          <Gavel className="h-5 w-5 text-brand-300" />
        </div>
      }
    >
      {!proceso ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : (
        <>
          <EntityPropertyList ordenKey="proceso" entidadTipo="proceso">
            <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Materia" campo="materia">
              <PropertyPill tabla="procesos" id={proceso.id} campo="materia" valor={proceso.materia} opciones={MATERIA_OPCIONES} revalidar={revalidar} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Activity className="h-3.5 w-3.5" />} label="Estado" campo="estado">
              <PropertyPill tabla="procesos" id={proceso.id} campo="estado" valor={proceso.estado} opciones={opcionesEstadoPill(estadosProcesos, proceso.materia)} gestion={{ tipo: "estado-proceso", materia: proceso.materia }} revalidar={revalidar} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<ClipboardList className="h-3.5 w-3.5" />} label="Asunto" campo="asunto">
              <EditableText tabla="procesos" id={proceso.id} campo="asunto" valorInicial={proceso.asunto} revalidar={revalidar} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Landmark className="h-3.5 w-3.5" />} label="Juzgado" campo="juzgado">
              <EditableText tabla="procesos" id={proceso.id} campo="juzgado" valorInicial={proceso.juzgado} revalidar={revalidar} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<UserRound className="h-3.5 w-3.5" />} label="Abogado" campo="abogado">
              <EditableText tabla="procesos" id={proceso.id} campo="abogado" valorInicial={proceso.abogado} revalidar={revalidar} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Building2 className="h-3.5 w-3.5" />} label="Estudio" campo="estudio">
              <EditableText tabla="procesos" id={proceso.id} campo="estudio" valorInicial={proceso.estudio} revalidar={revalidar} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<BriefcaseBusiness className="h-3.5 w-3.5" />} label="Diligencia" campo="diligencia">
              <EditableText tabla="procesos" id={proceso.id} campo="diligencia" valorInicial={proceso.diligencia} revalidar={revalidar} placeholder="—" />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CalendarClock className="h-3.5 w-3.5" />} label="Próxima diligencia" campo="proxima_diligencia">
              {eventos !== null && <FechaProximaDiligencia procesoId={proceso.id} fecha={proximaDiligenciaRegistrada(proceso, eventos)?.fechaISO} eventoId={proximaDiligenciaRegistrada(proceso, eventos)?.eventoId} hora={proximaDiligenciaRegistrada(proceso, eventos)?.hora} onCambio={() => cargarDiligencias(proceso.id)} />}
            </EntityPropertyRow>
            {partesDeProceso(proceso.materia, proceso.extra).map((parte) => (
              <EntityPropertyRow key={parte.clave} icon={<Users className="h-3.5 w-3.5" />} label={parte.label} campo={`extra:${parte.clave}`} align="start">
                <EditableText tabla="procesos" id={proceso.id} campo={`extra.${parte.clave}`} valorInicial={parte.valor} revalidar={revalidar} multiline placeholder="—" />
              </EntityPropertyRow>
            ))}
            <EntityPropertyRow icon={<Users className="h-3.5 w-3.5" />} label="Propietarios" campo="propietarios" align="start">
              <RelacionProcesoField
                procesoId={proceso.id}
                tipo="propietario"
                relaciones={relacionesProcesoPorTipo(relaciones, "propietario")}
              />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Predios" campo="predios" align="start">
              <RelacionProcesoField
                procesoId={proceso.id}
                tipo="predio"
                relaciones={relacionesProcesoPorTipo(relaciones, "predio")}
              />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Car className="h-3.5 w-3.5" />} label="Vehículos" campo="vehiculos" align="start">
              <RelacionProcesoField
                procesoId={proceso.id}
                tipo="vehiculo"
                relaciones={relacionesProcesoPorTipo(relaciones, "vehiculo")}
              />
            </EntityPropertyRow>
            <FilasPropiedadesPersonalizadas
              entidadTipo="proceso"
              subtipo={proceso.materia}
              subtipoLabel={etiquetaMateria(proceso.materia)}
              entidadId={proceso.id}
              propiedades={propiedadesPersonalizadas.filter((propiedad) => propiedad.subtipo === proceso.materia)}
              valores={valoresPersonalizados}
            />
          </EntityPropertyList>

          <DocumentosYRelaciones
            entidadTipo="proceso"
            entidadId={proceso.id}
            categorias={categorias}
            titulo="Archivos del expediente"
            permitirCrearTipo
            vistaLateral
          />

          {/* Igual que la ficha completa: diligencias reales (tabla `eventos`,
              vinculadas al proceso) + fechas detectadas en el texto. */}
          <EntitySection
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            title={`Diligencias y audiencias${eventos?.length ? ` (${eventos.length})` : ""}`}
          >
            {eventos === null ? (
              <p className="text-[12px] text-white/40">Cargando…</p>
            ) : (
              <DiligenciasPanel
                procesoId={proceso.id}
                eventos={eventos}
                detectadas={diligenciasDeProceso(proceso as { diligencia?: string | null; descripcion?: string | null })}
                hoy={hoyISO()}
                responsables={responsables}
                feriados={feriados}
                onCambio={() => cargarDiligencias(proceso.id)}
              />
            )}
          </EntitySection>

          <NotionBlockEditor
            tabla="procesos"
            id={proceso.id}
            campo="descripcion"
            valorInicial={proceso.descripcion}
            revalidar={revalidar}
            placeholder="Sin descripción registrada"
          />

          <EliminarRegistro clave="procesos" id={proceso.id} nombre={proceso.expediente ?? proceso.asunto ?? "Proceso"} onEliminado={onClose} />

          <Link href={`/procesos/${proceso.id}`} className="inline-block text-xs text-brand-300 hover:text-brand-200">
            Ver ficha completa →
          </Link>
        </>
      )}
    </EntitySheet>
  );
}
