/**
 * Centro de notificaciones global.
 *
 * Reúne en una sola lista las cuatro cosas que el cliente quiere ver sin entrar
 * a cada módulo: lo que vence (reutiliza `src/lib/alertas.ts`), las diligencias
 * judiciales próximas (parser de `src/lib/procesos/diligencias.ts` + tabla
 * `eventos`), las novedades de la semana y los datos incompletos que traban la
 * gestión. Toda la carga y normalización vive aquí; `notification-bell.tsx`
 * queda como presentación pura.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { alertasAbiertas, getAlertas, nivelAlerta, type Alerta } from "@/lib/alertas";
import { diligenciasEnVentana, diasHasta, nivelUrgencia } from "@/lib/procesos/diligencias";
import { cargarProcesosDeEventos, normalizarEstado } from "@/lib/procesos/eventos";
import { MATERIAS } from "@/app/(dashboard)/procesos/opciones";

// ─── Tipos ────────────────────────────────────────────────────────────────

export type CategoriaNotificacion = "urgente" | "diligencia" | "novedad" | "revision";

export type NivelNotificacion = "critico" | "proximo" | "normal" | "info";

/** Clave de icono; el componente decide qué dibujar para cada una. */
export type IconoNotificacion =
  | "contrato"
  | "vehiculo"
  | "personal"
  | "documento"
  | "proceso"
  | "predio"
  | "archivo"
  | "evento"
  | "revision";

export type Notificacion = {
  /** Estable entre recargas: es la clave con la que se recuerda "ya leído". */
  id: string;
  categoria: CategoriaNotificacion;
  icono: IconoNotificacion;
  titulo: string;
  detalle?: string;
  /** "YYYY-MM-DD" para fechas de calendario, timestamp ISO para novedades. */
  fecha?: string;
  /** Días hasta `fecha`: positivo futuro, negativo pasado. */
  dias?: number;
  nivel: NivelNotificacion;
  href: string;
};

export const CATEGORIAS_NOTIFICACION: { id: CategoriaNotificacion; label: string }[] = [
  { id: "urgente", label: "Urgente" },
  { id: "diligencia", label: "Diligencias" },
  { id: "novedad", label: "Novedades" },
  { id: "revision", label: "Revisión" },
];

/** Ventana de la sección "Diligencias" (los vencimientos usan la de `alertas.ts`). */
export const DIAS_DILIGENCIAS = 60;
/** Hasta cuánto atrás se rescatan las diligencias que siguen sin cerrar. */
const DIAS_VENCIDAS = 365;
/** Ventana de la sección "Novedades". */
export const DIAS_NOVEDADES = 7;

const LIMITE_NOVEDADES_POR_TABLA = 10;
const LIMITE_ARCHIVOS = 15;
const LIMITE_DILIGENCIAS = 30;
/** Pasadas sin cerrar: todas deben seguir a la vista hasta que alguien las cierre. */
const LIMITE_VENCIDAS = 150;
const LIMITE_PROCESOS = 400;
/** Reconsultar como mucho cada 2 min: la campana se remonta en cada navegación. */
const TTL_CACHE_MS = 120_000;

// ─── Fechas relativas en español ──────────────────────────────────────────

function relativoDias(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  return dias > 0 ? `en ${dias} días` : `hace ${Math.abs(dias)} días`;
}

/** "en 3 días" · "hace 2 días" · "hace 4 h". Acepta fecha ISO o timestamp. */
export function fechaRelativa(fecha?: string, dias?: number): string {
  if (typeof dias === "number") return relativoDias(dias);
  if (!fecha) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return relativoDias(diasHasta(fecha));

  const ms = new Date(fecha).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  const abs = Math.abs(ms);
  const futuro = ms > 0;
  if (abs < 60_000) return "hace un momento";
  if (abs < 3_600_000) {
    const minutos = Math.round(abs / 60_000);
    return futuro ? `en ${minutos} min` : `hace ${minutos} min`;
  }
  if (abs < 86_400_000) {
    const horas = Math.round(abs / 3_600_000);
    return futuro ? `en ${horas} h` : `hace ${horas} h`;
  }
  return relativoDias(Math.round(ms / 86_400_000));
}

/** Día "YYYY-MM-DD" en hora de Perú: el borde del día no depende del navegador. */
function claveDiaEnLima(fechaHoraISO: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(fechaHoraISO));
}

