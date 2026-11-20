-- Migración: gestión de usuarios, preferencias de correo, tipos de documento custom
-- ==================================================================================

-- 1) Preferencias de correo en perfiles
--    Las categorías de correo que el usuario quiere recibir.
--    Default: todas activas.
alter table perfiles
  add column if not exists notificaciones_email boolean not null default true,
  add column if not exists correo_categorias jsonb not null default '{"vencimiento":true,"diligencia":true,"actualizacion":true,"informativo":true}'::jsonb;

-- 2) Tabla de tipos de documento personalizados
create table if not exists tipos_documento_custom (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table tipos_documento_custom enable row level security;

create policy "tipos_documento_custom_lectura"
  on tipos_documento_custom for select
  using (true);

create policy "tipos_documento_custom_escritura"
  on tipos_documento_custom for insert
  with check (
    exists (
      select 1 from perfiles
      where perfiles.id = auth.uid()
        and perfiles.activo = true
        and perfiles.rol = 'administrador'
    )
  );

create policy "tipos_documento_custom_borrar"
  on tipos_documento_custom for delete
  using (
    exists (
      select 1 from perfiles
      where perfiles.id = auth.uid()
        and perfiles.activo = true
        and perfiles.rol = 'administrador'
    )
  );

-- 3) Política para que admins puedan leer/actualizar todos los perfiles
--    (necesario para el panel de gestión de usuarios).
--    Solo si no existe ya una política equivalente.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'perfiles' and policyname = 'admin_gestionar_perfiles'
  ) then
    execute format(
      'create policy admin_gestionar_perfiles on perfiles for all using (%s)',
      $p$exists (
        select 1 from perfiles p
        where p.id = auth.uid()
          and p.activo = true
          and p.rol = 'administrador'
      )$p$
    );
  end if;
end$$;
