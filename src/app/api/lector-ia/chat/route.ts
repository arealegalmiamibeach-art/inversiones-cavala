import { verifyLectorDocument } from "@/lib/lector-ia/document-proof";
import { readJsonBody, RequestTooLargeError } from "@/lib/lector-ia/request";
import { cancelLectorUsage, finalizeLectorUsage, reserveLectorUsage, requireLectorSession } from "@/lib/lector-ia/server";
import { selectDocumentContext } from "@/lib/lector-ia/retrieval";
import { consumeProviderStream, type TokenUsage } from "@/lib/lector-ia/stream";
import { EXPERT_OUTPUT_TOKENS, groqChatBody, lectorRequestMessages } from "@/lib/lector-ia/chat-config";
import { lectorProviderError, type LectorProviderFailure } from "@/lib/lector-ia/provider-errors";
import { LECTOR_MAX_FILES_PER_CHAT, type LectorDocument, type LectorDocumentSource, type LectorMessage, type LectorWebSource } from "@/lib/lector-ia/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_QUESTION_CHARS = 3_000;
const MAX_DOCUMENT_CHARS = 550_000;
const STANDARD_CONTEXT_CHARS = 12_000;
const EXPERT_CONTEXT_CHARS = 24_000;
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_PERPLEXITY_MODEL = "sonar";
const PERPLEXITY_RESERVED_USD = 0.01;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Provider = "groq" | "openai" | "xai";
type ChatMode = "standard" | "expert";

type ChatPayload = {
  question?: unknown;
  messages?: unknown;
  documents?: unknown;
  mode?: unknown;
  webSearch?: unknown;
};

function groqModel() {
  return process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

function isSensitiveQuestion(question: string) {
  return /\b(cl[aá]usula|penalidad|indemnizaci[oó]n|exclusividad|confidencialidad|no competencia|jurisdicci[oó]n|rescisi[oó]n|resoluci[oó]n|renovaci[oó]n|poder|facultad|mandato)\b/i.test(question);
}

function providerSequence(question: string, mode: ChatMode): Provider[] {
  const available = {
    groq: Boolean(process.env.GROQ_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    xai: Boolean(process.env.XAI_API_KEY),
  };
  const preferred: Provider[] = mode === "standard"
    ? ["groq"]
    : isSensitiveQuestion(question)
      ? ["xai", "openai"]
      : ["openai", "xai"];
  return preferred.filter((provider) => available[provider]);
}

function validMessages(value: unknown): LectorMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-3).flatMap((message) => {
    if (!message || typeof message !== "object") return [];
    const item = message as Partial<LectorMessage>;
    if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return [];
    return [{ id: typeof item.id === "string" ? item.id : "", role: item.role, content: item.role === "assistant" ? item.content.slice(-1600) : item.content.slice(0, 800) }];
  });
}

function validDocuments(value: unknown, userId: string): LectorDocument[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > LECTOR_MAX_FILES_PER_CHAT) return [];
  const documents: LectorDocument[] = [];
  let totalChars = 0;
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<LectorDocument>;
    if (typeof item.name !== "string" || !Array.isArray(item.pages)) return [];
    const pages = item.pages.slice(0, 150).flatMap((rawPage) => {
      if (!rawPage || typeof rawPage !== "object") return [];
      const page = rawPage as { page?: unknown; markdown?: unknown; confidence?: unknown };
      if (typeof page.page !== "number" || typeof page.markdown !== "string") return [];
      const markdown = page.markdown.slice(0, 60_000);
      totalChars += markdown.length;
      return [{
        page: Math.max(1, Math.floor(page.page)),
        markdown,
        confidence: typeof page.confidence === "number" ? page.confidence : null,
      }];
    });
    const document: LectorDocument = {
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      name: item.name.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").slice(0, 240),
      mime: typeof item.mime === "string" ? item.mime : "application/octet-stream",
      pages,
      provider: item.provider === "local" ? "local" : "mistral",
      model: typeof item.model === "string" ? item.model.slice(0, 120) : "unknown",
      sourceFileId: typeof item.sourceFileId === "string" && UUID_RE.test(item.sourceFileId) ? item.sourceFileId : undefined,
      proof: typeof item.proof === "string" ? item.proof : undefined,
      limited: item.limited === true,
    };
    if (!verifyLectorDocument(document, userId)) return [];
    documents.push(document);
  }
  return totalChars <= MAX_DOCUMENT_CHARS ? documents : [];
}

