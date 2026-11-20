-- ============================================================
-- PROPIEDADES PERSONALIZADAS
-- ============================================================
-- Una definición pertenece a un tipo de entidad (por ahora la UI las usa en
-- procesos). Sus valores viven aparte para no mezclar configuración de
-- producto con el JSON `extra` heredado de Notion.

create table if not exists propiedades_personalizadas (
  id            uuid primary key default gen_random_uuid(),
  entidad_tipo  text not null,
  nombre        text not null check (char_length(btrim(nombre)) between 1 and 80),
  descripcion   text,
  tipo          text not null check (tipo in ('texto', 'numero', 'fecha', 'booleano', 'seleccion')),
  opciones      jsonb not null default '[]'::jsonb check (jsonb_typeof(opciones) = 'array'),
  creado_por    uuid references auth.users(id) on delete set null,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists propiedades_personalizadas_nombre_unico
  on propiedades_personalizadas (entidad_tipo, lower(btrim(nombre)));

create index if not exists propiedades_personalizadas_entidad_orden
  on propiedades_personalizadas (entidad_tipo, creado_en, id);

create table if not exists valores_propiedad_personalizada (
  propiedad_id uuid not null references propiedades_personalizadas(id) on delete cascade,
  entidad_id   uuid not null,
  valor        jsonb not null,
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (propiedad_id, entidad_id)
);

create index if not exists valores_propiedad_personalizada_entidad
  on valores_propiedad_personalizada (entidad_id, propiedad_id);

-- La papelera conserva los valores durante la baja reversible. Sólo cuando el
-- proceso se purga definitivamente se eliminan sus valores personalizados.
create or replace function limpiar_valores_personalizados_proceso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from valores_propiedad_personalizada v
  using propiedades_personalizadas p
  where v.propiedad_id = p.id
    and p.entidad_tipo = 'proceso'
    and v.entidad_id = old.id;
  return old;
end;
$$;

drop trigger if exists limpiar_valores_personalizados_proceso on procesos;
create trigger limpiar_valores_personalizados_proceso
  after delete on procesos
  for each row execute function limpiar_valores_personalizados_proceso();

alter table propiedades_personalizadas enable row level security;
alter table valores_propiedad_personalizada enable row level security;

drop policy if exists "propiedades_personalizadas_lectura" on propiedades_personalizadas;
create policy "propiedades_personalizadas_lectura" on propiedades_personalizadas
  for select to authenticated using (true);

drop policy if exists "propiedades_personalizadas_escritura" on propiedades_personalizadas;
create policy "propiedades_personalizadas_escritura" on propiedades_personalizadas
  for all to authenticated using (puede_escribir()) with check (puede_escribir());

drop policy if exists "valores_propiedad_personalizada_lectura" on valores_propiedad_personalizada;
create policy "valores_propiedad_personalizada_lectura" on valores_propiedad_personalizada
  for select to authenticated using (true);

drop policy if exists "valores_propiedad_personalizada_escritura" on valores_propiedad_personalizada;
create policy "valores_propiedad_personalizada_escritura" on valores_propiedad_personalizada
  for all to authenticated using (puede_escribir()) with check (puede_escribir());

revoke all on propiedades_personalizadas from anon;
revoke all on valores_propiedad_personalizada from anon;
grant select, insert, update, delete on propiedades_personalizadas to authenticated;
grant select, insert, update, delete on valores_propiedad_personalizada to authenticated;
