# Videoconsultas y costos operativos

**Proyecto:** Fundación para el Bienestar Emocional
**Estado:** propuesta de diseño; no constituye una integración implementada ni una contratación.
**Fuentes y tarifas consultadas:** 23 de noviembre de 2026.

## 1. Decisión propuesta

Iniciar las videoconsultas con **un enlace institucional único por cita**, visible desde la plataforma y gestionado por el profesional responsable. La primera opción es Google Meet; Zoom también resulta adecuado si la fundación ya dispone de las licencias necesarias para la duración y las consultas simultáneas. La agenda, los consentimientos, la historia clínica y los pagos permanecen en la plataforma de la fundación.

En el piloto se puede registrar el enlace manualmente. La siguiente iteración automatizaría su creación mediante una API, conservando una alternativa manual ante fallos. Esto reduce el trabajo inicial y permite probar el proceso completo con David y los profesionales.

Si posteriormente se necesita que el video aparezca dentro de la propia plataforma, evaluar **Daily Prebuilt**. Jitsi autoalojado queda como alternativa posterior, en infraestructura separada y con una persona responsable de su operación. El alojamiento actual en OVH no convierte el video autoalojado en un servicio sin costo.

## 2. Opciones y límites que afectan al servicio

### Google Meet

Según la documentación oficial, las reuniones gratuitas entre dos personas pueden durar hasta 24 horas; con tres o más participantes, el límite es 60 minutos [1]. Una sesión individual de una hora cabe en el primer caso. Al entrar un pasante, supervisor, familiar o segundo paciente, cambian las condiciones. Para estas sesiones debe verificarse una edición que permita el tiempo previsto más un margen operativo.

Google publica una oferta de Workspace for Nonprofits de USD 0 por usuario y mes [2]. Ecuador figura entre los países con requisitos específicos, pero **la elegibilidad de esta fundación no está confirmada**. Google excluye organizaciones sanitarias y contempla excepciones para brazos benéficos o fundaciones asociadas; el nombre de la entidad por sí solo no determina su admisión [3]. No basar el presupuesto definitivo en obtener ese beneficio.

La API de Calendar permite solicitar un enlace de Meet al crear o modificar un evento; la generación puede quedar pendiente y completarse de forma asíncrona [4]. Meet REST permite gestionar espacios y sus controles. Esto automatiza reuniones, pero no proporciona una interfaz de videollamada incrustada en nuestra web. El SDK Add-ons incorpora nuestra aplicación dentro de Meet. La antigua Meet Media API está retirada del programa de nuevas altas y tiene cierre anunciado para el 15 de enero de 2027; REST y Add-ons continúan soportados [5].

Proponer cuentas institucionales individuales y calendarios por profesional. Verificar el ingreso de pacientes externos con las políticas reales de la organización: no prometer que todos podrán entrar sin cuenta de Google desde cualquier dispositivo.

### Zoom

Zoom Basic limita prácticamente todas las reuniones con participantes a 40 minutos, incluidas las individuales. Las licencias pagadas admiten reuniones de hasta 30 horas [6]. La API no elimina esas condiciones.

Un usuario Basic o licenciado en una cuenta Pro puede organizar una reunión simultánea. Los usuarios licenciados Business, Education y Enterprise pueden organizar hasta dos, sujetos a las condiciones documentadas [7]. El dimensionamiento debe considerar profesionales y consultas concurrentes; una única licencia no cubre automáticamente toda la operación.

Conviene distinguir tres productos: Meetings API programa y administra reuniones; Meeting SDK incorpora la experiencia de una reunión Zoom en una aplicación; Video SDK crea sesiones audiovisuales propias, con contratación diferente [8]. No se incluye una tarifa de Zoom en este presupuesto: debe obtenerse del plan vigente para la cuenta de la fundación. No utilizar precios históricos de Video SDK encontrados en artículos antiguos.

### Daily

Daily Prebuilt ofrece un componente de videollamada incorporable a una web. Su precio publicado utiliza minutos de participante: una consulta de 60 minutos entre paciente y profesional consume 120. La página anuncia 10.000 minutos gratuitos mensuales y USD 0,004 por minuto adicional en el siguiente tramo [9]. La bolsa mensual corresponde al uso de la cuenta, no a cada terapeuta.

### Jitsi en OVH

Jitsi requiere capacidad de red, recursos para medios, TLS, autenticación, actualizaciones y conectividad TURN para determinadas redes. Su documentación recomienda evitar cargas adicionales en el servidor de video [10][11]. Proponemos un servidor separado de la aplicación y su base clínica, pruebas de concurrencia desde Ecuador y un procedimiento de recuperación. No prometer capacidad por el número de CPU sin medir el comportamiento real.

## 3. Presupuesto ilustrativo de video integrado

Los siguientes son cálculos propios sobre la tarifa básica publicada de Daily [9], suponiendo sesiones completas de 60 minutos, participantes constantes y ninguna grabación ni servicio adicional:

| Sesiones al mes | Participantes por sesión | Minutos de participante | Video básico estimado |
|---:|---:|---:|---:|
| 50 | 2 | 6.000 | USD 0 |
| 100 | 2 | 12.000 | USD 8 |
| 200 | 2 | 24.000 | USD 56 |
| 200 | 3 | 36.000 | USD 104 |

Para estos escenarios: `costo = max(0, minutos_de_participante - 10.000) × 0,004`. Esperas, pruebas y participantes adicionales modifican el consumo. Estas cifras excluyen impuestos, soporte especial, almacenamiento, grabación y otros complementos. USD 0 de video no significa que la plataforma o la atención no tengan costo.

