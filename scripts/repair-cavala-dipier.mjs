#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const BACKUP_URL = new URL("../audit-backups/cavala-dipier-2026-09-06-before.json", import.meta.url);

const CAVALA_ID = "1f701c25-72c1-5c51-98e4-fbeced55089f";
const DIPIER_ID = "6621de39-ad54-588f-9904-eb67a245bee3";

const CONTRACTS = [
  {
    id: "526f890f-3531-5171-b9a2-d739d06410d4",
    amount: 100000,
    date: "2025-04-13",
    notionId: "2eda32ff62bb8009a00ee90adbd26659",
    creditor: DIPIER_ID,
    debtor: CAVALA_ID,
  },
  {
    id: "10187197-da78-5254-a775-49977b9da92d",
    amount: 20000,
    date: "2025-05-13",
    notionId: "2f0a32ff62bb80099aaef28831bc31ae",
    creditor: DIPIER_ID,
    debtor: CAVALA_ID,
  },
  {
    id: "daa7adf3-3dfe-5e7b-a5ad-aa42652b528e",
    amount: 160000,
    date: "2025-08-13",
    notionId: "2eda32ff62bb80ec88eec51c763e0d10",
    creditor: CAVALA_ID,
    debtor: DIPIER_ID,
  },
  {
    id: "159b4be2-1aa5-53da-875f-af7844e5a316",
    amount: 5000,
    date: "2026-06-25",
    notionId: "38aa32ff62bb80a09a7de7da54b89e32",
    creditor: CAVALA_ID,
    debtor: DIPIER_ID,
  },
  {
    id: "045e9bdc-3163-5a9f-877d-9486d35fcf9c",
    amount: 5000,
    date: "2026-06-26",
    notionId: "38ca32ff62bb809bae3ccc0435368dc4",
    creditor: CAVALA_ID,
    debtor: DIPIER_ID,
  },
  {
    id: "7fd734d9-3bc3-5d25-b3b0-bcebc67daad6",
    amount: 5000,
    date: "2026-06-30",
    notionId: "38fa32ff62bb805cb1b8db8eba539a21",
    creditor: CAVALA_ID,
    debtor: DIPIER_ID,
  },
  {
    id: "272d3bee-6e00-53ce-a6c7-b199e525d458",
    amount: 5000,
    date: "2026-07-02",
    notionId: "391a32ff62bb80c1b8d2edef564c003c",
    creditor: CAVALA_ID,
    debtor: DIPIER_ID,
  },
  {
    id: "db91d427-10d0-55a3-991a-1846a9fab3d5",
    amount: 3300,
    date: "2026-07-03",
    notionId: "393a32ff62bb80779e57c9ec32a48a4c",
    creditor: CAVALA_ID,
    debtor: DIPIER_ID,
  },
  {
    id: "d13b66b9-962c-5371-ba17-536c60b14cd3",
    amount: 3000,
    date: "2026-07-06",
    notionId: "395a32ff62bb80118913e5716ab8621b",
    creditor: CAVALA_ID,
    debtor: DIPIER_ID,
  },
];

const FILE_OWNER = new Map([
  ["e6e14c7f1c4d4cf7acf27a765f4461886290da8c6e8567673980ab75df059a53", CONTRACTS[0].id],
  ["a25df1fb8e8ff7dffe9be71df59247576c7b9c7fcd6e1d0a01f8e31dd77fae1f", CONTRACTS[1].id],
  ["fa2845c4bbbb4433650d511496738d7bbb855b7dfddb0dd16088adb5a0c7ace4", CONTRACTS[2].id],
  ["ff479185bcc63c12f365473ac1e3c3f04d5ab196c0eaede1c487305669b8d339", CONTRACTS[3].id],
  ["c8d3f67629fe18b4f1ece54c02ebb244900e2205e53a9650461202438aefbd98", CONTRACTS[3].id],
  ["648c28c32ec842217d3b6b0b26057c5692b4c51c88d6d7e39367daadb66eedd7", CONTRACTS[4].id],
  ["45d04574918a4911eef1f17b98a6fb1ea42d22b30c499467bc6743170896f958", CONTRACTS[4].id],
  ["d7550b86b9dba558f0d106b1d17c6c6537b8843b5e61379d64bccae260f033a0", CONTRACTS[5].id],
  ["0a5cd8b39091ad0e796cda884acec40bf02dfd7278cd9fa6ecf712d18dd2aa60", CONTRACTS[5].id],
  ["7f1c314b3bbe92edd342ae6e2e0e9676688486e18c720dfcbb4a4da502ac7a8d", CONTRACTS[6].id],
  ["dca9e7630cc0e522ccdabf80a0984acb819c86e3c698228f98d0f0bc64ec21f0", CONTRACTS[6].id],
  ["ec17032420831aeaace7b77106f70751c28e6bb3d38d17723f79bb468262865f", CONTRACTS[7].id],
  ["9e8b0517dc468ba76bb60e4b6f969592c14efd750c8e08f944bb3f6dd024ce5b", CONTRACTS[7].id],
  ["4a22fc15290bb28cd2e0264038444e2cf2833183d85b5eeb78f6bc213a26456c", CONTRACTS[7].id],
  ["8e5bdd31485c00a897690b85812d413ce0fa4511fb0e58f70473b930271e411b", CONTRACTS[7].id],
  ["be6f53f30144483221051ed769fce3ab7e239819ea255eac6241f231d2c9623e", CONTRACTS[8].id],
  ["6afa4fc858431ee3365f7bee420c79e92ad354f7183c9118f22e9f196f2166f4", CONTRACTS[8].id],
]);

