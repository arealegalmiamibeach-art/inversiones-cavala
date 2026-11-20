# Investigación de mercado: correo transaccional sin Gmail ni dominio propio

**Fecha de corte:** 9 de septiembre de 2026

**Sistema evaluado:** Inversiones Cavala (Next.js, Supabase, Vercel)
**Objetivo:** enviar invitaciones, creación y recuperación de contraseña, avisos de seguridad y resúmenes de alertas a direcciones arbitrarias, sin abrir una cuenta de correo Gmail y, si es posible, sin comprar o verificar un dominio propio.

## Alcance y método

Se revisaron documentación, precios, límites, requisitos de identidad y repositorios oficiales vigentes al corte indicado. Se priorizaron APIs transaccionales y plataformas de notificaciones que pudieran integrarse desde el backend actual. No se abrieron cuentas nuevas ni se ejecutaron campañas reales; por eso la colocación en bandeja, el encabezado final que renderiza cada cliente y cualquier límite mostrado solo dentro del panel deben validarse mediante un piloto.

## Resumen ejecutivo

Sí existen APIs que entregan un remitente compartido o administrado y permiten enviar a usuarios reales sin usar Gmail ni poseer un dominio. Sin embargo, **no encontré una opción madura y generalmente disponible que el propio proveedor recomiende para correos críticos de producción bajo esas dos restricciones**. En septiembre de 2026 las alternativas que más se acercan son:

1. **Wix Email Transmissions API**, lanzada en julio de 2026. Puede enviar HTML transaccional a direcciones arbitrarias y usar como remitente compartido `no-reply@wixsitemail.com`, con un nombre visible configurable. Es el ajuste literal más cercano, pero hoy sigue marcada como **Developer Preview**, sujeta a cambios y no apropiada como dependencia crítica de producción.[^3][^4]
2. **Azure Communication Services Email con Azure Managed Domain**, que crea gratis un remitente autenticado como `DoNotReply@<uuid>.azurecomm.net`, sin DNS ni dominio propio. Es una API/SMTP sólida, pero Microsoft limita el dominio administrado a 5 envíos por minuto y 10 por hora, sin aumentos, y declara que está destinado únicamente a pruebas.[^5][^6]
3. **Proveedores de prueba integrados en plataformas de notificaciones**, como Novu, Courier y Engagespot. Sirven para demostraciones, no para resolver el correo de producción. En Novu, además, el repositorio oficial muestra que Novu Email se aprovisiona solo en Development, usa `no-reply@novu.co`, tiene un máximo predeterminado de 300 emails y puede restringirse al correo del dueño de la cuenta.[^1][^25]

La conclusión importante es que **no hay una opción madura que reúna al mismo tiempo producción crítica, envío arbitrario, remitente empresarial personalizado, buena entregabilidad y cero dominio/cero identidad de correo**. Los servicios evitan esa combinación por abuso y reputación. Google exige autenticación SPF o DKIM incluso a remitentes pequeños y advierte que ningún proveedor puede garantizar que un mensaje no termine en spam.[^7]

### Recomendación para Cavala

**Para una producción responsable:** no aprobar hoy ninguna solución “cero Gmail + cero dominio” como único canal de invitación o recuperación. Hay que relajar al menos una condición: verificar un buzón existente con SMTP2GO/Brevo/Mailjet/Amazon SES, o usar un dominio propio con Resend.

**Si el cliente insiste y acepta el riesgo:** hacer un piloto aislado con **Wix Email Transmissions API**, detrás de la abstracción de correo actual para poder reemplazarla fácilmente. Es la única API encontrada que documenta simultáneamente destinatarios arbitrarios, HTML transaccional, nombre visible configurable y un remitente compartido predeterminado. No debe presentarse como una garantía de producción mientras siga en Developer Preview.[^3][^4]

**Plan alternativo de muy bajo volumen:** Azure Managed Domain si Cavala genera como máximo 10 operaciones de envío por hora. Es más transparente respecto al remitente y puede conectarse también por SMTP, pero Microsoft no lo recomienda para producción y su límite por hora no puede ampliarse sin pasar a dominio propio.[^5][^6]

## Qué se verá como remitente

