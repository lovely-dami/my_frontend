"""
Django settings for the 성령의 나무 (Holy Spirit Tree) backend.
"""

from pathlib import Path
import os
import warnings

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from backend/.env if present
load_dotenv(BASE_DIR / '.env')


def env_bool(key, default=False):
    return os.environ.get(key, str(default)).lower() in {'1', 'true', 'yes', 'on'}


def env_thresholds(key, default):
    """콤마로 구분된 오름차순 정수 목록을 읽는다. 형식이 어긋나면 기본값을 쓴다.

    행사 중에 값을 잘못 넣어도 서버가 죽으면 안 되므로 예외 대신 경고 후 기본값으로
    떨어진다(단계가 하나 틀린 것보다 화면이 안 뜨는 쪽이 훨씬 나쁘다).
    """
    raw = os.environ.get(key)
    if not raw:
        return default
    try:
        values = [int(v.strip()) for v in raw.split(',') if v.strip()]
    except ValueError:
        values = []
    # 영상 자산이 tree_1~4.mp4 4개뿐이라 단계 수는 4로 고정이다.
    ok = (len(values) == len(default)
          and values[0] == 0
          and all(a < b for a, b in zip(values, values[1:])))
    if not ok:
        warnings.warn(f'{key}={raw!r} 형식이 올바르지 않아 기본값 {default} 을 사용합니다.')
        return default
    return values


# SECURITY: override SECRET_KEY in production via environment variable.
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-1(axyd5c7%3uni143%+8*39dahdvkhr*3@p_1!*l=irt5h^mcy',
)

DEBUG = env_bool('DEBUG', True)

ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()
]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # third party
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    # local
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database — SQLite by default, PostgreSQL in production via DATABASE_URL.
DATABASES = {
    'default': dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}


# Custom user model with role support
AUTH_USER_MODEL = 'core.User'


AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 4}},
]

# 빠른 로그인/회원가입을 위해 가벼운 해시(MD5)를 사용한다.
# 소규모 내부용(교회 행사·30명·2개월)이라 강한 PBKDF2(수십만 반복)는 과도하고,
# 약한 CPU에서 로그인 지연의 주범이 된다.
# 기존 PBKDF2 비밀번호도 그대로 로그인되며(접두사로 방식 인식), 로그인 시 자동으로 MD5로 전환된다.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]


# Django REST Framework — token auth by default
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}


# CORS — allow the Vite dev server and any configured frontend origins.
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:5173,http://127.0.0.1:5173',
    ).split(',') if o.strip()
]

CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()
]


# Internationalization
LANGUAGE_CODE = 'ko-kr'
TIME_ZONE = 'Asia/Seoul'
USE_I18N = True
USE_TZ = True


# Static files
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# 공동체 나무 — 각 단계에 도달하는 데 필요한 "누적 기부 달란트".
#   1단계 → 2단계: +10  (누적 10)
#   2단계 → 3단계: +14  (누적 24)
#   3단계 → 4단계: +16  (누적 40)
# 8회 지급 × 회당 약 5달란트 = 40 기준으로, 마지막 지급일 즈음 만개하도록 잡았다.
# 실제 기부 속도에 맞춰 재배포 없이 조정할 수 있도록 환경변수로 뺐다.
#   예) COMMUNITY_THRESHOLDS=0,10,24,40   (항상 0으로 시작하는 오름차순 4개)
COMMUNITY_THRESHOLDS = env_thresholds('COMMUNITY_THRESHOLDS', [0, 10, 24, 40])

# Behind a proxy (Render/Railway) the scheme comes in via this header.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
