-- Contratos MBP-Otros (contratos.tipo = 'servicios'): la parte contratante es
-- UNA sola propiedad, "Contratante/Arrendador" (vínculo a propietario con rol
-- 'arrendador'). La importación de Notion dejó además vínculos recíprocos SIN
-- rol hacia los mismos propietarios: se veían como una fila "Propietario"
-- aparte (casi siempre vacía) y, al quitar a alguien de "Arrendador", el
-- duplicado sin rol lo hacía reaparecer en "Propietario".
--
-- 1. Todo propietario vinculado sin rol que aún no sea arrendador pasa a serlo.
-- 2. Se borran los vínculos sin rol contrato↔propietario de esos contratos.

begin;

with sin_rol as (
  select
    case when v.origen_tipo = 'contrato' then v.origen_id else v.destino_id end as contrato_id,
    case when v.origen_tipo = 'contrato' then v.destino_id else v.origen_id end as propietario_id,
    v.resuelto_por
  from public.vinculos v
  where v.rol is null
    and (
      (v.origen_tipo = 'contrato' and v.destino_tipo = 'propietario')
      or (v.origen_tipo = 'propietario' and v.destino_tipo = 'contrato')
    )
)
insert into public.vinculos (origen_tipo, origen_id, destino_tipo, destino_id, rol, resuelto_por)
select distinct on (s.contrato_id, s.propietario_id)
  'contrato', s.contrato_id, 'propietario', s.propietario_id, 'arrendador', s.resuelto_por
from sin_rol s
join public.contratos c on c.id = s.contrato_id and c.tipo = 'servicios'
where not exists (
  select 1 from public.vinculos a
  where a.rol = 'arrendador'
    and (
      (a.origen_tipo = 'contrato' and a.origen_id = s.contrato_id and a.destino_tipo = 'propietario' and a.destino_id = s.propietario_id)
      or (a.origen_tipo = 'propietario' and a.origen_id = s.propietario_id and a.destino_tipo = 'contrato' and a.destino_id = s.contrato_id)
    )
)
order by s.contrato_id, s.propietario_id;

delete from public.vinculos v
using public.contratos c
where v.rol is null
  and c.tipo = 'servicios'
  and (
    (v.origen_tipo = 'contrato' and v.origen_id = c.id and v.destino_tipo = 'propietario')
    or (v.origen_tipo = 'propietario' and v.destino_tipo = 'contrato' and v.destino_id = c.id)
  );

commit;
