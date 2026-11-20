-- ============================================================
-- CATÁLOGO PERSISTENTE DE TIPOS DE PROPIETARIO
-- ============================================================
-- Los valores base (Propio/Tercero) siguen representados por `es_propio`.
-- Esta tabla guarda las opciones de texto creadas desde el modal aunque el
-- usuario cancele posteriormente la creación del propietario.

create table if not exists tipos_propietario (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(btrim(nombre)) between 1 and 80),
  creado_por  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create unique index if not exists tipos_propietario_nombre_unico
  on tipos_propietario (lower(btrim(nombre)));

-- Conserva también cualquier tipo libre que ya se hubiera usado antes de
-- existir este catálogo.
insert into tipos_propietario (nombre)
select min(btrim(extra->>'tipo_propietario'))
from propietarios
where nullif(btrim(extra->>'tipo_propietario'), '') is not null
group by lower(btrim(extra->>'tipo_propietario'))
on conflict do nothing;

alter table tipos_propietario enable row level security;

drop policy if exists "tipos_propietario_lectura" on tipos_propietario;
create policy "tipos_propietario_lectura" on tipos_propietario
  for select to authenticated using (true);

drop policy if exists "tipos_propietario_alta" on tipos_propietario;
create policy "tipos_propietario_alta" on tipos_propietario
  for insert to authenticated with check (puede_escribir());

revoke all on tipos_propietario from anon;
grant select, insert on tipos_propietario to authenticated;
