-- ============================================================
-- PAPELERA — prueba de humo (no cambia el esquema)
-- ============================================================
-- Ejercita el ciclo completo con el rol `authenticated` y un claim JWT de
-- administrador: el mismo par que envía PostgREST. Así se comprueban de
-- verdad las políticas RLS, no sólo que el SQL compile.
--
-- Crea un predio de prueba, lo manda a la papelera, verifica que RLS lo
-- esconde, lo restaura, lo vuelve a eliminar y lo purga. Si algo falla
-- levanta excepción diciendo en qué paso, y la migración entera se
-- revierte. Se limpia sola: al terminar no queda ni la fila ni sus
-- entradas de historial.
--
-- Ya pagó por sí sola: destapó que un UPDATE directo sobre `eliminado_en`
-- choca con la política restrictiva (de ahí la migración 000450).

do $$
declare
  v_admin    uuid;
  v_id       uuid;
  v_rol      text := current_user;
  v_paso     text := 'inicio';
  v_visible  int;
  v_enlista  int;
  v_res      jsonb;
  v_acciones text;
begin
  select id into v_admin from perfiles where rol = 'administrador' and activo limit 1;
  if v_admin is null then
    raise notice 'PAPELERA: sin perfil administrador activo — verificación omitida';
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );

  -- Todo el bloque corre como `authenticated`. Al salir se vuelve al rol de
  -- entrada por nombre, no con RESET ROLE: el CLI aplica las migraciones con
  -- un SET ROLE previo, y un RESET caería al rol de login, que no tiene
  -- privilegios sobre las tablas. Si algo falla, el rollback del subbloque
  -- revierte el SET LOCAL ROLE solo.
  begin
    execute 'set local role authenticated';

    v_paso := 'alta';
    insert into predios (nombre) values ('__verificacion_papelera__') returning id into v_id;

    v_paso := 'eliminar';
    v_res := papelera_eliminar('predios', v_id);
    if not (v_res->>'ok')::boolean then
      raise exception 'devolvió %', v_res->>'error';
    end if;

    v_paso := 'RLS esconde la fila eliminada';
    select count(*) into v_visible from predios where id = v_id;
    if v_visible <> 0 then
      raise exception 'la política "ocultar_eliminados" no la esconde';
    end if;

    v_paso := 'papelera_listar la incluye';
    select count(*) into v_enlista from papelera_listar() where papelera_listar.id = v_id;
    if v_enlista <> 1 then
      raise exception 'devolvió % filas', v_enlista;
    end if;

    v_paso := 'restaurar';
    v_res := papelera_restaurar('predios', v_id);
    if not (v_res->>'ok')::boolean then
      raise exception 'devolvió %', v_res->>'error';
    end if;

    v_paso := 'la fila restaurada vuelve a verse';
    select count(*) into v_visible from predios where id = v_id;
    if v_visible <> 1 then
      raise exception 'sigue oculta';
    end if;

    v_paso := 'purgar sólo desde la papelera';
    v_res := papelera_purgar('predios', v_id);
    if (v_res->>'ok')::boolean then
      raise exception 'purgó una fila que no estaba en la papelera';
    end if;

    v_paso := 'purgar';
    v_res := papelera_eliminar('predios', v_id);
    if not (v_res->>'ok')::boolean then
      raise exception 'no se pudo re-eliminar: %', v_res->>'error';
    end if;
    v_res := papelera_purgar('predios', v_id);
    if not (v_res->>'ok')::boolean then
      raise exception 'devolvió %', v_res->>'error';
    end if;

    execute format('set local role %I', v_rol);
  exception when others then
    raise exception 'PAPELERA [%]: % (%)', v_paso, sqlerrm, sqlstate;
  end;

  if exists (select 1 from predios where id = v_id) then
    raise exception 'PAPELERA [purgar]: la fila sigue existiendo';
  end if;

  -- El ciclo deja cinco entradas: la purga se audita aparte de la baja
  -- reversible, y se distingue por `campo = 'purga'`.
  select string_agg(accion || coalesce(':' || campo, ''), ',' order by creado_en)
    into v_acciones
    from historial where registro_id = v_id;
  if v_acciones is distinct from 'crear,eliminar,restaurar,eliminar,eliminar:purga' then
    raise exception 'PAPELERA [historial]: % (esperado crear,eliminar,restaurar,eliminar,eliminar:purga)',
      coalesce(v_acciones, '(vacío)');
  end if;

  delete from historial where registro_id = v_id;

  raise notice 'PAPELERA: verificación OK — RLS esconde lo eliminado; listar, restaurar y purgar funcionan; historial completo';
end $$;
