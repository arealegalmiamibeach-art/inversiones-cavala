import assert from "node:assert/strict";
import test from "node:test";
import {
  diasHastaFechaISO,
  esFechaISOValida,
  esHoraISOValida,
  hoyISOEnLima,
  paginaDesdeParametro,
  patronIlikePostgrest,
  sumarDiasISO,
} from "../../src/lib/utils.ts";

// Toda fecha del sistema (SOAT, pólizas, vencimientos de contrato, diligencias)
// pasa por aquí. Un error de un día corre alertas y semáforos enteros.

test("esFechaISOValida rechaza días que el calendario no tiene", () => {
  assert.equal(esFechaISOValida("2026-02-28"), true);
  assert.equal(esFechaISOValida("2026-02-29"), false, "2026 no es bisiesto");
  assert.equal(esFechaISOValida("2024-02-29"), true, "2024 sí es bisiesto");
  assert.equal(esFechaISOValida("2100-02-29"), false, "año secular no bisiesto");
  assert.equal(esFechaISOValida("2000-02-29"), true, "múltiplo de 400");
  assert.equal(esFechaISOValida("2026-04-31"), false);
  assert.equal(esFechaISOValida("2026-13-01"), false);
  assert.equal(esFechaISOValida("2026-00-10"), false);
});

test("esFechaISOValida no acepta formatos laxos ni tipos ajenos", () => {
  assert.equal(esFechaISOValida("2026-3-12"), false, "sin cero a la izquierda");
  assert.equal(esFechaISOValida("12/03/2026"), false);
  assert.equal(esFechaISOValida("2026-03-12T00:00:00Z"), false);
  assert.equal(esFechaISOValida(""), false);
  assert.equal(esFechaISOValida(null), false);
  assert.equal(esFechaISOValida(20260312), false);
});

test("diasHastaFechaISO cuenta días civiles, no franjas de 24 horas", () => {
  assert.equal(diasHastaFechaISO("2026-03-12", "2026-03-12"), 0);
  assert.equal(diasHastaFechaISO("2026-03-13", "2026-03-12"), 1);
  assert.equal(diasHastaFechaISO("2026-03-11", "2026-03-12"), -1);
  assert.equal(diasHastaFechaISO("2027-01-01", "2026-12-31"), 1, "cruce de año");
  assert.equal(diasHastaFechaISO("2024-03-01", "2024-02-28"), 2, "29 de febrero cuenta");
  assert.equal(diasHastaFechaISO("basura", "2026-03-12"), null);
});

test("diasHastaFechaISO no se desvía al cruzar el cambio de hora del norte", () => {
  // Perú no cambia de hora, pero el proceso puede correr en un servidor que sí.
  // El cálculo usa Date.UTC justamente para no perder ni ganar un día ahí.
  assert.equal(diasHastaFechaISO("2026-03-09", "2026-03-08"), 1);
  assert.equal(diasHastaFechaISO("2026-11-02", "2026-11-01"), 1);
});

test("hoyISOEnLima da el día civil peruano, no el del servidor", () => {
  // 03:00 UTC del día 13 = 22:00 del día 12 en Lima (UTC-5).
  assert.equal(hoyISOEnLima(new Date("2026-03-13T03:00:00Z")), "2026-03-12");
  // 06:00 UTC del día 13 = 01:00 del día 13 en Lima.
  assert.equal(hoyISOEnLima(new Date("2026-03-13T06:00:00Z")), "2026-03-13");
});

test("sumarDiasISO cruza meses y años sin corromper la fecha", () => {
  assert.equal(sumarDiasISO("2026-02-28", 1), "2026-03-01");
  assert.equal(sumarDiasISO("2024-02-28", 1), "2024-02-29");
  assert.equal(sumarDiasISO("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDiasISO("2026-01-01", -1), "2025-12-31");
  assert.equal(sumarDiasISO("2026-03-12", 0), "2026-03-12");
  assert.equal(sumarDiasISO("no-es-fecha", 5), "no-es-fecha", "entrada inválida vuelve tal cual");
  assert.equal(sumarDiasISO("2026-03-12", 1.5), "2026-03-12", "días no enteros no mueven la fecha");
});

test("esHoraISOValida acota a un reloj de 24 horas", () => {
  assert.equal(esHoraISOValida("00:00"), true);
  assert.equal(esHoraISOValida("23:59"), true);
  assert.equal(esHoraISOValida("24:00"), false);
  assert.equal(esHoraISOValida("10:60"), false);
  assert.equal(esHoraISOValida("9:30"), false, "exige dos dígitos");
});

test("paginaDesdeParametro nunca devuelve una página fuera de rango", () => {
  assert.equal(paginaDesdeParametro("3"), 3);
  assert.equal(paginaDesdeParametro("0"), 1);
  assert.equal(paginaDesdeParametro("-2"), 1);
  assert.equal(paginaDesdeParametro("1e3"), 1);
  assert.equal(paginaDesdeParametro("abc"), 1);
  assert.equal(paginaDesdeParametro(undefined), 1);
  assert.equal(paginaDesdeParametro("99999999999999999999"), 1, "fuera del rango seguro");
});

test("patronIlikePostgrest aísla comillas y barras del buscador", () => {
  assert.equal(patronIlikePostgrest("casa"), '"%casa%"');
  assert.equal(
    patronIlikePostgrest('a"b'),
    '"%a\\"b%"',
    "una comilla sin escapar cerraría el valor del filtro `or`"
  );
  assert.equal(patronIlikePostgrest("a\\b"), '"%a\\\\b%"');
  assert.equal(patronIlikePostgrest("  hola  "), '"%hola%"');
});

test("patronIlikePostgrest acota la longitud del término", () => {
  const largo = patronIlikePostgrest("x".repeat(500));
  assert.equal(largo, `"%${"x".repeat(120)}%"`);
});