| Opción | Nombre visible | Dirección visible aproximada | ¿Se puede responder? |
|---|---|---|---|
| Novu Email (solo prueba) | `Novu` en las credenciales internas predeterminadas | `no-reply@novu.co` | No es la opción de producción; se reemplaza conectando otro proveedor[^25] |
| Wix Email Transmissions | Configurable como `Inversiones Cavala` | `no-reply@wixsitemail.com` cuando se usa el remitente compartido | Sí, si se proporciona y verifica un correo de respuesta; si se omite, el envío puede usar el remitente Wix predeterminado[^3] |
| Azure Managed Domain | El recurso admite un display name; se debe validar en el cliente de correo | `DoNotReply@<uuid>.azurecomm.net`; el dominio y nombre de usuario no pueden personalizarse[^5] | Sí, mediante `Reply-To` en el mensaje/API |
| Brevo/Mailjet/SMTP2GO con remitente individual | Nombre configurable | La dirección que se verificó, pero puede aparecer “via” el proveedor o ser sustituida por una identidad compartida | Sí |
| Resend sin dominio | `Inversiones Cavala` | `onboarding@resend.dev` | Solo sirve para pruebas dirigidas al dueño de la cuenta[^8] |

Ninguna opción sin dominio propio mostrará algo tan limpio y controlable como `Inversiones Cavala <notificaciones@cavala.pe>`. El nombre visible puede decir “Inversiones Cavala”, pero la dirección técnica seguirá perteneciendo al proveedor.

## Comparativa de mercado

| Proveedor / modalidad | Sin Gmail | Sin dominio propio | Envía a cualquier usuario | API / SMTP | Límite o plan relevante | Evaluación para Cavala |
|---|---:|---:|---:|---|---|---|
| **Novu Cloud + Novu Email** | Sí | Sí | **No para producción** | API/SDK | Proveedor demo: 300 emails predeterminados y solo Development en el código oficial[^25] | Descartado como transportista final. Novu sí puede orquestar notificaciones, pero exige conectar Resend/SES/Mailjet/etc. para producción. |
| **Courier / Engagespot predeterminados** | Sí | Sí | Solo prueba | API/SDK | Courier declara que su proveedor integrado funciona en Test mode; Engagespot describe sus defaults para probar[^26][^27] | Descartados como transportistas de producción sin proveedor externo. |
| **Wix Email Transmissions** | Sí | Sí | Sí, acepta emails crudos y hasta 100 destinatarios por transmisión[^3] | REST/SDK | Plan Wix Email Marketing; referencia gratuita de 200 emails/mes[^9] | Muy buen ajuste funcional, remitente `no-reply@wixsitemail.com`; **no usar aún para acceso crítico porque está en Developer Preview**.[^4] |
| **Azure Communication Services, dominio administrado** | Sí | Sí | Sí | API/SDK y SMTP | 5/minuto, 10/hora, 50 destinatarios por mensaje; sin aumento[^6] | Buen piloto interno de muy bajo volumen. Microsoft dice que el dominio administrado es solo para pruebas.[^5] |
| **SMTP2GO, Single Sender** | Sí, si ya existe cualquier buzón verificable | Sí | Sí | API y SMTP | Gratis: 1 000/mes y 200/día[^10] | Viable si el cliente posee algún correo que pueda confirmar. Puede verse “via smtpcorp.com” y un DMARC estricto puede bloquearlo.[^11] |
| **Brevo, sender individual** | Sí, si existe cualquier buzón verificable | Sí | Sí | API y SMTP | Gratis: 300/día[^12] | Fácil y conocido, pero exige confirmar un correo remitente. Sin autenticar el dominio baja la confianza y el plan gratis añade marca Brevo. |
| **Mailjet, sender individual** | Sí, si existe cualquier buzón verificable | Sí | Sí | API y SMTP | Gratis: 6 000/mes, máximo 200/día[^13] | Similar a Brevo; Mailjet advierte que usar correo público como remitente aumenta spam o no entrega.[^14] |
| **Amazon SES, identidad de email** | Sí, con cualquier buzón verificable | Sí | Sí, después de aprobación de producción | API y SMTP | En sandbox solo destinatarios verificados, 200/día; producción requiere solicitud[^15] | Económico y robusto, pero configuración más compleja. Sin verificar el dominio no hay DKIM propio para la identidad individual.[^16] |
| **Resend `resend.dev`** | Sí | Sí | **No** | API y SMTP | Solo al correo propietario de la cuenta durante pruebas[^8] | Descartado para los usuarios reales de Cavala. Con dominio propio sí sería la opción más sencilla para el código actual. |
| **Mailgun sandbox** | Sí | Sí | **No** | API y SMTP | Solo destinatarios autorizados; para producción se añade dominio propio[^17] | Descartado. |
| **Postmark** | Sí | No en la práctica | Sí | API y SMTP | Exige firmas/dominios; no permite verificar Gmail/Yahoo como remitente[^18] | Excelente transaccional con dominio, no cumple el requisito actual. |
| **SendGrid Single Sender** | Sí, con buzón verificable | Sí para pruebas | Limitado / no recomendable | API | Single Sender es para pruebas; se recomienda Domain Authentication[^19] | Descartado para correos críticos de producción. |
| **Supabase SMTP predeterminado** | Sí | Sí | **No de forma útil** | Integrado en Auth | Solo direcciones autorizadas del equipo, 2 emails/hora, sin SLA[^20] | No resuelve invitaciones/recuperaciones de usuarios externos. |
| **Firebase/Cognito con remitente predeterminado** | Sí | Sí | Solo sus propios flujos de autenticación | SDK de Auth | Límites del servicio de identidad | No resuelven alertas generales y obligarían a reemplazar Supabase Auth. Cognito, por ejemplo, usa `no-reply@verificationemail.com` y reconoce que su cuota predeterminada no suele servir para producción.[^21] |

