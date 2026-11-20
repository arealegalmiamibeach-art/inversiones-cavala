-- ============================================================
-- TIPOS DE PROPIETARIO: ORDEN PROPIO Y RENOMBRAR
-- ============================================================
-- La columna "Tipo" de Propietarios (Propio / Tercero + los tipos creados por
-- el usuario en `tipos_propietario`) pasa a editarse desde "Editar propiedad"
-- y desde el desplegable de la celda, como el resto de las Selecciones:
--
-- 1. `orden`: el orden de los tipos personalizados se puede cambiar
--    arrastrando (hasta ahora salían por nombre). Se inicializa con el orden
--    alfabético que ya tenían y los tipos nuevos se agregan al final.
-- 2. `renombrar_tipo_propietario`: renombra el tipo y, en el mismo paso,
--    actualiza `extra.tipo_propietario` de los propietarios que lo usan. Es
--    security definer porque la tabla no tiene política de UPDATE y porque las
--    filas de la papelera están ocultas por RLS (quedarían con el nombre
--    viejo). El historial sigue anotando el cambio: `auth.uid()` no cambia.
-- 3. `ordenar_tipos_propietario`: guarda el orden completo de una sola vez.
--
-- Propio y Tercero siguen siendo fijos (viven en `es_propio`): no se pueden
-- crear ni renombrar tipos con esos nombres. Eliminar un tipo (política y
-- grant de 20260906000100) no toca a los propietarios: conservan su texto en
-- `extra.tipo_propietario`, que el desplegable marca como "fuera de la lista".

alter table tipos_propietario add column if not exists orden integer not null default 0;

update tipos_propietario t
set orden = x.n
from (
  select id, row_number() over (order by lower(btrim(nombre)), id) as n
  from tipos_propietario
) x
where t.id = x.id
  and t.orden = 0;

create index if not exists tipos_propietario_orden on tipos_propietario (orden);

-- Los tipos nuevos (crearTipoPropietario no manda `orden`) quedan al final.
create or replace function tipos_propietario_orden_al_final()
returns trigger
language plpgsql
as $$
begin
  if new.orden is null or new.orden = 0 then
    select coalesce(max(orden), 0) + 1 into new.orden from tipos_propietario;
  end if;
  return new;
end;
$$;

drop trigger if exists tipos_propietario_orden_al_final on tipos_propietario;
create trigger tipos_propietario_orden_al_final
  before insert on tipos_propietario
  for each row execute function tipos_propietario_orden_al_final();

create or replace function renombrar_tipo_propietario(p_id uuid, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_anterior text;
  v_propietarios int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  if not puede_escribir() then
    raise exception 'Tu rol no permite editar tipos de propietario' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_nuevo) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'El tipo debe tener entre 1 y 80 caracteres');
  end if;
  if lower(v_nuevo) in ('propio', 'tercero') then
    return jsonb_build_object('ok', false, 'error', '«Propio» y «Tercero» son tipos fijos');
  end if;

  select nombre into v_anterior
  from tipos_propietario where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El tipo ya no existe');
  end if;
  if v_anterior = v_nuevo then
    return jsonb_build_object('ok', true, 'propietarios', 0);
  end if;

  if exists (
    select 1 from tipos_propietario
    where id <> p_id and lower(btrim(nombre)) = lower(v_nuevo)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese tipo ya existe');
  end if;

  update tipos_propietario set nombre = v_nuevo where id = p_id;

  update propietarios
  set extra = jsonb_set(extra, '{tipo_propietario}', to_jsonb(v_nuevo))
  where jsonb_typeof(extra) = 'object'
    and lower(btrim(extra->>'tipo_propietario')) = lower(btrim(v_anterior));
  get diagnostics v_propietarios = row_count;

  return jsonb_build_object('ok', true, 'propietarios', v_propietarios);
end;
$$;

revoke all on function renombrar_tipo_propietario(uuid, text) from public, anon;
grant execute on function renombrar_tipo_propietario(uuid, text) to authenticated;

create or replace function ordenar_tipos_propietario(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  if not puede_escribir() then
    raise exception 'Tu rol no permite ordenar tipos de propietario' using errcode = 'insufficient_privilege';
  end if;

  update tipos_propietario t
  set orden = o.n
  from unnest(p_ids) with ordinality as o(id, n)
  where t.id = o.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ordenar_tipos_propietario(uuid[]) from public, anon;
grant execute on function ordenar_tipos_propietario(uuid[]) to authenticated;
