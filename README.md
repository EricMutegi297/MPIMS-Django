# MPIMS-Django

MPIMS-Django is a full-stack application for managing military police operations, case workflows, incident records, duty and guard room activities, and operational notifications.

The project combines a Django REST API backend, a React frontend, and a realtime Node.js service for live updates and notifications.

## Overview

This system is designed to support:

- User authentication and authorization
- Case management and investigation tracking
- Incident and offence recording
- Duty room and guard room operations
- Formation and unit management
- Morning brief workflows
- Notification delivery and audit logging
- MFA and secure password/account protections

## Tech Stack

- Backend: Django 5 + Django REST Framework
- Frontend: React 18 + React Router
- Realtime layer: Node.js + Socket.io
- Database: PostgreSQL
- Containerization: Docker Compose
- Security features: JWT auth, TOTP MFA, CORS, audit middleware

## Repository Structure

- `backend/` — Django project and REST API
- `frontend/` — React application
- `realtime/` — Socket.io realtime notification bridge
- `scanner-helper/` — operational helper tooling
- `tools/` — project utilities
- `docker-compose.yml` — local stack for app, database, and frontend services
- `docker-compose.hostdb.yml` — alternative host-based database setup

## Main Backend Apps

- `apps.users` — authentication, identity, and user management
- `apps.cases` — case lifecycle, legal/disciplinary workflows
- `apps.incidents` — incident reporting and tracking
- `apps.dutyrooms` — duty room operations and entries
- `apps.guardrooms` — guard room placement and activity tracking
- `apps.notifications` — notifications and event updates
- `apps.audit` — audit trail and logging middleware
- `apps.morningbriefs` — morning briefing operations
- `apps.formations` — formations and unit data
- `apps.offences` — offences and related records

Transactional operations for unit closure, brief approval/forwarding, and
exhibit-storage state changes live in `backend/apps/cases/services/`. API views
remain responsible for HTTP parsing, authorization, response serialization,
and dispatching notifications.

## Prerequisites

Before running the project, make sure you have:

- Python 3.11+
- Node.js 18+
- PostgreSQL 16
- Redis 7 (for asynchronous email delivery)
- pip / virtual environment support
- Docker and Docker Compose (optional, for containerized setup)

## Environment Configuration

The backend uses environment variables from `backend/.env`.

A sample configuration is provided in `backend/.env.example`.

Typical variables include:

