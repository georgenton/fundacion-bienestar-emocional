# Plataforma de la Fundación para el Bienestar Emocional

Entrega sintética de los bloques 1 a 4, preparada para Jorge Quizamanchuro y para validación institucional de David Jaramillo. FBE-016 tiene verificado el acceso de aplicación y conserva pendientes los ensayos reales del proveedor de video. Usa exclusivamente identidades y casos ficticios.

La web y la API permiten trabajar con personas, casos, agenda, expediente, economía y portal sintéticos sobre la identidad, MFA y autorización del bloque 1. Las videoconsultas usan enlaces administrados por cita. La atención y los movimientos de dinero reales siguen sujetos a los criterios del piloto institucional.

## Repositorio público y auditoría

Repositorio canónico: [georgenton/fundacion-bienestar-emocional](https://github.com/georgenton/fundacion-bienestar-emocional).

Esta historia pública comienza con una copia saneada del ZIP del bloque 1 y las correcciones de la auditoría independiente del 24 de noviembre de 2026. El ZIP identifica el commit local `5c325950cff66dd9d215761f08ee0be5e4555bae`, pero no contiene su historial Git. La copia original del Mac se conserva en privado; el desarrollo público continúa desde un clon nuevo de este repositorio. Véanse [procedencia y autorizaciones](docs/11_autorizaciones_codex_y_publicacion.md) y [auditoría independiente](docs/12_auditoria_independiente_2026-11-24.md).

Las correcciones añaden verificación MFA por sesión, aislamiento del resultado mostrado al cambiar de cuenta, comprobación de origen en mutaciones y coherencia entre asignaciones y listados. El bloque 2 agrega la pantalla `/activate` para las invitaciones del buzón sintético. El bloque 4 lleva el esquema a seis migraciones.

## Requisitos fijados

| Componente | Versión |
|---|---:|
| Node.js | 24.22.3 LTS |
| pnpm | 10.34.9 |
| Next.js / React | 16.4.6 / 19.3.1 |
| NestJS | 12.6.0 |
| PostgreSQL | 18.7 |
| Prisma | 7.10.1 estable |
| Better Auth | 1.7.27 estable |
| TypeScript | 6.0.3 |

La selección, compatibilidad, alternativas y fuentes oficiales están en `docs/adr/0001_base_tecnica_identidad_y_autorizacion.md`. No se adoptó Prisma 8 porque sigue como release candidate, ni PostgreSQL 19 porque Prisma 7 documenta compatibilidad estable hasta PostgreSQL 18.

## Arranque limpio

Se requiere Node.js 24.22.3, Docker y Docker Compose. El Node 20 del equipo original está fuera del contrato de este repositorio; use `.nvmrc` o un contenedor Node 24.

```bash
corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm install --frozen-lockfile
pnpm env:init
docker compose up -d --wait postgres
pnpm db:migrate
ALLOW_SYNTHETIC_SEED=true pnpm db:seed
pnpm demo:verify
pnpm dev
```

Abra `http://localhost:3000`; la salud de la API está en `http://localhost:3001/health`. Las credenciales, secretos TOTP y códigos de respaldo se generan aleatoriamente en `.local/demo-credentials.json` con permisos `0600`. Ese archivo y `.env` están excluidos de Git. No copie esas credenciales a otro entorno.

`pnpm env:init` no sobrescribe un `.env` existente. Los seeds fallan salvo que `ALLOW_SYNTHETIC_SEED=true`, `SYNTHETIC_DATA_ONLY=true` y el entorno no sea producción. Los correos no se envían: en desarrollo, invitaciones y recuperaciones quedan en `.local/invitation-outbox` y `.local/recovery-outbox`.

Para levantar las imágenes locales después de migrar y sembrar la base:

```bash
docker compose --profile app up --build
```

Los puertos publicados se pueden cambiar sin tocar otros proyectos. Por ejemplo, si `3000` ya está ocupado: `WEB_HOST_PORT=3300 docker compose --profile app up -d --wait`. En ese caso abra `http://localhost:3300`; la aplicación dentro del contenedor continúa escuchando en `3000`.

Para eliminar **solo** la base sintética local de este proyecto y repetir desde cero:

```bash
docker compose down --volumes
docker compose up -d --wait postgres
pnpm db:migrate
pnpm demo:verify
```

## Pagos, portal y videoconsultas sintéticos

Recepción registra obligaciones a partir de citas confirmadas. En **Economía**, el paciente puede declarar un pago y adjuntar/consultar su comprobante de prueba. Los perfiles de finanzas y profesional consultan los movimientos que les corresponden. El formato de comprobante es `.txt` UTF-8 de hasta 16 KiB. No se procesa dinero real.

En **Recordatorios** el paciente habilita la bandeja privada de ensayo. Para probar un despacho local sobre la base sintética, cargue la configuración local y ejecute `node --env-file=.env apps/worker/dist/dispatch.js` después de `pnpm packages:build`. Use `ALLOW_SYNTHETIC_SEED=false` durante el despacho. En citas online, **Videoconsulta** muestra el acceso con permisos vigentes y las tareas de cierre externo cuando corresponda.

La regla económica, el procedimiento de video y los límites institucionales están en el [ADR 0005](docs/adr/0005_economia_portal_y_video_sinteticos.md). Consulte los recorridos y el estado observado en la [evidencia del bloque 4](docs/19_evidencia_bloque_4.md).

## Verificación

```bash
pnpm lint
pnpm test
pnpm demo:verify
pnpm build
pnpm logs:scan
node --test scripts/devops/release-validation.test.mjs
```

`demo:verify` vuelve a crear fixtures sintéticos, ejecuta el recorrido integral sobre PostgreSQL y examina el registro capturado contra los secretos generados, cabeceras de sesión y marcadores de contenido clínico. Cubre acceso permitido/denegado, cambio de identificador, listados, exportación, revocación con sesión abierta, desactivación de cuenta, invitación de un solo uso, recuperación expirada/no reutilizable y código de respaldo MFA de un solo uso.

El CI reproduce migraciones, pruebas, escaneo, build y recorridos Chromium de los bloques 2, 3 y 4 en `.github/workflows/ci.yml`, y construye y arranca las imágenes en un job separado. La publicación GHCR requiere configuración explícita. El flujo manual de staging prepara referencias de imágenes verificadas y no llama a Coolify por sí mismo. La primera promoción manual real y sus comprobaciones están en [docs/13_evidencia_staging_2026-11-24.md](docs/13_evidencia_staging_2026-11-24.md). Aprobar CI o desplegar este entorno sintético no equivale a habilitar atención.

## Límites de acceso demostrados

| Actor sintético | Resultado del servidor |
|---|---|
| Recepción | Lista y resumen operativo; no contenido clínico. |
| Profesional | Lectura del expediente con alcance clínico explícito y vigente sobre el caso. |
| Paciente | Resumen de su caso por identidad y participación; no ve otro caso ni contenido aún no compartido. |
| Soporte | Diagnóstico técnico; lista de casos vacía y sin lectura clínica. |
| Administración operativa | Lista institucional, invitaciones y desactivación; nunca permiso clínico universal. |
| Supervisor/pasante | Solo las acciones incluidas en asignaciones vigentes; el pasante del fixture no recibe lectura clínica. |

Las rutas clínicas devuelven `Cache-Control: no-store, private`. La API registra decisiones con identificadores mínimos y la tabla de auditoría rechaza actualizaciones o eliminaciones ordinarias.

## Personas, casos y agenda

Recepción puede registrar una persona sin cuenta, abrir y asignar un caso, reservar, confirmar, reprogramar y cancelar citas o registrar asistencia. La activación posterior conserva la persona, su participación y el caso. Las operaciones se limitan al entorno sintético; la agenda se muestra en `America/Guayaquil`. Consulte el [recorrido, las decisiones y la evidencia del bloque 2](docs/16_evidencia_bloque_2.md).

## Expediente y prácticas

Con cuentas sintéticas, coordinación otorga alcance por caso, el paciente acepta un texto de prueba y el profesional abre una atención desde una cita confirmada. La nota validada conserva autoría y se corrige mediante adendas. El pasante trabaja con alcance vigente y supervisor explícito. Los documentos seleccionados se publican por versión y destinatario. Consulte el [recorrido y la evidencia del bloque 3](docs/17_evidencia_bloque_3.md).

La [revisión independiente del bloque 3](docs/18_auditoria_bloque_3.md) corrige la retirada de una aceptación anterior cuando cambia su plantilla y separa la conclusión de la atención de sus pendientes documentales. La [revisión del bloque 4](docs/20_auditoria_bloque_4.md) documenta las regresiones de recordatorios, video y auditoría financiera. El siguiente encargo está en [cierre de verificación y preparación del piloto](prompts/09_cierre_verificacion_y_preparacion_piloto.md); antes de ejecutarlo se contrasta qué código está integrado y qué digests están realmente desplegados.

## Documentación

| Archivo | Uso |
|---|---|
| `AGENTS.md` | Reglas de ingeniería y privacidad. |
| `docs/01_alcance_y_producto.md` | Visión y módulos del producto completo. |
| `docs/02_arquitectura.md` | Arquitectura originalmente propuesta. |
| `docs/03_modelo_y_permisos.md` | Modelo y matriz originalmente propuestos. |
| `docs/04_backlog_y_aceptacion.md` | Backlog y evidencia enlazada del bloque 1. |
| `docs/08_evidencia_bloque_1.md` | Evidencia, comandos, resultados y pendientes de esta entrega. |
| `docs/09_recuperacion_de_acceso.md` | Contraseña, código de respaldo y pérdida de todos los factores. |
| `docs/10_devops_y_despliegue.md` | CI, GHCR, migraciones, Coolify, secretos y rollback. |
| `docs/11_autorizaciones_codex_y_publicacion.md` | Mandato del usuario, conexiones y publicación con historia saneada. |
| `docs/12_auditoria_independiente_2026-11-24.md` | Hallazgos, correcciones y evidencia de verificación independiente. |
| `docs/13_evidencia_staging_2026-11-24.md` | Versión promovida, configuración observada, pruebas HTTPS y pendientes de staging. |
| `docs/14_revision_staging_y_cierre_operativo.md` | Revisión independiente, capacidad, respaldo, restauración y siguiente cierre. |
| `docs/15_operacion_y_recuperacion_staging.md` | Inventario medido, ensayo aislado y procedimiento de respaldo y alertas. |
| `docs/18_auditoria_bloque_3.md` | Hallazgos, correcciones y límites de la revisión del expediente sintético. |
| `docs/20_auditoria_bloque_4.md` | Revisión independiente de economía, recordatorios, acceso a video y trazabilidad. |
| `prompts/08_pagos_portal_y_video.md` | Encargo FBE-013 a FBE-016, con finanzas manuales sintéticas, portal y enlaces externos. |
| `prompts/09_cierre_verificacion_y_preparacion_piloto.md` | Verificación operativa y preparación de la decisión institucional, conservando el entorno sintético. |
| `docs/releases/README.md` | Manifiestos de imágenes conservados y procedencia de sus artefactos. |
| `prompts/04_cierre_operativo_staging.md` | Encargo para completar recuperación y observabilidad de staging. |
| `prompts/05_automatizacion_operativa.md` | Activación del respaldo y avisos sin intervención, con las autorizaciones vigentes. |
| `prompts/06_cierre_correo_operativo.md` | Cierre de Exchange y recepción de avisos en ambos ejecutores, con respaldo y sonda ya activos. |
| `docs/adr/0001_base_tecnica_identidad_y_autorizacion.md` | Decisiones técnicas adoptadas para el bloque 1. |
| `docs/adr/0002_devops_github_actions_coolify.md` | Decisiones adoptadas para CI y preparación de staging. |
| `prompts/03_github_devops_y_staging.md` | Instrucción de continuación para Codex sobre el repositorio público. |

David o su delegado valida procesos asistenciales y administrativos. Jorge conduce las decisiones técnicas acordadas. La revisión de código y estas pruebas no certifican cumplimiento sanitario, jurídico o contractual.
