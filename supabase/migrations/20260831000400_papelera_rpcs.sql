-- ============================================================
-- PAPELERA — listar, restaurar, purgar
-- ============================================================
-- Todas son `security definer` porque tienen que ver precisamente lo que
-- la política "ocultar_eliminados" esconde. Por eso cada una comprueba
-- `es_admin()` por dentro: al saltarse RLS, el gate de rol deja de ser
-- automático y pasa a ser responsabilidad de la función.

-- Tablas con papelera y cómo se identifica una fila en ella.
-- `entidad` es el valor del enum que usan `vinculos` / `archivos`.
create or replace function papelera_tablas()
returns table (tabla text, entidad text, campo_nombre text)
language sql immutable
as $$
  values
    ('propietarios',        'propietario',      'nombre'),
    ('predios',             'predio',           'nombre'),
    ('vehiculos',           'vehiculo',         'placa'),
    ('concesiones_mineras', 'concesion',        'nombre'),
    ('personal',            'personal',         'nombre'),
    ('oficinas_registrales','oficina_registral','nombre'),
    ('procesos',            'proceso',          'expediente'),
    ('contratos',           'contrato',         'nombre'),
    ('documentos',          'documento',        'nombre'),
    ('eventos',             'evento',           'titulo'),
    ('archivos',            'archivo',          'nombre_original');
$$;

