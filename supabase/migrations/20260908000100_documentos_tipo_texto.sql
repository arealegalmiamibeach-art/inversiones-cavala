-- `documentos.tipo` nació como enum, pero ahora los administradores pueden
-- crear tipos desde la aplicación. Se conserva cada valor y el default actual;
-- la validación de tipos permitidos queda en la Server Action y el catálogo.
do $$
declare
  tipo_actual text;
  expresion_default text;
  valor_default text;
begin
  select tipo.typname, pg_get_expr(def.adbin, def.adrelid)
    into tipo_actual, expresion_default
  from pg_attribute atributo
  join pg_class tabla on tabla.oid = atributo.attrelid
  join pg_namespace esquema on esquema.oid = tabla.relnamespace
  join pg_type tipo on tipo.oid = atributo.atttypid
  left join pg_attrdef def
    on def.adrelid = atributo.attrelid
   and def.adnum = atributo.attnum
  where esquema.nspname = 'public'
    and tabla.relname = 'documentos'
    and atributo.attname = 'tipo'
    and not atributo.attisdropped;

  if tipo_actual = 'tipo_documento' then
    if expresion_default is not null then
      execute format('select (%s)::text', expresion_default) into valor_default;
    end if;

    alter table public.documentos alter column tipo drop default;
    alter table public.documentos alter column tipo type text using tipo::text;

    if valor_default is not null then
      execute format(
        'alter table public.documentos alter column tipo set default %L',
        valor_default
      );
    end if;
  end if;
end
$$;
