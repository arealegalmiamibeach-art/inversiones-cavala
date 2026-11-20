import assert from "node:assert/strict";
import test from "node:test";
import { coincideTexto, resolverEtiqueta } from "../../src/lib/registros/etiquetas-columna.ts";

// Sustancia de concesiones: el valor guardado (`no_metal`) no es lo que se lee.
const sustanciaBase = [
  { value: "metal", label: "Metal" },
  { value: "no_metal", label: "No metal" },
];

test("un valor guardado se muestra con su etiqueta", () => {
  const etiqueta = resolverEtiqueta(sustanciaBase, sustanciaBase);
  assert.equal(etiqueta("no_metal"), "No metal");
  assert.equal(etiqueta("metal"), "Metal");
});

test("renombrar la opción en el catálogo cambia lo que se lee, no lo guardado", () => {
  const vigentes = [
    { value: "metal", label: "Metálico" },
    { value: "no_metal", label: "No metal" },
  ];
  const etiqueta = resolverEtiqueta(sustanciaBase, vigentes);
  assert.equal(etiqueta("metal"), "Metálico");
});

test("una opción nueva del catálogo (valor = etiqueta) se lee igual", () => {
  const vigentes = [...sustanciaBase, { value: "Cobre", label: "Cobre" }];
  assert.equal(resolverEtiqueta(sustanciaBase, vigentes)("Cobre"), "Cobre");
});

test("un valor fuera de toda lista se devuelve tal cual", () => {
  const etiqueta = resolverEtiqueta(sustanciaBase, sustanciaBase);
  assert.equal(etiqueta("oro_aluvial"), "oro_aluvial");
  assert.equal(etiqueta(""), "");
});

// Materia de procesos: el filtro recibe la etiqueta del código ("Penal"), no
// el valor guardado ("penal"); tras renombrarla en el catálogo se ve la nueva.
test("la etiqueta del código se resuelve por su valor y muestra la vigente", () => {
  const base = [
    { value: "penal", label: "Penal" },
    { value: "civil", label: "Civil" },
  ];
  const vigentes = [
    { value: "penal", label: "Penales" },
    { value: "civil", label: "Civil" },
  ];
  const etiqueta = resolverEtiqueta(base, vigentes);
  assert.equal(etiqueta("Penal"), "Penales");
  assert.equal(etiqueta("penal"), "Penales");
  assert.equal(etiqueta("PENAL"), "Penales");
});

test("la coincidencia con la etiqueta de código no confunde acentos ni mayúsculas", () => {
  const base = [{ value: "constitucional", label: "Constitucional" }, { value: "penal", label: "Penal" }];
  const vigentes = [{ value: "constitucional", label: "Constitucionales" }, { value: "penal", label: "Penal" }];
  assert.equal(resolverEtiqueta(base, vigentes)("constitucional"), "Constitucionales");
});

test("escribir la etiqueta encuentra el valor guardado, y escribir el valor guardado también", () => {
  const candidatos = ["no_metal", "No metal"];
  assert.equal(coincideTexto("contiene", candidatos, "no metal"), true);
  assert.equal(coincideTexto("contiene", candidatos, "no_metal"), true);
  assert.equal(coincideTexto("igual", candidatos, "NO METAL"), true);
  assert.equal(coincideTexto("igual", candidatos, "no_metal"), true);
  assert.equal(coincideTexto("empieza", candidatos, "no m"), true);
  assert.equal(coincideTexto("contiene", candidatos, "cobre"), false);
});

test("los operadores negativos exigen que ninguna de las formas coincida", () => {
  const candidatos = ["no_metal", "No metal"];
  assert.equal(coincideTexto("no_contiene", candidatos, "metal"), false);
  assert.equal(coincideTexto("no_contiene", candidatos, "no metal"), false);
  assert.equal(coincideTexto("no_contiene", candidatos, "cobre"), true);
  assert.equal(coincideTexto("distinto", candidatos, "no metal"), false);
  assert.equal(coincideTexto("distinto", candidatos, "metal"), true);
});

test("con una sola forma se comporta como el filtro de texto de siempre", () => {
  assert.equal(coincideTexto("contiene", ["Titulada"], "titu"), true);
  assert.equal(coincideTexto("igual", ["Titulada"], "titu"), false);
  assert.equal(coincideTexto("distinto", ["Titulada"], "En trámite"), true);
  assert.equal(coincideTexto("empieza", ["Titulada"], "x"), false);
  assert.equal(coincideTexto("contiene", [""], "x"), false);
});