-- ============================================================
-- Listar
-- ============================================================

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
  if not es_admin() then
    raise exception 'Sólo un administrador puede ver la papelera'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with items as (
    select 'propietarios'::text        as t, x.id, x.nombre          as n, x.eliminado_en as e, x.eliminado_por as a, 'propietario'::text       as ent from propietarios x        where x.eliminado_en is not null
    union all select 'predios',              x.id, x.nombre,               x.eliminado_en, x.eliminado_por, 'predio'            from predios x              where x.eliminado_en is not null
    union all select 'vehiculos',            x.id, x.placa,                x.eliminado_en, x.eliminado_por, 'vehiculo'          from vehiculos x            where x.eliminado_en is not null
    union all select 'concesiones_mineras',  x.id, x.nombre,               x.eliminado_en, x.eliminado_por, 'concesion'         from concesiones_mineras x  where x.eliminado_en is not null
    union all select 'personal',             x.id, x.nombre,               x.eliminado_en, x.eliminado_por, 'personal'          from personal x             where x.eliminado_en is not null
    union all select 'oficinas_registrales', x.id, x.nombre,               x.eliminado_en, x.eliminado_por, 'oficina_registral' from oficinas_registrales x where x.eliminado_en is not null
    union all select 'procesos',             x.id, coalesce(nullif(x.expediente,''), 'Expediente sin número'), x.eliminado_en, x.eliminado_por, 'proceso' from procesos x where x.eliminado_en is not null
    union all select 'contratos',            x.id, x.nombre,               x.eliminado_en, x.eliminado_por, 'contrato'          from contratos x            where x.eliminado_en is not null
    union all select 'documentos',           x.id, x.nombre,               x.eliminado_en, x.eliminado_por, 'documento'         from documentos x           where x.eliminado_en is not null
    union all select 'eventos',              x.id, x.titulo,               x.eliminado_en, x.eliminado_por, 'evento'            from eventos x              where x.eliminado_en is not null
    union all select 'archivos',             x.id, x.nombre_original,      x.eliminado_en, x.eliminado_por, 'archivo'           from archivos x             where x.eliminado_en is not null
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

-- ============================================================
-- Restaurar
-- ============================================================

create or replace function papelera_restaurar(p_tabla text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas int;
begin
  if not es_admin() then
    raise exception 'Sólo un administrador puede restaurar registros'
      using errcode = 'insufficient_privilege';
  end if;

  -- Lista blanca: `p_tabla` va a un format(%I), así que nunca puede ser
  -- un nombre arbitrario venido del cliente.
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
    -- Restaurar puede chocar con una fila creada después que reusó un valor
    -- único (placa, RUC, código, expediente…). Mejor decirlo que fallar.
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

-- ============================================================
-- Purgar (borrado definitivo)
-- ============================================================

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
  if not es_admin() then
    raise exception 'Sólo un administrador puede eliminar definitivamente'
      using errcode = 'insufficient_privilege';
  end if;

  select entidad into v_entidad from papelera_tablas() where tabla = p_tabla;
  if v_entidad is null then
    raise exception 'Tipo de registro no válido';
  end if;

  -- Sólo se purga desde la papelera: nunca un atajo para saltarse el
  -- borrado reversible.
  execute format('select count(*) from %I where id = $1 and eliminado_en is not null', p_tabla)
    into v_filas using p_id;
  if v_filas = 0 then
    return jsonb_build_object('ok', false, 'error', 'El registro no está en la papelera');
  end if;

  -- Un contrato con adendas colgando dejaría hijos apuntando a un padre
  -- inexistente. Se purgan las adendas primero.
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
    -- El objeto de R2 se comparte entre entidades (clave por sha256): sólo
    -- se encola para borrar si ninguna otra fila lo referencia.
    select r2_key into v_key from archivos where id = p_id;
    delete from archivos where id = p_id;
    select count(*) into v_quedan from archivos where r2_key = v_key;
    if v_quedan = 0 and v_key is not null then
      insert into r2_huerfanos (r2_key) values (v_key) on conflict do nothing;
      v_claves := array[v_key];
    end if;
    return jsonb_build_object('ok', true, 'r2_keys', to_jsonb(v_claves));
  end if;

  -- Adjuntos de la entidad: se van con ella, y sus objetos se encolan.
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

  -- Datos fiscales del propietario: tabla satélite, se va con él.
  if p_tabla = 'propietarios' then
    delete from datos_empresas where propietario_id = p_id;
  end if;

  -- Aristas del grafo de relaciones, en ambos sentidos.
  delete from vinculos v
  where (v.origen_tipo::text  = v_entidad and v.origen_id  = p_id)
     or (v.destino_tipo::text = v_entidad and v.destino_id = p_id);

  execute format('delete from %I where id = $1', p_tabla) using p_id;

  return jsonb_build_object(
    'ok', true,
    'r2_keys', (select coalesce(jsonb_agg(k), '[]'::jsonb)
                from (select distinct k from unnest(v_claves) k) s
                where not exists (select 1 from archivos a3 where a3.r2_key = s.k))
  );
end;
$$;

-- ============================================================
-- Purga automática de lo vencido
-- ============================================================

create or replace function papelera_purgar_vencidos(p_dias int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila    record;
  v_res     jsonb;
  v_purgados int := 0;
  v_fallidos int := 0;
begin
  if not es_admin() then
    raise exception 'Sólo un administrador puede vaciar la papelera'
      using errcode = 'insufficient_privilege';
  end if;

  -- Se ordena por tabla para que las adendas (contratos hijos) tengan la
  -- oportunidad de purgarse; las que fallen por tener hijos se reintentan
  -- en la siguiente pasada.
  for v_fila in
    select tabla, id from papelera_listar()
    where eliminado_en < now() - make_interval(days => p_dias)
    order by tabla
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

-- ============================================================
-- Permisos
-- ============================================================
-- El gate real es `es_admin()` dentro de cada función; esto sólo evita que
-- PostgREST las exponga a sesiones anónimas.

revoke all on function papelera_listar()                     from public, anon;
revoke all on function papelera_restaurar(text, uuid)        from public, anon;
revoke all on function papelera_purgar(text, uuid)           from public, anon;
revoke all on function papelera_purgar_vencidos(int)         from public, anon;

grant execute on function papelera_listar()              to authenticated;
grant execute on function papelera_restaurar(text, uuid) to authenticated;
grant execute on function papelera_purgar(text, uuid)    to authenticated;
grant execute on function papelera_purgar_vencidos(int)  to authenticated;
