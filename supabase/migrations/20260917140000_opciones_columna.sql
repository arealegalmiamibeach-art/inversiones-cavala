-- ============================================================
-- CATÁLOGO EDITABLE DE OPCIONES POR COLUMNA NATIVA
-- ============================================================
-- Generaliza lo que 20260917120000_estados_procesos_catalogo.sql hizo con
-- `procesos.estado`: las columnas de tipo Selección que la base NO valida
-- (texto libre que venía de Notion) tenían su vocabulario hardcodeado en los
-- `opciones.ts` de cada módulo, así que agregar o renombrar un valor exigía
-- tocar código y redesplegar. Ahora ese vocabulario vive acá y se edita desde
-- el panel "Editar propiedad" de la columna.
--
-- Deliberadamente NO entran las columnas cuyo valor está validado por un check
-- (concesiones_mineras.sustancia), define rutas o etiquetas de código
-- (contratos.tipo, procesos.materia, documentos.tipo — ese tiene su propia
-- tabla tipos_documento_custom) ni los booleanos Sí/No: cambiarlas desde la UI
-- rompería la base o el mapeo valor→etiqueta. El check de abajo es la lista
-- blanca y tiene que coincidir con CATALOGOS_COLUMNA en src/lib/opciones-columna.ts.
--
-- `valor` es el texto exacto guardado en la fila; `etiqueta` es lo que se
-- muestra. Se separan porque la migración de Notion dejó valores como
-- "en Tramite" o "Ambas firmas completas" que se muestran como "En trámite" o
-- "Firmado": renombrar la etiqueta no debe tocar los registros.

create table if not exists opciones_columna (
  id          uuid primary key default gen_random_uuid(),
  tabla       text not null,
  campo       text not null,
  valor       text not null check (char_length(btrim(valor)) between 1 and 80),
  etiqueta    text not null check (char_length(btrim(etiqueta)) between 1 and 80),
  clase_color text not null,
  orden       int not null default 0,
  creado_por  uuid references auth.users(id) on delete set null,
  creado_en   timestamptz not null default now(),
  unique (tabla, campo, valor),
  constraint opciones_columna_permitidas check ((tabla || '.' || campo) in (
    'contratos.estado',
    'concesiones_mineras.estado',
    'personal.firmado',
    'predios.a_nombre_de',
    'vehiculos.categoria',
    'vehiculos.responsable'
  ))
);

create index if not exists opciones_columna_orden on opciones_columna (tabla, campo, orden, creado_en);

alter table opciones_columna enable row level security;

drop policy if exists "opciones_columna_lectura" on opciones_columna;
create policy "opciones_columna_lectura" on opciones_columna
  for select to authenticated using (true);

drop policy if exists "opciones_columna_escritura" on opciones_columna;
create policy "opciones_columna_escritura" on opciones_columna
  for all to authenticated using (puede_escribir()) with check (puede_escribir());

revoke all on opciones_columna from anon;
grant select, insert, update, delete on opciones_columna to authenticated;

-- Sin semilla: mientras una columna no tenga filas acá, la vista sigue usando
-- las opciones del código. La primera edición desde la UI las siembra con el
-- mismo texto, así que nada cambia hasta que alguien decida cambiarlo.
