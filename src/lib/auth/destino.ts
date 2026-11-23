/**
 * Destino al que volver después de iniciar sesión (parámetro `?next=`).
 *
 * Sólo se aceptan rutas internas: `/procesos/abc`, no `https://otro.sitio`,
 * `//otro.sitio` ni `/\otro.sitio` (los navegadores tratan esas dos últimas
 * como direcciones externas). Cualquier otra cosa vuelve al dashboard, así un
 * enlace manipulado nunca saca a la persona del sistema.
 */
export const DESTINO_POR_DEFECTO = "/dashboard";

export function destinoSeguro(valor: unknown): string {
  if (typeof valor !== "string" || valor.length > 2048) return DESTINO_POR_DEFECTO;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return DESTINO_POR_DEFECTO;
  // Caracteres de control (p. ej. tabulación o salto de línea) permiten
  // camuflar `//` ante esta validación; no tienen uso legítimo en una ruta.
  if (/[\u0000-\u001f\u007f]/.test(valor)) return DESTINO_POR_DEFECTO;
  if (valor === "/login" || valor.startsWith("/login?") || valor.startsWith("/login/")) return DESTINO_POR_DEFECTO;
  return valor;
}
