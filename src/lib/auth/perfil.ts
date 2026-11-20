import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { HEADER_SESION, decodificarSesion } from "@/lib/auth/sesion-header";
import { nivelAcceso, puedeEscribir, seccionEntidad, type Acceso, type Permisos, type Rol } from "@/lib/auth/roles";

export type Perfil = {
  id: string;
  correo: string | null;
  nombre: string | null;
  rol: Rol | null;
  activo: boolean;
  permisos: Permisos;
};

export type UsuarioSesion = { id: string; email: string | null };

/** Lo que el middleware ya validó en esta misma petición (ver `sesion-header.ts`). */
const getSesionMiddleware = cache(async () => decodificarSesion((await headers()).get(HEADER_SESION)));

/**
 * Sesión validada una sola vez por render de servidor. Si el middleware ya la
 * validó, se reutiliza sin otro viaje a Supabase Auth.
 */
export const getUsuario = cache(async (): Promise<UsuarioSesion | null> => {
  const sesion = await getSesionMiddleware();
  if (sesion) return sesion.usuario;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
});

/**
 * Perfil del usuario en curso. `cache` de React lo memoiza por request, así
 * que el layout y cada página pueden pedirlo sin multiplicar consultas.
 *
 * Devuelve null si no hay sesión. Un perfil con `rol: null` o `activo: false`
 * es una cuenta pendiente de habilitar: `mi_rol()` devuelve NULL en la base y
 * todas las políticas niegan, así que la UI debe tratarlo como sin acceso.
 */
export const getPerfil = cache(async (): Promise<Perfil | null> => {
  const sesion = await getSesionMiddleware();
  if (sesion) return sesion.perfil as Perfil | null;
  const user = await getUsuario();
  if (!user) return null;

  const supabase = await createClient();
  const [{ data }, { data: permisos, error }] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, correo, nombre, rol, activo")
      .eq("id", user.id)
      .single(),
    supabase.from("permisos_usuario").select("seccion, nivel").eq("usuario_id", user.id),
  ]);

  if (!data) return null;
  if (error && error.code !== "42P01" && error.code !== "PGRST205") throw new Error("No se pudieron verificar los permisos");
  return { ...data, permisos: Object.fromEntries((permisos ?? []).map((p) => [p.seccion, p.nivel])) } as Perfil;
});

export const getAcceso = cache(async (): Promise<Acceso> => {
  const perfil = await getPerfil();
  return { rol: perfil?.activo ? perfil.rol : null, permisos: perfil?.permisos ?? {} };
});

export async function puedeAdministrarEntidad(entidad: string): Promise<boolean> {
  const seccion = seccionEntidad(entidad);
  return !!seccion && puedeEscribir(await getAcceso(), seccion);
}

/** Lectura: el usuario puede ver la sección (cualquier nivel que no sea sin_acceso). */
export async function puedeVerEntidad(entidad: string): Promise<boolean> {
  const seccion = seccionEntidad(entidad);
  if (!seccion) return false;
  const acceso = await getAcceso();
  return nivelAcceso(acceso.rol, seccion, acceso.permisos) !== "sin_acceso";
}

/** Rol efectivo: null si la cuenta está inactiva o sin rol asignado. */
export const getRol = cache(async (): Promise<Rol | null> => {
  const perfil = await getPerfil();
  return perfil?.activo ? perfil.rol : null;
});
