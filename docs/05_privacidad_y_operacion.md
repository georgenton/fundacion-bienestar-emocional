# Privacidad, gobierno clínico y operación

**Proyecto:** plataforma de atención de Fundación para el Bienestar Emocional.
**Fecha de investigación normativa:** 23 de noviembre de 2026, Ecuador.
**Estado:** especificación inicial para implementación y revisión profesional; no acredita cumplimiento ni habilita una prestación sanitaria.

## 1. Alcance y decisiones pendientes

Este documento traduce el contexto ecuatoriano en requisitos de producto y operación. Las referencias normativas se identifican mediante `[S1]`–`[S8]`. Las reglas de implementación, objetivos de recuperación y responsables sugeridos son propuestas que la fundación debe concretar.

No se inspeccionaron servicios activos, permisos, configuraciones, capacidad ni bases de datos de OVH. Tampoco se verificaron los permisos sanitarios de la fundación, sus convenios universitarios, contratos de proveedores o documentos clínicos actuales. Estas comprobaciones corresponden a la preparación del piloto; el desarrollo puede avanzar con datos sintéticos.

La revisión profesional deberá resolver: entidad que presta cada servicio; habilitación y cartera sanitaria; responsable del tratamiento; función de cada proveedor; atención de menores; consentimiento asistencial; conservación documental; supervisión de pasantes; atención transfronteriza y obligaciones fiscales. Una revisión técnica del código no sustituye estas decisiones.

## 2. Marco normativo que condiciona el diseño

### Datos de salud y legitimación

La LOPDP considera especiales los datos de salud, sensibles y de menores. Sus artículos 26, 30 y 31 requieren examinar conjuntamente legitimación, condiciones sanitarias y confidencialidad: no todo tratamiento depende exclusivamente del consentimiento. El consentimiento de datos reconocido desde los 15 años no equivale a autorización autónoma para cualquier intervención psicológica. `[S1]`

### Delegado y evaluación de impacto

El artículo 10.7 del Reglamento del DPD incluye actores sanitarios obligados a mantener historias clínicas, con excepción de profesionales particulares; el artículo 10 contempla actividades sin fines de lucro. La independencia del delegado impide asignarle funciones incompatibles. `[S2]`

El artículo 14.1 de la resolución SPDP-SPD-2026-0005-R califica directamente determinados tratamientos sanitarios y de historiales clínicos como de gran escala, sin depender exclusivamente del número de pacientes. `[S3]` Preparar evaluación de impacto previa, registro de actividades y definición del DPD según el encuadre confirmado de la institución. No justificar una exención por ser una fundación pequeña.

### Prestación de telesalud

La Norma Técnica de Telesalud de 2025 es obligatoria para establecimientos del Sistema Nacional de Salud que prestan esa modalidad. Contempla documentación, consentimiento y autorizaciones; su apartado 7.1.6 remite a permisos correspondientes de ACESS. `[S4]` Antes de atender mediante la plataforma, la dirección debe confirmar qué servicios puede ofrecer y bajo qué responsabilidad profesional.

### Encargo y transferencia

El artículo 23 de la resolución SPDP-SPD-2026-0004-R diferencia encargo de tratamiento de transferencia o comunicación; su artículo 24 contempla buenas prácticas contractuales para encargos. `[S5]` No clasificar automáticamente todo alojamiento extranjero como transferencia. Mapear roles, ubicación, subencargados y finalidades efectivas; estudiar separadamente los flujos a terceros que actúan para finalidades propias.

## 3. Responsabilidades y acceso

Proponer a la fundación como responsable cuando efectivamente decide finalidades y medios. Documentar el papel de Syntavera o del operador técnico, OVH, video, correo y pagos conforme a la operación real. El contrato debe regular instrucciones, confidencialidad, soporte, incidentes, subcontratación, devolución y eliminación procedente.

