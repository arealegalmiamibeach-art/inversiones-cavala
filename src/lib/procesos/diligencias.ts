import { diasHastaFechaISO, hoyISOEnLima } from "@/lib/utils";
import { DIAS_CRITICO, DIAS_PROXIMO } from "@/lib/urgencia";

/**
 * Diligencias y audiencias de los procesos judiciales.
 *
 * La tabla `eventos` (que sería la fuente natural de audiencias) tiene 0 filas:
 * el cliente nunca entregó esa base. Mientras tanto, las fechas de diligencia
 * viven como texto libre dentro de `procesos.diligencia` y `procesos.descripcion`,
 * escritas a mano en el Notion de origen. Este módulo las extrae de forma
 * tolerante para poder mostrar semáforos, calendario y reportes; si un proceso
 * no tiene ninguna fecha reconocible simplemente no aporta diligencias.
 */

const MESES: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  setiembre: 9, septiembre: 9, set: 9, sep: 9, sept: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

const ANIO_MIN = 2000;
const ANIO_MAX = 2100;

export type DiligenciaDetectada = {
  /** Fecha en formato "YYYY-MM-DD" (hora local de Perú, sin desplazamiento UTC). */
  fechaISO: string;
  /** Hora "HH:MM" si el texto la menciona junto a la fecha. */
  hora?: string;
  /** Fragmento de texto donde apareció la fecha, para dar contexto en la UI. */
  texto: string;
};

export type NivelUrgencia = "vencida" | "critica" | "proxima" | "normal";

// Mismos umbrales que la campana y el correo diario — ver `lib/urgencia.ts`.
export { DIAS_CRITICO, DIAS_PROXIMO };

function normalizar(valor: string) {
  // NFD + quitar diacríticos conserva la longitud del texto original, así que
  // los índices de las coincidencias siguen sirviendo para recortar contexto.
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-PE");
}

function fechaValida(anio: number, mes: number, dia: number) {
  if (anio < ANIO_MIN || anio > ANIO_MAX) return false;
  if (mes < 1 || mes > 12) return false;
  if (dia < 1 || dia > 31) return false;
  const fecha = new Date(anio, mes - 1, dia);
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
}

