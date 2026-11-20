-- Habilita el Lector IA para los administradores activos. El resto de roles
-- continúa requiriendo una asignación explícita en lector_ia_accesos.

do $$
declare
  v_insertados integer;
begin
  insert into public.lector_ia_accesos (usuario_id)
  select id
  from public.perfiles
  where activo = true and rol = 'administrador'
  on conflict (usuario_id) do nothing;

  get diagnostics v_insertados = row_count;
  raise notice 'Accesos de Lector IA creados para administradores: %', v_insertados;
end;
$$;

analyze public.lector_ia_accesos;
