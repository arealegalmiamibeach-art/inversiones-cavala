import { MAX_ARCHIVO_BYTES, MAX_ARCHIVO_MB, MENSAJE_LIMITE_ARCHIVO, MIMES_PERMITIDOS, mimePermitido, MENSAJE_FORMATO_NO_PERMITIDO } from "@/lib/archivos/mimes";

export type ArchivoSubido = {
  id: string;
  nombre_original: string;
  mime: string | null;
  tamano_bytes: number;
  subido_en?: string | null;
  carpeta?: string | null;
  /** El mismo contenido ya estaba en esta ficha: no se creó un archivo nuevo. */
  yaExistia?: boolean;
  /** Además de existir, se movió a la carpeta elegida en esta subida. */
  movido?: boolean;
};

export { MAX_ARCHIVO_BYTES, MAX_ARCHIVO_MB, MENSAJE_LIMITE_ARCHIVO, MIMES_PERMITIDOS, mimePermitido };

async function sha256For(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * PUT a la URL firmada. Con `onProgress` usa XMLHttpRequest porque `fetch` no
 * expone progreso de subida en todos los navegadores; sin callback, `fetch`
 * basta y es más simple.
 */
function subirBytes(uploadUrl: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  if (!onProgress) {
    return fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).then((response) => {
      if (!response.ok) throw new Error("No se pudo subir el archivo");
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error("No se pudo subir el archivo"));
      }
    };
    xhr.onerror = () => reject(new Error("No se pudo subir el archivo. Revisa tu conexión"));
    xhr.send(file);
  });
}

/** Sube a R2 vía URL firmada y registra la fila en `archivos`. Lanza Error con mensaje en español. */
export async function subirArchivo(
  file: File,
  opts: {
    entidadTipo: string;
    entidadId: string;
    origen?: "app" | "editor";
    /** Carpeta anidada elegida al subir (separador "/"), p. ej. "IMPUESTO/2026/MARZO". */
    carpeta?: string;
    onProgress?: (pct: number) => void;
  }
): Promise<ArchivoSubido> {
  if (!mimePermitido(file.type)) throw new Error(MENSAJE_FORMATO_NO_PERMITIDO);
  if (file.size <= 0) throw new Error("El archivo está vacío");
  if (file.size > MAX_ARCHIVO_BYTES) throw new Error(MENSAJE_LIMITE_ARCHIVO);

  const sha256 = await sha256For(file);
  const payload = {
    entidadTipo: opts.entidadTipo,
    entidadId: opts.entidadId,
    nombre: file.name || `archivo-${Date.now()}${MIMES_PERMITIDOS[file.type] ?? ""}`,
    mime: file.type,
    tamano: file.size,
    sha256,
    origen: opts.origen ?? "app",
    carpeta: opts.carpeta,
  };

  let signedResponse: Response;
  try {
    signedResponse = await fetch("/api/archivos/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor para iniciar la subida");
  }
  const signed = await signedResponse.json().catch(() => ({}) as { error?: string; uploadUrl?: string; r2Key?: string });
  if (!signedResponse.ok || !signed.uploadUrl || !signed.r2Key) {
    throw new Error(signed.error || "No se pudo preparar la subida");
  }

  opts.onProgress?.(0);
  await subirBytes(signed.uploadUrl, file, opts.onProgress);

  const completeResponse = await fetch("/api/archivos/upload", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, r2Key: signed.r2Key }),
  });
  const completed = await completeResponse.json().catch(() => ({}) as { error?: string; archivo?: ArchivoSubido; yaExistia?: boolean; movido?: boolean });
  if (!completeResponse.ok || !completed.archivo) throw new Error(completed.error || "No se pudo registrar el archivo");

  return { ...completed.archivo, yaExistia: Boolean(completed.yaExistia), movido: Boolean(completed.movido) };
}
