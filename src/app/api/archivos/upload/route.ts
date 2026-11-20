import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBucketName, getObjectMetadata, getUploadUrl } from "@/lib/r2/client";
import { MAX_ARCHIVO_BYTES, MENSAJE_LIMITE_ARCHIVO, mimePermitido, MENSAJE_FORMATO_NO_PERMITIDO, MIMES_PERMITIDOS } from "@/lib/archivos/mimes";
import { registrarEvento, TABLA_POR_ENTIDAD } from "@/lib/historial-server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_JSON_BYTES = 8 * 1024;
const ENTITY_TABLES: Record<string, string> = {
  documento: "documentos",
  contrato: "contratos",
  proceso: "procesos",
  vehiculo: "vehiculos",
  predio: "predios",
  concesion: "concesiones_mineras",
  propietario: "propietarios",
  personal: "personal",
  oficina_registral: "oficinas_registrales",
};

type UploadPayload = {
  entidadTipo?: string;
  entidadId?: string;
  nombre?: string;
  mime?: string;
  tamano?: number;
  sha256?: string;
  r2Key?: string;
  origen?: "app" | "editor";
  /** Ruta de carpeta anidada elegida al subir, p. ej. "IMPUESTO/2026/MARZO". Ausente/vacía = raíz. */
  carpeta?: string;
};

const CARPETA_INVALIDA = Symbol("carpeta-invalida");

/** Columnas de `archivos` que el cliente necesita para pintar la fila recién subida. */
type FilaArchivo = {
  id: string;
  nombre_original: string;
  mime: string | null;
  tamano_bytes: number;
  subido_en: string | null;
  carpeta: string | null;
};

/** true si algún carácter tiene código menor a 32 (control ASCII) o es DEL (127). */
function tieneCaracterDeControl(valor: string): boolean {
  for (let i = 0; i < valor.length; i++) {
    const codigo = valor.charCodeAt(i);
    if (codigo < 32 || codigo === 127) return true;
  }
  return false;
}

/** `undefined`/cadena vacía → raíz (`null`). Recorta espacios en cada segmento y valida límites razonables. */
function normalizarCarpeta(valor: unknown): string | null | typeof CARPETA_INVALIDA {
  if (valor === undefined || valor === null || valor === "") return null;
  if (typeof valor !== "string") return CARPETA_INVALIDA;
  const segmentos = valor.split("/").map((s) => s.trim()).filter(Boolean);
  if (segmentos.length === 0) return null;
  if (segmentos.length > 6) return CARPETA_INVALIDA;
  for (const segmento of segmentos) {
    if (segmento.length > 60 || tieneCaracterDeControl(segmento)) return CARPETA_INVALIDA;
  }
  return segmentos.join("/");
}

function validate(payload: UploadPayload) {
  if (!payload.entidadTipo || !ENTITY_TABLES[payload.entidadTipo]) return "Tipo de entidad no permitido";
  if (!payload.entidadId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.entidadId)) return "Entidad inválida";
  if (!payload.nombre || payload.nombre.length > 240 || /[\u0000-\u001f\u007f]/.test(payload.nombre)) return "Nombre de archivo inválido";
  if (!payload.mime || !mimePermitido(payload.mime)) return MENSAJE_FORMATO_NO_PERMITIDO;
  if (!Number.isSafeInteger(payload.tamano) || payload.tamano! <= 0 || payload.tamano! > MAX_ARCHIVO_BYTES) return MENSAJE_LIMITE_ARCHIVO;
  if (!payload.sha256 || !/^[0-9a-f]{64}$/i.test(payload.sha256)) return "Checksum inválido";
  if (payload.origen !== undefined && payload.origen !== "app" && payload.origen !== "editor") return "Origen de carga inválido";
  if (normalizarCarpeta(payload.carpeta) === CARPETA_INVALIDA) return "Carpeta inválida";
  return null;
}

async function readPayload(request: Request): Promise<UploadPayload | NextResponse> {
  if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) {
    return jsonError("Content-Type no permitido", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_JSON_BYTES) return jsonError("Solicitud demasiado grande", 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) return jsonError("Solicitud demasiado grande", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonError("JSON inválido", 400);
    }
    return parsed as UploadPayload;
  } catch {
    return jsonError("JSON inválido", 400);
  }
}

async function canAccessEntity(supabase: SupabaseClient, entidadTipo: string, entidadId: string) {
  const { data, error } = await supabase
    .from(ENTITY_TABLES[entidadTipo])
    .select("id")
    .eq("id", entidadId)
    .maybeSingle();
  return !error && Boolean(data);
}

