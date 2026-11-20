"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { TIPOS } from "./tipos";
import { DOCUMENTO_FALLBACK, DOCUMENTO_TIPOS } from "@/lib/relaciones/agrupar";
import {
  mensajeCategoriaEnUso,
  repartirDocumentosDeCategoria,
  type DocumentoDeCategoria,
} from "@/lib/relaciones/baja-categoria";
import { fetchAllRows, fetchAllRowsIn } from "@/lib/supabase/fetch-all";

export type TipoCustom = {
  id: string;
  slug: string;
  nombre: string;
  /** `false` cuando se creó desde el "+" de una ficha de entidad: existe como tipo real pero no se anexa al sidebar. */
  visible_sidebar: boolean;
};

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function getTiposCompletos(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tipos_documento_custom")
    .select("slug, nombre")
    .order("nombre");

  const merged: Record<string, string> = { ...TIPOS };
  for (const tipo of data ?? []) {
    merged[tipo.slug] = tipo.nombre;
  }
  return merged;
}

export async function listarTiposCustom(): Promise<TipoCustom[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tipos_documento_custom")
    .select("id, slug, nombre, visible_sidebar")
    .order("nombre");
  return (data ?? []) as TipoCustom[];
}

export async function crearTipoDocumento(
  nombre: string,
  opciones?: { visibleSidebar?: boolean }
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const permitido = await puedeAdministrarEntidad("documento");
  if (!permitido) return { ok: false, error: "No autorizado" };

  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) return { ok: false, error: "El nombre no puede estar vacío" };
  if (nombreLimpio.length > 120) return { ok: false, error: "El nombre no puede pasar de 120 caracteres" };

  const slug = slugify(nombreLimpio);
  if (!slug) return { ok: false, error: "Nombre inválido" };

  if (slug === "otro") return { ok: false, error: "Ese tipo está reservado por el sistema" };
  if (TIPOS[slug]) return { ok: false, error: "Ese tipo ya existe como predefinido" };
  // La clave interna de un tipo predefinido no siempre coincide con el
  // título que se le muestra al usuario (p. ej. "minuta" se ve como
  // "Minutas" en el panel). El check de arriba sólo cubre la clave; este
  // cubre el título, que es lo que la persona realmente ve y escribe.
  if (DOCUMENTO_TIPOS.some((d) => slugify(d.titulo) === slug)) {
    return { ok: false, error: "Ese tipo ya existe como predefinido" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tipos_documento_custom")
    .insert({ slug, nombre: nombreLimpio, visible_sidebar: opciones?.visibleSidebar ?? true });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ese tipo ya existe" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/documentos");
  revalidatePath("/documentos/tipos");
  revalidatePath("/entidades/propietarios");
  return { ok: true, slug };
}

