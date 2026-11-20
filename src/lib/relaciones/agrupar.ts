import type { SupabaseClient } from "@supabase/supabase-js";
import { etiquetaTipoPropietario } from "@/lib/propietarios/tipo";
import { materiaInfo } from "@/lib/procesos/materias";
import { CATALOGOS_COLUMNA, cargarOpcionesColumna, catalogoColumna } from "@/lib/opciones-columna";

/**
 * Agrupa TODO lo asociado a una entidad (vía `vinculos`, en ambos sentidos)
 * en categorías desplegables listas para pintar — pedido del cliente calcado
 * de su vista en Notion, generalizado a cualquier tipo de entidad
 * (propietario, predio, vehículo, personal, concesión, oficina registral,
 * proceso). Función pura (sin `server-only`): la usan tanto Server Components
 * (ficha completa) como el panel lateral en el navegador.
 */

export type ColumnaCategoria = { id: string; label: string };

export type FilaCategoria = {
  id: string;
  /** null cuando la fila no navega a otra ficha (documentos y archivos usan vista previa en su lugar). */
  href: string | null;
  celdas: Record<string, string | null>;
  /**
   * Presente sólo en filas de documento/archivo: de dónde traer (al
   * expandir, en el cliente) los archivos adjuntos para la vista previa
   * embebida (nivel 3). `soloDirecto` evita el segundo salto por `vinculos`
   * cuando la fila ya representa "todo lo colgado directo de la entidad".
   */
  archivosDe?: { entidadTipo: string; entidadId: string; soloDirecto?: boolean };
  /** Sólo en filas de documento: `true` si se creó desde la app (`extra.origen === "app"`) y por tanto se puede mandar a la papelera. */
  origenApp?: boolean;
  /**
   * Valor crudo que ubica la fila dentro de su familia: la materia de un
   * proceso o el tipo de un contrato. El selector "Relacionar con" lo usa
   * para contar por materia/tipo sin volver a consultar la base.
   */
  clasificacion?: string | null;
};

export type CategoriaGrupo = {
  clave: string;
  titulo: string;
  /** Nombre de ícono de lucide-react; la UI hace el lookup. */
  icono: string;
  total: number;
  columnas: ColumnaCategoria[];
  filas: FilaCategoria[];
  /**
   * "entidad": fila enlaza a la ficha de otra entidad (predio, vehículo…).
   * "documento": fila es un documento propio, con vista previa de archivos.
   * "contrato": fila es un contrato propio ("+" vincula o crea uno de ese tipo, salvo mutuos).
   * "archivo": bolsa de archivos colgados directo de la entidad dueña.
   */
  tipo: "entidad" | "documento" | "contrato" | "archivo";
  /** Sólo cuando tipo === "documento": el valor de `documentos.tipo` a usar al crear una fila nueva en esta categoría. */
  tipoDocumento?: string;
  /** Id del catálogo cuando la categoría fue creada por un administrador. Los tipos predefinidos no lo tienen. */
  tipoDocumentoCustomId?: string;
  /** `true` cuando la categoría sólo se muestra por un marcador de `carpetas_vacias` (0 documentos reales todavía). */
  vacioRevelado?: boolean;
  /** `true` cuando la categoría se muestra siempre para este tipo de entidad (ver `DOCUMENTOS_FIJOS` y `CONTRATOS_FIJOS`), aunque esté en 0: no se puede "quitar" de la ficha. */
  fija?: boolean;
};

type VinculoFila = {
  origen_tipo: string;
  origen_id: string;
  destino_tipo: string;
  destino_id: string;
  rol: string | null;
};

type Referencia = { entidadDuenaId: string; entidadTipo: string; entidadId: string; rol: string | null };

// ─── Formato de celdas ──────────────────────────────────────────────────────

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim();
  return limpio || null;
}

function humanizar(valor: unknown): string | null {
  const limpio = texto(valor);
  if (!limpio) return null;
  const plano = limpio.replace(/[_-]+/g, " ").toLocaleLowerCase("es-PE");
  return plano.charAt(0).toLocaleUpperCase("es-PE") + plano.slice(1);
}

