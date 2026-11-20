"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FormatoCeldaContext } from "./formato-celda";
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowUpDown,
  ChevronsLeftRight,
  ArrowUp,
  ArrowUpAZ,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Copy,
  Eye,
  Filter,
  GripVertical,
  Group,
  Hash,
  Info,
  Link2,
  List,
  ListChecks,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Sigma,
  SlidersHorizontal,
  ToggleLeft,
  Trash2,
  Type,
  WrapText,
  X,
} from "lucide-react";
import {
  AgregarPropiedadPersonalizada,
  CampoPropiedadPersonalizada,
  EVENTO_CAMBIO_PROPIEDADES_PERSONALIZADAS,
  MenuNuevaPropiedad,
} from "@/components/ui/propiedades-personalizadas";
import { EditorOpcionesColumna } from "@/components/ui/editor-opciones-columna";
import { EditorOpcionesPersonalizadas } from "@/components/ui/editor-opciones-personalizadas";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import { usePropiedadesEliminadas } from "@/components/ui/propiedades-eliminadas-context";
import { notificarCambioOpcionesColumna, useEtiquetasColumnas } from "@/components/ui/opciones-columna-cliente";
import { coincideTexto } from "@/lib/registros/etiquetas-columna";
import type { OpcionPill } from "@/components/ui/property-pill";
import { convertirTipoColumna } from "@/lib/actions/tipos-columna";
import { TIPOS_CONVERTIBLES } from "@/lib/tipos-columna";
import { OPCIONES_TIPO_FECHA, type TipoFecha } from "@/lib/fechas-config";
import { createClient } from "@/lib/supabase/client";
import {
  cargarPropiedadesPersonalizadas,
  requiereSubtipo,
  valorPropiedadComoTexto,
  type PropiedadesPersonalizadasCargadas,
  type TipoEntidadPersonalizable,
} from "@/lib/propiedades/personalizadas";
import {
  actualizarDefinicionPropiedadPersonalizada,
  actualizarOpcionesPropiedadPersonalizada,
  actualizarTipoPropiedadPersonalizada,
  duplicarPropiedadPersonalizada,
  eliminarPropiedadPersonalizada,
  renombrarOpcionPropiedadPersonalizada,
  unirOpcionPropiedadPersonalizada,
} from "@/lib/actions/propiedades-personalizadas";
import { cn } from "@/lib/utils";

export type RecordColumn<Row> = {
  id: string;
  label: string;
  menuLabel?: string;
  /** Texto explicativo opcional que se muestra debajo del encabezado. */
  description?: string;
  render: (row: Row) => React.ReactNode;
  sortValue?: (row: Row) => string | number | boolean | Date | null | undefined;
  filterValue?: (row: Row) => string | number | boolean | null | undefined;
  /** Si se define, se usa para formar los grupos en lugar de filterValue. */
  groupValue?: (row: Row) => string | number | boolean | null | undefined;
  /**
   * Dado el valor del grupo (resultado de groupValue/filterValue), devuelve
   * los pares campo→valor que se pre-rellenan al crear un registro en ese grupo.
   */
  preFillParaGrupo?: (valor: unknown) => Record<string, unknown>;
  /** Valor real que debe guardarse al crear dentro de un grupo. Por defecto se usa sortValue. */
  valorCreacionGrupo?: (row: Row) => unknown;
  /** Identifica las columnas dinámicas cuyo valor vive en valores_propiedad_personalizada. */
  propiedadPersonalizadaId?: string;
  className?: string;
  headerClassName?: string;
  hideable?: boolean;
  reorderable?: boolean;
  stopRowClick?: boolean;
  /** Fuerza el tipo del campo; si se omite se detecta a partir de los valores. */
  tipo?: TipoColumna;
  /** Impide que una propiedad estructural (por ejemplo, una relación) cambie de tipo sólo en esta vista. */
  tipoFijo?: boolean;
  /**
   * Para una columna de tipo `relacion`: el nombre real de la tabla a la que
   * apunta (por ejemplo "Propietario"), cuando la propiedad tiene un nombre
   * propio distinto (un rol contractual como "Arrendatario"). El panel
   * "Editar propiedad" lo muestra junto a "Relación" para que no se confunda
   * el rol con la tabla de verdad.
   */
  relacionEntidadLabel?: string;
  /** Permite excluir una columna del menú de agrupación. */
  groupable?: boolean;
  /**
   * Editor de opciones a mostrar en el panel "Editar propiedad" cuando la
   * columna no es una propiedad personalizada pero igual tiene un catálogo
   * editable en otro lado (por ejemplo, `estado` de Procesos). Si se omite,
   * se muestra el aviso de que las opciones se cambian en el código.
   */
  editorOpcionesPersonalizado?: React.ReactNode;
  /**
   * Columna nativa de texto libre cuyo vocabulario se puede editar desde el
   * panel "Editar propiedad" (tabla `opciones_columna`). `base` son las
   * opciones que trae el código, que se siembran la primera vez que alguien
   * edita el catálogo. Sin esto, el panel avisa que las opciones las fija el
   * esquema de la tabla.
   */
  catalogoOpciones?: { tabla: string; campo: string; base: OpcionPill[] };
  /**
   * Columna nativa que se convierte de verdad entre Texto y Selección, como en
   * Notion (`COLUMNAS_CONVERTIBLES` en `lib/tipos-columna.ts`). El tipo es de
   * la propiedad y vive en la base, no en la vista: `tipo` trae el vigente y
   * `render` ya pinta según él. Cambiarlo desde "Editar propiedad" convierte
   * la columna para todos y recarga la página.
   */
  conversionTipo?: { tabla: string; campo: string };
};

/**
 * `adjuntos` y `acciones` son pseudo-tipos: no son datos que el usuario pueda
 * reinterpretar (una columna de archivos no es un número aunque su valor de
 * orden sea la cantidad), así que se declaran en la columna con `tipoFijo` y
 * quedan fuera de la lista elegible.
 */
export type TipoColumna =
  | "texto" | "numero" | "fecha" | "booleano" | "seleccion" | "multiseleccion" | "relacion" | "formula"
  | "adjuntos" | "acciones";

/** Igual que `FormatoNumero`, pero para columnas de fecha. */
type FormatoFecha = "dia_mes_anio" | "texto_corto" | "texto_largo" | "iso";

type FormatoNumero = {
  decimales?: 0 | 1 | 2 | 3;
  separador?: boolean;
  prefijo?: string;
  sufijo?: string;
};

type MetaColumna = {
  label?: string;
  tipo?: TipoColumna;
  /** Una cadena vacía permite suprimir una descripción definida por defecto. */
  description?: string;
  /** Deshace el truncado del texto para mostrar su valor completo. */
  wrap?: boolean;
  /** Permite que bloques repetidos (por ejemplo, chips de relaciones) salten de línea. Por defecto sí. */
  ajustarContenido?: boolean;
  formatoNumero?: FormatoNumero;
  formatoFecha?: FormatoFecha;
};
type MenuPropiedad = { columnId: string; top: number; left: number };
type SubmenuPropiedad = "editar" | "ordenar" | "insertar" | "insertar-izq" | "insertar-der" | "eliminar" | null;
type PosicionInsercion = "izq" | "der";

type MetricasScrollHorizontal = {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
  left: number;
  width: number;
  visible: boolean;
};

type Operador =
  | "contiene"
  | "no_contiene"
  | "igual"
  | "distinto"
  | "empieza"
  | "vacio"
  | "no_vacio"
  | "mayor"
  | "menor"
  | "entre"
  | "en";

type ActiveFilter = {
  id: string;
  columnId: string;
  /** Los filtros guardados por versiones anteriores no traen operador: se asume "contiene". */
  operador?: Operador;
  value: string;
  value2?: string;
  valores?: string[];
};

type SortRule = { id: string; columnId: string; direction: "asc" | "desc" };

type ModoAgrupacion = "ninguno" | "columna" | "personalizado";
type OrdenGrupos = "asc" | "desc" | "conteo";
type GroupConfig = {
  modo: ModoAgrupacion;
  columnId: string | null;
  orden: OrdenGrupos;
  ocultarVacios: boolean;
};

type GrupoPersonalizado = { id: string; nombre: string; color: string };
/**
 * `etiqueta` es el valor de grupo tal como lo guarda la fila (de él salen la
 * clave, el "+ Nuevo" y el orden de los registros); `titulo` es lo que se lee
 * en el encabezado cuando la columna tiene catálogo y la etiqueta vigente
 * difiere del valor guardado (`no_metal` → "No metal").
 */
type Grupo<Row> = { clave: string; etiqueta: string; titulo?: string; color?: string; filas: Row[]; valorCreacion?: unknown };

type OpenPanel = "filter" | "sort" | "columns" | "group" | null;

const MAX_VALORES_CASILLAS = 30;

const COLORES_GRUPO = ["#818cf8", "#34d399", "#fbbf24", "#f87171", "#38bdf8", "#c084fc", "#fb923c", "#4ade80"];

const ETIQUETA_OPERADOR: Record<Operador, string> = {
  contiene: "contiene",
  no_contiene: "no contiene",
  igual: "es igual a",
  distinto: "es distinto de",
  empieza: "empieza por",
  vacio: "está vacío",
  no_vacio: "no está vacío",
  mayor: "mayor que",
  menor: "menor que",
  entre: "entre",
  en: "es alguno de",
};

const ETIQUETA_TIPO_PROPIEDAD: Record<TipoColumna, string> = {
  texto: "Texto",
  numero: "Número",
  fecha: "Fecha",
  booleano: "Casilla",
  seleccion: "Selección",
  multiseleccion: "Multiselección",
  relacion: "Relación",
  formula: "Fórmula",
  adjuntos: "Archivos",
  acciones: "Acciones",
};

const TIPOS_PROPIEDAD: TipoColumna[] = ["texto", "numero", "fecha", "booleano", "seleccion", "multiseleccion", "relacion"];

const FORMATOS_FECHA: Array<{ valor: FormatoFecha; label: string; ejemplo: string }> = [
  { valor: "dia_mes_anio", label: "Numérica", ejemplo: "17/09/2026" },
  { valor: "texto_corto", label: "Mes corto", ejemplo: "17 sep 2026" },
  { valor: "texto_largo", label: "Mes largo", ejemplo: "17 de septiembre de 2026" },
  { valor: "iso", label: "ISO", ejemplo: "2026-09-17" },
];

const DECIMALES_FORMATO: Array<{ valor: FormatoNumero["decimales"]; label: string }> = [
  { valor: undefined, label: "Automático" },
  { valor: 0, label: "0" },
  { valor: 1, label: "1" },
  { valor: 2, label: "2" },
];

function IconoTipoPropiedad({ tipo, className = "h-3.5 w-3.5" }: { tipo: TipoColumna; className?: string }) {
  if (tipo === "numero") return <Hash className={className} />;
  if (tipo === "fecha") return <CalendarDays className={className} />;
  if (tipo === "booleano") return <ToggleLeft className={className} />;
  if (tipo === "seleccion") return <List className={className} />;
  if (tipo === "multiseleccion") return <ListChecks className={className} />;
  if (tipo === "relacion") return <Link2 className={className} />;
  if (tipo === "formula") return <Sigma className={className} />;
  if (tipo === "adjuntos") return <Paperclip className={className} />;
  if (tipo === "acciones") return <SlidersHorizontal className={className} />;
  return <Type className={className} />;
}

function formatearNumeroPersonalizado(valor: number, formato: FormatoNumero): string {
  const cuerpo = formato.decimales === undefined
    ? valor.toLocaleString("es-PE", { useGrouping: formato.separador !== false, maximumFractionDigits: 4 })
    : valor.toLocaleString("es-PE", {
        useGrouping: formato.separador !== false,
        minimumFractionDigits: formato.decimales,
        maximumFractionDigits: formato.decimales,
      });
  return `${formato.prefijo ?? ""}${cuerpo}${formato.sufijo ?? ""}`;
}

/**
 * Aplica el formato de fecha elegido en el menú de la propiedad. Devuelve null
 * cuando el valor crudo de la columna no es una fecha reconocible, para que la
 * celda caiga en su render original en vez de mostrar "Invalid Date".
 */
function formatearFechaPersonalizada(valor: unknown, formato: FormatoFecha): string | null {
  const texto = valor instanceof Date ? valor.toISOString() : String(valor ?? "").trim();
  if (!texto) return null;
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(texto);
  // Una fecha sin hora se interpreta en UTC y desplaza el día en Lima (-05:00).
  const fecha = soloFecha ? new Date(`${texto}T12:00:00`) : new Date(texto);
  if (Number.isNaN(fecha.getTime())) return null;
  if (formato === "iso") return fecha.toISOString().slice(0, 10);
  if (formato === "dia_mes_anio") return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (formato === "texto_corto") return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  return fecha.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
}

const CONSULTA_MOVIL = "(max-width: 767px)";

function suscribirMovil(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_MOVIL);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

/**
 * `true` en pantallas angostas (tarjetas), `false` en escritorio (tabla) y
 * `null` en el servidor. Antes se dibujaban SIEMPRE las dos vistas y el CSS
 * escondía una: el doble de nodos (Propietarios: ~18 mil, la mitad ocultos).
 */
function useEsMovil(): boolean | null {
  return useSyncExternalStore(suscribirMovil, () => window.matchMedia(CONSULTA_MOVIL).matches, () => null);
}

