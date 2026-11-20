-- ============================================================
-- HISTORIAL DE CAMBIOS — panel "Editado hace…" estilo Notion
-- ============================================================
-- Una fila por campo modificado. El trigger genérico compara OLD/NEW
-- columna a columna y sólo registra cuando hay un usuario autenticado
-- (auth.uid() no nulo): las cargas del ETL / service_role / SQL editor
-- no ensucian el historial.

create table if not exists historial (
  id             uuid primary key default gen_random_uuid(),
  tabla          text not null,
  registro_id    uuid not null,
  accion         text not null check (accion in ('crear','editar','eliminar')),
  campo          text,                       -- columna, 'notas', 'archivo', 'adenda', 'vinculo'; null = fila entera
  valor_anterior text,
  valor_nuevo    text,
  actor_id       uuid references perfiles(id) on delete set null,
  actor_nombre   text,                       -- snapshot: sobrevive al borrado del perfil
  actor_correo   text,
  creado_en      timestamptz not null default now()
);

create index if not exists idx_historial_registro
  on historial (tabla, registro_id, creado_en desc);

alter table historial enable row level security;

-- Cualquier usuario autenticado puede leer el historial de lo que ya puede ver.
drop policy if exists "historial_lectura" on historial;
create policy "historial_lectura" on historial
  for select to authenticated using (true);

-- Inserción directa sólo para eventos de app (archivos, adendas, vínculos):
-- el usuario únicamente puede firmar filas a su propio nombre.
drop policy if exists "historial_insert_propio" on historial;
create policy "historial_insert_propio" on historial
  for insert to authenticated with check (actor_id = auth.uid());

-- ============================================================
-- Trigger genérico de auditoría por columna
-- ============================================================

create or replace function registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_nombre text;
  v_correo text;
  v_old    jsonb;
  v_new    jsonb;
  v_key    text;
  v_ant    text;
  v_nue    text;
  v_ignoradas constant text[] := array[
    'id','creado_en','actualizado_en','notion_id','notion_origen','extra'
  ];
begin
  -- Sin sesión de usuario (ETL, service_role, mantenimiento SQL): no se audita.
  if v_actor is null then
    return coalesce(new, old);
  end if;

  select nombre, correo into v_nombre, v_correo from perfiles where id = v_actor;

  if tg_op = 'INSERT' then
    insert into historial (tabla, registro_id, accion, actor_id, actor_nombre, actor_correo)
    values (tg_table_name, new.id, 'crear', v_actor, v_nombre, v_correo);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into historial (tabla, registro_id, accion, actor_id, actor_nombre, actor_correo)
    values (tg_table_name, old.id, 'eliminar', v_actor, v_nombre, v_correo);
    return old;
  end if;

  -- UPDATE: una fila por columna que cambió
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  for v_key in select jsonb_object_keys(v_new) loop
    if v_key = any(v_ignoradas) then
      continue;
    end if;
    if v_old ->> v_key is distinct from v_new ->> v_key then
      insert into historial (tabla, registro_id, accion, campo, valor_anterior, valor_nuevo,
                             actor_id, actor_nombre, actor_correo)
      values (tg_table_name, new.id, 'editar', v_key, v_old ->> v_key, v_new ->> v_key,
              v_actor, v_nombre, v_correo);
    end if;
  end loop;

  -- Notas del editor de bloques viven en extra->>'notas'
  v_ant := v_old -> 'extra' ->> 'notas';
  v_nue := v_new -> 'extra' ->> 'notas';
  if v_ant is distinct from v_nue then
    insert into historial (tabla, registro_id, accion, campo, valor_anterior, valor_nuevo,
                           actor_id, actor_nombre, actor_correo)
    values (tg_table_name, new.id, 'editar', 'notas', v_ant, v_nue,
            v_actor, v_nombre, v_correo);
  end if;

  return new;
end;
$$;

-- ============================================================
-- Enganche del trigger a las tablas auditadas
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'procesos','contratos','propietarios','datos_empresas','predios',
    'vehiculos','concesiones_mineras','personal','oficinas_registrales','documentos'
  ] loop
    execute format('drop trigger if exists trg_%s_historial on %I', t, t);
    execute format(
      'create trigger trg_%s_historial after insert or update or delete on %I
       for each row execute function registrar_historial()', t, t
    );
  end loop;
end $$;
