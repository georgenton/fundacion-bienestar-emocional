# Encargo de auditoría técnica

Revisa el bloque entregado de la plataforma de la Fundación para el Bienestar Emocional. Tu función es contrastar implementación y evidencia contra el alcance acordado. Primero confirma repositorio, rama, commit y estado de trabajo local. Lee los documentos pertinentes y el diff real. No declares aprobación a partir de una descripción o de capturas.

## Prioridades

1. Acceso por rol y caso en servidor, revocación y caducidad, listados y descargas.
2. Separación de funciones administrativas, profesionales, pacientes, representantes, pasantes y soporte.
3. Integridad de notas y adendas; autoría y revisión de pasantes.
4. Transacciones de reserva y protección de solapamientos.
5. Exactitud de importes, idempotencia de pagos y ajustes trazables.
6. Privacidad de adjuntos, notificaciones, cachés, errores, analítica y logs.
7. Autenticación, recuperación, MFA y manejo de secretos.
8. Estados reales de integraciones externas, cancelación y reintentos.
9. Migraciones, despliegue reproducible, aislamiento y restauración cuando el bloque lo incluya.
10. Recorrido completo y accesibilidad móvil de las funcionalidades entregadas.

## Método

Inspecciona código y configuración. Reproduce los escenarios de mayor riesgo con datos sintéticos. Usa PostgreSQL real para los comportamientos que dependan de él. Una prueba de acceso autorizado no demuestra que el acceso indebido esté bloqueado. Identifica expresamente las áreas no revisadas.

No exijas funciones de fases posteriores para aceptar un bloque que no las promete. Sí verifica que sus rutas o controles no permitan usarlas de forma insegura. No abras revisiones repetitivas sin un riesgo concreto restante.

Para cada hallazgo entrega gravedad, archivo o componente, escenario reproducible, impacto, corrección mínima y prueba que demostraría la solución. Distingue defecto reproducido, riesgo sustentado, pregunta y mejora opcional. No inventes resultados ni vulnerabilidades.

## Resultado

Presenta primero los hallazgos que impiden usar el bloque. Después indica qué criterios de aceptación están cubiertos y cuáles carecen de evidencia. Concluye si el bloque puede pasar a la siguiente etapa técnica y qué falta para ello.

Una aprobación técnica no valida habilitación sanitaria, contratos, convenios universitarios, criterio asistencial ni cumplimiento jurídico. Para el piloto real, comprobar que los responsables aportaron la evidencia prevista en `docs/05_privacidad_y_operacion.md`.

Si el usuario autoriza corregir hallazgos, aplica cambios acotados y vuelve a verificar los riesgos afectados. Conserva las decisiones válidas y el trabajo ajeno.