function hoyLima(): string {
  return claveDiaEnLima(new Date().toISOString());
}

function haceDiasISO(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString();
}

function enDiasISO(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}

// ─── Destinos ─────────────────────────────────────────────────────────────

const HREF_ENTIDAD: Record<string, (id: string) => string> = {
  propietario: (id) => `/entidades/propietarios/${id}`,
  predio: (id) => `/entidades/predios/${id}`,
  vehiculo: (id) => `/entidades/vehiculos/${id}`,
  concesion: (id) => `/entidades/concesiones/${id}`,
  personal: (id) => `/entidades/personal/${id}`,
  oficina_registral: (id) => `/entidades/oficinas/${id}`,
  documento: (id) => `/documentos/${id}`,
  contrato: (id) => `/contratos/${id}`,
  proceso: (id) => `/procesos/${id}`,
};

const ENTIDAD_LABEL: Record<string, string> = {
  propietario: "Propietario",
  predio: "Predio",
  vehiculo: "Vehículo",
  concesion: "Concesión",
  personal: "Personal",
  oficina_registral: "Oficina registral",
  documento: "Documento",
  contrato: "Contrato",
  proceso: "Proceso",
  evento: "Evento",
};

function hrefEntidad(tipo: string | null, id: string | null): string {
  if (!tipo || !id) return "/dashboard";
  return HREF_ENTIDAD[tipo]?.(id) ?? "/dashboard";
}

// ─── Urgente: vencimientos (fuente única: alertas.ts) ─────────────────────

const ICONO_ALERTA: Record<Alerta["origen"], IconoNotificacion> = {
  contrato: "contrato",
  vehiculo: "vehiculo",
  personal: "personal",
  documento: "documento",
  propiedad: "evento",
};

/** Lo cerrado (se renovó, no se renueva…) ya no es urgente: no entra a la campana. */
export function normalizarAlertas(alertas: Alerta[]): Notificacion[] {
  return alertasAbiertas(alertas).map((a) => ({
    // La fecha entra en el id para que un vencimiento reprogramado vuelva a avisar.
    id: `urgente:${a.id}:${a.fecha}`,
    categoria: "urgente" as const,
    icono: ICONO_ALERTA[a.origen],
    titulo: a.nombre || a.etiqueta,
    detalle: a.vencido ? `${a.etiqueta} — ya venció` : a.etiqueta,
    fecha: a.fecha,
    dias: a.dias,
    nivel: nivelAlerta(a.dias),
    href: a.href,
  }));
}

// ─── Carga ────────────────────────────────────────────────────────────────

type ProcesoRow = {
  id: string;
  expediente: string | null;
  asunto: string | null;
  materia: string | null;
  descripcion: string | null;
  diligencia: string | null;
};

type EventoRow = {
  id: string;
  titulo: string | null;
  inicia_en: string | null;
  tipo_diligencia: string | null;
  estado: string | null;
  notificar: boolean | null;
};

type NovedadRow = {
  id: string;
  creado_en: string | null;
  actualizado_en: string | null;
  [campo: string]: unknown;
};

type ArchivoRow = {
  id: string;
  nombre_original: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  subido_en: string | null;
};

type FuenteNovedad = {
  tabla: string;
  columnas: string;
  icono: IconoNotificacion;
  singular: string;
  /** Nombre visible de la fila. */
  nombre: (row: NovedadRow) => string;
  href: (row: NovedadRow) => string;
};

const FUENTES_NOVEDADES: FuenteNovedad[] = [
  {
    tabla: "documentos",
    columnas: "id, nombre, tipo, creado_en, actualizado_en",
    icono: "documento",
    singular: "documento",
    nombre: (r) => (r.nombre as string) || "Documento sin nombre",
    href: (r) => `/documentos/${r.id}`,
  },
  {
    tabla: "contratos",
    columnas: "id, nombre, creado_en, actualizado_en",
    icono: "contrato",
    singular: "contrato",
    nombre: (r) => (r.nombre as string) || "Contrato sin nombre",
    href: (r) => `/contratos/${r.id}`,
  },
  {
    tabla: "procesos",
    columnas: "id, expediente, asunto, creado_en, actualizado_en",
    icono: "proceso",
    singular: "proceso",
    nombre: (r) => (r.expediente as string) || (r.asunto as string) || "Proceso sin expediente",
    href: (r) => `/procesos/${r.id}`,
  },
  {
    tabla: "predios",
    columnas: "id, nombre, creado_en, actualizado_en",
    icono: "predio",
    singular: "predio",
    nombre: (r) => (r.nombre as string) || "Predio sin nombre",
    href: (r) => `/entidades/predios/${r.id}`,
  },
  {
    tabla: "vehiculos",
    columnas: "id, placa, marca_modelo, creado_en, actualizado_en",
    icono: "vehiculo",
    singular: "vehículo",
    nombre: (r) => (r.placa as string) || (r.marca_modelo as string) || "Vehículo sin placa",
    href: (r) => `/entidades/vehiculos/${r.id}`,
  },
];

