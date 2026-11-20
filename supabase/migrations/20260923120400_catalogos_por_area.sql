-- ============================================================
-- CATÁLOGOS: PERMISO POR ÁREA, IGUAL QUE EN LA INTERFAZ
-- ============================================================
-- Desde los permisos por usuario (20260910010000), "administrar" un área deja
-- editar sus registros aunque el rol no sea administrador. Los catálogos de
-- esa área, en cambio, seguían exigiendo rol administrador (`puede_escribir()`):
-- opciones de Selección, tipo de columna, propiedades nativas quitadas,
-- estados de procesos, tipos de propietario y el tipo de fecha de las
-- propiedades personalizadas. La interfaz sí ofrecía editarlos (comprueba el
-- área), así que ese usuario veía errores de permiso o cambios que decían
-- "guardado" y no se guardaban. Caso real: Tesorería con "administrar" en
-- Vehículos y Documentos.
--
-- Ahora siguen el nivel del área a la que pertenecen: `acceso_area(área, true)`,
-- que para un administrador sigue siendo "sí". La lectura no cambia.
-- `correos` y la pantalla de Fechas (fuentes de la app) siguen siendo sólo de
-- administradores.

-- ─── Políticas ──────────────────────────────────────────────────────────

alter policy opciones_columna_escritura on public.opciones_columna
  using ((select public.es_admin()) or public.acceso_area(public.area_entidad(tabla), true))
  with check ((select public.es_admin()) or public.acceso_area(public.area_entidad(tabla), true));

alter policy tipos_columna_escritura on public.tipos_columna
  using ((select public.es_admin()) or public.acceso_area(public.area_entidad(tabla), true))
  with check ((select public.es_admin()) or public.acceso_area(public.area_entidad(tabla), true));

alter policy propiedades_nativas_eliminadas_escritura on public.propiedades_nativas_eliminadas
  using ((select public.es_admin()) or public.acceso_area(public.area_entidad(entidad_tipo), true))
  with check ((select public.es_admin()) or public.acceso_area(public.area_entidad(entidad_tipo), true));

alter policy estados_procesos_escritura on public.estados_procesos
  using ((select public.acceso_area('procesos', true)))
  with check ((select public.acceso_area('procesos', true)));

-- El tipo de fecha de una propiedad personalizada (`propiedad:<uuid>`) lo
-- edita quien administra el área de esa propiedad. Sin esto, crear una
-- propiedad Fecha en Vehículos fallaba y la propiedad se borraba. El CASE
-- valida el uuid antes de convertirlo, así una fuente mal formada no rompe
-- la consulta.
alter policy fechas_config_escritura on public.fechas_config
  using (
    (select public.es_admin())
    or exists (
      select 1 from public.propiedades_personalizadas p
       where p.id = case
               when fechas_config.fuente ~ '^propiedad:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then substr(fechas_config.fuente, 11)::uuid
             end
         and public.acceso_area(public.area_entidad(p.entidad_tipo), true)
    )
  )
  with check (
    (select public.es_admin())
    or exists (
      select 1 from public.propiedades_personalizadas p
       where p.id = case
               when fechas_config.fuente ~ '^propiedad:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then substr(fechas_config.fuente, 11)::uuid
             end
         and public.acceso_area(public.area_entidad(p.entidad_tipo), true)
    )
  );

-- ─── RPCs de renombrar, unir y ordenar ─────────────────────────────────
-- Sólo cambia la comprobación de permiso; el resto es idéntico.

create or replace function public.renombrar_estado_proceso(p_id uuid, p_valor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo text := regexp_replace(btrim(coalesce(p_valor, '')), '\s+', ' ', 'g');
  v_materia text;
  v_anterior text;
  v_procesos int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  if not public.acceso_area('procesos', true) then
    raise exception 'Tu rol no permite editar estados' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_nuevo) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'El estado debe tener entre 1 y 80 caracteres');
  end if;

  select materia, valor into v_materia, v_anterior
  from estados_procesos where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El estado ya no existe');
  end if;
  if v_anterior = v_nuevo then
    return jsonb_build_object('ok', true, 'procesos', 0);
  end if;

  if exists (
    select 1 from estados_procesos
    where id <> p_id
      and coalesce(materia, '') = coalesce(v_materia, '')
      and lower(btrim(valor)) = lower(v_nuevo)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese estado ya existe en esta materia');
  end if;

  update estados_procesos set valor = v_nuevo where id = p_id;

  if v_materia is not null then
    update procesos
    set estado = v_nuevo
    where materia::text = v_materia
      and lower(btrim(estado)) = lower(btrim(v_anterior));
    get diagnostics v_procesos = row_count;
  end if;

  return jsonb_build_object('ok', true, 'procesos', v_procesos);
end;
$$;

create or replace function public.renombrar_opcion_propiedad(p_id uuid, p_anterior text, p_nuevo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo text := regexp_replace(btrim(coalesce(p_nuevo, '')), '\s+', ' ', 'g');
  v_entidad text;
  v_tipo text;
  v_opciones jsonb;
  v_registros int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  select entidad_tipo into v_entidad from propiedades_personalizadas where id = p_id;
  if found and not (public.es_admin() or public.acceso_area(public.area_entidad(v_entidad), true)) then
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

create or replace function public.unir_opcion_propiedad(p_id uuid, p_origen text, p_destino text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entidad text;
  v_tipo text;
  v_opciones jsonb;
  v_registros int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  select entidad_tipo into v_entidad from propiedades_personalizadas where id = p_id;
  if found and not (public.es_admin() or public.acceso_area(public.area_entidad(v_entidad), true)) then
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

create or replace function public.renombrar_tipo_propietario(p_id uuid, p_nombre text)
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
  if not public.acceso_area('propietarios', true) then
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

create or replace function public.ordenar_tipos_propietario(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  if not public.acceso_area('propietarios', true) then
    raise exception 'Tu rol no permite ordenar tipos de propietario' using errcode = 'insufficient_privilege';
  end if;

  update tipos_propietario t
  set orden = o.n
  from unnest(p_ids) with ordinality as o(id, n)
  where t.id = o.id;

  return jsonb_build_object('ok', true);
end;
$$;

notify pgrst, 'reload schema';
