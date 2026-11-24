# Fundación para el Bienestar Emocional

Repositorio público del proyecto de plataforma de atención y gestión. La implementación inicial se incorpora mediante una revisión del bloque de identidad y permisos, con pruebas sintéticas y GitHub Actions.

**Estado: desarrollo. No habilitado para atención de pacientes ni para almacenar información clínica real.**

## Procedencia

La base recibida para revisión corresponde al archivo `fbe_codex-bloque1-auditoria-5c325950.zip`, cuyo SHA-256 es `e35a5f4c08858cce2b1ff07ea71c220a774de16cc14c2d1d19ec8de581863a63` y cuya referencia declarada es `5c325950cff66dd9d215761f08ee0be5e4555bae`.

Esta historia pública es independiente de la historia local original, que se conserva privada. La importación retira referencias internas y añade correcciones de auditoría y preparación DevOps.

## Operación prevista

- Interfaz Next.js, API NestJS y PostgreSQL.
- Datos sintéticos durante desarrollo y staging.
- CI en GitHub Actions e imágenes verificables para OVH con Coolify.
- Permisos por rol y caso, MFA y trazabilidad.

La publicación del código no acredita habilitación clínica, sanitaria o jurídica. La licencia permanece sin conceder hasta un acuerdo específico de sus responsables.