function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("es-PE") + texto.slice(1);
}

function normalizarNovedades(fuente: FuenteNovedad, rows: NovedadRow[], desde: string): Notificacion[] {
  const notificaciones: Notificacion[] = [];
  for (const row of rows) {
    const creado = row.creado_en ?? undefined;
    const actualizado = row.actualizado_en ?? undefined;
    const esNuevo = !!creado && creado >= desde;
    const marca = esNuevo ? creado : actualizado;
    if (!marca) continue;
    notificaciones.push({
      id: `novedad:${fuente.tabla}:${row.id}:${marca}`,
      categoria: "novedad",
      icono: fuente.icono,
      titulo: esNuevo
        ? `Nuevo ${fuente.singular} registrado`
        : `${capitalizar(fuente.singular)} actualizado`,
      detalle: fuente.nombre(row),
      fecha: marca,
      nivel: "info",
      href: fuente.href(row),
    });
  }
  return notificaciones;
}

type CasoRevision = {
  clave: string;
  tabla: string;
  columna: string;
  singular: string;
  plural: string;
  detalle: string;
  icono: IconoNotificacion;
  href: string;
};

const CASOS_REVISION: CasoRevision[] = [
  {
    clave: "contratos-sin-vencimiento",
    tabla: "contratos",
    columna: "fecha_vencimiento",
    singular: "contrato sin fecha de vencimiento",
    plural: "contratos sin fecha de vencimiento",
    detalle: "Sin esa fecha no entran en las alertas de vencimiento.",
    icono: "contrato",
    href: "/contratos",
  },
  {
    clave: "procesos-sin-expediente",
    tabla: "procesos",
    columna: "expediente",
    singular: "proceso sin número de expediente",
    plural: "procesos sin número de expediente",
    detalle: "Dificulta ubicarlos y cruzarlos con el juzgado.",
    icono: "proceso",
    href: "/procesos",
  },
  {
    clave: "vehiculos-sin-soat",
    tabla: "vehiculos",
    columna: "soat_vence",
    singular: "vehículo sin SOAT registrado",
    plural: "vehículos sin SOAT registrado",
    detalle: "No se puede avisar de su vencimiento.",
    icono: "vehiculo",
    href: "/entidades/vehiculos",
  },
];

/**
 * Todo lo que no son vencimientos. Se cachea a nivel de módulo porque el
 * Header (y con él la campana) se remonta en cada navegación.
 */
