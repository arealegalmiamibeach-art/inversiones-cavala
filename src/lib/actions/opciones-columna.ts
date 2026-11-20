"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { catalogoColumna, colorOpcionNueva, MAXIMO_OPCIONES_COLUMNA, type OpcionBase } from "@/lib/opciones-columna";

type Resultado = { ok: true } | { ok: false; error: string };

const RUTAS_POR_TABLA: Record<string, string[]> = {
  contratos: ["/contratos"],
  concesiones_mineras: ["/entidades/concesiones"],
  personal: ["/entidades/personal"],
  // Las oficinas registrales también pintan el tipo de sus predios.
  predios: ["/entidades/predios", "/entidades/oficinas"],
  propietarios: ["/entidades/propietarios"],
  vehiculos: ["/entidades/vehiculos"],
  // "layout" en revalidar() cubre también las rutas dinámicas anidadas
  // (/procesos/materia/[materia]), igual que ya hace estados-procesos.ts.
  procesos: ["/procesos"],
};

function limpiar(texto: string): string {
  return texto.trim().replace(/\s+/g, " ");
}

async function sesionEditable(tabla: string, campo: string) {
  const catalogo = catalogoColumna(tabla, campo);
  if (!catalogo) return { ok: false as const, error: "Esa columna no tiene catálogo editable" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!await puedeAdministrarEntidad(tabla)) {
    return { ok: false as const, error: "Tu rol no permite editar las opciones de esta tabla" };
  }
  return { ok: true as const, supabase, catalogo };
}

function revalidar(tabla: string) {
  for (const ruta of RUTAS_POR_TABLA[tabla] ?? []) revalidatePath(ruta, "layout");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * La primera edición siembra el catálogo con las opciones que trae el código,
 * para que desde ese momento se puedan renombrar o quitar como cualquier otra.
 * Mientras la tabla esté vacía para esa columna, la vista sigue usando la
 * lista del código, así que sembrar no cambia lo que se ve.
 */
async function sembrar(supabase: Supabase, tabla: string, campo: string, base: OpcionBase[]): Promise<string | null> {
  const { count, error } = await supabase
    .from("opciones_columna")
    .select("id", { count: "exact", head: true })
    .eq("tabla", tabla)
    .eq("campo", campo);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return "Falta aplicar la migración del catálogo de opciones";
    return error.message;
  }
  if ((count ?? 0) > 0) return null;

  const filas = base
    .slice(0, MAXIMO_OPCIONES_COLUMNA)
    .map((opcion, indice) => ({ valor: limpiar(opcion.valor), etiqueta: limpiar(opcion.etiqueta), indice }))
    .filter((opcion) => opcion.valor && opcion.valor.length <= 80 && opcion.etiqueta.length <= 80)
    .map((opcion) => ({
      tabla,
      campo,
      valor: opcion.valor,
      etiqueta: opcion.etiqueta,
      clase_color: colorOpcionNueva(opcion.valor),
      orden: opcion.indice,
    }));
  if (filas.length === 0) return null;

  const { error: errorSemilla } = await supabase.from("opciones_columna").insert(filas);
  if (errorSemilla && errorSemilla.code !== "23505") {
    // 23514: el check `opciones_columna_permitidas` aún no incluye la columna
    // (migración de una columna nueva sin aplicar).
    if (errorSemilla.code === "23514") return "Falta aplicar la migración que habilita las opciones de esta columna";
    return errorSemilla.message;
  }
  return null;
}

export async function crearOpcionColumna(
  tabla: string,
  campo: string,
  valor: string,
  base: OpcionBase[]
): Promise<Resultado> {
  const limpio = limpiar(valor);
  if (!limpio) return { ok: false, error: "Escribe el nombre de la opción" };
  if (limpio.length > 80) return { ok: false, error: "La opción puede tener hasta 80 caracteres" };

  const sesion = await sesionEditable(tabla, campo);
  if (!sesion.ok) return sesion;

  const fallo = await sembrar(sesion.supabase, tabla, campo, base);
  if (fallo) return { ok: false, error: fallo };

  const { count } = await sesion.supabase
    .from("opciones_columna")
    .select("id", { count: "exact", head: true })
    .eq("tabla", tabla)
    .eq("campo", campo);
  if ((count ?? 0) >= MAXIMO_OPCIONES_COLUMNA) {
    return { ok: false, error: `Esta columna ya tiene ${MAXIMO_OPCIONES_COLUMNA} opciones` };
  }

  const { error } = await sesion.supabase
    .from("opciones_columna")
    .insert({
      tabla,
      campo,
      valor: limpio,
      etiqueta: limpio,
      clase_color: colorOpcionNueva(limpio),
      orden: count ?? 0,
    });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Esa opción ya existe" };
    return { ok: false, error: error.message };
  }

  revalidar(tabla);
  return { ok: true };
}

/**
 * Renombrar una opción.
 *
 * - Si el texto guardado y el visible coinciden (el caso normal), se renombran
 *   los dos y el cambio se propaga a los registros que usaban el valor viejo.
 * - Si difieren, el valor guardado es el string exacto que trajo la migración
 *   de Notion y se deja intacto: sólo cambia la etiqueta que se muestra.
 */
