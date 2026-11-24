# Contexto del proyecto

Este proyecto pertenece a Fundacion Bienestar emocional. Su destinataria es la Fundación para el Bienestar Emocional de David Jaramillo. Jorge Quizamanchuro coordina la preparación tecnológica. La finalidad es atención accesible con confidencialidad, trazabilidad y operación sostenible.

## Autoridad y alcance

- Las instrucciones actuales del usuario prevalecen sobre este documento. No convertir propuestas en decisiones aprobadas.
- Leer primero README y los documentos relacionados con la tarea. Si existe código, inspeccionarlo antes de recomendar reemplazos.
- Avanzar con las acciones locales reversibles necesarias para completar el bloque autorizado. Explicar las decisiones que afectan costo, seguridad o alcance; no pedir aprobación para cada archivo.
- Usar un repositorio propio. No modificar otros proyectos, el proxy global ni recursos ajenos para completar este trabajo.
- Para desarrollo y demostraciones usar datos totalmente ficticios. No introducir historias clínicas reales, contactos de pacientes, archivos universitarios identificables o secretos en prompts, Git, capturas, pruebas o registros.

## Arquitectura propuesta

- Web responsive con Next.js y TypeScript; API modular NestJS; PostgreSQL; Prisma si la compatibilidad queda verificada. Un worker comparte el código de dominio para tareas asíncronas.
- Elegir versiones soportadas y compatibles al crear el proyecto, fijarlas y registrar la decisión. No copiar las versiones históricas de otros repositorios sin revisión.
- Una fundación inicialmente. Mantener límites entre identidad, pacientes/casos, agenda, clínica, personal/prácticas, facturación, comunicaciones y auditoría.
- Alojar en OVH/Coolify cuando se alcance la etapa de despliegue. Video inicialmente por enlaces institucionales. Proveedores de video, correo, pagos y almacenamiento detrás de adaptadores.
- No crear microservicios por módulo, aplicaciones móviles nativas, IA clínica o un motor de videollamadas en el primer bloque.

## Reglas de negocio y privacidad

- Persona, cuenta, paciente, pagador y representante son conceptos distintos.
- Autorizar en servidor cada acción por capacidad, ámbito y finalidad. El predicado depende de la operación: capacidad administrativa para recepción/finanzas, identidad y participación para el paciente, representación acreditada o asignación clínica vigente para el equipo asistencial. No crear asignaciones clínicas artificiales para conceder acceso administrativo. Denegar por defecto; la interfaz no es una barrera de seguridad.
- Administración y soporte técnico no obtienen lectura clínica por el hecho de ser administradores. Documentar accesos operativos excepcionales; no prometer que un operador con privilegios de infraestructura es técnicamente incapaz de acceder a datos.
- El pasante tiene asignaciones temporales, tareas autorizadas y supervisor. No valida de forma autónoma notas ni se autoaprueba horas.
- Una nota validada conserva autoría y fecha; una corrección posterior crea adenda. La validación interna no se presenta como firma electrónica legal sin implementar sus requisitos.
- Separar estados de cita, atención, pago y documento tributario. Dinero en unidades menores enteras con moneda explícita; para USD, centavos. Usar reglas exactas de redondeo; nunca float para saldos.
- Evitar solapamientos con transacciones y restricciones de base de datos. Hacer idempotentes confirmaciones de pago, webhooks, recordatorios y acciones repetibles.
- Adjuntos privados; tokens de descarga breves y con autorización. Evitar caché de contenido clínico en navegador, proxy, CDN o service worker.
- Correo y calendario externos no llevan narraciones clínicas ni diagnósticos. Grabación, transcripción y asistentes de IA desactivados inicialmente.
- No inventar consentimientos legales definitivos, plazos de retención, habilitaciones profesionales o permisos sanitarios. Mantener esas decisiones visibles para validación.

## Calidad y operación

