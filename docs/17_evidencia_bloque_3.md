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

## Alcance institucional

Todo el recorrido usa datos y archivos ficticios. David y la institución conservan la aprobación de textos, plantillas, atribuciones, prácticas, conservación y entrega. FBE-018 y FBE-019 conservan verificaciones futuras de otros módulos.
