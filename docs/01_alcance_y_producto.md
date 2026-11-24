# Alcance y producto

## Propuesta principal

Construir una plataforma integral para la Fundación para el Bienestar Emocional que cubra el recorrido desde la solicitud de atención hasta el cierre de la consulta, el registro clínico, el cobro y el seguimiento. La experiencia debe funcionar bien desde un teléfono y permitir asistencia de recepción a personas que no tengan correo ni facilidad para registrarse.

El desarrollo se organiza por recorridos completos. Un piloto de atención individual de adultos permite validar las operaciones principales; la estructura debe admitir luego pareja, familia, menores y otras disciplinas sin reducir todos sus casos a un mismo formulario.

## Lo que aporta la revisión de la fundación

El sitio público presenta psicología clínica, terapia individual, de pareja y familiar, atención infantil, terapia sexual, psicopedagogía, lenguaje, nutrición, orientación vocacional y coaching; también menciona talleres y cursos. Expone una finalidad de acceso económico y canales de aportes solidarios. Medicina general aparece en el pie de página y requiere confirmación antes de incorporarla al catálogo operativo. La nómina y vigencia de los servicios se confirmarán con David. [F1]

Estos hallazgos sugieren un catálogo configurable, formularios por disciplina, casos con varios participantes y un componente de apoyo económico. La lista pública no acredita por sí misma habilitaciones, disponibilidad actual ni procesos internos.

La propuesta tecnológica contempla TypeScript, Next.js, NestJS y PostgreSQL, con OVH/Coolify como destino de despliegue previsto. El expediente clínico se mantiene en un proyecto independiente, con límites explícitos frente a cualquier integración externa.

## Módulos del producto completo

### 1 Catálogo y solicitudes de atención

Servicios, modalidades presencial y remota, profesionales habilitados, duración, tarifa, disponibilidad y requisitos. Las especialidades clínicas y servicios de orientación o coaching deben identificarse correctamente y tener alcances distintos. La web actual puede conservarse como entrada institucional y enlazar a la aplicación en un subdominio por definir.

Las solicitudes deben pedir únicamente datos de contacto y lo necesario para orientar la atención. Una solicitud no equivale a una admisión clínica. Recepción asigna al profesional adecuado; las situaciones que necesitan valoración clínica se remiten al responsable definido por la fundación.

### 2 Pacientes y casos de atención

Registro con identificación interna, datos de contacto, preferencias de comunicación, contactos autorizados y profesional responsable. La identidad puede existir sin una cuenta de portal. Evitar duplicados y permitir una vinculación posterior de cuenta verificada.

Un paciente puede tener distintos procesos de atención. Un caso reúne objetivo asistencial, modalidad, profesionales, participantes, sesiones y documentos pertinentes. Las relaciones familiares y de representación no conceden por sí solas acceso a toda la información de otras personas.

### 3 Agenda y disponibilidad

Calendario diario y semanal por profesional, horarios, excepciones, ausencias, feriados, duración variable, margen para registrar notas y recursos físicos cuando corresponda. Estados de solicitud, reserva temporal, confirmación, cancelación, reprogramación, ausencia y atención realizada.

La reserva debe impedir choques incluso si dos usuarios actúan al mismo tiempo. Guardar los instantes de forma coherente y presentar la zona `America/Guayaquil`; los participantes fuera del país deben ver además su hora local y pasar por la revisión de alcance de atención internacional.

En el primer piloto recepción puede confirmar las solicitudes. La reserva autónoma se habilita por servicio una vez probadas las reglas de elegibilidad, duración, pago y cancelación.

### 4 Expediente clínico

Historia inicial y notas de evolución por atención: motivo, antecedentes pertinentes, evaluación realizada por el profesional, objetivos, intervenciones, plan, acuerdos, derivaciones y cierre. Diagnósticos y formularios se incorporan cuando correspondan al servicio y al profesional autorizado; el sistema no obliga a diagnosticar para permitir guardar una consulta.

Las plantillas deben poder versionarse por disciplina. Los instrumentos psicométricos requieren comprobar licencia, condiciones de uso, población y validación; un puntaje automatizado no se presenta como diagnóstico.

