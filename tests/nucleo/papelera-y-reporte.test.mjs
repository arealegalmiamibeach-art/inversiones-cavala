import assert from "node:assert/strict";
import test from "node:test";
import {
  DIAS_RETENCION,
  TIPOS_PAPELERA,
  diasParaPurga,
  nombreActorPapelera,
  normalizar,
  tipoPapelera,
} from "../../src/lib/papelera.ts";
import { esClaseAdenda, esUuid, leerMarcaAdenda } from "../../src/lib/contratos/adendas.ts";
import {
  agruparPorEstado,
  agruparPorMateria,
  esConcluido,
  procesosIncompletos,
  proximaDiligencia,
  resumirDescripcion,
} from "../../src/app/(dashboard)/procesos/reporte/calculos.ts";

// ─── Papelera ────────────────────────────────────────────────────────────

test("la papelera cubre las mismas tablas que el RPC papelera_listar", () => {
  // Si se agrega una tabla a `papelera_tablas()` en la base y no aquí, sus
  // filas salen en el panel con el nombre crudo de la tabla y sin icono.
  const esperadas = [
    "propietarios", "predios", "vehiculos", "concesiones_mineras", "personal",
    "oficinas_registrales", "procesos", "contratos", "documentos", "eventos", "archivos",
  ];
  assert.deepEqual(Object.keys(TIPOS_PAPELERA).sort(), [...esperadas].sort());
});

