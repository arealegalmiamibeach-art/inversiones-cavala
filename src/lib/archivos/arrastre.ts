/**
 * Lee lo que el usuario soltó desde el Explorador/Finder, incluidas carpetas.
 *
 * `dataTransfer.files` no sirve para carpetas: el navegador las entrega como
 * un "archivo" vacío y sin tipo, que terminaba rechazado con "Formato no
 * permitido". Aquí se recorre cada carpeta (y sus subcarpetas) con la API de
 * entradas del navegador y se devuelve cada archivo con la ruta relativa de
 * la carpeta donde estaba, para recrear la misma estructura al subirlo.
 */

export type ArchivoArrastrado = {
  file: File;
  /** Ruta de carpetas relativa a lo soltado (p. ej. "FACTURAS/2026"); `null` = archivo suelto. */
  carpetaRelativa: string | null;
};

/** Basura que crean Windows y macOS dentro de las carpetas; no son documentos del usuario. */
function esArchivoDeSistema(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return n.startsWith(".") || n === "thumbs.db" || n === "desktop.ini";
}

function leerLote(lector: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => lector.readEntries(resolve, reject));
}

function archivoDe(entrada: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entrada.file(resolve, reject));
}

async function recorrerCarpeta(carpeta: FileSystemDirectoryEntry, ruta: string, salida: ArchivoArrastrado[]) {
  const lector = carpeta.createReader();
  // `readEntries` entrega por tandas (Chrome: de a 100); hay que pedir hasta que venga vacío.
  for (;;) {
    const lote = await leerLote(lector);
    if (lote.length === 0) break;
    for (const entrada of lote) {
      if (entrada.isFile) {
        if (esArchivoDeSistema(entrada.name)) continue;
        salida.push({ file: await archivoDe(entrada as FileSystemFileEntry), carpetaRelativa: ruta });
      } else if (entrada.isDirectory) {
        await recorrerCarpeta(entrada as FileSystemDirectoryEntry, `${ruta}/${entrada.name}`, salida);
      }
    }
  }
}

/**
 * Hay que llamarla dentro del manejador `drop`, sin `await` antes: el
 * navegador vacía `dataTransfer` apenas termina el evento, así que las
 * entradas se capturan de forma síncrona y recién después se recorren.
 */
export function leerArrastre(dataTransfer: DataTransfer): Promise<ArchivoArrastrado[]> {
  const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === "file");
  const capturados = items.map((item) => ({
    entrada: typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null,
    file: item.getAsFile(),
  }));

  // Sin carpetas (o navegador sin la API de entradas): lo de siempre.
  if (!capturados.some(({ entrada }) => entrada?.isDirectory)) {
    return Promise.resolve(Array.from(dataTransfer.files ?? []).map((file) => ({ file, carpetaRelativa: null })));
  }

  return (async () => {
    const salida: ArchivoArrastrado[] = [];
    for (const { entrada, file } of capturados) {
      if (entrada?.isDirectory) {
        await recorrerCarpeta(entrada as FileSystemDirectoryEntry, entrada.name, salida);
      } else if (file && !esArchivoDeSistema(file.name)) {
        salida.push({ file, carpetaRelativa: null });
      }
    }
    return salida;
  })();
}
