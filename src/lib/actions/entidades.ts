"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import { esFechaISOValida } from "@/lib/utils";
import { CLAVES_PARTES_PROCESO } from "@/lib/procesos/partes";

/**
 * Lista blanca de columnas editables desde la UI. Todo lo que no esté aquí se
 * rechaza antes de tocar la base — el nombre de columna llega del cliente.
 * Deliberadamente excluye claves, campos de migración (notion_id, extra) y
 * metadatos internos. Los datos de personal conservan la comprobación de permisos.
 */
const CAMPOS_EDITABLES: Record<string, string[]> = {
  vehiculos: [
    "placa", "marca_modelo", "categoria", "responsable", "detalle", "anio", "n_serie", "n_partida",
    "revision_tecnica", "soat_vence", "poliza_vence", "archivador_drive", "archivador_fisico",
  ],
  propietarios: ["nombre", "es_propio", "tipo_persona"],
  datos_empresas: [
    "razon_social", "ruc", "dni", "gerente",
    "direccion_fiscal", "partida_registral", "cuenta_bancaria",
  ],
  predios: [
    "nombre", "tipo_predio", "registrado", "a_nombre_de", "detalles",
    "n_partida", "ubicacion", "coordenadas", "fecha_adquisicion", "monto_copia_literal",
    "archivador_drive", "archivador_fisico",
  ],
  concesiones_mineras: ["nombre", "sustancia", "estado", "codigo", "hectareas", "ubicacion", "url_ubicacion"],
  personal: ["nombre", "dni", "remuneracion", "modalidad", "activo", "firmado", "cargo", "correo", "contrato_inicio", "contrato_fin"],
  oficinas_registrales: ["nombre"],
  procesos: ["expediente", "materia", "estado", "descripcion", "asunto", "juzgado", "abogado", "estudio", "diligencia"],
  documentos: ["nombre", "tipo", "fecha", "detalle"],
  contratos: [
    "nombre", "tipo", "estado", "moneda", "monto", "plazo",
    "fecha_inicio", "fecha_vencimiento", "legalizado",
  ],
};

/**
 * Tablas cuyo `extra->>'notas'` puede editar el editor de bloques. Es una lista
 * blanca aparte de CAMPOS_EDITABLES porque `extra` sí es escribible aquí, pero
 * solo en esa clave: el resto del jsonb (datos de la migración) se conserva.
 */
const TABLAS_CON_NOTAS = [
  "propietarios", "personal", "concesiones_mineras", "oficinas_registrales",
  "contratos", "procesos", "documentos", "predios", "vehiculos", "datos_empresas",
];

type Resultado = { success: true } | { error: string; code?: string };

