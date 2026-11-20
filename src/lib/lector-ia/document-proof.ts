import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { LectorDocument } from "@/lib/lector-ia/types";

function signingSecret() {
  const secret = process.env.LECTOR_IA_SIGNING_SECRET;
  if (!secret) throw new Error("Falta configurar LECTOR_IA_SIGNING_SECRET");
  return secret;
}

function payload(document: LectorDocument, userId: string) {
  const pagesHash = createHash("sha256")
    .update(JSON.stringify(document.pages.map((page) => [page.page, page.markdown, page.confidence])))
    .digest("hex");
  return JSON.stringify([
    userId,
    document.id,
    document.name,
    document.mime,
    document.provider,
    document.model,
    document.sourceFileId ?? null,
    document.limited === true,
    pagesHash,
  ]);
}

export function signLectorDocument(document: LectorDocument, userId: string) {
  return createHmac("sha256", signingSecret()).update(payload(document, userId)).digest("base64url");
}

export function verifyLectorDocument(document: LectorDocument, userId: string) {
  if (!document.proof) return false;
  const expected = Buffer.from(signLectorDocument(document, userId));
  const received = Buffer.from(document.proof);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
