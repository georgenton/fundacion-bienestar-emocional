# 04 — Backlog y criterios de aceptación

**Proyecto:** plataforma de atención de la Fundación para el Bienestar Emocional.
**Estado:** propuesta de trabajo para Codex; no representa funciones implementadas ni decisiones aprobadas.
**Fecha:** 23 de noviembre de 2026.

## Cómo ejecutar este backlog

Los cinco bloques se ejecutan en orden. Cada tarea debe producir un cambio revisable con alcance concreto, evidencia de las verificaciones pertinentes y pendientes explícitos. Se priorizan pruebas de riesgos de negocio: accesos indebidos, duplicación, concurrencia, pérdida de integridad y recuperación. No se pretende completar todos los módulos con una única instrucción a Codex.

El piloto propuesto atiende adultos individuales. El registro administrativo de pasantes y horas entra en el alcance inicial. Su participación clínica solo se habilita si se confirman atribuciones institucionales, supervisor, convenio o marco aplicable y consentimientos; entonces se aplica el mismo flujo de revisión clínica. No se permite atención autónoma de pasantes.

Las funcionalidades para menores, pareja y familia requieren una expansión posterior. El modelo debe admitirlas, pero la reserva automática de estos servicios permanece deshabilitada hasta verificar representación, confidencialidad entre participantes y atención correspondiente. El catálogo puede orientar y recibir solicitudes sin prometer disponibilidad online aún inexistente.

## Bloque 1 — Base aislada e identidad

**Objetivo:** una aplicación reproducible, identificada como entorno de pruebas, con cuentas y autorización real en el servidor. No requiere proveedores externos activos.

### FBE-001 — Crear estructura y entorno reproducible

Preparar repositorio, web, API modular, persistencia y configuración de ejemplo. Seleccionar versiones compatibles y soportadas en el momento de implementación. Mantener secretos fuera del repositorio y datos exclusivamente sintéticos.

**Aceptación:** otro operador puede iniciar el entorno siguiendo el README; el estado de salud detecta una base inaccesible; las credenciales de ejemplo no sirven para producción. El arranque no se conecta a bases, archivos ni proveedores de otros proyectos. La ejecución de seeds exige un entorno permitido.

### FBE-002 — Implementar identidad, sesiones y recuperación

Crear invitaciones, activación, inicio y cierre de sesión, revocación y recuperación. Proponer MFA obligatorio para personal con capacidades sensibles. Recuperar contraseña y recuperar MFA son procesos diferenciados; ninguno debe convertirse en un bypass silencioso.

**Aceptación:** tokens de recuperación expiran y no se reutilizan; desactivar una cuenta invalida sus sesiones; los errores no revelan innecesariamente si una persona está registrada. Se prueba pérdida del segundo factor con el procedimiento aprobado, conservación de auditoría y revocación de sesiones comprometidas. Recepción no puede desactivar el MFA clínico por una ruta administrativa general.

### FBE-003 — Implementar roles y asignaciones por caso

Crear capacidades administrativas y clínicas, asignaciones con vigencia y denegación por defecto. Incluir una estructura mínima de caso y participantes con fixtures sintéticos para probar autorización; el registro funcional y sus pantallas se completan en FBE-005. Utilizar cuentas sintéticas para dirección administrativa, recepción, profesional, supervisor, pasante y paciente. Aplicar el predicado correspondiente a cada función, sin exigir asignaciones clínicas a pacientes ni a personal administrativo.

**Aceptación:** cambiar un identificador no permite leer un caso ajeno; búsquedas, listas, descargas y exportaciones respetan el mismo alcance. Un profesional pierde acceso ordinario al vencer la asignación. Una tarea de worker tampoco elude autorización o entrega información a un destinatario que perdió acceso.

### FBE-004 — Establecer registros seguros y auditoría

Registrar acciones sensibles y errores operativos con identificadores mínimos. Definir quién consulta auditoría y cómo se protege frente a modificación ordinaria.

