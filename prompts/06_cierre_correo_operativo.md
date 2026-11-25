# Encargo: cerrar los avisos automáticos de Microsoft 365

Continúa en `georgenton/fundacion-bienestar-emocional`. El respaldo periódico y la sonda externa ya tienen evidencia de ejecución real. Completa la identidad de correo, la recepción de avisos y la activación del monitor del host usando los componentes existentes.

## 1. Estado y autorización

Lee `AGENTS.md`, README, `docs/11_autorizaciones_codex_y_publicacion.md` y el estado actual de `docs/15_operacion_y_recuperacion_staging.md`. Conserva el repositorio privado del Mac y cualquier trabajo local. Actualiza el clon público desde `origin/main` sin perder cambios.

La auditoría partió de `d956a31dbb71e3d18199f04e0eb3ce72e00c8b7b`, con las PR #15–#17 fusionadas y CI aprobado. El ejecutor OVH tiene los scripts `cbfb452…`; la aplicación sigue en `0de373ac…`. Comprueba estos hechos y las revisiones posteriores antes de actuar. El respaldo permanece programado a las 07:00 y 19:00 de Ecuador y el Cron público cada cinco minutos.

La autorización vigente incluye completar la aplicación de tenant único, asignar el permiso de envío al buzón corporativo de Syntavera ya verificado, guardar los secretos en sus almacenes y enviar los avisos técnicos de prueba. Usa el buzón y los identificadores del inventario privado existente. No repitas una confirmación general. La restricción de costo adicional sigue siendo US$0.

Mantén activos el respaldo y la sonda durante el cierre de Microsoft. No reconstruyas R2, la sonda ni otro transporte de correo. Ya existen `scripts/devops/staging-graph-mail.py` y `sendNotice()` en `infra/cloudflare/staging-public-monitor.mjs`.

## 2. Preparar el acceso antes de abrir la autenticación

Inspecciona el registro incompleto de Entra y reutiliza los recursos correctos de FBE; evita duplicar aplicaciones, scopes o asignaciones. Identifica el tenant, el client ID, el ObjectId del service principal de Enterprise Applications y el buzón aprobado. Ese ObjectId es distinto del objeto de App Registrations.

Comprueba las versiones instaladas de PowerShell y ExchangeOnlineManagement y su compatibilidad oficial. Reutiliza una combinación compatible. Prepara los nombres y comandos concretos de consulta y asignación antes de abrir el login.

En el Mac, prefiere la conexión interactiva normal:

```powershell
Connect-ExchangeOnline -UserPrincipalName <UPN-administrativo-verificado>
```

Sustituye el marcador con la cuenta comprobada, sin publicarla. Si el proveedor permite aprovechar una sesión existente, continúa. Si necesita una intervención manual o MFA, usa el mecanismo disponible de entrega de control del navegador y pide únicamente completar ese paso. Mantén viva la sesión de PowerShell que inició el proceso.

Usa `-Device` solamente si el modo interactivo no está disponible. Prepara todo primero y genera un único código nuevo cuando Jorge esté listo para completarlo; no generes códigos mientras realizas otras tareas. Un código vencido no requiere otra aplicación ni ampliar permisos.

Si la identidad autenticada carece de los roles necesarios, identifica el comando y permiso concreto que falta. No atribuyas ese bloqueo a una falta de autorización general de Jorge, ni concedas administración a la aplicación que enviará el correo.

## 3. Establecer y comprobar el alcance de envío

Completa la aplicación de tenant único y su referencia como service principal en Exchange. Define un scope que seleccione solo el buzón remitente aprobado. Puedes basarlo en el `ExternalDirectoryObjectId` verificado del buzón: comprueba que la previsualización del filtro devuelve exactamente ese objeto antes de asignar el rol.

Asigna `Application Mail.Send` a ese scope. Comprueba el resultado positivo para el buzón aprobado y negativo para otro buzón técnico del inventario autorizado, sin enviar correo al buzón de contraste. Usa únicamente un buzón de contraste existente y autorizado. Si no hay uno disponible, no crees otro ni inventes una denegación: conserva la comprobación de que el scope devuelve exactamente el buzón aprobado, registra esa limitación y completa las tareas independientes. Revisa por separado las concesiones Entra: `Test-ServicePrincipalAuthorization` no incluye esos permisos adicionales y un `Mail.Send` global ampliaría el acceso.

