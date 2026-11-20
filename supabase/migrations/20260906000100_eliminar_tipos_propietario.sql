-- Permite retirar opciones personalizadas del catálogo. Los propietarios que
-- ya usaron el texto conservan su valor en `extra.tipo_propietario`.

drop policy if exists "tipos_propietario_baja" on tipos_propietario;
create policy "tipos_propietario_baja" on tipos_propietario
  for delete to authenticated using (puede_escribir());

grant delete on tipos_propietario to authenticated;
