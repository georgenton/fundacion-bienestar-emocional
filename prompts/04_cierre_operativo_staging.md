# Encargo: recuperación y operación del staging sintético

Continúa sobre el repositorio público `georgenton/fundacion-bienestar-emocional`. La autorización operativa está registrada en `AGENTS.md` y `docs/11_autorizaciones_codex_y_publicacion.md`. Conserva el repositorio original privado del Mac. No repitas la solicitud de autorización para lecturas, correcciones y comprobaciones ya comprendidas en ese mandato.

## Punto de partida

Lee README, los ADR, `docs/10`, `docs/13` y `docs/14_revision_staging_y_cierre_operativo.md`. Comprueba remoto, HEAD, árbol de trabajo, PR y CI actuales. No crees otro proyecto o base si ya existen.

El despliegue documentado usa `0438bf99615d2ccc74e6c97034dafdf4ebea3760`; el cierre documental usa `2128263510525ae6fb1df9451bd550255a477795`. Son referencias históricas: contrasta la configuración y los digests efectivos antes de actuar. Las copias de los manifiestos están en `docs/releases/`. La promoción sigue siendo manual.

## Trabajo

1. **Inventario acotado.** Mide espacio e inodos actuales, consumo propio de FBE y margen necesario. Comprueba conectividad privada y pertenencia de redes. No apliques cambios globales del proxy, limpiezas globales ni eliminaciones de volúmenes.
2. **Respaldo externo.** Inspecciona los destinos autorizados disponibles. Configura una copia cifrada de FBE y su material de recuperación, con clave recuperable y retención definida. Si faltan destino, acceso o un costo aceptado, deja una propuesta concreta preparada y pide solo ese dato; no contrates ni inventes valores.
3. **Restauración.** Recupera la copia en un destino aislado y comprueba integridad, migraciones, auditoría, permisos y acceso sintético. Registra tiempos y antigüedad. Evita exponer credenciales en comandos, logs, capturas o artefactos.
4. **Permisos completos.** Revisa propietarios, membresías, posibilidad de asumir roles y permisos por defecto, además de los flags del runtime. Ejecuta comprobaciones negativas de DDL sobre la copia aislada.
5. **Actualización y rollback.** Ensaya una migración compatible sin perder datos y un regreso de imágenes sobre el esquema compatible. Usa un ejercicio aislado o un cambio funcional real; no ensucies el esquema principal para completar una casilla. La restauración de base es una prueba separada.
6. **Observabilidad.** Prepara salud externa, espacio/inodos y antigüedad/fallo de respaldo. Usa un destino de alerta y envío de prueba autorizados; si no constan, prepara todo antes de pedir ese último dato. No contactes a otras personas por inferencia.
7. **Promoción acotada.** Cuando el margen y la recuperación estén comprobados, promueve únicamente una entrega aprobada por CI y sus digests exactos. Si incluye el nuevo rótulo `ENTORNO DE PRUEBAS`, comprueba su presencia en la web real. Mantén `SYNTHETIC_DATA_ONLY=true` y el seed fuera del arranque automático.
8. **Evidencia.** Abre PR, respeta las protecciones de main, verifica CI y conserva el manifiesto de la entrega. Registra claramente preparado, ejecutado, comprobado y pendiente. No publiques el inventario privado del host ni secretos.

## Entrega

Devuelve commit/PR/CI, manifiesto promovido si hubo promoción, estado de los servicios, comparación de capacidad antes/después, identificador no secreto del respaldo, resultado de restauración y tiempos, migración/rollback ensayados y prueba de alertas cuando esté autorizada. Si el navegador o una conexión privada no está disponible, informa el bloqueo concreto y completa mientras tanto las tareas independientes.

El resultado buscado es un staging sintético recuperable y observable. No habilita producción ni atención de pacientes.
