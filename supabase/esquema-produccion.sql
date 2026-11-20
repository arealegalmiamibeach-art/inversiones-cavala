-- ============================================================
-- ESQUEMA DE PRODUCCIÓN — FOTO GENERADA, NO EDITAR A MANO
-- ============================================================
-- Generado el 2026-09-24 con `node scripts/volcar-esquema.mjs` desde el proyecto
-- linkeado. Las 16 primeras migraciones del repo (*_remote.sql) son
-- marcadores vacíos: el esquema base sólo existía en producción, y esta foto
-- es lo que permite reconstruirlo. No es una migración (`db push` no la lee).
-- Incluye extensiones, tipos, funciones, tablas, restricciones, índices,
-- vistas, disparadores, RLS, políticas, permisos y tareas de pg_cron de los
-- esquemas public y privado. No incluye datos, auth, storage ni el Vault.

set check_function_bodies = false;

create extension if not exists pg_cron with schema pg_catalog;

create extension if not exists pg_stat_statements with schema extensions;

create extension if not exists pg_trgm with schema public;

create extension if not exists pgcrypto with schema extensions;

create extension if not exists supabase_vault with schema vault;

create extension if not exists "uuid-ossp" with schema extensions;

create schema if not exists privado;

create type public.entidad as enum ('propietario', 'predio', 'vehiculo', 'concesion', 'personal', 'oficina_registral', 'documento', 'contrato', 'proceso', 'evento');

create type public.materia_proceso as enum ('administrativo', 'civil', 'penal', 'carpeta_fiscal', 'contencioso_administrativo', 'laboral', 'sunafil', 'conciliacion', 'constitucional', 'direccion_trabajo');

create type public.origen_export as enum ('ALI', 'RESPALDO', 'API', 'MANUAL');

create type public.rol_usuario as enum ('administrador', 'tesoreria', 'soporte_documentario');

create type public.tipo_contrato as enum ('personal', 'profesional', 'servicios', 'mutuo', 'arrendamiento', 'concesiones');

create type public.tipo_documento as enum ('copia_literal', 'testimonio', 'vigencia_poder', 'junta_general', 'minuta', 'multa', 'documento_municipal', 'constancia_posesion', 'titulo_archivado', 'habilitacion_urbana', 'plano', 'memoria_tecnica', 'tarjeta_identificacion', 'poliza', 'reporte');

CREATE OR REPLACE FUNCTION privado.areas_con_acceso(p_escritura boolean DEFAULT false)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(a), array[]::text[])
    from unnest(array['propietarios', 'predios', 'vehiculos', 'concesiones', 'personal',
                      'oficinas', 'procesos', 'documentos', 'contratos']) as a
   where public.acceso_area(a, p_escritura);
$function$
;

