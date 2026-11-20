import assert from "node:assert/strict";
import { test } from "node:test";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";
import { cargarEventosPorProcesos, proximaDiligenciaRegistrada, aEventoProceso } from "@/lib/procesos/eventos";
import { columnasRelacionesContrato, relacionesDeColumna } from "@/lib/relaciones/columnas";
import { propiedadesContrato } from "@/lib/contratos/propiedades";

// Mismo límite real de PostgREST que `relaciones-lotes`: un `.in()` con
// cientos de UUIDs no entra en la URL y la consulta falla. Pasaba con las
// tablas completas (501 predios, 931 documentos, 606 copias literales): la
// columna "Adjuntos" salía en 0 y "Entidad relacionada" vacía, sin avisar.
const MAX_IDS_EN_URL = 350;
const MAX_FILAS = 1000;

function clienteFalso(tablas) {
  return {
    from(tabla) {
      const filtros = [];
      let rango = null;
      let error = null;
      const consulta = {
        select: () => consulta,
        order: () => consulta,
        eq(columna, valor) {
          filtros.push((fila) => fila[columna] === valor);
          return consulta;
        },
        in(columna, valores) {
          if (valores.length > MAX_IDS_EN_URL) error = { message: "Bad Request" };
          const set = new Set(valores);
          filtros.push((fila) => set.has(fila[columna]));
          return consulta;
        },
        range(desde, hasta) {
          rango = [desde, hasta];
          return consulta;
        },
        then(resolver, rechazar) {
          if (error) return Promise.resolve({ data: null, error }).then(resolver, rechazar);
          const todas = (tablas[tabla] ?? []).filter((fila) => filtros.every((f) => f(fila)));
          const [desde, hasta] = rango ?? [0, todas.length - 1];
          const data = todas.slice(desde, Math.min(hasta + 1, desde + MAX_FILAS));
          return Promise.resolve({ data, error: null }).then(resolver, rechazar);
        },
      };
      return consulta;
    },
  };
}

const documentos = Array.from({ length: 931 }, (_, i) => ({ id: `doc-${String(i).padStart(4, "0")}`, nombre: `Documento ${i}` }));
const ids = documentos.map((documento) => documento.id);

test("las relaciones ocultas por permisos no generan enlaces ni nombres inventados", async () => {
  const vinculos = [{ origen_tipo: "documento", origen_id: "doc", destino_tipo: "personal", destino_id: "oculto", rol: null }];
  assert.deepEqual(await cargarRelacionesEntidad(clienteFalso({ vinculos }), "documento", ["doc"]), {});
});

test("dos roles de una misma parte son propiedades distintas y no se mezclan con predios", () => {
  const relaciones = [
    { entidadTipo: "propietario", entidadId: "persona", rol: "acreedor", rolLabel: "Acreedor" },
    { entidadTipo: "propietario", entidadId: "persona", rol: "deudor", rolLabel: "Deudor" },
    { entidadTipo: "predio", entidadId: "bien", rol: null, entidadTipoLabel: "Predio" },
  ];
  const columnas = columnasRelacionesContrato(relaciones, ["mutuo"]);
  assert.equal(new Set(columnas.map((c) => c.clave)).size, columnas.length);
  assert.deepEqual(relacionesDeColumna(relaciones, columnas.find((c) => c.rol === "acreedor")), [relaciones[0]]);
  assert.deepEqual(relacionesDeColumna(relaciones, columnas.find((c) => c.rol === "deudor")), [relaciones[1]]);
  assert.deepEqual(relacionesDeColumna(relaciones, columnas.find((c) => c.tipo === "predio")), [relaciones[2]]);
});

test("en MBP-Otros el arrendador es una sola propiedad Contratante/Arrendador, sin fila Propietario aparte", () => {
  const relaciones = [{ entidadTipo: "propietario", entidadId: "lcv", rol: "arrendador", rolLabel: "Arrendador" }];
  const servicios = columnasRelacionesContrato(relaciones, ["servicios"]);
  const parte = servicios.find((c) => c.rol === "arrendador");
  assert.equal(parte.label, "Contratante/Arrendador");
  assert.deepEqual(relacionesDeColumna(relaciones, parte), relaciones);
  assert.ok(!servicios.some((c) => c.clave === "tipo:propietario"));
  // Vacía, igual se ofrece para vincular el primero.
  assert.ok(columnasRelacionesContrato([], ["servicios"]).some((c) => c.rol === "arrendador"));
  // En una vista mixta los demás tipos siguen necesitando "Propietario".
  assert.ok(columnasRelacionesContrato(relaciones, ["servicios", "personal"]).some((c) => c.clave === "tipo:propietario"));
});

