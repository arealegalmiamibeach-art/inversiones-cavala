-- ============================================================
-- HISTORIAL — colapsar ráfagas ya guardadas (una vez)
-- ============================================================
-- Antes del coalescer, cada autoguardado del editor de notas dejó su
-- propia fila. Se agrupan las ediciones consecutivas del mismo usuario
-- sobre el mismo campo dentro de 15 min: se conserva la primera (con su
-- valor_anterior original), se le pone el último valor_nuevo y la última
-- hora, y se borra el resto.

with ordenado as (
  select id, tabla, registro_id, campo, actor_id, valor_nuevo, creado_en,
         lag(creado_en) over w as prev_creado
  from historial
  where accion = 'editar'
  window w as (partition by tabla, registro_id, campo, actor_id order by creado_en)
),
grupos as (
  select *,
    sum(case when prev_creado is null or creado_en - prev_creado > interval '15 minutes'
             then 1 else 0 end)
      over (partition by tabla, registro_id, campo, actor_id order by creado_en) as grupo
  from ordenado
),
resumen as (
  select (array_agg(id order by creado_en))[1]              as keep_id,
         (array_agg(valor_nuevo order by creado_en desc))[1] as ultimo_nuevo,
         max(creado_en)                                      as ultima_hora,
         array_agg(id)                                       as todos_ids
  from grupos
  group by tabla, registro_id, campo, actor_id, grupo
  having count(*) > 1
)
update historial h
set valor_nuevo = r.ultimo_nuevo,
    creado_en   = r.ultima_hora
from resumen r
where h.id = r.keep_id;

with ordenado as (
  select id, tabla, registro_id, campo, actor_id, creado_en,
         lag(creado_en) over w as prev_creado
  from historial
  where accion = 'editar'
  window w as (partition by tabla, registro_id, campo, actor_id order by creado_en)
),
grupos as (
  select *,
    sum(case when prev_creado is null or creado_en - prev_creado > interval '15 minutes'
             then 1 else 0 end)
      over (partition by tabla, registro_id, campo, actor_id order by creado_en) as grupo
  from ordenado
),
resumen as (
  select (array_agg(id order by creado_en))[1] as keep_id,
         array_agg(id)                          as todos_ids
  from grupos
  group by tabla, registro_id, campo, actor_id, grupo
  having count(*) > 1
)
delete from historial h
using resumen r
where h.id = any(r.todos_ids)
  and h.id <> r.keep_id;

-- Ediciones cuyo neto no cambió nada.
delete from historial
where accion = 'editar'
  and valor_anterior is not distinct from valor_nuevo;
