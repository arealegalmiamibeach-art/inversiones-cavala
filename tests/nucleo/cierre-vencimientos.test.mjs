import assert from "node:assert/strict";
import test from "node:test";
import {
  ALERTA_FIJA,
  alertaIdDeEvento,
  claveCierre,
  entidadDeAlerta,
  mapaDeCierres,
  resultadosParaAlerta,
  validarCierre,
} from "../../src/lib/vencimientos/cierres.ts";
import { alertasAbiertas, getAlertas } from "../../src/lib/alertas.ts";
import { adjuntarCierres, aplicarConfigFechas, estadoCierreEvento, normalizarContratos, normalizarEventos, normalizarVehiculos } from "../../src/lib/calendario.ts";
import { normalizarAlertas } from "../../src/lib/notificaciones.ts";
import { hoyISOEnLima, sumarDiasISO } from "../../src/lib/utils.ts";

// Cerrar un vencimiento (se renovó, no se renueva…) lo saca del dashboard, la
// campana y el correo. El cierre vale para ESA fecha: si la fecha cambia,
// vuelve a avisar. Ver docs/DISENO-CIERRE-VENCIMIENTOS.md.

const A = "3f2b8c1e-9d4a-4e7b-a1c5-6d8e9f0a1b2c";
const B = "11111111-2222-3333-4444-555555555555";
const hoy = hoyISOEnLima();
const enDias = (n) => sumarDiasISO(hoy, n);

// ─── Id de alerta ↔ entidad ─────────────────────────────────────────────

test("cada id de alerta se traduce a su entidad", () => {
  const casos = {
    [`contrato-${A}`]: "contrato",
    [`contrato-inicio-${A}`]: "contrato",
    [`soat-${A}`]: "vehiculo",
    [`poliza-${A}`]: "vehiculo",
    [`revision-tecnica-${A}`]: "vehiculo",
    [`personal-${A}`]: "personal",
    [`personal-inicio-${A}`]: "personal",
    [`documento-${A}`]: "documento",
  };
  for (const [alertaId, entidadTipo] of Object.entries(casos)) {
    assert.deepEqual(entidadDeAlerta(alertaId), { tipo: "fija", entidadTipo, entidadId: A }, alertaId);
  }
  assert.deepEqual(entidadDeAlerta(`propiedad-${B}-${A}`), { tipo: "propiedad", propiedadId: B, entidadId: A });
});

test("un id que no es de alerta se rechaza", () => {
  for (const malo of ["", "contrato-", `otro-${A}`, `contrato-${A}x`, "contrato-123", `propiedad-${A}`, `soat-${A}; drop`]) {
    assert.equal(entidadDeAlerta(malo), null, malo);
  }
});

test("el calendario y las alertas hablan del mismo vencimiento", () => {
  assert.equal(alertaIdDeEvento("contrato.fecha_vencimiento", `contrato-vence-${A}`), `contrato-${A}`);
  assert.equal(alertaIdDeEvento("contrato.fecha_inicio", `contrato-inicio-${A}`), `contrato-inicio-${A}`);
  assert.equal(alertaIdDeEvento("vehiculo.soat_vence", `vehiculo-soat-${A}`), `soat-${A}`);
  assert.equal(alertaIdDeEvento("vehiculo.poliza_vence", `vehiculo-poliza-${A}`), `poliza-${A}`);
  assert.equal(alertaIdDeEvento("vehiculo.revision_tecnica", `vehiculo-revision-tecnica-${A}`), `revision-tecnica-${A}`);
  assert.equal(alertaIdDeEvento("personal.contrato_fin", `personal-fin-${A}`), `personal-${A}`);
  assert.equal(alertaIdDeEvento("personal.contrato_inicio", `personal-inicio-${A}`), `personal-inicio-${A}`);
  assert.equal(alertaIdDeEvento("documento:vigencia_poder", `documento-${A}`), `documento-${A}`);
  assert.equal(alertaIdDeEvento(`propiedad:${B}`, `propiedad-${B}-${A}`), `propiedad-${B}-${A}`);
  assert.equal(alertaIdDeEvento(undefined, `evento-${A}`), null, "las diligencias se cierran por su lado");
});

test("todas las fuentes fijas tienen prefijo y entidad", () => {
  for (const [fuente, { clave, entidadTipo }] of Object.entries(ALERTA_FIJA)) {
    assert.ok(clave && entidadTipo, fuente);
    assert.equal(entidadDeAlerta(`${clave}-${A}`)?.entidadTipo, entidadTipo, fuente);
  }
});

// ─── Vocabulario y validación ───────────────────────────────────────────

test("un SOAT no se resuelve ni se prorroga; un contrato sí", () => {
  assert.deepEqual(resultadosParaAlerta(`soat-${A}`), ["RENOVADO", "CONCLUIDO", "OTRO"]);
  assert.deepEqual(resultadosParaAlerta(`documento-${A}`), ["RENOVADO", "CONCLUIDO", "OTRO"]);
  assert.deepEqual(resultadosParaAlerta(`contrato-${A}`), ["RENOVADO", "PRORROGADO", "CONCLUIDO", "RESUELTO", "OTRO"]);
  assert.deepEqual(resultadosParaAlerta(`personal-${A}`), ["RENOVADO", "PRORROGADO", "CONCLUIDO", "RESUELTO", "OTRO"]);
});

