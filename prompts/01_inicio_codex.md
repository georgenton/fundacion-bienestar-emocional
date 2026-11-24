# Primer encargo para Codex

Actúa como ingeniero de software responsable de la primera base verificable de la plataforma de la Fundación para el Bienestar Emocional. Jorge Quizamanchuro coordina el proyecto y David Jaramillo validará los procesos institucionales.

Lee `AGENTS.md`, `README.md`, `docs/01_alcance_y_producto.md`, `docs/02_arquitectura.md`, `docs/03_modelo_y_permisos.md` y el bloque inicial de `docs/04_backlog_y_aceptacion.md`. Distingue propuestas de decisiones adoptadas. Revisa si ya existe repositorio o código antes de crearlo o modificarlo. Conserva cualquier trabajo existente.

## Objetivo de esta entrega

Construir localmente el primer bloque del backlog: base de proyecto, contrato de configuración, conexión y migraciones PostgreSQL, identidad, autorización inicial y una demostración ficticia de separación de acceso. Completa ese bloque con sus pruebas y documentación. Los módulos posteriores permanecen en el backlog.

La arquitectura propuesta es Next.js, NestJS, PostgreSQL, TypeScript y pnpm. Verifica versiones soportadas y compatibles en documentación oficial antes de fijarlas. Si una restricción real exige cambiar una pieza, explica evidencia, alternativa y efecto; evita un rediseño completo por preferencia personal.

## Trabajo esperado

1. Inspeccionar el directorio y presentar una síntesis breve de lo encontrado; continuar con las acciones locales necesarias.
2. Crear o completar la estructura mínima del workspace, scripts reproducibles, `.env.example` sin secretos, contenedores de desarrollo y CI básico.
3. Implementar los modelos y migraciones iniciales de personas, cuentas, roles y asignaciones que requiere el bloque, junto con una estructura mínima de casos y participantes y fixtures sintéticos para probar autorización. El registro funcional y las pantallas de apertura de casos pertenecen a FBE-005. Evitar datos reales.
4. Elegir una solución de autenticación mantenida con recuperación y MFA del personal, evaluando su integración. No inventar un protocolo de autenticación.
5. Crear una política de acceso central, aplicada por el servidor, y un recorrido mínimo con recepción, profesional, paciente y soporte ficticios. Un administrador operativo no recibe permiso clínico universal.
6. Ejecutar las verificaciones del bloque: arranque limpio, migraciones en PostgreSQL, acceso permitido y denegado, revocación y ausencia de secretos/contenido sensible en logs.
7. Registrar decisiones concretas en un ADR, actualizar el backlog con evidencia y dejar instrucciones para reproducir el resultado.

## Límites del bloque

Usar exclusivamente información sintética. Los nombres y credenciales de prueba deben identificarse como tales y generarse de forma segura. No cargar expedientes ni documentos reales. No crear cuentas externas pagadas, emitir cobros, contactar personas ni desplegar producción como efecto de este encargo. No tocar recursos de otros proyectos.

Los dominios, formatos clínicos, encuadre sanitario y contratos se conservan pendientes de sus responsables. Si no impiden la base local, continuar sin interrumpir el trabajo. Si falta una decisión que sí cambia la implementación de este bloque, formular la pregunta concreta y explicar la consecuencia.

## Entrega para auditoría

Informar qué puede hacer ya el usuario, archivos relevantes, commit o revisión exacta si existe, comandos y resultados de pruebas, riesgos pendientes y siguiente bloque. Señalar expresamente lo que no se ejecutó. No declarar que la plataforma está lista para pacientes por haber creado el scaffold.
