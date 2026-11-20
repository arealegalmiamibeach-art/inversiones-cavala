"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  CheckSquare2,
  ChevronRight,
  Code2,
  Copy,
  CornerDownLeft,
  Download,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  ImagePlus,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  Paperclip,
  Pilcrow,
  Plus,
  Quote,
  Search,
  Strikethrough,
  Trash2,
  Undo2,
  Redo2,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { actualizarCampo, actualizarNotas } from "@/lib/actions/entidades";
import { MAX_ARCHIVO_BYTES, MAX_ARCHIVO_MB, MENSAJE_LIMITE_ARCHIVO, MIMES_PERMITIDOS, mimePermitido, subirArchivo } from "@/lib/archivos/subir";
import { marcarSelectorArchivoAbierto } from "@/lib/archivos/selector-nativo";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import { cn } from "@/lib/utils";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";

type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "number"
  | "todo"
  | "toggle"
  | "quote"
  | "callout"
  | "code"
  | "image"
  | "archivo"
  | "divider";

type Block = {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
  indent?: number;
  body?: string;
  fileId?: string;
  fileName?: string;
  fileMime?: string;
  fileSize?: number;
};

interface NotionBlockEditorProps {
  tabla: string;
  id: string;
  campo: string;
  valorInicial: string | null | undefined;
  revalidar: string;
  placeholder?: string;
}

type BlockCategory = "Básicos" | "Listas" | "Subniveles" | "Avanzados";
type DropPosition = "before" | "after";

const BLOCK_OPTIONS: { type: BlockType; label: string; hint: string; keywords: string; category: BlockCategory; shortcut?: string; icon: LucideIcon }[] = [
  { type: "paragraph", label: "Texto", hint: "Empieza a escribir texto normal", keywords: "texto párrafo paragraph", category: "Básicos", icon: Pilcrow },
  { type: "h1", label: "Encabezado 1", hint: "Título grande de la página", keywords: "titulo encabezado heading h1", category: "Básicos", shortcut: "#", icon: Heading1 },
  { type: "h2", label: "Encabezado 2", hint: "Título mediano de sección", keywords: "titulo encabezado heading h2", category: "Básicos", shortcut: "##", icon: Heading2 },
  { type: "h3", label: "Encabezado 3", hint: "Título pequeño de subsección", keywords: "titulo encabezado heading h3", category: "Básicos", shortcut: "###", icon: Heading3 },
  { type: "bullet", label: "Lista con viñetas", hint: "Crea una lista simple", keywords: "lista viñeta bullet punto", category: "Listas", shortcut: "-", icon: List },
  { type: "number", label: "Lista numerada", hint: "Crea una lista ordenada", keywords: "lista número numerada pasos", category: "Listas", shortcut: "1.", icon: ListOrdered },
  { type: "todo", label: "Lista de tareas", hint: "Controla tareas con casillas", keywords: "todo checklist tarea casilla", category: "Listas", shortcut: "[]", icon: ListChecks },
  { type: "toggle", label: "Lista desplegable", hint: "Oculta y muestra contenido", keywords: "toggle desplegable plegable", category: "Listas", shortcut: ">>", icon: ChevronRight },
  { type: "quote", label: "Cita", hint: "Destaca una frase o fuente", keywords: "cita quote", category: "Avanzados", shortcut: ">", icon: Quote },
  { type: "callout", label: "Aviso", hint: "Resalta información importante", keywords: "aviso callout nota información", category: "Avanzados", shortcut: "!", icon: Lightbulb },
  { type: "image", label: "Imagen", hint: "Sube o pega una imagen", keywords: "imagen foto subir pegar clipboard", category: "Avanzados", shortcut: "pegar", icon: ImagePlus },
  { type: "archivo", label: "Archivo adjunto", hint: "PDF, Word, Excel, PowerPoint, ZIP…", keywords: "archivo adjunto pdf word excel powerpoint zip documento descargar", category: "Avanzados", shortcut: "soltar", icon: Paperclip },
  { type: "code", label: "Código", hint: "Escribe contenido monoespaciado", keywords: "codigo code programación", category: "Avanzados", shortcut: "```", icon: Code2 },
  { type: "divider", label: "Separador", hint: "Divide visualmente las secciones", keywords: "separador divisor linea divider", category: "Avanzados", shortcut: "---", icon: Minus },
];

const NESTED_BLOCK_OPTIONS = [
  { type: "bullet" as const, label: "Subviñeta", hint: "Viñeta dentro de otra viñeta", keywords: "sublista subnivel subviñeta bullet", category: "Subniveles" as const, shortcut: "⇧ ↵", icon: List, indentDelta: 1 as const },
  { type: "number" as const, label: "Sublista numerada", hint: "Numeración dentro de otro punto", keywords: "sublista subnivel numerada", category: "Subniveles" as const, shortcut: "⇧ ↵", icon: ListOrdered, indentDelta: 1 as const },
  { type: "todo" as const, label: "Subtarea", hint: "Checklist dentro de otra tarea", keywords: "subtarea subnivel checklist", category: "Subniveles" as const, shortcut: "⇧ ↵", icon: ListChecks, indentDelta: 1 as const },
  { type: "h2" as const, label: "Subencabezado", hint: "Encabezado dentro del bloque anterior", keywords: "subtitulo subencabezado subnivel heading", category: "Subniveles" as const, shortcut: "⇧ ↵", icon: Heading2, indentDelta: 1 as const },
];

const SLASH_BLOCK_OPTIONS = [
  ...BLOCK_OPTIONS.map((option) => ({ ...option, id: option.type, indentDelta: 0 as const })),
  ...NESTED_BLOCK_OPTIONS.map((option) => ({ ...option, id: `nested-${option.type}` })),
];

const BLOCK_CATEGORIES: BlockCategory[] = ["Básicos", "Listas", "Subniveles", "Avanzados"];
const MIMES_IMAGEN = Object.keys(MIMES_PERMITIDOS).filter((mime) => mime.startsWith("image/"));
const ACCEPT_IMAGENES = MIMES_IMAGEN.join(",");
const ACCEPT_ARCHIVOS = Object.keys(MIMES_PERMITIDOS).join(",");

// El bloque de archivo se serializa como un enlace markdown normal para que el
// texto siga siendo legible fuera del editor; el título entre comillas guarda
// tamaño y mime, que `parseMarkdown` vuelve a leer.
const PATRON_ARCHIVO = /^\[📎\s*(.*?)\]\(\/api\/archivos\/([0-9a-f-]{36})(?:\s+"(\d*)\|([^"]*)")?\)$/i;

function formatearTamano(bytes: number | undefined) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconoParaMime(mime: string | undefined): LucideIcon {
  if (!mime) return Paperclip;
  if (mime.startsWith("image/")) return FileImage;
  if (mime === "application/zip") return FileArchive;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") return FileSpreadsheet;
  return FileText;
}

function etiquetaTipoArchivo(mime: string | undefined) {
  const extension = mime ? MIMES_PERMITIDOS[mime] : undefined;
  return extension ? extension.replace(".", "").toLocaleUpperCase("es-PE") : "Archivo";
}

function blockId() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyBlock(type: BlockType = "paragraph"): Block {
  return { id: blockId(), type, text: "", checked: false };
}

function parseMarkdown(value: string): Block[] {
  if (!value.trim()) return [emptyBlock()];

  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;
    const indentation = Math.min(3, Math.floor(leadingSpaces / 2));
    const content = line.trimStart();
    if (line.trim() === "<details>") {
      const summary = lines[index + 1]?.match(/^<summary>(.*)<\/summary>$/)?.[1] ?? "";
      const body: string[] = [];
      index += 2;
      while (index < lines.length && lines[index].trim() !== "</details>") {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ ...emptyBlock("toggle"), text: summary, body: body.join("\n"), checked: false, indent: indentation });
      continue;
    }
    if (line.trim() === "```") {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "```") {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ ...emptyBlock("code"), text: code.join("\n"), indent: indentation });
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ ...emptyBlock("divider"), text: "", indent: indentation });
      continue;
    }
    const image = content.match(/^!\[(.*)\]\(\/api\/archivos\/([0-9a-f-]{36})\)$/i);
    if (image) {
      blocks.push({ ...emptyBlock("image"), text: image[1], fileId: image[2], indent: indentation });
      continue;
    }
    const archivo = content.match(PATRON_ARCHIVO);
    if (archivo) {
      blocks.push({
        ...emptyBlock("archivo"),
        text: "",
        fileId: archivo[2],
        fileName: archivo[1] || "Archivo adjunto",
        fileSize: archivo[3] ? Number(archivo[3]) : undefined,
        fileMime: archivo[4] || undefined,
        indent: indentation,
      });
      continue;
    }
    const todo = line.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
    if (todo) blocks.push({ ...emptyBlock("todo"), text: todo[2], checked: todo[1].toLowerCase() === "x", indent: indentation });
    else if (content.startsWith("> [!TOGGLE] ")) blocks.push({ ...emptyBlock("toggle"), text: content.slice(12), indent: indentation });
    else if (content.startsWith("> [!NOTE] ")) blocks.push({ ...emptyBlock("callout"), text: content.slice(10), indent: indentation });
    else if (content.startsWith("### ")) blocks.push({ ...emptyBlock("h3"), text: content.slice(4), indent: indentation });
    else if (content.startsWith("## ")) blocks.push({ ...emptyBlock("h2"), text: content.slice(3), indent: indentation });
    else if (content.startsWith("# ")) blocks.push({ ...emptyBlock("h1"), text: content.slice(2), indent: indentation });
    else if (/^\s*[-*•]\s+/.test(line)) blocks.push({ ...emptyBlock("bullet"), text: line.replace(/^\s*[-*•]\s+/, ""), indent: indentation });
    else if (/^\s*\d+[.)]\s+/.test(line)) blocks.push({ ...emptyBlock("number"), text: line.replace(/^\s*\d+[.)]\s+/, ""), indent: indentation });
    else if (/^\s*>\s?/.test(line)) blocks.push({ ...emptyBlock("quote"), text: line.replace(/^\s*>\s?/, ""), indent: indentation });
    else blocks.push({ ...emptyBlock("paragraph"), text: content, indent: indentation });
  }

  return blocks.length ? blocks : [emptyBlock()];
}

