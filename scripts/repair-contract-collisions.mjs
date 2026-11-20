#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PACKAGE = path.join(ROOT, "PAQUETE_AVALA_COMPLETO");
const BACKUP_DIR = path.join(ROOT, "audit-backups", "contracts-general-2026-09-06");
const APPLY = process.argv.includes("--apply");
const EMIT = process.argv.find((arg) => arg.startsWith("--emit-backup="))?.split("=")[1];

const UUID_NAMESPACE = "6ca7b810-9dad-11d1-80b4-00c04fd430c8";
const REPAIRED_KEY = "mutuo|CAVALADIPIER";
const EMPTY_AMBIGUOUS_KEY = "mutuo|NUEVOMUTUO";

const SPECS = [
  {
    type: "personal",
    file: "CONTRATOS DE PERSONAL",
    title: "Nombre",
    // Estado es una fórmula temporal en Notion y cambió entre exportaciones;
    // persona, propietario y fechas sí identifican establemente cada fila.
    match: ["Nombre", "Fecha de vencimiento", "Personal MBP", "Fecha inicio (organizacion)", "Propietarios MBP"],
  },
  {
    type: "servicios",
    file: "Contratos MBP-OTROS",
    title: "Servicio",
    match: ["Servicio", "Fecha de legalizacion", "Vencimiento", "Inicio (guia para orden)", "Monto", "contratante/arrendador", "Contratistas (posible relacion)", "adenda"],
  },
  {
    type: "mutuo",
    file: "Contratos mutuos",
    title: "Nombre",
    match: ["Nombre", "Fecha de Contrato", "Monto", "Acreedor", "Deudor", "Firma legalizada"],
  },
  {
    type: "arrendamiento",
    file: "CONTRATOS DE ARRENDAMIENTO VEHICULAR",
    title: "PLACA.FECHA",
    match: ["PLACA.FECHA", "Fecha de Inicio", "Fecha de termino", "Monto", "Vehiculos MBP", "Arrendatario"],
  },
  {
    type: "profesional",
    file: "Contratos profesionales",
    title: "Nombre",
    match: ["Nombre", "Inicio", "Vencimiento", "Monto", "Propietarios ALI", "Profesional"],
  },
];

const DATE_FIELDS = new Set([
  "Fecha de vencimiento", "Fecha inicio (organizacion)", "Vencimiento",
  "Inicio (guia para orden)", "Fecha de Contrato", "Fecha de Inicio",
  "Fecha de termino", "Inicio",
]);

const ROLE_BY_HEADER = new Map([
  ["ACREEDOR", "acreedor"],
  ["DEUDOR", "deudor"],
  ["ARRENDATARIO", "arrendatario"],
  ["ARRENDATARIOS", "arrendatario"],
  ["CONTRATANTE ARRENDADOR", "arrendador"],
  ["PROPIETARIOS ALI", "propietario"],
  ["PROPIETARIOS MBP", "propietario"],
  ["PROPIETARIOS", "propietario"],
]);

function fail(message) {
  throw new Error(message);
}

