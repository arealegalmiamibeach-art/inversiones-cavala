-- Permisos individuales. Las filas ausentes heredan el rol original.
-- La gestión de cuentas y la papelera global siguen reservadas a administradores.
create table public.permisos_usuario (
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  seccion text not null check (seccion in ('dashboard','riesgo','propietarios','predios','vehiculos','concesiones','personal','oficinas','procesos','documentos','contratos')),
  nivel text not null check (
    nivel in ('administrar','visualizar','sin_acceso')
    and not (seccion in ('dashboard','riesgo') and nivel = 'administrar')
  ),
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, seccion)
);
alter table public.permisos_usuario enable row level security;
revoke all on public.permisos_usuario from anon, authenticated;
grant select on public.permisos_usuario to authenticated;
grant all on public.permisos_usuario to service_role;
create policy permisos_lectura on public.permisos_usuario for select to authenticated
  using (usuario_id = (select auth.uid()) or public.es_admin());

create function public.guardar_permisos_usuario(p_usuario uuid, p_permisos jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare v_rol public.rol_usuario;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede gestionar permisos' using errcode = '42501';
  end if;
  -- Serializa cambios de rol y permisos sobre la misma cuenta.
  select rol into v_rol from public.perfiles where id = p_usuario for update;
  if not found or v_rol is null then raise exception 'Asigna primero un rol al usuario'; end if;
  if v_rol = 'administrador' then raise exception 'Los administradores conservan el control total'; end if;
  if p_permisos is null or jsonb_typeof(p_permisos) <> 'object' then raise exception 'Permisos inválidos'; end if;
  if exists (
    select 1 from jsonb_each_text(p_permisos) p
    where p.key not in ('dashboard','riesgo','propietarios','predios','vehiculos','concesiones','personal','oficinas','procesos','documentos','contratos')
      or p.value is null or p.value not in ('administrar','visualizar','sin_acceso')
      or (p.key in ('dashboard','riesgo') and p.value = 'administrar')
  ) then raise exception 'Área o nivel inválido'; end if;
  delete from public.permisos_usuario where usuario_id = p_usuario;
  insert into public.permisos_usuario(usuario_id, seccion, nivel, actualizado_por)
    select p_usuario, key, value, auth.uid()
    from jsonb_each_text(p_permisos) p
    -- Una fila representa una excepción real, no una copia del valor del rol.
    where p.value <> case
      when v_rol = 'soporte_documentario' and p.key not in ('dashboard','personal') then 'visualizar'
      when v_rol = 'tesoreria' and p.key in ('vehiculos','contratos') then 'visualizar'
      else 'sin_acceso'
    end;
end;
$$;
revoke all on function public.guardar_permisos_usuario(uuid,jsonb) from public, anon;
grant execute on function public.guardar_permisos_usuario(uuid,jsonb) to authenticated;

-- El cambio de rol y la limpieza de excepciones que ya coincidan con el nuevo
-- rol ocurren juntos. Las excepciones que siguen siendo significativas se
-- conservan.
create function public.cambiar_rol_usuario(p_usuario uuid, p_rol public.rol_usuario)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar roles' using errcode = '42501';
  end if;
  if p_usuario = auth.uid() and p_rol <> 'administrador' then
    raise exception 'No puedes rebajar tu propio rol de administrador' using errcode = '42501';
  end if;
  update public.perfiles set rol = p_rol where id = p_usuario;
  if not found then raise exception 'Usuario no encontrado'; end if;

  delete from public.permisos_usuario p
  where p.usuario_id = p_usuario
    and (
      p_rol = 'administrador'
      or p.nivel = case
        when p_rol = 'soporte_documentario' and p.seccion not in ('dashboard','personal') then 'visualizar'
        when p_rol = 'tesoreria' and p.seccion in ('vehiculos','contratos') then 'visualizar'
        else 'sin_acceso'
      end
    );
end;
$$;
revoke all on function public.cambiar_rol_usuario(uuid,public.rol_usuario) from public, anon;
grant execute on function public.cambiar_rol_usuario(uuid,public.rol_usuario) to authenticated;

create function public.nivel_area(p_area text)
returns text language plpgsql stable security definer set search_path = public
as $$
declare v_rol public.rol_usuario := public.mi_rol(); v_nivel text;
begin
  if v_rol is null or p_area is null or p_area not in ('dashboard','riesgo','propietarios','predios','vehiculos','concesiones','personal','oficinas','procesos','documentos','contratos') then return 'sin_acceso'; end if;
  if v_rol = 'administrador' then
    return case when p_area in ('dashboard','riesgo') then 'visualizar' else 'administrar' end;
  end if;
  select nivel into v_nivel from public.permisos_usuario where usuario_id = auth.uid() and seccion = p_area;
  if found then return v_nivel; end if;
  if v_rol = 'soporte_documentario' and p_area not in ('dashboard','personal') then return 'visualizar'; end if;
  if v_rol = 'tesoreria' and p_area in ('vehiculos','contratos') then return 'visualizar'; end if;
  return 'sin_acceso';
end;
$$;

create function public.area_entidad(p_tipo text)
returns text language sql immutable set search_path = public
as $$
  select case
    when p_tipo in ('propietario','propietarios','datos_empresas','tipos_propietario') then 'propietarios'
    when p_tipo in ('predio','predios') then 'predios'
    when p_tipo in ('vehiculo','vehiculos') then 'vehiculos'
    when p_tipo in ('concesion','concesiones_mineras') then 'concesiones'
    when p_tipo = 'personal' then 'personal'
    when p_tipo in ('oficina_registral','oficinas_registrales') then 'oficinas'
    when p_tipo in ('proceso','procesos','evento','eventos') then 'procesos'
    when p_tipo in ('documento','documentos','tipos_documento_custom') then 'documentos'
    when p_tipo in ('contrato','contratos') then 'contratos'
  end;
$$;

create function public.acceso_area(p_area text, p_escritura boolean default false)
returns boolean language sql stable set search_path = public
as $$
  select case when p_escritura then public.nivel_area(p_area) = 'administrar'
    else public.nivel_area(p_area) in ('administrar','visualizar') end;
$$;

-- Tesorería conserva sus tres tipos al visualizar. Administrar Contratos es la
-- única excepción que amplía el alcance a todos los tipos.
create function public.acceso_tipo_contrato(p_tipo text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.acceso_area('contratos') and (
    public.mi_rol() <> 'tesoreria'
    or p_tipo in ('servicios','mutuo','arrendamiento')
    or public.nivel_area('contratos') = 'administrar'
  );
$$;

-- Consulta únicamente tablas de negocio de una lista blanca. Esta función se
-- usa en relaciones polimórficas para no provocar ciclos entre políticas RLS.
create function public.acceso_entidad(p_tipo text, p_id uuid, p_escritura boolean default false)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare v_tabla text; v_fila jsonb;
begin
  if not public.acceso_area(public.area_entidad(p_tipo), p_escritura) then return false; end if;
  select tabla into v_tabla from public.papelera_tablas() where entidad = p_tipo or tabla = p_tipo limit 1;
  if v_tabla is null or v_tabla = 'archivos' then return false; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1 and eliminado_en is null', v_tabla) into v_fila using p_id;
  if v_fila is null then return false; end if;
  if v_tabla = 'contratos' then return public.acceso_tipo_contrato(v_fila->>'tipo'); end if;
  return true;
end;
$$;

create function public.acceso_fila(p_tabla text, p_fila jsonb, p_escritura boolean default false)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare v_def public.propiedades_personalizadas%rowtype;
begin
  if public.mi_rol() is null then return false; end if;
  if public.es_admin() then return true; end if;
  if p_tabla = 'archivos' then
    return public.acceso_area('documentos', p_escritura)
      and public.acceso_entidad(p_fila->>'entidad_tipo', (p_fila->>'entidad_id')::uuid, p_escritura);
  elsif p_tabla = 'vinculos' then
    return public.acceso_entidad(p_fila->>'origen_tipo', (p_fila->>'origen_id')::uuid)
      and public.acceso_entidad(p_fila->>'destino_tipo', (p_fila->>'destino_id')::uuid)
      and (not p_escritura
        or public.acceso_entidad(p_fila->>'origen_tipo', (p_fila->>'origen_id')::uuid, true)
        or public.acceso_entidad(p_fila->>'destino_tipo', (p_fila->>'destino_id')::uuid, true));
  elsif p_tabla = 'propiedades_personalizadas' then
    return public.acceso_area(public.area_entidad(p_fila->>'entidad_tipo'), p_escritura);
  elsif p_tabla = 'valores_propiedad_personalizada' then
    select * into v_def from public.propiedades_personalizadas where id = (p_fila->>'propiedad_id')::uuid;
    return found and public.acceso_entidad(v_def.entidad_tipo, (p_fila->>'entidad_id')::uuid, p_escritura);
  elsif p_tabla = 'historial' then
    return (not p_escritura or (p_fila->>'actor_id')::uuid = auth.uid())
      and public.acceso_area(public.area_entidad(p_fila->>'tabla'), p_escritura)
      and (public.es_admin() or public.acceso_entidad(p_fila->>'tabla', (p_fila->>'registro_id')::uuid));
  elsif p_tabla = 'datos_empresas' then
    return public.acceso_entidad('propietario', (p_fila->>'propietario_id')::uuid, p_escritura);
  elsif p_tabla = 'contratos' then
    return public.acceso_area('contratos', p_escritura) and public.acceso_tipo_contrato(p_fila->>'tipo');
  end if;
  return public.acceso_area(public.area_entidad(p_tabla), p_escritura);
end;
$$;

-- Sustituye sólo las políticas permisivas de las tablas de negocio incluidas.
-- Se conserva ocultar_eliminados y cualquier otra política restrictiva.
do $$
declare t text; p record; v_lectura text; v_escritura text;
begin
  foreach t in array array['propietarios','predios','vehiculos','concesiones_mineras','personal','oficinas_registrales','procesos','documentos','contratos','eventos','datos_empresas','archivos','vinculos','tipos_propietario','tipos_documento_custom','propiedades_personalizadas','valores_propiedad_personalizada'] loop
    -- TRUNCATE omite RLS: los usuarios operan mediante DELETE o papelera.
    execute format('revoke truncate, trigger, references on public.%I from authenticated, anon', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and permissive = 'PERMISSIVE' loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    v_lectura := format('public.acceso_fila(%L, to_jsonb(%I), false)', t, t);
    v_escritura := format('public.acceso_fila(%L, to_jsonb(%I), true)', t, t);
    execute format('create policy acceso_lectura on public.%I for select to authenticated using (%s)', t, v_lectura);
    execute format('create policy acceso_alta on public.%I for insert to authenticated with check (%s)', t, v_escritura);
    execute format('create policy acceso_edicion on public.%I for update to authenticated using (%s) with check (%s)', t, v_escritura, v_escritura);
    execute format('create policy acceso_baja on public.%I for delete to authenticated using (%s)', t, v_escritura);
  end loop;
end;
$$;

-- El historial no admite editar o borrar entradas desde el cliente.
drop policy if exists historial_lectura on public.historial;
drop policy if exists historial_insert_propio on public.historial;
create policy historial_lectura on public.historial for select to authenticated
  using (public.acceso_fila('historial', to_jsonb(historial), false));
create policy historial_insert_propio on public.historial for insert to authenticated
  with check (public.acceso_fila('historial', to_jsonb(historial), true));

-- La baja reversible es SECURITY DEFINER: debe verificar el permiso sobre
-- la fila antes de saltarse RLS. No cambia el borrado definitivo de la papelera.
create or replace function public.papelera_eliminar(p_tabla text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_fila jsonb;
begin
  if v_actor is null then raise exception 'Sesión no válida' using errcode = '42501'; end if;
  if not exists (select 1 from public.papelera_tablas() where tabla = p_tabla) then raise exception 'Tipo de registro no válido'; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1 and eliminado_en is null for update', p_tabla) into v_fila using p_id;
  if v_fila is null then return jsonb_build_object('ok', false, 'error', 'El registro ya no existe o ya estaba eliminado'); end if;
  if not public.acceso_fila(p_tabla, v_fila, true) then raise exception 'Sin permiso para eliminar este registro' using errcode = '42501'; end if;
  execute format('update public.%I set eliminado_en = now(), eliminado_por = $1 where id = $2', p_tabla) using v_actor, p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.nivel_area(text), public.area_entidad(text), public.acceso_area(text,boolean), public.acceso_tipo_contrato(text), public.acceso_entidad(text,uuid,boolean), public.acceso_fila(text,jsonb,boolean) from public, anon;
grant execute on function public.nivel_area(text), public.area_entidad(text), public.acceso_area(text,boolean), public.acceso_tipo_contrato(text), public.acceso_entidad(text,uuid,boolean), public.acceso_fila(text,jsonb,boolean) to authenticated, service_role;
notify pgrst, 'reload schema';