test("validación del cierre", () => {
  const base = { alertaId: `contrato-${A}`, fecha: "2026-09-11", resultado: "CONCLUIDO" };
  assert.equal(validarCierre(base), null);
  assert.equal(validarCierre({ ...base, nota: "Terminó el plazo" }), null);
  assert.match(validarCierre({ ...base, alertaId: "x" }), /no válido/);
  assert.match(validarCierre({ ...base, fecha: "11/09/2026" }), /Fecha/);
  assert.match(validarCierre({ ...base, resultado: "BORRADO" }), /Resultado/);
  assert.match(validarCierre({ ...base, alertaId: `soat-${A}`, resultado: "RESUELTO" }), /no aplica/);
  assert.match(validarCierre({ ...base, resultado: "OTRO", nota: "  " }), /Otro/);
  assert.equal(validarCierre({ ...base, resultado: "OTRO", nota: "Se vendió el local" }), null);
  assert.match(validarCierre({ ...base, nota: "x".repeat(501) }), /500/);
  assert.match(validarCierre(null), /no válido/, "entrada nula desde el navegador");
  assert.match(validarCierre({ ...base, nota: 42 }), /Nota/);
});

test("el cierre empareja por alerta y fecha: con otra fecha no cierra", () => {
  const mapa = mapaDeCierres([
    { alerta_id: `contrato-${A}`, fecha: "2026-09-11", resultado: "RENOVADO", nota: null, cerrado_por_nombre: "Ana", cerrado_en: "2026-09-29T15:00:00Z" },
    { alerta_id: `contrato-${B}`, fecha: "2026-09-11", resultado: "BASURA", nota: null, cerrado_por_nombre: null, cerrado_en: "2026-09-29T15:00:00Z" },
  ]);
  assert.equal(mapa.get(claveCierre(`contrato-${A}`, "2026-09-11"))?.resultado, "RENOVADO");
  assert.equal(mapa.get(claveCierre(`contrato-${A}`, "2027-09-11")), undefined);
  assert.equal(mapa.size, 1, "lo que no se reconoce se descarta");
});

// ─── getAlertas, campana y calendario ───────────────────────────────────

function supabaseFalso(tablas, errores = {}) {
  return {
    from(tabla) {
      const filtros = [];
      const b = {
        select: () => b,
        order: () => b,
        limit: () => b,
        not: () => b,
        is: (c, v) => (filtros.push((f) => (f[c] ?? null) === v), b),
        eq: (c, v) => (filtros.push((f) => f[c] === v), b),
        in: (c, v) => (filtros.push((f) => v.includes(f[c])), b),
        gte: (c, v) => (filtros.push((f) => f[c] != null && f[c] >= v), b),
        lte: (c, v) => (filtros.push((f) => f[c] != null && f[c] <= v), b),
        then: (ok, mal) =>
          Promise.resolve(
            errores[tabla]
              ? { data: null, error: errores[tabla] }
              : { data: (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))), error: null }
          ).then(ok, mal),
      };
      return b;
    },
  };
}

const BASE = {
  fechas_config: [],
  contratos: [
    { id: A, nombre: "Contrato de vigilancia", fecha_vencimiento: enDias(-18) },
    { id: B, nombre: "Subarrendamiento San Borja", fecha_vencimiento: enDias(-15) },
  ],
  vehiculos: [{ id: A, placa: "H3F-856", soat_vence: enDias(-22), poliza_vence: null }],
  personal: [],
};

const cierre = (alertaId, fecha, resultado = "CONCLUIDO") => ({
  alerta_id: alertaId, fecha, resultado, nota: null, cerrado_por_nombre: "Ana", cerrado_en: "2026-09-29T15:00:00Z",
});

test("lo cerrado viene marcado y deja de avisar en la campana", async () => {
  const alertas = await getAlertas(supabaseFalso({
    ...BASE,
    vencimientos_cierres: [cierre(`contrato-${A}`, enDias(-18))],
  }));
  assert.equal(alertas.length, 3, "getAlertas devuelve también lo cerrado, para listarlo en 'Cerrados'");
  assert.equal(alertas.find((a) => a.id === `contrato-${A}`).cierre.resultado, "CONCLUIDO");
  assert.deepEqual(alertasAbiertas(alertas).map((a) => a.id).sort(), [`contrato-${B}`, `soat-${A}`].sort());
  assert.equal(normalizarAlertas(alertas).some((n) => n.id.includes(`contrato-${A}`)), false);
  assert.equal(normalizarAlertas(alertas).length, 2);
});

test("un cierre de otra fecha no apaga el vencimiento nuevo", async () => {
  const alertas = await getAlertas(supabaseFalso({
    ...BASE,
    vencimientos_cierres: [cierre(`soat-${A}`, enDias(-5), "RENOVADO")],
  }));
  assert.equal(alertas.find((a) => a.id === `soat-${A}`).cierre, undefined);
});

