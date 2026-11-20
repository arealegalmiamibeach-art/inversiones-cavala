-- Prueba transaccional sobre fixtures aislados. Siempre revierte todo.
begin;

insert into auth.users(id, email) values
  ('a1000000-0000-4000-8000-000000000001','permisos-admin@example.test'),
  ('a1000000-0000-4000-8000-000000000002','permisos-soporte@example.test'),
  ('a1000000-0000-4000-8000-000000000003','permisos-tesoreria@example.test');
update public.perfiles set rol = 'administrador', activo = true where id = 'a1000000-0000-4000-8000-000000000001';
update public.perfiles set rol = 'soporte_documentario', activo = true where id = 'a1000000-0000-4000-8000-000000000002';
update public.perfiles set rol = 'tesoreria', activo = true where id = 'a1000000-0000-4000-8000-000000000003';
insert into public.vehiculos(id, placa) values ('a2000000-0000-4000-8000-000000000001','TEST-PERMISOS');
insert into public.personal(id, nombre) values ('a2000000-0000-4000-8000-000000000002','Fixture permisos');
insert into public.contratos(id, nombre, tipo) values ('a2000000-0000-4000-8000-000000000003','Fixture profesional','profesional');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
do $$
begin
  assert public.nivel_area('vehiculos') = 'visualizar', 'Tesorería debe heredar lectura';
  assert public.nivel_area('personal') = 'sin_acceso', 'Personal no debe estar visible por defecto';
  assert not exists (select 1 from public.contratos where id = 'a2000000-0000-4000-8000-000000000003'), 'Tesorería no debe ver profesionales por defecto';
  begin
    perform public.guardar_permisos_usuario(auth.uid(), '{"vehiculos":"administrar"}');
    raise exception 'Un usuario logró elevar sus propios permisos';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.permisos_usuario(usuario_id,seccion,nivel) values (auth.uid(),'vehiculos','administrar');
    raise exception 'Un usuario escribió directamente sus permisos';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.guardar_permisos_usuario('a1000000-0000-4000-8000-000000000002',
  '{"vehiculos":"administrar","personal":"visualizar","documentos":"visualizar","predios":"sin_acceso"}');
select public.guardar_permisos_usuario('a1000000-0000-4000-8000-000000000003','{"contratos":"visualizar"}');
do $$
begin
  assert public.nivel_area('dashboard') = 'visualizar', 'Dashboard debe expresarse como informe aun para administradores';
  begin
    perform public.guardar_permisos_usuario('a1000000-0000-4000-8000-000000000002','{"vehiculos":"invalid"}');
    raise exception 'Un nivel inválido fue aceptado';
  exception when raise_exception then
    if sqlerrm <> 'Área o nivel inválido' then raise; end if;
  end;
  begin
    perform public.guardar_permisos_usuario('a1000000-0000-4000-8000-000000000002','{"dashboard":"administrar"}');
    raise exception 'Un informe aceptó permiso de administración';
  exception when raise_exception then
    if sqlerrm <> 'Área o nivel inválido' then raise; end if;
  end;
  assert exists (select 1 from public.permisos_usuario where usuario_id = 'a1000000-0000-4000-8000-000000000002' and seccion = 'vehiculos' and nivel = 'administrar'), 'Una validación fallida destruyó permisos';
  assert not exists (select 1 from public.permisos_usuario where usuario_id = 'a1000000-0000-4000-8000-000000000003' and seccion = 'contratos'), 'Se guardó una copia redundante del valor del rol';
end;
$$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
do $$
begin
  assert not exists (select 1 from public.contratos where id = 'a2000000-0000-4000-8000-000000000003'), 'Visualizar no debe ampliar silenciosamente los tipos de Contratos';
  assert public.nivel_area('vehiculos') = 'visualizar', 'Los permisos de otro usuario no deben afectarme';
end;
$$;

select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.guardar_permisos_usuario('a1000000-0000-4000-8000-000000000003','{"contratos":"administrar"}');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
do $$
begin
  assert public.nivel_area('contratos') = 'administrar', 'No se aplicó administrar Contratos';
  assert exists (select 1 from public.contratos where id = 'a2000000-0000-4000-8000-000000000003'), 'Administrar Contratos debe incluir todos sus tipos';
end;
$$;

