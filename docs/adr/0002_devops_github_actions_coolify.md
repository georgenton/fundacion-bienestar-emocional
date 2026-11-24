# ADR 0002 — CI público, imágenes verificadas y promoción manual a Coolify

Fecha: 2026-11-24. Estado: aceptado para preparar y verificar el staging sintético; la ejecución y el despliegue deben registrarse con su evidencia real.

## Contexto

El bloque inicial contenía CI de código sin construcción de imágenes, PostgreSQL CI con autenticación `trust`, acciones por etiquetas móviles, contenedores root y un bundle web que conservaba el origen local de la API. El Compose local se diseñó para desarrollo; sus volúmenes y variables no debían trasladarse sin revisión al servidor compartido.

El destino es OVH administrado por Coolify. Se necesita construir fuera de ese servidor, probar migraciones e imágenes antes de promoverlas y mantener una trazabilidad comprobable sin publicar credenciales ni referencias privadas del historial local.

## Decisión

- Ejecutar CI en runners alojados de GitHub, con permiso de lectura por defecto, cancelación de ejecuciones obsoletas y sin `pull_request_target`.
- Conservar las versiones de herramientas y el lockfile revisados; fijar las acciones a commits completos verificados. No instalar “latest” en los workflows.
- Crear credenciales de CI aleatorias por job, enmascararlas y usar PostgreSQL con contraseña. La base y sus recursos se eliminan al terminar ese job.
- Verificar código y construcción/arranque de tres imágenes en PR sin login al registro. Las imágenes de migración y API comparten el build pero tienen procesos separados.
- Publicar en GHCR solo tras aprobar ambos jobs, desde un push a `main` y con configuración explícita. Conservar SHA completo y digests; probar también las imágenes publicadas antes de emitir el manifiesto.
- Compilar la web con su origen API real. Es un dato público de build; ningún secreto se integra en ella. Ejecutar API, migrador y web sin root.
- Preparar la promoción a staging por ID de CI, comprobar procedencia y manifiesto y usar el environment de GitHub restringido a `main`. El dispatch manual de este staging sintético no requiere un revisor adicional en la operación individual autorizada. La primera versión produce un handoff revisable; no simula una integración con Coolify todavía no configurada.
- Consumir digests en un Compose propio, con migración de una sola ejecución antes del arranque de API, recursos acotados y PostgreSQL privado independiente. Mantener solo datos sintéticos.
- Publicar una historia nueva del snapshot saneado cuando no se dispone del repositorio Git original comprobable. Conservar la historia del Mac en privado; el desarrollo posterior parte de un clon público nuevo, sin force-push del historial anterior.

## Alternativas y consecuencias

Construir dentro de Coolify simplificaría algunos pasos, pero agregaría consumo de compilación al host compartido. No se adopta en esta fase. Desplegar cada push automáticamente reduciría intervención; primero se requieren orígenes reales, permisos de base, evidencias de capacidad y un flujo probado de migración y recuperación.

Aceptar un SHA libre en un dispatch permitiría promover código sin verificación. Se exige un run exitoso de `CI` del mismo repositorio, originado por `push` en `main`, y un artefacto concordante con su SHA, ID e intento. La comprobación incluye los digests y el origen público compilado. Esto depende también de proteger `main`: un administrador que puede cambiar los workflows sigue siendo parte del límite de confianza.

El migrador dispone de permisos DDL mientras la API usa un rol de runtime. El target de migración conserva Prisma, su configuración y todas las migraciones versionadas. No se ejecutan migraciones en el entrypoint de cada réplica API ni seeds en cada despliegue.

Las etiquetas SHA ayudan a ubicar una entrega, pero se usa el digest para seleccionar su contenido. Cambiar un origen público obliga a reconstruir la imagen web; mover una imagen ya compilada a otro dominio API no basta. La verificación HTTP de contenedores es acotada y no demuestra los flujos de navegador a través del proxy real.

La imagen API aún conserva dependencias de desarrollo. Las bases Node y PostgreSQL están fijadas por versión pero no por digest verificado, y APT depende del repositorio en el momento del build. Se documentan esas limitaciones en lugar de afirmar una reproducibilidad total o una imagen mínima.

