import type { SupabaseClient } from "@supabase/supabase-js";
import { diasHastaFechaISO, hoyISOEnLima, sumarDiasISO } from "@/lib/utils";
import { DIAS_CRITICO, DIAS_PROXIMO } from "@/lib/urgencia";
import { cargarConfigFechas, tipoDe } from "@/lib/fechas-config";
import { cargarFechasPersonalizadas } from "@/lib/calendario-server";
import { TIPOS as TIPOS_DOCUMENTO } from "@/app/(dashboard)/documentos/tipos";
import {
  ALERTA_FIJA,
  COLUMNAS_CIERRE,
  claveCierre,
  mapaDeCierres,
  type CierreVencimiento,
  type FilaCierre,
} from "@/lib/vencimientos/cierres";

const DIAS_VENTANA = 60;

/**
 * Cuánto hacia atrás se sigue mostrando lo ya vencido.
 *
 * Antes la ventana empezaba en hoy, así que un SOAT o un contrato vencía y al
 * día siguiente desaparecía de la campana y del dashboard como si se hubiera
 * resuelto solo. Lo vencido es justamente lo que hay que ver.
 */
const DIAS_VENCIDOS = 30;

export { DIAS_CRITICO, DIAS_PROXIMO };

/** Para el icono de la campana: de qué tipo de registro viene el aviso. */
export type OrigenAlerta = "contrato" | "vehiculo" | "personal" | "documento" | "propiedad";

export type Alerta = {
  id: string;
  /** Grupo visible: "Contrato", "SOAT", el tipo de documento o el nombre de la propiedad. */
  tipo: string;
  /** Qué vence, en palabras: "Vence el SOAT", "Vence vigencia de poder"… */
  etiqueta: string;
  origen: OrigenAlerta;
  nombre: string;
  fecha: string;
  /** Negativo si ya venció. */
  dias: number;
  vencido: boolean;
  href: string;
  /** Qué pasó con este vencimiento, si alguien ya lo cerró. Cerrado no avisa. */
  cierre?: CierreVencimiento;
};

/** Lo que sigue avisando: la campana, el correo y el contador sólo ven esto. */
export function alertasAbiertas(alertas: readonly Alerta[]): Alerta[] {
  return alertas.filter((a) => !a.cierre);
}

export type NivelAlerta = "critico" | "proximo" | "normal";

/**
 * Semáforo único: rojo ≤ DIAS_CRITICO, ámbar ≤ DIAS_PROXIMO, normal hasta el
 * borde de la ventana (60). Los umbrales son los mismos que usa el semáforo de
 * diligencias — ver `lib/urgencia.ts`.
 */
export function nivelAlerta(dias: number): NivelAlerta {
  if (dias <= DIAS_CRITICO) return "critico";
  if (dias <= DIAS_PROXIMO) return "proximo";
  return "normal";
}

function hoyISO() {
  return hoyISOEnLima();
}
function enDiasISO(dias: number) {
  return sumarDiasISO(hoyISO(), dias);
}
function diasRestantes(fecha: string): number {
  return diasHastaFechaISO(fecha, hoyISO()) ?? 0;
}

type FuenteAlertaFija = {
  fuente: string;
  tabla: string;
  columna: string;
  campoNombre: string;
  tipo: string;
  etiqueta: string;
  origen: OrigenAlerta;
  href: (id: string) => string;
};

