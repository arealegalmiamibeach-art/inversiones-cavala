-- ============================================================
-- Habilita el catálogo editable de opciones para contratos.tipo, .moneda y
-- .legalizado
-- ============================================================
-- 20260917140000_opciones_columna.sql dejó `contratos.tipo` fuera a
-- propósito porque su valor define rutas (/contratos/tipo/[tipo]), el
-- ícono y la descripción de cada tarjeta del índice, y el alcance de
-- Tesorería (TIPOS_CONTRATO_TESORERIA en src/lib/auth/roles.ts, que compara
-- por el valor exacto). `contratos.moneda` y `contratos.legalizado` se
-- habían quedado fuera con el resto sin ninguna razón técnica propia.
--
-- `tipo` se habilita con el mismo argumento que 20260917150000 usó para
-- procesos.materia: el código ya siembra `valor` (la clave, p. ej. "mutuo")
-- distinto de `etiqueta` ("Mutuo") — ver TIPO_OPCIONES en
-- contratos/opciones.ts. `renombrarOpcionColumna` sólo reescribe `valor`
-- (y por lo tanto los registros, y con ellos TIPOS_CONTRATO_TESORERIA)
-- cuando coincide con `etiqueta`, así que renombrar desde la UI sólo cambia
-- la etiqueta que se ve: la clave que usan la ruta, el ícono y el alcance de
-- Tesorería nunca se tocan. Agregar una familia nueva sí funciona (el índice
-- le hace tarjeta con ícono genérico); no le aparece a Tesorería hasta que
-- alguien la agregue a TIPOS_CONTRATO_TESORERIA a propósito — es el default
-- seguro, no un hueco de acceso.

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
  'contratos.moneda',
  'contratos.legalizado'
));
