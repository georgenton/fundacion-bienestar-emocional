# Recuperación de acceso — comportamiento del bloque 1

Fecha de revisión: 24 de noviembre de 2026. Este documento describe lo implementado y probado con identidades sintéticas. No aprueba un procedimiento institucional ni habilita atención real.

## Verificación MFA por sesión tras la auditoría

El estado global `twoFactorEnabled` acredita enrolamiento, no verificación de una sesión concreta. La tercera migración incorpora `AuthSession.mfaVerified`, administrado por el servidor, inicialmente falso también para sesiones existentes. Un resultado satisfactorio de TOTP o respaldo lo cambia para esa sesión. Una sesión creada o rotada comienza sin esa prueba; las sesiones anteriores al enrolamiento se revocan además como defensa adicional.

Toda cuenta que tenga un factor enrolado necesita esa verificación para acceder al dominio, incluso cuando su política permita enrolarlo de forma opcional. Una cuenta con MFA obligatorio y sin factor sigue recibiendo `MFA_ENROLLMENT_REQUIRED`. Las operaciones sensibles del proveedor también comprueban la verificación. El recorrido visual solo ofrece TOTP: los respaldos y la activación de invitaciones están probados por API; no se afirma que todas sus pantallas estén terminadas.

## A. Pérdida de contraseña

La persona puede solicitar recuperación por correo. La respuesta HTTP es igual para una dirección existente y una inexistente. En el bloque local no se envía correo: el enlace se escribe en un outbox ignorado por Git.

El token caduca según `AUTH_RESET_TOKEN_TTL_SECONDS` (900 segundos en el ejemplo), se consume al usarlo y no admite reutilización. Una recuperación correcta elimina las sesiones persistidas del usuario. Si la cuenta pertenece al personal, recuperar la contraseña no elimina `mfaRequired`, no desactiva TOTP y no completa el segundo factor: el siguiente ingreso sigue solicitando TOTP o un código de respaldo.

Está probado automáticamente el vencimiento, el uso único, la respuesta sin enumeración, la revocación de una sesión activa y la conservación del requisito MFA. El transporte de correo institucional, sus textos y su operación no están implementados.

## B. Pérdida del autenticador con código de respaldo

Después de validar correo y contraseña, el personal queda en una sesión pendiente de segundo factor. Un código de respaldo válido permite completar ese factor y se consume; el mismo código falla al intentarlo otra vez. Los códigos sintéticos se generan localmente y el archivo que los contiene tiene permisos `0600` y está excluido de Git.

El uso único está probado automáticamente. No existe una ruta administrativa general para desactivar el MFA de otra persona. La sustitución o reinscripción del autenticador después de entrar con un código de respaldo todavía no tiene una pantalla ni un procedimiento institucional validado.

## C. Pérdida de todos los factores

No existe una vía automática ni administrativa para omitir MFA cuando se perdieron el autenticador y todos los códigos de respaldo. Recuperar la contraseña no sirve como bypass del segundo factor. La administración operativa puede desactivar una cuenta para contener riesgo e invalidar sus sesiones, pero esa acción no recupera MFA ni acredita identidad.

La verificación humana de identidad, responsables autorizados, evidencia requerida, revisión de auditoría, revocación de factores y eventual reinscripción siguen pendientes de David Jaramillo o su delegado. Hasta que ese proceso sea aprobado e implementado, la cuenta permanece sin acceso; no se autoriza una modificación manual de base de datos como procedimiento ordinario.
