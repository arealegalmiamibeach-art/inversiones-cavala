-- ============================================================
-- PROPIEDADES PERSONALIZADAS: RENOMBRAR UNA OPCIÓN
-- ============================================================
-- Selección y Multiselección guardan sus opciones en
-- `propiedades_personalizadas.opciones` y el valor de cada registro en
-- `valores_propiedad_personalizada.valor` (un texto en Selección, una lista de
-- textos en Multiselección). Renombrar una opción tiene que cambiar las dos
-- cosas a la vez, o los registros quedarían con un valor que la propiedad ya
-- no ofrece. Es security definer para alcanzar también los registros que
-- están en la papelera (ocultos por RLS); el gate de rol lo hace la función.

create or replace function renombrar_opcion_propiedad(p_id uuid, p_anterior text, p_nuevo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo text := regexp_replace(btrim(coalesce(p_nuevo, '')), '\s+', ' ', 'g');
  v_tipo text;
  v_opciones jsonb;
  v_registros int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  if not puede_escribir() then
    raise exception 'Tu rol no permite editar propiedades' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_nuevo) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'La opción debe tener entre 1 y 80 caracteres');
  end if;

  select tipo, opciones into v_tipo, v_opciones
  from propiedades_personalizadas where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'La propiedad ya no existe');
  end if;
  if v_tipo not in ('seleccion', 'multiseleccion') then
    return jsonb_build_object('ok', false, 'error', 'Esta propiedad no tiene opciones');
  end if;
  if not exists (select 1 from jsonb_array_elements_text(v_opciones) o where o = p_anterior) then
    return jsonb_build_object('ok', false, 'error', 'Esa opción ya no existe');
  end if;
  if v_nuevo = p_anterior then
    return jsonb_build_object('ok', true, 'registros', 0);
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(v_opciones) o
    where o <> p_anterior and lower(btrim(o)) = lower(v_nuevo)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Esa opción ya existe');
  end if;

  update propiedades_personalizadas
  set opciones = (
        select jsonb_agg(case when o = p_anterior then v_nuevo else o end order by n)
        from jsonb_array_elements_text(v_opciones) with ordinality as t(o, n)
      ),
      actualizado_en = now()
  where id = p_id;

  if v_tipo = 'seleccion' then
    update valores_propiedad_personalizada
    set valor = to_jsonb(v_nuevo)
    where propiedad_id = p_id and valor = to_jsonb(p_anterior);
  else
    update valores_propiedad_personalizada
    set valor = (
          select jsonb_agg(case when e = p_anterior then v_nuevo else e end order by n)
          from jsonb_array_elements_text(valor) with ordinality as t(e, n)
        )
    where propiedad_id = p_id
      and jsonb_typeof(valor) = 'array'
      and valor @> to_jsonb(array[p_anterior]);
  end if;
  get diagnostics v_registros = row_count;

  return jsonb_build_object('ok', true, 'registros', v_registros);
end;
$$;

revoke all on function renombrar_opcion_propiedad(uuid, text, text) from public, anon;
grant execute on function renombrar_opcion_propiedad(uuid, text, text) to authenticated;
