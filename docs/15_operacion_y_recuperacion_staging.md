# Operación y recuperación de staging sintético

Mediciones y ensayo del 24 de noviembre de 2026. El clon siguió `origin/main` por fast-forward de `2128263510525ae6fb1df9451bd550255a477795` a `0de373ac92b8facf611fd8ce03fe7daae03db649`. La rama principal exige PR, rama actualizada y ambos checks de CI. El PR #7 fusionó el nuevo rótulo. El CI de esa entrega publicó las tres imágenes y el handoff validó su procedencia. [PR #7](https://github.com/georgenton/fundacion-bienestar-emocional/pull/7) · [CI de la candidata](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45472954312) · [Handoff](https://github.com/georgenton/fundacion-bienestar-emocional/actions/runs/45476803019) · [Manifiesto](releases/0de373ac92b8facf611fd8ce03fe7daae03db649.json).

## Capacidad y red observadas en Coolify

| Medición | Antes de este encargo, dato histórico | Lectura de este encargo |
|---|---:|---:|
| Disco raíz y Docker, sobre el mismo filesystem | 13 GiB libres redondeados, 87 % utilizado | 13 457 543 168 bytes libres (12,53 GiB), 87 % utilizado |
| Inodos del filesystem | Sin lectura | 9 378 245 libres, 28 % utilizado |
| Memoria disponible y CPU | Sin medición comparable | 5 907 276 KiB disponibles, 6 CPU |
| Volumen PostgreSQL FBE | Sin medición comparable | 67 461 120 bytes ocupados |
| Base lógica FBE | Sin medición comparable | 9 361 087 bytes, 3 migraciones finalizadas |
| Logs en disco de los cuatro contenedores FBE | Sin medición comparable | 1 118 208 bytes asignados en total |
| Imágenes FBE existentes, suma sin deduplicar | Sin medición comparable | 1,38 GB + 1,54 GB + 384 MB, según Docker |

Las capas comprimidas `linux/amd64` de la candidata suman 734 816 730 bytes sin deduplicar. Se propone presupuestar 6 GiB libres antes de promover, incluyendo una descarga de 0,69 GiB, hasta 3,31 GB de capas expandidas tomando la entrega activa como referencia, 512 MiB para una instancia desechable de PostgreSQL y margen para archivos de respaldo, capas auxiliares y crecimiento. Los 12,53 GiB observados superan ese presupuesto preliminar. La lectura debe repetirse inmediatamente antes de descargar al OVH. El ensayo de este documento ejecutó la descarga y la restauración en el Mac, por lo que no hay medición posterior a una promoción en OVH.

Se comprobó una conexión TCP desde la API a la dirección configurada de PostgreSQL. La base carece de puertos publicados. Aplicación y base comparten la red predefinida de Coolify, que tiene participantes ajenos a FBE. La red adicional de la aplicación tiene tres miembros. El servidor sigue dependiendo de las credenciales y reglas de PostgreSQL para limitar el acceso desde la red compartida.

## Respaldo externo preparado

Coolify mostraba cero programas y cero ejecuciones de respaldo para PostgreSQL de FBE. Se identificó una opción de almacenamiento externo compartida sin una asignación comprobada a FBE. Se propone un prefijo dedicado `fbe/staging/`, una ejecución cada 12 horas y expiración externa a los 30 días, sujeta a confirmación del destino y su costo. La política de expiración debe limitarse a ese prefijo. El job conserva localmente únicamente el último estado. Retira sus temporales tanto al verificar como al fallar y el siguiente intento usa un identificador nuevo. Un fallo de subida o verificación conserva las copias externas anteriores. El formato de estado marca como fallida la última ejecución aunque todavía exista una copia anterior.

