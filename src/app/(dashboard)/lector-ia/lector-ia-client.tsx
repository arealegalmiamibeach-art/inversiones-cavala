"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Atom,
  Check,
  ChevronDown,
  Copy,
  FileSearch,
  FileText,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ArrowUp,
  Settings,
  Square,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { linkedDocumentCitations, linkedWebCitations, safeDecodeCitationId } from "@/lib/lector-ia/citations";
import { isFileSearchIntent, useLectorConversation, type ChatMode, type LectorHistoryEntry } from "@/lib/lector-ia/conversation-context";
import {
  LECTOR_ACCEPTED_MIMES,
  LECTOR_MAX_FILES_PER_CHAT,
  type LectorAccessState,
  type LectorDocument,
  type LectorMessage,
  type LectorStoredFile,
  type LectorWebSource,
} from "@/lib/lector-ia/types";

type FileTypeFilter = "all" | "pdf" | "word" | "image" | "text";
type FileDateFilter = "all" | "30d" | "year";

const CHAT_MODES: Array<{ id: ChatMode; name: string }> = [
  { id: "standard", name: "Estándar" },
  { id: "expert", name: "Experto" },
];

const SUGGESTIONS = [
  "Resume los puntos principales",
  "¿Cuáles son las fechas importantes?",
  "¿Qué obligaciones tienen las partes?",
  "Compara las diferencias entre los archivos",
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function remaining(value: number, used: number) {
  return Math.max(0, value - used);
}

function AssistantMarkdown({ content, streaming, documents, sources }: { content: string; streaming: boolean; documents: LectorDocument[]; sources?: LectorWebSource[] }) {
  const linkedContent = linkedWebCitations(linkedDocumentCitations(content, documents), sources ?? []);
  return (
    <div className="text-sm leading-6 text-white">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="mb-3 mt-5 text-xl font-semibold text-white first:mt-0" {...props} />,
          h2: (props) => <h2 className="mb-2 mt-5 text-lg font-semibold text-white first:mt-0" {...props} />,
          h3: (props) => <h3 className="mb-2 mt-4 text-base font-semibold text-white first:mt-0" {...props} />,
          p: (props) => <p className="mb-3 last:mb-0" {...props} />,
          ul: (props) => <ul className="mb-3 ml-5 list-disc space-y-1.5 last:mb-0" {...props} />,
          ol: (props) => <ol className="mb-3 ml-5 list-decimal space-y-1.5 last:mb-0" {...props} />,
          li: (props) => <li className="pl-1 marker:text-violet-300" {...props} />,
          strong: (props) => <strong className="font-semibold text-white" {...props} />,
          blockquote: (props) => <blockquote className="my-3 border-l-2 border-violet-400/50 pl-3 text-white/60" {...props} />,
          a: ({ href, ...props }) => {
            const localCitation = href?.match(/^\/lector-ia\/cita\/([^?]+)\?page=(\d+)$/);
            const localDocument = localCitation
              ? documents.find((document) => document.id === safeDecodeCitationId(localCitation[1]))
              : null;
            return <a href={href} className="text-violet-300 underline decoration-violet-400/40 underline-offset-2 hover:text-violet-200" target="_blank" rel="noreferrer" onClick={(event) => {
              if (!localCitation || !localDocument?.sourceUrl) return;
              event.preventDefault();
              window.open(`${localDocument.sourceUrl}#page=${localCitation[2]}`, "_blank", "noopener,noreferrer");
            }} {...props} />;
          },
          code: (props) => <code className="rounded bg-white/[0.08] px-1 py-0.5 text-[0.9em] text-cyan-200" {...props} />,
          pre: (props) => <pre className="my-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs" {...props} />,
          table: (props) => <table className="my-3 w-full border-collapse text-xs" {...props} />,
          th: (props) => <th className="border border-white/[0.12] bg-white/[0.06] px-2 py-1.5 text-left text-white" {...props} />,
          td: (props) => <td className="border border-white/[0.10] px-2 py-1.5 align-top" {...props} />,
        }}
      >
        {linkedContent}
      </ReactMarkdown>
      {streaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-violet-300 align-middle" aria-hidden="true" />}
    </div>
  );
}

function ExpandToFullViewIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="9" width="11" height="10" rx="2" />
      <path d="M9 9V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-4" />
    </svg>
  );
}

