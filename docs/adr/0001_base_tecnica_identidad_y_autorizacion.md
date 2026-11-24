# ADR-0001 — Base técnica, identidad y autorización

- Estado: adoptado para el bloque 1 local
- Fecha: 23 de noviembre de 2026
- Responsabilidad técnica: Jorge Quizamanchuro
- Validación institucional pendiente: David Jaramillo o su delegado

## Contexto

Los documentos 01–04 describían propuestas, no decisiones aprobadas. Este ADR adopta únicamente las piezas necesarias para FBE-001 a FBE-004. No aprueba procesos clínicos, consentimientos, retención, contratos, dominios, producción ni apertura a pacientes.

## Decisiones adoptadas

1. Un workspace pnpm con `apps/web`, `apps/api`, `apps/worker`, `packages/config`, `packages/database` y `packages/access-policy`. No se añade Nx ni un microservicio por módulo.
2. Node.js 24.22.3 LTS, pnpm 10.34.9, TypeScript 6.0.3, Next.js 16.4.6, React 19.3.1, NestJS 12.6.0, PostgreSQL 18.7 y Prisma 7.10.1 estable. Todas las versiones quedan exactas en manifiestos; el lockfile queda versionado y reproducible.
3. PostgreSQL 18.7 en lugar de 19.0: PostgreSQL 19 acababa de publicarse y la matriz estable de Prisma 7 comprobada llega hasta PostgreSQL 18. Prisma 8 estaba en release candidate y no se usa en esta base.
4. Better Auth 1.7.27 estable para contraseña, sesión opaca persistente, recuperación, TOTP y códigos de respaldo. Se monta con su adaptador oficial de Express antes del parser de Nest. No se implementan hashing, cookies, TOTP o recuperación propios.
5. El alta pública permanece desactivada. Una invitación sintética de un solo uso y con caducidad permite activar cuenta mediante una instancia interna no expuesta de Better Auth. En este bloque no se envían correos: los enlaces van a un outbox local ignorado por Git.
6. El personal queda con `mfaRequired=true`. Una sesión sin segundo factor no autoriza rutas de dominio. Los códigos de respaldo son de un solo uso. Recepción no tiene una ruta para desactivar MFA ajeno. Si también se pierden los códigos, el procedimiento humano de verificación y recuperación requiere aprobación institucional y no se sustituye con un bypass técnico.
   El límite de solicitudes de Better Auth se gobierna por el `APP_ENV` validado: activo en producción y desactivado en local/pruebas para que varias identidades sintéticas no compartan por accidente el mismo cupo del runner.
7. Autorización de servidor, denegación por defecto y política compartida por API y worker. Recepción usa capacidad administrativa; paciente usa identidad y participación; equipo asistencial usa asignación vigente y acciones explícitas. Soporte y administración operativa no reciben lectura clínica universal.
8. Los fixtures contienen personas y casos mínimos, pero no narraciones, diagnósticos, documentos ni aperturas funcionales. FBE-005 conserva la responsabilidad de registro y apertura de casos.
9. Auditoría append-only frente a operaciones ordinarias de la aplicación. Registra actor, acción, recurso, decisión y motivo; no cuerpos, contraseñas, tokens o contenido clínico. No se afirma inmutabilidad criptográfica ni inaccesibilidad absoluta para un operador de infraestructura.

## Compatibilidad verificada

- [Node.js releases](https://nodejs.org/en/about/previous-releases): Node 24 está en LTS; Node 20 figura EOL a la fecha de decisión.
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation): Next.js exige Node 20.9 o superior.
- [NestJS version compatibility](https://docs.nestjs.com/faq/versions) y [migration guide](https://docs.nestjs.com/migration-guide): Nest 12 ejecuta desde Node 20.19/22.12 y sus herramientas favorecen un LTS reciente.
- [Prisma system requirements](https://docs.prisma.io/docs/orm/reference/system-requirements), [PostgreSQL quickstart](https://www.prisma.io/docs/prisma-orm/quickstart/postgresql) y [supported databases](https://docs.prisma.io/docs/orm/reference/supported-databases): Prisma 7 es estable, funciona con Node 24 y documenta PostgreSQL 18.
- [PostgreSQL versioning](https://www.postgresql.org/support/versioning/) y [18.7 release](https://www.postgresql.org/docs/18/release-18-7.html): PostgreSQL 18.7 tiene soporte hasta 2030.
- [pnpm installation/compatibility](https://pnpm.io/installation): pnpm 10 es compatible con Node 24.
- [GHSA-cjhr-43r9-cfmw](https://github.com/pnpm/pnpm/security/advisories/GHSA-cjhr-43r9-cfmw): pnpm 10.33.2 quedó afectado por reenvío de credenciales no acotadas a un registro elegido por el repositorio. El cierre técnico del 24 de noviembre de 2026 adopta 10.34.9, último parche publicado de la rama 10.x y posterior a las correcciones 10.34.0–10.34.5 de los avisos vigentes revisados.
- [Better Auth Express integration](https://better-auth.com/docs/integrations/express), [password recovery](https://better-auth.com/docs/authentication/email-password) y [2FA](https://better-auth.com/docs/plugins/2fa): integración Node mantenida, revocación al recuperar contraseña, TOTP y códigos de respaldo.

Las versiones exactas también se contrastaron con los metadatos `engines` y `peerDependencies` publicados por cada paquete el 23 de noviembre de 2026.

## Alternativas evaluadas

- Keycloak: ofrece OIDC, OTP y códigos de recuperación soportados. Es adecuado si la fundación decide operar un proveedor de identidad independiente, pero añade servicio, base/configuración, actualización y procedimiento administrativo. Para una sola fundación y este bloque local, Better Auth reduce componentes sin crear protocolo propio.
- Auth.js: encaja especialmente en Next.js; para la API Nest separada requería decidir un puente de sesión adicional. Better Auth documenta Express y se monta directamente en el adaptador de Nest.
- Implementación propia: rechazada por el riesgo de contraseña, recuperación, sesión y MFA.

## Consecuencias y límites

- El secreto de autenticación y las credenciales de fixtures se generan localmente y no se versionan.
- La recuperación y las invitaciones solo tienen transporte local. Antes de staging se necesita un adaptador institucional de correo, dominio/remitente, límites, observabilidad y textos aprobados.
- La cuenta se vuelve inaccesible inmediatamente si `UserAccount` se desactiva, aunque exista cookie; además se eliminan sus sesiones persistidas.
- El worker vuelve a resolver estado, roles y asignación al ejecutar. No confía en el permiso existente cuando el trabajo se encoló.
- El acceso de infraestructura sigue siendo un riesgo operativo distinto; esta política limita la aplicación, no al dueño del host o de la base.
- Cualquier cambio de mayor de runtime, framework, ORM, base o autenticación requiere un ADR nuevo y migración probada.
