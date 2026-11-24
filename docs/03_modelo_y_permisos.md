# 03 — Modelo de información y permisos

**Proyecto:** plataforma de atención de la Fundación para el Bienestar Emocional.
**Estado:** propuesta técnica inicial; pendiente de validación funcional, clínica y normativa.
**Fecha:** 23 de noviembre de 2026.

Este documento describe el modelo que se propone implementar. No afirma que la aplicación exista, que las decisiones hayan sido aprobadas ni que se haya acreditado cumplimiento. Las atribuciones profesionales, la representación, los consentimientos y la conservación de documentos requieren validación institucional antes de usar datos reales.

## 1. Alcance y principios

La primera versión se propone para una fundación, con atención individual de adultos. El catálogo puede mostrar otros servicios, pero sus reservas online permanecen deshabilitadas hasta completar sus flujos y pruebas. Parejas, familias y menores se contemplan en el modelo desde el inicio; eso no significa que estén habilitados en el piloto.

El diseño debe conservar cuatro separaciones: persona y cuenta; caso y cita; atención y nota; cobro y pago. Una persona puede existir sin acceso al portal. Una cita puede cancelarse sin atención. Una atención puede quedar con una nota pendiente. Un pago puede cubrir parcialmente varias obligaciones. Estas situaciones deben representarse sin inventar pacientes, duplicar expedientes ni modificar importes históricos.

Se recomienda un monolito modular, con autorización del servidor y operaciones transaccionales. No se propone construir un SaaS multiorganización en esta etapa. La fundación conserva base, credenciales, archivos y configuración propios, aunque comparta infraestructura física con otros proyectos.

## 2. Identidad, profesionales y casos

| Entidad propuesta | Contenido y relación principal | Límite que protege |
| --- | --- | --- |
| `Person` | Identidad y contacto mínimos de paciente, profesional, representante o pagador. | No equivale a una cuenta ni concede acceso. |
| `UserAccount` | Identidad de autenticación vinculada a una persona; estado, mecanismos de acceso y sesiones. | Un correo compartido no demuestra que dos personas sean la misma. |
| `ProfessionalProfile` | Profesión, servicios autorizados, credenciales verificadas, disponibilidad y vigencias. | El catálogo de habilidades no sustituye la habilitación profesional. |
| `StaffMembership` | Relación de una persona con la fundación y capacidades administrativas o clínicas. | Ser empleado no habilita lectura de todos los casos. |
| `CareCase` | Episodio de atención: modalidad, servicio, estado, apertura y cierre. | Agrupa atención con propósito definido; no es una ficha ilimitada. |
| `CaseParticipant` | Persona vinculada al caso como consultante u otro participante autorizado. | Participar no da visibilidad automática de todo el expediente. |
| `CaseAssignment` | Profesional, supervisor o pasante autorizado; función, acciones permitidas, inicio y fin. Para pasantes se vincula además la práctica y el supervisor. | El acceso clínico del equipo depende de asignación activa y alcance. |
| `Representation` | Relación acreditada, alcance, documentación, vigencia y revisión. | Pagar o ser familiar no demuestra representación. |

Los identificadores internos son estables y no contienen nombres, documentos nacionales ni diagnósticos. El número de identificación personal no debe ser requisito universal sin justificación. La fusión de duplicados exige revisión, preserva referencias y queda auditada; nunca se ejecuta automáticamente por coincidencia de nombre.

Una persona puede tener varios episodios sin que todos sus profesionales compartan necesariamente el mismo acceso. La continuidad entre episodios se resuelve mediante una decisión clínica autorizada y trazable. El cierre del caso revoca las operaciones ordinarias según la política acordada, conservando los accesos posteriores justificados que procedan.

## 3. Agenda y atención

`ServiceDefinition` contiene modalidad, duración, margen entre citas y profesionales elegibles. La cita conserva una instantánea de las condiciones que le corresponden. Modificar un servicio no cambia retroactivamente citas atendidas o importes acordados.

