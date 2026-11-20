/**
 * Cierre de vencimientos: registrar qué pasó con un contrato, SOAT, póliza…
 * para que deje de avisar en el dashboard, la campana y el correo.
 * Diseño: docs/DISENO-CIERRE-VENCIMIENTOS.md.
 *
 * Módulo puro: lo usan `alertas.ts` y las acciones en el servidor, y el
 * calendario y el widget de vencimientos en el cliente.
 *
 * Un cierre se identifica por (alertaId, fecha). La fecha va en la clave a
 * propósito: si el vencimiento cambia de fecha, la alerta nueva no está
 * cerrada y vuelve a avisar.
 */

export type ResultadoCierre = "RENOVADO" | "PRORROGADO" | "CONCLUIDO" | "RESUELTO" | "OTRO";

export const RESULTADOS_CIERRE: readonly ResultadoCierre[] = ["RENOVADO", "PRORROGADO", "CONCLUIDO", "RESUELTO", "OTRO"];

export const RESULTADO_CIERRE_LABEL: Record<ResultadoCierre, string> = {
  RENOVADO: "Se renovó",
  PRORROGADO: "Se prorrogó",
  CONCLUIDO: "No se renueva",
  RESUELTO: "Se resolvió",
  OTRO: "Otro",
};

export const NOTA_CIERRE_MAX = 500;

export type CierreVencimiento = {
  resultado: ResultadoCierre;
  nota: string | null;
  cerradoPorNombre: string | null;
  /** ISO timestamp. */
  cerradoEn: string;
};

export function esResultadoCierre(valor: unknown): valor is ResultadoCierre {
  return typeof valor === "string" && (RESULTADOS_CIERRE as readonly string[]).includes(valor);
}

// ─── Id de alerta ↔ entidad ──────────────────────────────────────────────

/**
 * Fuentes fijas de "Fechas y avisos" → prefijo del id de la alerta y tipo de
 * entidad dueña. El prefijo no se cambia: la campana recuerda lo leído por id
 * y los cierres guardados lo usan como clave.
 */
export const ALERTA_FIJA: Readonly<Record<string, { clave: string; entidadTipo: string }>> = {
  "contrato.fecha_vencimiento": { clave: "contrato", entidadTipo: "contrato" },
  "contrato.fecha_inicio": { clave: "contrato-inicio", entidadTipo: "contrato" },
  "vehiculo.soat_vence": { clave: "soat", entidadTipo: "vehiculo" },
  "vehiculo.poliza_vence": { clave: "poliza", entidadTipo: "vehiculo" },
  "vehiculo.revision_tecnica": { clave: "revision-tecnica", entidadTipo: "vehiculo" },
  "personal.contrato_fin": { clave: "personal", entidadTipo: "personal" },
  "personal.contrato_inicio": { clave: "personal-inicio", entidadTipo: "personal" },
};

const ENTIDAD_POR_CLAVE: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.values(ALERTA_FIJA).map((f) => [f.clave, f.entidadTipo])),
  documento: "documento",
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RE_SIMPLE = new RegExp(`^([a-z-]+)-(${UUID})$`, "i");
const RE_PROPIEDAD = new RegExp(`^propiedad-(${UUID})-(${UUID})$`, "i");
const RE_UUID_FINAL = new RegExp(`(${UUID})$`, "i");
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type EntidadDeAlerta =
  /** El tipo se conoce por el prefijo del id. */
  | { tipo: "fija"; entidadTipo: string; entidadId: string }
  /** Fecha de una propiedad personalizada: el tipo de la entidad sale de la definición. */
  | { tipo: "propiedad"; propiedadId: string; entidadId: string };

/** "contrato-<uuid>" → contrato <uuid>. null si el id no es de una alerta conocida. */
export function entidadDeAlerta(alertaId: string): EntidadDeAlerta | null {
  if (typeof alertaId !== "string") return null;
  const propiedad = RE_PROPIEDAD.exec(alertaId);
  if (propiedad) return { tipo: "propiedad", propiedadId: propiedad[1].toLowerCase(), entidadId: propiedad[2].toLowerCase() };
  const simple = RE_SIMPLE.exec(alertaId);
  if (!simple) return null;
  const entidadTipo = ENTIDAD_POR_CLAVE[simple[1]];
  return entidadTipo ? { tipo: "fija", entidadTipo, entidadId: simple[2].toLowerCase() } : null;
}