test("cada tipo de papelera sabe qué revalidar", () => {
  for (const [tabla, tipo] of Object.entries(TIPOS_PAPELERA)) {
    assert.ok(tipo.label, `${tabla} sin etiqueta`);
    assert.ok(tipo.icono, `${tabla} sin icono`);
    assert.ok(Array.isArray(tipo.revalidar), `${tabla} sin rutas a revalidar`);
    if (tipo.href) assert.match(tipo.href("abc"), /^\//, `${tabla} con href relativo`);
  }
});

test("un tipo desconocido no rompe el panel", () => {
  const tipo = tipoPapelera("tabla_que_no_existe");
  assert.equal(tipo.label, "tabla_que_no_existe");
  assert.equal(tipo.icono, "Trash2");
  assert.deepEqual(tipo.revalidar, []);
});

test("diasParaPurga cuenta hacia atrás desde los 30 días de retención", () => {
  const hace = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();
  assert.equal(diasParaPurga(hace(0)), DIAS_RETENCION);
  assert.equal(diasParaPurga(hace(10)), DIAS_RETENCION - 10);
  assert.equal(diasParaPurga(hace(29)), 1);
  assert.ok(diasParaPurga(hace(31)) < 0, "lo vencido queda en negativo");
});

test("el actor de la papelera siempre tiene un nombre que mostrar", () => {
  assert.equal(nombreActorPapelera({ actorNombre: "Ana", actorCorreo: "ana@x.pe" }), "Ana");
  assert.equal(nombreActorPapelera({ actorNombre: "  ", actorCorreo: "ana@x.pe" }), "ana");
  assert.equal(nombreActorPapelera({ actorNombre: null, actorCorreo: null }), "Alguien");
});

test("el buscador de la papelera ignora acentos y mayúsculas", () => {
  assert.equal(normalizar("Concesión MINERA"), "concesion minera");
  assert.equal(normalizar("Ñuñoa"), "nunoa");
  assert.equal(normalizar(normalizar("Ámbito")), "ambito", "es idempotente");
});

// ─── Adendas ─────────────────────────────────────────────────────────────

test("esUuid acepta un uuid y rechaza lo que no lo es", () => {
  assert.equal(esUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), true);
  assert.equal(esUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301"), true, "no distingue mayúsculas");
  assert.equal(esUuid("3f2504e0-4f89-11d3-9a0c-0305e82c330"), false, "un dígito de menos");
  assert.equal(esUuid("3f2504e04f8911d39a0c0305e82c3301"), false, "sin guiones");
  assert.equal(esUuid(""), false);
  assert.equal(esUuid(null), false);
  assert.equal(esUuid(123), false);
  assert.equal(esUuid("'; drop table contratos; --"), false);
});

test("leerMarcaAdenda tolera cualquier forma de `extra`", () => {
  assert.deepEqual(leerMarcaAdenda(null), { esAdenda: false, clase: "adenda", padre: null, creadaEnApp: false });
  assert.deepEqual(leerMarcaAdenda(undefined), { esAdenda: false, clase: "adenda", padre: null, creadaEnApp: false });
  assert.deepEqual(leerMarcaAdenda({}), { esAdenda: false, clase: "adenda", padre: null, creadaEnApp: false });
});

test("un padre válido marca la fila como adenda aunque falte `es_adenda`", () => {
  const padre = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  const marca = leerMarcaAdenda({ documento_padre: padre, clase: "resolucion", origen: "app" });
  assert.equal(marca.esAdenda, true);
  assert.equal(marca.padre, padre);
  assert.equal(marca.clase, "resolucion");
  assert.equal(marca.creadaEnApp, true);
});

test("un padre corrupto no se propaga como uuid", () => {
  const marca = leerMarcaAdenda({ es_adenda: true, documento_padre: "no-es-uuid", clase: "inventada" });
  assert.equal(marca.padre, null);
  assert.equal(marca.esAdenda, true);
  assert.equal(marca.clase, "adenda", "una clase desconocida cae al valor por defecto");
});

test("`es_adenda` llega como booleano o como texto desde Notion", () => {
  assert.equal(leerMarcaAdenda({ es_adenda: true }).esAdenda, true);
  assert.equal(leerMarcaAdenda({ es_adenda: "true" }).esAdenda, true);
  assert.equal(leerMarcaAdenda({ es_adenda: false }).esAdenda, false);
  assert.equal(leerMarcaAdenda({ es_adenda: "false" }).esAdenda, false);
  assert.equal(esClaseAdenda("adenda"), true);
  assert.equal(esClaseAdenda("resolucion"), true);
  assert.equal(esClaseAdenda("otra"), false);
});

// ─── Reporte PDF de procesos ─────────────────────────────────────────────

const proceso = (extra) => ({
  id: "x", materia: "civil", expediente: "E-1", asunto: null, estado: null,
  descripcion: null, juzgado: "J-1", abogado: "A-1", estudio: null, diligencia: null,
  ...extra,
});

test("el reporte y el dashboard usan la MISMA definición de concluido", () => {
  // Antes eran dos heurísticas de texto distintas que se contradecían.
  assert.equal(esConcluido("ARCHIVADO"), true);
  assert.equal(esConcluido("ARCHIVO"), true);
  assert.equal(esConcluido(" ARCHIVADO "), true, "tolera espacios");
  assert.equal(esConcluido("ADMISORIA"), false);
  assert.equal(esConcluido("CASACION"), false);
  assert.equal(esConcluido(null), false);
  assert.equal(esConcluido(""), false);
});

test("agruparPorMateria reparte totales y porcentajes", () => {
  const filas = [
    proceso({ materia: "civil", estado: "ADMISORIA" }),
    proceso({ materia: "civil", estado: "ARCHIVADO" }),
    proceso({ materia: "penal", estado: null }),
    proceso({ materia: "penal", estado: null }),
  ];
  const [primera, segunda] = agruparPorMateria(filas);
  assert.equal(primera.total, 2);
  assert.equal(primera.pctTotal, 50);
  assert.equal(segunda.total, 2);
  // Empate: ambas al 50 %, una con la mitad en curso y la otra entera.
  const civil = agruparPorMateria(filas).find((m) => m.materia === "civil");
  assert.equal(civil.enCurso, 1);
  assert.equal(civil.pctEnCurso, 50);
  const penal = agruparPorMateria(filas).find((m) => m.materia === "penal");
  assert.equal(penal.pctEnCurso, 100);
  assert.equal(penal.label, "Penal");
});

test("agruparPorMateria con lista vacía no divide entre cero", () => {
  assert.deepEqual(agruparPorMateria([]), []);
});

test("los procesos sin estado se agrupan bajo «Sin estado»", () => {
  const conteo = agruparPorEstado([
    proceso({ estado: null }),
    proceso({ estado: "   " }),
    proceso({ estado: "ADMISORIA" }),
  ]);
  assert.deepEqual(conteo, [{ estado: "Sin estado", total: 2 }, { estado: "ADMISORIA", total: 1 }]);
});

test("procesosIncompletos marca lo que le falta expediente, juzgado o abogado", () => {
  const filas = [
    proceso({ id: "completo" }),
    proceso({ id: "sin-exp", expediente: "  " }),
    proceso({ id: "sin-juzgado", juzgado: null }),
    proceso({ id: "sin-abogado", abogado: "" }),
  ];
  assert.deepEqual(procesosIncompletos(filas).map((p) => p.id), ["sin-exp", "sin-juzgado", "sin-abogado"]);
});

test("resumirDescripcion toma la primera línea con contenido y la recorta", () => {
  assert.equal(resumirDescripcion(null), "—");
  assert.equal(resumirDescripcion("\n\n  Se resolvió el recurso  \nsegunda línea"), "Se resolvió el recurso");
  const largo = resumirDescripcion("a".repeat(300));
  assert.equal(largo.length, 161, "160 caracteres más el puntos suspensivos");
  assert.ok(largo.endsWith("…"));
});

test("la próxima diligencia del reporte respeta el día que se le pasa", () => {
  const hoy = new Date(2026, 2, 12); // 12 de marzo de 2026, hora local
  const p = proceso({ diligencia: "01/01/2026", descripcion: "y luego el 20/04/2026" });
  const proxima = proximaDiligencia(p, hoy);
  assert.equal(proxima.getFullYear(), 2026);
  assert.equal(proxima.getMonth(), 3);
  assert.equal(proxima.getDate(), 20);
  // Una diligencia de hoy cuenta como futura, no como vencida.
  assert.equal(proximaDiligencia(proceso({ diligencia: "12/03/2026" }), hoy).getDate(), 12);
  // Sin fechas futuras ni pasadas reconocibles.
  assert.equal(proximaDiligencia(proceso({ diligencia: "sin fecha" }), hoy), null);
  assert.equal(proximaDiligencia(proceso({ diligencia: "01/01/2026" }), hoy), null, "sólo mira hacia adelante");
});