No hay token Coolify en esta primera versión. Antes de añadirlo, confirmar el tipo de recurso y el endpoint de actualización; el campo `tag` del deploy API selecciona recursos, no versiones de imagen. Separar actualización de configuración y petición de despliegue, limitar permisos y no registrar los secretos.

## Acciones fijadas y procedencia

Referencias verificadas contra los refs de los repositorios oficiales de GitHub el 24 de noviembre de 2026. Una nueva versión requiere volver a verificar su commit y revisar el cambio; no sustituir estas referencias por etiquetas móviles.

| Acción | Referencia revisada | Commit fijado |
|---|---|---|
| actions/checkout | v6 | [`d23441a48e516b6c34aea4fa41551a30e30af803`](https://github.com/actions/checkout/commit/d23441a48e516b6c34aea4fa41551a30e30af803) |
| actions/setup-node | v6 | [`249970729cb0ef3589644e2896645e5dc5ba9c38`](https://github.com/actions/setup-node/commit/249970729cb0ef3589644e2896645e5dc5ba9c38) |
| actions/cache | v6.1.0 | [`55cc8345863c7cc4c66a329aec7e433d2d1c52a9`](https://github.com/actions/cache/commit/55cc8345863c7cc4c66a329aec7e433d2d1c52a9) |
| actions/upload-artifact | v7.0.2 | [`cf430e030ddbb5b0abf93d22962f4752f3646cd9`](https://github.com/actions/upload-artifact/commit/cf430e030ddbb5b0abf93d22962f4752f3646cd9) |
| actions/download-artifact | v8.0.2 | [`9000827ccba6bdab643e8b6fd33ac0654aef8333`](https://github.com/actions/download-artifact/commit/9000827ccba6bdab643e8b6fd33ac0654aef8333) |
| docker/setup-buildx-action | v4.4.1 | [`f87e5991a6d7451dcb8d9637bfbc97413f497069`](https://github.com/docker/setup-buildx-action/commit/f87e5991a6d7451dcb8d9637bfbc97413f497069) |
| docker/build-push-action | v7.4.0 | [`c3c9e263c25d99ce0380d002d59b67737d91b0dc`](https://github.com/docker/build-push-action/commit/c3c9e263c25d99ce0380d002d59b67737d91b0dc) |
| docker/login-action | v4.8.0 | [`8aa5831fb8d48d8f76594c7ddde61ae58019f550`](https://github.com/docker/login-action/commit/8aa5831fb8d48d8f76594c7ddde61ae58019f550) |

## Criterios de aceptación

El código debe pasar los checks de fuentes y Docker en el repositorio público. Una publicación debe conservar el manifiesto de las imágenes realmente probadas. El handoff debe rechazar forks, otros workflows, ramas, ejecuciones fallidas, SHA o intentos discordantes, etiquetas mutables, registros ajenos y origen API distinto.

El staging se considera desplegado solo cuando la configuración real está aplicada, las migraciones terminan y se comprueban API, web, TLS y flujos autenticados con datos ficticios. Para afirmar recuperabilidad se exige además una restauración demostrada. Este ADR no sustituye esas evidencias.

## Fuentes primarias

- [GitHub: uso seguro de Actions](https://docs.github.com/en/actions/reference/security/secure-use).
- [GitHub: publicación de imágenes](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).
- [GitHub: environments y protecciones](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
- [GitHub: API de workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run).
- [Coolify: GitHub Actions](https://coolify.io/docs/applications/sources/github/actions).
- [Coolify: Docker Compose y migraciones de una sola ejecución](https://coolify.io/docs/applications/builds/docker-compose).
- [Coolify: imágenes y digests](https://coolify.io/docs/applications/deployments/docker-image).
- [Coolify: API de despliegue](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid).
- [Coolify: permisos de API](https://coolify.io/docs/api/permissions).
- [Next.js: variables públicas fijadas durante el build](https://nextjs.org/docs/app/guides/environment-variables).
