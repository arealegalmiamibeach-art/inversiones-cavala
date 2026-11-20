-- ============================================================
-- PROPIEDADES PERSONALIZADAS: ALCANCE POR SUBTIPO
-- ============================================================
-- Antes, una propiedad de `entidad_tipo = 'proceso'` se veía en TODAS las
-- materias (Civil, Laboral, SUNAFIL...) aunque se hubiera creado sólo para
-- una; lo mismo con el tipo de `documento` y de `contrato`. Cada uno de estos
-- tres tipos reparte sus registros en varias "tablas" dentro de una misma
-- tabla física (procesos.materia, documentos.tipo, contratos.tipo) y ahora
-- una propiedad pertenece a un único valor de esa columna: creada en
-- "Minutas" sólo aparece en "Minutas". `NULL` sigue significando "sin
-- subtipo" para los tipos de entidad que ya son su propia tabla física
-- (propietario, predio, vehículo...), que no cambian de comportamiento.

alter table propiedades_personalizadas add column if not exists subtipo text;

-- Único índice de nombre: antes por (entidad_tipo, nombre); ahora también por
-- subtipo, para que "Minutas" y "Testimonios" puedan tener cada una su propia
-- propiedad "Notario" sin chocar. `coalesce` normaliza NULL a '' porque un
-- índice único trata cada NULL como distinto de los demás (dejaría duplicar
-- nombre en las entidades sin subtipo).
drop index if exists propiedades_personalizadas_nombre_unico;
create unique index propiedades_personalizadas_nombre_unico
  on propiedades_personalizadas (entidad_tipo, coalesce(subtipo, ''), lower(btrim(nombre)));

drop index if exists propiedades_personalizadas_entidad_orden;
create index propiedades_personalizadas_entidad_orden
  on propiedades_personalizadas (entidad_tipo, subtipo, creado_en, id);
