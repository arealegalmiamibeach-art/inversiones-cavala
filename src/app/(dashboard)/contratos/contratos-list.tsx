"use client";

import { useRegistroActualizado } from "@/components/ui/use-registro-actualizado";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlertTriangle, CalendarDays, CircleDollarSign, Clock3, CornerDownRight, FileCheck2, Info, Network, PanelRightOpen, ScrollText, Tag } from "lucide-react";
import AnimatedSelect, { type DropdownOption } from "@/components/ui/great-ui-animated-select";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { EntityPropertyList, EntityPropertyRow, EntitySheet } from "@/components/ui/entity-sheet";
import { EditableText } from "@/components/ui/editable-text";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { AttachmentCount, RecordsTable, type RecordColumn } from "@/components/ui/records-table";
import { ExportMenu } from "@/components/ui/export-menu";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import { columnasDesdeTabla, descripcionFiltros } from "@/lib/export/tabla";
import { createClient } from "@/lib/supabase/client";
import { TIPO_OPCIONES, MONEDA_OPCIONES, ESTADO_BASE_OPCIONES } from "./opciones";
import { ENTIDADES, type ContratoRelacion } from "@/lib/relaciones/contratos";
import { propiedadesContrato } from "@/lib/contratos/propiedades";
import { calcularVigencia } from "@/lib/contratos/vigencia";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas, type PropiedadPersonalizada, type PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";
import { cargarCategoriasEntidad, type CategoriaGrupo } from "@/lib/relaciones/agrupar";
import { leerMarcaAdenda, type MapaAdendas } from "@/lib/contratos/adendas";
import { AdendasPanel, ClaseBadge, type AdendaResumen } from "./adendas-panel";
import { VigenciaIndicador } from "./vigencia-indicador";
import { CampoLegalizado, LEGALIZADO_OPCIONES } from "./legalizado";
import { cn } from "@/lib/utils";
import { RelacionField } from "@/components/ui/relacion-field";
import { RelacionesContratoPropiedades } from "@/components/ui/relaciones-contrato-propiedades";
import { columnasRelacionesContrato, relacionesDeColumna as filtrarRelacionesDeColumna } from "@/lib/relaciones/columnas";
import { AccionesRegistro, EliminarRegistro } from "@/components/ui/eliminar-registro";
import { BOTON_NUEVO_CLASE, CrearRegistro, NuevoEnGrupo } from "@/components/ui/crear-registro";

type Contrato = {
  id: string;
  tipo: string;
  nombre: string;
  monto: number | null;
  moneda: string | null;
  plazo: string | null;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
  legalizado: string | null;
  estado: string | null;
  notion_origen: string | null;
  extra: Record<string, unknown> | null;
  creado_en: string | null;
  actualizado_en: string | null;
};

function colorEstado(valor: string): string {
  const v = valor.toLowerCase();
  if (v.includes("vigente")) return "bg-emerald-500/15 text-emerald-300";
  if (v.includes("vencido")) return "bg-red-500/15 text-red-300";
  if (v.includes("cesad"))   return "bg-white/10 text-white/50";
  return "bg-white/10 text-white/60";
}

const REVALIDAR = "/contratos";

