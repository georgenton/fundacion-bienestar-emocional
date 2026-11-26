# Bloque 3 — Expediente, consentimiento, prácticas y adjuntos

## Encargo

Completa FBE-009 a FBE-012 sobre la aplicación existente. Entrega un recorrido clínico y de supervisión enteramente sintético, con interfaz utilizable, autorización por caso y recuperación de sus datos y archivos.

El resultado debe permitir: partir de una persona y cita del bloque 2, registrar evidencia de consentimiento de prueba, abrir una atención, escribir y validar una nota, añadir una adenda, revisar un aporte de pasante y compartir explícitamente un documento con el paciente autorizado.

El bloque 2 fue publicado desde bd5158f3da35fd75043dff15b117d8c1774169a2. Su evidencia está en docs/16_evidencia_bloque_2.md. La revisión de cierre identificó una corrección pequeña del efecto de /activate; trabaja desde origin/main actualizado para incorporarla.

### Autorización y entorno

Continúan las autorizaciones para conexiones disponibles, navegador, GitHub, ramas, commits, PR, CI y despliegue sintético en OVH/Coolify. Respeta las protecciones de rama. El costo adicional autorizado es US$0. Conserva el repositorio original privado del Mac y los recursos de otros proyectos.

Comprueba el estado real antes de actuar. Lee AGENTS.md, README, docs/03_modelo_y_permisos.md, docs/04_backlog_y_aceptacion.md, docs/16_evidencia_bloque_2.md y el código relacionado. Antes de publicar o desplegar, revisa docs/10, docs/11 y docs/15.

Las decisiones clínicas e institucionales conservan su condición de propuestas. Usa plantillas, personas, textos y archivos completamente ficticios. La implementación permite ensayar controles; no acredita consentimientos, atribuciones ni habilitación para atender pacientes reales.

Avanza hasta terminar el trabajo autorizado. Si falta acceso técnico, completa lo demás e informa la operación bloqueada y la intervención mínima necesaria. No vuelvas a pedir autorización general.

## 1. Forma de trabajo

Conserva el monolito modular, Better Auth, MFA, política central de acceso, PostgreSQL, Prisma y versiones fijadas. Aprovecha personas, casos, asignaciones y agenda existentes.

Organiza el trabajo en tres etapas revisables, que pueden corresponder a tres PR:
1. Consentimientos, atención, notas y adendas.
2. Prácticas, horas y supervisión.
3. Adjuntos, entrega de información y recuperación conjunta.

No abras una PR por tabla. Cada etapa debe incluir las pruebas pertinentes y una interfaz utilizable. Continúa hasta completar el recorrido del bloque.

## 2. Dependencias y permisos clínicos

Las asignaciones creadas por recepción en el bloque 2 conceden resumen y agenda. No les añadas acceso clínico de forma masiva.

Define acciones explícitas para leer, escribir, enviar a revisión, validar, añadir adendas, compartir y descargar. Centraliza su evaluación en la política existente y comprueba rol, caso, acción, vigencia y estado de la cuenta en cada operación.

El otorgamiento clínico debe ser una acción autorizada de coordinación clínica por caso, separada de las capacidades administrativas de recepción. Para la demostración, establece un perfil clínico y fixtures explícitos con el alcance necesario; no conviertas administración operativa o soporte en lectores universales.

Extiende búsquedas, listas y tareas asíncronas con los mismos límites. La revocación y el vencimiento deben surtir efecto con sesiones abiertas.

Los casos históricos pueden tener servicio y modalidad vacíos. Exige completarlos explícitamente cuando sean necesarios para abrir una atención o conserva el caso solo operativo. No inventes su modalidad ni su plantilla.

## 3. FBE-009 — Consentimientos y evidencia

Implementa textos versionados de prueba y registros que conserven:
- Finalidad y versión exacta del texto.
- Persona, caso cuando corresponda y alcance.
- Quién acepta y quién registra la evidencia.
- Fecha, medio de registro, estado e historial de cambios.

Distingue una aceptación realizada por el paciente autenticado de una evidencia registrada por personal autorizado. Pulsar un botón administrativo no puede aparecer como una acción ejecutada por el paciente.

Actualizar un texto crea una nueva versión; no modifica aceptaciones anteriores. Conserva una copia o referencia inmutable que permita reconstruir qué se aceptó.

Una retirada conserva el historial y crea un estado visible de revisión del proceso afectado. No borra el expediente ni se convierte en una decisión clínica automática.

Mantén separadas las finalidades de atención, participación de pasantes, grabación y mercadeo. Grabación y mercadeo no forman parte de esta entrega.

Identifica todos los textos como ficticios y pendientes de validación institucional. No redactes un consentimiento jurídico definitivo ni inventes plazos de conservación.

