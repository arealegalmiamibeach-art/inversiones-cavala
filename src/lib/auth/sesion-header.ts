/**
 * Sesión validada por el middleware, pasada al render del servidor en un
 * header de la petición. El middleware ya llama a `auth.getUser()` y lee el
 * perfil en cada request; sin esto el layout y la página repetían las dos
 * consultas en serie antes de pintar nada (~4 viajes a Supabase de más).
 *
 * El middleware SIEMPRE borra el header que venga del navegador y sólo lo
 * vuelve a poner con lo que validó él mismo, así que no se puede falsificar
 * desde fuera. Las consultas de datos siguen yendo con la cookie del usuario
 * (RLS), esto sólo evita repetir la verificación.
 *
 * Sin `server-only`: lo usan el middleware (edge) y el servidor.
 */

export const HEADER_SESION = "x-cavala-sesion";

export type SesionHeader = {
  usuario: { id: string; email: string | null };
  perfil: {
    id: string;
    correo: string | null;
    nombre: string | null;
    rol: string | null;
    activo: boolean;
    permisos: Record<string, string>;
  } | null;
};

export function codificarSesion(sesion: SesionHeader): string {
  // Los valores de header deben ser ASCII: nombres con tildes van escapados.
  return encodeURIComponent(JSON.stringify(sesion));
}

export function decodificarSesion(valor: string | null): SesionHeader | null {
  if (!valor) return null;
  try {
    const sesion = JSON.parse(decodeURIComponent(valor)) as SesionHeader;
    return sesion?.usuario?.id ? sesion : null;
  } catch {
    return null;
  }
}
