# Encargo: completar la activación operativa de staging

Continúa en `georgenton/fundacion-bienestar-emocional`. El objetivo es dejar funcionando el respaldo periódico y los avisos técnicos ya preparados. Reutiliza el código y los recursos existentes y termina con evidencia de ejecución real.

## 1. Autorización y punto de partida

Lee `AGENTS.md`, README, `docs/11_autorizaciones_codex_y_publicacion.md` y `docs/15_operacion_y_recuperacion_staging.md`. Comprueba remoto, rama, HEAD, cambios locales, servidor y cuentas. Conserva la copia privada original del Mac. Actualiza el clon público sin perder trabajo.

Siguen autorizados el navegador, GitHub, OVH/Coolify de FBE, las correcciones, PR y su fusión con las protecciones vigentes. El destino es **SyntaVera R2 Backups existente**, prefijo `fbe/staging/`, Standard, cada 12 horas, retención de 30 días y **US$0 de costo adicional**. Los avisos se envían al buzón corporativo SyntaVera ya verificado en Outlook; obtén su identidad del registro privado existente.

Esto comprende aprovisionar el Worker dedicado en el plan Free existente, su credencial padre para el único bucket de destino, las sesiones de ejecución restringidas a FBE y una aplicación de correo limitada al buzón remitente verificado. Guarda los secretos en sus almacenes privados. No vuelvas a preguntar si puedes realizar estas tareas ya autorizadas.

La PR #13 se fusionó en `0da631a46f3b627f0e143d460f0e17dbf7db1401`. Instala la revisión aprobada actual de los scripts operativos, incluida la sesión única por ciclo y los reintentos del monitor. Verifica qué está instalado realmente en OVH. La aplicación conserva la versión documentada `0de373ac92b8facf611fd8ce03fe7daae03db649`; contrasta sus tres digests. Este cierre no necesita promover imágenes ni modificar PostgreSQL.

La autorización escrita no crea sesiones ni roles. Usa las conexiones disponibles y sus controles normales. Si un proveedor exige login, MFA o un administrador, prepara la operación concreta y solicita únicamente esa intervención, explicando el control observado. No pidas secretos por chat ni detengas tareas independientes.

## 2. Aprovisionar el emisor R2 y probarlo

Reutiliza `infra/cloudflare/staging-r2-issuer.mjs`. Verifica cuenta, bucket, plan Free, consumo agregado y regla de expiración antes de activar. Crea una clave padre dedicada con Object Read & Write del único bucket aprobado y guárdala como secreto del Worker. La clave padre abarca ese bucket: mantenla fuera del OVH, de Git y de logs. No alteres las credenciales compartidas de otros proyectos.

Fija cuenta y bucket en la configuración privada; el emisor ya fija `fbe/staging/`, las acciones `PutObject`, `HeadObject`, `GetObject` y la duración de 30 minutos. Instala el token de cliente solo en la custodia privada prevista por systemd. Usa HTTPS y conserva el aislamiento de los perfiles AWS del operador.

Comprueba con R2 real una escritura y lectura de vuelta del objeto sintético, la denegación de listado y borrado, y el rechazo fuera del prefijo. Utiliza claves de prueba propias, sin acceder a contenido ajeno ni intentar borrar el respaldo histórico. Comprueba dos sesiones distintas en dos ciclos; el AccessKeyId puede ser el mismo por diseño, así que compara privadamente la sesión y su expiración, sin publicarlas.

Comprueba que un rechazo de renovación impide capturar y subir, conserva las copias anteriores y deja estado de fallo. Mantén el límite de 256 KiB por copia y el cifrado previo a la transferencia. Configura una fecha real de revisión de cuota en `FBE_R2_BUDGET_REVIEW_UNTIL` y registra responsable y próximo control; no la prolongues automáticamente sin revisar consumo. Registra también vencimiento y custodia de la credencial padre.

## 3. Habilitar el respaldo cada 12 horas

Usa las unidades existentes y `staging-backup-service.sh`, con material fresco, una sesión por ciclo, tmpfs, bloqueo y estado persistente. Instala el código como solo lectura para el servicio y toma el mismo bloqueo durante cambios de configuración. El manifiesto debe corresponder a los tres digests activos, no al último commit documental.

