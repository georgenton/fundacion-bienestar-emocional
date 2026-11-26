# Encargo: pagos, portal y videoconsultas sintéticos

Continúa la plataforma de la Fundación para el Bienestar Emocional en el repositorio público `https://github.com/georgenton/fundacion-bienestar-emocional`. Ejecuta FBE-013 a FBE-016 hasta dejar una entrega verificable en staging sintético. Implementa y comprueba el recorrido completo; no te detengas en una propuesta o una maqueta.

Jorge ya autorizó las conexiones disponibles a GitHub, navegador, OVH y Coolify, los cambios del proyecto, PR, CI, fusiones protegidas y despliegues sintéticos. Conserva esa autorización y los controles técnicos reales. El presupuesto adicional sigue siendo US$0. Usa únicamente los recursos existentes y datos ficticios. Los movimientos de dinero son simulaciones registradas, sin cobros, transferencias ni devoluciones reales.

## 1. Comprobar el punto de partida

Lee `AGENTS.md`, README, `docs/03_modelo_y_permisos.md`, `docs/04_backlog_y_aceptacion.md`, `docs/06_video_y_costos.md`, los ADR y `docs/15` a `docs/18`. Inspecciona el esquema, las políticas, la agenda, el portal, el worker, los workflows y el Compose de staging. Los documentos iniciales contienen propuestas: no conviertas sus ejemplos en políticas institucionales aprobadas.

Trabaja en el clon público y conserva aparte la copia privada original del Mac. Comprueba remoto, rama, HEAD, cambios pendientes, PR abiertas y CI del SHA exacto. La referencia de esta auditoría fue `main` en `030b92f37e14f46e06c2b13f346744bfcb603ee2` y la entrega operativa reportada fue `6cb25913069cc7c73270eba94e3602557f0c682e`; consulta el estado actual antes de actuar.

Revisa la corrección del bloque 3: retirada de la aceptación anterior después de publicar otra plantilla y separación entre conclusión de atención y documentación pendiente. Si ya está integrada, úsala. Si aún no está promovida, incluye su promoción en la siguiente entrega comprobada y verifica ambos recorridos por HTTPS. No afirmes que está desplegada por aparecer en `main`.

Mantén Next.js, NestJS y PostgreSQL, módulos dentro del monolito y las versiones fijadas salvo una incompatibilidad o vulnerabilidad concreta. Usa enlaces de video administrados y conciliación manual. No hace falta una pasarela, un ERP, otra cola externa, un servidor de video ni APIs de varios proveedores.

## 2. FBE-013: obligaciones, pagos y solidaridad

Reutiliza `ServiceTariff` y las condiciones copiadas en `Appointment`. Implementa obligación económica, pago declarado, verificación manual, aplicación de pagos, solidaridad y donación como conceptos separados y trazables.

- Usa USD y centavos enteros, moneda explícita y límites numéricos comprobados. Rechaza importes inválidos y aplicaciones entre monedas distintas. Documenta una sola regla exacta de redondeo.
- Conserva tarifa e importe acordados de cada obligación. Un precio nuevo no modifica una deuda anterior.
- La reprogramación actual crea otra cita enlazada por `previousId`. Mantén una identidad económica estable durante esa cadena: reprogramar no duplica la deuda, no pierde pagos ni cambia silenciosamente sus condiciones. Un ajuste posterior queda explícito.
- Distingue declarado, verificado y aplicado. Subir una evidencia o escribir una referencia no acredita por sí solo el pago.
- Permite pagos parciales y aplicaciones autorizadas a varias obligaciones. La suma no excede los fondos disponibles ni el saldo de destino. Comprueba simultaneidad en PostgreSQL, con transacciones y restricciones adecuadas.
- Reintentar una misma operación no crea otro ingreso ni otra aplicación. Una clave reutilizada con datos diferentes se rechaza.
- Registra beca, descuento o exoneración con importe, motivo administrativo acotado, actor y aprobación. Conserva el precio original.
- Mantén donaciones separadas de consultas; no conviertas automáticamente un excedente en donación ni una donación en pago de otra persona.
- Corrige mediante movimientos trazables. No borres operaciones confirmadas para cuadrar saldos.

Usa ejemplos ficticios, como una obligación de USD40 con pagos de USD25 y USD15 y otra con solidaridad. No los presentes como tarifas de David. Los estados económicos no modifican por sí solos asistencia, notas o atención ni crean una política automática de denegación de atención.

Añade capacidades financieras explícitas y su vía de concesión. Recepción puede registrar o consultar lo operativo según el alcance definido; verificar y aprobar exigen su capacidad específica. Coordinación clínica, soporte y administración no reciben narrativa o finanzas universales por el nombre de su rol. El profesional consulta su liquidación y la justificación mínima; el paciente, sus obligaciones y pagos autorizados. El pagador puede ser otra persona sin cuenta y no adquiere acceso clínico por pagar.

