import { esFechaISOValida, sumarDiasISO } from "@/lib/utils";

/**
 * Feriados peruanos y cómputo de plazos en días hábiles.
 *
 * Hasta ahora todo el sistema contaba en días calendario: el semáforo, la
 * campana y el correo decían "faltan 5 días" para un plazo que en realidad
 * vencía en 3 días hábiles, y la fecha de vencimiento había que sacarla a
 * mano fuera del sistema. Un plazo procesal se cuenta en hábiles.
 *
 * Los feriados fijos y la Semana Santa se calculan aquí, así que el cómputo
 * funciona aunque la tabla `feriados` esté vacía. Esa tabla es para los
 * extraordinarios que el gobierno declara cada año (puentes, duelos
 * nacionales) y para los regionales.
 */

/** Feriados nacionales de fecha fija, en formato "MM-DD". */
const FIJOS: Array<[string, string]> = [
  ["01-01", "Año Nuevo"],
  ["05-01", "Día del Trabajo"],
  ["06-07", "Batalla de Arica y Día de la Bandera"],
  ["06-29", "San Pedro y San Pablo"],
  ["07-23", "Día de la Fuerza Aérea del Perú"],
  ["07-28", "Fiestas Patrias"],
  ["07-29", "Fiestas Patrias"],
  ["08-06", "Batalla de Junín"],
  ["08-30", "Santa Rosa de Lima"],
  ["10-08", "Combate de Angamos"],
  ["11-01", "Todos los Santos"],
  ["12-08", "Inmaculada Concepción"],
  ["12-09", "Batalla de Ayacucho"],
  ["12-25", "Navidad"],
];

/**
 * Domingo de Pascua gregoriano (algoritmo de Meeus/Jones/Butcher).
 * De aquí salen Jueves y Viernes Santo, que son los únicos feriados
 * nacionales móviles del Perú.
 */
function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Feriados nacionales de un año: fecha ISO → nombre. */
export function feriadosPeru(anio: number): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const [diaMes, nombre] of FIJOS) mapa.set(`${anio}-${diaMes}`, nombre);
  const pascua = domingoDePascua(anio);
  mapa.set(sumarDiasISO(pascua, -3), "Jueves Santo");
  mapa.set(sumarDiasISO(pascua, -2), "Viernes Santo");
  return mapa;
}

/** Feriados nacionales de un rango de años, para sembrar un `Set` de cómputo. */
export function feriadosEntreAnios(desdeAnio: number, hastaAnio: number): Map<string, string> {
  const mapa = new Map<string, string>();
  for (let anio = desdeAnio; anio <= hastaAnio; anio++) {
    for (const [fecha, nombre] of feriadosPeru(anio)) mapa.set(fecha, nombre);
  }
  return mapa;
}

/** Sábado o domingo, leyendo la fecha como día civil (no como medianoche UTC). */
export function esFinDeSemana(fechaISO: string): boolean {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return diaSemana === 0 || diaSemana === 6;
}

/**
 * `extra` son los feriados de la tabla `feriados` (los que la app no puede
 * calcular). Se suman a los nacionales del año de la fecha.
 */
export function esDiaHabil(fechaISO: string, extra?: ReadonlySet<string>): boolean {
  if (!esFechaISOValida(fechaISO)) return false;
  if (esFinDeSemana(fechaISO)) return false;
  if (extra?.has(fechaISO)) return false;
  return !feriadosPeru(Number(fechaISO.slice(0, 4))).has(fechaISO);
}

/** Nombre del feriado si la fecha lo es, o null. */
export function nombreFeriado(fechaISO: string, extra?: ReadonlyMap<string, string>): string | null {
  if (!esFechaISOValida(fechaISO)) return null;
  return extra?.get(fechaISO) ?? feriadosPeru(Number(fechaISO.slice(0, 4))).get(fechaISO) ?? null;
}

/** Tope de iteración: un plazo de 90 hábiles no puede cruzar más de un año. */
const MAX_SALTOS = 900;

/**
 * Vencimiento de un plazo en días hábiles contado como en sede judicial: el
 * día de la notificación no cuenta, el cómputo arranca al hábil siguiente.
 * `sumarDiasHabiles("2026-07-24", 3)` → el tercer hábil después del 24.
 *
 * Con `dias = 0` devuelve el primer día hábil que no sea anterior a la fecha
 * dada, que es lo que se necesita cuando una fecha cae en feriado.
 */
export function sumarDiasHabiles(fechaISO: string, dias: number, extra?: ReadonlySet<string>): string {
  if (!esFechaISOValida(fechaISO) || !Number.isInteger(dias) || dias < 0) return fechaISO;

  if (dias === 0) {
    let cursor = fechaISO;
    for (let i = 0; i < MAX_SALTOS && !esDiaHabil(cursor, extra); i++) cursor = sumarDiasISO(cursor, 1);
    return cursor;
  }

  let cursor = fechaISO;
  let restantes = dias;
  for (let i = 0; i < MAX_SALTOS && restantes > 0; i++) {
    cursor = sumarDiasISO(cursor, 1);
    if (esDiaHabil(cursor, extra)) restantes--;
  }
  return cursor;
}

/**
 * Días hábiles que faltan hasta `fechaISO` sin contar el día de hoy, que es
 * la cuenta que importa en un plazo: 0 = vence hoy, 1 = vence mañana hábil.
 * Negativo si la fecha ya pasó.
 */
export function diasHabilesHasta(
  fechaISO: string,
  desdeISO: string,
  extra?: ReadonlySet<string>
): number | null {
  if (!esFechaISOValida(fechaISO) || !esFechaISOValida(desdeISO)) return null;
  if (fechaISO === desdeISO) return 0;

  const adelante = fechaISO > desdeISO;
  const [inicio, fin] = adelante ? [desdeISO, fechaISO] : [fechaISO, desdeISO];

  let cuenta = 0;
  let cursor = inicio;
  for (let i = 0; i < MAX_SALTOS && cursor < fin; i++) {
    cursor = sumarDiasISO(cursor, 1);
    if (esDiaHabil(cursor, extra)) cuenta++;
  }
  return adelante ? cuenta : -cuenta;
}