function safeWebSource(title: unknown, url: unknown): LectorWebSource | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return {
      title: typeof title === "string" && title.trim() ? title.trim().slice(0, 180) : parsed.hostname,
      url: parsed.toString().slice(0, 1_500),
    };
  } catch {
    return null;
  }
}

async function searchWithPerplexity(question: string, signal: AbortSignal) {
  const key = process.env.PERPLEXITY_API_KEY?.trim() || process.env.PERPLEXITY_API?.trim();
  if (!key) throw new Error("Falta configurar la API de Perplexity");
  const model = process.env.PERPLEXITY_SEARCH_MODEL?.trim() || DEFAULT_PERPLEXITY_MODEL;
  const response = await fetch("https://api.perplexity.ai/v1/sonar", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Responde en español y sólo con los resultados encontrados. Si no hay evidencia suficiente, indícalo. Sé conciso." },
        { role: "user", content: question },
      ],
      max_tokens: 700,
      temperature: 0.1,
      search_context_size: "low",
    }),
    signal,
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Perplexity no disponible (${response.status})`);
  const data = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: unknown[];
    search_results?: Array<{ title?: unknown; url?: unknown }>;
    usage?: { cost?: { total_cost?: number } };
  };
  // Perplexity numera sus propias citas inline (p. ej. [1]..[16]) contra un índice que no
  // coincide con nuestra lista FUENTES WEB (deduplicada y recortada a 8). Si se dejan pasar,
  // el modelo final las copia tal cual y produce citas [Web N] fuera de rango.
  const answer = (data.choices?.[0]?.message?.content ?? "")
    .replace(/\[\d{1,2}\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const indexed = (data.search_results ?? []).flatMap((source) => {
    const safe = safeWebSource(source.title, source.url);
    return safe ? [safe] : [];
  });
  const citations = (data.citations ?? []).flatMap((url) => {
    const safe = safeWebSource(undefined, url);
    return safe ? [safe] : [];
  });
  const sources = [...indexed, ...citations]
    .filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index)
    .slice(0, 8);
  if (!answer) throw new Error("Perplexity no devolvió resultados");
  return { answer, sources, model, estimatedUsd: Number(data.usage?.cost?.total_cost ?? 0) };
}

// USD per 1M tokens (gpt-5.6-luna, grok-4.3 under 200K tokens).
const PRICE_PER_MILLION: Record<Provider, { input: number; output: number }> = {
  groq: { input: 0, output: 0 },
  openai: { input: 0.2, output: 1.2 },
  xai: { input: 1.25, output: 2.5 },
};

function usdFor(provider: Provider, inputTokens: number, outputTokens: number) {
  const price = PRICE_PER_MILLION[provider];
  return Number(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(6));
}

function estimateUsd(provider: Provider, inputChars: number) {
  return usdFor(provider, Math.ceil(inputChars / 4), EXPERT_OUTPUT_TOKENS);
}

async function providerRequest(provider: Provider, messages: { role: string; content: string }[], signal: AbortSignal) {
  if (provider === "openai") {
    const model = process.env.OPENAI_CHAT_MODEL || "gpt-5.6-luna";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: messages.find((message) => message.role === "system")?.content,
        input: messages.filter((message) => message.role !== "system"),
        max_output_tokens: EXPERT_OUTPUT_TOKENS,
        store: false,
        stream: true,
      }),
      signal,
    });
    return { response, model, format: "responses" as const };
  }

  const groq = provider === "groq";
  const model = groq
    ? groqModel()
    : process.env.XAI_CHAT_MODEL || "grok-4.3";
  const response = await fetch(groq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groq ? process.env.GROQ_API_KEY : process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(groq ? groqChatBody(model, messages) : {
      model,
      messages,
      stream: true,
      temperature: 0.1,
      max_tokens: EXPERT_OUTPUT_TOKENS,
      reasoning_effort: "low",
      stream_options: { include_usage: true },
    }),
    signal,
  });
  return { response, model, format: "chat" as const };
}

function normalizedStream(
  upstream: Response,
  format: "chat" | "responses",
  provider: Provider,
  model: string,
  sources: LectorWebSource[],
  documentSources: LectorDocumentSource[],
  webUsage: { searches: number; usd: number },
  onSettle: (usage: TokenUsage | null) => Promise<number>,
  signal: AbortSignal,
) {
  const encoder = new TextEncoder();
  const body = upstream.body;
  if (!body) throw new Error("El proveedor no devolvió contenido");
  const streamAbort = new AbortController();
  const combinedSignal = AbortSignal.any([signal, streamAbort.signal]);
  let settled = false;
  let cancelled = false;
  let usage: TokenUsage | null = null;
  let costUsd = 0;
  // Once the provider accepted the request it bills even if the answer is cut or stopped.
  const settle = async () => {
    if (settled) return;
    costUsd = await onSettle(usage);
    settled = true;
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (sources.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`));
        }
        if (documentSources.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "document_sources", documentSources })}\n\n`));
        }
        if (webUsage.searches > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "usage", webSearches: webUsage.searches, perplexityUsd: webUsage.usd })}\n\n`));
        }
        const outcome = await consumeProviderStream(body, format, (text) => {
          if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`));
        }, combinedSignal, (value) => { usage = value; });
        if (outcome === "interrupted" || outcome === "failed") throw new Error("Respuesta sin cierre válido");
        await settle();
        if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", provider, model, queries: 1, costUsd, truncated: outcome === "length" })}\n\n`));
      } catch (error) {
        await settle().catch(() => undefined);
        if (!combinedSignal.aborted) console.error("Lector IA: transmisión interrumpida", { provider, model, error: error instanceof Error ? error.message : "error" });
        if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: "La respuesta se interrumpió. Puedes reintentar." })}\n\n`));
      } finally {
        if (!cancelled) controller.close();
      }
    },
    async cancel() {
      cancelled = true;
      streamAbort.abort();
    },
  });
}

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof requireLectorSession>>;
  try {
    session = await requireLectorSession();
  } catch {
    return Response.json({ error: "Lector IA no habilitado para este usuario" }, { status: 403 });
  }

  let body: ChatPayload;
  try {
    body = await readJsonBody<ChatPayload>(request, MAX_BODY_BYTES);
  } catch (error) {
    return Response.json({ error: error instanceof RequestTooLargeError ? "Solicitud demasiado grande" : "Solicitud inválida" }, { status: error instanceof RequestTooLargeError ? 413 : 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : "";
  const documents = validDocuments(body.documents, session.user.id);
  const history = validMessages(body.messages);
  const mode: ChatMode = body.mode === "expert" ? "expert" : "standard";
  const webSearch = body.webSearch === true;
  if (!question) return Response.json({ error: "Escribe una pregunta" }, { status: 400 });
  if (Array.isArray(body.documents) && body.documents.length > 0 && documents.length === 0) {
    return Response.json({ error: "Los documentos cambiaron o ya no son válidos. Vuelve a adjuntarlos." }, { status: 400 });
  }

  const contextLimit = mode === "standard" ? STANDARD_CONTEXT_CHARS : EXPERT_CONTEXT_CHARS;
  const context = documents.length > 0 ? selectDocumentContext(documents, question, contextLimit) : "";
  if (documents.length > 0 && !context) return Response.json({ error: "Los documentos no contienen texto utilizable" }, { status: 400 });
  const documentSources: LectorDocumentSource[] = Array.from(context.matchAll(/^--- FUENTE: (.+?) \| PÁGINA: (\d+) ---$/gm))
    .map((match) => ({ name: match[1], page: Number(match[2]) }))
    .filter((source, index, all) => all.findIndex((item) => item.name === source.name && item.page === source.page) === index)
    .slice(0, 18);

  let webAnswer = "";
  let webSources: LectorWebSource[] = [];
  let webUsage = { searches: 0, usd: 0 };
  const sequence = providerSequence(question, mode);
  if (sequence.length === 0) {
    return Response.json({ error: mode === "standard" ? "Falta configurar GROQ_API_KEY" : "Falta configurar OPENAI_API_KEY o XAI_API_KEY" }, { status: 503 });
  }
  if (webSearch) {
    let reservationId: string | null = null;
    try {
      const model = process.env.PERPLEXITY_SEARCH_MODEL?.trim() || DEFAULT_PERPLEXITY_MODEL;
      reservationId = await reserveLectorUsage(session.supabase, {
        tipo: "busqueda", provider: "perplexity", model,
        webSearches: 1, estimatedUsd: PERPLEXITY_RESERVED_USD,
      });
      const result = await searchWithPerplexity(question, request.signal);
      webAnswer = result.answer;
      webSources = result.sources;
      const actualUsd = Number(result.estimatedUsd.toFixed(6));
      await finalizeLectorUsage(session.supabase, reservationId, {
        webSearches: 1, estimatedUsd: actualUsd,
      });
      reservationId = null;
      webUsage = { searches: 1, usd: actualUsd };
    } catch (error) {
      if (reservationId) await cancelLectorUsage(session.supabase, reservationId).catch(() => undefined);
      return Response.json({ error: error instanceof Error ? error.message : "No se pudo realizar la búsqueda web" }, { status: 502 });
    }
  }

  const messages = lectorRequestMessages(history, context, question, webAnswer, webSources, mode);
  const failures: string[] = [];
  const providerFailures: LectorProviderFailure[] = [];
  for (let providerIndex = 0; providerIndex < sequence.length; providerIndex += 1) {
    const provider = sequence[providerIndex];
    let reservationId: string | null = null;
    const inputChars = messages.reduce((sum, message) => sum + message.content.length, 0);
    const estimatedUsd = Number(estimateUsd(provider, inputChars).toFixed(6));
    const model = provider === "groq"
      ? groqModel()
      : provider === "openai"
        ? process.env.OPENAI_CHAT_MODEL || "gpt-5.6-luna"
        : process.env.XAI_CHAT_MODEL || "grok-4.3";
    try {
      reservationId = await reserveLectorUsage(session.supabase, {
        tipo: providerIndex > 0 ? "fallback" : "consulta",
        provider,
        model,
        queries: 1,
        estimatedUsd,
      });
      let reservationOpen = true;
      const providerSignal = AbortSignal.any([request.signal, AbortSignal.timeout(115_000)]);
      const upstream = await providerRequest(provider, messages, providerSignal);
      if (!upstream.response.ok || !upstream.response.body) {
        providerFailures.push({ status: upstream.response.status, retryAfter: upstream.response.headers.get("retry-after") });
        const detail = (await upstream.response.text()).slice(0, 300).replace(/[\r\n]+/g, " ");
        failures.push(`${provider}:${upstream.response.status}${detail ? `:${detail}` : ""}`);
        await cancelLectorUsage(session.supabase, reservationId).catch(() => undefined);
        reservationId = null;
        reservationOpen = false;
        continue;
      }
      return new Response(normalizedStream(
        upstream.response,
        upstream.format,
        provider,
        upstream.model,
        webSources,
        documentSources,
        webUsage,
        async (usage) => {
          if (!reservationOpen) return 0;
          const actualUsd = usage ? usdFor(provider, usage.inputTokens, usage.outputTokens) : estimatedUsd;
          await finalizeLectorUsage(session.supabase, reservationId!, { queries: 1, estimatedUsd: actualUsd });
          reservationOpen = false;
          return actualUsd;
        },
        providerSignal,
      ), {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-store",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (reservationId) await cancelLectorUsage(session.supabase, reservationId).catch(() => undefined);
      const message = error instanceof Error ? error.message : "error";
      providerFailures.push({
        timeout: error instanceof Error && (error.name === "TimeoutError" || /gateway timeout/i.test(message)),
        creditExhausted: /crédito .+ agotado/i.test(message),
      });
      failures.push(`${provider}:${message}`);
    }
  }

  console.error("Lector IA: proveedores no disponibles", failures);
  const failure = lectorProviderError(providerFailures);
  return Response.json({ error: failure.error }, { status: failure.status, headers: failure.headers });
}
