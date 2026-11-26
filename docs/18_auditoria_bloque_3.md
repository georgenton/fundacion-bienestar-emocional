# Revisión independiente del bloque 3

Fecha: 26 de noviembre de 2026, Ecuador. Alcance: FBE-009 a FBE-012, exclusivamente sintético.

## Versión y evidencia revisadas

La revisión parte de `030b92f37e14f46e06c2b13f346744bfcb603ee2`, que incorpora la evidencia de la entrega desplegada `6cb25913069cc7c73270eba94e3602557f0c682e`. Se leyeron el código, las migraciones, los permisos, las pantallas, los procedimientos de adjuntos y respaldo, el manifiesto y las ejecuciones de GitHub.

- [PR #25](https://github.com/georgenton/fundacion-bienestar-emocional/pull/25): integrada; [publicación 45900301535](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45900301535), aprobada.
- [PR #26](https://github.com/georgenton/fundacion-bienestar-emocional/pull/26): integrada; [CI 45902121824](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45902121824), aprobado para la PR. Esa ejecución no es el evento de publicación de `main`.
- [CI de `main` 45902546952](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45902546952): aprobado para `030b92f…`.
- La comprobación pública observó web HTTP 200 con rótulo de pruebas, API HTTP 200 con PostgreSQL alcanzable y `syntheticDataOnly=true`, y casos anónimos HTTP 401.

Los digests activos, permisos del host, lectura de R2 y restauración privada se contrastaron con la evidencia aportada por el operador. Esta auditoría no repitió las operaciones dentro de OVH ni la descarga privada de R2. La salud pública por sí sola no identifica los digests desplegados.

## Hallazgos corregidos

| Prioridad | Ubicación y reproducción | Efecto y corrección |
|---|---|---|
| P2 | `apps/web/src/app/workspace/clinical/consents.tsx`: aceptar v1 y publicar v2 de la misma finalidad. | El backend conservaba v1 vigente, pero la pantalla ocultaba su retirada y ofrecía aceptar v2. Ahora presenta la aceptación vigente y permite retirarla por su propio ID, con independencia de la plantilla nueva. |
| P2 | `apps/api/src/clinical/clinical-records.service.ts`: dejar un aporte de pasante en borrador o devuelto y vencer o suspender su práctica. | El pasante perdía correctamente el permiso, el supervisor no podía validar un borrador no enviado y el tratante quedaba bloqueado al concluir la atención. Se separaron los estados de atención y documentación conforme al modelo: concluir conserva los pendientes sin validarlos, borrarlos ni alterar autorías. |

El segundo cambio permite crear documentación posterior mientras el caso permanezca abierto y el actor conserve autorización. La fecha de la atención no se altera y la nota tiene una nueva fecha de registro. El cierre es idempotente y no modifica asistencia.

La pantalla presenta «Documentación a su cargo», con cantidades, estado y responsable. Estos metadatos no amplían la lectura de narrativas: el tratante responsable ve los pendientes de su atención, el supervisor actual los de su práctica y el pasante sus propios aportes de la asignación vigente. Un supervisor anterior no recibe los metadatos del sucesor por ese antecedente. Los pendientes documentales siguen pendientes; este cambio no inventa un trámite de validación ni reemplaza la decisión institucional sobre cómo resolverlos.

Los cambios conservan las cinco migraciones existentes y no requieren una nueva migración de esquema.

## Verificación independiente local

| Comprobación | Resultado observado |
|---|---|
| Instalación | Node 24.22.3 y pnpm 10.34.9, `--frozen-lockfile`; lockfile conservado. |
| PostgreSQL real y descartable | PostgreSQL 18.7, cinco migraciones aplicadas desde una base vacía. |
| Integración | 27/27 pruebas en tres archivos, incluidos práctica suspendida/vencida, borradores y devoluciones conservados, metadatos sin narrativa, cierre sin notas, anotación posterior y caso cerrado o permiso revocado. |
| Archivos privados | Se incorporó el borde de tamaño: 16 384 bytes aceptados y 16 385 rechazados sin una fila adicional. |
| Tipos y registros | Lint/TypeScript y escaneo de salida aprobados; credenciales y entorno privados con modo 0600. |
| Componentes reales | 8/8 escenarios con React/ReactDOM 19.3.1, TypeScript 6.0.3 y jsdom 31.0.1, StrictMode y hooks reales. Transporte local sustituido; cero llamadas de red. |

El entorno de auditoría no permite el socket Unix que intenta crear el lanzador de `tsx`. El comando literal `pnpm demo:verify` se detuvo antes del seed por esa limitación. Se ejecutaron sus etapas reales de generación, seed, integración y escaneo usando `node --import tsx` para los archivos TypeScript, más lint. No se presenta esa equivalencia como una ejecución exitosa del wrapper literal. El PostgreSQL aislado se detuvo al finalizar.

El ensayo de componentes cubrió retirada de v1 con v2 publicada en paciente y personal, aceptación vigente de la misma versión, ausencia de aceptación y registro posterior en una atención concluida. No equivale a Next.js, Chromium ni staging. La descarga local del Chromium fijado fue rechazada con HTTP 403; no se probó un binario alternativo ni se atribuyó una ejecución local inexistente.

## Regresión en CI

El recorrido `scripts/verify-block3-browser.mjs` incorpora la retirada de la aceptación anterior desde el portal, conclusión con un borrador de pasante pendiente y creación posterior de una nota. El CI ejecuta los recorridos de bloques 2 y 3 contra API compilada y Next standalone, con PostgreSQL y fixtures descartables. El conductor exige destinos locales y modo sintético; no recibe secretos de despliegue. Los registros privados se examinan y no se publican como artefactos.

El resultado de la ejecución alojada de esta corrección se identifica en su PR y en el informe de cierre. Configurar el job, publicar imágenes y promoverlas son estados distintos. Esta revisión no afirma que el parche esté desplegado únicamente porque su CI termine correctamente.

## Recuperación y límites conservados

La restauración descrita en [docs/17](17_evidencia_bloque_3.md) corresponde al objeto poblado `fbe/staging/fbe-staging-20261126T215347Z-block3-drill-18bbf30d.gpg`, con clave desechable del ensayo. La copia operativa posterior `fbe/staging/fbe-staging-20261126T215950Z-PGqvgb5H.gpg` quedó verificada por lectura e integridad; no se documentó su restauración. Se conserva esa distinción.

La revisión de adjuntos y recuperación no identificó otra corrección necesaria en el alcance examinado: el servidor limita tipo/tamaño, verifica hashes, autoriza cada descarga y selecciona versiones concretas; el respaldo usa una instantánea SQL con los objetos inmutables referenciados. Esto no amplía el soporte a PDF o imágenes. Continúan vigentes los límites de 16 KiB por texto, 96 KiB agregados y 256 KiB para el paquete cifrado de demostración.

David y la institución conservan la aprobación de textos, plantillas, atribuciones, prácticas, conservación y entrega de información. El siguiente encargo FBE-013 a FBE-016 se encuentra en [prompts/08](../prompts/08_pagos_portal_y_video.md).