## Análisis de las opciones más cercanas

### 1. Wix Email Transmissions API

La API puede enviar contenido HTML personalizado, admite el tipo `TRANSACTIONAL`, direcciones arbitrarias, seguimiento por destinatario e idempotencia. Cuando no se proporciona un remitente usable, el objeto documenta como valor predeterminado `no-reply@wixsitemail.com`; `senderName` acepta hasta 50 caracteres.[^3]

Ventajas:

- encaja exactamente con el modelo actual de Cavala: asunto + HTML + lista de destinatarios;
- el remitente se vería como `Inversiones Cavala <no-reply@wixsitemail.com>` si Wix conserva el nombre configurado;
- permite comprobar estados y fallos por destinatario;
- se puede llamar desde Vercel con API key y Site ID para automatización servidor-a-servidor.[^23]

Riesgos:

- requiere una cuenta y un sitio Wix aunque la aplicación siga alojada en Vercel;
- la API se lanzó el 21 de julio de 2026 y está en Developer Preview: puede cambiar y las APIs en preview no se consideran listas para producción;[^4]
- los envíos cuentan contra la cuota del sitio según la documentación de la API; la ayuda de Wix publica 200 emails/mes en el plan gratuito, pero algunas excepciones para transaccionales dependen de que sean automatizaciones de apps, no necesariamente transmisiones directas;[^3][^9]
- si se desea un `Reply-To` propio hay que verificar un correo receptor.

**Veredicto:** alternativa técnicamente atractiva, pero demasiado reciente para recuperación de contraseña. Revaluar cuando Wix anuncie disponibilidad general y publique límites/SLAs definitivos.

### 2. Azure Communication Services Email

Azure crea con un clic un subdominio autenticado sin cobrar por aprovisionarlo y configura la autenticación necesaria. La dirección queda como `DoNotReply@<uuid>.azurecomm.net`.[^5]

Ventajas:

- no necesita ningún buzón Gmail ni validación DNS;
- API/SDK directo y SMTP estándar;
- el remitente pertenece a un dominio autenticado y administrado por Microsoft;
- Supabase puede apuntar a un SMTP externo, de modo que podrían unificarse tanto emails Auth como alertas de Cavala.[^20]

Riesgos:

- máximo 10 operaciones de envío por hora y 5 por minuto, sin posibilidad de aumento con el dominio administrado;[^6]
- Microsoft lo denomina explícitamente una modalidad de prueba, no de producción;[^5]
- el remitente técnico es largo y no personalizable;
- configurar Azure Communication Services, Email Communication Services, el vínculo entre recursos y credenciales Entra/SMTP es más laborioso que una sola API key.[^24]