- `SECRET_KEY`
- `FIELD_ENCRYPTION_KEY` (required, unique Fernet key; never reuse `SECRET_KEY`)
- `FIELD_ENCRYPTION_OLD_KEYS` (comma-separated previous field-encryption keys for rotation)
- `CASE_DOCUMENT_MAX_UPLOAD_BYTES` (maximum case-document upload size; defaults to 25 MiB)
- `CASE_UPLOAD_CLAMAV_ENABLED` and `CASE_UPLOAD_CLAMAV_*` (optional ClamAV scanning)
- `DEBUG`
- `ALLOWED_HOSTS`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`
- `CORS_ALLOWED_ORIGINS`
- `FRONTEND_URL`
- `GMAIL_USER` / `GMAIL_APP_PASSWORD`
- MFA and login security settings

Generate a dedicated field-encryption key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Store it as `FIELD_ENCRYPTION_KEY` in `backend/.env` or your production secret
store, separately from `SECRET_KEY`. Keep previous field-encryption keys in
`FIELD_ENCRYPTION_OLD_KEYS` when rotating keys; do not rely on Django's
`SECRET_KEY` for encrypted fields. Production Compose configuration forces
`DEBUG=False` and sets the host allowlist independently of the local `.env`.
If existing encrypted records were created when the application fell back to
`SECRET_KEY`, temporarily include that former key in `FIELD_ENCRYPTION_OLD_KEYS`
so those records remain decryptable; do not use it to encrypt new values.

After applying migrations, run `python manage.py encrypt_existing_data` from
`backend/` to encrypt legacy plaintext values, including existing audit service
numbers and audit descriptions. The command supports `--dry-run` to preview the
number of affected records.

### Case document handling

Case uploads are validated by extension, declared MIME type, and file signature,
and are served through authenticated case-scoped download endpoints. The
development media route explicitly blocks direct access to `media/cases/`.
Production web servers, reverse proxies, object stores, and backups must also
keep case media private; do not expose the media directory or a public bucket
URL. Applications should open case files through the authenticated API rather
than navigating directly to a media URL.

The upload limit defaults to 25 MiB and can be changed with
`CASE_DOCUMENT_MAX_UPLOAD_BYTES`. To scan uploads with ClamAV, configure
`CASE_UPLOAD_CLAMAV_ENABLED=True` and the scanner host, port, and timeout. The
scanner must be reachable from the Django application. When enabled, scanner
errors reject the upload; deploy and monitor ClamAV before enabling this
setting.

## Local Development Setup

### 1. Backend

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS/Linux
source .venv/bin/activate

pip install --require-hashes -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

Run Redis locally and start the email worker in another terminal:

```bash
cd backend
celery -A mpims worker --loglevel=INFO
```

Set `CELERY_BROKER_URL` in `backend/.env` to the Redis endpoint the backend and
worker can both reach. Emails are queued and require the worker to be running.
Email payloads are encrypted with `FIELD_ENCRYPTION_KEY` while queued, and
delivery failures are retried by the worker.

The API will be available at:

- http://localhost:8000

`backend/requirements.in` contains the supported dependency ranges and
`backend/requirements.txt` pins the resolved runtime dependency graph with
hashes. When changing Python dependencies, update `requirements.in` and
regenerate the lock from `backend` with:

```bash
python -m pip install pip-tools==7.6.1
python -m piptools compile --generate-hashes --allow-unsafe --resolver=backtracking --output-file requirements.txt requirements.in
```

Commit both files together. Docker builds, Dependabot, and CI use the hashed
`requirements.txt`.

### 2. Frontend

```bash
cd frontend
npm ci
npm start
```

The frontend runs at `http://localhost:3000` and `npm start` opens it in your
default browser.

### 3. Realtime Service

```bash
cd realtime
npm install
npm start
```

This service provides websocket-based notifications and listens for database updates.
Socket.IO clients must pass their current Django JWT access token as
`auth: { token }`; the server validates it against `DJANGO_API_URL` before
joining the authenticated user's notification room. It periodically checks the
token with Django and disconnects sessions that expire or are revoked.
Incident updates are delivered only to the incident's battalion room and
Django-authorized global-reader rooms (superusers, Corps Commanders, and HQS
admins); events without a valid `battalion_id` are not broadcast. Django
Channels has been removed because the project uses the Node.js Socket.IO
service and had no Channels event publishers or clients.

## Docker Setup

The default Compose stack is for local development. It runs Django's development
server and a local PostgreSQL container; do not use it as the production stack.
It now includes Redis and a Celery worker for queued email delivery.

For the already-deployed physical server, `docker-compose.hostdb.yml` is the
production-oriented Compose file. It does not create or replace PostgreSQL, does
not run migrations automatically, binds the API, frontend, realtime service,
and Redis to loopback, and uses Gunicorn. The existing host reverse proxy and
database remain infrastructure you manage separately. This configuration uses
Linux host networking so the app can continue to reach PostgreSQL on
`127.0.0.1`; run it on the Linux server, not Docker Desktop for Windows.

Before using it, configure `backend/.env` with production secrets and database
settings. `DB_HOST` must be reachable from Docker, not necessarily
`localhost`. Configure `realtime/.env` with a `DATABASE_URL` reachable from
Docker as well; the realtime process uses PostgreSQL LISTEN/NOTIFY. The
`realtime/.env.production.example` file shows the expected production values;
copy it to `realtime/.env` and replace the placeholders. Use
`verify-full` and the appropriate CA certificate for TLS database connections.
Do not copy the development credentials into production.

Review the Compose configuration and database backup/migration plan before
running any production commands. Apply migrations deliberately as a separate
operation, after taking a backup:

```powershell
docker compose -f docker-compose.hostdb.yml config --quiet
docker compose -f docker-compose.hostdb.yml build
docker compose -f docker-compose.hostdb.yml run --rm backend python manage.py migrate
docker compose -f docker-compose.hostdb.yml up -d
```