## 4. FBE-010 — Atención, nota y adenda

Incorpora una atención vinculada al caso, al profesional responsable y a una cita cuando corresponda. Para la demostración basta comenzar desde una cita confirmada.

Conserva la separación entre asistencia administrativa, atención clínica y nota. Marcar asistencia no debe crear una atención concluida. La atención y la nota tienen estados propios.

Implementa una plantilla clínica mínima de prueba, sin imponer un diagnóstico obligatorio. Conserva autor, función ejercida, momento de atención, momento de registro y versión de plantilla.

Incluye:
- Borrador editable por el actor autorizado.
- Envío a revisión cuando corresponda.
- Devolución con observaciones trazables.
- Validación por un profesional autorizado.
- Adenda posterior enlazada al original.

Usa control de versión para evitar que una edición antigua sobrescriba otra. Conserva la autoría al revisar un aporte; el supervisor no debe aparecer como autor original del texto del pasante.

Una nota validada no admite sobrescritura ni borrado ordinario. Protege el contenido y la autoría tanto en la API como en la persistencia con una medida adecuada al riesgo. Los cambios posteriores se realizan mediante adendas con autor, fecha y motivo. La baja de una cuenta no elimina sus aportes.

La validación es interna de la plataforma. No la presentes como firma electrónica con efectos jurídicos.

Recepción y soporte no reciben narrativa clínica en pantallas administrativas, errores, búsquedas, exportaciones, logs ni respuestas de API.

## 5. FBE-011 — Prácticas, horas y supervisión

Implementa una ficha de práctica con pasante, institución, período, supervisor, estado y referencias a documentos institucionales. Separa este registro administrativo del expediente.

Permite registrar actividades y horas propias, enviarlas a revisión y aprobarlas por un supervisor autorizado. Usa unidades exactas de duración y conserva las correcciones; el pasante no puede aprobar sus propias horas.

La participación clínica permanece deshabilitada por defecto. Para probar el circuito completo, utiliza fixtures identificados expresamente como simulación institucional en un entorno sintético. No conviertas esa simulación en una aprobación de David o de una universidad.

Cada acción clínica del pasante debe comprobar conjuntamente:
- Práctica vigente y habilitada para la simulación.
- Asignación vigente al caso y acción permitida.
- Supervisor responsable.
- Estado de revisión del aporte.

El pasante puede preparar borradores y enviarlos a revisión, pero no validarlos. Una cuenta con varios perfiles no puede eludir la revisión cambiando un valor enviado por la interfaz.

Al suspender o vencer la práctica, retira el acceso derivado de ella aunque la sesión continúe abierta. Conserva autorías y funciones independientes que esa persona pueda tener.

Reasignar supervisor conserva aportes pendientes y deja un responsable visible. Define una conducta explícita si el supervisor deja de estar disponible.

La exportación académica usa una lista limitada de campos de actividades y horas. Excluye identidades e identificadores de pacientes, diagnósticos, narraciones y referencias de casos que permitan reidentificarlos. No exportes texto libre procedente del expediente.

## 6. FBE-012 — Adjuntos privados y entrega de información

Empieza con almacenamiento privado propio de FBE en un volumen persistente de OVH, fuera de directorios públicos, si la inspección de la infraestructura confirma que encaja en el entorno existente y el presupuesto.

Sirve las descargas mediante la API con autorización vigente por objeto y caso. No hace falta introducir un proveedor nuevo, un servicio separado ni un sistema de enlaces públicos.

Cada adjunto debe tener propietario lógico, clase, versión, estado, tamaño, tipo validado y una clave interna aleatoria. Distingue documentos del caso, evidencia de consentimiento y documentos administrativos de prácticas; no heredan necesariamente los mismos permisos.

El nombre aportado por el usuario no determina una ruta. Define tamaños y formatos reducidos adecuados a la demostración, valida contenido además de extensión/MIME y rechaza formatos activos o archivos no admitidos. Evita servir contenido activo bajo el origen de la aplicación.

Las subidas incompletas y los temporales no quedan descargables. Resuelve de manera coherente un fallo entre almacenar el archivo y registrar sus metadatos.

Comprueba permisos al iniciar cada descarga. Copiar una URL o cambiar el ID no concede acceso; revocar una asignación impide nuevas descargas. Mantén la política de caché privada y los registros sin contenido de archivos.

Compartir con el paciente es una operación explícita sobre una versión concreta, con actor y fecha. Ser participante, representante no acreditado o pagador no publica todo el expediente.

Incluye un circuito mínimo de solicitud de información: solicitante, identidad comprobada, alcance, responsable, revisión y entrega. Si hay información de terceros, requiere selección y revisión humana. No exportes automáticamente el caso completo.

