-- Carpetas "reveladas" o creadas vacías: antes, una categoría de documento
-- (predefinida o personalizada) o una subcarpeta dentro de "Archivos" sólo
-- existía en la pantalla cuando ya tenía su primer documento/archivo dentro.
-- Esta tabla guarda el marcador de que la carpeta existe aunque todavía no
-- tenga contenido, para poder organizarla de antemano.
create table if not exists carpetas_vacias (
  id uuid primary key default gen_random_uuid(),
  entidad_tipo text not null,
  entidad_id uuid not null,
  -- 'documento': valor = documentos.tipo (predefinido, o slug de tipos_documento_custom).
  -- 'archivo': valor = ruta anidada dentro de "Archivos" (mismo formato que archivos.carpeta).
  contexto text not null check (contexto in ('documento', 'archivo')),
  valor text not null,
  creado_por uuid references perfiles(id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now(),
  unique (entidad_tipo, entidad_id, contexto, valor)
);

create index if not exists idx_carpetas_vacias_entidad
  on carpetas_vacias (entidad_tipo, entidad_id, contexto);

alter table carpetas_vacias enable row level security;

-- Las acciones de servidor validan lo mismo para devolver errores amigables,
-- pero RLS sigue siendo la barrera de seguridad: un cliente autenticado no
-- debe poder saltarse los permisos invocando PostgREST directamente.
drop policy if exists "carpetas_vacias_lectura" on carpetas_vacias;
create policy "carpetas_vacias_lectura" on carpetas_vacias
  for select to authenticated using (
    public.acceso_area('documentos')
    and public.acceso_entidad(entidad_tipo, entidad_id)
  );

drop policy if exists "carpetas_vacias_insert" on carpetas_vacias;
create policy "carpetas_vacias_insert" on carpetas_vacias
  for insert to authenticated with check (
    creado_por = auth.uid()
    and public.acceso_area('documentos', true)
    and public.acceso_entidad(entidad_tipo, entidad_id, true)
  );

drop policy if exists "carpetas_vacias_delete" on carpetas_vacias;
create policy "carpetas_vacias_delete" on carpetas_vacias
  for delete to authenticated using (
    public.acceso_area('documentos', true)
    and public.acceso_entidad(entidad_tipo, entidad_id, true)
  );

revoke all on carpetas_vacias from anon;
grant select, insert, delete on carpetas_vacias to authenticated;
