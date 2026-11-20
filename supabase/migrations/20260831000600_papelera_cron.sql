-- ============================================================
-- PAPELERA — purga automática a los 30 días
-- ============================================================
-- El panel promete que lo eliminado se borra solo pasados 30 días; esto es
-- lo que la hace cierta. Sin el cron, la promesa dependería de que un
-- administrador se acordara de pulsar "Vaciar vencidos".

create extension if not exists pg_cron;

-- ------------------------------------------------------------
-- Gate compartido
-- ------------------------------------------------------------
-- Hasta ahora cada RPC exigía `es_admin()`, que mira el JWT de la sesión. El
-- cron no tiene JWT, así que se añade el contexto de sistema como alternativa,
-- distinguido por `session_user`: en una petición de PostgREST siempre es
-- `authenticator`; sólo un job de pg_cron (o una sesión SQL directa) llega
-- como `postgres`. No vale mirar `current_user`, que dentro de una función
-- `security definer` es siempre el dueño.

create or replace function papelera_permitido()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select es_admin() or session_user = 'postgres';
$$;

revoke all on function papelera_permitido() from public, anon;
grant execute on function papelera_permitido() to authenticated;

-- ------------------------------------------------------------
-- Los RPC pasan a usar el gate compartido
-- ------------------------------------------------------------