Configure the existing HTTPS reverse proxy for `marshal.mod.go.ke` to route the
frontend to `127.0.0.1:3000`, Django API and admin requests to
`127.0.0.1:8000`, and `/socket.io/` with WebSocket upgrade support to
`127.0.0.1:4000`. Keep `/media/` private; do not map it to a public static-file
route. Case uploads persist in `backend/media` on the host. Redis listens only
on loopback port `6380`.

The configuration uses host networking for backend, worker, Redis, and realtime
services. The API/worker must use the production database and secrets from
`backend/.env`; the realtime service needs its own PostgreSQL URL in
`realtime/.env`. For this host-networked deployment, `127.0.0.1` points to the
physical server. Preserve any existing production `.env` files rather than
replacing them with the example templates.

To create a source-sharing ZIP on Windows without Git metadata, virtual
environments, dependencies, build output, media, or environment secrets, run
`.\tools\create-source-archive.ps1` from the repository root. It writes the ZIP
beside the repository and refuses to overwrite an existing archive unless
`-Force` is specified.

To start the local development stack, from the project root run:

```bash
docker compose up --build
```

This will start:

- PostgreSQL database
- Django backend on port 8000
- React frontend on port 3000
- Node realtime service on port 4000
- Redis and a Celery email worker

## Useful Commands

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
python manage.py collectstatic
python manage.py test
```

## Continuous Integration and Dependency Security

GitHub Actions runs Django checks, migration drift checks and backend tests
against PostgreSQL; builds and tests the frontend; runs realtime tests; audits
Python and npm dependencies; scans source and built container images; and builds
all three Docker images. Dependabot checks Python, npm, and GitHub Actions
dependencies weekly. The workflow validates changes but does not deploy to the
physical server.

The frontend and realtime npm installs use committed lockfiles and `npm ci`.
Backend installs use `backend/requirements.txt` with package hashes. Update
Python dependency ranges in `backend/requirements.in`, regenerate and commit
the lock as described in Local Development Setup, then run the same checks
before merging.

## Notes

- The application is configured for Africa/Nairobi timezone.
- Preserve the existing Django migration history, including repair and merge
  migrations. Do not delete or rewrite applied migrations. Consider squashing
  only after schema stabilization, against a known production baseline, with
  both fresh-database and upgrade-path testing.
- Case numbers are allocated from a per-year database counter under a row lock.
  Apply the cases migration before creating cases so existing yearly numbers
  seed the counters and concurrent creates cannot reuse a number.
- Add database indexes only after reviewing representative PostgreSQL query
  plans and production query patterns. Case list filters include status,
  battalion/detachment assignment, team/person assignment, accused unit/service,
  and several date ranges; foreign keys and `case_number` already have their
  default indexes/uniqueness. Avoid adding overlapping composite indexes
  without confirming their benefit against real workload and write overhead.
- JWT access tokens expire after 15 minutes and refresh tokens after two days;
  refresh rotation and blacklist-based revocation are enabled. Logout, password
  changes/resets, account deactivation, and administrator MFA resets invalidate
  existing sessions. Run database migrations before deploying these changes.
- Google Authenticator TOTP MFA is mandatory for every account and role. Legacy
  exemption and email-OTP flags are ignored; users without a confirmed
  authenticator can only access the setup flow and minimal account endpoints.
- Django admin sign-in also requires a current Google Authenticator code.
- In development, hosts may be relaxed for local testing; CORS still uses an
  explicit origin allowlist.
- Production requires TLS for PostgreSQL connections (`verify-full` by default),
  redirects HTTP to HTTPS, uses secure session/CSRF cookies, enables HSTS for one
  year, and allows only the configured frontend origin. Confirm HTTPS and trusted
  proxy forwarding before enabling the production configuration. Set
  `DB_SSLROOTCERT` to the mounted CA certificate path when PostgreSQL's CA is not
  in the system trust store.

## License

This project does not currently include a specific license declaration. Add a license file if you intend to distribute or share the project publicly.