Las notas distinguen borrador, revisión y validación. Se conserva quién escribió, revisó y validó. Las rectificaciones posteriores se realizan mediante adendas trazables. Adjuntos, exportaciones y solicitudes de copia tienen autorización, custodia y registro de acceso. La política de conservación se valida específicamente; desactivar una cuenta no borra el expediente.

### 5 Teleconsulta

Cada cita puede asociar proveedor, reunión, anfitrión, horario y enlace o token de acceso. El paciente entra desde un botón claro y dispone de instrucciones para audio, cámara, privacidad y reconexión. La admisión depende de controles del proveedor y del anfitrión, no solo de ocultar el enlace en la web.

El profesional registra que la atención se realizó y sus incidencias; la mera conexión al video no sustituye ese registro. La plataforma no activa grabaciones, transcripciones ni resúmenes por IA en el piloto. Se define un canal de contingencia y cómo verificar identidad y ubicación de atención cuando sea necesario.

### 6 Portal del paciente

Citas, solicitudes de cambio, autorizaciones, documentos destinados al paciente, pagos, comprobantes y actividades que el profesional comparta. Navegación accesible, buen contraste, teclado, estados claros y funcionamiento móvil.

El portal debe ofrecer un procedimiento para ejercer derechos sobre la información y solicitar copia del expediente. La selección de documentos de consulta directa no elimina esos derechos; deben protegerse también los datos de terceros y las reglas específicas de menores.

No crear desde el inicio un chat que prometa disponibilidad permanente. Si se habilita mensajería, mostrar el horario y plazo de respuesta, el destinatario y las vías para situaciones urgentes.

### 7 Profesionales y equipos

Perfil, especialidad, credenciales revisadas, servicios autorizados, agenda, modalidad contractual, estado activo y responsable de revisión. Asignaciones a casos y derivaciones documentadas.

El panel del profesional muestra próximas consultas, pendientes clínicos, tareas de supervisión y su liquidación. La salida de un profesional revoca accesos y permite transferir casos de manera controlada sin borrar su autoría histórica.

### 8 Prácticas y supervisión

Ficha de pasante con universidad, carrera, nivel, convenio aplicable, fechas, horas requeridas, supervisor y actividades permitidas. Bitácora, evidencia académica mínima, revisión de horas, evaluación y constancias por período.

La participación clínica exige asignación temporal, alcance de tareas, supervisor y autorización apropiada de participación docente. Los borradores se revisan y la validación profesional queda identificada. No se concede capacidad autónoma de atención por asignar el rol de pasante.

El informe universitario contiene actividad y horas; una referencia clínica, cuando sea necesaria, usa un código y datos minimizados. La seudonimización no equivale a anonimato. La institución universitaria no recibe acceso a historias completas por defecto.

### 9 Pagos y comprobantes

Tarifas por servicio, acuerdos sociales, pagador, importe previsto, abonos, conciliación, saldo, devoluciones y comprobantes. Una fotografía de transferencia queda pendiente de verificación. Cada ingreso registra referencia, medio, fecha y responsable de validación.

Separar la cita de la prestación y del cobro: una sesión gratuita puede estar realizada; una sesión pagada puede cancelarse; una ausencia puede tener una política particular. Las reglas de descuentos, exoneración y devoluciones se acuerdan con David.

El recibo interno acredita el registro de un movimiento, pero no se etiqueta automáticamente como factura autorizada por el SRI. Desde el inicio debe existir el proceso tributario correspondiente, aunque la emisión se efectúe con una herramienta externa y se vincule el comprobante. La integración electrónica puede añadirse posteriormente. [F2]

### 10 Administración y liquidaciones

Ingresos conciliados, cuentas pendientes, gastos operativos básicos, cierres y exportación contable. Reglas de pago a cada profesional con vigencia, base de cálculo y ajustes por devoluciones. Puede haber porcentaje, monto fijo o modalidades distintas; no se presume una relación laboral concreta.

