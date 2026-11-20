import { ENTIDADES, type EntidadRelacion } from "./contratos";

export type ColumnaRelacionContrato = { clave: string; label: string; tipo: string; rol?: string };

type ParteContrato = { rol: string; label: string };

/**
 * Partes fijas por tipo de contrato: se muestran siempre (aunque estén
 * vacías) y su etiqueta manda sobre la que se deduce del rol.
 * `sinPropietarioGenerico`: la parte ya cubre a los propietarios, así que la
 * fila "Propietario" sin rol sobra (en MBP-Otros se veía como un duplicado
 * vacío de "Arrendador").
 */
const PARTES_POR_TIPO: Record<string, { partes: ParteContrato[]; sinPropietarioGenerico?: boolean }> = {
  mutuo: { partes: [{ rol: "acreedor", label: "Acreedor" }, { rol: "deudor", label: "Deudor" }] },
  servicios: { partes: [{ rol: "arrendador", label: "Contratante/Arrendador" }], sinPropietarioGenerico: true },
};

/**
 * Los roles contractuales son propiedades distintas, incluso entre las mismas partes.
 * `tipos`: tipos de contrato presentes (uno en la ficha, los de la vista en la tabla).
 */
export function columnasRelacionesContrato(relaciones: EntidadRelacion[], tipos: string[]): ColumnaRelacionContrato[] {
  const columnas = new Map<string, ColumnaRelacionContrato>();
  const agregar = (tipo: string, rol?: string, label?: string) => {
    const clave = rol ? `rol:${rol}:${tipo}` : `tipo:${tipo}`;
    if (!columnas.has(clave)) columnas.set(clave, { clave, tipo, rol, label: label ?? ENTIDADES[tipo]?.label ?? tipo });
  };
  const configs = Array.from(new Set(tipos)).map((tipo) => PARTES_POR_TIPO[tipo]);
  for (const config of configs) {
    for (const parte of config?.partes ?? []) agregar("propietario", parte.rol, parte.label);
  }
  // Solo se oculta si TODOS los contratos de la vista lo permiten: en una vista
  // mixta los demás tipos siguen necesitando "Propietario".
  const ocultarPropietario = configs.length > 0 && configs.every((config) => config?.sinPropietarioGenerico);
  for (const r of relaciones) {
    const rol = r.rol?.trim() || undefined;
    agregar(r.entidadTipo, rol, rol ? r.rolLabel : r.entidadTipoLabel);
  }
  for (const tipo of Object.keys(ENTIDADES)) {
    if (tipo === "contrato" || (tipo === "propietario" && ocultarPropietario)) continue;
    agregar(tipo);
  }
  return [...columnas.values()];
}

export function relacionesDeColumna(relaciones: EntidadRelacion[], columna: ColumnaRelacionContrato) {
  return relaciones.filter((r) => r.entidadTipo === columna.tipo && (columna.rol ? r.rol?.trim() === columna.rol : !r.rol?.trim()));
}
