# Encargo: activar respaldo y alertas automáticos

Continúa sobre `georgenton/fundacion-bienestar-emocional`. Lee `AGENTS.md`, `docs/11` y `docs/15`, y comprueba el estado actual del clon y del servidor. Conserva trabajo local y el repositorio privado original.

## Mandato vigente

El usuario ya autorizó el R2 existente para `fbe/staging/`, Standard, cada 12 horas, retención de 30 días y **US$0 de costo adicional**. También autorizó configurar y probar alertas en su buzón corporativo de SyntaVera, que ya fue verificado en Outlook. Reutiliza ese destinatario desde el registro privado; no lo vuelvas a pedir ni inventes otro. Las conexiones, correcciones, credenciales acotadas necesarias, PR y configuración del staging sintético están autorizadas. Solicita intervención humana solo para un control concreto de autenticación o un cambio material de alcance que no esté cubierto.

## Punto de partida comprobado

La evidencia integrada en `5cf41c4f70540c5ba70c4456e4e0dbd7e482eb31` registra copia R2, restauración aislada y avisos supervisados. Staging ejecuta la entrega documentada `0de373ac92b8facf611fd8ce03fe7daae03db649`. Contrasta el estado actual: esas referencias son históricas. El trabajo pendiente es la ejecución sin intervención humana, no otra promoción por rutina.

## 1. Credencial y copia programada

Reutiliza el ejecutor existente y `scripts/devops/staging-backup-cycle.sh`. El ciclo crea material de recuperación fresco, comprueba las tres imágenes, llama al job y limpia. Configura contenedores y manifiesto activos, tmpfs, estado persistente, bloqueo FBE y timeout de cinco minutos. El manifiesto del ejecutor se actualiza cuando se promueve otra versión; coordina el mismo bloqueo durante promociones y rotaciones.

Resuelve una identidad no interactiva cuyo acceso efectivo esté limitado al ámbito FBE. Comprueba primero las integraciones existentes. Las credenciales temporales R2 caducan: identifica quién las emite y cómo se renuevan. Si usas `credential_process` de AWS CLI, devuelve `Expiration` y prueba una renovación efectiva. No dejes una credencial manual temporal como solución permanente, ni un fallback silencioso a un perfil más amplio. Una clave padre amplia almacenada junto al job no acredita aislamiento del ejecutor al prefijo.

Si no existe un emisor reutilizable, concreta la alternativa mínima, su custodia y permisos antes de activarla; no declares resuelta esa dependencia. Conserva el destino y el presupuesto aprobados. No expongas credenciales en comandos, logs o Git.

Actualiza la lectura de consumo y verifica las reglas de retención existentes. Conserva el límite de 256 KiB por cifrado; si se supera, debe fallar con aviso. Esa cota y la lectura puntual de facturación no garantizan el gasto futuro de la cuenta compartida.

Programa una sola ejecución cada 12 horas. Usa el mecanismo existente o un timer de systemd si es el adecuado para este host; conserva exclusión con ejecuciones manuales. Prueba un disparo del programador con la identidad y el entorno definitivos, sin depender de un navegador abierto. Comprueba objeto nuevo, lectura de vuelta, estado persistente y próxima ejecución. Prueba que una renovación fallida no sube archivos ni conserva un falso éxito.

## 2. Monitor y transporte de correo

Reutiliza `staging-status.sh` y un único monitor pequeño con estado persistente: dos fallos consecutivos producen una alerta; la recuperación produce otra. Evita duplicados mientras no cambie el estado y conserva el aviso pendiente si falla el transporte. La comprobación pública debe poder detectar una caída del OVH desde fuera de ese host; reutiliza un monitor externo existente si está disponible.

Usa un transporte programático autorizado existente. Si la opción mínima viable es Microsoft Graph, configura una identidad de aplicación limitada al buzón remitente verificado y comprueba sus permisos efectivos. No basta una sesión de Outlook abierta ni una cookie copiada. Revisa que un permiso global equivalente en Entra no neutralice el alcance por buzón de Exchange. Mantén las credenciales y las direcciones en configuración privada.

Induce un fallo controlado del monitor y su recuperación sin interrumpir servicios compartidos. Verifica que el monitor envíe ambos mensajes y que lleguen al buzón; una respuesta de aceptación del proveedor no demuestra recepción. Comprueba también el reintento cuando falle el envío.

## 3. Evidencia y cierre

Conserva una versión saneada y parametrizada del guion real de restauración si todavía está disponible; los secretos y archivos de la copia permanecen privados. No repitas toda la restauración ni el ensayo de migración sin un riesgo nuevo que lo justifique.

Documenta qué quedó preparado, instalado, ejecutado y comprobado. Entrega commit/PR/CI, identidad operativa descrita sin secretos, alcance y renovación comprobados, último y próximo disparo, identificador del respaldo, estado del monitor y recepción de los avisos automáticos. Si falta acceso, permiso técnico o emisor, explica exactamente qué falta y completa las tareas independientes.

Respeta la protección de main y fusiona solo con los controles exigidos aprobados. No cambies recursos ajenos, contratos ni planes. No modifiques PostgreSQL ni promociones imágenes por el mero hecho de cambiar scripts operativos. Continúan exclusivamente los datos sintéticos.

Referencias técnicas: [R2 temporal](https://developers.cloudflare.com/api/resources/r2/subresources/temporary_credentials/), [AWS credential_process](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sourcing-external.html), [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [Exchange Application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac).