1. Desde una custodia independiente del OVH, generar o recuperar una clave OpenPGP dedicada y validar su huella completa. Importar solo la clave pública en el keyring del job. La clave privada y su método de desbloqueo se mantienen en custodia fuera del OVH y se usan para el ensayo de recuperación.
2. Preparar fuera del clon y con permisos `0700` para directorios y `0600` para archivos el material exacto de la versión activa. Incluir `api.env` con el secreto de autenticación y conexión de runtime, `migration.env` con la conexión de migración, `roles.sql` con el bootstrap de roles y permisos exclusivamente FBE, y `release.json` con los tres digests verificados. Guardar también las instrucciones de orígenes, TLS y redes de FBE. Proveer credenciales de base y almacenamiento desde el almacén privado del operador. Evitar una exportación global de roles, identidades de otros proyectos y dumps del servidor completo.
3. Usar GnuPG, OpenSSL, jq, Docker y AWS CLI en el ejecutor autorizado. El OVH tenía GnuPG, jq y Docker en la inspección. AWS CLI requiere preparación en el ejecutor escogido. Aprovisionar un perfil limitado a escritura y lectura del prefijo, cifrado con la clave validada y una carpeta temporal privada. Usar un tmpfs privado o almacenamiento de trabajo cifrado para el dump en claro.
4. Ejecutar el job de forma serial y con un límite de tiempo. El script verifica el archivo PostgreSQL, cifra antes de subir, descarga la misma clave de objeto, compara bytes y publica un identificador no secreto y SHA-256. Conserva esos resultados en el registro operativo privado.

```bash
# Entorno privado del job, con las variables completadas por el operador
# FBE_BACKUP_S3_ENDPOINT, FBE_BACKUP_S3_PREFIX, AWS_PROFILE, GNUPGHOME, TMPDIR
bash scripts/devops/staging-backup-job.sh \
  "$FBE_PG_CONTAINER" "$FBE_RECOVERY_DIR" "$FBE_GPG_FINGERPRINT" "$FBE_BACKUP_STATUS"
```

