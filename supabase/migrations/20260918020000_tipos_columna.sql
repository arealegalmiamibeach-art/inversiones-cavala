-- ============================================================
-- TIPO REAL DE LAS COLUMNAS NATIVAS CONVERTIBLES (Texto ↔ Selección)
-- ============================================================
-- Cambiar el tipo de una columna nativa desde "Editar propiedad" sólo tocaba
-- la vista del navegador (localStorage): la celda seguía pintándose como
-- texto porque su render es fijo en código. Pasó con `contratos.legalizado`:
-- se elegía "Selección" y nada cambiaba.
--
-- Ahora, como en Notion, el tipo es de la propiedad y no de la vista: vive
-- acá y lo leen la tabla, la ficha lateral y la página del registro. El dato
-- guardado en la fila sigue siendo texto en los dos tipos, así que convertir
-- nunca reescribe registros:
--   - Texto → Selección: cada valor distinto que ya existe se siembra como
--     opción en `opciones_columna` (fechas y notas incluidas), así ningún
--     registro queda "fuera de lista" ni a un clic de perder su texto.
--   - Selección → Texto: cada celda muestra el mismo texto que tenía su
--     opción. El catálogo se conserva para volver a Selección sin perder
--     colores ni nombres.
--
-- Sin fila acá, la columna usa el tipo que trae el código. La lista blanca
-- tiene que coincidir con COLUMNAS_CONVERTIBLES en src/lib/tipos-columna.ts.

create table if not exists tipos_columna (
  tabla           text not null,
  campo           text not null,
  tipo            text not null check (tipo in ('texto', 'seleccion')),
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en  timestamptz not null default now(),
  primary key (tabla, campo),
  constraint tipos_columna_permitidas check ((tabla || '.' || campo) in (
    'contratos.legalizado'
  ))
);

alter table tipos_columna enable row level security;

drop policy if exists "tipos_columna_lectura" on tipos_columna;
create policy "tipos_columna_lectura" on tipos_columna
  for select to authenticated using (true);

drop policy if exists "tipos_columna_escritura" on tipos_columna;
create policy "tipos_columna_escritura" on tipos_columna
  for all to authenticated using (puede_escribir()) with check (puede_escribir());

revoke all on tipos_columna from anon;
grant select, insert, update, delete on tipos_columna to authenticated;

-- `contratos.legalizado` vuelve al catálogo editable: 20260918010000 la sacó
-- porque un desplegable de Sí/No dejaba las fechas y notas "fuera de lista".
-- Con la conversión de arriba esos textos pasan a ser opciones, así que el
-- motivo desaparece.
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
