import assert from "node:assert/strict";
import { test } from "node:test";
import { borrarClavesLiberables } from "@/lib/papelera-server";

// Cliente falso: `r2_claves_liberables` responde qué claves ya no usa ninguna
// fila de `archivos`, y la cola `r2_huerfanos` registra de qué claves se sacó.
function clienteFalso({ libres = [], errorRpc = null } = {}) {
  const llamadasRpc = [];
  const sacadasDeLaCola = [];
  return {
    llamadasRpc,
    sacadasDeLaCola,
    rpc(nombre, argumentos) {
      llamadasRpc.push({ nombre, argumentos });
      return Promise.resolve(errorRpc ? { data: null, error: errorRpc } : { data: libres, error: null });
    },
    from(tabla) {
      assert.equal(tabla, "r2_huerfanos");
      return {
        delete: () => ({
          eq(columna, valor) {
            assert.equal(columna, "r2_key");
            sacadasDeLaCola.push(valor);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
}

test("sólo borra de R2 las claves que la base confirma libres", async () => {
  // "ab/usada.pdf" se encoló, pero alguien volvió a subir el mismo archivo.
  const cliente = clienteFalso({ libres: ["cd/libre.pdf"] });
  const borradas = [];

  await borrarClavesLiberables(cliente, ["ab/usada.pdf", "cd/libre.pdf"], async (clave) => { borradas.push(clave); });

  assert.deepEqual(cliente.llamadasRpc, [
    { nombre: "r2_claves_liberables", argumentos: { p_claves: ["ab/usada.pdf", "cd/libre.pdf"] } },
  ]);
  assert.deepEqual(borradas, ["cd/libre.pdf"]);
  assert.deepEqual(cliente.sacadasDeLaCola, ["cd/libre.pdf"]);
});

test("si no puede comprobar el uso, no borra nada y deja la cola como estaba", async (t) => {
  const errores = t.mock.method(console, "error", () => {});
  const cliente = clienteFalso({ errorRpc: { code: "PGRST202", message: "función inexistente" } });
  const borradas = [];

  await borrarClavesLiberables(cliente, ["cd/libre.pdf"], async (clave) => { borradas.push(clave); });

  assert.deepEqual(borradas, []);
  assert.deepEqual(cliente.sacadasDeLaCola, []);
  assert.equal(errores.mock.callCount(), 1);
});

test("una clave que R2 no pudo borrar sigue en la cola y no frena a las demás", async () => {
  const cliente = clienteFalso({ libres: ["aa/falla.pdf", "bb/ok.pdf"] });
  const borradas = [];

  await borrarClavesLiberables(cliente, ["aa/falla.pdf", "bb/ok.pdf"], async (clave) => {
    if (clave === "aa/falla.pdf") throw new Error("R2 no disponible");
    borradas.push(clave);
  });

  assert.deepEqual(borradas, ["bb/ok.pdf"]);
  assert.deepEqual(cliente.sacadasDeLaCola, ["bb/ok.pdf"]);
});

test("sin claves no consulta la base", async () => {
  const cliente = clienteFalso();
  await borrarClavesLiberables(cliente, [], async () => { throw new Error("no debería borrar"); });
  assert.deepEqual(cliente.llamadasRpc, []);
});
