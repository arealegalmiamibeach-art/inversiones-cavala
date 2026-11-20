import type { LectorDocument, LectorWebSource } from "@/lib/lector-ia/types";

function normalizedName(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE")
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function citationDocument(rawName: string, documents: LectorDocument[]) {
  const normalized = normalizedName(rawName);
  const matches = documents.filter((document) => normalizedName(document.name) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

export function linkedDocumentCitations(content: string, documents: LectorDocument[]) {
  return content.replace(/\[([^\]\n]+?),\s*p\.\s*(\d+)\](?!\()/gi, (citation, rawName: string, rawPage: string) => {
    const document = citationDocument(rawName.trim(), documents);
    if (!document) return citation;
    const page = Math.max(1, Number(rawPage));
    if (!document.pages.some((item) => item.page === page)) return citation;
    const href = document.sourceFileId
      ? `/api/archivos/${document.sourceFileId}#page=${page}`
      : document.sourceUrl
        ? `/lector-ia/cita/${encodeURIComponent(document.id)}?page=${page}`
        : null;
    return href ? `[${rawName.trim()}, p. ${page}](${href})` : citation;
  });
}

export function linkedWebCitations(content: string, sources: LectorWebSource[]) {
  if (sources.length === 0) return content;
  return content.replace(/\[Web (\d+)\](?!\()/gi, (citation, rawIndex: string) => {
    const source = sources[Number(rawIndex) - 1];
    return source ? `[Web ${rawIndex}](${source.url})` : citation;
  });
}

export function safeDecodeCitationId(value: string) {
  try { return decodeURIComponent(value); } catch { return ""; }
}
