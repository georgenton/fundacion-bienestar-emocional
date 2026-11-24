# Evidencia de staging sintético — 24 de noviembre de 2026

## Alcance y versión promovida

Esta evidencia registra una promoción manual y observada sobre el proyecto y environment exclusivos de la Fundación para el Bienestar Emocional en Coolify. Se usaron únicamente identidades y casos sintéticos. No se modificaron el proxy global, recursos de otros proyectos ni cuentas de pacientes.

| Elemento | Evidencia observada |
|---|---|
| Repositorio | `georgenton/fundacion-bienestar-emocional` |
| Commit desplegado | `0438bf99615d2ccc74e6c97034dafdf4ebea3760` |
| Cambio previo | [PR #5](https://github.com/georgenton/fundacion-bienestar-emocional/pull/5), aislamiento de proyectos Compose entre clones |
| CI que publicó y probó imágenes | [run 45452399716](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45452399716): `verify-block-1`, `docker-verify` y `publish-images` aprobados |
| Handoff validado | [run 45453345318](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45453345318), estado `handoff_only_not_deployed` antes de la promoción manual |
| Plataforma destino | Coolify `v4.7.6`, Ubuntu 24.04, `linux/amd64`, Docker 29.8.1 |
| Web | <https://fbe-staging.syntavera.dev> |
| API | <https://fbe-api-staging.syntavera.dev> |

Imágenes consumidas por digest:

```text
ghcr.io/georgenton/fundacion-bienestar-emocional-api@sha256:5b8b185d36c7ffa6686b26a0668d33edb172391b236936f32f6783b6ec79d245
ghcr.io/georgenton/fundacion-bienestar-emocional-migrate@sha256:b858e606a6498204351b6456d54435f5cd0bf5d20410f082b53e96d7f41f1a38
ghcr.io/georgenton/fundacion-bienestar-emocional-web@sha256:30d13400d6362f3d43f85eb63c393095acca6b6028d7684cc790b58708926b49
```

## Configuración observada

- Proyecto `Fundación Bienestar Emocional`, environment `staging` y Application Compose `fbe-staging-app` desde la rama `main` y `infra/compose.staging.coolify.yaml`.
- PostgreSQL privado `fbe-staging-postgres`, imagen `postgres:18.7-bookworm`, base `fbe_staging`, volumen dedicado y sin puerto público.
- Rol de migración separado del rol `fbe_runtime`. El segundo se verificó con `super=false`, `createdb=false`, `createrole=false`, `inherit=false` y sin `CREATE` sobre el esquema `public`.
- Variables secretas custodiadas en Coolify; ninguna se añadió a Git, al handoff o a argumentos de build. Los valores provisionales representados durante la automatización se revocaron antes del primer despliegue y se verificó el login de ambos roles con la rotación definitiva. No se reproducen aquí.
- Promoción manual: `Auto deploy` quedó en `Manual deployments only`.
- Red privada: la aplicación mantiene su red aislada y se conecta también a la red predefinida de Coolify para alcanzar el PostgreSQL independiente.
- Rutas HTTPS: web a `web:3000` y API a `api:3001`. No se publicó el migrador ni la base.
- `SYNTHETIC_DATA_ONLY=true`, `APP_ENV=production` y seed automático deshabilitado. Los fixtures se cargaron como operación puntual en un contenedor efímero que se eliminó al terminar.

## Despliegue y corrección observada

El primer intento descargó las imágenes correctas y creó los contenedores, pero detuvo la promoción porque el migrador no podía resolver el PostgreSQL desde la red aislada (`P1001`, salida 1). No se omitió la migración. Se conectó únicamente la Application FBE a la red predefinida de Coolify y se repitió la promoción.

El segundo intento terminó correctamente sobre el commit esperado:

- migrador: `exited`, código `0`;
- API: `running`, healthcheck `healthy`;
- web: `running`, healthcheck `healthy`;
- migraciones Prisma: `3/3` finalizadas;
- fixtures finales: `8/8` personas y `2/2` casos marcados `synthetic=true`.

La prueba integral se ejecutó dentro de un contenedor efímero de la imagen aprobada. Un primer intento de Vitest como usuario `node` creó los fixtures pero no pudo escribir el archivo temporal de Vite sobre la capa de imagen (`EACCES`). Se repitió exclusivamente el contenedor de seed/pruebas como root; los contenedores desplegados conservaron su usuario no privilegiado. Resultado: **1 archivo y 16 pruebas PostgreSQL aprobadas en 7,78 s**.

## Comprobaciones externas

| Comprobación | Resultado observado |
|---|---|
| `GET https://fbe-api-staging.syntavera.dev/health` | HTTP 200; `database=reachable`, `syntheticDataOnly=true` |
| Casos sin sesión | HTTP 401 |
| `GET https://fbe-staging.syntavera.dev/` | HTTP 200; marcador `NO APTO PARA PACIENTES` |
| Certificado API | Let's Encrypt; CN exacto; válido del 24-11-2026 al 22-02-2027 |
| Certificado web | Let's Encrypt; CN exacto; válido del 24-11-2026 al 22-02-2027 |
| Recepción ficticia | Login 200, MFA 200, dos casos en lista, contenido clínico denegado con 404 |
| Profesional ficticio | Login 200, MFA 200, solo `SYN-CASE-A`; clínica A 200 y clínica B 404 |
| Paciente ficticio | Login 200 sin MFA, solo `SYN-CASE-A`; resumen A 200, clínica A y resumen B 404 |
| Soporte ficticio | Login 200, MFA 200, lista vacía y resumen A 404 |
| Logs API/web/migrador | Cero coincidencias para URL PostgreSQL, secreto de auth, TOTP, códigos de respaldo, `Authorization` o `Set-Cookie` |

El recorrido inicial de humo reutilizó un TOTP dentro de la misma ventana y alcanzó el límite de intentos antes de soporte. Esos HTTP 401/429 no se contaron como evidencia de autorización. El recorrido se repitió con una sola sesión por actor y soporte se verificó por separado después de vencer la ventana.

La imagen web desplegada incorpora `https://fbe-api-staging.syntavera.dev` durante el build. Su rótulo visual todavía dice `ENTORNO LOCAL`; el dominio, TLS y API corresponden a staging, pero el texto debe generalizarse en una entrega posterior para no inducir a error.

## Capacidad, recuperación y pendientes

Antes del despliegue se observaron 6 CPU, 11,4 GiB de RAM y aproximadamente 16 GiB de disco disponibles. Después de la promoción el disco raíz tenía **13 GiB disponibles y 87 % usado**; es un riesgo operativo y no autoriza limpiezas globales del host compartido.

No se ejecutó ni se afirma:

- respaldo externo cifrado o restauración comprobada;
- actualización sucesiva de esquema ni rollback de imagen/base;
- monitorización, alertas o métricas históricas (deshabilitadas en el servidor);
- correo institucional de invitación/recuperación ni procedimiento aprobado para pérdida de todos los factores;
- alta disponibilidad, pruebas de carga, producción o atención de pacientes;
- expedientes, documentos, pagos, video o información real.

El rollback disponible para la aplicación consiste en restaurar los tres digests anteriores solo si continúan siendo compatibles con el esquema. No se debe borrar el volumen ni revertir automáticamente PostgreSQL. La restauración de datos continúa siendo un requisito pendiente antes de cualquier piloto.
