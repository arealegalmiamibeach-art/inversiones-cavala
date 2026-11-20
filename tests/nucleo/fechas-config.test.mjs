import assert from "node:assert/strict";
import test from "node:test";
import { getAlertas } from "../../src/lib/alertas.ts";
import { aplicarConfigFechas } from "../../src/lib/calendario.ts";
import { cargarConfigFechas, configDe, esFuenteValida } from "../../src/lib/fechas-config.ts";
import { hoyISOEnLima, sumarDiasISO } from "../../src/lib/utils.ts";

// "Fechas y avisos" decide qué fuente sale en el calendario y cuál avisa. Sin
// configurar nada, todo tiene que comportarse exactamente como antes.

const hoy = hoyISOEnLima();
const enDias = (n) => sumarDiasISO(hoy, n);

function pasa(fila, filtros) {
  return filtros.every(([op, col, valor]) => {
    const v = fila[col];
    if (op === "is") return (v ?? null) === valor;
    if (op === "eq") return v === valor;
    if (op === "in") return valor.includes(v);
    if (op === "gte") return v != null && v >= valor;
    if (op === "lte") return v != null && v <= valor;
    return true;
  });
}

function supabaseFalso(tablas) {
  const consultas = [];
  return {
    consultas,
    from(tabla) {
      const consulta = { tabla, filtros: [] };
      consultas.push(consulta);
      const b = {
        select: () => b,
        order: () => b,
        limit: () => b,
        not: () => b,
        is: (c, v) => (consulta.filtros.push(["is", c, v]), b),
        eq: (c, v) => (consulta.filtros.push(["eq", c, v]), b),
        in: (c, v) => (consulta.filtros.push(["in", c, v]), b),
        gte: (c, v) => (consulta.filtros.push(["gte", c, v]), b),
        lte: (c, v) => (consulta.filtros.push(["lte", c, v]), b),
        then: (ok, mal) =>
          Promise.resolve({ data: (tablas[tabla] ?? []).filter((f) => pasa(f, consulta.filtros)), error: null }).then(ok, mal),
      };
      return b;
    },
  };
}

const BASE = {
  contratos: [{ id: "c1", nombre: "Alquiler", fecha_inicio: enDias(5), fecha_vencimiento: enDias(10) }],
  vehiculos: [{ id: "v1", placa: "ABC-123", soat_vence: enDias(3), poliza_vence: null }],
  personal: [],
  documentos: [
    { id: "d1", nombre: "Poder Juan", tipo: "vigencia_poder", fecha: enDias(-25) },
    { id: "d2", nombre: "Poder viejo", tipo: "vigencia_poder", fecha: enDias(-100) },
    { id: "d3", nombre: "Copia 2023", tipo: "copia_literal", fecha: enDias(-2) },
  ],
};

test("sin configurar, avisa lo mismo que antes y con los mismos ids", async () => {
  const alertas = await getAlertas(supabaseFalso({ ...BASE, fechas_config: [] }));
  assert.deepEqual(alertas.map((a) => a.id).sort(), ["contrato-c1", "soat-v1"]);
  const soat = alertas.find((a) => a.id === "soat-v1");
  assert.equal(soat.tipo, "SOAT");
  assert.equal(soat.etiqueta, "Vence el SOAT");
  assert.equal(soat.dias, 3);
});

test("una fuente fija marcada como dato deja de avisar; una de inicio puede empezar a avisar", async () => {
  const supabase = supabaseFalso({
    ...BASE,
    fechas_config: [
      { fuente: "vehiculo.soat_vence", tipo: "dato", dias_vigencia: null },
      { fuente: "contrato.fecha_inicio", tipo: "vencimiento", dias_vigencia: null },
    ],
  });
  const alertas = await getAlertas(supabase);
  assert.deepEqual(alertas.map((a) => a.id).sort(), ["contrato-c1", "contrato-inicio-c1"]);
  assert.equal(
    supabase.consultas.some((c) => c.filtros.some(([, col]) => col === "soat_vence")),
    false,
    "ni siquiera consulta lo que no avisa"
  );
});

test("un tipo de documento con vigencia avisa el día en que caduca, no el de emisión", async () => {
  const alertas = await getAlertas(supabaseFalso({
    ...BASE,
    fechas_config: [{ fuente: "documento:vigencia_poder", tipo: "vencimiento", dias_vigencia: 30 }],
  }));
  const poder = alertas.find((a) => a.id === "documento-d1");
  assert.ok(poder, "emitido hace 25 días, vence en 5");
  assert.equal(poder.fecha, enDias(5));
  assert.equal(poder.tipo, "Vigencia de Poder");
  assert.equal(poder.etiqueta, "Vence vigencia de poder");
  assert.equal(alertas.some((a) => a.id === "documento-d2"), false, "venció hace 70 días: fuera de la ventana");
  assert.equal(alertas.some((a) => a.id === "documento-d3"), false, "copia literal sin configurar no avisa");
});