CREATE OR REPLACE FUNCTION privado.entidad_visible(p_tipo text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  case p_tipo
    when 'propietario', 'propietarios' then
      return exists (select 1 from public.propietarios where id = p_id and eliminado_en is null);
    when 'predio', 'predios' then
      return exists (select 1 from public.predios where id = p_id and eliminado_en is null);
    when 'vehiculo', 'vehiculos' then
      return exists (select 1 from public.vehiculos where id = p_id and eliminado_en is null);
    when 'concesion', 'concesiones_mineras' then
      return exists (select 1 from public.concesiones_mineras where id = p_id and eliminado_en is null);
    when 'personal' then
      return exists (select 1 from public.personal where id = p_id and eliminado_en is null);
    when 'oficina_registral', 'oficinas_registrales' then
      return exists (select 1 from public.oficinas_registrales where id = p_id and eliminado_en is null);
    when 'proceso', 'procesos' then
      return exists (select 1 from public.procesos where id = p_id and eliminado_en is null);
    when 'evento', 'eventos' then
      return exists (select 1 from public.eventos where id = p_id and eliminado_en is null);
    when 'documento', 'documentos' then
      return exists (select 1 from public.documentos where id = p_id and eliminado_en is null);
    when 'contrato', 'contratos' then
      return exists (
        select 1 from public.contratos c
         where c.id = p_id and c.eliminado_en is null
           and public.acceso_tipo_contrato(c.tipo::text)
      );
    else
      -- Archivos y cualquier tabla sin papelera no cuentan como ficha.
      return false;
  end case;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._notion_id_sintetico()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_fila  jsonb := to_jsonb(new);
  v_base  text;
begin
  if new.notion_id is null then
    v_base := coalesce(v_fila->>'direccion', v_fila->>'usuario', new.id::text);
    new.notion_id := 'sin-ficha:' || v_base;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.acceso_area(p_area text, p_escritura boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when p_escritura then public.nivel_area(p_area) = 'administrar'
    else public.nivel_area(p_area) in ('administrar','visualizar') end;
$function$
;

CREATE OR REPLACE FUNCTION public.acceso_entidad(p_tipo text, p_id uuid, p_escritura boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.acceso_area(public.area_entidad(p_tipo), p_escritura) then
    return false;
  end if;
  return privado.entidad_visible(p_tipo, p_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.acceso_fila(p_tabla text, p_fila jsonb, p_escritura boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.acceso_tipo_contrato(p_tipo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.acceso_area('contratos') and (
    public.mi_rol() <> 'tesoreria'
    or p_tipo in ('servicios','mutuo','arrendamiento')
    or public.nivel_area('contratos') = 'administrar'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.actualizar_nombre_propio(p_nombre text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;
  if char_length(v_nombre) > 120 then
    raise exception 'El nombre no puede pasar de 120 caracteres' using errcode = '22001';
  end if;

  update public.perfiles set nombre = v_nombre where id = auth.uid();
  if not found then
    raise exception 'No se encontró tu perfil' using errcode = 'P0002';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.alta_correo(p_notion_id text, p_direccion text, p_titular text, p_clave text, p_notas text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  v_clave_id uuid;
  v_id       uuid;
  v_nombre   text := 'correo:' || coalesce(p_notion_id, btrim(p_direccion));
begin
  -- ¿la ficha ya está cargada y con secreto?
  select clave_id into v_clave_id from correos where notion_id = p_notion_id;

  if p_clave is not null and length(btrim(p_clave)) > 0 then
    if v_clave_id is null then
      v_clave_id := vault.create_secret(
        btrim(p_clave), v_nombre, 'Contraseña del correo ' || p_direccion);
    else
      perform vault.update_secret(v_clave_id, btrim(p_clave));
    end if;
  end if;

  insert into correos (notion_id, direccion, titular, clave_id, notas)
  values (p_notion_id, btrim(p_direccion), p_titular, v_clave_id, p_notas)
  on conflict (notion_id) do update
    set direccion = excluded.direccion,
        titular   = excluded.titular,
        clave_id  = coalesce(excluded.clave_id, correos.clave_id),
        notas     = excluded.notas
  returning id into v_id;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.alta_usuario_entidad(p_notion_id text, p_entidad text, p_usuario text, p_usuario_secundario text, p_clave text, p_notas text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  v_clave_id uuid;
  v_id       uuid;
  -- El notion_id distingue los dos accesos a una misma entidad (p. ej. las
  -- dos cuentas de SUNAFIL), que es justo lo que rompía la versión anterior.
  v_nombre   text := 'entidad:' || coalesce(
                       p_notion_id,
                       coalesce(nullif(btrim(p_entidad), ''), '') || ':' ||
                       coalesce(btrim(p_usuario), ''));
begin
  select clave_id into v_clave_id
    from usuarios_entidades where notion_id = p_notion_id;

  if p_clave is not null and length(btrim(p_clave)) > 0 then
    if v_clave_id is null then
      v_clave_id := vault.create_secret(
        btrim(p_clave), v_nombre,
        'Credencial de acceso a ' || coalesce(p_entidad, p_usuario));
    else
      perform vault.update_secret(v_clave_id, btrim(p_clave));
    end if;
  end if;

  insert into usuarios_entidades
    (notion_id, entidad, usuario, usuario_secundario, clave_id, notas)
  values
    (p_notion_id, nullif(btrim(p_entidad), ''), btrim(p_usuario),
     nullif(btrim(p_usuario_secundario), ''), v_clave_id, p_notas)
  on conflict (notion_id) do update
    set entidad            = excluded.entidad,
        usuario            = excluded.usuario,
        usuario_secundario = excluded.usuario_secundario,
        clave_id           = coalesce(excluded.clave_id, usuarios_entidades.clave_id),
        notas              = excluded.notas
  returning id into v_id;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.archivo_revivir(p_entidad_tipo text, p_entidad_id uuid, p_r2_key text, p_nombre text, p_carpeta text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fila archivos%rowtype;
begin
  -- Al saltarse RLS, el permiso deja de ser automático: se comprueba el
  -- mismo predicado de escritura que la política de la tabla.
  if not public.acceso_fila(
       'archivos',
       jsonb_build_object('entidad_tipo', p_entidad_tipo, 'entidad_id', p_entidad_id),
       true
     ) then
    raise exception 'No tienes permiso para subir archivos a esta ficha'
      using errcode = 'insufficient_privilege';
  end if;

  -- Sólo revive lo que está en la papelera: nunca un atajo para editar
  -- una fila viva saltándose RLS.
  update archivos
  set eliminado_en    = null,
      eliminado_por   = null,
      nombre_original = coalesce(nullif(btrim(p_nombre), ''), nombre_original),
      carpeta         = p_carpeta,
      subido_en       = now()
  where entidad_tipo::text = p_entidad_tipo
    and entidad_id = p_entidad_id
    and r2_key = p_r2_key
    and eliminado_en is not null
  returning * into v_fila;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No hay ningún archivo en la papelera con esa clave');
  end if;

  return jsonb_build_object(
    'ok', true,
    'archivo', jsonb_build_object(
      'id',              v_fila.id,
      'nombre_original', v_fila.nombre_original,
      'mime',            v_fila.mime,
      'tamano_bytes',    v_fila.tamano_bytes,
      'subido_en',       v_fila.subido_en,
      'carpeta',         v_fila.carpeta
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.area_entidad(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cambiar_rol_usuario(p_usuario uuid, p_rol rol_usuario)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cancelar_reserva_lector_ia(p_reserva_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autorizado'; end if;
  delete from public.lector_ia_reservas where id = p_reserva_id and usuario_id = v_uid;
  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crear_perfil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into perfiles (id, correo, nombre, rol, activo)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.email),
          null, false)          -- sin rol y desactivado: un admin asigna ambos
  on conflict (id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(mi_rol() = 'administrador', false)
$function$
;

CREATE OR REPLACE FUNCTION public.es_admin_actual()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM perfiles
    WHERE id      = auth.uid()
      AND activo  = true
      AND rol     = 'administrador'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.es_contrato_tesoreria(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from contratos
    where id = p_id and tipo in ('servicios', 'mutuo', 'arrendamiento')
  )
$function$
;

CREATE OR REPLACE FUNCTION public.es_tesoreria()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(mi_rol() = 'tesoreria', false)
$function$
;

CREATE OR REPLACE FUNCTION public.finalizar_uso_lector_ia(p_reserva_id uuid, p_documentos integer DEFAULT 0, p_paginas integer DEFAULT 0, p_consultas integer DEFAULT 0, p_busquedas integer DEFAULT 0, p_costo_estimado_usd numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_reserva public.lector_ia_reservas%rowtype;
begin
  if v_uid is null then raise exception 'No autorizado'; end if;
  select * into v_reserva
  from public.lector_ia_reservas
  where id = p_reserva_id and usuario_id = v_uid
  for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if p_documentos < 0 or p_paginas < 0 or p_consultas < 0 or p_busquedas < 0 or p_costo_estimado_usd < 0
    or p_documentos > v_reserva.documentos or p_paginas > v_reserva.paginas
    or p_consultas > v_reserva.consultas or p_busquedas > v_reserva.busquedas then
    raise exception 'Uso final fuera de la reserva';
  end if;

  delete from public.lector_ia_reservas where id = p_reserva_id;
  insert into public.lector_ia_uso
    (usuario_id, tipo, proveedor, modelo, documentos, paginas, consultas, busquedas, costo_estimado_usd)
  values
    (v_uid, v_reserva.tipo, v_reserva.proveedor, v_reserva.modelo, p_documentos, p_paginas, p_consultas, p_busquedas, p_costo_estimado_usd);
  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guardar_permisos_usuario(p_usuario uuid, p_permisos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.limpiar_valores_personalizados_entidad()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from valores_propiedad_personalizada v
  using propiedades_personalizadas p
  where v.propiedad_id = p.id
    and p.entidad_tipo = tg_argv[0]
    and v.entidad_id = old.id;
  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.limpiar_valores_personalizados_proceso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from valores_propiedad_personalizada v
  using propiedades_personalizadas p
  where v.propiedad_id = p.id
    and p.entidad_tipo = 'proceso'
    and v.entidad_id = old.id;
  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_rol()
 RETURNS rol_usuario
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select rol from perfiles where id = auth.uid() and activo
$function$
;

CREATE OR REPLACE FUNCTION public.nivel_area(p_area text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ordenar_tipos_propietario(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.papelera_eliminar(p_tabla text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.papelera_listar()
 RETURNS TABLE(tabla text, id uuid, nombre text, eliminado_en timestamp with time zone, actor_id uuid, actor_nombre text, actor_correo text, adjuntos integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.papelera_permitido()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select es_admin() or session_user = 'postgres';
$function$
;

CREATE OR REPLACE FUNCTION public.papelera_purgar(p_tabla text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.papelera_purgar_vencidos(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.papelera_restaurar(p_tabla text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.papelera_tablas()
 RETURNS TABLE(tabla text, entidad text, campo_nombre text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.puede_escribir()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(mi_rol() = 'administrador', false)
$function$
;

CREATE OR REPLACE FUNCTION public.puede_leer_todo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(mi_rol() in ('administrador', 'soporte_documentario'), false)
$function$
;

CREATE OR REPLACE FUNCTION public.r2_claves_liberables(p_claves text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_libres text[];
begin
  if not public.papelera_permitido() then
    raise exception 'Sólo un administrador puede vaciar la papelera' using errcode = '42501';
  end if;

  delete from public.r2_huerfanos h
   where h.r2_key = any(p_claves)
     and exists (select 1 from public.archivos a where a.r2_key = h.r2_key);

  select coalesce(array_agg(distinct k), array[]::text[])
    into v_libres
    from unnest(p_claves) as k
   where k is not null
     and not exists (select 1 from public.archivos a where a.r2_key = k);

  return v_libres;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_cambio_campo(p_tabla text, p_registro uuid, p_campo text, p_ant text, p_nue text, p_actor uuid, p_nombre text, p_correo text, p_ventana interval)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id      uuid;
  v_reciente timestamptz;
begin
  select id, creado_en into v_id, v_reciente
  from historial
  where tabla = p_tabla
    and registro_id = p_registro
    and campo = p_campo
    and accion = 'editar'
    and actor_id = p_actor
  order by creado_en desc
  limit 1;

  if v_id is not null and v_reciente > now() - p_ventana then
    update historial
    set valor_nuevo = p_nue,
        creado_en   = now()
    where id = v_id;

    -- Si el neto de la ráfaga vuelve al valor original, la fila deja de tener sentido.
    delete from historial
    where id = v_id
      and valor_anterior is not distinct from p_nue;
  else
    insert into historial (tabla, registro_id, accion, campo, valor_anterior, valor_nuevo,
                           actor_id, actor_nombre, actor_correo)
    values (p_tabla, p_registro, 'editar', p_campo, p_ant, p_nue, p_actor, p_nombre, p_correo);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_historial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor   uuid := auth.uid();
  v_nombre  text;
  v_correo  text;
  v_old     jsonb;
  v_new     jsonb;
  v_key     text;
  v_ant     text;
  v_nue     text;
  v_ventana constant interval := interval '15 minutes';
  v_ignoradas constant text[] := array[
    'id','creado_en','actualizado_en','notion_id','notion_origen','extra',
    'eliminado_en','eliminado_por'
  ];
begin
  if v_actor is null then
    return coalesce(new, old);
  end if;

  select nombre, correo into v_nombre, v_correo from perfiles where id = v_actor;

  if tg_op = 'INSERT' then
    insert into historial (tabla, registro_id, accion, actor_id, actor_nombre, actor_correo)
    values (tg_table_name, new.id, 'crear', v_actor, v_nombre, v_correo);
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    insert into historial (tabla, registro_id, accion, campo, actor_id, actor_nombre, actor_correo)
    values (
      tg_table_name, old.id, 'eliminar',
      -- Purga desde la papelera vs. borrado directo: se distinguen en la ficha.
      case when v_old ->> 'eliminado_en' is not null then 'purga' else null end,
      v_actor, v_nombre, v_correo
    );
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  -- Entrar o salir de la papelera es un evento propio, no la edición de una
  -- columna: se registra como tal y no se sigue diffeando.
  if jsonb_exists(v_new, 'eliminado_en') then
    if v_old ->> 'eliminado_en' is null and v_new ->> 'eliminado_en' is not null then
      insert into historial (tabla, registro_id, accion, actor_id, actor_nombre, actor_correo)
      values (tg_table_name, new.id, 'eliminar', v_actor, v_nombre, v_correo);
      return new;
    end if;
    if v_old ->> 'eliminado_en' is not null and v_new ->> 'eliminado_en' is null then
      insert into historial (tabla, registro_id, accion, actor_id, actor_nombre, actor_correo)
      values (tg_table_name, new.id, 'restaurar', v_actor, v_nombre, v_correo);
      return new;
    end if;
  end if;

  for v_key in select jsonb_object_keys(v_new) loop
    if v_key = any(v_ignoradas) then
      continue;
    end if;
    if v_old ->> v_key is distinct from v_new ->> v_key then
      perform registrar_cambio_campo(
        tg_table_name, new.id, v_key, v_old ->> v_key, v_new ->> v_key,
        v_actor, v_nombre, v_correo, v_ventana
      );
    end if;
  end loop;

  v_ant := v_old -> 'extra' ->> 'notas';
  v_nue := v_new -> 'extra' ->> 'notas';
  if v_ant is distinct from v_nue then
    perform registrar_cambio_campo(
      tg_table_name, new.id, 'notas', v_ant, v_nue,
      v_actor, v_nombre, v_correo, v_ventana
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_uso_lector_ia(p_tipo text, p_proveedor text, p_modelo text, p_documentos integer DEFAULT 0, p_paginas integer DEFAULT 0, p_consultas integer DEFAULT 0, p_costo_estimado_usd numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_access public.lector_ia_accesos%rowtype;
  v_docs integer;
  v_pages integer;
  v_queries integer;
  v_openai numeric;
  v_xai numeric;
  v_ocr numeric;
begin
  if v_uid is null then raise exception 'No autorizado'; end if;
  if p_tipo not in ('ocr', 'consulta', 'fallback', 'busqueda') then raise exception 'Tipo de uso inválido'; end if;
  if p_proveedor not in ('local', 'mistral', 'cerebras', 'groq', 'openai', 'xai', 'perplexity') then raise exception 'Proveedor inválido'; end if;
  if p_documentos < 0 or p_paginas < 0 or p_consultas < 0 or p_costo_estimado_usd < 0 then
    raise exception 'Uso inválido';
  end if;

  select * into v_access from public.lector_ia_accesos
   where usuario_id = v_uid for update;

  if not found or not v_access.activo or now() < v_access.inicia_en or now() > v_access.termina_en then
    raise exception 'Preview no disponible';
  end if;

  select
    coalesce(sum(documentos), 0), coalesce(sum(paginas), 0),
    coalesce(sum(consultas), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'openai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'xai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'mistral'), 0)
  into v_docs, v_pages, v_queries, v_openai, v_xai, v_ocr
  from public.lector_ia_uso where usuario_id = v_uid and creado_en >= v_access.inicia_en;

  if v_docs + p_documentos > v_access.max_documentos then raise exception 'Límite de documentos alcanzado'; end if;
  if v_pages + p_paginas > v_access.max_paginas then raise exception 'Límite de páginas alcanzado'; end if;
  if v_queries + p_consultas > v_access.max_consultas then raise exception 'Límite de consultas alcanzado'; end if;
  if p_proveedor = 'openai' and v_openai + p_costo_estimado_usd > v_access.max_openai_usd then raise exception 'Crédito OpenAI agotado'; end if;
  if p_proveedor = 'xai' and v_xai + p_costo_estimado_usd > v_access.max_xai_usd then raise exception 'Crédito xAI agotado'; end if;
  if p_proveedor = 'mistral' and v_ocr + p_costo_estimado_usd > v_access.max_ocr_usd then raise exception 'Cupo OCR agotado'; end if;

  insert into public.lector_ia_uso
    (usuario_id, tipo, proveedor, modelo, documentos, paginas, consultas, costo_estimado_usd)
  values
    (v_uid, p_tipo, p_proveedor, left(p_modelo, 120), p_documentos, p_paginas, p_consultas, p_costo_estimado_usd);

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.renombrar_estado_proceso(p_id uuid, p_valor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.renombrar_opcion_propiedad(p_id uuid, p_anterior text, p_nuevo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.renombrar_tipo_propietario(p_id uuid, p_nombre text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reservar_uso_lector_ia(p_tipo text, p_proveedor text, p_modelo text, p_documentos integer DEFAULT 0, p_paginas integer DEFAULT 0, p_consultas integer DEFAULT 0, p_busquedas integer DEFAULT 0, p_costo_estimado_usd numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_access public.lector_ia_accesos%rowtype;
  v_id uuid;
  v_docs integer := 0;
  v_pages integer := 0;
  v_queries integer := 0;
  v_searches integer := 0;
  v_openai numeric := 0;
  v_xai numeric := 0;
  v_ocr numeric := 0;
  v_perplexity numeric := 0;
  v_month_start timestamptz := date_trunc('month', timezone('America/Lima', now())) at time zone 'America/Lima';
begin
  if v_uid is null then raise exception 'No autorizado'; end if;
  if p_tipo not in ('ocr', 'consulta', 'fallback', 'busqueda') then raise exception 'Tipo de uso inválido'; end if;
  if p_proveedor not in ('local', 'mistral', 'groq', 'openai', 'xai', 'perplexity') then raise exception 'Proveedor inválido'; end if;
  if p_documentos < 0 or p_paginas < 0 or p_consultas < 0 or p_busquedas < 0 or p_costo_estimado_usd < 0 then
    raise exception 'Uso inválido';
  end if;

  select * into v_access
  from public.lector_ia_accesos
  where usuario_id = v_uid
  for update;

  if not found or not v_access.activo or now() < v_access.inicia_en or now() > v_access.termina_en then
    raise exception 'Preview no disponible';
  end if;

  delete from public.lector_ia_reservas where expira_en <= now();

  select
    coalesce(sum(documentos), 0),
    coalesce(sum(paginas), 0),
    coalesce(sum(consultas), 0),
    coalesce(sum(busquedas), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'openai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'xai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'mistral' and creado_en >= v_month_start), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'perplexity'), 0)
  into v_docs, v_pages, v_queries, v_searches, v_openai, v_xai, v_ocr, v_perplexity
  from public.lector_ia_uso
  where usuario_id = v_uid and creado_en >= v_access.inicia_en;

  select
    v_docs + coalesce(sum(documentos), 0),
    v_pages + coalesce(sum(paginas), 0),
    v_queries + coalesce(sum(consultas), 0),
    v_searches + coalesce(sum(busquedas), 0),
    v_openai + coalesce(sum(costo_estimado_usd) filter (where proveedor = 'openai'), 0),
    v_xai + coalesce(sum(costo_estimado_usd) filter (where proveedor = 'xai'), 0),
    v_ocr + coalesce(sum(costo_estimado_usd) filter (where proveedor = 'mistral'), 0),
    v_perplexity + coalesce(sum(costo_estimado_usd) filter (where proveedor = 'perplexity'), 0)
  into v_docs, v_pages, v_queries, v_searches, v_openai, v_xai, v_ocr, v_perplexity
  from public.lector_ia_reservas
  where usuario_id = v_uid and expira_en > now();

  if v_docs + p_documentos > v_access.max_documentos then raise exception 'Límite de documentos alcanzado'; end if;
  if v_pages + p_paginas > v_access.max_paginas then raise exception 'Límite de páginas alcanzado'; end if;
  if v_queries + p_consultas > v_access.max_consultas then raise exception 'Límite de consultas alcanzado'; end if;
  if v_searches + p_busquedas > v_access.max_busquedas_web then raise exception 'Límite de consultas con fuentes alcanzado'; end if;
  if p_proveedor = 'openai' and v_openai + p_costo_estimado_usd > v_access.max_openai_usd then raise exception 'Crédito OpenAI agotado'; end if;
  if p_proveedor = 'xai' and v_xai + p_costo_estimado_usd > v_access.max_xai_usd then raise exception 'Crédito xAI agotado'; end if;
  if p_proveedor = 'mistral' and v_ocr + p_costo_estimado_usd > v_access.max_ocr_usd then raise exception 'Cupo mensual de lectura agotado'; end if;
  if p_proveedor = 'perplexity' and v_perplexity + p_costo_estimado_usd > v_access.max_perplexity_usd then raise exception 'Cupo de consultas con fuentes agotado'; end if;

  insert into public.lector_ia_reservas
    (usuario_id, tipo, proveedor, modelo, documentos, paginas, consultas, busquedas, costo_estimado_usd)
  values
    (v_uid, p_tipo, p_proveedor, left(p_modelo, 120), p_documentos, p_paginas, p_consultas, p_busquedas, p_costo_estimado_usd)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revelar_clave_correo(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare v_clave_id uuid; v_secreto text;
begin
  if not es_admin() then
    raise exception 'Sólo un administrador puede revelar contraseñas'
      using errcode = '42501';
  end if;
  select clave_id into v_clave_id from correos where id = p_id;
  if v_clave_id is null then return null; end if;
  select decrypted_secret into v_secreto
    from vault.decrypted_secrets where id = v_clave_id;
  return v_secreto;
end $function$
;

CREATE OR REPLACE FUNCTION public.revelar_clave_entidad(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare v_clave_id uuid; v_secreto text;
begin
  if not es_admin() then
    raise exception 'Sólo un administrador puede revelar contraseñas'
      using errcode = '42501';
  end if;
  select clave_id into v_clave_id from usuarios_entidades where id = p_id;
  if v_clave_id is null then return null; end if;
  select decrypted_secret into v_secreto
    from vault.decrypted_secrets where id = v_clave_id;
  return v_secreto;
end $function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_actualizado_en()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.actualizado_en = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tipos_propietario_orden_al_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.orden is null or new.orden = 0 then
    select coalesce(max(orden), 0) + 1 into new.orden from tipos_propietario;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unir_opcion_propiedad(p_id uuid, p_origen text, p_destino text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.verificar_credenciales()
 RETURNS TABLE(tabla text, filas bigint, con_clave bigint, secreto_ok bigint, secreto_roto bigint, huerfanos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  v_rol text := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  -- admin de la aplicación, o backend con la service key.
  if not (es_admin() or v_rol = 'service_role') then
    raise exception 'Sólo un administrador puede auditar las credenciales'
      using errcode = '42501';
  end if;

  return query
  select 'correos'::text,
         count(*),
         count(c.clave_id),
         count(*) filter (where c.clave_id is not null and s.id is not null),
         count(*) filter (where c.clave_id is not null and s.id is null),
         (select count(*) from vault.secrets v
           where v.name like 'correo:%'
             and not exists (select 1 from correos x where x.clave_id = v.id))
    from correos c
    left join vault.secrets s on s.id = c.clave_id

  union all

  select 'usuarios_entidades'::text,
         count(*),
         count(u.clave_id),
         count(*) filter (where u.clave_id is not null and s.id is not null),
         count(*) filter (where u.clave_id is not null and s.id is null),
         (select count(*) from vault.secrets v
           where v.name like 'entidad:%'
             and not exists (select 1 from usuarios_entidades x where x.clave_id = v.id))
    from usuarios_entidades u
    left join vault.secrets s on s.id = u.clave_id;
end $function$
;

create table public.archivos (
  id uuid default gen_random_uuid() not null,
  entidad_tipo entidad not null,
  entidad_id uuid not null,
  nombre_original text not null,
  r2_bucket text default 'cavala-legal-docs'::text not null,
  r2_key text not null,
  mime text,
  tamano_bytes bigint not null,
  sha256 text not null,
  ruta_origen text,
  subido_en timestamp with time zone default now() not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid,
  carpeta text
);

create table public.carpetas_vacias (
  id uuid default gen_random_uuid() not null,
  entidad_tipo text not null,
  entidad_id uuid not null,
  contexto text not null,
  valor text not null,
  creado_por uuid default auth.uid(),
  creado_en timestamp with time zone default now() not null
);

create table public.concesiones_mineras (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'ALI'::origen_export not null,
  nombre text not null,
  codigo text,
  hectareas numeric(12,4),
  sustancia text,
  estado text,
  ubicacion text,
  url_ubicacion text,
  creado_en timestamp with time zone default now() not null,
  extra jsonb default '{}'::jsonb not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.contratos (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'ALI'::origen_export not null,
  tipo tipo_contrato not null,
  nombre text not null,
  monto numeric(14,2),
  moneda text default 'PEN'::text,
  plazo text,
  fecha_inicio date,
  fecha_vencimiento date,
  legalizado text,
  estado text,
  extra jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.correos (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  direccion text not null,
  dominio text generated always as (lower(split_part(direccion, '@'::text, 2))) stored,
  titular text,
  clave_id uuid,
  notas text,
  creado_en timestamp with time zone default now() not null
);

create table public.datos_empresas (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  propietario_id uuid,
  razon_social text,
  ruc text,
  dni text,
  gerente text,
  direccion_fiscal text,
  partida_registral text,
  cuenta_bancaria text,
  creado_en timestamp with time zone default now() not null,
  extra jsonb default '{}'::jsonb not null
);

create table public.documentos (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'ALI'::origen_export not null,
  tipo text not null,
  nombre text not null,
  fecha date,
  detalle text,
  extra jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.estados_procesos (
  id uuid default gen_random_uuid() not null,
  valor text not null,
  clase_color text not null,
  color_punto text not null,
  materia text,
  creado_por uuid,
  creado_en timestamp with time zone default now() not null,
  orden integer default 0 not null
);

create table public.eventos (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'API'::origen_export not null,
  titulo text not null,
  inicia_en timestamp with time zone,
  tipo_diligencia text,
  estado text default 'PENDIENTE'::text not null,
  responsable text,
  notificar boolean default true not null,
  extra jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid,
  cerrado_en timestamp with time zone,
  cerrado_por uuid,
  resultado text,
  responsable_id uuid,
  dias_aviso integer default 10 not null
);

create table public.fechas_config (
  fuente text not null,
  tipo text not null,
  dias_vigencia integer,
  actualizado_por uuid default auth.uid(),
  actualizado_en timestamp with time zone default now() not null
);

create table public.feriados (
  fecha date not null,
  nombre text not null,
  nacional boolean default true not null,
  creado_en timestamp with time zone default now() not null
);

create table public.historial (
  id uuid default gen_random_uuid() not null,
  tabla text not null,
  registro_id uuid not null,
  accion text not null,
  campo text,
  valor_anterior text,
  valor_nuevo text,
  actor_id uuid,
  actor_nombre text,
  actor_correo text,
  creado_en timestamp with time zone default now() not null
);

create table public.lector_ia_accesos (
  usuario_id uuid not null,
  activo boolean default true not null,
  inicia_en timestamp with time zone default now() not null,
  termina_en timestamp with time zone default (now() + '1 year'::interval) not null,
  max_documentos integer default 200 not null,
  max_paginas integer default 1500 not null,
  max_consultas integer default 1000 not null,
  max_openai_usd numeric(10,4) default 3.5 not null,
  max_xai_usd numeric(10,4) default 4.5 not null,
  max_ocr_usd numeric(10,4) default 10 not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  max_busquedas_web integer default 100 not null,
  max_perplexity_usd numeric(10,4) default 1 not null
);

create table public.lector_ia_reservas (
  id uuid default gen_random_uuid() not null,
  usuario_id uuid not null,
  tipo text not null,
  proveedor text not null,
  modelo text not null,
  documentos integer default 0 not null,
  paginas integer default 0 not null,
  consultas integer default 0 not null,
  busquedas integer default 0 not null,
  costo_estimado_usd numeric(12,6) default 0 not null,
  creado_en timestamp with time zone default now() not null,
  expira_en timestamp with time zone default (now() + '00:10:00'::interval) not null
);

create table public.lector_ia_uso (
  id bigint generated always as identity not null,
  usuario_id uuid not null,
  tipo text not null,
  proveedor text not null,
  modelo text not null,
  documentos integer default 0 not null,
  paginas integer default 0 not null,
  consultas integer default 0 not null,
  costo_estimado_usd numeric(12,6) default 0 not null,
  creado_en timestamp with time zone default now() not null,
  busquedas integer default 0 not null
);

create table public.oficinas_registrales (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'RESPALDO'::origen_export not null,
  nombre text not null,
  creado_en timestamp with time zone default now() not null,
  extra jsonb default '{}'::jsonb not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.opciones_columna (
  id uuid default gen_random_uuid() not null,
  tabla text not null,
  campo text not null,
  valor text not null,
  etiqueta text not null,
  clase_color text not null,
  orden integer default 0 not null,
  creado_por uuid,
  creado_en timestamp with time zone default now() not null
);

create table public.perfiles (
  id uuid not null,
  nombre text,
  correo text,
  rol rol_usuario,
  activo boolean default true not null,
  creado_en timestamp with time zone default now() not null,
  notificaciones_email boolean default true not null,
  correo_categorias jsonb default '{"diligencia": true, "informativo": true, "vencimiento": true, "actualizacion": true}'::jsonb not null
);

create table public.permisos_usuario (
  usuario_id uuid not null,
  seccion text not null,
  nivel text not null,
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null
);

create table public.personal (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'ALI'::origen_export not null,
  nombre text not null,
  dni text,
  cargo text,
  correo text,
  modalidad text,
  activo boolean,
  remuneracion numeric(12,2),
  contrato_inicio date,
  contrato_fin date,
  firmado text,
  extra jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.predios (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'ALI'::origen_export not null,
  nombre text not null,
  predio_padre_id uuid,
  oficina_registral_id uuid,
  n_partida text,
  tipo_predio text,
  ubicacion text,
  coordenadas text,
  registrado boolean,
  a_nombre_de text,
  archivador_drive boolean,
  archivador_fisico boolean,
  monto_copia_literal numeric(14,2),
  fecha_adquisicion date,
  detalles text,
  extra jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.procesos (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'ALI'::origen_export not null,
  materia materia_proceso not null,
  expediente text,
  asunto text,
  estado text,
  descripcion text,
  juzgado text,
  abogado text,
  estudio text,
  diligencia text,
  extra jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.propiedades_nativas_eliminadas (
  entidad_tipo text not null,
  campo text not null,
  eliminado_por uuid,
  eliminado_en timestamp with time zone default now() not null
);

create table public.propiedades_personalizadas (
  id uuid default gen_random_uuid() not null,
  entidad_tipo text not null,
  nombre text not null,
  descripcion text,
  tipo text not null,
  opciones jsonb default '[]'::jsonb not null,
  creado_por uuid,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  configuracion jsonb default '{}'::jsonb not null,
  subtipo text
);

create table public.propietarios (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'RESPALDO'::origen_export not null,
  nombre text not null,
  es_propio boolean,
  tipo_persona text,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  extra jsonb default '{}'::jsonb not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.r2_huerfanos (
  r2_key text not null,
  registrado_en timestamp with time zone default now() not null,
  intentos integer default 0 not null
);

create table public.tipos_columna (
  tabla text not null,
  campo text not null,
  tipo text not null,
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null
);

create table public.tipos_documento_custom (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  nombre text not null,
  creado_por uuid,
  created_at timestamp with time zone default now() not null,
  visible_sidebar boolean default true not null
);

create table public.tipos_propietario (
  id uuid default gen_random_uuid() not null,
  nombre text not null,
  creado_por uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  orden integer default 0 not null
);

create table public.usuarios_entidades (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  entidad text,
  usuario text,
  usuario_secundario text,
  clave_id uuid,
  notas text,
  creado_en timestamp with time zone default now() not null
);

create table public.valores_propiedad_personalizada (
  propiedad_id uuid not null,
  entidad_id uuid not null,
  valor jsonb not null,
  actualizado_por uuid,
  actualizado_en timestamp with time zone default now() not null
);

create table public.vehiculos (
  id uuid default gen_random_uuid() not null,
  notion_id text,
  notion_origen origen_export default 'ALI'::origen_export not null,
  placa text not null,
  marca_modelo text,
  categoria text,
  anio integer,
  n_serie text,
  n_partida text,
  responsable text,
  soat_vence date,
  poliza_vence date,
  revision_tecnica text,
  archivador_drive boolean,
  archivador_fisico boolean,
  detalle text,
  extra jsonb default '{}'::jsonb not null,
  creado_en timestamp with time zone default now() not null,
  actualizado_en timestamp with time zone default now() not null,
  eliminado_en timestamp with time zone,
  eliminado_por uuid
);

create table public.vinculos (
  id uuid default gen_random_uuid() not null,
  origen_tipo entidad not null,
  origen_id uuid not null,
  destino_tipo entidad not null,
  destino_id uuid not null,
  rol text,
  resuelto_por text,
  creado_en timestamp with time zone default now() not null
);

alter table public.archivos add constraint archivos_pkey PRIMARY KEY (id);

alter table public.carpetas_vacias add constraint carpetas_vacias_contexto_check CHECK ((contexto = ANY (ARRAY['documento'::text, 'archivo'::text])));

alter table public.carpetas_vacias add constraint carpetas_vacias_entidad_tipo_entidad_id_contexto_valor_key UNIQUE (entidad_tipo, entidad_id, contexto, valor);

alter table public.carpetas_vacias add constraint carpetas_vacias_pkey PRIMARY KEY (id);

alter table public.concesiones_mineras add constraint concesiones_mineras_notion_id_key UNIQUE (notion_id);

alter table public.concesiones_mineras add constraint concesiones_mineras_pkey PRIMARY KEY (id);

alter table public.contratos add constraint contratos_notion_id_key UNIQUE (notion_id);

alter table public.contratos add constraint contratos_pkey PRIMARY KEY (id);

alter table public.correos add constraint correos_notion_id_key UNIQUE (notion_id);

alter table public.correos add constraint correos_pkey PRIMARY KEY (id);

alter table public.datos_empresas add constraint datos_empresas_notion_id_key UNIQUE (notion_id);

alter table public.datos_empresas add constraint datos_empresas_pkey PRIMARY KEY (id);

alter table public.documentos add constraint documentos_notion_id_key UNIQUE (notion_id);

alter table public.documentos add constraint documentos_pkey PRIMARY KEY (id);

alter table public.estados_procesos add constraint estados_procesos_materia_check CHECK (((materia IS NULL) OR (materia = ANY (ARRAY['administrativo'::text, 'civil'::text, 'penal'::text, 'carpeta_fiscal'::text, 'contencioso_administrativo'::text, 'laboral'::text, 'sunafil'::text, 'conciliacion'::text, 'constitucional'::text, 'direccion_trabajo'::text]))));

alter table public.estados_procesos add constraint estados_procesos_pkey PRIMARY KEY (id);

alter table public.estados_procesos add constraint estados_procesos_valor_check CHECK (((char_length(btrim(valor)) >= 1) AND (char_length(btrim(valor)) <= 80)));

alter table public.eventos add constraint eventos_cierre_coherente CHECK (((estado = 'PENDIENTE'::text) = (cerrado_en IS NULL)));

alter table public.eventos add constraint eventos_dias_aviso_valido CHECK (((dias_aviso >= 0) AND (dias_aviso <= 90)));

alter table public.eventos add constraint eventos_estado_valido CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'REALIZADA'::text, 'REPROGRAMADA'::text, 'INCUMPLIDA'::text, 'CANCELADA'::text])));

alter table public.eventos add constraint eventos_notion_id_key UNIQUE (notion_id);

alter table public.eventos add constraint eventos_pkey PRIMARY KEY (id);

alter table public.fechas_config add constraint fechas_config_dias CHECK (((dias_vigencia IS NULL) OR ((dias_vigencia >= 1) AND (dias_vigencia <= 3650))));

alter table public.fechas_config add constraint fechas_config_fuente CHECK (((char_length(fuente) >= 3) AND (char_length(fuente) <= 120)));

alter table public.fechas_config add constraint fechas_config_pkey PRIMARY KEY (fuente);

alter table public.fechas_config add constraint fechas_config_tipo CHECK ((tipo = ANY (ARRAY['dato'::text, 'evento'::text, 'vencimiento'::text])));

alter table public.feriados add constraint feriados_pkey PRIMARY KEY (fecha);

alter table public.historial add constraint historial_accion_check CHECK ((accion = ANY (ARRAY['crear'::text, 'editar'::text, 'eliminar'::text, 'restaurar'::text])));

alter table public.historial add constraint historial_pkey PRIMARY KEY (id);

alter table public.lector_ia_accesos add constraint lector_ia_accesos_check CHECK ((termina_en > inicia_en));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_max_busquedas_web_check CHECK ((max_busquedas_web >= 0));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_max_consultas_check CHECK ((max_consultas >= 0));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_max_documentos_check CHECK ((max_documentos >= 0));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_max_ocr_usd_check CHECK ((max_ocr_usd >= (0)::numeric));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_max_openai_usd_check CHECK ((max_openai_usd >= (0)::numeric));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_max_paginas_check CHECK ((max_paginas >= 0));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_max_perplexity_usd_check CHECK ((max_perplexity_usd >= (0)::numeric));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_max_xai_usd_check CHECK ((max_xai_usd >= (0)::numeric));

alter table public.lector_ia_accesos add constraint lector_ia_accesos_pkey PRIMARY KEY (usuario_id);

alter table public.lector_ia_reservas add constraint lector_ia_reservas_busquedas_check CHECK ((busquedas >= 0));

alter table public.lector_ia_reservas add constraint lector_ia_reservas_consultas_check CHECK ((consultas >= 0));

alter table public.lector_ia_reservas add constraint lector_ia_reservas_costo_estimado_usd_check CHECK ((costo_estimado_usd >= (0)::numeric));

alter table public.lector_ia_reservas add constraint lector_ia_reservas_documentos_check CHECK ((documentos >= 0));

alter table public.lector_ia_reservas add constraint lector_ia_reservas_paginas_check CHECK ((paginas >= 0));

alter table public.lector_ia_reservas add constraint lector_ia_reservas_pkey PRIMARY KEY (id);

alter table public.lector_ia_reservas add constraint lector_ia_reservas_proveedor_check CHECK ((proveedor = ANY (ARRAY['local'::text, 'mistral'::text, 'groq'::text, 'openai'::text, 'xai'::text, 'perplexity'::text])));

alter table public.lector_ia_reservas add constraint lector_ia_reservas_tipo_check CHECK ((tipo = ANY (ARRAY['ocr'::text, 'consulta'::text, 'fallback'::text, 'busqueda'::text])));

alter table public.lector_ia_uso add constraint lector_ia_uso_busquedas_check CHECK ((busquedas >= 0));

alter table public.lector_ia_uso add constraint lector_ia_uso_consultas_check CHECK ((consultas >= 0));

alter table public.lector_ia_uso add constraint lector_ia_uso_costo_estimado_usd_check CHECK ((costo_estimado_usd >= (0)::numeric));

alter table public.lector_ia_uso add constraint lector_ia_uso_documentos_check CHECK ((documentos >= 0));

alter table public.lector_ia_uso add constraint lector_ia_uso_paginas_check CHECK ((paginas >= 0));

alter table public.lector_ia_uso add constraint lector_ia_uso_pkey PRIMARY KEY (id);

alter table public.lector_ia_uso add constraint lector_ia_uso_proveedor_check CHECK ((proveedor = ANY (ARRAY['local'::text, 'mistral'::text, 'cerebras'::text, 'groq'::text, 'openai'::text, 'xai'::text, 'perplexity'::text])));

alter table public.lector_ia_uso add constraint lector_ia_uso_tipo_check CHECK ((tipo = ANY (ARRAY['ocr'::text, 'consulta'::text, 'fallback'::text, 'busqueda'::text])));

alter table public.oficinas_registrales add constraint oficinas_registrales_notion_id_key UNIQUE (notion_id);

alter table public.oficinas_registrales add constraint oficinas_registrales_pkey PRIMARY KEY (id);

alter table public.opciones_columna add constraint opciones_columna_etiqueta_check CHECK (((char_length(btrim(etiqueta)) >= 1) AND (char_length(btrim(etiqueta)) <= 80)));

alter table public.opciones_columna add constraint opciones_columna_permitidas CHECK ((((tabla || '.'::text) || campo) = ANY (ARRAY['contratos.estado'::text, 'concesiones_mineras.estado'::text, 'concesiones_mineras.sustancia'::text, 'personal.firmado'::text, 'personal.modalidad'::text, 'predios.a_nombre_de'::text, 'predios.tipo_predio'::text, 'propietarios.tipo_persona'::text, 'vehiculos.categoria'::text, 'vehiculos.responsable'::text, 'procesos.materia'::text, 'contratos.tipo'::text, 'contratos.moneda'::text, 'contratos.legalizado'::text])));

alter table public.opciones_columna add constraint opciones_columna_pkey PRIMARY KEY (id);

alter table public.opciones_columna add constraint opciones_columna_tabla_campo_valor_key UNIQUE (tabla, campo, valor);

alter table public.opciones_columna add constraint opciones_columna_valor_check CHECK (((char_length(btrim(valor)) >= 1) AND (char_length(btrim(valor)) <= 80)));

alter table public.perfiles add constraint perfiles_pkey PRIMARY KEY (id);

alter table public.permisos_usuario add constraint permisos_usuario_area_nivel_check CHECK ((NOT ((seccion = ANY (ARRAY['dashboard'::text, 'riesgo'::text])) AND (nivel = 'administrar'::text))));

alter table public.permisos_usuario add constraint permisos_usuario_nivel_check CHECK ((nivel = ANY (ARRAY['administrar'::text, 'visualizar'::text, 'sin_acceso'::text])));

alter table public.permisos_usuario add constraint permisos_usuario_pkey PRIMARY KEY (usuario_id, seccion);

alter table public.permisos_usuario add constraint permisos_usuario_seccion_check CHECK ((seccion = ANY (ARRAY['dashboard'::text, 'riesgo'::text, 'propietarios'::text, 'predios'::text, 'vehiculos'::text, 'concesiones'::text, 'personal'::text, 'oficinas'::text, 'procesos'::text, 'documentos'::text, 'contratos'::text])));

alter table public.personal add constraint personal_notion_id_key UNIQUE (notion_id);

alter table public.personal add constraint personal_pkey PRIMARY KEY (id);

alter table public.predios add constraint predios_notion_id_key UNIQUE (notion_id);

alter table public.predios add constraint predios_pkey PRIMARY KEY (id);

alter table public.procesos add constraint procesos_notion_id_key UNIQUE (notion_id);

alter table public.procesos add constraint procesos_pkey PRIMARY KEY (id);

alter table public.propiedades_nativas_eliminadas add constraint propiedades_nativas_eliminadas_campo CHECK (((char_length(campo) >= 1) AND (char_length(campo) <= 80)));

alter table public.propiedades_nativas_eliminadas add constraint propiedades_nativas_eliminadas_entidad CHECK ((entidad_tipo = ANY (ARRAY['propietario'::text, 'predio'::text, 'vehiculo'::text, 'concesion'::text, 'personal'::text, 'oficina_registral'::text, 'proceso'::text, 'documento'::text, 'contrato'::text])));

alter table public.propiedades_nativas_eliminadas add constraint propiedades_nativas_eliminadas_pkey PRIMARY KEY (entidad_tipo, campo);

alter table public.propiedades_personalizadas add constraint propiedades_personalizadas_configuracion_check CHECK ((jsonb_typeof(configuracion) = 'object'::text));

alter table public.propiedades_personalizadas add constraint propiedades_personalizadas_nombre_check CHECK (((char_length(btrim(nombre)) >= 1) AND (char_length(btrim(nombre)) <= 80)));

alter table public.propiedades_personalizadas add constraint propiedades_personalizadas_opciones_check CHECK ((jsonb_typeof(opciones) = 'array'::text));

alter table public.propiedades_personalizadas add constraint propiedades_personalizadas_pkey PRIMARY KEY (id);

alter table public.propiedades_personalizadas add constraint propiedades_personalizadas_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'numero'::text, 'fecha'::text, 'booleano'::text, 'seleccion'::text, 'multiseleccion'::text, 'relacion'::text])));

alter table public.propietarios add constraint propietarios_notion_id_key UNIQUE (notion_id);

alter table public.propietarios add constraint propietarios_pkey PRIMARY KEY (id);

alter table public.r2_huerfanos add constraint r2_huerfanos_pkey PRIMARY KEY (r2_key);

alter table public.tipos_columna add constraint tipos_columna_permitidas CHECK (false);

alter table public.tipos_columna add constraint tipos_columna_pkey PRIMARY KEY (tabla, campo);

alter table public.tipos_columna add constraint tipos_columna_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'seleccion'::text])));

alter table public.tipos_documento_custom add constraint tipos_documento_custom_pkey PRIMARY KEY (id);

alter table public.tipos_documento_custom add constraint tipos_documento_custom_slug_key UNIQUE (slug);

alter table public.tipos_propietario add constraint tipos_propietario_nombre_check CHECK (((char_length(btrim(nombre)) >= 1) AND (char_length(btrim(nombre)) <= 80)));

alter table public.tipos_propietario add constraint tipos_propietario_pkey PRIMARY KEY (id);

alter table public.usuarios_entidades add constraint usuarios_entidades_notion_id_key UNIQUE (notion_id);

alter table public.usuarios_entidades add constraint usuarios_entidades_pkey PRIMARY KEY (id);

alter table public.valores_propiedad_personalizada add constraint valores_propiedad_personalizada_pkey PRIMARY KEY (propiedad_id, entidad_id);

alter table public.vehiculos add constraint vehiculos_notion_id_key UNIQUE (notion_id);

alter table public.vehiculos add constraint vehiculos_pkey PRIMARY KEY (id);

alter table public.vinculos add constraint sin_autovinculo CHECK ((NOT ((origen_tipo = destino_tipo) AND (origen_id = destino_id))));

alter table public.vinculos add constraint vinculo_unico UNIQUE NULLS NOT DISTINCT (origen_tipo, origen_id, destino_tipo, destino_id, rol);

alter table public.vinculos add constraint vinculos_pkey PRIMARY KEY (id);

alter table public.vinculos add constraint vinculos_resuelto_por_check CHECK ((resuelto_por = ANY (ARRAY['ruta'::text, 'notion_id'::text, 'nombre'::text, 'manual'::text])));

alter table public.vinculos add constraint vinculos_rol_check CHECK ((rol = ANY (ARRAY['propietario'::text, 'arrendador'::text, 'arrendatario'::text, 'acreedor'::text, 'deudor'::text, 'demandante'::text, 'demandado'::text, 'agraviado'::text, 'imputado'::text, 'solicitante'::text, 'profesional'::text, 'empleado'::text, 'contratista'::text, 'representante'::text])));

alter table public.archivos add constraint archivos_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.carpetas_vacias add constraint carpetas_vacias_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.concesiones_mineras add constraint concesiones_mineras_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.contratos add constraint contratos_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.datos_empresas add constraint datos_empresas_propietario_id_fkey FOREIGN KEY (propietario_id) REFERENCES propietarios(id) ON DELETE SET NULL;

alter table public.documentos add constraint documentos_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.estados_procesos add constraint estados_procesos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.eventos add constraint eventos_cerrado_por_fkey FOREIGN KEY (cerrado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.eventos add constraint eventos_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.eventos add constraint eventos_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.fechas_config add constraint fechas_config_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.historial add constraint historial_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.lector_ia_accesos add constraint lector_ia_accesos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.lector_ia_reservas add constraint lector_ia_reservas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.lector_ia_uso add constraint lector_ia_uso_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.oficinas_registrales add constraint oficinas_registrales_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.opciones_columna add constraint opciones_columna_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.perfiles add constraint perfiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.permisos_usuario add constraint permisos_usuario_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.permisos_usuario add constraint permisos_usuario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES perfiles(id) ON DELETE CASCADE;

alter table public.personal add constraint personal_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.predios add constraint predios_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.predios add constraint predios_oficina_registral_id_fkey FOREIGN KEY (oficina_registral_id) REFERENCES oficinas_registrales(id) ON DELETE SET NULL;

alter table public.predios add constraint predios_predio_padre_id_fkey FOREIGN KEY (predio_padre_id) REFERENCES predios(id) ON DELETE SET NULL;

alter table public.procesos add constraint procesos_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.propiedades_nativas_eliminadas add constraint propiedades_nativas_eliminadas_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.propiedades_personalizadas add constraint propiedades_personalizadas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.propietarios add constraint propietarios_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

alter table public.tipos_columna add constraint tipos_columna_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.tipos_documento_custom add constraint tipos_documento_custom_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.valores_propiedad_personalizada add constraint valores_propiedad_personalizada_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.valores_propiedad_personalizada add constraint valores_propiedad_personalizada_propiedad_id_fkey FOREIGN KEY (propiedad_id) REFERENCES propiedades_personalizadas(id) ON DELETE CASCADE;

alter table public.vehiculos add constraint vehiculos_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES perfiles(id) ON DELETE SET NULL;

CREATE INDEX archivos_entidad_tipo_id_idx ON public.archivos USING btree (entidad_tipo, entidad_id);

CREATE UNIQUE INDEX archivos_objeto_dueno ON public.archivos USING btree (r2_key, entidad_id);

CREATE INDEX archivos_sha256_idx ON public.archivos USING btree (sha256);

CREATE INDEX contratos_fecha_vencimiento_idx ON public.contratos USING btree (fecha_vencimiento) WHERE (fecha_vencimiento IS NOT NULL);

CREATE INDEX contratos_tipo_idx ON public.contratos USING btree (tipo);

CREATE INDEX contratos_tipo_nombre_idx ON public.contratos USING btree (tipo, nombre);

CREATE INDEX correos_dominio_idx ON public.correos USING btree (dominio);

CREATE INDEX datos_empresas_propietario_id_idx ON public.datos_empresas USING btree (propietario_id);

CREATE INDEX documentos_fecha_idx ON public.documentos USING btree (fecha) WHERE (fecha IS NOT NULL);

CREATE INDEX documentos_nombre_idx ON public.documentos USING gin (nombre gin_trgm_ops);

CREATE INDEX documentos_tipo_fecha_nombre_idx ON public.documentos USING btree (tipo, fecha DESC NULLS LAST, nombre);

CREATE INDEX documentos_tipo_idx ON public.documentos USING btree (tipo);

CREATE INDEX estados_procesos_materia_orden ON public.estados_procesos USING btree (materia, orden);

CREATE UNIQUE INDEX estados_procesos_materia_valor ON public.estados_procesos USING btree (COALESCE(materia, ''::text), lower(btrim(valor)));

CREATE INDEX estados_procesos_orden ON public.estados_procesos USING btree (creado_en, id);

CREATE INDEX idx_archivos_eliminado ON public.archivos USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_carpetas_vacias_entidad ON public.carpetas_vacias USING btree (entidad_tipo, entidad_id, contexto);

CREATE INDEX idx_concesiones_mineras_eliminado ON public.concesiones_mineras USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_contratos_eliminado ON public.contratos USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_documentos_eliminado ON public.documentos USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_eventos_eliminado ON public.eventos USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_eventos_inicia_en ON public.eventos USING btree (inicia_en) WHERE (inicia_en IS NOT NULL);

CREATE INDEX idx_eventos_pendientes ON public.eventos USING btree (inicia_en) WHERE ((estado = 'PENDIENTE'::text) AND (eliminado_en IS NULL));

CREATE INDEX idx_eventos_responsable ON public.eventos USING btree (responsable_id) WHERE (responsable_id IS NOT NULL);

CREATE INDEX idx_historial_registro ON public.historial USING btree (tabla, registro_id, creado_en DESC);

CREATE INDEX idx_oficinas_registrales_eliminado ON public.oficinas_registrales USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_personal_eliminado ON public.personal USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_predios_eliminado ON public.predios USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_procesos_eliminado ON public.procesos USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_propietarios_eliminado ON public.propietarios USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX idx_vehiculos_eliminado ON public.vehiculos USING btree (eliminado_en DESC) WHERE (eliminado_en IS NOT NULL);

CREATE INDEX lector_ia_reservas_usuario_expira_idx ON public.lector_ia_reservas USING btree (usuario_id, expira_en);

CREATE INDEX lector_ia_uso_usuario_fecha_idx ON public.lector_ia_uso USING btree (usuario_id, creado_en DESC);

CREATE INDEX opciones_columna_orden ON public.opciones_columna USING btree (tabla, campo, orden, creado_en);

CREATE INDEX personal_contrato_fin_idx ON public.personal USING btree (contrato_fin) WHERE (contrato_fin IS NOT NULL);

CREATE INDEX predios_nombre_idx ON public.predios USING gin (nombre gin_trgm_ops);

CREATE INDEX predios_oficina_registral_id_idx ON public.predios USING btree (oficina_registral_id);

CREATE INDEX predios_predio_padre_id_idx ON public.predios USING btree (predio_padre_id);

CREATE INDEX procesos_expediente_idx ON public.procesos USING gin (expediente gin_trgm_ops);

CREATE INDEX procesos_materia_expediente_idx ON public.procesos USING btree (materia, expediente);

CREATE INDEX procesos_materia_idx ON public.procesos USING btree (materia);

CREATE INDEX propiedades_personalizadas_entidad_orden ON public.propiedades_personalizadas USING btree (entidad_tipo, subtipo, creado_en, id);

CREATE UNIQUE INDEX propiedades_personalizadas_nombre_unico ON public.propiedades_personalizadas USING btree (entidad_tipo, COALESCE(subtipo, ''::text), lower(btrim(nombre)));

CREATE INDEX propietarios_nombre_idx ON public.propietarios USING gin (nombre gin_trgm_ops);

CREATE UNIQUE INDEX tipos_propietario_nombre_unico ON public.tipos_propietario USING btree (lower(btrim(nombre)));

CREATE INDEX tipos_propietario_orden ON public.tipos_propietario USING btree (orden);

CREATE INDEX usuarios_entidades_entidad_idx ON public.usuarios_entidades USING btree (entidad);

CREATE INDEX valores_propiedad_personalizada_entidad ON public.valores_propiedad_personalizada USING btree (entidad_id, propiedad_id);

CREATE INDEX vehiculos_poliza_vence_idx ON public.vehiculos USING btree (poliza_vence) WHERE (poliza_vence IS NOT NULL);

CREATE INDEX vehiculos_soat_vence_idx ON public.vehiculos USING btree (soat_vence) WHERE (soat_vence IS NOT NULL);

CREATE INDEX vinculos_destino_tipo_id_idx ON public.vinculos USING btree (destino_tipo, destino_id);

CREATE INDEX vinculos_origen_tipo_id_idx ON public.vinculos USING btree (origen_tipo, origen_id);

create or replace view public.conteo_migracion with (security_invoker=on) as
 SELECT 'propietarios'::text AS entidad,
    count(*) AS total
   FROM propietarios
UNION ALL
 SELECT 'datos_empresas'::text AS entidad,
    count(*) AS total
   FROM datos_empresas
UNION ALL
 SELECT 'predios'::text AS entidad,
    count(*) AS total
   FROM predios
UNION ALL
 SELECT 'vehiculos'::text AS entidad,
    count(*) AS total
   FROM vehiculos
UNION ALL
 SELECT 'concesiones_mineras'::text AS entidad,
    count(*) AS total
   FROM concesiones_mineras
UNION ALL
 SELECT 'personal'::text AS entidad,
    count(*) AS total
   FROM personal
UNION ALL
 SELECT 'oficinas_registrales'::text AS entidad,
    count(*) AS total
   FROM oficinas_registrales
UNION ALL
 SELECT 'procesos'::text AS entidad,
    count(*) AS total
   FROM procesos
UNION ALL
 SELECT 'contratos'::text AS entidad,
    count(*) AS total
   FROM contratos
UNION ALL
 SELECT 'documentos'::text AS entidad,
    count(*) AS total
   FROM documentos
UNION ALL
 SELECT 'eventos'::text AS entidad,
    count(*) AS total
   FROM eventos
UNION ALL
 SELECT 'vinculos'::text AS entidad,
    count(*) AS total
   FROM vinculos
UNION ALL
 SELECT 'archivos'::text AS entidad,
    count(*) AS total
   FROM archivos;

create or replace view public.vinculos_huerfanos with (security_invoker=on) as
 WITH e AS (
         SELECT 'propietario'::entidad AS t,
            propietarios.id
           FROM propietarios
        UNION ALL
         SELECT 'predio'::entidad,
            predios.id
           FROM predios
        UNION ALL
         SELECT 'vehiculo'::entidad,
            vehiculos.id
           FROM vehiculos
        UNION ALL
         SELECT 'concesion'::entidad,
            concesiones_mineras.id
           FROM concesiones_mineras
        UNION ALL
         SELECT 'personal'::entidad,
            personal.id
           FROM personal
        UNION ALL
         SELECT 'oficina_registral'::entidad,
            oficinas_registrales.id
           FROM oficinas_registrales
        UNION ALL
         SELECT 'documento'::entidad,
            documentos.id
           FROM documentos
        UNION ALL
         SELECT 'contrato'::entidad,
            contratos.id
           FROM contratos
        UNION ALL
         SELECT 'proceso'::entidad,
            procesos.id
           FROM procesos
        UNION ALL
         SELECT 'evento'::entidad,
            eventos.id
           FROM eventos
        )
 SELECT v.id,
    v.origen_tipo,
    v.origen_id,
    v.destino_tipo,
    v.destino_id,
    v.rol,
    v.resuelto_por,
    v.creado_en,
    o.id IS NULL AS origen_inexistente,
    d.id IS NULL AS destino_inexistente
   FROM vinculos v
     LEFT JOIN e o ON o.t = v.origen_tipo AND o.id = v.origen_id
     LEFT JOIN e d ON d.t = v.destino_tipo AND d.id = v.destino_id
  WHERE o.id IS NULL OR d.id IS NULL;

CREATE TRIGGER al_crear_usuario AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION crear_perfil();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON concesiones_mineras FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('concesion');

CREATE TRIGGER trg_concesiones_mineras_historial AFTER INSERT OR DELETE OR UPDATE ON concesiones_mineras FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER contratos_actualizado BEFORE UPDATE ON contratos FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON contratos FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('contrato');

CREATE TRIGGER trg_contratos_historial AFTER INSERT OR DELETE OR UPDATE ON contratos FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER correos_notion_id BEFORE INSERT ON correos FOR EACH ROW EXECUTE FUNCTION _notion_id_sintetico();

CREATE TRIGGER trg_datos_empresas_historial AFTER INSERT OR DELETE OR UPDATE ON datos_empresas FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER documentos_actualizado BEFORE UPDATE ON documentos FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON documentos FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('documento');

CREATE TRIGGER trg_documentos_historial AFTER INSERT OR DELETE OR UPDATE ON documentos FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER eventos_actualizado BEFORE UPDATE ON eventos FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TRIGGER trg_eventos_historial AFTER INSERT OR DELETE OR UPDATE ON eventos FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON oficinas_registrales FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('oficina_registral');

CREATE TRIGGER trg_oficinas_registrales_historial AFTER INSERT OR DELETE OR UPDATE ON oficinas_registrales FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON personal FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('personal');

CREATE TRIGGER personal_actualizado BEFORE UPDATE ON personal FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TRIGGER trg_personal_historial AFTER INSERT OR DELETE OR UPDATE ON personal FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON predios FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('predio');

CREATE TRIGGER predios_actualizado BEFORE UPDATE ON predios FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TRIGGER trg_predios_historial AFTER INSERT OR DELETE OR UPDATE ON predios FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON procesos FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('proceso');

CREATE TRIGGER procesos_actualizado BEFORE UPDATE ON procesos FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TRIGGER trg_procesos_historial AFTER INSERT OR DELETE OR UPDATE ON procesos FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON propietarios FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('propietario');

CREATE TRIGGER propietarios_actualizado BEFORE UPDATE ON propietarios FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TRIGGER trg_propietarios_historial AFTER INSERT OR DELETE OR UPDATE ON propietarios FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER tipos_propietario_orden_al_final BEFORE INSERT ON tipos_propietario FOR EACH ROW EXECUTE FUNCTION tipos_propietario_orden_al_final();

CREATE TRIGGER usuarios_entidades_notion_id BEFORE INSERT ON usuarios_entidades FOR EACH ROW EXECUTE FUNCTION _notion_id_sintetico();

CREATE TRIGGER limpiar_valores_personalizados_entidad AFTER DELETE ON vehiculos FOR EACH ROW EXECUTE FUNCTION limpiar_valores_personalizados_entidad('vehiculo');

CREATE TRIGGER trg_vehiculos_historial AFTER INSERT OR DELETE OR UPDATE ON vehiculos FOR EACH ROW EXECUTE FUNCTION registrar_historial();

CREATE TRIGGER vehiculos_actualizado BEFORE UPDATE ON vehiculos FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

alter table public.archivos enable row level security;

alter table public.carpetas_vacias enable row level security;

alter table public.concesiones_mineras enable row level security;

alter table public.contratos enable row level security;

alter table public.correos enable row level security;

alter table public.datos_empresas enable row level security;

alter table public.documentos enable row level security;

alter table public.estados_procesos enable row level security;

alter table public.eventos enable row level security;

alter table public.fechas_config enable row level security;

alter table public.feriados enable row level security;

alter table public.historial enable row level security;

alter table public.lector_ia_accesos enable row level security;

alter table public.lector_ia_reservas enable row level security;

alter table public.lector_ia_uso enable row level security;

alter table public.oficinas_registrales enable row level security;

alter table public.opciones_columna enable row level security;

alter table public.perfiles enable row level security;

alter table public.permisos_usuario enable row level security;

alter table public.personal enable row level security;

alter table public.predios enable row level security;

alter table public.procesos enable row level security;

alter table public.propiedades_nativas_eliminadas enable row level security;

alter table public.propiedades_personalizadas enable row level security;

alter table public.propietarios enable row level security;

alter table public.r2_huerfanos enable row level security;

alter table public.tipos_columna enable row level security;

alter table public.tipos_documento_custom enable row level security;

alter table public.tipos_propietario enable row level security;

alter table public.usuarios_entidades enable row level security;

alter table public.valores_propiedad_personalizada enable row level security;

alter table public.vehiculos enable row level security;

alter table public.vinculos enable row level security;

create policy acceso_alta on public.archivos as permissive for insert to authenticated
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('archivos'::text, to_jsonb(archivos.*), true)));

create policy acceso_edicion on public.archivos as permissive for update to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('archivos'::text, to_jsonb(archivos.*), true)))
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('archivos'::text, to_jsonb(archivos.*), true)));

create policy acceso_lectura on public.archivos as permissive for select to authenticated
  using ((( SELECT es_admin() AS es_admin) OR (( SELECT acceso_area('documentos'::text, false) AS acceso_area) AND (area_entidad((entidad_tipo)::text) = ANY (( SELECT privado.areas_con_acceso(false) AS areas_con_acceso)::text[])) AND privado.entidad_visible((entidad_tipo)::text, entidad_id))));

create policy ocultar_eliminados on public.archivos as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy carpetas_vacias_delete on public.carpetas_vacias as permissive for delete to authenticated
  using ((( SELECT acceso_area('documentos'::text, true) AS acceso_area) AND acceso_entidad(entidad_tipo, entidad_id, true)));

create policy carpetas_vacias_insert on public.carpetas_vacias as permissive for insert to authenticated
  with check (((creado_por = ( SELECT auth.uid() AS uid)) AND ( SELECT acceso_area('documentos'::text, true) AS acceso_area) AND acceso_entidad(entidad_tipo, entidad_id, true)));

create policy carpetas_vacias_lectura on public.carpetas_vacias as permissive for select to authenticated
  using ((( SELECT acceso_area('documentos'::text, false) AS acceso_area) AND acceso_entidad(entidad_tipo, entidad_id)));

create policy acceso_alta on public.concesiones_mineras as permissive for insert to authenticated
  with check (( SELECT acceso_area('concesiones'::text, true) AS acceso_area));

create policy acceso_edicion on public.concesiones_mineras as permissive for update to authenticated
  using (( SELECT acceso_area('concesiones'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('concesiones'::text, true) AS acceso_area));

create policy acceso_lectura on public.concesiones_mineras as permissive for select to authenticated
  using (( SELECT acceso_area('concesiones'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.concesiones_mineras as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy acceso_alta on public.contratos as permissive for insert to authenticated
  with check ((( SELECT acceso_area('contratos'::text, true) AS acceso_area) AND ((( SELECT mi_rol() AS mi_rol) <> 'tesoreria'::rol_usuario) OR (( SELECT nivel_area('contratos'::text) AS nivel_area) = 'administrar'::text) OR ((tipo)::text = ANY (ARRAY['servicios'::text, 'mutuo'::text, 'arrendamiento'::text])))));

create policy acceso_edicion on public.contratos as permissive for update to authenticated
  using ((( SELECT acceso_area('contratos'::text, true) AS acceso_area) AND ((( SELECT mi_rol() AS mi_rol) <> 'tesoreria'::rol_usuario) OR (( SELECT nivel_area('contratos'::text) AS nivel_area) = 'administrar'::text) OR ((tipo)::text = ANY (ARRAY['servicios'::text, 'mutuo'::text, 'arrendamiento'::text])))))
  with check ((( SELECT acceso_area('contratos'::text, true) AS acceso_area) AND ((( SELECT mi_rol() AS mi_rol) <> 'tesoreria'::rol_usuario) OR (( SELECT nivel_area('contratos'::text) AS nivel_area) = 'administrar'::text) OR ((tipo)::text = ANY (ARRAY['servicios'::text, 'mutuo'::text, 'arrendamiento'::text])))));

create policy acceso_lectura on public.contratos as permissive for select to authenticated
  using ((( SELECT acceso_area('contratos'::text, false) AS acceso_area) AND ((( SELECT mi_rol() AS mi_rol) <> 'tesoreria'::rol_usuario) OR (( SELECT nivel_area('contratos'::text) AS nivel_area) = 'administrar'::text) OR ((tipo)::text = ANY (ARRAY['servicios'::text, 'mutuo'::text, 'arrendamiento'::text])))));

create policy ocultar_eliminados on public.contratos as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy correos_borrado on public.correos as permissive for delete to authenticated
  using (es_admin());

create policy correos_edicion on public.correos as permissive for update to authenticated
  using (puede_escribir())
  with check (puede_escribir());

create policy correos_escritura on public.correos as permissive for insert to authenticated
  with check (puede_escribir());

create policy correos_lectura on public.correos as permissive for select to authenticated
  using (es_admin());

create policy acceso_alta on public.datos_empresas as permissive for insert to authenticated
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('datos_empresas'::text, to_jsonb(datos_empresas.*), true)));

create policy acceso_baja on public.datos_empresas as permissive for delete to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('datos_empresas'::text, to_jsonb(datos_empresas.*), true)));

create policy acceso_edicion on public.datos_empresas as permissive for update to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('datos_empresas'::text, to_jsonb(datos_empresas.*), true)))
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('datos_empresas'::text, to_jsonb(datos_empresas.*), true)));

create policy acceso_lectura on public.datos_empresas as permissive for select to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('datos_empresas'::text, to_jsonb(datos_empresas.*), false)));

create policy acceso_alta on public.documentos as permissive for insert to authenticated
  with check (( SELECT acceso_area('documentos'::text, true) AS acceso_area));

create policy acceso_edicion on public.documentos as permissive for update to authenticated
  using (( SELECT acceso_area('documentos'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('documentos'::text, true) AS acceso_area));

create policy acceso_lectura on public.documentos as permissive for select to authenticated
  using (( SELECT acceso_area('documentos'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.documentos as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy estados_procesos_escritura on public.estados_procesos as permissive for all to authenticated
  using (( SELECT acceso_area('procesos'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('procesos'::text, true) AS acceso_area));

create policy estados_procesos_lectura on public.estados_procesos as permissive for select to authenticated
  using (true);

create policy acceso_alta on public.eventos as permissive for insert to authenticated
  with check (( SELECT acceso_area('procesos'::text, true) AS acceso_area));

create policy acceso_edicion on public.eventos as permissive for update to authenticated
  using (( SELECT acceso_area('procesos'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('procesos'::text, true) AS acceso_area));

create policy acceso_lectura on public.eventos as permissive for select to authenticated
  using (( SELECT acceso_area('procesos'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.eventos as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy fechas_config_escritura on public.fechas_config as permissive for all to authenticated
  using ((( SELECT es_admin() AS es_admin) OR (EXISTS ( SELECT 1
   FROM propiedades_personalizadas p
  WHERE ((p.id =
        CASE
            WHEN (fechas_config.fuente ~ '^propiedad:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN (substr(fechas_config.fuente, 11))::uuid
            ELSE NULL::uuid
        END) AND acceso_area(area_entidad(p.entidad_tipo), true))))))
  with check ((( SELECT es_admin() AS es_admin) OR (EXISTS ( SELECT 1
   FROM propiedades_personalizadas p
  WHERE ((p.id =
        CASE
            WHEN (fechas_config.fuente ~ '^propiedad:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN (substr(fechas_config.fuente, 11))::uuid
            ELSE NULL::uuid
        END) AND acceso_area(area_entidad(p.entidad_tipo), true))))));

create policy fechas_config_lectura on public.fechas_config as permissive for select to authenticated
  using (true);

create policy feriados_escritura on public.feriados as permissive for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy feriados_lectura on public.feriados as permissive for select to authenticated
  using (true);

create policy historial_insert_propio on public.historial as permissive for insert to authenticated
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('historial'::text, to_jsonb(historial.*), true)));

create policy historial_lectura on public.historial as permissive for select to authenticated
  using ((( SELECT es_admin() AS es_admin) OR ((area_entidad(tabla) = ANY (( SELECT privado.areas_con_acceso(false) AS areas_con_acceso)::text[])) AND privado.entidad_visible(tabla, registro_id))));

create policy lector_ia_acceso_admin on public.lector_ia_accesos as permissive for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy lector_ia_acceso_propio on public.lector_ia_accesos as permissive for select to authenticated
  using (((usuario_id = ( SELECT auth.uid() AS uid)) OR ( SELECT es_admin() AS es_admin)));

create policy lector_ia_uso_propio on public.lector_ia_uso as permissive for select to authenticated
  using (((usuario_id = ( SELECT auth.uid() AS uid)) OR ( SELECT es_admin() AS es_admin)));

create policy acceso_alta on public.oficinas_registrales as permissive for insert to authenticated
  with check (( SELECT acceso_area('oficinas'::text, true) AS acceso_area));

create policy acceso_edicion on public.oficinas_registrales as permissive for update to authenticated
  using (( SELECT acceso_area('oficinas'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('oficinas'::text, true) AS acceso_area));

create policy acceso_lectura on public.oficinas_registrales as permissive for select to authenticated
  using (( SELECT acceso_area('oficinas'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.oficinas_registrales as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy opciones_columna_escritura on public.opciones_columna as permissive for all to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_area(area_entidad(tabla), true)))
  with check ((( SELECT es_admin() AS es_admin) OR acceso_area(area_entidad(tabla), true)));

create policy opciones_columna_lectura on public.opciones_columna as permissive for select to authenticated
  using (true);

create policy perfil_admin_escribe on public.perfiles as permissive for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy perfil_propio on public.perfiles as permissive for select to authenticated
  using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT es_admin() AS es_admin)));

create policy permisos_lectura on public.permisos_usuario as permissive for select to authenticated
  using (((usuario_id = ( SELECT auth.uid() AS uid)) OR es_admin()));

create policy acceso_alta on public.personal as permissive for insert to authenticated
  with check (( SELECT acceso_area('personal'::text, true) AS acceso_area));

create policy acceso_edicion on public.personal as permissive for update to authenticated
  using (( SELECT acceso_area('personal'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('personal'::text, true) AS acceso_area));

create policy acceso_lectura on public.personal as permissive for select to authenticated
  using (( SELECT acceso_area('personal'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.personal as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy acceso_alta on public.predios as permissive for insert to authenticated
  with check (( SELECT acceso_area('predios'::text, true) AS acceso_area));

create policy acceso_edicion on public.predios as permissive for update to authenticated
  using (( SELECT acceso_area('predios'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('predios'::text, true) AS acceso_area));

create policy acceso_lectura on public.predios as permissive for select to authenticated
  using (( SELECT acceso_area('predios'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.predios as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy acceso_alta on public.procesos as permissive for insert to authenticated
  with check (( SELECT acceso_area('procesos'::text, true) AS acceso_area));

create policy acceso_edicion on public.procesos as permissive for update to authenticated
  using (( SELECT acceso_area('procesos'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('procesos'::text, true) AS acceso_area));

create policy acceso_lectura on public.procesos as permissive for select to authenticated
  using (( SELECT acceso_area('procesos'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.procesos as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy propiedades_nativas_eliminadas_escritura on public.propiedades_nativas_eliminadas as permissive for all to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_area(area_entidad(entidad_tipo), true)))
  with check ((( SELECT es_admin() AS es_admin) OR acceso_area(area_entidad(entidad_tipo), true)));

create policy propiedades_nativas_eliminadas_lectura on public.propiedades_nativas_eliminadas as permissive for select to authenticated
  using (true);

create policy acceso_alta on public.propiedades_personalizadas as permissive for insert to authenticated
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('propiedades_personalizadas'::text, to_jsonb(propiedades_personalizadas.*), true)));

create policy acceso_baja on public.propiedades_personalizadas as permissive for delete to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('propiedades_personalizadas'::text, to_jsonb(propiedades_personalizadas.*), true)));

create policy acceso_edicion on public.propiedades_personalizadas as permissive for update to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('propiedades_personalizadas'::text, to_jsonb(propiedades_personalizadas.*), true)))
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('propiedades_personalizadas'::text, to_jsonb(propiedades_personalizadas.*), true)));

create policy acceso_lectura on public.propiedades_personalizadas as permissive for select to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('propiedades_personalizadas'::text, to_jsonb(propiedades_personalizadas.*), false)));

create policy acceso_alta on public.propietarios as permissive for insert to authenticated
  with check (( SELECT acceso_area('propietarios'::text, true) AS acceso_area));

create policy acceso_edicion on public.propietarios as permissive for update to authenticated
  using (( SELECT acceso_area('propietarios'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('propietarios'::text, true) AS acceso_area));

create policy acceso_lectura on public.propietarios as permissive for select to authenticated
  using (( SELECT acceso_area('propietarios'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.propietarios as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy r2_huerfanos_admin on public.r2_huerfanos as permissive for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy tipos_columna_escritura on public.tipos_columna as permissive for all to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_area(area_entidad(tabla), true)))
  with check ((( SELECT es_admin() AS es_admin) OR acceso_area(area_entidad(tabla), true)));

create policy tipos_columna_lectura on public.tipos_columna as permissive for select to authenticated
  using (true);

create policy acceso_alta on public.tipos_documento_custom as permissive for insert to authenticated
  with check (( SELECT acceso_area('documentos'::text, true) AS acceso_area));

create policy acceso_baja on public.tipos_documento_custom as permissive for delete to authenticated
  using (( SELECT acceso_area('documentos'::text, true) AS acceso_area));

create policy acceso_edicion on public.tipos_documento_custom as permissive for update to authenticated
  using (( SELECT acceso_area('documentos'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('documentos'::text, true) AS acceso_area));

create policy acceso_lectura on public.tipos_documento_custom as permissive for select to authenticated
  using (( SELECT acceso_area('documentos'::text, false) AS acceso_area));

create policy acceso_alta on public.tipos_propietario as permissive for insert to authenticated
  with check (( SELECT acceso_area('propietarios'::text, true) AS acceso_area));

create policy acceso_baja on public.tipos_propietario as permissive for delete to authenticated
  using (( SELECT acceso_area('propietarios'::text, true) AS acceso_area));

create policy acceso_edicion on public.tipos_propietario as permissive for update to authenticated
  using (( SELECT acceso_area('propietarios'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('propietarios'::text, true) AS acceso_area));

create policy acceso_lectura on public.tipos_propietario as permissive for select to authenticated
  using (( SELECT acceso_area('propietarios'::text, false) AS acceso_area));

create policy usuarios_entidades_escritura on public.usuarios_entidades as permissive for all to authenticated
  using (es_admin())
  with check (es_admin());

create policy usuarios_entidades_lectura on public.usuarios_entidades as permissive for select to authenticated
  using (es_admin());

create policy acceso_alta on public.valores_propiedad_personalizada as permissive for insert to authenticated
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('valores_propiedad_personalizada'::text, to_jsonb(valores_propiedad_personalizada.*), true)));

create policy acceso_baja on public.valores_propiedad_personalizada as permissive for delete to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('valores_propiedad_personalizada'::text, to_jsonb(valores_propiedad_personalizada.*), true)));

create policy acceso_edicion on public.valores_propiedad_personalizada as permissive for update to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('valores_propiedad_personalizada'::text, to_jsonb(valores_propiedad_personalizada.*), true)))
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('valores_propiedad_personalizada'::text, to_jsonb(valores_propiedad_personalizada.*), true)));

create policy acceso_lectura on public.valores_propiedad_personalizada as permissive for select to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('valores_propiedad_personalizada'::text, to_jsonb(valores_propiedad_personalizada.*), false)));

create policy acceso_alta on public.vehiculos as permissive for insert to authenticated
  with check (( SELECT acceso_area('vehiculos'::text, true) AS acceso_area));

create policy acceso_edicion on public.vehiculos as permissive for update to authenticated
  using (( SELECT acceso_area('vehiculos'::text, true) AS acceso_area))
  with check (( SELECT acceso_area('vehiculos'::text, true) AS acceso_area));

create policy acceso_lectura on public.vehiculos as permissive for select to authenticated
  using (( SELECT acceso_area('vehiculos'::text, false) AS acceso_area));

create policy ocultar_eliminados on public.vehiculos as restrictive for select to authenticated
  using ((eliminado_en IS NULL));

create policy acceso_alta on public.vinculos as permissive for insert to authenticated
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('vinculos'::text, to_jsonb(vinculos.*), true)));

create policy acceso_baja on public.vinculos as permissive for delete to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('vinculos'::text, to_jsonb(vinculos.*), true)));

create policy acceso_edicion on public.vinculos as permissive for update to authenticated
  using ((( SELECT es_admin() AS es_admin) OR acceso_fila('vinculos'::text, to_jsonb(vinculos.*), true)))
  with check ((( SELECT es_admin() AS es_admin) OR acceso_fila('vinculos'::text, to_jsonb(vinculos.*), true)));

create policy acceso_lectura on public.vinculos as permissive for select to authenticated
  using ((( SELECT es_admin() AS es_admin) OR ((area_entidad((origen_tipo)::text) = ANY (( SELECT privado.areas_con_acceso(false) AS areas_con_acceso)::text[])) AND (area_entidad((destino_tipo)::text) = ANY (( SELECT privado.areas_con_acceso(false) AS areas_con_acceso)::text[])) AND privado.entidad_visible((origen_tipo)::text, origen_id) AND privado.entidad_visible((destino_tipo)::text, destino_id))));

revoke all on table public.archivos from anon, authenticated;
grant delete, insert, maintain, select, update on table public.archivos to authenticated;

revoke all on table public.carpetas_vacias from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.carpetas_vacias to authenticated;

revoke all on table public.concesiones_mineras from anon, authenticated;
grant delete, insert, maintain, select, update on table public.concesiones_mineras to authenticated;

revoke all on table public.conteo_migracion from anon, authenticated;
grant maintain, references, select, trigger, truncate on table public.conteo_migracion to authenticated;

revoke all on table public.contratos from anon, authenticated;
grant delete, insert, maintain, select, update on table public.contratos to authenticated;

revoke all on table public.correos from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.correos to authenticated;

revoke all on table public.datos_empresas from anon, authenticated;
grant delete, insert, maintain, select, update on table public.datos_empresas to authenticated;

revoke all on table public.documentos from anon, authenticated;
grant delete, insert, maintain, select, update on table public.documentos to authenticated;

revoke all on table public.estados_procesos from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.estados_procesos to authenticated;

revoke all on table public.eventos from anon, authenticated;
grant delete, insert, maintain, select, update on table public.eventos to authenticated;

revoke all on table public.fechas_config from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.fechas_config to authenticated;

revoke all on table public.feriados from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.feriados to authenticated;

revoke all on table public.historial from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, update on table public.historial to authenticated;

revoke all on table public.lector_ia_accesos from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.lector_ia_accesos to authenticated;

revoke all on table public.lector_ia_reservas from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.lector_ia_reservas to authenticated;

revoke all on table public.lector_ia_uso from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.lector_ia_uso to authenticated;

revoke all on table public.oficinas_registrales from anon, authenticated;
grant delete, insert, maintain, select, update on table public.oficinas_registrales to authenticated;

revoke all on table public.opciones_columna from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.opciones_columna to authenticated;

revoke all on table public.perfiles from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.perfiles to authenticated;

revoke all on table public.permisos_usuario from anon, authenticated;
grant select on table public.permisos_usuario to authenticated;

revoke all on table public.personal from anon, authenticated;
grant delete, insert, maintain, select, update on table public.personal to authenticated;

revoke all on table public.predios from anon, authenticated;
grant delete, insert, maintain, select, update on table public.predios to authenticated;

revoke all on table public.procesos from anon, authenticated;
grant delete, insert, maintain, select, update on table public.procesos to authenticated;

revoke all on table public.propiedades_nativas_eliminadas from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.propiedades_nativas_eliminadas to authenticated;

revoke all on table public.propiedades_personalizadas from anon, authenticated;
grant delete, insert, maintain, select, update on table public.propiedades_personalizadas to authenticated;

revoke all on table public.propietarios from anon, authenticated;
grant delete, insert, maintain, select, update on table public.propietarios to authenticated;

revoke all on table public.r2_huerfanos from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.r2_huerfanos to authenticated;

revoke all on table public.tipos_columna from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.tipos_columna to authenticated;

revoke all on table public.tipos_documento_custom from anon, authenticated;
grant delete, insert, maintain, select, update on table public.tipos_documento_custom to authenticated;

revoke all on table public.tipos_propietario from anon, authenticated;
grant delete, insert, maintain, select, update on table public.tipos_propietario to authenticated;

revoke all on table public.usuarios_entidades from anon, authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table public.usuarios_entidades to authenticated;

revoke all on table public.valores_propiedad_personalizada from anon, authenticated;
grant delete, insert, maintain, select, update on table public.valores_propiedad_personalizada to authenticated;

revoke all on table public.vehiculos from anon, authenticated;
grant delete, insert, maintain, select, update on table public.vehiculos to authenticated;

revoke all on table public.vinculos from anon, authenticated;
grant delete, insert, maintain, select, update on table public.vinculos to authenticated;

revoke all on table public.vinculos_huerfanos from anon, authenticated;
grant maintain, references, select, trigger, truncate on table public.vinculos_huerfanos to authenticated;

revoke all on function privado.areas_con_acceso(p_escritura boolean) from public, anon, authenticated;
grant execute on function privado.areas_con_acceso(p_escritura boolean) to authenticated;

revoke all on function privado.entidad_visible(p_tipo text, p_id uuid) from public, anon, authenticated;
grant execute on function privado.entidad_visible(p_tipo text, p_id uuid) to authenticated;

revoke all on function public._notion_id_sintetico() from public, anon, authenticated;
grant execute on function public._notion_id_sintetico() to public;

revoke all on function public.acceso_area(p_area text, p_escritura boolean) from public, anon, authenticated;
grant execute on function public.acceso_area(p_area text, p_escritura boolean) to authenticated;

revoke all on function public.acceso_entidad(p_tipo text, p_id uuid, p_escritura boolean) from public, anon, authenticated;
grant execute on function public.acceso_entidad(p_tipo text, p_id uuid, p_escritura boolean) to authenticated;

revoke all on function public.acceso_fila(p_tabla text, p_fila jsonb, p_escritura boolean) from public, anon, authenticated;
grant execute on function public.acceso_fila(p_tabla text, p_fila jsonb, p_escritura boolean) to authenticated;

revoke all on function public.acceso_tipo_contrato(p_tipo text) from public, anon, authenticated;
grant execute on function public.acceso_tipo_contrato(p_tipo text) to authenticated;

revoke all on function public.actualizar_nombre_propio(p_nombre text) from public, anon, authenticated;
grant execute on function public.actualizar_nombre_propio(p_nombre text) to authenticated;

revoke all on function public.alta_correo(p_notion_id text, p_direccion text, p_titular text, p_clave text, p_notas text) from public, anon, authenticated;

revoke all on function public.alta_usuario_entidad(p_notion_id text, p_entidad text, p_usuario text, p_usuario_secundario text, p_clave text, p_notas text) from public, anon, authenticated;

revoke all on function public.archivo_revivir(p_entidad_tipo text, p_entidad_id uuid, p_r2_key text, p_nombre text, p_carpeta text) from public, anon, authenticated;
grant execute on function public.archivo_revivir(p_entidad_tipo text, p_entidad_id uuid, p_r2_key text, p_nombre text, p_carpeta text) to authenticated;

revoke all on function public.area_entidad(p_tipo text) from public, anon, authenticated;
grant execute on function public.area_entidad(p_tipo text) to authenticated;

revoke all on function public.cambiar_rol_usuario(p_usuario uuid, p_rol rol_usuario) from public, anon, authenticated;
grant execute on function public.cambiar_rol_usuario(p_usuario uuid, p_rol rol_usuario) to authenticated;

revoke all on function public.cancelar_reserva_lector_ia(p_reserva_id uuid) from public, anon, authenticated;
grant execute on function public.cancelar_reserva_lector_ia(p_reserva_id uuid) to authenticated;

revoke all on function public.crear_perfil() from public, anon, authenticated;
grant execute on function public.crear_perfil() to public;

revoke all on function public.es_admin() from public, anon, authenticated;
grant execute on function public.es_admin() to authenticated;

revoke all on function public.es_admin_actual() from public, anon, authenticated;
grant execute on function public.es_admin_actual() to public;

revoke all on function public.es_contrato_tesoreria(p_id uuid) from public, anon, authenticated;
grant execute on function public.es_contrato_tesoreria(p_id uuid) to authenticated;

revoke all on function public.es_tesoreria() from public, anon, authenticated;
grant execute on function public.es_tesoreria() to authenticated;

revoke all on function public.finalizar_uso_lector_ia(p_reserva_id uuid, p_documentos integer, p_paginas integer, p_consultas integer, p_busquedas integer, p_costo_estimado_usd numeric) from public, anon, authenticated;
grant execute on function public.finalizar_uso_lector_ia(p_reserva_id uuid, p_documentos integer, p_paginas integer, p_consultas integer, p_busquedas integer, p_costo_estimado_usd numeric) to authenticated;

revoke all on function public.guardar_permisos_usuario(p_usuario uuid, p_permisos jsonb) from public, anon, authenticated;
grant execute on function public.guardar_permisos_usuario(p_usuario uuid, p_permisos jsonb) to authenticated;

revoke all on function public.limpiar_valores_personalizados_entidad() from public, anon, authenticated;
grant execute on function public.limpiar_valores_personalizados_entidad() to public;

revoke all on function public.limpiar_valores_personalizados_proceso() from public, anon, authenticated;
grant execute on function public.limpiar_valores_personalizados_proceso() to public;

revoke all on function public.mi_rol() from public, anon, authenticated;
grant execute on function public.mi_rol() to authenticated;

revoke all on function public.nivel_area(p_area text) from public, anon, authenticated;
grant execute on function public.nivel_area(p_area text) to authenticated;

revoke all on function public.ordenar_tipos_propietario(p_ids uuid[]) from public, anon, authenticated;
grant execute on function public.ordenar_tipos_propietario(p_ids uuid[]) to authenticated;

revoke all on function public.papelera_eliminar(p_tabla text, p_id uuid) from public, anon, authenticated;
grant execute on function public.papelera_eliminar(p_tabla text, p_id uuid) to authenticated;

revoke all on function public.papelera_listar() from public, anon, authenticated;
grant execute on function public.papelera_listar() to authenticated;

revoke all on function public.papelera_permitido() from public, anon, authenticated;
grant execute on function public.papelera_permitido() to authenticated;

revoke all on function public.papelera_purgar(p_tabla text, p_id uuid) from public, anon, authenticated;
grant execute on function public.papelera_purgar(p_tabla text, p_id uuid) to authenticated;

revoke all on function public.papelera_purgar_vencidos(p_dias integer) from public, anon, authenticated;
grant execute on function public.papelera_purgar_vencidos(p_dias integer) to authenticated;

revoke all on function public.papelera_restaurar(p_tabla text, p_id uuid) from public, anon, authenticated;
grant execute on function public.papelera_restaurar(p_tabla text, p_id uuid) to authenticated;

revoke all on function public.papelera_tablas() from public, anon, authenticated;
grant execute on function public.papelera_tablas() to public;

revoke all on function public.puede_escribir() from public, anon, authenticated;
grant execute on function public.puede_escribir() to authenticated;

revoke all on function public.puede_leer_todo() from public, anon, authenticated;
grant execute on function public.puede_leer_todo() to authenticated;

revoke all on function public.r2_claves_liberables(p_claves text[]) from public, anon, authenticated;
grant execute on function public.r2_claves_liberables(p_claves text[]) to authenticated;

revoke all on function public.registrar_cambio_campo(p_tabla text, p_registro uuid, p_campo text, p_ant text, p_nue text, p_actor uuid, p_nombre text, p_correo text, p_ventana interval) from public, anon, authenticated;

revoke all on function public.registrar_historial() from public, anon, authenticated;
grant execute on function public.registrar_historial() to public;

revoke all on function public.registrar_uso_lector_ia(p_tipo text, p_proveedor text, p_modelo text, p_documentos integer, p_paginas integer, p_consultas integer, p_costo_estimado_usd numeric) from public, anon, authenticated;
grant execute on function public.registrar_uso_lector_ia(p_tipo text, p_proveedor text, p_modelo text, p_documentos integer, p_paginas integer, p_consultas integer, p_costo_estimado_usd numeric) to authenticated;

revoke all on function public.renombrar_estado_proceso(p_id uuid, p_valor text) from public, anon, authenticated;
grant execute on function public.renombrar_estado_proceso(p_id uuid, p_valor text) to authenticated;

revoke all on function public.renombrar_opcion_propiedad(p_id uuid, p_anterior text, p_nuevo text) from public, anon, authenticated;
grant execute on function public.renombrar_opcion_propiedad(p_id uuid, p_anterior text, p_nuevo text) to authenticated;

revoke all on function public.renombrar_tipo_propietario(p_id uuid, p_nombre text) from public, anon, authenticated;
grant execute on function public.renombrar_tipo_propietario(p_id uuid, p_nombre text) to authenticated;

revoke all on function public.reservar_uso_lector_ia(p_tipo text, p_proveedor text, p_modelo text, p_documentos integer, p_paginas integer, p_consultas integer, p_busquedas integer, p_costo_estimado_usd numeric) from public, anon, authenticated;
grant execute on function public.reservar_uso_lector_ia(p_tipo text, p_proveedor text, p_modelo text, p_documentos integer, p_paginas integer, p_consultas integer, p_busquedas integer, p_costo_estimado_usd numeric) to authenticated;

revoke all on function public.revelar_clave_correo(p_id uuid) from public, anon, authenticated;
grant execute on function public.revelar_clave_correo(p_id uuid) to authenticated;

revoke all on function public.revelar_clave_entidad(p_id uuid) from public, anon, authenticated;
grant execute on function public.revelar_clave_entidad(p_id uuid) to authenticated;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to public;

revoke all on function public.set_actualizado_en() from public, anon, authenticated;
grant execute on function public.set_actualizado_en() to public;

revoke all on function public.tipos_propietario_orden_al_final() from public, anon, authenticated;
grant execute on function public.tipos_propietario_orden_al_final() to public;

revoke all on function public.unir_opcion_propiedad(p_id uuid, p_origen text, p_destino text) from public, anon, authenticated;
grant execute on function public.unir_opcion_propiedad(p_id uuid, p_origen text, p_destino text) to authenticated;

revoke all on function public.verificar_credenciales() from public, anon, authenticated;
grant execute on function public.verificar_credenciales() to authenticated;

select cron.schedule('papelera-purgar-vencidos', '30 3 * * *', ' select papelera_purgar_vencidos(30) ');
