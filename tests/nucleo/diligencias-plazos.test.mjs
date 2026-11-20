import assert from "node:assert/strict";
import test from "node:test";
import {
  diasHabilesHasta,
  esDiaHabil,
  esFinDeSemana,
  feriadosPeru,
  nombreFeriado,
  sumarDiasHabiles,
} from "../../src/lib/feriados.ts";
import {
  ESTADOS_DILIGENCIA,
  aEventoProceso,
  componerIniciaEn,
  descomponerIniciaEn,
  normalizarEstado,
} from "../../src/lib/procesos/eventos.ts";
import { enlaceExterno, normalizarDiligenciasProcesos, normalizarEventos } from "../../src/lib/calendario.ts";
import { ordenDiligencia } from "../../src/lib/notificaciones.ts";

// Un plazo procesal mal contado es un plazo perdido: esto es lo que antes se
// calculaba a mano fuera del sistema.

// ─── Feriados ─────────────────────────────────────────────────────────────

test("la Semana Santa se calcula, no se codifica año por año", () => {
  // Pascua 2026: 5 de abril. Pascua 2027: 28 de marzo.
  assert.equal(nombreFeriado("2026-04-02"), "Jueves Santo");
  assert.equal(nombreFeriado("2026-04-03"), "Viernes Santo");
  assert.equal(nombreFeriado("2027-03-25"), "Jueves Santo");
  assert.equal(nombreFeriado("2027-03-26"), "Viernes Santo");
});

test("incluye los feriados nacionales fijos del Perú", () => {
  const f = feriadosPeru(2026);
  assert.equal(f.get("2026-07-28"), "Fiestas Patrias");
  assert.equal(f.get("2026-07-29"), "Fiestas Patrias");
  assert.equal(f.get("2026-12-25"), "Navidad");
  assert.equal(f.get("2026-08-30"), "Santa Rosa de Lima");
  assert.equal(f.get("2026-03-15"), undefined, "un día cualquiera no es feriado");
});

test("esFinDeSemana lee el día civil, no medianoche UTC", () => {
  assert.equal(esFinDeSemana("2026-03-14"), true, "sábado");
  assert.equal(esFinDeSemana("2026-03-15"), true, "domingo");
  assert.equal(esFinDeSemana("2026-03-16"), false, "lunes");
});

test("esDiaHabil descarta fin de semana, feriado fijo y feriado extraordinario", () => {
  assert.equal(esDiaHabil("2026-07-27"), true, "lunes corriente");
  assert.equal(esDiaHabil("2026-07-28"), false, "Fiestas Patrias");
  assert.equal(esDiaHabil("2026-03-14"), false, "sábado");
  assert.equal(esDiaHabil("2026-07-27", new Set(["2026-07-27"])), false, "puente declarado");
});

// ─── Cómputo de plazos ────────────────────────────────────────────────────

test("el plazo no cuenta el día de la notificación y arranca al hábil siguiente", () => {
  // Lunes 9 de marzo de 2026 + 3 hábiles = jueves 12.
  assert.equal(sumarDiasHabiles("2026-03-09", 3), "2026-03-12");
});

test("el plazo salta fines de semana", () => {
  // Jueves 12 + 3 hábiles: viernes 13, lunes 16, martes 17.
  assert.equal(sumarDiasHabiles("2026-03-12", 3), "2026-03-17");
});

test("el plazo salta feriados nacionales", () => {
  // Lunes 27/07/2026 + 2 hábiles: 28 y 29 son Fiestas Patrias, así que
  // caen el jueves 30 y el viernes 31.
  assert.equal(sumarDiasHabiles("2026-07-27", 2), "2026-07-31");
});

test("los feriados extraordinarios de la tabla también corren el plazo", () => {
  const extra = new Set(["2026-03-13"]);
  assert.equal(sumarDiasHabiles("2026-03-12", 1), "2026-03-13", "sin el extraordinario");
  assert.equal(sumarDiasHabiles("2026-03-12", 1, extra), "2026-03-16", "con el extraordinario salta al lunes");
});

test("con 0 días devuelve el primer hábil que no sea anterior a la fecha", () => {
  assert.equal(sumarDiasHabiles("2026-03-12", 0), "2026-03-12", "jueves hábil se queda igual");
  assert.equal(sumarDiasHabiles("2026-03-14", 0), "2026-03-16", "sábado pasa al lunes");
  assert.equal(sumarDiasHabiles("2026-07-28", 0), "2026-07-30", "feriado doble pasa al jueves");
});