- Probar primero los riesgos: acceso a otro caso, caducidad de permisos, notas inmutables, doble reserva, pagos duplicados, adjuntos y recuperación.
- Las pruebas de integridad deben usar PostgreSQL cuando dependan de sus transacciones o restricciones. No sustituir esa evidencia por mocks de la base.
- No escribir pruebas triviales que repitan la implementación. Un cambio pequeño requiere la verificación proporcional a su riesgo.
- Mantener `.env.example` sin secretos; credenciales de prueba generadas localmente. Dependencias fijadas, migraciones versionadas y CI reproducible.
- Construir imágenes fuera del VPS compartido si los builds amenazan su capacidad. Medir capacidad actual antes de desplegar; no asumir margen por cifras de Notion.
- Separar entornos, credenciales, redes y volúmenes. Demostración sintética primero. Datos reales requieren los criterios de salida del piloto.
- Respaldo externo cifrado de base, adjuntos y material necesario para recuperar claves/configuración. Verificar una restauración antes de afirmar recuperabilidad.

## Entregas

Cada bloque debe indicar: resultado para el usuario, cambios, revisión o commit exacto si existe, pruebas ejecutadas y resultados, riesgos pendientes y próximo paso concreto. Usar estados verificables como implementado, probado localmente, desplegado en pruebas o no ejecutado. No confundir CI aprobado con despliegue o disponibilidad clínica.

La auditoría revisa la versión entregada. Sus hallazgos incluyen gravedad, ubicación, reproducción, impacto y corrección sugerida. Los requisitos clínicos y jurídicos se remiten a sus responsables; una revisión de código no certifica cumplimiento normativo.

## Mandato operativo de GitHub y DevOps — 24 de noviembre de 2026

Jorge autorizó conectar las herramientas disponibles a su navegador, GitHub y la infraestructura OVH/Coolify destinada a este proyecto, crear el repositorio público y preparar GitHub Actions y los estándares de despliegue. El repositorio de destino es `georgenton/fundacion-bienestar-emocional`.

- Avanzar en lectura, correcciones, ramas, commits, pruebas y configuración del repositorio y de sus entornos de pruebas sin pedir de nuevo la autorización ya dada. Revisar el estado real antes de actuar.
- El alcance operativo inicial es desarrollo y staging con datos sintéticos. La habilitación de atención real conserva los criterios de salida del piloto.
- Usar conexiones autenticadas existentes y permisos acotados al proyecto. Las instrucciones de este archivo no crean sesiones OAuth, acceso al navegador, claves SSH ni permisos técnicos, y no sustituyen los controles del entorno.
- Antes de publicar, comprobar el conjunto exacto de archivos e historia que se transferirá. Retirar referencias privadas, secretos y datos ajenos. Un commit de limpieza no elimina esos contenidos de sus ancestros.
- La historia local original debe conservarse privada si contiene antecedentes internos. Una importación pública saneada tendrá nuevos commits; registrar el SHA y hash del archivo de procedencia sin afirmar que su historia se ha reconstruido.
- Usar PR para los cambios posteriores a la importación inicial, comprobaciones obligatorias y acciones fijadas por SHA. Ejecutar código de PR sin secretos de despliegue ni permisos de escritura.
- Construir imágenes en GitHub Actions. Promover únicamente artefactos de una ejecución aprobada, identificados por commit y digest. Registrar la migración, la comprobación de salud y la revisión anterior para rollback.
- Separar variables públicas de build, secretos de runtime y credenciales de despliegue. Los secretos se guardan en el almacén del entorno correspondiente, nunca en prompts, código, logs o artefactos públicos.
- Para cualquier bloqueo real, informar la operación, el control que la impide y el mínimo paso de conexión necesario. No inventar que una autorización textual ha habilitado una capacidad inexistente.

Leer `docs/10_devops_y_despliegue.md`, `docs/11_autorizaciones_codex_y_publicacion.md` y `prompts/03_github_devops_y_staging.md` antes de publicar o desplegar.