El scope limita el remitente; los adaptadores fijan el mismo buzón como destinatario. Conserva ese comportamiento. No añadas permisos de lectura de correo ni acceso administrativo al proceso de envío.

Respeta la propagación de permisos de Microsoft antes de concluir que la asignación falló. Si persiste el rechazo, diagnostica la configuración conservando el mismo buzón y permiso autorizados. Si todavía no surte efecto, informa el estado y continúa las tareas independientes; no mantengas una espera bloqueante ni interpretes un 403 inmediato como necesidad de dar permisos globales.

## 4. Configurar los dos ejecutores

En OVH, completa la configuración privada que systemd entrega al transporte como credencial `graph`, con los campos `tenant`, `client`, `mailbox` y `client_secret`. Conserva permisos de propietario y evita imprimir el contenido.

En el Worker público, configura `FBE_GRAPH_TENANT`, `FBE_GRAPH_CLIENT`, `FBE_GRAPH_MAILBOX` y el secreto `FBE_GRAPH_CLIENT_SECRET`. Registra vencimiento, custodia y rotación. No copies credenciales R2 al monitor público.

Si guardar la configuración publica una versión del Worker, confirma que conserva el archivo aprobado, `scheduled()`, Cron y el binding KV. Usa el código versionado, no un borrador de diagnóstico del editor. Mantén deshabilitadas las URLs de vista previa.

## 5. Comprobar recepción y habilitar el monitor del host

Conserva los IDs y fechas de los avisos históricos pendientes en KV. Representan el fallo y la recuperación de la propia sonda durante su configuración, no una caída acreditada de la aplicación. Identifícalos como tales en la evidencia.

Comprueba la recepción real de un aviso de fallo y otro de recuperación desde cada ejecutor. El Worker puede entregar la pareja histórica identificada; observa su salida por el Cron y su llegada a Outlook. Para el monitor del host, usa una sonda o estado de ensayo aislado de FBE que genere las transiciones sin apagar la aplicación, la base ni servicios compartidos.

Un `202` solo acredita aceptación de Graph. Comprueba los mensajes recibidos por ID y origen. Observa que un estado estable no crea eventos nuevos y que un rechazo controlado conserva el evento para reintento. Reutiliza la política de 5/15/60 minutos y luego una hora; reconoce los posibles duplicados tras una respuesta perdida.

Habilita `fbe-staging-monitor@host.timer` después de comprobar su transporte. Observa una ejecución programada con la configuración definitiva y registra último/próximo disparo. Confirma también una ejecución normal del Cron público después de entregar los avisos pendientes.

KV aporta persistencia con consistencia eventual; no presentes esta sonda de staging como una cola transaccional ni prometas conservación de todas las transiciones bajo ejecuciones superpuestas. Esa limitación no exige otra plataforma para completar este encargo.

## 6. Evidencia y cierre

Actualiza `docs/15` con aplicación y alcance descritos sin secretos, comprobación positiva/negativa, revisión de permisos Entra, vencimiento y custodia, configuración de ambos ejecutores, recepción por ID y estado de los timers. Distingue evidencia del proveedor, pruebas con sustitutos y cualquier pendiente.

Publica los cambios necesarios mediante PR y respeta los controles obligatorios. No repitas la restauración o las pruebas reales de R2 ya comprobadas sin un riesgo nuevo. No promociones imágenes ni modifiques PostgreSQL por este cierre de correo.

Conserva la revisión de cuota asignada a Jorge para el **30 de noviembre de 2026 antes de las 18:00 de Ecuador**. La vigencia actual del control del emisor termina a las 19:00 de ese día; no la prolongues sin comprobar el consumo. La credencial padre tiene otro vencimiento, el 25 de mayo de 2027.

Entrega qué quedó configurado, habilitado y recibido, con PR/CI y evidencia. Si un acceso o permiso impide terminar, informa la acción exacta pendiente y el mínimo paso que debe completar el titular. No declares recibido un aviso por tenerlo en cola o por haber obtenido un token.

Fuentes oficiales: [Conexión interactiva de Exchange](https://learn.microsoft.com/en-us/powershell/exchange/connect-to-exchange-online-powershell?view=exchange-ps), [compatibilidad del módulo](https://learn.microsoft.com/powershell/exchange/exchange-online-powershell-v2?view=exchange-ps), [Application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac), [propiedades filtrables](https://learn.microsoft.com/en-us/powershell/exchange/recipientfilter-properties?view=exchange-ps), [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).