test("diasHabilesHasta cuenta sin el día de hoy y va en negativo hacia atrás", () => {
  assert.equal(diasHabilesHasta("2026-03-12", "2026-03-12"), 0, "vence hoy");
  assert.equal(diasHabilesHasta("2026-03-13", "2026-03-12"), 1, "mañana");
  assert.equal(diasHabilesHasta("2026-03-16", "2026-03-13"), 1, "el fin de semana no cuenta");
  assert.equal(diasHabilesHasta("2026-03-10", "2026-03-12"), -2, "ya pasó");
});

// ─── Ciclo de vida de la diligencia ───────────────────────────────────────

test("cualquier estado desconocido cuenta como PENDIENTE", () => {
  assert.equal(normalizarEstado(null), "PENDIENTE");
  assert.equal(normalizarEstado("lo que sea"), "PENDIENTE");
  assert.equal(normalizarEstado("REALIZADA"), "REALIZADA");
  assert.ok(Object.keys(ESTADOS_DILIGENCIA).includes("INCUMPLIDA"));
});

test("una diligencia que pasó de fecha sin cerrarse queda marcada", () => {
  const vencida = aEventoProceso(
    { id: "a", titulo: "Audiencia", inicia_en: componerIniciaEn("2026-03-01", "09:00"), tipo_diligencia: null, responsable: null, estado: "PENDIENTE", notificar: true },
    "2026-03-12"
  );
  assert.equal(vencida.vencidaSinCerrar, true);

  const cerrada = aEventoProceso(
    { id: "b", titulo: "Audiencia", inicia_en: componerIniciaEn("2026-03-01", "09:00"), tipo_diligencia: null, responsable: null, estado: "REALIZADA", notificar: true },
    "2026-03-12"
  );
  assert.equal(cerrada.vencidaSinCerrar, false, "cerrarla la saca de las alertas");

  const futura = aEventoProceso(
    { id: "c", titulo: "Audiencia", inicia_en: componerIniciaEn("2026-03-20", "09:00"), tipo_diligencia: null, responsable: null, estado: "PENDIENTE", notificar: true },
    "2026-03-12"
  );
  assert.equal(futura.vencidaSinCerrar, false);
});

test("una fecha sin hora no inventa una hora al leerla en Perú", () => {
  // La importación guardaba medianoche UTC, que en Lima es el día anterior
  // a las 19:00: la migración 20260917000000 corrige ese desfase.
  const { fecha, hora } = descomponerIniciaEn(componerIniciaEn("2026-08-31", null));
  assert.equal(fecha, "2026-08-31");
  assert.equal(hora, "00:00");
});

// ─── Calendario ───────────────────────────────────────────────────────────

const PROCESO = {
  id: "p1",
  materia: "civil",
  expediente: "00123-2026-0-2501-JR-CI-01",
  asunto: "Demanda",
  diligencia: "Demanda presentada el 12/03/2019. Audiencia el 20/03/2026.",
  estado: null,
  juzgado: null,
  abogado: null,
};

test("el texto libre ya no mete fechas pasadas en el calendario", () => {
  const eventos = normalizarDiligenciasProcesos([PROCESO], { desde: "2026-03-12" });
  assert.deepEqual(eventos.map((e) => e.fecha), ["2026-03-20"]);
});

test("una fecha ya registrada como diligencia no se repite desde el texto", () => {
  const eventos = normalizarDiligenciasProcesos([PROCESO], {
    desde: "2026-03-12",
    registradas: new Set(["p1|2026-03-20"]),
  });
  assert.deepEqual(eventos, []);
});

test("la diligencia registrada enlaza a su expediente, no al dashboard", () => {
  const filas = [{
    id: "e1",
    titulo: "Audiencia única",
    inicia_en: componerIniciaEn("2026-03-20", "09:30"),
    tipo_diligencia: "AUD. UNICA",
    responsable: null,
    estado: "PENDIENTE",
  }];

  assert.equal(normalizarEventos(filas)[0].href, "/dashboard", "sin expediente no hay a dónde ir");

  const conProceso = normalizarEventos(
    filas,
    new Map([["e1", { id: "p1", expediente: "00123-2026", materia: "civil" }]])
  );
  assert.equal(conProceso[0].href, "/procesos/p1");
  // El expediente va primero en el título (también en el chip del calendario).
  assert.equal(conProceso[0].titulo, "Exp. 00123-2026 · Audiencia única");
  assert.equal(conProceso[0].subtitulo, undefined);
});

