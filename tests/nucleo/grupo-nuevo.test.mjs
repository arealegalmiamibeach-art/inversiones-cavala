import assert from "node:assert/strict";
import test from "node:test";
import {
  agrupadoPorTitulo,
  campoAgrupadoDe,
  columnaTituloDe,
  tituloInicialEnGrupo,
} from "../../src/lib/registros/grupo-nuevo.ts";

// Forma de `CONFIG_CREAR` (components/ui/crear-registro.tsx): contratos usa el
// mismo id para la columna y el campo; oficinas registrales, no.
const contratos = {
  campoTitulo: "nombre",
  camposAgrupacion: { nombre: "nombre", tipo: "tipo", estado: "estado", inicio: "fecha_inicio" },
};
const oficinas = { campoTitulo: "nombre", columnaTitulo: "oficina", camposAgrupacion: {} };
const vehiculos = { campoTitulo: "placa", camposAgrupacion: { placa: "placa", soat: "soat_vence" } };

test("la columna de título es la visual si hay, y si no el campo", () => {
  assert.equal(columnaTituloDe(contratos), "nombre");
  assert.equal(columnaTituloDe(oficinas), "oficina");
  assert.equal(columnaTituloDe(vehiculos), "placa");
});

test("agrupar por Contrato cuenta como agrupar por título; el resto de columnas no", () => {
  assert.equal(agrupadoPorTitulo(contratos, "nombre"), true);
  assert.equal(agrupadoPorTitulo(contratos, "tipo"), false);
  assert.equal(agrupadoPorTitulo(contratos, null), false);
  assert.equal(agrupadoPorTitulo(oficinas, "oficina"), true);
  assert.equal(agrupadoPorTitulo(oficinas, "nombre"), false);
  assert.equal(agrupadoPorTitulo(vehiculos, "placa"), true);
});

test('agrupado por título, "+ Nuevo" arranca con el nombre del grupo (otro contrato con ese nombre)', () => {
  const grupo = { columnId: "nombre", valor: "CAVALA-DIPIER" };
  assert.equal(tituloInicialEnGrupo(contratos, grupo), "CAVALA-DIPIER");
  assert.equal(tituloInicialEnGrupo(oficinas, { columnId: "oficina", valor: "Lima" }), "Lima");
});

test('en "Sin valor" (título vacío) el input arranca vacío', () => {
  assert.equal(tituloInicialEnGrupo(contratos, { columnId: "nombre", valor: "" }), "");
});

test("en cualquier otra agrupación el input arranca vacío", () => {
  assert.equal(tituloInicialEnGrupo(contratos, { columnId: "tipo", valor: "mutuo" }), "");
  assert.equal(tituloInicialEnGrupo(contratos, { columnId: null, valor: "" }), "");
});

test("el título no se copia como campo agrupado: lo escribe la persona en el input", () => {
  assert.equal(campoAgrupadoDe(contratos, "nombre"), undefined);
  assert.equal(campoAgrupadoDe(vehiculos, "placa"), undefined);
});

test("las demás columnas mapeadas sí copian su valor al campo de la base", () => {
  assert.equal(campoAgrupadoDe(contratos, "tipo"), "tipo");
  assert.equal(campoAgrupadoDe(contratos, "inicio"), "fecha_inicio");
  assert.equal(campoAgrupadoDe(vehiculos, "soat"), "soat_vence");
});

test("una columna sin campo propio (relación, calculada) no copia nada", () => {
  assert.equal(campoAgrupadoDe(contratos, "monto"), undefined);
  assert.equal(campoAgrupadoDe(contratos, null), undefined);
  // Ni siquiera con nombres que existen en cualquier objeto.
  assert.equal(campoAgrupadoDe(contratos, "constructor"), undefined);
  assert.equal(campoAgrupadoDe(contratos, "toString"), undefined);
});
