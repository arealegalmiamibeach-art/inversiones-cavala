import assert from "node:assert/strict";
import { test } from "node:test";
import { rutaSegura } from "@/lib/auth/ruta-segura";

const BASE = "https://inversiones-cavala-eight.vercel.app/auth/confirm?token_hash=x&type=recovery";

// Lo que hace la ruta después: redirigir a `new URL(next, request.url)`.
const destino = (valor) => new URL(rutaSegura(valor, BASE), BASE);

test("conserva las rutas propias, con su query", () => {
  assert.equal(rutaSegura("/update-password", BASE), "/update-password");
  assert.equal(rutaSegura("/contratos/tipo/mutuo?q=abc", BASE), "/contratos/tipo/mutuo?q=abc");
});

test("sin destino o con uno relativo va al dashboard", () => {
  assert.equal(rutaSegura(null, BASE), "/dashboard");
  assert.equal(rutaSegura("", BASE), "/dashboard");
  assert.equal(rutaSegura("update-password", BASE), "/dashboard");
});

test("nunca redirige a otro dominio", () => {
  for (const intento of [
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/.//evil.com",
    "/..//evil.com",
    "https://evil.com",
    "javascript:alert(1)",
  ]) {
    assert.equal(destino(intento).origin, new URL(BASE).origin, `se escapó con ${JSON.stringify(intento)}`);
  }
});
