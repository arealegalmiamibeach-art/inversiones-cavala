-- ============================================================
-- PAPELERA: NO BORRAR DE R2 UN OBJETO QUE VOLVIÓ A USARSE
-- ============================================================
-- La clave de R2 es el sha256 del contenido. `papelera_purgar` encola en
-- `r2_huerfanos` la clave que ya ninguna fila usa, y la app borra el objeto
-- más tarde (al abrir la papelera). Si entretanto alguien sube otra vez el
-- mismo archivo, se crea una fila nueva con esa misma clave; borrar el objeto
-- a ciegas la dejaba apuntando a un archivo inexistente.
--
-- Antes de borrar, la app pregunta aquí qué claves siguen libres. Es security
-- definer porque tiene que ver también las filas que están en la papelera
-- (la política restrictiva `ocultar_eliminados` las esconde): un archivo en la
-- papelera todavía se puede restaurar y su objeto no se puede borrar.
--
-- Las claves que volvieron a usarse salen de la cola sin tocar el objeto; si
-- sus filas vuelven a purgarse, `papelera_purgar` las encola de nuevo.

create or replace function public.r2_claves_liberables(p_claves text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.r2_claves_liberables(text[]) from public, anon;
grant execute on function public.r2_claves_liberables(text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