function serializeBlocks(blocks: Block[]): string {
  return blocks
    .map((block, index) => {
      const text = block.text.trimEnd();
      const indentation = "  ".repeat(block.indent ?? 0);
      switch (block.type) {
        case "h1": return `${indentation}# ${text}`;
        case "h2": return `${indentation}## ${text}`;
        case "h3": return `${indentation}### ${text}`;
        case "bullet": return `${indentation}- ${text}`;
        case "number": return `${indentation}${numberForBlock(blocks, index)}. ${text}`;
        case "todo": return `${indentation}- [${block.checked ? "x" : " "}] ${text}`;
        case "toggle": return `${indentation}<details>\n<summary>${text}</summary>\n${block.body?.trimEnd() ?? ""}\n${indentation}</details>`;
        case "quote": return `${indentation}> ${text}`;
        case "callout": return `${indentation}> [!NOTE] ${text}`;
        case "code": return `${indentation}\`\`\`\n${text}\n${indentation}\`\`\``;
        case "image": return block.fileId ? `${indentation}![${text}](/api/archivos/${block.fileId})` : "";
        case "archivo": return block.fileId
          ? `${indentation}[📎 ${block.fileName ?? "Archivo adjunto"}](/api/archivos/${block.fileId} "${block.fileSize ?? ""}|${block.fileMime ?? ""}")`
          : "";
        case "divider": return `${indentation}---`;
        default: return `${indentation}${text}`;
      }
    })
    .join("\n")
    .trimEnd();
}

function numberForBlock(blocks: Block[], index: number): number {
  let number = 1;
  const indent = blocks[index]?.indent ?? 0;
  for (let current = index - 1; current >= 0; current -= 1) {
    const currentIndent = blocks[current].indent ?? 0;
    if (currentIndent < indent) break;
    if (currentIndent > indent) continue;
    if (blocks[current].type !== "number") break;
    number += 1;
  }
  return number;
}

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("es-PE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function placeholderForBlock(type: BlockType, fallback: string) {
  switch (type) {
    case "h1": return "Título principal";
    case "h2": return "Título de sección";
    case "h3": return "Subtítulo";
    case "bullet": return "Elemento de lista";
    case "number": return "Elemento numerado";
    case "todo": return "Tarea pendiente";
    case "toggle": return "Título del desplegable";
    case "quote": return "Escribe una cita";
    case "callout": return "Escribe una nota importante";
    case "code": return "Escribe código";
    default: return fallback;
  }
}

function childTypeForBlock(type: BlockType): BlockType {
  if (["bullet", "number", "todo"].includes(type)) return type;
  if (type === "h1") return "h2";
  if (type === "h2") return "h3";
  if (type === "h3" || type === "divider" || type === "image" || type === "archivo") return "paragraph";
  return type;
}

function entityTypeForTable(table: string) {
  const types: Record<string, string> = {
    documentos: "documento",
    contratos: "contrato",
    procesos: "proceso",
    vehiculos: "vehiculo",
    predios: "predio",
    concesiones_mineras: "concesion",
    propietarios: "propietario",
    personal: "personal",
    oficinas_registrales: "oficina_registral",
  };
  return types[table] ?? table;
}

type DestinoGuardado = { tabla: string; id: string; campo: string; revalidar: string };

/**
 * Las entidades sin columna de texto libre reciben `campo="extra.notas"`; ahí el
 * destino no es una columna sino una clave del jsonb `extra`.
 */
function guardarContenido(destino: DestinoGuardado, contenido: string) {
  const valor = contenido.trim() ? contenido : null;
  return destino.campo.startsWith("extra.")
    ? actualizarNotas(destino.tabla, destino.id, valor, destino.revalidar)
    : actualizarCampo(destino.tabla, destino.id, destino.campo, valor, destino.revalidar);
}

function maximumIndentFor(blocks: Block[], index: number) {
  if (index <= 0) return 0;
  return Math.min(3, (blocks[index - 1].indent ?? 0) + 1);
}

function subtreeEndIndex(blocks: Block[], start: number) {
  const parentIndent = blocks[start]?.indent ?? 0;
  let end = start + 1;
  while (end < blocks.length && (blocks[end].indent ?? 0) > parentIndent) end += 1;
  return end;
}

function displayNumberForBlock(blocks: Block[], index: number) {
  const indent = blocks[index]?.indent ?? 0;
  const hierarchy: number[] = [];

  for (let level = 0; level < indent; level += 1) {
    let ancestorIndex = index - 1;
    while (ancestorIndex >= 0 && (blocks[ancestorIndex].indent ?? 0) > level) ancestorIndex -= 1;
    if (ancestorIndex >= 0 && blocks[ancestorIndex].type === "number" && (blocks[ancestorIndex].indent ?? 0) === level) {
      hierarchy.push(numberForBlock(blocks, ancestorIndex));
    }
  }

  hierarchy.push(numberForBlock(blocks, index));
  return `${hierarchy.join(".")}.`;
}

function tidyBlocks(blocks: Block[]): Block[] {
  const expanded = blocks.flatMap((block) => {
    if (!block.text.includes("\n") || block.type === "code" || block.type === "image" || block.type === "archivo") return [block];
    return block.text.split("\n").map((line, index) => ({ ...block, id: index === 0 ? block.id : blockId(), text: line }));
  });

  return expanded.map((block) => {
    if (block.type === "divider" || block.type === "archivo" || block.type === "image") return block;
    let text = block.text.replace(/[\t ]+/g, " ").trim();
    let type = block.type;

    if (type === "paragraph") {
      if (/^[-*•]\s+/.test(text)) {
        type = "bullet";
        text = text.replace(/^[-*•]\s+/, "");
      } else if (/^\d+[.)]\s+/.test(text)) {
        type = "number";
        text = text.replace(/^\d+[.)]\s+/, "");
      } else {
        const words = text.split(/\s+/).filter(Boolean);
        const looksLikeHeading = text.length > 0 && text.length <= 72 && words.length <= 9 && !/[.!?]$/.test(text);
        if (looksLikeHeading) type = "h2";
      }
    }

    if ((type === "paragraph" || type === "quote") && text) {
      text = text.charAt(0).toLocaleUpperCase("es-PE") + text.slice(1);
      if (text.length > 35 && !/[.!?:;]$/.test(text)) text += ".";
    }

    return { ...block, type, text };
  });
}

