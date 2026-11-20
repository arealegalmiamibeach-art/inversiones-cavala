import type { SupabaseClient } from "@supabase/supabase-js";

export type AccionHistorial = "crear" | "editar" | "eliminar";

export interface EntradaHistorial {
  id: string;
  tabla: string;
  registroId: string;
  accion: AccionHistorial;
  campo: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  actorId: string | null;
  actorNombre: string | null;
  actorCorreo: string | null;
  creadoEn: string;
}

type FilaHistorial = {
  id: string;
  tabla: string;
  registro_id: string;
  accion: AccionHistorial;
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  actor_id: string | null;
  actor_nombre: string | null;
  actor_correo: string | null;
  creado_en: string;
};

function aEntrada(f: FilaHistorial): EntradaHistorial {
  return {
    id: f.id,
    tabla: f.tabla,
    registroId: f.registro_id,
    accion: f.accion,
    campo: f.campo,
    valorAnterior: f.valor_anterior,
    valorNuevo: f.valor_nuevo,
    actorId: f.actor_id,
    actorNombre: f.actor_nombre,
    actorCorreo: f.actor_correo,
    creadoEn: f.creado_en,
  };
}

export async function cargarHistorial(
  supabase: SupabaseClient,
  tabla: string,
  registroId: string,
  limite = 80
): Promise<EntradaHistorial[]> {
  const { data, error } = await supabase
    .from("historial")
    .select(
      "id, tabla, registro_id, accion, campo, valor_anterior, valor_nuevo, actor_id, actor_nombre, actor_correo, creado_en"
    )
    .eq("tabla", tabla)
    .eq("registro_id", registroId)
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error || !data) return [];
  return (data as FilaHistorial[]).map(aEntrada);
}

// ─── Etiquetas de campo ───────────────────────────────────────────────────
// Los nombres de columna son consistentes entre tablas, así que un mapa plano
// alcanza. Lo que no esté aquí se muestra con el nombre crudo humanizado.

const CAMPO_LABEL: Record<string, string> = {
  // sintéticos
  notas: "Notas",
  archivo: "Archivo",
  adenda: "Adenda",
  vinculo: "Vínculo",
  vencimiento: "Vencimiento",
  // procesos
  materia: "Materia",
  expediente: "Expediente",
  asunto: "Asunto",
  estado: "Estado",
  descripcion: "Descripción",
  juzgado: "Juzgado",
  abogado: "Abogado",
  estudio: "Estudio",
  diligencia: "Diligencia",
  // contratos
  tipo: "Tipo",
  nombre: "Nombre",
  monto: "Monto",
  moneda: "Moneda",
  plazo: "Plazo",
  fecha_inicio: "Fecha de inicio",
  fecha_vencimiento: "Vencimiento",
  legalizado: "Legalizado",
  // propietarios
  es_propio: "¿Es propio?",
  tipo_persona: "Tipo de persona",
  // datos_empresas
  razon_social: "Razón social",
  ruc: "RUC",
  dni: "DNI",
  gerente: "Gerente",
  direccion_fiscal: "Dirección fiscal",
  partida_registral: "Partida registral",
  cuenta_bancaria: "Cuenta bancaria",
  // predios
  tipo_predio: "Tipo de predio",
  registrado: "Registrado",
  a_nombre_de: "A nombre de",
  detalles: "Detalles",
  n_partida: "N.º de partida",
  ubicacion: "Ubicación",
  coordenadas: "Coordenadas",
  archivador_drive: "Archivador Drive",
  archivador_fisico: "Archivador físico",
  monto_copia_literal: "Monto copia literal",
  fecha_adquisicion: "Fecha de adquisición",
  // vehiculos
  placa: "Placa",
  marca_modelo: "Marca / modelo",
  categoria: "Categoría",
  anio: "Año",
  n_serie: "N.º de serie",
  responsable: "Responsable",
  soat_vence: "Vencimiento SOAT",
  poliza_vence: "Vencimiento póliza",
  revision_tecnica: "Revisión técnica",
  detalle: "Detalle",
  // concesiones
  codigo: "Código",
  hectareas: "Hectáreas",
  sustancia: "Sustancia",
  url_ubicacion: "URL de ubicación",
  // personal
  cargo: "Cargo",
  correo: "Correo",
  modalidad: "Modalidad",
  activo: "Activo",
  remuneracion: "Remuneración",
  contrato_inicio: "Inicio de contrato",
  contrato_fin: "Fin de contrato",
  firmado: "Firmado",
  // documentos
  fecha: "Fecha",
};

export function etiquetaCampo(campo: string | null): string {
  if (!campo) return "el registro";
  if (CAMPO_LABEL[campo]) return CAMPO_LABEL[campo];
  return campo.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// ─── Formato de valores ───────────────────────────────────────────────────

const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

export function formatearValor(valor: string | null): string {
  if (valor === null || valor === "") return "—";
  if (valor === "true") return "Sí";
  if (valor === "false") return "No";
  if (ISO_FECHA.test(valor)) {
    const [a, m, d] = valor.split("-");
    return `${d}/${m}/${a}`;
  }
  if (ISO_TIMESTAMP.test(valor)) {
    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) {
      return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha);
    }
  }
  return valor;
}

// ─── Descripción de una entrada ───────────────────────────────────────────

export interface DescripcionEntrada {
  /** Frase corta: "editó Estado", "adjuntó un archivo"… */
  accion: string;
  /** Si el cambio tiene un antes/después que valga la pena mostrar. */
  muestraDiff: boolean;
}

