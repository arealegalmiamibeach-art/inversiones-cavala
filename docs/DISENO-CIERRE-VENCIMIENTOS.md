# Cierre de vencimientos — diseño

Pedido del cliente (video de WhatsApp del 2026-09-26): en el dashboard, los
contratos ya vencidos siguen apareciendo como recordatorio aunque ya
terminaron. Quiere hacer lo mismo que con las diligencias: marcar qué pasó con
el contrato (se renovó, se extendió, se resolvió, no se renovó) y que deje de
aparecer en las alertas.

Alcance acordado: **cerrar un vencimiento con un resultado y una nota**. No es
"editar todo desde el dashboard" ni copiar el panel de diligencias.

## Qué pasa hoy

- `src/lib/alertas.ts` → `getAlertas()` es la única fuente. De ahí salen el
  widget "Vencimientos" del dashboard, la campana y el correo diario
  (`alertas/resumen-correo.ts`).
- Cada alerta se identifica con `<clave>-<id>`: `contrato-…`, `soat-…`,
  `poliza-…`, `personal-…`, `documento-…` y `propiedad-<prop>-<entidad>`. La
  fecha la calcula la fuente.
- Lo vencido se muestra durante `DIAS_VENCIDOS = 30` días y después
  desaparece solo. Mientras tanto no hay forma de sacarlo.
- En la base viva hoy: 7 contratos vencidos en los últimos 30 días y 18 que
  vencen en los próximos 60. Además, 30 contratos tienen `estado = 'VIGENTE'`
  aunque su fecha ya pasó: el `estado` que vino de Notion no sirve para
  decidir nada.

## Modelo

Una tabla nueva y chica. No se toca `contratos.estado`, que es texto libre de
Notion con valores mezclados.

```sql
create table public.vencimientos_cierres (
  alerta_id    text not null,   -- mismo id que genera alertas.ts ("contrato-<uuid>", "soat-<uuid>"…)
  fecha        date not null,   -- la fecha de vencimiento que se está cerrando
  entidad_tipo text not null,   -- tabla dueña: contratos | vehiculos | personal | documentos | predios…
  entidad_id   uuid not null,
  resultado    text not null,   -- vocabulario de abajo
  nota         text,            -- ≤ 500; obligatoria si resultado = 'OTRO'
  cerrado_por  uuid default auth.uid() references perfiles(id) on delete set null,
  cerrado_en   timestamptz not null default now(),
  primary key (alerta_id, fecha)
);
```

**La clave lleva la fecha, a propósito.** Un cierre vale sólo para *ese*
vencimiento. Si alguien cambia la fecha (el SOAT renovado pasa al año
siguiente, se corrige el vencimiento de un contrato), la alerta nueva no está
cerrada y vuelve a avisar. La campana ya se comporta así: su id de leído
incluye la fecha.

Consecuencia aceptada: en documentos la fecha se calcula como emisión + "días
de vigencia" (Fechas y avisos). Si un admin cambia esos días, lo cerrado
vuelve a aparecer con la nueva fecha.

### Vocabulario

| Valor        | Etiqueta            | Aplica a                                  |
|--------------|---------------------|-------------------------------------------|
| `RENOVADO`   | Se renovó           | todos                                     |
| `PRORROGADO` | Se prorrogó         | contratos, personal                       |
| `CONCLUIDO`  | No se renueva       | todos (cumplió su plazo, vendido, de baja…) |
| `RESUELTO`   | Se resolvió         | contratos, personal (terminó antes de tiempo) |
| `OTRO`       | Otro (con nota)     | todos                                     |

Es cerrado como el de diligencias, con `OTRO` + nota como salida. Se guarda
como texto con un `check`. Si más adelante se quiere un catálogo editable, se
cambia el `check` sin migrar datos.

### Permisos (RLS, mismo patrón que `historial` tras la auditoría)

- **Lectura:** `es_admin()` o (el área de `entidad_tipo` está en
  `privado.areas_con_acceso(false)` y `privado.entidad_visible(entidad_tipo, entidad_id)`).
  Así, un cierre de un tipo de contrato que el usuario no ve tampoco se ve.
- **Alta y baja (reabrir):** lo mismo con `areas_con_acceso(true)`. Quien
  puede editar el registro, puede cerrar su vencimiento.
- No hay UPDATE: cambiar el resultado es reabrir y volver a cerrar. La tabla
  no tiene papelera, así que el DELETE directo es correcto (reabrir).
- El cron del correo usa la service role y lee todo. Es lo que se quiere.

## Comportamiento

- **Se puede cerrar antes de vencer.** Si el contrato de personal "JULIO 2026"
  ya se renovó, se marca desde la lista de próximos y deja de avisar.
