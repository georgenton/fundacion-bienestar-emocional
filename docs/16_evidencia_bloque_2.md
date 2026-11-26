# Evidencia del bloque 2 — Personas, casos y agenda

## Recorrido sintético

1. Iniciar sesión como recepción con MFA.
2. En **Configuración**, crear un servicio presencial, habilitar un profesional tratante, guardar su horario y una tarifa en centavos de USD.
3. En **Personas**, registrar y buscar una persona sin cuenta. Abrir un caso individual con modalidad habilitada y asignar el profesional con el alcance y vigencia mostrados.
4. En **Agenda**, elegir el caso y una hora en Ecuador. Crear la reserva temporal, confirmar, reprogramar y cancelar. Para registrar asistencia o ausencia, usar una cita confirmada que ya empezó.
5. En la ficha de la persona, usar **Invitar al portal** con un correo sintético de acceso. El operador autorizado recupera el enlace en el buzón privado del proceso API, `apps/api/.local/invitation-outbox` en desarrollo y `/workspace/.local/invitation-outbox` en el contenedor de staging. Entregarlo al actor sintético por el canal de prueba. Abrir `/activate`, definir la contraseña e iniciar sesión con el actor paciente. Debe aparecer el mismo caso y solo sus citas autorizadas.

El enlace de activación es una credencial. La interfaz de recepción devuelve el identificador y la vigencia de la invitación. El buzón privado conserva el enlace durante la demostración. Los correos Graph de respaldo y monitorización pertenecen a otra identidad y otro flujo.

## Pruebas

| Criterio | Verificación de riesgo |
|---|---|
| FBE-005 | Personas distintas con contacto compartido, caso sin cuenta, preservación de persona y participación, intento de sustitución de persona, activación concurrente y rollback cuando el objetivo ya no es elegible. |
| FBE-006 | Rechazo de servicio/modalidad y de profesional no elegible, alcance explícito de la asignación, ausencia con conflictos sin cancelar, conservación de términos ante cambios de servicio y tarifa. |
| FBE-007 | Solicitudes HTTP concurrentes contra PostgreSQL, exclusión de solapamientos incluso en una escritura fuera del servicio de agenda, margen, tramo contiguo, expiración sin tarea periódica, confirmación idempotente y versión obsoleta. |
| FBE-008 | Reprogramación atómica, reintento que devuelve la misma cita, conservación de la cita ante conflicto, cancelaciones atribuidas a paciente/profesional, asistencia y ausencia independientes. |

`pnpm demo:verify` ejecuta los escenarios integrados con PostgreSQL y la revisión de logs. Para reproducir desde la interfaz, usar exclusivamente una base local descartable, generar fixtures con `pnpm demo:verify`, iniciar `APP_ENV=development pnpm dev` y, en otra terminal, ejecutar `pnpm exec playwright install chromium --only-shell` y `pnpm demo:block2:browser`. La prueba utiliza Chromium de escritorio para recepción y un viewport móvil para el paciente, con zonas de navegador ajenas a Guayaquil para comprobar la conversión.

## Migración

`202611260001_people_cases_agenda` conserva los datos de las tres migraciones del bloque 1. Retira la restricción única del contacto, conserva la unicidad de autenticación y añade vínculo de invitación, catálogo, agenda y permisos acotados de runtime. La política de rollback de aplicación conserva el esquema actualizado. Cualquier reversión de datos requiere el procedimiento separado de recuperación descrito en el manual operativo.

[ADR 0003](adr/0003_personas_casos_y_agenda.md) · [Operación y recuperación](15_operacion_y_recuperacion_staging.md)

## Verificación ejecutada

