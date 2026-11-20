-- Estado de procesos: una sola lista para todas las materias.
--
-- La migración 20260916160000 dejó el vocabulario real de cada materia, pero al
-- mostrarlo el desplegable cambiaba de opciones según la fila (8 en civil, 4 en
-- penal, 3 en contencioso), lo que confunde en la vista "Todos los procesos".
-- Se unifica en una sola lista; `ARCHIVO` y `ARCHIVADO` eran el mismo estado
-- escrito distinto en dos tablas de Notion, así que se funden en `ARCHIVADO`.

update procesos
set estado = 'ARCHIVADO'
where estado = 'ARCHIVO';
