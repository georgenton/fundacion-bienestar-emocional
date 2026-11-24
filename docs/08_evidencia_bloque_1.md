# Evidencia del bloque 1 — Base aislada e identidad

Fecha de ejecución inicial: 23 de noviembre de 2026. Cierre técnico para auditoría: 24 de noviembre de 2026. Alcance: FBE-001 a FBE-004 con datos totalmente sintéticos.

> Evidencia histórica suministrada con el ZIP del commit local `5c325950cff66dd9d215761f08ee0be5e4555bae`. Los resultados de esta sección corresponden a aquella ejecución local, no a una reproducción independiente. La auditoría posterior encontró y corrigió defectos adicionales, agregó una tercera migración y amplió las pruebas. Consultar [la evidencia independiente](12_auditoria_independiente_2026-11-24.md) para el estado de la copia publicada y de GitHub Actions.

## Resultado disponible

- Workspace reproducible con web Next.js, API NestJS, worker mínimo, configuración validada, PostgreSQL, Prisma, Docker Compose y CI.
- Invitación/activación sintética de un solo uso, sesión, cierre, recuperación de contraseña, TOTP y códigos de respaldo mediante Better Auth.
- Modelos y dos migraciones versionadas para personas, identidad, sesiones, roles, capacidades, asignaciones, casos, participantes, invitaciones y auditoría.
- Política central compartida por API y worker, con denegación por defecto.
- Pantalla local identificada como sintética y un recorrido de recepción, profesional, paciente, soporte, administración operativa, supervisor y pasante.

## Criterios observados

| Tarea | Estado | Evidencia principal |
|---|---|---|
| FBE-001 | Implementado y probado localmente | `.env.example`, `compose.yaml`, health check real, migraciones limpias, Dockerfiles, workflow CI. |
| FBE-002 | Implementado y probado localmente | Invitación de un uso, alta pública cerrada, sesión, recuperación expirada/no reutilizable, revocación de sesiones, TOTP y código de respaldo de un uso. Transporte de correo real pendiente. |
| FBE-003 | Implementado y probado localmente | Política por capacidad/identidad/participación/asignación, cambio de UUID denegado, lista/exportación acotadas, revocación con sesión abierta y revalidación del worker. |
| FBE-004 | Implementado y probado localmente | Logger por lista mínima, redacción, auditoría append-only, denegaciones auditadas y escaneo del output contra secretos generados. |

## Matriz de pruebas y criterios FBE-001–FBE-004

| Criterio | Prueba o verificación | Riesgo cubierto | Resultado del cierre |
|---|---|---|---|
| FBE-001 | `configuration contract` en `apps/api/src/config-contract.spec.ts` | Configuración completa, rechazo de secreto marcador y prohibición de seed sintético en producción. | 3 pruebas aprobadas. |
| FBE-001 | `reports database health without exposing configuration` y prueba manual con base inaccesible | Salud positiva sin URL de conexión y respuesta `503 DATABASE_UNREACHABLE` cuando PostgreSQL no responde. | Aprobado. |
| FBE-001 | `pnpm install --frozen-lockfile`, migraciones desde base vacía, `pnpm db:status`, builds e imágenes | Instalación reproducible, migraciones versionadas y arranque del stack. | Aprobado localmente; CI alojado no ejecutado. |
| FBE-002 | `expires and consumes password reset tokens without account enumeration` | Respuesta no enumerativa, caducidad y uso único del token de contraseña. | Aprobado. |
| FBE-002 | `requires and consumes a staff recovery code as a real second factor` | Código de respaldo como segundo factor y rechazo de reutilización. | Aprobado. |
| FBE-002 | `revokes staff sessions on password recovery without bypassing MFA` | Recuperar contraseña revoca sesiones existentes y conserva la exigencia de TOTP/código de respaldo. | Aprobado. |
| FBE-002 | `activates a synthetic invitation once and rejects reuse or expiry` | Invitación caducada, consumida o reutilizada. | Aprobado. |
| FBE-002 | `deactivates an account and invalidates its active sessions` | Desactivación de cuenta e invalidación inmediata de cookie vigente. | Aprobado. |
| FBE-003 | Casos de paciente, recepción, profesional, soporte y administración operativa en `access.integration.spec.ts` | Cambio de identificador, listas, vista operativa, lectura clínica y exportación con alcance correcto. | Aprobado. |
| FBE-003 | `requires a current assignment for a professional and revokes it mid-session` | Revocación y vencimiento de asignación con sesión abierta. | Aprobado para ambos estados. |
| FBE-003 | El mismo caso con `queuedJob` ejecutado antes y después de revocar/vencer la asignación | Un trabajo creado previamente vuelve a resolver cuenta, roles y asignación al ejecutarse. | Aprobado; no entrega al perder acceso. |
| FBE-004 | `SafeLogger` y `stores useful denials without credentials or case content` | Redacción y auditoría de denegación sin contraseña, token, cabecera ni narrativa. | Aprobado. |
| FBE-004 | `rejects ordinary updates and deletes of audit events` | Protección append-only frente a `UPDATE` y `DELETE` ordinarios. | Aprobado. |
| FBE-004 | `pnpm logs:scan` | Búsqueda de secretos generados, cabeceras de sesión y marcadores clínicos en el registro capturado. | Aprobado. |

