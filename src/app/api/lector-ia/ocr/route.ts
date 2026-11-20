import { NextResponse } from "next/server";
import { getDownloadUrl } from "@/lib/r2/client";
import { signLectorDocument } from "@/lib/lector-ia/document-proof";
import { markdownWithInlineTables } from "@/lib/lector-ia/ocr-tables";
import { readJsonBody, readRequestBytes, RequestTooLargeError } from "@/lib/lector-ia/request";
import { cancelLectorUsage, finalizeLectorUsage, reserveLectorUsage, requireLectorSession } from "@/lib/lector-ia/server";
import {
  LECTOR_ACCEPTED_MIMES,
  LECTOR_MAX_FILE_BYTES,
  LECTOR_MAX_FILES_PER_CHAT,
  LECTOR_MAX_PAGES_PER_REQUEST,
  LECTOR_MAX_UPLOAD_BYTES,
  type LectorDocument,
  type LectorPage,
} from "@/lib/lector-ia/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED = new Set<string>(LECTOR_ACCEPTED_MIMES);
const MISTRAL_MODEL = process.env.MISTRAL_OCR_MODEL || "mistral-ocr-4-1";
const configuredPagePrice = Number(process.env.MISTRAL_OCR_USD_PER_PAGE || "0.004");
const MISTRAL_PAGE_PRICE = Number.isFinite(configuredPagePrice) && configuredPagePrice > 0 ? configuredPagePrice : 0.004;
const MAX_MULTIPART_BODY_BYTES = LECTOR_MAX_UPLOAD_BYTES + 256 * 1024;
const MAX_JSON_BODY_BYTES = 16 * 1024;

type MistralPage = {
  index?: number;
  markdown?: string;
  tables?: Array<{
    id?: string;
    content?: string;
  }>;
  confidence_scores?: {
    average_page_confidence_score?: number;
  } | null;
};

type MistralResponse = {
  pages?: MistralPage[];
  model?: string;
};

type InputDocument = {
  name: string;
  mime: string;
  bytes: number;
  sourceFileId?: string;
  dataUrl?: string;
  signedUrl?: string;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function safeName(name: string) {
  return name.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240) || "Documento";
}

function inferMime(name: string, declared?: string | null) {
  if (declared && ALLOWED.has(declared)) return declared;
  const lower = name.toLocaleLowerCase("es-PE");
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return declared || "application/octet-stream";
}

function isLocalText(mime: string) {
  return mime === "text/plain" || mime === "text/markdown" || mime === "text/csv";
}

function textPages(text: string): LectorPage[] {
  const clean = text.replace(/\u0000/g, "").trim();
  if (!clean) return [];
  const explicit = clean.split(/\f+/).map((part) => part.trim()).filter(Boolean);
  const chunks = explicit.length > 1 ? explicit : clean.match(/[\s\S]{1,7000}/g) ?? [];
  return chunks.map((markdown, index) => ({ page: index + 1, markdown, confidence: 1 }));
}

async function readLocalText(input: InputDocument) {
  if (input.dataUrl) {
    const comma = input.dataUrl.indexOf(",");
    if (comma < 0) throw new Error("Archivo de texto inválido");
    return Buffer.from(input.dataUrl.slice(comma + 1), "base64").toString("utf8");
  }
  if (!input.signedUrl) throw new Error("No se pudo abrir el documento");
  const response = await fetch(input.signedUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("No se pudo descargar el documento");
  return response.text();
}

async function mistralOcr(input: InputDocument, maxPages: number): Promise<LectorDocument> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("Falta configurar MISTRAL_API_KEY para leer PDF, Word o imágenes");

  const url = input.dataUrl || input.signedUrl;
  if (!url) throw new Error("No se pudo preparar el documento");
  const image = input.mime.startsWith("image/");

  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      document: image
        ? { type: "image_url", image_url: url }
        : { type: "document_url", document_url: url },
      ...(!image ? { pages: maxPages === 1 ? "0" : `0-${maxPages - 1}` } : {}),
      // null keeps table rows in page.markdown instead of returning only links.
      table_format: null,
      include_blocks: true,
      confidence_scores_granularity: "block",
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    // El cuerpo del proveedor puede traer detalles internos de la cuenta: se
    // registra en el servidor y al usuario sólo le llega el código.
    const detail = (await response.text()).slice(0, 500);
    console.error("Lector IA: el OCR de Mistral falló", { status: response.status, detail });
    throw new Error(`OCR no disponible (${response.status}) para ${input.name}. Intenta de nuevo en unos minutos.`);
  }

  const parsed = await response.json() as MistralResponse;
  const pages: LectorPage[] = (parsed.pages ?? [])
    .map((page, index) => ({
      page: typeof page.index === "number" ? page.index + 1 : index + 1,
      markdown: markdownWithInlineTables(page).slice(0, 60_000),
      confidence: typeof page.confidence_scores?.average_page_confidence_score === "number"
        ? page.confidence_scores.average_page_confidence_score
        : null,
    }))
    .filter((page) => page.markdown.length > 0);

  if (pages.length === 0) throw new Error(`No se detectó texto en ${input.name}`);
  return {
    id: crypto.randomUUID(),
    name: input.name,
    mime: input.mime,
    pages,
    provider: "mistral",
    model: parsed.model || MISTRAL_MODEL,
    sourceFileId: input.sourceFileId,
    limited: !image && pages.length >= maxPages,
  };
}

