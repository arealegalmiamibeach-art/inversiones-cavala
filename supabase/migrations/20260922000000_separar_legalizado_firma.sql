-- ============================================================
-- CONTRATOS: SEPARAR LEGALIZADO DE FIRMA/FECHA DE LEGALIZACIÓN
-- ============================================================
-- En la importación se eligió el primer valor no vacío entre dos propiedades
-- distintas de Notion:
--   · Legalizado / Legalizacion / LEGALIZACIÓN: selección SI/NO/Notaria.
--   · Firma legalizada (mutuos) y Fecha de legalizacion (servicios): texto
--     libre que contiene fechas y notas.
-- Eso convirtió cada fecha en una opción de Legalizado. Se recupera el texto
-- dentro de `extra`, donde la UI ya muestra y edita las propiedades importadas,
-- y se deja la columna nativa con su vocabulario cerrado original.

begin;

-- Primero preservar el texto que hoy está en la columna equivocada. Los
-- valores cortos del selector no se copian como si fueran una fecha/firma.
update public.contratos
set extra = jsonb_set(
  coalesce(extra, '{}'::jsonb),
  '{Firma legalizada}',
  to_jsonb(legalizado),
  true
)
where tipo = 'mutuo'
  and nullif(btrim(legalizado), '') is not null
  and lower(btrim(legalizado)) not in (
    'si', 'sí', 'no', 'en notaria', 'en notaría', 'notaria', 'notaría'
  )
  and nullif(btrim(extra->>'Firma legalizada'), '') is null;

update public.contratos
set extra = jsonb_set(
  coalesce(extra, '{}'::jsonb),
  '{Fecha de legalizacion}',
  to_jsonb(legalizado),
  true
)
where tipo = 'servicios'
  and nullif(btrim(legalizado), '') is not null
  and lower(btrim(legalizado)) not in (
    'si', 'sí', 'no', 'en notaria', 'en notaría', 'notaria', 'notaría'
  )
  and nullif(btrim(extra->>'Fecha de legalizacion'), '') is null;

-- Recuperar la selección que quedó resguardada en `extra`. En filas donde el
-- texto de firma/fecha estaba vacío, el importador dejó directamente el valor
-- del selector en `legalizado`, por eso también se acepta como último origen.
with normalizados as (
  select id, case lower(btrim(coalesce(
    nullif(extra->>'Legalizacion', ''),
    nullif(extra->>'LEGALIZACIÓN', ''),
    case
      when lower(btrim(coalesce(legalizado, ''))) in (
        'si', 'sí', 'no', 'en notaria', 'en notaría', 'notaria', 'notaría'
      ) then legalizado
      else null
    end
  )))
    when 'si' then 'SI'
    when 'sí' then 'SI'
    when 'no' then 'NO'
    when 'en notaria' then 'Notaria'
    when 'en notaría' then 'Notaria'
    when 'notaria' then 'Notaria'
    when 'notaría' then 'Notaria'
    else null
  end as valor
  from public.contratos
)
update public.contratos as contratos
set legalizado = normalizados.valor
from normalizados
where contratos.id = normalizados.id
  and contratos.legalizado is distinct from normalizados.valor;

-- El catálogo anterior se había poblado con las fechas que estaban mezcladas.
delete from public.opciones_columna
where tabla = 'contratos' and campo = 'legalizado';

-- Legalizado vuelve a ser una selección estructural fija, no una propiedad
-- convertible entre Texto y Selección.
delete from public.tipos_columna
where tabla = 'contratos' and campo = 'legalizado';

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
    'contratos.moneda'
  ));

alter table public.tipos_columna
  drop constraint if exists tipos_columna_permitidas;

-- La infraestructura queda disponible para futuras columnas convertibles,
-- pero hoy no hay ninguna autorizada.
alter table public.tipos_columna
  add constraint tipos_columna_permitidas check (false);

alter table public.contratos
  drop constraint if exists contratos_legalizado_vocabulario;

alter table public.contratos
  add constraint contratos_legalizado_vocabulario
  check (legalizado is null or legalizado in ('SI', 'NO', 'Notaria'));

commit;
