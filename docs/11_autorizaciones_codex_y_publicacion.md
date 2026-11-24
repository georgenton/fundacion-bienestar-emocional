# Autorizaciones de trabajo y publicación

Fecha: 24 de noviembre de 2026. Fuente del mandato: instrucción expresa de Jorge en la conversación del proyecto para conectar navegador y GitHub, crear un repositorio público y preparar Actions, OVH y Coolify.

## Alcance autorizado

El destino GitHub es [georgenton/fundacion-bienestar-emocional](https://github.com/georgenton/fundacion-bienestar-emocional). Las acciones necesarias de preparación y mantenimiento del código, revisión, commits, ramas, PR, configuración de Actions y despliegue de pruebas están autorizadas para este proyecto. El entorno operativo inicial contiene exclusivamente datos sintéticos. La apertura de atención real requiere completar los criterios del piloto y las responsabilidades institucionales previstas en el alcance.

Esta autorización se mantiene durante el trabajo. No es necesario repetir una pregunta de permiso para cada archivo o corrección reversible. Si cambia materialmente el destino, la información que se hará pública, el costo o los recursos afectados, identificar ese cambio antes de actuar.

## Autorización, conexión y capacidad son elementos distintos

1. **Autorización de la tarea:** queda registrada en el mandato del usuario y en `AGENTS.md`.
2. **Conexión autenticada:** GitHub, navegador y Coolify deben estar disponibles en el entorno desde el que se ejecuta la tarea. Una conexión de otra conversación o dispositivo no prueba acceso local.
3. **Permisos técnicos:** los determinan el token, la cuenta, la aplicación y las políticas del entorno. `AGENTS.md` no crea credenciales ni modifica permisos de sistema.

Comprobar la cuenta y el repositorio antes de escribir. Para navegador, usar el conector disponible y su sesión autorizada. Para GitHub, preferir el conector o CLI autenticado; usar navegador si falta una operación. Si aparece una pantalla de acceso, un segundo factor o una autorización del proveedor que requiere al titular, dejar la acción concreta preparada y explicar el paso pendiente. Los secretos no se solicitan por el chat.

Referencia oficial: [aprobaciones y seguridad de Codex](https://learn.chatgpt.com/docs/agent-approvals-security), [permisos](https://learn.chatgpt.com/docs/permission-modes) y [extensión de navegador](https://learn.chatgpt.com/docs/chrome-extension).

## Procedencia e historia pública

El archivo recibido para auditoría fue `fbe_codex-bloque1-auditoria-5c325950.zip`.

- SHA-256 del ZIP: `e35a5f4c08858cce2b1ff07ea71c220a774de16cc14c2d1d19ec8de581863a63`.
- Comentario del archivo generado por Git: `5c325950cff66dd9d215761f08ee0be5e4555bae`.
- El ZIP no contiene `.git`, objetos de commits ni el grafo de ancestros. El comentario acredita la referencia declarada del archivo; no permite reconstruir por sí solo aquella historia.
- La versión recibida contenía enlaces privados de Notion y contexto de infraestructura de otros proyectos. La copia destinada al repositorio público fue saneada.

Para conservar el historial original sin publicar sus antecedentes internos, mantener el repositorio de origen privado y trabajar posteriormente desde un clon del repositorio público saneado. La historia pública tendrá sus propios commits. No hacer `push --mirror`, `push --all`, fusionar historias sin relación ni forzar el remoto con el historial privado. El trabajo local no publicado se revisa y traslada mediante cambios concretos, conservando una copia previa.

La referencia original permanece como evidencia de procedencia; no se presenta como ancestro del nuevo repositorio público si los objetos originales no fueron transferidos.

## Controles de operación

| Área | Regla |
|---|---|
| Publicación | Revisar archivos y referencias exactos. Código, pruebas sintéticas y documentación pública pueden publicarse. Inventarios privados y credenciales permanecen fuera. |
| CI de pull requests | Token de lectura, sin secretos de staging, aprobación para colaboradores externos y acciones fijadas por SHA. |
| Imágenes | Build verificable en runners de GitHub; referencias por commit y digest; secretos fuera de capas y argumentos de build. |
| Staging | Proyecto y recursos propios, revisión de capacidad, TLS/orígenes reales, base y volúmenes aislados, migración antes de iniciar la API y comprobación posterior. |
| Producción | La existencia de un entorno llamado production no equivale a un servicio activo ni a habilitación de atención. |
| Recuperación | Registrar versión anterior, compatibilidad de migraciones y restauración. Una reversión de imagen no deshace automáticamente un cambio de esquema. |
| Evidencia | Distinguir preparado, ejecutado, verificado y pendiente. Publicar únicamente resultados observados. |

## Propiedad y licencia

La visibilidad pública no sustituye el acuerdo de propiedad o licencia entre los responsables. El paquete mantiene `UNLICENSED` mientras no exista una decisión específica. No asignar una licencia permisiva automáticamente como parte del alta del repositorio.