**Aceptación:** un fallo provocado puede investigarse sin que los registros contengan notas clínicas, contraseñas, tokens o comprobantes completos. Una lectura denegada deja evidencia útil sin revelar el contenido solicitado. Soporte no obtiene acceso clínico mediante la consola administrativa.

**Salida del bloque:** entorno local o de pruebas reproducible y evidencia de permisos. La apariencia visual no sustituye estos criterios.

### Estado verificable del bloque 1 — 23 de noviembre de 2026

FBE-001 a FBE-004 están implementadas y probadas localmente con datos sintéticos. La evidencia, comandos, resultados, límites y pendientes se registran en `docs/08_evidencia_bloque_1.md`; las decisiones técnicas adoptadas están en `docs/adr/0001_base_tecnica_identidad_y_autorizacion.md`.

Este estado no aprueba el piloto ni cambia el carácter propuesto de los bloques 2–5. El transporte de correo de invitación/recuperación, la recuperación humana cuando se pierden todos los factores y los procesos institucionales aún requieren responsables y validación antes de un entorno real.

## Bloque 2 — Personas, casos y agenda

**Objetivo:** recepción puede registrar, asignar y agendar atención individual de adultos sin duplicaciones ni solapamientos.

### FBE-005 — Registrar personas y abrir casos

Separar persona, cuenta, caso, participantes y asignaciones. Permitir registro sin cuenta de paciente. Incluir el servicio y la modalidad en el caso.

**Aceptación:** una persona registrada por recepción puede vincular después su cuenta sin crear otro expediente. Un pagador distinto no se convierte en paciente. La coincidencia de nombres o correo familiar no fusiona personas automáticamente. Ningún caso se abre con una modalidad online no habilitada.

### FBE-006 — Configurar servicios y disponibilidad

Definir duración, margen, modalidad, profesionales elegibles y ausencias. Mostrar zona horaria. Incorporar tarifas como versiones, sin mezclarlas con reglas de agenda.

**Aceptación:** un profesional no habilitado para un servicio no aparece como reservable. Cambiar una duración no altera citas ya acordadas silenciosamente. Una ausencia que afecta reservas existentes genera conflicto visible para resolver, en lugar de borrarlas.

### FBE-007 — Reservar con control de concurrencia

Implementar reservas temporales con expiración y confirmación transaccional. Proteger los intervalos del profesional y los recursos pertinentes en la base y el servidor.

**Aceptación:** dos solicitudes simultáneas para la misma franja confirman una sola cita. Se comprueban solapamientos parciales, márgenes y reintentos. Una reserva expirada deja de bloquear. Actualizar desde una pantalla desactualizada no sobrescribe una reprogramación más reciente sin aviso.

### FBE-008 — Reprogramar, cancelar y registrar asistencia

Conservar motivos, autor y relación con la reserva original. Mantener separados estado de cita, atención y situación económica.

**Aceptación:** reprogramar deja una sola reserva activa y retira recordatorios obsoletos. Cancelar no marca un reembolso como ejecutado sin confirmación. Pagar no marca asistencia; entrar a una sala tampoco completa la consulta. Se distinguen ausencia del paciente y cancelación del profesional.

**Salida del bloque:** recorrido de recepción probado con concurrencia y excepciones. La autorreserva del paciente sigue controlada por servicio y modalidad.

### Implementación verificable del bloque 2

El recorrido sintético de FBE-005 a FBE-008 y sus pruebas quedan en la [evidencia del bloque 2](16_evidencia_bloque_2.md). El trabajo de recordatorios externos se conserva en FBE-015. La aplicación mantiene la referencia y versión de la cita para que ese módulo pueda detectar trabajos obsoletos. FBE-018 y FBE-019 conservan los criterios de sus bloques.

## Bloque 3 — Expediente, consentimiento y supervisión

**Objetivo:** documentar la atención y su revisión conservando autoría, acceso por caso y versiones.

### FBE-009 — Implementar consentimientos y evidencia