export async function actualizarCampo(
  tabla: string,
  id: string,
  campo: string,
  valor: unknown,
  revalidar: string,
  propietarioId?: string
): Promise<Resultado> {
  if (!esUuid(id)) return { error: "Registro no válido" };
  const esPropiedadImportadaContrato = tabla === "contratos" && campo.startsWith("extra.");
  // Partes del proceso (demandante, imputado…): viven en `extra`, pero sólo
  // se aceptan las claves del catálogo — el resto del jsonb es de la migración.
  const esParteProceso = tabla === "procesos" && campo.startsWith("extra.") && CLAVES_PARTES_PROCESO.has(campo.slice("extra.".length));
  if (!CAMPOS_EDITABLES[tabla]?.includes(campo) && !esPropiedadImportadaContrato && !esParteProceso) {
    return { error: "Campo no editable" };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado", code: "401" };
  if (!await puedeAdministrarEntidad(tabla)) return { error: "Tu rol no permite editar registros", code: "403" };

  if (esParteProceso) {
    const clave = campo.slice("extra.".length);
    if (valor !== null && typeof valor !== "string") return { error: "Valor no válido" };
    const texto = typeof valor === "string" ? valor.trim() : "";
    if (texto.length > 20_000) return { error: "El texto es demasiado largo" };

    const { data: fila, error: errorLectura } = await supabase.from("procesos").select("extra").eq("id", id).single();
    if (errorLectura) return { error: errorLectura.message, code: errorLectura.code };

    const extra = { ...((fila?.extra ?? {}) as Record<string, unknown>) };
    extra[clave] = texto || null;
    const { error } = await supabase.from("procesos").update({ extra }).eq("id", id);
    if (error) return { error: error.message, code: error.code };
    revalidatePath(revalidar);
    revalidatePath("/procesos");
    revalidatePath("/procesos/materia/[materia]", "page");
    revalidatePath(`/procesos/${id}`);
    return { success: true };
  }

  if (esPropiedadImportadaContrato) {
    const clave = campo.slice("extra.".length).trim();
    const reservadas = new Set([
      "origen",
      "notas",
      "es_adenda",
      "clase",
      "documento_padre",
      "documento_padre_notion_id",
      "Fórmula",
      "Fórmula 1",
      "Fórmula 2",
      "Legalizacion",
      "LEGALIZACIÓN",
    ]);
    if (!clave || clave.length > 160 || clave.startsWith("_") || reservadas.has(clave)) {
      return { error: "Propiedad no editable" };
    }
    if (valor !== null && typeof valor !== "string") return { error: "Valor no válido" };
    const texto = typeof valor === "string" ? valor.trim() : "";
    if (texto.length > 20_000) return { error: "El texto es demasiado largo" };

    const { data: fila, error: errorLectura } = await supabase
      .from("contratos")
      .select("extra")
      .eq("id", id)
      .single();
    if (errorLectura) return { error: errorLectura.message, code: errorLectura.code };

    const extra = { ...((fila?.extra ?? {}) as Record<string, unknown>) };
    extra[clave] = texto || null;
    const { error } = await supabase.from("contratos").update({ extra }).eq("id", id);
    if (error) return { error: error.message, code: error.code };
    revalidatePath(revalidar);
    revalidatePath("/contratos");
    revalidatePath("/contratos/tipo/[tipo]", "page");
    revalidatePath(`/contratos/${id}`);
    return { success: true };
  }

  let valorNormalizado = valor;
  const campoCalificado = `${tabla}.${campo}`;
  const camposRequeridos = new Set([
    "vehiculos.placa",
    "propietarios.nombre",
    "predios.nombre",
    "concesiones_mineras.nombre",
    "personal.nombre",
    "oficinas_registrales.nombre",
    "documentos.nombre",
    "contratos.nombre",
  ]);
  const camposFecha = new Set([
    "vehiculos.revision_tecnica",
    "vehiculos.soat_vence",
    "vehiculos.poliza_vence",
    "personal.contrato_inicio",
    "personal.contrato_fin",
    "predios.fecha_adquisicion",
    "documentos.fecha",
    "contratos.fecha_inicio",
    "contratos.fecha_vencimiento",
  ]);

  if (camposRequeridos.has(campoCalificado)) {
    const texto = typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
    if (!texto) return { error: "Este campo es obligatorio" };
    if (texto.length > 240) return { error: "El texto no puede pasar de 240 caracteres" };
    valorNormalizado = texto;
  }
  if (camposFecha.has(campoCalificado)) {
    if (valor === null || valor === "") valorNormalizado = null;
    else if (!esFechaISOValida(valor)) {
      return { error: "Ingresa una fecha válida" };
    }
  }
  // `procesos.estado` tiene vocabulario cerrado desde la migración
  // 20260916160000_estado_procesos_vocabulario_real.sql. Antes era texto libre
  // sin validar y el desplegable llegó a pisar bitácoras enteras de
  // expedientes. El catálogo ahora vive en `estados_procesos` (editable
  // desde la UI), así que se valida contra la tabla en vez de una lista fija.
  if (campoCalificado === "procesos.estado") {
    if (valor === null || valor === "") valorNormalizado = null;
    else if (typeof valor !== "string") {
      return { error: "Estado no válido para un proceso" };
    } else {
      const texto = valor.trim();
      // Cada materia tiene su propio conjunto de estados.
      const { data: proceso } = await supabase
        .from("procesos")
        .select("materia")
        .eq("id", id)
        .maybeSingle();
      if (!proceso) return { error: "Registro no encontrado" };
      const { data: estadoValido } = await supabase
        .from("estados_procesos")
        .select("valor")
        .eq("valor", texto)
        .or(`materia.is.null,materia.eq."${String(proceso.materia).replace(/["\\]/g, "")}"`)
        .limit(1)
        .maybeSingle();
      if (!estadoValido) return { error: "Ese estado no existe en la materia de este proceso" };
      valorNormalizado = texto;
    }
  }
  if (campoCalificado === "concesiones_mineras.hectareas") {
    if (valor === null || valor === "") valorNormalizado = null;
    else {
      const hectareas = typeof valor === "number" ? valor : Number(valor);
      if (!Number.isFinite(hectareas) || hectareas < 0 || hectareas > 999999999999.9999) {
        return { error: "Ingresa una cantidad de hectáreas válida" };
      }
      valorNormalizado = hectareas;
    }
  }
  if (campoCalificado === "predios.monto_copia_literal" || campoCalificado === "personal.remuneracion") {
    if (valor === null || valor === "") valorNormalizado = null;
    else {
      const monto = typeof valor === "number" ? valor : Number(valor);
      if (!Number.isFinite(monto) || monto < 0 || monto > 999999999999.99) return { error: "Ingresa un monto válido" };
      valorNormalizado = Math.round(monto * 100) / 100;
    }
  }
  if (campoCalificado === "vehiculos.anio") {
    if (valor === null || valor === "") valorNormalizado = null;
    else {
      const anio = typeof valor === "number" ? valor : Number(valor);
      if (!Number.isInteger(anio) || anio < 1800 || anio > 2200) return { error: "Ingresa un año válido" };
      valorNormalizado = anio;
    }
  }
  if (tabla === "contratos") {
    if (campo === "legalizado") {
      if (valor === null || valor === "") valorNormalizado = null;
      else if (typeof valor !== "string") {
        return { error: "Selecciona una opción válida" };
      } else {
        const texto = valor.trim().replace(/\s+/g, " ");
        if (!texto || texto.length > 80) return { error: "La opción puede tener hasta 80 caracteres" };
        valorNormalizado = texto;
      }
    }
    if (campo === "monto") {
      if (valor === null || valor === "") valorNormalizado = null;
      else {
        const monto = typeof valor === "number" ? valor : Number(valor);
        if (!Number.isFinite(monto) || monto < 0 || monto > 999999999999.99) {
          return { error: "Ingresa un monto válido" };
        }
        valorNormalizado = Math.round(monto * 100) / 100;
      }
    }
  }

  // `datos_empresas` es una relación 0..1: muchos propietarios todavía no
  // tienen fila. El primer valor escrito debe crearla y los siguientes deben
  // reutilizarla, tanto desde la tabla como desde el panel o la ficha.
  if (tabla === "datos_empresas" && propietarioId) {
    if (!esUuid(propietarioId)) return { error: "Propietario no válido" };
    if (valor !== null && typeof valor !== "string") return { error: "Valor no válido" };
    const texto = typeof valor === "string" ? valor.trim() : "";
    if (texto.length > 2_000) return { error: "El texto no puede pasar de 2,000 caracteres" };

    const { data: empresa, error: errorLectura } = await supabase
      .from("datos_empresas")
      .select("id")
      .eq("propietario_id", propietarioId)
      .order("id")
      .limit(1)
      .maybeSingle();
    if (errorLectura) return { error: errorLectura.message, code: errorLectura.code };

    if (!empresa && !texto) return { success: true };
    const operacion = empresa
      ? supabase.from("datos_empresas").update({ [campo]: texto || null }).eq("id", empresa.id)
      : supabase.from("datos_empresas").insert({ propietario_id: propietarioId, [campo]: texto });
    const { error } = await operacion;
    if (error) return { error: error.message, code: error.code };

    revalidatePath(revalidar);
    revalidatePath("/entidades/propietarios");
    revalidatePath(`/entidades/propietarios/${propietarioId}`);
    return { success: true };
  }

  const cambios: Record<string, unknown> = { [campo]: valorNormalizado };
  if (tabla === "propietarios" && campo === "es_propio") {
    const { data: fila, error: errorLectura } = await supabase
      .from("propietarios")
      .select("extra")
      .eq("id", id)
      .single();
    if (errorLectura) return { error: errorLectura.message, code: errorLectura.code };

    const extra = { ...((fila?.extra ?? {}) as Record<string, unknown>) };
    if (typeof valor === "boolean") {
      delete extra.tipo_propietario;
    } else if (typeof valor === "string") {
      const tipoSolicitado = valor.trim().replace(/\s+/g, " ");
      if (!tipoSolicitado || tipoSolicitado.length > 80) return { error: "Tipo no válido" };

      const { data: tipos, error: errorTipos } = await supabase
        .from("tipos_propietario")
        .select("nombre");
      if (errorTipos) return { error: errorTipos.message, code: errorTipos.code };
      const tipoCatalogo = (tipos ?? []).find(
        (tipo) => String(tipo.nombre).toLocaleLowerCase("es-PE") === tipoSolicitado.toLocaleLowerCase("es-PE")
      );
      if (!tipoCatalogo) return { error: "Ese tipo ya no está disponible" };

      cambios.es_propio = null;
      extra.tipo_propietario = tipoCatalogo.nombre;
    } else {
      return { error: "Tipo no válido" };
    }
    cambios.extra = extra;
  }

  const { error } = await supabase.from(tabla).update(cambios).eq("id", id);
  if (error) return { error: error.message, code: error.code };
  revalidatePath(revalidar);
  // Los nombres y propiedades también se leen en relaciones de otros módulos.
  revalidatePath("/", "layout");
  if (tabla === "contratos") {
    revalidatePath("/contratos");
    revalidatePath("/contratos/tipo/[tipo]", "page");
    revalidatePath(`/contratos/${id}`);
  }
  return { success: true };
}

/**
 * Guarda el texto libre del editor de bloques en `extra->>'notas'` para las
 * entidades que no tienen columna propia de notas. Lee el jsonb actual y hace
 * merge en vez de reemplazarlo para no perder las claves de la migración.
 */
export async function actualizarNotas(
  tabla: string,
  id: string,
  valor: string | null,
  revalidar: string
): Promise<Resultado> {
  if (!TABLAS_CON_NOTAS.includes(tabla)) return { error: "Tabla sin notas editables" };
  if (!esUuid(id)) return { error: "Registro no válido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado", code: "401" };
  if (!await puedeAdministrarEntidad(tabla)) return { error: "Tu rol no permite editar registros", code: "403" };

  const { data: fila, error: errorLectura } = await supabase
    .from(tabla)
    .select("extra")
    .eq("id", id)
    .single();
  if (errorLectura) return { error: errorLectura.message, code: errorLectura.code };

  const extraActual = (fila?.extra ?? {}) as Record<string, unknown>;
  const siguiente: Record<string, unknown> = { ...extraActual };
  if (valor && valor.trim()) siguiente.notas = valor;
  else delete siguiente.notas;

  const { error } = await supabase.from(tabla).update({ extra: siguiente }).eq("id", id);
  if (error) return { error: error.message, code: error.code };
  revalidatePath(revalidar);
  return { success: true };
}
