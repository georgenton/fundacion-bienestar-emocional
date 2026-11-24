# Auditoría independiente y preparación pública — 24 de noviembre de 2026

## Alcance y procedencia

Se revisó el ZIP `fbe_codex-bloque1-auditoria-5c325950.zip` suministrado por Jorge, su código, migraciones, pruebas y documentación. No se accedió a expedientes ni a una base con personas reales.

| Dato | Resultado observado |
|---|---|
| SHA-256 del ZIP | `e35a5f4c08858cce2b1ff07ea71c220a774de16cc14c2d1d19ec8de581863a63` |
| Comentario del archivo Git archive | `5c325950cff66dd9d215761f08ee0be5e4555bae` |
| Inventario original | 126 entradas; 88 archivos; CRC válido |
| SHA-256 de `pnpm-lock.yaml` | `dc1a2e260e85bc218f481708e6705ca9297305af4eb5a52f560b2846979e99f8` |
| Historial Git original | No está dentro del ZIP; su ascendencia y limpieza no son comprobables con este archivo |
| Publicación | Copia saneada con historia pública nueva; original del Mac conservado en privado |

La evidencia local entregada por el autor se conserva como documento histórico en [08_evidencia_bloque_1.md](08_evidencia_bloque_1.md). Esta auditoría separa los resultados reproducidos de las afirmaciones suministradas. El hash acredita integridad de la copia recibida, no una firma de autoría.

## Dictamen del código recibido

El original requería correcciones antes de ampliar su alcance. Se identificó un hallazgo P1 y tres P2 de identidad, aislamiento o autorización. La severidad expresa la prioridad técnica dentro de este prototipo; no se afirma un incidente real ni acceso a información de pacientes.

| Prioridad | Hallazgo | Corrección incluida |
|---|---|---|
| P1 | El guard aceptaba el enrolamiento global de MFA como prueba de verificación para cualquier sesión. Una sesión de contraseña anterior al enrolamiento conservaba acceso al cambiar ese indicador. | Evidencia persistida por sesión `mfaVerified`, creada siempre en falso, no modificable por el cliente y concedida por el verificador satisfactorio. Se exige también cuando el usuario enroló MFA opcional. Se revocan sesiones previas y se protegen rutas sensibles del proveedor. |
| P2 | La pantalla podía conservar metadatos de casos de otra sesión, incluida una respuesta HTTP tardía. | Resultados asociados a usuario y sesión, borrado al salir, cancelación y descarte de respuestas obsoletas. |
| P2 | Las mutaciones Nest autenticadas por cookie no comprobaban el origen; CORS por sí solo no impedía un POST simple. | Origen exacto de la web obligatorio en mutaciones con cookie. Se rechazan origen ajeno, ausente y null. |
| P2 | Una asignación sin permiso de lectura operativa seguía incluyendo el caso en el listado. | El listado por asignación exige `CASE_OVERVIEW_READ`; se conservan los alcances independientes por participación y capacidades administrativas. |

La corrección MFA no depende únicamente de borrar sesiones: una prueba controla la creación concurrente de una sesión y verifica que no herede la garantía del segundo factor. Se utilizó la biblioteca Better Auth instalada y su adaptador oficial en memoria. PostgreSQL debe comprobar además persistencia y guards HTTP reales.

Archivos principales: `apps/api/src/auth/mfa-session-security.ts`, `session.guard.ts`, `mutation-origin.ts`, `apps/web/src/lib/session-request.ts`, `apps/web/src/app/page.tsx`, `packages/access-policy/src/index.ts` y la tercera migración `202611240001_session_mfa_assurance`.

## Publicación y DevOps

Se retiraron de los documentos publicados enlaces internos de Notion y referencias innecesarias a otros proyectos. El conjunto versionado excluye `.env`, credenciales, outboxes, dependencias, bases, builds y código Prisma generado. No se asignó una licencia nueva: continúa `UNLICENSED` hasta una decisión expresa.

