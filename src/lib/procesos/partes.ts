/**
 * Partes del proceso (demandante, imputado, solicitante…). Vinieron de las
 * columnas de Notion de cada materia y viven en `procesos.extra` con la misma
 * clave que tenían allí; no hay columnas propias en la tabla.
 *
 * Qué partes aplican depende de la materia: un civil tiene demandante y
 * demandado, una carpeta fiscal imputado y agraviado. La tabla, el panel
 * lateral y la ficha usan este mismo catálogo para mostrar las mismas.
 *
 * Sin `server-only`: lo usan la tabla/panel (cliente), la ficha y la acción
 * que guarda.
 */

export type ParteProceso = { clave: string; label: string };

export const PARTES_PROCESO: ParteProceso[] = [
  { clave: "Demandante", label: "Demandante" },
  { clave: "Demandado", label: "Demandado" },
  { clave: "Imputado", label: "Imputado" },
  { clave: "Agraviado", label: "Agraviado" },
  { clave: "Solicitante", label: "Solicitante" },
  { clave: "Destinatario", label: "Destinatario" },
  { clave: "Centro de conciliación", label: "Centro de conciliación" },
  { clave: "Fecha", label: "Fecha de conciliación" },
  { clave: "column 17", label: "Observación" },
];

const PARTE_POR_CLAVE = new Map(PARTES_PROCESO.map((parte) => [parte.clave, parte]));

/** Claves de `extra` que la acción `actualizarCampo` acepta para `procesos`. */
export const CLAVES_PARTES_PROCESO = new Set(PARTES_PROCESO.map((parte) => parte.clave));

const DEMANDA = ["Demandante", "Demandado"];
const PENAL = ["Imputado", "Agraviado"];

const PARTES_POR_MATERIA: Record<string, string[]> = {
  civil: DEMANDA,
  laboral: DEMANDA,
  constitucional: DEMANDA,
  contencioso_administrativo: DEMANDA,
  penal: PENAL,
  carpeta_fiscal: PENAL,
  conciliacion: ["Solicitante", "Destinatario", "Centro de conciliación", "Fecha"],
  direccion_trabajo: ["Solicitante", "Destinatario"],
  administrativo: [],
  sunafil: [],
};

/**
 * Partes que corresponden a una materia. Una materia nueva del catálogo
 * editable (el cliente las crea solo) cae en demandante/demandado, lo más
 * común; `null` ("Todos los procesos") devuelve el catálogo completo.
 */
export function partesDeMateria(materia: string | null): ParteProceso[] {
  if (materia === null) return PARTES_PROCESO;
  return clavesDeMateria(materia).map((clave) => PARTE_POR_CLAVE.get(clave)!);
}

function clavesDeMateria(materia: string | null | undefined): string[] {
  return (materia && PARTES_POR_MATERIA[materia]) || DEMANDA;
}

export function valorParte(extra: unknown, clave: string): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const valor = (extra as Record<string, unknown>)[clave];
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto || null;
}

/**
 * Filas de partes para la ficha y el panel de un proceso: las de su materia
 * siempre (aunque estén vacías, para poder llenarlas) y, además, cualquier
 * otra parte que ya tenga dato — así nada de lo migrado queda escondido.
 */
export function partesDeProceso(materia: string | null | undefined, extra: unknown): (ParteProceso & { valor: string | null })[] {
  const propias = new Set(clavesDeMateria(materia));
  return PARTES_PROCESO
    .filter((parte) => propias.has(parte.clave) || valorParte(extra, parte.clave) !== null)
    .map((parte) => ({ ...parte, valor: valorParte(extra, parte.clave) }));
}
