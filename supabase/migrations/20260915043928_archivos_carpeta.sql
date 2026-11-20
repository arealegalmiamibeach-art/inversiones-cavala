-- Carpeta anidada (estilo Notion) para los archivos colgados directo de una
-- entidad, p. ej. "SOAT/AGOSTO 2024" o "IMPUESTO/2025/JUNIO". Separador "/",
-- null = archivo suelto en la raíz (comportamiento actual, sin cambios).
alter table archivos
  add column if not exists carpeta text;
