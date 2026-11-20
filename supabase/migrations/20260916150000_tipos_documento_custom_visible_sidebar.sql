-- Un tipo creado desde "Documento con carpeta" en la ficha de una entidad
-- (predio, vehículo…) sigue siendo un tipo global (agrupa `documentos.tipo`
-- en cualquier ficha), pero no debe aparecer en el sidebar bajo "Documentos":
-- ahí solo van los tipos que se dan de alta explícitamente desde "Tipos
-- documentales". `default true` mantiene el comportamiento actual para todo
-- lo ya creado.
alter table public.tipos_documento_custom
  add column visible_sidebar boolean not null default true;