Para comprobantes, conserva el almacenamiento privado y una autorización financiera propia. La implementación actual solo admite `.txt` UTF-8 de hasta 16 KiB, con límites agregados de demostración. Usa comprobantes ficticios de texto y haz visible la limitación; no prometas carga de fotos o PDF. No concedas una asignación clínica para permitir verificar un comprobante. La evidencia financiera entra en la captura conjunta y en su verificación de hashes.

## 3. FBE-014: conciliación, devoluciones y liquidaciones

Entrega conciliación manual de referencias sintéticas, devoluciones y liquidaciones con estados claros de preparación, aprobación y ejecución manual de prueba. Identifica siempre esa ejecución como simulada; no requiere una conexión bancaria ni una pasarela.

Una devolución referencia el pago original y las aplicaciones afectadas. Lo elegible descuenta devoluciones anteriores y reservas de operaciones en trámite. Dos solicitudes concurrentes no pueden devolver los mismos fondos. Una devolución rechazada libera lo reservado mediante la transición correspondiente. Conserva consistencia entre dinero disponible, aplicaciones, deuda y devolución; no compenses borrando la historia.

La liquidación conserva sus movimientos, regla de cálculo, versión, porcentaje cuando corresponda y redondeo exacto. Evita incluir dos veces el mismo movimiento. Cambiar la regla no recalcula un cierre previo; una corrección posterior genera un ajuste enlazado. Distingue aprobación de confirmación manual de ejecución y comprueba las capacidades en cada transición.

Define una regla sintética sencilla de elegibilidad y documéntala. La atención, la asistencia, la documentación y el dinero tienen estados propios: `COMPLETED` no significa «todas las notas validadas». No inventes sanciones por inasistencia, comisiones institucionales, contratos ni políticas definitivas de devolución. Un comprobante interno se identifica como sintético y no se presenta como factura tributaria.

## 4. FBE-015: portal y recordatorios

Extiende el portal existente en español para mostrar citas, cambios de horario, información de acceso, obligaciones, pagos aplicados, saldo y documentos expresamente compartidos. Mantén fecha y hora en `America/Guayaquil`. No construyas otro portal paralelo ni un portal completo para terceros pagadores.

Comprueba permisos en cada consulta, descarga y acción. Un ID ajeno, referencia de pago o URL copiada no concede acceso. Conserva la retirada de acceso con sesión abierta y el cierre de sesión sin datos de la cuenta anterior en caché o almacenamiento ordinario.

Implementa recordatorios neutrales con preferencia o consentimiento de canal y transporte exclusivamente sintético: una bandeja privada de pruebas con acceso acotado. No reutilices la aplicación Graph, secretos ni buzón de los monitores para comunicaciones de pacientes. No envíes correos o mensajes reales a personas como parte de este bloque.

El worker actual demuestra autorización, pero no tiene una cola durable ni un despachador periódico desplegado. Añade el mecanismo mínimo con PostgreSQL y el patrón de ejecución existente. Si necesitas un proceso o timer, empaquétalo, instálalo y observa su ejecución real; un comando manual no prueba automatización. Evita introducir Redis o una plataforma adicional para este volumen.

Antes de entregar comprueba estado, versión, destinatario, horario y canal de la cita actual. Cancelar o reprogramar invalida el trabajo anterior. Los reintentos y dos ejecutores concurrentes no duplican la entrega sintética. Conserva trabajos tras un reinicio y registra programado, intentado y entregado por separado. No prometas retirar un mensaje que un transporte externo ya hubiera aceptado.

El texto no incluye diagnóstico, motivo de consulta, notas, terceros ni credenciales de reunión. Dirige al portal autenticado. La bandeja de ensayo debe permitir demostrar qué mensaje habría recibido el destinatario ficticio sin publicarlo en logs.

## 5. FBE-016: video mediante enlaces administrados

Entrega una integración pequeña que permita registrar y gestionar un enlace por cita, identificar proveedor y responsable, y mostrarlo a paciente y profesional autorizados. El modo inicial puede ser manual. El adaptador debe expresar sus capacidades reales; no simules una API que no está conectada.

Comprueba primero qué cuentas y plan institucionales están disponibles y autorizados, y contrasta sus condiciones con documentación oficial vigente. `docs/06` es una propuesta fechada, no acredita licencias actuales. No contrates planes ni asumas que una cuenta gratuita permite cualquier duración, número de participantes o concurrencia.

