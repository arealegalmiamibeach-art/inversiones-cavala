import assert from "node:assert/strict";
import test from "node:test";
import {
  alcanceCorreo,
  filtrarAlertas,
  idContratoDeHref,
  puedeRecibirAlerta,
  puedeRecibirDiligencias,
} from "../../src/lib/alertas/alcance-correo.ts";

// El cron manda el correo con la service-role key, que se salta la RLS. Estas
// pruebas fijan que cada destinatario recibe sólo lo que abriría en la app.

const ID = "3f2b8c1e-9d4a-4e7b-a1c5-6d8e9f0a1b2c";
const acceso = (rol, permisos = {}) => ({ rol, permisos });

const admin = acceso("administrador");
const tesoreria = acceso("tesoreria");
const soporte = acceso("soporte_documentario");

test("tesorería recibe vehículos y contratos de sus tres tipos", () => {
  assert.equal(puedeRecibirAlerta(tesoreria, { href: `/entidades/vehiculos/${ID}` }), true);
  for (const tipo of ["servicios", "mutuo", "arrendamiento"]) {
    assert.equal(puedeRecibirAlerta(tesoreria, { href: `/contratos/${ID}` }, tipo), true, tipo);
  }
});

test("tesorería no recibe contratos de otros tipos ni de tipo desconocido", () => {
  assert.equal(puedeRecibirAlerta(tesoreria, { href: `/contratos/${ID}` }, "otro"), false);
  assert.equal(puedeRecibirAlerta(tesoreria, { href: `/contratos/${ID}` }, null), false);
  assert.equal(puedeRecibirAlerta(tesoreria, { href: `/contratos/${ID}` }), false);
});

test("tesorería no recibe personal, documentos, predios ni procesos", () => {
  for (const href of [
    `/entidades/personal/${ID}`,
    `/documentos/${ID}`,
    `/entidades/predios/${ID}`,
    `/procesos/${ID}`,
  ]) {
    assert.equal(puedeRecibirAlerta(tesoreria, { href }), false, href);
  }
  assert.equal(puedeRecibirDiligencias(tesoreria), false);
});

test("una excepción de administrar contratos le abre todos los tipos a tesorería", () => {
  const conExcepcion = acceso("tesoreria", { contratos: "administrar" });
  assert.equal(puedeRecibirAlerta(conExcepcion, { href: `/contratos/${ID}` }, "otro"), true);
});

test("una excepción de visualizar personal le abre esos avisos a tesorería", () => {
  const conExcepcion = acceso("tesoreria", { personal: "visualizar" });
  assert.equal(puedeRecibirAlerta(conExcepcion, { href: `/entidades/personal/${ID}` }), true);
  assert.equal(puedeRecibirAlerta(conExcepcion, { href: `/documentos/${ID}` }), false);
});

test("soporte recibe todo menos personal, y contratos de cualquier tipo", () => {
  assert.equal(puedeRecibirAlerta(soporte, { href: `/entidades/personal/${ID}` }), false);
  assert.equal(puedeRecibirAlerta(soporte, { href: `/documentos/${ID}` }), true);
  assert.equal(puedeRecibirAlerta(soporte, { href: `/entidades/predios/${ID}` }), true);
  assert.equal(puedeRecibirAlerta(soporte, { href: `/contratos/${ID}` }, "otro"), true);
  assert.equal(puedeRecibirDiligencias(soporte), true);
});

test("una excepción sin acceso a procesos le quita las diligencias a soporte", () => {
  assert.equal(puedeRecibirDiligencias(acceso("soporte_documentario", { procesos: "sin_acceso" })), false);
});

test("el administrador recibe todo, incluso una ruta que no se reconoce", () => {
  for (const href of [`/entidades/personal/${ID}`, `/documentos/${ID}`, `/contratos/${ID}`, "/otra-cosa"]) {
    assert.equal(puedeRecibirAlerta(admin, { href }, "otro"), true, href);
  }
  assert.equal(puedeRecibirDiligencias(admin), true);
});

test("una ruta que no se reconoce no llega a nadie más", () => {
  assert.equal(puedeRecibirAlerta(soporte, { href: "/otra-cosa" }), false);
  assert.equal(puedeRecibirAlerta(tesoreria, { href: "/otra-cosa" }), false);
});

test("una cuenta sin rol no recibe nada", () => {
  const sinRol = acceso(null);
  assert.equal(puedeRecibirAlerta(sinRol, { href: `/entidades/vehiculos/${ID}` }), false);
  assert.equal(puedeRecibirDiligencias(sinRol), false);
});

test("filtrarAlertas usa el tipo de cada contrato", () => {
  const otroId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const alertas = [
    { id: "a", href: `/contratos/${ID}` },
    { id: "b", href: `/contratos/${otroId}` },
    { id: "c", href: `/entidades/vehiculos/${ID}` },
    { id: "d", href: `/entidades/personal/${ID}` },
  ];
  const tipos = new Map([[ID, "servicios"], [otroId, "otro"]]);
  assert.deepEqual(filtrarAlertas(alertas, tesoreria, tipos).map((a) => a.id), ["a", "c"]);
  assert.deepEqual(filtrarAlertas(alertas, soporte, tipos).map((a) => a.id), ["a", "b", "c"]);
  assert.deepEqual(filtrarAlertas(alertas, admin, tipos).map((a) => a.id), ["a", "b", "c", "d"]);
  // Sin tipos cargados, tesorería pierde los contratos pero conserva lo demás.
  assert.deepEqual(filtrarAlertas(alertas, tesoreria, new Map()).map((a) => a.id), ["c"]);
});

test("idContratoDeHref sólo reconoce rutas de un contrato", () => {
  assert.equal(idContratoDeHref(`/contratos/${ID}`), ID);
  assert.equal(idContratoDeHref(`/contratos/${ID}?x=1`), ID);
  assert.equal(idContratoDeHref("/contratos/tipo/todos"), null);
  assert.equal(idContratoDeHref(`/documentos/${ID}`), null);
});

test("alcanceCorreo describe lo que recibirá cada rol", () => {
  const t = alcanceCorreo(tesoreria);
  assert.deepEqual(t.vencimientos, ["Contratos (sólo servicios, mutuo, arrendamiento)", "Vehículos"]);
  assert.equal(t.diligencias, false);
  assert.ok(t.excluidas.includes("Personal"));

  const s = alcanceCorreo(soporte);
  assert.deepEqual(s.excluidas, ["Personal"]);
  assert.equal(s.diligencias, true);

  const a = alcanceCorreo(admin);
  assert.deepEqual(a.excluidas, []);
  assert.equal(a.diligencias, true);
});
