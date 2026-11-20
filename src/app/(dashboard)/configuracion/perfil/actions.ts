"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/auth/perfil";

type Resultado = { ok: boolean; error?: string };

export async function actualizarNombrePropio(nombre: string): Promise<Resultado> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, error: "No hay sesión activa" };

  const nombreLimpio = typeof nombre === "string" ? nombre.trim().replace(/\s+/g, " ") : "";
  if (nombreLimpio.length > 120) return { ok: false, error: "El nombre no puede pasar de 120 caracteres" };

  // RLS sólo deja a un administrador escribir en `perfiles` (así nadie se cambia
  // el rol). Con un UPDATE directo, el resto de roles afectaba 0 filas sin error
  // y la pantalla decía "Nombre actualizado". El RPC toca únicamente `nombre`
  // de la fila propia.
  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_nombre_propio", { p_nombre: nombreLimpio });

  if (error) {
    return {
      ok: false,
      error: error.code === "PGRST202"
        ? "Falta aplicar la migración del nombre de perfil (supabase db push)"
        : error.message,
    };
  }
  revalidatePath("/configuracion/perfil");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cambiarContrasenaPropia(nueva: string): Promise<Resultado> {
  if (typeof nueva !== "string" || nueva.length < 8 || nueva.length > 128) {
    return { ok: false, error: "La contraseña debe tener entre 8 y 128 caracteres" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: nueva });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
