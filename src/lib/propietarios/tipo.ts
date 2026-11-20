export type PropietarioConTipo = {
  es_propio?: boolean | null;
  extra?: unknown;
};

/**
 * Los valores históricos viven en `es_propio`; los tipos creados por el
 * usuario se guardan en `extra.tipo_propietario` para admitir texto libre sin
 * romper la compatibilidad con los filtros Propio/Tercero existentes.
 */
export function tipoPropietarioPersonalizado(propietario: PropietarioConTipo): string | null {
  if (!propietario.extra || typeof propietario.extra !== "object" || Array.isArray(propietario.extra)) {
    return null;
  }

  const valor = (propietario.extra as Record<string, unknown>).tipo_propietario;
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

export function valorTipoPropietario(propietario: PropietarioConTipo): string {
  const personalizado = tipoPropietarioPersonalizado(propietario);
  if (personalizado) return personalizado;
  if (propietario.es_propio === true) return "true";
  if (propietario.es_propio === false) return "false";
  return "";
}

export function etiquetaTipoPropietario(propietario: PropietarioConTipo): string {
  const valor = valorTipoPropietario(propietario);
  if (valor === "true") return "Propio";
  if (valor === "false") return "Tercero";
  return valor;
}
