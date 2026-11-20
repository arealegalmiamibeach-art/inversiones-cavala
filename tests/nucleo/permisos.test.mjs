import assert from "node:assert/strict";
import test from "node:test";
import {
  SECCIONES,
  nivelAcceso,
  nivelBaseRol,
  normalizarPermisos,
  puedeEscribir,
  puedeVerPersonal,
  puedeVerSeccion,
  seccionEntidad,
  seccionRuta,
  tiposContratoVisibles,
} from "../../src/lib/auth/roles.ts";

// Este módulo es el espejo en TypeScript de las políticas RLS. Si deja de
// coincidir, la UI enseña (o esconde) cosas que la base decide al revés.

test("tesorería sólo alcanza vehículos y contratos", () => {
  assert.equal(puedeVerSeccion("tesoreria", "vehiculos"), true);
  assert.equal(puedeVerSeccion("tesoreria", "contratos"), true);
  assert.equal(puedeVerSeccion("tesoreria", "documentos"), false);
  assert.equal(puedeVerSeccion("tesoreria", "personal"), false);
  assert.equal(puedeVerSeccion("tesoreria", "procesos"), false);
  assert.equal(puedeVerSeccion("tesoreria", "dashboard"), false);
});

test("soporte documentario ve todo menos personal y dashboard", () => {
  assert.equal(puedeVerSeccion("soporte_documentario", "personal"), false);
  assert.equal(puedeVerSeccion("soporte_documentario", "dashboard"), false);
  assert.equal(puedeVerSeccion("soporte_documentario", "documentos"), true);
  assert.equal(puedeVerSeccion("soporte_documentario", "riesgo"), true);
});

test("sin rol no se ve ninguna sección", () => {
  for (const seccion of SECCIONES) assert.equal(puedeVerSeccion(null, seccion), false);
});

test("el rol base no da escritura a nadie salvo al administrador", () => {
  for (const seccion of SECCIONES) {
    assert.equal(nivelBaseRol("administrador", seccion), seccion === "dashboard" || seccion === "riesgo" ? "visualizar" : "administrar");
    assert.notEqual(nivelBaseRol("tesoreria", seccion), "administrar");
    assert.notEqual(nivelBaseRol("soporte_documentario", seccion), "administrar");
  }
});

test("dashboard y riesgo son informes: nadie escribe en ellos", () => {
  assert.equal(nivelAcceso("administrador", "dashboard"), "visualizar");
  assert.equal(nivelAcceso("administrador", "riesgo"), "visualizar");
  // Una excepción que pida "administrar" sobre un informe se degrada, no se aplica.
  assert.equal(nivelAcceso("soporte_documentario", "riesgo", { riesgo: "administrar" }), "visualizar");
  assert.equal(puedeEscribir({ rol: "administrador", permisos: {} }, "dashboard"), false);
});

test("una excepción por usuario puede subir y bajar el acceso", () => {
  assert.equal(nivelAcceso("tesoreria", "documentos"), "sin_acceso");
  assert.equal(nivelAcceso("tesoreria", "documentos", { documentos: "visualizar" }), "visualizar");
  assert.equal(nivelAcceso("tesoreria", "documentos", { documentos: "administrar" }), "administrar");
  assert.equal(nivelAcceso("soporte_documentario", "procesos", { procesos: "sin_acceso" }), "sin_acceso");
});

test("el administrador ignora las excepciones por usuario", () => {
  assert.equal(nivelAcceso("administrador", "personal", { personal: "sin_acceso" }), "administrar");
  assert.deepEqual(normalizarPermisos("administrador", { personal: "sin_acceso" }), {});
});

test("normalizarPermisos descarta lo que repite el rol y lo que no es un nivel", () => {
  // Redundante: tesorería ya ve vehículos.
  assert.deepEqual(normalizarPermisos("tesoreria", { vehiculos: "visualizar" }), {});
  // Excepción real: tesorería no ve documentos.
  assert.deepEqual(normalizarPermisos("tesoreria", { documentos: "visualizar" }), { documentos: "visualizar" });
  // Basura: se descarta en vez de guardarse como nivel.
  assert.deepEqual(normalizarPermisos("tesoreria", { documentos: "total" }), {});
  assert.deepEqual(normalizarPermisos("tesoreria", { seccion_inventada: "administrar" }), {});
  assert.deepEqual(normalizarPermisos(null, { documentos: "administrar" }), {});
});

