# GitHub Actions, imágenes y staging sintético en Coolify

**Estado: CI, publicación por digest, handoff y primera promoción manual de staging sintético ejecutados satisfactoriamente.** La [evidencia de staging](13_evidencia_staging_2026-11-24.md) identifica la versión, imágenes y resultados observados; la [auditoría independiente](12_auditoria_independiente_2026-11-24.md) conserva la procedencia y los controles previos. Este despliegue no habilita atención de pacientes: continúa limitado a datos ficticios y conserva pendientes de respaldo, restauración y operación institucional.

## 1. Qué ejecuta cada flujo

| Flujo | Disparador | Resultado | Permisos especiales |
|---|---|---|---|
| `CI / verify-block-1` | PR, push a `main` o ejecución manual | Instalación con lockfile, PostgreSQL autenticado, migraciones, generación Prisma y build de paquetes, lint, pruebas, demostración sintética, build y pruebas del control de promoción | Ninguno: `contents: read` |
| `CI / docker-verify` | Los mismos eventos | Construye API, migrador y web; arranca las imágenes con PostgreSQL efímero y comprueba disponibilidad y rechazo anónimo | Ningún login al registro; `push: false` |
| `CI / publish-images` | Push a `main`, verificaciones anteriores aprobadas y publicación habilitada | Publica las tres imágenes en GHCR, vuelve a probarlas por digest y guarda un manifiesto | `packages: write` únicamente en este job |
| `Prepare staging handoff` | Manual, desde `main`, indicando un ID de ejecución de CI | Valida la procedencia del manifiesto y produce referencias por digest para revisión | `actions: read`; environment `staging` |

El último flujo **no llama a Coolify**. Su resumen y artefacto identifican el estado `handoff_only_not_deployed`. GitHub puede asociar el job con su environment; ese registro tampoco prueba que los contenedores estén desplegados.

Las pruebas de contenedores verifican arranque, ejecución previa del migrador, respuesta de PostgreSQL, página sintética y HTTP 401 para casos sin autenticación. No sustituyen las pruebas de navegador, MFA, cookies, TLS, permisos clínicos o recuperación. Las pruebas de autorización e identidad existentes se ejecutan en el job de código; el nuevo migrador incluye todas las migraciones versionadas, sin fijar un número de archivos.

## 2. Configurar el repositorio público

El repositorio de trabajo público es `georgenton/fundacion-bienestar-emocional`. Los workflows derivan el nombre de las imágenes de `github.repository`; no contienen credenciales de una cuenta personal ni identificadores de infraestructura.

En Settings de GitHub:

