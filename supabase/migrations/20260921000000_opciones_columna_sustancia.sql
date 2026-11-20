-- ============================================================
-- SUSTANCIA DE CONCESIONES: CATÁLOGO EDITABLE DE OPCIONES
-- ============================================================
-- `concesiones_mineras.sustancia` quedó fuera del catálogo `opciones_columna`
-- porque la base la validaba con un check `metal | no_metal`. En "Editar
-- propiedad" salía como "Fijas por el esquema de la tabla" y no se podían
-- añadir, renombrar, reordenar ni eliminar opciones, a diferencia del resto de
-- propiedades de Selección.
--
-- 1) Se suelta ese check. No se adivina su nombre: se buscan los CHECK de la
--    tabla cuya definición mencione `sustancia`. Sin filas afectadas: los
--    valores existentes ('metal', 'no_metal') siguen siendo válidos y ahora
--    pueden convivir con los que se agreguen desde la UI.
-- 2) Se agrega `concesiones_mineras.sustancia` a la lista blanca del catálogo.
--    La lista es la vigente completa (la última la dejó
--    20260918020000_tipos_columna.sql, con `contratos.legalizado`) y tiene que
--    coincidir con CATALOGOS_COLUMNA en src/lib/opciones-columna.ts.
--
-- Idempotente y sin tocar datos. Sin semilla: mientras la columna no tenga
-- filas en `opciones_columna` la vista sigue usando las opciones del código
-- (Metal / No metal); la primera edición desde la UI las siembra con
-- valor ('metal', 'no_metal') distinto de la etiqueta ('Metal', 'No metal'),
-- así que renombrarlas sólo cambia lo que se muestra, no los registros.

do $$
declare
  v_restriccion text;
begin
  for v_restriccion in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.concesiones_mineras'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%sustancia%'
  loop
    execute format('alter table public.concesiones_mineras drop constraint %I', v_restriccion);
  end loop;
end $$;

alter table opciones_columna drop constraint if exists opciones_columna_permitidas;

alter table opciones_columna add constraint opciones_columna_permitidas check ((tabla || '.' || campo) in (
  'contratos.estado',
  'concesiones_mineras.estado',
  'concesiones_mineras.sustancia',
  'personal.firmado',
  'predios.a_nombre_de',
  'vehiculos.categoria',
  'vehiculos.responsable',
  'procesos.materia',
  'contratos.tipo',
  'contratos.moneda',
  'contratos.legalizado'
));
