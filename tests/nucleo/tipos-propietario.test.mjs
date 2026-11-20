import assert from "node:assert/strict";
import { test } from "node:test";
import { cargarTiposPropietario, esNombreTipoFijo, opcionesTipoPropietario } from "@/lib/propietarios/tipos-catalogo";

// Cliente falso de las dos tablas que lee `cargarTiposPropietario`. Con
// `migracionAplicada: false` la columna `orden` no existe y pedirla falla como
// en PostgREST (42703), que es el caso que tiene que degradar sin romper.
function clienteFalso({ tipos, propietarios = [], migracionAplicada = true, tiposFallan = false }) {
  return {
    from(tabla) {
      const ordenes = [];
      const consulta = {
        select: () => consulta,
        order(columna) {
          ordenes.push(columna);
          return consulta;
        },
        not: () => consulta,
        then(resolver) {
          if (tabla === "propietarios") {
            const datos = propietarios
              .map((extra) => ({ tipo: extra?.tipo_propietario ?? null }))
              .filter((fila) => fila.tipo !== null);
            return resolver({ data: datos, error: null });
          }
          if (tiposFallan || (ordenes.includes("orden") && !migracionAplicada)) {
            return resolver({ data: null, error: { code: "42703", message: "column tipos_propietario.orden does not exist" } });
          }
          const criterio = ordenes.includes("orden")
            ? (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es")
            : (a, b) => a.nombre.localeCompare(b.nombre, "es");
          const datos = [...tipos].sort(criterio).map(({ id, nombre }) => ({ id, nombre }));
          return resolver({ data: datos, error: null });
        },
      };
      return consulta;
    },
  };
}

const TIPOS = [
  { id: "t-socio", nombre: "Socio", orden: 2 },
  { id: "t-banco", nombre: "Banco", orden: 1 },
  { id: "t-aliado", nombre: "Aliado", orden: 3 },
];

test("el catálogo sale en el orden elegido y cuenta cuántos propietarios usa cada tipo", async () => {
  const supabase = clienteFalso({
    tipos: TIPOS,
    propietarios: [{ tipo_propietario: "Socio" }, { tipo_propietario: "socio " }, { tipo_propietario: "Banco" }, { origen: "app" }],
  });
  const tipos = await cargarTiposPropietario(supabase);
  assert.deepEqual(tipos.map((tipo) => tipo.nombre), ["Banco", "Socio", "Aliado"]);
  assert.deepEqual(tipos.map((tipo) => tipo.usos), [1, 2, 0]);
});

test("sin la migración (columna orden) el catálogo cae al orden por nombre", async () => {
  const tipos = await cargarTiposPropietario(clienteFalso({ tipos: TIPOS, migracionAplicada: false }));
  assert.deepEqual(tipos.map((tipo) => tipo.nombre), ["Aliado", "Banco", "Socio"]);
});

test("si el catálogo no se puede leer, la vista sigue con Propio y Tercero", async () => {
  const tipos = await cargarTiposPropietario(clienteFalso({ tipos: TIPOS, tiposFallan: true }));
  assert.deepEqual(tipos, []);
  assert.deepEqual(opcionesTipoPropietario(tipos).map((opcion) => opcion.label), ["Propio", "Tercero"]);
});

test("Propio y Tercero van primero y fijos; los personalizados llevan id y usos", () => {
  const opciones = opcionesTipoPropietario([
    { id: "t-banco", nombre: "Banco", usos: 4 },
    { id: "t-propio", nombre: "PROPIO", usos: 0 },
    { id: "t-aliado", nombre: "Aliado", usos: 0 },
  ]);
  assert.deepEqual(opciones.map((opcion) => opcion.label), ["Propio", "Tercero", "Banco", "Aliado"]);
  assert.deepEqual(opciones.map((opcion) => Boolean(opcion.fija)), [true, true, false, false]);
  assert.deepEqual(opciones.slice(0, 2).map((opcion) => opcion.value), ["true", "false"]);
  assert.equal(opciones[2].id, "t-banco");
  assert.equal(opciones[2].usos, 4);
  assert.equal(opciones[2].value, "Banco");
});

test("ningún tipo personalizado puede llamarse Propio ni Tercero", () => {
  assert.equal(esNombreTipoFijo("propio"), true);
  assert.equal(esNombreTipoFijo("  TERCERO "), true);
  assert.equal(esNombreTipoFijo("Terceros"), false);
  assert.equal(esNombreTipoFijo("Socio"), false);
});