create or replace function papelera_listar()
returns table (
  tabla         text,
  id            uuid,
  nombre        text,
  eliminado_en  timestamptz,
  actor_id      uuid,
  actor_nombre  text,
  actor_correo  text,
  adjuntos      int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not papelera_permitido() then
    raise exception 'Sólo un administrador puede ver la papelera'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with items as (
    select 'propietarios'::text as t, x.id, x.nombre as n, x.eliminado_en as e, x.eliminado_por as a, 'propietario'::text as ent from propietarios x where x.eliminado_en is not null
    union all select 'predios',              x.id, x.nombre,          x.eliminado_en, x.eliminado_por, 'predio'            from predios x              where x.eliminado_en is not null
    union all select 'vehiculos',            x.id, x.placa,           x.eliminado_en, x.eliminado_por, 'vehiculo'          from vehiculos x            where x.eliminado_en is not null
    union all select 'concesiones_mineras',  x.id, x.nombre,          x.eliminado_en, x.eliminado_por, 'concesion'         from concesiones_mineras x  where x.eliminado_en is not null
    union all select 'personal',             x.id, x.nombre,          x.eliminado_en, x.eliminado_por, 'personal'          from personal x             where x.eliminado_en is not null
    union all select 'oficinas_registrales', x.id, x.nombre,          x.eliminado_en, x.eliminado_por, 'oficina_registral' from oficinas_registrales x where x.eliminado_en is not null
    union all select 'procesos',             x.id, coalesce(nullif(x.expediente,''), 'Expediente sin número'), x.eliminado_en, x.eliminado_por, 'proceso' from procesos x where x.eliminado_en is not null
    union all select 'contratos',            x.id, x.nombre,          x.eliminado_en, x.eliminado_por, 'contrato'          from contratos x            where x.eliminado_en is not null
    union all select 'documentos',           x.id, x.nombre,          x.eliminado_en, x.eliminado_por, 'documento'         from documentos x           where x.eliminado_en is not null
    union all select 'eventos',              x.id, x.titulo,          x.eliminado_en, x.eliminado_por, 'evento'            from eventos x              where x.eliminado_en is not null
    union all select 'archivos',             x.id, x.nombre_original, x.eliminado_en, x.eliminado_por, 'archivo'           from archivos x             where x.eliminado_en is not null
  )
  select
    i.t,
    i.id,
    coalesce(nullif(btrim(i.n), ''), '(sin nombre)'),
    i.e,
    i.a,
    p.nombre,
    p.correo,
    case
      when i.ent = 'archivo' then 0
      else (select count(*)::int from archivos ar where ar.entidad_tipo::text = i.ent and ar.entidad_id = i.id)
    end
  from items i
  left join perfiles p on p.id = i.a
  order by i.e desc;
end;
$$;

create or replace function papelera_restaurar(p_tabla text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas int;
begin
  if not papelera_permitido() then
    raise exception 'Sólo un administrador puede restaurar registros'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from papelera_tablas() where tabla = p_tabla) then
    raise exception 'Tipo de registro no válido';
  end if;

  begin
    execute format(
      'update %I set eliminado_en = null, eliminado_por = null
       where id = $1 and eliminado_en is not null', p_tabla
    ) using p_id;
    get diagnostics v_filas = row_count;
  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', false,
        'error', 'No se puede restaurar: otro registro ya usa un dato único de éste (placa, código, RUC o expediente). Renómbralo primero.'
      );
  end;

  if v_filas = 0 then
    return jsonb_build_object('ok', false, 'error', 'El registro ya no está en la papelera');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function papelera_purgar(p_tabla text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entidad text;
  v_filas   int;
  v_hijos   int;
  v_key     text;
  v_quedan  int;
  v_claves  text[] := array[]::text[];
begin
  if not papelera_permitido() then
    raise exception 'Sólo un administrador puede eliminar definitivamente'
      using errcode = 'insufficient_privilege';
  end if;

  select entidad into v_entidad from papelera_tablas() where tabla = p_tabla;
  if v_entidad is null then
    raise exception 'Tipo de registro no válido';
  end if;

  execute format('select count(*) from %I where id = $1 and eliminado_en is not null', p_tabla)
    into v_filas using p_id;
  if v_filas = 0 then
    return jsonb_build_object('ok', false, 'error', 'El registro no está en la papelera');
  end if;

  if p_tabla = 'contratos' then
    select count(*) into v_hijos from contratos where extra->>'documento_padre' = p_id::text;
    if v_hijos > 0 then
      return jsonb_build_object(
        'ok', false,
        'error', format('Este contrato tiene %s adenda(s) o resolución. Elimínalas definitivamente primero.', v_hijos)
      );
    end if;
  end if;

  if p_tabla = 'archivos' then
    select r2_key into v_key from archivos where id = p_id;
    delete from archivos where id = p_id;
    select count(*) into v_quedan from archivos where r2_key = v_key;
    if v_quedan = 0 and v_key is not null then
      insert into r2_huerfanos (r2_key) values (v_key) on conflict do nothing;
      v_claves := array[v_key];
    end if;
    return jsonb_build_object('ok', true, 'r2_keys', to_jsonb(v_claves));
  end if;

  for v_key in
    select ar.r2_key from archivos ar
    where ar.entidad_tipo::text = v_entidad and ar.entidad_id = p_id
  loop
    v_claves := v_claves || v_key;
  end loop;

  delete from archivos ar where ar.entidad_tipo::text = v_entidad and ar.entidad_id = p_id;

  if array_length(v_claves, 1) > 0 then
    insert into r2_huerfanos (r2_key)
    select distinct k from unnest(v_claves) k
    where not exists (select 1 from archivos a2 where a2.r2_key = k)
    on conflict do nothing;
  end if;

  if p_tabla = 'propietarios' then
    delete from datos_empresas where propietario_id = p_id;
  end if;

  delete from vinculos v
  where (v.origen_tipo::text  = v_entidad and v.origen_id  = p_id)
     or (v.destino_tipo::text = v_entidad and v.destino_id = p_id);

  execute format('delete from %I where id = $1', p_tabla) using p_id;

  return jsonb_build_object(
    'ok', true,
    'r2_keys', (select coalesce(jsonb_agg(s.k), '[]'::jsonb)
                from (select distinct k from unnest(v_claves) k) s
                where not exists (select 1 from archivos a3 where a3.r2_key = s.k))
  );
end;
$$;

create or replace function papelera_purgar_vencidos(p_dias int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila     record;
  v_res      jsonb;
  v_purgados int := 0;
  v_fallidos int := 0;
begin
  if not papelera_permitido() then
    raise exception 'Sólo un administrador puede vaciar la papelera'
      using errcode = 'insufficient_privilege';
  end if;

  -- Las adendas se purgan antes que su contrato padre (orden alfabético de
  -- tabla no lo garantiza), así que lo que falle por tener hijos se reintenta
  -- en la pasada del día siguiente.
  for v_fila in
    select l.tabla, l.id from papelera_listar() l
    where l.eliminado_en < now() - make_interval(days => p_dias)
    order by l.tabla
  loop
    v_res := papelera_purgar(v_fila.tabla, v_fila.id);
    if (v_res->>'ok')::boolean then
      v_purgados := v_purgados + 1;
    else
      v_fallidos := v_fallidos + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'purgados', v_purgados, 'fallidos', v_fallidos);
end;
$$;

-- ------------------------------------------------------------
-- El job
-- ------------------------------------------------------------
-- 03:30 UTC = 22:30 en Lima: fuera de horario de oficina.
-- Los objetos de R2 de lo purgado quedan en `r2_huerfanos`; los borra la app
-- (`vaciarColaR2`) la próxima vez que un administrador abra la papelera,
-- porque Postgres no puede hablar con S3.

select cron.unschedule('papelera-purgar-vencidos')
where exists (select 1 from cron.job where jobname = 'papelera-purgar-vencidos');

select cron.schedule(
  'papelera-purgar-vencidos',
  '30 3 * * *',
  $cron$ select papelera_purgar_vencidos(30) $cron$
);
