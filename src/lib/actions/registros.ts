"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import { catalogoColumna } from "@/lib/opciones-columna";
import { mandarAPapelera } from "@/lib/papelera-server";

/**
 * Alta y baja de los registros de negocio (propietario, predio, vehículo,
 * concesión, personal, proceso, contrato). Hasta ahora la app sólo dejaba
 * editar campos de registros ya migrados; esto cierra el ciclo.
 *
 * - Alta: sólo los campos mínimos para que la fila exista. El resto se
 *   completa después con la edición en línea de siempre. `extra.origen = "app"`
 *   marca la fila como creada aquí (no vino de Notion).
 * - Baja: sólo `administrador`, y **reversible**: marca `eliminado_en` /
 *   `eliminado_por` y la política RLS "ocultar_eliminados" (migración
 *   20260831000300) lo esconde de toda consulta con sesión. El registro
 *   queda en la papelera con sus archivos y relaciones intactos; el
 *   borrado definitivo vive en `lib/actions/papelera.ts`.
 *
 * El trigger `registrar_historial` audita el 'crear', el 'eliminar' y el
 * 'restaurar' con el usuario en sesión — no hay que hacer nada extra aquí.
 */

export type ResultadoCrear = { ok: true; id: string; registro: Record<string, unknown> } | { ok: false; error: string };
export type ResultadoEliminar = { ok: true } | { ok: false; error: string };

type DefCampo = {
  tipo: "texto" | "booleano" | "enum";
  requerido?: boolean;
  opciones?: readonly string[];
  max?: number;
};

type DefEntidad = {
  tabla: string;
  /** Valor del enum `entidad` que usan `vinculos` y `archivos`. */
  entidad: string;
  /** Etiqueta singular para los mensajes de error. */
  singular: string;
  /** Ruta de la lista a revalidar. */
  ruta: string;
  /** Ruta dinámica adicional a revalidar (familia por tipo/materia). */
  rutaFamilia?: string;
  campos: Record<string, DefCampo>;
};

const MATERIAS = [
  "administrativo", "civil", "penal", "carpeta_fiscal", "contencioso_administrativo",
  "laboral", "sunafil", "conciliacion", "constitucional", "direccion_trabajo",
] as const;

const TIPOS_CONTRATO = [
  "personal", "profesional", "servicios", "mutuo", "arrendamiento", "concesiones",
] as const;