Separar permisos administrativos de clínicos. Dirección podrá consultar indicadores y finanzas; el acceso clínico dependerá de función asistencial y asignación. Recepción necesita contactos y agenda. Contabilidad necesita movimientos y comprobantes. Profesionales acceden a casos autorizados. Pasantes reciben alcance y vigencia explícitos. El paciente accede a sus documentos según el procedimiento de entrega y protección de terceros.

Aplicar autorización en servidor a consultas, búsquedas, adjuntos, exportaciones y trabajos en segundo plano. Ocultar botones no basta. Denegar por defecto; probar que cambiar un identificador no permite abrir otro expediente. El cambio de equipo tratante debe revocar accesos que ya no correspondan.

Usar cuentas personales, MFA para personal, sesiones revocables y expiración de accesos temporales. Si se implementa acceso excepcional por emergencia, requerirá justificación, alcance mínimo, vencimiento y revisión posterior. No será un permiso general para administración.

## 4. Consentimientos y derechos

Mantener documentos separados, comprensibles y versionados:

1. Aviso de privacidad con finalidades, actores, derechos y canal de contacto.
2. Consentimiento asistencial según intervención y población.
3. Autorización para medios telemáticos, límites y contingencias.
4. Participación docente cuando intervengan pasantes.
5. Autorizaciones opcionales específicas, como comunicaciones promocionales o un uso adicional autorizado.

La norma de telesalud exige documentar la autorización telemática y el consentimiento correspondiente dentro del flujo y registros. `[S4]` Como implementación, guardar versión exacta, fecha, identidad, representación, finalidad y evidencia de aceptación. Evitar casillas preseleccionadas y aceptación agrupada de usos necesarios y opcionales.

Permitir consultar documentos y retirar autorizaciones cuando corresponda. El retiro debe generar revisión del tratamiento afectado; no borrará automáticamente información sometida a conservación legal. Crear solicitudes de acceso, rectificación, eliminación, oposición o portabilidad con responsable, verificación de identidad, resolución y evidencia de entrega. Proteger datos de otras personas presentes en expedientes familiares.

Para menores, verificar quién representa y con qué alcance. Una cuenta que paga o agenda no recibirá acceso clínico ilimitado. Resolver confidencialidad adolescente, representación y consentimiento con dirección clínica y asesoría; no convertir una edad aislada en una regla universal.

Desactivar inicialmente grabación y transcripción de consultas. Su incorporación necesitará finalidad, análisis de necesidad, proveedor, base aplicable, acceso y conservación específicos. No enviar información clínica a herramientas de IA por defecto.

## 5. Historia clínica y evidencias

El Acuerdo 5216 exige custodia, confidencialidad, trazabilidad y accesos personales restringidos a información electrónica. La reserva continúa al terminar la vinculación profesional; el uso docente autorizado debe proteger identidad. `[S6]`

Proponer borrador, revisión y validación de notas. Una nota validada conserva autor, responsable, fecha y versión; se corrige mediante adenda vinculada, sin sobrescritura silenciosa. Mantener diagnóstico, intervención, observaciones y adjuntos dentro del ámbito clínico. Recordatorios y comprobantes usarán información mínima y texto neutral.

La validación interna identifica una acción autenticada y conserva evidencia. **No se presentará como firma electrónica cualificada, certificada ni equivalente legalmente** sin implementar y verificar el mecanismo exigible. Si un informe requiere firma electrónica, resolver formato, certificado y validación mediante un componente específico.

Registrar lecturas, modificaciones, exportaciones, cambios de permisos y validaciones con usuario, recurso, momento y propósito cuando proceda. No copiar relatos clínicos completos en registros técnicos. Exportar auditoría a un destino separado y restringido; documentar sus límites de resistencia a alteraciones.

No fijar un plazo universal de conservación. Validar una tabla por categoría: expediente, consentimiento, comprobante, registro de seguridad, convenio y evidencia académica. La eliminación requerirá revisión de obligaciones, bloqueos legales, copias y terceros. Inactivar una cuenta o archivar un caso no elimina la historia.

## 6. Pasantes y uso académico

