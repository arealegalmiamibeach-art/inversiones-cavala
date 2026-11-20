-- ============================================================
-- PAPELERA — mandar a la papelera (RPC)
-- ============================================================
-- La baja no puede hacerse con un UPDATE normal desde la app: al evaluar un
-- UPDATE, Postgres aplica las políticas RESTRICTIVE de SELECT también a la
-- fila resultante, así que "ocultar_eliminados" rechaza justo la fila que
-- acaba de volverse invisible:
--
--   ERROR: new row violates row-level security policy "ocultar_eliminados"
--
-- Por eso la baja entra por aquí, `security definer`, igual que restaurar y
-- purgar. El gate de rol lo hace la función (al saltarse RLS deja de ser
-- automático) y el trigger `registrar_historial` sigue anotando quién fue,
-- porque `auth.uid()` no cambia dentro de una función security definer.

create or replace function papelera_eliminar(p_tabla text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_filas int;
begin
  if v_actor is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  if not puede_escribir() then
    raise exception 'Tu rol no permite eliminar registros' using errcode = 'insufficient_privilege';
  end if;

  -- Lista blanca: `p_tabla` termina en un format(%I).
  if not exists (select 1 from papelera_tablas() where tabla = p_tabla) then
    raise exception 'Tipo de registro no válido';
  end if;

  execute format(
    'update %I set eliminado_en = now(), eliminado_por = $1
     where id = $2 and eliminado_en is null', p_tabla
  ) using v_actor, p_id;
  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    return jsonb_build_object('ok', false, 'error', 'El registro ya no existe o ya estaba eliminado');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function papelera_eliminar(text, uuid) from public, anon;
grant execute on function papelera_eliminar(text, uuid) to authenticated;