async function cargarResto(supabase: SupabaseClient): Promise<Notificacion[]> {
  const desdeNovedades = haceDiasISO(DIAS_NOVEDADES);
  const hoy = hoyLima();

  const ahora = new Date().toISOString();
  const [procesosRes, proximasRes, vencidasRes, novedadesRes, archivosRes, revisionRes] = await Promise.all([
    // El parser de diligencias mira `diligencia` y `descripcion`, pero las fechas
    // viven casi siempre en `diligencia`: filtrar por ahí evita traerse el
    // texto libre de los 222 procesos en cada apertura del panel.
    supabase
      .from("procesos")
      .select("id, expediente, asunto, materia, descripcion, diligencia")
      .not("diligencia", "is", null)
      .limit(LIMITE_PROCESOS),
    // Próximas dentro de la ventana, más TODA diligencia pasada que siga
    // PENDIENTE: antes bastaba con que llegara su fecha para que desapareciera
    // de la campana, así que una audiencia perdida no dejaba rastro.
    //
    // Van en dos consultas con límite propio: en una sola, ordenada por fecha,
    // las pendientes más viejas llenaban el límite y dejaban fuera lo de hoy.
    supabase
      .from("eventos")
      .select("id, titulo, inicia_en, tipo_diligencia, estado, notificar")
      .is("eliminado_en", null)
      .gte("inicia_en", ahora)
      .lte("inicia_en", enDiasISO(DIAS_DILIGENCIAS))
      .order("inicia_en")
      .limit(LIMITE_DILIGENCIAS),
    supabase
      .from("eventos")
      .select("id, titulo, inicia_en, tipo_diligencia, estado, notificar")
      .is("eliminado_en", null)
      .eq("estado", "PENDIENTE")
      .gte("inicia_en", haceDiasISO(DIAS_VENCIDAS))
      .lt("inicia_en", ahora)
      .order("inicia_en", { ascending: false })
      .limit(LIMITE_VENCIDAS),
    Promise.all(
      FUENTES_NOVEDADES.map((fuente) =>
        supabase
          .from(fuente.tabla)
          .select(fuente.columnas)
          .or(`creado_en.gte.${desdeNovedades},actualizado_en.gte.${desdeNovedades}`)
          .order("actualizado_en", { ascending: false, nullsFirst: false })
          .limit(LIMITE_NOVEDADES_POR_TABLA)
      )
    ),
    supabase
      .from("archivos")
      .select("id, nombre_original, entidad_tipo, entidad_id, subido_en")
      .gte("subido_en", desdeNovedades)
      .order("subido_en", { ascending: false })
      .limit(LIMITE_ARCHIVOS),
    Promise.all(
      CASOS_REVISION.map((caso) =>
        supabase.from(caso.tabla).select("id", { count: "exact", head: true }).is(caso.columna, null)
      )
    ),
  ]);

  const notificaciones: Notificacion[] = [];

  // Diligencias registradas (tabla `eventos`) ------------------------------
  const eventos = [...(vencidasRes.data ?? []), ...(proximasRes.data ?? [])] as unknown as EventoRow[];
  const procesoPorEvento = await cargarProcesosDeEventos(supabase, eventos.map((e) => e.id));
  const registradas = new Set<string>();
  for (const evento of eventos) {
    if (!evento.inicia_en) continue;
    const fechaISO = claveDiaEnLima(evento.inicia_en);
    const dias = diasHasta(fechaISO, hoy);
    const proceso = procesoPorEvento.get(evento.id);
    if (proceso) registradas.add(`${proceso.id}|${fechaISO}`);
    // Se registra el día antes de saltarla: así la fecha tampoco reaparece como "detectada en el texto".
    if (evento.notificar === false) continue;
    const sinCerrar = dias < 0 && normalizarEstado(evento.estado) === "PENDIENTE";
    const contexto = [
      proceso?.expediente ? `Exp. ${proceso.expediente}` : null,
      evento.tipo_diligencia ?? "Evento en agenda",
    ].filter(Boolean).join(" · ");
    notificaciones.push({
      id: `diligencia:evento:${evento.id}:${fechaISO}`,
      categoria: "diligencia",
      icono: "evento",
      titulo: evento.titulo || "Diligencia programada",
      detalle: sinCerrar ? `${contexto} · pasó sin cerrar` : contexto,
      fecha: fechaISO,
      dias,
      nivel: sinCerrar ? "critico" : nivelDesdeUrgencia(dias),
      href: proceso ? `/procesos/${proceso.id}` : "/dashboard",
    });
  }

  // Fechas detectadas en el texto del expediente ---------------------------
  // Sólo las que no tienen ya una diligencia registrada ese día: antes la
  // misma audiencia aparecía dos veces, una por cada fuente.
  const procesos = (procesosRes.data ?? []) as unknown as ProcesoRow[];
  const diligencias: Notificacion[] = [];
  for (const proceso of procesos) {
    for (const diligencia of diligenciasEnVentana(proceso, DIAS_DILIGENCIAS, hoy)) {
      if (registradas.has(`${proceso.id}|${diligencia.fechaISO}`)) continue;
      const dias = diasHasta(diligencia.fechaISO, hoy);
      const materia = proceso.materia ? MATERIAS[proceso.materia] ?? proceso.materia : null;
      const contexto = diligencia.texto.length > 90 ? `${diligencia.texto.slice(0, 90)}…` : diligencia.texto;
      diligencias.push({
        id: `diligencia:proceso:${proceso.id}:${diligencia.fechaISO}`,
        categoria: "diligencia",
        icono: "proceso",
        titulo: proceso.expediente || proceso.asunto || "Proceso sin expediente",
        detalle: [materia, diligencia.hora ? `${diligencia.hora} h` : null, contexto]
          .filter(Boolean)
          .join(" · "),
        fecha: diligencia.fechaISO,
        dias,
        nivel: nivelDesdeUrgencia(dias),
        href: `/procesos/${proceso.id}`,
      });
    }
  }
  diligencias.sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  notificaciones.push(...diligencias.slice(0, LIMITE_DILIGENCIAS));

  // Novedades -------------------------------------------------------------
  novedadesRes.forEach((res, i) => {
    const filas = (res.data ?? []) as unknown as NovedadRow[];
    notificaciones.push(...normalizarNovedades(FUENTES_NOVEDADES[i], filas, desdeNovedades));
  });

  for (const archivo of (archivosRes.data ?? []) as unknown as ArchivoRow[]) {
    if (!archivo.subido_en) continue;
    const etiqueta = archivo.entidad_tipo ? ENTIDAD_LABEL[archivo.entidad_tipo] ?? archivo.entidad_tipo : null;
    notificaciones.push({
      id: `novedad:archivo:${archivo.id}:${archivo.subido_en}`,
      categoria: "novedad",
      icono: "archivo",
      titulo: "Archivo subido",
      detalle: [archivo.nombre_original || "Archivo", etiqueta].filter(Boolean).join(" · "),
      fecha: archivo.subido_en,
      nivel: "info",
      href: hrefEntidad(archivo.entidad_tipo, archivo.entidad_id),
    });
  }

  // Revisión --------------------------------------------------------------
  revisionRes.forEach((res, i) => {
    const caso = CASOS_REVISION[i];
    const total = res.count ?? 0;
    if (total === 0) return;
    notificaciones.push({
      // El total entra en el id: si el conteo cambia, la notificación vuelve.
      id: `revision:${caso.clave}:${total}`,
      categoria: "revision",
      icono: caso.icono,
      titulo: `${total} ${total === 1 ? caso.singular : caso.plural}`,
      detalle: caso.detalle,
      nivel: "info",
      href: caso.href,
    });
  });

  return notificaciones;
}

