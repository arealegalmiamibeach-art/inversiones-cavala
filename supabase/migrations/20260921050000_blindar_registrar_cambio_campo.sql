-- `registrar_cambio_campo` es SECURITY DEFINER y no valida quién la llama:
-- con el EXECUTE por defecto (PUBLIC), cualquiera podía invocarla por
-- /rest/v1/rpc/registrar_cambio_campo y escribir en `historial` un cambio
-- falso con el actor, nombre y correo que quisiera.
--
-- Sólo la usa el trigger `registrar_historial()`, que también es SECURITY
-- DEFINER y corre como el dueño de la función, así que quitar el acceso
-- directo no afecta al historial real.
revoke execute on function public.registrar_cambio_campo(text, uuid, text, text, text, uuid, text, text, interval)
  from public, anon, authenticated;
