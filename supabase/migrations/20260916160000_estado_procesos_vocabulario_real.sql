-- ESTADO de procesos: vocabulario real por materia + campo `descripcion`.
--
-- `procesos.estado` es text libre y la UI ofrecía un desplegable de 5 opciones
-- ("En trámite/Pendiente/Suspendido/Concluido/Archivado") que nunca existió en
-- los datos migrados desde Notion. En el origen "ESTADO" significaba dos cosas:
--
--   * Civil/Penal/Contencioso/Constitucional -> etiqueta corta de etapa procesal
--     (ADMISORIA, ARCHIVADO, SENTENCIA 1° INSTANCIA...). Estas materias tenían
--     ADEMÁS una columna `Etapa` con la bitácora larga.
--   * Administrativo -> Admin.csv no tenía columna `Etapa`, así que la bitácora
--     libre cayó dentro de ESTADO (53 valores distintos, casi todos únicos).
--   * Carpeta Fiscal/Laboral/Conciliación/SUNAFIL -> no tenían columna Estado.
--
-- Esta migración deja `estado` con el vocabulario corto real solo donde existe,
-- y consolida toda la bitácora en `descripcion`.
--
-- Se usa `rename` en vez de drop+add: el trigger de historial es genérico
-- (to_jsonb(old), ver 20260831000000_historial.sql) y el único índice sobre
-- procesos es (materia, expediente), así que el rename no rompe nada.

-- 0) Restaurar los estados que el desplegable inventado pisó sin aviso.
--    El valor original quedó guardado en historial.valor_anterior.
update procesos p
set estado = h.valor_anterior
from (
  select distinct on (registro_id) registro_id, valor_anterior
  from historial
  where tabla = 'procesos'
    and campo = 'estado'
    and valor_anterior is not null
  order by registro_id, creado_en asc   -- el más antiguo = el valor de Notion
) h
where p.id = h.registro_id;

-- 1) `etapa` pasa a llamarse `descripcion`: ya contiene la bitácora larga de
--    civil/penal/contencioso/constitucional.
alter table procesos rename column etapa to descripcion;

update historial
set campo = 'descripcion'
where tabla = 'procesos'
  and campo = 'etapa';

-- 2) Borrar el vocabulario inventado allí donde alcanzó a escribirse desde la
--    app. Va DESPUÉS del paso 0 (para no borrar lo que acabamos de restaurar) y
--    ANTES del paso 3 (para que no se guarde como descripción).
update procesos
set estado = null
where estado in ('En trámite', 'Pendiente', 'Suspendido', 'Concluido', 'Archivado');

-- 3) Materias sin vocabulario de estado: lo que hay en `estado` es bitácora, se
--    consolida en `descripcion` y `estado` queda vacío. El `case` cubre la única
--    fila de administrativo que tiene los dos campos ocupados.
update procesos
set descripcion = case
      when coalesce(descripcion, '') = '' then estado
      else descripcion || E'\n' || estado
    end,
    estado = null
where materia in ('administrativo', 'carpeta_fiscal', 'laboral',
                  'conciliacion', 'sunafil', 'direccion_trabajo')
  and estado is not null;

-- 4) Única variante tipográfica dentro del vocabulario que se conserva.
update procesos
set estado = 'SENTENCIA 1° INSTANCIA'
where estado = 'SENTENCIA 1 INSTANCIA';