const CONTRACT_IDS = CONTRACTS.map((contract) => contract.id);
const DESIRED_NOTION_IDS = CONTRACTS.map((contract) => contract.notionId);

function fail(message) {
  throw new Error(message);
}

function unwrap(result, label) {
  if (result.error) fail(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

function linkKey(link) {
  return [link.origen_tipo, link.origen_id, link.destino_tipo, link.destino_id, link.rol ?? ""].join("|");
}

function desiredLinks() {
  const links = [];
  for (const contract of CONTRACTS) {
    for (const [ownerId, role] of [[contract.creditor, "acreedor"], [contract.debtor, "deudor"]]) {
      links.push({
        origen_tipo: "contrato",
        origen_id: contract.id,
        destino_tipo: "propietario",
        destino_id: ownerId,
        rol: role,
        resuelto_por: "notion_id",
      });
      links.push({
        origen_tipo: "propietario",
        origen_id: ownerId,
        destino_tipo: "contrato",
        destino_id: contract.id,
        rol: role,
        resuelto_por: "notion_id",
      });
    }
  }
  return links;
}

async function loadState(db) {
  const [contractsResult, filesResult, outboundResult, inboundResult] = await Promise.all([
    db.from("contratos").select("*").in("id", CONTRACT_IDS),
    db.from("archivos").select("*").eq("entidad_tipo", "contrato").in("entidad_id", CONTRACT_IDS),
    db.from("vinculos").select("*").eq("origen_tipo", "contrato").in("origen_id", CONTRACT_IDS),
    db.from("vinculos").select("*").eq("destino_tipo", "contrato").in("destino_id", CONTRACT_IDS),
  ]);
  return {
    contracts: unwrap(contractsResult, "leer contratos"),
    files: unwrap(filesResult, "leer archivos"),
    links: [
      ...unwrap(outboundResult, "leer vínculos salientes"),
      ...unwrap(inboundResult, "leer vínculos entrantes"),
    ],
  };
}

function assertSameIds(actual, expected, label) {
  const left = actual.map((row) => row.id).sort().join(",");
  const right = expected.map((row) => row.id).sort().join(",");
  if (left !== right) fail(`${label} cambió después del respaldo; se aborta sin tocar datos`);
}

async function preflight(db, backup) {
  const state = await loadState(db);
  assertSameIds(state.contracts, backup.contracts, "El conjunto de contratos");
  assertSameIds(state.files, backup.files, "El conjunto de archivos");
  assertSameIds(state.links, backup.links, "El conjunto de vínculos");

  if (state.contracts.length !== 9) fail(`Se esperaban 9 contratos y hay ${state.contracts.length}`);
  if (state.files.length !== 18) fail(`Se esperaban 18 asociaciones previas de archivos y hay ${state.files.length}`);
  if (state.links.length !== 8) fail(`Se esperaban 8 vínculos concentrados y hay ${state.links.length}`);

  for (const expected of CONTRACTS) {
    const actual = state.contracts.find((row) => row.id === expected.id);
    if (!actual || actual.nombre !== "CAVALA-DIPIER" || actual.tipo !== "mutuo") {
      fail(`El contrato ${expected.id} ya no coincide con el alcance esperado`);
    }
    if (Number(actual.monto) !== expected.amount || actual.fecha_inicio !== expected.date) {
      fail(`Monto o fecha inesperados en ${expected.id}`);
    }
    const before = backup.contracts.find((row) => row.id === expected.id);
    if (actual.notion_id !== before.notion_id || JSON.stringify(actual.extra) !== JSON.stringify(before.extra)) {
      fail(`La identidad del contrato ${expected.id} cambió después del respaldo`);
    }
  }

  for (const file of state.files) {
    const before = backup.files.find((row) => row.id === file.id);
    if (!before || file.entidad_id !== before.entidad_id || file.sha256 !== before.sha256 ||
        file.r2_key !== before.r2_key || file.eliminado_en !== before.eliminado_en) {
      fail(`El archivo ${file.id} cambió después del respaldo`);
    }
    if (!FILE_OWNER.has(file.sha256)) fail(`Hash fuera del inventario esperado: ${file.sha256}`);
  }

  const hashCounts = new Map();
  for (const file of state.files) hashCounts.set(file.sha256, (hashCounts.get(file.sha256) ?? 0) + 1);
  for (const hash of FILE_OWNER.keys()) {
    const expectedCount = hash.startsWith("be6f53f3") ? 2 : 1;
    if (hashCounts.get(hash) !== expectedCount) fail(`Conteo previo inesperado para ${hash}`);
  }

  const conflictResult = await db
    .from("contratos")
    .select("id, notion_id")
    .in("notion_id", DESIRED_NOTION_IDS)
    .not("id", "in", `(${CONTRACT_IDS.join(",")})`);
  const conflicts = unwrap(conflictResult, "buscar conflictos de notion_id");
  if (conflicts.length) fail("Uno de los IDs reales de Notion ya pertenece a otro contrato");

  const owners = unwrap(
    await db.from("propietarios").select("id, nombre").in("id", [CAVALA_ID, DIPIER_ID]),
    "leer propietarios"
  );
  if (owners.length !== 2 || owners.find((row) => row.id === CAVALA_ID)?.nombre !== "INVERSIONES CAVALA" ||
      owners.find((row) => row.id === DIPIER_ID)?.nombre !== "CONSORCIO DIPIER") {
    fail("Los propietarios Cavala/Dipier no coinciden con los IDs auditados");
  }

  return state;
}

async function deleteLinks(db, links) {
  if (!links.length) return;
  unwrap(await db.from("vinculos").delete().in("id", links.map((link) => link.id)).select("id"), "eliminar vínculos");
}

async function restore(db, backup) {
  const current = await loadState(db);
  await deleteLinks(db, current.links);
  if (backup.links.length) unwrap(await db.from("vinculos").insert(backup.links).select("id"), "restaurar vínculos");

  if (current.files.length) {
    unwrap(await db.from("archivos").delete().in("id", current.files.map((file) => file.id)).select("id"), "limpiar archivos para restauración");
  }
  unwrap(await db.from("archivos").insert(backup.files).select("id"), "restaurar archivos");

  for (const before of backup.contracts) {
    unwrap(
      await db.from("contratos").update({ notion_id: before.notion_id, extra: before.extra }).eq("id", before.id).select("id").single(),
      `restaurar contrato ${before.id}`
    );
  }
}

async function repair(db, state) {
  for (const expected of CONTRACTS) {
    const current = state.contracts.find((row) => row.id === expected.id);
    const extra = { ...(current.extra ?? {}) };
    delete extra._duplicado_de_notion_id;
    unwrap(
      await db.from("contratos").update({ notion_id: expected.notionId, extra }).eq("id", expected.id).select("id").single(),
      `actualizar identidad ${expected.id}`
    );
  }

  const duplicatedHash = "be6f53f30144483221051ed769fce3ab7e239819ea255eac6241f231d2c9623e";
  for (const [hash, ownerId] of FILE_OWNER) {
    const matches = state.files.filter((file) => file.sha256 === hash);
    if (hash === duplicatedHash) {
      const correct = matches.find((file) => file.entidad_id === ownerId && file.ruta_origen === "carga-app");
      const wrong = matches.find((file) => file.entidad_id !== ownerId);
      if (!correct || !wrong || matches.length !== 2) fail("No se pudo distinguir de forma segura el PDF manual de S/3,000");
      unwrap(await db.from("archivos").delete().eq("id", wrong.id).select("id").single(), "quitar asociación duplicada incorrecta");
      continue;
    }

    const file = matches[0];
    if (!file || matches.length !== 1) fail(`No hay una única asociación para ${hash}`);
    if (file.entidad_id === ownerId) continue;
    unwrap(
      await db.from("archivos").update({ entidad_id: ownerId }).eq("id", file.id).select("id").single(),
      `reasignar archivo ${file.id}`
    );
  }

  const desired = desiredLinks();
  const desiredKeys = new Set(desired.map(linkKey));
  const currentByKey = new Map(state.links.map((link) => [linkKey(link), link]));
  const extras = state.links.filter((link) => !desiredKeys.has(linkKey(link)));
  await deleteLinks(db, extras);

  const missing = desired
    .filter((link) => !currentByKey.has(linkKey(link)))
    .map((link) => ({ id: randomUUID(), ...link }));
  if (missing.length) unwrap(await db.from("vinculos").insert(missing).select("id"), "crear vínculos correctos");
}

async function verify(db) {
  const state = await loadState(db);
  if (state.contracts.length !== 9) fail("Verificación: no hay exactamente 9 contratos");
  if (state.files.length !== 17) fail(`Verificación: se esperaban 17 archivos y hay ${state.files.length}`);

  for (const expected of CONTRACTS) {
    const contract = state.contracts.find((row) => row.id === expected.id);
    if (contract?.notion_id !== expected.notionId || contract?.extra?._duplicado_de_notion_id !== undefined) {
      fail(`Verificación: identidad incorrecta en ${expected.id}`);
    }
  }

  const filesByHash = new Map();
  for (const file of state.files) {
    if (filesByHash.has(file.sha256)) fail(`Verificación: hash duplicado ${file.sha256}`);
    filesByHash.set(file.sha256, file);
  }
  for (const [hash, ownerId] of FILE_OWNER) {
    const file = filesByHash.get(hash);
    if (!file || file.entidad_id !== ownerId || file.eliminado_en !== null) {
      fail(`Verificación: dueño incorrecto para ${hash}`);
    }
  }

  const desiredKeys = new Set(desiredLinks().map(linkKey));
  const actualKeys = new Set(state.links.map(linkKey));
  if (actualKeys.size !== 36 || desiredKeys.size !== 36 || [...desiredKeys].some((key) => !actualKeys.has(key))) {
    fail(`Verificación: vínculos incorrectos (${actualKeys.size}/36)`);
  }

  const counts = Object.fromEntries(CONTRACTS.map((contract) => [contract.id, 0]));
  for (const file of state.files) counts[file.entidad_id] += 1;
  const summary = CONTRACTS.map((contract) => ({
    id: contract.id,
    monto: contract.amount,
    fecha: contract.date,
    archivos: counts[contract.id],
    notion_id: contract.notionId,
    acreedor: contract.creditor === CAVALA_ID ? "INVERSIONES CAVALA" : "CONSORCIO DIPIER",
    deudor: contract.debtor === CAVALA_ID ? "INVERSIONES CAVALA" : "CONSORCIO DIPIER",
  }));
  const expectedCounts = [1, 1, 1, 2, 2, 2, 2, 4, 2];
  if (summary.some((row, index) => row.archivos !== expectedCounts[index])) {
    fail(`Verificación: distribución inesperada ${summary.map((row) => row.archivos).join("/")}`);
  }
  return summary;
}

const backup = JSON.parse(await readFile(BACKUP_URL, "utf8"));
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const state = await preflight(db, backup);
console.log("Preflight correcto: 9 contratos, 18 asociaciones previas, 17 hashes y 8 vínculos respaldados.");

if (!APPLY) {
  console.log("Simulación terminada. No se modificó la base. Usa --apply para ejecutar la reparación.");
  process.exit(0);
}

let mutationStarted = false;
try {
  mutationStarted = true;
  await repair(db, state);
  const summary = await verify(db);
  console.log(JSON.stringify({ ok: true, contracts: summary }, null, 2));
} catch (error) {
  console.error(`Falló la reparación: ${error instanceof Error ? error.message : String(error)}`);
  if (mutationStarted) {
    try {
      await restore(db, backup);
      await preflight(db, backup);
      console.error("Rollback verificado: la base quedó exactamente en el estado respaldado.");
    } catch (rollbackError) {
      console.error(`ALERTA: también falló el rollback: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
  }
  process.exit(1);
}
