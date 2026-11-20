/**
 * Catálogo editable de opciones para columnas NATIVAS de texto libre
 * (tabla `opciones_columna`).
 *
 * Generaliza lo que `estados_procesos` hace con `procesos.estado`: el valor
 * guardado en la fila sigue siendo texto libre y sólo la lista de opciones que
 * ofrece el desplegable pasa a vivir en la base, editable desde el panel
 * "Editar propiedad" de la columna.
 *
 * Sólo entran aquí las columnas de texto: las que la base NO valida o cuyo
 * check se soltó a propósito. Los Sí/No (`personal.activo`, `predios.registrado`,
 * los archivadores) son booleanos de dos estados, no admiten una tercera
 * opción y se declaran como Casilla fija en cada tabla.
 *
 * Los enums con check en la base entran con su check soltado y sembrados con
 * valor ≠ etiqueta, como `procesos.materia`: renombrarlos sólo cambia lo que se
 * muestra y el valor guardado (el que lee la lógica) no se toca; una opción
 * nueva se guarda tal cual (valor = etiqueta).
 * - `concesiones_mineras.sustancia` (`metal|no_metal`): migración 20260921000000.
 * - `personal.modalidad` (`planilla|locador`), `predios.tipo_predio`
 *   (`urbano|rural`) y `propietarios.tipo_persona` (`natural|juridica`):
 *   migración 20260921020000. Lo que ya lee estos valores (conteos urbano/rural
 *   de las oficinas, ícono de persona jurídica) sigue funcionando con los
 *   originales; un valor nuevo no se cuenta ahí y se muestra con su nombre.
 * `contratos.legalizado` vuelve a ser un catálogo editable después de separar
 * las fechas que pertenecían a "Firma legalizada". Arranca con SI/NO/Notaria,
 * pero sus opciones se gestionan desde la tabla como cualquier Selección.
 *
 * `procesos.materia` y `contratos.tipo` son casos especiales: SÍ entran,
 * pero con `valor` (la clave, p. ej. "penal"/"mutuo") sembrado distinto de
 * `etiqueta` ("Penal"/"Mutuo") desde el arranque — ver `MATERIA_OPCIONES` en
 * `procesos/opciones.ts` y `TIPO_OPCIONES` en `contratos/opciones.ts`. Como
 * `renombrarOpcionColumna` sólo toca `valor` cuando coincide con `etiqueta`,
 * renombrar una materia o un tipo de contrato desde la UI siempre cambia
 * sólo la etiqueta que se muestra: la clave que usan las rutas
 * (`/procesos/materia/[materia]`, `/contratos/tipo/[tipo]`), el ícono/color y
 * el alcance de Tesorería (`TIPOS_CONTRATO_TESORERIA` en `roles.ts`, que
 * compara por el valor exacto) nunca se tocan. Agregar una familia nueva de
 * contrato sí funciona (la página del índice le hace tarjeta con ícono
 * genérico); a Tesorería no le aparece hasta que alguien la agregue a
 * `TIPOS_CONTRATO_TESORERIA` a propósito — es el default seguro, no un hueco.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpcionPill } from "@/components/ui/property-pill";

export type OpcionColumna = {
  id: string;
  campo: string;
  /** Texto exacto guardado en la fila. Renombrarlo propaga a los registros. */
  valor: string;
  /** Texto que se muestra en la pastilla. Puede diferir del valor guardado. */
  etiqueta: string;
  claseColor: string;
  orden: number;
};

/** Columnas con catálogo editable, por `tabla.campo`. */
export const CATALOGOS_COLUMNA: Record<string, { tabla: string; campo: string; etiqueta: string }> = {
  "contratos.estado": { tabla: "contratos", campo: "estado", etiqueta: "Estado de contratos" },
  "concesiones_mineras.estado": { tabla: "concesiones_mineras", campo: "estado", etiqueta: "Estado de concesiones" },
  "concesiones_mineras.sustancia": { tabla: "concesiones_mineras", campo: "sustancia", etiqueta: "Sustancia de concesiones" },
  "personal.firmado": { tabla: "personal", campo: "firmado", etiqueta: "Firma de personal" },
  "personal.modalidad": { tabla: "personal", campo: "modalidad", etiqueta: "Modalidad de personal" },
  "predios.a_nombre_de": { tabla: "predios", campo: "a_nombre_de", etiqueta: "A nombre de (predios)" },
  "predios.tipo_predio": { tabla: "predios", campo: "tipo_predio", etiqueta: "Tipo de predio" },
  "propietarios.tipo_persona": { tabla: "propietarios", campo: "tipo_persona", etiqueta: "Tipo de persona (propietarios)" },
  "vehiculos.categoria": { tabla: "vehiculos", campo: "categoria", etiqueta: "Categoría de vehículos" },
  "vehiculos.responsable": { tabla: "vehiculos", campo: "responsable", etiqueta: "Responsable de vehículos" },
  "procesos.materia": { tabla: "procesos", campo: "materia", etiqueta: "Materia de procesos" },
  "contratos.tipo": { tabla: "contratos", campo: "tipo", etiqueta: "Tipo de contrato" },
  "contratos.moneda": { tabla: "contratos", campo: "moneda", etiqueta: "Moneda de contratos" },
  "contratos.legalizado": { tabla: "contratos", campo: "legalizado", etiqueta: "Legalizado de contratos" },
};

