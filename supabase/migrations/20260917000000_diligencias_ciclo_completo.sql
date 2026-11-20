-- ============================================================
-- DILIGENCIAS: DÍA CORRECTO, EXPEDIENTE, CICLO DE VIDA Y PLAZOS HÁBILES
-- ============================================================
-- Cinco huecos que hacían que el sistema perdiera lo único que un estudio
-- legal no puede perder. Los tres primeros son reparación de datos: las 43
-- diligencias importadas de Notion estaban mal guardadas y sueltas.

-- ============================================================
-- 1. El día equivocado (42 de 43 diligencias)
-- ============================================================
-- La importación guardó las fechas sin hora como medianoche UTC. La app las
-- lee en hora de Perú (UTC-5), así que "31 de agosto" se mostraba como el 30
-- a las 19:00 en el calendario, la campana y el correo diario: un día antes
-- en todo el sistema, con una hora inventada.
--
-- Se reinterpreta el día UTC como día civil peruano. El filtro por hora basta
-- para no tocar nada creado desde la app: `componerIniciaEn` escribe el
-- offset -05:00, así que una diligencia dada de alta a las 00:00 de Perú
-- queda en la base como 05:00 UTC y nunca entra aquí.

update eventos
   set inicia_en = ((inicia_en at time zone 'UTC')::date::timestamp) at time zone 'America/Lima'
 where inicia_en is not null
   and (inicia_en at time zone 'UTC')::time = time '00:00';

-- ============================================================
-- 2. Diligencias sin expediente
-- ============================================================
-- Ninguna de las 43 estaba enlazada a su proceso (`vinculos` tenía 0 aristas
-- con eventos), así que abrir una audiencia desde el calendario o la campana
-- no llevaba a ninguna parte. El número de expediente sí vino en `extra`, en
-- la columna de relación que Notion usaba según la materia.

insert into vinculos (origen_tipo, origen_id, destino_tipo, destino_id, rol, resuelto_por)
select 'proceso', p.id, 'evento', e.id, null, 'manual'
  from eventos e
  cross join lateral (
    select upper(trim(coalesce(
      e.extra->>'Proceso penal.',
      e.extra->>'Civil.',
      e.extra->>'Laboral.',
      e.extra->>'Constitucional.',
      e.extra->>'Conciliación.',
      e.extra->>'Contencioso Admin.',
      e.extra->>'Carpeta Fiscal.'
    ))) as expediente
  ) rel
  join procesos p
    on upper(trim(p.expediente)) = rel.expediente
   and p.eliminado_en is null
 where e.eliminado_en is null
   and rel.expediente is not null
   and rel.expediente <> ''
   and not exists (
     select 1 from vinculos v
      where (v.destino_tipo = 'evento' and v.destino_id = e.id)
         or (v.origen_tipo  = 'evento' and v.origen_id  = e.id)
   );

-- ============================================================
-- 3. `responsable` con identificadores de Notion
-- ============================================================
-- Varias filas traen el UUID del usuario de Notion en vez de un nombre. No
-- sirve para nada y se muestra tal cual en la ficha del proceso.

update eventos
   set responsable = null
 where responsable ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ============================================================
-- 4. Ciclo de vida de la diligencia
-- ============================================================
-- `estado` era texto libre y estaba en NULL en las 43 filas. Una audiencia
-- pasaba de fecha y desaparecía de la campana, del dashboard y del correo
-- (todas esas consultas filtran `inicia_en >= now()`), sin forma de
-- distinguir "pasó y se atendió" de "se nos fue". Ahora es un vocabulario
-- cerrado con PENDIENTE por defecto: lo vencido y pendiente sigue avisando
-- hasta que alguien lo cierre a mano.

alter table eventos add column if not exists cerrado_en  timestamptz;
alter table eventos add column if not exists cerrado_por uuid references perfiles(id) on delete set null;
alter table eventos add column if not exists resultado   text;

-- Lo que no se reconozca se conserva como nota de cierre en vez de perderse.
update eventos
   set resultado = coalesce(resultado, nullif(trim(estado), ''))
 where estado is not null
   and upper(trim(estado)) not in ('PENDIENTE','REALIZADA','REPROGRAMADA','INCUMPLIDA','CANCELADA');

update eventos
   set estado = case upper(trim(coalesce(estado, '')))
     when 'REALIZADA'    then 'REALIZADA'
     when 'REALIZADO'    then 'REALIZADA'
     when 'REPROGRAMADA' then 'REPROGRAMADA'
     when 'INCUMPLIDA'   then 'INCUMPLIDA'
     when 'CANCELADA'    then 'CANCELADA'
     when 'ANULADA'      then 'CANCELADA'
     else 'PENDIENTE'
   end;

update eventos set cerrado_en = coalesce(cerrado_en, actualizado_en) where estado <> 'PENDIENTE';

alter table eventos alter column estado set default 'PENDIENTE';
alter table eventos alter column estado set not null;

alter table eventos drop constraint if exists eventos_estado_valido;
alter table eventos add constraint eventos_estado_valido
  check (estado in ('PENDIENTE','REALIZADA','REPROGRAMADA','INCUMPLIDA','CANCELADA'));

-- Un cierre sin fecha de cierre deja la diligencia en un limbo en el que no
-- se sabe cuándo se cerró: la auditoría de un expediente depende de eso.
alter table eventos drop constraint if exists eventos_cierre_coherente;
alter table eventos add constraint eventos_cierre_coherente
  check ((estado = 'PENDIENTE') = (cerrado_en is null));

-- ============================================================
-- 5. Responsable real y anticipación del aviso
-- ============================================================
-- `responsable` era texto libre, así que el correo diario era un resumen
-- global idéntico para todos y nadie respondía por nada. El texto se conserva
-- para cuando el responsable no tiene cuenta en el sistema.

alter table eventos add column if not exists responsable_id uuid references perfiles(id) on delete set null;
alter table eventos add column if not exists dias_aviso int not null default 10;

alter table eventos drop constraint if exists eventos_dias_aviso_valido;
alter table eventos add constraint eventos_dias_aviso_valido
  check (dias_aviso between 0 and 90);

create index if not exists idx_eventos_pendientes
  on eventos (inicia_en) where estado = 'PENDIENTE' and eliminado_en is null;

create index if not exists idx_eventos_responsable
  on eventos (responsable_id) where responsable_id is not null;

-- ============================================================
-- 6. Feriados (cómputo de plazos en días hábiles)
-- ============================================================
-- No existía el concepto de plazo: todo se contaba en días calendario y la
-- fecha de vencimiento había que calcularla a mano fuera del sistema.

create table if not exists feriados (
  fecha      date primary key,
  nombre     text not null,
  -- false = regional o no laborable sólo para el sector público: se registra
  -- igual, pero la app decide si lo descuenta del plazo.
  nacional   boolean not null default true,
  creado_en  timestamptz not null default now()
);

alter table feriados enable row level security;

drop policy if exists feriados_lectura on feriados;
create policy feriados_lectura on feriados
  for select to authenticated using (true);

drop policy if exists feriados_escritura on feriados;
create policy feriados_escritura on feriados
  for all to authenticated using (es_admin()) with check (es_admin());

-- Sólo los extraordinarios: los fijos y la Semana Santa los calcula
-- `src/lib/feriados.ts`, que funciona aunque esta tabla esté vacía.
insert into feriados (fecha, nombre, nacional) values
  ('2026-07-27', 'Día no laborable puente (Fiestas Patrias)', true),
  ('2026-10-09', 'Día no laborable puente (Combate de Angamos)', true)
on conflict (fecha) do nothing;