function unwrap(result, label) {
  if (result.error) fail(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

function withoutMarks(value) {
  return String(value ?? "").normalize("NFD").split("").filter((char) => {
    const code = char.codePointAt(0);
    return code < 0x300 || code > 0x36f;
  }).join("");
}

function hardKey(value) {
  return withoutMarks(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function cleanNotionId(value) {
  const id = String(value ?? "").replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(id) ? id : null;
}

function bytesFromUuid(uuid) {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function uuidFromBytes(bytes) {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuid5(namespace, name) {
  const digest = createHash("sha1").update(Buffer.concat([bytesFromUuid(namespace), Buffer.from(name)])).digest().subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return uuidFromBytes(digest);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])))
    .filter((item) => Object.values(item).some(Boolean));
}

function stripRelationTarget(value) {
  return String(value ?? "")
    .replace(/\s+\((?:https?:\/\/|(?:\.\.\/)+|[^\s()]+%)[^\n]*?\.(?:csv|md)(?:\?[^)]*)?\)/gi, "")
    .trim();
}

const MONTHS = new Map([
  ["ENERO", 1], ["FEBRERO", 2], ["MARZO", 3], ["ABRIL", 4],
  ["MAYO", 5], ["JUNIO", 6], ["JULIO", 7], ["AGOSTO", 8],
  ["SETIEMBRE", 9], ["SEPTIEMBRE", 9], ["OCTUBRE", 10],
  ["NOVIEMBRE", 11], ["DICIEMBRE", 12],
]);

function isoDate(value) {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const normalized = withoutMarks(raw).toUpperCase();
  const natural = normalized.match(/(\d{1,2})\s+(?:DE\s+)?([A-Z]+)\s+(?:DE\s+)?(\d{4})/);
  if (!natural || !MONTHS.has(natural[2])) return hardKey(raw);
  return `${natural[3]}-${String(MONTHS.get(natural[2])).padStart(2, "0")}-${natural[1].padStart(2, "0")}`;
}

function currency(value) {
  const normalized = withoutMarks(value).toUpperCase();
  if (normalized.includes("DOLAR") || normalized.includes("USD") || normalized.includes("US$")) return "USD";
  if (normalized.includes("SOL") || normalized.includes("S/") || normalized.includes("PEN")) return "PEN";
  return null;
}

function amount(value) {
  let raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.includes("\n")) raw = raw.split("\n").find((line) => /\d/.test(line)) ?? raw;
  const mil = raw.match(/(-?\d+(?:[.,]\d+)?)\s*MIL\b/i);
  if (mil) {
    const parsed = Number(mil[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed * 1000;
  }
  let numeric = raw.replace(/[^\d,.-]/g, "");
  if (!numeric || /^[-.,]+$/.test(numeric)) return null;
  if (numeric.includes(",") && numeric.includes(".")) numeric = numeric.replace(/,/g, "");
  else if ((numeric.match(/,/g) ?? []).length === 1 && numeric.split(",").at(-1).length <= 2) numeric = numeric.replace(",", ".");
  else numeric = numeric.replace(/,/g, "");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function comparable(field, value) {
  if (field === "Monto") return `${amount(value) ?? ""}|${currency(value) ?? ""}`;
  if (DATE_FIELDS.has(field)) return isoDate(value);
  return hardKey(stripRelationTarget(value));
}

function signature(spec, record) {
  return JSON.stringify(spec.match.map((field) => comparable(field, record[field] ?? "")));
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function parsePage(text, knownHeaders) {
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  const props = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^:\n]+):\s*(.*)$/);
    const header = match?.[1]?.trim();
    if (match && knownHeaders.has(header)) {
      props[header] = match[2].trim();
      current = header;
    } else if (!line.trim()) {
      current = null;
    } else if (current) {
      props[current] += `\n${line.trim()}`;
    }
  }
  return { heading, props, text };
}

function matchUniqueBySignature(spec, left, right, leftRecord, rightRecord, label) {
  const rightGroups = groupBy(right, (item) => signature(spec, rightRecord(item)));
  const result = new Map();
  for (const item of left) {
    const key = signature(spec, leftRecord(item));
    const candidates = rightGroups.get(key) ?? [];
    if (candidates.length !== 1) fail(`${label}: firma con ${candidates.length} candidatos para ${key}`);
    result.set(item, candidates[0]);
  }
  if (new Set(result.values()).size !== left.length) fail(`${label}: el cruce no es uno a uno`);
  return result;
}

async function readSources() {
  const data = [];
  for (const spec of SPECS) {
    const fullPath = path.join(PACKAGE, "01_TABLAS", "CSV_COMPLETO_NOTION", "Contratos", `${spec.file}_all.csv`);
    const cleanPath = path.join(PACKAGE, "01_TABLAS", "CSV_LIMPIO", `${spec.file}.csv`);
    const pageDir = path.join(PACKAGE, "03_CONTENIDO_PAGINAS", "Contratos", spec.file);
    const documentDir = path.join(PACKAGE, "02_DOCUMENTOS", "Contratos", spec.file);
    const full = parseCsv(await readFile(fullPath, "utf8")).filter((row) => row[spec.title]);
    const clean = parseCsv(await readFile(cleanPath, "utf8")).filter((row) => row[spec.title]);
    const knownHeaders = new Set(Object.keys(full[0] ?? {}));
    const pages = [];
    for (const filename of await readdir(pageDir)) {
      if (!filename.endsWith(".md")) continue;
      const pagePath = path.join(pageDir, filename);
      pages.push({ filename, pagePath, ...parsePage(await readFile(pagePath, "utf8"), knownHeaders) });
    }
    data.push({ spec, full, clean, pages, documentDir });
  }
  return data;
}

