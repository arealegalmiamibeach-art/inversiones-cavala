-- ============================================================
-- ARCHIVOS — resucitar un adjunto que quedó en la papelera
-- ============================================================
-- El índice único `archivos_objeto_dueno (r2_key, entidad_id)` también
-- cuenta las filas eliminadas, pero la política restrictiva
-- "ocultar_eliminados" las esconde de toda sesión de usuario. Resultado:
-- volver a subir a una ficha un archivo que antes se mandó a la papelera
-- choca contra una fila que el cliente no puede ver ni reutilizar, y la
-- subida moría con "No se pudo registrar el archivo" sin explicación.
--
-- Esta función es el único camino para recuperarla: `security definer`
-- para ver lo que RLS esconde, con el mismo gate de escritura que usa la
-- política de `archivos` (`acceso_fila`), y acotada a la entidad y clave
-- R2 que el llamante ya demostró poder subir.

create or replace function public.archivo_revivir(
  p_entidad_tipo text,
  p_entidad_id   uuid,
  p_r2_key       text,
  p_nombre       text,
  p_carpeta      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.archivo_revivir(text, uuid, text, text, text) from public, anon;
grant execute on function public.archivo_revivir(text, uuid, text, text, text) to authenticated, service_role;