function nivelDesdeUrgencia(dias: number): NivelNotificacion {
  const nivel = nivelUrgencia(dias);
  if (nivel === "vencida" || nivel === "critica") return "critico";
  if (nivel === "proxima") return "proximo";
  return "normal";
}

let cacheResto: { at: number; items: Notificacion[] } | null = null;
let enVuelo: Promise<Notificacion[]> | null = null;

// La caché en memoria se pierde en cada recarga completa: sin copia en
// `sessionStorage`, abrir o recargar cualquier página volvía a lanzar las
// 12–18 consultas de la campana. Va por usuario y por pestaña.
const CLAVE_CACHE = "cavala:notificaciones-cache";
/** Hasta esta antigüedad la copia guardada se muestra mientras se revalida. */
const MAX_CACHE_PERSISTIDA_MS = 30 * 60_000;

type CachePersistida = { usuarioId: string; at: number; items: Notificacion[] };

function leerCachePersistida(usuarioId: string | undefined): { at: number; items: Notificacion[] } | null {
  if (!usuarioId || typeof window === "undefined") return null;
  try {
    const datos = JSON.parse(window.sessionStorage.getItem(CLAVE_CACHE) ?? "null") as CachePersistida | null;
    if (!datos || datos.usuarioId !== usuarioId || !Array.isArray(datos.items)) return null;
    if (Date.now() - datos.at > MAX_CACHE_PERSISTIDA_MS) return null;
    return { at: datos.at, items: datos.items };
  } catch {
    return null;
  }
}

function guardarCachePersistida(usuarioId: string | undefined, cache: { at: number; items: Notificacion[] }) {
  if (!usuarioId || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CLAVE_CACHE, JSON.stringify({ usuarioId, ...cache } satisfies CachePersistida));
  } catch {
    // Modo privado o cuota llena: sólo se pierde la copia entre recargas.
  }
}

/**
 * Lo último que se cargó (memoria o `sessionStorage`), para pintar la campana
 * al instante tras una recarga mientras se revalida en segundo plano.
 */
export function notificacionesGuardadas(alertas: Alerta[], usuarioId?: string): Notificacion[] | null {
  const cache = cacheResto ?? leerCachePersistida(usuarioId);
  return cache ? ordenar([...normalizarAlertas(alertas), ...cache.items]) : null;
}

