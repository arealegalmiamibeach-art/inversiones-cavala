-- ============================================================
-- MODALIDAD, TIPO DE PREDIO Y TIPO DE PERSONA: CATÁLOGO EDITABLE
-- ============================================================
-- `personal.modalidad` (planilla | locador), `predios.tipo_predio`
-- (urbano | rural) y `propietarios.tipo_persona` (natural | juridica) estaban
-- fuera del catálogo `opciones_columna` porque la base las validaba con un
-- check de lista de valores. En "Editar propiedad" salían como "Fijas por el
-- esquema de la tabla": no se podían añadir, renombrar, reordenar ni eliminar
-- opciones, a diferencia del resto de propiedades de Selección.
--
-- 1) Se sueltan esos checks. No se adivina el nombre: para cada columna se
--    buscan los CHECK de la tabla que
--      · cubren UNA sola columna (`conkey` de un elemento) y es esa columna, y
--      · son una lista de valores (`= ANY (ARRAY[...])` o `IN (...)`).
--    Un CHECK compuesto que involucre otras columnas no se toca. Cada check
--    soltado queda en un `raise notice`; si tras el bloque sigue habiendo un
--    CHECK de una sola columna que no era una lista de valores, sale un
--    `raise warning` para revisarlo a mano (no se suelta a ciegas).
--    Los valores guardados ('planilla', 'urbano', 'natural'…) siguen siendo
--    válidos y ahora pueden convivir con los que se agreguen desde la UI.
-- 2) Se agregan las tres columnas a la lista blanca del catálogo. La lista es
--    la vigente completa (la última la dejó
--    20260921000000_opciones_columna_sustancia.sql, con 11 entradas) y tiene
--    que coincidir con CATALOGOS_COLUMNA en src/lib/opciones-columna.ts.
--
-- Idempotente y sin tocar datos. Sin semilla: mientras la columna no tenga
-- filas en `opciones_columna` la vista sigue usando las opciones del código
-- (Planilla/Locador, Urbano/Rural, Natural/Jurídica); la primera edición desde
-- la UI las siembra con valor (p. ej. 'planilla') distinto de la etiqueta
-- ('Planilla'), así que renombrarlas sólo cambia lo que se muestra, no los
-- registros ni lo que lee el código (conteos urbano/rural de las oficinas
-- registrales, ícono de persona jurídica).

do $$
declare
  v_objetivo    record;
  v_restriccion record;
begin
  for v_objetivo in
    select * from (values
      ('personal',     'modalidad'),
      ('predios',      'tipo_predio'),
      ('propietarios', 'tipo_persona')
    ) as objetivo(tabla, columna)
  loop
    -- Sueltos: el CHECK de una sola columna que es una lista de valores.
    for v_restriccion in
      select c.conname, pg_get_constraintdef(c.oid) as definicion
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum   = c.conkey[1]
      where c.conrelid = format('public.%I', v_objetivo.tabla)::regclass
        and c.contype = 'c'
        and array_length(c.conkey, 1) = 1
        and a.attname = v_objetivo.columna
        and pg_get_constraintdef(c.oid) ~* '(=\s*any\s*\(+\s*array\s*\[|\sin\s*\()'
    loop
      execute format('alter table public.%I drop constraint %I', v_objetivo.tabla, v_restriccion.conname);
      raise notice 'Soltado el check % de %.%: %',
        v_restriccion.conname, v_objetivo.tabla, v_objetivo.columna, v_restriccion.definicion;
    end loop;

    -- Avisa de lo que quede: un CHECK de una sola columna que no es lista de valores.
    for v_restriccion in
      select c.conname, pg_get_constraintdef(c.oid) as definicion
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum   = c.conkey[1]
      where c.conrelid = format('public.%I', v_objetivo.tabla)::regclass
        and c.contype = 'c'
        and array_length(c.conkey, 1) = 1
        and a.attname = v_objetivo.columna
    loop
      raise warning 'Sigue el check % en %.% (no es una lista de valores, no se soltó): %',
        v_restriccion.conname, v_objetivo.tabla, v_objetivo.columna, v_restriccion.definicion;
    end loop;
  end loop;
end $$;

alter table opciones_columna drop constraint if exists opciones_columna_permitidas;

alter table opciones_columna add constraint opciones_columna_permitidas check ((tabla || '.' || campo) in (
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
