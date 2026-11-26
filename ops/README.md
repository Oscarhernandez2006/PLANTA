# Copias de seguridad de PostgreSQL (servidor Dokploy)

Scripts para respaldar **todas** las bases de datos PostgreSQL del servidor
`ServidorSoftwarePlanta` (20.121.178.90) cada 2 horas, una carpeta por aplicación.

```
~/backups/
  backup.log
  sigcompro-sigcompro/   sigcompro-sigcompro_2026-11-01_2000.dump
                         sigcompro-sigcompro_2026-11-01_2200.dump ...
  signom-signom/         ...
  (una carpeta por cada contenedor postgres que exista)
```

- Formato `pg_dump -Fc` (comprimido, restaurable con `pg_restore`).
- Detecta automáticamente los contenedores cuya imagen contiene `postgres`; si se
  crea una app nueva con Postgres, queda incluida sin tocar nada.
- Retención: 7 días (`RETENTION_DAYS`). A 12 copias/día son ~84 dumps por app.

## Instalación (una sola vez, por SSH)

```bash
mkdir -p ~/bin ~/backups
# copiar backup-postgres.sh y restore-postgres.sh a ~/bin (scp o pegar con cat > ~/bin/...)
chmod +x ~/bin/backup-postgres.sh ~/bin/restore-postgres.sh

# Probar a mano
~/bin/backup-postgres.sh
ls -lh ~/backups/*/

# Programar cada 2 horas (minuto 5: 00:05, 02:05, 04:05 ...)
( crontab -l 2>/dev/null; echo '5 */2 * * * /home/adminsvr/bin/backup-postgres.sh >> /home/adminsvr/backups/cron.log 2>&1' ) | crontab -
crontab -l
```

## Restaurar

```bash
~/bin/restore-postgres.sh sigcompro-sigcompro                  # usa el dump más reciente
~/bin/restore-postgres.sh sigcompro-sigcompro ~/backups/sigcompro-sigcompro/sigcompro-sigcompro_2026-11-01_1400.dump
```

Pide confirmación, hace una copia previa (`ANTES-RESTORE_*.dump`), recrea la BD y
restaura. Detener antes la app que usa esa BD (Dokploy → Stop).

Si el contenedor Postgres **no arranca** (volumen corrupto), primero hay que dejarlo
arrancar con un volumen vacío (Dokploy → BD → Stop; `docker service scale <svc>=0`;
vaciar `/var/lib/docker/volumes/<svc>-data/_data/`; `scale=1`) y después correr el
restore.

## Réplica en tiempo real de la planta en la nube

Reemplaza a `espejo-nube.sh` (copia completa cada hora): la nube recibe cada cambio de la BD
de la planta en **segundos** (replicación streaming de PostgreSQL). La réplica es de **solo
lectura**; las migraciones se aplican solo en la planta y llegan solas, así que no hay choques.

```
planta (NAT) --túnel SSH--> nube 127.0.0.1:15432 --> contenedor planta-replica (puerto 5433)
```

Si el túnel se cae, el slot `nube` guarda los cambios en la planta (hasta `REPLICA_WAL_MAX`)
y la réplica se pone al día sola al volver la conexión.

1. **Planta**: en `~/.config/planta-respaldo.env` agregar `REPLICA_CLAVE` (`openssl rand -hex 24`),
   `TUNEL_PUERTO=15432` y `LOCAL_PG_PUERTO=5432`. Luego:
   ```bash
   ~/ops/replica-preparar-planta.sh   # usuario replicador, slot y pg_hba (no toca datos)
   ~/ops/replica-tunel-planta.sh      # servicio systemd planta-tunel-replica (pide sudo)
   ```
2. **Nube**: crear `~/.config/planta-replica.env` (chmod 600) con la misma `REPLICA_CLAVE`,
   `TUNEL_PUERTO=15432`, `REPLICA_PUERTO=5433` y `PG_USUARIO` (POSTGRES_USER de la planta). Luego:
   ```bash
   ~/bin/replica-crear-nube.sh        # copia inicial + arranque; debe mostrar status = streaming
   ```
3. **Planta**: vigilar cada 5 min y apagar el espejo horario:
   ```bash
   ( crontab -l | grep -v espejo-nube.sh; echo '*/5 * * * * /home/svradmin/ops/replica-estado.sh >> /home/svradmin/backups/cron.log 2>&1' ) | crontab -
   tail ~/backups/replica.log
   ```
   La base vieja de la nube (`planta-dbplantanube`, puerto 3017) queda congelada. Para recuperar
   la planta usa la réplica (`docker exec planta-replica pg_dump -p 5433 ...`) o los `.dump` de
   `~/respaldos-planta`.

**Emergencia** (se perdió la planta): en la nube `~/bin/replica-promover-nube.sh` la convierte
en base principal. Después hay que restaurar la planta desde ella y rehacer la réplica.

## Recuperación a un momento exacto (errores, borrados, migraciones malas)

La réplica copia también los errores. Para eso la nube guarda además cada cambio de la planta
(contenedor `planta-wal`, slot `archivo`) y una copia base diaria (03:00), con 15 días hacia atrás
(`PITR_DIAS`). Se puede devolver la planta a cualquier segundo de esos días.

Instalación (una vez, en la nube, con la réplica ya funcionando): agregar `PITR_DIAS=15` y
`PG_BD=PLANTALOCALDB` a `~/.config/planta-replica.env` y correr `~/bin/pitr-archivo-nube.sh`.

Si pasa algo, **detén la operación** y en la planta:
```bash
~/ops/restaurar-momento.sh                       # desde cuándo se puede volver
~/ops/restaurar-momento.sh "2026-11-26 10:41"    # hora de Colombia, un minuto antes del error
```
Muestra qué tablas cambian, pide escribir `RESTAURAR`, guarda la base actual en
`~/backups/restauraciones/antes-de-restaurar_*.dump`, detiene el backend, reemplaza el esquema
completo en una sola transacción y lo vuelve a encender. La réplica de la nube sigue sola.
Se pierde lo digitado después de la hora elegida. Para solo revisar, contesta otra cosa que no sea
`RESTAURAR`: el `.dump` de ese momento queda guardado. `restaurar-desde-nube.sh` ya no aplica
(usaba la base vieja de la nube).

## Recomendado además

- Copiar `~/backups` fuera del servidor (Azure Storage / S3 desde Dokploy → Backups)
  para cubrir pérdida total de la VM.
- Vigilar espacio: `du -sh ~/backups` y `df -h /`.