async function processLocalInput(input: InputDocument): Promise<LectorDocument> {
  const pages = textPages(await readLocalText(input));
  if (pages.length === 0) throw new Error(`No se detectó texto en ${input.name}`);
  return {
    id: crypto.randomUUID(),
    name: input.name,
    mime: input.mime,
    pages,
    provider: "local",
    model: "text-parser-v1",
    sourceFileId: input.sourceFileId,
  };
}

async function inputsFromUpload(request: Request): Promise<InputDocument[]> {
  const contentType = request.headers.get("content-type") ?? "";
  const bytes = await readRequestBytes(request, MAX_MULTIPART_BODY_BYTES);
  const form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0 || files.length > LECTOR_MAX_FILES_PER_CHAT) {
    throw new Error(`Adjunta entre 1 y ${LECTOR_MAX_FILES_PER_CHAT} archivos`);
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > LECTOR_MAX_UPLOAD_BYTES) {
    throw new Error(`La carga supera ${LECTOR_MAX_UPLOAD_BYTES / (1024 * 1024)} MB`);
  }

  return Promise.all(files.map(async (file) => {
    const mime = inferMime(file.name, file.type);
    if (!ALLOWED.has(mime)) throw new Error(`Formato no permitido: ${file.name}`);
    if (file.size <= 0 || file.size > LECTOR_MAX_FILE_BYTES) {
      throw new Error(`${file.name} supera el límite de ${LECTOR_MAX_FILE_BYTES / (1024 * 1024)} MB`);
    }
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { name: safeName(file.name), mime, bytes: file.size, dataUrl: `data:${mime};base64,${data}` };
  }));
}