test("el popup de la diligencia muestra asunto, juzgado y partes del expediente", () => {
  const filas = [{
    id: "e1",
    titulo: "Seguimiento titulo",
    inicia_en: componerIniciaEn("2026-10-19", "09:00"),
    tipo_diligencia: "Seguimiento titulo",
    responsable: null,
    estado: "PENDIENTE",
  }];
  const [evento] = normalizarEventos(filas, new Map([["e1", {
    id: "p1",
    expediente: "2026-02847336",
    materia: "administrativo",
    asunto: "DEVOLUCION DERECHOS REGISTRALES",
    juzgado: "SUNARP CASMA",
    partes: [{ label: "Propietarios", valor: "LCV" }],
  }]]));
  const campo = (label) => evento.detalle.find((c) => c.label === label)?.valor;
  assert.equal(campo("Asunto"), "DEVOLUCION DERECHOS REGISTRALES");
  assert.equal(campo("Juzgado"), "SUNARP CASMA");
  assert.equal(campo("Propietarios"), "LCV");
});

test("sin hora no se inventa una cita a las 12:00 a. m.", () => {
  const base = { id: "e1", titulo: "VENCIMIENTO PODER", tipo_diligencia: null, responsable: null, estado: "PENDIENTE" };
  const sinHora = normalizarEventos([{ ...base, inicia_en: componerIniciaEn("2026-09-25", null) }])[0];
  assert.equal(sinHora.detalle.find((c) => c.label === "Hora"), undefined);
  assert.equal(sinHora.diligencia.hora, null);

  const conHora = normalizarEventos([{ ...base, inicia_en: componerIniciaEn("2026-09-25", "14:30") }])[0];
  assert.match(conHora.detalle.find((c) => c.label === "Hora").valor, /2:30/);
});

test("la diligencia sin expediente lleva sus datos para editarse desde el calendario", () => {
  const fila = {
    id: "e1",
    titulo: "810-2026-0",
    inicia_en: componerIniciaEn("2026-05-05", "10:00"),
    tipo_diligencia: "DECLARACION LCV - VIRTUAL",
    responsable: null,
    responsable_id: null,
    estado: "PENDIENTE",
    resultado: null,
    notificar: true,
    dias_aviso: 10,
    extra: { Info: "Agraviado: X\nFiscalía: Y", URL: "meet.google.com/puu-fryr-cfw" },
  };
  const [sinProceso] = normalizarEventos([fila]);
  assert.equal(sinProceso.diligencia.id, "e1");
  assert.equal(sinProceso.diligencia.procesoId, null);
  assert.equal(sinProceso.diligencia.hora, "10:00");
  assert.equal(sinProceso.enlace, "https://meet.google.com/puu-fryr-cfw");
  assert.equal(sinProceso.detalle.find((c) => c.label === "Detalle").valor, "Agraviado: X\nFiscalía: Y");

  const [conProceso] = normalizarEventos([fila], new Map([["e1", { id: "p1", expediente: "810-2026-0", materia: "carpeta_fiscal" }]]));
  assert.equal(conProceso.diligencia.procesoId, "p1");
});

test("el enlace importado de Notion sólo acepta http(s)", () => {
  assert.equal(enlaceExterno("meet.google.com/abc"), "https://meet.google.com/abc");
  assert.equal(enlaceExterno("https://zoom.us/j/1"), "https://zoom.us/j/1");
  assert.equal(enlaceExterno("javascript:alert(1)"), undefined);
  assert.equal(enlaceExterno("   "), undefined);
  assert.equal(enlaceExterno(null), undefined);
});

test("la campana pone lo que viene antes que lo vencido, y lo vencido más reciente primero", () => {
  const dias = [-190, 5, -1, 0, -40, 1];
  assert.deepEqual(dias.slice().sort(ordenDiligencia), [0, 1, 5, -1, -40, -190]);
});
