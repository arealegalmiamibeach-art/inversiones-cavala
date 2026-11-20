-- Amplía las propiedades personalizadas con relaciones configurables al estilo
-- Notion. El valor de una relación es un arreglo JSON de UUIDs y la definición
-- indica a qué tipo de entidad apunta.

alter table propiedades_personalizadas
  add column if not exists configuracion jsonb not null default '{}'::jsonb
  check (jsonb_typeof(configuracion) = 'object');

alter table propiedades_personalizadas
  drop constraint if exists propiedades_personalizadas_tipo_check;

alter table propiedades_personalizadas
  add constraint propiedades_personalizadas_tipo_check
  check (tipo in ('texto', 'numero', 'fecha', 'booleano', 'seleccion', 'relacion'));

-- Al habilitar propiedades en todas las tablas, la limpieza de valores deja de
-- ser exclusiva de procesos. El tipo se pasa como argumento de cada trigger.
create or replace function limpiar_valores_personalizados_entidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from valores_propiedad_personalizada v
  using propiedades_personalizadas p
  where v.propiedad_id = p.id
    and p.entidad_tipo = tg_argv[0]
    and v.entidad_id = old.id;
  return old;
end;
$$;

drop trigger if exists limpiar_valores_personalizados_proceso on procesos;

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('propietario', 'propietarios'),
      ('predio', 'predios'),
      ('vehiculo', 'vehiculos'),
      ('concesion', 'concesiones_mineras'),
      ('personal', 'personal'),
      ('oficina_registral', 'oficinas_registrales'),
      ('proceso', 'procesos'),
      ('documento', 'documentos'),
      ('contrato', 'contratos')
    ) as entidades(tipo, tabla)
  loop
    execute format('drop trigger if exists limpiar_valores_personalizados_entidad on %I', item.tabla);
    execute format(
      'create trigger limpiar_valores_personalizados_entidad after delete on %I for each row execute function limpiar_valores_personalizados_entidad(%L)',
      item.tabla,
      item.tipo
    );
  end loop;
end;
$$;
