import assert from "node:assert/strict";
import { test } from "node:test";
import { CLAVES_PARTES_PROCESO, PARTES_PROCESO, partesDeMateria, partesDeProceso } from "@/lib/procesos/partes";

const claves = (partes) => partes.map((parte) => parte.clave);

test("cada materia muestra sus partes aunque estén vacías", () => {
  assert.deepEqual(claves(partesDeProceso("civil", {})), ["Demandante", "Demandado"]);
  assert.deepEqual(claves(partesDeProceso("carpeta_fiscal", null)), ["Imputado", "Agraviado"]);
  assert.deepEqual(
    claves(partesDeProceso("conciliacion", {})),
    ["Solicitante", "Destinatario", "Centro de conciliación", "Fecha"]
  );
  assert.deepEqual(claves(partesDeProceso("administrativo", {})), []);
});

test("una parte con dato fuera de su materia no se esconde", () => {
  const partes = partesDeProceso("penal", { Imputado: "X", "column 17": "No tenemos expediente físico" });
  assert.deepEqual(claves(partes), ["Imputado", "Agraviado", "column 17"]);
  assert.equal(partes.find((parte) => parte.clave === "Imputado").valor, "X");
  assert.equal(partes.find((parte) => parte.clave === "Agraviado").valor, null);
});

test("una materia nueva del catálogo cae en demandante y demandado", () => {
  assert.deepEqual(claves(partesDeMateria("arbitraje")), ["Demandante", "Demandado"]);
});

test("'Todos los procesos' ofrece todas las partes como columnas", () => {
  assert.deepEqual(claves(partesDeMateria(null)), claves(PARTES_PROCESO));
});

test("la acción sólo acepta claves del catálogo, no el resto de extra", () => {
  assert.ok(CLAVES_PARTES_PROCESO.has("Demandado"));
  for (const interna of ["0", "origen", "_sin_numero_expediente", "notas"]) {
    assert.ok(!CLAVES_PARTES_PROCESO.has(interna), interna);
  }
});