- **`getAlertas()`** lee los cierres de la ventana `[hoy-30, hoy+60]` en una
  sola consulta y adjunta `cierre?: { resultado, nota, cerradoPor, cerradoEn }`
  a cada alerta que corresponda. Los consumidores se quedan con las abiertas:
  - **campana** (`normalizarAlertas`) → sólo abiertas;
  - **correo diario** → sólo abiertas;
  - **dashboard** → abiertas arriba como hoy, más una sección plegada
    **"Cerrados (n)"** al final, con el resultado y el botón *Reabrir*. Esto
    permite deshacer un error y responde "¿por qué ya no aparece?".
- **Calendario:** al desplegar un día, cada vencimiento trae su botón
  "Registrar qué pasó" (y también el popover del evento). Lo cerrado sigue en
  su día —el calendario es registro de fechas— tachado y atenuado, con el
  resultado, la nota y *Reabrir*. El id del evento se traduce al de la alerta
  (`alertaIdDeEvento`), así que cerrar aquí es cerrar la misma alerta.
- **Ficha del contrato:** junto a la vigencia, una franja con el estado del
  vencimiento actual: "Registrar qué pasó" si está abierto, o
  "Se renovó · nota · por <usuario>, 29 sep" con *Reabrir* si está cerrado.
- **Historial:** cerrar y reabrir se registran con `registrarEvento()` sobre
  la entidad (campo sintético `vencimiento`). Aparecen en "Editado hace…" de
  la ficha.
- **Degradación:** si la migración todavía no está aplicada, la lectura de
  cierres falla con 42P01. Se trata como "no hay cierres" y todo sigue igual
  que hoy.

- **Diligencias en el calendario** (añadido después): las diligencias con o
  sin expediente también se cierran desde el panel del día y el popover, con
  su propio vocabulario (Realizada, Reprogramada, Incumplida, Cancelada) y la
  misma acción `cerrarEvento` de la ficha del proceso. La decisión de qué
  mostrar vive en `estadoCierreEvento()` (`lib/calendario.ts`), con pruebas.

## UI

- `VencimientosWidget` sale de `dashboard/page.tsx` a un componente cliente
  (`src/components/ui/vencimientos-widget.tsx`).
- `AlertaRow`: el enlace sigue ocupando la fila y se agrega a la derecha un
  botón con ✓, **"Registrar qué pasó"**. En "Ya vencidos" se ve siempre, en
  rojo tenue como en diligencias. En próximos aparece al pasar el mouse. Todo
  lo clickeable lleva `:hover` visible.
- Al hacer clic se abre debajo de la fila un panel con el mismo lenguaje
  visual que `CierreDiligencia`: chips de resultado (filtrados por origen),
  campo "Qué pasó (opcional): motivo, nuevo contrato, adenda…" y botones
  *Cerrar* / *Cancelar*.
- Server actions en `src/lib/actions/vencimientos.ts`:
  `cerrarVencimiento({ alertaId, fecha, resultado, nota })` y
  `reabrirVencimiento({ alertaId, fecha })`. Validan el formato del id, que la
  fecha sea ISO y el vocabulario. La entidad **se deriva del `alertaId` en el
  servidor**, no se confía en lo que manda el cliente. Revalidan `/dashboard`
  y la ficha.

## Fuera de este cambio

- Cambiar la fecha al renovar: "Se renovó → nueva fecha" que actualice
  `soat_vence` / `contrato_fin`. En contratos las renovaciones son filas
  nuevas o adendas, así que no aplica igual en todos lados.
- Franja de cierre en las fichas de vehículo, personal y documento. Desde el
  dashboard ya se cierra y se reabre cualquier tipo.
- Usar el cierre para corregir `contratos.estado`.

## Pruebas (`tests/nucleo/`)

- `alertaId` → `{ entidadTipo, entidadId }` para todas las claves, incluida
  `propiedad-<p>-<e>`, y rechazo de ids mal formados.
- Vocabulario por origen y regla "OTRO exige nota".
- Emparejado alerta ↔ cierre por `(alerta_id, fecha)`: un cierre con otra
  fecha no cierra.
- Campana y correo no incluyen alertas con `cierre`.

## Entrega

1. Migración `supabase/migrations/<ts>_vencimientos_cierres.sql`: tabla,
   `check`s, RLS, índice por `fecha`. Se prueba contra la base real en una
   transacción revertida.
2. `alertas.ts` + consumidores + tests.
3. Widget, panel de cierre, franja en la ficha del contrato y calendario
   atenuado.
4. `npm run dev` y revisión en local. Después `npm run build`.
5. Commit, push, `supabase db push` **sólo con autorización explícita**,
   `vercel --prod --yes`.

Estimado: 2 a 2,5 días con el calendario.