La misma página publica un complemento Healthcare, con HIPAA y BAA, de USD 500 mensuales. No corresponde incorporarlo automáticamente por atender en Ecuador; tampoco debe concluirse que el plan básico satisface por sí mismo las obligaciones locales. Antes de contratar se revisarán condiciones, encargados, subencargados, regiones y transferencias de datos aplicables.

Daily informa que superar la bolsa gratuita no detiene automáticamente las llamadas. Proponer avisos de consumo y revisión del presupuesto, con límites para abrir nuevas sesiones cuando proceda. **No interrumpir una consulta en curso por alcanzar un umbral de gasto.**

## 4. Costo total de operación

Separar el dinero adicional necesario para este proyecto del costo total que la fundación debería reconocer:

`Costo mensual incremental = ampliaciones OVH + servicios nuevos + consumo variable adicional + operación adicional`.

`Costo mensual total asignado = infraestructura atribuible + servicios externos + mantenimiento + soporte + seguridad y cumplimiento + comisiones`.

| Partida | Cómo presupuestarla |
|---|---|
| OVH | Usar el contrato real, capacidad libre verificada y ampliaciones necesarias. Asignar una proporción del servidor compartido aunque ya esté pagado. |
| Copias de seguridad | Almacenamiento externo, retención, transferencias y tiempo de probar restauraciones. |
| Correo transaccional | Confirmaciones, recuperación de acceso y recordatorios; comprobar límites y entregabilidad. |
| Videollamadas | Licencias por anfitrión o consumo por participante, incluyendo picos simultáneos. |
| Soporte y mantenimiento | Horas de atención, actualizaciones, incidentes y revisión de proveedores. |
| Protección de datos | Preparación y revisión de contratos, procedimientos y medidas aplicables al servicio. |
| Pasarela de pagos | Comisión real por transacción, cargos fijos, devoluciones y conciliación. |
| Dominio y monitoreo | Renovaciones, disponibilidad y alertas operativas. |

El desarrollo inicial, capacitación y migración son partidas separadas. Tampoco mezclar honorarios clínicos con infraestructura. No se asignan cotizaciones inventadas: los valores se completarán con contratos y ofertas concretas.

## 5. Contrato de integración propuesto

Definir una interfaz conceptual `VideoProvider`, sin implementar proveedores todavía:

- `createSession`: solicita una reunión asociada a una cita y a un anfitrión.
- `getSessionStatus`: informa creación pendiente, disponible, fallo o cierre cuando el proveedor lo permite.
- `prepareJoin`: valida usuario, cita, horario y rol antes de entregar acceso.
- `updateSession`: aplica los cambios admitidos y registra limitaciones.
- `cancelSession`: ejecuta la cancelación disponible y devuelve qué efecto se confirmó.
- `capabilities`: declara si admite caducidad, revocación, sala de espera, eventos y controles específicos.

Guardar identificadores externos, anfitrión, estado y errores operativos mínimos. Cifrar tokens de integración y proteger enlaces de anfitrión. Procesar reintentos de creación de forma idempotente para evitar varias reuniones para la misma cita.

**Cancelar la cita localmente no equivale a invalidar el enlace externo.** Dejar de mostrarlo en el portal tampoco revoca una copia ya enviada. Cada adaptador deberá documentar si puede cerrar la reunión, revocar acceso o únicamente cambiar la agenda. Las limitaciones deben quedar visibles para el profesional.

## 6. Controles y prueba del piloto

Usar enlaces únicos, acceso autenticado desde la cita, espera o admisión cuando estén disponibles y permisos mínimos. Las invitaciones tendrán información discreta, sin diagnósticos ni motivos de consulta. Mantener grabaciones, transcripciones y resúmenes automáticos desactivados inicialmente, revisando también la configuración del proveedor.

Probar con datos ficticios: Chrome, Safari, Android e iPhone; paciente externo con y sin cuenta; permisos de cámara y micrófono; red móvil; reconexión; sesión de más de 60 minutos; tercera persona; citas simultáneas; cancelación y enlace antiguo; fallo de creación y alternativa manual. Verificar resultados con las cuentas institucionales reales antes del piloto clínico.

Definir cómo reconectar y cómo continuar por una alternativa acordada si falla el video. Registrar duración e incidencias necesarias, sin contenido clínico en logs técnicos. La decisión final debe resultar de estas pruebas, el costo observado y las condiciones contractuales.

## Fuentes oficiales

1. [Google Meet: requisitos y límites](https://support.google.com/meet/answer/7317473?hl=en).
2. [Google Workspace for Nonprofits: oferta](https://www.google.com/nonprofits/offerings/workspace/).
3. [Google for Nonprofits: elegibilidad en Ecuador](https://support.google.com/nonprofits/answer/3215869?co=GENIE.CountryCode%3DEC&hl=en).
4. [Google Calendar API: creación de eventos y conferencias](https://developers.google.com/workspace/calendar/api/guides/create-events).
5. [Google Meet: APIs y SDK vigentes](https://developers.google.com/workspace/meet).
6. [Zoom: límites de duración](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067966).
7. [Zoom: reuniones simultáneas](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068522).
8. [Zoom: comparación de Video SDK y Meeting SDK](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064689).
9. [Daily: tarifas y condiciones publicadas](https://www.daily.co/pricing/video-sdk/).
10. [Jitsi: requisitos de infraestructura](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-requirements/).
11. [Jitsi: instalación, conectividad y controles de acceso](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart/).
