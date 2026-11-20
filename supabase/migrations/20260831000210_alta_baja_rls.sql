-- ============================================================
-- ALTA Y BAJA DE REGISTROS DE NEGOCIO DESDE LA APP
-- ============================================================
-- Hasta ahora la app sólo editaba filas ya migradas (UPDATE). Estas políticas
-- habilitan el INSERT (crear) y el DELETE (eliminar) para los roles que
-- corresponde, reutilizando los helpers de la migración 015:
--
--   puede_escribir()  -> hoy sólo 'administrador'
--   es_admin()        -> 'administrador'
--
-- Nombres de política propios ('alta_app' / 'baja_app') para no chocar con las
-- políticas FOR ALL / FOR UPDATE que ya existan. Idempotente.

do $$
declare
  t text;
  tablas_negocio constant text[] := array[
    'propietarios', 'datos_empresas', 'predios', 'vehiculos',
    'concesiones_mineras', 'personal', 'procesos', 'contratos'
  ];
begin
  foreach t in array tablas_negocio loop
    execute format('alter table %I enable row level security', t);

    -- NOTA: si la política "auth_only" del schema.sql inicial (FOR ALL
    -- USING(true)) siguiera viva, cualquier autenticado ya podría escribir y
    -- estas políticas no lo empeoran. La migración 015 debería haberla
    -- reemplazado por el gate de rol; verificar antes de dar por cerrado.
    execute format('drop policy if exists "alta_app" on %I', t);
    execute format(
      'create policy "alta_app" on %I for insert to authenticated with check (puede_escribir())', t
    );

    execute format('drop policy if exists "baja_app" on %I', t);
    execute format(
      'create policy "baja_app" on %I for delete to authenticated using (es_admin())', t
    );
  end loop;
end $$;

-- `vinculos`: la baja de un registro limpia sus aristas en ambos sentidos, y
-- el alta de adendas/documentos ya inserta aquí. Se asegura ambos permisos.
alter table vinculos enable row level security;

drop policy if exists "alta_app" on vinculos;
create policy "alta_app" on vinculos
  for insert to authenticated with check (puede_escribir());

drop policy if exists "baja_app" on vinculos;
create policy "baja_app" on vinculos
  for delete to authenticated using (puede_escribir());
