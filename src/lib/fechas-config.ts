import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tipo de fecha: qué hace cada fuente de fechas (ver migración `fechas_config`).
 * - dato: sólo se ve en la ficha.
 * - evento: además sale en el calendario del dashboard.
 * - vencimiento: además avisa (campana, panel de vencimientos, correo diario).
 */
export type TipoFecha = "dato" | "evento" | "vencimiento";

export const TIPOS_FECHA: TipoFecha[] = ["dato", "evento", "vencimiento"];

export const OPCIONES_TIPO_FECHA: { tipo: TipoFecha; label: string; ayuda: string }[] = [
  { tipo: "dato", label: "Dato", ayuda: "Sólo se ve en la ficha" },
  { tipo: "evento", label: "Evento", ayuda: "También sale en el calendario del dashboard" },
  { tipo: "vencimiento", label: "Vencimiento", ayuda: "Sale en el calendario y avisa por campana y correo" },
];

export type ConfigFecha = { tipo: TipoFecha; diasVigencia: number | null };

export type MapaConfigFechas = ReadonlyMap<string, ConfigFecha>;

export type FuenteFija = {
  fuente: string;
  grupo: string;
  label: string;
  /** Lo que hacía la fuente antes de ser configurable: sin fila, sigue igual. */
  tipoInicial: TipoFecha;
};

export const FUENTES_FIJAS: FuenteFija[] = [
  { fuente: "contrato.fecha_inicio", grupo: "Contratos", label: "Inicio de contrato", tipoInicial: "evento" },
  { fuente: "contrato.fecha_vencimiento", grupo: "Contratos", label: "Vencimiento de contrato", tipoInicial: "vencimiento" },
  { fuente: "vehiculo.soat_vence", grupo: "Vehículos", label: "Vencimiento del SOAT", tipoInicial: "vencimiento" },
  { fuente: "vehiculo.poliza_vence", grupo: "Vehículos", label: "Vencimiento de la póliza", tipoInicial: "vencimiento" },
  { fuente: "vehiculo.revision_tecnica", grupo: "Vehículos", label: "Vencimiento de la revisión técnica", tipoInicial: "vencimiento" },
  { fuente: "personal.contrato_inicio", grupo: "Personal", label: "Inicio de contrato", tipoInicial: "evento" },
  { fuente: "personal.contrato_fin", grupo: "Personal", label: "Fin de contrato", tipoInicial: "vencimiento" },
];

const TIPO_INICIAL_FIJA = new Map(FUENTES_FIJAS.map((f) => [f.fuente, f.tipoInicial]));

export const fuenteDocumento = (tipo: string) => `documento:${tipo}`;
export const fuentePropiedad = (propiedadId: string) => `propiedad:${propiedadId}`;

const FUENTE_DOCUMENTO = /^documento:[a-z0-9_]{1,100}$/;
const FUENTE_PROPIEDAD = /^propiedad:[0-9a-f-]{36}$/;

export function esFuenteValida(fuente: string): boolean {
  return TIPO_INICIAL_FIJA.has(fuente) || FUENTE_DOCUMENTO.test(fuente) || FUENTE_PROPIEDAD.test(fuente);
}

/** Documentos y propiedades salían todos en el calendario: ése es su tipo inicial. */
export function configDe(config: MapaConfigFechas, fuente: string): ConfigFecha {
  return config.get(fuente) ?? { tipo: TIPO_INICIAL_FIJA.get(fuente) ?? "evento", diasVigencia: null };
}

export function tipoDe(config: MapaConfigFechas, fuente: string): TipoFecha {
  return configDe(config, fuente).tipo;
}

/** Si la tabla aún no existe o falla la lectura, todo queda con su tipo inicial. */
export async function cargarConfigFechas(supabase: SupabaseClient): Promise<MapaConfigFechas> {
  const { data, error } = await supabase.from("fechas_config").select("fuente, tipo, dias_vigencia");
  const mapa = new Map<string, ConfigFecha>();
  if (error) return mapa;
  for (const fila of (data ?? []) as { fuente: string; tipo: string; dias_vigencia: number | null }[]) {
    if (!TIPOS_FECHA.includes(fila.tipo as TipoFecha)) continue;
    mapa.set(fila.fuente, { tipo: fila.tipo as TipoFecha, diasVigencia: fila.dias_vigencia ?? null });
  }
  return mapa;
}
