-- ============================================================
-- RLS: LO QUE NO DEPENDE DE LA FILA SE CALCULA UNA VEZ POR CONSULTA
-- ============================================================
-- Las políticas `acceso_*` llamaban a `acceso_fila()` (plpgsql) por cada fila,
-- con la fila entera serializada a jsonb, y ésta volvía a leer el rol y los
-- permisos del usuario en cada llamada. Medido en producción (23/09/2026),
-- sólo en RLS:
--
--   leer vinculos completo (6.272 filas): admin 0,8 s · Soporte 3,1 s
--   leer archivos completo (2.010 filas): admin 0,4 s · Soporte 0,8 s
--   leer documentos (926 filas):          admin 0,14 s · Soporte 0,17 s
--
-- Casi todo ese trabajo da el mismo resultado para todas las filas: el rol,
-- el nivel del usuario en cada área. Envuelto en `(select ...)` Postgres lo
-- evalúa una sola vez por consulta (InitPlan). Queda por fila sólo lo que de
-- verdad depende de ella: si la ficha enlazada existe y no está en la papelera.
--
-- Nadie ve ni puede editar nada distinto que antes: cada expresión nueva es
-- la misma regla que aplicaba `acceso_fila` para esa tabla.

-- ─── Piezas nuevas ──────────────────────────────────────────────────────
-- En un esquema propio: la API REST sólo expone `public`, así que no se
-- pueden llamar como RPC (`entidad_visible` diría si existe una ficha de un
-- área que el usuario no puede ver). Las políticas sí pueden usarlas.

create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated, service_role;

-- Áreas en las que el usuario actual puede leer (o escribir).
create or replace function privado.areas_con_acceso(p_escritura boolean default false)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(a), array[]::text[])
    from unnest(array['propietarios', 'predios', 'vehiculos', 'concesiones', 'personal',
                      'oficinas', 'procesos', 'documentos', 'contratos']) as a
   where public.acceso_area(a, p_escritura);
$$;