function formatFecha(valor: unknown): string | null {
  if (!valor || typeof valor !== "string") return null;
  return new Date(`${valor}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function formatBooleano(valor: unknown, siLabel: string, noLabel: string): string | null {
  if (typeof valor !== "boolean") return null;
  return valor ? siLabel : noLabel;
}

function tipoPropietarioDesdeFila(fila: Record<string, unknown>): string | null {
  const etiqueta = etiquetaTipoPropietario({
    es_propio: typeof fila.es_propio === "boolean" ? fila.es_propio : null,
    extra: fila.extra,
  });
  return etiqueta || null;
}

function formatMonto(monto: unknown, moneda: unknown): string | null {
  if (monto === null || monto === undefined || monto === "") return null;
  const simbolo = moneda === "USD" ? "US$ " : "S/ ";
  return `${simbolo}${Number(monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
}

function formatHectareas(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  return `${Number(valor).toLocaleString("es-PE")} ha`;
}

function formatBytes(bytes: unknown): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Configuración de categorías "simples" (una entidad = una categoría) ────

type ConfigSimple = {
  clave: string;
  titulo: string;
  icono: string;
  tabla: string;
  select: string;
  href: (id: string) => string;
  columnas: ColumnaCategoria[];
  celdas: (fila: Record<string, unknown>) => Record<string, string | null>;
  clasificacion?: (fila: Record<string, unknown>) => string | null;
};

const CONFIG_SIMPLE: Record<string, ConfigSimple> = {
  propietario: {
    clave: "propietario",
    titulo: "Propietarios",
    icono: "User",
    tabla: "propietarios",
    select: "id, nombre, es_propio, tipo_persona, extra",
    href: (id) => `/entidades/propietarios/${id}`,
    columnas: [
      { id: "nombre", label: "Nombre" },
      { id: "vinculacion", label: "Tipo" },
      { id: "persona", label: "Persona" },
    ],
    celdas: (f) => ({
      nombre: texto(f.nombre),
      vinculacion: tipoPropietarioDesdeFila(f),
      persona: humanizar(f.tipo_persona),
    }),
  },
  vehiculo: {
    clave: "vehiculo",
    titulo: "Vehículos",
    icono: "Car",
    tabla: "vehiculos",
    select: "id, placa, marca_modelo, categoria, responsable, soat_vence, poliza_vence, revision_tecnica",
    href: (id) => `/entidades/vehiculos/${id}`,
    columnas: [
      { id: "placa", label: "Placa" },
      { id: "marca_modelo", label: "Marca / Modelo" },
      { id: "categoria", label: "Categoría" },
      { id: "responsable", label: "Responsable" },
      { id: "soat_vence", label: "SOAT vence" },
      { id: "poliza_vence", label: "Póliza vence" },
      { id: "revision_tecnica", label: "Rev. técnica vence" },
    ],
    celdas: (f) => ({
      placa: texto(f.placa),
      marca_modelo: texto(f.marca_modelo),
      categoria: texto(f.categoria),
      responsable: texto(f.responsable),
      soat_vence: formatFecha(f.soat_vence),
      poliza_vence: formatFecha(f.poliza_vence),
      revision_tecnica: formatFecha(f.revision_tecnica),
    }),
  },
  predio: {
    clave: "predio",
    titulo: "Predios",
    icono: "MapPin",
    tabla: "predios",
    select: "id, nombre, n_partida, tipo_predio, ubicacion, registrado",
    href: (id) => `/entidades/predios/${id}`,
    columnas: [
      { id: "nombre", label: "Nombre" },
      { id: "n_partida", label: "N° Partida" },
      { id: "tipo_predio", label: "Tipo" },
      { id: "ubicacion", label: "Ubicación" },
      { id: "registrado", label: "Registrado" },
    ],
    celdas: (f) => ({
      nombre: texto(f.nombre),
      n_partida: texto(f.n_partida),
      tipo_predio: humanizar(f.tipo_predio),
      ubicacion: texto(f.ubicacion),
      registrado: formatBooleano(f.registrado, "Registrado", "No registrado"),
    }),
  },
  concesion: {
    clave: "concesion",
    titulo: "Concesiones Mineras",
    icono: "Gem",
    tabla: "concesiones_mineras",
    select: "id, nombre, codigo, hectareas, sustancia, estado",
    href: (id) => `/entidades/concesiones/${id}`,
    columnas: [
      { id: "nombre", label: "Nombre" },
      { id: "codigo", label: "Código" },
      { id: "hectareas", label: "Hectáreas" },
      { id: "sustancia", label: "Sustancia" },
      { id: "estado", label: "Estado" },
    ],
    celdas: (f) => ({
      nombre: texto(f.nombre),
      codigo: texto(f.codigo),
      hectareas: formatHectareas(f.hectareas),
      sustancia: humanizar(f.sustancia),
      estado: humanizar(f.estado),
    }),
  },
  personal: {
    clave: "personal",
    titulo: "Personal",
    icono: "UserCheck",
    tabla: "personal",
    select: "id, nombre, cargo, modalidad, activo, contrato_fin",
    href: (id) => `/entidades/personal/${id}`,
    columnas: [
      { id: "nombre", label: "Nombre" },
      { id: "cargo", label: "Cargo" },
      { id: "modalidad", label: "Modalidad" },
      { id: "activo", label: "Estado" },
      { id: "contrato_fin", label: "Fin de contrato" },
    ],
    celdas: (f) => ({
      nombre: texto(f.nombre),
      cargo: texto(f.cargo),
      modalidad: humanizar(f.modalidad),
      activo: formatBooleano(f.activo, "Activo", "Cesado"),
      contrato_fin: formatFecha(f.contrato_fin),
    }),
  },
  proceso: {
    clave: "proceso",
    titulo: "Procesos judiciales",
    icono: "Gavel",
    tabla: "procesos",
    select: "id, expediente, materia, estado, juzgado, abogado",
    href: (id) => `/procesos/${id}`,
    columnas: [
      { id: "expediente", label: "Expediente" },
      { id: "materia", label: "Materia" },
      { id: "estado", label: "Estado" },
      { id: "juzgado", label: "Juzgado" },
      { id: "abogado", label: "Abogado" },
    ],
    celdas: (f) => ({
      expediente: texto(f.expediente),
      // La clave cruda ("direccion_trabajo", "sunafil") no se puede humanizar
      // a ojo: salían "Direccion trabajo" o "Sunafil". El catálogo de materias
      // trae el nombre bien escrito, y una materia nueva cae a su propio texto.
      materia: texto(f.materia) ? materiaInfo(String(f.materia).trim()).etiqueta : null,
      estado: texto(f.estado),
      juzgado: texto(f.juzgado),
      abogado: texto(f.abogado),
    }),
    clasificacion: (f) => texto(f.materia),
  },
  oficina_registral: {
    clave: "oficina_registral",
    titulo: "Oficinas Registrales",
    icono: "Landmark",
    tabla: "oficinas_registrales",
    select: "id, nombre",
    href: (id) => `/entidades/oficinas/${id}`,
    columnas: [{ id: "nombre", label: "Nombre" }],
    celdas: (f) => ({ nombre: texto(f.nombre) }),
  },
};

// ─── Documentos, desglosados por `documentos.tipo` ──────────────────────────

const COLUMNAS_DOCUMENTO: ColumnaCategoria[] = [
  { id: "nombre", label: "Nombre" },
  { id: "fecha", label: "Fecha" },
  { id: "detalle", label: "Detalle" },
];

export const DOCUMENTO_TIPOS: { tipo: string; clave: string; titulo: string; icono: string }[] = [
  { tipo: "copia_literal", clave: "doc_copia_literal", titulo: "Copia Literal", icono: "FileText" },
  { tipo: "testimonio", clave: "doc_testimonio", titulo: "Testimonios", icono: "ScrollText" },
  { tipo: "vigencia_poder", clave: "doc_vigencia_poder", titulo: "Vigencia de Poder", icono: "FileKey2" },
  { tipo: "junta_general", clave: "doc_junta_general", titulo: "Juntas Generales", icono: "Users" },
  { tipo: "minuta", clave: "doc_minuta", titulo: "Minutas", icono: "FileSignature" },
  { tipo: "multa", clave: "doc_multa", titulo: "Multas", icono: "AlertTriangle" },
  { tipo: "documento_municipal", clave: "doc_documento_municipal", titulo: "Documentos Municipales", icono: "Building2" },
  { tipo: "constancia_posesion", clave: "doc_constancia_posesion", titulo: "Constancias de Posesión", icono: "MapPin" },
  { tipo: "titulo_archivado", clave: "doc_titulo_archivado", titulo: "Títulos Archivados", icono: "Archive" },
  { tipo: "habilitacion_urbana", clave: "doc_habilitacion_urbana", titulo: "Habilitación Urbana", icono: "Landmark" },
  { tipo: "plano", clave: "doc_plano", titulo: "Planos", icono: "Map" },
  { tipo: "memoria_tecnica", clave: "doc_memoria_tecnica", titulo: "Memoria Técnica", icono: "FileBox" },
  { tipo: "tarjeta_identificacion", clave: "doc_tarjeta_identificacion", titulo: "Tarjetas de Identificación", icono: "CreditCard" },
  { tipo: "poliza", clave: "doc_poliza", titulo: "Pólizas", icono: "ShieldCheck" },
];
const DOCUMENTO_POR_TIPO = new Map(DOCUMENTO_TIPOS.map((d) => [d.tipo, d]));
export const DOCUMENTO_FALLBACK = { tipo: "otro", clave: "doc_otros", titulo: "Otros Documentos", icono: "FileText" };

type ConfigDocumento = {
  tipo: string;
  clave: string;
  titulo: string;
  icono: string;
  customId?: string;
};

function configurarTipoDocumentoCustom(tipo: string, titulo: string, customId: string): ConfigDocumento {
  return {
    tipo,
    clave: `doc_custom_${tipo}`,
    titulo,
    icono: "FileText",
    customId,
  };
}

/**
 * Categorías de documentos que una entidad muestra siempre, aunque estén en
 * 0 — calco de las tablas embebidas de su página en Notion (el predio traía
 * "copias literales", "Testimonios" y "Títulos archivados" como vistas
 * siempre visibles). Sin esto, el cliente no ve dónde agregar el primero.
 */
const DOCUMENTOS_FIJOS: Record<string, string[]> = {
  predio: ["copia_literal", "testimonio", "titulo_archivado"],
};

/** Tipos válidos de `documentos.tipo` para el alta rápida "+ Agregar documento" (incluye el genérico "otro"). */
export const TIPOS_DOCUMENTO_VALIDOS = new Set([...DOCUMENTO_TIPOS.map((d) => d.tipo), DOCUMENTO_FALLBACK.tipo]);

// ─── Contratos, desglosados por `contratos.tipo` (mutuo se parte por rol) ───

const COLUMNAS_CONTRATO: ColumnaCategoria[] = [
  { id: "nombre", label: "Nombre" },
  { id: "monto", label: "Monto" },
  { id: "plazo", label: "Plazo" },
  { id: "fecha_inicio", label: "Inicio" },
  { id: "fecha_vencimiento", label: "Vencimiento" },
  { id: "estado", label: "Estado" },
];

export const CONTRATO_TIPOS: { tipo: string; clave: string; titulo: string; icono: string }[] = [
  { tipo: "personal", clave: "contrato_personal", titulo: "Contratos de Personal", icono: "UserCheck" },
  { tipo: "profesional", clave: "contrato_profesional", titulo: "Contratos Profesionales", icono: "Briefcase" },
  { tipo: "servicios", clave: "contrato_servicios", titulo: "Contratos de Servicios", icono: "Handshake" },
  { tipo: "arrendamiento", clave: "contrato_arrendamiento", titulo: "Contratos de Arrendamiento", icono: "Building" },
  { tipo: "concesiones", clave: "contrato_concesiones", titulo: "Contratos de Concesiones", icono: "Gem" },
];
const CONTRATO_POR_TIPO = new Map(CONTRATO_TIPOS.map((c) => [c.tipo, c]));

/**
 * Categorías de contratos que una entidad muestra siempre, aunque estén en 0
 * (mismo criterio que `DOCUMENTOS_FIJOS`): a una persona recién registrada
 * hay que poder agregarle su primer contrato desde su propia ficha.
 */
const CONTRATOS_FIJOS: Record<string, string[]> = {
  personal: ["personal"],
};
export const CONTRATO_MUTUO_GENERICO = { clave: "contrato_mutuo", titulo: "Contratos Mutuos", icono: "HandCoins" };
const MUTUO_ACREEDOR = { clave: "mutuo_acreedor", titulo: "Mutuos donde es Acreedor", icono: "Wallet" };
const MUTUO_DEUDOR = { clave: "mutuo_deudor", titulo: "Mutuos donde es Deudor", icono: "Banknote" };
export const CONTRATO_FALLBACK = { clave: "contrato_otros", titulo: "Otros Contratos", icono: "ScrollText" };

// ─── Archivos colgados directo de la entidad dueña (sin pasar por `documentos`) ─

const COLUMNAS_ARCHIVO: ColumnaCategoria[] = [{ id: "nombre", label: "Archivos adjuntos" }];

// Orden de aparición pedido por el cliente (calco de su vista en Notion);
// lo que no está en su lista va al final, en el orden que se definió arriba.
const ORDEN_CLAVES = [
  "propietario", "vehiculo", "predio", "concesion", "personal", "oficina_registral",
  "doc_vigencia_poder", "doc_copia_literal", "doc_testimonio",
  "contrato_personal", "doc_junta_general", "contrato_arrendamiento",
  "doc_minuta", "doc_multa", "contrato_servicios",
  "mutuo_acreedor", "mutuo_deudor",
  "proceso",
  "doc_documento_municipal", "doc_constancia_posesion", "doc_titulo_archivado",
  "doc_habilitacion_urbana", "doc_plano", "doc_memoria_tecnica",
  "doc_tarjeta_identificacion", "doc_poliza",
  "contrato_profesional", "contrato_concesiones", "contrato_mutuo",
  "doc_otros", "contrato_otros",
  "archivos_directos",
];
const ORDEN_INDICE = new Map(ORDEN_CLAVES.map((clave, index) => [clave, index]));

const TIPOS_VALIDOS = new Set([
  "propietario", "vehiculo", "predio", "concesion", "personal", "oficina_registral",
  "proceso", "documento", "contrato",
]);

// PostgREST mete los ids de `.in()` en la URL: pasados ~350 UUIDs la
// petición falla (400 / "fetch failed") y, sin esto, la categoría entera
// desaparecía en silencio — LCV tiene ~400 predios vinculados y su
// categoría "Predios" salía vacía. Además cada respuesta se corta en 1000
// filas. Se parte en lotes y se pagina. No usa `@/lib/supabase/fetch-all`
// porque éste también corre en el navegador (panel lateral).
const IDS_POR_LOTE = 100;
const FILAS_POR_PAGINA = 1000;

type ConsultaPaginada = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

async function leerEnLotes(
  ids: string[],
  consulta: (lote: string[]) => ConsultaPaginada
): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_LOTE) {
    const lote = ids.slice(i, i + IDS_POR_LOTE);
    for (let from = 0; ; from += FILAS_POR_PAGINA) {
      const { data, error } = await consulta(lote).range(from, from + FILAS_POR_PAGINA - 1);
      if (error) throw new Error(error.message);
      const pagina = (data ?? []) as Record<string, unknown>[];
      filas.push(...pagina);
      if (pagina.length < FILAS_POR_PAGINA) break;
    }
  }
  return filas;
}

async function fetchTabla(
  supabase: SupabaseClient,
  tabla: string,
  select: string,
  ids: Set<string> | undefined
): Promise<Map<string, Record<string, unknown>>> {
  if (!ids || ids.size === 0) return new Map();
  const filas = await leerEnLotes(Array.from(ids), (lote) => supabase.from(tabla).select(select).in("id", lote).order("id"));
  return new Map(filas.map((fila) => [fila.id as string, fila]));
}

/** Etiquetas vigentes del catálogo editable (`opciones_columna`): `tabla.campo` → valor → etiqueta. */
type EtiquetasCatalogo = Map<string, Map<string, string>>;

/**
 * Sólo consulta las tablas que tienen alguna columna con catálogo y están entre
 * las entidades a pintar. Si falla o falta la migración, queda vacío y las
 * celdas conservan el texto del valor guardado.
 */
async function cargarEtiquetasCatalogo(supabase: SupabaseClient, tablas: Set<string>): Promise<EtiquetasCatalogo> {
  const etiquetas: EtiquetasCatalogo = new Map();
  const conCatalogo = Array.from(new Set(Object.values(CATALOGOS_COLUMNA).map((catalogo) => catalogo.tabla))).filter((tabla) => tablas.has(tabla));
  const catalogos = await Promise.all(conCatalogo.map(async (tabla) => [tabla, await cargarOpcionesColumna(supabase, tabla)] as const));
  for (const [tabla, porCampo] of catalogos) {
    for (const [campo, opciones] of Object.entries(porCampo)) {
      etiquetas.set(`${tabla}.${campo}`, new Map(opciones.map((opcion) => [opcion.valor, opcion.etiqueta])));
    }
  }
  return etiquetas;
}

/**
 * Una opción renombrada en "Editar propiedad" (p. ej. "Metal" → "Metálico")
 * se ve igual aquí que en la pastilla de la tabla: si la celda es una columna
 * con catálogo y el valor guardado está en él, manda la etiqueta del catálogo.
 */
function aplicarEtiquetasCatalogo(
  celdas: Record<string, string | null>,
  tabla: string,
  fila: Record<string, unknown>,
  etiquetas: EtiquetasCatalogo
) {
  for (const celda of Object.keys(celdas)) {
    const campo = CAMPO_DE_CELDA[tabla]?.[celda] ?? celda;
    if (!catalogoColumna(tabla, campo)) continue;
    const valor = texto(fila[campo]);
    const etiqueta = valor ? etiquetas.get(`${tabla}.${campo}`)?.get(valor) : undefined;
    if (etiqueta) celdas[celda] = etiqueta;
  }
}

/** Celdas que se llaman distinto que la columna de la que salen (`tabla` → celda → campo). */
const CAMPO_DE_CELDA: Record<string, Record<string, string>> = {
  propietarios: { persona: "tipo_persona" },
};

/**
 * Resuelve en lote las categorías desplegables (entidades vinculadas,
 * documentos por tipo, contratos por tipo, mutuos por rol, archivos
 * directos…) de una o más entidades de un tipo dado, leyendo `vinculos` en
 * ambos sentidos. Nada de N+1: una consulta por tabla de destino, sin
 * importar cuántas entidades o cuántos vínculos tengan.
 */
export async function cargarCategoriasEntidad(
  supabase: SupabaseClient,
  entidadTipo: string,
  entidadIds: string[]
): Promise<Record<string, CategoriaGrupo[]>> {
  if (entidadIds.length === 0) return {};

  const [comoOrigen, comoDestino, archivosDirectos, { data: tiposDocumentoCustom }, { data: carpetasVacias }] = await Promise.all([
    leerEnLotes(entidadIds, (lote) =>
      supabase
        .from("vinculos")
        .select("origen_tipo, origen_id, destino_tipo, destino_id, rol")
        .eq("origen_tipo", entidadTipo)
        .in("origen_id", lote)
        .order("id")
    ),
    leerEnLotes(entidadIds, (lote) =>
      supabase
        .from("vinculos")
        .select("origen_tipo, origen_id, destino_tipo, destino_id, rol")
        .eq("destino_tipo", entidadTipo)
        .in("destino_id", lote)
        .order("id")
    ),
    leerEnLotes(entidadIds, (lote) =>
      supabase
        .from("archivos")
        .select("id, entidad_id, nombre_original, tamano_bytes")
        .eq("entidad_tipo", entidadTipo)
        .in("entidad_id", lote)
        .order("id")
    ),
    supabase
      .from("tipos_documento_custom")
      .select("id, slug, nombre")
      .order("nombre"),
    supabase
      .from("carpetas_vacias")
      .select("entidad_id, valor")
      .eq("entidad_tipo", entidadTipo)
      .eq("contexto", "documento")
      .in("entidad_id", entidadIds),
  ]);

  // Los tipos personalizados viven en un catálogo global. Además de
  // reconocer los documentos que ya usan uno, en Propietarios conservamos
  // sus categorías aun cuando todavía estén vacías: así el tipo recién
  // creado desde el panel aparece inmediatamente y permite agregar su primer
  // documento.
  const documentosPorTipo = new Map<string, ConfigDocumento>([
    ...DOCUMENTO_POR_TIPO,
    [DOCUMENTO_FALLBACK.tipo, DOCUMENTO_FALLBACK],
  ]);
  const configuracionesCustom: ConfigDocumento[] = [];
  for (const fila of (tiposDocumentoCustom ?? []) as { id: string | null; slug: string | null; nombre: string | null }[]) {
    const customId = texto(fila.id);
    const tipo = texto(fila.slug);
    const titulo = texto(fila.nombre);
    if (!customId || !tipo || !titulo || documentosPorTipo.has(tipo)) continue;
    const config = configurarTipoDocumentoCustom(tipo, titulo, customId);
    documentosPorTipo.set(tipo, config);
    configuracionesCustom.push(config);
  }
  const clavesDocumentoCustom = new Set(configuracionesCustom.map((config) => config.clave));

  const referenciasCrudas: Referencia[] = [
    ...((comoOrigen ?? []) as VinculoFila[]).map((v) => ({
      entidadDuenaId: v.origen_id, entidadTipo: v.destino_tipo, entidadId: v.destino_id, rol: v.rol,
    })),
    ...((comoDestino ?? []) as VinculoFila[]).map((v) => ({
      entidadDuenaId: v.destino_id, entidadTipo: v.origen_tipo, entidadId: v.origen_id, rol: v.rol,
    })),
  ].filter((referencia) =>
    TIPOS_VALIDOS.has(referencia.entidadTipo) &&
    // Evita el caso patológico de un vínculo de una entidad consigo misma
    // (misma fila): no aporta una categoría útil.
    !(referencia.entidadTipo === entidadTipo && referencia.entidadId === referencia.entidadDuenaId)
  );

  // La importación de Notion dejó vínculos recíprocos (A→B y B→A) para el
  // mismo par: se funden en una sola referencia, priorizando el rol
  // explícito si lo hay (dos roles explícitos distintos sí se conservan,
  // p.ej. si en la data real un contrato mutuo quedó marcado con ambos).
  const grupos = new Map<string, Referencia[]>();
  for (const referencia of referenciasCrudas) {
    const clave = `${referencia.entidadDuenaId}:${referencia.entidadTipo}:${referencia.entidadId}`;
    const grupo = grupos.get(clave) ?? [];
    grupo.push(referencia);
    grupos.set(clave, grupo);
  }
  const referencias: Referencia[] = [];
  for (const grupo of grupos.values()) {
    const conRol = grupo.filter((r) => r.rol?.trim());
    const candidatas = conRol.length > 0 ? conRol : [grupo[0]];
    const rolesVistos = new Set<string>();
    for (const referencia of candidatas) {
      const rol = referencia.rol?.trim().toLocaleLowerCase("es-PE") ?? "";
      if (rolesVistos.has(rol)) continue;
      rolesVistos.add(rol);
      referencias.push(referencia);
    }
  }

  const idsPorTipo = new Map<string, Set<string>>();
  for (const referencia of referencias) {
    const set = idsPorTipo.get(referencia.entidadTipo) ?? new Set<string>();
    set.add(referencia.entidadId);
    idsPorTipo.set(referencia.entidadTipo, set);
  }

  const tablasPresentes = new Set(
    Array.from(idsPorTipo.keys()).map((tipo) => CONFIG_SIMPLE[tipo]?.tabla).filter((tabla): tabla is string => Boolean(tabla))
  );

  const [filasPropietario, filasVehiculo, filasPredio, filasConcesion, filasPersonal, filasProceso, filasOficina, filasDocumento, filasContrato, etiquetasCatalogo] = await Promise.all([
    fetchTabla(supabase, CONFIG_SIMPLE.propietario.tabla, CONFIG_SIMPLE.propietario.select, idsPorTipo.get("propietario")),
    fetchTabla(supabase, CONFIG_SIMPLE.vehiculo.tabla, CONFIG_SIMPLE.vehiculo.select, idsPorTipo.get("vehiculo")),
    fetchTabla(supabase, CONFIG_SIMPLE.predio.tabla, CONFIG_SIMPLE.predio.select, idsPorTipo.get("predio")),
    fetchTabla(supabase, CONFIG_SIMPLE.concesion.tabla, CONFIG_SIMPLE.concesion.select, idsPorTipo.get("concesion")),
    fetchTabla(supabase, CONFIG_SIMPLE.personal.tabla, CONFIG_SIMPLE.personal.select, idsPorTipo.get("personal")),
    fetchTabla(supabase, CONFIG_SIMPLE.proceso.tabla, CONFIG_SIMPLE.proceso.select, idsPorTipo.get("proceso")),
    fetchTabla(supabase, CONFIG_SIMPLE.oficina_registral.tabla, CONFIG_SIMPLE.oficina_registral.select, idsPorTipo.get("oficina_registral")),
    fetchTabla(supabase, "documentos", "id, tipo, nombre, fecha, detalle, extra", idsPorTipo.get("documento")),
    fetchTabla(supabase, "contratos", "id, tipo, nombre, monto, moneda, plazo, fecha_inicio, fecha_vencimiento, estado", idsPorTipo.get("contrato")),
    cargarEtiquetasCatalogo(supabase, tablasPresentes),
  ]);

  const datosPorTipo: Record<string, Map<string, Record<string, unknown>>> = {
    propietario: filasPropietario,
    vehiculo: filasVehiculo,
    predio: filasPredio,
    concesion: filasConcesion,
    personal: filasPersonal,
    proceso: filasProceso,
    oficina_registral: filasOficina,
    documento: filasDocumento,
    contrato: filasContrato,
  };

  const resultado = new Map<string, Map<string, CategoriaGrupo>>();

  function categoriaDe(
    entidadDuenaId: string,
    clave: string,
    titulo: string,
    icono: string,
    columnas: ColumnaCategoria[],
    tipo: CategoriaGrupo["tipo"],
    tipoDocumento?: string,
    tipoDocumentoCustomId?: string
  ): CategoriaGrupo {
    const porEntidad = resultado.get(entidadDuenaId) ?? new Map<string, CategoriaGrupo>();
    resultado.set(entidadDuenaId, porEntidad);
    const existente = porEntidad.get(clave);
    if (existente) return existente;
    const nueva: CategoriaGrupo = {
      clave,
      titulo,
      icono,
      total: 0,
      columnas,
      filas: [],
      tipo,
      tipoDocumento,
      tipoDocumentoCustomId,
    };
    porEntidad.set(clave, nueva);
    return nueva;
  }

  function agregarFila(categoria: CategoriaGrupo, fila: FilaCategoria) {
    if (categoria.filas.some((f) => f.id === fila.id)) return; // mismo registro visto por origen y destino
    categoria.filas.push(fila);
    categoria.total += 1;
  }

  for (const referencia of referencias) {
    const fila = datosPorTipo[referencia.entidadTipo]?.get(referencia.entidadId);
    if (!fila) continue; // vínculo a un registro borrado, o sin permiso (RLS lo omite del batch)

    if (referencia.entidadTipo === "documento") {
      const tipoDoc = texto(fila.tipo);
      const config: ConfigDocumento = (tipoDoc && documentosPorTipo.get(tipoDoc)) || DOCUMENTO_FALLBACK;
      const categoria = categoriaDe(
        referencia.entidadDuenaId,
        config.clave,
        config.titulo,
        config.icono,
        COLUMNAS_DOCUMENTO,
        "documento",
        config.tipo,
        config.customId
      );
      agregarFila(categoria, {
        id: referencia.entidadId,
        href: `/documentos/${referencia.entidadId}`,
        celdas: {
          nombre: texto(fila.nombre),
          fecha: formatFecha(fila.fecha),
          detalle: texto(fila.detalle),
        },
        archivosDe: { entidadTipo: "documento", entidadId: referencia.entidadId },
        origenApp: (fila.extra as { origen?: string } | null)?.origen === "app",
      });
      continue;
    }

    if (referencia.entidadTipo === "contrato") {
      const tipoContrato = texto(fila.tipo);
      let config: { clave: string; titulo: string; icono: string };
      if (tipoContrato === "mutuo") {
        const rol = referencia.rol?.trim().toLocaleLowerCase("es-PE");
        config = rol === "acreedor" ? MUTUO_ACREEDOR : rol === "deudor" ? MUTUO_DEUDOR : CONTRATO_MUTUO_GENERICO;
      } else {
        config = (tipoContrato && CONTRATO_POR_TIPO.get(tipoContrato)) || CONTRATO_FALLBACK;
      }
      const categoria = categoriaDe(referencia.entidadDuenaId, config.clave, config.titulo, config.icono, COLUMNAS_CONTRATO, "contrato");
      agregarFila(categoria, {
        id: referencia.entidadId,
        href: `/contratos/${referencia.entidadId}`,
        celdas: {
          nombre: texto(fila.nombre),
          monto: formatMonto(fila.monto, fila.moneda),
          plazo: texto(fila.plazo),
          fecha_inicio: formatFecha(fila.fecha_inicio),
          fecha_vencimiento: formatFecha(fila.fecha_vencimiento),
          estado: texto(fila.estado),
        },
        // Igual que las filas de "documento": un contrato también tiene sus
        // propios archivos adjuntos (el PDF del contrato, adendas, etc.), así
        // que su fila necesita el mismo chevron de vista previa embebida.
        archivosDe: { entidadTipo: "contrato", entidadId: referencia.entidadId },
        clasificacion: tipoContrato,
      });
      continue;
    }

    const config = CONFIG_SIMPLE[referencia.entidadTipo];
    if (!config) continue;
    const categoria = categoriaDe(referencia.entidadDuenaId, config.clave, config.titulo, config.icono, config.columnas, "entidad");
    const celdas = config.celdas(fila);
    aplicarEtiquetasCatalogo(celdas, config.tabla, fila, etiquetasCatalogo);
    agregarFila(categoria, {
      id: referencia.entidadId,
      href: config.href(referencia.entidadId),
      celdas,
      clasificacion: config.clasificacion?.(fila),
    });
  }

  if (entidadTipo === "propietario") {
    for (const entidadDuenaId of entidadIds) {
      for (const config of configuracionesCustom) {
        categoriaDe(
          entidadDuenaId,
          config.clave,
          config.titulo,
          config.icono,
          COLUMNAS_DOCUMENTO,
          "documento",
          config.tipo,
          config.customId
        );
      }
    }
  }

  // Categorías de documento "reveladas" desde el "+" superior del panel
  // (predefinidas o personalizadas) aunque todavía no tengan ni un
  // documento: el marcador vive en `carpetas_vacias` — ver
  // `src/lib/actions/carpetas.ts`. Se marcan `vacioRevelado` sólo si de
  // verdad se crean aquí (si ya existían por tener contenido real,
  // `categoriaDe` devuelve la existente sin tocarla).
  const tiposRevelados = new Map<string, Set<string>>();
  for (const fila of (carpetasVacias ?? []) as { entidad_id: string; valor: string }[]) {
    const set = tiposRevelados.get(fila.entidad_id) ?? new Set<string>();
    set.add(fila.valor);
    tiposRevelados.set(fila.entidad_id, set);
  }
  for (const [entidadDuenaId, tipos] of tiposRevelados.entries()) {
    for (const tipo of tipos) {
      const config = documentosPorTipo.get(tipo);
      if (!config) continue; // tipo custom borrado del catálogo global después de revelarse
      const categoria = categoriaDe(
        entidadDuenaId,
        config.clave,
        config.titulo,
        config.icono,
        COLUMNAS_DOCUMENTO,
        "documento",
        config.tipo,
        config.customId
      );
      if (categoria.total === 0) categoria.vacioRevelado = true;
    }
  }

  for (const tipo of DOCUMENTOS_FIJOS[entidadTipo] ?? []) {
    const config = documentosPorTipo.get(tipo);
    if (!config) continue;
    for (const entidadDuenaId of entidadIds) {
      const categoria = categoriaDe(
        entidadDuenaId,
        config.clave,
        config.titulo,
        config.icono,
        COLUMNAS_DOCUMENTO,
        "documento",
        config.tipo,
        config.customId
      );
      categoria.fija = true;
    }
  }

  for (const tipo of CONTRATOS_FIJOS[entidadTipo] ?? []) {
    const config = CONTRATO_POR_TIPO.get(tipo);
    if (!config) continue;
    for (const entidadDuenaId of entidadIds) {
      categoriaDe(entidadDuenaId, config.clave, config.titulo, config.icono, COLUMNAS_CONTRATO, "contrato").fija = true;
    }
  }

  // Categorías de relación (propietario, vehículo, predio…) siempre
  // presentes, aunque no haya ningún vínculo todavía: si sólo se crean al
  // encontrar una referencia, la categoría entera desaparece cuando el
  // conteo es 0 y no hay dónde hacer clic para vincular el primer registro
  // de ese tipo. Se excluye el propio tipo de la entidad dueña (no tiene
  // sentido "vincular un vehículo" desde la ficha de otro vehículo).
  for (const entidadDuenaId of entidadIds) {
    for (const config of Object.values(CONFIG_SIMPLE)) {
      if (config.clave === entidadTipo) continue;
      categoriaDe(entidadDuenaId, config.clave, config.titulo, config.icono, config.columnas, "entidad");
    }
  }

  // Categoría "Archivos": todo lo que cuelga directo de la entidad dueña sin
  // pasar por una ficha de `documentos` (p. ej. personal, concesiones,
  // oficinas, o cualquier adjunto suelto en las demás). Una fila por entidad
  // dueña que agrupa todos sus archivos directos — el detalle completo (y el
  // "+ agregar archivo/carpeta") vive en la vista previa embebida (nivel 3).
  // Siempre presente (mismo criterio que las categorías de relación de
  // arriba): así su "+" deja crear la primera subcarpeta vacía aunque la
  // entidad no tenga ni un archivo todavía.
  const archivosPorDuena = new Map<string, { id: string; nombre_original: string; tamano_bytes: number }[]>();
  for (const archivo of (archivosDirectos ?? []) as { id: string; entidad_id: string; nombre_original: string; tamano_bytes: number }[]) {
    const lista = archivosPorDuena.get(archivo.entidad_id) ?? [];
    lista.push(archivo);
    archivosPorDuena.set(archivo.entidad_id, lista);
  }
  for (const entidadDuenaId of entidadIds) {
    const lista = archivosPorDuena.get(entidadDuenaId) ?? [];
    const categoria = categoriaDe(entidadDuenaId, "archivos_directos", "Archivos", "Paperclip", COLUMNAS_ARCHIVO, "archivo");
    agregarFila(categoria, {
      id: entidadDuenaId,
      href: null,
      celdas: {
        nombre: lista.length === 0
          ? "Sin archivos sueltos todavía"
          : `${lista.length} archivo${lista.length !== 1 ? "s" : ""} · ${formatBytes(lista.reduce((acc, a) => acc + (Number(a.tamano_bytes) || 0), 0))}`,
      },
      archivosDe: { entidadTipo, entidadId: entidadDuenaId, soloDirecto: true },
    });
    // La categoría tiene siempre una sola fila (la entidad dueña), así que
    // `agregarFila` la dejaba en 1 aunque no hubiera archivos. El número de
    // la cabecera tiene que decir cuántos archivos hay de verdad.
    categoria.total = lista.length;
  }

  const clavesRelacionSimple = new Set(Object.values(CONFIG_SIMPLE).map((config) => config.clave));
  clavesRelacionSimple.add("archivos_directos");
  const final: Record<string, CategoriaGrupo[]> = {};
  for (const [entidadDuenaId, categorias] of resultado.entries()) {
    final[entidadDuenaId] = Array.from(categorias.values())
      .filter((categoria) =>
        categoria.total > 0 || categoria.vacioRevelado || categoria.fija || clavesDocumentoCustom.has(categoria.clave) || clavesRelacionSimple.has(categoria.clave)
      )
      .sort((a, b) => (ORDEN_INDICE.get(a.clave) ?? 999) - (ORDEN_INDICE.get(b.clave) ?? 999));
  }
  return final;
}

/** @deprecated usa `cargarCategoriasEntidad(supabase, "propietario", ids)` — se mantiene como alias por compatibilidad. */
export function cargarCategoriasPropietarios(
  supabase: SupabaseClient,
  propietarioIds: string[]
): Promise<Record<string, CategoriaGrupo[]>> {
  return cargarCategoriasEntidad(supabase, "propietario", propietarioIds);
}
