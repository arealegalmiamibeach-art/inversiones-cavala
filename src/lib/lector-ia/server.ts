import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioSesion } from "@/lib/auth/perfil";
import { createClient } from "@/lib/supabase/server";
import { getUsuario } from "@/lib/auth/perfil";
import { limaMonthWindow } from "@/lib/lector-ia/month";
import { resolveLectorEntityNames } from "@/lib/lector-ia/entity-names";
import { LECTOR_MAX_FILE_BYTES, type LectorAccessState, type LectorStoredFile } from "@/lib/lector-ia/types";

type AccessRow = {
  usuario_id: string;
  activo: boolean;
  inicia_en: string;
  termina_en: string;
  max_documentos: number;
  max_paginas: number;
  max_consultas: number;
  max_openai_usd: number | string;
  max_xai_usd: number | string;
  max_ocr_usd: number | string;
  max_busquedas_web: number;
  max_perplexity_usd: number | string;
};

type UsageRow = {
  proveedor: string;
  documentos: number;
  paginas: number;
  consultas: number;
  busquedas: number;
  costo_estimado_usd: number | string;
  creado_en: string;
};

type StoredFileRow = {
  id: string;
  nombre_original: string;
  mime: string | null;
  tamano_bytes: number;
  subido_en: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  ruta_origen: string | null;
};

export type LectorSession = {
  user: UsuarioSesion;
  supabase: SupabaseClient;
  access: LectorAccessState;
};

