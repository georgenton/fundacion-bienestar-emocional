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