/**
 * Lo que viene (hoy, mañana…) arriba y después lo pasado sin cerrar, de lo más
 * reciente a lo más antiguo. Por fecha a secas, meses de pendientes viejas
 * empujaban la audiencia de mañana al fondo de la lista.
 */
export function ordenDiligencia(diasA: number, diasB: number): number {
  const pasadaA = diasA < 0;
  const pasadaB = diasB < 0;
  if (pasadaA !== pasadaB) return pasadaA ? 1 : -1;
  return pasadaA ? diasB - diasA : diasA - diasB;
}

/** Orden dentro del panel: primero lo que urge, luego lo más reciente. */
function ordenar(items: Notificacion[]): Notificacion[] {
  const peso: Record<CategoriaNotificacion, number> = { urgente: 0, diligencia: 1, novedad: 2, revision: 3 };
  return items.slice().sort((a, b) => {
    if (a.categoria !== b.categoria) return peso[a.categoria] - peso[b.categoria];
    if (a.categoria === "diligencia") return ordenDiligencia(a.dias ?? 0, b.dias ?? 0);
    if (a.categoria === "urgente") return (a.dias ?? 0) - (b.dias ?? 0);
    return (b.fecha ?? "").localeCompare(a.fecha ?? "");
  });
}

/**
 * Lista completa del centro de notificaciones.
 * `alertas` evita repetir las consultas de vencimientos cuando ya vienen
 * resueltas del servidor (contexto del layout del dashboard).
 */
export async function cargarNotificaciones(
  supabase: SupabaseClient,
  opciones: { alertas?: Alerta[]; forzar?: boolean; usuarioId?: string } = {}
): Promise<Notificacion[]> {
  const urgentes = normalizarAlertas(opciones.alertas ?? (await getAlertas(supabase)));

  cacheResto ??= leerCachePersistida(opciones.usuarioId);
  const fresco = cacheResto && Date.now() - cacheResto.at < TTL_CACHE_MS;
  if (opciones.forzar) {
    cacheResto = null;
    enVuelo = null;
  }
  if (!fresco || opciones.forzar) {
    const pendiente =
      enVuelo ??
      (enVuelo = cargarResto(supabase)
        .then((items) => {
          cacheResto = { at: Date.now(), items };
          guardarCachePersistida(opciones.usuarioId, cacheResto);
          return items;
        })
        .catch(() => cacheResto?.items ?? [])
        .finally(() => {
          enVuelo = null;
        }));
    return ordenar([...urgentes, ...(await pendiente)]);
  }

  return ordenar([...urgentes, ...(cacheResto?.items ?? [])]);
}

// ─── Estado "leído" (localStorage, por usuario) ───────────────────────────

const PREFIJO_LEIDAS = "cavala:notificaciones-leidas";
/** Se olvidan los marcados de más de 30 días para que la clave no crezca sin fin. */
const RETENCION_LEIDAS_MS = 30 * 86_400_000;

export function claveLeidas(usuarioId?: string | null): string {
  return `${PREFIJO_LEIDAS}:${usuarioId ?? "anonimo"}`;
}

export function leerLeidas(usuarioId?: string | null): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const crudo = window.localStorage.getItem(claveLeidas(usuarioId));
    if (!crudo) return {};
    const datos = JSON.parse(crudo) as Record<string, number>;
    const limite = Date.now() - RETENCION_LEIDAS_MS;
    const vigentes: Record<string, number> = {};
    for (const [id, marca] of Object.entries(datos)) {
      if (typeof marca === "number" && marca > limite) vigentes[id] = marca;
    }
    return vigentes;
  } catch {
    return {};
  }
}

export function guardarLeidas(usuarioId: string | null | undefined, leidas: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(claveLeidas(usuarioId), JSON.stringify(leidas));
  } catch {
    // Modo privado o cuota llena: el panel sigue funcionando sin persistir.
  }
}

export function contarNoLeidas(items: Notificacion[], leidas: Record<string, number>): number {
  return items.reduce((total, item) => (leidas[item.id] ? total : total + 1), 0);
}

export function agruparPorCategoria(items: Notificacion[]): Record<CategoriaNotificacion, Notificacion[]> {
  const grupos: Record<CategoriaNotificacion, Notificacion[]> = {
    urgente: [],
    diligencia: [],
    novedad: [],
    revision: [],
  };
  for (const item of items) grupos[item.categoria].push(item);
  return grupos;
}
