/**
 * Reglas para dar de baja una categoría de documento creada por el
 * administrador (`tipos_documento_custom`). La categoría es global, así que
 * antes de borrarla hay que saber qué pasa con los documentos que la usan:
 *
 * - Si cuelgan de alguna ficha, se bloquea la baja: esa ficha los mostraría de
 *   pronto bajo "Otros Documentos" sin que nadie lo haya decidido.
 * - Si no cuelgan de ninguna (p. ej. se les quitó el vínculo desde la ficha),
 *   ninguna ficha los muestra y el usuario no tiene desde dónde verlos: no
 *   deben bloquear, sólo pasar a "Otros" para no quedar con un tipo que ya no
 *   existe.
 *
 * Es puro (sin Supabase) para poder probarlo aparte.
 */

export type DocumentoDeCategoria = { id: string; nombre: string | null };

const NOMBRES_EN_MENSAJE = 3;

export function repartirDocumentosDeCategoria(
  documentos: DocumentoDeCategoria[],
  idsConFicha: ReadonlySet<string>
): { enFichas: DocumentoDeCategoria[]; sueltos: DocumentoDeCategoria[] } {
  const enFichas: DocumentoDeCategoria[] = [];
  const sueltos: DocumentoDeCategoria[] = [];
  for (const documento of documentos) {
    (idsConFicha.has(documento.id) ? enFichas : sueltos).push(documento);
  }
  return { enFichas, sueltos };
}

/** Mensaje de bloqueo: nombra los documentos, porque el usuario no los ve en la ficha donde intenta borrar. */
export function mensajeCategoriaEnUso(enFichas: DocumentoDeCategoria[]): string {
  const total = enFichas.length;
  const nombres = enFichas.slice(0, NOMBRES_EN_MENSAJE).map((d) => `«${d.nombre?.trim() || "Sin nombre"}»`);
  const resto = total - nombres.length;
  const lista = nombres.join(", ") + (resto > 0 ? ` y ${resto} más` : "");

  if (total === 1) {
    return `No se puede eliminar: ${lista} sigue vinculado a una ficha. Ábrelo en Documentos para quitarlo de ella o enviarlo a la papelera.`;
  }
  return `No se puede eliminar: ${total} documentos siguen vinculados a fichas (${lista}). Ábrelos en Documentos para quitarlos de ellas o enviarlos a la papelera.`;
}
