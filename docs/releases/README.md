# Manifiestos conservados de las entregas

Copias exactas del archivo `release.json` extraído de los artefactos originales de GitHub Actions el 24 de noviembre de 2026. Antes de extraer cada archivo se comprobó el SHA-256 del ZIP contra el digest informado por GitHub.

| Archivo | CI de origen | Artefacto | SHA-256 del ZIP |
|---|---|---|---|
| [0438bf99615d2ccc74e6c97034dafdf4ebea3760.json](0438bf99615d2ccc74e6c97034dafdf4ebea3760.json) | [45452399716](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45452399716), intento 1 | `14948609248` | `a6e87576a7a7cc270b13e1d4041f19b01958a0de774837816ee3b1e32b589897` |
| [2128263510525ae6fb1df9451bd550255a477795.json](2128263510525ae6fb1df9451bd550255a477795.json) | [45460708004](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45460708004), intento 1 | `14952269023` | `69479fbb2c70bf7192aeb4411582e53f26acebaa8f7e5ef649f3352415b92dcd` |

Los artefactos originales tienen caducidad informada el 8 de diciembre de 2026. Los JSON conservan SHA, run, intento, origen público e imágenes por digest; no contienen credenciales.

Un manifiesto acredita la referencia publicada y sus verificaciones declaradas, no una promoción actual a Coolify. La evidencia de staging identifica `0438bf9…` como la entrega promovida; `21282635…` se publicó después del cierre documental. La diferencia entre ambas referencias solo contiene documentación.

Estos archivos son registros históricos: no editarlos para representar otra entrega ni emplearlos como mecanismo para saltarse la validación de un run en el workflow de promoción. La conservación del JSON no conserva automáticamente las imágenes de GHCR; la política del registro debe mantener las versiones necesarias para recuperación.