/**
 * Id de alerta de un evento del calendario. El calendario usa sus propios ids
 * ("contrato-vence-<uuid>", "vehiculo-soat-<uuid>"), así que se traduce por la
 * fuente. Documentos y propiedades comparten el id con la alerta.
 */
export function alertaIdDeEvento(fuente: string | undefined, eventoId: string): string | null {
  if (!fuente) return null;
  const fija = ALERTA_FIJA[fuente];
  if (fija) {
    const uuid = RE_UUID_FINAL.exec(eventoId);
    return uuid ? `${fija.clave}-${uuid[1]}` : null;
  }
  if (fuente.startsWith("documento:") || fuente.startsWith("propiedad:")) {
    return entidadDeAlerta(eventoId) ? eventoId : null;
  }
  return null;
}

/** Clave de emparejado alerta ↔ cierre. */
export function claveCierre(alertaId: string, fecha: string): string {
  return `${alertaId}|${fecha}`;
}

// ─── Vocabulario por tipo ────────────────────────────────────────────────

const CON_PRORROGA = new Set(["contrato", "personal"]);

/**
 * Qué resultados tienen sentido para cada vencimiento: un SOAT no "se
 * resuelve" ni "se prorroga"; un contrato sí.
 */
export function resultadosParaAlerta(alertaId: string): readonly ResultadoCierre[] {
  const entidad = entidadDeAlerta(alertaId);
  if (entidad?.tipo === "fija" && CON_PRORROGA.has(entidad.entidadTipo)) return RESULTADOS_CIERRE;
  return ["RENOVADO", "CONCLUIDO", "OTRO"];
}

// ─── Validación ──────────────────────────────────────────────────────────

export type EntradaCierre = { alertaId: string; fecha: string; resultado: string; nota?: string | null };

/** Devuelve el error para el usuario, o null si la entrada es válida. */
export function validarCierre(entrada: EntradaCierre): string | null {
  // Llega de una server action: el navegador puede mandar cualquier cosa.
  if (!entrada || typeof entrada !== "object") return "Vencimiento no válido";
  if (!entidadDeAlerta(entrada.alertaId)) return "Vencimiento no válido";
  if (!esFechaISO(entrada.fecha)) return "Fecha no válida";
  if (!esResultadoCierre(entrada.resultado)) return "Resultado no válido";
  if (!resultadosParaAlerta(entrada.alertaId).includes(entrada.resultado)) return "Ese resultado no aplica a este vencimiento";
  if (entrada.nota != null && typeof entrada.nota !== "string") return "Nota no válida";
  const nota = entrada.nota?.trim() ?? "";
  if (nota.length > NOTA_CIERRE_MAX) return `La nota no puede pasar de ${NOTA_CIERRE_MAX} caracteres`;
  if (entrada.resultado === "OTRO" && !nota) return "Con \"Otro\" hay que contar qué pasó";
  return null;
}

export function esFechaISO(valor: unknown): valor is string {
  return typeof valor === "string" && RE_FECHA.test(valor);
}

/** Texto corto para chips e historial: "Se renovó — nuevo contrato 2027". */
export function textoCierre(cierre: Pick<CierreVencimiento, "resultado" | "nota">): string {
  const label = RESULTADO_CIERRE_LABEL[cierre.resultado];
  return cierre.nota ? `${label} — ${cierre.nota}` : label;
}

/** "2026-09-11" → "11 set. 2026". Mediodía para que el huso no corra el día. */
export function fechaCortaCierre(fechaISO: string): string {
  return new Date(`${fechaISO}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Filas de la base ────────────────────────────────────────────────────

export type FilaCierre = {
  alerta_id: string;
  fecha: string;
  resultado: string;
  nota: string | null;
  cerrado_por_nombre: string | null;
  cerrado_en: string;
};

export const COLUMNAS_CIERRE = "alerta_id, fecha, resultado, nota, cerrado_por_nombre, cerrado_en";

/** Filas → mapa por `claveCierre`. Descarta lo que no se reconoce. */
export function mapaDeCierres(filas: readonly FilaCierre[] | null | undefined): Map<string, CierreVencimiento> {
  const mapa = new Map<string, CierreVencimiento>();
  for (const fila of filas ?? []) {
    if (!fila || !esResultadoCierre(fila.resultado) || !esFechaISO(fila.fecha)) continue;
    mapa.set(claveCierre(fila.alerta_id, fila.fecha), {
      resultado: fila.resultado,
      nota: fila.nota,
      cerradoPorNombre: fila.cerrado_por_nombre,
      cerradoEn: fila.cerrado_en,
    });
  }
  return mapa;
}