La preparación DevOps incorpora:

- Runners alojados por GitHub, permisos mínimos y acciones fijadas por SHA completo.
- PostgreSQL de CI autenticado con credenciales aleatorias y recursos efímeros por job.
- Generación de Prisma y compilación de paquetes antes del análisis de tipos.
- Pruebas de fuentes y prueba separada de construcción y arranque de API, migrador y web.
- Captura de salida de la demostración y escaneo antes de publicarla en logs públicos, también ante fallos.
- Contenedores sin root, migrador de una sola ejecución, origen API compilado en la web y separación de secretos.
- Publicación GHCR limitada a `main`, después de los checks, con habilitación explícita; referencias por digest.
- Validación del run de CI y del manifiesto antes de preparar un handoff de staging.
- Compose independiente para Coolify, documentación de secretos, permisos de base, migración y recuperación.

El workflow `Prepare staging handoff` no despliega: prepara un artefacto verificable. La primera promoción se realizó manualmente después de validar ese artefacto; la integración automática con la API de Coolify continúa sin implementarse. El [runbook](10_devops_y_despliegue.md), la [evidencia de staging](13_evidencia_staging_2026-11-24.md) y [ADR-0002](adr/0002_devops_github_actions_coolify.md) describen decisiones y límites.

## Verificación independiente antes de CI alojado

Entorno de comprobación: Node 24.22.3, pnpm 10.34.9 y dependencias instaladas con el lockfile intacto. El entorno de auditoría no tiene Docker ni PostgreSQL disponibles; no se sustituyeron por simulaciones para afirmar pruebas de infraestructura.

| Comprobación ejecutada | Resultado |
|---|---|
| Instalación del original con `--frozen-lockfile` | Aprobada |
| Lint y pruebas sin PostgreSQL del original | Aprobados; 4 pruebas |
| Instalación de la copia corregida con lockfile congelado | Aprobada |
| Generación Prisma y compilación de configuración, base, política y worker | Aprobadas |
| Lint/TypeScript de la copia corregida | Aprobado |
| Pruebas sin PostgreSQL de la copia corregida | 15 aprobadas en 5 archivos |
| Límites de elegibilidad y manifiestos de promoción | 20 aprobados |
| Build completo de Next, API, worker y paquetes | Aprobado |
| Espacios/patch y conservación del hash del lockfile | Aprobados |
| Integrales PostgreSQL y contenedores en este entorno | No ejecutados; requieren el runner alojado o un host equipado |

Las 15 pruebas incluyen 4 previas, 4 de MFA con Better Auth, 3 de aislamiento de interfaz y 4 de origen. La suite PostgreSQL contiene 16 casos: los 13 originales y regresiones de MFA, origen y permisos del listado. Tener el archivo de prueba no equivale a haberlo ejecutado.

Comandos de la copia corregida:

```bash
pnpm install --frozen-lockfile
pnpm packages:build
pnpm lint
pnpm --filter @fbe/api test
node --test scripts/devops/release-validation.test.mjs
pnpm build
```

En este entorno se usó `node --import tsx scripts/init-env.ts` para inicializar la configuración local, porque el lanzador de tsx necesitaba un socket IPC no permitido. Se ejecutó el mismo script sin modificar el contrato del proyecto. Las credenciales locales siguen excluidas de la publicación.

## Registro de GitHub y Coolify

