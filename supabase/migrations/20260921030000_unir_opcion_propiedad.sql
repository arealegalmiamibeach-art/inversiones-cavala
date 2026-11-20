-- ============================================================
-- PROPIEDADES PERSONALIZADAS: UNIR DOS OPCIONES
-- ============================================================
-- Renombrar una opción sobre otra que ya existe es unirlas: los registros que
-- tenían la opción de origen pasan a la de destino y el origen sale de la
-- lista. Selección guarda un texto en `valores_propiedad_personalizada.valor` y
-- Multiselección una lista de textos; ahí, si el registro ya tenía el destino,
-- el reemplazo no puede dejarlo repetido.
--
-- Todo tiene que pasar en un solo paso (valores + lista de opciones) o los
-- registros quedarían con un valor que la propiedad ya no ofrece. Es security
-- definer, como `renombrar_opcion_propiedad`, para alcanzar también los
-- registros que están en la papelera (ocultos por RLS); el gate de rol lo hace
-- la función.

create or replace function unir_opcion_propiedad(p_id uuid, p_origen text, p_destino text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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

  select tipo, opciones into v_tipo, v_opciones
  from propiedades_personalizadas where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'La propiedad ya no existe');
  end if;
  if v_tipo not in ('seleccion', 'multiseleccion') then
    return jsonb_build_object('ok', false, 'error', 'Esta propiedad no tiene opciones');
  end if;
  if p_origen = p_destino then
    return jsonb_build_object('ok', true, 'registros', 0);
  end if;
  if not exists (select 1 from jsonb_array_elements_text(v_opciones) o where o = p_origen) then
    return jsonb_build_object('ok', false, 'error', 'Esa opción ya no existe');
  end if;
  if not exists (select 1 from jsonb_array_elements_text(v_opciones) o where o = p_destino) then
    return jsonb_build_object('ok', false, 'error', 'La opción de destino ya no existe');
  end if;

  if v_tipo = 'seleccion' then
    update valores_propiedad_personalizada
    set valor = to_jsonb(p_destino)
    where propiedad_id = p_id and valor = to_jsonb(p_origen);
  else
    -- Reemplaza el origen por el destino y quita repetidos conservando la
    -- primera posición de cada opción.
    update valores_propiedad_personalizada
    set valor = (
          select coalesce(jsonb_agg(u.e order by u.n), '[]'::jsonb)
          from (
            select s.e, min(s.n) as n
            from (
              select case when t.x = p_origen then p_destino else t.x end as e, t.n
              from jsonb_array_elements_text(valor) with ordinality as t(x, n)
            ) s
            group by s.e
          ) u
        )
    where propiedad_id = p_id
      and jsonb_typeof(valor) = 'array'
      and valor @> to_jsonb(array[p_origen]);
  end if;
  get diagnostics v_registros = row_count;

  -- El destino sigue en la lista, así que nunca queda vacía.
  update propiedades_personalizadas
  set opciones = (
        select coalesce(jsonb_agg(o order by n), '[]'::jsonb)
        from jsonb_array_elements_text(v_opciones) with ordinality as t(o, n)
        where o <> p_origen
      ),
      actualizado_en = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'registros', v_registros);
end;
$$;

revoke all on function unir_opcion_propiedad(uuid, text, text) from public, anon;
grant execute on function unir_opcion_propiedad(uuid, text, text) to authenticated;