function expectedCore(spec, row) {
  const pick = (...names) => names.map((name) => row[name]).find((value) => String(value ?? "").trim()) ?? null;
  const legalRaw = spec.type === "servicios" ? pick("LEGALIZACIÓN")
    : spec.type === "mutuo" ? pick("Legalizacion")
      : pick("Legalizado", "Legalizacion");
  const legalKey = hardKey(legalRaw);
  const legal = legalKey === "SI" ? "SI"
    : legalKey === "NO" ? "NO"
      : ["ENNOTARIA", "NOTARIA"].includes(legalKey) ? "Notaria"
        : null;
  const textoLegalizacion = spec.type === "servicios" ? pick("Fecha de legalizacion")
    : spec.type === "mutuo" ? pick("Firma legalizada")
      : null;
  const money = amount(row.Monto);
  return {
    nameKey: hardKey(row[spec.title]),
    amount: money,
    currency: money == null ? null : currency(row.Monto),
    start: isoDate(pick("Fecha de Inicio", "Inicio", "Fecha de Contrato", "Fecha inicio (organizacion)", "Inicio (guia para orden)")) || null,
    end: isoDate(pick("Vencimiento", "Fecha de vencimiento", "Fecha de termino")) || null,
    legal: hardKey(legal),
    textoLegalizacion: hardKey(textoLegalizacion),
  };
}

function assertCoreMatches(spec, source, contract, label) {
  const expected = expectedCore(spec, source);
  const actualAmount = contract.monto == null ? null : Number(contract.monto);
  const errors = [];
  if (expected.nameKey !== hardKey(contract.nombre)) errors.push("nombre");
  if (expected.amount !== actualAmount) errors.push(`monto ${expected.amount}/${actualAmount}`);
  if (expected.currency && expected.currency !== contract.moneda) errors.push(`moneda ${expected.currency}/${contract.moneda}`);
  if ((expected.start || null) !== (contract.fecha_inicio || null)) errors.push(`inicio ${expected.start}/${contract.fecha_inicio}`);
  if ((expected.end || null) !== (contract.fecha_vencimiento || null)) errors.push(`vencimiento ${expected.end}/${contract.fecha_vencimiento}`);
  if (expected.legal !== hardKey(contract.legalizado)) errors.push("legalización");
  const claveTexto = spec.type === "mutuo" ? "Firma legalizada" : spec.type === "servicios" ? "Fecha de legalizacion" : null;
  if (claveTexto && expected.textoLegalizacion !== hardKey(contract.extra?.[claveTexto])) errors.push(claveTexto);
  if (errors.length) fail(`${label}: no coincide ${errors.join(", ")}`);
}

function linkKey(link) {
  return [link.origen_tipo, link.origen_id, link.destino_tipo, link.destino_id, link.rol ?? ""].join("|");
}

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function resolveUnicodePath(base, relativePath) {
  let current = path.resolve(base);
  for (const segment of relativePath.split(/[\\/]+/).filter(Boolean)) {
    const entries = await readdir(current);
    const wanted = segment.normalize("NFC").trimEnd();
    const actual = entries.find((entry) => entry.normalize("NFC").trimEnd() === wanted);
    if (!actual) return path.resolve(base, relativePath);
    current = path.join(current, actual);
  }
  return current;
}

