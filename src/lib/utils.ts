import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convierte un parámetro de URL en un número de página válido y acotado. */
export function paginaDesdeParametro(valor: unknown): number {
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) return 1;
  const pagina = Number(valor);
  return Number.isSafeInteger(pagina) && pagina > 0 ? pagina : 1;
}

/**
 * Aísla texto libre dentro de la sintaxis de filtros `or` de PostgREST.
 * Las comillas y barras deben escaparse incluso aunque el cliente codifique la URL.
 */
export function patronIlikePostgrest(valor: string, maximo = 120): string {
  const acotado = valor.trim().slice(0, maximo);
  const escapado = acotado.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"%${escapado}%"`;
}

export const ZONA_HORARIA_APP = "America/Lima";

/** Día civil actual de la aplicación, independiente de la zona del servidor. */
export function hoyISOEnLima(fecha = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_APP,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/** Parsea una fecha civil sin tratar `YYYY-MM-DD` como medianoche UTC. */
export function fechaCivilDesdeISO(fechaISO: string): Date {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  return new Date(anio, (mes || 1) - 1, dia || 1, 12);
}

/** Días civiles hasta una fecha en la zona horaria de la aplicación. */
export function diasHastaFechaISO(fechaISO: string, desde = hoyISOEnLima()): number | null {
  if (!esFechaISOValida(fechaISO) || !esFechaISOValida(desde)) return null;
  const aUTC = (valor: string) => {
    const [anio, mes, dia] = valor.split("-").map(Number);
    return Date.UTC(anio, mes - 1, dia);
  };
  return Math.round((aUTC(fechaISO) - aUTC(desde)) / 86_400_000);
}

/** Suma días a una fecha civil sin depender del huso horario del proceso. */
export function sumarDiasISO(fechaISO: string, dias: number): string {
  if (!esFechaISOValida(fechaISO) || !Number.isInteger(dias)) return fechaISO;
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const resultado = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return resultado.toISOString().slice(0, 10);
}

/** Valida una fecha civil ISO sin aceptar normalizaciones como 2026-02-31. */
export function esFechaISOValida(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return false;

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1) return false;

  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const diasPorMes = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= diasPorMes[mes - 1];
}

/** Valida una hora de 24 horas en formato HH:MM. */
export function esHoraISOValida(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const partes = /^(\d{2}):(\d{2})$/.exec(valor);
  return Boolean(partes && Number(partes[1]) <= 23 && Number(partes[2]) <= 59);
}

export function formatDate(date: string | Date) {
  const valor = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? fechaCivilDesdeISO(date)
    : new Date(date);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_HORARIA_APP,
  }).format(valor);
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_HORARIA_APP,
  }).format(new Date(date));
}