La capacidad `audit:read` pertenece solo a `OPERATIONS_ADMIN`, pero este bloque no expone una ruta de consulta de auditoría; por tanto, ninguna cuenta puede listar eventos mediante la API actual. Soporte no posee esa capacidad. La aplicación solo inserta eventos. El trigger de PostgreSQL rechaza `UPDATE` y `DELETE` ordinarios y esto se prueba; un propietario de infraestructura/base aún podría retirar el trigger o usar privilegios superiores, por lo que no se afirma inmutabilidad frente a infraestructura.

Los tres escenarios de recuperación —contraseña, autenticador con código de respaldo y pérdida de todos los factores— se documentan por separado en `docs/09_recuperacion_de_acceso.md`. La pérdida de todos los factores no tiene una recuperación implementada ni una aprobación institucional; tampoco existe una ruta administrativa general para desactivar MFA.

## Comandos ejecutados

```bash
corepack prepare pnpm@10.34.9 --activate
pnpm --version
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
pnpm db:migrate
pnpm db:status
pnpm lint
pnpm test
pnpm demo:verify
pnpm build
docker compose --profile app build
```

Resultados de la corrida de cierre del 24 de noviembre de 2026:

- Versión efectiva en host, contenedor de verificación y builds Docker: pnpm `10.34.9`.
- Instalación con Node `24.22.3` y `--frozen-lockfile`: aprobada; el lockfile se declaró actualizado y no cambió.
- SHA-256 de `pnpm-lock.yaml` antes y después: `dc1a2e260e85bc218f481708e6705ca9297305af4eb5a52f560b2846979e99f8`, igual al de la referencia original `37337ea5fec6d889d357c8b5872f1fc0f078f48a`.
- `pnpm db:status`: 2 migraciones encontradas y esquema actualizado. No se recreó el volumen en este cierre porque no cambiaron el esquema ni las migraciones; la aplicación desde base vacía corresponde a la corrida inicial documentada.
- TypeScript/lint: aprobado en web, API, worker y paquetes compartidos.
- Pruebas unitarias: 4 aprobadas.
- Pruebas integrales PostgreSQL: 13 aprobadas.
- Escaneo del registro capturado: sin secretos generados, cabeceras de sesión ni marcadores de contenido clínico.
- Build optimizado de Next.js y compilación de API/worker/paquetes: aprobados.
- Imágenes locales de web y API: construidas sin depender de una base activa durante el build.
- Stack de imágenes iniciado: PostgreSQL, API y web reportaron estado sano; la página mostró el rótulo de entorno sintético/no apto para pacientes.
- Prueba negativa de salud: la misma imagen de API, apuntada a un PostgreSQL inaccesible, respondió `503` con `DATABASE_UNREACHABLE` sin exponer la URL.

