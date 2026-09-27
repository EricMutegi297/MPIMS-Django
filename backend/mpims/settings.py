from pathlib import Path
from decouple import config
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY")
FIELD_ENCRYPTION_KEY = config("FIELD_ENCRYPTION_KEY", default="").strip()
if not FIELD_ENCRYPTION_KEY:
    raise ImproperlyConfigured("Set FIELD_ENCRYPTION_KEY to a dedicated Fernet key.")
if FIELD_ENCRYPTION_KEY == SECRET_KEY:
    raise ImproperlyConfigured("FIELD_ENCRYPTION_KEY must be different from SECRET_KEY.")
FIELD_ENCRYPTION_OLD_KEYS = config("FIELD_ENCRYPTION_OLD_KEYS", default="")
CASE_DOCUMENT_MAX_UPLOAD_BYTES = config(
    "CASE_DOCUMENT_MAX_UPLOAD_BYTES",
    default=25 * 1024 * 1024,
    cast=int,
)


def _as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on", "debug", "development", "dev"}:
        return True
    if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
        return False
    return default


CASE_UPLOAD_CLAMAV_ENABLED = _as_bool(
    config("CASE_UPLOAD_CLAMAV_ENABLED", default=False),
    default=False,
)
CASE_UPLOAD_CLAMAV_HOST = config("CASE_UPLOAD_CLAMAV_HOST", default="127.0.0.1")
CASE_UPLOAD_CLAMAV_PORT = config("CASE_UPLOAD_CLAMAV_PORT", default=3310, cast=int)
CASE_UPLOAD_CLAMAV_TIMEOUT = config("CASE_UPLOAD_CLAMAV_TIMEOUT", default=10, cast=int)

DEBUG = _as_bool(config("DEBUG", default=False), default=False)
_allowed_hosts = config("ALLOWED_HOSTS", default="localhost,127.0.0.1").split(",")
ALLOWED_HOSTS = ["*"] if DEBUG else _allowed_hosts
USE_X_FORWARDED_HOST = _as_bool(config("USE_X_FORWARDED_HOST", default=True))
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = config(
    "SECURE_HSTS_SECONDS",
    default=0 if DEBUG else 31_536_000,
    cast=int,
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG and SECURE_HSTS_SECONDS > 0
SECURE_HSTS_PRELOAD = not DEBUG and SECURE_HSTS_SECONDS > 0
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "django_apscheduler",
    # Local apps
    "apps.users",
    "apps.cases",
    "apps.incidents",
    "apps.dutyrooms",
    "apps.guardrooms",
    "apps.notifications",
    "apps.audit",
    "apps.morningbriefs",
    "apps.formations",
    "apps.offences",
    "apps.todos",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.audit.middleware.AuditLogMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mpims.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mpims.wsgi.application"
ASGI_APPLICATION = "mpims.asgi.application"

# ── Database ─────────────────────────────────────────────────────────────────
DB_SSLMODE = config(
    "DB_SSLMODE",
    default="prefer" if DEBUG else "verify-full",
).strip().lower()
if not DEBUG and DB_SSLMODE not in {"require", "verify-ca", "verify-full"}:
    raise ImproperlyConfigured(
        "Production DB_SSLMODE must require TLS (require, verify-ca, or verify-full)."
    )

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="mpims_db"),
        "USER": config("DB_USER", default="mpims_user"),
        "PASSWORD": config("DB_PASSWORD"),
        "HOST": config("DB_HOST", default="localhost"),
        "PORT": config("DB_PORT", default="5432"),
        "OPTIONS": {
            "sslmode": DB_SSLMODE,
        },
    }
}
DB_SSLROOTCERT = config("DB_SSLROOTCERT", default="").strip()
if DB_SSLROOTCERT:
    DATABASES["default"]["OPTIONS"]["sslrootcert"] = DB_SSLROOTCERT

# ── Auth ─────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "users.User"

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_ENGINE = "django.contrib.sessions.backends.db"

# ── REST Framework ────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.users.authentication.MPIMSJWTAuthentication",
        "apps.users.authentication.MPIMSSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "mpims.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 25,
}

