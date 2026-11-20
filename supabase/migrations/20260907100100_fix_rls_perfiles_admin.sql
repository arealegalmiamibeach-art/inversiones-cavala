-- Fix: la política admin_gestionar_perfiles usaba una subconsulta sobre
-- perfiles en sí misma, causando "infinite recursion detected in policy".
-- Solución: usar una función SECURITY DEFINER que bypasea RLS.

-- 1) Eliminar la política recursiva
DROP POLICY IF EXISTS admin_gestionar_perfiles ON perfiles;

-- 2) Función SECURITY DEFINER para verificar si el usuario actual es admin
--    (corre con permisos del owner, sin row security → sin recursión).
CREATE OR REPLACE FUNCTION es_admin_actual()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM perfiles
    WHERE id      = auth.uid()
      AND activo  = true
      AND rol     = 'administrador'
  );
$$;

-- 3) Nueva política sin recursión: los admins pueden leer y modificar todos los perfiles
CREATE POLICY admin_gestionar_perfiles
  ON perfiles
  FOR ALL
  USING     (es_admin_actual())
  WITH CHECK (es_admin_actual());
