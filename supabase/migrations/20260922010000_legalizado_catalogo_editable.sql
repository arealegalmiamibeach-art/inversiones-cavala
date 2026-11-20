-- ============================================================
-- LEGALIZADO: SELECCIÓN CON CATÁLOGO EDITABLE
-- ============================================================
-- La separación de Firma legalizada dejó correctamente sólo SI/NO/Notaria,
-- pero cerró el vocabulario con un CHECK. Legalizado es una Selección de
-- Notion: el tipo sigue siendo estructural, mientras sus opciones se pueden
-- crear, renombrar, eliminar y reordenar desde la tabla.

begin;

alter table public.contratos
  drop constraint if exists contratos_legalizado_vocabulario;

alter table public.opciones_columna
  drop constraint if exists opciones_columna_permitidas;

alter table public.opciones_columna
  add constraint opciones_columna_permitidas check ((tabla || '.' || campo) in (
    'contratos.estado',
    'concesiones_mineras.estado',
    'concesiones_mineras.sustancia',
    'personal.firmado',
    'personal.modalidad',
    'predios.a_nombre_de',
    'predios.tipo_predio',
    'propietarios.tipo_persona',
    'vehiculos.categoria',
    'vehiculos.responsable',
    'procesos.materia',
    'contratos.tipo',
    'contratos.moneda',
    'contratos.legalizado'
  ));

insert into public.opciones_columna
  (tabla, campo, valor, etiqueta, clase_color, orden)
values
  ('contratos', 'legalizado', 'SI', 'SI', 'bg-emerald-500/15 text-emerald-200', 0),
  ('contratos', 'legalizado', 'NO', 'NO', 'bg-white/[0.08] text-white/65', 1),
  ('contratos', 'legalizado', 'Notaria', 'Notaria', 'bg-amber-500/15 text-amber-200', 2)
on conflict (tabla, campo, valor) do nothing;

commit;
