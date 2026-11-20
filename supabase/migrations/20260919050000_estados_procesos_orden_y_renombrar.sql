-- ============================================================
-- ESTADOS DE PROCESOS: ORDEN PROPIO Y RENOMBRAR
-- ============================================================
-- 1. `orden`: el orden de cada estado dentro de su materia se puede cambiar
--    arrastrando (hasta ahora salía por fecha de creación). Se inicializa con
--    el orden que ya tenían.
-- 2. `renombrar_estado_proceso`: renombra un estado y, en el mismo paso,
--    actualiza el texto de `procesos.estado` de esa materia. Es security
--    definer porque las filas en la papelera están ocultas por RLS y, sin
--    esto, quedarían con el nombre viejo (y al restaurarlas, fuera de lista).
--    El historial sigue anotando el cambio: `auth.uid()` no cambia aquí.

alter table estados_procesos add column if not exists orden integer not null default 0;

update estados_procesos e
set orden = t.n
from (
  select id, row_number() over (partition by materia order by creado_en, id) as n
  from estados_procesos
) t
where e.id = t.id;

create index if not exists estados_procesos_materia_orden on estados_procesos (materia, orden);

create or replace function renombrar_estado_proceso(p_id uuid, p_valor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo text := regexp_replace(btrim(coalesce(p_valor, '')), '\s+', ' ', 'g');
  v_materia text;
  v_anterior text;
  v_procesos int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  if not puede_escribir() then
    raise exception 'Tu rol no permite editar estados' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_nuevo) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'El estado debe tener entre 1 y 80 caracteres');
  end if;

  select materia, valor into v_materia, v_anterior
  from estados_procesos where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El estado ya no existe');
  end if;
  if v_anterior = v_nuevo then
    return jsonb_build_object('ok', true, 'procesos', 0);
  end if;

  if exists (
    select 1 from estados_procesos
    where id <> p_id
      and coalesce(materia, '') = coalesce(v_materia, '')
      and lower(btrim(valor)) = lower(v_nuevo)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese estado ya existe en esta materia');
  end if;

  update estados_procesos set valor = v_nuevo where id = p_id;

  if v_materia is not null then
    update procesos
    set estado = v_nuevo
    where materia::text = v_materia
      and lower(btrim(estado)) = lower(btrim(v_anterior));
    get diagnostics v_procesos = row_count;
  end if;

  return jsonb_build_object('ok', true, 'procesos', v_procesos);
end;
$$;

revoke all on function renombrar_estado_proceso(uuid, text) from public, anon;
grant execute on function renombrar_estado_proceso(uuid, text) to authenticated;
