import assert from "node:assert/strict";
import test from "node:test";
import {
  DIAS_CRITICO,
  DIAS_PROXIMO,
  diligenciasDeProceso,
  diligenciasEnVentana,
  extraerFechas,
  nivelUrgencia,
  proximaDiligencia,
} from "../../src/lib/procesos/diligencias.ts";
import {
  DIAS_CRITICO as DIAS_CRITICO_ALERTAS,
  DIAS_PROXIMO as DIAS_PROXIMO_ALERTAS,
  nivelAlerta,
} from "../../src/lib/alertas.ts";
import { esEnCurso, resumirMateria, resumirPorMateria } from "../../src/lib/procesos/resumen.ts";
import { calcularVigencia } from "../../src/lib/contratos/vigencia.ts";

const HOY = "2026-03-12";

// ─── Extracción de fechas del texto libre ────────────────────────────────

test("reconoce los formatos de fecha que se usan en los expedientes", () => {
  assert.deepEqual(extraerFechas("Audiencia el 12/03/2026"), ["2026-03-12"]);
  assert.deepEqual(extraerFechas("Audiencia el 12-03-2026"), ["2026-03-12"]);
  assert.deepEqual(extraerFechas("Audiencia el 12.03.2026"), ["2026-03-12"]);
  assert.deepEqual(extraerFechas("Audiencia el 2026-03-12"), ["2026-03-12"]);
  assert.deepEqual(extraerFechas("Audiencia el 12 de marzo de 2026"), ["2026-03-12"]);
  assert.deepEqual(extraerFechas("Audiencia el 12 de marzo del 2026"), ["2026-03-12"]);
  assert.deepEqual(extraerFechas("AUDIENCIA 12 MARZO 2026"), ["2026-03-12"]);
  assert.deepEqual(extraerFechas("marzo 12, 2026"), ["2026-03-12"]);
  assert.deepEqual(extraerFechas("12 de setiembre de 2026"), ["2026-09-12"]);
  assert.deepEqual(extraerFechas("12 de septiembre de 2026"), ["2026-09-12"]);
});

test("el día va primero, como se escribe en Perú", () => {
  assert.deepEqual(extraerFechas("03/12/2026"), ["2026-12-03"]);
});

test("descarta fechas que el calendario no tiene", () => {
  assert.deepEqual(extraerFechas("31/02/2026"), []);
  assert.deepEqual(extraerFechas("32/01/2026"), []);
  assert.deepEqual(extraerFechas("12/13/2026"), []);
  assert.deepEqual(extraerFechas("12/03/1850"), [], "fuera del rango de años");
});

test("un número de expediente no se confunde con una fecha", () => {
  // Formato real: 00456-2026-88-1801-JR-CI-05
  assert.deepEqual(extraerFechas("EXP. N° 00456-2026-88-1801-JR-CI-05"), []);
  assert.deepEqual(extraerFechas("Expediente 01234-2025-0-1801-JR-LA-12"), []);
});

test("fechas repetidas se cuentan una sola vez y salen ordenadas", () => {
  const fechas = extraerFechas("Audiencia 12/03/2026, reprogramada; ver 12 de marzo de 2026. Luego 05/01/2026.");
  assert.deepEqual(fechas, ["2026-01-05", "2026-03-12"]);
});

test("captura la hora cuando va pegada a la fecha", () => {
  const [diligencia] = diligenciasDeProceso({ diligencia: "Audiencia 12/03/2026 a las 10:30 a.m." });
  assert.equal(diligencia.hora, "10:30");
  const [sinHora] = diligenciasDeProceso({ diligencia: "Audiencia 12/03/2026" });
  assert.equal(sinHora.hora, undefined);
});

test("texto sin fechas no inventa diligencias", () => {
  assert.deepEqual(extraerFechas(""), []);
  assert.deepEqual(extraerFechas(null), []);
  assert.deepEqual(extraerFechas("Pendiente de notificación"), []);
});

test("las diligencias salen de `diligencia` y de `descripcion`", () => {
  const fechas = diligenciasDeProceso({
    diligencia: "Audiencia 12/03/2026",
    descripcion: "Se programó también para el 20/04/2026",
  }).map((d) => d.fechaISO);
  assert.deepEqual(fechas, ["2026-03-12", "2026-04-20"]);
});

// ─── Semáforo de urgencia ────────────────────────────────────────────────

test("el semáforo separa vencida, crítica, próxima y normal", () => {
  // Los umbrales son los de `lib/urgencia.ts`, compartidos con la campana y el
  // correo diario: 10 días para el rojo, 30 para el ámbar.
  assert.equal(nivelUrgencia(-1), "vencida");
  assert.equal(nivelUrgencia(0), "critica", "hoy es crítico, no vencido");
  assert.equal(nivelUrgencia(DIAS_CRITICO), "critica");
  assert.equal(nivelUrgencia(DIAS_CRITICO + 1), "proxima");
  assert.equal(nivelUrgencia(DIAS_PROXIMO), "proxima");
  assert.equal(nivelUrgencia(DIAS_PROXIMO + 1), "normal");
});

test("la campana y el semáforo de procesos usan el MISMO umbral de rojo", () => {
  // Antes eran 10 días para vencimientos y 7 para diligencias: el mismo color
  // significaba cosas distintas en la misma campana (ver lib/notificaciones.ts).
  assert.equal(DIAS_CRITICO, DIAS_CRITICO_ALERTAS);
  assert.equal(DIAS_PROXIMO, DIAS_PROXIMO_ALERTAS);
  assert.equal(nivelUrgencia(9), "critica");
  assert.equal(nivelAlerta(9), "critico");
});

