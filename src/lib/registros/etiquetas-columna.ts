/**
 * Etiqueta vigente de un valor guardado en una columna con catálogo editable.
 *
 * Los filtros, los grupos y el resto de la tabla trabajan con el valor que
 * guarda la fila (`no_metal`, `penal`); sólo lo que se MUESTRA pasa por aquí.
 * Vive aparte de `records-table.tsx` para poder probarlo sin React.
 */

type OpcionBasica = { value: string; label: string };

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-PE").trim();
}

/**
 * Devuelve una función valor→etiqueta para una columna.
 *
 * - `vigentes`: las opciones efectivas (catálogo editado o, mientras no se
 *   haya editado, las del código).
 * - `base`: las opciones del código. Algunas columnas (Materia) exponen al
 *   filtro la etiqueta del código y no el valor guardado; si esa etiqueta
 *   coincide con la de una opción base se resuelve por su valor, para que un
 *   renombrado desde "Editar propiedad" también se vea en el filtro.
 *
 * Un valor que no está en ninguna lista se devuelve tal cual.
 */
export function resolverEtiqueta(base: OpcionBasica[], vigentes: OpcionBasica[]): (crudo: string) => string {
  const porValor = new Map(vigentes.map((opcion) => [opcion.value, opcion.label]));
  const valorPorEtiquetaBase = new Map(base.map((opcion) => [normalizar(opcion.label), opcion.value]));
  return (crudo) => {
    const directa = porValor.get(crudo);
    if (directa !== undefined) return directa;
    const valor = valorPorEtiquetaBase.get(normalizar(crudo));
    const porEtiqueta = valor === undefined ? undefined : porValor.get(valor);
    return porEtiqueta ?? crudo;
  };
}

export type OperadorTexto = "contiene" | "no_contiene" | "igual" | "distinto" | "empieza";

/**
 * Comparación de texto de un filtro contra varias formas del mismo valor (el
 * guardado y la etiqueta que se ve): escribir «no metal» encuentra `no_metal`
 * y escribir `no_metal` sigue funcionando. Con un solo candidato es la
 * comparación de siempre; los operadores negativos exigen que NINGUNA forma
 * coincida.
 */
export function coincideTexto(operador: string, candidatos: string[], objetivo: string): boolean {
  const derecha = objetivo.toLocaleLowerCase("es-PE");
  const izquierdas = candidatos.map((candidato) => candidato.toLocaleLowerCase("es-PE"));
  switch (operador) {
    case "no_contiene": return !izquierdas.some((izquierda) => izquierda.includes(derecha));
    case "igual": return izquierdas.some((izquierda) => izquierda === derecha);
    case "distinto": return !izquierdas.some((izquierda) => izquierda === derecha);
    case "empieza": return izquierdas.some((izquierda) => izquierda.startsWith(derecha));
    default: return izquierdas.some((izquierda) => izquierda.includes(derecha));
  }
}
