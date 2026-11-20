-- ============================================================
-- Revisión técnica como vencimiento
-- ============================================================
-- `vehiculos.revision_tecnica` llegó de Notion como texto libre: "2027-03-26",
-- "27/10/2026", "01 DE OCTUBRE DE 2026", "enero 2026", "2029", "-"… Con eso no
-- se pueden contar días ni avisar. Pasa a `date`, igual que soat_vence y
-- poliza_vence, y entra en alertas, calendario y la columna Vencimientos.
--
-- Criterio acordado con el cliente para lo incompleto: fin de periodo
-- ("enero 2026" → 2026-01-31, "2029" → 2029-12-31). El texto original se deja
-- en `detalle` para que se sepa que la fecha es aproximada y se corrija. Lo que
-- no se puede leer queda sin fecha y también se anota en `detalle`.

create or replace function pg_temp.mes_es(p text) returns int
language sql immutable as $$
  select case p
    when 'enero' then 1 when 'febrero' then 2 when 'marzo' then 3
    when 'abril' then 4 when 'mayo' then 5 when 'junio' then 6
    when 'julio' then 7 when 'agosto' then 8
    when 'septiembre' then 9 when 'setiembre' then 9
    when 'octubre' then 10 when 'noviembre' then 11 when 'diciembre' then 12
  end
$$;

-- Devuelve (fecha, exacta). exacta = false si se completó a fin de periodo.
create or replace function pg_temp.leer_revision(p text, out fecha date, out exacta boolean)
language plpgsql as $$
declare
  s text := lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
  dmy text[] := regexp_match(s, '^(\d{1,2})/(\d{1,2})/(\d{4})$');
  dia_mes_anio text[] := regexp_match(s, '^(\d{1,2}) (?:de )?([a-z]+) (?:de |del )?(\d{4})$');
  mes_anio text[] := regexp_match(s, '^([a-z]+) (?:de |del )?(\d{4})$');
begin
  exacta := true;
  begin
    if s ~ '^\d{4}-\d{2}-\d{2}$' then
      fecha := s::date;
    elsif dmy is not null then
      fecha := make_date(dmy[3]::int, dmy[2]::int, dmy[1]::int);
    elsif dia_mes_anio is not null then
      fecha := make_date(dia_mes_anio[3]::int, pg_temp.mes_es(dia_mes_anio[2]), dia_mes_anio[1]::int);
    elsif mes_anio is not null then
      fecha := (make_date(mes_anio[2]::int, pg_temp.mes_es(mes_anio[1]), 1) + interval '1 month - 1 day')::date;
      exacta := false;
    elsif s ~ '^\d{4}$' then
      fecha := make_date(s::int, 12, 31);
      exacta := false;
    end if;
  exception when others then
    -- Mes desconocido (make_date con null) o fecha imposible (31/02).
    fecha := null;
  end;
  if fecha is null then exacta := false; end if;
end;
$$;

-- 1. Anotar en `detalle` lo aproximado o ilegible antes de perder el texto.
update public.vehiculos v
set detalle = concat_ws(E'\n', nullif(btrim(v.detalle), ''),
  case
    when l.fecha is null
      then format('Revisión técnica (dato migrado de Notion): "%s". No se pudo leer como fecha; cargar la fecha exacta.', btrim(v.revision_tecnica))
    else format('Revisión técnica (dato migrado de Notion): "%s". Se registró %s como fecha aproximada (fin de periodo); confirmar la fecha exacta.', btrim(v.revision_tecnica), to_char(l.fecha, 'DD/MM/YYYY'))
  end)
from (select id, (pg_temp.leer_revision(revision_tecnica)).* from public.vehiculos) l
where l.id = v.id
  and not l.exacta
  -- "-" y vacío no son datos: no se anotan.
  and btrim(coalesce(v.revision_tecnica, '')) !~ '^-*$';

-- 2. Cambiar el tipo.
alter table public.vehiculos
  alter column revision_tecnica type date
  using (pg_temp.leer_revision(revision_tecnica)).fecha;

comment on column public.vehiculos.revision_tecnica is 'Vencimiento de la revisión técnica.';

-- 3. Mismo índice parcial que soat_vence / poliza_vence (lo usan las alertas).
create index if not exists vehiculos_revision_tecnica_idx
  on public.vehiculos (revision_tecnica)
  where revision_tecnica is not null;