const FUENTES_ALERTA_FIJAS: FuenteAlertaFija[] = [
  { fuente: "contrato.fecha_vencimiento", tabla: "contratos", columna: "fecha_vencimiento", campoNombre: "nombre", tipo: "Contrato", etiqueta: "Vence el contrato", origen: "contrato", href: (id) => `/contratos/${id}` },
  { fuente: "contrato.fecha_inicio", tabla: "contratos", columna: "fecha_inicio", campoNombre: "nombre", tipo: "Contrato", etiqueta: "Inicia el contrato", origen: "contrato", href: (id) => `/contratos/${id}` },
  { fuente: "vehiculo.soat_vence", tabla: "vehiculos", columna: "soat_vence", campoNombre: "placa", tipo: "SOAT", etiqueta: "Vence el SOAT", origen: "vehiculo", href: (id) => `/entidades/vehiculos/${id}` },
  { fuente: "vehiculo.poliza_vence", tabla: "vehiculos", columna: "poliza_vence", campoNombre: "placa", tipo: "Póliza", etiqueta: "Vence la póliza", origen: "vehiculo", href: (id) => `/entidades/vehiculos/${id}` },
  { fuente: "vehiculo.revision_tecnica", tabla: "vehiculos", columna: "revision_tecnica", campoNombre: "placa", tipo: "Revisión técnica", etiqueta: "Vence la revisión técnica", origen: "vehiculo", href: (id) => `/entidades/vehiculos/${id}` },
  { fuente: "personal.contrato_fin", tabla: "personal", columna: "contrato_fin", campoNombre: "nombre", tipo: "Personal", etiqueta: "Termina el contrato de personal", origen: "personal", href: (id) => `/entidades/personal/${id}` },
  { fuente: "personal.contrato_inicio", tabla: "personal", columna: "contrato_inicio", campoNombre: "nombre", tipo: "Personal", etiqueta: "Inicia el contrato de personal", origen: "personal", href: (id) => `/entidades/personal/${id}` },
];

/** Prefijo del id de la alerta (vive en `vencimientos/cierres.ts`, que también lo usa el calendario). */
function claveFija(fuente: string): string {
  return ALERTA_FIJA[fuente].clave;
}

function crearAlerta(
  base: Omit<Alerta, "dias" | "vencido" | "id" | "fecha">,
  id: string,
  fecha: string
): Alerta {
  const dias = diasRestantes(fecha);
  return { ...base, id, fecha, dias, vencido: dias < 0 };
}

/**
 * Fuente única de "qué está por vencer en los próximos DIAS_VENTANA días".
 * La campana del Header, el dashboard y el correo diario consumen esta misma
 * lista. Qué cuenta como vencimiento lo decide "Fechas y avisos"
 * (`fechas_config`): sin configurar, avisa lo mismo que siempre.
 *
 * Devuelve también lo cerrado, marcado con `cierre`: el dashboard lo lista
 * aparte para poder reabrirlo. Todo lo que avisa usa `alertasAbiertas()`.
 *
 * `eliminado_en is null` lo aplica sola la RLS en una sesión de usuario, pero
 * el cron del correo diario usa la service-role key y se la salta: sin este
 * filtro seguiría avisando de registros ya eliminados.
 */