async function inputsFromCavala(request: Request, session: Awaited<ReturnType<typeof requireLectorSession>>) {
  const body = await readJsonBody<{ archivoIds?: unknown }>(request, MAX_JSON_BODY_BYTES);
  const ids = Array.isArray(body.archivoIds)
    ? body.archivoIds.filter((id): id is string => typeof id === "string" && UUID_RE.test(id))
    : [];
  if (ids.length === 0 || ids.length > LECTOR_MAX_FILES_PER_CHAT) {
    throw new Error(`Selecciona entre 1 y ${LECTOR_MAX_FILES_PER_CHAT} archivos`);
  }

  const unique = Array.from(new Set(ids));
  const { data, error } = await session.supabase
    .from("archivos")
    .select("id, nombre_original, mime, tamano_bytes, r2_key")
    .in("id", unique);
  if (error || !data || data.length !== unique.length) throw new Error("Archivo no encontrado o sin permiso");

  return Promise.all(data.map(async (row) => {
    const mime = inferMime(row.nombre_original, row.mime);
    if (!ALLOWED.has(mime)) throw new Error(`Formato no permitido: ${row.nombre_original}`);
    if (row.tamano_bytes <= 0 || row.tamano_bytes > LECTOR_MAX_FILE_BYTES) {
      throw new Error(`${row.nombre_original} supera el límite de ${LECTOR_MAX_FILE_BYTES / (1024 * 1024)} MB`);
    }
    return {
      name: safeName(row.nombre_original),
      mime,
      bytes: row.tamano_bytes,
      sourceFileId: row.id,
      signedUrl: await getDownloadUrl(row.r2_key, 300),
    } satisfies InputDocument;
  }));
}

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof requireLectorSession>>;
  try {
    session = await requireLectorSession();
  } catch {
    return jsonError("Lector IA no habilitado para este usuario", 403);
  }

  try {
    const remainingDocuments = session.access.limits.documents - session.access.used.documents;
    const remainingPages = session.access.limits.pages - session.access.used.pages;
    if (remainingDocuments <= 0 || remainingPages <= 0) return jsonError("Se alcanzó el cupo del preview", 429);

    const contentType = request.headers.get("content-type")?.toLocaleLowerCase() ?? "";
    const inputs = contentType.startsWith("multipart/form-data")
      ? await inputsFromUpload(request)
      : contentType.startsWith("application/json")
        ? await inputsFromCavala(request, session)
        : [];
    if (inputs.length === 0) return jsonError("Solicitud de documentos inválida", 415);
    if (inputs.length > remainingDocuments) return jsonError("La selección supera el cupo de documentos", 429);

    const documents: LectorDocument[] = [];
    const warnings: string[] = [];
    let requestPages = 0;
    let requestOcrUsd = 0;

    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      let reservationId: string | null = null;
      try {
        if (isLocalText(input.mime)) {
          const document = await processLocalInput(input);
          const pages = document.pages.length;
          if (requestPages + pages > Math.min(LECTOR_MAX_PAGES_PER_REQUEST, remainingPages)) {
            throw new Error(`${input.name} supera las páginas disponibles`);
          }
          reservationId = await reserveLectorUsage(session.supabase, {
            tipo: "ocr", provider: "local", model: "text-parser-v1", documents: 1, pages,
          });
          await finalizeLectorUsage(session.supabase, reservationId, { documents: 1, pages });
          reservationId = null;
          requestPages += pages;
          document.proof = signLectorDocument(document, session.user.id);
          documents.push(document);
          continue;
        }

        const remainingInputs = inputs.slice(index + 1).filter((item) => !isLocalText(item.mime)).length;
        const pageBudget = Math.min(
          LECTOR_MAX_PAGES_PER_REQUEST - requestPages,
          remainingPages - requestPages,
          Math.floor((session.access.limits.ocrUsd - session.access.used.ocrMonthlyUsd - requestOcrUsd) / MISTRAL_PAGE_PRICE),
        );
        const maxPages = input.mime.startsWith("image/")
          ? Math.min(1, pageBudget - remainingInputs)
          : pageBudget - remainingInputs;
        if (maxPages < 1) throw new Error("Se alcanzó el cupo mensual de lectura");
        const reservedUsd = Number((maxPages * MISTRAL_PAGE_PRICE).toFixed(6));
        reservationId = await reserveLectorUsage(session.supabase, {
          tipo: "ocr", provider: "mistral", model: MISTRAL_MODEL,
          documents: 1, pages: maxPages, estimatedUsd: reservedUsd,
        });
        const document = await mistralOcr(input, maxPages);
        const pages = document.pages.length;
        const actualUsd = Number((pages * MISTRAL_PAGE_PRICE).toFixed(6));
        await finalizeLectorUsage(session.supabase, reservationId, {
          documents: 1, pages, estimatedUsd: actualUsd,
        });
        reservationId = null;
        requestPages += pages;
        requestOcrUsd += actualUsd;
        document.proof = signLectorDocument(document, session.user.id);
        documents.push(document);
        if (document.limited) warnings.push(`${input.name}: se cargaron hasta ${pages} páginas por el límite disponible.`);
      } catch (error) {
        if (reservationId) await cancelLectorUsage(session.supabase, reservationId).catch(() => undefined);
        warnings.push(error instanceof Error ? error.message : `No se pudo leer ${input.name}`);
      }
    }

    if (documents.length === 0) throw new Error(warnings[0] || "No se pudieron leer los documentos");
    return NextResponse.json({ documents, warnings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron leer los documentos";
    return jsonError(message, error instanceof RequestTooLargeError ? 413 : /límite|cupo|Crédito/i.test(message) ? 429 : 400);
  }
}