Registrar textos versionados, finalidad, persona, caso cuando corresponda, aceptación y cambios. Preparar un circuito de solicitudes de información y representación sin habilitar todavía menores por defecto.

**Aceptación:** se puede reconstruir qué texto aceptó una persona; actualizar el formulario no modifica aceptaciones anteriores. La autorización para atención no se convierte automáticamente en permiso de grabación o mercadeo. Una retirada genera revisión del proceso afectado, sin borrar automáticamente el expediente.

### FBE-010 — Registrar atención, nota y adenda

Crear atención y notas en borrador, revisión y validación. Conservar autor, momento del registro, momento de la atención y versión de plantilla. Añadir correcciones mediante adendas.

**Aceptación:** una nota validada no admite sobrescritura ni borrado ordinario por API. Una adenda mantiene el original y su relación. Desactivar al autor conserva trazabilidad. Recepción no ve narrativa clínica en agenda, búsqueda, error o exportación administrativa.

### FBE-011 — Implementar prácticas y revisión de aportes

Registrar período, supervisor, documentos institucionales y horas. Separar evidencia académica y expediente. Mantener deshabilitada la participación clínica hasta completar su validación institucional; permitirla después solo en casos asignados y con revisión.

**Aceptación:** el pasante no aprueba horas propias ni valida notas clínicas. Al terminar su período pierde acceso aunque conserve una sesión abierta. Una reasignación de supervisor conserva aportes pendientes y responsable visible. La exportación universitaria no incluye identidades, diagnósticos ni narraciones de pacientes.

### FBE-012 — Proteger adjuntos y entrega de información

Implementar almacenamiento privado, validación de archivos, descargas autorizadas y publicación explícita de documentos para el paciente. Incluir solicitudes que necesiten revisión por contener datos de terceros.

**Aceptación:** una URL copiada no da acceso a otra cuenta; los permisos se vuelven a comprobar al descargar. No existen carpetas clínicas públicas. Una solicitud de copia no exporta automáticamente datos de otros participantes. Se prueba el rechazo de tipos, tamaños y contenido no admitidos.

**Salida del bloque:** expediente sintético, revisión supervisada y evidencia de accesos negativos. El [documento del bloque 3](17_evidencia_bloque_3.md) enlaza el recorrido y distingue resultados locales, CI, staging y recuperación. Los textos, plantillas y atribuciones conservan su revisión institucional pendiente.

## Bloque 4 — Pagos, portal y videollamada

**Objetivo:** completar el recorrido del paciente con registro económico correcto y acceso a una consulta externa, sin prometer integraciones inexistentes.

### FBE-013 — Registrar obligaciones, pagos y solidaridad

Implementar importes en centavos, cobros, pagos parciales, asignaciones, becas y exoneraciones. Comenzar con los métodos de pago acordados y verificación manual cuando corresponda.

**Aceptación:** cargar un comprobante no marca automáticamente el pago como verificado. La suma de asignaciones no excede lo disponible; dos operaciones concurrentes no consumen dos veces el mismo saldo. Una tarifa nueva no cambia un cobro anterior. Donaciones y consultas tienen registros diferenciados.

### FBE-014 — Conciliar, devolver y liquidar

Crear ajustes trazables, devoluciones y liquidaciones a profesionales, con estados de preparación, aprobación y ejecución. Si hay proveedor, verificar autenticidad de eventos e idempotencia.

**Aceptación:** recibir dos veces el mismo evento no duplica ingresos. La devolución no supera lo elegible y no se anuncia como ejecutada mientras el proveedor siga pendiente. El cambio de un porcentaje no recalcula silenciosamente liquidaciones cerradas. Un recibo interno se identifica sin presentarlo como factura tributaria.

### FBE-015 — Implementar portal y recordatorios mínimos

Mostrar al paciente sus citas, información de acceso, cobros y documentos expresamente compartidos. Utilizar mensajes neutrales y canales consentidos, con cancelación y reprogramación coherentes.

