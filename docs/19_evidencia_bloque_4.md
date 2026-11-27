# Evidencia del bloque 4 · Entorno sintético

La candidata parte de `8ecd90957fdfa49ba22a9a14b0689df361498a81` (auditoría de bloque 3, PR #27). Al iniciar el bloque, el manifiesto activo de staging indicaba `6cb25913069cc7c73270eba94e3602557f0c682e`. Las dos correcciones de la auditoría están en el historial de la candidata. Su presencia en staging se verifica por separado.

| Criterio | Verificación reproducible |
| --- | --- |
| FBE-013 | `pnpm demo:verify` ejecuta las integraciones de `block4.integration.spec.ts` en PostgreSQL. Cubre centavos, moneda, límites, estados declarado y verificado, evidencia privada, concurrencia, idempotencia, solidaridad, varios destinos, donación, pagador sin cuenta y preservación del precio al reprogramar. |
| FBE-014 | La misma suite comprueba reserva concurrente de devolución, liberación por rechazo, aprobación, ejecución simulada, saldo resultante, alcance del profesional, redondeo y ajuste posterior sin recalcular un cierre. |
| FBE-015 | La integración comprueba preferencia y persistencia de trabajos, cancelación, versión obsoleta, despacho concurrente sin duplicados y ocultación de mensajes al retirar la participación. La activación del timer de staging requiere evidencia de un disparo del programador. |
| FBE-016 | La integración comprueba proveedor/formato, asignación, cifrado, denegación, retiro local y tarea de confirmación externa. El recorrido local `pnpm demo:block4:browser` intercepta el enlace y verifica el acceso del participante sin abrir una reunión. |

En local, una base PostgreSQL 18.7 vacía aplicó las seis migraciones. La primera ejecución completa aprobada de `pnpm demo:verify` registró 30 integraciones y escaneo de secretos generados y cabeceras de sesión. La publicación, restauración externa, versión desplegada y despacho observado se acreditan únicamente con evidencia de la ejecución concreta.

## Reproducción

Para el recorrido Chromium, inicie la aplicación local y vuelva a cargar fixtures sintéticos en una base desechable, como en el README. Instale Chromium con `pnpm exec playwright install --only-shell chromium` y ejecute `pnpm demo:block4:browser`. El entorno de CI ejecuta también los recorridos de los bloques 2 y 3 contra la aplicación compilada.

Para el ensayo de actualización compatible, use el manifiesto aprobado absoluto y un contexto Docker local con el modo `--from-block3` de `scripts/devops/staging-recovery-drill.sh`. El ensayo usa las imágenes de la versión de staging del bloque 3 como base, preserva una cita al ampliar el esquema, comprueba permisos de runtime, reinicia el código anterior sobre el esquema ampliado y descarta sus recursos locales al finalizar. La restauración conjunta de una copia descargada de R2 requiere además sus pruebas de datos y hashes.

## Verificación del proveedor

La apertura controlada de un enlace en Chromium verifica la aplicación; cámara, micrófono y admisión del proveedor quedan fuera de esa prueba. Los ensayos de dos consultas paralelas con dos anfitriones, más de 60 minutos, móvil físico con reconexión y el escenario supervisado requieren comprobar cuentas y participantes autorizados. Los detalles de las capacidades publicadas y del procedimiento manual están en [ADR 0005](adr/0005_economia_portal_y_video_sinteticos.md).

## Revisión candidata y pruebas

| Entorno | Resultado observado |
| --- | --- |
| Clon público local | Node 24.22.3 y pnpm 10.34.9. Instalación congelada, lint, build, 15 unitarias y 30 integraciones aprobadas. Los tres recorridos Chromium se ejecutaron contra la aplicación compilada con PostgreSQL local. La comprobación adicional de cierre de sesión confirmó economía HTTP 401 sin sesión, comprobante ajeno HTTP 404 con la cuenta siguiente y ausencia de la referencia de prueba en almacenamiento ordinario. |
| PR #28 | `verify-block-1` y `docker-verify` aprobados antes de fusionar el SHA de la rama `423add3701179a4cbf2524e86c694912cd33186e`. [CI de la PR](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/46042388991). |
| `main` | `ea39fc84a81c5eec4e2dcad8335eee983ba6d741`, con `verify-block-1`, `docker-verify` y `publish-images` aprobados. El CI probó los tres recorridos Chromium y verificó cada imagen en GHCR por digest. [PR #28](https://github.com/georgenton/fundacion-bienestar-emocional/pull/28) · [CI de main](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/46043276155). |
| Handoff | El artefacto coincide en SHA y referencias de las tres imágenes con el [manifiesto de release](releases/ea39fc84a81c5eec4e2dcad8335eee983ba6d741.json). El flujo de handoff termina con estado `handoff_only_not_deployed`. [Ejecución de handoff](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/46044364810). |

Se revisó la diferencia a publicar con `git diff --cached --check` y Gitleaks. El escaneo del registro de QA no encontró secretos generados, cabeceras de sesión ni las cadenas de prueba usadas en comprobantes, narrativa, devoluciones o URLs de reunión.

La revisión de cuentas el 27 de noviembre mostró una sesión personal en Meet y una sesión de Teams de SyntaVera. No se identificaron dos anfitriones autorizados por FBE, una licencia institucional de FBE comprobable ni participantes autorizados para el móvil físico. Quedan pendientes admisión y configuración real de grabación, transcripción y resúmenes, dos reuniones simultáneas, una reunión de más de 60 minutos, acceso y reconexión móvil, escenario supervisado y confirmación del retiro externo. El procedimiento de contingencia está publicado en el portal y sigue sujeto al ensayo de reconexión real.

## Respaldo conjunto y restauración aislada

Antes de la promoción, Cloudflare mostraba US$0,00, 735 MB de almacenamiento para la cuenta y operaciones por debajo de la cuota mensual Standard. El ejercicio usó el prefijo y el emisor temporal existentes. Cada objeto conservó los límites y la retención acordada. [Cuotas oficiales de R2](https://developers.cloudflare.com/r2/pricing/).

La copia desechable `fbe/staging/fbe-staging-20261127T174556Z-block4-drill-eea1cbab.gpg` ocupó 59.706 bytes. La subida y descarga idéntica tardaron 7 s. SHA-256 del cifrado `358049ae726bf9804e24987c5753928dec9cbc6bdcd2c21e1b8002942c8ca597`. La clave del ensayo permaneció fuera de OVH. El archivo descargado se descifró y restauró en PostgreSQL 18.7 en una red Docker interna, con la API de la candidata por digest y el despachador detenido.

| Verificación de la copia recuperada | Resultado |
| --- | --- |
| PostgreSQL y adjuntos | `pg_restore` completó en 1 s. Dos referencias de archivo coincidieron con los hashes y tamaños restaurados: un documento clínico y un comprobante financiero, 105 bytes en conjunto. |
| Economía | Precio de 4.000 centavos, aplicación original de 2.500, devolución simulada de 500, solidaridad aprobada de 300 y saldo de 1.700. Se comprobaron la liquidación simulada, los actores de las transiciones y las relaciones con la cita. |
| Expediente | Consentimientos con historial y retirada, nota validada con adenda y aporte de pasante con autoría y validación supervisora conservadas. Descarga autorizada HTTP 200, paciente ajeno HTTP 404, recepción denegada para narrativa y anónimo HTTP 401. |
| Portal y video | El trabajo programado seguía pendiente con destinatario, horario y versión correctos. Se abrió la referencia vigente descifrada solo para su participante. El acceso ajeno y el de la cita cancelada devolvieron HTTP 404. La descarga financiera también se denegó al paciente ajeno y al profesional sin permiso financiero. |
| Tiempo hasta la comprobación funcional | 51 s desde el inicio de la restauración aislada, incluidos arranque/descarga de imagen y espera del límite de autenticación. |

El respaldo operativo de la versión anterior se refrescó antes del cambio a las 12:34:30 de Ecuador. `fbe-staging-20261127T173430Z-exSCSrXD` quedó verificado por lectura en 4 s. La restauración conjunta corresponde al objeto de ensayo indicado arriba.

El guion de actualización `staging-recovery-drill.sh --from-block3` carga los permisos por defecto únicamente en la fuente. El destino reconstruye el ACL y los permisos por defecto desde el volcado, evitando otorgar permisos antes de restaurar las tablas. El primer ensayo local detectó esa diferencia y se corrigió antes de la comprobación con la candidata.

La base de partida del ensayo se cotejó con las cinco migraciones registradas en el staging anterior. En aislamiento, la actualización de `6cb25913069cc7c73270eba94e3602557f0c682e` a `ea39fc84a81c5eec4e2dcad8335eee983ba6d741` preservó la cita de referencia y completó las comprobaciones en 40 s. El runtime quedó sin DDL, sin capacidad de asumir al migrador, sin borrado de aplicaciones y sin permiso para alterar importes, hashes, contenido entregado o el enlace cifrado. El rollback de aplicación a los digests de `6cb2591` tardó 9 s. PostgreSQL conservó el esquema ampliado y la cita, y la aplicación anterior volvió a comprobar login del paciente, acceso propio y denegación ajena.

## Promoción sintética del 27 de noviembre

Coolify inició la promoción a las **12:49:27 de Ecuador** y registró éxito. El SHA desplegado es `ea39fc84a81c5eec4e2dcad8335eee983ba6d741`. Se verificaron las tres referencias persistidas de Coolify y, en OVH, digest, ID de imagen, etiqueta de revisión, salud de API y web y salida 0 del migrador. La [web de staging](https://fbe-staging.syntavera.dev/) conserva su rótulo de entorno de pruebas. La [API](https://fbe-api-staging.syntavera.dev/health) respondió HTTP 200 con PostgreSQL alcanzable y modo sintético.

PostgreSQL registra seis migraciones y la API conserva permisos acotados, volumen privado escribible y seed automático deshabilitado. Docker disponía de 37 245 868 KiB libres antes de descargar las imágenes y 34 988 824 KiB después de promover. El respaldo y el monitor del host permanecían activos. El manifiesto operativo y los selectores del respaldo se actualizaron bajo el bloqueo existente, junto con el bloqueo del nuevo despachador.

El recorrido HTTPS registró 4.000 centavos, declaró y verificó 2.500, aplicó ese importe y observó 1.500 pendientes en el portal. La descarga propia devolvió HTTP 200, la ajena HTTP 404 y el expediente para finanzas HTTP 404. Un administrador operativo tenía permiso de invitación financiera y no podía leer el libro. Obtuvieron acceso al enlace el paciente y el profesional asignado. El paciente ajeno recibió HTTP 404. Se usó un enlace ficticio de aplicación.

En Chromium contra la web y la API de staging por HTTPS, se retiró desde el portal la aceptación anterior después de publicar una nueva versión. En el expediente se suspendió la práctica, se denegó otra nota al pasante, se concluyó la atención conservando su borrador pendiente y se registró una nota posterior con la fecha original de la atención. El recorrido publicó una plantilla adicional ficticia y conservó la traza. El ensayo de portal comprobó además saldo, bytes del comprobante y apertura interceptada del enlace.

### Despacho y operación observados

`fbe-staging-reminders.timer` quedó habilitado, activo y con frecuencia de dos minutos. El primer disparo programado ocurrió a las **12:52:00 de Ecuador**. El trabajo se había programado a las 12:50:27.912 y se intentó y entregó en la misma transacción a las **12:52:01.812**. El servicio registró `attempted=1 delivered=1 skipped=0`; la bandeja autenticada devolvió esa única fila al destinatario y la omitió para el ajeno. La siguiente ranura en esa observación era 12:54. Las cuentas temporales se desactivaron y sus sesiones se retiraron. El timer quedó activo.

La copia operativa posterior `fbe-staging-20261127T175207Z-5bqtBBMu` quedó verificada por lectura a las 12:52 de Ecuador, con un ciclo de 4 s y SHA-256 `1567bb035160ac08f7540fbfa1d97f096f8e45442def67bd915d3f4c50aec35a`. El siguiente respaldo programado en esa observación era a las 19:00 de Ecuador. Esa copia operativa se verificó por lectura; la restauración aislada corresponde al objeto poblado del ensayo. El panel de R2 continuó mostrando US$0,00 tras la lectura.

El monitor de host conservó su timer activo y último resultado exitoso. Cloudflare mostró un disparador de la sonda externa vigente `*/5 * * * *`. Se conservaron los transportes de alerta existentes. Los recordatorios se entregaron únicamente en la bandeja de prueba de PostgreSQL. La corrección del guion de recuperación y la documentación de esta promoción se versionan por separado del código de las imágenes.

## Validación institucional pendiente

David y la institución conservan la validación de tarifas, becas, condiciones de devolución, porcentajes y textos, las responsabilidades financieras y clínicas, y las cuentas y reglas de videoconsulta. El entorno conserva el propósito exclusivamente sintético.
