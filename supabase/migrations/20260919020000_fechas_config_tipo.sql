-- ============================================================
-- FECHAS Y AVISOS: "rol" pasa a llamarse "tipo de fecha"
-- ============================================================
-- En esta app "rol" es el rol de usuario (administrador, tesorería…), y el
-- valor dato / evento / vencimiento de cada fuente de fechas se llama "tipo de
-- fecha". La tabla se creó minutos antes y está vacía: se renombra la columna
-- para que no se confunda con `perfiles.rol`.
--
-- Además, quien puede crear una propiedad personalizada (cualquiera con
-- permiso de administrar esa área, no sólo el administrador general) elige el
-- tipo de fecha al crearla, así que también puede escribir la fila de SU
-- propiedad. El resto de las fuentes (contratos, SOAT, documentos…) siguen
-- siendo sólo del administrador.

alter table fechas_config rename column rol to tipo;
alter table fechas_config rename constraint fechas_config_rol to fechas_config_tipo;

drop policy if exists "fechas_config_escritura" on fechas_config;
create policy "fechas_config_escritura" on fechas_config
  for all to authenticated
  using (es_admin() or (fuente like 'propiedad:%' and puede_escribir()))
  with check (es_admin() or (fuente like 'propiedad:%' and puede_escribir()));
