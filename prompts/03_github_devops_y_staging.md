# Encargo autorizado: continuidad de GitHub y staging

Trabaja en el proyecto de la Fundación para el Bienestar Emocional. Jorge ya autorizó las conexiones al navegador y GitHub, la creación del repositorio público y la preparación de Actions y despliegue en su OVH con Coolify. Continúa las acciones necesarias sin repetir esa autorización. Respeta los controles técnicos reales del entorno.

## Punto de partida

Repositorio canónico público: `https://github.com/georgenton/fundacion-bienestar-emocional`.

Primero lee `AGENTS.md`, README, `docs/10_devops_y_despliegue.md`, `docs/11_autorizaciones_codex_y_publicacion.md`, los ADR y la evidencia de auditoría disponible. Inspecciona el código y los workflows actuales; no asumas que el resumen de una conversación refleja su último estado.

Confirma cuenta, remoto, rama, HEAD y cambios pendientes. Conserva el repositorio local original y su historia privada. Si trabajabas en aquella copia, crea un clon separado del repositorio público para continuar. No publiques sus antiguos commits: contenían referencias internas ya retiradas de la copia pública. Traslada trabajo adicional mediante cambios revisados y acotados, sin fusionar historias completas ni forzar el remoto.

## Trabajo concreto

1. Reproduce instalación, migraciones en PostgreSQL sintético, pruebas, compilación e imágenes. Revisa la regresión de sesiones anteriores al enrolamiento MFA y el cambio de usuario en la interfaz. Si la auditoría indica una verificación no ejecutada, complétala y registra evidencia.
2. Comprueba la ejecución alojada del CI para el SHA exacto. Corrige únicamente los fallos observados. Mantén las acciones fijadas por SHA, permisos mínimos y secretos fuera de PR de colaboradores externos.
3. Verifica protecciones de main y del entorno staging. Los cambios posteriores a la importación inicial pasan por PR y las comprobaciones exigidas. No elimines controles para conseguir un estado verde.
4. Comprueba el proyecto de la fundación en Coolify y su entorno staging antes de crear duplicados. Revisa capacidad disponible del servidor y el estado de los recursos de esta aplicación. No apliques cambios pendientes del proxy global ni limpiezas de otros proyectos.
5. Resuelve los orígenes web/API y el acceso TLS de staging. Guarda configuración privada y secretos en sus almacenes de destino; usa variables de build solo para valores públicos. Confirma que la imagen web apunta a la API correcta.
6. Publica y promueve imágenes de una ejecución aprobada, identificadas por digest. Usa el manifiesto de release y el procedimiento documentado; una llamada aceptada por Coolify no demuestra que el despliegue terminó sano.
7. Ejecuta migraciones con el mismo artefacto aprobado y una identidad de base apropiada. Mantén los seeds sintéticos fuera del arranque automático y de producción. Verifica salud y una prueba funcional acotada después del despliegue.
8. Documenta versión desplegada, resultados, rollback disponible y pendientes. Si solo se generó un handoff o falta un secreto/origen, informa exactamente ese estado.

## Entrega

Devuelve commit y PR, URL de la ejecución de Actions, resultado de cada etapa, imágenes y digests, recurso de Coolify y comprobación de salud cuando existan. Separa preparado, ejecutado, observado y pendiente. La plataforma continúa siendo una base sintética; las funciones y habilitaciones del piloto real se completan en sus bloques correspondientes.