**Veredicto:** respaldo aceptable para un piloto interno de volumen muy bajo. No debe presentarse al cliente como solución definitiva de producción.

### 3. Novu, Courier y Engagespot

Estas plataformas son orquestadores de notificaciones: permiten flujos, preferencias, digest, inbox y varios canales. Son útiles cuando un producto necesita esa capa, pero no eliminan el problema del transportista de correo en producción.

- Novu documenta un proveedor predeterminado, pero su código oficial lo crea solo para el entorno Development. Las credenciales internas usan `no-reply@novu.co`, el límite predeterminado es 300 y existe una restricción opcional para enviar únicamente al email del usuario conectado.[^25]
- Courier dice explícitamente que su proveedor integrado funciona sin configuración en **Test mode**; para producción se conecta SendGrid, SES, Mailgun u otro proveedor.[^26]
- Engagespot presenta sus proveedores predeterminados como una forma de **probar** canales y su documentación actual de producción indica que se deben aportar credenciales de un tercero.[^27]

**Veredicto:** no solucionan el requisito de envío productivo sin dominio/buzón. Añadir uno de ellos solo tendría sentido si Cavala necesita también inbox interno, preferencias avanzadas, digest multicanal y fallbacks.

## Encaje con el código actual de Cavala

El proyecto ya abstrae el envío en `src/lib/email/resend.ts`: recibe `to`, `subject`, `html` y `replyTo`. Por eso cambiar a Wix o Azure es localizado. No hace falta reescribir la generación de alertas.

Hay, sin embargo, trabajo funcional pendiente con independencia del proveedor:

1. Separar plantillas para:
   - invitación / creación de contraseña;
   - recuperación de contraseña;
   - confirmación de contraseña cambiada;
   - alertas y resúmenes diarios;
   - opcionalmente cuenta creada, correo cambiado y acceso sospechoso.
2. Unificar el flujo público de “olvidé mi contraseña”. Actualmente usa el envío predeterminado de Supabase, mientras la administración genera enlaces y los manda por Resend. Si se escoge una API sin SMTP, como Wix, el servidor debe generar el enlace de recuperación con Supabase y entregarlo mediante esa API.
3. Registrar estado de entrega e idempotencia para no duplicar invitaciones o alertas.
4. No poner a todos los usuarios en `To` si no deben ver las direcciones de los demás; enviar individualmente o usar BCC cuando el contenido sea idéntico.
5. Añadir texto plano además de HTML, URLs de producción correctas, expiración coherente y pruebas de enlaces de un solo uso.

## Riesgo de spam: respuesta directa

Nadie puede prometer “no saldrá en spam”. Google dice expresamente que no garantiza que el correo de proveedores pase sus filtros. Exige SPF o DKIM a todos los remitentes y recomienda ambos más DMARC; también evalúa reputación, quejas, contenido, enlaces y conducta de envío.[^7]

Un dominio compartido autenticado por Novu, Wix o Azure resuelve la autenticación técnica del dominio del proveedor, pero Cavala hereda parcialmente su reputación y no construye una identidad propia. Para correos de seguridad, las mejores prácticas siguen siendo:

- enviar solo mensajes esperados por usuarios reales;
- mantener nombre, asunto y enlaces claros y coherentes;
- evitar acortadores, adjuntos innecesarios y mensajes masivos con destinatarios visibles;
- capturar rebotes y detener envíos a direcciones inválidas;
- probar Gmail, Outlook y el dominio corporativo del cliente antes de activar producción;
- si el correo se vuelve crítico, pasar finalmente a un dominio propio autenticado.

## Decisión propuesta

### Si el cliente mantiene “sin Gmail y sin dominio”