select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$
declare filas int;
begin
  assert public.nivel_area('vehiculos') = 'administrar', 'No se aplicó administrar';
  assert exists (select 1 from public.personal where id = 'a2000000-0000-4000-8000-000000000002'), 'No se aplicó visualizar Personal';
  assert not exists (select 1 from public.predios), 'Sin acceso debe ocultar todos los registros';
  insert into public.vehiculos(id,placa) values ('a2000000-0000-4000-8000-000000000004','TEST-CREAR');
  update public.vehiculos set marca_modelo = 'Prueba' where id = 'a2000000-0000-4000-8000-000000000004';
  get diagnostics filas = row_count;
  assert filas = 1, 'Administrar no permitió editar';
  assert (public.papelera_eliminar('vehiculos','a2000000-0000-4000-8000-000000000004')->>'ok')::boolean, 'Administrar no permitió eliminar';
  assert not exists (select 1 from public.vehiculos where id = 'a2000000-0000-4000-8000-000000000004'), 'La papelera dejó visible la fila';
  update public.personal set nombre = 'No permitido' where id = 'a2000000-0000-4000-8000-000000000002';
  get diagnostics filas = row_count;
  assert filas = 0, 'Visualizar permitió editar';
  begin
    insert into public.personal(nombre) values ('No permitido');
    raise exception 'Visualizar permitió crear';
  exception when insufficient_privilege then null; end;
  begin
    perform public.papelera_eliminar('personal','a2000000-0000-4000-8000-000000000002');
    raise exception 'Visualizar permitió eliminar por RPC';
  exception when insufficient_privilege then null; end;
  assert public.acceso_fila('archivos', '{"entidad_tipo":"vehiculo","entidad_id":"a2000000-0000-4000-8000-000000000001"}', false), 'No se pudo leer adjunto autorizado';
  assert not public.acceso_fila('archivos', '{"entidad_tipo":"vehiculo","entidad_id":"a2000000-0000-4000-8000-000000000001"}', true), 'Lectura documental permitió subir archivos';
  assert not public.acceso_fila('vinculos', '{"origen_tipo":"vehiculo","origen_id":"a2000000-0000-4000-8000-000000000001","destino_tipo":"predio","destino_id":"a2000000-0000-4000-8000-000000000001"}'), 'Una relación expuso un área oculta';
  assert not public.es_admin(), 'Administrar un área elevó el rol global';
end;
$$;

-- El cambio de rol conserva excepciones significativas y elimina las que pasan
-- a ser iguales al nuevo rol.
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.cambiar_rol_usuario('a1000000-0000-4000-8000-000000000002','tesoreria');
do $$
begin
  assert not exists (select 1 from public.permisos_usuario where usuario_id = 'a1000000-0000-4000-8000-000000000002' and seccion = 'predios'), 'El cambio de rol dejó una excepción redundante';
  assert exists (select 1 from public.permisos_usuario where usuario_id = 'a1000000-0000-4000-8000-000000000002' and seccion = 'vehiculos' and nivel = 'administrar'), 'El cambio de rol borró una excepción vigente';
  begin
    perform public.cambiar_rol_usuario(auth.uid(), 'tesoreria');
    raise exception 'Un administrador logró rebajar su propio rol';
  exception when insufficient_privilege then null; end;
end;
$$;
select public.cambiar_rol_usuario('a1000000-0000-4000-8000-000000000002','soporte_documentario');

-- Revocación y restauración a valores del rol.
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.guardar_permisos_usuario('a1000000-0000-4000-8000-000000000002','{"vehiculos":"sin_acceso","documentos":"sin_acceso"}');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$
begin
  assert not exists (select 1 from public.vehiculos), 'La revocación no ocultó Vehículos';
  assert not public.acceso_fila('archivos','{"entidad_tipo":"vehiculo","entidad_id":"a2000000-0000-4000-8000-000000000001"}'), 'La revocación no ocultó adjuntos';
end;
$$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.guardar_permisos_usuario('a1000000-0000-4000-8000-000000000002','{}');
update public.perfiles set activo = false where id = 'a1000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$ begin assert public.nivel_area('vehiculos') = 'visualizar', 'No se restauró el rol'; end; $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
do $$ begin
  assert public.nivel_area('contratos') = 'sin_acceso', 'La cuenta inactiva retuvo acceso';
  assert not exists (select 1 from public.contratos), 'RLS permitió acceso a cuenta inactiva';
end; $$;

rollback;