export function NotionBlockEditor({
  tabla,
  id,
  campo,
  valorInicial,
  revalidar,
  placeholder = "Escribe algo o pulsa / para elegir un bloque…",
}: NotionBlockEditorProps) {
  const rol = useAcceso(tabla);
  // Tesorería y Soporte Documentario son "visualización y descarga" puros:
  // ni RLS (puede_escribir(), migración 015) ni esta UI les dejan escribir.
  // Se guarda `setBlocks` en sí mismo en vez de repartir el guard por cada
  // función que muta bloques (updateBlock, deleteBlock, drag-reorder, pegar
  // imagen, atajos de teclado...): así ninguna mutación se cuela por un
  // camino que se nos haya escapado.
  const soloLectura = !puedeEscribir(rol);
  const initialValue = valorInicial ?? "";
  const [blocks, setBlocksRaw] = useState<Block[]>(() => parseMarkdown(initialValue));
  const setBlocks: typeof setBlocksRaw = useCallback(
    (value) => {
      if (soloLectura) return;
      setBlocksRaw(value);
    },
    [soloLectura]
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockMenuId, setBlockMenuId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const textareas = useRef(new Map<string, HTMLTextAreaElement>());
  const blockElements = useRef(new Map<string, HTMLDivElement>());
  const raiz = useRef<HTMLElement>(null);
  const areaBloques = useRef<HTMLDivElement>(null);
  const entradaImagen = useRef<HTMLInputElement>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [destinoSubida, setDestinoSubida] = useState<{ id: string; tipo: "image" | "archivo" } | null>(null);
  const [subiendoIds, setSubiendoIds] = useState<Set<string>>(() => new Set());
  const [erroresSubida, setErroresSubida] = useState<Record<string, string>>({});
  const [marquesina, setMarquesina] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const inicioMarquesina = useRef<{ x: number; y: number } | null>(null);

  const serialized = useMemo(() => serializeBlocks(blocks), [blocks]);

  // Autoguardado: el usuario nunca confirma. `ultimoGuardado` es la referencia
  // contra la que se decide si hay algo que enviar (y también absorbe el eco de
  // nuestro propio revalidatePath, que si no reventaría el texto a medio
  // escribir). `contenidoActual` guarda el último valor serializado para poder
  // vaciar la cola al desmontar, cuando el estado ya no está disponible.
  const ultimoGuardado = useRef(initialValue.trimEnd());
  const contenidoActual = useRef(serialized);
  const idAnterior = useRef(id);
  const enviando = useRef(false);
  const reintentoPendiente = useRef(false);
  // Contenidos que ya salieron hacia el servidor pero cuyo revalidatePath
  // todavía no volvió. Cuando el usuario escribe rápido en dos bloques
  // seguidos puede haber DOS guardados superpuestos: el primero sigue en
  // vuelo cuando el segundo ya avanzó `ultimoGuardado`. Si el eco del PRIMERO
  // llega después de eso, comparar sólo contra `ultimoGuardado` (el más
  // reciente) lo confunde con un cambio externo y reparsea todo el árbol de
  // bloques — eso es lo que le robaba el foco al usuario a mitad de escritura.
  // Guardar cada envío pendiente aquí evita esa falsa alarma sin importar en
  // qué orden lleguen los ecos.
  const enviosPendientes = useRef<Set<string>>(new Set());

  useEffect(() => {
    contenidoActual.current = serialized;
  });

  useEffect(() => {
    const cambioDeRegistro = idAnterior.current !== id;
    idAnterior.current = id;
    if (!cambioDeRegistro) {
      const entrante = initialValue.trimEnd();
      // Si lo que llega es el eco de un guardado nuestro (el último, o uno
      // anterior que seguía en vuelo cuando otro más nuevo ya avanzó
      // `ultimoGuardado`), reparsear aquí perdería el foco y el cursor
      // mientras se sigue escribiendo — ver el comentario de `enviosPendientes`.
      if (entrante === ultimoGuardado.current || enviosPendientes.current.has(entrante)) {
        enviosPendientes.current.delete(entrante);
        return;
      }
      // Si el usuario sigue con el cursor dentro de este editor, no reparsear:
      // un eco que llegue desincronizado (p. ej. el revalidatePath de otro
      // campo de la misma página) le robaría el foco a mitad de escritura.
      // Se resincroniza solo al perder el foco o al cambiar de registro.
      if (raiz.current?.contains(document.activeElement)) return;
    }
    // setBlocksRaw a propósito, no el setBlocks bloqueado: esto sincroniza
    // con datos entrantes al cambiar de registro, no es una edición del
    // usuario — con soloLectura también debe reflejar el contenido nuevo.
    setBlocksRaw(parseMarkdown(initialValue));
    ultimoGuardado.current = initialValue.trimEnd();
    setSelectedIds(new Set());
    setSelectionAnchorId(null);
    setError(null);
    if (cambioDeRegistro) {
      enviosPendientes.current.clear();
      historial.current = [];
      futuro.current = [];
      sesionEscritura.current = null;
      if (temporizadorSesion.current) {
        window.clearTimeout(temporizadorSesion.current);
        temporizadorSesion.current = null;
      }
      setHistorialLen(0);
      setFuturoLen(0);
    }
  }, [initialValue, id]);

  const guardarAhora = useCallback(async (contenido: string) => {
    if (soloLectura) return;
    if (contenido === ultimoGuardado.current) return;
    if (enviando.current) {
      reintentoPendiente.current = true;
      return;
    }
    const anterior = ultimoGuardado.current;
    ultimoGuardado.current = contenido;
    enviosPendientes.current.add(contenido);
    enviando.current = true;
    setGuardando(true);
    setError(null);

    const resultado = await guardarContenido({ tabla, id, campo, revalidar }, contenido);

    enviando.current = false;
    setGuardando(false);
    if ("error" in resultado) {
      ultimoGuardado.current = anterior;
      enviosPendientes.current.delete(contenido);
      reintentoPendiente.current = false;
      setError(resultado.code === "42501" ? "Sin permiso para editar" : resultado.error);
      return;
    }
    setGuardado(true);
    window.setTimeout(() => setGuardado(false), 1600);
    if (reintentoPendiente.current) {
      reintentoPendiente.current = false;
      void guardarAhora(contenidoActual.current);
    }
  }, [soloLectura, tabla, id, campo, revalidar]);

  const guardarPendiente = useCallback(() => {
    void guardarAhora(contenidoActual.current);
  }, [guardarAhora]);

  useEffect(() => {
    if (soloLectura || serialized === ultimoGuardado.current) return;
    const temporizador = window.setTimeout(() => void guardarAhora(serialized), 700);
    return () => window.clearTimeout(temporizador);
  }, [serialized, soloLectura, guardarAhora]);

  useEffect(() => {
    if (soloLectura) return;
    function alSalir() {
      guardarPendiente();
    }
    function alOcultar() {
      if (document.visibilityState === "hidden") guardarPendiente();
    }
    window.addEventListener("pagehide", alSalir);
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      window.removeEventListener("pagehide", alSalir);
      document.removeEventListener("visibilitychange", alOcultar);
    };
  }, [soloLectura, guardarPendiente]);

  // Vaciado al desmontar o al cambiar de registro: el destino se captura del
  // render que creó el efecto, así el contenido del registro anterior nunca se
  // escribe sobre el nuevo. Sin estado, que ya no existe cuando esto corre.
  useEffect(() => {
    if (soloLectura) return;
    const destino = { tabla, id, campo, revalidar };
    return () => {
      const pendiente = contenidoActual.current;
      if (pendiente === ultimoGuardado.current) return;
      ultimoGuardado.current = pendiente;
      void guardarContenido(destino, pendiente);
    };
  }, [soloLectura, tabla, id, campo, revalidar]);

  // Deshacer/rehacer estructural: guarda snapshots del array `blocks`
  // completo, no cada tecla — igual que Word, un paso de deshacer cubre una
  // acción completa (crear/borrar/mover/convertir un bloque, o una sesión de
  // tecleo entera). `historialLen`/`futuroLen` sólo existen para habilitar o
  // no los botones de la barra; no gobiernan nada más.
  const LIMITE_HISTORIAL = 100;
  const historial = useRef<Block[][]>([]);
  const futuro = useRef<Block[][]>([]);
  const [historialLen, setHistorialLen] = useState(0);
  const [futuroLen, setFuturoLen] = useState(0);
  // Coalesce de una sesión de tecleo en un solo snapshot: la clave identifica
  // qué campo se está escribiendo (bloque o su cuerpo de toggle); mientras no
  // cambie y no pase el mismo debounce del autoguardado (700ms) o un blur, las
  // teclas siguientes no generan snapshots nuevos.
  const sesionEscritura = useRef<string | null>(null);
  const temporizadorSesion = useRef<number | null>(null);

  function pushHistorial() {
    if (soloLectura) return;
    const cima = historial.current[historial.current.length - 1];
    if (cima === blocks) return; // ya se guardó este mismo estado en esta pasada
    historial.current.push(blocks);
    if (historial.current.length > LIMITE_HISTORIAL) historial.current.shift();
    if (futuro.current.length) futuro.current = [];
    setHistorialLen(historial.current.length);
    setFuturoLen(0);
  }

  function iniciarSesionEscritura(clave: string) {
    if (soloLectura) return;
    if (sesionEscritura.current !== clave) {
      pushHistorial();
      sesionEscritura.current = clave;
    }
    if (temporizadorSesion.current) window.clearTimeout(temporizadorSesion.current);
    temporizadorSesion.current = window.setTimeout(() => {
      sesionEscritura.current = null;
      temporizadorSesion.current = null;
    }, 700);
  }

  function terminarSesionEscritura() {
    if (temporizadorSesion.current) {
      window.clearTimeout(temporizadorSesion.current);
      temporizadorSesion.current = null;
    }
    sesionEscritura.current = null;
  }

  function restaurarFoco(bloques: Block[]) {
    const idParaEnfocar = activeId;
    if (!idParaEnfocar || !bloques.some((block) => block.id === idParaEnfocar)) return;
    focusBlock(idParaEnfocar);
  }

  function deshacer() {
    if (soloLectura || !historial.current.length) return;
    const anterior = historial.current.pop();
    if (!anterior) return;
    futuro.current.push(blocks);
    if (futuro.current.length > LIMITE_HISTORIAL) futuro.current.shift();
    terminarSesionEscritura();
    setBlocksRaw(anterior);
    setHistorialLen(historial.current.length);
    setFuturoLen(futuro.current.length);
    restaurarFoco(anterior);
  }

  function rehacer() {
    if (soloLectura || !futuro.current.length) return;
    const siguiente = futuro.current.pop();
    if (!siguiente) return;
    historial.current.push(blocks);
    if (historial.current.length > LIMITE_HISTORIAL) historial.current.shift();
    terminarSesionEscritura();
    setBlocksRaw(siguiente);
    setHistorialLen(historial.current.length);
    setFuturoLen(futuro.current.length);
    restaurarFoco(siguiente);
  }

  // Cmd/Ctrl+Z y Cmd/Ctrl+Shift+Z (también Cmd/Ctrl+Y) funcionan sin importar
  // si el foco está en un textarea o no — igual que el atajo de selección de
  // abajo, va en `document` porque tras una marquesina el foco queda en el
  // body. Interceptar aquí a propósito reemplaza el undo nativo del campo:
  // nuestro snapshot ya incluye lo tecleado gracias al coalescing de arriba.
  useEffect(() => {
    if (soloLectura) return;
    function alPulsarGlobal(event: KeyboardEvent) {
      const objetivo = event.target as HTMLElement | null;
      const dentro = !objetivo || objetivo === document.body || raiz.current?.contains(objetivo);
      if (!dentro) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const tecla = event.key.toLocaleLowerCase();
      if (tecla === "z" && event.shiftKey) {
        event.preventDefault();
        rehacer();
      } else if (tecla === "z") {
        event.preventDefault();
        deshacer();
      } else if (tecla === "y") {
        event.preventDefault();
        rehacer();
      }
    }
    document.addEventListener("keydown", alPulsarGlobal);
    return () => document.removeEventListener("keydown", alPulsarGlobal);
  });

  const activeBlock = blocks.find((block) => block.id === activeId);
  const activeBlockIndex = blocks.findIndex((block) => block.id === activeId);
  const activeMaximumIndent = activeBlockIndex >= 0 ? maximumIndentFor(blocks, activeBlockIndex) : 0;
  const slashQuery = activeBlock?.text.startsWith("/") ? normalizeSearch(activeBlock.text.slice(1)) : null;
  const slashOptions = slashQuery === null
    ? []
    : SLASH_BLOCK_OPTIONS.filter((option) => normalizeSearch(`${option.label} ${option.hint} ${option.keywords}`).includes(slashQuery));

  function updateBlock(blockIdValue: string, patch: Partial<Block>, opciones?: { historial?: boolean }) {
    if (opciones?.historial) pushHistorial();
    setBlocks((current) => current.map((block) => block.id === blockIdValue ? { ...block, ...patch } : block));
  }

  function selectBlock(blockIdValue: string, additive = false, range = false) {
    const blockIndex = blocks.findIndex((block) => block.id === blockIdValue);
    if (blockIndex < 0) return;

    if (range && selectionAnchorId) {
      const anchorIndex = blocks.findIndex((block) => block.id === selectionAnchorId);
      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, blockIndex);
        const end = Math.max(anchorIndex, blockIndex);
        setSelectedIds((current) => {
          const next = additive ? new Set(current) : new Set<string>();
          blocks.slice(start, end + 1).forEach((block) => next.add(block.id));
          return next;
        });
        setBlockMenuId(null);
        return;
      }
    }

    setSelectedIds((current) => {
      if (!additive) return new Set([blockIdValue]);
      const next = new Set(current);
      if (next.has(blockIdValue)) next.delete(blockIdValue);
      else next.add(blockIdValue);
      return next;
    });
    setSelectionAnchorId(blockIdValue);
    setBlockMenuId(null);
  }

  function clearBlockSelection() {
    setSelectedIds(new Set());
    setSelectionAnchorId(null);
  }

  function duplicateSelectedBlocks() {
    if (!selectedIds.size) return;
    pushHistorial();
    const selectedIndexes = blocks
      .map((block, index) => selectedIds.has(block.id) ? index : -1)
      .filter((index) => index >= 0);
    if (!selectedIndexes.length) return;
    const insertAt = Math.max(...selectedIndexes) + 1;
    const duplicates = blocks.filter((block) => selectedIds.has(block.id)).map((block) => ({ ...block, id: blockId() }));
    setBlocks((current) => [...current.slice(0, insertAt), ...duplicates, ...current.slice(insertAt)]);
    setSelectedIds(new Set(duplicates.map((block) => block.id)));
    setSelectionAnchorId(duplicates[0]?.id ?? null);
  }

  function deleteSelectedBlocks() {
    if (!selectedIds.size) return;
    pushHistorial();
    const remaining = blocks.filter((block) => !selectedIds.has(block.id));
    if (remaining.length) {
      setBlocks(remaining);
    } else {
      setBlocks([emptyBlock()]);
    }
    setActiveId(null);
    clearBlockSelection();
  }

  function seleccionarTodos() {
    if (!blocks.length) return;
    setSelectedIds(new Set(blocks.map((block) => block.id)));
    setSelectionAnchorId(blocks[0].id);
    setBlockMenuId(null);
  }

  /**
   * Mueve el grupo seleccionado un bloque completo hacia arriba o abajo. Se
   * calcula sobre la lista sin los seleccionados: así una selección con huecos
   * se mueve junta en vez de pisarse entre sí.
   */
  function moverSeleccion(direction: -1 | 1) {
    if (!selectedIds.size) return;
    pushHistorial();
    const previousPositions = captureBlockPositions();
    setBlocks((current) => {
      const seleccionados = current.filter((block) => selectedIds.has(block.id));
      const resto = current.filter((block) => !selectedIds.has(block.id));
      if (!seleccionados.length || !resto.length) return current;
      const primerIndice = current.findIndex((block) => selectedIds.has(block.id));
      const posicion = current.slice(0, primerIndice).filter((block) => !selectedIds.has(block.id)).length;
      const destino = direction === -1 ? posicion - 1 : posicion + 1;
      if (destino < 0 || destino > resto.length) return current;
      return [...resto.slice(0, destino), ...seleccionados, ...resto.slice(destino)];
    });
    animateBlockPositions(previousPositions);
    setBlockMenuId(null);
  }

  // Atajos que actúan sobre la selección de bloques. Van en `document` porque
  // tras una marquesina el foco queda en el body, pero se ignora todo lo que
  // pase fuera de este editor o mientras se escribe dentro de un campo.
  useEffect(() => {
    if (!selectedIds.size || soloLectura) return;
    function dentroDelEditor(event: KeyboardEvent) {
      const objetivo = event.target as HTMLElement | null;
      return !objetivo || objetivo === document.body || Boolean(raiz.current?.contains(objetivo));
    }
    // Escape va en captura: tiene que llegar antes que el del panel lateral,
    // que si no se cierra entero en vez de sólo soltar la selección.
    function alEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !dentroDelEditor(event)) return;
      event.preventDefault();
      clearBlockSelection();
    }
    function alPulsar(event: KeyboardEvent) {
      const objetivo = event.target as HTMLElement | null;
      if (!dentroDelEditor(event) || event.key === "Escape") return;
      if (objetivo?.closest("textarea, input")) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedBlocks();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        moverSeleccion(event.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "a") {
        event.preventDefault();
        seleccionarTodos();
      }
    }
    document.addEventListener("keydown", alEscape, true);
    document.addEventListener("keydown", alPulsar);
    return () => {
      document.removeEventListener("keydown", alEscape, true);
      document.removeEventListener("keydown", alPulsar);
    };
  });

  function iniciarMarquesina(event: React.PointerEvent<HTMLDivElement>) {
    if (soloLectura || event.button !== 0) return;
    const objetivo = event.target as HTMLElement;
    if (objetivo.closest("textarea, input, button, a")) return;
    inicioMarquesina.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moverMarquesina(event: React.PointerEvent<HTMLDivElement>) {
    const inicio = inicioMarquesina.current;
    if (!inicio) return;
    const ancho = Math.abs(event.clientX - inicio.x);
    const alto = Math.abs(event.clientY - inicio.y);
    if (ancho < 5 && alto < 5) return;

    const rectangulo = {
      left: Math.min(inicio.x, event.clientX),
      top: Math.min(inicio.y, event.clientY),
      right: Math.max(inicio.x, event.clientX),
      bottom: Math.max(inicio.y, event.clientY),
    };
    const contenedor = areaBloques.current?.getBoundingClientRect();
    if (contenedor) {
      setMarquesina({
        left: rectangulo.left - contenedor.left,
        top: rectangulo.top - contenedor.top,
        width: rectangulo.right - rectangulo.left,
        height: rectangulo.bottom - rectangulo.top,
      });
    }

    const tocados = blocks
      .filter((block) => {
        const caja = blockElements.current.get(block.id)?.getBoundingClientRect();
        if (!caja) return false;
        return caja.left < rectangulo.right && caja.right > rectangulo.left
          && caja.top < rectangulo.bottom && caja.bottom > rectangulo.top;
      })
      .map((block) => block.id);

    setSelectedIds(new Set(tocados));
    setSelectionAnchorId(tocados[0] ?? null);
    setBlockMenuId(null);
  }

  function terminarMarquesina(event: React.PointerEvent<HTMLDivElement>) {
    if (!inicioMarquesina.current) return;
    inicioMarquesina.current = null;
    setMarquesina(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function captureBlockPositions() {
    return new Map(
      Array.from(blockElements.current.entries()).map(([blockIdValue, element]) => [blockIdValue, element.getBoundingClientRect().top])
    );
  }

  function animateBlockPositions(previous: Map<string, number>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    requestAnimationFrame(() => {
      blockElements.current.forEach((element, blockIdValue) => {
        const oldTop = previous.get(blockIdValue);
        if (oldTop === undefined) return;
        const delta = oldTop - element.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) return;
        element.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
          { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      });
    });
  }

  function focusBlock(blockIdValue: string, position: "start" | "end" = "end") {
    requestAnimationFrame(() => {
      const textarea = textareas.current.get(blockIdValue);
      if (!textarea) return;
      textarea.focus();
      const cursor = position === "start" ? 0 : textarea.value.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function pedirArchivoParaBloque(blockIdValue: string, tipo: "image" | "archivo") {
    if (soloLectura) return;
    setDestinoSubida({ id: blockIdValue, tipo });
    requestAnimationFrame(() => {
      // Mismo resguardo que el resto de subidas: el click fantasma de Chrome al
      // cerrar el diálogo del sistema no debe cerrar el panel lateral.
      marcarSelectorArchivoAbierto();
      (tipo === "image" ? entradaImagen : entradaArchivo).current?.click();
    });
  }

  // El botón "Reemplazar" de una imagen ya existente llama a
  // pedirArchivoParaBloque() directo, sin pasar por setBlocks — por eso este
  // guard va aparte del de más arriba, no alcanza con guardar sólo setBlocks.
  async function subirAlBloque(file: File, blockIdValue: string, tipo: "image" | "archivo") {
    if (soloLectura) return;
    if (tipo === "image" && !file.type.startsWith("image/")) {
      setErroresSubida((current) => ({ ...current, [blockIdValue]: "Ese archivo no es una imagen" }));
      return;
    }
    if (!mimePermitido(file.type)) {
      setErroresSubida((current) => ({ ...current, [blockIdValue]: "Formato no permitido" }));
      return;
    }
    if (file.size > MAX_ARCHIVO_BYTES) {
      setErroresSubida((current) => ({ ...current, [blockIdValue]: MENSAJE_LIMITE_ARCHIVO }));
      return;
    }

    setSubiendoIds((current) => new Set(current).add(blockIdValue));
    setErroresSubida((current) => {
      const next = { ...current };
      delete next[blockIdValue];
      return next;
    });

    try {
      const archivo = await subirArchivo(file, {
        entidadTipo: entityTypeForTable(tabla),
        entidadId: id,
        origen: "editor",
      });
      updateBlock(blockIdValue, {
        type: tipo,
        fileId: archivo.id,
        fileName: archivo.nombre_original,
        fileMime: archivo.mime ?? undefined,
        fileSize: archivo.tamano_bytes,
        text: "",
      });
    } catch (fallo) {
      setErroresSubida((current) => ({
        ...current,
        [blockIdValue]: fallo instanceof Error ? fallo.message : "No se pudo adjuntar el archivo",
      }));
    } finally {
      setSubiendoIds((current) => {
        const next = new Set(current);
        next.delete(blockIdValue);
        return next;
      });
    }
  }

  /** Inserta un bloque por archivo pegado o soltado: imagen si lo es, adjunto si no. */
  function insertarArchivos(archivos: File[], index: number) {
    if (soloLectura || !archivos.length) return;
    pushHistorial();
    const nuevos = archivos.map((archivo) => ({
      ...emptyBlock(archivo.type.startsWith("image/") ? "image" : "archivo"),
      indent: blocks[index]?.indent ?? 0,
    }));
    setBlocks((current) => [...current.slice(0, index + 1), ...nuevos, ...current.slice(index + 1)]);
    setActiveId(nuevos[0].id);
    nuevos.forEach((bloque, posicion) => {
      void subirAlBloque(archivos[posicion], bloque.id, bloque.type === "image" ? "image" : "archivo");
    });
  }

  function archivosDelEvento(transferencia: DataTransfer | null) {
    if (!transferencia) return [];
    return Array.from(transferencia.files ?? []).filter((archivo) => archivo.size > 0);
  }

  function insertAfter(index: number, type: BlockType = "paragraph", text = "") {
    pushHistorial();
    const next = { ...emptyBlock(type), text };
    setBlocks((current) => [...current.slice(0, index + 1), next, ...current.slice(index + 1)]);
    setBlockMenuId(null);
    setActiveId(next.id);
    focusBlock(next.id, "start");
  }

  function insertChild(index: number) {
    const parent = blocks[index];
    if (!parent) return;
    pushHistorial();
    const next = {
      ...emptyBlock(childTypeForBlock(parent.type)),
      indent: Math.min(3, (parent.indent ?? 0) + 1),
    };
    setBlocks((current) => [...current.slice(0, index + 1), next, ...current.slice(index + 1)]);
    setBlockMenuId(null);
    setActiveId(next.id);
    focusBlock(next.id, "start");
  }

  function duplicateBlock(index: number) {
    const source = blocks[index];
    if (!source) return;
    pushHistorial();
    const end = subtreeEndIndex(blocks, index);
    const duplicates = blocks.slice(index, end).map((block) => ({ ...block, id: blockId() }));
    setBlocks((current) => [...current.slice(0, end), ...duplicates, ...current.slice(end)]);
    setBlockMenuId(null);
    setActiveId(duplicates[0].id);
    focusBlock(duplicates[0].id);
  }

  function deleteBlock(index: number) {
    const target = blocks[index];
    if (!target) return;
    if (blocks.length === 1) {
      updateBlock(target.id, { type: "paragraph", text: "", checked: false }, { historial: true });
      setBlockMenuId(null);
      focusBlock(target.id);
      return;
    }
    pushHistorial();
    const end = subtreeEndIndex(blocks, index);
    if (index === 0 && end === blocks.length) {
      const first = emptyBlock();
      setBlocks([first]);
      setBlockMenuId(null);
      setActiveId(first.id);
      focusBlock(first.id);
      return;
    }
    const nextFocus = blocks[index - 1] ?? blocks[end];
    setBlocks((current) => [...current.slice(0, index), ...current.slice(end)]);
    setBlockMenuId(null);
    setActiveId(nextFocus.id);
    focusBlock(nextFocus.id);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const sourceEnd = subtreeEndIndex(blocks, index);
    if ((direction === -1 && index === 0) || (direction === 1 && sourceEnd >= blocks.length)) return;
    pushHistorial();
    const previousPositions = captureBlockPositions();
    setBlocks((current) => {
      const end = subtreeEndIndex(current, index);
      const moved = current.slice(index, end);
      const baseIndent = current[index].indent ?? 0;

      if (direction === -1) {
        let previousStart = index - 1;
        while (previousStart > 0 && (current[previousStart].indent ?? 0) > baseIndent) previousStart -= 1;
        return [...current.slice(0, previousStart), ...moved, ...current.slice(previousStart, index), ...current.slice(end)];
      }

      const nextEnd = subtreeEndIndex(current, end);
      return [...current.slice(0, index), ...current.slice(end, nextEnd), ...moved, ...current.slice(nextEnd)];
    });
    animateBlockPositions(previousPositions);
    setBlockMenuId(null);
  }

  function updateDropTarget(event: React.DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    if (selectedIds.size > 1 && selectedIds.has(draggedId) && selectedIds.has(targetId)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position: DropPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDropTarget({ id: targetId, position });
    event.dataTransfer.dropEffect = "move";
  }

  function dropBlock(targetId: string, position: DropPosition) {
    if (!draggedId) return;
    // Arrastrar un bloque que forma parte de la selección mueve todo el grupo;
    // si no, sólo ese bloque. En ambos casos viajan también sus subniveles.
    const grupo = selectedIds.has(draggedId) && selectedIds.size > 1 ? new Set(selectedIds) : new Set([draggedId]);
    if (grupo.has(targetId)) return;
    pushHistorial();
    const previousPositions = captureBlockPositions();
    setBlocks((current) => {
      const idsAMover = new Set<string>();
      current.forEach((block, index) => {
        if (!grupo.has(block.id)) return;
        current.slice(index, subtreeEndIndex(current, index)).forEach((hijo) => idsAMover.add(hijo.id));
      });
      if (idsAMover.has(targetId) || !idsAMover.size) return current;

      const movidos = current.filter((block) => idsAMover.has(block.id));
      const resto = current.filter((block) => !idsAMover.has(block.id));
      const objetivo = resto.findIndex((block) => block.id === targetId);
      if (objetivo < 0) return current;
      const destino = position === "after" ? subtreeEndIndex(resto, objetivo) : objetivo;
      return [...resto.slice(0, destino), ...movidos, ...resto.slice(destino)];
    });
    animateBlockPositions(previousPositions);
    setDraggedId(null);
    setDropTarget(null);
  }

  function chooseType(type: BlockType) {
    setBlockMenuId(null);
    if (type === "image" || type === "archivo") {
      const limpio = { type, text: "", fileId: undefined, fileName: undefined, fileMime: undefined, fileSize: undefined };
      if (activeId) {
        updateBlock(activeId, limpio, { historial: true });
        pedirArchivoParaBloque(activeId, type);
      } else {
        pushHistorial();
        const nuevo = emptyBlock(type);
        setBlocks((current) => [...current, nuevo]);
        setActiveId(nuevo.id);
        pedirArchivoParaBloque(nuevo.id, type);
      }
      return;
    }
    if (!activeId) {
      const target = blocks.at(-1);
      if (target) {
        updateBlock(target.id, { type, text: target.text === "/" ? "" : target.text, indent: target.indent ?? 0 }, { historial: true });
        setActiveId(target.id);
        focusBlock(target.id);
        return;
      }

      pushHistorial();
      const first = emptyBlock(type);
      setBlocks([first]);
      setActiveId(first.id);
      focusBlock(first.id);
      return;
    }
    updateBlock(activeId, {
      type,
      text: activeBlock?.text.startsWith("/") ? "" : activeBlock?.text ?? "",
      indent: activeBlock?.indent ?? 0,
    }, { historial: true });
    focusBlock(activeId);
  }

  function chooseSlashOption(option: (typeof SLASH_BLOCK_OPTIONS)[number]) {
    if (option.type === "image" || option.type === "archivo") {
      chooseType(option.type);
      return;
    }
    if (!activeBlock || activeBlockIndex < 0) {
      chooseType(option.type);
      return;
    }
    const maximum = maximumIndentFor(blocks, activeBlockIndex);
    const indent = option.indentDelta
      ? Math.min(maximum, (activeBlock.indent ?? 0) + option.indentDelta)
      : activeBlock.indent ?? 0;
    updateBlock(activeBlock.id, {
      type: option.type,
      text: activeBlock.text.startsWith("/") ? "" : activeBlock.text,
      indent,
    }, { historial: true });
    setBlockMenuId(null);
    focusBlock(activeBlock.id);
  }

  function changeIndent(direction: -1 | 1) {
    if (!activeBlock || activeBlock.type === "divider") return;
    const activeIndex = blocks.findIndex((block) => block.id === activeBlock.id);
    const maximum = maximumIndentFor(blocks, activeIndex);
    const nextIndent = Math.min(maximum, Math.max(0, (activeBlock.indent ?? 0) + direction));
    updateBlock(activeBlock.id, { indent: nextIndent }, { historial: true });
    focusBlock(activeBlock.id);
  }

  function applyMarkdownShortcut(block: Block, value: string) {
    const shortcuts: { token: string; type: BlockType }[] = [
      { token: "### ", type: "h3" },
      { token: "## ", type: "h2" },
      { token: "# ", type: "h1" },
      { token: "- [ ] ", type: "todo" },
      { token: "[] ", type: "todo" },
      { token: "- ", type: "bullet" },
      { token: "* ", type: "bullet" },
      { token: "1. ", type: "number" },
      { token: "> ", type: "quote" },
      { token: "! ", type: "callout" },
      { token: ">> ", type: "toggle" },
      { token: "``` ", type: "code" },
    ];
    const shortcut = shortcuts.find((item) => value === item.token);
    if (!shortcut || block.type !== "paragraph") return false;
    updateBlock(block.id, { type: shortcut.type, text: "", indent: 0 }, { historial: true });
    return true;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>, block: Block, index: number) {
    if (block.text.startsWith("/") && event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((current) => slashOptions.length ? (current + 1) % slashOptions.length : 0);
      return;
    }
    if (block.text.startsWith("/") && event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((current) => slashOptions.length ? (current - 1 + slashOptions.length) % slashOptions.length : 0);
      return;
    }
    if (event.key === "Tab" && block.type !== "divider") {
      event.preventDefault();
      const maximum = maximumIndentFor(blocks, index);
      const nextIndent = event.shiftKey ? Math.max(0, (block.indent ?? 0) - 1) : Math.min(maximum, (block.indent ?? 0) + 1);
      updateBlock(block.id, { indent: nextIndent }, { historial: true });
      return;
    }
    // Primer ⌘A selecciona el texto del bloque (comportamiento del navegador);
    // con el bloque ya entero seleccionado, el segundo pasa a los bloques.
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLocaleLowerCase() === "a") {
      const campoTexto = event.currentTarget;
      const todoElTexto = campoTexto.selectionStart === 0 && campoTexto.selectionEnd === campoTexto.value.length;
      if (todoElTexto) {
        event.preventDefault();
        campoTexto.blur();
        seleccionarTodos();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      if (selectedIds.size) moverSeleccion(event.key === "ArrowUp" ? -1 : 1);
      else moveBlock(index, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "b") {
      event.preventDefault();
      wrapSelection("**");
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "i") {
      event.preventDefault();
      wrapSelection("_");
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "e") {
      event.preventDefault();
      wrapSelection("`");
      return;
    }
    if (event.key === "Escape") {
      // Con el menú de bloque abierto (o un "/" a medio escribir) Escape sólo
      // cierra eso: `preventDefault` le avisa al panel lateral que no se cierre.
      if (blockMenuId === block.id || block.text.startsWith("/")) event.preventDefault();
      setBlockMenuId(null);
      if (block.text.startsWith("/")) updateBlock(block.id, { text: "" });
      return;
    }
    if (event.key === "Enter" && event.altKey) return;
    if (event.key === "Enter" && event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      insertChild(index);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (block.text.startsWith("/") && slashOptions.length > 0) {
        chooseSlashOption(slashOptions[Math.min(slashIndex, slashOptions.length - 1)]);
        return;
      }
      const continuingType = ["bullet", "number", "todo"].includes(block.type) ? block.type : "paragraph";
      if (!block.text && block.type !== "paragraph") {
        if ((block.indent ?? 0) > 0) {
          updateBlock(block.id, { indent: (block.indent ?? 0) - 1 }, { historial: true });
        } else {
          updateBlock(block.id, { type: "paragraph" }, { historial: true });
        }
        return;
      }
      pushHistorial();
      const next = { ...emptyBlock(continuingType), indent: block.indent ?? 0 };
      setBlocks((current) => [...current.slice(0, index + 1), next, ...current.slice(index + 1)]);
      setActiveId(next.id);
      setBlockMenuId(null);
      focusBlock(next.id, "start");
      return;
    }

    if (event.key === "Backspace" && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
      if ((block.indent ?? 0) > 0) {
        event.preventDefault();
        updateBlock(block.id, { indent: (block.indent ?? 0) - 1 }, { historial: true });
      } else if (!block.text && blocks.length > 1) {
        event.preventDefault();
        pushHistorial();
        const previous = blocks[Math.max(0, index - 1)];
        setBlocks((current) => current.filter((item) => item.id !== block.id));
        setActiveId(previous.id);
        focusBlock(previous.id);
      } else if (block.type !== "paragraph") {
        event.preventDefault();
        updateBlock(block.id, { type: "paragraph" }, { historial: true });
      }
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>, index: number) {
    const pegados = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((archivo): archivo is File => Boolean(archivo) && (archivo as File).size > 0)
      .map((archivo) => {
        if (archivo.name) return archivo;
        // Las imágenes del portapapeles llegan sin nombre; sin uno, la fila de
        // `archivos` quedaría con un nombre autogenerado poco reconocible.
        const extension = MIMES_PERMITIDOS[archivo.type] ?? ".png";
        return new File([archivo], `pegado-${Date.now()}${extension}`, { type: archivo.type });
      });
    if (pegados.length) {
      event.preventDefault();
      insertarArchivos(pegados, index);
      return;
    }

    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\n")) return;
    event.preventDefault();
    pushHistorial();
    const pasted = parseMarkdown(text);
    setBlocks((current) => [...current.slice(0, index), ...pasted, ...current.slice(index + 1)]);
    setActiveId(pasted[0].id);
    focusBlock(pasted[0].id);
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    if (!activeId) return;
    const textarea = textareas.current.get(activeId);
    const block = blocks.find((item) => item.id === activeId);
    if (!textarea || !block) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = block.text.slice(start, end) || "texto";
    const nextText = `${block.text.slice(0, start)}${prefix}${selected}${suffix}${block.text.slice(end)}`;
    terminarSesionEscritura();
    updateBlock(activeId, { text: nextText }, { historial: true });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  return (
    <section ref={raiz} className="group relative -mx-3 text-white/90">
      <input
        ref={entradaImagen}
        type="file"
        accept={ACCEPT_IMAGENES}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && destinoSubida) void subirAlBloque(file, destinoSubida.id, destinoSubida.tipo);
          event.target.value = "";
          setDestinoSubida(null);
        }}
      />
      <input
        ref={entradaArchivo}
        type="file"
        accept={ACCEPT_ARCHIVOS}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && destinoSubida) void subirAlBloque(file, destinoSubida.id, destinoSubida.tipo);
          event.target.value = "";
          setDestinoSubida(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 border-y border-white/[0.07] px-2 py-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {BLOCK_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = activeBlock?.type === option.type;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => chooseType(option.type)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1 rounded px-2 text-[10px] transition-colors",
                active ? "bg-white/[0.11] text-white/95" : "text-white/65 hover:bg-white/[0.07] hover:text-white/90"
              )}
              title={`${option.label} · ${option.hint}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.type === "paragraph" && <span>Texto</span>}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px shrink-0 bg-white/[0.07]" />
        <InlineButton disabled={!activeBlock || (activeBlock.indent ?? 0) === 0} label="Reducir nivel (Shift + Tab)" onClick={() => changeIndent(-1)}><IndentDecrease className="h-3.5 w-3.5" /></InlineButton>
        <InlineButton disabled={!activeBlock || activeBlock.type === "divider" || (activeBlock.indent ?? 0) >= activeMaximumIndent} label="Crear segundo nivel (Shift + Return o Tab)" onClick={() => changeIndent(1)}><IndentIncrease className="h-3.5 w-3.5" /></InlineButton>
        {activeBlock && (activeBlock.indent ?? 0) > 0 && (
          <span className="shrink-0 rounded-md bg-brand-500/10 px-1.5 py-1 text-[9px] font-medium text-brand-200/80">
            Nivel {(activeBlock.indent ?? 0) + 1}
          </span>
        )}
        <span className="mx-1 h-4 w-px shrink-0 bg-white/[0.07]" />
        <InlineButton label="Negrita" onClick={() => wrapSelection("**")}><Bold className="h-3.5 w-3.5" /></InlineButton>
        <InlineButton label="Cursiva" onClick={() => wrapSelection("_")}><Italic className="h-3.5 w-3.5" /></InlineButton>
        <InlineButton label="Tachado" onClick={() => wrapSelection("~~")}><Strikethrough className="h-3.5 w-3.5" /></InlineButton>
        <InlineButton label="Código" onClick={() => wrapSelection("`")}><Code2 className="h-3.5 w-3.5" /></InlineButton>
        <InlineButton label="Enlace" onClick={() => wrapSelection("[", "](https://)")}><Link2 className="h-3.5 w-3.5" /></InlineButton>
        <span className="mx-1 h-4 w-px shrink-0 bg-white/[0.07]" />
        <button
          type="button"
          onClick={() => {
            pushHistorial();
            setBlocks((current) => tidyBlocks(current));
          }}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-white/65 transition-colors hover:bg-white/[0.07] hover:text-white/95"
          title="Ordena títulos, listas, espacios y puntuación sin usar IA"
        >
          <WandSparkles className="h-3.5 w-3.5" />
          Ordenar
        </button>
        <span className="mx-1 h-4 w-px shrink-0 bg-white/[0.07]" />
        <InlineButton label="Deshacer (⌘ Z)" disabled={!historialLen} onClick={deshacer}><Undo2 className="h-3.5 w-3.5" /></InlineButton>
        <InlineButton label="Rehacer (⌘ ⇧ Z)" disabled={!futuroLen} onClick={rehacer}><Redo2 className="h-3.5 w-3.5" /></InlineButton>
      </div>

      <div
        ref={areaBloques}
        className="relative min-h-[320px] px-1 py-5 sm:px-2"
        onPointerDown={iniciarMarquesina}
        onPointerMove={moverMarquesina}
        onPointerUp={terminarMarquesina}
        onPointerCancel={terminarMarquesina}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          const archivos = archivosDelEvento(event.dataTransfer);
          if (!archivos.length) return;
          event.preventDefault();
          insertarArchivos(archivos, blocks.length - 1);
        }}
      >
        {selectedIds.size > 0 && (
          // Flotante y fuera del flujo a propósito: antes reservaba espacio
          // arriba de la lista y empujaba todo el contenido (y el bloque en el
          // que el usuario estaba mirando) hacia abajo apenas aparecía. Con
          // `absolute` no desplaza nada al aparecer o desaparecer.
          <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-2">
            <div className="pointer-events-auto flex w-max max-w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#171923]/90 px-3 py-2 shadow-[0_20px_50px_rgba(0,0,0,.45)] backdrop-blur-xl">
              <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-brand-100">
                <CheckSquare2 className="h-4 w-4 shrink-0 text-brand-300" />
                <span className="whitespace-nowrap">{selectedIds.size} bloque{selectedIds.size === 1 ? "" : "s"} seleccionado{selectedIds.size === 1 ? "" : "s"}</span>
                <span className="hidden whitespace-nowrap text-[9px] font-normal text-white/65 md:inline">⌘ clic añade · Shift clic un rango · Supr elimina</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <SelectionAction label="Subir la selección (⌘ ⇧ ↑)" onClick={() => moverSeleccion(-1)}><ArrowUp className="h-3.5 w-3.5" /></SelectionAction>
                <SelectionAction label="Bajar la selección (⌘ ⇧ ↓)" onClick={() => moverSeleccion(1)}><ArrowDown className="h-3.5 w-3.5" /></SelectionAction>
                <SelectionAction label="Duplicar selección" onClick={duplicateSelectedBlocks}><Copy className="h-3.5 w-3.5" /></SelectionAction>
                <SelectionAction danger label="Eliminar selección" onClick={deleteSelectedBlocks}><Trash2 className="h-3.5 w-3.5" /></SelectionAction>
                <SelectionAction label="Cancelar selección" onClick={clearBlockSelection}><X className="h-3.5 w-3.5" /></SelectionAction>
              </div>
            </div>
          </div>
        )}
        {marquesina && (
          <span
            className="pointer-events-none absolute z-30 rounded-sm border border-brand-400/50 bg-brand-500/10"
            style={{ left: marquesina.left, top: marquesina.top, width: marquesina.width, height: marquesina.height }}
            aria-hidden="true"
          />
        )}
        {blocks.map((block, index) => (
          <div
            key={block.id}
            ref={(element) => {
              if (element) blockElements.current.set(block.id, element);
              else blockElements.current.delete(block.id);
            }}
            onDragOver={(event) => updateDropTarget(event, block.id)}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const archivos = archivosDelEvento(event.dataTransfer);
              if (archivos.length) {
                insertarArchivos(archivos, index);
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              const position: DropPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
              dropBlock(block.id, position);
            }}
            style={{ marginLeft: `${(block.indent ?? 0) * 28}px` }}
            className={cn(
              "group/block relative flex min-h-8 items-start rounded-md transition-[opacity,transform,background-color] duration-200 hover:bg-white/[0.035]",
              draggedId === block.id && "scale-[0.985] opacity-30",
              selectedIds.has(block.id) && "bg-brand-500/10 ring-1 ring-inset ring-brand-400/20",
              block.type === "toggle" && "flex-wrap"
            )}
          >
            {(block.indent ?? 0) > 0 && <NestedLevelGuides level={block.indent ?? 0} />}
            {dropTarget?.id === block.id && draggedId !== block.id && (
              <span
                className={cn(
                  "notion-drop-line pointer-events-none absolute left-9 right-1 z-40 h-0.5 rounded-full bg-brand-400 shadow-[0_0_10px_rgba(96,165,250,.8)]",
                  dropTarget.position === "before" ? "-top-px" : "-bottom-px"
                )}
              >
                <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-brand-300 bg-[#11131c]" />
              </span>
            )}

            <div className="flex w-12 shrink-0 items-center pt-1.5 opacity-40 transition-opacity duration-150 group-hover/block:opacity-100 focus-within:opacity-100">
              {!soloLectura && (
                <button
                  type="button"
                  onClick={() => insertAfter(Math.max(-1, index - 1))}
                  className="rounded p-0.5 text-white/55 hover:bg-white/[0.08] hover:text-white/85"
                  title="Añadir bloque"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                draggable={!soloLectura}
                disabled={soloLectura}
                onDragStart={(event) => {
                  // Arrastrar un bloque ajeno a la selección la descarta: de lo
                  // contrario se moverían bloques que el usuario no tocó.
                  if (!selectedIds.has(block.id)) clearBlockSelection();
                  setDraggedId(block.id);
                  setDropTarget(null);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", block.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDropTarget(null);
                }}
                onClick={(event) => {
                  setActiveId(block.id);
                  if (event.metaKey || event.ctrlKey || event.shiftKey) {
                    selectBlock(block.id, event.metaKey || event.ctrlKey, event.shiftKey);
                    return;
                  }
                  // Primer clic selecciona (lo que el usuario espera para poder
                  // mover o borrar varios); el segundo abre las opciones.
                  if (selectedIds.size === 1 && selectedIds.has(block.id)) {
                    setBlockMenuId((current) => current === block.id ? null : block.id);
                    return;
                  }
                  selectBlock(block.id);
                }}
                className={cn(
                  "cursor-grab rounded p-0.5 text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white/90 active:cursor-grabbing",
                  draggedId === block.id && "bg-brand-500/15 text-brand-200"
                )}
                title="Arrastra para mover · clic para seleccionar · clic otra vez para opciones · ⌘/Shift clic para varios"
                aria-label="Arrastrar bloque, seleccionarlo o abrir sus opciones"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            </div>

            {blockMenuId === block.id && (
              <BlockActionsMenu
                block={block}
                index={index}
                total={blocks.length}
                maximumIndent={maximumIndentFor(blocks, index)}
                onChooseType={chooseType}
                onDuplicate={() => duplicateBlock(index)}
                onDelete={() => deleteBlock(index)}
                onMove={moveBlock}
                onIndent={(direction) => {
                  const maximum = maximumIndentFor(blocks, index);
                  updateBlock(block.id, { indent: Math.min(maximum, Math.max(0, (block.indent ?? 0) + direction)) });
                  setBlockMenuId(null);
                }}
                onAddChild={() => insertChild(index)}
                onSelect={() => selectBlock(block.id)}
              />
            )}

            <BlockPrefix block={block} blocks={blocks} index={index} onToggle={() => updateBlock(block.id, { checked: !block.checked }, { historial: true })} />

            {block.type === "archivo" ? (
              <div className="min-w-0 flex-1 py-1">
                {subiendoIds.has(block.id) ? (
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.12] bg-black/20 px-3 py-3 text-white/70">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-300" />
                    <span className="text-[11px]">Subiendo archivo…</span>
                  </div>
                ) : block.fileId ? (
                  <ArchivoAdjuntoTarjeta
                    block={block}
                    soloLectura={soloLectura}
                    onQuitar={() => deleteBlock(index)}
                  />
                ) : soloLectura ? (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.015] px-3 py-3 text-white/40">
                    <Paperclip className="h-4 w-4" />
                    <span className="text-[10px]">Sin archivo</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => pedirArchivoParaBloque(block.id, "archivo")}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/[0.2] bg-white/[0.025] px-3 py-3 text-left text-white/70 transition-colors hover:border-brand-400/50 hover:bg-brand-500/[0.08] hover:text-white"
                  >
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium">Elegir o soltar un archivo</span>
                      <span className="block text-[9px] text-white/60">PDF, Word, Excel, PowerPoint, imágenes, texto, CSV o ZIP · máximo {MAX_ARCHIVO_MB} MB</span>
                    </span>
                  </button>
                )}
                {erroresSubida[block.id] && <p className="mt-1.5 text-[10px] text-red-300/80">{erroresSubida[block.id]}</p>}
              </div>
            ) : block.type === "image" ? (
              <div className="min-w-0 flex-1 py-1">
                {subiendoIds.has(block.id) ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-black/20 text-white/70">
                    <Loader2 className="h-5 w-5 animate-spin text-brand-300" />
                    <span className="text-[11px]">Subiendo imagen…</span>
                  </div>
                ) : block.fileId ? (
                  <div className="group/image relative overflow-hidden rounded-xl border border-white/[0.1] bg-black/25">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ruta autenticada que redirige a R2 */}
                    <img
                      src={`/api/archivos/${block.fileId}`}
                      alt={block.text || block.fileName || "Imagen adjunta"}
                      className="max-h-[460px] w-full object-contain"
                    />
                    {!soloLectura && (
                      <button
                        type="button"
                        onClick={() => {
                          pushHistorial();
                          pedirArchivoParaBloque(block.id, "image");
                        }}
                        className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/65 px-2 py-1.5 text-[9px] text-white/70 opacity-0 backdrop-blur-md transition-opacity group-hover/image:opacity-100"
                      >
                        <ImagePlus className="h-3 w-3" /> Reemplazar
                      </button>
                    )}
                    <input
                      value={block.text}
                      readOnly={soloLectura}
                      onFocus={() => {
                        setActiveId(block.id);
                        clearBlockSelection();
                      }}
                      onChange={(event) => {
                        iniciarSesionEscritura(`${block.id}:caption`);
                        updateBlock(block.id, { text: event.target.value });
                      }}
                      onBlur={() => {
                        terminarSesionEscritura();
                        guardarPendiente();
                      }}
                      placeholder="Añadir una descripción…"
                      className="w-full border-t border-white/[0.09] bg-black/10 px-3 py-2 text-[10px] text-white/85 outline-none placeholder:text-white/55 read-only:cursor-default"
                    />
                  </div>
                ) : soloLectura ? (
                  <div className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.015] text-white/40">
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[10px]">Sin imagen</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => pedirArchivoParaBloque(block.id, "image")}
                    className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.2] bg-white/[0.025] text-white/70 transition-colors hover:border-brand-400/50 hover:bg-brand-500/[0.08] hover:text-white"
                  >
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-[11px] font-medium">Elegir o pegar una imagen</span>
                    <span className="text-[9px] text-white/60">PNG, JPG, WebP, GIF o AVIF · máximo {MAX_ARCHIVO_MB} MB</span>
                  </button>
                )}
                {erroresSubida[block.id] && <p className="mt-1.5 text-[10px] text-red-300/80">{erroresSubida[block.id]}</p>}
              </div>
            ) : block.type === "divider" ? (
              <button
                type="button"
                onClick={() => setActiveId(block.id)}
                className="my-4 h-px flex-1 bg-white/[0.11]"
                title="Separador"
              />
            ) : (
              <textarea
                ref={(element) => {
                  if (element) {
                    textareas.current.set(block.id, element);
                    element.style.height = "0px";
                    element.style.height = `${element.scrollHeight}px`;
                  } else {
                    textareas.current.delete(block.id);
                  }
                }}
                value={block.text}
                rows={1}
                readOnly={soloLectura}
                onFocus={() => {
                  setActiveId(block.id);
                  setBlockMenuId(null);
                  clearBlockSelection();
                }}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.startsWith("/")) setSlashIndex(0);
                  if (applyMarkdownShortcut(block, value)) {
                    // La conversión ya empujó su propio snapshot; la próxima
                    // tecla debe abrir una sesión de tecleo nueva.
                    terminarSesionEscritura();
                  } else {
                    iniciarSesionEscritura(block.id);
                    updateBlock(block.id, { text: value });
                  }
                  event.target.style.height = "0px";
                  event.target.style.height = `${event.target.scrollHeight}px`;
                }}
                onBlur={() => {
                  terminarSesionEscritura();
                  guardarPendiente();
                }}
                onKeyDown={(event) => onKeyDown(event, block, index)}
                onPaste={(event) => onPaste(event, index)}
                placeholder={block.text === "" ? placeholderForBlock(block.type, placeholder) : undefined}
                className={cn(
                  "min-h-8 flex-1 resize-none overflow-hidden border-0 bg-transparent px-1 py-1 text-white/95 outline-none placeholder:text-transparent placeholder:transition-colors placeholder:duration-150 group-hover:placeholder:text-white/50 group-focus-within:placeholder:text-white/50",
                  block.type === "h1" && "text-[25px] font-bold leading-tight tracking-[-0.025em]",
                  block.type === "h2" && "text-xl font-semibold leading-tight tracking-[-0.018em]",
                  block.type === "h3" && "text-base font-semibold leading-snug",
                  block.type === "paragraph" && "text-[13px] leading-6",
                  block.type === "bullet" && "text-[13px] leading-6",
                  block.type === "number" && "text-[13px] leading-6",
                  block.type === "todo" && cn("text-[13px] leading-6", block.checked && "text-white/55 line-through"),
                  block.type === "toggle" && "text-[13px] font-medium leading-6",
                  block.type === "quote" && "text-[13px] italic leading-6 text-white/80",
                  block.type === "callout" && "text-[13px] leading-6 text-white/90",
                  block.type === "code" && "rounded-md bg-black/25 px-3 py-2 font-mono text-[12px] leading-5 text-blue-100/95"
                )}
              />
            )}

            {block.type === "toggle" && block.checked && (
              <textarea
                ref={(element) => {
                  const key = `${block.id}:body`;
                  if (element) {
                    textareas.current.set(key, element);
                    element.style.height = "0px";
                    element.style.height = `${Math.max(64, element.scrollHeight)}px`;
                  } else {
                    textareas.current.delete(key);
                  }
                }}
                value={block.body ?? ""}
                rows={2}
                readOnly={soloLectura}
                onFocus={() => setBlockMenuId(null)}
                onChange={(event) => {
                  iniciarSesionEscritura(`${block.id}:body`);
                  updateBlock(block.id, { body: event.target.value });
                  event.target.style.height = "0px";
                  event.target.style.height = `${Math.max(64, event.target.scrollHeight)}px`;
                }}
                onBlur={() => {
                  terminarSesionEscritura();
                  guardarPendiente();
                }}
                placeholder="Contenido del desplegable…"
                className="mb-2 ml-12 min-h-16 min-w-0 flex-1 basis-[calc(100%-3rem)] resize-none border-l border-white/[0.12] bg-transparent px-4 py-2 text-[12px] leading-5 text-white/85 outline-none placeholder:text-white/50"
              />
            )}

            {block.id === activeId && block.text.startsWith("/") && (
              <div className="absolute left-10 top-10 z-40 w-[390px] max-w-[calc(100vw-5.5rem)] overflow-hidden rounded-2xl border border-white/[0.14] bg-[#171923]/[0.98] shadow-[0_24px_80px_rgba(0,0,0,.72)] backdrop-blur-2xl">
                <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
                  <Search className="h-4 w-4 shrink-0 text-white/70" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-white/85">
                      {slashQuery ? `Buscar “${activeBlock?.text.slice(1)}”` : "Insertar un bloque"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/65">Escribe para filtrar o usa las flechas</p>
                  </div>
                  <kbd className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/70">ESC</kbd>
                </div>

                <div className="scrollbar-glass max-h-[400px] overflow-y-auto px-2 py-2">
                  {BLOCK_CATEGORIES.map((category) => {
                    const options = slashOptions.filter((option) => option.category === category);
                    if (!options.length) return null;
                    return (
                      <div key={category} className="mb-2 last:mb-0">
                        <p className="px-2.5 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/65">{category}</p>
                        {options.map((option) => {
                          const Icon = option.icon;
                          const optionIndex = slashOptions.findIndex((item) => item.id === option.id);
                          const selected = optionIndex === slashIndex;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onMouseEnter={() => setSlashIndex(optionIndex)}
                              onClick={() => chooseSlashOption(option)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                                selected ? "bg-brand-500/15 text-white" : "text-white/80 hover:bg-white/[0.07]"
                              )}
                            >
                              <span className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                                selected ? "border-brand-400/25 bg-brand-500/15 text-brand-200" : "border-white/10 bg-white/[0.045] text-white/65"
                              )}>
                                <Icon className="h-[17px] w-[17px]" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[12px] font-medium leading-5 text-white/90">{option.label}</span>
                                <span className="block truncate text-[10px] leading-4 text-white/70">{option.hint}</span>
                              </span>
                              {option.shortcut && <kbd className="shrink-0 rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[9px] text-white/65">{option.shortcut}</kbd>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {slashOptions.length === 0 && (
                    <div className="px-4 py-10 text-center">
                      <Search className="mx-auto h-5 w-5 text-white/55" />
                      <p className="mt-2 text-[12px] font-medium text-white/85">No encontramos ese bloque</p>
                      <p className="mt-1 text-[10px] text-white/65">Prueba con “título”, “lista” o “aviso”.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.08] bg-black/10 px-4 py-2 text-[9px] text-white/65">
                  <span>⇧ ↵ crea un subnivel</span>
                  <span className="flex items-center gap-1.5"><CornerDownLeft className="h-3 w-3" /> Enter para insertar</span>
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => insertAfter(blocks.length - 1)}
          className="ml-12 mt-2 flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-white/55 opacity-0 transition duration-150 hover:bg-white/[0.06] hover:text-white/85 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir bloque
        </button>
      </div>

      {(guardando || guardado || error) && (
        <div className="flex min-h-9 items-center gap-2 px-3 py-2">
          {guardando && (
            <span className="flex items-center gap-1 text-[10px] text-white/55">
              <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
            </span>
          )}
          {!guardando && guardado && !error && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-300/80">
              <Check className="h-3 w-3" /> Guardado
            </span>
          )}
          {error && (
            <>
              <span className="text-[10px] text-red-300/85">{error}</span>
              <button
                type="button"
                onClick={guardarPendiente}
                className="rounded-md px-2 py-1 text-[10px] text-white/70 underline-offset-2 hover:bg-white/[0.07] hover:text-white hover:underline"
              >
                Reintentar
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ArchivoAdjuntoTarjeta({
  block,
  soloLectura,
  onQuitar,
}: {
  block: Block;
  soloLectura: boolean;
  onQuitar: () => void;
}) {
  const Icono = iconoParaMime(block.fileMime);
  const tamano = formatearTamano(block.fileSize);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-white/[0.16]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-400/20 bg-brand-500/10 text-brand-200">
        <Icono className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-white/90">{block.fileName ?? "Archivo adjunto"}</p>
        <p className="mt-0.5 text-[10px] text-white/60">
          {etiquetaTipoArchivo(block.fileMime)}{tamano ? ` · ${tamano}` : ""}
        </p>
      </div>
      <a
        href={`/api/archivos/${block.fileId}`}
        target="_blank"
        rel="noreferrer"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2 text-[10px] text-white/75 transition-colors hover:bg-white/[0.1] hover:text-white"
      >
        <Download className="h-3 w-3" />
        Descargar
      </a>
      {!soloLectura && (
        <button
          type="button"
          onClick={onQuitar}
          title="Quitar el archivo de las notas"
          aria-label="Quitar el archivo de las notas"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-red-400/10 hover:text-red-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function InlineButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/65 hover:bg-white/[0.07] hover:text-white/95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-white/65"
      title={label}
    >
      {children}
    </button>
  );
}

function SelectionAction({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        danger ? "text-red-300/70 hover:bg-red-400/10 hover:text-red-200" : "text-white/55 hover:bg-white/[0.08] hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function BlockActionsMenu({
  block,
  index,
  total,
  maximumIndent,
  onChooseType,
  onDuplicate,
  onDelete,
  onMove,
  onIndent,
  onAddChild,
  onSelect,
}: {
  block: Block;
  index: number;
  total: number;
  maximumIndent: number;
  onChooseType: (type: BlockType) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onIndent: (direction: -1 | 1) => void;
  onAddChild: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className="absolute left-9 top-8 z-30 w-[245px] rounded-xl border border-white/10 bg-[#11131c] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.6)]"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/65">Convertir en</p>
      <div className="scrollbar-glass max-h-[220px] overflow-y-auto">
        {BLOCK_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.type === block.type;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => onChooseType(option.type)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.055]",
                active && "bg-white/[0.045]"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-brand-300" : "text-white/65")} />
              <span className="flex-1 text-[11px] text-white/90">{option.label}</span>
              {active && <Check className="h-3.5 w-3.5 text-brand-300" />}
            </button>
          );
        })}
      </div>
      <div className="my-1 h-px bg-white/[0.07]" />
      <MenuAction label="Seleccionar bloque" onClick={onSelect}><CheckSquare2 className="h-3.5 w-3.5" /></MenuAction>
      <div className="my-1 h-px bg-white/[0.07]" />
      {block.type !== "divider" && (
        <div className="grid grid-cols-2 gap-1">
          <MenuAction disabled={(block.indent ?? 0) === 0} label="Nivel anterior" onClick={() => onIndent(-1)}><IndentDecrease className="h-3.5 w-3.5" /></MenuAction>
          <MenuAction disabled={(block.indent ?? 0) >= maximumIndent} label="Siguiente nivel" onClick={() => onIndent(1)}><IndentIncrease className="h-3.5 w-3.5" /></MenuAction>
          <div className="col-span-2">
            <MenuAction disabled={(block.indent ?? 0) >= 3} label="Crear sub-bloque" onClick={onAddChild}><Plus className="h-3.5 w-3.5" /></MenuAction>
          </div>
        </div>
      )}
      <div className="my-1 h-px bg-white/[0.07]" />
      <div className="grid grid-cols-2 gap-1">
        <MenuAction disabled={index === 0} label="Subir" onClick={() => onMove(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></MenuAction>
        <MenuAction disabled={index === total - 1} label="Bajar" onClick={() => onMove(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></MenuAction>
        <MenuAction label="Duplicar" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></MenuAction>
        <MenuAction danger label="Eliminar" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></MenuAction>
      </div>
    </div>
  );
}

function MenuAction({
  label,
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-25",
        danger ? "text-red-300/85 hover:bg-red-400/10" : "text-white/70 hover:bg-white/[0.07] hover:text-white"
      )}
    >
      {children}
      {label}
    </button>
  );
}

function NestedLevelGuides({ level }: { level: number }) {
  return (
    <span className="pointer-events-none absolute inset-y-0 left-0" aria-hidden="true">
      {Array.from({ length: level }).map((_, guide) => (
        <span
          key={guide}
          className="absolute inset-y-0 w-px bg-white/[0.075]"
          style={{ left: `${-((level - guide) * 28) + 14}px` }}
        />
      ))}
    </span>
  );
}

function BlockPrefix({
  block,
  blocks,
  index,
  onToggle,
}: {
  block: Block;
  blocks: Block[];
  index: number;
  onToggle: () => void;
}) {
  if (block.type === "bullet") {
    const level = (block.indent ?? 0) % 3;
    return (
      <span className={cn(
        "mt-[10px] h-1.5 w-1.5 shrink-0",
        level === 0 && "rounded-full bg-white/65",
        level === 1 && "rounded-full border border-white/65 bg-transparent",
        level === 2 && "rounded-[1px] bg-white/55"
      )} />
    );
  }
  if (block.type === "number") {
    return <span className="w-6 shrink-0 pt-[5px] text-right text-[12px] font-medium text-white/75">{displayNumberForBlock(blocks, index)}</span>;
  }
  if (block.type === "todo") {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={Boolean(block.checked)}
        aria-label={block.checked ? "Marcar tarea como pendiente" : "Marcar tarea como hecha"}
        onClick={onToggle}
        className={cn(
          "mt-[7px] flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          block.checked ? "border-brand-400/40 bg-brand-700 text-white" : "border-white/20 text-transparent hover:border-white/35"
        )}
      >
        <Check className="h-3 w-3" />
      </button>
    );
  }
  if (block.type === "toggle") {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="mt-[7px] flex h-4 w-4 shrink-0 items-center justify-center rounded text-white/70 hover:bg-white/[0.08] hover:text-white"
        title={block.checked ? "Contraer" : "Expandir"}
      >
        <TrianguloDesplegable abierto={Boolean(block.checked)} />
      </button>
    );
  }
  if (block.type === "quote") {
    return <span className="mr-2 min-h-8 w-0.5 shrink-0 rounded-full bg-white/25" />;
  }
  if (block.type === "callout") {
    return (
      <span className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-400/10 text-amber-200/70">
        <Lightbulb className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (block.type === "code") {
    return <Code2 className="mr-2 mt-2 h-3.5 w-3.5 shrink-0 text-blue-300/40" />;
  }
  return null;
}