/**
 * Tope de opciones por columna. Alto a propósito: una columna convertida desde
 * texto sigue sumando una opción por cada valor nuevo, y el desplegable tiene
 * buscador.
 */
export const MAXIMO_OPCIONES_COLUMNA = 300;

/** Par valor/etiqueta que el cliente manda al sembrar el catálogo. */
export type OpcionBase = { valor: string; etiqueta: string };

export function claveCatalogo(tabla: string, campo: string): string {
  return `${tabla}.${campo}`;
}

export function catalogoColumna(tabla: string, campo: string) {
  return CATALOGOS_COLUMNA[claveCatalogo(tabla, campo)];
}

/** Paleta para opciones nuevas agregadas desde la UI, elegida por hash del texto. */
const PALETA_OPCION_NUEVA = [
  "bg-blue-500/15 text-blue-300",
  "bg-indigo-500/15 text-indigo-300",
  "bg-sky-500/15 text-sky-300",
  "bg-teal-500/15 text-teal-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-violet-500/15 text-violet-300",
  "bg-purple-500/15 text-purple-300",
  "bg-orange-500/15 text-orange-300",
  "bg-rose-500/15 text-rose-300",
] as const;

export function colorOpcionNueva(valor: string): string {
  let hash = 0;
  for (let i = 0; i < valor.length; i += 1) hash = (hash * 31 + valor.charCodeAt(i)) >>> 0;
  return PALETA_OPCION_NUEVA[hash % PALETA_OPCION_NUEVA.length];
}

/**
 * Color de una opción sembrada al convertir una columna de Texto a Selección:
 * los Sí/No que ya se escribían a mano conservan el verde/gris con que la
 * vista de texto los pintaba; el resto toma el de la paleta.
 */
export function colorOpcionConvertida(valor: string): string {
  const normalizado = valor.trim().toLocaleLowerCase("es-PE");
  if (normalizado === "si" || normalizado === "sí") return "bg-emerald-500/15 text-emerald-300";
  if (normalizado === "no") return "bg-white/[0.08] text-white/65";
  return colorOpcionNueva(valor);
}

/**
 * Catálogo completo de una tabla, agrupado por campo. Si falta aplicar la
 * migración devuelve un objeto vacío: la vista sigue usando las opciones del
 * código en vez de quedarse sin desplegable.
 */
export async function cargarOpcionesColumna(
  supabase: SupabaseClient,
  tabla: string
): Promise<Record<string, OpcionColumna[]>> {
  const { data, error } = await supabase
    .from("opciones_columna")
    .select("id, campo, valor, etiqueta, clase_color, orden")
    .eq("tabla", tabla)
    .order("orden")
    .order("creado_en");
  if (error) return {};

  const porCampo: Record<string, OpcionColumna[]> = {};
  for (const fila of data ?? []) {
    const opcion: OpcionColumna = {
      id: fila.id as string,
      campo: fila.campo as string,
      valor: fila.valor as string,
      etiqueta: fila.etiqueta as string,
      claseColor: fila.clase_color as string,
      orden: (fila.orden as number) ?? 0,
    };
    (porCampo[opcion.campo] ??= []).push(opcion);
  }
  return porCampo;
}

/**
 * Opciones efectivas de la columna: el catálogo manda en cuanto tiene filas y,
 * mientras esté vacío, se usan las del código. Un valor que ya existía en el
 * código conserva su color; los nuevos toman el de la paleta.
 */
export function combinarOpcionesColumna(base: OpcionPill[], catalogo: OpcionColumna[] | undefined): OpcionPill[] {
  if (!catalogo || catalogo.length === 0) return base;
  return catalogo.map((opcion) => ({
    value: opcion.valor,
    label: opcion.etiqueta,
    className: base.find((item) => item.value === opcion.valor)?.className ?? opcion.claseColor,
  }));
}