1. Mantener permisos predeterminados de `GITHUB_TOKEN` de lectura. Exigir aprobación para contribuciones de forks y acciones fijadas por SHA completo.
2. Proteger `main` mediante PR y requerir los checks `verify-block-1` y `docker-verify`, después de que sus primeras ejecuciones existan. Verificar los nombres que muestra GitHub antes de guardar la regla. Las reglas del repositorio no se crean por escribir YAML.
3. Mantener el environment `staging` ya configurado para permitir solo `main`. Este staging sintético se ejecuta manualmente, dentro de la operación individual autorizada, y **no exige un revisor adicional**. Las comprobaciones de procedencia del run y del manifiesto siguen siendo obligatorias. Si más adelante se define una política de revisores para producción, se configura en ese environment; no se presume a partir del YAML. [Configuración oficial de environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
4. Definir la variable de repositorio `FBE_PUBLIC_API_ORIGIN` con el origen HTTPS real de la API, sin ruta ni barra final. No es un secreto. Debe coincidir con el destino configurado en Coolify y con `BETTER_AUTH_URL`.
5. Cuando ese origen esté decidido, definir `FBE_PUBLISH_IMAGES=true`. Sin ella se verifican fuentes e imágenes, pero se omite la publicación. No usar una URL ficticia para conseguir un job verde.

Un PR de fork no recibe secretos de despliegue ni permiso de publicación. No se usa `pull_request_target`, no se ejecuta código de PR con un token de publicación y no hay runner autogestionado en el OVH compartido. Las credenciales efímeras de PostgreSQL y autenticación se generan por job y se enmascaran antes de iniciar procesos. Se cachean el almacén de paquetes y capas de BuildKit; no se cachean `.env`, credenciales de demostración ni contenido de `.local`.

El job genera el cliente Prisma y compila los paquetes del workspace antes de `lint`: `prisma migrate deploy` aplica migraciones, pero no crea esos artefactos importados por las comprobaciones de tipos. Node 24 mantiene Corepack incluido; se habilita antes de seleccionar la versión fijada de pnpm. Corepack deja de distribuirse con Node a partir de la versión 25, por lo que una futura migración de versión mayor deberá revisar ese paso. [Distribución oficial de Corepack](https://github.com/nodejs/corepack#default-installs).

Los artefactos de release y handoff duran 14 días. Solo se suben archivos explícitos con SHA, procedencia, origen público y digests; nunca se sube el directorio `.local` completo. Se desactiva la subida automática de build records de Docker para mantener ese inventario explícito. Antes de publicar una entrega se deben revisar también sus logs. El análisis de logs detecta problemas, pero no recupera información que ya se haya emitido a un registro público.

### Historia pública y copia del Mac

El archivo ZIP auditado no contiene `.git`; no permite comprobar ni reconstruir los padres de un commit local. Una copia saneada puede iniciar una historia pública nueva, conservando el repositorio original del Mac como archivo privado. Esto evita incorporar referencias internas históricas a la publicación, pero **no convierte el nuevo commit en descendiente verificable del commit local declarado**.

Para el trabajo futuro, clonar el repositorio público en otra carpeta y crear ramas desde su `main`. Conservar el original del Mac aparte; trasladar cambios pendientes como diffs revisados, comprobando que no incluyan secretos o documentos privados. No hacer force-push del historial antiguo sobre el repositorio saneado ni unir historias sin revisar todos sus ancestros.

## 3. Identidad y trazabilidad de las imágenes

Se publican tres paquetes: `${repositorio}-api`, `${repositorio}-migrate` y `${repositorio}-web`, dentro del propietario de GHCR. La etiqueta es `sha-` seguida del SHA completo de 40 caracteres. Cada imagen lleva etiquetas OCI de repositorio y revisión.

La etiqueta facilita localizar una entrega; una etiqueta puede sobrescribirse en el registro. **El despliegue consume `imagen@sha256:…` del manifiesto**, que identifica el contenido exacto. El manifiesto solo se escribe después de probar las imágenes publicadas por sus digests. Una publicación parcial o una prueba fallida puede dejar imágenes en el registro, pero no produce un handoff elegible.

GHCR puede crear paquetes privados aunque el repositorio sea público. Después de la primera publicación, comprobar su vinculación y visibilidad. Para imágenes de código público, hacer públicos los paquetes permite que Coolify los descargue sin un token personal. Si deben permanecer privados, configurar credenciales de lectura limitadas en el registro de Coolify; no dar a sus contenedores el token de publicación. [Publicación de imágenes con GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

`Prepare staging handoff` recibe el **ID de una ejecución de CI**, no un SHA libre. Consulta GitHub y exige: mismo repositorio y repositorio de origen, evento `push`, rama `main`, workflow esperado, ejecución completada y exitosa. Descarga el artefacto nombrado con SHA, ID e intento; valida esos datos de nuevo, exige imágenes del paquete esperado por digest y compara el origen compilado con la configuración actual. Un run sin publicación, artefacto caducado, ejecución fallida o origen diferente detiene el proceso.

La construcción usa `linux/amd64`. Verificar la arquitectura del destino antes de desplegar. Las acciones están fijadas por SHA y las dependencias por lockfile. Las imágenes base Node y PostgreSQL conservan etiquetas de versión exacta; aún falta registrar sus digests verificados. Los paquetes del sistema instalados con APT también pueden cambiar. No se promete una reconstrucción idéntica byte a byte.

## 4. Origen de la API y separación de secretos

Next.js incorpora `NEXT_PUBLIC_API_BASE_URL` al JavaScript del navegador durante el build. El Dockerfile web ahora la recibe como argumento de construcción. Cambiar una variable de runtime no modifica un bundle ya construido. [Variables de entorno de Next.js](https://nextjs.org/docs/app/guides/environment-variables).

La web no recibe `DATABASE_URL`, `BETTER_AUTH_SECRET` ni el `.env` completo. La API recibe su conexión de runtime; el migrador recibe otra conexión con permisos para modificar el esquema. Ningún secreto se pasa como argumento de build.

Las tres imágenes ejecutan su proceso como el usuario `node`, sin privilegios root. La API dispone de una carpeta `.local` escribible para las rutas de demostración que lo requieran. La imagen API aún incluye dependencias de desarrollo de la instalación original; reducir ese contenido requiere comprobar el empaquetado del monorepo y Prisma. No se afirma que esa optimización ya esté terminada.

## 5. Preparar Coolify sin afectar otros proyectos

Usar un proyecto y environment propios de FBE y la definición `infra/compose.staging.coolify.yaml`. No reutilizar el Compose local, sus nombres de volumen ni sus credenciales. No ejecutar builds en el VPS: el destino descarga imágenes previamente publicadas. [Integración oficial de GitHub Actions con Coolify](https://coolify.io/docs/applications/sources/github/actions).

Antes del primer arranque, comprobar versión de Coolify, arquitectura, RAM y CPU disponibles, espacio e inodos, redes y recursos en funcionamiento. Las cuotas incluidas de 512 MiB y 0,5 CPU por servicio son límites iniciales propuestos, no una medición del consumo ni una reserva garantizada. El contenedor migrador tiene consumo temporal adicional. Ajustar también el PostgreSQL independiente con datos de uso reales; no cambiar el proxy global ni recursos ajenos para resolver un problema de FBE.

### Recursos y variables de la configuración real

| Elemento | Configuración requerida |
|---|---|
| PostgreSQL | Recurso propio, base sintética, almacenamiento persistente propio y red privada accesible por FBE. Sin puerto publicado a Internet. |
| `MIGRATION_DATABASE_URL` | Conexión privada de un rol dueño del esquema o con DDL suficiente. Solo en el migrador. |
| `DATABASE_URL` | Conexión privada de runtime. Rol con los permisos de tablas y secuencias necesarios, sin DDL ni superusuario. Revisar permisos por defecto después de nuevas migraciones. |
| `BETTER_AUTH_SECRET` | Valor aleatorio exclusivo de staging, custodiado como secreto. No reutilizar el de desarrollo. |
| `WEB_ORIGIN` | Origen HTTPS exacto de la interfaz. |
| `BETTER_AUTH_URL` | Origen HTTPS exacto de la API; coincidente con el origen compilado. |
| `FBE_API_IMAGE`, `FBE_MIGRATE_IMAGE`, `FBE_WEB_IMAGE` | Referencias completas por digest del handoff aprobado. |
| Dominios | Asignar en Coolify los destinos `web:3000` y `api:3001`, DNS y TLS reales. |

Los valores desconocidos no se incluyen en el repositorio. Crear o conectar la red privada adecuada en Coolify y verificar el nombre DNS real de PostgreSQL desde los contenedores. No asumir que el hostname `postgres` de CI existe en ese entorno.

La primera promoción real configuró estos elementos en el almacén privado de Coolify, sin publicar sus valores. PostgreSQL y la Application Compose comparten la red predefinida del servidor además de la red aislada de la aplicación; el primer intento falló de forma segura hasta añadir esa conexión. Los nombres de recursos, comprobaciones y límites observados están en [docs/13](13_evidencia_staging_2026-11-24.md).

Coolify distingue una Application Compose desde Git de un Service creado pegando una definición. Elegir y registrar el tipo real: sus endpoints y automatizaciones no son intercambiables. Para la Application desde Git, seleccionar este Compose y desactivar autodespliegues mientras la promoción sea manual. No confiar en una llamada de despliegue para seleccionar una versión de imagen que no se haya guardado antes. [Docker Compose en Coolify](https://coolify.io/docs/applications/builds/docker-compose).

El servicio `migrate` usa `restart: "no"`, termina tras `prisma migrate deploy` y la API depende de su finalización exitosa. Incluye `exclude_from_hc: true`, extensión documentada de Coolify para excluir un proceso de una sola ejecución de la salud global. **No es una propiedad estándar de Docker Compose.** Verificar su interpretación en la versión instalada; para una validación local estándar se debe generar una copia temporal sin esa única propiedad, nunca eliminar la dependencia de migración para lograr el arranque. Ante un fallo de migración, detener la promoción e investigar; no saltarlo ni marcarlo resuelto automáticamente.

La configuración aplica `APP_ENV=production` para activar el comportamiento correspondiente del servidor, mantiene `SYNTHETIC_DATA_ONLY=true` y prohíbe el seed automático. Los envíos reales de recuperación e invitaciones permanecen pendientes. El Compose sintético del bloque 2 habilita `ALLOW_SYNTHETIC_INVITATIONS=true` para usar su buzón local privado. El correo de los monitores conserva su configuración separada. Un seed sintético, si se necesita, es una operación puntual revisada, con credenciales temporales custodiadas; no una acción de cada deploy. El módulo worker actual no tiene un proceso daemon listo: no crear un contenedor que simule ese funcionamiento.

Para el expediente sintético, el Compose declara el volumen privado `fbe-private-attachments` en `/workspace/.local/private-attachments`. Revisar la configuración de almacenamiento interpretada por Coolify y, tras la promoción, comprobar que la API puede escribir en ese montaje con el usuario de la imagen. Conservar el volumen al cambiar digests. El respaldo cifrado incluye los objetos referenciados por la misma instantánea SQL. [Almacenamiento persistente de Coolify](https://coolify.io/docs/applications/configuration/persistent-storage) · [Evidencia del bloque 3](17_evidencia_bloque_3.md).

## 6. Promoción y comprobación del entorno

1. Obtener un run exitoso de `CI` con las tres imágenes publicadas y probadas. Conservar su SHA y manifiesto.
2. Ejecutar manualmente `Prepare staging handoff` desde `main` con el ID de ese run. Revisar el environment y el artefacto resultante.
3. Revisar capacidad, conexión privada, permisos, respaldo y compatibilidad de migraciones. Guardar el manifiesto y la configuración de la entrega anterior.
4. Aplicar los tres digests en el recurso aislado de Coolify, revisar los secretos y seleccionar el Compose correspondiente. Desplegar únicamente ese recurso y observar la finalización del migrador antes de aceptar API y web saludables.
5. Comprobar HTTPS desde fuera del host, origen efectivo de las peticiones del navegador, cookies, CORS, login, MFA, cierre de sesión, denegación de casos ajenos y ausencia de datos de una sesión anterior. No usar un perfil o información de pacientes reales.
6. Registrar fecha, SHA, digests, resultado de migración, comprobaciones y persona responsable. Solo entonces indicar “desplegado en staging sintético”.

El parámetro `tag` de `/deploy` en Coolify selecciona **recursos etiquetados**; no cambia la etiqueta de una imagen. El parámetro `docker_tag` documentado tiene restricciones para previews de Docker Image. Una futura automatización deberá identificar el tipo de recurso, comprobar el esquema API de la instalación, guardar digests por el endpoint adecuado y luego desplegar el UUID concreto con permisos mínimos. No se proporciona un curl genérico que oculte esos pasos. [API de deploy](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid), [permisos de API](https://coolify.io/docs/api/permissions) y [Docker Image por digest](https://coolify.io/docs/applications/deployments/docker-image).

## 7. Recuperación y límites pendientes

Antes de una migración que altere datos, disponer de respaldo externo cifrado y una restauración comprobada de PostgreSQL. Versionar y custodiar también la configuración necesaria para recuperar el servicio. Un volumen Docker persistente no es un respaldo.

Para rollback de aplicación, restaurar los digests de la entrega anterior únicamente si su código es compatible con el esquema actual. No revertir la base automáticamente, borrar volúmenes ni usar `migrate resolve` para ocultar una migración fallida. Cuando haya cambios incompatibles, se necesita una corrección hacia adelante o una restauración deliberada y comprobada, con su pérdida potencial de cambios explicada.

Conservar el manifiesto operativo fuera del artefacto temporal de Actions antes de que expire. No ejecutar limpiezas globales de Docker en el servidor compartido. La limpieza `down --volumes` de este CI se limita a proyectos efímeros de runners alojados por GitHub; no es una instrucción para staging.

Ya se demostraron en el entorno real la descarga anónima de GHCR, la interpretación del Compose, el rol de runtime sin DDL, la primera migración, HTTPS y el recorrido autenticado con perfiles sintéticos. Continúan pendientes una migración sucesiva con cambio de esquema, monitorización, alertas, respaldo externo y restauración comprobada. La capacidad disponible observada es reducida y no demuestra margen para crecimiento. No se afirma alta disponibilidad, operación clínica, cumplimiento normativo ni coste cero por usar un VPS ya contratado.