- Permite HTTPS y proveedores expresamente admitidos. No descargues desde el servidor URLs arbitrarias introducidas por usuarios.
- Mantén separados el enlace del participante y cualquier credencial o enlace privilegiado de anfitrión. Nunca entregues el enlace de anfitrión al paciente.
- Trata URLs completas y claves de acceso como información sensible, fuera de logs, Git y capturas públicas.
- Recomprueba identidad, participación, asignación y estado actual de la cita al entregar el acceso. Entrar no marca por sí solo asistencia, pago o atención concluida.
- Mantén desactivadas grabación, transcripción y resúmenes automáticos. En una cuenta real, verifica también el ajuste del proveedor y los controles de admisión.
- Al cancelar o reprogramar, distingue retirar el enlace del portal de invalidarlo en el proveedor. Si la actuación externa es manual, muestra la tarea pendiente, su responsable y la confirmación observada. No informes una revocación externa inexistente ni reutilices silenciosamente el acceso anterior.
- Define y ensaya un procedimiento sencillo ante pérdida de conexión, sin prometer atención permanente.

Separa pruebas de aplicación y pruebas del servicio externo. Los mocks comprueban permisos, estados y pantallas. Para cerrar la capacidad real del proveedor, el backlog exige dos consultas simultáneas de profesionales diferentes, una sesión que supere 60 minutos y acceso móvil. Un viewport móvil no demuestra cámara, micrófono o reconexión en un dispositivo. Si habrá pasante o supervisor, comprueba además ese escenario de participantes y autorizaciones.

Haz esas pruebas con cuentas disponibles y participantes autorizados, sin gasto adicional, y registra fecha, plan y resultado sin publicar datos de acceso. Si falta una cuenta, capacidad del plan o intervención real del titular, completa el resto del bloque y describe exactamente qué prueba queda pendiente. No marques FBE-016 verificado de extremo a extremo ni habilites autorreserva online como lista para uso basándote solo en mocks o un enlace válido.

## 6. Pruebas y recuperación proporcionales

Prueba riesgos de negocio con PostgreSQL real: centavos, parcialidades, solidaridad, donaciones, reintentos, doble aplicación, devoluciones concurrentes y liquidaciones cerradas. Incluye reprogramación con pago existente, tarifa posterior sin cambio histórico y permisos de finanzas, paciente, profesional y pagador. Verifica que listados, errores y exportaciones financieros no revelan narrativa clínica.

Conserva la regresión de los bloques 2 y 3 y añade un recorrido de navegador: recepción crea una cita, el paciente consulta saldo y evidencia, finanzas verifica y aplica un pago parcial, el profesional consulta su liquidación y el paciente accede al enlace autorizado. Añade cancelación/reprogramación con recordatorio obsoleto y denegación de acceso ajeno. No persigas un número arbitrario de pruebas.

Comprueba migraciones desde cero y actualización desde el esquema realmente desplegado, runtime sin DDL y permisos de las tablas nuevas. Ensaya rollback de aplicación sobre esquema ampliado compatible.

Restaura en aislamiento una copia descargada de R2 que contenga movimientos financieros, comprobante, trabajos de recordatorio y referencia de video, junto con el expediente sintético. Comprueba saldos, relaciones, autorías, hashes y acceso negativo. Mantén el despachador detenido y las integraciones externas anuladas durante la restauración. Una lectura con hash correcto no sustituye restaurar y abrir los datos.

Conserva R2, cifrado, custodia separada, límites y retención existentes. No uses el prefijo de backups como almacenamiento operativo. Si el nuevo conjunto no cabe, mide y justifica el ajuste mínimo dentro del presupuesto; no elimines los límites ni prometas gratuidad permanente.

## 7. Publicar y cerrar

Entrega mediante PR, controles obligatorios y revisión de archivos/logs. Mantén protecciones y construye imágenes en GitHub Actions. Promueve solo digests de una ejecución aprobada con manifiesto válido; incluye el empaquetado del despachador si se añadió. No mezcles código nuevo con imágenes antiguas sin una compatibilidad comprobada.

Antes de promover, comprueba capacidad y respaldo reciente. Después, verifica migraciones, permisos efectivos, digests, HTTPS y un recorrido sintético breve de pago, portal y acceso. Mantén seed automático deshabilitado, respaldo, monitores y alertas. La revisión de cuota compartida y su presupuesto temporal siguen el procedimiento vigente; no abras otra ronda general de infraestructura.

Actualiza README, backlog, ADR mínimo y evidencia. El informe final identifica commit, PR, CI, manifiesto, versión realmente desplegada, pruebas y sus entornos, recuperación, despacho periódico observado y verificación real o pendiente del proveedor. Separa implementado, probado en aislamiento, ejecutado en CI y observado en staging.

Deja para David y la institución las tarifas, becas, condiciones de devolución, reglas de liquidación, textos y responsabilidades definitivas. Esta entrega sigue siendo sintética y no abre el piloto real. Si un control de acceso impide una operación, explica el bloqueo técnico y el mínimo paso concreto necesario sin repetir autorizaciones generales ni solicitar secretos por chat.
