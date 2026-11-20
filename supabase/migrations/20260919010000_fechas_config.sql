-- ============================================================
-- FECHAS Y AVISOS: qué hace cada fuente de fechas
-- ============================================================
-- Cada fuente de fechas del sistema (inicio/vencimiento de contratos, SOAT,
-- póliza, contrato de personal, cada tipo de documento y cada propiedad
-- personalizada de tipo fecha) tiene un rol que decide el cliente desde
-- Configuración → Fechas y avisos:
--
--   dato         sólo se ve en la ficha
--   evento       además sale en el calendario del dashboard
--   vencimiento  además avisa en la campana, en el panel de vencimientos y
--                en el correo diario
--
-- `fuente` es 'contrato.fecha_vencimiento', 'documento:<slug>' o
-- 'propiedad:<uuid>'. Sin fila, la app aplica el rol que cada fuente tenía
-- antes de existir esta tabla, así que crearla no cambia nada por sí sola.
--
-- `dias_vigencia` es para fechas de emisión (documentos): el vencimiento cae
-- N días después de la fecha guardada.

create table if not exists fechas_config (
  fuente           text primary key,
  rol              text not null,
  dias_vigencia    integer,
  actualizado_por  uuid references auth.users(id) on delete set null default auth.uid(),
  actualizado_en   timestamptz not null default now(),
  constraint fechas_config_fuente check (char_length(fuente) between 3 and 120),
  constraint fechas_config_rol check (rol in ('dato', 'evento', 'vencimiento')),
  constraint fechas_config_dias check (dias_vigencia is null or dias_vigencia between 1 and 3650)
);

alter table fechas_config enable row level security;

drop policy if exists "fechas_config_lectura" on fechas_config;
create policy "fechas_config_lectura" on fechas_config
  for select to authenticated using (true);

drop policy if exists "fechas_config_escritura" on fechas_config;
create policy "fechas_config_escritura" on fechas_config
  for all to authenticated using (es_admin()) with check (es_admin());

revoke all on fechas_config from anon;
grant select, insert, update, delete on fechas_config to authenticated;
