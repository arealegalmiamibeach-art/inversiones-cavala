-- Un único round-trip para los 7 conteos del dashboard en vez de 7 queries
-- paralelas de COUNT. SECURITY INVOKER: RLS se aplica con el usuario que
-- llama, igual que las queries individuales que reemplaza.
create or replace function conteos_dashboard()
returns json
language sql
security invoker
set search_path = public
as $$
  select json_build_object(
    'propietarios',        (select count(*) from propietarios),
    'predios',             (select count(*) from predios),
    'vehiculos',           (select count(*) from vehiculos),
    'concesiones_mineras', (select count(*) from concesiones_mineras),
    'personal',            (select count(*) from personal),
    'procesos',            (select count(*) from procesos),
    'documentos',          (select count(*) from documentos)
  );
$$;

revoke all on function conteos_dashboard() from public, anon;
grant execute on function conteos_dashboard() to authenticated;
