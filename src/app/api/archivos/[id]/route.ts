import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDownloadUrl } from "@/lib/r2/client";
import { puedeAdministrarEntidad, puedeVerEntidad } from "@/lib/auth/perfil";
import { registrarEvento, TABLA_POR_ENTIDAD } from "@/lib/historial-server";
import { mandarAPapelera } from "@/lib/papelera-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new NextResponse("Archivo no encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createClient();

  // Verificar sesión
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  // Obtener metadata del archivo
  const { data: archivo, error } = await supabase
    .from("archivos")
    .select("id, r2_key, nombre_original, mime, entidad_tipo")
    .eq("id", id)
    .single();

  if (error || !archivo) {
    return new NextResponse("Archivo no encontrado", { status: 404 });
  }

  // Verificar que el usuario tiene al menos acceso de lectura a la sección del archivo.
  // La RLS filtra a nivel de fila, pero no reemplaza el control explícito por sección
  // (ej: tesorería no debe descargar archivos de personal o procesos).
  if (!await puedeVerEntidad(archivo.entidad_tipo as string)) {
    return new NextResponse("Acceso denegado", { status: 403 });
  }

  // Generar URL firmada (válida 1 hora)
  const signedUrl = await getDownloadUrl(archivo.r2_key, 300);

  // Redirigir al navegador directamente a R2
  return NextResponse.redirect(signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError("Archivo no encontrado", 404);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("No autorizado", 401);


  const { data: archivo, error } = await supabase
    .from("archivos")
    .select("id, r2_key, entidad_tipo, entidad_id, nombre_original, ruta_origen")
    .eq("id", id)
    .maybeSingle();

  if (error || !archivo) return jsonError("Archivo no encontrado", 404);
  if (!await puedeAdministrarEntidad(archivo.entidad_tipo) || !await puedeAdministrarEntidad("documento")) return jsonError("No tienes permiso para eliminar archivos", 403);

  // Baja reversible: la fila se marca y la política "ocultar_eliminados" la
  // esconde. El objeto de R2 no se toca — sólo se borra al purgar desde la
  // papelera, cuando ya nadie puede restaurarlo.
  const baja = await mandarAPapelera(supabase, "archivos", id);
  if (!baja.ok) return jsonError(baja.error, 400);

  if (archivo.ruta_origen === "carga-app") {
    const tabla = TABLA_POR_ENTIDAD[archivo.entidad_tipo as string];
    if (tabla) {
      await registrarEvento(supabase, user.id, {
        tabla,
        registroId: archivo.entidad_id as string,
        accion: "eliminar",
        campo: "archivo",
        valorAnterior: (archivo.nombre_original as string) ?? null,
      });
    }
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