// No se exporta: un archivo "use server" sólo puede exportar funciones async.
// Nadie lo consume desde fuera — la UI de alta tiene su propio CONFIG_CREAR.
// Los enum que están en `CATALOGOS_COLUMNA` (sustancia, modalidad, tipo de
// predio, tipo de persona, materia…) admiten además lo agregado desde "Editar
// propiedad": `valoresDeCatalogo` lo suma a las `opciones` de arranque de aquí.
const ENTIDADES_REGISTRO: Record<string, DefEntidad> = {
  propietarios: {
    tabla: "propietarios", entidad: "propietario", singular: "propietario",
    ruta: "/entidades/propietarios",
    campos: {
      nombre: { tipo: "texto", requerido: true, max: 240 },
      tipo_persona: { tipo: "enum", opciones: ["natural", "juridica"] },
      es_propio: { tipo: "booleano" },
    },
  },
  predios: {
    tabla: "predios", entidad: "predio", singular: "predio",
    ruta: "/entidades/predios",
    campos: {
      nombre: { tipo: "texto", requerido: true, max: 240 },
      tipo_predio: { tipo: "enum", opciones: ["urbano", "rural"] },
      n_partida: { tipo: "texto", max: 120 },
      ubicacion: { tipo: "texto", max: 240 },
    },
  },
  vehiculos: {
    tabla: "vehiculos", entidad: "vehiculo", singular: "vehículo",
    ruta: "/entidades/vehiculos",
    campos: {
      placa: { tipo: "texto", requerido: true, max: 40 },
      marca_modelo: { tipo: "texto", max: 120 },
      categoria: { tipo: "texto", max: 80 },
    },
  },
  concesiones_mineras: {
    tabla: "concesiones_mineras", entidad: "concesion", singular: "concesión",
    ruta: "/entidades/concesiones",
    campos: {
      nombre: { tipo: "texto", requerido: true, max: 240 },
      codigo: { tipo: "texto", max: 80 },
      // Enum con catálogo editable: `valoresDeCatalogo` admite también las
      // sustancias agregadas desde "Editar propiedad".
      sustancia: { tipo: "enum", opciones: ["metal", "no_metal"] },
    },
  },
  personal: {
    tabla: "personal", entidad: "personal", singular: "registro de personal",
    ruta: "/entidades/personal",
    campos: {
      nombre: { tipo: "texto", requerido: true, max: 240 },
      cargo: { tipo: "texto", max: 120 },
      modalidad: { tipo: "enum", opciones: ["planilla", "locador"] },
    },
  },
  oficinas_registrales: {
    tabla: "oficinas_registrales", entidad: "oficina_registral", singular: "oficina registral",
    ruta: "/entidades/oficinas",
    campos: {
      nombre: { tipo: "texto", requerido: true, max: 240 },
    },
  },
  procesos: {
    tabla: "procesos", entidad: "proceso", singular: "proceso",
    ruta: "/procesos", rutaFamilia: "/procesos/materia/[materia]",
    campos: {
      materia: { tipo: "enum", requerido: true, opciones: MATERIAS },
      expediente: { tipo: "texto", max: 120 },
      asunto: { tipo: "texto", max: 400 },
      // El vocabulario ya no está fijo en código: vive en la tabla
      // `estados_procesos` (editable desde la UI), así que aquí sólo se
      // valida como texto libre — el valor que llega ya viene de una
      // opción/grupo válido en la vista.
      estado: { tipo: "texto", max: 80 },
    },
  },
  contratos: {
    tabla: "contratos", entidad: "contrato", singular: "contrato",
    ruta: "/contratos", rutaFamilia: "/contratos/tipo/[tipo]",
    campos: {
      tipo: { tipo: "enum", requerido: true, opciones: TIPOS_CONTRATO },
      nombre: { tipo: "texto", requerido: true, max: 240 },
      moneda: { tipo: "enum", opciones: ["PEN", "USD"] },
    },
  },
  documentos: {
    tabla: "documentos", entidad: "documento", singular: "documento",
    ruta: "/documentos", rutaFamilia: "/documentos/tipos/[tipo]",
    campos: {
      nombre: { tipo: "texto", requerido: true, max: 240 },
      tipo: { tipo: "texto", max: 120 },
    },
  },
};

function limpiarTexto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Valores extra que admiten los campos enum con catálogo editable
 * (`opciones_columna`): una materia o un tipo de contrato agregado desde
 * "Editar propiedad" ya se podía elegir en la tabla, pero el alta lo
 * rechazaba con "Valor no válido" porque sólo miraba la lista del código.
 */
async function valoresDeCatalogo(supabase: Supabase, def: DefEntidad): Promise<Record<string, Set<string>>> {
  const campos = Object.entries(def.campos)
    .filter(([campo, regla]) => regla.tipo === "enum" && catalogoColumna(def.tabla, campo))
    .map(([campo]) => campo);
  if (campos.length === 0) return {};
  const { data, error } = await supabase
    .from("opciones_columna")
    .select("campo, valor")
    .eq("tabla", def.tabla)
    .in("campo", campos);
  if (error) return {};
  const porCampo: Record<string, Set<string>> = {};
  for (const fila of (data ?? []) as { campo: string; valor: string }[]) {
    (porCampo[fila.campo] ??= new Set()).add(fila.valor);
  }
  return porCampo;
}

/** Valida `datos` contra la definición y devuelve el objeto a insertar, o un error. */
function construirInsert(
  def: DefEntidad,
  datos: Record<string, unknown>,
  catalogo: Record<string, Set<string>> = {}
): { valores: Record<string, unknown> } | { error: string } {
  const valores: Record<string, unknown> = {};

  for (const [campo, regla] of Object.entries(def.campos)) {
    const bruto = datos[campo];

    if (regla.tipo === "texto") {
      const texto = limpiarTexto(bruto);
      if (!texto) {
        if (regla.requerido) return { error: `Falta ${campo === "nombre" || campo === "placa" ? "el nombre" : `el campo ${campo}`}` };
        continue;
      }
      if (regla.max && texto.length > regla.max) return { error: `El campo ${campo} no puede pasar de ${regla.max} caracteres` };
      valores[campo] = texto;
      continue;
    }

    if (regla.tipo === "booleano") {
      if (typeof bruto === "boolean") valores[campo] = bruto;
      else if (bruto === "true") valores[campo] = true;
      else if (bruto === "false") valores[campo] = false;
      continue;
    }

    // enum
    const texto = typeof bruto === "string" ? bruto.trim() : "";
    if (!texto) {
      if (regla.requerido) return { error: `Elige ${campo === "materia" ? "una materia" : campo === "tipo" ? "un tipo" : `un valor para ${campo}`}` };
      continue;
    }
    if (!regla.opciones?.includes(texto) && !catalogo[campo]?.has(texto)) return { error: `Valor no válido para ${campo}` };
    valores[campo] = texto;
  }

  return { valores };
}