function number(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activeNow(row: AccessRow) {
  const now = Date.now();
  return row.activo && new Date(row.inicia_en).getTime() <= now && new Date(row.termina_en).getTime() >= now;
}

async function readState(supabase: SupabaseClient, userId: string): Promise<LectorAccessState | null> {
  const { data: access, error: accessError } = await supabase
    .from("lector_ia_accesos")
    .select("usuario_id, activo, inicia_en, termina_en, max_documentos, max_paginas, max_consultas, max_openai_usd, max_xai_usd, max_ocr_usd, max_busquedas_web, max_perplexity_usd")
    .eq("usuario_id", userId)
    .maybeSingle();

  if (accessError || !access || !activeNow(access as AccessRow)) return null;

  const { data: usage, error: usageError } = await supabase
    .from("lector_ia_uso")
    .select("proveedor, documentos, paginas, consultas, busquedas, costo_estimado_usd, creado_en")
    .eq("usuario_id", userId)
    .gte("creado_en", (access as AccessRow).inicia_en);

  if (usageError) return null;

  const used = {
    documents: 0,
    pages: 0,
    queries: 0,
    openaiUsd: 0,
    xaiUsd: 0,
    ocrUsd: 0,
    ocrMonthlyUsd: 0,
    webSearches: 0,
    perplexityUsd: 0,
  };

  const monthStart = limaMonthWindow().start.getTime();

  for (const row of (usage ?? []) as UsageRow[]) {
    used.documents += number(row.documentos);
    used.pages += number(row.paginas);
    used.queries += number(row.consultas);
    const cost = number(row.costo_estimado_usd);
    if (row.proveedor === "openai") used.openaiUsd += cost;
    if (row.proveedor === "xai") used.xaiUsd += cost;
    if (row.proveedor === "mistral") {
      used.ocrUsd += cost;
      if (new Date(row.creado_en).getTime() >= monthStart) used.ocrMonthlyUsd += cost;
    }
    if (row.proveedor === "perplexity") {
      used.webSearches += number(row.busquedas);
      used.perplexityUsd += cost;
    }
  }

  const row = access as AccessRow;
  return {
    endsAt: row.termina_en,
    limits: {
      documents: row.max_documentos,
      pages: row.max_paginas,
      queries: row.max_consultas,
      openaiUsd: number(row.max_openai_usd),
      xaiUsd: number(row.max_xai_usd),
      ocrUsd: number(row.max_ocr_usd),
      webSearches: row.max_busquedas_web,
      perplexityUsd: number(row.max_perplexity_usd),
    },
    used,
  };
}

export const getLectorSession = cache(async (): Promise<LectorSession | null> => {
  const user = await getUsuario();
  if (!user) return null;
  const supabase = await createClient();
  const access = await readState(supabase, user.id);
  return access ? { user, supabase, access } : null;
});

export async function registrarUso(
  supabase: SupabaseClient,
  input: {
    tipo: "ocr" | "consulta" | "fallback" | "busqueda";
    provider: "local" | "mistral" | "cerebras" | "groq" | "openai" | "xai" | "perplexity";
    model: string;
    documents?: number;
    pages?: number;
    queries?: number;
    estimatedUsd?: number;
  }
) {
  const { data, error } = await supabase.rpc("registrar_uso_lector_ia", {
    p_tipo: input.tipo,
    p_proveedor: input.provider,
    p_modelo: input.model,
    p_documentos: input.documents ?? 0,
    p_paginas: input.pages ?? 0,
    p_consultas: input.queries ?? 0,
    p_costo_estimado_usd: input.estimatedUsd ?? 0,
  });
  if (error) throw new Error(error.message || "Se alcanzó el límite del preview");
  return data;
}

type ReservationInput = {
  tipo: "ocr" | "consulta" | "fallback" | "busqueda";
  provider: "local" | "mistral" | "groq" | "openai" | "xai" | "perplexity";
  model: string;
  documents?: number;
  pages?: number;
  queries?: number;
  webSearches?: number;
  estimatedUsd?: number;
};

export async function reserveLectorUsage(supabase: SupabaseClient, input: ReservationInput) {
  const { data, error } = await supabase.rpc("reservar_uso_lector_ia", {
    p_tipo: input.tipo,
    p_proveedor: input.provider,
    p_modelo: input.model,
    p_documentos: input.documents ?? 0,
    p_paginas: input.pages ?? 0,
    p_consultas: input.queries ?? 0,
    p_busquedas: input.webSearches ?? 0,
    p_costo_estimado_usd: input.estimatedUsd ?? 0,
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "Se alcanzó el límite del preview");
  return data;
}

export async function finalizeLectorUsage(supabase: SupabaseClient, reservationId: string, actual: Omit<ReservationInput, "tipo" | "provider" | "model">) {
  const { error } = await supabase.rpc("finalizar_uso_lector_ia", {
    p_reserva_id: reservationId,
    p_documentos: actual.documents ?? 0,
    p_paginas: actual.pages ?? 0,
    p_consultas: actual.queries ?? 0,
    p_busquedas: actual.webSearches ?? 0,
    p_costo_estimado_usd: actual.estimatedUsd ?? 0,
  });
  if (error) throw new Error(error.message || "No se pudo confirmar el uso");
}

export async function cancelLectorUsage(supabase: SupabaseClient, reservationId: string) {
  const { error } = await supabase.rpc("cancelar_reserva_lector_ia", { p_reserva_id: reservationId });
  if (error) throw new Error(error.message || "No se pudo liberar la reserva");
}

export async function requireLectorSession(): Promise<LectorSession> {
  const session = await getLectorSession();
  if (!session) throw new Error("LECTOR_IA_FORBIDDEN");
  return session;
}

/** Lo que el Lector puede abrir: formato soportado y dentro de su tope (más bajo que el de subida). */
function lectorPuedeLeer(file: StoredFileRow) {
  return file.tamano_bytes > 0 && file.tamano_bytes <= LECTOR_MAX_FILE_BYTES && supportedLectorFile(file.nombre_original, file.mime);
}

function supportedLectorFile(name: string, mime: string | null) {
  if (mime && [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "text/csv",
    "image/png",
    "image/jpeg",
    "image/webp",
  ].includes(mime)) return true;
  return /\.(pdf|docx|txt|md|csv|png|jpe?g|webp)$/i.test(name);
}

function cleanSearchText(value: string | null | undefined) {
  return (value ?? "").replace(/[\\/_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function storedFile(row: StoredFileRow, entityName?: string): LectorStoredFile {
  const origin = cleanSearchText(row.ruta_origen).slice(0, 220);
  const entity = cleanSearchText(row.entidad_tipo);
  const label = cleanSearchText(entityName);
  return {
    id: row.id,
    name: row.nombre_original,
    mime: row.mime,
    bytes: row.tamano_bytes,
    uploadedAt: row.subido_en,
    context: [entity, label, origin].filter(Boolean).join(" · "),
  };
}

function entityNameFor(row: StoredFileRow, names: Map<string, string>) {
  if (!row.entidad_tipo || !row.entidad_id) return undefined;
  return names.get(`${row.entidad_tipo}:${row.entidad_id}`);
}

function normalizedSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-PE").replace(/[^a-z0-9]+/g, " ").trim();
}

const FILE_SEARCH_STOP = new Set([
  "abre", "adjunta", "archivo", "archivos", "busca", "buscar", "buscame", "documento", "documentos",
  "encuentra", "localiza", "muestra", "muestrame", "necesito", "quiero", "ubica", "un", "una", "el", "la",
  "los", "las", "de", "del", "sobre", "para", "por", "en", "pdf", "word",
]);

const RELATED_FILE_TERMS: Record<string, string[]> = {
  alquiler: ["arrendamiento", "renta"],
  arrendamiento: ["alquiler", "renta", "arrendatario"],
  inmueble: ["predio", "propiedad", "terreno", "partida"],
  propiedad: ["predio", "inmueble", "terreno", "partida"],
  terreno: ["predio", "inmueble", "propiedad"],
  posesion: ["constancia", "municipal", "predio"],
  vehiculo: ["placa", "soat", "poliza", "tarjeta"],
  trabajador: ["personal", "laboral", "contrato"],
  juicio: ["proceso", "expediente", "judicial"],
  mina: ["minera", "concesion", "codigo"],
};

function fileSearchScore(row: StoredFileRow, query: string, entityName?: string) {
  const normalizedQuery = normalizedSearch(query);
  const originalTerms = normalizedQuery.split(" ").filter((term) => term.length > 1 && !FILE_SEARCH_STOP.has(term));
  if (originalTerms.length === 0) return 0;
  const name = normalizedSearch(row.nombre_original.replace(/\.[^.]+$/, ""));
  const context = normalizedSearch(`${row.entidad_tipo ?? ""} ${entityName ?? ""} ${row.ruta_origen ?? ""}`);
  let score = 0;
  const phrase = originalTerms.join(" ");
  if (phrase.length > 2 && name.includes(phrase)) score += 24;
  if (phrase.length > 2 && context.includes(phrase)) score += 10;
  for (const term of originalTerms) {
    const stem = term.slice(0, Math.max(4, term.length - 2));
    if (name.includes(term)) score += 8;
    else if (stem.length >= 4 && name.split(" ").some((word) => word.startsWith(stem))) score += 5;
    if (context.includes(term)) score += 4;
    else if (stem.length >= 4 && context.split(" ").some((word) => word.startsWith(stem))) score += 2;
    for (const related of RELATED_FILE_TERMS[term] ?? []) {
      if (name.includes(related)) score += 2;
      if (context.includes(related)) score += 1;
    }
  }
  return score;
}

const STORED_FILE_SELECT = "id, nombre_original, mime, tamano_bytes, subido_en, entidad_tipo, entidad_id, ruta_origen";

export async function getLectorStoredFiles(supabase: SupabaseClient): Promise<LectorStoredFile[]> {
  const { data } = await supabase
    .from("archivos")
    .select(STORED_FILE_SELECT)
    .order("subido_en", { ascending: false })
    .limit(120);

  const rows = ((data ?? []) as StoredFileRow[]).filter(lectorPuedeLeer);
  const names = await resolveLectorEntityNames(supabase, rows);
  return rows.map((row) => storedFile(row, entityNameFor(row, names)));
}

async function allLectorStoredFileRows(supabase: SupabaseClient) {
  const pageSize = 1_000;
  const maxRows = 5_000;
  const first = await supabase
    .from("archivos")
    .select(STORED_FILE_SELECT, { count: "exact" })
    .order("subido_en", { ascending: false })
    .range(0, pageSize - 1);
  if (first.error) throw new Error("No se pudo buscar en los archivos de Cavala");

  const total = Math.min(first.count ?? first.data?.length ?? 0, maxRows);
  const offsets = Array.from({ length: Math.max(0, Math.ceil(total / pageSize) - 1) }, (_, index) => (index + 1) * pageSize);
  const rest = await Promise.all(offsets.map((offset) => supabase
    .from("archivos")
    .select(STORED_FILE_SELECT)
    .order("subido_en", { ascending: false })
    .range(offset, Math.min(total, offset + pageSize) - 1)));
  if (rest.some((result) => result.error)) throw new Error("No se pudo buscar en los archivos de Cavala");
  return [first.data ?? [], ...rest.map((result) => result.data ?? [])].flat() as StoredFileRow[];
}

export type LectorFileBrowse = {
  query?: string;
  type?: "all" | "pdf" | "word" | "image" | "text";
  entity?: string;
  date?: "all" | "30d" | "year";
  limit?: number;
};

function storedFileType(file: StoredFileRow): Exclude<NonNullable<LectorFileBrowse["type"]>, "all"> {
  const mime = file.mime ?? "";
  const name = file.nombre_original.toLocaleLowerCase("es-PE");
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || name.endsWith(".docx")) return "word";
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(name)) return "image";
  return "text";
}

export async function browseLectorStoredFiles(supabase: SupabaseClient, options: LectorFileBrowse = {}) {
  const rows = (await allLectorStoredFileRows(supabase)).filter(lectorPuedeLeer);
  const names = await resolveLectorEntityNames(supabase, rows);
  const entities = Array.from(new Set(rows.map((file) => cleanSearchText(file.entidad_tipo)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es-PE"));
  const type = options.type ?? "all";
  const entity = cleanSearchText(options.entity === "all" ? "" : options.entity);
  const date = options.date ?? "all";
  const now = Date.now();
  const filtered = rows
    .filter((file) => type === "all" || storedFileType(file) === type)
    .filter((file) => !entity || cleanSearchText(file.entidad_tipo) === entity)
    .filter((file) => {
      if (date === "all") return true;
      const uploadedAt = new Date(file.subido_en ?? 0).getTime();
      const age = date === "30d" ? 30 * 86_400_000 : 365 * 86_400_000;
      return Number.isFinite(uploadedAt) && now - uploadedAt <= age;
    });
  const query = options.query?.trim() ?? "";
  const ranked = query
    ? filtered.map((file) => ({ file, score: fileSearchScore(file, query, entityNameFor(file, names)) })).filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.file.subido_en ?? 0).getTime() - new Date(a.file.subido_en ?? 0).getTime())
      .map(({ file }) => file)
    : filtered;
  return { files: ranked.slice(0, Math.min(50, Math.max(1, options.limit ?? 30))).map((file) => storedFile(file, entityNameFor(file, names))), entities, total: ranked.length };
}

export async function searchLectorStoredFiles(supabase: SupabaseClient, query: string, limit = 8): Promise<LectorStoredFile[]> {
  return (await browseLectorStoredFiles(supabase, { query, limit })).files;
}
