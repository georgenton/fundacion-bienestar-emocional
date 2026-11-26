# Evidencia del bloque 3 — Expediente sintético

## Recorrido

1. En recepción, registrar persona y caso con servicio y modalidad. Asignar profesional para agenda y confirmar una cita.
2. En coordinación clínica, elegir el caso y otorgar alcance al tratante y supervisor. Registrar una práctica ficticia con período, institución y referencia. Habilitar su simulación y otorgar al pasante alcance vigente en ese caso.
3. En el portal de paciente, revisar y aceptar por separado los textos de atención y de participación supervisada.
4. En el expediente del tratante, abrir atención desde la cita. Crear, revisar y validar una nota interna. Añadir una adenda con motivo.
5. En la sesión de pasante, enviar un aporte a revisión y una actividad en minutos. En la sesión del supervisor, revisar el aporte y aprobar las horas. El exportable académico solo incluye fecha, actividad y minutos.
6. En documentos, subir un `.txt` ficticio y compartir explícitamente su versión. Desde el portal comprobar que solo se descarga lo compartido. Una solicitud de información requiere verificación de identidad, revisión humana y una versión seleccionada para la entrega.

## Verificación reproducible

- `pnpm demo:verify` aplica los recorridos HTTP sobre PostgreSQL, con versiones de consentimiento y retirada, acceso negativo, edición concurrente, protección de notas, reasignación y caducidad de prácticas, exportación académica, publicación explícita y fallo de escritura de archivos.
- En una base local descartable con fixtures nuevos, iniciar `pnpm dev`. Ejecutar `pnpm demo:block2:browser` y `pnpm demo:block3:browser` con Chromium instalado. El segundo usa sesiones de escritorio y un viewport móvil para el paciente.
- `bash scripts/devops/staging-recovery-drill.sh RUTA_ABSOLUTA_AL_MANIFIESTO --from-block2` reproduce la actualización desde las imágenes del bloque 2 y el rollback de aplicación en Docker local aislado. La migración clínica conserva el esquema de agenda y sus filas.
- La recuperación conjunta comprueba SHA-256 del objeto cifrado descargado desde el prefijo autorizado de R2. En custodia aislada, descifrar y extraer con `scripts/devops/extract-staging-backup.py`. Restaurar primero los roles con un bootstrap distinto y luego el dump con `pg_restore --single-transaction --exit-on-error`. Contrastar el volumen privado y PostgreSQL con `scripts/devops/staging-verify-restored-attachments.sh` y comprobar acceso positivo y negativo con la API de la entrega.

[ADR 0004](adr/0004_expediente_practicas_y_adjuntos.md) · [Manual operativo](15_operacion_y_recuperacion_staging.md)

## Resultados locales observados

- PostgreSQL 18.7 vacío aplicó las cinco migraciones. `pnpm demo:verify` pasó 26 pruebas de integración. El escaneo del registro capturado no detectó secretos generados, cabeceras de sesión ni texto clínico.
- Chromium completó la regresión de personas, agenda y activación con una fecha sintética distinta. El recorrido del bloque 3 pasó con recepción, coordinación, tratante, pasante y supervisor en escritorio y el portal del paciente en viewport móvil. Comprobó la nota validada con adenda, el aporte supervisado, los minutos aprobados y la igualdad de los bytes descargados.
- La instalación reproducible usó Node 24.22.3 y `pnpm install --frozen-lockfile` con pnpm 10.34.9. El lockfile se conservó.

## Integración y estado inicial observado

La PR #25 se integró como `6cb25913069cc7c73270eba94e3602557f0c682e` tras `verify-block-1` y `docker-verify` aprobados. El CI ejercitó PostgreSQL, compilación, arranque de imágenes y comprobaciones de operación. Chromium se ejecutó localmente. El registro de la API local tampoco contenía los marcadores de las notas, adendas ni el documento del recorrido. [PR #25](https://github.com/georgenton/fundacion-bienestar-emocional/pull/25) · [CI 45900040279](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45900040279).

El 26 de noviembre, antes de actuar en OVH, se observó la entrega `bd5158f3da35fd75043dff15b117d8c1774169a2`, 35 581 544 KiB libres en el almacenamiento Docker y los temporizadores de respaldo y monitor activos. El respaldo existente reportaba verificada la copia de las 13:37 de Ecuador. El panel de R2 mostró US$0,00 estimados con 722,22 MB almacenados, 108,23 mil operaciones de clase A y 14,39 mil de clase B.

## Recuperación observada

El CI de `6cb25913069cc7c73270eba94e3602557f0c682e` aprobó las pruebas, construyó y publicó los tres digests. El handoff comprobó los mismos digests y la procedencia de la entrega. [CI 45900301535](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45900301535) · [Handoff 45901218526](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45901218526) · [Manifiesto](releases/6cb25913069cc7c73270eba94e3602557f0c682e.json).

