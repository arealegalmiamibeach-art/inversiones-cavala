-- ============================================================
-- PAPELERA — borrado reversible (soft-delete)
-- ============================================================
-- Hasta ahora eliminar un registro era un DELETE irreversible. Para un
-- sistema legal documentario eso no basta: el borrado tiene que poder
-- deshacerse y quedar auditado.
--
-- Estrategia: `eliminado_en` / `eliminado_por` en cada tabla, y una
-- política RLS *restrictiva* que las esconde de toda consulta hecha con
-- sesión de usuario. Restrictiva = se combina con AND con las políticas
-- que ya existen (roles, migraciones 015/016), así que no hay que
-- reescribir ninguna política ni ninguna consulta de la app: listas,
-- fichas, contadores y relaciones dejan de ver lo eliminado solas.
--
-- `service_role` (ETL, mantenimiento) ignora RLS y sigue viendo todo.
-- La papelera lee con funciones `security definer` (migración 000400).

-- ============================================================
-- 1. Columnas e índices
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'propietarios','predios','vehiculos','concesiones_mineras','personal',
    'oficinas_registrales','procesos','contratos','documentos','eventos','archivos'
  ] loop
    execute format('alter table %I add column if not exists eliminado_en timestamptz', t);
    execute format(
      'alter table %I add column if not exists eliminado_por uuid references perfiles(id) on delete set null', t
    );
    -- Índice parcial: sólo indexa lo que está en la papelera (pocas filas),
    -- que es exactamente lo que consulta `papelera_listar`.
    execute format(
      'create index if not exists idx_%s_eliminado on %I (eliminado_en desc) where eliminado_en is not null', t, t
    );
  end loop;
end $$;

-- ============================================================
-- 2. RLS: esconder lo eliminado de toda sesión de usuario
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'propietarios','predios','vehiculos','concesiones_mineras','personal',
    'oficinas_registrales','procesos','contratos','documentos','eventos','archivos'
  ] loop
    execute format('drop policy if exists "ocultar_eliminados" on %I', t);
    -- Sólo SELECT: el UPDATE que marca/desmarca la papelera tiene que
    -- seguir pasando por las políticas de escritura que ya existen.
    execute format(
      'create policy "ocultar_eliminados" on %I as restrictive for select to authenticated
       using (eliminado_en is null)', t
    );
  end loop;
end $$;

-- ============================================================
-- 3. Cola de objetos R2 a borrar
-- ============================================================
-- Purgar un archivo borra su fila, pero el objeto vive en R2 y sólo se
-- puede borrar desde la app (Postgres no habla S3). Se encola aquí y la
-- app la vacía; si un borrado en R2 falla, la clave se queda para el
-- siguiente intento en vez de convertirse en un huérfano silencioso.

create table if not exists r2_huerfanos (
  r2_key        text primary key,
  registrado_en timestamptz not null default now(),
  intentos      int not null default 0
);

alter table r2_huerfanos enable row level security;
drop policy if exists "r2_huerfanos_admin" on r2_huerfanos;
create policy "r2_huerfanos_admin" on r2_huerfanos
  for all to authenticated using (es_admin()) with check (es_admin());

-- ============================================================
-- 4. Historial: 'restaurar' como acción, y papelera fuera del diff
-- ============================================================

alter table historial drop constraint if exists historial_accion_check;
alter table historial add constraint historial_accion_check
  check (accion in ('crear','editar','eliminar','restaurar'));

create or replace function registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_nombre  text;
  v_correo  text;
  v_old     jsonb;
  v_new     jsonb;
  v_key     text;
  v_ant     text;
  v_nue     text;
  v_ventana constant interval := interval '15 minutes';
  v_ignoradas constant text[] := array[
    'id','creado_en','actualizado_en','notion_id','notion_origen','extra',
    'eliminado_en','eliminado_por'
  ];
begin
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
    v_old := to_jsonb(old);
    insert into historial (tabla, registro_id, accion, campo, actor_id, actor_nombre, actor_correo)
    values (
      tg_table_name, old.id, 'eliminar',
      -- Purga desde la papelera vs. borrado directo: se distinguen en la ficha.
      case when v_old ->> 'eliminado_en' is not null then 'purga' else null end,
      v_actor, v_nombre, v_correo
    );
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  -- Entrar o salir de la papelera es un evento propio, no la edición de una
  -- columna: se registra como tal y no se sigue diffeando.
  if jsonb_exists(v_new, 'eliminado_en') then
    if v_old ->> 'eliminado_en' is null and v_new ->> 'eliminado_en' is not null then
      insert into historial (tabla, registro_id, accion, actor_id, actor_nombre, actor_correo)
      values (tg_table_name, new.id, 'eliminar', v_actor, v_nombre, v_correo);
      return new;
    end if;
    if v_old ->> 'eliminado_en' is not null and v_new ->> 'eliminado_en' is null then
      insert into historial (tabla, registro_id, accion, actor_id, actor_nombre, actor_correo)
      values (tg_table_name, new.id, 'restaurar', v_actor, v_nombre, v_correo);
      return new;
    end if;
  end if;

  for v_key in select jsonb_object_keys(v_new) loop
    if v_key = any(v_ignoradas) then
      continue;
    end if;
    if v_old ->> v_key is distinct from v_new ->> v_key then
      perform registrar_cambio_campo(
        tg_table_name, new.id, v_key, v_old ->> v_key, v_new ->> v_key,
        v_actor, v_nombre, v_correo, v_ventana
      );
    end if;
  end loop;

  v_ant := v_old -> 'extra' ->> 'notas';
  v_nue := v_new -> 'extra' ->> 'notas';
  if v_ant is distinct from v_nue then
    perform registrar_cambio_campo(
      tg_table_name, new.id, 'notas', v_ant, v_nue,
      v_actor, v_nombre, v_correo, v_ventana
    );
  end if;

  return new;
end;
$$;

-- Diligencias también se auditan: son fechas de audiencia, importan.
drop trigger if exists trg_eventos_historial on eventos;
create trigger trg_eventos_historial
  after insert or update or delete on eventos
  for each row execute function registrar_historial();