- PostgreSQL 18.7 vacío. Las cuatro migraciones quedaron aplicadas. La restricción única histórica del contacto se retiró mediante `ALTER TABLE … DROP CONSTRAINT`, conservando la tabla y sus referencias.
- `pnpm demo:verify`. Pasaron 22 pruebas de integración contra PostgreSQL, incluidas las 6 del bloque 2. El análisis de logs no encontró credenciales generadas, cabeceras de sesión ni texto clínico. La compilación de la API y Next.js incluyó la nueva ruta `/activate`.
- `pnpm demo:block2:browser`. Pasó el recorrido en Chromium con cuenta de recepción y MFA. El paciente se activó en un viewport móvil, conservó su `personId` y accedió al mismo caso y cita cancelada. La interfaz mandó instantes de Ecuador aun con navegadores configurados para Tokio y Madrid.
- [PR #22](https://github.com/georgenton/fundacion-bienestar-emocional/pull/22) fusionada en `bd5158f3da35fd75043dff15b117d8c1774169a2` tras `verify-block-1` y `docker-verify` aprobados. [CI 45874146665](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45874146665).

## Comprobación previa de staging

El 26 de noviembre se verificó la entrega activa `0de373ac92b8facf611fd8ce03fe7daae03db649` por los tres digests, la salud HTTPS y PostgreSQL 18.7 con 3 migraciones previas y datos sintéticos. OVH mostró 38 270 336 KiB disponibles en el almacenamiento Docker, 10 753 640 inodos libres y 5901 MiB de RAM disponible. El rol de migración podía crear la extensión de rangos. Runtime carecía de `CREATE` en el esquema, atributos privilegiados, membresías y permiso para asumir al migrador. El último respaldo anterior al cambio fue `fbe/staging/fbe-staging-20261126T120001Z-VUEmmE10.gpg`, verificado a las 07:00 de Ecuador.

### Ensayo aislado con imágenes publicadas

Se ejecutó `bash scripts/devops/staging-recovery-drill.sh RUTA_AL_MANIFIESTO` con dos bases PostgreSQL 18.7 descartables y las referencias exactas de la entrega anterior y de la candidata. La publicación y el smoke de las tres imágenes pasaron en CI. El handoff validó la procedencia de los mismos digests. [CI 45874927169](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45874927169) · [Handoff 45876096225](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45876096225) · [Manifiesto](releases/bd5158f3da35fd75043dff15b117d8c1774169a2.json).

| Medición | Resultado |
|---|---|
| Copia del esquema anterior | 18 441 bytes cifrados. Captura y transferencia 1 s. |
| Restauración | SQL 1 s. Antigüedad de la copia al finalizar SQL 2 s. API funcional a los 9 s. |
| Actualización aislada | 241 s, con descarga de imágenes incluida. Se conservaron los identificadores previos. La segunda ejecución del migrador quedó sin pendientes. |
| Permisos | Se denegaron DDL, asumir el rol de migración y mutar o truncar auditoría. En las tablas nuevas se denegaron `DROP TABLE Appointment`, `DELETE` de citas y `UPDATE` de tarifas. |
| Copia tras ampliar el esquema | Las siete tablas nuevas figuran como `TABLE DATA` en el inventario de `pg_restore`. Archivo cifrado de 22 535 bytes, bajo el límite de 262 144 bytes. |
| Rollback de aplicación | 9 s hasta la comprobación funcional de la entrega anterior. PostgreSQL conservó el esquema ampliado y la migración. |

En la base restaurada, con la candidata y con las imágenes anteriores, salud y web devolvieron 200, la llamada anónima recibió 401 y el paciente obtuvo 200 para su caso y 404 para el ajeno.

### Promoción y comprobación en OVH

Coolify terminó la promoción de `bd5158f3da35fd75043dff15b117d8c1774169a2` iniciada a las 13:35:29 de Ecuador. El migrador terminó a las 13:35:43 con código 0. API y web quedaron saludables. Los tres contenedores coincidieron por digest, ID local de imagen y revisión OCI con el manifiesto. Se actualizó bajo el bloqueo del respaldo la referencia al manifiesto y a los contenedores activos. El almacenamiento Docker quedó con 36 030 432 KiB disponibles. [Manifiesto desplegado](releases/bd5158f3da35fd75043dff15b117d8c1774169a2.json).

- PostgreSQL registró cuatro migraciones finalizadas, incluida `202611260001_people_cases_agenda`. Se comprobó el acceso de runtime en las siete tablas nuevas, sin DDL, acceso al rol de migración ni `TRUNCATE` de auditoría. El inventario de un volcado local temporal del staging incluyó las siete tablas. El volcado se retiró al terminar la inspección.
- Por HTTPS, web y `/activate` devolvieron 200, salud de API reportó PostgreSQL alcanzable y una llamada anónima a agenda recibió 401. Se verificaron el rótulo de entorno de pruebas, el modo sintético, el seed desactivado y el buzón sintético de invitaciones.
- En el smoke de staging, recepción verificó MFA, configuró el servicio y completó persona, caso, asignación, reserva, confirmación, reprogramación y cancelación. El paciente conservó persona y caso tras la activación. Obtuvo 200 en su caso, 404 en un caso ajeno y 403 en el listado de personas. Se desactivaron las cuentas sintéticas de esta ejecución, se revocaron sus sesiones y se retiró el enlace de prueba. La prueba Chromium de escritorio y móvil se ejecutó en el entorno local descartable.
- A las 13:37:20 de Ecuador, el servicio de respaldo generó `fbe/staging/fbe-staging-20261126T183720Z-T3cWmDPB.gpg`. En 4 s observados por el operador, el servicio aplicó el límite de 256 KiB, descargó la copia de R2 y verificó igualdad de bytes. El estado persistido fue `verified`. SHA-256 `1a3ea3bba4a9f9c59f87a8b85b1066562821a7c2a6e01ee6209e9cf40436344f`. El panel de R2 mostró US$0,00 de costo estimado después de la copia. El timer de respaldo siguió activo, con próximo disparo a las 19:00 de Ecuador.

La restauración y el rollback de aplicación se ejecutaron de forma aislada. En OVH se aplicó la promoción hacia delante y se verificó el respaldo por lectura; esa copia posterior a la promoción quedó disponible para una futura restauración aislada. Los monitores conservaron sus configuraciones. La prueba de correo por Outlook se conserva como evidencia del cierre operativo. [Historial de operación](15_operacion_y_recuperacion_staging.md).

## Pendientes

Invitaciones y recuperación para usuarios reales requieren un transporte y un procedimiento institucional aprobados. El buzón sintético reside en el sistema de archivos del contenedor. En una recuperación se usa el Compose del manifiesto para recrear la configuración y se emite otra invitación si se perdió su enlace. El alcance actual se limita a adultos en casos individuales sintéticos. El siguiente bloque aborda expediente, consentimiento y supervisión.
