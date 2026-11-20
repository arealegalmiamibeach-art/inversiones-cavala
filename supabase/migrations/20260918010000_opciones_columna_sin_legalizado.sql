-- ============================================================
-- Saca contratos.legalizado del catálogo editable de opciones
-- ============================================================
-- 20260918000000_opciones_columna_contratos.sql la habilitó junto con tipo
-- y moneda asumiendo que era un Sí/No real. La migración de Notion trajo ahí
-- texto libre (fechas, notas de presentación como "LCV-15 ABRIL 2026…"), así
-- que el desplegable forzaba ese texto "fuera de lista", a un clic de que
-- "Sí"/"No" lo reemplazara sin dejar forma de recuperarlo desde la UI. Vuelve
-- a ser texto libre, sin catálogo — como ya lo era antes de esa migración.
--
-- No hace falta limpiar filas: nadie llegó a usar el editor para esta
-- columna (la tabla no tiene ninguna fila `tabla='contratos', campo='legalizado'`).

alter table opciones_columna drop constraint opciones_columna_permitidas;

alter table opciones_columna add constraint opciones_columna_permitidas check ((tabla || '.' || campo) in (
  'contratos.estado',
  'concesiones_mineras.estado',
  'personal.firmado',
  'predios.a_nombre_de',
  'vehiculos.categoria',
  'vehiculos.responsable',
  'procesos.materia',
  'contratos.tipo',
  'contratos.moneda'
));