Una liquidación conserva el cálculo y su aprobación. Cambiar una tarifa o acuerdo futuro no modifica sesiones ya liquidadas. Este módulo no necesita convertirse en un ERP contable completo para resolver el control de consultas.

### 11 Acceso solidario y programas

Tarifa regular, tarifa social, beca, copago y exoneración con autorización y trazabilidad. Cuando exista presupuesto para becas, registrar asignación, consumo y saldo. Mantener la información socioeconómica restringida a quienes realmente la necesiten.

Las donaciones se contabilizan separadas de los cobros por servicio. Los informes a donantes presentan resultados agregados; no muestran nombres, diagnósticos ni historias. Talleres y programas grupales pueden añadirse con inscripciones, cupos, asistencia y cobros cuando haya demanda comprobada.

### 12 Comunicaciones y documentos

Confirmación, recordatorio, cancelación, recuperación de cuenta y avisos operativos. El correo transaccional es la primera automatización propuesta. WhatsApp manual institucional puede mantenerse; su automatización exige revisar proveedor, consentimiento de canal, plantillas, costos y manejo de errores.

Los mensajes usan contenido discreto, sin diagnóstico ni motivo clínico. Recordatorios y tareas quedan anulados o reemplazados al cambiar una cita. Un fallo de envío genera un pendiente operativo, no una falsa confirmación de recepción.

### 13 Dirección y calidad

Panel con consultas realizadas, ausencias, ocupación de agenda, tiempo hasta primera atención, ingresos conciliados, saldos, becas utilizadas y carga de supervisión. Cada indicador debe tener una definición y denominador claros.

Los resultados clínicos, si se miden, se interpretan con instrumentos adecuados y revisión profesional. Evitar clasificaciones de terapeutas por promedios brutos o promesas de mejoría basadas solamente en actividad de la plataforma. Las encuestas de experiencia y los incidentes tienen responsables de revisión.

### 14 Seguridad y continuidad

Identidad individual, autenticación reforzada del personal, permisos por caso, bitácora de lecturas y cambios, archivos privados, controles de sesión, copias externas y restauración. La dirección administrativa recibe información operativa; el contenido clínico requiere funciones y asignaciones específicas.

Las pantallas privadas no incorporan píxeles publicitarios, grabación de sesiones ni analítica que capture formularios clínicos. No se usan historias reales para desarrollar, probar o pedir ayuda a asistentes de programación.

## Piloto propuesto

La primera salida cubre atención individual de adultos: registro asistido, profesionales, agenda, consentimiento, expediente, enlace de video, registro y conciliación de pagos, comprobante vinculado, portal básico, notificaciones y controles de acceso. Incluye ficha de pasantes, supervisor y horas; la participación clínica solo se habilita cuando sus condiciones institucionales y técnicas estén resueltas.

Pareja, familia, menores y otras disciplinas siguen disponibles por el procedimiento institucional que la fundación ya tenga. La aplicación puede mostrar información y un contacto, pero no debe aceptar reservas automáticas ni registrar esos casos como si fueran atención individual de adultos mientras falte su flujo.

El producto completo incorpora luego sus consentimientos, representación, participantes, plantillas y pruebas de acceso. Así se conserva el objetivo de una plataforma amplia con una primera puesta en marcha manejable.

## Recorrido que debe probarse de principio a fin

Una persona solicita atención; recepción registra o vincula su identidad; se confirma un profesional y un horario; se documentan las autorizaciones; se registra un pago, beca o acuerdo; el paciente accede al video; el profesional documenta la atención; un supervisor revisa si corresponde; se envía el material permitido y se acuerda el seguimiento. La administración concilia el ingreso y la liquidación sin leer la narración clínica.

También deben resolverse una cancelación, un pago parcial, una ausencia, una caída de video, una baja de profesional, una práctica vencida y una solicitud de copia de datos.

## Fuentes y antecedentes

- [F1 Sitio de la Fundación para el Bienestar Emocional](https://fundacionbienestaremocional.org/). Consultado el 23 de noviembre de 2026.
- [F2 SRI sobre facturación electrónica](https://www.sri.gob.ec/facturacion-electronica). Consultado el 23 de noviembre de 2026.