El backup programado nativo puede dejar primero archivos locales y tiene opciones para subir a almacenamiento remoto. Este procedimiento mantiene control explícito del cifrado del paquete completo, incluido el material de recuperación. [Coolify: backups](https://coolify.io/docs/databases/backups) · [PostgreSQL: SQL dump](https://www.postgresql.org/docs/18/backup-dump.html) · [GnuPG: cifrado](https://www.gnupg.org/documentation/manuals/gnupg/Operational-GPG-Commands.html) · [Cloudflare: reglas de expiración](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

## Restauración externa por ejecutar

Descargar el objeto verificado a un ejecutor separado, comprobar SHA-256, descifrar con la custodia independiente y extraer solo en un directorio vacío privado con almacenamiento cifrado. Crear un PostgreSQL desechable con red propia sin puertos públicos, aplicar `roles.sql` y después `pg_restore --exit-on-error --single-transaction --role=fbe_migrate` sobre la base vacía. Usar un administrador de recuperación acotado a esa instancia para establecer el rol y restaurar propietarios y ACL. Adaptar las conexiones al DNS aislado mediante archivos privados antes de iniciar la API. Verificar conteos, restricciones, historial de migración, auditoría, sesión sintética con acceso propio y rechazo del caso ajeno y comparar los permisos efectivos con el origen. Anotar inicio de captura, fin de restauración SQL y primer acceso funcional para calcular antigüedad y duración. [PostgreSQL: pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

## Ensayo ejecutado en el Mac

`bash scripts/devops/staging-recovery-drill.sh` crea dos PostgreSQL 18.7 desechables en redes internas distintas sin publicar puertos. Genera fixtures y una pareja de claves de un solo uso. El emisor recibe la clave pública. El receptor descifra una copia idéntica del archivo con la clave privada. El código y los tres digests se obtuvieron del registro público. La transferencia del ensayo fue entre directorios locales.

La revisión independiente posterior corrigió la barrera del ejecutor: el nombre `desktop-linux` no demuestra que su endpoint sea local. El script ahora inspecciona ese endpoint, exige un socket Unix y fija `DOCKER_CONTEXT=desktop-linux` para todas las llamadas, incluidos el respaldo y la limpieza. CI comprueba con un sustituto local de Docker que SSH/TCP y los contextos no admitidos se rechazan antes de crear recursos, y que el contexto queda fijado. Estas pruebas no ejecutan Docker ni sustituyen el ensayo completo del Mac; las mediciones siguientes conservan el alcance de aquella ejecución.

| Comprobación | Resultado |
|---|---|
| Datos restaurados | 3 migraciones, 8 personas y 2 casos sintéticos, 2 participantes, 3 asignaciones y evento centinela de auditoría. Identidad de los casos y conteo de claves foráneas validadas coincidentes. |
| Runtime en la copia | Autenticado por TCP. Sin roles miembros, propiedad de objetos ni `SET ROLE` de migración. Sin superusuario, `CREATEDB`, `CREATEROLE`, herencia, replicación, bypass RLS ni `CREATE` en `public`. |
| DDL y auditoría | `CREATE`, `ALTER`, `SET ROLE`, `DROP` del objeto nuevo y `TRUNCATE` de auditoría rechazados con `42501`. El trigger rechazó `UPDATE` y `DELETE` de auditoría con `P0001`. Los permisos por defecto permitieron DML y uso de la secuencia en la tabla creada por el migrador. |
| Migración sucesiva | Prisma aplicó una migración aditiva de ensayo una sola vez. La repetición no dejó trabajo pendiente. La tabla y columna de ensayo existieron solo en la copia. |
| Regreso de imágenes | Restaurados los tres digests de `0438bf9…` sobre el esquema ampliado. Se conservó la columna nueva y coincidieron las comprobaciones de integridad del conjunto original. |
| Servicio en ambos sentidos | Salud y web 200, casos anónimos 401, login sintético 200, caso propio 200 y caso ajeno 404. |

En la última ejecución, la captura cifrada y copia local duraron 1 s. El archivo de ensayo tuvo 18 465 bytes y SHA-256 `b6cfe6a2e9e821322f0e3ee70ae5555e14e35f19f0401352bfa4b5976a53e3f4`. La restauración SQL duró 1 s, con 2 s de antigüedad de la copia al terminar. El tiempo hasta confirmar API y sesión funcionales fue de 8 s. La actualización con verificación funcional duró 18 s y el regreso con verificación, 7 s. Las imágenes ya estaban en caché. Se retiraron la copia de ensayo, las claves temporales y los recursos desechables al finalizar.

El rol y sus permisos en la copia se construyeron para el ensayo. Aún queda contrastar la propiedad, las membresías y las ACL del staging real al preparar su paquete de recuperación. [PostgreSQL: privilegios y propietarios](https://www.postgresql.org/docs/18/ddl-priv.html).

## Alertas preparadas

- Ejecutar `bash scripts/devops/staging-status.sh public` cada cinco minutos desde un monitor externo al OVH. Comprueba HTTPS, JSON de salud y rótulo de uso sintético. Localmente se observó la secuencia éxito, fallo inducido apuntando solo al loopback y recuperación al restaurar la URL.
- Ejecutar `bash scripts/devops/staging-status.sh host /var/lib/docker 6291456 500000 "$FBE_BACKUP_STATUS"` desde el host cada cinco minutos. Los umbrales propuestos corresponden a 6 GiB y 500 000 inodos libres. El respaldo alerta si falta el estado, falló el readback o la captura verificada alcanza 24 horas. Se ensayaron los estados fresco, vencido y umbral de capacidad incumplido con valores controlados.
- El monitor puede alertar por transición a fallo tras dos comprobaciones consecutivas y notificar la recuperación. Enviar únicamente la señal, la hora y el entorno. Falta asignar un canal técnico autorizado, configurar el envío y confirmar recepción de ambos mensajes.

## Estado de la promoción

Los digests activos de API, migrador y web coincidieron con [el manifiesto de `0438bf9…`](releases/0438bf99615d2ccc74e6c97034dafdf4ebea3760.json). API y web estaban saludables y el migrador salió con código cero. Se confirmó `SYNTHETIC_DATA_ONLY=true` y el seed automático deshabilitado. La candidata `0de373a…` conserva la promoción pendiente hasta verificar un respaldo externo y su restauración. El rótulo de staging activo sigue siendo `ENTORNO LOCAL`.