async function attachmentsFromPage(page, documentDir) {
  const attachments = [];
  const seen = new Set();
  for (const line of page.text.split(/\r?\n/)) {
    const match = line.match(/\[[^\]]*\]\((.+)\)\s*$/);
    if (!match) continue;
    const href = match[1].split("#", 1)[0];
    if (!href || /^https?:/i.test(href) || href.endsWith(".md") || href.includes("../")) continue;
    let decoded;
    try { decoded = decodeURIComponent(href); } catch { decoded = href; }
    const filePath = await resolveUnicodePath(documentDir, decoded);
    if (!filePath.startsWith(`${path.resolve(documentDir)}${path.sep}`)) fail(`Ruta fuera de Contratos: ${href}`);
    let fileStat;
    try { fileStat = await stat(filePath); } catch { fail(`Adjunto no encontrado: ${filePath}`); }
    if (!fileStat.isFile() || seen.has(filePath)) continue;
    seen.add(filePath);
    attachments.push({
      sourcePath: path.relative(ROOT, filePath),
      name: path.basename(filePath),
      sha256: await hashFile(filePath),
    });
  }
  return attachments;
}

function relationReferences(page) {
  const references = [];
  for (const line of page.text.split(/\r?\n/)) {
    const match = line.match(/^([^:\n]+):\s*(.*?)\s+\((.+\.md(?:\?[^)]*)?)\)\s*$/);
    if (!match) continue;
    const [, header, label, href] = match;
    if (!href.includes("../")) continue;
    const normalizedPath = withoutMarks(decodeURIComponent(href)).toUpperCase();
    const entityType = normalizedPath.includes("PROPIETARIOS") ? "propietario"
      : normalizedPath.includes("PERSONAL") ? "personal"
        : normalizedPath.includes("VEHICULOS") ? "vehiculo" : null;
    if (!entityType) continue;
    const notionId = cleanNotionId(href.match(/[0-9a-f]{32}/i)?.[0]);
    references.push({ header, label, href, entityType, notionId, role: ROLE_BY_HEADER.get(withoutMarks(header).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()) ?? null });
  }
  return references;
}

async function loadDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) fail("Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const contracts = unwrap(await db.from("contratos").select("*").is("eliminado_en", null), "leer contratos");
  const [owners, people, vehicles] = await Promise.all([
    db.from("propietarios").select("id,notion_id,nombre").is("eliminado_en", null),
    db.from("personal").select("id,notion_id,nombre").is("eliminado_en", null),
    db.from("vehiculos").select("id,notion_id,placa").is("eliminado_en", null),
  ]);
  return {
    db,
    contracts,
    related: {
      propietario: unwrap(owners, "leer propietarios").map((row) => ({ ...row, display: row.nombre })),
      personal: unwrap(people, "leer personal").map((row) => ({ ...row, display: row.nombre })),
      vehiculo: unwrap(vehicles, "leer vehículos").map((row) => ({ ...row, display: row.placa })),
    },
  };
}

function resolveRelated(reference, related) {
  const rows = related[reference.entityType];
  const byId = reference.notionId ? rows.filter((row) => cleanNotionId(row.notion_id) === reference.notionId) : [];
  if (byId.length === 1) return byId[0];
  const byName = rows.filter((row) => hardKey(row.display) === hardKey(reference.label));
  if (byName.length === 1) return byName[0];
  fail(`No se resolvió ${reference.entityType} "${reference.label}" (${byId.length} por ID, ${byName.length} por nombre)`);
}

