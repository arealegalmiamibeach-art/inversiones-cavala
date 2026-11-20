export type PropiedadContrato = {
  clave: string;
  label: string;
  valor: string;
};

const ETIQUETAS: Record<string, string> = {
  Tipo: "Modalidad contractual",
  "Contratistas (posible relacion)": "Contratista importado",
  Profesional: "Profesional",
  "tipo profesional": "Tipo profesional",
  adenda: "Adenda",
  Devoluciones: "Devoluciones",
  Detalles: "Detalles",
  "Personal MBP": "Personal relacionado (importado)",
  "Propietarios MBP": "Propietario relacionado (importado)",
  "Propietarios ALI": "Propietario relacionado (importado)",
  Monto: "Monto importado",
};

const OMITIR = new Set([
  "Legalizacion",
  "LEGALIZACIÓN",
  // Metadatos internos de la app: tienen controles dedicados y nunca deben
  // aparecer como columnas importadas editables.
  "origen",
  "notas",
  "es_adenda",
  "clase",
  "documento_padre",
  "documento_padre_notion_id",
  // Las fórmulas de Notion se reemplazan por las columnas calculadas
  // "Vigencia" y "Vencimiento" (ver lib/contratos/vigencia.ts).
  "Fórmula",
  "Fórmula 1",
  "Fórmula 2",
]);

const PRIORIDAD = [
  "Tipo",
  "Profesional",
  "tipo profesional",
  "Contratistas (posible relacion)",
  "Personal MBP",
  "Propietarios MBP",
  "Propietarios ALI",
  "Monto",
  "adenda",
  "Devoluciones",
  "Detalles",
];

/** Convierte el JSON migrado desde Notion en propiedades legibles de producto. */
export function propiedadesContrato(extra: unknown): PropiedadContrato[] {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return [];

  return Object.entries(extra as Record<string, unknown>)
    .filter(([clave, valor]) =>
      !clave.startsWith("_") &&
      !OMITIR.has(clave)
    )
    .map(([clave, valor]) => ({
      clave,
      label: ETIQUETAS[clave] ?? humanizar(clave),
      valor: aTexto(valor),
    }))
    .sort((a, b) => {
      const ia = PRIORIDAD.indexOf(a.clave);
      const ib = PRIORIDAD.indexOf(b.clave);
      if (ia === -1 && ib === -1) return a.label.localeCompare(b.label, "es-PE");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
}


function aTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") {
    // Los respaldos Markdown conservaron algunos enlaces relativos de Notion.
    // En la propiedad interesa el nombre, no la ruta interna del respaldo.
    return valor.replace(/\s+\(\.\.\/.*\)$/, "").trim();
  }
  if (typeof valor === "number") return valor.toLocaleString("es-PE");
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (Array.isArray(valor)) return valor.map(aTexto).join(", ");
  return JSON.stringify(valor);
}

function humanizar(valor: string) {
  const limpio = valor.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return limpio ? limpio.charAt(0).toLocaleUpperCase("es-PE") + limpio.slice(1) : "Propiedad";
}
