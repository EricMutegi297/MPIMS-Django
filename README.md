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

## Prerequisites

Before running the project, make sure you have:

- Python 3.11+
- Node.js 18+
- PostgreSQL 16
- pip / virtual environment support
- Docker and Docker Compose (optional, for containerized setup)

## Environment Configuration

The backend uses environment variables from `backend/.env`.

A sample configuration is provided in `backend/.env.example`.

Typical variables include:

- `SECRET_KEY`
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

## Local Development Setup

### 1. Backend

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

The API will be available at:

- http://localhost:8000

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

The frontend runs at:

- http://localhost:3000

### 3. Realtime Service

```bash
cd realtime
npm install
npm start
```

This service provides websocket-based notifications and listens for database updates.

## Docker Setup

From the project root:

```bash
docker compose up --build
```

This will start:

- PostgreSQL database
- Django backend on port 8000
- React frontend on port 3000
- Node realtime service on port 4000

## Useful Commands

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
python manage.py collectstatic
python manage.py test
```

## Notes

- The application is configured for Africa/Nairobi timezone.
- The backend uses JWT authentication with optional MFA/TOTP enforcement.
- In development, CORS and host settings are relaxed to support localhost testing and local network access.

## License

This project does not currently include a specific license declaration. Add a license file if you intend to distribute or share the project publicly.