export async function eliminarTipoDocumento(id: string): Promise<{ ok: boolean; error?: string }> {
  const permitido = await puedeAdministrarEntidad("documento");
  if (!permitido) return { ok: false, error: "No autorizado" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false, error: "Tipo de documento inválido" };
  }

  const supabase = await createClient();
  const { data: tipo, error: errorTipo } = await supabase
    .from("tipos_documento_custom")
    .select("id, slug, nombre")
    .eq("id", id)
    .maybeSingle();

  if (errorTipo) return { ok: false, error: errorTipo.message };
  if (!tipo) return { ok: false, error: "La categoría ya no existe" };

  // La categoría es global: no debe desaparecer si todavía hay un documento
  // activo colgando de alguna ficha. Los que ya están en la papelera no
  // bloquean, y tampoco los que quedaron sueltos (sin ficha que los muestre):
  // esos no se pueden ver desde ninguna ficha, así que bloquear por ellos deja
  // al usuario sin cómo destrabar la baja.
  const { data: documentos, error: errorDocumentos } = await fetchAllRows<DocumentoDeCategoria>((from, to) =>
    supabase
      .from("documentos")
      .select("id, nombre")
      .eq("tipo", tipo.slug)
      .is("eliminado_en", null)
      .order("id")
      .range(from, to)
  );
  if (errorDocumentos) return { ok: false, error: errorDocumentos.message };

  const ids = (documentos ?? []).map((documento) => documento.id);
  const idsConFicha = new Set<string>();
  if (ids.length > 0) {
    const [comoOrigen, comoDestino] = await Promise.all([
      fetchAllRowsIn<{ origen_id: string }>(ids, (lote, from, to) =>
        supabase
          .from("vinculos")
          .select("origen_id")
          .eq("origen_tipo", "documento")
          .in("origen_id", lote)
          .order("id")
          .range(from, to)
      ),
      fetchAllRowsIn<{ destino_id: string }>(ids, (lote, from, to) =>
        supabase
          .from("vinculos")
          .select("destino_id")
          .eq("destino_tipo", "documento")
          .in("destino_id", lote)
          .order("id")
          .range(from, to)
      ),
    ]);
    if (comoOrigen.error) return { ok: false, error: comoOrigen.error.message };
    if (comoDestino.error) return { ok: false, error: comoDestino.error.message };
    for (const fila of comoOrigen.data ?? []) idsConFicha.add(fila.origen_id);
    for (const fila of comoDestino.data ?? []) idsConFicha.add(fila.destino_id);
  }

  const { enFichas, sueltos } = repartirDocumentosDeCategoria(documentos ?? [], idsConFicha);
  if (enFichas.length > 0) return { ok: false, error: mensajeCategoriaEnUso(enFichas) };

  const { data: eliminado, error } = await supabase
    .from("tipos_documento_custom")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!eliminado) return { ok: false, error: "No se pudo eliminar la categoría" };

  // Los sueltos no se pierden ni se mandan a la papelera: pasan a "Otros",
  // igual que una ficha muestra un documento cuyo tipo ya no existe. Es un
  // remate: la categoría ya se borró, así que un fallo aquí no debe reportarse
  // como si la baja hubiera fallado (el documento sigue en Documentos).
  const idsSueltos = sueltos.map((documento) => documento.id);
  for (let i = 0; i < idsSueltos.length; i += 100) {
    await supabase
      .from("documentos")
      .update({ tipo: DOCUMENTO_FALLBACK.tipo })
      .eq("tipo", tipo.slug)
      .in("id", idsSueltos.slice(i, i + 100));
  }

  revalidatePath("/documentos");
  revalidatePath("/documentos/tipos");
  revalidatePath("/entidades/propietarios");
  return { ok: true };
}

/** Cambia sólo el nombre visible: el slug queda igual porque es lo que guardan los documentos en `tipo`. */
export async function renombrarTipoDocumento(id: string, nombre: string): Promise<{ ok: boolean; error?: string }> {
  const permitido = await puedeAdministrarEntidad("documento");
  if (!permitido) return { ok: false, error: "No autorizado" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false, error: "Tipo de documento inválido" };
  }

  const nombreLimpio = nombre.trim().replace(/\s+/g, " ");
  if (!nombreLimpio) return { ok: false, error: "El nombre no puede estar vacío" };
  if (nombreLimpio.length > 120) return { ok: false, error: "El nombre no puede pasar de 120 caracteres" };
  const slug = slugify(nombreLimpio);
  if (TIPOS[slug] || DOCUMENTO_TIPOS.some((d) => slugify(d.titulo) === slug)) {
    return { ok: false, error: "Ese nombre ya lo usa un tipo predefinido" };
  }

  const supabase = await createClient();
  const { data: actualizado, error } = await supabase
    .from("tipos_documento_custom")
    .update({ nombre: nombreLimpio })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!actualizado) return { ok: false, error: "La categoría ya no existe" };
  revalidatePath("/documentos");
  revalidatePath("/documentos/tipos");
  revalidatePath("/entidades/propietarios");
  return { ok: true };
}