**Aceptación:** los recordatorios no contienen diagnóstico ni motivo de consulta. Un worker no envía el horario viejo después de reprogramar. Cerrar sesión no deja el expediente disponible mediante caché local ordinaria. Un pagador no accede al portal clínico por recibir una referencia de pago.

### FBE-016 — Incorporar proveedor externo de video

Empezar con enlaces administrados por cita y una interfaz de proveedor que permita automatizar después. Mantener credenciales individuales y controles de admisión. Grabación y transcripción permanecen desactivadas por defecto.

**Aceptación:** probar dos consultas simultáneas de profesionales diferentes, una sesión que supera 60 minutos y acceso móvil. Cancelar actualiza o elimina la reunión según las capacidades reales del proveedor. Si únicamente se oculta el enlace, el estado lo dice y requiere el procedimiento correspondiente: nunca se informa una revocación inexistente. Se verifica un procedimiento alternativo para fallos de conexión.

**Salida del bloque:** recorrido integral sintético con paciente, profesional y recepción; estados de pago y video verificables.

## Bloque 5 — Operación y apertura controlada del piloto

**Objetivo:** comprobar que la plataforma puede operarse, recuperarse y mantenerse en el entorno previsto.

### FBE-017 — Preparar despliegue aislado en OVH/Coolify

Medir capacidad actual antes de desplegar. Crear recursos propios, redes, volúmenes y secretos por entorno. Exponer solo las superficies necesarias y verificar HTTPS antes de usar credenciales reales.

**Aceptación:** el despliegue no cambia proxies globales, bases, redes o servicios ajenos sin un cambio explícito y revisado. La base no queda publicada innecesariamente. Se conoce qué versión se ejecuta y cómo volver a la anterior. No se atribuye alta disponibilidad a un único servidor.

### FBE-018 — Respaldar y restaurar el conjunto completo

Definir objetivos de recuperación y copias cifradas externas. Incluir base, archivos y material criptográfico necesario, con custodia separada de las claves. Preparar un entorno de ensayo aislado.

**Aceptación:** restaurar una copia y abrir casos sintéticos, notas y adjuntos asociados. Verificar que permisos y autorías se conservan. El ensayo no envía correos, cobra pagos ni llama a proveedores reales. Registrar resultado y tiempo observado; una copia creada sin restauración probada no cierra la tarea.

### FBE-019 — Ensayar operación y respuesta a incidentes

Asignar responsables para fallos, recuperación de cuentas, conciliaciones, solicitudes de información y situaciones que requieren intervención clínica. Definir horarios y canales atendidos.

**Aceptación:** personal designado resuelve una caída de video, un pago duplicado, una cuenta comprometida y una solicitud de información sin inventar pasos. El portal no promete vigilancia o respuesta inmediata que la fundación no presta. Alertas y registros evitan narraciones clínicas.

### FBE-020 — Revisar y autorizar el piloto

Realizar revisión funcional con David y las personas responsables; revisión técnica independiente; validación de requisitos institucionales y normativos; y aceptación del alcance disponible.

**Aceptación:** completar registro, consentimiento, cita, pago parcial, atención, nota, corrección y cierre con datos sintéticos. Resolver hallazgos críticos de acceso, integridad y recuperación. Documentar responsables, servicios habilitados, excepciones conocidas y forma de detener el piloto. Las modalidades no verificadas permanecen deshabilitadas para autorreserva.

**Salida del bloque:** evidencia suficiente para una decisión humana informada de apertura. La finalización técnica por sí sola no acredita autorización clínica, contractual o normativa.

## Expansiones posteriores

Una vez evaluado el piloto, crear tareas separadas para pareja/familia, menores y representación, otras especialidades, pasarelas, facturación, video integrado, talleres e indicadores. Cada expansión conserva permisos por caso, trazabilidad y pruebas de sus riesgos propios. No activar una modalidad únicamente porque la base ya admite varios participantes.

Para cada entrega, el informe de Codex debe distinguir implementado, probado, no ejecutado y pendiente de validación. La auditoría revisará el cambio concreto y su evidencia; las afirmaciones de éxito deben corresponder a lo observado.
