/**
 * Al cerrarse el selector nativo de archivos del sistema operativo (elija o
 * cancele el usuario), Chrome devuelve el foco a la página y a veces dispara
 * un click "fantasma" sobre lo que quedó debajo del cursor. Si ese click cae
 * sobre el fondo oscuro de un panel modal (p. ej. `EntitySheet`), lo cierra
 * de golpe y se lleva puesto el `<input>` que estaba a mitad de la subida —
 * el archivo elegido nunca llega a procesarse.
 *
 * Quien abre el selector (`inputRef.current.click()`) marca una ventana
 * breve con `marcarSelectorArchivoAbierto()`; cualquier "click afuera" que
 * cerraría un panel debe ignorarse mientras `selectorArchivoActivo()` sea
 * cierto, sin afectar clics reales del usuario.
 */
let activoHasta = 0;

export function marcarSelectorArchivoAbierto() {
  activoHasta = Date.now() + 2000;
}

export function selectorArchivoActivo() {
  return Date.now() < activoHasta;
}