export function LectorIaClient({
  access,
  storedFiles,
  compact = false,
  onClose,
}: {
  access: LectorAccessState;
  storedFiles: LectorStoredFile[];
  compact?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const conversation = useLectorConversation();
  const {
    documents,
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
  } = conversation;
  const [filter, setFilter] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>("all");
  const [fileEntityFilter, setFileEntityFilter] = useState("all");
  const [fileDateFilter, setFileDateFilter] = useState<FileDateFilter>("all");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [browserFiles, setBrowserFiles] = useState(storedFiles);
  const [browserEntities, setBrowserEntities] = useState<string[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const modelMenu = useRef<HTMLDivElement>(null);
  const historyMenu = useRef<HTMLDivElement>(null);
  const usageMenu = useRef<HTMLDivElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const messagesScroll = useRef<HTMLDivElement>(null);
  const followStream = useRef(true);
  const lastScrollTop = useRef(0);
  const touchY = useRef<number | null>(null);

  useLayoutEffect(() => {
    const textarea = questionInput.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(160, Math.max(78, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? "auto" : "hidden";
  }, [question]);

  useLayoutEffect(() => {
    const container = messagesScroll.current;
    if (!container || !followStream.current) return;
    container.scrollTop = container.scrollHeight;
    lastScrollTop.current = container.scrollTop;
  }, [answering, messages]);

  useEffect(() => {
    if (!modelOpen && !historyOpen && !usageOpen) return;
    const close = (event: MouseEvent) => {
      if (!modelMenu.current?.contains(event.target as Node)) setModelOpen(false);
      if (!historyMenu.current?.contains(event.target as Node)) setHistoryOpen(false);
      if (!usageMenu.current?.contains(event.target as Node)) setUsageOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [historyOpen, modelOpen, usageOpen]);

  const fileEntities = useMemo(() => Array.from(new Set([...browserEntities, ...storedFiles
    .map((file) => file.context?.split(" · ")[0]?.trim())
    .filter((entity): entity is string => Boolean(entity))]))
    .sort((a, b) => a.localeCompare(b, "es-PE")), [browserEntities, storedFiles]);

  useEffect(() => {
    if (!documentsOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBrowserLoading(true);
      try {
        const response = await fetch("/api/lector-ia/files/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ browse: true, query: filter, type: fileTypeFilter, entity: fileEntityFilter, date: fileDateFilter, limit: 50 }),
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({})) as { files?: LectorStoredFile[]; entities?: string[] };
        if (!response.ok) throw new Error("No se pudieron actualizar los archivos");
        setBrowserFiles(result.files ?? []);
        setBrowserEntities(result.entities ?? []);
      } catch (cause) {
        if ((cause as Error)?.name !== "AbortError") setNotice("No se pudo actualizar el buscador de archivos.");
      } finally {
        if (!controller.signal.aborted) setBrowserLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [documentsOpen, fileDateFilter, fileEntityFilter, fileTypeFilter, filter, setNotice]);

  const visibleFiles = useMemo(() => {
    return browserFiles.slice(0, 30);
  }, [browserFiles]);

  const used = {
    documents: access.used.documents + localUse.documents,
    pages: access.used.pages + localUse.pages,
    queries: access.used.queries + localUse.queries,
    ocrMonthlyUsd: access.used.ocrMonthlyUsd + localUse.ocrUsd,
    webSearches: access.used.webSearches + localUse.webSearches,
    perplexityUsd: access.used.perplexityUsd + localUse.perplexityUsd,
    openaiUsd: access.used.openaiUsd + localUse.openaiUsd,
    xaiUsd: access.used.xaiUsd + localUse.xaiUsd,
  };

  // El modo experto solo se cae cuando SE AGOTAN AMBOS proveedores de respaldo:
  // el % mostrado es el del que todavía tiene más margen, no un promedio.
  const percentOf = (value: number, max: number) => (max > 0 ? Math.min(100, (value / max) * 100) : 100);
  const expertoPercent = Math.min(percentOf(used.openaiUsd, access.limits.openaiUsd), percentOf(used.xaiUsd, access.limits.xaiUsd));

  function uploadFiles(files: File[]) {
    return conversation.uploadFiles(files, () => {
      if (compact) setDocumentsOpen(false);
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  function openStoredFile(file: LectorStoredFile) {
    return conversation.openStoredFile(file, () => {
      if (compact) setDocumentsOpen(false);
    });
  }

  function sendQuestion(prefill?: string, replaceFromIndex?: number) {
    followStream.current = true;
    return conversation.sendQuestion(prefill, replaceFromIndex);
  }

  function resetConversation() {
    conversation.resetConversation();
    setModelOpen(false);
    setHistoryOpen(false);
    followStream.current = true;
  }

  function loadHistory(entry: LectorHistoryEntry) {
    conversation.loadHistory(entry);
    setHistoryOpen(false);
    followStream.current = true;
  }

  function retryMessage(assistantIndex: number) {
    followStream.current = true;
    conversation.retryMessage(assistantIndex);
  }

  function handleMessagesScroll() {
    const container = messagesScroll.current;
    if (!container) return;
    const currentTop = container.scrollTop;
    const distanceFromBottom = container.scrollHeight - currentTop - container.clientHeight;
    if (currentTop < lastScrollTop.current - 1) followStream.current = false;
    else if (distanceFromBottom <= 24) followStream.current = true;
    lastScrollTop.current = currentTop;
  }

  async function copyMessage(message: LectorMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopied(message.id);
    window.setTimeout(() => setCopied(null), 1_500);
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col",
        compact ? "h-full gap-0 p-0" : "gap-3 p-3 sm:p-4 lg:flex-row"
      )}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void uploadFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {dragging && (
        <div className="absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-400/70 bg-[#090b13]/95 backdrop-blur-xl">
          <div className="text-center"><UploadCloud className="mx-auto h-9 w-9 text-brand-300" /><p className="mt-3 text-sm font-semibold text-white">Suelta los archivos para leerlos</p></div>
        </div>
      )}

      <input ref={fileInput} type="file" multiple hidden accept={LECTOR_ACCEPTED_MIMES.join(",")} onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))} />

      {documentsOpen && <aside className="absolute right-2 top-[3.75rem] z-50 flex max-h-[calc(100%-8rem)] w-[calc(100%-1rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-white/[0.10] bg-black/90 text-white shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2"><Settings className="h-4 w-4 text-violet-400" /><span className="text-sm font-semibold">Archivos y uso</span></div>
          <div className="flex items-center gap-1">
            <div
              className="relative"
              ref={usageMenu}
              onMouseEnter={() => setUsageOpen(true)}
              onMouseLeave={() => setUsageOpen(false)}
            >
              <button
                type="button"
                onClick={() => setUsageOpen((value) => !value)}
                className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors", usageOpen ? "bg-violet-500/15 text-violet-300" : "text-white/45 hover:bg-white/[0.06] hover:text-white")}
                aria-label="Límites de uso"
                aria-expanded={usageOpen}
                title="Límites de uso"
              >
                <TrendingUp className="h-4 w-4" />
              </button>
              {usageOpen && (
                <div className="absolute right-0 top-10 z-[110] w-72 space-y-3 rounded-xl border border-white/[0.10] bg-[#111111] p-4 shadow-2xl">
                  <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-400" /><h3 className="text-sm font-semibold text-white">Límites de uso</h3></div>
                  <div className="space-y-3">
                    <Usage label="Modo experto" value={expertoPercent} max={100} />
                    <Usage label="Búsqueda con fuentes" value={used.perplexityUsd} max={access.limits.perplexityUsd} />
                    <Usage label="Lectura de documentos" value={used.ocrMonthlyUsd} max={access.limits.ocrUsd} note="Se renueva cada mes" />
                  </div>
                </div>
              )}
            </div>
            <button type="button" onClick={() => setDocumentsOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.08] hover:text-white" aria-label="Cerrar ajustes"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="border-b border-white/[0.06] p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar por nombre o tema" className="glass-input h-9 pl-8 text-xs" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <select value={fileTypeFilter} onChange={(event) => setFileTypeFilter(event.target.value as FileTypeFilter)} aria-label="Filtrar por formato" className="h-8 min-w-0 rounded-lg border border-white/[0.08] bg-[#111] px-2 text-[10px] text-white/65 outline-none">
              <option value="all">Formato</option><option value="pdf">PDF</option><option value="word">Word</option><option value="image">Imagen</option><option value="text">Texto</option>
            </select>
            <select value={fileEntityFilter} onChange={(event) => setFileEntityFilter(event.target.value)} aria-label="Filtrar por entidad" className="h-8 min-w-0 rounded-lg border border-white/[0.08] bg-[#111] px-2 text-[10px] text-white/65 outline-none">
              <option value="all">Entidad</option>
              {fileEntities.map((entity) => <option key={entity} value={entity}>{entity}</option>)}
            </select>
            <select value={fileDateFilter} onChange={(event) => setFileDateFilter(event.target.value as FileDateFilter)} aria-label="Filtrar por fecha" className="h-8 min-w-0 rounded-lg border border-white/[0.08] bg-[#111] px-2 text-[10px] text-white/65 outline-none">
              <option value="all">Fecha</option><option value="30d">30 días</option><option value="year">1 año</option>
            </select>
          </div>
        </div>
        <div className="scrollbar-glass min-h-0 flex-1 overflow-y-auto p-1.5">
          {browserLoading && <div className="flex items-center gap-2 px-2.5 py-2 text-[10px] text-white/35"><Loader2 className="h-3 w-3 animate-spin" /> Actualizando…</div>}
          {visibleFiles.map((file) => (
            <button key={file.id} type="button" onClick={() => void openStoredFile(file)} disabled={reading || documents.length >= LECTOR_MAX_FILES_PER_CHAT} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-40">
              <FileSearch className="h-3.5 w-3.5 shrink-0 text-white/30" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[11px] text-white/65">{file.name}</span><span className="text-[9px] text-white/30">{formatBytes(file.bytes)}</span></span>
            </button>
          ))}
        </div>
      </aside>}

      <section className={cn(
        "glass-panel flex min-w-0 flex-1 flex-col overflow-hidden",
        compact ? "h-full min-h-0 rounded-none border-0 bg-black/80" : "min-h-[32rem]"
      )}>
        <div className="flex shrink-0 items-center justify-end border-b border-white/[0.08] px-4 py-3">
          <div className="flex items-center gap-0.5">
            {compact && (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  router.push("/lector-ia");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
                aria-label="Abrir en vista completa"
                title="Abrir en vista completa"
              >
                <ExpandToFullViewIcon className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={() => setDocumentsOpen((value) => !value)} className={cn("relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors", documentsOpen ? "bg-violet-500/15 text-violet-300" : "text-white/45 hover:bg-white/[0.06] hover:text-white")} aria-label="Ajustes, archivos y uso" aria-expanded={documentsOpen} title="Ajustes, archivos y uso">
              <Settings className="h-4 w-4" />
            </button>
            <div className="relative" ref={historyMenu}>
              <button type="button" onClick={() => setHistoryOpen((value) => !value)} className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors", historyOpen ? "bg-white/[0.08] text-white/80" : "text-white/45 hover:bg-white/[0.06] hover:text-white")} aria-label="Historial" aria-expanded={historyOpen} title="Historial"><History className="h-4 w-4" /></button>
              {historyOpen && (
                <div className="absolute right-0 top-10 z-[100] w-64 overflow-hidden rounded-xl border border-white/[0.06] bg-[#111111] py-3 shadow-2xl">
                  <div className="flex items-center gap-2 px-4 pb-2"><History className="h-4 w-4 text-white" /><span className="text-sm font-semibold text-white">Historial</span></div>
                  <div className="my-1 border-t border-white/[0.06]" />
                  {history.length === 0 ? <div className="px-4 py-3 text-sm text-white/40">Sin conversaciones guardadas</div> : (
                    <div className="max-h-80 overflow-y-auto">
                      <div className="px-4 py-1 text-[10px] font-medium uppercase tracking-wide text-white/35">Esta sesión</div>
                      {history.map((entry) => <button key={entry.id} type="button" onClick={() => loadHistory(entry)} className="w-full truncate px-4 py-2 text-left text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"><span className="block truncate">{entry.title}</span><span className="text-[9px] text-white/30">{new Date(entry.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span></button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={resetConversation} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[0.06] hover:text-white" aria-label="Nueva conversación" title="Nueva conversación"><RefreshCw className="h-4 w-4" /></button>
            {onClose && <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[0.06] hover:text-white" aria-label="Cerrar chat"><X className="h-4 w-4" /></button>}
          </div>
        </div>

        <div
          ref={messagesScroll}
          className="scrollbar-glass flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6"
          onScroll={handleMessagesScroll}
          onWheel={(event) => { if (event.deltaY < 0) followStream.current = false; }}
          onTouchStart={(event) => { touchY.current = event.touches[0]?.clientY ?? null; }}
          onTouchMove={(event) => {
            const nextY = event.touches[0]?.clientY;
            if (touchY.current !== null && nextY !== undefined && nextY > touchY.current + 2) followStream.current = false;
            if (nextY !== undefined) touchY.current = nextY;
          }}
          onTouchEnd={() => { touchY.current = null; }}
        >
          {messages.length === 0 ? (
            <div className="m-auto max-w-xl text-center">
              <h2 className={cn("font-semibold text-white", compact ? "text-base text-white/70" : "text-lg")}>{compact ? "Cavala IA" : "Pregunta a tus documentos"}</h2>
              {documents.length > 0 && (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => void sendQuestion(suggestion)} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5 text-left text-[11px] text-white/60 hover:border-brand-400/25 hover:text-white">{suggestion}</button>)}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-5">
              {messages.map((message, messageIndex) => (
                <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("min-w-0 [overflow-wrap:anywhere]", message.role === "user" ? "max-w-[85%] rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3" : "group w-full pr-6")}>
                    {message.role === "assistant" && message.documentSources && message.documentSources.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Contexto revisado">
                        {message.documentSources.map((source) => (
                          <span key={`${source.name}-${source.page}`} className="max-w-full truncate rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[9px] text-white/45" title={`${source.name}, página ${source.page}`}>
                            {source.name} · p. {source.page}
                          </span>
                        ))}
                      </div>
                    )}
                    {message.role === "assistant"
                      ? message.content
                        ? <AssistantMarkdown content={message.content} streaming={answering && message.id === messages[messages.length - 1]?.id} documents={documents} sources={message.sources} />
                        : answering && message.id === messages[messages.length - 1]?.id
                          ? <span className="inline-flex items-center gap-2 text-xs text-white/45"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…</span>
                          : null
                      : <p className="whitespace-pre-wrap text-sm leading-6 text-white">{message.content}</p>}
                    {message.role === "assistant" && message.content && (
                      <>
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {message.sources.map((source, index) => (
                              <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-lg border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200 transition-colors hover:bg-violet-500/20" title={source.title}>
                                {index + 1}. {source.title}
                              </a>
                            ))}
                          </div>
                        )}
                        {message.fileResults && message.fileResults.length > 0 && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {message.fileResults.map((file) => {
                              const selected = documents.some((document) => document.name === file.name);
                              return (
                                <button key={file.id} type="button" onClick={() => void openStoredFile(file)} disabled={reading || selected || documents.length >= LECTOR_MAX_FILES_PER_CHAT} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.10] bg-white/[0.045] p-2.5 text-left transition-colors hover:border-violet-400/30 hover:bg-violet-500/[0.08] disabled:opacity-45">
                                  {readingFileId === file.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-300" /> : <FileSearch className="h-4 w-4 shrink-0 text-violet-300" />}
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-medium text-white">{file.name}</span>
                                    <span className="block truncate text-[9px] text-white/40">{selected ? "Añadido" : file.context || formatBytes(file.bytes)}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button type="button" onClick={() => void copyMessage(message)} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:bg-white/[0.06] hover:text-white/60" aria-label="Copiar respuesta" title="Copiar respuesta">{copied === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                          <button type="button" onClick={() => retryMessage(messageIndex)} disabled={answering} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:bg-white/[0.06] hover:text-white/60 disabled:opacity-30" aria-label="Reintentar respuesta" title="Reintentar respuesta"><RefreshCw className="h-3.5 w-3.5" /></button>
                        </div>
                        {message.truncated && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-100">
                            <span>La respuesta alcanzó el límite de extensión.</span>
                            <button type="button" disabled={answering || remaining(access.limits.queries, used.queries) <= 0} onClick={() => {
                              const original = messages.slice(0, messageIndex).findLast((item) => item.role === "user")?.content ?? "";
                              void sendQuestion(`Completa brevemente la respuesta anterior desde donde quedó, incluye la conclusión y no repitas lo ya explicado. Solicitud original: ${original.slice(0, 1800)}`, messageIndex + 1);
                            }} className="rounded-lg border border-white/15 px-2 py-1 text-white hover:bg-white/10 disabled:opacity-40">Completar respuesta</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {notice && <div className="mx-3 mb-2 shrink-0 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{notice}</div>}
        {error && <div className="mx-3 mb-2 shrink-0 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
        <form onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }} className="shrink-0 border-t border-white/[0.08] p-2 sm:p-4">
          {(documents.length > 0 || uploadingFiles.length > 0) && (
            <div className="mx-auto mb-2 flex max-w-3xl gap-1.5 overflow-x-auto" aria-live="polite">
              {uploadingFiles.map((file) => (
                <span key={file.id} className="flex max-w-52 shrink-0 items-center gap-1.5 rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-2 py-1.5 text-[10px] text-white/70">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-300" />
                  <span className="truncate">Cargando {file.name}</span>
                </span>
              ))}
              {documents.map((document) => (
                <span key={document.id} className="flex max-w-52 shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-[10px] text-white/60">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                  <span className="truncate">{document.name}</span>
                  <button type="button" onClick={() => removeDocument(document.id)} className="text-white/30 hover:text-white" aria-label={`Retirar ${document.name}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative mx-auto w-full min-w-0 max-w-3xl overflow-visible rounded-2xl border border-white/[0.10] bg-white/[0.04] backdrop-blur-sm focus-within:border-brand-400/35">
            <textarea ref={questionInput} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(); } }} disabled={answering} rows={1} wrap="soft" placeholder={documents.length ? "Pregunta sobre los documentos…" : webSearch ? "Busca en internet…" : "Pregunta lo que quieras…"} className="block max-h-40 min-h-[78px] w-full min-w-0 resize-none break-words bg-transparent px-4 pb-12 pt-3 text-sm text-white outline-none [overflow-wrap:anywhere] placeholder:text-white/30 disabled:opacity-50" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-white/[0.05] bg-white/[0.025] px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-1">
                <button type="button" onClick={() => fileInput.current?.click()} disabled={reading || answering || documents.length >= LECTOR_MAX_FILES_PER_CHAT} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/45 transition-colors hover:bg-white/[0.11] hover:text-white disabled:opacity-35" aria-label="Adjuntar archivos" title="Adjuntar archivos">{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</button>
                <button type="button" onClick={() => setWebSearch((value) => !value)} disabled={answering} className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors", webSearch ? "bg-violet-500/25 text-violet-300" : "bg-white/[0.06] text-white/45 hover:bg-violet-500/15 hover:text-violet-300")} aria-label="Activar búsqueda web básica" aria-pressed={webSearch} title="Búsqueda web básica con Perplexity"><Atom className="h-4 w-4" /></button>
                <div className="relative" ref={modelMenu}>
                  <button type="button" onClick={() => setModelOpen((value) => !value)} disabled={answering} className="flex h-8 max-w-32 items-center gap-1 rounded-lg px-2 text-[11px] text-white/70 transition-colors hover:bg-white/[0.06]" aria-haspopup="listbox" aria-expanded={modelOpen}>
                    <span className="truncate">{CHAT_MODES.find((item) => item.id === mode)?.name}</span>
                    <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", modelOpen && "rotate-180")} />
                  </button>
                  {modelOpen && (
                    <div className="absolute bottom-full left-0 z-[100] mb-2 w-40 rounded-xl border border-white/[0.10] bg-black/95 p-1.5 shadow-2xl backdrop-blur-xl" role="listbox">
                      {CHAT_MODES.map((item) => (
                        <button key={item.id} type="button" onClick={() => { setMode(item.id); setModelOpen(false); }} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]", mode === item.id && "bg-violet-500/10")} role="option" aria-selected={mode === item.id}>
                          <span className="min-w-0 flex-1 text-sm font-medium text-white">{item.name}</span>
                          {mode === item.id && <Check className="h-4 w-4 shrink-0 text-violet-300" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {answering ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200" aria-label="Detener"><Square className="h-3.5 w-3.5 fill-current" /></button>
              ) : (
                <button type="submit" disabled={!question.trim() || (remaining(access.limits.queries, used.queries) <= 0 && !isFileSearchIntent(question)) || (webSearch && remaining(access.limits.webSearches, used.webSearches) <= 0)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/[0.10] disabled:text-white/20" aria-label="Enviar"><ArrowUp className="h-4 w-4 stroke-[2.5]" /></button>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function Usage({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
  const progress = max > 0 ? Math.min(100, (value / max) * 100) : 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between"><span className="text-sm text-white/75">{label}</span><span className={cn("text-sm font-medium", progress >= 90 ? "text-red-400" : progress >= 70 ? "text-amber-400" : "text-white/50")}>{Math.round(progress)}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className={cn("h-full rounded-full", progress >= 90 ? "bg-red-500" : progress >= 70 ? "bg-amber-500" : "bg-gradient-to-r from-violet-500 to-cyan-500")} style={{ width: `${progress}%` }} /></div>
      {note && <p className="text-[9px] text-white/30">{note}</p>}
    </div>
  );
}

