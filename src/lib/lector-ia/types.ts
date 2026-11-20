export const LECTOR_MAX_FILES_PER_CHAT = 3;
export const LECTOR_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const LECTOR_MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
export const LECTOR_MAX_PAGES_PER_REQUEST = 150;

export const LECTOR_ACCEPTED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type LectorPage = {
  page: number;
  markdown: string;
  confidence: number | null;
};

export type LectorDocument = {
  id: string;
  name: string;
  mime: string;
  pages: LectorPage[];
  provider: "local" | "mistral";
  model: string;
  sourceFileId?: string;
  sourceUrl?: string;
  proof?: string;
  limited?: boolean;
};

export type LectorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: LectorWebSource[];
  fileResults?: LectorStoredFile[];
  documentSources?: LectorDocumentSource[];
  truncated?: boolean;
};

export type LectorDocumentSource = {
  name: string;
  page: number;
};

export type LectorWebSource = {
  title: string;
  url: string;
};

export type LectorAccessState = {
  endsAt: string;
  limits: {
    documents: number;
    pages: number;
    queries: number;
    openaiUsd: number;
    xaiUsd: number;
    ocrUsd: number;
    webSearches: number;
    perplexityUsd: number;
  };
  used: {
    documents: number;
    pages: number;
    queries: number;
    openaiUsd: number;
    xaiUsd: number;
    ocrUsd: number;
    ocrMonthlyUsd: number;
    webSearches: number;
    perplexityUsd: number;
  };
};

export type LectorStoredFile = {
  id: string;
  name: string;
  mime: string | null;
  bytes: number;
  uploadedAt: string | null;
  context?: string;
};
