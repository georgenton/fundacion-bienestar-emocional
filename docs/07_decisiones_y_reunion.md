# Decisiones pendientes y reunión con David

## Propósito de la reunión

Convertir este diseño en un alcance que represente el trabajo real de la fundación. La reunión puede utilizar ejemplos ficticios de una consulta normal, una becada, una cancelada y una supervisada. No hace falta entregar expedientes reales para definir el sistema.

## Las preguntas prioritarias

1. ¿Cuántos profesionales trabajan actualmente y cuántas consultas podrían coincidir? ¿Cuántas sesiones se realizan por mes y cuánto duran?
2. ¿Qué servicios y tipos de paciente entrarán en el primer piloto? Confirmar si puede comenzar con adultos individuales o si pareja/menores son indispensables desde el primer uso.
3. ¿Cómo se agenda hoy y quién confirma, reprograma y atiende ausencias? ¿La consulta incluye tiempo para registrar notas?
4. ¿Qué tarifa se cobra y cómo funcionan abonos, becas, exoneraciones, devoluciones y pagos a profesionales? ¿Qué entidad emite el comprobante tributario?
5. ¿Qué cuentas de Meet, Workspace, Zoom u otro proveedor tiene ya la fundación? ¿De quién son y quién administra las licencias?
6. ¿Qué convenios de prácticas existen, qué universidades participan y qué tareas están permitidas por nivel? ¿Quién supervisa y qué informes pide cada universidad?
7. ¿Qué formatos de historia, consentimiento y evolución se usan? Solicitar plantillas vacías y confirmar los requisitos por disciplina.
8. ¿Cuál es la situación jurídica y habilitación sanitaria de la fundación para las prestaciones remotas? ¿Quién puede revisar protección de datos, retención y contratos?
9. ¿Qué presupuesto mensual puede sostener la operación y quién asume mantenimiento, incidentes y atención al usuario? El desarrollo inicial y la operación recurrente son partidas diferentes.
10. ¿Qué servidor se utilizará para el despliegue? Confirmar proveedor, región, plan, capacidad real, aislamiento y responsables sin compartir claves por chat.

## Registro inicial de decisiones propuestas

| ID | Propuesta | Motivo | Qué falta para adoptarla |
|---|---|---|---|
| DEC-01 | Una fundación y un repositorio propio | Reduce acoplamiento y complejidad de operación | Confirmar si existen sedes o entidades adicionales. |
| DEC-02 | Next.js, NestJS y PostgreSQL | Aprovecha conocimientos documentados de Jorge | Seleccionar versiones compatibles al iniciar. |
| DEC-03 | OVH con Coolify | Destino indicado por Jorge | Medir capacidad y decidir host compartido o dedicado. |
| DEC-04 | Enlaces de video institucionales primero | Reduce trabajo y costo inicial | Verificar cuentas, contratos, duración y concurrencia. |
| DEC-05 | Piloto con adultos individuales | Permite comprobar el recorrido completo | David confirma prioridad; adaptar si pareja/menores son indispensables. |
| DEC-06 | Pagos manuales conciliados y factura externa vinculada | Cubre operación antes de integrar pasarela/SRI | Contador valida proceso y entidad emisora. |
| DEC-07 | Prácticas con supervisor, períodos y revisión | Evita acceso general e informes con datos innecesarios | Convenios, competencias y autorizaciones. |
| DEC-08 | Grabación e IA clínica desactivadas al inicio | Reduce complejidad y tratamiento adicional | Cualquier incorporación futura requiere evaluación específica. |
| DEC-09 | Evaluación de impacto y gobierno de datos antes del piloto real | El sistema gestiona información clínica | Definir responsables, DPD según encuadre y contratos. |
| DEC-10 | Respaldo externo con restauración probada | Hace recuperable el servicio | Acordar pérdida tolerable, tiempo de recuperación y costo. |

Cada decisión se registra con fecha, responsable, estado propuesto/aceptado/rechazado y evidencia. Cambiar una decisión no reescribe su historia: se documenta cuál la reemplaza y por qué.

## Material que conviene reunir

- Lista de servicios y profesionales vigentes con datos administrativos necesarios.
- Plantillas vacías de historia, consentimiento, nota de evolución, constancia y evaluación de pasantes.
- Tarifario, política de cancelación y reglas de liquidación.
- Convenios de prácticas y requisitos de informes, sin adjuntar datos de pacientes.
- Inventario de cuentas institucionales y proveedores; los secretos se guardan en un gestor apropiado.
- Información legal, sanitaria y tributaria que pueda revisar el profesional responsable.

## Acuerdo de colaboración

Además del producto, concretar propiedad o licencia del código, custodia de datos, quién paga los servicios, tiempo de mantenimiento que Jorge puede ofrecer, soporte, continuidad si cambia el operador y forma de terminar la colaboración. El acceso a una copia exportable y la recuperación deben quedar bajo control institucional.

Para estimar calendario, medir el primer bloque real de desarrollo y revisar alcance con esa evidencia. Este expediente no promete una fecha de producción ni un precio cerrado.