test("vaciar una propiedad contractual no elimina el campo de las tres vistas", () => {
  const propiedades = propiedadesContrato({ Detalles: null, notas: "privadas", es_adenda: true, Monto: 0 });
  assert.ok(propiedades.some((p) => p.clave === "Detalles" && p.valor === ""));
  assert.ok(propiedades.some((p) => p.clave === "Monto" && p.valor === "0"));
  assert.ok(!propiedades.some((p) => p.clave === "notas" || p.clave === "es_adenda"));
});

test("la fecha registrada prevalece sobre texto antiguo y una diligencia cerrada no reaparece", () => {
  const proceso = { diligencia: "Audiencia 01/01/2040" };
  const evento = aEventoProceso({ id: "evento", titulo: "Audiencia", inicia_en: "2040-02-03T15:30:00-05:00", estado: "PENDIENTE" }, "2040-01-01");
  assert.equal(proximaDiligenciaRegistrada(proceso, [evento], "2040-01-01").fechaISO, "2040-02-03");
  assert.equal(proximaDiligenciaRegistrada(proceso, [evento], "2040-01-01").hora, "15:30");
  assert.equal(proximaDiligenciaRegistrada(proceso, [{ ...evento, estado: "REALIZADA" }], "2040-01-01"), null);
  assert.equal(proximaDiligenciaRegistrada(proceso, [], "2040-01-01").fechaISO, "2040-01-01");
});

test("los eventos se cargan por lotes en ambos sentidos y sin duplicar relaciones recíprocas", async () => {
  const eventos = Array.from({ length: 1101 }, (_, i) => ({ id: `evento-${i}`, titulo: "Audiencia", inicia_en: "2040-02-03T00:00:00-05:00", estado: "PENDIENTE" }));
  const procesos = eventos.map((_, i) => `proceso-${i}`);
  const vinculos = eventos.flatMap((e, i) => [
    { origen_tipo: "proceso", origen_id: procesos[i], destino_tipo: "evento", destino_id: e.id },
    { origen_tipo: "evento", origen_id: e.id, destino_tipo: "proceso", destino_id: procesos[i] },
  ]);
  const cargados = await cargarEventosPorProcesos(clienteFalso({ vinculos, eventos }), procesos);
  assert.equal(Object.keys(cargados).length, 1101);
  assert.equal(cargados["proceso-1100"].length, 1);
  assert.equal(cargados["proceso-1100"][0].fecha, "2040-02-03");
});

test("la tabla completa de documentos cuenta los adjuntos de todas las filas", async () => {
  const archivos = documentos.flatMap((documento, i) => [
    { id: `a-${i}`, entidad_tipo: "documento", entidad_id: documento.id },
    ...(i % 2 === 0 ? [{ id: `b-${i}`, entidad_tipo: "documento", entidad_id: documento.id }] : []),
  ]);

  const conteos = await contarArchivosPorEntidad(clienteFalso({ archivos }), "documento", ids);

  assert.equal(Object.keys(conteos).length, 931);
  assert.equal(conteos["doc-0000"], 2);
  assert.equal(conteos["doc-0001"], 1);
});

test("cada documento de una tabla completa trae su entidad relacionada", async () => {
  const predios = documentos.map((_, i) => ({ id: `predio-${i}`, nombre: `Predio ${i}` }));
  const vinculos = documentos.map((documento, i) => ({
    id: i,
    origen_tipo: i % 2 === 0 ? "documento" : "predio",
    origen_id: i % 2 === 0 ? documento.id : `predio-${i}`,
    destino_tipo: i % 2 === 0 ? "predio" : "documento",
    destino_id: i % 2 === 0 ? `predio-${i}` : documento.id,
    rol: null,
  }));

  const porDocumento = await cargarRelacionesEntidad(clienteFalso({ vinculos, predios }), "documento", ids);

  assert.equal(Object.keys(porDocumento).length, 931);
  assert.equal(porDocumento["doc-0930"][0].entidadNombre, "Predio 930");
  assert.equal(porDocumento["doc-0930"][0].href, "/entidades/predios/predio-930");
});
