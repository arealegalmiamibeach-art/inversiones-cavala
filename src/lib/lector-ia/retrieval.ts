import type { LectorDocument } from "@/lib/lector-ia/types";

const STOP_WORDS = new Set([
  "a", "al", "algo", "como", "con", "cual", "cuando", "de", "del", "el", "en", "es", "esta",
  "este", "hay", "la", "las", "lo", "los", "me", "menciona", "para", "por", "que", "se", "si",
  "sobre", "su", "sus", "un", "una", "y",
]);

const SYNONYM_GROUPS = [
  ["alquiler", "arrendamiento", "renta"],
  ["posesion", "ocupacion", "tenencia"],
  ["penalidad", "multa", "sancion"],
  ["resolucion", "terminacion", "rescision"],
  ["vigencia", "plazo", "duracion"],
  ["monto", "importe", "precio", "valor"],
  ["obligacion", "deber", "compromiso"],
  ["propietario", "titular", "dueno"],
  ["trabajador", "empleado", "personal"],
  ["inmueble", "predio", "terreno", "propiedad"],
  ["proceso", "expediente", "juicio"],
] as const;

type ContextChunk = {
  document: string;
  documentIndex: number;
  page: number;
  text: string;
  score: number;
  order: number;
  words: string[];
  normalized: string;
};

function normalizedText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedWords(text: string) {
  return normalizedText(text)
    .split(" ")
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

function stemWord(word: string) {
  if (word.length < 5) return word;
  return word
    .replace(/(amientos|imiento|aciones|adores|adoras|amiento|imientos|acion|idades|idad|mente)$/u, "")
    .replace(/(es|os|as|s)$/u, "");
}

function searchWords(text: string) {
  return normalizedWords(text).map(stemWord).filter((word) => word.length >= 2);
}

function overlapTail(text: string, overlap: number) {
  if (text.length <= overlap) return text;
  const tail = text.slice(-overlap);
  const boundary = tail.search(/\s/);
  return boundary >= 0 ? tail.slice(boundary + 1) : tail;
}

function tableChunks(paragraph: string, size: number) {
  const lines = paragraph.split("\n");
  if (lines.length < 3 || !lines[0].trim().startsWith("|")
    || !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[1])
    || lines.slice(2).some((line) => !line.trim().startsWith("|"))) return null;

  const header = lines.slice(0, 2).join("\n");
  const chunks: string[] = [];
  let current = header;
  for (const row of lines.slice(2)) {
    // Use the bounded text splitter if a single row exceeds the chunk budget.
    if (header.length + row.length + 1 > size) return null;
    if (current !== header && current.length + row.length + 1 > size) {
      chunks.push(current);
      current = header;
    }
    // Keep each code with its definition and repeat column names in each chunk.
    current += `\n${row}`;
  }
  if (current !== header) chunks.push(current);
  return chunks;
}

function pageChunks(text: string, size = 2_400, overlap = 280) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (!current.trim()) return;
    chunks.push(current.trim());
    current = overlapTail(current, overlap);
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      const table = tableChunks(paragraph, size);
      if (table) {
        chunks.push(...table);
        continue;
      }
      const step = size - overlap;
      for (let start = 0; start < paragraph.length; start += step) {
        chunks.push(paragraph.slice(start, start + size).trim());
        if (start + size >= paragraph.length) break;
      }
      continue;
    }

    if (current && current.length + paragraph.length + 2 > size) flush();
    if (current.length + paragraph.length + 2 > size) current = "";
    current += `${current ? "\n\n" : ""}${paragraph}`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function isOverview(question: string) {
  const text = normalizedText(question);
  return /\b(resume|resumen|resumir|sintesis|panorama|explica|explicar|analiza|analizar|compara|comparar|comparacion|diferencias|puntos principales|documento completo)\b/.test(text);
}

function expandedTerms(question: string) {
  const originals = Array.from(new Set(normalizedWords(question)));
  const weighted = new Map<string, number>();
  for (const original of originals) {
    const originalStem = stemWord(original);
    weighted.set(originalStem, 1);
    for (const group of SYNONYM_GROUPS) {
      if (!group.some((term) => stemWord(term) === originalStem)) continue;
      for (const synonym of group) {
        const term = stemWord(synonym);
        if (!weighted.has(term)) weighted.set(term, 0.55);
      }
    }
  }
  return { originals, weighted };
}

