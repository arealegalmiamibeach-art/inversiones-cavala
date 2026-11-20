# Auditoría de tablas, fichas y paneles — 22/09/2026

## Alcance

Revisión del código compartido de tablas y editores, documentos (incluidas copias literales), contratos, procesos (incluido SUNAFIL) y entidades: propietarios, predios, vehículos, concesiones, personal y oficinas registrales. Correcciones locales, sin despliegue ni migración de datos existentes.

## Hallazgos y correcciones

| Hallazgo | Corrección |
| --- | --- |
| «Relacionado con» mezclaba distintos tipos de relación en documentos. | Se elimina la columna agregada y se muestran columnas independientes por tipo de entidad. Se leen los vínculos existentes en ambos sentidos; no hace falta volver a introducirlos. |
| Relaciones ocultas por defecto, contadores en lugar de nombres o celdas sin editor. | Columnas de relaciones visibles y editables mediante selección de registros existentes. Las preferencias antiguas se actualizan una vez para revelar estas columnas. Se mantienen las restricciones de permisos. |
| Roles contractuales mezclados y preferencias compartidas entre familias de contratos. | Acreedor, deudor y demás roles existentes tienen columnas independientes, también en ficha y panel. Las preferencias de tabla se separan por tipo de contrato. Quitar un rol conserva los demás del mismo par. |
| Copias literales y SUNAFIL mantenían implementaciones antiguas. | Se reutilizan las tablas actuales de documentos y procesos para evitar divergencias de campos y edición. |
| Próxima diligencia aparecía como texto calculado sin edición directa. | Selector de fecha en tabla, ficha y panel. Modifica el evento pendiente correspondiente o crea un evento cuando sólo existía texto legado. Prioriza los eventos registrados también en resúmenes y reporte. |
| Campos bloqueados u omitidos. | Se habilitan DNI y remuneración de personal con autorización y validación; se añade nombre a la ficha de propietario; se conservan partes procesales con datos fuera del conjunto habitual de su materia. |
| Propiedades contractuales desaparecían al vaciarlas. | Se conserva el campo vacío y se excluyen metadatos internos de importación. |
| Formatear fechas o números desactivaba la edición en la tabla. | Se conserva el editor y sólo se formatea su presentación de lectura. |
| Paneles abiertos podían conservar datos anteriores. | Los editores notifican los cambios y los paneles recargan sus datos; se revalidan las rutas afectadas. |
| Listas de opciones y eventos podían truncarse en lotes grandes. | Carga paginada de opciones y eventos, con deduplicación de vínculos recíprocos. |

## Verificación

- `npm run lint`, `npm run typecheck` y compilación de producción.
- `npm run test`: batería del lector y del núcleo.
- Núcleo: 144 pruebas aprobadas, incluidas regresiones de relaciones, roles, propiedades vacías, fechas registradas y carga de más de 1.000 eventos.
- Navegador real sobre servidor local y registros temporales: edición y persistencia de documento desde tabla y panel, lectura en ficha y copias literales; edición de monto y fecha contractual con formato personalizado; creación de acreedor/deudor y eliminación de un único rol; fecha de diligencia persistida tras recargar; edición de remuneración en ficha.
- Recorrido de las tablas de las seis familias de entidades y SUNAFIL para comprobar carga y errores de JavaScript.
- Script reproducible: `scripts/verificar-tablas-ui.mjs`. Requiere Playwright, Chrome, credenciales de prueba y servidor local; crea una cuenta y registros propios y los limpia al terminar. No debe ejecutarse contra una URL de producción.

## Límites y comportamiento esperado

- Los indicadores calculados (vigencia, contadores, urgencia) se actualizan a partir de sus datos de origen; no son campos independientes editables.
- Se respetan los permisos de escritura de cada módulo y de ambos extremos de una relación. Un vínculo a un registro no visible para el usuario no revela su nombre.
- La fecha de un evento no se deja vacía: para retirarlo de pendientes se cancela desde «Diligencias y audiencias».
- La revisión combina análisis del código, pruebas automáticas y recorridos representativos de navegador. No equivale a probar manualmente cada celda histórica con cada rol de usuario.
- No se ha desplegado esta versión. Los cambios sólo estarán disponibles en producción después del despliegue.