export async function renombrarOpcionColumna(
  tabla: string,
  campo: string,
  valorActual: string,
  textoNuevo: string,
  base: OpcionBase[]
): Promise<Resultado> {
  const nuevo = limpiar(textoNuevo);
  if (!nuevo) return { ok: false, error: "La opción no puede quedar sin nombre" };
  if (nuevo.length > 80) return { ok: false, error: "La opción puede tener hasta 80 caracteres" };

  const sesion = await sesionEditable(tabla, campo);
  if (!sesion.ok) return sesion;

  const fallo = await sembrar(sesion.supabase, tabla, campo, base);
  if (fallo) return { ok: false, error: fallo };

  const { data: fila, error: errorLectura } = await sesion.supabase
    .from("opciones_columna")
    .select("id, valor, etiqueta")
    .eq("tabla", tabla)
    .eq("campo", campo)
    .eq("valor", valorActual)
    .maybeSingle();
  if (errorLectura) return { ok: false, error: errorLectura.message };
  if (!fila) return { ok: false, error: "Esa opción ya no existe" };

  const renombraElValor = (fila.valor as string) === (fila.etiqueta as string);
  const cambios = renombraElValor ? { valor: nuevo, etiqueta: nuevo } : { etiqueta: nuevo };

  const { error } = await sesion.supabase
    .from("opciones_columna")
    .update(cambios)
    .eq("id", fila.id as string);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe otra opción con ese nombre" };
    return { ok: false, error: error.message };
  }

  if (renombraElValor && nuevo !== valorActual) {
    const { error: errorRegistros } = await sesion.supabase
      .from(tabla)
      .update({ [campo]: nuevo })
      .eq(campo, valorActual);
    if (errorRegistros) {
      // Sin rollback el catálogo apuntaría a un valor que ningún registro tiene.
      await sesion.supabase
        .from("opciones_columna")
        .update({ valor: valorActual, etiqueta: fila.etiqueta as string })
        .eq("id", fila.id as string);
      return { ok: false, error: `No se pudo renombrar en los registros: ${errorRegistros.message}` };
    }
  }

  revalidar(tabla);
  return { ok: true };
}

/**
 * Une dos opciones del catálogo: pasa los registros de `valorOrigen` a
 * `valorDestino` y borra la opción vieja. Es el camino para limpiar los
 * duplicados que trajo la migración ("VIGENTE" y "Vigente" como dos valores
 * distintos de la misma columna), que con un renombrado normal choca contra el
 * índice único del catálogo.
 */
export async function unirOpcionColumna(
  tabla: string,
  campo: string,
  valorOrigen: string,
  valorDestino: string,
  base: OpcionBase[]
): Promise<Resultado> {
  if (valorOrigen === valorDestino) return { ok: true };

  const sesion = await sesionEditable(tabla, campo);
  if (!sesion.ok) return sesion;

  const fallo = await sembrar(sesion.supabase, tabla, campo, base);
  if (fallo) return { ok: false, error: fallo };

  const { data: destino } = await sesion.supabase
    .from("opciones_columna")
    .select("id")
    .eq("tabla", tabla)
    .eq("campo", campo)
    .eq("valor", valorDestino)
    .maybeSingle();
  if (!destino) return { ok: false, error: "La opción de destino ya no existe" };

  const { error: errorRegistros } = await sesion.supabase
    .from(tabla)
    .update({ [campo]: valorDestino })
    .eq(campo, valorOrigen);
  if (errorRegistros) return { ok: false, error: `No se pudo unir en los registros: ${errorRegistros.message}` };

  const { error } = await sesion.supabase
    .from("opciones_columna")
    .delete()
    .eq("tabla", tabla)
    .eq("campo", campo)
    .eq("valor", valorOrigen);
  if (error) return { ok: false, error: error.message };

  revalidar(tabla);
  return { ok: true };
}

/**
 * Quita la opción del desplegable. Los registros que ya la tenían conservan su
 * texto — la pastilla sigue mostrándolo, como con cualquier valor fuera de
 * lista — para no borrar datos desde un menú.
 */
export async function eliminarOpcionColumna(
  tabla: string,
  campo: string,
  valor: string,
  base: OpcionBase[]
): Promise<Resultado> {
  const sesion = await sesionEditable(tabla, campo);
  if (!sesion.ok) return sesion;

  const fallo = await sembrar(sesion.supabase, tabla, campo, base);
  if (fallo) return { ok: false, error: fallo };

  const { data: eliminada, error } = await sesion.supabase
    .from("opciones_columna")
    .delete()
    .eq("tabla", tabla)
    .eq("campo", campo)
    .eq("valor", valor)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!eliminada) return { ok: false, error: "Esa opción ya no existe" };

  revalidar(tabla);
  return { ok: true };
}

/** Deja las opciones en el orden dado (`valores`, de arriba abajo). */
export async function ordenarOpcionesColumna(
  tabla: string,
  campo: string,
  valores: string[],
  base: OpcionBase[]
): Promise<Resultado> {
  if (valores.length === 0 || valores.length > MAXIMO_OPCIONES_COLUMNA || new Set(valores).size !== valores.length) {
    return { ok: false, error: "Orden no válido" };
  }

  const sesion = await sesionEditable(tabla, campo);
  if (!sesion.ok) return sesion;

  const fallo = await sembrar(sesion.supabase, tabla, campo, base);
  if (fallo) return { ok: false, error: fallo };

  const resultados = await Promise.all(
    valores.map((valor, indice) =>
      sesion.supabase
        .from("opciones_columna")
        .update({ orden: indice })
        .eq("tabla", tabla)
        .eq("campo", campo)
        .eq("valor", valor)
    )
  );
  const error = resultados.find((resultado) => resultado.error)?.error;
  if (error) return { ok: false, error: error.message };

  revalidar(tabla);
  return { ok: true };
}