function objectKey(payload: UploadPayload) {
  return `${payload.sha256!.slice(0, 2)}/${payload.sha256}${MIMES_PERMITIDOS[payload.mime!]}`;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const parsed = await readPayload(request);
  if (parsed instanceof NextResponse) return parsed;
  const payload = parsed;
  const error = validate(payload);
  if (error) return jsonError(error, 400);
  if (!await puedeAdministrarEntidad(payload.entidadTipo!) || !await puedeAdministrarEntidad("documento")) return jsonError("No tienes permiso para subir archivos", 403);
  if (!await canAccessEntity(supabase, payload.entidadTipo!, payload.entidadId!)) {
    return jsonError("Entidad no encontrada o sin permiso", 403);
  }

  const r2Key = objectKey(payload);
  const uploadUrl = await getUploadUrl(r2Key, payload.mime!, payload.sha256!, 3600);

  return NextResponse.json({ uploadUrl, r2Key }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const parsed = await readPayload(request);
  if (parsed instanceof NextResponse) return parsed;
  const payload = parsed;
  const error = validate(payload);
  if (error) return jsonError(error, 400);
  if (!await puedeAdministrarEntidad(payload.entidadTipo!) || !await puedeAdministrarEntidad("documento")) return jsonError("No tienes permiso para subir archivos", 403);
  if (!payload.r2Key || !/^[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/i.test(payload.r2Key)) {
    return jsonError("Clave de archivo inválida", 400);
  }
  if (payload.r2Key !== objectKey(payload)) return jsonError("La clave no coincide con el archivo", 400);
  if (!await canAccessEntity(supabase, payload.entidadTipo!, payload.entidadId!)) {
    return jsonError("Entidad no encontrada o sin permiso", 403);
  }

  try {
    const metadata = await getObjectMetadata(payload.r2Key);
    if (metadata.contentLength !== payload.tamano || metadata.contentType !== payload.mime) {
      return jsonError("El archivo subido no coincide con los datos declarados", 400);
    }
  } catch {
    return jsonError("No se encontró el archivo subido", 400);
  }

  const { data: existing } = await supabase
    .from("archivos")
    .select("id, nombre_original, mime, tamano_bytes, subido_en, carpeta")
    .eq("entidad_tipo", payload.entidadTipo!)
    .eq("entidad_id", payload.entidadId!)
    .eq("r2_key", payload.r2Key)
    .maybeSingle();

  if (existing) {
    // El mismo contenido (sha256 + r2_key) ya estaba subido en esta entidad —
    // no crear una fila duplicada, pero sí aplicar el destino elegido ahora si
    // es distinto al que tenía, para no descartarlo en silencio.
    //
    // La raíz (`carpeta` ausente o vacía → null) cuenta como destino: antes se
    // excluía, así que soltar en la raíz un archivo que ya vivía en una
    // subcarpeta lo dejaba donde estaba y parecía que la subida se había
    // perdido. Sólo vale para `origen: "app"` —el panel de Archivos, donde el
    // usuario eligió dónde soltarlo—; las imágenes pegadas en el editor de
    // notas no traen destino y no deben mover nada de sitio.
    const carpetaSolicitada = normalizarCarpeta(payload.carpeta);
    const destino = carpetaSolicitada === CARPETA_INVALIDA ? null : carpetaSolicitada;
    if (payload.origen === "app" && carpetaSolicitada !== CARPETA_INVALIDA && destino !== (existing.carpeta ?? null)) {
      const { data: actualizado } = await supabase
        .from("archivos")
        .update({ carpeta: destino })
        .eq("id", existing.id)
        .select("id, nombre_original, mime, tamano_bytes, subido_en, carpeta")
        .single();
      // `yaExistia`: el cliente avisa que no se creó un archivo nuevo — sin
      // esto el usuario veía "subido" y no entendía por qué seguía habiendo uno solo.
      if (actualizado) return NextResponse.json({ archivo: actualizado, yaExistia: true, movido: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ archivo: existing, yaExistia: true }, { headers: { "Cache-Control": "no-store" } });
  }

  // Compatibilidad: el editor de bloques (P1) aún no envía `origen`, así que
  // ausente equivale a "editor" — su comportamiento histórico.
  const rutaOrigen = payload.origen === "app" ? "carga-app" : "editor-bloques";

  const { data: insertado, error: insertError } = await supabase
    .from("archivos")
    .insert({
      entidad_tipo: payload.entidadTipo,
      entidad_id: payload.entidadId,
      nombre_original: payload.nombre,
      r2_bucket: getBucketName(),
      r2_key: payload.r2Key,
      mime: payload.mime,
      tamano_bytes: payload.tamano,
      sha256: payload.sha256,
      ruta_origen: rutaOrigen,
      carpeta: normalizarCarpeta(payload.carpeta) as string | null,
    })
    .select("id, nombre_original, mime, tamano_bytes, subido_en, carpeta")
    .single();

  let fila: FilaArchivo | null = insertado;

  if (insertError) {
    // 23505 = choque con el índice único `archivos_objeto_dueno` sobre
    // (r2_key, entidad_id). Pasa cuando dos subidas del mismo archivo se
    // solapan (p. ej. el usuario reintenta porque el indicador de progreso
    // se quedó pegado): ambas pasan el `SELECT` de arriba antes de que la
    // otra confirme su INSERT, así que ninguna ve la fila de la otra. La
    // que pierde la carrera no falló de verdad — el archivo si quedó
    // registrado — así que se relee esa fila y se devuelve como éxito en
    // vez de mostrarle un error al usuario por un archivo que sí se subió.
    if (insertError.code === "23505") {
      const { data: yaRegistrado } = await supabase
        .from("archivos")
        .select("id, nombre_original, mime, tamano_bytes, subido_en, carpeta")
        .eq("entidad_id", payload.entidadId!)
        .eq("r2_key", payload.r2Key!)
        .maybeSingle();
      if (yaRegistrado) return NextResponse.json({ archivo: yaRegistrado, yaExistia: true }, { headers: { "Cache-Control": "no-store" } });

      // No hay ninguna fila visible con esa clave, pero el índice único sí
      // la ve: está en la papelera. La política restrictiva que esconde lo
      // eliminado la deja fuera del SELECT de arriba, así que el usuario
      // chocaba contra un archivo que no puede ver ni recuperar desde aquí.
      // Volver a subirlo es justamente pedir que vuelva: se revive en la
      // carpeta elegida ahora (`security definer`, con el mismo permiso de
      // escritura que exige la tabla).
      const { data: revivido, error: errorRevivir } = await supabase.rpc("archivo_revivir", {
        p_entidad_tipo: payload.entidadTipo!,
        p_entidad_id: payload.entidadId!,
        p_r2_key: payload.r2Key!,
        p_nombre: payload.nombre!,
        p_carpeta: normalizarCarpeta(payload.carpeta) as string | null,
      });
      const resucitado = revivido as { ok?: boolean; archivo?: FilaArchivo } | null;
      if (resucitado?.ok && resucitado.archivo) fila = resucitado.archivo;
      // Si la RPC misma falla (no está aplicada en la base, o el permiso no
      // alcanza) el usuario sólo veía "No se pudo registrar el archivo" y no
      // quedaba rastro de por qué: sin este log, diagnosticarlo obliga a
      // reproducirlo a mano contra la base.
      else if (errorRevivir) {
        console.error("[archivos/upload] archivo_revivir falló:", errorRevivir.code, errorRevivir.message);
        if (errorRevivir.code === "42501") return jsonError("No tienes permiso para subir archivos a esta ficha", 403);
        if (errorRevivir.code === "PGRST202") {
          return jsonError("Falta aplicar una migración en la base (archivo_revivir)", 500);
        }
      } else if (resucitado && !resucitado.ok) {
        console.error("[archivos/upload] archivo_revivir sin efecto:", (resucitado as { error?: string }).error);
      }
    }

    if (!fila) {
      console.error("[archivos/upload] insert falló:", insertError.code, insertError.message, insertError.details);
      return jsonError("No se pudo registrar el archivo", 400);
    }
  }

  // Sólo los adjuntos "de verdad" (secciones de archivos) entran al historial;
  // las imágenes pegadas en el editor de notas son parte de "editó las notas".
  if (payload.origen === "app") {
    const tabla = TABLA_POR_ENTIDAD[payload.entidadTipo!];
    if (tabla) {
      await registrarEvento(supabase, user.id, {
        tabla,
        registroId: payload.entidadId!,
        accion: "crear",
        campo: "archivo",
        valorNuevo: payload.nombre ?? null,
      });
    }
  }

  return NextResponse.json({ archivo: fila }, { headers: { "Cache-Control": "no-store" } });
}