test("sin la tabla de cierres (migración pendiente) todo sigue avisando", async () => {
  const alertas = await getAlertas(supabaseFalso(BASE, { vencimientos_cierres: { code: "42P01", message: "no existe" } }));
  assert.equal(alertasAbiertas(alertas).length, 3);
});

test("el calendario marca el vencimiento con su alerta y lo atenúa si está cerrado", () => {
  const eventos = aplicarConfigFechas([
    ...normalizarContratos([{ id: A, tipo: null, nombre: "Vigilancia", fecha_inicio: "2026-01-01", fecha_vencimiento: "2026-09-08", monto: null, moneda: null, estado: null }]),
    ...normalizarVehiculos([{ id: A, placa: "H3F-856", marca_modelo: null, soat_vence: "2026-09-04", poliza_vence: null, responsable: null }]),
  ], new Map());

  const vence = eventos.find((e) => e.id === `contrato-vence-${A}`);
  assert.deepEqual(vence.vencimiento, { alertaId: `contrato-${A}` });
  assert.equal(eventos.find((e) => e.id === `contrato-inicio-${A}`).vencimiento, undefined, "el inicio es evento, no vencimiento");
  assert.deepEqual(eventos.find((e) => e.id === `vehiculo-soat-${A}`).vencimiento, { alertaId: `soat-${A}` });

  const conCierres = adjuntarCierres(eventos, mapaDeCierres([cierre(`contrato-${A}`, "2026-09-08")]));
  assert.equal(conCierres.find((e) => e.id === `contrato-vence-${A}`).vencimiento.cierre.resultado, "CONCLUIDO");
  assert.equal(conCierres.find((e) => e.id === `vehiculo-soat-${A}`).vencimiento.cierre, undefined);
});

// ─── Qué se puede cerrar desde el calendario ────────────────────────────

const opciones = (o = {}) => ({ vencimientosEditables: ["contrato", "vehiculo"], puedeCerrarDiligencias: true, hoy: "2026-09-29", ...o });

function diligenciaDelCalendario({ estado = "PENDIENTE", fecha = "2026-09-01", procesoId = B } = {}) {
  const proceso = procesoId ? new Map([[A, { id: procesoId, expediente: "pruebaciviltest", materia: "civil" }]]) : new Map();
  const [evento] = normalizarEventos([
    { id: A, titulo: "Próxima diligencia", inicia_en: `${fecha}T05:00:00+00:00`, tipo_diligencia: null, responsable: null, estado },
  ], proceso);
  return evento;
}

test("una diligencia con expediente, vencida y pendiente, se cierra desde el calendario (botón en rojo)", () => {
  const evento = diligenciaDelCalendario();
  assert.equal(evento.diligencia.procesoId, B, "viene ligada a su expediente");
  assert.deepEqual(estadoCierreEvento(evento, opciones()), { cerrado: false, editable: true, cerrable: true, vencidoSinCerrar: true });
});

test("una diligencia sin expediente también se cierra desde el calendario", () => {
  const evento = diligenciaDelCalendario({ procesoId: null });
  assert.equal(evento.diligencia.procesoId, null);
  assert.equal(estadoCierreEvento(evento, opciones()).cerrable, true);
});

test("una diligencia ya realizada se ve cerrada y sólo se puede reabrir", () => {
  const evento = diligenciaDelCalendario({ estado: "REALIZADA" });
  assert.deepEqual(estadoCierreEvento(evento, opciones()), { cerrado: true, editable: true, cerrable: false, vencidoSinCerrar: false });
});

test("sin permiso sobre procesos, la diligencia no ofrece cerrar", () => {
  const r = estadoCierreEvento(diligenciaDelCalendario(), opciones({ puedeCerrarDiligencias: false }));
  assert.equal(r.cerrable, false);
  assert.equal(r.editable, false);
});

test("vencimientos: cerrable según el área; el inicio de un contrato (sin vencimiento) no", () => {
  const eventos = aplicarConfigFechas(
    normalizarContratos([{ id: A, tipo: null, nombre: "Valderrama", fecha_inicio: "2026-09-01", fecha_vencimiento: "2026-09-08", monto: null, moneda: null, estado: null }]),
    new Map()
  );
  const inicio = eventos.find((e) => e.id === `contrato-inicio-${A}`);
  const vence = eventos.find((e) => e.id === `contrato-vence-${A}`);
  assert.deepEqual(estadoCierreEvento(inicio, opciones()), { cerrado: false, editable: false, cerrable: false, vencidoSinCerrar: false });
  assert.deepEqual(estadoCierreEvento(vence, opciones()), { cerrado: false, editable: true, cerrable: true, vencidoSinCerrar: true });
  assert.equal(estadoCierreEvento(vence, opciones({ vencimientosEditables: ["vehiculo"] })).cerrable, false, "sin permiso en contratos");

  const [cerrado] = adjuntarCierres([vence], mapaDeCierres([cierre(`contrato-${A}`, "2026-09-08")]));
  assert.deepEqual(estadoCierreEvento(cerrado, opciones()), { cerrado: true, editable: true, cerrable: false, vencidoSinCerrar: false });
});