## Cierre del aviso de pnpm

La referencia original fijaba pnpm `10.33.2`. El aviso oficial [GHSA-cjhr-43r9-cfmw](https://github.com/pnpm/pnpm/security/advisories/GHSA-cjhr-43r9-cfmw) declara afectadas las versiones `<10.34.0` y menciona 10.33.2 entre las reproducciones; el riesgo es reenviar credenciales npm no acotadas del usuario a un registro seleccionado por el repositorio. No se usaron ni mostraron credenciales de registro durante esta corrección.

Se eligió [10.34.9](https://github.com/pnpm/pnpm/releases/tag/v10.34.9), último parche publicado de la rama 10.x a la fecha del cierre. Además del aviso indicado, se revisó el [listado público de avisos del repositorio](https://github.com/pnpm/pnpm/security/advisories): las correcciones aplicables posteriores para 10.x exigen como máximo `10.34.5`, incluida la protección frente a recorridos de ruta y expansión de secretos en configuración. Ningún aviso publicado consultado declara afectada la versión 10.34.9. Esto describe la consulta del 24 de noviembre de 2026 y no sustituye vigilancia futura.

Se actualizaron `package.json`, README, CI, ADR y ambos Dockerfiles. `pnpm-lock.yaml` se conservó byte por byte porque 10.34.9 aceptó la instalación congelada sin resolver ni reescribir dependencias.

La verificación integral se conserva localmente en `.local/test-output.log`; no se versiona porque puede contener identificadores sintéticos efímeros. El workflow de CI vuelve a producir la evidencia desde una base vacía.

## Archivos de auditoría

- `database/schema.prisma` y `database/migrations/`: contrato y cambios de base.
- `packages/access-policy/src/index.ts`: predicado central.
- `apps/api/src/auth/`: integración de sesión, recuperación y MFA.
- `apps/api/src/invitations/`: invitación y activación.
- `apps/api/test/access.integration.spec.ts`: recorrido integral y pruebas negativas.
- `apps/worker/src/index.ts`: revalidación al ejecutar trabajo.
- `scripts/verify-demo.ts` y `scripts/scan-sensitive-output.ts`: reproducción y control de logs.
- `docs/adr/0001_base_tecnica_identidad_y_autorizacion.md`: decisiones adoptadas y alternativas.

## No ejecutado o no habilitado

- No hubo despliegue, dominio, Coolify, OVH, staging ni producción.
- No se creó cuenta externa, se envió correo, se contactó persona, se cobró, se usó video ni se tocó otro proyecto.
- No se ejecutó el workflow alojado de GitHub; solo se creó y se reprodujeron localmente sus pasos.
- No se cargaron datos, documentos ni expedientes reales.
- No se implementaron agenda, notas, adjuntos, pagos, video ni aperturas de caso; pertenecen a bloques posteriores.
- No se verificó restauración de backup; corresponde a FBE-018.

## Riesgos y validaciones pendientes

- David debe validar capacidades institucionales, responsables de invitación/desactivación y el procedimiento cuando se pierden tanto TOTP como códigos de respaldo.
- Correo institucional, recuperación asistida, dominio y remitente deben resolverse antes de cualquier entorno con usuarios reales.
- Política jurídica de conservación, atención, representación y procesos clínicos sigue pendiente de sus responsables.
- La auditoría es append-only para la aplicación, no inmutable frente al dueño de la infraestructura.
- CI está definido pero no se afirma aprobado por GitHub hasta ejecutarlo allí.

## Siguiente bloque

FBE-005 a FBE-008: registro funcional de personas y apertura de casos, catálogo/disponibilidad, reservas concurrentes en PostgreSQL y cancelación/reprogramación. Requiere que David confirme al menos los campos operativos mínimos, servicios/modalidades habilitados y responsables de asignación; esas decisiones no impiden conservar esta base local.
