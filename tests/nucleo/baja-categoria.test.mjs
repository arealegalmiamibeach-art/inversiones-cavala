import assert from "node:assert/strict";
import test from "node:test";
import {
  mensajeCategoriaEnUso,
  repartirDocumentosDeCategoria,
} from "../../src/lib/relaciones/baja-categoria.ts";

const doc = (id, nombre) => ({ id, nombre });

test("un documento sin ninguna ficha queda suelto y no bloquea la baja", () => {
  // Caso real: PRUEBACARPETA1 se creó en un predio y luego se le quitó el vínculo.
  const { enFichas, sueltos } = repartirDocumentosDeCategoria([doc("a", "PRUEBACARPETA1")], new Set());
  assert.deepEqual(enFichas, []);
  assert.deepEqual(sueltos, [doc("a", "PRUEBACARPETA1")]);
});

test("un documento vinculado a alguna ficha sí bloquea", () => {
  const { enFichas, sueltos } = repartirDocumentosDeCategoria(
    [doc("a", "Uno"), doc("b", "Dos"), doc("c", "Tres")],
    new Set(["b"])
  );
  assert.deepEqual(enFichas, [doc("b", "Dos")]);
  assert.deepEqual(sueltos, [doc("a", "Uno"), doc("c", "Tres")]);
});

test("sin documentos no hay nada que repartir", () => {
  assert.deepEqual(repartirDocumentosDeCategoria([], new Set(["x"])), { enFichas: [], sueltos: [] });
});

test("el mensaje de un solo documento lo nombra y dice qué hacer", () => {
  const mensaje = mensajeCategoriaEnUso([doc("a", "Contrato marco")]);
  assert.match(mensaje, /«Contrato marco» sigue vinculado a una ficha/);
  assert.match(mensaje, /Documentos/);
  assert.match(mensaje, /papelera/);
});

test("el mensaje de varios cuenta todos y nombra sólo los primeros tres", () => {
  const docs = ["A", "B", "C", "D", "E"].map((n) => doc(n, `Doc ${n}`));
  const mensaje = mensajeCategoriaEnUso(docs);
  assert.match(mensaje, /5 documentos siguen vinculados/);
  assert.match(mensaje, /«Doc A», «Doc B», «Doc C» y 2 más/);
  assert.doesNotMatch(mensaje, /Doc D/);
});

test("un documento sin nombre no rompe el mensaje", () => {
  assert.match(mensajeCategoriaEnUso([doc("a", null)]), /«Sin nombre»/);
  assert.match(mensajeCategoriaEnUso([doc("a", "   ")]), /«Sin nombre»/);
});