export async function getAlertas(supabase: SupabaseClient): Promise<Alerta[]> {
  const desde = enDiasISO(-DIAS_VENCIDOS);
  const hasta = enDiasISO(DIAS_VENTANA);
  const config = await cargarConfigFechas(supabase);

  const fijas = FUENTES_ALERTA_FIJAS.filter((f) => tipoDe(config, f.fuente) === "vencimiento");

  const documentos = Array.from(config.entries())
    .filter(([fuente, c]) => fuente.startsWith("documento:") && c.tipo === "vencimiento")
    .map(([fuente, c]) => ({ tipo: fuente.slice("documento:".length), dias: c.diasVigencia ?? 0 }));

  const propiedades = new Map(
    Array.from(config.entries())
      .filter(([fuente, c]) => fuente.startsWith("propiedad:") && c.tipo === "vencimiento")
      .map(([fuente, c]) => [fuente.slice("propiedad:".length), c.diasVigencia ?? 0])
  );

  const [resultadosFijas, resultadosDocumentos, nombresCustom, fechasPropiedades, cierresRes] = await Promise.all([
    // `personal` puede fallar con 42501 (RLS) según el rol — se ignora
    // silenciosamente, igual que el resto de la app trata ese acceso.
    Promise.all(fijas.map((f) =>
      supabase
        .from(f.tabla)
        .select(`id, ${f.campoNombre}, ${f.columna}`)
        .is("eliminado_en", null)
        .gte(f.columna, desde)
        .lte(f.columna, hasta)
        .order(f.columna)
    )),
    // Se busca por fecha de emisión: la ventana se corre los días de vigencia.
    Promise.all(documentos.map((d) =>
      supabase
        .from("documentos")
        .select("id, nombre, fecha")
        .eq("tipo", d.tipo)
        .is("eliminado_en", null)
        .gte("fecha", sumarDiasISO(desde, -d.dias))
        .lte("fecha", sumarDiasISO(hasta, -d.dias))
        .order("fecha")
    )),
    documentos.some((d) => !TIPOS_DOCUMENTO[d.tipo])
      ? supabase.from("tipos_documento_custom").select("slug, nombre")
      : Promise.resolve({ data: [] as { slug: string; nombre: string }[] }),
    cargarFechasPersonalizadas(supabase, { propiedadIds: Array.from(propiedades.keys()) }),
    // Si la tabla aún no existe (migración sin aplicar), el error deja todo
    // abierto: se avisa igual que antes de que existieran los cierres.
    supabase
      .from("vencimientos_cierres")
      .select(COLUMNAS_CIERRE)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .limit(5000),
  ]);

  const alertas: Alerta[] = [];

  fijas.forEach((f, i) => {
    for (const fila of (resultadosFijas[i].data ?? []) as unknown as Record<string, string | null>[]) {
      const fecha = fila[f.columna];
      if (!fila.id || !fecha) continue;
      alertas.push(crearAlerta(
        { tipo: f.tipo, etiqueta: f.etiqueta, origen: f.origen, nombre: fila[f.campoNombre] ?? "", href: f.href(fila.id) },
        `${claveFija(f.fuente)}-${fila.id}`,
        fecha
      ));
    }
  });

  const etiquetasCustom = new Map(((nombresCustom.data ?? []) as { slug: string; nombre: string }[]).map((t) => [t.slug, t.nombre]));
  documentos.forEach((d, i) => {
    const label = TIPOS_DOCUMENTO[d.tipo] ?? etiquetasCustom.get(d.tipo) ?? d.tipo;
    for (const fila of (resultadosDocumentos[i].data ?? []) as { id: string; nombre: string | null; fecha: string | null }[]) {
      if (!fila.fecha) continue;
      alertas.push(crearAlerta(
        { tipo: label, etiqueta: `Vence ${label.toLocaleLowerCase("es-PE")}`, origen: "documento", nombre: fila.nombre ?? "", href: `/documentos/${fila.id}` },
        `documento-${fila.id}`,
        sumarDiasISO(fila.fecha, d.dias)
      ));
    }
  });

  for (const fila of fechasPropiedades) {
    const fecha = sumarDiasISO(fila.fecha, propiedades.get(fila.propiedadId) ?? 0);
    if (fecha < desde || fecha > hasta) continue;
    alertas.push(crearAlerta(
      {
        tipo: fila.propiedadNombre,
        etiqueta: `${fila.propiedadNombre} (${fila.entidadLabel.toLocaleLowerCase("es-PE")})`,
        origen: "propiedad",
        nombre: fila.entidadNombre,
        href: fila.href,
      },
      `propiedad-${fila.propiedadId}-${fila.entidadId}`,
      fecha
    ));
  }

  const cierres = mapaDeCierres(cierresRes.error ? [] : (cierresRes.data as FilaCierre[] | null));
  for (const alerta of alertas) {
    const cierre = cierres.get(claveCierre(alerta.id, alerta.fecha));
    if (cierre) alerta.cierre = cierre;
  }

  return alertas.sort((a, b) => a.dias - b.dias);
}