export function describirEntrada(e: EntradaHistorial): DescripcionEntrada {
  if (e.accion === "crear") {
    if (e.campo === "archivo") return { accion: "adjuntó un archivo", muestraDiff: false };
    if (e.campo === "adenda") return { accion: "agregó una adenda", muestraDiff: false };
    if (e.campo === "vinculo") return { accion: "vinculó un documento", muestraDiff: false };
    if (e.campo === "vencimiento") return { accion: "registró qué pasó con un vencimiento", muestraDiff: false };
    return { accion: "creó el registro", muestraDiff: false };
  }
  if (e.accion === "eliminar") {
    if (e.campo === "archivo") return { accion: "quitó un archivo", muestraDiff: false };
    if (e.campo === "adenda") return { accion: "eliminó una adenda", muestraDiff: false };
    if (e.campo === "vinculo") return { accion: "quitó un vínculo", muestraDiff: false };
    if (e.campo === "vencimiento") return { accion: "reabrió un vencimiento", muestraDiff: false };
    return { accion: "eliminó el registro", muestraDiff: false };
  }
  if (e.campo === "archivo") return { accion: "movió un archivo de carpeta", muestraDiff: true };
  if (e.campo === "carpeta") return { accion: "movió o renombró una carpeta", muestraDiff: true };
  if (e.campo === "notas") return { accion: "editó las notas", muestraDiff: true };
  return { accion: `editó ${etiquetaCampo(e.campo)}`, muestraDiff: true };
}

// ─── Diff de texto ────────────────────────────────────────────────────────
// Recorta prefijo/sufijo comunes y deja ver sólo el tramo que cambió, con
// algo de contexto. Suficiente para notas largas; para valores cortos se
// muestran enteros.

export interface DiffTexto {
  prefijo: string;
  eliminado: string;
  agregado: string;
  sufijo: string;
  recortadoInicio: boolean;
  recortadoFin: boolean;
}

const CONTEXTO = 60;

export function diffTexto(antes: string | null, ahora: string | null): DiffTexto {
  const a = antes ?? "";
  const b = ahora ?? "";

  let ini = 0;
  const min = Math.min(a.length, b.length);
  while (ini < min && a[ini] === b[ini]) ini++;

  let fin = 0;
  while (fin < min - ini && a[a.length - 1 - fin] === b[b.length - 1 - fin]) fin++;

  const prefijoCompleto = a.slice(0, ini);
  const sufijoCompleto = a.slice(a.length - fin);
  const prefijo = prefijoCompleto.slice(-CONTEXTO);
  const sufijo = sufijoCompleto.slice(0, CONTEXTO);

  const MAX_TRAMO = 300;
  const recortar = (s: string) => (s.length > MAX_TRAMO ? s.slice(0, MAX_TRAMO) + "…" : s);

  return {
    prefijo,
    eliminado: recortar(a.slice(ini, a.length - fin)),
    agregado: recortar(b.slice(ini, b.length - fin)),
    sufijo,
    recortadoInicio: prefijoCompleto.length > prefijo.length,
    recortadoFin: sufijoCompleto.length > sufijo.length,
  };
}

/** true si conviene mostrar el diff recortado en vez de antes/ahora completos. */
export function esValorLargo(valor: string | null): boolean {
  return (valor?.length ?? 0) > 140;
}

export function nombreActor(e: EntradaHistorial): string {
  return e.actorNombre?.trim() || e.actorCorreo?.split("@")[0] || "Alguien";
}

export function inicialActor(e: EntradaHistorial): string {
  return nombreActor(e).charAt(0).toUpperCase();
}

// ─── Fechas relativas / agrupación por día ─────────────────────────────────

export function tiempoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return "hace un momento";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(ms / 86_400_000);
  if (d < 7) return `hace ${d} día${d === 1 ? "" : "s"}`;
  const sem = Math.round(d / 7);
  if (d < 30) return `hace ${sem} sem`;
  const meses = Math.round(d / 30);
  if (d < 365) return `hace ${meses} mes${meses === 1 ? "" : "es"}`;
  return `hace ${Math.round(d / 365)} año${Math.round(d / 365) === 1 ? "" : "s"}`;
}

/** "Editado hace 2 días" para el botón; "" si no hay historial. */
export function textoUltimaEdicion(entradas: EntradaHistorial[]): string {
  if (entradas.length === 0) return "";
  return `Editado ${tiempoRelativo(entradas[0].creadoEn)}`;
}

function claveDiaLima(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function etiquetaDia(iso: string): string {
  const hoy = claveDiaLima(new Date().toISOString());
  const ayer = claveDiaLima(new Date(Date.now() - 86_400_000).toISOString());
  const dia = claveDiaLima(iso);
  if (dia === hoy) return "Hoy";
  if (dia === ayer) return "Ayer";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "long",
    year: dia.slice(0, 4) === hoy.slice(0, 4) ? undefined : "numeric",
  }).format(new Date(iso));
}

export interface GrupoHistorial {
  dia: string;
  entradas: EntradaHistorial[];
}

export function agruparPorDia(entradas: EntradaHistorial[]): GrupoHistorial[] {
  const grupos: GrupoHistorial[] = [];
  for (const entrada of entradas) {
    const dia = etiquetaDia(entrada.creadoEn);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.entradas.push(entrada);
    else grupos.push({ dia, entradas: [entrada] });
  }
  return grupos;
}