function applyBm25Scores(chunks: ContextChunk[], question: string) {
  const { originals, weighted } = expandedTerms(question);
  if (chunks.length === 0 || weighted.size === 0) return;
  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of new Set(chunk.words)) {
      if (weighted.has(term)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const averageLength = chunks.reduce((sum, chunk) => sum + chunk.words.length, 0) / chunks.length || 1;
  const phrase = originals.join(" ");
  const k1 = 1.35;
  const b = 0.72;
  for (const chunk of chunks) {
    const frequencies = new Map<string, number>();
    for (const word of chunk.words) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    let score = 0;
    let covered = 0;
    for (const [term, weight] of weighted) {
      const frequency = frequencies.get(term) ?? 0;
      if (frequency === 0) continue;
      if (weight === 1) covered += 1;
      const frequencyInDocuments = documentFrequency.get(term) ?? 0;
      const inverseFrequency = Math.log(1 + (chunks.length - frequencyInDocuments + 0.5) / (frequencyInDocuments + 0.5));
      const normalizedFrequency = frequency * (k1 + 1)
        / (frequency + k1 * (1 - b + b * chunk.words.length / averageLength));
      score += weight * inverseFrequency * normalizedFrequency;
    }
    if (phrase.length > 2 && chunk.normalized.includes(phrase)) score += 4;
    if (originals.length > 1 && covered === originals.length) score += 2;
    chunk.score = score;
  }
}

function nearDuplicate(candidate: ContextChunk, selected: ContextChunk[]) {
  const candidateWords = new Set(candidate.words);
  if (candidateWords.size === 0) return false;
  const candidateValues = new Set(candidate.text.match(/(?:S\/\s*)?\b\d[\d.,/-]{2,}\b/gi) ?? []);
  return selected.some((chunk) => {
    if (chunk.documentIndex !== candidate.documentIndex) return false;
    const existingValues = new Set(chunk.text.match(/(?:S\/\s*)?\b\d[\d.,/-]{2,}\b/gi) ?? []);
    if (candidateValues.size !== existingValues.size || [...candidateValues].some((value) => !existingValues.has(value))) return false;
    const existingWords = new Set(chunk.words);
    let shared = 0;
    for (const word of candidateWords) if (existingWords.has(word)) shared += 1;
    const sizeRatio = Math.min(candidateWords.size, existingWords.size) / Math.max(candidateWords.size, existingWords.size);
    const union = candidateWords.size + existingWords.size - shared;
    return sizeRatio >= 0.65 && shared / union >= 0.82;
  });
}

function representativeOrder(chunks: ContextChunk[]) {
  if (chunks.length <= 2) return chunks;
  const sampleSize = Math.min(8, chunks.length);
  const indexes = Array.from({ length: sampleSize }, (_, index) => Math.round(index * (chunks.length - 1) / (sampleSize - 1)));
  const relevant = [...chunks].filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  // A summary can also ask for specific figures; keep those before broad samples.
  const preferred = [...relevant, ...indexes.map((index) => chunks[index])];
  const preferredOrders = new Set(preferred.map((chunk) => chunk.order));
  return [...preferred, ...chunks.filter((chunk) => !preferredOrders.has(chunk.order))];
}

function overviewOrder(chunks: ContextChunk[]) {
  const groups = new Map<number, ContextChunk[]>();
  for (const chunk of chunks) {
    const group = groups.get(chunk.documentIndex) ?? [];
    group.push(chunk);
    groups.set(chunk.documentIndex, group);
  }
  const representatives = Array.from(groups.values()).map(representativeOrder);
  const ordered: ContextChunk[] = [];
  const longest = Math.max(0, ...representatives.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of representatives) {
      if (group[index]) ordered.push(group[index]);
    }
  }
  return ordered;
}

function focusedOrder(chunks: ContextChunk[]) {
  const ranked = [...chunks].sort((a, b) => b.score - a.score || a.order - b.order);
  const bestPerDocument = new Map<number, ContextChunk>();
  for (const chunk of ranked) {
    if (chunk.score > 0 && !bestPerDocument.has(chunk.documentIndex)) bestPerDocument.set(chunk.documentIndex, chunk);
  }
  const first = Array.from(bestPerDocument.values()).sort((a, b) => b.score - a.score);
  const used = new Set(first.map((chunk) => chunk.order));
  return [...first, ...ranked.filter((chunk) => !used.has(chunk.order))];
}

export function selectDocumentContext(documents: LectorDocument[], question: string, maxChars = 58_000) {
  const chunks: ContextChunk[] = [];
  const signatures = new Set<string>();
  let order = 0;

  documents.forEach((document, documentIndex) => {
    for (const page of document.pages) {
      for (const text of pageChunks(page.markdown)) {
        const normalized = normalizedText(text);
        const signature = `${documentIndex}:${normalized}`;
        if (!normalized || signatures.has(signature)) continue;
        signatures.add(signature);
        chunks.push({
          document: document.name,
          documentIndex,
          page: page.page,
          text,
          score: 0,
          order: order++,
          words: searchWords(text),
          normalized,
        });
      }
    }
  });

  applyBm25Scores(chunks, question);

  const ordered = isOverview(question)
    ? overviewOrder(chunks)
    : focusedOrder(chunks);

  const chosen: ContextChunk[] = [];
  const selectedOrders = new Set<number>();
  let length = 0;
  for (const chunk of ordered) {
    if (selectedOrders.has(chunk.order) || nearDuplicate(chunk, chosen)) continue;
    const addition = chunk.text.length + chunk.document.length + 80;
    if (length + addition > maxChars && chosen.length > 0) continue;
    chosen.push(chunk);
    selectedOrders.add(chunk.order);
    length += addition;
    if (length >= maxChars) break;
  }

  return chosen
    .map((chunk) => `--- FUENTE: ${chunk.document} | PÁGINA: ${chunk.page} ---\n${chunk.text}`)
    .join("\n\n");
}
