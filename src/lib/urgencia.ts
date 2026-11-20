/**
 * Umbrales del semáforo, compartidos por todo lo que vence.
 *
 * Había dos juegos de constantes: `lib/alertas.ts` marcaba en rojo a 10 días
 * (contratos, SOAT, pólizas, fin de contrato de personal) y
 * `lib/procesos/diligencias.ts` a 7 (audiencias y diligencias). El mismo color
 * significaba cosas distintas según la tarjeta, y `lib/notificaciones.ts`
 * mezcla las dos fuentes en la misma campana y en el mismo correo diario.
 *
 * Se unifica en 10 días, el más amplio de los dos: así ninguna categoría pierde
 * margen de aviso respecto a como estaba (las diligencias se ponen en rojo tres
 * días antes que antes, nada se avisa más tarde).
 */

/** Rojo: vence dentro de estos días (o ya venció). */
export const DIAS_CRITICO = 10;

/** Ámbar: vence dentro de estos días, pasado el umbral crítico. */
export const DIAS_PROXIMO = 30;
