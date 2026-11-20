import "server-only";

export class RequestTooLargeError extends Error {}

export async function readRequestBytes(request: Request, maxBytes: number) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("Límite de solicitud inválido");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RequestTooLargeError("Solicitud demasiado grande");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const bytes = await readRequestBytes(request, maxBytes);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