Prueba un disparo del timer definitivo con la identidad real, mediante un ajuste transitorio si hace falta. Verifica objeto nuevo en R2, lectura y comparación de bytes, SHA-256, estado verificado y limpieza de temporales. Retira el ajuste y deja un único calendario: **00:00 y 12:00 UTC, equivalentes a 19:00 y 07:00 de Ecuador**. Registra último y próximo disparo con fecha y zona horaria. El antiguo ensayo que ejecutaba `/usr/bin/true` no acredita un respaldo automático.

Activa este respaldo cuando sus dependencias estén verificadas, aunque todavía falte una sesión administrativa para el correo. En ese caso indica con precisión qué cobertura de alertas continúa pendiente; no vuelvas a deshabilitar una copia válida solo porque la sonda externa esté por resolver.

## 4. Habilitar el transporte y el monitor de host

Reutiliza primero un transporte programático existente si satisface el alcance. Para la opción Graph ya preparada, crea o completa la aplicación de tenant único y el service principal. Conecta Exchange Online PowerShell mediante una identidad con permisos administrativos efectivos. Configura `Application Mail.Send` con un scope que seleccione exclusivamente el buzón remitente verificado.

Comprueba el alcance positivo y negativo con `Test-ServicePrincipalAuthorization`, y revisa aparte los permisos Entra: un `Mail.Send` global ampliaría el acceso. El scope controla desde qué buzón se envía; el adaptador fija además el mismo buzón como destinatario. No añadas lectura de correo para resolver reintentos. Respeta la propagación de permisos antes de interpretar un 403 como fallo definitivo.

Custodia el secreto y su vencimiento en la configuración privada existente. Usa el monitor persistente y su política de dos fallos consecutivos, un evento por transición y recuperación. Sus reintentos conservan el ID y esperan 5, 15 y 60 minutos; después se limitan a uno por hora. Puede haber un duplicado si el proveedor aceptó el correo pero se perdió la respuesta. No prometas entrega exactamente una vez ni conciliación automática de la bandeja.

Induce fallo y recuperación en una sonda de ensayo, sin apagar servicios compartidos, y comprueba que ambos avisos automáticos llegan a Outlook. Un 202 de Graph no basta. Prueba un rechazo o una respuesta ambigua del transporte de forma controlada y verifica que la cola se reanuda. Habilita el monitor de host después de comprobar su transporte y registra una ejecución programada real.

## 5. Resolver la sonda pública fuera del OVH

No es obligatorio encontrar otro servidor con systemd. Reutiliza primero un monitor externo ya disponible. Si no existe, concreta una sonda pequeña con Cron Trigger en Cloudflare Free y estado persistente mínimo dentro de las cuotas existentes. Verifica que el consumo compartido permite hacerlo sin activar un plan de pago. Conserva separación de secretos: la sonda pública no necesita la clave padre de R2.

Comprueba HTTPS de web y API, modo sintético y continuidad del estado entre ejecuciones, con aviso tras dos fallos y aviso de recuperación. Observa un disparo programado real tras la propagación de la configuración. No prometas exclusión mutua o entrega única si el almacén elegido no las garantiza. No instales una plataforma de observabilidad completa ni otro VPS para esta fase.

La sonda externa y el monitor de host son complementarios. Una sonda ejecutada únicamente en OVH no detecta por sí sola la caída completa de ese host. Mantén explícito el estado de cada componente hasta verificarlo.

## 6. Evidencia y entrega

Haz únicamente las pruebas que resuelven estos riesgos y los controles obligatorios de CI. No repitas la restauración completa ya comprobada sin un cambio que lo justifique. Conserva exclusivamente datos sintéticos, el despliegue actual, el destino R2 y los recursos ajenos.

Actualiza la evidencia con commit/PR/CI, revisión realmente instalada en OVH, alcance y renovación de las sesiones comprobados contra R2, copia automática con hash, último/próximo disparo, estado de cada monitor y recepción en Outlook por ID. Separa lo probado con sustitutos de lo observado en los proveedores reales. Documenta rotación de secretos, revisión de cuota y cómo detener solo estas unidades.

Si falta acceso, informa la operación exacta, el permiso o pantalla que la bloquea y el mínimo paso que debe realizar el titular. Completa las activaciones independientes. La entrega debe indicar claramente qué está preparado, instalado, habilitado y verificado.
