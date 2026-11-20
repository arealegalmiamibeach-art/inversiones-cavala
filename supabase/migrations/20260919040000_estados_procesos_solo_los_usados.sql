-- ============================================================
-- ESTADOS DE PROCESOS: CADA MATERIA CONSERVA LOS SUYOS
-- ============================================================
-- 20260919030000 copió los 12 estados semilla a las 10 materias. Los procesos
-- importados de Notion sólo usan unos pocos por materia (Civil 8, Penal 4,
-- Administrativo 2, ...), así que la lista de cada materia debe ser la de los
-- estados que sus procesos realmente tienen, no los 12 de todas.
--
-- Se borran únicamente las copias semilla que ningún proceso de esa materia
-- usa. No se toca ningún estado creado a mano (fuera de los 12 semilla) ni
-- `procesos.estado`.

delete from estados_procesos e
where e.materia is not null
  and e.valor in (
    'ADMISORIA', 'FORMALIZADA', 'SANEAMIENTO', 'ALEGATOS APERTURA',
    'ACTUACIÓN PROBATORIA', 'AUD. UNICA', 'AUD.PRUEBAS',
    'SENTENCIA 1° INSTANCIA', 'SENTENCIA 2° INSTANCIA', 'IMPUGNACIÓN',
    'CASACION', 'ARCHIVADO'
  )
  and not exists (
    select 1 from procesos p
    where p.materia::text = e.materia
      and lower(btrim(p.estado)) = lower(btrim(e.valor))
  );