## 7. Respaldo y restauración conjunta

El respaldo actual contiene base y material de recuperación, tiene un límite de 256 KiB y todavía no incorpora un árbol de adjuntos. Adaptarlo es una dependencia real de este bloque.

Conserva R2 como destino de copias cifradas. El prefijo fbe/staging/ y sus credenciales pertenecen al respaldo; no los reutilices como almacenamiento operativo de documentos ni apliques su expiración de 30 días a los originales.

Captura un conjunto coherente de base, archivos privados y material necesario para recuperarlos. Verifica referencias y contenido mediante hashes o una comprobación equivalente.

Mide capacidad, tamaño del paquete, cuotas compartidas y costo observado. Conserva límites explícitos. Si los límites actuales no permiten el ensayo útil, justifica el ajuste mínimo dentro del presupuesto autorizado; no elimines los controles ni prometas gratuidad permanente.

Ejecuta una restauración aislada de una copia descargada desde R2 que contenga datos poblados:
persona, caso, cita, consentimiento, nota validada, adenda y adjunto.

Comprueba contenido de archivos, relaciones, autorías, permisos y acceso negativo. El inventario de un dump y la igualdad de bytes descargados no sustituyen esa restauración.

El ensayo queda aislado de correo, pagos y proveedores reales. Registra tiempos observados y conserva el procedimiento de detención y recuperación.

## 8. Interfaz y pruebas

Entrega interfaces en español que permitan:
- Al paciente: consultar textos de prueba, registrar aceptación cuando corresponda y acceder solo a documentos compartidos.
- Al profesional: abrir atención, preparar nota, validar cuando esté autorizado y añadir adendas.
- Al pasante: registrar actividades, horas y borradores permitidos.
- Al supervisor: revisar aportes, devolverlos, validarlos y aprobar horas.
- A recepción: continuar su trabajo administrativo sin narrativa clínica.

Prioriza formularios claros y una bandeja sencilla de tareas pendientes. No construyas un motor genérico de formularios o flujos.

Prueba los riesgos de negocio, con PostgreSQL real cuando dependan de transacciones o restricciones:
- Versiones de consentimiento y conservación de aceptaciones.
- Retirada sin borrado del historial.
- Lectura clínica denegada a recepción, soporte y profesional ajeno.
- Vencimiento y revocación con sesión abierta.
- Edición concurrente de notas y rechazo de sobrescritura de una nota validada.
- Adenda que conserva original y autorías.
- Pasante que no valida ni aprueba horas propias.
- Reasignación de supervisor con pendientes conservados.
- Exportación académica sin datos de pacientes.
- Documento no compartido inaccesible al paciente.
- Descargas por ID ajeno o tras revocación.
- Rechazo de archivos no admitidos y fallo de subida sin publicación parcial.
- Restauración conjunta del expediente y sus archivos.

Reutiliza la prueba de navegador del bloque 2 como regresión pertinente y añade un recorrido clínico/supervisión verificable. Identifica si el ensayo usa navegador de escritorio, viewport móvil o dispositivo real. No atribuyas a CI una prueba ejecutada solo localmente.

No persigas una cifra arbitraria de pruebas ni repitas ensayos sin riesgo concreto pendiente.

## 9. Publicación y cierre

Comprueba migraciones desde cero y actualización desde el esquema desplegado. Conserva roles de migración/runtime separados, permisos mínimos y datos anteriores. Define y ensaya el rollback de aplicación sobre el esquema ampliado.

Publica mediante PR y CI protegido. Construye imágenes en GitHub Actions y promueve únicamente los digests de una ejecución aprobada. Antes de desplegar, comprueba capacidad y respaldo reciente; después verifica migraciones, digests, HTTPS y un recorrido sintético breve.

Mantén deshabilitado el seed automático y conserva respaldo, monitores y alertas. No hagas una nueva ronda general de infraestructura.

Actualiza README, backlog, decisiones técnicas y evidencia. Registra implementado, probado localmente, ejecutado en CI y desplegado por separado. No marques completas las partes de FBE-018/FBE-019 que dependen de módulos futuros.

El informe final incluye commit, PR, CI, manifiesto, versión realmente desplegada, migraciones, resultados de pruebas, recuperación conjunta, recorrido de demostración y pendientes concretos.

Conserva pendientes para David y la institución los textos definitivos, plantillas clínicas, atribuciones profesionales, condiciones de pasantías, conservación y entrega de información. Implementa y prueba los mecanismos sin atribuir una aprobación inexistente.

Este encargo termina en FBE-012. Pagos, video, comunicaciones clínicas reales, IA clínica, menores, pareja/familia y firma electrónica permanecen fuera de esta entrega.
