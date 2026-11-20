"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esTipoEntidadPersonalizable } from "@/lib/propiedades/personalizadas";
import { personalizadaQueOcupaNativa } from "@/lib/propiedades/nombres-reservados";

type Resultado = { ok: true } | { ok: false; error: string };

const FALTA_MIGRACION = "Falta aplicar la migración de propiedades eliminadas (supabase db push)";

function faltaMigracion(code: string | undefined) {
  return code === "42P01" || code === "PGRST205" || code === "23514";
}

async function validar(entidadTipo: string, campo: string) {
  if (!esTipoEntidadPersonalizable(entidadTipo)) return { ok: false as const, error: "Tipo de entidad no válido" };
  if (!campo || campo.length > 80) return { ok: false as const, error: "Propiedad no válida" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!await puedeAdministrarEntidad(entidadTipo)) {
    return { ok: false as const, error: "No puedes administrar propiedades de esta área" };
  }
  return { ok: true as const, supabase, user };
}

/**
 * Quita una propiedad nativa de la ficha y de las tablas de todos los
 * usuarios. El dato sigue en la fila: `restaurarPropiedadNativa` la devuelve.
 */
export async function eliminarPropiedadNativa(entidadTipo: string, campo: string): Promise<Resultado> {
  const sesion = await validar(entidadTipo, campo);
  if (!sesion.ok) return sesion;

  const { error } = await sesion.supabase
    .from("propiedades_nativas_eliminadas")
    .upsert(
      { entidad_tipo: entidadTipo, campo, eliminado_por: sesion.user.id, eliminado_en: new Date().toISOString() },
      { onConflict: "entidad_tipo,campo" }
    );
  if (error) return { ok: false, error: faltaMigracion(error.code) ? FALTA_MIGRACION : error.message };

  // Lo leen el layout del dashboard y con él todas las fichas y tablas.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function restaurarPropiedadNativa(entidadTipo: string, campo: string): Promise<Resultado> {
  const sesion = await validar(entidadTipo, campo);
  if (!sesion.ok) return sesion;

  // Una personalizada que tomó su nombre la reemplaza: restaurarla dejaría dos columnas iguales.
  const ocupada = await personalizadaQueOcupaNativa(sesion.supabase, entidadTipo, campo);
  if (ocupada) {
    return { ok: false, error: `Ya existe la propiedad «${ocupada}». Renómbrala o elimínala antes de restaurar esta.` };
  }

  const { error } = await sesion.supabase
    .from("propiedades_nativas_eliminadas")
    .delete()
    .eq("entidad_tipo", entidadTipo)
    .eq("campo", campo);
  if (error) return { ok: false, error: faltaMigracion(error.code) ? FALTA_MIGRACION : error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
