"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  LECTOR_MAX_FILES_PER_CHAT,
  type LectorDocument,
  type LectorDocumentSource,
  type LectorMessage,
  type LectorStoredFile,
  type LectorWebSource,
} from "@/lib/lector-ia/types";

export type ChatMode = "standard" | "expert";

export type LectorHistoryEntry = {
  id: string;
  title: string;
  createdAt: number;
  messages: LectorMessage[];
  documents: LectorDocument[];
};

export type LectorLocalUse = {
  documents: number;
  pages: number;
  queries: number;
  ocrUsd: number;
  webSearches: number;
  perplexityUsd: number;
  openaiUsd: number;
  xaiUsd: number;
};

const MISTRAL_OCR_USD_PER_PAGE = 0.004;

function normalizedText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-PE");
}

export function isFileSearchIntent(value: string) {
  const text = normalizedText(value);
  const action = /\b(busca|buscar|buscame|encuentra|encontrar|muestra|muestrame|ubica|ubicar|localiza|localizar|abre|abrir|adjunta|adjuntar)\b/.test(text);
  const target = /\b(archivo|archivos|documento|documentos|pdf|word|docx|contrato|constancia|escritura|partida|expediente|poliza|factura|informe|imagen|foto|csv|txt|markdown|cavala)\b/.test(text);
  return action && target;
}

type LectorConversationState = {
  documents: LectorDocument[];
  setDocuments: Dispatch<SetStateAction<LectorDocument[]>>;
  removeDocument: (id: string) => void;
  messages: LectorMessage[];
  mode: ChatMode;
  setMode: Dispatch<SetStateAction<ChatMode>>;
  webSearch: boolean;
  setWebSearch: Dispatch<SetStateAction<boolean>>;
  question: string;
  setQuestion: Dispatch<SetStateAction<string>>;
  reading: boolean;
  readingFileId: string | null;
  uploadingFiles: Array<{ id: string; name: string }>;
  answering: boolean;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  notice: string | null;
  setNotice: Dispatch<SetStateAction<string | null>>;
  history: LectorHistoryEntry[];
  localUse: LectorLocalUse;
  abortRef: React.MutableRefObject<AbortController | null>;
  uploadFiles: (files: File[], onSettled?: () => void) => Promise<void>;
  openStoredFile: (file: LectorStoredFile, onSettled?: () => void) => Promise<void>;
  sendQuestion: (prefill?: string, replaceFromIndex?: number) => Promise<void>;
  resetConversation: () => void;
  loadHistory: (entry: LectorHistoryEntry) => void;
  retryMessage: (assistantIndex: number) => void;
};

const LectorConversationContext = createContext<LectorConversationState | null>(null);