test("proximaDiligencia prefiere la futura más cercana", () => {
  const proceso = { diligencia: "05/01/2026 · 20/03/2026 · 15/06/2026" };
  const proxima = proximaDiligencia(proceso, HOY);
  assert.equal(proxima.fechaISO, "2026-03-20");
  assert.equal(proxima.dias, 8);
  assert.equal(proxima.nivel, "critica", "a 8 días entra en el umbral rojo de 10");
});

test("sin diligencias futuras muestra la última vencida", () => {
  const proceso = { diligencia: "05/01/2026 y 10/02/2026" };
  const proxima = proximaDiligencia(proceso, HOY);
  assert.equal(proxima.fechaISO, "2026-02-10");
  assert.equal(proxima.nivel, "vencida");
});

test("una diligencia de hoy cuenta como futura", () => {
  const proxima = proximaDiligencia({ diligencia: `Audiencia ${HOY}` }, HOY);
  assert.equal(proxima.dias, 0);
  assert.equal(proxima.nivel, "critica");
});

test("un proceso sin fechas no tiene próxima diligencia", () => {
  assert.equal(proximaDiligencia({ diligencia: "sin fecha" }, HOY), null);
});

test("la ventana de 30 días excluye lo vencido y lo lejano", () => {
  const proceso = { diligencia: "01/03/2026 · 20/03/2026 · 11/04/2026 · 12/04/2026 · 30/06/2026" };
  const dentro = diligenciasEnVentana(proceso, 30, HOY).map((d) => d.fechaISO);
  assert.deepEqual(dentro, ["2026-03-20", "2026-04-11"], "el día 31 ya queda fuera");
});

// ─── Estado y resumen por materia ────────────────────────────────────────

test("sólo ARCHIVADO cierra un expediente", () => {
  assert.equal(esEnCurso("ADMISORIA"), true);
  assert.equal(esEnCurso("SENTENCIA 2° INSTANCIA"), true);
  assert.equal(esEnCurso("CASACION"), true);
  assert.equal(esEnCurso("ARCHIVADO"), false);
  assert.equal(esEnCurso("ARCHIVO"), false, "variante histórica de Notion");
});

test("un proceso sin estado cuenta como en curso", () => {
  // Seis materias no manejan estado: si contaran como cerradas, el dashboard
  // mostraría media cartera archivada.
  assert.equal(esEnCurso(null), true);
  assert.equal(esEnCurso(undefined), true);
  assert.equal(esEnCurso(""), true);
  assert.equal(esEnCurso("   "), true);
});

test("resumirMateria cuenta en curso, críticos y próximos", () => {
  const resumen = resumirMateria(
    [
      { materia: "civil", estado: "ADMISORIA", diligencia: "15/03/2026" },  // en 3 días → crítico
      { materia: "civil", estado: "ARCHIVADO", diligencia: null },          // cerrado, sin diligencia
      { materia: "civil", estado: null, diligencia: "01/04/2026" },         // en 20 días → próximo
      { materia: "civil", estado: "CASACION", diligencia: "01/01/2026" },   // vencida → crítico
    ],
    HOY
  );
  assert.equal(resumen.total, 4);
  assert.equal(resumen.enCurso, 3);
  assert.equal(resumen.porcentajeEnCurso, 75);
  assert.equal(resumen.criticos, 2, "vencida y crítica suman al mismo contador");
  assert.equal(resumen.proximos, 1);
  assert.equal(resumen.diligenciasProximoMes, 2);
});

test("una materia vacía no divide entre cero", () => {
  const resumen = resumirMateria([], HOY);
  assert.equal(resumen.total, 0);
  assert.equal(resumen.porcentajeEnCurso, 0);
});

test("resumirPorMateria ordena de mayor a menor carga", () => {
  const filas = [
    { materia: "civil", estado: null },
    { materia: "penal", estado: null },
    { materia: "civil", estado: null },
    { materia: "laboral", estado: null },
    { materia: "penal", estado: null },
    { materia: "civil", estado: null },
  ];
  assert.deepEqual(
    resumirPorMateria(filas, HOY).map((r) => [r.materia, r.total]),
    [["civil", 3], ["penal", 2], ["laboral", 1]]
  );
});

// ─── Vigencia de contratos ───────────────────────────────────────────────

test("la vigencia de un contrato se lee de la fecha, no del texto migrado", () => {
  assert.deepEqual(calcularVigencia(null), { estado: "sin_fecha", dias: null, vigencia: "—", seguimiento: "—" });
  assert.deepEqual(calcularVigencia(""), { estado: "sin_fecha", dias: null, vigencia: "—", seguimiento: "—" });
  assert.equal(calcularVigencia("30/06/2026").estado, "sin_fecha", "formato no ISO no se adivina");
});

test("singular y plural de los días de vigencia", () => {
  const hoy = new Date();
  const iso = (delta) => {
    const f = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + delta));
    return f.toISOString().slice(0, 10);
  };
  // Se calcula contra el día de Lima; usamos un margen amplio para no depender
  // de la hora exacta a la que corran las pruebas.
  const futuro = calcularVigencia(iso(60));
  assert.equal(futuro.estado, "vigente");
  assert.match(futuro.seguimiento, /^Faltan \d+ días$/);

  const pasado = calcularVigencia(iso(-60));
  assert.equal(pasado.estado, "vencido");
  assert.equal(pasado.vigencia, "VENCIDO");
  assert.match(pasado.seguimiento, /^Pasaron \d+ días$/);
});
