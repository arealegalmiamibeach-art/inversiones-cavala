-- ============================================================
-- Habilita el catálogo editable de opciones para procesos.materia
-- ============================================================
-- 20260917140000_opciones_columna.sql dejó `procesos.materia` fuera a
-- propósito porque su `valor` define rutas (/procesos/materia/[materia]) e
-- iconos/colores (MATERIAS_CATALOGO en src/lib/procesos/materias.ts).
--
-- Se habilita igual porque el vocabulario del código ya siembra `valor`
-- (la clave, p. ej. "penal") distinto de `etiqueta` ("Penal") — ver
-- MATERIA_OPCIONES en procesos/opciones.ts. `renombrarOpcionColumna` sólo
-- reescribe `valor` (y por lo tanto los registros) cuando coincide con
-- `etiqueta`, así que desde la UI sólo se puede renombrar la etiqueta que se
-- muestra: la clave que usan las rutas y el ícono/color nunca cambian.

alter table opciones_columna drop constraint opciones_columna_permitidas;

alter table opciones_columna add constraint opciones_columna_permitidas check ((tabla || '.' || campo) in (
  'contratos.estado',
  'concesiones_mineras.estado',
  'personal.firmado',
  'predios.a_nombre_de',
  'vehiculos.categoria',
  'vehiculos.responsable',
  'procesos.materia'
));
