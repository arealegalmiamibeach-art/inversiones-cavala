-- ============================================================
-- EVENTOS / DILIGENCIAS EDITABLES DESDE LA APP
-- ============================================================
-- La tabla `eventos` existe desde la migración inicial pero nunca se pobló
-- (el cliente no entregó esa base de Notion). Hasta ahora las diligencias
-- judiciales se extraían con regex del texto libre de `procesos.diligencia`.
--
-- Esto habilita crear/editar/eliminar diligencias reales:
--   - RLS: lectura para cualquier autenticado, escritura para puede_escribir()
--   - índice para las consultas por fecha (campana, calendario, correo diario)
--   - historial: el mismo trigger genérico de la migración 20260831000000
--
-- El vínculo proceso ↔ evento va por la tabla polimórfica `vinculos`
-- (destino_tipo = 'evento'), que ya acepta ese valor del enum `entidad`.

alter table eventos enable row level security;

drop policy if exists "eventos_lectura" on eventos;
create policy "eventos_lectura" on eventos
  for select to authenticated using (true);

drop policy if exists "eventos_alta" on eventos;
create policy "eventos_alta" on eventos
  for insert to authenticated with check (puede_escribir());

drop policy if exists "eventos_edicion" on eventos;
create policy "eventos_edicion" on eventos
  for update to authenticated using (puede_escribir()) with check (puede_escribir());

drop policy if exists "eventos_baja" on eventos;
create policy "eventos_baja" on eventos
  for delete to authenticated using (puede_escribir());

create index if not exists idx_eventos_inicia_en
  on eventos (inicia_en) where inicia_en is not null;

-- Auditoría por columna, igual que el resto de tablas de negocio.
drop trigger if exists trg_eventos_historial on eventos;
create trigger trg_eventos_historial
  after insert or update or delete on eventos
  for each row execute function registrar_historial();
