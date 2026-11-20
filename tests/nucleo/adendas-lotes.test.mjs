import assert from "node:assert/strict";
import { test } from "node:test";
import { cargarMapaAdendas } from "@/lib/contratos/adendas";

// Mismos límites que PostgREST: `.in()` con demasiados UUIDs no entra en la
// URL y cada respuesta se corta en 1000 filas.
const MAX_IDS_EN_URL = 350;
const MAX_FILAS = 1000;

function clienteFalso(tablas) {
  return {
    from(tabla) {
      const filtros = [];
      let rango = null;
      let error = null;
      const consulta = {
        select: () => consulta,
        order: () => consulta,
        eq(columna, valor) {
          filtros.push((fila) => fila[columna] === valor);
          return consulta;
        },
        in(columna, valores) {
          if (valores.length > MAX_IDS_EN_URL) error = { message: "Bad Request" };
          const set = new Set(valores);
          filtros.push((fila) => set.has(fila[columna]));
          return consulta;
        },
        range(desde, hasta) {
          rango = [desde, hasta];
          return consulta;
        },
        then(resolver, rechazar) {
          if (error) return Promise.resolve({ data: null, error }).then(resolver, rechazar);
          const todas = (tablas[tabla] ?? []).filter((fila) => filtros.every((f) => f(fila)));
          const [desde, hasta] = rango ?? [0, todas.length - 1];
          const data = todas.slice(desde, Math.min(hasta + 1, desde + MAX_FILAS));
          return Promise.resolve({ data, error: null }).then(resolver, rechazar);
        },
      };
      return consulta;
    },
  };
}

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("arma el árbol de adendas aunque la lista tenga más contratos de los que caben en una URL", async () => {
  // 450 contratos; cada décimo tiene una adenda enlazada por vínculo, y la
  // adenda sólo se reconoce por su marca `es_adenda` (sin documento_padre).
  const contratos = Array.from({ length: 450 }, (_, i) => ({ id: uuid(i), extra: {} }));
  const adendas = [];
  const vinculos = [];
  for (let i = 0; i < 450; i += 10) {
    const adenda = { id: uuid(10_000 + i), extra: { es_adenda: true } };
    adendas.push(adenda);
    vinculos.push({ id: vinculos.length, origen_tipo: "contrato", origen_id: contratos[i].id, destino_tipo: "contrato", destino_id: adenda.id });
  }
  const cliente = clienteFalso({ vinculos, contratos: [...contratos, ...adendas] });

  const mapa = await cargarMapaAdendas(cliente, contratos);

  assert.equal(Object.keys(mapa.padrePorHijo).length, adendas.length);
  assert.equal(mapa.padrePorHijo[uuid(10_440)], uuid(440));
  assert.deepEqual(mapa.hijosPorPadre[uuid(0)], [uuid(10_000)]);
});