Repositorio público creado: [georgenton/fundacion-bienestar-emocional](https://github.com/georgenton/fundacion-bienestar-emocional).

Configuraciones comprobadas en GitHub antes de la primera publicación completa: acciones con SHA completo obligatorio, token de lectura por defecto, aprobación para contribuciones externas de forks, retención de 14 días y environment `staging` limitado a la rama `main`. No se exige un revisor adicional para esta operación individual autorizada.

En Coolify se creó un proyecto propio de la fundación y su environment `staging`. El 24 de noviembre se configuraron y desplegaron manualmente PostgreSQL y la Application Compose de FBE con datos sintéticos. No se modificaron el proxy global ni aplicaciones ajenas. Sus identificadores y dirección de administración no se publican aquí; los nombres, versión y resultados no secretos están en [docs/13](13_evidencia_staging_2026-11-24.md).

### Primera promoción real de staging

El commit `0438bf99615d2ccc74e6c97034dafdf4ebea3760` se publicó, validó mediante handoff y promovió por los tres digests registrados. El migrador terminó con código cero, la API y web quedaron saludables, TLS fue válido y el recorrido HTTPS sintético confirmó la separación de recepción, profesional, paciente y soporte. La promoción conserva autodespliegue deshabilitado y no habilita pacientes. Véase la [evidencia exacta](13_evidencia_staging_2026-11-24.md).

### Primera ejecución alojada comprobada

[PR #1](https://github.com/georgenton/fundacion-bienestar-emocional/pull/1), commit `7705ea14f50bb89e7bcddfe8eee506a64a1bbecb`, [CI run 45443742642](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45443742642): **completado con éxito** el 24 de noviembre de 2026.

| Job | Evidencia observada |
|---|---|
| `verify-block-1` | Instalación congelada, tres migraciones desde PostgreSQL efímero nuevo, generación/compilación, lint, 15 pruebas sin DB, 16 integrales PostgreSQL, escaneo de registros, build completo y 20 pruebas de promoción: aprobados. |
| `docker-verify` | Construcción de API, migrador y web; migración previa al arranque; PostgreSQL y API saludables; página sintética accesible y casos anónimos rechazados: aprobado. |
| `publish-images` | Omitido según diseño: el evento era PR y la publicación no está habilitada. No existen todavía digests publicados de esta entrega. |

Son **51 pruebas automáticas aprobadas**, además de las comprobaciones de build y contenedores. Los logs revisados muestran el resultado del escaneo antes de terminar la demostración. Esta ejecución prueba los contenedores en un runner de GitHub; no prueba el proxy, TLS, cookies o capacidad de OVH.

### Protección de main verificada

La reautenticación pendiente se completó fuera de esta revisión. El 24 de noviembre de 2026 se volvió a consultar el estado efectivo mediante la API de GitHub y se observó activo el ruleset `main · PR y CI obligatorios` (`28003758`), aplicado a la rama predeterminada: PR obligatorio, rama actualizada, resolución de conversaciones, checks `verify-block-1` y `docker-verify`, bloqueo de borrado y force-push, sin actores de bypass y con cero revisiones externas obligatorias para la operación individual. El environment `staging` conserva una política que admite únicamente la rama `main`.

Esta comprobación acredita la configuración observada en ese momento; no convierte a un administrador del repositorio en un actor fuera del límite de confianza.

## Límites que permanecen

- Navegación autenticada, TLS y cookies ya se comprobaron con identidades sintéticas en los dominios de staging; faltan respaldo/restauración y monitorización operativa.
- El enlace de invitación apunta a `/activate`, cuya pantalla aún no existe. Activación y respaldos MFA están verificados por API; no se presenta un recorrido visual completo.
- No están implementados el correo institucional ni el procedimiento validado para perder todos los factores MFA.
- El módulo worker comparte política y pruebas, pero no representa un servicio daemon desplegable.
- Los orígenes HTTPS, base privada, roles, secretos de staging, imágenes y Application Coolify ya están configurados. El texto visual de la web aún identifica el entorno como local y debe corregirse en otra entrega.
- Los tags exactos de las imágenes base aún no se fijan por digest; la imagen API todavía incluye dependencias de desarrollo. No se afirma reproducibilidad byte a byte ni una imagen mínima.
- Un esquema de auditoría append-only no vuelve los datos inmutables frente al dueño de la infraestructura.
- Agenda, expedientes clínicos, pagos y video siguen fuera del bloque 1. Esta revisión no autoriza atención de pacientes ni certifica cumplimiento sanitario o jurídico.