function aISO(anio: number, mes: number, dia: number) {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Recorta el entorno de la coincidencia para mostrarlo como contexto. */
function contexto(texto: string, indice: number, largo: number) {
  const inicio = Math.max(0, indice - 60);
  const fin = Math.min(texto.length, indice + largo + 60);
  const linea = texto.slice(inicio, fin).split("\n").find((parte) => parte.includes(texto.slice(indice, indice + largo)));
  return (linea ?? texto.slice(inicio, fin)).replace(/\s+/g, " ").trim();
}

/** Hora "10:30", "10.30 a.m.", "10 h" pegada a la fecha (mira 40 caracteres a la derecha). */
function horaCercana(texto: string, desde: number) {
  const ventana = texto.slice(desde, desde + 40);
  const match = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(ventana);
  if (!match) return undefined;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

/**
 * Extrae todas las fechas reconocibles de un texto libre en español peruano.
 * Formatos soportados: 12/03/2026 · 12-03-2026 · 12.03.2026 · 2026-03-12 ·
 * "12 de marzo de 2026" · "12 de marzo del 2026" · "12 MARZO 2026" ·
 * "marzo 12, 2026" · "12 de marzo" (asume el año en curso).
 */
export function extraerDiligencias(texto: string | null | undefined): DiligenciaDetectada[] {
  if (!texto || !texto.trim()) return [];
  const plano = texto.replace(/\r\n/g, "\n");
  const base = normalizar(plano);
  const encontradas = new Map<string, DiligenciaDetectada>();

  function registrar(anio: number, mes: number, dia: number, indice: number, largo: number) {
    if (!fechaValida(anio, mes, dia)) return;
    const fechaISO = aISO(anio, mes, dia);
    if (encontradas.has(fechaISO)) return;
    encontradas.set(fechaISO, {
      fechaISO,
      hora: horaCercana(plano, indice + largo),
      texto: contexto(plano, indice, largo),
    });
  }

  // 2026-03-12
  for (const match of base.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    registrar(Number(match[1]), Number(match[2]), Number(match[3]), match.index ?? 0, match[0].length);
  }

  // 12/03/2026 · 12-03-2026 · 12.03.2026 (día primero, como se usa en Perú)
  for (const match of base.matchAll(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g)) {
    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const anioCrudo = Number(match[3]);
    const anio = anioCrudo < 100 ? 2000 + anioCrudo : anioCrudo;
    registrar(anio, mes, dia, match.index ?? 0, match[0].length);
  }

  const nombresMes = Object.keys(MESES).join("|");

  // "12 de marzo de 2026" · "12 de marzo del 2026" · "12 marzo 2026" · "12 de marzo"
  const rxDiaMes = new RegExp(String.raw`\b(\d{1,2})\s*(?:de\s+)?(${nombresMes})\b(?:\s*(?:de|del)?\s*(\d{4}))?`, "g");
  for (const match of base.matchAll(rxDiaMes)) {
    const dia = Number(match[1]);
    const mes = MESES[match[2]];
    const anio = match[3] ? Number(match[3]) : new Date().getFullYear();
    registrar(anio, mes, dia, match.index ?? 0, match[0].length);
  }

  // "marzo 12, 2026" · "marzo 12 de 2026"
  const rxMesDia = new RegExp(String.raw`\b(${nombresMes})\s+(\d{1,2})\s*(?:,|de|del)?\s*(\d{4})\b`, "g");
  for (const match of base.matchAll(rxMesDia)) {
    registrar(Number(match[3]), MESES[match[1]], Number(match[2]), match.index ?? 0, match[0].length);
  }

  return Array.from(encontradas.values()).sort((a, b) => a.fechaISO.localeCompare(b.fechaISO));
}

/** Fechas detectadas en formato ISO "YYYY-MM-DD", ordenadas. */
export function extraerFechas(texto: string | null | undefined): string[] {
  return extraerDiligencias(texto).map((diligencia) => diligencia.fechaISO);
}

/** Igual que `extraerFechas`, pero como `Date` local (sin desplazamiento UTC). */
export function extraerFechasComoDate(texto: string | null | undefined): Date[] {
  return extraerFechas(texto).map((iso) => fechaLocal(iso));
}

/** Construye la fecha en hora local: `new Date("2026-03-12")` la interpretaría como UTC. */
export function fechaLocal(fechaISO: string): Date {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  return new Date(anio, (mes ?? 1) - 1, dia ?? 1);
}

export function hoyISO(): string {
  return hoyISOEnLima();
}

/** Días que faltan para la fecha (negativo si ya pasó). */
export function diasHasta(fechaISO: string, desde = hoyISO()): number {
  return diasHastaFechaISO(fechaISO, desde) ?? 0;
}

export function nivelUrgencia(dias: number): NivelUrgencia {
  if (dias < 0) return "vencida";
  if (dias <= DIAS_CRITICO) return "critica";
  if (dias <= DIAS_PROXIMO) return "proxima";
  return "normal";
}

type ProcesoConDiligencias = { diligencia?: string | null; descripcion?: string | null };

/** Todas las diligencias de un proceso: mira `diligencia` y también `descripcion`. */
export function diligenciasDeProceso(proceso: ProcesoConDiligencias): DiligenciaDetectada[] {
  const encontradas = new Map<string, DiligenciaDetectada>();
  for (const texto of [proceso.diligencia, proceso.descripcion]) {
    for (const diligencia of extraerDiligencias(texto)) {
      if (!encontradas.has(diligencia.fechaISO)) encontradas.set(diligencia.fechaISO, diligencia);
    }
  }
  return Array.from(encontradas.values()).sort((a, b) => a.fechaISO.localeCompare(b.fechaISO));
}

/** Próxima diligencia futura (o la más reciente vencida si no hay futuras). */
export function proximaDiligencia(
  proceso: ProcesoConDiligencias,
  desde = hoyISO()
): (DiligenciaDetectada & { dias: number; nivel: NivelUrgencia }) | null {
  const diligencias = diligenciasDeProceso(proceso);
  if (!diligencias.length) return null;
  const futuras = diligencias.filter((diligencia) => diligencia.fechaISO >= desde);
  const elegida = futuras[0] ?? diligencias[diligencias.length - 1];
  const dias = diasHasta(elegida.fechaISO, desde);
  return { ...elegida, dias, nivel: nivelUrgencia(dias) };
}

/** Cuántas diligencias caen dentro de una ventana de días desde hoy. */
export function diligenciasEnVentana(
  proceso: ProcesoConDiligencias,
  dias: number,
  desde = hoyISO()
): DiligenciaDetectada[] {
  return diligenciasDeProceso(proceso).filter((diligencia) => {
    const restantes = diasHasta(diligencia.fechaISO, desde);
    return restantes >= 0 && restantes <= dias;
  });
}