La norma UAD contempla consentimiento docente, derecho a no participar, actividades acordes con competencias y supervisión. Su aplicación concreta depende del establecimiento, convenios y programa. `[S7]` No se confirmó aquí la acreditación UAD ni el convenio particular de la fundación.

El módulo conservará universidad, programa, nivel, convenio, periodo, supervisor y actividades autorizadas. El supervisor aprueba asignaciones y revisa borradores; la aprobación preserva autoría del estudiante. El sistema no concederá capacidad autónoma de ejercer por el simple hecho de crear un usuario pasante.

Separar bitácoras académicas de expedientes clínicos. Los informes de prácticas contendrán actividades, horas, competencias y aprobación; no adjuntarán historias completas. Utilizar casos desidentificados y revisar detalles que permitan reconocer personas. La seudonimización conserva una posibilidad de vinculación y no convierte los datos en anónimos. Evitar publicar estadísticas de grupos tan pequeños que identifiquen pacientes.

## 7. Operación propuesta en OVH

### Separación y despliegue

Mantener repositorio, proyecto, base de datos, usuarios, almacenamiento y secretos propios de la fundación. Si se usa Coolify, crear un proyecto y recursos dedicados, revisar redes y permisos; un proyecto lógico por sí solo no prueba aislamiento del servidor. Documentar qué comparte host con otros productos y evaluar si requiere una máquina virtual separada.

Separar desarrollo, pruebas y producción. Desarrollo y pruebas usarán datos sintéticos. No descargar una base clínica para depurar. Mantener secretos fuera de Git, imágenes, capturas, tickets y registros. Definir rotación y revocación de credenciales. Evitar cuentas y contraseñas compartidas.

Confirmar antes del despliegue RAM, CPU, disco, región, sistema operativo, recursos libres y carga de aplicaciones existentes. Video debe operar inicialmente en proveedor externo al host de aplicación/base de datos; no instalar Jitsi junto a la base clínica sin dimensionamiento y evaluación de aislamiento.

TLS, base de datos en red privada, firewall, actualizaciones, control de acceso remoto y monitorización forman parte del mínimo operativo propuesto. Las cuentas técnicas deben tener privilegios limitados. Revisar archivos subidos, tipos permitidos y descarga autenticada.

### Copias y recuperación

Respaldar de forma coherente base de datos, adjuntos y configuración necesaria. Conservar copias cifradas fuera del host; mantener claves y procedimiento de recuperación protegidos y disponibles en un lugar distinto del servidor. Un respaldo inutilizable por pérdida de claves no cumple el objetivo.

Proponer para el piloto **RPO máximo de 24 horas** y **RTO máximo de 8 horas**, sujetos a aprobación según tolerancia clínica. RPO significa pérdida potencial de hasta 24 horas de cambios; si eso es inaceptable, aumentar frecuencia o implementar recuperación a un punto en el tiempo. RTO es el objetivo de restauración, no una garantía comercial.

Ensayar restauración antes del piloto y después de cambios relevantes. Verificar acceso, conteos, adjuntos, integridad y permisos; medir tiempos y registrar evidencia. Separar credenciales que crean copias de las que pueden eliminarlas. Definir continuidad manual segura durante indisponibilidad.

### Soporte y límites

Solicitudes de soporte indicarán motivo, aprobación operativa, alcance, duración y registro. Priorizar diagnóstico con metadatos mínimos. No prometer inaccesibilidad absoluta al administrador raíz: quien controla host, aplicación o claves puede tener capacidad técnica de acceso. Reducir ese poder mediante separación de funciones, controles, contratos y auditoría.

## 8. Incidentes y respuesta

Según artículos 43 y 46 de la LOPDP: el responsable notifica a SPDP y ARCOTEL lo antes posible y hasta cinco días desde constancia, salvo el supuesto de riesgo improbable previsto; el encargado comunica al responsable hasta dos días desde conocimiento. Para titulares, el término de tres días se vincula al conocimiento del riesgo a sus derechos y tiene excepciones legales. Son términos legales, no una regla de 72 horas. `[S1]`