async function buildPlan(database, sources) {
  const dbGroups = groupBy(database.contracts, (row) => `${row.tipo}|${hardKey(row.nombre)}`);
  const collisionKeys = new Set([...dbGroups].filter(([, rows]) => rows.length > 1).map(([key]) => key));
  const sourceBundles = new Map();

  for (const source of sources) {
    const { spec } = source;
    const fullGroups = groupBy(source.full, (row) => `${spec.type}|${hardKey(row[spec.title])}`);
    const pageGroups = groupBy(source.pages, (page) => `${spec.type}|${hardKey(page.heading)}`);
    const cleanGroups = groupBy(source.clean, (row) => `${spec.type}|${hardKey(row[spec.title])}`);
    for (const key of collisionKeys) {
      if (!key.startsWith(`${spec.type}|`)) continue;
      const fullRows = fullGroups.get(key) ?? [];
      const contracts = dbGroups.get(key) ?? [];
      if (fullRows.length !== contracts.length) fail(`${key}: ${fullRows.length} filas fuente y ${contracts.length} contratos`);
      const generatedIds = new Set(fullRows.slice(1).map((_, index) => uuid5(UUID_NAMESPACE, `CONTRATOS|${key.split("|")[1]}#${index + 1}`)));
      const firstCandidates = contracts.filter((row) => !generatedIds.has(row.id));
      if (firstCandidates.length !== 1) fail(`${key}: no se identificó la primera fila ETL`);
      const contractByFull = new Map([[fullRows[0], firstCandidates[0]]]);
      fullRows.slice(1).forEach((row, index) => {
        const id = uuid5(UUID_NAMESPACE, `CONTRATOS|${key.split("|")[1]}#${index + 1}`);
        const contract = contracts.find((item) => item.id === id);
        if (!contract) fail(`${key}: falta UUID ETL ${id}`);
        contractByFull.set(row, contract);
      });
      for (const [full, contract] of contractByFull) assertCoreMatches(spec, full, contract, `${key}/${contract.id}`);

      if (key === EMPTY_AMBIGUOUS_KEY) {
        sourceBundles.set(key, { key, spec, contracts, fullRows, contractByFull, pages: [], pageByFull: new Map(), attachments: [], identities: [], links: [], skipped: "tres filas vacías sin firma diferenciadora" });
        continue;
      }

      const pages = pageGroups.get(key) ?? [];
      if (pages.length !== fullRows.length) fail(`${key}: ${pages.length} páginas y ${fullRows.length} filas fuente`);
      const fullByPage = matchUniqueBySignature(spec, pages, fullRows, (page) => ({ ...page.props, [spec.title]: page.heading }), (row) => row, `${key}/páginas`);
      const pageByFull = new Map([...fullByPage].map(([page, full]) => [full, page]));
      const attachments = [];
      const desiredLinkMap = new Map();
      for (const full of fullRows) {
        const contract = contractByFull.get(full);
        const page = pageByFull.get(full);
        for (const attachment of await attachmentsFromPage(page, source.documentDir)) attachments.push({ ...attachment, ownerId: contract.id, page: page.filename });
        for (const reference of relationReferences(page)) {
          const target = resolveRelated(reference, database.related);
          for (const link of [
            { origen_tipo: "contrato", origen_id: contract.id, destino_tipo: reference.entityType, destino_id: target.id, rol: reference.role, resuelto_por: "notion_id" },
            { origen_tipo: reference.entityType, origen_id: target.id, destino_tipo: "contrato", destino_id: contract.id, rol: reference.role, resuelto_por: "notion_id" },
          ]) desiredLinkMap.set(linkKey(link), { id: uuid5(UUID_NAMESPACE, linkKey(link)), ...link });
        }
      }

      const cleanRows = cleanGroups.get(key) ?? [];
      let identities = [];
      let identitySkip = null;
      if (cleanRows.length === fullRows.length) {
        try {
          const cleanByFull = matchUniqueBySignature(spec, fullRows, cleanRows, (row) => row, (row) => row, `${key}/IDs limpios`);
          identities = fullRows.map((full) => ({
            contractId: contractByFull.get(full).id,
            notionId: cleanNotionId(cleanByFull.get(full)._notion_id),
          }));
          if (identities.some((item) => !item.notionId)) fail(`${key}: ID limpio inválido`);
        } catch (error) {
          identitySkip = error.message;
        }
      } else {
        identitySkip = `${cleanRows.length} IDs limpios para ${fullRows.length} filas`;
      }
      sourceBundles.set(key, {
        key, spec, contracts, fullRows, contractByFull, pages, pageByFull,
        attachments, identities, links: [...desiredLinkMap.values()], identitySkip,
      });
    }
  }

  if (sourceBundles.size !== collisionKeys.size) {
    const missing = [...collisionKeys].filter((key) => !sourceBundles.has(key));
    fail(`No se encontraron fuentes para: ${missing.join(", ")}`);
  }

  const fileBundles = [...sourceBundles.values()].filter((bundle) => bundle.key !== REPAIRED_KEY && bundle.key !== EMPTY_AMBIGUOUS_KEY);
  const affectedIds = fileBundles.flatMap((bundle) => bundle.contracts.map((row) => row.id));
  const currentFiles = affectedIds.length ? unwrap(
    await database.db.from("archivos").select("*").eq("entidad_tipo", "contrato").in("entidad_id", affectedIds),
    "leer archivos afectados",
  ) : [];
  const activeFiles = currentFiles.filter((row) => !row.eliminado_en);
  const desiredAttachments = fileBundles.flatMap((bundle) => bundle.attachments);
  const activeByHash = groupBy(activeFiles, (row) => row.sha256);
  const desiredByHash = groupBy(desiredAttachments, (row) => row.sha256);
  const fileCountDiffs = [];
  for (const hash of new Set([...activeByHash.keys(), ...desiredByHash.keys()])) {
    const before = activeByHash.get(hash)?.length ?? 0;
    const after = desiredByHash.get(hash)?.length ?? 0;
    if (before !== after) fileCountDiffs.push({ hash, before, after });
  }
  if (fileCountDiffs.some((item) => item.before > item.after)) {
    fail(`Hay archivos actuales sin contraparte fuente: ${JSON.stringify(fileCountDiffs.filter((item) => item.before > item.after))}`);
  }
  if (activeFiles.some((row) => /carga-app|manual|upload/i.test(row.ruta_origen ?? ""))) fail("Se detectó una carga manual dentro del alcance");

  const usedFileIds = new Set();
  const fileMoves = [];
  const fileClones = [];
  for (const desired of desiredAttachments) {
    const candidates = activeByHash.get(desired.sha256) ?? [];
    let source = candidates.find((row) => !usedFileIds.has(row.id) && row.entidad_id === desired.ownerId);
    source ??= candidates.find((row) => !usedFileIds.has(row.id));
    if (source) {
      usedFileIds.add(source.id);
      if (source.entidad_id !== desired.ownerId) fileMoves.push({ fileId: source.id, fromOwnerId: source.entidad_id, toOwnerId: desired.ownerId, sha256: desired.sha256 });
    } else {
      const template = candidates[0];
      if (!template) fail(`El hash ${desired.sha256} no existe en la base/R2`);
      fileClones.push({ template, ownerId: desired.ownerId, sourcePath: desired.sourcePath });
    }
  }
  const unused = activeFiles.filter((row) => !usedFileIds.has(row.id));
  if (unused.length) fail(`Quedaron ${unused.length} archivos actuales sin asignar`);

  const identityBundles = [...sourceBundles.values()].filter((bundle) => bundle.key !== REPAIRED_KEY && bundle.identities.length);
  const identities = identityBundles.flatMap((bundle) => bundle.identities);
  if (new Set(identities.map((item) => item.notionId)).size !== identities.length) fail("IDs de Notion deseados repetidos");
  const desiredIds = identities.map((item) => item.notionId);
  const identityContractIds = new Set(identities.map((item) => item.contractId));
  const conflicts = desiredIds.length ? database.contracts.filter((row) => row.notion_id && desiredIds.includes(cleanNotionId(row.notion_id)) && !identityContractIds.has(row.id)) : [];
  if (conflicts.length) fail(`IDs de Notion ocupados fuera del alcance: ${conflicts.map((row) => row.id).join(",")}`);

  const desiredLinks = fileBundles.flatMap((bundle) => bundle.links);
  const currentOutbound = affectedIds.length ? unwrap(await database.db.from("vinculos").select("*").eq("origen_tipo", "contrato").in("origen_id", affectedIds), "leer vínculos salientes") : [];
  const currentInbound = affectedIds.length ? unwrap(await database.db.from("vinculos").select("*").eq("destino_tipo", "contrato").in("destino_id", affectedIds), "leer vínculos entrantes") : [];
  const currentLinks = [...new Map([...currentOutbound, ...currentInbound].map((row) => [row.id, row])).values()];
  const mutableLinks = currentLinks.filter((row) => row.origen_tipo !== "contrato" || row.destino_tipo !== "contrato")
    .filter((row) => row.origen_tipo !== "contrato" ? row.origen_tipo !== "contrato" && row.destino_tipo === "contrato" : row.destino_tipo !== "contrato");
  const manualLinks = mutableLinks.filter((row) => !["notion_id", "nombre"].includes(row.resuelto_por));
  if (manualLinks.length) fail(`Se detectaron ${manualLinks.length} vínculos no migratorios; se aborta`);

  return {
    sourceBundles,
    fileBundles,
    affectedIds,
    identityContractIds: [...identityContractIds],
    currentFiles,
    activeFiles,
    desiredAttachments,
    fileMoves,
    fileClones,
    fileCountDiffs,
    identities,
    desiredLinks: [...new Map(desiredLinks.map((row) => [linkKey(row), row])).values()],
    currentLinks,
    mutableLinks,
  };
}

