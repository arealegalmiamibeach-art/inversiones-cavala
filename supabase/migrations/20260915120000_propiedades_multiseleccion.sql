-- ============================================================
-- PROPIEDADES PERSONALIZADAS: tipo "multiseleccion"
-- ============================================================
-- Igual que "seleccion" (usa la misma columna `opciones`), pero el valor
-- guardado es un arreglo de opciones en vez de una sola.

alter table propiedades_personalizadas
  drop constraint if exists propiedades_personalizadas_tipo_check;

alter table propiedades_personalizadas
  add constraint propiedades_personalizadas_tipo_check
  check (tipo in ('texto', 'numero', 'fecha', 'booleano', 'seleccion', 'multiseleccion', 'relacion'));