La norma SPDP-SPD-2026-0040-R desarrolla notificaciones y contempla confidencialidad, integridad y disponibilidad. `[S8]` El procedimiento operativo debe documentar detección, contención, evidencia, alcance, valoración, decisión de notificar, destinatarios y recuperación. Confirmar canales oficiales vigentes al activarlo. La fundación designará responsables y suplentes; Codex no enviará notificaciones legales por decisión propia.

## 9. Acciones, evidencia y responsables propuestos

| Acción | Evidencia requerida | Responsable propuesto |
| --- | --- | --- |
| Confirmar habilitación y cartera | Permisos y alcance revisados | Dirección y responsable clínico |
| Resolver gobernanza de datos | Mapa de roles, DPD y encargos | Dirección con asesoría competente |
| Evaluar impacto | Evaluación, riesgos y mitigaciones | Responsable con asesoría del DPD |
| Aprobar consentimientos | Versiones y flujo probado | Dirección clínica y asesoría |
| Definir pasantías | Convenio, competencias y supervisores | Coordinación académica |
| Validar conservación | Tabla por documento y fundamento | Responsable clínico y asesoría |
| Asegurar permisos | Matriz y pruebas de acceso denegado | Equipo técnico; revisión independiente |
| Dimensionar OVH | Inventario y prueba de carga prevista | Operación técnica |
| Probar recuperación | Registro de restauración y tiempos | Operación; aceptación de dirección |
| Preparar incidentes | Procedimiento y ejercicio de respuesta | Responsable, DPD y operación |

Estas asignaciones son funcionales; deben convertirse en personas y suplentes concretos. La aceptación del piloto exige evidencias revisadas y riesgos pendientes explícitos. No constituye una certificación de cumplimiento.

## 10. Fuentes oficiales

- **[S1] LOPDP**, particularmente arts. 21, 25–31, 43 y 46: https://www.gob.ec/sites/default/files/regulations/2025-01/01%20Ley%20Org%C3%A1nica%20de%20Protecci%C3%B3n%20de%20Datos%20Personales.pdf
- **[S2] Reglamento del DPD, SPDP-SPD-2025-0028-R**, arts. 10, 15 y 17: https://www.spdp.gob.ec/wp-content/uploads/2026/11/28.01.01-SPSP-SPD-2025-0028-R-Reglamento-Delegado-de-Proteccion-de-Datos-Personales-signed.pdf
- **[S3] Norma sobre tratamiento a gran escala, SPDP-SPD-2026-0005-R**, art. 14.1: https://www.spdp.gob.ec/wp-content/uploads/2026/08/Resolucion0005.pdf
- **[S4] Norma Técnica de Telesalud, Acuerdo 00044-2025**: https://www.conasa.gob.ec/wp-content/norma_tecnica_telesalud/Registro_oficial_Norma_T%C3%A9cnica_de_Telesalud.pdf
- **[S5] Norma de transferencias, SPDP-SPD-2026-0004-R**, arts. 20–24; copia oficial alojada por la Corte Constitucional: https://esacc.corteconstitucional.gob.ec/storage/api/v1/10_DWL_FL/eyJjYXJwZXRhIjoicm8iLCJ1dWlkIjoiM2FjZmZhNTEtZmUzZi00NGJiLWI4NmUtNDQ2YWQzYTk5NWYxLnBkZiJ9
- **[S6] Reglamento de Información Confidencial, Acuerdo 5216**, arts. 8–16: https://www.salud.gob.ec/wp-content/uploads/2021/09/Acuerdo-Ministerial-5216.pdf
- **[S7] Norma Técnica para Unidades Asistenciales Docentes**: https://www.salud.gob.ec/wp-content/uploads/2021/06/NORMA-UNIDADES-ASISTENCIALES-DOCENTES.pdf
- **[S8] Norma Técnica de Notificaciones de Vulneraciones, SPDP-SPD-2026-0040-R**: https://www.spdp.gob.ec/wp-content/uploads/2026/10/SPDP-SPD-2026-0040-r.pdf
