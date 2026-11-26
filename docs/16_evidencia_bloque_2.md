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
