-- Índices de lectura para las consultas que alimentan tablas, relaciones,
-- adjuntos y alertas al cambiar de módulo. `if not exists` permite aplicar la
-- migración sin interferir con índices equivalentes creados manualmente.

create index if not exists archivos_entidad_tipo_id_idx
  on public.archivos (entidad_tipo, entidad_id);

create index if not exists vinculos_origen_tipo_id_idx
  on public.vinculos (origen_tipo, origen_id);

create index if not exists vinculos_destino_tipo_id_idx
  on public.vinculos (destino_tipo, destino_id);

create index if not exists datos_empresas_propietario_id_idx
  on public.datos_empresas (propietario_id);

create index if not exists predios_oficina_registral_id_idx
  on public.predios (oficina_registral_id);

create index if not exists procesos_materia_expediente_idx
  on public.procesos (materia, expediente);

create index if not exists documentos_tipo_fecha_nombre_idx
  on public.documentos (tipo, fecha desc nulls last, nombre);

create index if not exists contratos_tipo_nombre_idx
  on public.contratos (tipo, nombre);

create index if not exists contratos_fecha_vencimiento_idx
  on public.contratos (fecha_vencimiento)
  where fecha_vencimiento is not null;

create index if not exists vehiculos_soat_vence_idx
  on public.vehiculos (soat_vence)
  where soat_vence is not null;

create index if not exists vehiculos_poliza_vence_idx
  on public.vehiculos (poliza_vence)
  where poliza_vence is not null;

create index if not exists personal_contrato_fin_idx
  on public.personal (contrato_fin)
  where contrato_fin is not null;

create index if not exists documentos_fecha_idx
  on public.documentos (fecha)
  where fecha is not null;