| Ensayo aislado | Resultado |
|---|---|
| Actualización desde los digests del bloque 2 | Restauración SQL de la base anterior en 2 s. La candidata aplicó la quinta migración y una segunda ejecución quedó sin pendientes. Coincidió la huella de la cita poblada. La actualización y prueba funcional tardaron 32 s. |
| Rollback de aplicación | Los digests anteriores arrancaron y verificaron salud y separación de pacientes en 10 s. El esquema clínico ampliado y la cita se conservaron. Runtime recibió denegación de DDL, cambio de rol, borrado de nota y alteración de autor o hash. |
| Ciclo externo de la copia poblada | `fbe/staging/fbe-staging-20261126T215347Z-block3-drill-18bbf30d.gpg`, 47 868 bytes. Se observaron 7 s entre la generación local y la escritura del readback. SHA-256 `66b83e7e05dea377b80e6a81fb6f93b38cb7d30b7d2952e94dd426ffb54fc03f`. |
| Restauración conjunta desde R2 | SQL en 1 s. Se cotejó un adjunto por hash entre el archivo descargado, PostgreSQL y la salida HTTP. Se verificaron las relaciones de persona, caso, cita, consentimientos, notas, adenda y documento, además de la autoría original del pasante y la validación del supervisor. |

La API de la candidata arrancó sobre la restauración aislada. El paciente autorizado obtuvo 200 con los bytes esperados. El otro paciente y recepción recibieron 404 en las comprobaciones correspondientes y el acceso anónimo al archivo recibió 401. Se comprobó MFA y ACL de runtime. Se completaron las verificaciones en 52 s desde la extracción válida, incluido el reintento de inicio de sesión con la espera del límite de autenticación. Se asignó una subred interna libre tras agotarse el pool predeterminado del Docker local. El ensayo cifró exclusivamente fixtures con una clave desechable en custodia separada. El respaldo periódico de OVH conserva su clave operativa.

## Promoción en OVH y respaldo activo

Coolify cargó el Compose versionado y promovió `6cb25913069cc7c73270eba94e3602557f0c682e` a las 16:57:11 de Ecuador. La ejecución terminó correctamente. Los contenedores coincidieron con el manifiesto por digest, ID de imagen y etiqueta OCI. El migrador salió con código 0 después de aplicar `202611260002_clinical_records`. PostgreSQL quedó con cinco migraciones, datos sintéticos y runtime sin DDL, sin permiso para asumir al migrador y con los permisos mínimos para notas y adjuntos. Se verificó el volumen escribible por el usuario de API y 33 321 480 KiB libres en Docker.

Por HTTPS, web y `/activate` respondieron 200. Salud de API confirmó PostgreSQL alcanzable y modo sintético. Un actor anónimo recibió 401 en el módulo clínico. En el smoke se crearon cuentas y registros sintéticos separados sin reinicializar la base. Recepción creó la cita, coordinación otorgó alcance, el paciente aceptó el consentimiento y el profesional validó la nota, añadió adenda y compartió el documento. La descarga del paciente devolvió los bytes esperados con caché deshabilitada. La descarga ajena y la de un profesional con asignación revocada respondieron 404. Las cuentas de prueba quedaron desactivadas y sus sesiones revocadas. Se comprobó que las frases de la nota, la adenda y el archivo de prueba no aparecían en los logs de la API.

Bajo el bloqueo del respaldo se sincronizaron el manifiesto, los contenedores activos y los scripts de captura conjunta. A las 16:59:50 de Ecuador, el servicio operativo produjo `fbe/staging/fbe-staging-20261126T215950Z-PGqvgb5H.gpg`. Cifrado de **48 558 bytes** y readback verificado en **4 s** observados por el operador. SHA-256 `d53b05e2b3508a27ef13d3396d2e3904fbc5badefc4e5d001728b20814575613`. La restauración anterior corresponde a la copia poblada del ensayo aislado. De la copia operativa posterior se verificó la lectura y la integridad.

El último disparo programado del respaldo fue a las 07:00 de Ecuador. El siguiente quedó a las 19:00. El monitor de host y el Worker reportaron salud a las 17:00. La sonda externa quedó sin incidentes ni avisos pendientes, con su siguiente ranura a las 17:05. El panel de R2 después de ambas copias mostró US$0,00, 722,22 MB, 108,24 mil operaciones de clase A y 14,4 mil de clase B. La operación reutilizó el destino, la caducidad y los monitores existentes.

## Alcance institucional

Todo el recorrido usa datos y archivos ficticios. David y la institución conservan la aprobación de textos, plantillas, atribuciones, prácticas, conservación y entrega. FBE-018 y FBE-019 conservan verificaciones futuras de otros módulos.