| Objeto | Estados iniciales propuestos | Regla principal |
| --- | --- | --- |
| `Appointment` | `HELD`, `SCHEDULED`, `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `COMPLETED`. | Una reserva temporal expira; confirmar requiere disponibilidad válida. |
| `Encounter` | `OPEN`, `IN_PROGRESS`, `COMPLETED`, `VOIDED_WITH_REASON`. | Representa la atención efectivamente registrada, no el pago ni la conexión de video. |
| `CareCase` | `OPEN`, `PAUSED`, `CLOSED`. | Sus transiciones tienen responsable, fecha y motivo. |

No todas las transiciones son libres. Marcar una cita como atendida debe corresponder a la atención registrada; un evento de entrada a videollamada no constituye prueba suficiente. Una anulación administrativa conserva el registro y la explicación.

El servidor impide solapamientos del profesional, incluyendo margen entre consultas y recursos compartidos cuando existan. La validación debe resistir solicitudes concurrentes y reintentos. La reprogramación mantiene la relación con la cita original, invalida recordatorios pendientes y actualiza la reserva en una operación coherente.

Se guardan instantes con referencia temporal consistente y se presenta la zona horaria elegida. La agenda distingue horario mostrado, duración de atención y tiempo reservado. Los cambios de disponibilidad no cancelan silenciosamente citas confirmadas.

## 4. Expediente, notas y documentos

`ClinicalNote` se vincula con un caso y, cuando corresponde, una atención. Registra autor, fecha de registro, fecha de la atención, plantilla y versión, estado y responsable de validación. La plantilla depende del servicio; no se deben imponer campos diagnósticos a prestaciones que no los requieren.

El ciclo propuesto es `DRAFT → PENDING_REVIEW → VALIDATED`. Un profesional habilitado puede tener un recorrido de validación directa cuando la política lo permita. La devolución de un borrador incluye observaciones y mantiene su historia. La nota de un pasante exige revisión del supervisor y conserva ambas autorías.

Una nota validada no se sobrescribe. La corrección genera `ClinicalAddendum`, enlazada al original, con autor, fecha, motivo y contenido añadido o corregido. Deben distinguirse corrección de un error material y nueva información clínica. La aplicación no presenta su validación interna como firma electrónica con efectos jurídicos sin implementar y verificar los requisitos correspondientes.

`Attachment` describe propietario lógico, caso o proceso, clase de documento, versión, estado de revisión y ubicación privada. Se limitan tamaño y tipos admitidos; se verifica el contenido recibido y se aplica el tratamiento de seguridad acordado. Los nombres de archivo no deben convertirse en rutas públicas. Toda descarga verifica autorización vigente; el almacenamiento no decide por sí solo quién puede ver un documento.

Los documentos destinados al paciente constituyen una selección explícita. La existencia de un documento en el expediente no implica publicación automática en el portal. Esta regla de producto tampoco elimina los mecanismos para ejercer derechos de acceso que correspondan.

## 5. Consentimientos, representación y solicitudes

`ConsentRecord` conserva persona, caso o prestación aplicable, finalidad, versión exacta del texto, modo de aceptación, fecha, evidencia y estado. La institución debe definir las bases y documentos pertinentes. No se utilizará una casilla general como autorización para atención, mercadeo, grabación y participación de pasantes simultáneamente.

Una retirada o sustitución de consentimiento conserva el antecedente y activa la revisión del proceso afectado. No desencadena automáticamente el borrado del expediente. Las reglas de conservación, derechos y acceso excepcional se parametrizan después de su validación; no se deducen de una fecha arbitraria en el código.

Para futuros menores, pareja o familia se necesitan participantes, representación y destinatarios definidos. El acceso de un representante puede tener límites y caducidad. Ninguna persona obtiene acceso a datos de terceros solo por estar en el mismo caso.

`InformationRequest` registra solicitudes de copia, corrección u otros derechos: solicitante, comprobación de identidad, alcance, responsable, estado, respuesta y entrega. La exportación debe permitir revisión de información de terceros y quedar trazada, sin convertir el portal en una descarga masiva indiscriminada.

## 6. Dinero, solidaridad y liquidación

Los importes se almacenan en unidades menores enteras con moneda explícita; para USD, centavos. Los porcentajes y redondeos tienen una regla única documentada. Se evita usar coma flotante para saldos. El estado económico no reemplaza al estado clínico ni debe bloquear automáticamente actuaciones que requieran una excepción institucional.

| Entidad | Responsabilidad |
| --- | --- |
| `TariffVersion` | Precio y vigencia por servicio; no altera transacciones históricas. |
| `Charge` | Obligación económica asociada a una prestación y sus condiciones acordadas. |
| `SolidarityAdjustment` | Beca, descuento, exoneración o aporte institucional, con motivo y aprobador. |
| `Payment` | Dinero recibido, pagador, método, referencia, moneda y verificación. |
| `PaymentAllocation` | Importe de un pago aplicado a una obligación concreta. |
| `Refund` | Devolución y su relación con el pago original y el resultado confirmado. |
| `ProfessionalSettlement` | Cálculo, aprobación y registro de liquidación al profesional. |
| `Donation` | Aporte solidario independiente del cobro clínico, con finalidad cuando proceda. |

Un comprobante de transferencia puede quedar pendiente de verificación; subir una imagen no acredita el pago. El sistema identifica por separado recibo interno y documento tributario. La integración fiscal, si se incorpora, tiene contrato y estados propios.

La suma de asignaciones no puede exceder el importe disponible del pago. Las devoluciones no exceden lo efectivamente cobrado y elegible. Los ajustes generan movimientos trazables; no se corrige una conciliación borrando el pago original. Las operaciones que afectan saldos se ejecutan en transacciones con control de concurrencia.

Cada evento externo conserva una clave idempotente. Un reintento no crea otro ingreso. Un cambio retroactivo de porcentaje profesional exige ajuste aprobado, no recalcular silenciosamente liquidaciones cerradas. El profesional ve su liquidación y los datos mínimos que la justifican, sin obtener acceso por esa vía a otros expedientes.

## 7. Pasantes y supervisión

`InternshipPlacement` contiene institución académica, período, documentos institucionales aplicables, supervisor y estado. `InternshipActivity` registra actividad, duración, fecha, revisión y evidencia mínima. El registro administrativo de prácticas y horas puede incorporarse desde el inicio.

La participación clínica se activa únicamente cuando estén confirmados el convenio o marco institucional correspondiente, las atribuciones, el supervisor disponible y los consentimientos necesarios. Si esto se valida, puede entrar al piloto con los mismos controles de expediente; nunca como práctica autónoma.

`SupervisionTask` vincula aporte, caso, pasante, supervisor, vencimiento operativo y resolución. Cambiar al supervisor no deja notas sin responsable. El cierre o suspensión de las prácticas revoca inmediatamente las asignaciones y sesiones pertinentes, conservando la autoría histórica.

La evidencia académica se separa del contenido clínico. Los informes de horas no incluyen nombres de pacientes ni narraciones. Una referencia seudonimizada sigue siendo información restringida cuando puede reidentificarse. El pasante no aprueba sus propias horas ni la validación de sus notas.

## 8. Matriz inicial de acceso

Las siguientes capacidades están propuestas, no aprobadas. «Asignados» significa caso, acción y período autorizados para el equipo clínico. La autorización del paciente depende de identidad y participación; la representación requiere acreditación; recepción y finanzas usan capacidades administrativas sin asignación clínica. Los permisos se comprueban en cada operación del servidor, incluidas búsquedas, exportaciones y descargas.

| Perfil | Agenda y contacto | Contenido clínico | Finanzas | Prácticas | Límite principal |
| --- | --- | --- | --- | --- | --- |
| Dirección administrativa | Gestión institucional necesaria. | Sin acceso por este cargo. | Gestión y aprobación según política. | Administración. | El cargo no concede lectura clínica. |
| Dirección clínica | Coordinación necesaria. | Según responsabilidad clínica y acceso justificado. | Información mínima operativa. | Supervisión autorizada. | La supervisión no implica acceso indiscriminado. |
| Recepción | Registro, agenda y contacto necesarios. | Sin notas ni diagnósticos. | Registro o consulta limitada. | Sin casos clínicos. | No obtiene narrativa clínica en búsquedas. |
| Profesional tratante | Su agenda y casos asignados. | Lectura y escritura autorizadas. | Sus liquidaciones y estado mínimo requerido. | Cuando tenga función supervisora. | No accede a otros casos mediante identificadores. |
| Supervisor | Casos y tareas bajo supervisión. | Revisión y validación autorizadas. | Sin acceso general. | Evaluación y aprobación. | Responsabilidad y vigencia explícitas. |
| Pasante | Tareas y casos asignados. | Acceso mínimo; borradores sujetos a revisión. | Sin acceso. | Registro propio. | Sin aprobación clínica ni académica propia. |
| Paciente | Sus citas y contacto. | Documentos compartidos y solicitudes correspondientes. | Sus cobros y comprobantes. | Sin acceso. | No ve información de otros participantes. |
| Representante o pagador | Solo lo acreditado para su función. | Según representación y alcance confirmado. | Según obligación o pago propio. | Sin acceso. | Pagar no habilita acceso clínico. |
| Soporte técnico | Diagnóstico técnico mínimo. | Sin lectura ordinaria en la aplicación. | Sin contenido financiero ordinario. | Sin acceso. | Acceso excepcional sujeto a procedimiento específico. |

Una persona puede tener varios perfiles, pero debe quedar claro qué capacidad justifica cada acción. Ocultar botones no reemplaza la autorización. Los permisos se deniegan por defecto y se revisan también en tareas asíncronas. Los administradores de infraestructura pueden representar un riesgo técnico distinto: se limita su acceso, se audita y no se promete inaccesibilidad absoluta solo por aplicar roles de la web.

## 9. Auditoría y aislamiento

`AuditEvent` registra actor, capacidad utilizada, acción, objeto, resultado, fecha y contexto mínimo. Se auditan lecturas sensibles, cambios, descargas, validaciones, ajustes y denegaciones relevantes. No se guardan textos clínicos, contraseñas, tokens ni archivos en registros de depuración. Los eventos deben protegerse frente a modificación ordinaria y su consulta también requiere permiso.

La documentación, pruebas y demostraciones usan datos sintéticos. Producción, pruebas y otros proyectos no comparten credenciales ni bases. Se proponen copias cifradas externas y un ensayo de restauración de base, archivos y material criptográfico necesario. Las claves requieren custodia separada y recuperación documentada; perderlas puede impedir recuperar datos aunque exista una copia.

La política final deberá precisar conservación, eliminación, bloqueo, exportación y recuperación por clase de información. El resultado esperado es poder explicar y demostrar quién puede hacer qué, sobre qué caso, durante cuánto tiempo y con qué responsabilidad.
