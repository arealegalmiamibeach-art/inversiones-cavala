-- ============================================================
-- Orden manual de archivos dentro de cada carpeta
-- ============================================================
-- El panel "Archivos" deja reordenar arrastrando las filas. El orden es
-- compartido (todos ven el mismo), así que vive en la base y no en el
-- navegador. `null` = nunca se reordenó: esos archivos van después de los
-- ordenados, en el orden de siempre. Es posición relativa a la carpeta
-- (`carpeta`) de la misma ficha, no global.

alter table public.archivos add column if not exists orden integer;

comment on column public.archivos.orden is
  'Posición manual dentro de su carpeta (null = sin ordenar, va al final).';
