/**
 * Resuelve el alias `@/…` de tsconfig cuando las pruebas corren en Node a
 * secas (sin bundler). Los módulos de `lector-ia` sólo usaban `@/` en imports
 * de tipos —que `--experimental-strip-types` borra—, pero el resto de `src/`
 * sí importa valores por alias, así que sin esto no se puede probar.
 *
 * Se carga con `node --import ./tests/alias.mjs`.
 */
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Igual que la resolución de TypeScript: el import no lleva extensión.
 *
 * El sufijo vacío va al final y sólo vale si apunta a un archivo: hay rutas
 * donde conviven un módulo y una carpeta con el mismo nombre (`lib/alertas.ts`
 * junto a `lib/alertas/`, `documentos/tipos.ts` junto a `documentos/tipos/`) y
 * probar primero la carpeta reventaba con EISDIR.
 */
const CANDIDATOS = [".ts", ".tsx", "/index.ts", "/index.tsx", ""];

function conExtension(base) {
  for (const sufijo of CANDIDATOS) {
    const destino = `${base}${sufijo}`;
    if (!existsSync(destino)) continue;
    if (!statSync(destino).isFile()) continue;
    return { url: pathToFileURL(destino).href, shortCircuit: true };
  }
  return null;
}

registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith("@/")) {
      const resuelto = conExtension(resolvePath(RAIZ, "src", especificador.slice(2)));
      if (resuelto) return resuelto;
      throw new Error(`No se pudo resolver el alias ${especificador}`);
    }
    // Dentro de `src/` los imports relativos también van sin extensión.
    if (especificador.startsWith("./") || especificador.startsWith("../")) {
      const padre = contexto.parentURL;
      if (padre?.startsWith("file:") && /\.tsx?$/.test(padre)) {
        const resuelto = conExtension(resolvePath(dirname(fileURLToPath(padre)), especificador));
        if (resuelto) return resuelto;
      }
    }
    return siguiente(especificador, contexto);
  },
});
