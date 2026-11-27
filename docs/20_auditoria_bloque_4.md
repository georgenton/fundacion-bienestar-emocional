# Revisión independiente del bloque 4

Fecha: 27 de noviembre de 2026, Ecuador. Alcance: economía, portal, recordatorios y acceso de aplicación a video, exclusivamente sintéticos.

## Punto de partida comprobado

La revisión tomó `main` en `a4e82ffdf3a176f65b5089b57fa8590970b6fc3c`. La entrega operativa reportada es `ea39fc84a81c5eec4e2dcad8335eee983ba6d741`.

- [PR #28](https://github.com/georgenton/fundacion-bienestar-emocional/pull/28): fusionada; [CI de publicación 46043276155](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/46043276155), aprobado.
- [Handoff 46044364810](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/46044364810): aprobado; prepara una promoción y no la ejecuta por sí solo.
- [PR #29](https://github.com/georgenton/fundacion-bienestar-emocional/pull/29): fusionada. El [CI de `main` 46045764925](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/46045764925) también terminó aprobado, con 15 unitarias, 30 integraciones y los recorridos Chromium de los tres bloques.
- El [manifiesto de la entrega](releases/ea39fc84a81c5eec4e2dcad8335eee983ba6d741.json) coincide con los tres digests aportados por el operador.
- La comprobación pública independiente observó web HTTP 200 con el rótulo de pruebas, salud de API HTTP 200 con PostgreSQL alcanzable y `syntheticDataOnly=true`, y casos sin sesión HTTP 401.

El inventario efectivo de OVH, las seis migraciones allí registradas, los disparos del timer y las operaciones privadas de R2 se contrastaron con [docs/19](19_evidencia_bloque_4.md). Esta revisión no repitió esas operaciones en el host. La salud pública no demuestra por sí sola qué digests están activos.

## Hallazgos reproducidos antes de corregir

| Prioridad | Ubicación y reproducción | Resultado observado e impacto |
|---|---|---|
| P2 | `apps/worker/src/reminders.ts`: activar preferencia, desactivarla, despachar y volver a activarla antes de una cita futura. | La preferencia quedaba habilitada, pero el único trabajo seguía `SKIPPED`: el índice único y `skipDuplicates` impedían volver a programarlo. No se producía entrega. |
| P2 | `apps/api/src/portal/portal.service.ts`: registrar un enlace para una cita en curso y marcar `ATTENDED` por la ruta de agenda. | La cita seguía confirmada y dentro de horario, pero su versión avanzaba. El acceso devolvía 404, `available=false` y una tarea de cierre externo improcedente. Volver a registrar el mismo enlace no restablecía el acceso. |
| P2 | `apps/api/src/economy/economy.service.ts`: consultar el libro y provocar denegaciones de consulta, capacidad y ámbito. | Las respuestas HTTP eran correctas, pero faltaban los eventos de auditoría de la lectura y de los rechazos. Se perdía la trazabilidad prevista para acciones sensibles. |

La reproducción usó PostgreSQL 18.7 aislado, seis migraciones desde cero y servicios reales. Las cuatro regresiones HTTP de auditoría financiera fallaron antes del parche únicamente por ausencia de los eventos esperados. El control basal de un recordatorio ya entregado mantuvo una sola entrega; ese comportamiento debía conservarse.

## Correcciones

**Recordatorios.** Al volver a aceptar el canal se puede reactivar el trabajo omitido de la misma cita, versión, horario y cuenta elegibles, siempre que no exista una entrega. Conserva la fecha del intento anterior hasta el siguiente intento. El despachador vuelve a comprobar estado, preferencia y permisos. Los trabajos entregados permanecen finales y la concurrencia conserva una sola entrega.

**Video.** La versión almacenada conserva la procedencia del registro. El acceso depende de la identidad de cita, estado confirmado, plazo vigente, asistencia distinta de `NO_SHOW`, ausencia de cierre externo y autorización actual. Registrar asistencia no invalida el enlace. Las rutas actuales de reprogramación crean otra cita; no se afirma que la base imponga inmutabilidad física a todas sus columnas. La respuesta de metadatos también oculta el acceso al profesional con asignación revocada, sin presentar esa revocación como un cierre en el proveedor. No se permite confirmar cierre externo de una cita que sigue activa.

**Finanzas.** La lectura registra un evento mínimo dentro de la transacción. Los comandos y lecturas denegados por capacidad o ámbito registran `DENIED` después del rollback. El listado usa `FinancialOverview` sin identificador de objeto; un comando rechazado usa `FinanceCommand` y su `requestId` validado. Los eventos no copian importes, referencias, motivos, narrativa ni respuesta financiera. Se conserva la auditoría de comandos exitosos sin duplicarla y no se modifica el helper de auditoría clínica.

No cambian dependencias ni migraciones. Las decisiones se incorporan en el [ADR 0005](adr/0005_economia_portal_y_video_sinteticos.md).

## Verificación de la corrección

Se añadieron seis regresiones significativas: cuatro de trazabilidad financiera y dos recorridos HTTP de portal con comprobaciones de concurrencia y denegación. La ejecución positiva local pasó **36/36 integraciones en seis archivos** sobre una base PostgreSQL 18.7 nueva con las seis migraciones. Lint/TypeScript y el escaneo de salida aprobaron. El proceso de PostgreSQL descartable se detuvo al finalizar. La instalación usó Node 24.22.3 y pnpm 10.34.9 con lockfile congelado.

La prueba de recordatorios cubre reactivación, conservación de intento, dos despachadores concurrentes, repetición de la preferencia después de entregar, cancelación y participación retirada. La prueba de video cubre asistencia durante la consulta, reingreso propio, paciente ajeno, asignación y participación revocadas, inasistencia y confirmación externa idempotente. Las regresiones originales de cancelación y reprogramación se conservan.

Las pruebas de auditoría comprueban lectura permitida, lectura denegada, comando 403 y declaración 404; verifican que los eventos no contienen el payload sensible y que una declaración rechazada no crea recibo ni registro de comando.

Se fijó `fileParallelism: false` para las suites de integración, porque comparten base y despachador. Las pruebas explícitas de concurrencia mediante `Promise.all` permanecen. La primera corrida positiva terminó con 36 aprobadas, pero Vitest había iniciado antes de guardarse ese ajuste; el CI obligatorio de esta corrección debe acreditar la configuración final. No se repite una corrida local para sustituir ese gate.

La primera ejecución de CI con ese aislamiento detectó una suposición anterior en `access.integration.spec.ts`: recepción esperaba exactamente dos casos en toda la base, aunque otra suite ya había añadido otro. Las otras 35 pruebas aprobaron. Se ajustó la prueba para exigir los dos casos de referencia y la lista cerrada de campos administrativos en cada fila, conservando el rechazo del contenido clínico. No se modificó la política de acceso para resolver ese fallo.

El entorno de auditoría mantiene la limitación de sockets Unix del lanzador `tsx`. Las etapas TypeScript locales usan `node --import tsx`; no se presenta esa equivalencia como una ejecución local del wrapper literal `pnpm demo:verify`. El CI ejecuta los comandos habituales y los recorridos Chromium sobre la aplicación compilada. Sus resultados exactos se identifican en la PR de esta revisión y en el informe de cierre.

## Límites de la revisión y siguiente paso

La revisión de los cálculos no identificó otro defecto concreto en los saldos, aplicaciones, reservas de devolución, reprogramación ni redondeo acumulado de liquidaciones. La revisión de esquema, adjuntos y recuperación no identificó otro cambio necesario: el comprobante financiero tiene ámbito propio, conserva las protecciones de inmutabilidad y entra en la instantánea conjunta de archivos; la configuración cifrada de recuperación incluye el material de aplicación necesario para los enlaces. Esto describe el código revisado, no una nueva restauración de la copia operativa ni una certificación financiera o institucional.

La restauración documentada en `docs/19` corresponde al objeto de ensayo poblado. De la copia operativa posterior se verificó lectura e integridad. El siguiente encargo incluye una restauración aislada de una copia operativa reciente, manteniendo detenidos despachadores y salidas externas.

FBE-016 conserva pendientes las cuentas anfitrionas autorizadas, participantes y móvil físico para verificar el proveedor. Las pruebas de aplicación no acreditan duración, concurrencia, cámara, micrófono, reconexión ni cierre externo. Las tarifas, textos y responsabilidades definitivas permanecen para David y la institución.

El [encargo siguiente](../prompts/09_cierre_verificacion_y_preparacion_piloto.md) prepara el cierre técnico y la revisión institucional del piloto. Integrar esta corrección o publicar imágenes no demuestra su promoción en Coolify ni autoriza atención real.
