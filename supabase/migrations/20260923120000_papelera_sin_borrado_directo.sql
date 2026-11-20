-- ============================================================
-- PAPELERA: SIN BORRADO DEFINITIVO DIRECTO
-- ============================================================
-- La migración 20260910010000 creó una política `acceso_baja` (DELETE) en
-- todas las tablas de negocio. En las 11 tablas con papelera eso dejaba a
-- cualquier usuario con "administrar" en el área borrar filas para siempre
-- llamando directamente a la API REST de Supabase: sin pasar por la
-- papelera, sin poder restaurarlas y dejando archivos y vínculos colgando.
--
-- La app nunca borra así: la baja va por `papelera_eliminar` y el borrado
-- definitivo por `papelera_purgar` (sólo administradores), ambos security
-- definer, que no dependen de estas políticas. Sin política de DELETE, RLS
-- niega por defecto y un DELETE directo no afecta ninguna fila.
--
-- Las demás tablas (vínculos, catálogos, valores de propiedades...) conservan
-- su `acceso_baja`: no tienen papelera y la app sí las borra directamente.

do $$
declare t text;
begin
  for t in select tabla from public.papelera_tablas() loop
    execute format('drop policy if exists acceso_baja on public.%I', t);
  end loop;
end;
$$;
