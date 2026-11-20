-- ============================================================
-- PERFIL: CADA USUARIO PUEDE CAMBIAR SU PROPIO NOMBRE
-- ============================================================
-- En `perfiles` sólo un administrador tiene política de escritura, y así debe
-- seguir: una política de UPDATE sobre la fila propia dejaría a cualquiera
-- cambiarse el `rol` o reactivarse (RLS no limita columnas). Por eso "Mi
-- perfil → Nombre" afectaba 0 filas para Tesorería y Soporte Documentario,
-- sin error, y la pantalla decía "Nombre actualizado".
--
-- Este RPC escribe únicamente `nombre`, y sólo en la fila de quien llama.

create or replace function public.actualizar_nombre_propio(p_nombre text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.actualizar_nombre_propio(text) from public, anon;
grant execute on function public.actualizar_nombre_propio(text) to authenticated;

notify pgrst, 'reload schema';
