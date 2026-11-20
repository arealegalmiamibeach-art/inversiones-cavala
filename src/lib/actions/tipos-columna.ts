"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { catalogoColumna, colorOpcionConvertida, MAXIMO_OPCIONES_COLUMNA } from "@/lib/opciones-columna";
import { columnaConvertible, esTipoConvertible } from "@/lib/tipos-columna";

type Resultado = { ok: true } | { ok: false; error: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Tabla inexistente, o el CHECK de la lista blanca todavía sin la columna:
 * las dos cosas las arregla la misma migración (20260918020000).
 */
function faltaMigracion(code: string | undefined) {
  return code === "42P01" || code === "PGRST205" || code === "23514";
}

const FALTA_MIGRACION = "Falta aplicar la migración de tipos de columna (supabase db push)";

/**
 * Cambia el tipo de una columna nativa convertible, como Notion: el tipo es de
 * la propiedad (todas las vistas y la ficha) y los registros no se tocan.
 */
export async function convertirTipoColumna(tabla: string, campo: string, tipo: string): Promise<Resultado> {
  const columna = columnaConvertible(tabla, campo);
  if (!columna || !catalogoColumna(tabla, campo)) return { ok: false, error: "El tipo de esta propiedad es fijo" };
  if (!esTipoConvertible(tipo)) return { ok: false, error: "Esta propiedad sólo puede ser Texto o Selección" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!await puedeAdministrarEntidad(tabla)) {
    return { ok: false, error: "Tu rol no permite cambiar el tipo de esta propiedad" };
  }

  if (tipo === "seleccion") {
    const fallo = await sembrarValoresExistentes(supabase, tabla, campo);
    if (fallo) return { ok: false, error: fallo };
  }

  const { error } = await supabase
    .from("tipos_columna")
    .upsert(
      { tabla, campo, tipo, actualizado_por: user.id, actualizado_en: new Date().toISOString() },
      { onConflict: "tabla,campo" }
    );
  if (error) {
    if (faltaMigracion(error.code)) return { ok: false, error: FALTA_MIGRACION };
    return { ok: false, error: error.message };
  }

  for (const ruta of columna.rutas) revalidatePath(ruta, "layout");
  return { ok: true };
}

/**
 * Texto → Selección: cada valor distinto que ya está escrito pasa a ser una
 * opción, igual que hace Notion, para que ningún registro quede "fuera de
 * lista" (y a un clic de perder su texto). Las opciones que ya existían se
 * respetan con su nombre y color; las nuevas van detrás, las más usadas
 * primero. El valor se guarda exacto (saltos de línea incluidos) para que
 * coincida con la fila; la etiqueta lo muestra en una sola línea.
 *
 * Un texto de más de 80 caracteres no cabe como opción: su registro lo sigue
 * mostrando en la pastilla, como cualquier valor fuera de lista.
 */
async function sembrarValoresExistentes(supabase: Supabase, tabla: string, campo: string): Promise<string | null> {
  const { data: filas, error } = await fetchAllRows((from, to) =>
    supabase.from(tabla).select(campo).not(campo, "is", null).order("id").range(from, to)
  );
  if (error) return `No se pudieron leer los valores actuales: ${error.message}`;

  const usos = new Map<string, number>();
  for (const fila of (filas ?? []) as unknown as Record<string, unknown>[]) {
    const valor = fila[campo];
    if (typeof valor !== "string" || !valor.trim()) continue;
    usos.set(valor, (usos.get(valor) ?? 0) + 1);
  }

  const { data: existentes, error: errorCatalogo } = await supabase
    .from("opciones_columna")
    .select("valor, orden")
    .eq("tabla", tabla)
    .eq("campo", campo);
  if (errorCatalogo) {
    if (faltaMigracion(errorCatalogo.code)) return FALTA_MIGRACION;
    return errorCatalogo.message;
  }

  const yaEstan = new Set((existentes ?? []).map((opcion) => opcion.valor as string));
  const nuevos = Array.from(usos.entries())
    .filter(([valor]) => !yaEstan.has(valor) && valor.trim().length <= 80)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es-PE"));
  if (nuevos.length === 0) return null;

  if (yaEstan.size + nuevos.length > MAXIMO_OPCIONES_COLUMNA) {
    return `Hay ${yaEstan.size + nuevos.length} valores distintos y una Selección admite hasta ${MAXIMO_OPCIONES_COLUMNA}. Unifica algunos antes de convertirla.`;
  }

  const ordenInicial = Math.max(-1, ...(existentes ?? []).map((opcion) => (opcion.orden as number) ?? 0)) + 1;
  const { error: errorSemilla } = await supabase
    .from("opciones_columna")
    .upsert(
      nuevos.map(([valor], indice) => ({
        tabla,
        campo,
        valor,
        etiqueta: valor.trim().replace(/\s+/g, " "),
        clase_color: colorOpcionConvertida(valor),
        orden: ordenInicial + indice,
      })),
      { onConflict: "tabla,campo,valor", ignoreDuplicates: true }
    );
  if (errorSemilla) {
    if (faltaMigracion(errorSemilla.code)) return FALTA_MIGRACION;
    return `No se pudieron crear las opciones: ${errorSemilla.message}`;
  }
  return null;
}
