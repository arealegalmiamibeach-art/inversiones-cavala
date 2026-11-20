-- Hace que cada nivel de la matriz tenga un único significado:
-- - Dashboard y Riesgo son informes y no admiten "administrar".
-- - una fila en permisos_usuario siempre es una excepción real al rol.
-- - Tesorería sólo amplía Contratos a todos los tipos al administrarlos.

update public.permisos_usuario
set nivel = 'visualizar'
where seccion in ('dashboard', 'riesgo') and nivel = 'administrar';

delete from public.permisos_usuario p
using public.perfiles u
where u.id = p.usuario_id
  and (
    u.rol is null
    or u.rol = 'administrador'
    or p.nivel = case
      when u.rol = 'soporte_documentario' and p.seccion not in ('dashboard','personal') then 'visualizar'
      when u.rol = 'tesoreria' and p.seccion in ('vehiculos','contratos') then 'visualizar'
      else 'sin_acceso'
    end
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permisos_usuario'::regclass
      and conname = 'permisos_usuario_area_nivel_check'
  ) then
    alter table public.permisos_usuario
      add constraint permisos_usuario_area_nivel_check
      check (not (seccion in ('dashboard','riesgo') and nivel = 'administrar'));
  end if;
end;
$$;

create or replace function public.guardar_permisos_usuario(p_usuario uuid, p_permisos jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare v_rol public.rol_usuario;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede gestionar permisos' using errcode = '42501';
  end if;
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
    where p.value <> case
      when v_rol = 'soporte_documentario' and p.key not in ('dashboard','personal') then 'visualizar'
      when v_rol = 'tesoreria' and p.key in ('vehiculos','contratos') then 'visualizar'
      else 'sin_acceso'
    end;
end;
$$;

create or replace function public.cambiar_rol_usuario(p_usuario uuid, p_rol public.rol_usuario)
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

create or replace function public.nivel_area(p_area text)
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

create or replace function public.acceso_tipo_contrato(p_tipo text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.acceso_area('contratos') and (
    public.mi_rol() <> 'tesoreria'
    or p_tipo in ('servicios','mutuo','arrendamiento')
    or public.nivel_area('contratos') = 'administrar'
  );
$$;

comment on function public.acceso_tipo_contrato(text) is
  'Tesorería ve servicios, mutuos y arrendamientos al visualizar; administrar amplía a todos los tipos.';
