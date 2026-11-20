export type StreamOutcome = "complete" | "length" | "interrupted" | "failed";
export type TokenUsage = { inputTokens: number; outputTokens: number };

type RawUsage = { input_tokens?: unknown; output_tokens?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };

function tokenUsage(format: "chat" | "responses", event: { response?: { usage?: RawUsage | null }; usage?: RawUsage | null }): TokenUsage | null {
  const usage = format === "responses" ? event.response?.usage : event.usage;
  if (!usage || typeof usage !== "object") return null;
  const input = Number(format === "responses" ? usage.input_tokens : usage.prompt_tokens);
  const total = Number(usage.total_tokens);
  const output = Number(format === "responses" ? usage.output_tokens : usage.completion_tokens);
  if (!Number.isFinite(input)) return null;
  // xAI reports reasoning tokens outside completion_tokens; total - input covers both conventions.
  const billedOutput = Math.max(Number.isFinite(output) ? output : 0, Number.isFinite(total) ? total - input : 0);
  return { inputTokens: input, outputTokens: billedOutput };
}

/** A closed socket is not evidence that the model completed its answer. */
export async function consumeProviderStream(
  body: ReadableStream<Uint8Array>,
  format: "chat" | "responses",
  onText: (text: string) => void,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
): Promise<StreamOutcome> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: StreamOutcome = "interrupted";
  let hasText = false;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  const forward = (line: string) => {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    const event = JSON.parse(raw);
    const usage = tokenUsage(format, event);
    if (usage) onUsage?.(usage);
    if (event.error || event.type === "error" || event.type === "response.failed") {
      outcome = "failed";
      throw new Error("El proveedor interrumpió la respuesta");
    }
    const text = format === "responses"
      ? event.type === "response.output_text.delta" || event.type === "response.refusal.delta" ? event.delta : ""
      : event.choices?.[0]?.delta?.content;
    if (typeof text === "string" && text) {
      hasText = true;
      onText(text);
    }
    if (format === "responses") {
      if (event.type === "response.completed") outcome = "complete";
      if (event.type === "response.incomplete") {
        outcome = ["max_output_tokens", "max_tokens"].includes(event.response?.incomplete_details?.reason) ? "length" : "failed";
      }
    } else {
      const reason = event.choices?.[0]?.finish_reason;
      if (reason === "stop") outcome = "complete";
      else if (reason === "length") outcome = "length";
      else if (reason) outcome = "failed";
    }
  };
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) forward(line);
    }
    buffer += decoder.decode();
    for (const line of buffer.split(/\r?\n/)) forward(line);
    return hasText ? outcome : "failed";
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
