-- ============================================================
-- HISTORIAL — coalescer ráfagas de edición
-- ============================================================
-- El editor de notas autoguarda cada ~700 ms, así que una sesión de
-- edición generaba decenas de filas "editó las notas". Ahora, si el
-- mismo usuario vuelve a tocar el mismo campo del mismo registro dentro
-- de una ventana corta, se actualiza la fila existente (nuevo valor +
-- nueva hora) en vez de crear otra. `valor_anterior` conserva el punto
-- de partida de la ráfaga.

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
    'id','creado_en','actualizado_en','notion_id','notion_origen','extra'
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
    insert into historial (tabla, registro_id, accion, actor_id, actor_nombre, actor_correo)
    values (tg_table_name, old.id, 'eliminar', v_actor, v_nombre, v_correo);
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

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

create or replace function registrar_cambio_campo(
  p_tabla   text,
  p_registro uuid,
  p_campo   text,
  p_ant     text,
  p_nue     text,
  p_actor   uuid,
  p_nombre  text,
  p_correo  text,
  p_ventana interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_reciente timestamptz;
begin
  select id, creado_en into v_id, v_reciente
  from historial
  where tabla = p_tabla
    and registro_id = p_registro
    and campo = p_campo
    and accion = 'editar'
    and actor_id = p_actor
  order by creado_en desc
  limit 1;

  if v_id is not null and v_reciente > now() - p_ventana then
    update historial
    set valor_nuevo = p_nue,
        creado_en   = now()
    where id = v_id;

    -- Si el neto de la ráfaga vuelve al valor original, la fila deja de tener sentido.
    delete from historial
    where id = v_id
      and valor_anterior is not distinct from p_nue;
  else
    insert into historial (tabla, registro_id, accion, campo, valor_anterior, valor_nuevo,
                           actor_id, actor_nombre, actor_correo)
    values (p_tabla, p_registro, 'editar', p_campo, p_ant, p_nue, p_actor, p_nombre, p_correo);
  end if;
end;
$$;
