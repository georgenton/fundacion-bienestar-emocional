# Revisión de staging y siguiente cierre operativo

Fecha: 24 de noviembre de 2026. Alcance: revisión independiente de la entrega documentada en `2128263510525ae6fb1df9451bd550255a477795` y preparación del siguiente trabajo. Continúan utilizándose exclusivamente datos sintéticos.

## 1. Resultado de la revisión

La primera puesta en marcha tiene una cadena coherente de código, publicación y evidencia. La disponibilidad pública se comprobó nuevamente por HTTPS con validación de certificado habilitada:

| Comprobación independiente | Resultado |
|---|---|
| Web de staging | HTTP 200; marcador `NO APTO PARA PACIENTES` presente |
| API `/health` | HTTP 200; `status=ok`, `database=reachable`, `syntheticDataOnly=true` |
| API `/api/cases` sin sesión | HTTP 401 |
| [PR #6](https://github.com/georgenton/fundacion-bienestar-emocional/pull/6) | Fusionado; padre de base `0438bf99615d2ccc74e6c97034dafdf4ebea3760` y merge `2128263510525ae6fb1df9451bd550255a477795` |
| Comparación de esos commits | Solo cambian README y tres documentos; no cambia el código de aplicación |
| [CI 45460708004](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45460708004) | Código, Docker y publicación aprobados; 15 pruebas sin DB, 16 PostgreSQL y 20 de promoción |
| Reglas efectivas de `main` | PR obligatorio, checks `verify-block-1` y `docker-verify`, rama actualizada, conversaciones resueltas, bloqueo de borrado y force-push |

Las reglas se consultaron en la [API pública de reglas de la rama](https://api.github.com/repos/georgenton/fundacion-bienestar-emocional/rules/branches/main). El bloqueo anterior de reautenticación ya no se presenta como un pendiente de esta entrega.

La [evidencia del despliegue](13_evidencia_staging_2026-11-24.md) identifica `0438bf9…` como versión promovida. Se contrastaron sus tres digests con el manifiesto de [CI 45452399716](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45452399716) y con el [handoff 45453345318](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45453345318): coinciden. La publicación posterior de `21282635…` no implica que se haya desplegado.

Se conservan copias exactas de los dos manifiestos de release en [releases/](releases/README.md), verificadas contra sus ZIP originales. Esta conservación evita depender de la caducidad del artefacto de Actions para consultar las referencias de imagen; no preserva por sí sola las imágenes del registro ni prueba qué contenedores están ejecutándose.

La comprobación independiente de esta revisión se limita a GitHub y HTTPS público. No se volvió a inspeccionar el panel privado de Coolify: los digests efectivos de runtime, los roles, la rotación de credenciales, los recorridos autenticados y el espacio de disco mantienen como fuente el registro del despliegue. El 87 % informado es una medición histórica, no una lectura nueva.

## 2. Corrección visual preparada

La web reemplaza `ENTORNO LOCAL` por `ENTORNO DE PRUEBAS`, conservando `DATOS SINTÉTICOS · NO APTO PARA PACIENTES`. El texto sirve tanto en desarrollo local como en staging sin agregar configuración de entorno ni modificar autenticación.

La publicación o integración de esta corrección no cambia el despliegue manual de Coolify. El rótulo de la web activa seguirá siendo el anterior hasta promover una imagen nueva, después de revisar capacidad. La comprobación proporcional es revisar el diff y cumplir los checks exigidos por la rama; no se añade un test que repita una cadena de texto.

## 3. Orden del siguiente cierre

| Orden | Trabajo | Evidencia exigida para cerrarlo |
|---|---|---|
| 1 | Capacidad y alcance de red | Medición nueva de espacio/inodos, consumo atribuible a FBE y margen para descargar imágenes y ensayar recuperación; conectividad de la aplicación con su DB revisada. |
| 2 | Copia externa cifrada | Copia fuera del OVH, integridad comprobada, clave recuperable, retención definida y configuración/roles necesarios para recuperarla. |
| 3 | Restauración aislada | Recuperación desde esa copia en un destino independiente, integridad y permisos comprobados, API funcional y tiempos registrados. |
| 4 | Actualización y rollback | Migración sucesiva compatible, conservación de datos y prueba de regreso a imágenes anteriores compatibles. |
| 5 | Alertas | Disponibilidad externa, disco/inodos y fallo/antigüedad de respaldo; destino configurado y recepción verificada con el titular. |

### Capacidad y red

Empezar con consultas de lectura. Identificar uso de volúmenes, imágenes y logs propios sin publicar inventarios de otros proyectos. Calcular margen con los tamaños observados de descarga, datos y restauración; un porcentaje aislado no es un criterio suficiente.

No ejecutar limpiezas globales ni eliminar volúmenes. Si el margen no basta, preparar una actuación acotada sobre recursos inequívocamente propios o la ampliación necesaria con su costo conocido. La red predefinida de Coolify resolvió la conectividad; pertenecer a un proyecto exclusivo no demuestra aislamiento de tráfico. Revisar privadamente miembros, rutas y autenticación sin cambiar la red global.

### Respaldo y restauración

Usar un destino externo ya autorizado y disponible. Si no existe, preparar la configuración y solicitar únicamente la elección/acceso que falte; no contratar un servicio ni inventar credenciales. Cifrar la copia y conservar la clave por una vía recuperable que no dependa del mismo host. Una conexión TLS al almacenamiento no sustituye el cifrado de la copia.

Respaldar la base FBE y el material necesario para recuperarla: roles/permisos, configuración privada, claves de autenticación y manifiesto de imágenes. PostgreSQL distingue el dump de una base de los objetos globales como roles; el procedimiento debe incluir ambos alcances de forma limitada al proyecto. Evitar exportar recursos ajenos del servidor compartido. [PostgreSQL: SQL dump](https://www.postgresql.org/docs/18/backup-dump.html).

Definir retención externa y local por separado y comprobar el comportamiento cuando falle la subida. Los backups de Coolify pueden producir primero un archivo local, por lo que necesitan margen incluso con destino externo. [Coolify: backups](https://coolify.io/docs/databases/backups).

Restaurar en una base aislada, sin sobrescribir staging. Comprobar migraciones, integridad referencial, auditoría, permisos y acceso sintético con credenciales custodiadas. Medir antigüedad de la copia y duración completa de recuperación. Como objetivos iniciales propuestos para este ensayo sintético: copia de menos de 24 horas y recuperación en menos de 4 horas; no son resultados logrados ni un compromiso clínico.

### Privilegios y actualización sucesiva

Completar la revisión del runtime con propiedad de objetos, membresías y posibilidad de asumir otros roles. `NOINHERIT` y ausencia de `CREATE` en `public` no prueban por sí solos que sea incapaz de modificar objetos que posea. Comprobar también permisos por defecto para objetos nuevos y pruebas negativas sobre la copia aislada. [PostgreSQL: privilegios y propiedad](https://www.postgresql.org/docs/18/ddl-priv.html).

Ensayar una migración compatible en la copia restaurada: conservar datos, aplicarla una sola vez y verificar que el rol runtime accede solo a las operaciones necesarias. No agregar cambios ficticios al esquema principal solo para declarar la prueba aprobada; usar un ejercicio aislado o una necesidad real del siguiente bloque.

Probar rollback de aplicación a los tres digests anteriores sobre el esquema compatible. La recuperación de datos se ensaya por separado. No revertir automáticamente PostgreSQL ni usar `migrate resolve` para ocultar un fallo.

### Alertas

Preparar controles externos de salud, espacio/inodos y respaldo. Los mensajes no deben incluir secretos ni contenido de casos. Usar un destinatario técnico ya autorizado o dejar el envío preparado hasta que el titular confirme destino y prueba. No enviar avisos a otras personas por inferencia. Registrar una falla controlada y su recuperación; no interrumpir otros proyectos para provocar la alerta.

## 4. Criterio de continuidad

Se puede continuar el desarrollo con datos sintéticos mientras se cierra este trabajo. Antes de promover nuevas migraciones en el servidor, deben existir margen de capacidad, copia externa y una recuperación comprobada. Las historias clínicas, pagos y demás funciones de producto mantienen sus propios criterios de aceptación; este documento no habilita atención real.

Encargo de ejecución: [prompts/04_cierre_operativo_staging.md](../prompts/04_cierre_operativo_staging.md).