# ── JWT ───────────────────────────────────────────────────────────────────────
from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=2),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in config(
        "CORS_ALLOWED_ORIGINS", default="http://localhost:3000,https://localhost:3000"
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in config(
        "CSRF_TRUSTED_ORIGINS",
        default="http://localhost:3000,https://localhost:3000",
    ).split(",")
    if origin.strip()
]

# ── Internationalisation ──────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Nairobi"
USE_I18N = True
USE_TZ = True

# ── Static / Media ────────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Email ─────────────────────────────────────────────────────────────────────
GMAIL_USER = config("GMAIL_USER", default="")
GMAIL_APP_PASSWORD = config("GMAIL_APP_PASSWORD", default="")
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default=GMAIL_USER)
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default=GMAIL_APP_PASSWORD)
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default=(
        "django.core.mail.backends.smtp.EmailBackend"
        if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD
        else "django.core.mail.backends.console.EmailBackend"
    ),
)
EMAIL_HOST = config(
    "EMAIL_HOST",
    default="smtp.gmail.com" if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD else "",
)
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL",
    default=f"MPIMS <{EMAIL_HOST_USER}>" if EMAIL_HOST_USER else "MPIMS <noreply@mpims.ke>",
)
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:3000")

# Asynchronous email and background jobs use the same Redis broker.
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_PUBLISH_RETRY = True
CELERY_IMPORTS = ("apps.common.tasks",)

# Google Authenticator / TOTP MFA is mandatory for every account and role.
TOTP_REQUIRED = True
TOTP_ISSUER_NAME = config("TOTP_ISSUER_NAME", default="MPIMS")
TOTP_CODE_WINDOW = config("TOTP_CODE_WINDOW", default=1, cast=int)
TOTP_SETUP_TOKEN_LIFETIME_MINUTES = config("TOTP_SETUP_TOKEN_LIFETIME_MINUTES", default=30, cast=int)
TOTP_LOCKOUT_MINUTES = config("TOTP_LOCKOUT_MINUTES", default=15, cast=int)

# Case reminder scheduler. Keep it off by default in local DEBUG runs so a
# stopped database does not block the development server reload cycle.
CASE_REMINDER_SCHEDULER_ENABLED = config(
    "CASE_REMINDER_SCHEDULER_ENABLED",
    default=not DEBUG,
    cast=bool,
)

# Brute-force protection.
LOGIN_FAILURE_LIMIT = config("LOGIN_FAILURE_LIMIT", default=5, cast=int)
LOGIN_IP_FAILURE_LIMIT = config("LOGIN_IP_FAILURE_LIMIT", default=25, cast=int)
LOGIN_FAILURE_WINDOW_MINUTES = config("LOGIN_FAILURE_WINDOW_MINUTES", default=15, cast=int)
LOGIN_LOCKOUT_MINUTES = config("LOGIN_LOCKOUT_MINUTES", default=15, cast=int)
PASSWORD_RESET_RATE_LIMIT = config("PASSWORD_RESET_RATE_LIMIT", default=3, cast=int)
PASSWORD_RESET_IP_RATE_LIMIT = config("PASSWORD_RESET_IP_RATE_LIMIT", default=10, cast=int)
PASSWORD_RESET_RATE_WINDOW_MINUTES = config("PASSWORD_RESET_RATE_WINDOW_MINUTES", default=15, cast=int)
PASSWORD_RESET_LOCKOUT_MINUTES = config("PASSWORD_RESET_LOCKOUT_MINUTES", default=15, cast=int)
PASSWORD_RESET_CONFIRM_FAILURE_LIMIT = config("PASSWORD_RESET_CONFIRM_FAILURE_LIMIT", default=10, cast=int)
PASSWORD_RESET_CONFIRM_IP_FAILURE_LIMIT = config("PASSWORD_RESET_CONFIRM_IP_FAILURE_LIMIT", default=50, cast=int)
PASSWORD_RESET_CONFIRM_WINDOW_MINUTES = config("PASSWORD_RESET_CONFIRM_WINDOW_MINUTES", default=15, cast=int)
PASSWORD_RESET_CONFIRM_LOCKOUT_MINUTES = config("PASSWORD_RESET_CONFIRM_LOCKOUT_MINUTES", default=15, cast=int)