export function LectorConversationProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<LectorDocument[]>([]);
  const [messages, setMessages] = useState<LectorMessage[]>([]);
  const [mode, setMode] = useState<ChatMode>("standard");
  const [webSearch, setWebSearch] = useState(false);
  const [question, setQuestion] = useState("");
  const [reading, setReading] = useState(false);
  const [readingFileId, setReadingFileId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<LectorHistoryEntry[]>([]);
  const [localUse, setLocalUse] = useState<LectorLocalUse>({ documents: 0, pages: 0, queries: 0, ocrUsd: 0, webSearches: 0, perplexityUsd: 0, openaiUsd: 0, xaiUsd: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const ocrCache = useRef(new Map<string, LectorDocument[]>());
  const objectUrls = useRef<string[]>([]);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Refs mirroring state so the stable (empty-deps) callbacks below always read
  // the latest value instead of closing over a stale render's state.
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const webSearchRef = useRef(webSearch);
  webSearchRef.current = webSearch;
  const questionRef = useRef(question);
  questionRef.current = question;
  const answeringRef = useRef(answering);
  answeringRef.current = answering;
  const readingRef = useRef(reading);
  readingRef.current = reading;

  async function readResponse(response: Response) {
    const parsed = await response.json().catch(() => ({})) as { error?: string; documents?: LectorDocument[]; warnings?: string[] };
    if (!response.ok) throw new Error(parsed.error || "No se pudieron leer los documentos");
    return { documents: parsed.documents ?? [], warnings: parsed.warnings ?? [] };
  }

  function addDocuments(next: LectorDocument[], counted: LectorDocument[]) {
    setDocuments((current) => [...current, ...next].slice(0, LECTOR_MAX_FILES_PER_CHAT));
    if (counted.length === 0) return;
    setLocalUse((current) => ({
      ...current,
      documents: current.documents + counted.length,
      pages: current.pages + counted.reduce((sum, document) => sum + document.pages.length, 0),
      ocrUsd: current.ocrUsd + counted
        .filter((document) => document.provider === "mistral")
        .reduce((sum, document) => sum + document.pages.length * MISTRAL_OCR_USD_PER_PAGE, 0),
    }));
  }

  const removeDocument = useCallback((id: string) => {
    setDocuments((current) => current.filter((item) => item.id !== id));
  }, []);

  const uploadFiles = useCallback(async (files: File[], onSettled?: () => void) => {
    if (readingRef.current || answeringRef.current) return;
    const capacity = LECTOR_MAX_FILES_PER_CHAT - documentsRef.current.length;
    const selected = files
      .filter((file) => !documentsRef.current.some((document) => document.name === file.name))
      .slice(0, capacity);
    if (selected.length === 0) {
      setError(`Puedes usar hasta ${LECTOR_MAX_FILES_PER_CHAT} archivos por conversación`);
      return;
    }
    const pending = selected.map((file) => ({ id: crypto.randomUUID(), name: file.name }));
    setUploadingFiles(pending);
    setReading(true);
    setError(null);
    setNotice(null);
    try {
      const loadingStartedAt = performance.now();
      const cacheKey = (file: File) => `upload:${file.name}:${file.size}:${file.lastModified}`;
      const freshFiles = selected.filter((file) => !ocrCache.current.has(cacheKey(file)));
      let freshDocuments: LectorDocument[] = [];
      if (freshFiles.length > 0) {
        const form = new FormData();
        freshFiles.forEach((file) => form.append("files", file));
        const result = await readResponse(await fetch("/api/lector-ia/ocr", { method: "POST", body: form }));
        const readDocuments = result.documents;
        if (result.warnings.length > 0) setNotice(result.warnings.join(" "));
        const unmatched = [...freshFiles];
        freshDocuments = readDocuments.flatMap((document) => {
          const fileIndex = unmatched.findIndex((file) => file.name === document.name);
          if (fileIndex < 0) return [];
          const [sourceFile] = unmatched.splice(fileIndex, 1);
          const sourceUrl = URL.createObjectURL(sourceFile);
          objectUrls.current.push(sourceUrl);
          const enriched = { ...document, sourceUrl };
          ocrCache.current.set(cacheKey(sourceFile), [enriched]);
          return [enriched];
        });
      }
      const nextDocuments = selected.flatMap((file) => ocrCache.current.get(cacheKey(file)) ?? []);
      const minimumLoadingTime = 300 - (performance.now() - loadingStartedAt);
      if (minimumLoadingTime > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, minimumLoadingTime));
      }
      addDocuments(nextDocuments, freshDocuments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron leer los documentos");
    } finally {
      setReading(false);
      setUploadingFiles([]);
      onSettled?.();
    }
  }, []);

  const openStoredFile = useCallback(async (file: LectorStoredFile, onSettled?: () => void) => {
    if (documentsRef.current.some((document) => document.name === file.name)) {
      setError("Ese archivo ya está en la conversación");
      return;
    }
    if (documentsRef.current.length >= LECTOR_MAX_FILES_PER_CHAT) {
      setError("Retira un archivo antes de agregar otro");
      return;
    }
    const cacheKey = `stored:${file.id}`;
    const cached = ocrCache.current.get(cacheKey);
    if (cached) {
      addDocuments(cached, []);
      onSettled?.();
      return;
    }
    setReading(true);
    setReadingFileId(file.id);
    setError(null);
    setNotice(null);
    try {
      const result = await readResponse(await fetch("/api/lector-ia/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivoIds: [file.id] }),
      }));
      const next = result.documents;
      if (result.warnings.length > 0) setNotice(result.warnings.join(" "));
      ocrCache.current.set(cacheKey, next);
      addDocuments(next, next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer el documento");
    } finally {
      setReading(false);
      setReadingFileId(null);
      onSettled?.();
    }
  }, []);

  const searchFilesFromChat = useCallback(async (text: string, baseMessages: LectorMessage[]) => {
    const userMessage: LectorMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    setMessages([...baseMessages, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setQuestion("");
    setAnswering(true);
    setError(null);
    try {
      const response = await fetch("/api/lector-ia/files/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const parsed = await response.json().catch(() => ({})) as { error?: string; files?: LectorStoredFile[] };
      if (!response.ok) throw new Error(parsed.error || "No se pudieron buscar archivos");
      const files = parsed.files ?? [];
      setMessages((current) => current.map((message) => message.id === assistantId
        ? {
            ...message,
            content: files.length > 0
              ? "Encontré estos archivos en Cavala. Selecciona uno para añadirlo a esta conversación."
              : "No encontré archivos coincidentes. Prueba con parte del nombre, el tipo de documento o su tema.",
            fileResults: files,
          }
        : message));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudieron buscar archivos";
      setError(message);
      setMessages((current) => current.map((item) => item.id === assistantId
        ? { ...item, content: "No pude buscar los archivos en este momento." }
        : item));
    } finally {
      setAnswering(false);
    }
  }, []);

  const sendQuestion = useCallback(async (prefill?: string, replaceFromIndex?: number) => {
    const text = (prefill ?? questionRef.current).trim();
    if (!text || answeringRef.current) return;
    const baseMessages = replaceFromIndex === undefined ? messagesRef.current : messagesRef.current.slice(0, replaceFromIndex);

    if (!webSearchRef.current && isFileSearchIntent(text)) {
      await searchFilesFromChat(text, baseMessages);
      return;
    }
    const userMessage: LectorMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    setMessages([...baseMessages, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setQuestion("");
    setAnswering(true);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/lector-ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          messages: baseMessages,
          documents: documentsRef.current.map((document) => ({ ...document, sourceUrl: undefined })),
          mode: modeRef.current,
          webSearch: webSearchRef.current,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const parsed = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(parsed.error || "No se pudo generar la respuesta");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let queryCounted = false;
      let webCounted = false;
      const processEvent = async (event: string) => {
        const dataLine = event.split(/\r?\n/).find((line) => line.startsWith("data:"));
        if (!dataLine) return;
        const payload = JSON.parse(dataLine.slice(5).trim()) as { type: string; text?: string; error?: string; sources?: LectorWebSource[]; documentSources?: LectorDocumentSource[]; queries?: number; webSearches?: number; perplexityUsd?: number; provider?: string; costUsd?: number; truncated?: boolean };
        if (payload.type === "sources" && payload.sources) {
          setMessages((current) => current.map((message) => message.id === assistantId
            ? { ...message, sources: payload.sources }
            : message));
        }
        if (payload.type === "document_sources" && payload.documentSources) {
          setMessages((current) => current.map((message) => message.id === assistantId
            ? { ...message, documentSources: payload.documentSources }
            : message));
        }
        if (payload.type === "usage" && !webCounted && payload.webSearches) {
          webCounted = true;
          setLocalUse((current) => ({
            ...current,
            webSearches: current.webSearches + (payload.webSearches ?? 0),
            perplexityUsd: current.perplexityUsd + (payload.perplexityUsd ?? 0),
          }));
        }
        if (payload.type === "delta" && payload.text) {
          setMessages((current) => current.map((message) => message.id === assistantId
            ? { ...message, content: message.content + payload.text }
            : message));
        }
        if (payload.type === "error") throw new Error(payload.error || "La respuesta se interrumpió");
        if (payload.type === "done" && !queryCounted) {
          queryCounted = true;
          setLocalUse((current) => ({
            ...current,
            queries: current.queries + (payload.queries ?? 1),
            openaiUsd: current.openaiUsd + (payload.provider === "openai" ? (payload.costUsd ?? 0) : 0),
            xaiUsd: current.xaiUsd + (payload.provider === "xai" ? (payload.costUsd ?? 0) : 0),
          }));
          setMessages((current) => current.map((message) => message.id === assistantId
            ? { ...message, truncated: payload.truncated === true }
            : message));
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim()) await processEvent(buffer);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) await processEvent(event);
      }
      if (!queryCounted) throw new Error("La conexión se cerró antes de completar la respuesta. Puedes reintentar.");
    } catch (cause) {
      if ((cause as Error)?.name === "AbortError") {
        setMessages((current) => current.map((item) => item.id === assistantId && !item.content
          ? { ...item, content: "Respuesta detenida." }
          : item));
      } else {
        const message = cause instanceof Error ? cause.message : "No se pudo generar la respuesta";
        setError(message);
        setMessages((current) => current.map((item) => item.id === assistantId && !item.content
          ? { ...item, content: "No pude responder en este momento." }
          : item));
      }
    } finally {
      abortRef.current = null;
      setAnswering(false);
    }
  }, [searchFilesFromChat]);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    const currentMessages = messagesRef.current;
    const currentDocuments = documentsRef.current;
    if (currentMessages.length > 0) {
      const firstQuestion = currentMessages.find((message) => message.role === "user")?.content.trim();
      setHistory((current) => [{
        id: crypto.randomUUID(),
        title: firstQuestion?.slice(0, 60) || "Conversación sin título",
        createdAt: Date.now(),
        messages: currentMessages,
        documents: currentDocuments,
      }, ...current].slice(0, 20));
    }
    setDocuments([]);
    setMessages([]);
    setQuestion("");
    setError(null);
    setNotice(null);
    setWebSearch(false);
  }, []);

  const loadHistory = useCallback((entry: LectorHistoryEntry) => {
    abortRef.current?.abort();
    setMessages(entry.messages);
    setDocuments(entry.documents);
    setError(null);
  }, []);

  const retryMessage = useCallback((assistantIndex: number) => {
    const current = messagesRef.current;
    let userIndex = assistantIndex - 1;
    while (userIndex >= 0 && current[userIndex]?.role !== "user") userIndex -= 1;
    const text = userIndex >= 0 ? current[userIndex]?.content : "";
    if (text) void sendQuestion(text, userIndex);
  }, [sendQuestion]);

  const value = useMemo<LectorConversationState>(() => ({
    documents,
    setDocuments,
    removeDocument,
    messages,
    mode,
    setMode,
    webSearch,
    setWebSearch,
    question,
    setQuestion,
    reading,
    readingFileId,
    uploadingFiles,
    answering,
    error,
    setError,
    notice,
    setNotice,
    history,
    localUse,
    abortRef,
    uploadFiles,
    openStoredFile,
    sendQuestion,
    resetConversation,
    loadHistory,
    retryMessage,
  }), [documents, removeDocument, messages, mode, webSearch, question, reading, readingFileId, uploadingFiles, answering, error, notice, history, localUse, uploadFiles, openStoredFile, sendQuestion, resetConversation, loadHistory, retryMessage]);

  return <LectorConversationContext.Provider value={value}>{children}</LectorConversationContext.Provider>;
}

export function useLectorConversation() {
  const context = useContext(LectorConversationContext);
  if (!context) throw new Error("useLectorConversation debe usarse dentro de LectorConversationProvider");
  return context;
}