-- La parte de `acceso_entidad` que depende de la fila: la ficha existe, no
-- está en la papelera y, si es un contrato, su tipo es visible para quien
-- consulta. Consultas estáticas (plan en caché) en vez del `execute format`
-- anterior, que se volvía a planificar en cada fila.
create or replace function privado.entidad_visible(p_tipo text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  case p_tipo
    when 'propietario', 'propietarios' then
      return exists (select 1 from public.propietarios where id = p_id and eliminado_en is null);
    when 'predio', 'predios' then
      return exists (select 1 from public.predios where id = p_id and eliminado_en is null);
    when 'vehiculo', 'vehiculos' then
      return exists (select 1 from public.vehiculos where id = p_id and eliminado_en is null);
    when 'concesion', 'concesiones_mineras' then
      return exists (select 1 from public.concesiones_mineras where id = p_id and eliminado_en is null);
    when 'personal' then
      return exists (select 1 from public.personal where id = p_id and eliminado_en is null);
    when 'oficina_registral', 'oficinas_registrales' then
      return exists (select 1 from public.oficinas_registrales where id = p_id and eliminado_en is null);
    when 'proceso', 'procesos' then
      return exists (select 1 from public.procesos where id = p_id and eliminado_en is null);
    when 'evento', 'eventos' then
      return exists (select 1 from public.eventos where id = p_id and eliminado_en is null);
    when 'documento', 'documentos' then
      return exists (select 1 from public.documentos where id = p_id and eliminado_en is null);
    when 'contrato', 'contratos' then
      return exists (
        select 1 from public.contratos c
         where c.id = p_id and c.eliminado_en is null
           and public.acceso_tipo_contrato(c.tipo::text)
      );
    else
      -- Archivos y cualquier tabla sin papelera no cuentan como ficha.
      return false;
  end case;
end;
$$;

revoke all on function privado.areas_con_acceso(boolean), privado.entidad_visible(text, uuid) from public, anon;
grant execute on function privado.areas_con_acceso(boolean), privado.entidad_visible(text, uuid) to authenticated, service_role;

-- `acceso_entidad` conserva firma y resultado; ahora reutiliza la pieza nueva.
create or replace function public.acceso_entidad(p_tipo text, p_id uuid, p_escritura boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.acceso_area(public.area_entidad(p_tipo), p_escritura) then
    return false;
  end if;
  return privado.entidad_visible(p_tipo, p_id);
end;
$$;

-- ─── Políticas acceso_* ─────────────────────────────────────────────────
-- ALTER POLICY toca sólo la expresión de las políticas que existen; no
-- recrea ninguna quitada a propósito (p. ej. el DELETE directo de las tablas
-- con papelera).

do $$
declare
  p record;
  v_lectura text;
  v_escritura text;
  -- En `acceso_fila` estas tablas caen en la rama por defecto: la regla es
  -- sólo el nivel del área (`area_entidad(tabla)`), igual para todas las filas.
  -- Si algún día `acceso_fila` gana un caso por fila para una de ellas, su
  -- política tiene que volver a llamar a `acceso_fila`.
  v_por_area text[] := array['propietarios', 'predios', 'vehiculos', 'concesiones_mineras',
                             'personal', 'oficinas_registrales', 'procesos', 'eventos',
                             'documentos', 'tipos_documento_custom', 'tipos_propietario'];
begin
  for p in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and policyname in ('acceso_lectura', 'acceso_alta', 'acceso_edicion', 'acceso_baja')
  loop
    if p.tablename = any (v_por_area) then
      v_lectura := format('(select public.acceso_area(%L, false))', public.area_entidad(p.tablename));
      v_escritura := format('(select public.acceso_area(%L, true))', public.area_entidad(p.tablename));
    elsif p.tablename = 'contratos' then
      -- acceso_area('contratos') y `acceso_tipo_contrato(tipo)`: Tesorería sin
      -- "administrar" en Contratos sólo ve servicios, mutuo y arrendamiento.
      v_lectura := '(select public.acceso_area(''contratos'', false)) and ((select public.mi_rol()) <> ''tesoreria'' or (select public.nivel_area(''contratos'')) = ''administrar'' or tipo::text in (''servicios'', ''mutuo'', ''arrendamiento''))';
      v_escritura := '(select public.acceso_area(''contratos'', true)) and ((select public.mi_rol()) <> ''tesoreria'' or (select public.nivel_area(''contratos'')) = ''administrar'' or tipo::text in (''servicios'', ''mutuo'', ''arrendamiento''))';
    else
      -- Reglas por fila (archivos, vínculos, datos de empresa, propiedades
      -- personalizadas): el administrador se resuelve una vez; el resto sigue
      -- pasando por `acceso_fila`.
      v_lectura := format('(select public.es_admin()) or public.acceso_fila(%L, to_jsonb(%I), false)', p.tablename, p.tablename);
      v_escritura := format('(select public.es_admin()) or public.acceso_fila(%L, to_jsonb(%I), true)', p.tablename, p.tablename);
    end if;

    if p.policyname = 'acceso_lectura' then
      execute format('alter policy acceso_lectura on public.%I using (%s)', p.tablename, v_lectura);
    elsif p.policyname = 'acceso_alta' then
      execute format('alter policy acceso_alta on public.%I with check (%s)', p.tablename, v_escritura);
    elsif p.policyname = 'acceso_edicion' then
      execute format('alter policy acceso_edicion on public.%I using (%s) with check (%s)', p.tablename, v_escritura, v_escritura);
    else
      execute format('alter policy acceso_baja on public.%I using (%s)', p.tablename, v_escritura);
    end if;
  end loop;
end;
$$;

-- ─── Lectura de las tablas grandes con regla por fila ──────────────────
-- Misma regla que `acceso_fila(..., false)`, con el área calculada una vez:
--   archivos:  área Documentos + área de la ficha + la ficha existe.
--   vinculos:  área y existencia de las dos puntas.
--   historial: área de la tabla + el registro existe.
-- La escritura de estas tablas sigue por `acceso_fila` (afecta pocas filas).

alter policy acceso_lectura on public.archivos using (
  (select public.es_admin())
  or ((select public.acceso_area('documentos', false))
      and public.area_entidad(entidad_tipo::text) = any ((select privado.areas_con_acceso(false))::text[])
      and privado.entidad_visible(entidad_tipo::text, entidad_id))
);

alter policy acceso_lectura on public.vinculos using (
  (select public.es_admin())
  or (public.area_entidad(origen_tipo::text) = any ((select privado.areas_con_acceso(false))::text[])
      and public.area_entidad(destino_tipo::text) = any ((select privado.areas_con_acceso(false))::text[])
      and privado.entidad_visible(origen_tipo::text, origen_id)
      and privado.entidad_visible(destino_tipo::text, destino_id))
);

alter policy historial_lectura on public.historial using (
  (select public.es_admin())
  or (public.area_entidad(tabla) = any ((select privado.areas_con_acceso(false))::text[])
      and privado.entidad_visible(tabla, registro_id))
);

alter policy historial_insert_propio on public.historial with check (
  (select public.es_admin()) or public.acceso_fila('historial', to_jsonb(historial), true)
);
