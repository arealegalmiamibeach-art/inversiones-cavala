-- ============================================================
-- PROPIEDADES NATIVAS ELIMINADAS (con restaurar)
-- ============================================================
-- Las propiedades nativas (Estudio, Materia, Juzgado…) son columnas reales de
-- la tabla del registro: no se pueden borrar de la base sin perder datos y sin
-- romper consultas, reportes y exportaciones. Como en Notion, "Eliminar
-- propiedad" quita la propiedad de la ficha lateral y de las tablas para todos
-- los usuarios, pero el dato queda guardado en la fila: restaurarla la deja
-- exactamente como estaba.
--
-- `entidad_tipo` es el mismo tipo de entidad que usan las propiedades
-- personalizadas (proceso, contrato, predio…) y `campo` el id de la propiedad
-- en la ficha y en la columna de la tabla. Sin fila acá, la propiedad se ve.

create table if not exists propiedades_nativas_eliminadas (
  entidad_tipo    text not null,
  campo           text not null,
  eliminado_por   uuid references auth.users(id) on delete set null,
  eliminado_en    timestamptz not null default now(),
  primary key (entidad_tipo, campo),
  constraint propiedades_nativas_eliminadas_entidad check (entidad_tipo in (
    'propietario', 'predio', 'vehiculo', 'concesion', 'personal',
    'oficina_registral', 'proceso', 'documento', 'contrato'
  )),
  constraint propiedades_nativas_eliminadas_campo check (char_length(campo) between 1 and 80)
);

alter table propiedades_nativas_eliminadas enable row level security;

drop policy if exists "propiedades_nativas_eliminadas_lectura" on propiedades_nativas_eliminadas;
create policy "propiedades_nativas_eliminadas_lectura" on propiedades_nativas_eliminadas
  for select to authenticated using (true);

drop policy if exists "propiedades_nativas_eliminadas_escritura" on propiedades_nativas_eliminadas;
create policy "propiedades_nativas_eliminadas_escritura" on propiedades_nativas_eliminadas
  for all to authenticated using (puede_escribir()) with check (puede_escribir());

revoke all on propiedades_nativas_eliminadas from anon;
grant select, insert, update, delete on propiedades_nativas_eliminadas to authenticated;