1. Explicar por escrito que no existe una alternativa madura recomendada por su proveedor bajo ambas restricciones.
2. Si acepta el riesgo de preview, crear una cuenta y un sitio Wix mínimos; esto no cambia el hosting de Cavala.
3. Generar una API key limitada al sitio y al permiso de envío de email.
4. Hacer una prueba con `senderName: "Inversiones Cavala"`, sin `senderEmailAddress`, para que Wix use `no-reply@wixsitemail.com`.
5. Enviar pruebas a una dirección Gmail, una Outlook y una corporativa.
6. Confirmar que los enlaces Supabase de invitación y recuperación abren la pantalla correcta y permiten fijar contraseña.
7. Revisar el estado por destinatario, latencia, spam, cuota, términos y formato real del remitente.
8. Solo si el cliente acepta los resultados, integrar mediante un adaptador reemplazable y mantener un fallback operativo.
9. Si Wix rechaza el envío, cambia la API o no pasa entregabilidad, usar Azure solo como piloto de bajo volumen o solicitar un buzón/dominio verificable.

### Criterios de aceptación del piloto

- 20/20 mensajes aceptados por el proveedor;
- llegada a las tres familias de buzones probadas;
- remitente visible aceptado por el cliente;
- enlaces de invitación y recuperación válidos, de un solo uso y sin revelar secretos en logs;
- tiempo de entrega razonable para recuperación de contraseña;
- rebotes y errores observables;
- límites y costos confirmados dentro del panel/contrato vigente.

## Conclusión

**Sí hay APIs que técnicamente pueden enviar sin Gmail ni dominio, pero ninguna cumple hoy el estándar de una solución crítica y estable de producción.** Wix Email Transmissions es la novedad que mejor encaja como API directa, pero sigue en preview; Azure Managed Domain es el respaldo con remitente administrado más explícito, aunque Microsoft lo limita a pruebas. Los proveedores integrados de Novu, Courier y Engagespot también son de prueba.

Para Cavala, el camino sensato bajo la restricción absoluta es un piloto aislado de Wix, con una capa reemplazable y aceptación explícita del riesgo. Si el cliente exige garantía operativa para invitaciones y recuperación de contraseña, entonces su requisito de “sin dominio” entra en conflicto con la entregabilidad y estabilidad que pide: debe permitir verificar por lo menos un buzón existente o, preferentemente, un dominio propio con Resend/Postmark/SES.

## Fuentes

