-- ============================================================
-- PAPELERA — re-verificación tras el gate compartido y el cron
-- ============================================================
-- La migración 000600 reescribió listar/restaurar/purgar para usar
-- `papelera_permitido()`. Se repite la prueba de humo de 000500 sobre las
-- funciones nuevas y se comprueba que el job quedó programado.

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
  v_cron     int;
begin
  select count(*) into v_cron from cron.job where jobname = 'papelera-purgar-vencidos';
  if v_cron <> 1 then
    raise exception 'PAPELERA [cron]: el job no está programado (encontrados %)', v_cron;
  end if;

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

  begin
    execute 'set local role authenticated';

    v_paso := 'alta';
    insert into predios (nombre) values ('__reverificacion_papelera__') returning id into v_id;

    v_paso := 'eliminar';
    v_res := papelera_eliminar('predios', v_id);
    if not (v_res->>'ok')::boolean then raise exception 'devolvió %', v_res->>'error'; end if;

    v_paso := 'RLS esconde la fila eliminada';
    select count(*) into v_visible from predios where id = v_id;
    if v_visible <> 0 then raise exception 'la política "ocultar_eliminados" no la esconde'; end if;

    v_paso := 'papelera_listar la incluye';
    select count(*) into v_enlista from papelera_listar() where papelera_listar.id = v_id;
    if v_enlista <> 1 then raise exception 'devolvió % filas', v_enlista; end if;

    v_paso := 'restaurar';
    v_res := papelera_restaurar('predios', v_id);
    if not (v_res->>'ok')::boolean then raise exception 'devolvió %', v_res->>'error'; end if;

    v_paso := 'la fila restaurada vuelve a verse';
    select count(*) into v_visible from predios where id = v_id;
    if v_visible <> 1 then raise exception 'sigue oculta'; end if;

    v_paso := 'purgar sólo desde la papelera';
    v_res := papelera_purgar('predios', v_id);
    if (v_res->>'ok')::boolean then raise exception 'purgó una fila que no estaba en la papelera'; end if;

    v_paso := 'purgar';
    v_res := papelera_eliminar('predios', v_id);
    if not (v_res->>'ok')::boolean then raise exception 'no se pudo re-eliminar: %', v_res->>'error'; end if;
    v_res := papelera_purgar('predios', v_id);
    if not (v_res->>'ok')::boolean then raise exception 'devolvió %', v_res->>'error'; end if;

    v_paso := 'purgar_vencidos no revienta';
    v_res := papelera_purgar_vencidos(30);
    if not (v_res->>'ok')::boolean then raise exception 'devolvió %', v_res; end if;

    execute format('set local role %I', v_rol);
  exception when others then
    raise exception 'PAPELERA [%]: % (%)', v_paso, sqlerrm, sqlstate;
  end;

  if exists (select 1 from predios where id = v_id) then
    raise exception 'PAPELERA [purgar]: la fila sigue existiendo';
  end if;

  select string_agg(accion || coalesce(':' || campo, ''), ',' order by creado_en)
    into v_acciones
    from historial where registro_id = v_id;
  if v_acciones is distinct from 'crear,eliminar,restaurar,eliminar,eliminar:purga' then
    raise exception 'PAPELERA [historial]: %', coalesce(v_acciones, '(vacío)');
  end if;

  delete from historial where registro_id = v_id;

  raise notice 'PAPELERA: re-verificación OK — gate compartido y cron programado; ciclo completo intacto';
end $$;