test("una propiedad personalizada marcada como vencimiento avisa, salvo si el registro está en la papelera", async () => {
  const propiedadId = "11111111-2222-3333-4444-555555555555";
  const alertas = await getAlertas(supabaseFalso({
    ...BASE,
    fechas_config: [{ fuente: `propiedad:${propiedadId}`, tipo: "vencimiento", dias_vigencia: null }],
    propiedades_personalizadas: [{ id: propiedadId, nombre: "Licencia", entidad_tipo: "predio", tipo: "fecha" }],
    valores_propiedad_personalizada: [
      { propiedad_id: propiedadId, entidad_id: "p1", valor: enDias(7) },
      { propiedad_id: propiedadId, entidad_id: "p2", valor: enDias(7) },
    ],
    predios: [
      { id: "p1", nombre: "Fundo Norte", eliminado_en: null },
      { id: "p2", nombre: "Fundo borrado", eliminado_en: "2026-01-01T00:00:00Z" },
    ],
  }));
  const licencias = alertas.filter((a) => a.origen === "propiedad");
  assert.equal(licencias.length, 1);
  assert.equal(licencias[0].nombre, "Fundo Norte");
  assert.equal(licencias[0].tipo, "Licencia");
  assert.equal(licencias[0].href, "/entidades/predios/p1");
  assert.equal(licencias[0].dias, 7);
});

test("el calendario: sin config no cambia nada; dato lo saca; la vigencia mueve el día", () => {
  const eventos = [
    { id: "documento-d1", fecha: "2026-01-10", titulo: "Poder", subtitulo: "Vigencia de Poder", categoria: "documento", href: "/documentos/d1", fuente: "documento:vigencia_poder" },
    { id: "documento-d3", fecha: "2026-01-10", titulo: "Copia", categoria: "documento", href: "/documentos/d3", fuente: "documento:copia_literal" },
    { id: "evento-e1", fecha: "2026-01-10", titulo: "Audiencia", categoria: "evento", href: "/procesos/x" },
  ];
  assert.deepEqual(aplicarConfigFechas(eventos, new Map()), eventos);

  const config = new Map([
    ["documento:copia_literal", { tipo: "dato", diasVigencia: null }],
    ["documento:vigencia_poder", { tipo: "vencimiento", diasVigencia: 30 }],
  ]);
  const resultado = aplicarConfigFechas(eventos, config);
  assert.deepEqual(resultado.map((e) => e.id), ["documento-d1", "evento-e1"], "las diligencias no se tocan");
  assert.equal(resultado[0].fecha, "2026-02-09");
  assert.equal(resultado[0].subtitulo, "Vigencia de Poder · vence");
});

test("sin fila cada fuente conserva lo que hacía antes: las fijas su tipo, lo demás evento", () => {
  const vacio = new Map();
  assert.equal(configDe(vacio, "vehiculo.soat_vence").tipo, "vencimiento");
  assert.equal(configDe(vacio, "contrato.fecha_inicio").tipo, "evento");
  assert.equal(configDe(vacio, "documento:copia_literal").tipo, "evento");
  assert.equal(configDe(vacio, "propiedad:11111111-2222-3333-4444-555555555555").tipo, "evento");
});

test("la configuración ignora tipos desconocidos y, si falla la lectura, deja todo por defecto", async () => {
  const con = (data, error = null) => ({ from: () => ({ select: () => Promise.resolve({ data, error }) }) });
  const mapa = await cargarConfigFechas(con([
    { fuente: "vehiculo.soat_vence", tipo: "dato", dias_vigencia: null },
    { fuente: "documento:minuta", tipo: "urgente", dias_vigencia: null },
  ]));
  assert.equal(mapa.size, 1);
  assert.equal(mapa.get("vehiculo.soat_vence").tipo, "dato");
  assert.equal((await cargarConfigFechas(con(null, { code: "42P01" }))).size, 0);
});

test("sólo se aceptan fuentes que el sistema conoce", () => {
  assert.equal(esFuenteValida("personal.contrato_fin"), true);
  assert.equal(esFuenteValida("documento:vigencia_poder"), true);
  assert.equal(esFuenteValida("propiedad:11111111-2222-3333-4444-555555555555"), true);
  assert.equal(esFuenteValida("contratos.monto"), false);
  assert.equal(esFuenteValida("documento:Robo; drop"), false);
});
