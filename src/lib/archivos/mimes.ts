/**
 * Catálogo de tipos permitidos para `archivos`. Fuente única de verdad:
 * la usan tanto la ruta de subida (servidor) como `subir.ts` (cliente), para
 * que nunca se desincronicen los formatos aceptados en cada lado.
 */
export const MAX_ARCHIVO_MB = 200;
export const MAX_ARCHIVO_BYTES = MAX_ARCHIVO_MB * 1024 * 1024;
export const MENSAJE_LIMITE_ARCHIVO = `El archivo supera el límite de ${MAX_ARCHIVO_MB} MB`;

export const MIMES_PERMITIDOS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/zip": ".zip",
};

export function mimePermitido(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIMES_PERMITIDOS, mime);
}

export const MENSAJE_FORMATO_NO_PERMITIDO =
  "Formato no permitido. Usa imágenes (PNG, JPG, WebP, GIF, AVIF), PDF, Word, Excel, PowerPoint, texto plano, CSV o ZIP";