test("normalizarPermisos es idempotente", () => {
  const permisos = { documentos: "administrar", personal: "visualizar", procesos: "sin_acceso" };
  const una = normalizarPermisos("tesoreria", permisos);
  assert.deepEqual(normalizarPermisos("tesoreria", una), una);
});

test("tesorería sólo ve los tres tipos de contrato con alcance económico", () => {
  assert.deepEqual(tiposContratoVisibles("tesoreria"), ["servicios", "mutuo", "arrendamiento"]);
  assert.equal(tiposContratoVisibles("administrador"), null, "null = sin filtro");
  assert.equal(tiposContratoVisibles("soporte_documentario"), null);
  // Sólo una excepción explícita de administración le abre los seis tipos.
  assert.equal(tiposContratoVisibles({ rol: "tesoreria", permisos: { contratos: "administrar" } }), null);
  assert.deepEqual(
    tiposContratoVisibles({ rol: "tesoreria", permisos: { contratos: "visualizar" } }),
    ["servicios", "mutuo", "arrendamiento"],
    "visualizar no amplía el alcance"
  );
});

test("personal (DNI y remuneración) queda cerrado salvo acceso explícito", () => {
  assert.equal(puedeVerPersonal("administrador"), true);
  assert.equal(puedeVerPersonal("tesoreria"), false);
  assert.equal(puedeVerPersonal("soporte_documentario"), false);
  assert.equal(puedeVerPersonal({ rol: "soporte_documentario", permisos: {} }), false);
  assert.equal(puedeVerPersonal({ rol: "soporte_documentario", permisos: { personal: "visualizar" } }), true);
  assert.equal(puedeVerPersonal(null), false);
});

test("puedeEscribir exige administrar sobre el área concreta", () => {
  assert.equal(puedeEscribir({ rol: "tesoreria", permisos: {} }, "vehiculos"), false);
  assert.equal(puedeEscribir({ rol: "tesoreria", permisos: { vehiculos: "administrar" } }, "vehiculos"), true);
  assert.equal(puedeEscribir({ rol: "tesoreria", permisos: { vehiculos: "administrar" } }, "contratos"), false);
  assert.equal(puedeEscribir(null, "vehiculos"), false);
});

test("cada entidad escribible se mapea a un área de permisos", () => {
  // Las claves son las que usan `vinculos`, `archivos` y las acciones de alta.
  const entidades = [
    "propietario", "propietarios", "datos_empresas", "predio", "predios",
    "vehiculo", "vehiculos", "concesion", "concesiones_mineras", "personal",
    "oficina_registral", "oficinas_registrales", "proceso", "procesos",
    "evento", "eventos", "documento", "documentos", "contrato", "contratos",
  ];
  for (const entidad of entidades) {
    assert.ok(seccionEntidad(entidad), `sin área para "${entidad}"`);
  }
  assert.equal(seccionEntidad("inventada"), undefined);
});

test("seccionRuta protege las rutas que el middleware filtra", () => {
  assert.equal(seccionRuta("/dashboard"), "dashboard");
  assert.equal(seccionRuta("/dashboard/riesgo"), "riesgo");
  assert.equal(seccionRuta("/entidades/predios"), "predios");
  assert.equal(seccionRuta("/entidades/predios/abc"), "predios");
  assert.equal(seccionRuta("/entidades/concesiones"), "concesiones");
  assert.equal(seccionRuta("/entidades/oficinas"), "oficinas");
  assert.equal(seccionRuta("/documentos"), "documentos");
  assert.equal(seccionRuta("/documentos/copias-literales"), "documentos");
  assert.equal(seccionRuta("/documentos/tipos/escritura"), "documentos");
  assert.equal(seccionRuta("/contratos/tipo/mutuo"), "contratos");
  assert.equal(seccionRuta("/procesos/materia/sunafil"), "procesos");
  assert.equal(seccionRuta("/procesos/reporte"), "procesos");
});
