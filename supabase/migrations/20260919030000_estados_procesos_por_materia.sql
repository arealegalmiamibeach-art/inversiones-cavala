-- ============================================================
-- ESTADOS DE PROCESOS: UN CONJUNTO PROPIO POR MATERIA
-- ============================================================
-- El catálogo nació con `valor` único en toda la tabla y los 12 estados sin
-- materia ("generales"), así que todas las materias compartían la misma
-- lista y ninguna tenía la suya. Cada materia debe poder tener sus propios
-- estados (y el mismo nombre, p. ej. ARCHIVADO, puede existir en varias).
--
-- 1. La unicidad pasa de `valor` a (materia, valor).
-- 2. Cada estado general se copia a las 10 materias, con el mismo texto,
--    color y orden, y luego el general se elimina. `procesos.estado` es
--    texto libre: ningún proceso pierde su estado.
-- Idempotente: si no quedan generales, no hace nada.

alter table estados_procesos drop constraint if exists estados_procesos_valor_key;

create unique index if not exists estados_procesos_materia_valor
  on estados_procesos (coalesce(materia, ''), lower(btrim(valor)));

with generales as (
  select
    valor, clase_color, color_punto,
    row_number() over (
      order by
        coalesce(array_position(array[
          'ADMISORIA', 'FORMALIZADA', 'SANEAMIENTO', 'ALEGATOS APERTURA',
          'ACTUACIÓN PROBATORIA', 'AUD. UNICA', 'AUD.PRUEBAS',
          'SENTENCIA 1° INSTANCIA', 'SENTENCIA 2° INSTANCIA', 'IMPUGNACIÓN',
          'CASACION', 'ARCHIVADO'
        ], valor), 999),
        creado_en, valor
    ) as posicion
  from estados_procesos
  where materia is null
)
insert into estados_procesos (valor, clase_color, color_punto, materia, creado_en)
select
  g.valor, g.clase_color, g.color_punto, m.materia,
  now() + g.posicion * interval '1 millisecond'
from generales g
cross join (values
  ('administrativo'), ('civil'), ('penal'), ('carpeta_fiscal'),
  ('contencioso_administrativo'), ('laboral'), ('sunafil'),
  ('conciliacion'), ('constitucional'), ('direccion_trabajo')
) as m(materia)
on conflict do nothing;

delete from estados_procesos where materia is null;