export function RecordsTable<Row>({
  rows,
  columns: columnasEntrada,
  rowKey,
  rowParentKey,
  onRowClick,
  storageKey,
  countLabel,
  enableFilter = true,
  defaultHidden = [],
  groupBy,
  enableGrouping = true,
  slotIzquierda,
  acciones,
  nuevoEnGrupo,
  entidadTipo,
  subtipoPropiedades,
  subtipoPropiedadesLabel,
  propiedadesIniciales,
}: {
  rows: Row[];
  columns: RecordColumn<Row>[];
  rowKey: (row: Row) => string;
  /**
   * Filas anidadas (p. ej. adendas bajo su contrato): devuelve la clave del
   * padre, o null si la fila es de primer nivel. Al ordenar o agrupar, cada hija
   * queda pegada justo debajo de su padre en vez de irse a su posición propia;
   * si el padre no está en la lista, la hija se muestra como fila normal.
   */
  rowParentKey?: (row: Row) => string | null | undefined;
  onRowClick?: (row: Row) => void;
  storageKey: string;
  countLabel: string;
  enableFilter?: boolean;
  defaultHidden?: string[];
  /** Columna por la que agrupar al abrir la tabla (luego manda la preferencia guardada). */
  groupBy?: string;
  enableGrouping?: boolean;
  /**
   * Slot izquierdo del toolbar: búsqueda, filtros de página, etc.
   * Cuando se proporciona, reemplaza el contador y el tip de reorganización.
   */
  slotIzquierda?: React.ReactNode;
  /**
   * Slot libre en la barra superior (menú de exportación, acciones de la
   * página…). Como función recibe las filas ya filtradas y ordenadas, para que
   * al exportar salga exactamente lo que el usuario está viendo.
   */
  acciones?: React.ReactNode | ((filasVisibles: Row[]) => React.ReactNode);
  /**
   * Fila de creación al pie de cada grupo (estilo "New page" de Notion).
   * Recibe los datos del grupo para prellenar el formulario con su valor.
   */
  nuevoEnGrupo?: (grupo: {
    columnId: string | null;
    valor: string;
    valorCreacion?: unknown;
    tipo?: TipoColumna;
    etiqueta: string;
    preFill?: Record<string, unknown>;
    propiedadPersonalizada?: { id: string; valor: unknown };
    onCreando?: (idTemporal: string, valores: Record<string, unknown>, asignadoAlGrupo?: boolean) => void;
    onCreado?: (id: string, valores: Record<string, unknown>, asignadoAlGrupo?: boolean, idTemporal?: string) => void;
    onCancelarCreacion?: (idTemporal: string) => void;
  }) => React.ReactNode;
  /** Activa propiedades persistentes creadas por el usuario para esta tabla. */
  entidadTipo?: TipoEntidadPersonalizable;
  /**
   * Materia/tipo fijo de esta vista (p. ej. "civil", "minuta"), cuando
   * `entidadTipo` reparte sus registros en varias tablas — ver
   * `requiereSubtipo`. Acota qué propiedades personalizadas se cargan y a
   * cuál se agrega una nueva; sin esto (vista "todas") sólo se listan, sin
   * poder crear una desde aquí.
   */
  subtipoPropiedades?: string;
  subtipoPropiedadesLabel?: string;
  /**
   * Definiciones y valores pre-cargados en el servidor. Evitan el parpadeo
   * inicial antes de que la carga cliente-side termine.
   */
  propiedadesIniciales?: PropiedadesPersonalizadasCargadas;
}) {
  const router = useRouter();
  // Propiedades nativas eliminadas (para todos, con restaurar): la columna sale
  // de la tabla igual que de la ficha lateral. Sus filtros, orden y agrupación
  // guardados se descartan solos al restaurar la vista sin ella.
  const nativas = usePropiedadesEliminadas(entidadTipo);
  const columnsBase = useMemo(
    () => nativas.eliminadas.size === 0 ? columnasEntrada : columnasEntrada.filter((column) => !nativas.eliminadas.has(column.id)),
    [columnasEntrada, nativas.eliminadas]
  );
  const columnasEliminadas = useMemo(
    () => columnasEntrada.filter((column) => nativas.eliminadas.has(column.id)),
    [columnasEntrada, nativas.eliminadas]
  );
  const esMovil = useEsMovil();
  const [restaurandoColumna, setRestaurandoColumna] = useState<string | null>(null);
  const [errorRestaurarColumna, setErrorRestaurarColumna] = useState("");
  const tableScrollId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarButtonsRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const scrollThumbRef = useRef<HTMLButtonElement>(null);
  const menuPropiedadRef = useRef<HTMLDivElement>(null);
  const insercionPendienteRef = useRef<{ id: string; referenciaId: string; posicion: PosicionInsercion } | null>(null);
  // Escape en el nombre o la descripción de la propiedad descarta lo escrito.
  // El `onBlur` que dispara ese `blur()` todavía lee el texto editado (el
  // estado se actualiza después), así que sin esta marca lo terminaba guardando.
  const descartarEdicionRef = useRef(false);
  const [order, setOrder] = useState(() => columnsBase.map((column) => column.id));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(
    defaultHidden.filter((id) => columnsBase.find((column) => column.id === id)?.hideable !== false)
  ));
  const [metaColumnas, setMetaColumnas] = useState<Record<string, MetaColumna>>({});
  const [firmaPreferenciasRestauradas, setFirmaPreferenciasRestauradas] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [menuPropiedad, setMenuPropiedad] = useState<MenuPropiedad | null>(null);
  const [submenuPropiedad, setSubmenuPropiedad] = useState<SubmenuPropiedad>(null);
  // Distancia (px) desde el borde superior del menú hasta la fila que abrió el
  // submenú, para que éste salga a la altura de esa fila, como en Notion.
  const [desfaseSubmenu, setDesfaseSubmenu] = useState(0);
  const [nombrePropiedad, setNombrePropiedad] = useState("");
  const [descripcionPropiedad, setDescripcionPropiedad] = useState("");
  const [descripcionAbierta, setDescripcionAbierta] = useState(false);
  const [descripcionPanelAbierta, setDescripcionPanelAbierta] = useState(false);
  const [procesandoMenuPropiedad, setProcesandoMenuPropiedad] = useState(false);
  const [eliminandoPropiedad, setEliminandoPropiedad] = useState(false);
  const [errorMenuPropiedad, setErrorMenuPropiedad] = useState("");
  const [eligiendoTipoFecha, setEligiendoTipoFecha] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [conjuncion, setConjuncion] = useState<"y" | "o">("y");
  const [grouping, setGrouping] = useState<GroupConfig>(() => ({
    modo: groupBy ? "columna" : "ninguno",
    columnId: groupBy ?? null,
    orden: "asc",
    ocultarVacios: false,
  }));
  const [colapsados, setColapsados] = useState<Set<string>>(() => new Set());
  const [filasCreadas, setFilasCreadas] = useState<Record<string, Row>>({});
  const [grupoForzadoPorFila, setGrupoForzadoPorFila] = useState<Record<string, string>>({});
  const [gruposPersonalizados, setGruposPersonalizados] = useState<GrupoPersonalizado[]>([]);
  const [asignaciones, setAsignaciones] = useState<Record<string, string>>({});
  const [gruposCargados, setGruposCargados] = useState(false);
  const [filaArrastrada, setFilaArrastrada] = useState<string | null>(null);
  const [grupoSobrevolado, setGrupoSobrevolado] = useState<string | null>(null);
  const [menuFila, setMenuFila] = useState<{ key: string; x: number; y: number } | null>(null);
  const [nuevoGrupo, setNuevoGrupo] = useState("");
  const [colorNuevoGrupo, setColorNuevoGrupo] = useState(COLORES_GRUPO[0]);
  const [metricasScroll, setMetricasScroll] = useState<MetricasScrollHorizontal>({
    clientWidth: 0,
    scrollWidth: 0,
    scrollLeft: 0,
    left: 0,
    width: 0,
    visible: false,
  });
  const [propiedadesPersonalizadas, setPropiedadesPersonalizadas] = useState<PropiedadesPersonalizadasCargadas>(
    () => propiedadesIniciales ?? { definiciones: [], valoresPorEntidad: {} }
  );
  const [propiedadesCargadas, setPropiedadesCargadas] = useState(() => !entidadTipo || propiedadesIniciales !== undefined);

  const rowsConCreadas = useMemo(() => {
    const idsServidor = new Set(rows.map(rowKey));
    const pendientes = Object.entries(filasCreadas)
      .filter(([id]) => !idsServidor.has(id))
      .map(([, row]) => row);
    return pendientes.length > 0 ? [...rows, ...pendientes] : rows;
  }, [filasCreadas, rowKey, rows]);

  // El selector de tipo de fecha no debe sobrevivir a cerrar o reabrir el menú.
  useEffect(() => {
    setEligiendoTipoFecha(false);
  }, [menuPropiedad, submenuPropiedad]);

  useEffect(() => {
    const idsServidor = new Set(rows.map(rowKey));
    setFilasCreadas((actuales) => {
      const entradasPendientes = Object.entries(actuales).filter(([id]) => !idsServidor.has(id));
      if (entradasPendientes.length === Object.keys(actuales).length) return actuales;
      return Object.fromEntries(entradasPendientes) as Record<string, Row>;
    });
    setGrupoForzadoPorFila((actuales) => {
      const entradasPendientes = Object.entries(actuales).filter(([id]) => !idsServidor.has(id));
      if (entradasPendientes.length === Object.keys(actuales).length) return actuales;
      return Object.fromEntries(entradasPendientes);
    });
  }, [rowKey, rows]);

  const idsPersonalizacionKey = entidadTipo
    ? rowsConCreadas.map(rowKey).filter((id) => !id.startsWith("temporal-")).join("|")
    : "";
  const recargarPropiedades = useCallback(async () => {
    if (!entidadTipo) {
      setPropiedadesPersonalizadas({ definiciones: [], valoresPorEntidad: {} });
      setPropiedadesCargadas(true);
      return;
    }
    try {
      const ids = idsPersonalizacionKey ? idsPersonalizacionKey.split("|") : [];
      const cargadas = await cargarPropiedadesPersonalizadas(createClient(), entidadTipo, ids, subtipoPropiedades);
      setPropiedadesPersonalizadas(cargadas);
    } finally {
      setPropiedadesCargadas(true);
    }
  }, [entidadTipo, idsPersonalizacionKey, subtipoPropiedades]);

  useEffect(() => {
    void recargarPropiedades();
  }, [recargarPropiedades]);

  useEffect(() => {
    if (!entidadTipo) return;
    function sincronizar(evento: Event) {
      const detalle = (evento as CustomEvent<{ entidadTipo?: string }>).detail;
      if (detalle?.entidadTipo === entidadTipo) void recargarPropiedades();
    }
    window.addEventListener(EVENTO_CAMBIO_PROPIEDADES_PERSONALIZADAS, sincronizar);
    return () => window.removeEventListener(EVENTO_CAMBIO_PROPIEDADES_PERSONALIZADAS, sincronizar);
  }, [entidadTipo, recargarPropiedades]);

  const actualizarValorPersonalizado = useCallback((entidadId: string, propiedadId: string, valor: unknown) => {
    setPropiedadesPersonalizadas((actual) => ({
      ...actual,
      valoresPorEntidad: {
        ...actual.valoresPorEntidad,
        [entidadId]: {
          ...actual.valoresPorEntidad[entidadId],
          [propiedadId]: valor,
        },
      },
    }));
  }, []);

  const columnasPersonalizadas: RecordColumn<Row>[] = useMemo(
    () => propiedadesPersonalizadas.definiciones.map((propiedad) => ({
      id: `personalizada:${propiedad.id}`,
      label: propiedad.nombre,
      description: propiedad.descripcion ?? undefined,
      render: (row) => {
        const entidadId = rowKey(row);
        return (
          <CampoPropiedadPersonalizada
            entidadId={entidadId}
            propiedad={propiedad}
            valor={propiedadesPersonalizadas.valoresPorEntidad[entidadId]?.[propiedad.id]}
            tabla
            onGuardado={(valor) => actualizarValorPersonalizado(entidadId, propiedad.id, valor)}
          />
        );
      },
      sortValue: (row) => {
        const entidadId = rowKey(row);
        return valorPropiedadComoTexto(propiedadesPersonalizadas.valoresPorEntidad[entidadId]?.[propiedad.id], propiedad.tipo);
      },
      filterValue: (row) => {
        const entidadId = rowKey(row);
        return valorPropiedadComoTexto(propiedadesPersonalizadas.valoresPorEntidad[entidadId]?.[propiedad.id], propiedad.tipo);
      },
      valorCreacionGrupo: (row) => {
        const entidadId = rowKey(row);
        const valor = propiedadesPersonalizadas.valoresPorEntidad[entidadId]?.[propiedad.id];
        if (propiedad.tipo === "relacion" && Array.isArray(valor)) {
          return valor.flatMap((item) =>
            item && typeof item === "object" && "id" in item && typeof item.id === "string" ? [item.id] : []
          );
        }
        return valor;
      },
      propiedadPersonalizadaId: propiedad.id,
      tipo: propiedad.tipo,
      tipoFijo: propiedad.tipo === "relacion",
      stopRowClick: true,
    })),
    [actualizarValorPersonalizado, propiedadesPersonalizadas, rowKey]
  );
  const columns = useMemo(() => {
    const indiceColumnasFijas = columnsBase.findIndex((column) => column.reorderable === false);
    if (columnasPersonalizadas.length === 0) return columnsBase;
    return indiceColumnasFijas < 0
      ? [...columnsBase, ...columnasPersonalizadas]
      : [
          ...columnsBase.slice(0, indiceColumnasFijas),
          ...columnasPersonalizadas,
          ...columnsBase.slice(indiceColumnasFijas),
        ];
  }, [columnsBase, columnasPersonalizadas]);

  // Borrador del panel de filtros.
  const [filterColumn, setFilterColumn] = useState<string>(
    columns.find((column) => column.filterValue || column.sortValue)?.id ?? ""
  );
  const [filterOperador, setFilterOperador] = useState<Operador>("contiene");
  const [filterValue, setFilterValue] = useState("");
  const [filterValue2, setFilterValue2] = useState("");
  const [filterValores, setFilterValores] = useState<string[]>([]);

  const columnsKey = columns.map((column) => column.id).join("|");
  const defaultHiddenKey = defaultHidden.join("|");
  const firmaPreferencias = `${storageKey}:${enableFilter ? "filtros" : "sin-filtros"}:${defaultHiddenKey}:${columnsKey}`;
  const columnsRef = useRef(columns);
  const defaultHiddenRef = useRef(defaultHidden);
  const groupByRef = useRef(groupBy);
  columnsRef.current = columns;
  defaultHiddenRef.current = defaultHidden;
  groupByRef.current = groupBy;

  useEffect(() => {
    if (!propiedadesCargadas) return;
    const currentColumns = columnsRef.current;
    const currentDefaultHidden = defaultHiddenRef.current;
    try {
      const saved = JSON.parse(localStorage.getItem(`records-view:${storageKey}`) ?? "null") as {
        esquemaRelaciones?: number;
        order?: string[];
        hidden?: string[];
        filters?: ActiveFilter[];
        conjuncion?: "y" | "o";
        sorts?: SortRule[];
        grouping?: Partial<GroupConfig>;
        colapsados?: string[];
        metaColumnas?: Record<string, MetaColumna>;
      } | null;
      const validIds = new Set(currentColumns.map((column) => column.id));
      const savedOrder = (saved?.order ?? []).filter((id) => validIds.has(id));
      const restored = [...savedOrder];
      currentColumns.forEach((column) => {
        if (!restored.includes(column.id)) restored.push(column.id);
      });
      const fixedIds = currentColumns.filter((column) => column.reorderable === false).map((column) => column.id);
      setOrder([...restored.filter((id) => !fixedIds.includes(id)), ...fixedIds]);
      const columnasNuevas = new Set(currentColumns.map((column) => column.id).filter((id) => !savedOrder.includes(id)));
      const siempreVisibles = new Set(
        currentColumns.filter((column) => column.hideable === false).map((column) => column.id)
      );
      // Una vista guardada por una versión anterior no puede mantener oculta
      // una columna que hoy es estructural (p. ej. Acciones). La regla debe
      // cumplirse en todas las variantes y no sólo al crear una vista nueva.
      const ocultasGuardadas = (saved?.hidden ?? []).filter(
        (id) => validIds.has(id) && !siempreVisibles.has(id) && (saved?.esquemaRelaciones === 2 || !id.startsWith("rel_") && !id.startsWith("relacion:"))
      );
      const ocultasPorDefecto = currentDefaultHidden.filter(
        (id) => (!saved || columnasNuevas.has(id)) && !siempreVisibles.has(id)
      );
      setHidden(new Set([...ocultasGuardadas, ...ocultasPorDefecto]));
      setMetaColumnas(Object.fromEntries(
        Object.entries(saved?.metaColumnas ?? {}).flatMap(([id, meta]) => {
          if (!validIds.has(id)) return [];
          const columna = currentColumns.find((item) => item.id === id);
          if (!columna?.propiedadPersonalizadaId) return [[id, meta]];
          // Nombre y descripción de una propiedad personalizada son globales:
          // viven en Supabase para que tabla, ficha y panel lateral coincidan.
          // Se conservan aquí sólo preferencias visuales de esta tabla.
          const preferenciasVista = { ...meta };
          delete preferenciasVista.label;
          delete preferenciasVista.description;
          return Object.keys(preferenciasVista).length > 0 ? [[id, preferenciasVista]] : [];
        })
      ));
      setFilters(enableFilter ? (saved?.filters ?? []).filter((filtro) => validIds.has(filtro.columnId)) : []);
      setConjuncion(saved?.conjuncion === "o" ? "o" : "y");
      setSorts((saved?.sorts ?? []).filter((regla) => validIds.has(regla.columnId)));
      const guardado = saved?.grouping;
      const columnaGuardada = guardado?.columnId && validIds.has(guardado.columnId) ? guardado.columnId : null;
      setGrouping({
        modo: guardado?.modo === "columna" && !columnaGuardada ? "ninguno" : guardado?.modo ?? (groupByRef.current ? "columna" : "ninguno"),
        columnId: columnaGuardada ?? groupByRef.current ?? null,
        orden: guardado?.orden ?? "asc",
        ocultarVacios: guardado?.ocultarVacios ?? false,
      });
      setColapsados(new Set(saved?.colapsados ?? []));
    } catch {
      // Una preferencia inválida no debe romper la tabla.
      setOrder(currentColumns.map((column) => column.id));
      setHidden(new Set(
        currentDefaultHidden.filter((id) => currentColumns.find((column) => column.id === id)?.hideable !== false)
      ));
      setMetaColumnas({});
    } finally {
      setFirmaPreferenciasRestauradas(firmaPreferencias);
    }
  }, [enableFilter, firmaPreferencias, propiedadesCargadas, storageKey]); // La firma evita guardar valores parciales mientras cambian las columnas.

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`records-groups:${storageKey}`) ?? "null") as {
        grupos?: GrupoPersonalizado[];
        asignaciones?: Record<string, string>;
      } | null;
      setGruposPersonalizados(saved?.grupos ?? []);
      setAsignaciones(saved?.asignaciones ?? {});
    } catch {
      setGruposPersonalizados([]);
      setAsignaciones({});
    } finally {
      setGruposCargados(true);
    }
  }, [storageKey]);

  useEffect(() => {
    function onOutside(event: PointerEvent) {
      const target = event.target as Node;
      const elemento = target instanceof Element ? target : null;
      if (
        !rootRef.current?.contains(target) &&
        !elemento?.closest("[data-cream-select-menu]") &&
        !elemento?.closest("[data-property-creation-menu]")
      ) {
        setOpenPanel(null);
      }
      if (
        !menuPropiedadRef.current?.contains(target) &&
        !elemento?.closest("[data-property-menu-trigger]") &&
        !elemento?.closest("[data-property-creation-menu]")
      ) {
        setMenuPropiedad(null);
        setSubmenuPropiedad(null);
      }
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, []);

  // Cuando las columnas personalizadas cargan de forma asíncrona, añadir sus IDs
  // al final del orden si aún no están presentes.
  // IMPORTANTE: la comprobación se hace dentro del updater funcional para leer el
  // estado actual (prev), no el snapshot de la clausura. Así se evita que dos
  // efectos que se disparan en el mismo commit (éste y el de restauración de
  // preferencias) inserten el mismo id dos veces y generen claves duplicadas.
  useEffect(() => {
    setOrder((prev) => {
      const nuevas = columns.filter((col) => !prev.includes(col.id)).map((col) => col.id);
      // "Insertar a la izquierda/derecha" y "Duplicar propiedad" dejan aquí la
      // posición exacta donde debe caer la propiedad recién creada. El efecto
      // de más arriba que restaura la vista guardada también reacciona a este
      // mismo cambio de columnas y puede haber apendizado la propiedad al
      // final antes de que este efecto corra: por eso no asumimos que la
      // propiedad pendiente está en `nuevas` — la sacamos de donde esté en
      // `prev` (si ya la pusieron al final) y la reinsertamos en su lugar.
      const pendiente = insercionPendienteRef.current;
      if (pendiente && columns.some((col) => col.id === pendiente.id)) {
        insercionPendienteRef.current = null;
        const sinPendiente = prev.filter((id) => id !== pendiente.id);
        const extra = nuevas.filter((id) => id !== pendiente.id);
        const base = [...sinPendiente, ...extra];
        const indice = base.indexOf(pendiente.referenciaId);
        const destino = indice < 0 ? base.length : pendiente.posicion === "izq" ? indice : indice + 1;
        base.splice(destino, 0, pendiente.id);
        return base;
      }
      return nuevas.length > 0 ? [...prev, ...nuevas] : prev;
    });
  }, [columns]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (firmaPreferenciasRestauradas !== firmaPreferencias) return;
    localStorage.setItem(
      `records-view:${storageKey}`,
      JSON.stringify({
        esquemaRelaciones: 2,
        order,
        hidden: Array.from(hidden),
        filters,
        conjuncion,
        sorts,
        grouping,
        colapsados: Array.from(colapsados),
        metaColumnas,
      })
    );
  }, [colapsados, conjuncion, filters, firmaPreferencias, firmaPreferenciasRestauradas, grouping, hidden, metaColumnas, order, sorts, storageKey]);

  useEffect(() => {
    if (!gruposCargados) return;
    localStorage.setItem(`records-groups:${storageKey}`, JSON.stringify({ grupos: gruposPersonalizados, asignaciones }));
  }, [asignaciones, gruposCargados, gruposPersonalizados, storageKey]);

  function etiquetaColumna(column: RecordColumn<Row>): string {
    return metaColumnas[column.id]?.label?.trim() || column.menuLabel || column.label;
  }

  function descripcionColumna(column: RecordColumn<Row>): string {
    const meta = metaColumnas[column.id];
    if (meta && Object.prototype.hasOwnProperty.call(meta, "description")) {
      return meta.description?.trim() ?? "";
    }
    return column.description?.trim() ?? "";
  }

  /**
   * Formato de número personalizado (decimales, prefijo/sufijo) elegido desde
   * el menú de la propiedad: sustituye el render por defecto de la columna
   * cuando aplica, igual que Notion aplica su "Number format" a la vista.
   */
  function renderContenidoCelda(column: RecordColumn<Row>, row: Row): React.ReactNode {
    if (column.propiedadPersonalizadaId) return column.render(row);
    const formatoFecha = metaColumnas[column.id]?.formatoFecha;
    if (formatoFecha && column.sortValue && tiposColumna.get(column.id) === "fecha") {
      const texto = formatearFechaPersonalizada(column.sortValue(row), formatoFecha);
      if (column.stopRowClick) return <FormatoCeldaContext.Provider value={(valor) => formatearFechaPersonalizada(valor, formatoFecha) ?? valor}>{column.render(row)}</FormatoCeldaContext.Provider>;
      if (texto) return <span>{texto}</span>;
    }
    const formato = metaColumnas[column.id]?.formatoNumero;
    if (formato && column.sortValue && tiposColumna.get(column.id) === "numero") {
      if (column.stopRowClick) return <FormatoCeldaContext.Provider value={(valor) => Number.isFinite(Number(valor)) ? formatearNumeroPersonalizado(Number(valor), formato) : valor}>{column.render(row)}</FormatoCeldaContext.Provider>;
      const crudo = column.sortValue(row);
      const numero = typeof crudo === "number" ? crudo : Number(crudo);
      if (crudo != null && crudo !== "" && Number.isFinite(numero)) {
        return <span>{formatearNumeroPersonalizado(numero, formato)}</span>;
      }
    }
    return column.render(row);
  }

  function nombreAccesibleFila(row: Row): string {
    const principal = visibleColumns.find((column) => column.id !== "acciones");
    const valor = principal ? String(valorTexto(principal, row)).trim() : "";
    return valor ? `Abrir detalle de ${valor}` : "Abrir detalle del registro";
  }

  function activarFilaConTeclado(event: React.KeyboardEvent, row: Row) {
    if (!onRowClick || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowClick(row);
    }
  }

  const actualizarBarraHorizontal = useCallback(() => {
    const contenedor = tableScrollRef.current;
    if (!contenedor) return;
    const rect = contenedor.getBoundingClientRect();
    const clientWidth = contenedor.clientWidth;
    const scrollWidth = contenedor.scrollWidth;
    const scrollLeft = contenedor.scrollLeft;
    const desborda = scrollWidth - clientWidth > 1;
    const visible =
      window.innerWidth >= 768 &&
      desborda &&
      rect.top < window.innerHeight - 8 &&
      rect.bottom > 8;

    setMetricasScroll((actual) => {
      const siguientes = {
        clientWidth,
        scrollWidth,
        scrollLeft,
        left: rect.left,
        width: rect.width,
        visible,
      };
      return Object.keys(siguientes).every(
        (clave) => actual[clave as keyof MetricasScrollHorizontal] === siguientes[clave as keyof MetricasScrollHorizontal]
      )
        ? actual
        : siguientes;
    });
  }, []);

  useEffect(() => {
    const contenedor = tableScrollRef.current;
    if (!contenedor) return;
    const areaPrincipal = contenedor.closest(".app-main") as HTMLElement | null;
    let frame = 0;
    const programarActualizacion = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(actualizarBarraHorizontal);
    };

    programarActualizacion();
    contenedor.addEventListener("scroll", programarActualizacion, { passive: true });
    areaPrincipal?.addEventListener("scroll", programarActualizacion, { passive: true });
    window.addEventListener("resize", programarActualizacion, { passive: true });
    const observer = new ResizeObserver(programarActualizacion);
    observer.observe(contenedor);
    if (rootRef.current) observer.observe(rootRef.current);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      contenedor.removeEventListener("scroll", programarActualizacion);
      areaPrincipal?.removeEventListener("scroll", programarActualizacion);
      window.removeEventListener("resize", programarActualizacion);
    };
  }, [actualizarBarraHorizontal, columnsKey, hidden, order, rows.length, esMovil]);

  const orderedColumns = useMemo(() => {
    const byId = new Map(columns.map((column) => [column.id, column]));
    const seen = new Set<string>();
    return order
      .filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; })
      .map((id) => byId.get(id))
      .filter((column): column is RecordColumn<Row> => Boolean(column));
  }, [columns, order]);

  // `hideable: false` es una garantía de render, incluso si localStorage trae
  // una preferencia obsoleta durante el primer render hidratado.
  const visibleColumns = orderedColumns.filter((column) => column.hideable === false || !hidden.has(column.id));
  const filterableColumns = columns.filter((column) => column.filterValue || column.sortValue);
  const sortableColumns = columns.filter((column) => column.sortValue);
  const groupableColumns = columns.filter((column) => column.groupable !== false && (column.filterValue || column.sortValue));

  const columnasPorId = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  // Etiqueta vigente de los valores de columnas con catálogo: sólo para MOSTRAR
  // (casillas y chips del filtro, encabezados de grupo); se filtra y agrupa por el valor guardado.
  const etiquetaValor = useEtiquetasColumnas(columns);
  const columnaMenuPropiedad = menuPropiedad ? columnasPorId.get(menuPropiedad.columnId) : undefined;

  /** Abre un submenú alineado con la fila que lo dispara. */
  function abrirSubmenuEnFila(evento: React.SyntheticEvent<HTMLElement>, submenu: SubmenuPropiedad) {
    const menu = menuPropiedadRef.current;
    if (menu) {
      const arriba = menu.getBoundingClientRect().top;
      const fila = evento.currentTarget.getBoundingClientRect().top;
      setDesfaseSubmenu(Math.max(0, Math.min(fila - arriba - 6, window.innerHeight - arriba - 150)));
    }
    setSubmenuPropiedad(submenu);
  }

  /** Tipo detectado por columna: manda la lista de operadores y el tipo de input. */
  const tiposColumna = useMemo(() => {
    const mapa = new Map<string, TipoColumna>();
    const muestra = rowsConCreadas.slice(0, 80);
    columns.forEach((column) => {
      // En una columna convertible manda el tipo guardado en la base: un
      // override viejo de la vista (localStorage) no puede contradecirlo.
      mapa.set(
        column.id,
        (column.tipoFijo || column.conversionTipo) && column.tipo
          ? column.tipo
          : metaColumnas[column.id]?.tipo ?? column.tipo ?? detectarTipo(column, muestra)
      );
    });
    return mapa;
  }, [columns, metaColumnas, rowsConCreadas]);

  const tipoFiltro = tiposColumna.get(filterColumn) ?? "texto";

  /** Casillas con los valores existentes: sólo cuando hay pocos distintos. */
  const valoresDistintos = useMemo(() => {
    const column = columnasPorId.get(filterColumn);
    if (!column) return null;
    const conteo = new Map<string, number>();
    for (const row of rowsConCreadas) {
      const clave = claveValor(valorTexto(column, row));
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
      if (conteo.size > MAX_VALORES_CASILLAS) return null;
    }
    return [...conteo.entries()]
      .map(([clave, total]) => ({ clave, etiqueta: clave ? etiquetaValor(column.id, clave) : "", total }))
      .sort((left, right) => right.total - left.total || compareValues(left.etiqueta, right.etiqueta));
  }, [columnasPorId, etiquetaValor, filterColumn, rowsConCreadas]);

  const operadoresDisponibles = useMemo(() => {
    const base: Operador[] = ["contiene", "no_contiene", "igual", "distinto", "empieza"];
    if (esTipoNumerico(tipoFiltro) || tipoFiltro === "fecha") base.push("mayor", "menor", "entre");
    base.push("vacio", "no_vacio");
    if (valoresDistintos) base.unshift("en");
    return base;
  }, [tipoFiltro, valoresDistintos]);

  const tipoFiltroRef = useRef(tipoFiltro);
  const hayCasillasRef = useRef(Boolean(valoresDistintos));
  tipoFiltroRef.current = tipoFiltro;
  hayCasillasRef.current = Boolean(valoresDistintos);

  useEffect(() => {
    // Al cambiar de columna se elige el operador más útil para ese campo.
    setFilterValue("");
    setFilterValue2("");
    setFilterValores([]);
    const tipo = tipoFiltroRef.current;
    setFilterOperador(hayCasillasRef.current ? "en" : esTipoNumerico(tipo) || tipo === "fecha" ? "igual" : "contiene");
  }, [filterColumn]); // Sólo al cambiar de columna: no debe reiniciarse mientras se escribe.

  const filasOrdenadas = useMemo(() => {
    const activos = filters.filter((filtro) => columnasPorId.has(filtro.columnId));
    const filtered = activos.length === 0
      ? rowsConCreadas
      : rowsConCreadas.filter((row) => {
          const evaluar = (filtro: ActiveFilter) => {
            const column = columnasPorId.get(filtro.columnId)!;
            const texto = valorTexto(column, row);
            // La etiqueta vigente también cuenta al escribir el filtro: «no metal» encuentra `no_metal`.
            return cumpleFiltro(texto, valorTipado(column, row), filtro, tiposColumna.get(column.id) ?? "texto", etiquetaValor(column.id, claveValor(texto)));
          };
          return conjuncion === "y" ? activos.every(evaluar) : activos.some(evaluar);
        });
    const reglas = sorts.filter((regla) => columnasPorId.get(regla.columnId)?.sortValue);
    if (reglas.length === 0) return filtered;
    return [...filtered].sort((left, right) => {
      for (const regla of reglas) {
        const sortValue = columnasPorId.get(regla.columnId)!.sortValue!;
        const resultado = compareValues(sortValue(left), sortValue(right)) * (regla.direction === "asc" ? 1 : -1);
        if (resultado !== 0) return resultado;
      }
      return 0;
    });
  }, [columnasPorId, conjuncion, etiquetaValor, filters, rowsConCreadas, sorts, tiposColumna]);

  // Cada familia es una fila de primer nivel seguida de sus hijas. Ordenar y
  // agrupar mueven familias enteras: una adenda nunca se separa de su contrato.
  const familias = useMemo(() => agruparFamilias(filasOrdenadas, rowKey, rowParentKey), [filasOrdenadas, rowKey, rowParentKey]);
  const visibleRows = useMemo(() => (rowParentKey ? familias.flat() : filasOrdenadas), [familias, filasOrdenadas, rowParentKey]);
  const clavesAnidadas = useMemo(
    () => new Set(rowParentKey ? familias.flatMap((familia) => familia.slice(1).map(rowKey)) : []),
    [familias, rowKey, rowParentKey]
  );

  const columnaAgrupada = grouping.columnId ? columnasPorId.get(grouping.columnId) : undefined;
  const agrupandoPorColumna = enableGrouping && grouping.modo === "columna" && Boolean(columnaAgrupada);
  const agrupandoPersonalizado = enableGrouping && grouping.modo === "personalizado";
  const agrupado = agrupandoPorColumna || agrupandoPersonalizado;

  const grupos = useMemo<Grupo<Row>[]>(() => {
    if (!agrupado) return [];
    if (agrupandoPersonalizado) {
      const porGrupo = new Map<string, Row[]>();
      gruposPersonalizados.forEach((grupo) => porGrupo.set(grupo.id, []));
      const sinGrupo: Row[] = [];
      for (const familia of familias) {
        const asignado = asignaciones[rowKey(familia[0])];
        if (asignado && porGrupo.has(asignado)) porGrupo.get(asignado)!.push(...familia);
        else sinGrupo.push(...familia);
      }
      const lista: Grupo<Row>[] = gruposPersonalizados.map((grupo) => ({
        clave: `custom:${grupo.id}`,
        etiqueta: grupo.nombre,
        color: grupo.color,
        filas: porGrupo.get(grupo.id) ?? [],
      }));
      ordenarGrupos(lista, grouping.orden);
      lista.push({ clave: "custom:sin", etiqueta: "Sin agrupar", filas: sinGrupo });
      return grouping.ocultarVacios ? lista.filter((grupo) => grupo.filas.length > 0) : lista;
    }
    const column = columnaAgrupada!;
    const porClave = new Map<string, { filas: Row[]; valorCreacion: unknown }>();
    for (const familia of familias) {
      const row = familia[0];
      const prefijoGrupo = `${column.id}:`;
      const grupoForzado = grupoForzadoPorFila[rowKey(row)];
      const clave = grupoForzado?.startsWith(prefijoGrupo)
        ? grupoForzado.slice(prefijoGrupo.length)
        : claveValor(valorGrupo(column, row));
      const actual = porClave.get(clave);
      if (actual) actual.filas.push(...familia);
      else porClave.set(clave, {
        filas: [...familia],
        valorCreacion:
          column.valorCreacionGrupo?.(row) ??
          column.groupValue?.(row) ??
          column.sortValue?.(row) ??
          valorGrupo(column, row),
      });
    }
    const conValor: Grupo<Row>[] = [];
    porClave.forEach(({ filas, valorCreacion }, clave) => {
      if (clave === "") return;
      const titulo = etiquetaValor(column.id, clave);
      conValor.push({ clave: `${column.id}:${clave}`, etiqueta: clave, titulo: titulo !== clave ? titulo : undefined, filas, valorCreacion });
    });
    ordenarGrupos(conValor, grouping.orden);
    const sinValor = porClave.get("");
    // "Sin valor" siempre cierra la lista, como en Notion.
    const lista = sinValor ? [...conValor, { clave: `${column.id}:`, etiqueta: "Sin valor", filas: sinValor.filas }] : conValor;
    return grouping.ocultarVacios ? lista.filter((grupo) => grupo.filas.length > 0) : lista;
  }, [
    agrupado,
    agrupandoPersonalizado,
    asignaciones,
    columnaAgrupada,
    etiquetaValor,
    grouping.ocultarVacios,
    grouping.orden,
    grupoForzadoPorFila,
    familias,
    gruposPersonalizados,
    rowKey,
  ]);

  const secciones = useMemo<Grupo<Row>[]>(
    () => (agrupado ? grupos : [{ clave: "__todo", etiqueta: "", filas: visibleRows }]),
    [agrupado, grupos, visibleRows]
  );

  function infoGrupo(seccion: Grupo<Row>) {
    const valor = seccion.etiqueta === "Sin valor" ? "" : seccion.etiqueta;
    const column = agrupandoPorColumna && grouping.columnId ? columnasPorId.get(grouping.columnId) : undefined;
    const valorCreacion = valor ? seccion.valorCreacion ?? valor : undefined;
    const grupoPersonalizadoId = agrupandoPersonalizado && seccion.clave !== "custom:sin"
      ? seccion.clave.slice("custom:".length)
      : null;

    function registrarFila(id: string, valores: Record<string, unknown>, asignadoAlGrupo: boolean, idAnterior?: string) {
      setFilasCreadas((actuales) => {
        const siguientes = { ...actuales };
        if (idAnterior) delete siguientes[idAnterior];
        siguientes[id] = { ...valores, id } as Row;
        return siguientes;
      });
      setAsignaciones((actuales) => {
        const siguientes = { ...actuales };
        if (idAnterior) delete siguientes[idAnterior];
        if (asignadoAlGrupo && grupoPersonalizadoId) siguientes[id] = grupoPersonalizadoId;
        return siguientes;
      });
      setGrupoForzadoPorFila((actuales) => {
        const siguientes = { ...actuales };
        if (idAnterior) delete siguientes[idAnterior];
        if (asignadoAlGrupo && agrupandoPorColumna) siguientes[id] = seccion.clave;
        return siguientes;
      });
      if (column?.propiedadPersonalizadaId && valor) {
        setPropiedadesPersonalizadas((actual) => {
          const valoresPorEntidad = { ...actual.valoresPorEntidad };
          if (idAnterior) delete valoresPorEntidad[idAnterior];
          if (asignadoAlGrupo) {
            valoresPorEntidad[id] = {
              ...valoresPorEntidad[id],
              [column.propiedadPersonalizadaId!]: valorCreacion,
            };
          }
          return { ...actual, valoresPorEntidad };
        });
      }
      setColapsados((actuales) => {
        if (!actuales.has(seccion.clave)) return actuales;
        const siguientes = new Set(actuales);
        siguientes.delete(seccion.clave);
        return siguientes;
      });
    }

    function quitarFilaTemporal(id: string) {
      setFilasCreadas((actuales) => {
        if (!actuales[id]) return actuales;
        const siguientes = { ...actuales };
        delete siguientes[id];
        return siguientes;
      });
      setAsignaciones((actuales) => {
        if (!actuales[id]) return actuales;
        const siguientes = { ...actuales };
        delete siguientes[id];
        return siguientes;
      });
      setGrupoForzadoPorFila((actuales) => {
        if (!actuales[id]) return actuales;
        const siguientes = { ...actuales };
        delete siguientes[id];
        return siguientes;
      });
      setPropiedadesPersonalizadas((actual) => {
        if (!actual.valoresPorEntidad[id]) return actual;
        const valoresPorEntidad = { ...actual.valoresPorEntidad };
        delete valoresPorEntidad[id];
        return { ...actual, valoresPorEntidad };
      });
    }

    return {
      columnId: agrupandoPorColumna ? grouping.columnId : null,
      valor,
      valorCreacion,
      tipo: column ? tiposColumna.get(column.id) : undefined,
      etiqueta: seccion.etiqueta,
      preFill: column?.preFillParaGrupo && valor ? column.preFillParaGrupo(valorCreacion) : undefined,
      propiedadPersonalizada: column?.propiedadPersonalizadaId && valor
        ? { id: column.propiedadPersonalizadaId, valor: valorCreacion }
        : undefined,
      onCreando: (idTemporal: string, valores: Record<string, unknown>, asignadoAlGrupo = true) =>
        registrarFila(idTemporal, valores, asignadoAlGrupo),
      onCreado: (id: string, valores: Record<string, unknown>, asignadoAlGrupo = true, idTemporal?: string) =>
        registrarFila(id, valores, asignadoAlGrupo, idTemporal),
      onCancelarCreacion: quitarFilaTemporal,
    };
  }

  function persistOrder(next: string[]) {
    setOrder(next);
  }

  function moveColumn(targetId: string) {
    if (!draggedColumn || draggedColumn === targetId) return;
    const next = [...order];
    const from = next.indexOf(draggedColumn);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, draggedColumn);
    persistOrder(next);
    setDraggedColumn(null);
    setDragOverColumn(null);
  }

  function toggleColumn(id: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (visibleColumns.length > 1) next.add(id);
      return next;
    });
  }

  function addFilter() {
    if (!filterColumn) return;
    const sinValor = filterOperador === "vacio" || filterOperador === "no_vacio";
    if (filterOperador === "en" && filterValores.length === 0) return;
    if (!sinValor && filterOperador !== "en" && !filterValue.trim()) return;
    if (filterOperador === "entre" && !filterValue2.trim()) return;
    setFilters((current) => [
      ...current,
      {
        id: `${filterColumn}-${Date.now()}`,
        columnId: filterColumn,
        operador: filterOperador,
        value: sinValor ? "" : filterValue.trim(),
        value2: filterOperador === "entre" ? filterValue2.trim() : undefined,
        valores: filterOperador === "en" ? filterValores : undefined,
      },
    ]);
    setFilterValue("");
    setFilterValue2("");
    setFilterValores([]);
    setOpenPanel(null);
  }

  function moverRegla(index: number, delta: number) {
    setSorts((current) => {
      const destino = index + delta;
      if (destino < 0 || destino >= current.length) return current;
      const next = [...current];
      const [regla] = next.splice(index, 1);
      next.splice(destino, 0, regla);
      return next;
    });
  }

  function alternarGrupo(clave: string) {
    setColapsados((current) => {
      const next = new Set(current);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }

  function crearGrupo(nombre: string, color: string) {
    const grupo: GrupoPersonalizado = { id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nombre, color };
    setGruposPersonalizados((current) => [...current, grupo]);
    setColapsados(new Set());
    setGrouping((current) => ({ ...current, modo: "personalizado" }));
    return grupo;
  }

  function asignarFila(key: string, grupoId: string | null) {
    setAsignaciones((current) => {
      const next = { ...current };
      if (grupoId) next[key] = grupoId;
      else delete next[key];
      return next;
    });
  }

  function eliminarGrupo(id: string) {
    setGruposPersonalizados((current) => current.filter((grupo) => grupo.id !== id));
    setAsignaciones((current) => {
      const next: Record<string, string> = {};
      Object.entries(current).forEach(([key, valor]) => {
        if (valor !== id) next[key] = valor;
      });
      return next;
    });
  }

  function abrirMenuPropiedad(
    event: React.SyntheticEvent,
    column: RecordColumn<Row>,
    submenu: SubmenuPropiedad = null
  ) {
    if (!column.label) return;
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setOpenPanel(null);
    setNombrePropiedad(metaColumnas[column.id]?.label ?? column.label);
    setDescripcionPropiedad(descripcionColumna(column));
    setDescripcionAbierta(Boolean(descripcionColumna(column)));
    setDescripcionPanelAbierta(false);
    setErrorMenuPropiedad("");
    setSubmenuPropiedad(submenu);
    setMenuPropiedad({
      columnId: column.id,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 588)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 360)),
    });
  }

  /** Autoguardado del campo de nombre embebido arriba del menú (sin cerrar el menú). */
  async function guardarDefinicionPersonalizada(column: RecordColumn<Row>, nombre: string, descripcion: string): Promise<boolean> {
    if (!column.propiedadPersonalizadaId) return false;
    setErrorMenuPropiedad("");
    const resultado = await actualizarDefinicionPropiedadPersonalizada(column.propiedadPersonalizadaId, { nombre, descripcion });
    if (!resultado.ok) {
      setErrorMenuPropiedad(resultado.error);
      return false;
    }
    setPropiedadesPersonalizadas((actual) => ({
      ...actual,
      definiciones: actual.definiciones.map((definicion) => definicion.id === column.propiedadPersonalizadaId
        ? { ...definicion, nombre, descripcion: descripcion || null }
        : definicion),
    }));
    return true;
  }

  async function guardarNombrePropiedadEnLinea(column: RecordColumn<Row>) {
    const nombre = nombrePropiedad.trim().replace(/\s+/g, " ");
    if (!nombre) { setNombrePropiedad(metaColumnas[column.id]?.label ?? column.label); return; }
    if (column.propiedadPersonalizadaId) {
      const guardada = await guardarDefinicionPersonalizada(column, nombre, descripcionColumna(column));
      if (!guardada) setNombrePropiedad(column.label);
      return;
    }
    setMetaColumnas((current) => {
      const meta = { ...current[column.id] };
      if (nombre === column.label) delete meta.label;
      else meta.label = nombre;
      const siguiente = { ...current };
      if (Object.keys(meta).length === 0) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
  }

  /** Autoguardado de la descripción embebida (se expande con el botón ⓘ). */
  async function guardarDescripcionPropiedadEnLinea(column: RecordColumn<Row>) {
    const descripcion = descripcionPropiedad.trim().replace(/\s+/g, " ");
    if (column.propiedadPersonalizadaId) {
      const guardada = await guardarDefinicionPersonalizada(column, nombrePropiedad.trim().replace(/\s+/g, " ") || column.label, descripcion);
      if (!guardada) setDescripcionPropiedad(column.description ?? "");
      return;
    }
    setMetaColumnas((current) => {
      const meta = { ...current[column.id] };
      const base = column.description?.trim() ?? "";
      if (descripcion === base) delete meta.description;
      else meta.description = descripcion;
      const siguiente = { ...current };
      if (Object.keys(meta).length === 0) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
  }

  async function guardarPropiedad(column: RecordColumn<Row>) {
    const nombre = nombrePropiedad.trim().replace(/\s+/g, " ");
    const descripcion = descripcionPropiedad.trim().replace(/\s+/g, " ");
    if (!nombre) return;
    if (column.propiedadPersonalizadaId) {
      if (await guardarDefinicionPersonalizada(column, nombre, descripcion)) {
        setMenuPropiedad(null);
        setSubmenuPropiedad(null);
      }
      return;
    }
    setMetaColumnas((current) => {
      const meta = { ...current[column.id] };
      if (nombre === column.label) delete meta.label;
      else meta.label = nombre;

      const descripcionBase = column.description?.trim() ?? "";
      if (descripcion === descripcionBase) delete meta.description;
      else meta.description = descripcion;

      const siguiente = { ...current };
      if (Object.keys(meta).length === 0) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  async function eliminarDescripcion(column: RecordColumn<Row>) {
    setDescripcionPropiedad("");
    if (column.propiedadPersonalizadaId) {
      if (await guardarDefinicionPersonalizada(column, nombrePropiedad.trim().replace(/\s+/g, " ") || column.label, "")) {
        setMenuPropiedad(null);
        setSubmenuPropiedad(null);
      }
      return;
    }
    setMetaColumnas((current) => {
      const meta = { ...current[column.id], description: "" };
      const siguiente = { ...current };
      if (!column.description && !meta.label && !meta.tipo) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  async function guardarTipoPropiedad(column: RecordColumn<Row>, tipo: TipoColumna, cerrar = true, tipoFecha?: TipoFecha) {
    if (column.tipoFijo || tipo === "adjuntos" || tipo === "acciones") return;
    if (column.conversionTipo) {
      if (tipo === tiposColumna.get(column.id)) return;
      const { tabla, campo } = column.conversionTipo;
      setErrorMenuPropiedad("");
      setProcesandoMenuPropiedad(true);
      const resultado = await convertirTipoColumna(tabla, campo, tipo);
      setProcesandoMenuPropiedad(false);
      if (!resultado.ok) { setErrorMenuPropiedad(resultado.error); return; }
      quitarTipoDeVista(column);
      // Las pastillas guardan el catálogo en caché por pestaña: sin esto no
      // verían las opciones recién sembradas.
      notificarCambioOpcionesColumna(tabla);
      router.refresh();
    } else if (column.propiedadPersonalizadaId) {
      setErrorMenuPropiedad("");
      setProcesandoMenuPropiedad(true);
      const resultado = await actualizarTipoPropiedadPersonalizada(column.propiedadPersonalizadaId, tipo, tipoFecha);
      setProcesandoMenuPropiedad(false);
      if (!resultado.ok) { setErrorMenuPropiedad(resultado.error); return; }
      setEligiendoTipoFecha(false);
      // El tipo pasa a vivir en la definición: se quita el override de la vista
      // para que no la contradiga.
      quitarTipoDeVista(column);
      await recargarPropiedades();
    } else {
      setMetaColumnas((current) => ({
        ...current,
        [column.id]: {
          ...current[column.id],
          tipo,
        },
      }));
    }
    if (!cerrar) return;
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  function quitarTipoDeVista(column: RecordColumn<Row>) {
    setMetaColumnas((current) => {
      if (!current[column.id]?.tipo) return current;
      const meta = { ...current[column.id] };
      delete meta.tipo;
      const siguiente = { ...current };
      if (Object.keys(meta).length === 0) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
  }

  function alternarWrap(column: RecordColumn<Row>) {
    setMetaColumnas((current) => {
      const meta = { ...current[column.id] };
      if (meta.wrap) delete meta.wrap;
      else meta.wrap = true;
      const siguiente = { ...current };
      if (Object.keys(meta).length === 0) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  function alternarAjusteContenido(column: RecordColumn<Row>) {
    setMetaColumnas((current) => {
      const meta = { ...current[column.id] };
      // La ausencia del valor conserva el comportamiento histórico: ajustar.
      if (meta.ajustarContenido === false) delete meta.ajustarContenido;
      else meta.ajustarContenido = false;
      const siguiente = { ...current };
      if (Object.keys(meta).length === 0) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  function guardarFormatoNumero(column: RecordColumn<Row>, formato: FormatoNumero | null) {
    const limpio: FormatoNumero = {};
    if (formato) {
      if (formato.decimales !== undefined) limpio.decimales = formato.decimales;
      if (formato.separador === false) limpio.separador = false;
      if (formato.prefijo) limpio.prefijo = formato.prefijo;
      if (formato.sufijo) limpio.sufijo = formato.sufijo;
    }
    setMetaColumnas((current) => {
      const meta = { ...current[column.id] };
      if (Object.keys(limpio).length > 0) meta.formatoNumero = limpio;
      else delete meta.formatoNumero;
      const siguiente = { ...current };
      if (Object.keys(meta).length === 0) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
  }

  function guardarFormatoFecha(column: RecordColumn<Row>, formato: FormatoFecha | null) {
    setMetaColumnas((current) => {
      const meta = { ...current[column.id] };
      if (formato) meta.formatoFecha = formato;
      else delete meta.formatoFecha;
      const siguiente = { ...current };
      if (Object.keys(meta).length === 0) delete siguiente[column.id];
      else siguiente[column.id] = meta;
      return siguiente;
    });
  }

  function definicionPersonalizada(column: RecordColumn<Row> | undefined) {
    if (!column?.propiedadPersonalizadaId) return undefined;
    return propiedadesPersonalizadas.definiciones.find((definicion) => definicion.id === column.propiedadPersonalizadaId);
  }

  async function agregarOpcionPropiedad(column: RecordColumn<Row>, opcion: string) {
    const definicion = definicionPersonalizada(column);
    if (!definicion || !opcion || definicion.opciones.includes(opcion)) return;
    setErrorMenuPropiedad("");
    setProcesandoMenuPropiedad(true);
    const resultado = await actualizarOpcionesPropiedadPersonalizada(definicion.id, [...definicion.opciones, opcion]);
    setProcesandoMenuPropiedad(false);
    if (!resultado.ok) { setErrorMenuPropiedad(resultado.error); return; }
    await recargarPropiedades();
  }

  async function quitarOpcionPropiedad(column: RecordColumn<Row>, opcion: string) {
    const definicion = definicionPersonalizada(column);
    if (!definicion) return;
    setErrorMenuPropiedad("");
    setProcesandoMenuPropiedad(true);
    const resultado = await actualizarOpcionesPropiedadPersonalizada(definicion.id, definicion.opciones.filter((item) => item !== opcion));
    setProcesandoMenuPropiedad(false);
    if (!resultado.ok) { setErrorMenuPropiedad(resultado.error); return; }
    await recargarPropiedades();
  }

  async function renombrarOpcionPropiedad(column: RecordColumn<Row>, anterior: string, nuevo: string) {
    const definicion = definicionPersonalizada(column);
    if (!definicion || !nuevo.trim() || nuevo.trim() === anterior) return;
    setErrorMenuPropiedad("");
    setProcesandoMenuPropiedad(true);
    const resultado = await renombrarOpcionPropiedadPersonalizada(definicion.id, anterior, nuevo);
    setProcesandoMenuPropiedad(false);
    if (!resultado.ok) { setErrorMenuPropiedad(resultado.error); return; }
    await recargarPropiedades();
  }

  /** Renombrar una opción con el nombre de otra que ya existe: los registros pasan a la de destino. */
  async function unirOpcionPropiedad(column: RecordColumn<Row>, origen: string, destino: string) {
    const definicion = definicionPersonalizada(column);
    if (!definicion || !origen || !destino || origen === destino) return;
    setErrorMenuPropiedad("");
    setProcesandoMenuPropiedad(true);
    const resultado = await unirOpcionPropiedadPersonalizada(definicion.id, origen, destino);
    setProcesandoMenuPropiedad(false);
    if (!resultado.ok) { setErrorMenuPropiedad(resultado.error); return; }
    await recargarPropiedades();
  }

  async function ordenarOpcionesPropiedad(column: RecordColumn<Row>, opciones: string[]) {
    const definicion = definicionPersonalizada(column);
    if (!definicion) return;
    setErrorMenuPropiedad("");
    setProcesandoMenuPropiedad(true);
    const resultado = await actualizarOpcionesPropiedadPersonalizada(definicion.id, opciones);
    setProcesandoMenuPropiedad(false);
    if (!resultado.ok) { setErrorMenuPropiedad(resultado.error); return; }
    await recargarPropiedades();
  }

  async function duplicarColumnaPersonalizada(column: RecordColumn<Row>) {
    if (!column.propiedadPersonalizadaId) return;
    setErrorMenuPropiedad("");
    setProcesandoMenuPropiedad(true);
    const resultado = await duplicarPropiedadPersonalizada(column.propiedadPersonalizadaId);
    setProcesandoMenuPropiedad(false);
    if (!resultado.ok) { setErrorMenuPropiedad(resultado.error); return; }
    insercionPendienteRef.current = { id: `personalizada:${resultado.id}`, referenciaId: column.id, posicion: "der" };
    await recargarPropiedades();
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  async function eliminarColumnaPersonalizada(column: RecordColumn<Row>) {
    if (!column.propiedadPersonalizadaId || eliminandoPropiedad) return;
    setErrorMenuPropiedad("");
    setEliminandoPropiedad(true);
    const resultado = await eliminarPropiedadPersonalizada(column.propiedadPersonalizadaId);
    setEliminandoPropiedad(false);
    if (!resultado.ok) {
      setErrorMenuPropiedad(resultado.error);
      return;
    }
    setPropiedadesPersonalizadas((actual) => ({
      ...actual,
      definiciones: actual.definiciones.filter((definicion) => definicion.id !== column.propiedadPersonalizadaId),
    }));
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  /**
   * Una columna nativa se puede eliminar (para todos, con restaurar) salvo el
   * título —la primera columna, como en Notion— y las estructurales: las que
   * no se pueden ocultar, Archivos y Acciones.
   */
  function esNativaEliminable(column: RecordColumn<Row>) {
    return nativas.puedeAdministrar
      && !column.propiedadPersonalizadaId
      && column.hideable !== false
      && column.tipo !== "adjuntos"
      && column.tipo !== "acciones"
      && column.id !== columnasEntrada[0]?.id;
  }

  async function eliminarColumnaNativa(column: RecordColumn<Row>) {
    if (eliminandoPropiedad) return;
    setErrorMenuPropiedad("");
    setEliminandoPropiedad(true);
    const resultado = await nativas.eliminar(column.id);
    setEliminandoPropiedad(false);
    if (!resultado.ok) {
      setErrorMenuPropiedad(resultado.error);
      return;
    }
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  async function restaurarColumnaNativa(column: RecordColumn<Row>) {
    if (restaurandoColumna) return;
    setErrorRestaurarColumna("");
    setRestaurandoColumna(column.id);
    const resultado = await nativas.restaurar(column.id);
    setRestaurandoColumna(null);
    if (!resultado.ok) setErrorRestaurarColumna(resultado.error);
  }

  function propiedadInsertada(id: string, referenciaId: string, posicion: PosicionInsercion) {
    insercionPendienteRef.current = { id: `personalizada:${id}`, referenciaId, posicion };
    void recargarPropiedades();
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  function filtrarPorPropiedad(column: RecordColumn<Row>) {
    setFilterColumn(column.id);
    setOpenPanel("filter");
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
  }

  function resetView() {
    setOrder(columns.map((column) => column.id));
    setHidden(new Set(
      defaultHidden.filter((id) => columns.find((column) => column.id === id)?.hideable !== false)
    ));
    setFilters([]);
    setConjuncion("y");
    setSorts([]);
    // Vuelve a la agrupación con la que abre la tabla (`groupBy`), no a "sin
    // agrupar": si no, restablecer perdía para siempre la vista por defecto.
    setGrouping({ modo: groupBy ? "columna" : "ninguno", columnId: groupBy ?? null, orden: "asc", ocultarVacios: false });
    setColapsados(new Set());
    setMetaColumnas({});
    setMenuPropiedad(null);
    setSubmenuPropiedad(null);
    setOpenPanel(null);
  }

  // "Modificada" es distinta de la vista con la que abre la tabla: las
  // columnas que `defaultHidden` oculta y la agrupación de `groupBy` no
  // cuentan como cambio (antes el botón de restablecer quedaba siempre a la vista).
  const ocultasPorDefecto = defaultHidden.filter((id) => columnasPorId.get(id)?.hideable !== false && columnasPorId.has(id));
  const ocultasSonLasDeDefecto = hidden.size === ocultasPorDefecto.length && ocultasPorDefecto.every((id) => hidden.has(id));
  const agrupacionPorDefecto = groupBy
    ? grouping.modo === "columna" && grouping.columnId === groupBy
    : grouping.modo === "ninguno";
  const vistaModificada =
    filters.length > 0 ||
    sorts.length > 0 ||
    !ocultasSonLasDeDefecto ||
    !agrupacionPorDefecto ||
    grouping.orden !== "asc" ||
    grouping.ocultarVacios ||
    Object.keys(metaColumnas).length > 0 ||
    order.some((id, index) => id !== columns[index]?.id);

  const columnasTabla = visibleColumns.length + (agrupandoPersonalizado ? 1 : 0);
  const anchoPistaScroll = Math.max(metricasScroll.width - 16, 0);
  const anchoPulgarScroll = metricasScroll.scrollWidth > 0
    ? Math.min(
        anchoPistaScroll,
        Math.max(64, anchoPistaScroll * (metricasScroll.clientWidth / metricasScroll.scrollWidth))
      )
    : 0;
  const recorridoPulgarScroll = Math.max(anchoPistaScroll - anchoPulgarScroll, 0);
  const maximoScrollHorizontal = Math.max(metricasScroll.scrollWidth - metricasScroll.clientWidth, 0);
  const posicionPulgarScroll = maximoScrollHorizontal > 0
    ? (metricasScroll.scrollLeft / maximoScrollHorizontal) * recorridoPulgarScroll
    : 0;

  function asignarScrollHorizontal(scrollLeft: number) {
    if (!tableScrollRef.current) return;
    tableScrollRef.current.scrollLeft = Math.max(0, Math.min(maximoScrollHorizontal, scrollLeft));
    actualizarBarraHorizontal();
  }

  function desplazarDesdePista(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("[data-scroll-thumb]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const posicion = Math.max(0, Math.min(recorridoPulgarScroll, event.clientX - rect.left - anchoPulgarScroll / 2));
    const proporcion = recorridoPulgarScroll > 0 ? posicion / recorridoPulgarScroll : 0;
    asignarScrollHorizontal(proporcion * maximoScrollHorizontal);
  }

  function iniciarArrastreScroll(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const inicioX = event.clientX;
    const inicioScroll = tableScrollRef.current?.scrollLeft ?? 0;
    const pointerId = event.pointerId;
    scrollThumbRef.current?.setPointerCapture(pointerId);

    const mover = (movimiento: PointerEvent) => {
      const proporcion = recorridoPulgarScroll > 0 ? maximoScrollHorizontal / recorridoPulgarScroll : 0;
      asignarScrollHorizontal(inicioScroll + (movimiento.clientX - inicioX) * proporcion);
    };
    const terminar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", terminar);
      window.removeEventListener("pointercancel", terminar);
      if (scrollThumbRef.current?.hasPointerCapture(pointerId)) scrollThumbRef.current.releasePointerCapture(pointerId);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", terminar);
    window.addEventListener("pointercancel", terminar);
  }

  function abrirMenuFila(event: React.MouseEvent, key: string) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuFila({ key, x: Math.min(rect.right, window.innerWidth - 16), y: rect.bottom + 4 });
  }

  function grupoDeFila(key: string) {
    const id = asignaciones[key];
    return gruposPersonalizados.find((grupo) => grupo.id === id) ?? null;
  }

  function propsArrastreFila(key: string) {
    if (!agrupandoPersonalizado) return {};
    return {
      draggable: true,
      onDragStart: (event: React.DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
        setFilaArrastrada(key);
      },
      onDragEnd: () => {
        setFilaArrastrada(null);
        setGrupoSobrevolado(null);
      },
    };
  }

  function propsSoltarEnGrupo(clave: string) {
    if (!agrupandoPersonalizado) return {};
    return {
      onDragOver: (event: React.DragEvent) => {
        if (!filaArrastrada) return;
        event.preventDefault();
        setGrupoSobrevolado(clave);
      },
      onDragLeave: () => setGrupoSobrevolado((actual) => (actual === clave ? null : actual)),
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        const key = event.dataTransfer.getData("text/plain") || filaArrastrada;
        if (key) asignarFila(key, clave === "custom:sin" ? null : clave.slice("custom:".length));
        setFilaArrastrada(null);
        setGrupoSobrevolado(null);
      },
    };
  }

  return (
    <div ref={rootRef} className="records-card relative overflow-visible text-white/90">
      <div className="flex min-h-[48px] flex-col items-stretch justify-between gap-2 border-b border-white/[0.08] px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-1.5">
        {slotIzquierda ?? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden items-center gap-1 text-[9px] font-medium text-white/60 lg:inline-flex">
              <GripVertical className="h-3 w-3 text-brand-300" />
              Arrastra los encabezados para reorganizar
            </span>
          </div>
        )}
        <div className="relative grid grid-cols-2 items-center gap-1.5 sm:flex" ref={toolbarButtonsRef}>
          {enableFilter && <ViewButton active={filters.length > 0} panelKey="filter" currentPanel={openPanel} icon={<Filter className="h-3.5 w-3.5" />} label={`Filtrar${filters.length > 0 ? ` · ${filters.length}` : ""}`} onClick={() => setOpenPanel(openPanel === "filter" ? null : "filter")} />}
          <ViewButton active={sorts.length > 0} panelKey="sort" currentPanel={openPanel} icon={sorts[0]?.direction === "desc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />} label={`Ordenar${sorts.length > 1 ? ` · ${sorts.length}` : ""}`} onClick={() => setOpenPanel(openPanel === "sort" ? null : "sort")} />
          {enableGrouping && <ViewButton active={grouping.modo !== "ninguno"} panelKey="group" currentPanel={openPanel} icon={<Group className="h-3.5 w-3.5" />} label="Agrupar" onClick={() => setOpenPanel(openPanel === "group" ? null : "group")} />}
          <ViewButton active={hidden.size > 0} panelKey="columns" currentPanel={openPanel} icon={<Columns3 className="h-3.5 w-3.5" />} label={`Propiedades${hidden.size > 0 ? ` · ${hidden.size} ocultas` : ""}`} onClick={() => setOpenPanel(openPanel === "columns" ? null : "columns")} />
          {acciones && (
            <div className="col-span-2 flex items-center justify-center sm:col-span-1">
              {typeof acciones === "function" ? acciones(visibleRows) : acciones}
            </div>
          )}
          {vistaModificada && (
            <button type="button" onClick={resetView} title="Restablecer vista" className="view-btn col-span-2 flex h-8 items-center justify-center rounded-full bg-[#eeeadf] text-neutral-500 transition-all duration-200 hover:bg-[#e5e0d4] hover:text-neutral-800 active:scale-95 sm:col-span-1 sm:w-8 [&:hover_svg]:rotate-[-360deg] [&_svg]:transition-transform [&_svg]:duration-500">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.1] px-5 py-2.5">
          {filters.map((filter, index) => {
            const column = columnasPorId.get(filter.columnId);
            const operador = filter.operador ?? "contiene";
            return (
              <span key={filter.id} className="inline-flex items-center gap-1.5">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => setConjuncion((actual) => (actual === "y" ? "o" : "y"))}
                    title="Cambiar entre Y / O"
                    className="rounded-md border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white/70 hover:bg-white/[0.09] hover:text-white"
                  >
                    {conjuncion === "y" ? "Y" : "O"}
                  </button>
                )}
                <span className="filter-chip inline-flex items-center gap-1.5 rounded-lg border border-brand-400/12 bg-brand-500/8 px-2 py-1 text-[9px] text-brand-100/75">
                  <span className="font-medium text-white/65">{column ? etiquetaColumna(column) : filter.columnId}</span>
                  {ETIQUETA_OPERADOR[operador]}
                  {operador === "en" && <span className="max-w-[14rem] truncate">{(filter.valores ?? []).map((valor) => (valor ? etiquetaValor(filter.columnId, valor) : "Sin valor")).join(", ")}</span>}
                  {operador !== "en" && operador !== "vacio" && operador !== "no_vacio" && (
                    <span>&ldquo;{filter.value}&rdquo;{operador === "entre" ? ` y "${filter.value2 ?? ""}"` : ""}</span>
                  )}
                  <button type="button" onClick={() => setFilters((current) => current.filter((item) => item.id !== filter.id))} className="rounded-full p-0.5 text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white"><X className="h-3 w-3" /></button>
                </span>
              </span>
            );
          })}
          <button type="button" onClick={() => setFilters([])} className="ml-1 rounded-md px-1.5 py-0.5 text-[9px] text-white/55 underline-offset-2 hover:text-white hover:underline">Quitar todos</button>
        </div>
      )}

      <AnimatePresence>
      {openPanel && (
        <motion.div
          key={openPanel}
          initial={{ opacity: 0, y: -8, scaleY: 0.92 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          exit={{ opacity: 0, y: -8, scaleY: 0.92 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          style={panelPosition(openPanel, toolbarButtonsRef.current, rootRef.current)}
          className="light-panel fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[75] max-h-[70dvh] origin-top overflow-y-auto rounded-xl border border-[#d9d4c8] bg-[#eeeadf] p-4 shadow-sm sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-[48px] sm:z-50 sm:w-[320px]"
        >
          {openPanel === "filter" && (
            <ViewPanel title="Filtros" description="Combina varias condiciones para afinar la búsqueda.">
              {filters.length > 1 && (
                <div className="grid grid-cols-2 gap-1.5">
                  <DirectionButton active={conjuncion === "y"} label="Cumplen todas (Y)" detail="Más preciso" onClick={() => setConjuncion("y")} />
                  <DirectionButton active={conjuncion === "o"} label="Cumple alguna (O)" detail="Más amplio" onClick={() => setConjuncion("o")} />
                </div>
              )}
              <CreamSelect
                value={filterColumn}
                onChange={setFilterColumn}
                options={filterableColumns.map((column) => ({ value: column.id, label: etiquetaColumna(column) }))}
              />
              <CreamSelect
                value={filterOperador}
                onChange={(value) => setFilterOperador(value as Operador)}
                options={operadoresDisponibles.map((operador) => ({ value: operador, label: ETIQUETA_OPERADOR[operador] }))}
              />
              {filterOperador === "en" && valoresDistintos && (
                <div className="max-h-[228px] space-y-0.5 overflow-y-auto rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] p-1">
                  {valoresDistintos.map(({ clave, etiqueta, total }) => {
                    const marcado = filterValores.includes(clave);
                    return (
                      <button
                        key={clave || "__sin"}
                        type="button"
                        onClick={() => setFilterValores((current) => (marcado ? current.filter((valor) => valor !== clave) : [...current, clave]))}
                        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-neutral-100"
                      >
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", marcado ? "border-blue-400/60 bg-blue-100 text-blue-600" : "border-neutral-300 text-transparent")}>
                          <Check className="h-2.5 w-2.5" />
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate text-[11px]", clave ? "text-neutral-800" : "italic text-neutral-400")}>{etiqueta || "Sin valor"}</span>
                        <span className="shrink-0 text-[8px] text-neutral-400">{total}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {filterOperador !== "en" && filterOperador !== "vacio" && filterOperador !== "no_vacio" && (
                <input
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addFilter()}
                  type={inputTipo(tipoFiltro, filterOperador)}
                  placeholder={esTipoNumerico(tipoFiltro) ? "Valor numérico…" : "Valor…"}
                  className="view-control"
                  autoFocus
                />
              )}
              {filterOperador === "entre" && (
                <input
                  value={filterValue2}
                  onChange={(event) => setFilterValue2(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addFilter()}
                  type={inputTipo(tipoFiltro, filterOperador)}
                  placeholder="…y este valor"
                  className="view-control"
                />
              )}
              <button type="button" onClick={addFilter} className="mt-1 w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-[11px] font-semibold tracking-wide text-[#eeeadf] transition-colors hover:bg-neutral-700 hover:text-[#fffdf7]">Añadir filtro</button>
              {filters.length > 0 && <button type="button" onClick={() => setFilters([])} className="w-full rounded-lg px-3 py-1.5 text-[10px] text-neutral-400 transition-colors duration-200 hover:bg-neutral-100 hover:text-neutral-700">Quitar todos los filtros</button>}
            </ViewPanel>
          )}
          {openPanel === "sort" && (
            <ViewPanel title="Ordenar registros" description="Apila criterios: primero A, luego B. Detecta texto, números y fechas.">
              {sorts.length > 0 && (
                <div className="space-y-1">
                  {sorts.map((regla, index) => {
                    const column = columnasPorId.get(regla.columnId);
                    return (
                      <div key={regla.id} className="flex items-center gap-1 rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] px-1.5 py-1">
                        <span className="w-8 shrink-0 text-[8px] uppercase text-neutral-400">{index === 0 ? "1º" : `${index + 1}º`}</span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-800">{column ? etiquetaColumna(column) : regla.columnId}</span>
                        <button
                          type="button"
                          onClick={() => setSorts((current) => current.map((item) => (item.id === regla.id ? { ...item, direction: item.direction === "asc" ? "desc" : "asc" } : item)))}
                          title={regla.direction === "asc" ? "Ascendente" : "Descendente"}
                          className="rounded-md px-1 py-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                        >
                          {regla.direction === "asc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                        </button>
                        <button type="button" onClick={() => moverRegla(index, -1)} disabled={index === 0} className="rounded-md px-1 py-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800 disabled:opacity-25"><ChevronDown className="h-3 w-3 rotate-180" /></button>
                        <button type="button" onClick={() => moverRegla(index, 1)} disabled={index === sorts.length - 1} className="rounded-md px-1 py-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800 disabled:opacity-25"><ChevronDown className="h-3 w-3" /></button>
                        <button type="button" onClick={() => setSorts((current) => current.filter((item) => item.id !== regla.id))} className="rounded-md px-1 py-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800"><X className="h-3 w-3" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              <CreamSelect
                value=""
                placeholder={sorts.length === 0 ? "Ordenar por…" : "Añadir otro criterio…"}
                onChange={(columnId) => {
                  if (!columnId) return;
                  setSorts((current) => [...current, { id: `${columnId}-${Date.now()}`, columnId, direction: "asc" }]);
                }}
                options={sortableColumns
                  .filter((column) => !sorts.some((regla) => regla.columnId === column.id))
                  .map((column) => ({ value: column.id, label: etiquetaColumna(column) }))}
              />
              <p className="px-1 text-[9px] leading-4 text-neutral-400">También puedes ordenar desde el menú de cada encabezado.</p>
              {sorts.length > 0 && <button type="button" onClick={() => setSorts([])} className="w-full rounded-lg px-3 py-1.5 text-[10px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700">Quitar orden</button>}
            </ViewPanel>
          )}
          {openPanel === "group" && enableGrouping && (
            <ViewPanel title="Agrupar registros" description="Divide la tabla en secciones plegables, como en Notion.">
              <CreamSelect
                value={grouping.modo === "columna" ? grouping.columnId ?? "" : ""}
                placeholder="Sin agrupación por columna"
                onChange={(columnId) => {
                  setColapsados(new Set());
                  setGrouping((current) => (columnId ? { ...current, modo: "columna", columnId } : { ...current, modo: "ninguno" }));
                }}
                options={[
                  { value: "", label: "Sin agrupación por columna" },
                  ...groupableColumns.map((column) => ({ value: column.id, label: etiquetaColumna(column) })),
                ]}
              />
              <div className="grid grid-cols-3 gap-1.5">
                <OrdenGrupoButton active={grouping.orden === "asc"} label="A–Z" onClick={() => setGrouping((current) => ({ ...current, orden: "asc" }))} />
                <OrdenGrupoButton active={grouping.orden === "desc"} label="Z–A" onClick={() => setGrouping((current) => ({ ...current, orden: "desc" }))} />
                <OrdenGrupoButton active={grouping.orden === "conteo"} label="Por conteo" onClick={() => setGrouping((current) => ({ ...current, orden: "conteo" }))} />
              </div>
              <button
                type="button"
                onClick={() => setGrouping((current) => ({ ...current, ocultarVacios: !current.ocultarVacios }))}
                className="flex w-full items-center gap-2 rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] px-2.5 py-2 text-left hover:bg-[#e9e4d8]"
              >
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", grouping.ocultarVacios ? "border-blue-400/60 bg-blue-100 text-blue-600" : "border-neutral-300 text-transparent")}>
                  <Check className="h-2.5 w-2.5" />
                </span>
                <span className="text-[11px] text-neutral-700">Ocultar grupos vacíos</span>
              </button>

              <div className="rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] p-1.5">
                <div className="flex items-center justify-between px-1 pb-1">
                  <span className="text-[10px] font-medium text-neutral-600">Mis grupos</span>
                  {gruposPersonalizados.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setColapsados(new Set());
                        setGrouping((current) => ({ ...current, modo: current.modo === "personalizado" ? "ninguno" : "personalizado" }));
                      }}
                      className="text-[9px] text-blue-500 hover:text-blue-700"
                    >
                      {grouping.modo === "personalizado" ? "Desactivar" : "Usar mis grupos"}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {gruposPersonalizados.map((grupo) => (
                    <div key={grupo.id} className="flex items-center gap-1.5 rounded-md border border-[#d9d4c8] bg-[#eeeadf] px-1.5 py-1">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: grupo.color }} />
                      <input
                        value={grupo.nombre}
                        onChange={(event) => setGruposPersonalizados((current) => current.map((item) => (item.id === grupo.id ? { ...item, nombre: event.target.value } : item)))}
                        className="min-w-0 flex-1 bg-transparent text-[11px] text-neutral-800 outline-none"
                      />
                      <button type="button" onClick={() => eliminarGrupo(grupo.id)} title="Eliminar grupo" className="rounded px-1 py-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                  {gruposPersonalizados.length === 0 && <p className="px-1 pb-1 text-[9px] leading-4 text-neutral-400">Crea grupos propios y arrastra filas a su encabezado, o usa el botón de etiqueta de cada fila.</p>}
                </div>
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex flex-wrap gap-1 px-1">
                    {COLORES_GRUPO.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setColorNuevoGrupo(color)}
                        title="Color del grupo"
                        className={cn("h-4 w-4 rounded-full border transition-transform", colorNuevoGrupo === color ? "scale-110 border-white/80" : "border-white/15")}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={nuevoGrupo}
                      onChange={(event) => setNuevoGrupo(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || !nuevoGrupo.trim()) return;
                        crearGrupo(nuevoGrupo.trim(), colorNuevoGrupo);
                        setNuevoGrupo("");
                      }}
                      placeholder="Nombre del nuevo grupo…"
                      className="view-control flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nombre = nuevoGrupo.trim() || `Grupo ${gruposPersonalizados.length + 1}`;
                        crearGrupo(nombre, colorNuevoGrupo);
                        setNuevoGrupo("");
                      }}
                      title="Nuevo grupo"
                      className="flex w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-[#eeeadf] hover:bg-neutral-700 hover:text-[#fffdf7]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              {grouping.modo !== "ninguno" && (
                <button type="button" onClick={() => { setColapsados(new Set()); setGrouping((current) => ({ ...current, modo: "ninguno" })); }} className="w-full rounded-lg px-3 py-1.5 text-[10px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700">Quitar agrupación</button>
              )}
            </ViewPanel>
          )}
          {openPanel === "columns" && (
            <ViewPanel title="Propiedades de la tabla" description="Elige qué campos quieres ver. Tu configuración queda guardada en esta tabla.">
              <div className="flex items-center justify-between rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] px-2.5 py-2 text-[9px] text-neutral-500">
                <span>{visibleColumns.length} de {columns.length} visibles</span>
                <span className="inline-flex items-center gap-1"><GripVertical className="h-3 w-3 text-neutral-400" /> Arrastra para ordenar</span>
              </div>
              <div className="max-h-[390px] space-y-1 overflow-y-auto pr-0.5">
                {orderedColumns.map((column) => (
                  <div
                    key={column.id}
                    draggable={column.reorderable !== false}
                    onDragStart={() => setDraggedColumn(column.id)}
                    onDragEnd={() => { setDraggedColumn(null); setDragOverColumn(null); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveColumn(column.id)}
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-1.5 py-1 transition-colors",
                      hidden.has(column.id)
                        ? "border-transparent bg-transparent"
                        : "border-[#d9d4c8] bg-[#f7f4eb]",
                      draggedColumn === column.id && "opacity-45",
                      column.reorderable === false ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                    )}
                  >
                    {column.reorderable !== false
                      ? <GripVertical className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
                      : <span className="w-3.5" />}
                    <button
                      type="button"
                      onClick={() => column.hideable !== false && toggleColumn(column.id)}
                      disabled={column.hideable === false}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-neutral-100 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        hidden.has(column.id)
                          ? "border-neutral-300 bg-transparent text-transparent"
                          : "border-blue-400/60 bg-blue-100 text-blue-600"
                      )}>
                        {column.hideable === false
                          ? <Eye className="h-2.5 w-2.5 text-neutral-400" />
                          : <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-[11px]", hidden.has(column.id) ? "text-neutral-400" : "text-neutral-800")}>{etiquetaColumna(column)}</span>
                        <span className="mt-0.5 block truncate text-[8px] text-neutral-400">
                          {descripcionColumna(column) || "Sin descripción"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[8px] text-neutral-400">
                        {column.hideable === false ? "Siempre visible" : hidden.has(column.id) ? "Oculta" : "Visible"}
                      </span>
                    </button>
                    <button
                      type="button"
                      data-property-menu-trigger
                      draggable={false}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => abrirMenuPropiedad(event, column, "editar")}
                      title={descripcionColumna(column) ? "Editar o eliminar descripción" : "Agregar descripción"}
                      aria-label={`${descripcionColumna(column) ? "Editar" : "Agregar"} descripción de ${etiquetaColumna(column)}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {(column.id.startsWith("personalizada:") || esNativaEliminable(column)) && (
                      <button
                        type="button"
                        data-property-menu-trigger
                        draggable={false}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => abrirMenuPropiedad(event, column, "eliminar")}
                        title="Eliminar propiedad"
                        aria-label={`Eliminar propiedad ${etiquetaColumna(column)}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-400/70 transition-colors hover:bg-red-100 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {nativas.puedeAdministrar && columnasEliminadas.length > 0 && (
                <div className="mt-2 border-t border-neutral-200 pt-2">
                  <p className="mb-1 px-1.5 text-[9px] font-medium uppercase tracking-wide text-neutral-400">Eliminadas</p>
                  <div className="space-y-1">
                    {columnasEliminadas.map((column) => (
                      <div key={column.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
                        <Trash2 className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-400 line-through">{column.menuLabel ?? column.label}</span>
                        <button
                          type="button"
                          disabled={restaurandoColumna !== null}
                          onClick={() => void restaurarColumnaNativa(column)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-50"
                        >
                          {restaurandoColumna === column.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                          Restaurar
                        </button>
                      </div>
                    ))}
                  </div>
                  {errorRestaurarColumna && <p className="mt-1 px-1.5 text-[9px] leading-4 text-red-600">{errorRestaurarColumna}</p>}
                </div>
              )}
              {entidadTipo && (
                <div className="mt-2 border-t border-neutral-200 pt-2">
                  <AgregarPropiedadPersonalizada entidadTipo={entidadTipo} subtipo={subtipoPropiedades} subtipoLabel={subtipoPropiedadesLabel} onCreada={recargarPropiedades} />
                </div>
              )}
            </ViewPanel>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* En el servidor (esMovil === null) se dibuja sólo la tabla, visible en
          cualquier ancho para que el móvil no quede en blanco antes de hidratar;
          al hidratar en un teléfono se cambia por las tarjetas. */}
      {esMovil !== true && (
      <div id={tableScrollId} ref={tableScrollRef} className="records-table-scroll max-h-[calc(100dvh-11rem)] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="glass-thead-row">
              {visibleColumns.map((column) => {
                const regla = sorts.find((item) => item.columnId === column.id);
                const indice = sorts.findIndex((item) => item.columnId === column.id);
                return (
                  <th
                    key={column.id}
                    scope="col"
                    data-property-menu-trigger
                    draggable={column.reorderable !== false}
                    onClick={(event) => abrirMenuPropiedad(event, column)}
                    onKeyDown={(event) => {
                      if (!column.label || event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        abrirMenuPropiedad(event, column);
                      }
                    }}
                    tabIndex={column.label ? 0 : undefined}
                    aria-sort={regla ? (regla.direction === "asc" ? "ascending" : "descending") : undefined}
                    onDragStart={() => {
                      setDraggedColumn(column.id);
                      setDragOverColumn(null);
                    }}
                    onDragEnd={() => {
                      setDraggedColumn(null);
                      setDragOverColumn(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (draggedColumn && draggedColumn !== column.id) setDragOverColumn(column.id);
                    }}
                    onDrop={() => moveColumn(column.id)}
                    title={column.label ? descripcionColumna(column) || "Clic para configurar esta propiedad" : undefined}
                    className={cn(
                      "group/column sticky top-0 z-20 bg-[#191b24]/[0.98] px-4 py-3 backdrop-blur-xl transition-all duration-150 hover:bg-[#22252f]",
                      column.label ? "cursor-pointer" : "cursor-default",
                      column.headerClassName,
                      column.id === "acciones" && "px-2",
                      draggedColumn === column.id && "bg-brand-500/10 opacity-50",
                      dragOverColumn === column.id && "bg-brand-500/15 text-brand-100 ring-1 ring-inset ring-brand-400/35"
                    )}
                  >
                    <span className="flex items-start gap-1.5">
                      {column.reorderable !== false && (
                        <span className="flex h-5 w-4 shrink-0 items-center justify-center rounded bg-white/[0.09] transition-colors group-hover/column:bg-brand-500/20" style={{ filter: "drop-shadow(0 0 3px rgba(255,255,255,0.5))" }}>
                          <GripVertical className="h-3.5 w-3.5 text-white transition-colors group-hover/column:text-brand-200" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span>{etiquetaColumna(column)}</span>
                          {regla && (
                            <span className="inline-flex items-center gap-0.5 text-brand-200">
                              {regla.direction === "asc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                              {sorts.length > 1 && <span className="text-[8px]">{indice + 1}</span>}
                            </span>
                          )}
                        </span>
                        {descripcionColumna(column) && (
                          <span className="mt-0.5 flex max-w-56 items-start gap-1 normal-case tracking-normal text-[9px] font-normal leading-3.5 text-white/45">
                            <Info className="mt-px h-2.5 w-2.5 shrink-0" />
                            <span className="line-clamp-2">{descripcionColumna(column)}</span>
                          </span>
                        )}
                      </span>
                    </span>
                  </th>
                );
              })}
              {agrupandoPersonalizado && <th className="w-10 px-2 py-3" />}
            </tr>
          </thead>
          <tbody className="glass-tbody">
            {secciones.map((seccion) => {
              const colapsado = colapsados.has(seccion.clave);
              return (
                <Fragment key={seccion.clave}>
                  {agrupado && (
                    <tr
                      className={cn("bg-white/[0.03] transition-colors", grupoSobrevolado === seccion.clave && "bg-brand-500/15 ring-1 ring-inset ring-brand-400/35")}
                      {...propsSoltarEnGrupo(seccion.clave)}
                    >
                      <td colSpan={columnasTabla} className="px-2 py-2">
                        <button type="button" onClick={() => alternarGrupo(seccion.clave)} className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-white/[0.05]">
                          <TrianguloDesplegable abierto={!colapsado} className="text-white/60 transition-colors group-hover:text-white" />
                          {seccion.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seccion.color }} />}
                          <span className={cn("truncate text-[11px] font-semibold", seccion.etiqueta === "Sin valor" || seccion.etiqueta === "Sin agrupar" ? "text-white/55" : "text-white/90")}>{seccion.titulo ?? seccion.etiqueta}</span>
                          <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[9px] text-white/65">{seccion.filas.length}</span>
                        </button>
                      </td>
                    </tr>
                  )}
                  {!colapsado && seccion.filas.map((row) => {
                    const key = rowKey(row);
                    const temporal = key.startsWith("temporal-");
                    const anidada = clavesAnidadas.has(key);
                    const grupoFila = agrupandoPersonalizado ? grupoDeFila(key) : null;
                    return (
                      <tr
                        key={key}
                        className={cn("glass-row group/row outline-none", onRowClick && "cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60", filaArrastrada === key && "opacity-45", temporal && "pointer-events-none opacity-70")}
                        onClick={() => onRowClick?.(row)}
                        onKeyDown={(event) => activarFilaConTeclado(event, row)}
                        tabIndex={onRowClick ? 0 : undefined}
                        aria-label={onRowClick ? nombreAccesibleFila(row) : undefined}
                        {...(anidada ? {} : propsArrastreFila(key))}
                      >
                        {visibleColumns.map((column) => (
                          <td
                            key={column.id}
                            onClick={column.stopRowClick ? (event) => event.stopPropagation() : undefined}
                            className={cn(
                              "px-4 py-3",
                              column.className,
                              column.id === "acciones" && "px-2",
                              metaColumnas[column.id]?.wrap && "records-cell-wrap",
                              metaColumnas[column.id]?.ajustarContenido === false && "records-cell-nowrap"
                            )}
                          >
                            {renderContenidoCelda(column, row)}
                          </td>
                        ))}
                        {agrupandoPersonalizado && (
                          <td className="w-10 px-2 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                            {!anidada && (
                              <button
                                type="button"
                                onClick={(event) => abrirMenuFila(event, key)}
                                title="Asignar a un grupo"
                                aria-label="Asignar registro a un grupo"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.09]"
                              >
                                {grupoFila
                                  ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: grupoFila.color }} />
                                  : <Plus className="h-3 w-3 text-white/55" />}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {agrupado && !colapsado && nuevoEnGrupo && (
                    <tr className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-3 pb-1.5 pt-0">
                        {nuevoEnGrupo(infoGrupo(seccion))}
                      </td>
                      {visibleColumns.slice(1).map((col) => (
                        <td key={col.id} className={cn("px-4 py-0", col.className)} />
                      ))}
                      {agrupandoPersonalizado && <td className="w-10" />}
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={columnasTabla} className="px-4 py-12 text-center text-[12px] text-white/65">Ningún registro coincide con los filtros de esta vista.</td></tr>
            )}
            {!agrupado && nuevoEnGrupo && (
              <tr className="transition-colors hover:bg-white/[0.02]">
                <td className="px-3 pb-2 pt-0">
                  {nuevoEnGrupo(infoGrupo({ clave: "__todo", etiqueta: "", filas: visibleRows }))}
                </td>
                {visibleColumns.slice(1).map((col) => (
                  <td key={col.id} className={cn("px-4 py-0", col.className)} />
                ))}
                {agrupandoPersonalizado && <td className="w-10" />}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {metricasScroll.visible && typeof document !== "undefined" && createPortal(
        <div
          style={{ left: metricasScroll.left, width: metricasScroll.width }}
          className="fixed bottom-0 z-40 hidden h-5 items-center border-x border-t border-white/[0.12] bg-[#11131b]/95 px-2 shadow-[0_-8px_24px_rgba(0,0,0,.32)] backdrop-blur-xl md:flex"
          aria-label="Barra de desplazamiento horizontal de la tabla"
        >
          <div
            role="scrollbar"
            aria-label="Desplazar tabla horizontalmente"
            aria-controls={tableScrollId}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={Math.round(maximoScrollHorizontal)}
            aria-valuenow={Math.round(metricasScroll.scrollLeft)}
            tabIndex={0}
            onPointerDown={desplazarDesdePista}
            onWheel={(event) => {
              event.preventDefault();
              asignarScrollHorizontal(metricasScroll.scrollLeft + (event.deltaX || event.deltaY));
            }}
            onKeyDown={(event) => {
              const paso = Math.max(80, metricasScroll.clientWidth * 0.2);
              if (event.key === "ArrowLeft") asignarScrollHorizontal(metricasScroll.scrollLeft - paso);
              else if (event.key === "ArrowRight") asignarScrollHorizontal(metricasScroll.scrollLeft + paso);
              else if (event.key === "PageUp") asignarScrollHorizontal(metricasScroll.scrollLeft - metricasScroll.clientWidth * 0.8);
              else if (event.key === "PageDown") asignarScrollHorizontal(metricasScroll.scrollLeft + metricasScroll.clientWidth * 0.8);
              else if (event.key === "Home") asignarScrollHorizontal(0);
              else if (event.key === "End") asignarScrollHorizontal(maximoScrollHorizontal);
              else return;
              event.preventDefault();
            }}
            className="relative h-3 w-full cursor-pointer rounded-full border border-white/[0.14] bg-white/[0.07] outline-none ring-brand-400/40 focus-visible:ring-2"
          >
            <button
              ref={scrollThumbRef}
              type="button"
              data-scroll-thumb
              aria-label="Arrastrar para desplazar la tabla"
              onPointerDown={iniciarArrastreScroll}
              style={{ width: anchoPulgarScroll, transform: `translateX(${posicionPulgarScroll}px)` }}
              className="absolute bottom-px left-0 top-px cursor-ew-resize touch-none rounded-full border border-brand-200/40 bg-brand-400/85 shadow-[0_0_12px_rgba(96,165,250,.35)] transition-colors hover:bg-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:bg-brand-200"
            />
          </div>
        </div>,
        document.body
      )}

      {esMovil === true && (
      <div>
        {secciones.map((seccion) => {
          const colapsado = colapsados.has(seccion.clave);
          return (
            <div key={seccion.clave} className="border-b border-white/[0.07] last:border-b-0">
              {agrupado && (
                <div
                  className={cn("sticky top-0 z-10 bg-[#12141c]/95 backdrop-blur", grupoSobrevolado === seccion.clave && "bg-brand-500/15")}
                  {...propsSoltarEnGrupo(seccion.clave)}
                >
                  <button type="button" onClick={() => alternarGrupo(seccion.clave)} className="group flex w-full items-center gap-2 border-b border-white/[0.07] px-3 py-2 text-left">
                    <TrianguloDesplegable abierto={!colapsado} className="text-white/60 transition-colors group-hover:text-white" />
                    {seccion.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seccion.color }} />}
                    <span className={cn("truncate text-[11px] font-semibold", seccion.etiqueta === "Sin valor" || seccion.etiqueta === "Sin agrupar" ? "text-white/55" : "text-white/90")}>{seccion.titulo ?? seccion.etiqueta}</span>
                    <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[9px] text-white/65">{seccion.filas.length}</span>
                  </button>
                </div>
              )}
              {!colapsado && (
                <div className="divide-y divide-white/[0.07]">
                  {seccion.filas.map((row) => {
                    const key = rowKey(row);
                    const temporal = key.startsWith("temporal-");
                    const grupoFila = agrupandoPersonalizado ? grupoDeFila(key) : null;
                    return (
                      <article
                        key={key}
                        role={onRowClick ? "group" : undefined}
                        aria-label={onRowClick ? nombreAccesibleFila(row) : undefined}
                        className={cn("relative space-y-3 px-3 py-4 transition-colors", onRowClick && "cursor-pointer active:bg-white/[0.045]", temporal && "pointer-events-none opacity-70")}
                        onClick={() => onRowClick?.(row)}
                        onKeyDown={(event) => activarFilaConTeclado(event, row)}
                      >
                        {onRowClick && (
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); onRowClick(row); }}
                            className="sr-only rounded-md bg-brand-500 px-2 py-1 text-xs text-white focus:not-sr-only focus:absolute focus:right-3 focus:top-3 focus:z-20"
                          >
                            {nombreAccesibleFila(row)}
                          </button>
                        )}
                        {agrupandoPersonalizado && !clavesAnidadas.has(key) && (
                          <div role="presentation" className="flex justify-end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(event) => abrirMenuFila(event, key)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.03] px-2 py-1 text-[9px] text-white/70"
                            >
                              {grupoFila
                                ? <><span className="h-2 w-2 rounded-full" style={{ backgroundColor: grupoFila.color }} />{grupoFila.nombre}</>
                                : <><Plus className="h-3 w-3" />Asignar a un grupo</>}
                            </button>
                          </div>
                        )}
                        {visibleColumns.map((column, index) => index === 0 ? (
                          <div role={column.stopRowClick ? "presentation" : undefined} key={column.id} onClick={column.stopRowClick ? (event) => event.stopPropagation() : undefined} onKeyDown={column.stopRowClick ? (event) => event.stopPropagation() : undefined} className={cn("records-mobile-value min-w-0 text-sm text-white/95", metaColumnas[column.id]?.ajustarContenido === false && "records-cell-nowrap")}>
                            {renderContenidoCelda(column, row)}
                          </div>
                        ) : (
                          <div key={column.id} className="grid min-w-0 grid-cols-[6.75rem_minmax(0,1fr)] items-start gap-3">
                            <span className="pt-0.5 text-[10px] font-medium leading-4 text-white/50">{etiquetaColumna(column)}</span>
                            <div role={column.stopRowClick ? "presentation" : undefined} onClick={column.stopRowClick ? (event) => event.stopPropagation() : undefined} onKeyDown={column.stopRowClick ? (event) => event.stopPropagation() : undefined} className={cn("records-mobile-value min-w-0 text-right text-xs leading-5 text-white/80", metaColumnas[column.id]?.ajustarContenido === false && "records-cell-nowrap")}>
                              {renderContenidoCelda(column, row)}
                            </div>
                          </div>
                        ))}
                      </article>
                    );
                  })}
                </div>
              )}
              {agrupado && !colapsado && nuevoEnGrupo && (
                <div className="px-3 pb-1 pt-0">{nuevoEnGrupo(infoGrupo(seccion))}</div>
              )}
            </div>
          );
        })}
        {visibleRows.length === 0 && <div className="px-4 py-12 text-center text-[12px] text-white/65">Ningún registro coincide con los filtros de esta vista.</div>}
        {!agrupado && nuevoEnGrupo && (
          <div className="px-3 pb-2 pt-0">{nuevoEnGrupo(infoGrupo({ clave: "__todo", etiqueta: "", filas: visibleRows }))}</div>
        )}
      </div>
      )}

      {menuPropiedad && columnaMenuPropiedad && typeof document !== "undefined" && createPortal(
        <div
          ref={menuPropiedadRef}
          style={{ left: menuPropiedad.left, top: menuPropiedad.top }}
          className="fixed z-[95] flex max-h-[calc(100dvh-1rem)] items-start gap-1 max-sm:flex-col max-sm:overflow-y-auto"
        >
          <div className="scrollbar-glass max-h-[calc(100dvh-1rem)] w-72 overflow-y-auto rounded-xl border border-white/[0.13] bg-[#151720]/[0.99] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,.62)] backdrop-blur-2xl max-sm:w-[calc(100vw-1rem)]">
            <div className="flex items-center gap-1 px-1 py-1" onMouseEnter={() => setSubmenuPropiedad(null)}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/45">
                <IconoTipoPropiedad tipo={tiposColumna.get(columnaMenuPropiedad.id) ?? "texto"} />
              </span>
              <input
                value={nombrePropiedad}
                maxLength={80}
                onChange={(event) => setNombrePropiedad(event.target.value)}
                onBlur={() => {
                  if (descartarEdicionRef.current) {
                    descartarEdicionRef.current = false;
                    return;
                  }
                  void guardarNombrePropiedadEnLinea(columnaMenuPropiedad);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    descartarEdicionRef.current = true;
                    setNombrePropiedad(metaColumnas[columnaMenuPropiedad.id]?.label ?? columnaMenuPropiedad.label);
                    event.currentTarget.blur();
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-semibold text-white outline-none transition-colors hover:border-white/[0.08] hover:bg-white/[0.035] focus:border-brand-400/30 focus:bg-white/[0.045]"
              />
              <button
                type="button"
                onClick={() => setDescripcionAbierta((actual) => !actual)}
                title="Agregar o editar descripción"
                aria-label="Agregar o editar descripción"
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/35 hover:bg-white/[0.06] hover:text-white/80",
                  descripcionAbierta && "bg-white/[0.06] text-white/80"
                )}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            {descripcionAbierta && (
              <div className="px-1 pb-1.5" onMouseEnter={() => setSubmenuPropiedad(null)}>
                <textarea
                  value={descripcionPropiedad}
                  maxLength={240}
                  rows={2}
                  autoFocus={!descripcionColumna(columnaMenuPropiedad)}
                  placeholder="Descripción opcional…"
                  onChange={(event) => setDescripcionPropiedad(event.target.value)}
                  onBlur={() => {
                    if (descartarEdicionRef.current) {
                      descartarEdicionRef.current = false;
                      return;
                    }
                    void guardarDescripcionPropiedadEnLinea(columnaMenuPropiedad);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      descartarEdicionRef.current = true;
                      setDescripcionPropiedad(descripcionColumna(columnaMenuPropiedad));
                      event.currentTarget.blur();
                    }
                  }}
                  className="w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1.5 text-[11px] leading-4 text-white/80 outline-none placeholder:text-white/30 focus:border-brand-400/30"
                />
              </div>
            )}
            <div className="mb-1 border-t border-white/[0.08]" />

            <button
              type="button"
              onMouseEnter={() => setSubmenuPropiedad("editar")}
              onFocus={() => setSubmenuPropiedad("editar")}
              onClick={() => setSubmenuPropiedad("editar")}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white",
                submenuPropiedad === "editar" && "bg-white/[0.06] text-white"
              )}
            >
              <Pencil className="h-3.5 w-3.5 text-white/50" />
              <span className="flex-1">Editar propiedad</span>
              <ChevronRight className="h-3.5 w-3.5 text-white/35" />
            </button>

            {columnaMenuPropiedad.sortValue && (
              <div className="mt-1 border-t border-white/[0.08] pt-1">
                <button
                  type="button"
                  onMouseEnter={(evento) => abrirSubmenuEnFila(evento, "ordenar")}
                  onFocus={(evento) => abrirSubmenuEnFila(evento, "ordenar")}
                  onClick={(evento) => abrirSubmenuEnFila(evento, "ordenar")}
                  aria-haspopup="menu"
                  aria-expanded={submenuPropiedad === "ordenar"}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white",
                    submenuPropiedad === "ordenar" && "bg-white/[0.06] text-white"
                  )}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-white/50" />
                  <span className="flex-1">Ordenar</span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/35" />
                </button>
              </div>
            )}

            {enableFilter && (columnaMenuPropiedad.filterValue || columnaMenuPropiedad.sortValue) && (
              <button
                type="button"
                onMouseEnter={() => setSubmenuPropiedad(null)}
                onClick={() => filtrarPorPropiedad(columnaMenuPropiedad)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white"
              >
                <Filter className="h-3.5 w-3.5 text-white/50" />
                <span className="flex-1">Filtrar por esta propiedad</span>
              </button>
            )}

            <button
              type="button"
              onMouseEnter={() => setSubmenuPropiedad(null)}
              onClick={() => alternarWrap(columnaMenuPropiedad)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white"
            >
              <WrapText className={cn("h-3.5 w-3.5", metaColumnas[columnaMenuPropiedad.id]?.wrap ? "text-brand-300" : "text-white/50")} />
              <span className="flex-1">{metaColumnas[columnaMenuPropiedad.id]?.wrap ? "Mostrar en una línea" : "Mostrar contenido completo"}</span>
              {metaColumnas[columnaMenuPropiedad.id]?.wrap && <Check className="h-3.5 w-3.5 text-brand-300" />}
            </button>

            <button
              type="button"
              onMouseEnter={() => setSubmenuPropiedad(null)}
              onClick={() => alternarAjusteContenido(columnaMenuPropiedad)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white"
            >
              <ChevronsLeftRight className={cn("h-3.5 w-3.5", metaColumnas[columnaMenuPropiedad.id]?.ajustarContenido === false ? "text-brand-300" : "text-white/50")} />
              <span className="flex-1">
                {metaColumnas[columnaMenuPropiedad.id]?.ajustarContenido === false ? "Ajustar contenido" : "No ajustar contenido"}
              </span>
              {metaColumnas[columnaMenuPropiedad.id]?.ajustarContenido === false && <Check className="h-3.5 w-3.5 text-brand-300" />}
            </button>

            {entidadTipo && !(requiereSubtipo(entidadTipo) && !subtipoPropiedades) && (
              <div className="mt-1 border-t border-white/[0.08] pt-1">
                <button
                  type="button"
                  onMouseEnter={(evento) => abrirSubmenuEnFila(evento, "insertar")}
                  onFocus={(evento) => abrirSubmenuEnFila(evento, "insertar")}
                  onClick={(evento) => abrirSubmenuEnFila(evento, "insertar")}
                  aria-haspopup="menu"
                  aria-expanded={submenuPropiedad === "insertar" || submenuPropiedad === "insertar-izq" || submenuPropiedad === "insertar-der"}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white",
                    (submenuPropiedad === "insertar" || submenuPropiedad === "insertar-izq" || submenuPropiedad === "insertar-der") && "bg-white/[0.06] text-white"
                  )}
                >
                  <ChevronsLeftRight className="h-3.5 w-3.5 text-white/50" />
                  <span className="flex-1">Insertar</span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/35" />
                </button>
              </div>
            )}

            {columnaMenuPropiedad.id.startsWith("personalizada:") && (
              <button
                type="button"
                disabled={procesandoMenuPropiedad}
                onMouseEnter={() => setSubmenuPropiedad(null)}
                onClick={() => duplicarColumnaPersonalizada(columnaMenuPropiedad)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                {procesandoMenuPropiedad ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50" /> : <Copy className="h-3.5 w-3.5 text-white/50" />}
                <span className="flex-1">Duplicar propiedad</span>
              </button>
            )}

            {columnaMenuPropiedad.hideable !== false && visibleColumns.length > 1 && (
              <button
                type="button"
                onMouseEnter={() => setSubmenuPropiedad(null)}
                onClick={() => {
                  toggleColumn(columnaMenuPropiedad.id);
                  setMenuPropiedad(null);
                }}
                className="mt-1 flex w-full items-center gap-2 border-t border-white/[0.08] px-2 py-2 text-left text-[10px] text-white/55 hover:bg-white/[0.06] hover:text-white"
              >
                <Eye className="h-3.5 w-3.5" /> Ocultar propiedad
              </button>
            )}
            {errorMenuPropiedad && submenuPropiedad === null && (
              <p className="mt-1 border-t border-white/[0.08] px-2 pt-2 text-[9px] leading-4 text-red-300">{errorMenuPropiedad}</p>
            )}
            {(columnaMenuPropiedad.id.startsWith("personalizada:") || esNativaEliminable(columnaMenuPropiedad)) && submenuPropiedad !== "eliminar" && (
              <button
                type="button"
                onMouseEnter={() => setSubmenuPropiedad(null)}
                onClick={() => setSubmenuPropiedad("eliminar")}
                aria-haspopup="dialog"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-red-300/80 hover:bg-red-500/[0.08] hover:text-red-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="flex-1">Eliminar propiedad</span>
                <ChevronRight className="h-3.5 w-3.5 text-white/35" />
              </button>
            )}
            {submenuPropiedad === "eliminar" && (columnaMenuPropiedad.id.startsWith("personalizada:") || esNativaEliminable(columnaMenuPropiedad)) && (
              <div role="alertdialog" aria-labelledby={`${tableScrollId}-eliminar-propiedad`} className="mt-1 rounded-lg border border-red-500/20 bg-red-500/[0.055] p-3">
                <p id={`${tableScrollId}-eliminar-propiedad`} className="text-xs font-semibold text-white">¿Eliminar esta propiedad?</p>
                {columnaMenuPropiedad.propiedadPersonalizadaId ? (
                  <p className="mt-1 text-[9px] leading-4 text-white/55">
                    Se eliminará la columna y <span className="text-red-300/90">todos sus valores</span> de todos los registros. Esta acción no se puede deshacer.
                  </p>
                ) : (
                  <p className="mt-1 text-[9px] leading-4 text-white/55">
                    Se quitará de la tabla y de la ficha para <span className="text-red-300/90">todos los usuarios</span>. Los datos no se borran: la restauras desde Propiedades.
                  </p>
                )}
                {errorMenuPropiedad && <p className="mt-2 text-[9px] leading-4 text-red-300">{errorMenuPropiedad}</p>}
                <div className="mt-3 flex justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={eliminandoPropiedad}
                    onClick={() => { setErrorMenuPropiedad(""); setSubmenuPropiedad(null); }}
                    className="rounded-md px-2.5 py-1.5 text-[10px] text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={eliminandoPropiedad}
                    onClick={() => void (columnaMenuPropiedad.propiedadPersonalizadaId
                      ? eliminarColumnaPersonalizada(columnaMenuPropiedad)
                      : eliminarColumnaNativa(columnaMenuPropiedad))}
                    className="inline-flex min-w-[4.25rem] items-center justify-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-red-500 disabled:cursor-wait disabled:opacity-60"
                  >
                    {eliminandoPropiedad && <Loader2 className="h-3 w-3 animate-spin" />}
                    {eliminandoPropiedad ? "Eliminando" : "Eliminar"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {submenuPropiedad === "editar" && (() => {
            const tipoActual = tiposColumna.get(columnaMenuPropiedad.id) ?? "texto";
            const definicion = definicionPersonalizada(columnaMenuPropiedad);
            const catalogo = columnaMenuPropiedad.catalogoOpciones;
            const formatoNumero = metaColumnas[columnaMenuPropiedad.id]?.formatoNumero;
            const formatoFecha = metaColumnas[columnaMenuPropiedad.id]?.formatoFecha;
            const propia = !columnaMenuPropiedad.propiedadPersonalizadaId;
            return (
            <div className="scrollbar-glass max-h-[calc(100dvh-1rem)] w-72 space-y-2.5 overflow-y-auto rounded-xl border border-white/[0.13] bg-[#151720]/[0.99] p-2 shadow-[0_24px_70px_rgba(0,0,0,.62)] backdrop-blur-2xl max-sm:w-[calc(100vw-1rem)]">
              <div className="flex items-center gap-1.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/45">
                  <IconoTipoPropiedad tipo={tipoActual} />
                </span>
                <input
                  value={nombrePropiedad}
                  maxLength={80}
                  aria-label="Nombre de la propiedad"
                  onChange={(event) => setNombrePropiedad(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && nombrePropiedad.trim()) void guardarPropiedad(columnaMenuPropiedad);
                    if (event.key === "Escape") setSubmenuPropiedad(null);
                  }}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-semibold text-white outline-none transition-colors hover:border-white/[0.08] hover:bg-white/[0.035] focus:border-brand-400/30 focus:bg-white/[0.045]"
                />
              </div>

              {columnaMenuPropiedad.tipoFijo ? (
                <p className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2 py-1.5 text-[10px] text-white/55">
                  <IconoTipoPropiedad tipo={tipoActual} className="h-3 w-3 shrink-0 text-white/45" />
                  {ETIQUETA_TIPO_PROPIEDAD[tipoActual]}
                  {tipoActual === "relacion" &&
                    columnaMenuPropiedad.relacionEntidadLabel &&
                    columnaMenuPropiedad.relacionEntidadLabel !== nombrePropiedad && (
                      <span className="truncate text-white/35">· {columnaMenuPropiedad.relacionEntidadLabel}</span>
                    )}
                  <span className="ml-auto shrink-0 text-[8px] uppercase tracking-wide text-white/30">
                    {catalogo ? "Opciones editables" : "Fijo"}
                  </span>
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {(columnaMenuPropiedad.conversionTipo ? (TIPOS_CONVERTIBLES as TipoColumna[]) : TIPOS_PROPIEDAD)
                    .filter((tipo) => tipo !== "relacion" || propia)
                    .map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      disabled={procesandoMenuPropiedad}
                      onClick={() => {
                        // Una propiedad que pasa a Fecha tiene que decir qué tipo de fecha es.
                        if (tipo === "fecha" && columnaMenuPropiedad.propiedadPersonalizadaId && tipoActual !== "fecha") {
                          setErrorMenuPropiedad("");
                          setEligiendoTipoFecha(true);
                          return;
                        }
                        setEligiendoTipoFecha(false);
                        void guardarTipoPropiedad(columnaMenuPropiedad, tipo, false);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[10px] transition-colors disabled:opacity-50",
                        tipoActual === tipo ? "bg-brand-500/15 text-brand-100" : "bg-white/[0.04] text-white/65 hover:bg-white/[0.09] hover:text-white"
                      )}
                    >
                      <IconoTipoPropiedad tipo={tipo} className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{ETIQUETA_TIPO_PROPIEDAD[tipo]}</span>
                      {tipoActual === tipo && <Check className="h-3 w-3 shrink-0 text-brand-300" />}
                    </button>
                  ))}
                </div>
              )}

              {eligiendoTipoFecha && tipoActual !== "fecha" && columnaMenuPropiedad.propiedadPersonalizadaId && (
                <div className="space-y-1">
                  <p className="px-0.5 text-[9px] font-medium uppercase tracking-wide text-white/40">Tipo de fecha</p>
                  <div role="group" aria-label="Tipo de fecha" className="space-y-1">
                    {OPCIONES_TIPO_FECHA.map((opcion) => (
                      <button
                        key={opcion.tipo}
                        type="button"
                        disabled={procesandoMenuPropiedad}
                        onClick={() => void guardarTipoPropiedad(columnaMenuPropiedad, "fecha", false, opcion.tipo)}
                        className="flex w-full flex-col rounded-lg bg-white/[0.04] px-2 py-1.5 text-left text-[10px] text-white/65 transition-colors hover:bg-white/[0.09] hover:text-white disabled:opacity-50"
                      >
                        <span className="font-medium">{opcion.label}</span>
                        <span className="text-[9px] text-white/40">{opcion.ayuda}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(tipoActual === "seleccion" || tipoActual === "multiseleccion") && (
                <div className="space-y-1">
                  <p className="px-0.5 text-[9px] font-medium uppercase tracking-wide text-white/40">Opciones</p>
                  {definicion ? (
                    <EditorOpcionesPersonalizadas
                      opciones={definicion.opciones}
                      procesando={procesandoMenuPropiedad}
                      onAgregar={(opcion) => void agregarOpcionPropiedad(columnaMenuPropiedad, opcion)}
                      onQuitar={(opcion) => void quitarOpcionPropiedad(columnaMenuPropiedad, opcion)}
                      onRenombrar={(anterior, nuevo) => void renombrarOpcionPropiedad(columnaMenuPropiedad, anterior, nuevo)}
                      onUnir={(origen, destino) => void unirOpcionPropiedad(columnaMenuPropiedad, origen, destino)}
                      onOrdenar={(opciones) => void ordenarOpcionesPropiedad(columnaMenuPropiedad, opciones)}
                    />
                  ) : columnaMenuPropiedad.editorOpcionesPersonalizado ? (
                    columnaMenuPropiedad.editorOpcionesPersonalizado
                  ) : catalogo ? (
                    <EditorOpcionesColumna tabla={catalogo.tabla} campo={catalogo.campo} base={catalogo.base} />
                  ) : (
                    <p className="px-0.5 text-[9px] text-white/35">Fijas por el esquema de la tabla.</p>
                  )}
                </div>
              )}

              {tipoActual === "numero" && columnaMenuPropiedad.sortValue && propia && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <p className="text-[9px] font-medium uppercase tracking-wide text-white/40">Formato</p>
                    {formatoNumero && (
                      <button
                        type="button"
                        onClick={() => guardarFormatoNumero(columnaMenuPropiedad, null)}
                        className="text-[9px] text-white/40 hover:text-white"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {DECIMALES_FORMATO.map(({ valor, label }) => {
                      const activo = (formatoNumero?.decimales ?? undefined) === valor;
                      return (
                        <button
                          key={label}
                          type="button"
                          title={valor === undefined ? "Decimales automáticos" : `${valor} decimales`}
                          onClick={() => guardarFormatoNumero(columnaMenuPropiedad, { ...formatoNumero, decimales: valor })}
                          className={cn(
                            "rounded-lg px-1.5 py-1.5 text-[10px] transition-colors",
                            activo ? "bg-brand-500/20 text-brand-100" : "bg-white/[0.04] text-white/65 hover:bg-white/[0.09] hover:text-white"
                          )}
                        >
                          {valor === undefined ? "Auto" : label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      key={`${columnaMenuPropiedad.id}-prefijo`}
                      defaultValue={formatoNumero?.prefijo ?? ""}
                      maxLength={6}
                      placeholder="Prefijo"
                      aria-label="Prefijo del número"
                      onBlur={(event) => guardarFormatoNumero(columnaMenuPropiedad, { ...metaColumnas[columnaMenuPropiedad.id]?.formatoNumero, prefijo: event.target.value })}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                      className="view-control"
                    />
                    <input
                      key={`${columnaMenuPropiedad.id}-sufijo`}
                      defaultValue={formatoNumero?.sufijo ?? ""}
                      maxLength={6}
                      placeholder="Sufijo"
                      aria-label="Sufijo del número"
                      onBlur={(event) => guardarFormatoNumero(columnaMenuPropiedad, { ...metaColumnas[columnaMenuPropiedad.id]?.formatoNumero, sufijo: event.target.value })}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                      className="view-control"
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-lg px-0.5 py-0.5 text-[10px] text-white/60 hover:text-white">
                    <input
                      type="checkbox"
                      checked={formatoNumero?.separador !== false}
                      onChange={(event) => guardarFormatoNumero(columnaMenuPropiedad, { ...formatoNumero, separador: event.target.checked })}
                      className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-brand-500"
                    />
                    Separador de miles
                  </label>
                </div>
              )}

              {tipoActual === "fecha" && columnaMenuPropiedad.sortValue && propia && (
                <div className="space-y-1">
                  <p className="px-0.5 text-[9px] font-medium uppercase tracking-wide text-white/40">Formato</p>
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => guardarFormatoFecha(columnaMenuPropiedad, null)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] transition-colors",
                        !formatoFecha ? "bg-brand-500/15 text-brand-100" : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                      )}
                    >
                      <span className="flex-1">Automático</span>
                      {!formatoFecha && <Check className="h-3 w-3 text-brand-300" />}
                    </button>
                    {FORMATOS_FECHA.map(({ valor, ejemplo }) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => guardarFormatoFecha(columnaMenuPropiedad, valor)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] transition-colors",
                          formatoFecha === valor ? "bg-brand-500/15 text-brand-100" : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                        )}
                      >
                        <span className="flex-1">{ejemplo}</span>
                        {formatoFecha === valor && <Check className="h-3 w-3 text-brand-300" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {descripcionPanelAbierta || descripcionPropiedad ? (
                <textarea
                  value={descripcionPropiedad}
                  maxLength={240}
                  rows={2}
                  autoFocus={descripcionPanelAbierta && !descripcionPropiedad}
                  placeholder="Descripción…"
                  onChange={(event) => setDescripcionPropiedad(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape") setSubmenuPropiedad(null); }}
                  className="view-control resize-y leading-4"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setDescripcionPanelAbierta(true)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[10px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <Plus className="h-3 w-3" /> Añadir descripción
                </button>
              )}

              {errorMenuPropiedad && <p className="px-0.5 text-[9px] leading-4 text-red-300">{errorMenuPropiedad}</p>}

              <div className="flex items-center justify-end gap-1 border-t border-white/[0.08] pt-1.5">
                {descripcionColumna(columnaMenuPropiedad) && (
                  <button
                    type="button"
                    title="Eliminar descripción"
                    onClick={() => void eliminarDescripcion(columnaMenuPropiedad)}
                    className="mr-auto flex h-7 w-7 items-center justify-center rounded-md text-red-300/70 transition-colors hover:bg-red-500/10 hover:text-red-200"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={!nombrePropiedad.trim()}
                  onClick={() => void guardarPropiedad(columnaMenuPropiedad)}
                  className="rounded-md bg-brand-600 px-2.5 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
                >
                  Guardar
                </button>
              </div>
            </div>
            );
          })()}

          {submenuPropiedad === "ordenar" && columnaMenuPropiedad.sortValue && (
            <div
              role="menu"
              aria-label="Ordenar"
              style={{ "--desfase-submenu": `${desfaseSubmenu}px` } as React.CSSProperties}
              className="w-56 rounded-xl border border-white/[0.13] bg-[#151720]/[0.99] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,.62)] backdrop-blur-2xl sm:mt-[var(--desfase-submenu)] max-sm:w-[calc(100vw-1rem)]"
            >
              {([
                { direccion: "asc", etiqueta: "Ascendente", Icono: ArrowDownAZ },
                { direccion: "desc", etiqueta: "Descendente", Icono: ArrowUpAZ },
              ] as const).map(({ direccion, etiqueta, Icono }) => {
                const activo = sorts.length === 1 && sorts[0].columnId === columnaMenuPropiedad.id && sorts[0].direction === direccion;
                return (
                  <button
                    key={direccion}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activo}
                    onClick={() => {
                      setSorts([{ id: `${columnaMenuPropiedad.id}-${Date.now()}`, columnId: columnaMenuPropiedad.id, direction: direccion }]);
                      setMenuPropiedad(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white",
                      activo && "bg-white/[0.06] text-white"
                    )}
                  >
                    <Icono className="h-3.5 w-3.5 text-white/50" />
                    <span className="flex-1">{etiqueta}</span>
                    {activo && <Check className="h-3.5 w-3.5 text-brand-300" />}
                  </button>
                );
              })}
            </div>
          )}

          {(submenuPropiedad === "insertar" || submenuPropiedad === "insertar-izq" || submenuPropiedad === "insertar-der") && entidadTipo && (
            <div
              role="menu"
              aria-label="Insertar propiedad"
              style={{ "--desfase-submenu": `${desfaseSubmenu}px` } as React.CSSProperties}
              className="w-56 rounded-xl border border-white/[0.13] bg-[#151720]/[0.99] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,.62)] backdrop-blur-2xl sm:mt-[var(--desfase-submenu)] max-sm:w-[calc(100vw-1rem)]"
            >
              {([
                { submenu: "insertar-izq", etiqueta: "Insertar a la izquierda", Icono: ChevronsLeft },
                { submenu: "insertar-der", etiqueta: "Insertar a la derecha", Icono: ChevronsRight },
              ] as const).map(({ submenu, etiqueta, Icono }) => (
                <button
                  key={submenu}
                  type="button"
                  role="menuitem"
                  onClick={() => setSubmenuPropiedad(submenu)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06] hover:text-white",
                    submenuPropiedad === submenu && "bg-white/[0.06] text-white"
                  )}
                >
                  <Icono className="h-3.5 w-3.5 text-white/50" />
                  <span className="flex-1">{etiqueta}</span>
                </button>
              ))}
            </div>
          )}

          {(submenuPropiedad === "insertar-izq" || submenuPropiedad === "insertar-der") && entidadTipo && (
            <MenuNuevaPropiedad
              entidadTipo={entidadTipo}
              subtipo={subtipoPropiedades}
              subtipoLabel={subtipoPropiedadesLabel}
              posicion={{
                // A la derecha del submenú de "Insertar" (224 px + separación).
                left: Math.max(8, Math.min(menuPropiedad.left + 296 + 232, window.innerWidth - 348)),
                top: menuPropiedad.top + desfaseSubmenu,
              }}
              onClose={() => setSubmenuPropiedad(null)}
              onCreada={(id) => propiedadInsertada(id, columnaMenuPropiedad.id, submenuPropiedad === "insertar-izq" ? "izq" : "der")}
            />
          )}

        </div>,
        document.body
      )}

      {menuFila && (
        <>
          <div className="fixed inset-0 z-[79]" onClick={() => setMenuFila(null)} />
          <div
            className="fixed z-[80] w-56 -translate-x-full rounded-xl border border-white/[0.13] bg-[#151720]/[0.98] p-1 shadow-[0_24px_70px_rgba(0,0,0,.62)] backdrop-blur-2xl"
            style={{ left: menuFila.x, top: menuFila.y }}
          >
            <p className="px-2 py-1.5 text-[9px] uppercase tracking-wide text-white/45">Mover a</p>
            <div className="max-h-56 overflow-y-auto scrollbar-glass">
              {gruposPersonalizados.map((grupo) => (
                <button
                  key={grupo.id}
                  type="button"
                  onClick={() => { asignarFila(menuFila.key, grupo.id); setMenuFila(null); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-white/85 hover:bg-white/[0.07]"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: grupo.color }} />
                  <span className="min-w-0 flex-1 truncate">{grupo.nombre}</span>
                  {asignaciones[menuFila.key] === grupo.id && <Check className="h-3 w-3 text-brand-300" />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { asignarFila(menuFila.key, null); setMenuFila(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-white/60 hover:bg-white/[0.07] hover:text-white">
              <X className="h-3 w-3" />Sin agrupar
            </button>
            <button
              type="button"
              onClick={() => {
                const grupo = crearGrupo(`Grupo ${gruposPersonalizados.length + 1}`, COLORES_GRUPO[gruposPersonalizados.length % COLORES_GRUPO.length]);
                asignarFila(menuFila.key, grupo.id);
                setMenuFila(null);
              }}
              className="mt-0.5 flex w-full items-center gap-2 rounded-md border-t border-white/[0.08] px-2 py-1.5 text-left text-[11px] text-brand-200 hover:bg-white/[0.07]"
            >
              <Plus className="h-3 w-3" />Nuevo grupo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AttachmentCount({ count }: { count: number }) {
  const hasFiles = count > 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-medium",
      hasFiles
        ? "border-brand-400/20 bg-brand-500/10 text-brand-100"
        : "border-white/[0.07] bg-white/[0.025] text-white/55"
    )}>
      <Paperclip className={cn("h-3 w-3", hasFiles ? "text-brand-300" : "text-white/45")} />
      {hasFiles ? `${count} ${count === 1 ? "adjunto" : "adjuntos"}` : "Sin adjuntos"}
    </span>
  );
}

function compareValues(left: unknown, right: unknown) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (left instanceof Date || right instanceof Date) return new Date(left as string | number | Date).getTime() - new Date(right as string | number | Date).getTime();
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return String(left).localeCompare(String(right), "es-PE", { numeric: true, sensitivity: "base" });
}

function valorTexto<Row>(column: RecordColumn<Row>, row: Row) {
  return column.filterValue?.(row) ?? column.sortValue?.(row) ?? "";
}

function valorGrupo<Row>(column: RecordColumn<Row>, row: Row) {
  if (column.groupValue) return column.groupValue(row);
  return column.filterValue?.(row) ?? column.sortValue?.(row) ?? "";
}

function valorTipado<Row>(column: RecordColumn<Row>, row: Row) {
  return column.sortValue?.(row) ?? column.filterValue?.(row) ?? "";
}

function claveValor(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "boolean") return raw ? "Sí" : "No";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).trim();
}

function aNumero(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const texto = String(raw ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  return texto === "" ? Number.NaN : Number(texto);
}

function aFecha(raw: unknown): number {
  if (raw instanceof Date) return raw.getTime();
  const texto = String(raw ?? "").trim();
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
  if (dmy) return Date.parse(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
  return Date.parse(texto);
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}([T ]|$)|^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/;

function detectarTipo<Row>(column: RecordColumn<Row>, muestra: Row[]): TipoColumna {
  if (!column.sortValue && !column.filterValue) return "texto";
  let vistos = 0;
  let booleanos = 0;
  let numeros = 0;
  let fechas = 0;
  for (const row of muestra) {
    const raw = valorTipado(column, row);
    if (raw == null || raw === "") continue;
    vistos += 1;
    if (typeof raw === "boolean") booleanos += 1;
    else if (raw instanceof Date || RE_FECHA.test(String(raw).trim())) fechas += 1;
    else if (typeof raw === "number" || (String(raw).trim() !== "" && !Number.isNaN(Number(String(raw).trim())))) numeros += 1;
  }
  if (vistos === 0) return "texto";
  if (booleanos === vistos) return "booleano";
  if (fechas === vistos) return "fecha";
  if (numeros === vistos) return "numero";
  return "texto";
}

/** `adjuntos` guarda una cantidad: se filtra y ordena como número. */
function esTipoNumerico(tipo: TipoColumna) {
  return tipo === "numero" || tipo === "adjuntos";
}

function inputTipo(tipo: TipoColumna, operador: Operador) {
  if (operador === "contiene" || operador === "no_contiene" || operador === "empieza") return "text";
  if (tipo === "fecha") return "date";
  if (esTipoNumerico(tipo)) return "number";
  return "text";
}

/**
 * `etiqueta` es la forma que se lee del valor (columnas con catálogo): los
 * operadores de texto miran también esa forma. `vacío` y `en` comparan siempre
 * el valor guardado, así un filtro ya guardado por `no_metal` sigue aplicándose.
 */
function cumpleFiltro(rawTexto: unknown, rawTipado: unknown, filtro: ActiveFilter, tipo: TipoColumna, etiqueta?: string): boolean {
  const operador = filtro.operador ?? "contiene";
  const texto = claveValor(rawTexto);
  if (operador === "vacio") return texto === "";
  if (operador === "no_vacio") return texto !== "";
  if (operador === "en") return (filtro.valores ?? []).includes(texto);

  const comparaNumerico = (esTipoNumerico(tipo) || tipo === "fecha") && operador !== "contiene" && operador !== "no_contiene" && operador !== "empieza";
  if (comparaNumerico) {
    const convertir = tipo === "fecha" ? aFecha : aNumero;
    const valor = convertir(rawTipado);
    const objetivo = convertir(filtro.value);
    if (!Number.isNaN(valor) && !Number.isNaN(objetivo)) {
      switch (operador) {
        case "mayor": return valor > objetivo;
        case "menor": return valor < objetivo;
        case "entre": {
          const limite = convertir(filtro.value2 ?? "");
          return Number.isNaN(limite) ? valor >= objetivo : valor >= Math.min(objetivo, limite) && valor <= Math.max(objetivo, limite);
        }
        case "igual": return valor === objetivo;
        case "distinto": return valor !== objetivo;
      }
    }
    if (operador === "mayor" || operador === "menor" || operador === "entre") return false;
  }

  return coincideTexto(operador, etiqueta && etiqueta !== texto ? [texto, etiqueta] : [texto], filtro.value);
}

function ordenarGrupos<Row>(grupos: Grupo<Row>[], orden: OrdenGrupos) {
  grupos.sort((left, right) => {
    const izquierda = left.titulo ?? left.etiqueta;
    const derecha = right.titulo ?? right.etiqueta;
    if (orden === "conteo") return right.filas.length - left.filas.length || compareValues(izquierda, derecha);
    return compareValues(izquierda, derecha) * (orden === "desc" ? -1 : 1);
  });
}

/**
 * Junta cada fila hija con su padre: devuelve familias `[padre, ...hijas]` en el
 * orden que ya traían las filas (las hijas conservan su orden relativo). Una
 * hija cuyo padre no está en la lista queda como familia propia, y un ciclo
 * padre↔hijo no hace desaparecer filas.
 */
function agruparFamilias<Row>(
  filas: Row[],
  rowKey: (row: Row) => string,
  padreDe?: (row: Row) => string | null | undefined
): Row[][] {
  if (!padreDe) return filas.map((fila) => [fila]);
  const presentes = new Set(filas.map(rowKey));
  const hijasPorPadre = new Map<string, Row[]>();
  const raices: Row[] = [];
  for (const fila of filas) {
    const padre = padreDe(fila);
    if (padre && padre !== rowKey(fila) && presentes.has(padre)) {
      const hijas = hijasPorPadre.get(padre);
      if (hijas) hijas.push(fila);
      else hijasPorPadre.set(padre, [fila]);
    } else {
      raices.push(fila);
    }
  }
  const vistas = new Set<string>();
  const familiaDe = (fila: Row): Row[] => {
    const clave = rowKey(fila);
    if (vistas.has(clave)) return [];
    vistas.add(clave);
    return [fila, ...(hijasPorPadre.get(clave) ?? []).flatMap(familiaDe)];
  };
  const familias = raices.map(familiaDe);
  for (const fila of filas) if (!vistas.has(rowKey(fila))) familias.push(familiaDe(fila));
  return familias;
}

function panelPosition(panel: OpenPanel, buttonsEl: HTMLDivElement | null, rootEl: HTMLDivElement | null): React.CSSProperties {
  if (!buttonsEl || !rootEl || !panel) return {};
  const btn = buttonsEl.querySelector(`[data-panel-key="${panel}"]`) as HTMLElement | null;
  if (!btn) return {};
  const rootRect = rootEl.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const left = btnRect.left - rootRect.left;
  const maxLeft = rootRect.width - 318;
  return { left: Math.max(0, Math.min(left, maxLeft)) };
}

function ViewButton({ active, panelKey, currentPanel, icon, label, onClick }: { active: boolean; panelKey?: string; currentPanel?: OpenPanel; icon: React.ReactNode; label: string; onClick: () => void }) {
  const isOpen = panelKey != null && currentPanel === panelKey;
  const lit = active || isOpen;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      data-panel-key={panelKey}
      data-active={lit || undefined}
      className={cn(
        "view-btn flex h-8 min-w-0 cursor-pointer items-center justify-center gap-2 px-3.5 text-[13px] font-semibold tracking-wide transition-all duration-200 active:scale-95",
        isOpen ? "rounded-t-xl rounded-b-none border border-neutral-200" : "rounded-full",
        lit
          ? "bg-[#eeeadf] text-neutral-900"
          : "bg-[#eeeadf] text-neutral-800 hover:bg-[#e5e0d4]"
      )}
    >
      <span className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 text-neutral-500">{icon}</span>
      <span className="truncate">{label.split(" · ")[0]}</span>
      <motion.svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="hidden h-4 w-4 shrink-0 text-neutral-400 sm:block"
      >
        <path d="M6 9l6 6 6-6" />
      </motion.svg>
    </button>
  );
}

function ViewPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="space-y-2.5"><div className="px-1 pb-1"><h3 className="text-[12px] font-semibold tracking-tight text-neutral-900">{title}</h3><p className="mt-0.5 text-[9px] leading-4 text-neutral-400">{description}</p></div>{children}</div>;
}

function CreamSelect({
  value,
  placeholder = "Seleccionar…",
  options,
  onChange,
}: {
  value: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    direction: "up" | "down";
    edge: number;
  } | null>(null);
  const selected = options.find((option) => option.value === value);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const expectedHeight = Math.min(224, options.length * 37 + 12);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const direction = spaceBelow < Math.min(expectedHeight, 160) && spaceAbove > spaceBelow ? "up" : "down";
    setPosition({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(96, Math.min(224, direction === "up" ? spaceAbove : spaceBelow)),
      direction,
      edge: direction === "up" ? window.innerHeight - rect.top + 5 : rect.bottom + 5,
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function closeOnOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] px-3 py-2 text-left text-[11px] outline-none transition-colors",
          open ? "border-neutral-400 ring-1 ring-neutral-300" : "hover:bg-[#eee9dd]"
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", selected ? "text-neutral-800" : "text-neutral-500")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform", open && "rotate-180")} />
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
        {open && position && (
          <motion.div
            ref={menuRef}
            data-cream-select-menu
            role="listbox"
            initial={{ opacity: 0, y: position.direction === "up" ? 5 : -5, scaleY: 0.96 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: position.direction === "up" ? 5 : -5, scaleY: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            style={{
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              ...(position.direction === "up" ? { bottom: position.edge } : { top: position.edge }),
            }}
            className={cn(
              "fixed z-[100] overflow-y-auto rounded-xl border border-[#d9d4c8] bg-[#eeeadf] p-1.5 shadow-[0_16px_40px_rgba(48,42,31,0.18)]",
              position.direction === "up" ? "origin-bottom" : "origin-top"
            )}
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-neutral-800 transition-colors",
                    active ? "bg-[#ddd7ca] font-medium" : "hover:bg-[#e5e0d4]"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-neutral-700" />}
                </button>
              );
            })}
            {options.length === 0 && (
              <p className="px-2.5 py-2 text-[10px] text-neutral-500">No hay más opciones disponibles.</p>
            )}
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

function DirectionButton({ active, label, detail, onClick }: { active: boolean; label: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("view-btn rounded-xl border p-2 text-left transition-colors", active ? "border-blue-200 bg-blue-50" : "border-[#d9d4c8] bg-[#f7f4eb] hover:bg-[#e9e4d8]")}><span className="flex items-center justify-between text-[10px] font-medium text-neutral-800">{label}{active && <Check className="h-3 w-3 text-blue-500" />}</span><span className="mt-1 block text-[8px] text-neutral-400">{detail}</span></button>;
}

function OrdenGrupoButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("view-btn rounded-xl border px-2 py-1.5 text-[10px] font-medium transition-colors", active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-[#d9d4c8] bg-[#f7f4eb] text-neutral-600 hover:bg-[#e9e4d8] hover:text-neutral-800")}>{label}</button>;
}