function VigenciaBadge({ fecha }: { fecha: string | null }) {
  const { estado, vigencia } = calcularVigencia(fecha);
  if (estado === "sin_fecha") return <span className="text-xs text-white/55">—</span>;
  const vencido = estado === "vencido";
  return (
    <span title="Fórmula calculada automáticamente con la fecha de término" className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold ${
      vencido ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200"
    }`}>
      {vencido && <AlertTriangle className="h-3 w-3" />}
      {vigencia}
    </span>
  );
}


const MAPA_ADENDAS_VACIO: MapaAdendas = { padrePorHijo: {}, hijosPorPadre: {} };


export function ContratosList({
  contratos,
  estadosDisponibles,
  count,
  adjuntosPorId = {},
  relacionesPorContrato = {},
  propiedadesDisponibles = [],
  mapaAdendas = MAPA_ADENDAS_VACIO,
  valoresBaseNuevo,
  propiedadesIniciales,
  subtipoPropiedades,
  subtipoPropiedadesLabel,
}: {
  contratos: Contrato[];
  estadosDisponibles: string[];
  count: number;
  adjuntosPorId?: Record<string, number>;
  relacionesPorContrato?: Record<string, ContratoRelacion[]>;
  propiedadesDisponibles?: { label: string; claves: string[] }[];
  mapaAdendas?: MapaAdendas;
  /** Valores fijos para el "+ Nuevo contrato" de cada grupo (p. ej. el tipo de la familia). */
  valoresBaseNuevo?: Record<string, string>;
  propiedadesIniciales?: PropiedadesPersonalizadasCargadas;
  /** Tipo (familia) fijo de la vista; sin él ("Todos los contratos") no se crean propiedades desde la tabla. */
  subtipoPropiedades?: string;
  subtipoPropiedadesLabel?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(() => new Set());
  const [qLocal, setQLocal] = useState("");
  const [estadoFiltroLocal, setEstadoFiltroLocal] = useState("");
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  const estadoOpciones: OpcionPill[] = estadosDisponibles.length > 0
    ? estadosDisponibles.map((e) => ({ value: e, label: e, className: colorEstado(e) }))
    : ESTADO_BASE_OPCIONES;

  const estadoSelectOptions: DropdownOption[] = useMemo(() => [
    { id: "__all__", label: "Todos", icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(0,0,0,0.15)" /></svg> },
    ...estadosDisponibles.map((e) => ({ id: e, label: e, icon: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 16 16" {...props}><circle cx="8" cy="8" r="5" fill="rgba(0,0,0,0.3)" /></svg> })),
  ], [estadosDisponibles]);

  const contratosFiltrados = useMemo(() => {
    const query = qLocal.trim().toLocaleLowerCase("es-PE");
    return contratos.filter((c) => {
      if (estadoFiltroLocal && c.estado !== estadoFiltroLocal) return false;
      if (query && !(c.nombre ?? "").toLocaleLowerCase("es-PE").includes(query)) return false;
      return true;
    });
  }, [contratos, qLocal, estadoFiltroLocal]);

  const hayFiltrosLocales = qLocal.trim() !== "" || estadoFiltroLocal !== "";
  const esVistaArrendamiento = valoresBaseNuevo?.tipo === "arrendamiento";

  const porId = useMemo(() => new Map(contratos.map((contrato) => [contrato.id, contrato])), [contratos]);

  const columnasRelacion = useMemo(() => columnasRelacionesContrato(Object.values(relacionesPorContrato).flat(), contratos.map((c) => c.tipo)), [contratos, relacionesPorContrato]);

  function relacionesDeColumna(contratoId: string, clave: string) {
    const columna = columnasRelacion.find((c) => c.clave === clave);
    return columna ? filtrarRelacionesDeColumna(relacionesPorContrato[contratoId] ?? [], columna) : [];
  }

  // Columnas de relación sin un solo dato en esta vista (por ejemplo
  // "Predios" en una familia que nunca vincula predios): quedan ocultas al
  // abrir la tabla, pero siguen disponibles en "Propiedades" para activarlas.
  const relacionesTotales = useMemo(() => Object.values(relacionesPorContrato).flat(), [relacionesPorContrato]);
  const columnasRelacionVacias = useMemo(
    () => columnasRelacion.filter((columna) => filtrarRelacionesDeColumna(relacionesTotales, columna).length === 0).map((columna) => `relacion:${columna.clave}`),
    [columnasRelacion, relacionesTotales]
  );

  /** Adendas del contrato que sí están cargadas en esta vista. */
  const hijosDe = useMemo(() => {
    return (id: string) =>
      (mapaAdendas.hijosPorPadre[id] ?? [])
        .map((hijoId) => porId.get(hijoId))
        .filter((hijo): hijo is Contrato => Boolean(hijo));
  }, [mapaAdendas, porId]);

  const esHijoVisible = useMemo(() => {
    return (id: string) => {
      const padre = mapaAdendas.padrePorHijo[id];
      return Boolean(padre && porId.has(padre));
    };
  }, [mapaAdendas, porId]);

  /** Le dice a la tabla de quién cuelga cada adenda, para que el orden y la agrupación no la separen de su contrato. */
  const padreClaveDe = useMemo(() => {
    return (contrato: Contrato) => (esHijoVisible(contrato.id) ? mapaAdendas.padrePorHijo[contrato.id] : null);
  }, [esHijoVisible, mapaAdendas]);

  // Las adendas no son filas de primer nivel: se insertan justo debajo de su
  // padre cuando está desplegado. Las que no tienen padre en la vista se
  // quedan en la raíz para no desaparecer de la tabla.
  const filas = useMemo(() => {
    const salida: Contrato[] = [];
    for (const contrato of contratosFiltrados) {
      if (esHijoVisible(contrato.id)) continue;
      salida.push(contrato);
      if (expandidos.has(contrato.id)) salida.push(...hijosDe(contrato.id));
    }
    return salida;
  }, [contratosFiltrados, esHijoVisible, expandidos, hijosDe]);

  const adendasTotales = contratos.reduce((suma, contrato) => suma + (esHijoVisible(contrato.id) ? 1 : 0), 0);

  function adendasDe(id: string): AdendaResumen[] {
    return hijosDe(id).map((hijo) => {
      const marca = leerMarcaAdenda(hijo.extra);
      return {
        id: hijo.id,
        nombre: hijo.nombre,
        clase: marca.clase,
        creadaEnApp: marca.creadaEnApp,
        fecha_inicio: hijo.fecha_inicio,
        fecha_vencimiento: hijo.fecha_vencimiento,
        monto: hijo.monto,
        moneda: hijo.moneda,
        adjuntos: adjuntosPorId[hijo.id] ?? 0,
      };
    });
  }

  function padreDe(id: string) {
    const padreId = mapaAdendas.padrePorHijo[id];
    const padre = padreId ? porId.get(padreId) : undefined;
    return padre ? { id: padre.id, nombre: padre.nombre } : null;
  }

  function alternar(id: string) {
    setExpandidos((actuales) => {
      const siguiente = new Set(actuales);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

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
        onMouseLeave={() => { if (!qLocal && !estadoFiltroLocal) setSpotlightOpen(false); }}
      >
        <motion.div
          layout="size"
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="spotlight-search flex-1 min-w-[150px] z-10 relative overflow-hidden rounded-full"
        >
          <SuggestiveSearch
            value={qLocal}
            onChange={setQLocal}
            onFocusChange={(f) => { if (f) setSpotlightOpen(true); }}
            suggestions={["Buscar por nombre…", "Buscar contrato…"]}
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
              animate={{ width: 155, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              className="spotlight-filters flex shrink-0 items-center"
            >
              <div className="shrink-0 relative z-40">
                <AnimatedSelect
                  placeholder="Estado"
                  options={estadoSelectOptions}
                  width={155}
                  triggerHeight={32}
                  itemHeight={34}
                  itemGap={3}
                  value={estadoFiltroLocal || null}
                  onSelect={(opt) => setEstadoFiltroLocal(opt.id === "__all__" ? "" : opt.id)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const columns: RecordColumn<Contrato>[] = [
    {
      id: "nombre",
      label: "Contrato",
      render: (contrato) => {
        const hijos = hijosDe(contrato.id);
        const anidado = esHijoVisible(contrato.id);
        const desplegado = expandidos.has(contrato.id);
        return (
          <div className={cn("flex min-w-[240px] items-start gap-1.5", anidado && "pl-5")}>
            {hijos.length > 0 ? (
              <button
                type="button"
                title={desplegado ? "Ocultar adendas" : `Ver ${hijos.length} adenda${hijos.length === 1 ? "" : "s"}`}
                onClick={(evento) => {
                  evento.stopPropagation();
                  alternar(contrato.id);
                }}
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <TrianguloDesplegable abierto={desplegado} />
              </button>
            ) : anidado ? (
              <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            {anidado && <ClaseBadge clase={leerMarcaAdenda(contrato.extra).clase} />}
            <div className={cn("min-w-0 flex-1", anidado && "opacity-85")}>
              <EditableText
                tabla="contratos"
                id={contrato.id}
                campo="nombre"
                valorInicial={contrato.nombre}
                revalidar={REVALIDAR}
                placeholder="Nombre del contrato"
                label="Nombre del contrato"
                appearance="table-title"
              />
            </div>
            {hijos.length > 0 && (
              <span className="mt-0.5 shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold text-white/60">
                {hijos.length}
              </span>
            )}
            <button
              type="button"
              title="Abrir vista lateral"
              aria-label={`Abrir ${contrato.nombre} en vista lateral`}
              onClick={(evento) => {
                evento.stopPropagation();
                setAbierto(contrato.id);
              }}
              className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-white/[0.18] bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 opacity-0 transition-all hover:border-white/30 hover:bg-white/[0.1] hover:text-white group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400/50"
            >
              <PanelRightOpen className="h-3 w-3" />
              Abrir
            </button>
          </div>
        );
      },
      sortValue: (contrato) => contrato.nombre,
      filterValue: (contrato) => contrato.nombre,
    },
    {
      id: "tipo",
      tipo: "seleccion",
      label: "Tipo",
      render: (contrato) => <PropertyPill tabla="contratos" id={contrato.id} campo="tipo" valor={contrato.tipo} opciones={TIPO_OPCIONES} revalidar={REVALIDAR} />,
      sortValue: (contrato) => contrato.tipo,
      filterValue: (contrato) => contrato.tipo,
      stopRowClick: true,
      catalogoOpciones: { tabla: "contratos", campo: "tipo", base: TIPO_OPCIONES },
    },
    {
      id: "estado",
      tipo: "seleccion",
      label: "Estado",
      render: (contrato) => (
        <PropertyPill tabla="contratos" id={contrato.id} campo="estado" valor={contrato.estado} opciones={estadoOpciones} revalidar={REVALIDAR} />
      ),
      sortValue: (contrato) => contrato.estado,
      filterValue: (contrato) => contrato.estado,
      stopRowClick: true,
      catalogoOpciones: { tabla: "contratos", campo: "estado", base: estadoOpciones },
    },
    {
      id: "moneda",
      tipo: "seleccion",
      label: "Moneda",
      render: (contrato) => (
        <PropertyPill
          tabla="contratos"
          id={contrato.id}
          campo="moneda"
          valor={contrato.moneda}
          opciones={MONEDA_OPCIONES}
          revalidar={REVALIDAR}
        />
      ),
      sortValue: (contrato) => contrato.moneda,
      filterValue: (contrato) => contrato.moneda,
      groupValue: (contrato) => contrato.moneda ?? "",
      preFillParaGrupo: (valor) => ({ moneda: valor }),
      stopRowClick: true,
      catalogoOpciones: { tabla: "contratos", campo: "moneda", base: MONEDA_OPCIONES },
    },
    {
      id: "monto",
      tipo: "numero",
      label: "Monto",
      render: (contrato) => (
        <InlineEditableText
          tabla="contratos"
          id={contrato.id}
          campo="monto"
          valorInicial={contrato.monto === null ? "" : String(contrato.monto)}
          revalidar={REVALIDAR}
          inputType="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          className="whitespace-nowrap font-mono text-xs text-white/80"
          renderValor={(valor) => Number(valor).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
        />
      ),
      sortValue: (contrato) => contrato.monto,
      filterValue: (contrato) => `${contrato.moneda ?? ""} ${contrato.monto ?? ""}`,
      stopRowClick: true,
    },
    {
      id: "inicio",
      label: "Inicio",
      tipo: "fecha",
      tipoFijo: true,
      render: (contrato) => (
        <InlineEditableText
          tabla="contratos"
          id={contrato.id}
          campo="fecha_inicio"
          valorInicial={contrato.fecha_inicio}
          revalidar={REVALIDAR}
          inputType="date"
          placeholder="—"
          className="whitespace-nowrap text-xs text-white/75"
          renderValor={(valor) => formatFecha(valor)}
        />
      ),
      sortValue: (contrato) => contrato.fecha_inicio ? new Date(contrato.fecha_inicio) : null,
      filterValue: (contrato) => contrato.fecha_inicio,
      stopRowClick: true,
    },
    {
      id: "plazo",
      label: "Plazo",
      render: (contrato) => (
        <div className="min-w-[150px] max-w-[230px]">
          <InlineEditableText
            tabla="contratos"
            id={contrato.id}
            campo="plazo"
            valorInicial={contrato.plazo}
            revalidar={REVALIDAR}
            placeholder="—"
            className="text-xs leading-5 text-white/75"
          />
        </div>
      ),
      sortValue: (contrato) => contrato.plazo,
      filterValue: (contrato) => contrato.plazo,
      stopRowClick: true,
    },
    ...(esVistaArrendamiento ? [{
      id: "vigencia",
      label: "Vigencia",
      tipo: "formula" as const,
      tipoFijo: true,
      render: (contrato: Contrato) => <VigenciaBadge fecha={contrato.fecha_vencimiento} />,
      sortValue: (contrato: Contrato) => calcularVigencia(contrato.fecha_vencimiento).estado,
      filterValue: (contrato: Contrato) => calcularVigencia(contrato.fecha_vencimiento).vigencia,
    }] : []),
    {
      id: "vencimiento",
      label: esVistaArrendamiento ? "Fecha de término" : "Fecha de vencimiento",
      tipo: "fecha",
      tipoFijo: true,
      render: (contrato) => (
        <InlineEditableText
          tabla="contratos"
          id={contrato.id}
          campo="fecha_vencimiento"
          valorInicial={contrato.fecha_vencimiento}
          revalidar={REVALIDAR}
          inputType="date"
          placeholder="—"
          renderValor={(valor) => formatFecha(valor)}
        />
      ),
      // Ordena por días restantes (los ya vencidos primero, luego los próximos a vencer).
      sortValue: (contrato) => contrato.fecha_vencimiento,
      filterValue: (contrato) => contrato.fecha_vencimiento,
      stopRowClick: true,
    },
    {
      id: "legalizado",
      label: "Legalizado",
      tipo: "seleccion",
      tipoFijo: true,
      render: (contrato) => (
        <CampoLegalizado id={contrato.id} valor={contrato.legalizado} revalidar={REVALIDAR} enTabla />
      ),
      sortValue: (contrato) => contrato.legalizado,
      filterValue: (contrato) => contrato.legalizado,
      stopRowClick: true,
      catalogoOpciones: { tabla: "contratos", campo: "legalizado", base: LEGALIZADO_OPCIONES },
    },
    ...propiedadesDisponibles.map<RecordColumn<Contrato>>((definicion) => ({
      id: `extra:${definicion.label}`,
      label: definicion.label,
      render: (contrato) => {
        const propiedad = propiedadContrato(contrato.extra, definicion.claves);
        return (
          <div className="min-w-[170px] max-w-[280px]">
            <InlineEditableText
              tabla="contratos"
              id={contrato.id}
              campo={`extra.${propiedad?.clave ?? definicion.claves[0]}`}
              valorInicial={propiedad?.valor}
              revalidar={REVALIDAR}
              placeholder="—"
              className="whitespace-pre-wrap text-xs leading-5 text-white/80"
            />
          </div>
        );
      },
      sortValue: (contrato) => valorPropiedad(contrato.extra, definicion.claves),
      filterValue: (contrato) => valorPropiedad(contrato.extra, definicion.claves),
      stopRowClick: true,
    })),
    ...columnasRelacion.map<RecordColumn<Contrato>>((columna) => ({
      id: `relacion:${columna.clave}`,
      label: columna.label,
      render: (contrato) => (
        <RelacionField entidadTipo="contrato" entidadId={contrato.id} tipo={columna.tipo} rol={columna.rol ?? null} label={columna.label} relaciones={relacionesDeColumna(contrato.id, columna.clave)} />
      ),
      sortValue: (contrato) =>
        relacionesDeColumna(contrato.id, columna.clave)
          .map((relacion) => relacion.entidadNombre)
          .join(" ") || null,
      filterValue: (contrato) =>
        relacionesDeColumna(contrato.id, columna.clave)
          .map((relacion) => `${relacion.entidadTipoLabel} ${relacion.entidadNombre}`)
          .join(" "),
      tipo: "relacion",
      tipoFijo: true,
      relacionEntidadLabel: ENTIDADES[columna.tipo]?.label,
      stopRowClick: true,
    })),
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Adjuntos",
      render: (contrato) => <AttachmentCount count={adjuntosPorId[contrato.id] ?? 0} />,
      sortValue: (contrato) => adjuntosPorId[contrato.id] ?? 0,
      filterValue: (contrato) => adjuntosPorId[contrato.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (contrato) => (
        <AccionesRegistro
          href={`/contratos/${contrato.id}`}
          clave="contratos"
          id={contrato.id}
          nombre={contrato.nombre}
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
      <RecordsTable
        rows={filas}
        columns={columns}
        entidadTipo="contrato"
        subtipoPropiedades={subtipoPropiedades}
        subtipoPropiedadesLabel={subtipoPropiedadesLabel}
        propiedadesIniciales={propiedadesIniciales}
        slotIzquierda={slotFiltros}
        acciones={(filas) => (
          <div className="flex items-center gap-1.5">
            <CrearRegistro
              clave="contratos"
              className={BOTON_NUEVO_CLASE}
              valoresIniciales={valoresBaseNuevo}
              camposOcultos={valoresBaseNuevo ? Object.keys(valoresBaseNuevo) : []}
            />
            <ExportMenu nombre="contratos" filtros={descripcionFiltros([["Búsqueda", qLocal], ["Estado", estadoFiltroLocal]])} titulo="Contratos — Inversiones Cavala" columnas={columnasDesdeTabla(columns)} filas={filas} />
          </div>
        )}
        rowKey={(contrato) => contrato.id}
        rowParentKey={padreClaveDe}
        onRowClick={(contrato) => setAbierto(contrato.id)}
        storageKey={valoresBaseNuevo?.tipo ? `contratos-${valoresBaseNuevo.tipo}` : "contratos"}
        countLabel={hayFiltrosLocales
          ? `${filas.filter((f) => !esHijoVisible(f.id)).length} contrato${filas.filter((f) => !esHijoVisible(f.id)).length !== 1 ? "s" : ""} · filtrado de ${Math.max(count - adendasTotales, 0)}`
          : countLabel(Math.max(count - adendasTotales, 0), adendasTotales)}
        defaultHidden={columnasRelacionVacias}
        nuevoEnGrupo={(grupo) => (
          <NuevoEnGrupo
            clave="contratos"
            grupo={grupo}
            valoresBase={valoresBaseNuevo}
          />
        )}
      />

      <ContratoSheet
        id={abierto}
        onClose={() => {
          setAbierto(null);
          router.refresh();
        }}
        onEliminado={() => {
          setAbierto(null);
        }}
        estadoOpciones={estadoOpciones}
        relaciones={abierto ? relacionesPorContrato[abierto] ?? [] : []}
        adendas={abierto ? adendasDe(abierto) : []}
        padre={abierto ? padreDe(abierto) : null}
      />
    </>
  );
}

function countLabel(total: number, adendas: number) {
  const base = `${total} contrato${total !== 1 ? "s" : ""}`;
  const anidadas = adendas > 0 ? ` · ${adendas} adenda${adendas !== 1 ? "s" : ""} anidada${adendas !== 1 ? "s" : ""}` : "";
  return `${base}${anidadas}`;
}

function ContratoSheet({
  id,
  onClose,
  onEliminado,
  estadoOpciones,
  relaciones,
  adendas,
  padre,
}: {
  id: string | null;
  onClose: () => void;
  onEliminado: () => void;
  estadoOpciones: OpcionPill[];
  relaciones: ContratoRelacion[];
  adendas: AdendaResumen[];
  padre: { id: string; nombre: string } | null;
}) {
  const [contrato, setContrato] = useState<Record<string, any> | null>(null);
  useRegistroActualizado("contratos", id, setContrato);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [propiedades, setPropiedades] = useState<PropiedadPersonalizada[]>([]);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!id) {
      setContrato(null);
      setCategorias(null);
      setPropiedades([]);
      setValoresPersonalizados({});
      return;
    }
    setContrato(null);
    setCategorias(null);
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase.from("contratos").select("*").eq("id", id).single().then(({ data }) => { if (vigente) setContrato(data); });
    cargarCategoriasEntidad(supabase, "contrato", [id]).then((porId) => { if (vigente) setCategorias(porId[id] ?? []); });
    return () => {
      vigente = false;
    };
  }, [id]);

  // Las propiedades dependen del tipo del contrato: se cargan una vez leído.
  useEffect(() => {
    if (!id || !contrato) return;
    let vigente = true;
    cargarPropiedadesPersonalizadas(createClient(), "contrato", [id], contrato.tipo ?? "").then((c) => {
      if (!vigente) return;
      setPropiedades(c.definiciones);
      setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contrato?.tipo es la dependencia precisa; el objeto entero causaría re-ejecuciones innecesarias
  }, [id, contrato?.tipo]);

  async function recargarPropiedades() {
    if (!id || !contrato) return;
    const c = await cargarPropiedadesPersonalizadas(createClient(), "contrato", [id], contrato.tipo ?? "");
    setPropiedades(c.definiciones);
    setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
  }

  return (
    <EntitySheet
      open={id !== null}
      onClose={onClose}
      historial={id ? { tabla: "contratos", registroId: id, titulo: contrato?.nombre ?? undefined } : undefined}
      titulo={contrato?.nombre ?? "Cargando…"}
      tituloEditor={contrato ? (
        <EditableText
          tabla="contratos"
          id={contrato.id}
          campo="nombre"
          valorInicial={contrato.nombre}
          revalidar={REVALIDAR}
          placeholder="Nombre del contrato"
          label="Nombre del contrato"
          appearance="title"
        />
      ) : undefined}
      icono={
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-500/15">
          <ScrollText className="h-5 w-5 text-teal-300" />
        </div>
      }
    >
      {!contrato ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : (
        // Sin pestañas: todo en una sola columna que baja, igual que el
        // panel de Propietarios. Adendas queda como sección plegable
        // (adendas-panel.tsx) porque puede traer una tabla larga; Archivos y
        // Notas van siempre visibles, sin ningún control de navegación encima.
        <div key={contrato.id} className="space-y-7">
          <DetalleContrato contrato={contrato} estadoOpciones={estadoOpciones} relaciones={relaciones} />

          <EntityPropertyList ordenKey="contrato" entidadTipo="contrato">
            <FilasPropiedadesPersonalizadas
              entidadTipo="contrato"
              subtipo={contrato.tipo ?? undefined}
              subtipoLabel={TIPO_OPCIONES.find((opcion) => opcion.value === contrato.tipo)?.label ?? contrato.tipo ?? undefined}
              entidadId={contrato.id}
              propiedades={propiedades}
              valores={valoresPersonalizados}
              onCreada={recargarPropiedades}
            />
          </EntityPropertyList>

          <DocumentosYRelaciones
            entidadTipo="contrato"
            entidadId={contrato.id}
            categorias={categorias}
            titulo="Documentos y relaciones"
            permitirCrearTipo
            vistaLateral
          />

          <AdendasPanel
            contratoId={contrato.id}
            contratoNombre={contrato.nombre}
            adendas={adendas}
            padre={padre}
          />

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Notas</h3>
            <NotionBlockEditor
              tabla="contratos"
              id={contrato.id}
              campo="extra.notas"
              valorInicial={typeof contrato.extra?.notas === "string" ? contrato.extra.notas : ""}
              revalidar={REVALIDAR}
            />
          </div>

          <EliminarRegistro
            clave="contratos"
            id={contrato.id}
            nombre={contrato.nombre}
            onEliminado={onEliminado}
          />

          <Link href={`/contratos/${contrato.id}`} className="inline-block text-xs text-brand-300 hover:text-brand-200">
            Ver ficha completa →
          </Link>
        </div>
      )}
    </EntitySheet>
  );
}

function DetalleContrato({
  contrato,
  estadoOpciones,
  relaciones,
}: {
  contrato: Record<string, any>;
  estadoOpciones: OpcionPill[];
  relaciones: ContratoRelacion[];
}) {
  const propiedadesImportadas = propiedadesContrato(contrato.extra);

  return (
      <EntityPropertyList ordenKey="contrato" entidadTipo="contrato">
        <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Tipo" campo="tipo">
          <PropertyPill tabla="contratos" id={contrato.id} campo="tipo" valor={contrato.tipo} opciones={TIPO_OPCIONES} revalidar={REVALIDAR} />
        </EntityPropertyRow>
        <EntityPropertyRow icon={<Activity className="h-3.5 w-3.5" />} label="Estado" campo="estado">
          <PropertyPill tabla="contratos" id={contrato.id} campo="estado" valor={contrato.estado} opciones={estadoOpciones} revalidar={REVALIDAR} />
        </EntityPropertyRow>
        <EntityPropertyRow icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Moneda" campo="moneda">
          <PropertyPill tabla="contratos" id={contrato.id} campo="moneda" valor={contrato.moneda} opciones={MONEDA_OPCIONES} revalidar={REVALIDAR} />
        </EntityPropertyRow>
        <EntityPropertyRow icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Monto" campo="monto">
          <EditableText
            tabla="contratos"
            id={contrato.id}
            campo="monto"
            valorInicial={contrato.monto === null ? "" : String(contrato.monto)}
            revalidar={REVALIDAR}
            inputType="number"
            min={0}
            step="0.01"
            placeholder="0.00"
          />
        </EntityPropertyRow>
        <EntityPropertyRow icon={<Clock3 className="h-3.5 w-3.5" />} label="Plazo" campo="plazo">
          <EditableText tabla="contratos" id={contrato.id} campo="plazo" valorInicial={contrato.plazo} revalidar={REVALIDAR} placeholder="—" />
        </EntityPropertyRow>
        <EntityPropertyRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Inicio" campo="inicio">
          <EditableText
            tabla="contratos"
            id={contrato.id}
            campo="fecha_inicio"
            valorInicial={contrato.fecha_inicio}
            revalidar={REVALIDAR}
            inputType="date"
          />
        </EntityPropertyRow>
        <EntityPropertyRow icon={<CalendarDays className="h-3.5 w-3.5" />} label={contrato.tipo === "arrendamiento" ? "Fecha de término" : "Fecha de vencimiento"} campo="vencimiento">
          <EditableText
            tabla="contratos"
            id={contrato.id}
            campo="fecha_vencimiento"
            valorInicial={contrato.fecha_vencimiento}
            revalidar={REVALIDAR}
            inputType="date"
          />
        </EntityPropertyRow>
        {contrato.tipo === "arrendamiento" && (
          <EntityPropertyRow icon={<Activity className="h-3.5 w-3.5" />} label="Vigencia" campo="vigencia">
            <VigenciaIndicador fecha={contrato.fecha_vencimiento} />
          </EntityPropertyRow>
        )}
        <EntityPropertyRow icon={<FileCheck2 className="h-3.5 w-3.5" />} label="Legalizado" campo="legalizado">
          <CampoLegalizado id={contrato.id} valor={contrato.legalizado} revalidar={REVALIDAR} />
        </EntityPropertyRow>
        {propiedadesImportadas.map((propiedad) => (
          <EntityPropertyRow key={propiedad.clave} icon={<Info className="h-3.5 w-3.5" />} label={propiedad.label} campo={`extra:${propiedad.label}`} align="start">
            <EditableText tabla="contratos" id={contrato.id} campo={`extra.${propiedad.clave}`} valorInicial={propiedad.valor} revalidar={REVALIDAR} multiline placeholder="—" />
          </EntityPropertyRow>
        ))}
        <RelacionesContratoPropiedades id={contrato.id} tipo={contrato.tipo} relaciones={relaciones} />
      </EntityPropertyList>
  );
}

function formatFecha(fecha: string | null) {
  return fecha
    ? new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : null;
}


function valorPropiedad(extra: Record<string, unknown> | null, claves: string[]) {
  return propiedadContrato(extra, claves)?.valor ?? null;
}

function propiedadContrato(extra: Record<string, unknown> | null, claves: string[]) {
  return propiedadesContrato(extra).find((propiedad) => claves.includes(propiedad.clave));
}
