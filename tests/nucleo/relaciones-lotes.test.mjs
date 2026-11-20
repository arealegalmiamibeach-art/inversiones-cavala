import assert from "node:assert/strict";
import { test } from "node:test";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";

// Cliente falso con los dos límites reales de PostgREST que dejaban
// categorías vacías sin avisar: `.in()` con demasiados UUIDs falla (la URL
// no entra) y cada respuesta se corta en 1000 filas.
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

test("un propietario con más predios de los que caben en una URL los muestra todos", async () => {
  const propietario = "prop-1";
  const predios = Array.from({ length: 1200 }, (_, i) => ({
    id: `predio-${String(i).padStart(4, "0")}`,
    nombre: `Predio ${i}`,
  }));
  const vinculos = predios.map((predio, i) => ({
    id: i,
    origen_tipo: "propietario",
    origen_id: propietario,
    destino_tipo: "predio",
    destino_id: predio.id,
    rol: null,
  }));

  const porId = await cargarCategoriasEntidad(clienteFalso({ vinculos, predios }), "propietario", [propietario]);
  const categoria = porId[propietario].find((c) => c.clave === "predio");

  assert.equal(categoria.total, 1200);
  assert.equal(new Set(categoria.filas.map((f) => f.id)).size, 1200);
});

test("una sustancia renombrada en el catálogo se ve con su etiqueta nueva en las relaciones", async () => {
  const propietario = "prop-1";
  const concesiones = [
    { id: "con-1", nombre: "Concesión A", codigo: "010", hectareas: 100, sustancia: "metal", estado: "titulada" },
    { id: "con-2", nombre: "Concesión B", codigo: "020", hectareas: 200, sustancia: "no_metal", estado: "titulada" },
    { id: "con-3", nombre: "Concesión C", codigo: "030", hectareas: 300, sustancia: "litio", estado: "titulada" },
  ];
  const vinculos = concesiones.map((concesion, i) => ({
    id: i,
    origen_tipo: "propietario",
    origen_id: propietario,
    destino_tipo: "concesion",
    destino_id: concesion.id,
    rol: null,
  }));
  const opciones_columna = [
    { id: "o1", tabla: "concesiones_mineras", campo: "sustancia", valor: "metal", etiqueta: "Metálico", clase_color: "", orden: 0 },
    { id: "o2", tabla: "concesiones_mineras", campo: "sustancia", valor: "no_metal", etiqueta: "No metal", clase_color: "", orden: 1 },
  ];
  const sustanciaDe = (porId, id) => porId[propietario].find((c) => c.clave === "concesion").filas.find((f) => f.id === id).celdas.sustancia;

  const conCatalogo = await cargarCategoriasEntidad(clienteFalso({ vinculos, concesiones_mineras: concesiones, opciones_columna }), "propietario", [propietario]);
  assert.equal(sustanciaDe(conCatalogo, "con-1"), "Metálico");
  assert.equal(sustanciaDe(conCatalogo, "con-2"), "No metal");
  // Un valor que ya no está en el catálogo no se ve crudo: se muestra su texto guardado.
  assert.equal(sustanciaDe(conCatalogo, "con-3"), "Litio");

  // Sin catálogo (nadie editó la columna o falta la migración) se ve como siempre.
  const sinCatalogo = await cargarCategoriasEntidad(clienteFalso({ vinculos, concesiones_mineras: concesiones }), "propietario", [propietario]);
  assert.equal(sustanciaDe(sinCatalogo, "con-1"), "Metal");
  assert.equal(sustanciaDe(sinCatalogo, "con-2"), "No metal");
});

test("el tipo de persona renombrado en el catálogo se ve con su etiqueta en la celda Persona de las relaciones", async () => {
  const dueno = "ent-1";
  const vinculo = (i, destinoTipo, destinoId) => ({ id: i, origen_tipo: "predio", origen_id: dueno, destino_tipo: destinoTipo, destino_id: destinoId, rol: null });
  const propietarios = [
    { id: "p-1", nombre: "Ana", es_propio: true, tipo_persona: "natural", extra: null },
    { id: "p-2", nombre: "Consorcio Sur", es_propio: false, tipo_persona: "consorcio", extra: null },
  ];
  const opciones_columna = [
    // Valor guardado ≠ etiqueta: renombrar sólo cambia lo que se muestra.
    { id: "o1", tabla: "propietarios", campo: "tipo_persona", valor: "natural", etiqueta: "Persona natural", clase_color: "", orden: 0 },
    { id: "o2", tabla: "propietarios", campo: "tipo_persona", valor: "consorcio", etiqueta: "Consorcio", clase_color: "", orden: 1 },
  ];
  const vinculos = propietarios.map((p, i) => vinculo(i, "propietario", p.id));
  const personaDe = (porId, id) => porId[dueno].find((c) => c.clave === "propietario").filas.find((f) => f.id === id).celdas.persona;

  const conCatalogo = await cargarCategoriasEntidad(clienteFalso({ vinculos, propietarios, opciones_columna }), "predio", [dueno]);
  assert.equal(personaDe(conCatalogo, "p-1"), "Persona natural");
  assert.equal(personaDe(conCatalogo, "p-2"), "Consorcio");

  // Sin catálogo (nadie editó la columna o falta la migración) un valor nuevo se ve con su texto guardado.
  const sinCatalogo = await cargarCategoriasEntidad(clienteFalso({ vinculos, propietarios }), "predio", [dueno]);
  assert.equal(personaDe(sinCatalogo, "p-1"), "Natural");
  assert.equal(personaDe(sinCatalogo, "p-2"), "Consorcio");
});