function report(plan) {
  return {
    collisionGroups: plan.sourceBundles.size,
    fileRepairGroups: plan.fileBundles.length,
    affectedContracts: plan.affectedIds.length,
    identitiesToSet: plan.identities.length,
    filesBefore: plan.activeFiles.length,
    filesExpected: plan.desiredAttachments.length,
    fileMoves: plan.fileMoves.length,
    fileClones: plan.fileClones.length,
    fileCountDiffs: plan.fileCountDiffs.map((item) => ({ hash: item.hash.slice(0, 12), before: item.before, after: item.after })),
    linksBefore: plan.mutableLinks.length,
    linksExpected: plan.desiredLinks.length,
    groups: [...plan.sourceBundles.values()].map((bundle) => ({
      key: bundle.key,
      contracts: bundle.contracts.length,
      attachments: bundle.attachments.length,
      identity: bundle.identities.length ? "recuperada" : `sin cambio: ${bundle.identitySkip ?? bundle.skipped}`,
      skipped: bundle.key === REPAIRED_KEY ? "ya reparado" : bundle.skipped ?? null,
    })),
  };
}

async function loadBackup() {
  const read = async (name) => JSON.parse(await readFile(path.join(BACKUP_DIR, `${name}.json`), "utf8"));
  return { contracts: await read("contracts"), files: await read("files"), links: await read("links") };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function preflightBackup(database, plan, backup) {
  const contracts = database.contracts.filter((row) => plan.affectedIds.includes(row.id));
  if (!sameJson(contracts.sort((a, b) => a.id.localeCompare(b.id)), [...backup.contracts].sort((a, b) => a.id.localeCompare(b.id)))) fail("Los contratos cambiaron después del respaldo");
  if (!sameJson([...plan.currentFiles].sort((a, b) => a.id.localeCompare(b.id)), [...backup.files].sort((a, b) => a.id.localeCompare(b.id)))) fail("Los archivos cambiaron después del respaldo");
  if (!sameJson([...plan.currentLinks].sort((a, b) => a.id.localeCompare(b.id)), [...backup.links].sort((a, b) => a.id.localeCompare(b.id)))) fail("Los vínculos cambiaron después del respaldo");
}

async function restore(database, plan, backup) {
  const linksNowOut = unwrap(await database.db.from("vinculos").select("id").eq("origen_tipo", "contrato").in("origen_id", plan.affectedIds), "leer vínculos para rollback");
  const linksNowIn = unwrap(await database.db.from("vinculos").select("id").eq("destino_tipo", "contrato").in("destino_id", plan.affectedIds), "leer vínculos para rollback");
  const linkIds = [...new Set([...linksNowOut, ...linksNowIn].map((row) => row.id))];
  if (linkIds.length) unwrap(await database.db.from("vinculos").delete().in("id", linkIds).select("id"), "limpiar vínculos para rollback");
  if (backup.links.length) unwrap(await database.db.from("vinculos").insert(backup.links).select("id"), "restaurar vínculos");

  const filesNow = unwrap(await database.db.from("archivos").select("id").eq("entidad_tipo", "contrato").in("entidad_id", plan.affectedIds), "leer archivos para rollback");
  if (filesNow.length) unwrap(await database.db.from("archivos").delete().in("id", filesNow.map((row) => row.id)).select("id"), "limpiar archivos para rollback");
  if (backup.files.length) unwrap(await database.db.from("archivos").insert(backup.files).select("id"), "restaurar archivos");

  const backedUpById = new Map(backup.contracts.map((row) => [row.id, row]));
  for (const id of plan.identityContractIds) {
    const row = backedUpById.get(id);
    unwrap(await database.db.from("contratos").update({ notion_id: null }).eq("id", id).select("id"), `liberar ID ${id} para rollback`);
    row._restore = true;
  }
  for (const id of plan.identityContractIds) {
    const row = backedUpById.get(id);
    unwrap(await database.db.from("contratos").update({ notion_id: row.notion_id, extra: row.extra }).eq("id", id).select("id"), `restaurar contrato ${id}`);
  }
}

async function applyRepair(database, plan, backup) {
  await preflightBackup(database, plan, backup);
  try {
    for (const id of plan.identityContractIds) unwrap(await database.db.from("contratos").update({ notion_id: null }).eq("id", id).select("id"), `liberar notion_id ${id}`);
    const contractById = new Map(database.contracts.map((row) => [row.id, row]));
    for (const identity of plan.identities) {
      const extra = { ...(contractById.get(identity.contractId).extra ?? {}) };
      delete extra._duplicado_de_notion_id;
      unwrap(await database.db.from("contratos").update({ notion_id: identity.notionId, extra }).eq("id", identity.contractId).select("id"), `actualizar identidad ${identity.contractId}`);
    }

    for (const move of plan.fileMoves) unwrap(await database.db.from("archivos").update({ entidad_id: move.toOwnerId }).eq("id", move.fileId).select("id"), `mover archivo ${move.fileId}`);
    for (const clone of plan.fileClones) {
      const { id: _id, entidad_id: _owner, ruta_origen: _route, ...template } = clone.template;
      unwrap(await database.db.from("archivos").insert({ id: randomUUID(), ...template, entidad_id: clone.ownerId, ruta_origen: clone.sourcePath }).select("id"), `duplicar asociación ${clone.template.sha256}`);
    }

    if (plan.mutableLinks.length) unwrap(await database.db.from("vinculos").delete().in("id", plan.mutableLinks.map((row) => row.id)).select("id"), "reemplazar vínculos colisionados");
    if (plan.desiredLinks.length) unwrap(await database.db.from("vinculos").insert(plan.desiredLinks).select("id"), "insertar vínculos correctos");
  } catch (error) {
    await restore(database, plan, backup);
    throw new Error(`La reparación falló y se restauró el respaldo: ${error.message}`);
  }
}

async function verify(database, sources, beforePlan) {
  const refreshed = await loadDatabase();
  const afterPlan = await buildPlan(refreshed, sources);
  if (afterPlan.fileMoves.length || afterPlan.fileClones.length) fail(`Verificación: aún hay ${afterPlan.fileMoves.length} movimientos y ${afterPlan.fileClones.length} copias pendientes`);
  for (const identity of afterPlan.identities) {
    const contract = refreshed.contracts.find((row) => row.id === identity.contractId);
    if (cleanNotionId(contract?.notion_id) !== identity.notionId || contract?.extra?._duplicado_de_notion_id) fail(`Verificación de identidad falló en ${identity.contractId}`);
  }
  const expectedLinks = new Set(afterPlan.desiredLinks.map(linkKey));
  const actualLinks = new Set(afterPlan.mutableLinks.map(linkKey));
  if (expectedLinks.size !== actualLinks.size || [...expectedLinks].some((key) => !actualLinks.has(key))) fail("Verificación de vínculos falló");
  return report(afterPlan);
}

const database = await loadDatabase();
const sources = await readSources();
const plan = await buildPlan(database, sources);

if (EMIT) {
  const allowed = new Set(["contracts", "files", "links"]);
  if (!allowed.has(EMIT)) fail(`Parte de respaldo inválida: ${EMIT}`);
  const value = EMIT === "contracts" ? database.contracts.filter((row) => plan.affectedIds.includes(row.id))
    : EMIT === "files" ? plan.currentFiles : plan.currentLinks;
  console.log(JSON.stringify(value, null, 2));
} else if (!APPLY) {
  console.log(JSON.stringify(report(plan), null, 2));
  console.log("Simulación correcta. No se modificó la base de datos.");
} else {
  const backup = await loadBackup();
  await applyRepair(database, plan, backup);
  const verified = await verify(database, sources, plan);
  console.log(JSON.stringify(verified, null, 2));
  console.log("Reparación general aplicada y verificada.");
}
