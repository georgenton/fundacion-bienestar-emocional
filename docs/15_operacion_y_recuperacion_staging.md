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

Coolify mostraba cero programas y cero ejecuciones de respaldo para PostgreSQL de FBE. El titular autorizó el R2 existente con prefijo `fbe/staging/`, clase Standard, una ejecución cada 12 horas, expiración a 30 días y costo adicional de US$0. Falta comprobar el consumo de la cuenta, las reglas superpuestas y el alcance efectivo de la credencial. La expiración se limita al prefijo de FBE. El job conserva localmente el último estado, retira sus temporales y usa un identificador nuevo en el próximo intento. Un fallo conserva las copias externas anteriores y queda señalado en el estado.

1. Desde una custodia independiente del OVH, generar o recuperar una clave OpenPGP dedicada y validar su huella completa. Importar solo la clave pública en el keyring del job. La clave privada y su método de desbloqueo se mantienen en custodia fuera del OVH y se usan para el ensayo de recuperación.
2. Después de comparar los tres digests activos con el manifiesto, usar `staging-recovery-material.sh` en un directorio vacío `0700` de tmpfs. Captura los ajustes explícitos de API y migración, el SQL de los dos roles y los permisos de base, el manifiesto y las instrucciones de orígenes, TLS y red. El dump lleva los permisos de objetos y los permisos por defecto. La captura de roles exige la topología acotada que se comprobó en FBE. Si cambia, revisar el procedimiento antes de usarlo de nuevo.
3. Usar GnuPG, OpenSSL, jq, Docker y AWS CLI en el ejecutor autorizado. AWS CLI 2.42.3 quedó instalado de forma exclusiva para FBE tras comprobar la firma de AWS y la huella de su clave de publicación. Aprovisionar un perfil limitado a escritura y lectura del prefijo. Usar la clave pública validada y un tmpfs privado para el dump en claro. [AWS CLI: instalación y verificación](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-version.html).
4. Programar a las 00:00 y a las 12:00 UTC con un bloqueo exclusivo para FBE y un límite de cinco minutos. El script verifica el archivo PostgreSQL, cifra antes de subir, limita el cifrado a 256 KiB, escribe como Standard, descarga la misma clave de objeto y compara bytes. El registro operativo privado conserva el identificador y SHA-256. Ejecutar el comando tras validar destino, consumo y alcance de la credencial.

```bash
# Entorno privado con perfil acotado y TMPDIR dentro de tmpfs
flock --nonblock "$FBE_LOCK_FILE" timeout --kill-after=15s 300s \
  bash scripts/devops/staging-backup-job.sh \
    "$FBE_PG_CONTAINER" "$FBE_RECOVERY_DIR" "$FBE_GPG_FINGERPRINT" "$FBE_BACKUP_STATUS"
```

El backup programado nativo puede dejar primero archivos locales y tiene opciones para subir a almacenamiento remoto. Este procedimiento mantiene control explícito del cifrado del paquete completo, incluido el material de recuperación. [Coolify: backups](https://coolify.io/docs/databases/backups) · [PostgreSQL: SQL dump](https://www.postgresql.org/docs/18/backup-dump.html) · [GnuPG: cifrado](https://www.gnupg.org/documentation/manuals/gnupg/Operational-GPG-Commands.html) · [Cloudflare: reglas de expiración](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

## Verificación adicional del staging real

- En Coolify seguían activos los digests de `0438bf9…`, con API y web saludables, migrador con código cero y tres migraciones completadas. Se confirmó el modo sintético, el seed desactivado y cero personas o casos fuera del modo sintético. Antes de la captura había 13 135 116 KiB libres, 9 378 234 inodos libres y 5 978 352 KiB disponibles en tmpfs.
- Se generó una clave dedicada, se probó el descifrado recuperando la frase desde la custodia del Mac y se importó únicamente la clave pública en el ejecutor. Se comprobó que el keyring del OVH contiene una clave pública de cifrado y cero privadas.
- El dump real tuvo 54 458 bytes. El paquete cifrado de la prueba sobre la base activa y su material de recuperación tuvo **18 714 bytes** y se generó en **1 s**. Se retiró del tmpfs junto con los temporales. Esta prueba de captura no hizo solicitudes a R2.
- Tras preparar el ejecutor aislado de AWS CLI había 12 844 820 KiB libres y 9 369 404 inodos libres. El margen superó los umbrales de 6 GiB y 500 000 inodos. Antes de una promoción corresponde una lectura nueva.
- A dos copias diarias, 60 objetos del tamaño medido suman **1 122 840 bytes**. Con hasta 62 objetos por la ventana de expiración y el límite de 256 KiB por archivo, la cota de almacenamiento del proyecto es aproximadamente **16,3 MB**. El cálculo de operaciones parte de una escritura verificada por copia, lecturas para verificar y restaurar, y margen por reintentos. La cuota Standard es agregada para la cuenta. Quedó pendiente comparar esta cota y las operaciones con el consumo de Cloudflare, inspeccionar las reglas existentes y comprobar el alcance de las credenciales. [Precios y cuota Standard de R2](https://developers.cloudflare.com/r2/pricing/) · [Credenciales R2 acotadas](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/).
- PostgreSQL de origen mostró 18 relaciones de aplicación propiedad del migrador, cuyo rol es superusuario de la instancia dedicada. El runtime carece de propiedad, membresías, `SET ROLE` al migrador y `CREATE` en `public`. Los permisos por defecto del migrador conceden DML de tablas y `USAGE`, `SELECT` y `UPDATE` de secuencias. El runtime carece de `TRUNCATE` en auditoría y el trigger de mutación está activo. El contraste con una copia restaurada desde R2 sigue pendiente.
- Coolify no tenía proveedor de correo activo para el equipo. Se prepararon las sondas y falta verificar el buzón corporativo en Microsoft 365, seleccionar el transporte autorizado y comprobar recepción. La web presentó el rótulo `ENTORNO LOCAL` en la última consulta pública.

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