export async function crearRegistro(clave: string, datos: Record<string, unknown>): Promise<ResultadoCrear> {
  const def = ENTIDADES_REGISTRO[clave];
  if (!def) return { ok: false, error: "Tipo de registro no válido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad(def.tabla)) return { ok: false, error: "Tu rol no permite crear registros" };

  const datosNormalizados = { ...(datos ?? {}) };
  const extra: Record<string, unknown> = { origen: "app" };

  // `es_propio` conserva los dos valores históricos. Si el usuario crea otro
  // TIPO en el modal, guardamos su etiqueta en `extra` y dejamos el booleano
  // vacío para no clasificarlo incorrectamente como Propio o Tercero.
  if (clave === "propietarios") {
    const tipoBruto = datosNormalizados.es_propio;
    const esTipoEstandar = tipoBruto === true || tipoBruto === false || tipoBruto === "true" || tipoBruto === "false";
    if (!esTipoEstandar) {
      const tipoPersonalizado = limpiarTexto(tipoBruto);
      if (!tipoPersonalizado) return { ok: false, error: "Elige o crea un tipo de propietario" };
      if (tipoPersonalizado.length > 80) return { ok: false, error: "El tipo no puede pasar de 80 caracteres" };
      extra.tipo_propietario = tipoPersonalizado;
      datosNormalizados.es_propio = "";
    }
  }

  const construido = construirInsert(def, datosNormalizados, await valoresDeCatalogo(supabase, def));
  if ("error" in construido) return { ok: false, error: construido.error };

  const { data: creado, error } = await supabase
    .from(def.tabla)
    .insert({ ...construido.valores, extra })
    .select("*")
    .single();

  if (error || !creado) {
    if (error?.code === "42501") return { ok: false, error: "Sin permiso para crear este registro" };
    return { ok: false, error: error?.message ?? "No se pudo crear el registro" };
  }

  revalidar(def);
  return { ok: true, id: creado.id as string, registro: creado as Record<string, unknown> };
}

export async function eliminarRegistro(clave: string, id: string): Promise<ResultadoEliminar> {
  const def = ENTIDADES_REGISTRO[clave];
  if (!def) return { ok: false, error: "Tipo de registro no válido" };
  if (!esUuid(id)) return { ok: false, error: "Registro no válido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad(def.tabla)) return { ok: false, error: "Sólo un administrador puede eliminar registros" };

  const { data: fila } = await supabase.from(def.tabla).select("id").eq("id", id).maybeSingle();
  if (!fila) return { ok: false, error: "No se encontró el registro" };

  // Un contrato con adendas/resoluciones colgando no se manda a la papelera:
  // los hijos quedarían visibles apuntando a un padre que ya no se ve.
  if (clave === "contratos") {
    const { count: hijos } = await supabase
      .from("contratos")
      .select("id", { count: "exact", head: true })
      .eq("extra->>documento_padre", id);
    if ((hijos ?? 0) > 0) {
      return { ok: false, error: `Este contrato tiene ${hijos} adenda${hijos === 1 ? "" : "s"} o resolución. Elimínalas primero.` };
    }
  }

  // Baja reversible: archivos, relaciones y datos fiscales se quedan como
  // están. Restaurar devuelve el registro entero, no un cascarón.
  const baja = await mandarAPapelera(supabase, def.tabla, id);
  if (!baja.ok) return baja;

  revalidar(def);
  return { ok: true };
}

function revalidar(def: DefEntidad) {
  revalidatePath(def.ruta);
  if (def.rutaFamilia) revalidatePath(def.rutaFamilia, "page");
  revalidatePath("/dashboard");
}
