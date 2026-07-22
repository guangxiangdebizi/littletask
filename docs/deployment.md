# Production deployment

The production topology uses the existing `medicalweb` host without changing its global Node 20
runtime or unrelated PM2 applications. LittleTask runs from immutable Git-SHA releases under
`/srv/littletask`, uses an isolated Node 22 runtime, and binds the API and PostgreSQL only to
loopback. Nginx serves the Expo Web export at `https://manbaout.com`, proxies `/api/`, and preserves
the existing Roundcube service at `/webmail/`.

## Audited host baseline

The read-only audit on 2026-07-22 found Ubuntu 24.04, Nginx 1.24, Docker 29, PM2 7, an active
`manbaout.com` certificate, and approximately 12 GB free disk. Ports 80/443 and several unrelated
loopback ports are already used; `127.0.0.1:3100` and `127.0.0.1:5432` were free. Host Node is 20,
so it must not launch LittleTask. Roundcube currently owns the domain root through
`127.0.0.1:8082`; its mail containers and SMTP/IMAP ports remain untouched.

Repeat the read-only audit immediately before every first deployment because host state can change.

## First deployment

All commands in this section run on `medicalweb` as root. Start by checking out the exact reviewed
Git commit into a temporary directory, then prepare the runtime:

```bash
NODE_VERSION=22.20.0 ./infra/deploy/bootstrap-ubuntu.sh
```

The bootstrap script downloads the official Node archive and checksum, validates it, and installs
it under `/opt` without replacing `/usr/bin/node`. It creates the unprivileged `littletask` user and
the release/shared directories. Existing PM2 applications continue using the host runtime.

Create the production environment file from the committed template:

```bash
install -o littletask -g littletask -m 600 \
  infra/deploy/production.env.example /srv/littletask/shared/.env
```

Replace every `CHANGE_ME` value. Use a newly rotated HostCentral key; the key previously pasted into
chat is not suitable for deployment. Use a URL-safe random database password and put the identical
value, URL-encoded when necessary, into `DATABASE_URL`. The release script rejects placeholders,
missing values, the wrong owner, or permissions broader than `0600`.

Release only a full 40-character commit SHA:

```bash
/path/to/checkout/infra/deploy/release.sh <git-sha>
```

The script fetches exactly that public Git object, installs from the frozen lockfile, exports Web
with the public API URL, builds the API/worker, starts a dedicated PostgreSQL 17 container, waits for
its health check, applies forward migrations, atomically switches `current`, reloads the two PM2
processes as `littletask`, and checks the database-backed readiness endpoint. On a failed process
reload or readiness check it restores the prior symlink when one exists. It keeps at least three
releases and never prunes the current or recorded previous release.

## Preserve Webmail and switch Nginx

Roundcube needs to generate URLs below `/webmail/` before Nginx moves it away from the root. The
preparation script installs a Docker Compose override, recreates only the `webmail` service, and
checks its generated login action. It restores the prior override on failure.

```bash
/srv/littletask/current/infra/deploy/prepare-webmail-path.sh
/srv/littletask/current/infra/deploy/install-nginx.sh
```

The Nginx installer backs up every replaced file below `/etc/nginx/littletask-backups/<timestamp>`,
runs `nginx -t`, restores on validation failure, and reloads only after success. The configuration:

- redirects HTTP to HTTPS while preserving ACME challenges;
- serves immutable Expo bundles and no-cache route documents;
- limits registration, uploads, general API requests, and concurrent connections;
- caps multipart bodies at 11 MB for the API's 10 MB payload limit;
- returns 404 for the public metrics route;
- sends `Cache-Control: no-store` for API responses;
- proxies the existing Roundcube container at `/webmail/`;
- does not enable HSTS until all desired subdomains and certificates are confirmed.

The current certificate covers `manbaout.com`, not `www.manbaout.com`; do not add the latter to the
vhost until its DNS and certificate are intentionally configured.

## Backups and logs

Install the committed log rotation and daily backup units:

```bash
install -m 644 /srv/littletask/current/infra/logrotate/littletask /etc/logrotate.d/littletask
install -m 644 /srv/littletask/current/infra/systemd/littletask-backup.service \
  /etc/systemd/system/littletask-backup.service
install -m 644 /srv/littletask/current/infra/systemd/littletask-backup.timer \
  /etc/systemd/system/littletask-backup.timer
systemctl daemon-reload
systemctl enable --now littletask-backup.timer
```

Backups are custom-format `pg_dump` files with mode `0600` under
`/srv/littletask/shared/backups`; the default retention is 14 days. A same-host backup is not a
disaster-recovery copy. Transfer encrypted copies to a separately controlled store before calling
the production environment durable.

Restore only into an empty recovery database first, never directly over production:

```bash
docker exec -i littletask-postgres sh -c \
  'exec pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists' \
  < /srv/littletask/shared/backups/<backup>.dump
```

Run a restore rehearsal against a disposable container and record the Git SHA, migration version,
backup checksum, row counts, and result without copying user data into the repository.

## Rollback

Rollback switches application code only; Prisma migrations are forward-only and must remain
compatible with the selected release.

```bash
/srv/littletask/current/infra/deploy/rollback.sh
```

With no argument it uses the recorded previous release. A specific target must be a complete
40-character SHA already present below `/srv/littletask/releases`. The script validates the path,
switches the symlink atomically, reloads PM2, checks readiness, and saves the PM2 process list.

## Final verification

After all product functionality is implemented, run the unified acceptance sequence rather than
testing components in isolation:

1. Confirm `pm2 ls` shows both LittleTask processes under the `littletask` OS user.
2. Confirm PostgreSQL and API ports listen only on `127.0.0.1`.
3. Check public HTTPS, `/webmail/`, liveness/readiness, security headers, and public metrics denial.
4. Run `corepack pnpm check` against the same Git SHA.
5. Run the synthetic eval through the public authenticated API, persistent queue, worker, and real
   HostCentral model.
6. Upload the ignored private screenshot through the same API and remove its intake/account after
   reviewing the result.
7. Confirm PM2/worker restart recovery, backup creation, recovery restore, and code rollback.

Never print the environment file, bearer tokens, screenshot content, model response bodies, contact
data, or database dumps into deployment logs or CI artifacts.
