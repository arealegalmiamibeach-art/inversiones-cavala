-- Renombrar una categoría de documentos desde la ficha. La política
-- `acceso_edicion` ya limita quién puede; faltaba el privilegio de tabla.
-- Sólo `nombre`: el slug es lo que guardan los documentos en `tipo`.
grant update (nombre) on table public.tipos_documento_custom to authenticated;
