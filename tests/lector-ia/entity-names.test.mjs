import assert from "node:assert/strict";
import { test } from "node:test";
import { ENTITY_NAME_CHUNK, resolveLectorEntityNames } from "../../src/lib/lector-ia/entity-names.ts";

// PostgREST mete los ids de `.in()` en la URL y pasados ~396 UUIDs responde
// 400. El cliente falso falla antes, con margen, igual que en relaciones-lotes.
const MAX_IDS_EN_URL = 350;

function clienteFalso(tablas, { fallarEn } = {}) {
  const tamanosIn = [];
  return {
    tamanosIn,
    from(tabla) {
      let ids = [];
      const consulta = {
        select: () => consulta,
        in(_columna, valores) {
          ids = valores;
          tamanosIn.push(valores.length);
          return consulta;
        },
        then(resolver, rechazar) {
          if (ids.length > MAX_IDS_EN_URL || fallarEn?.(tabla, ids)) {
            return Promise.resolve({ data: null, error: { message: "Bad Request" } }).then(resolver, rechazar);
          }
          const set = new Set(ids);
          const data = (tablas[tabla] ?? []).filter((fila) => set.has(fila.id));
          return Promise.resolve({ data, error: null }).then(resolver, rechazar);
        },
      };
      return consulta;
    },
  };
}

test("resuelve el nombre de todas las fichas aunque sean más de las que caben en una URL", async () => {
  // Hoy hay 881 documentos con archivos: con lotes de 500 el primero fallaba.
  const documentos = Array.from({ length: 881 }, (_, i) => ({ id: `doc-${i}`, nombre: `Escritura ${i}` }));
  const contratos = Array.from({ length: 251 }, (_, i) => ({ id: `con-${i}`, nombre: `Contrato ${i}` }));
  const archivos = [
    ...documentos.map((d) => ({ entidad_tipo: "documento", entidad_id: d.id })),
    ...contratos.map((c) => ({ entidad_tipo: "contrato", entidad_id: c.id })),
    { entidad_tipo: "documento", entidad_id: "doc-0" },
    { entidad_tipo: null, entidad_id: null },
  ];
  const cliente = clienteFalso({ documentos, contratos });

  const nombres = await resolveLectorEntityNames(cliente, archivos);

  assert.equal(nombres.size, 881 + 251);
  assert.equal(nombres.get("documento:doc-880"), "Escritura 880");
  assert.equal(nombres.get("contrato:con-0"), "Contrato 0");
  assert.ok(Math.max(...cliente.tamanosIn) <= ENTITY_NAME_CHUNK);
  assert.ok(ENTITY_NAME_CHUNK <= MAX_IDS_EN_URL);
});

test("un lote que falla no borra los nombres de los demás y queda registrado", async (t) => {
  const errores = t.mock.method(console, "error", () => {});
  const documentos = Array.from({ length: 250 }, (_, i) => ({ id: `doc-${i}`, nombre: `Doc ${i}` }));
  const cliente = clienteFalso({ documentos }, { fallarEn: (_tabla, ids) => ids.includes("doc-0") });

  const nombres = await resolveLectorEntityNames(
    cliente,
    documentos.map((d) => ({ entidad_tipo: "documento", entidad_id: d.id })),
  );

  assert.equal(nombres.size, 250 - ENTITY_NAME_CHUNK);
  assert.equal(nombres.has("documento:doc-0"), false);
  assert.equal(nombres.get("documento:doc-249"), "Doc 249");
  assert.equal(errores.mock.callCount(), 1);
});
