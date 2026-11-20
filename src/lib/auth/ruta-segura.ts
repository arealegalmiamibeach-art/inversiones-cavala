/**
 * Destino tras confirmar un enlace de correo: sólo rutas de esta misma app.
 *
 * Comprobar `startsWith("/")` y `!startsWith("//")` no basta: el navegador lee
 * `/\evil.com` como `//evil.com`, que es otro dominio. Se resuelve la ruta
 * contra la URL de la petición y se exige el mismo origen. Tampoco se devuelve
 * una ruta normalizada que empiece por `//` (`/.//evil.com` → `//evil.com`),
 * que al redirigir volvería a leerse como otro dominio.
 */
export function rutaSegura(valor: string | null, base: string): string {
  if (!valor?.startsWith("/")) return "/dashboard";
  try {
    const destino = new URL(valor, base);
    if (destino.origin !== new URL(base).origin) return "/dashboard";
    if (destino.pathname.startsWith("//")) return "/dashboard";
    return `${destino.pathname}${destino.search}${destino.hash}`;
  } catch {
    return "/dashboard";
  }
}