[^1]: Novu, [Adding Email Channel](https://docs.novu.co/platform/integrations/email/adding-email): proveedor Novu predeterminado y casos de uso del canal email.
[^2]: Novu, [Pricing](https://novu.co/pricing): 10 000 workflow runs/mes en Free, entornos Dev/Prod, branding y Pro desde USD 30/mes.
[^3]: Wix Developers, [About the Email Transmissions API](https://dev.wix.com/docs/api-reference/business-management/marketing/emails/email-transmission-v1/introduction) y [Email Transmission Object](https://dev.wix.com/docs/api-reference/business-management/marketing/emails/email-transmission-v1/email-transmission-object): destinatarios arbitrarios, email transaccional, remitente predeterminado, nombre visible, estados e idempotencia.
[^4]: Wix Developers, [Query Email Transmissions](https://dev.wix.com/docs/api-reference/business-management/marketing/emails/email-transmission-v1/query-email-transmissions) y [changelog del lanzamiento](https://dev.wix.com/changelog?featureType=SDK): estado Developer Preview y lanzamiento de julio de 2026.
[^5]: Microsoft Learn, [Add Azure Managed Domains](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/add-azure-managed-domains) y [Quota increase for email domains](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email/email-quota-increase): aprovisionamiento sin DNS, autenticación administrada y uso solo para pruebas.
[^6]: Microsoft Learn, [Service limits for Azure Communication Services](https://learn.microsoft.com/en-us/azure/communication-services/concepts/service-limits): 5 envíos/minuto, 10/hora, 50 destinatarios y sin aumento para dominio administrado.
[^7]: Google, [Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en): autenticación, reputación, spam y ausencia de garantía/allowlist para proveedores.
[^8]: Resend, [403 error when using the resend.dev domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain): dominio de prueba limitado al email propietario de la cuenta.
[^9]: Wix Help Center, [Email Marketing: Understanding Your Monthly Balance](https://support.wix.com/en/article/email-marketing-understanding-your-monthly-balance): 200 emails/mes en Free y reglas de balance.
[^10]: SMTP2GO, [Free Plan](https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan) y [Pricing](https://www.smtp2go.com/pricing/): 1 000 emails/mes y planes.
[^11]: SMTP2GO, [Verified Senders](https://support.smtp2go.com/hc/en-gb/articles/115004408567-Verified-Senders): Single Sender por confirmación, apariencia “via” y limitaciones DMARC.
[^12]: Brevo, [límites del plan Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) y [crear un remitente](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email): 300/día y verificación individual.
[^13]: Mailjet, [Pricing](https://www.mailjet.com/pricing/): API/SMTP y 6 000 emails/mes, 200/día en Free.
[^14]: Mailjet, [Why you should avoid free webmail as a sender address](https://documentation.mailjet.com/hc/en-us/articles/19308800104091-Why-you-should-avoid-free-webmail-as-a-sender-address): riesgo de spam/rechazo con remitentes públicos.
[^15]: Amazon Web Services, [Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html): sandbox, destinatarios verificados y proceso de acceso a producción.
[^16]: Amazon Web Services, [Creating identities](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html) y [DKIM](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim.html): identidad individual y limitación de DKIM sin dominio padre verificado.
[^17]: Mailgun, [How can I start sending email?](https://help.mailgun.com/hc/en-us/articles/202464990-How-can-I-start-sending-email): sandbox y destinatarios autorizados.
[^18]: Postmark, [Adding sender signatures](https://postmarkapp.com/support/article/adding-sender-signatures): firmas de remitente, dominio privado y restricciones para Gmail/Yahoo.
[^19]: Twilio SendGrid, [Verifying a Single Sender](https://support.sendgrid.com/hc/en-us/articles/7273212384283-Verifying-a-Single-Sender) y [Single Sender troubleshooting](https://support.sendgrid.com/hc/en-us/articles/18283315979931-Troubleshooting-The-from-address-does-not-match-a-verified-Sender-Identity-Error): modalidad de prueba y recomendación de autenticar dominio.
[^20]: Supabase, [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp): restricciones del servicio predeterminado y conexión de SMTP externo.
[^21]: Amazon Web Services, [Amazon Cognito Developer Guide](https://docs.aws.amazon.com/pdfs/cognito/latest/developerguide/cognito-dg.pdf): configuración de email predeterminada, remitente y cuotas.
[^22]: Novu, [API Rate Limiting](https://docs.novu.co/api-reference/rate-limiting): límites de disparo por plan.
[^23]: Wix Developers, [Make REST API Calls with an API Key](https://dev.wix.com/docs/develop-websites-sdk/code-your-site/authorization/make-rest-api-calls-with-an-api-key): API key y Site ID para clientes externos.
[^24]: Microsoft Learn, [Send email with SMTP](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/send-email-smtp/send-email-smtp) y [SMTP authentication](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/send-email-smtp/smtp-authentication): endpoint SMTP y credenciales Entra.
[^25]: Novu, repositorio oficial: [creación de la integración Novu Email](https://github.com/novuhq/novu/blob/next/apps/api/src/app/integrations/usecases/create-novu-integrations/create-novu-integrations.usecase.ts), [cálculo del límite](https://github.com/novuhq/novu/blob/next/libs/application-generic/src/usecases/calculate-limit-novu-integration/calculate-limit-novu-integration.usecase.ts) y [credenciales/restricción del proveedor](https://github.com/novuhq/novu/blob/next/libs/application-generic/src/usecases/get-novu-provider-credentials/get-novu-provider-credentials.usecase.ts): solo Development, 300 por defecto, `no-reply@novu.co` y posible restricción al usuario conectado.
[^26]: Courier, [Quickstart](https://www.courier.com/docs/getting-started/quickstart) y [Agent Quickstart](https://www.courier.com/docs/tools/agent-quickstart): proveedor integrado disponible en Test mode; las integraciones de producción usan proveedores externos.
[^27]: Engagespot, [Quick Setup](https://docs.engagespot.co/docs/1.4.x/introduction/quick-start/) y [Enabling a Channel](https://docs.engagespot.co/docs/features/channels/concepts/enabling-a-channel/): defaults para pruebas y credenciales externas para canales productivos.
