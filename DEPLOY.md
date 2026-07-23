# 배포 가이드 — 성령의 나무

매주 일요일 · 약 2개월 운영 · 8월 결산 패턴에 맞춘 **무료** 배포 구성.

| 레이어 | 서비스 | 비고 |
|---|---|---|
| 프론트엔드 | **Vercel** | 정적 호스팅, 만료 없음 |
| 백엔드 (Django) | **Render** 무료 웹서비스 | 15분 미사용 시 잠듦 → 첫 접속 콜드스타트 30~60초 |
| 데이터베이스 | **Neon** 무료 PostgreSQL | 만료 없음. Render 무료 DB는 쓰지 않음 (아래 경고) |

---

## ⚠️ 가장 중요 — Render 무료 PostgreSQL은 쓰지 말 것

Render는 2024년 5월부터 무료 PostgreSQL **만료를 90일 → 30일로 단축**했습니다.

- 생성 후 **30일 뒤 만료**, 이후 **14일 유예 → 데이터 영구 삭제**.
- 6월에 만들면 **8월 결산 전에 데이터가 거의 확실히 삭제**됩니다.
- 즉 "위험"이 아니라 사실상 "삭제 예정". → **외부 무료 Postgres 필수.**

### Neon vs Supabase — Neon 권장

- **Neon (1순위)**: 만료 없음. 5분 미사용 시 컴퓨트만 잠들고 다음 쿼리에서 ~0.5초 만에 깨어남. 주 1회 패턴에 영향 없음.
- **Supabase (차선)**: 약 **7일 미사용 시 프로젝트 일시정지**. 일요일마다 = 정확히 7일 간격이라 경계선이라 아슬아슬함.

---

## 1) 데이터베이스 — Neon

1. https://neon.tech 가입 → New Project 생성 (리전: 아무 곳, 가까운 곳).
2. 대시보드에서 **Connection string** 복사. 형태:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
   - `?sslmode=require`가 붙어 있으면 **그대로** 사용 (지우지 말 것).
3. 이 문자열을 Render의 `DATABASE_URL` 환경변수에 넣습니다 (아래 3단계).

---

## 2) 백엔드 — Render

`render.yaml`은 **외부 DB용**으로 구성되어 있습니다 (`databases` 블록 없음, `DATABASE_URL`은 수동 입력).

1. https://dashboard.render.com → **New → Blueprint** → 이 저장소 선택.
2. Render가 `render.yaml`을 읽어 웹서비스를 생성합니다.
3. 환경변수 확인/입력:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Neon connection string (1단계) |
   | `SECRET_KEY` | 자동 생성됨 (generateValue) |
   | `DEBUG` | `False` |
   | `ALLOWED_HOSTS` | `.onrender.com` |
   | `CORS_ALLOWED_ORIGINS` | 프론트 배포 후 입력 (예: `https://holytree.vercel.app`) |
   | `CSRF_TRUSTED_ORIGINS` | 동일하게 입력 |
   | `COMMUNITY_THRESHOLDS` | (선택) 공동체 나무 단계별 누적 기부량. 미설정 시 `0,10,24,40` |

   > `COMMUNITY_THRESHOLDS`는 **0으로 시작하는 오름차순 정수 4개**여야 합니다(영상이 4단계).
   > 형식이 틀리면 서버가 죽지 않고 경고 후 기본값으로 동작합니다.
   > 대시보드에서 값만 바꾸고 재시작하면 되며, 재배포는 필요 없습니다.
   > `render.yaml`에는 일부러 넣지 않았습니다 — 넣으면 Blueprint 동기화가 대시보드 값을 덮어씁니다.
4. 첫 배포 후 **Shell** 탭에서 데모 데이터/관리자 생성:
   ```bash
   python manage.py seed_demo        # 데모 학생/교사 시드
   python manage.py createsuperuser  # admin 계정 (선택)
   ```
   - `build.sh`는 `migrate`까지만 수행하므로 시드/관리자는 수동 실행.
5. 백엔드 URL 확인: `https://holytree-api.onrender.com`
   - 관리자: `https://holytree-api.onrender.com/admin/`
   - API base: `.../api/`

---

## 3) 프론트엔드 — Vercel

1. https://vercel.com → **Add New → Project** → 이 저장소 선택.
2. Framework: **Vite** 자동 감지. Build: `npm run build`, Output: `dist`.
3. 환경변수:
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://holytree-api.onrender.com/api` |
4. 배포 후 도메인 확인: `https://holytree.vercel.app`
   - 프로젝트 이름 = 서브도메인 (소문자/숫자/하이픈, 전역 고유).

---

## 4) 연결 마무리 — CORS

프론트 도메인이 확정되면 Render 환경변수를 **정확한 도메인**으로 갱신:

```
CORS_ALLOWED_ORIGINS = https://holytree.vercel.app
CSRF_TRUSTED_ORIGINS = https://holytree.vercel.app
```

→ Render 재배포 후 학생/교사가 `https://holytree.vercel.app` 로 접속.
행사용 큰 화면은 `https://holytree.vercel.app/?display`.

---

## 운영 팁

- **콜드스타트**: 일요일 행사 몇 분 전 백엔드 URL을 한 번 열어 깨워두면 첫 접속이 빠름.
- **결산(8월)**: Neon 대시보드에서 데이터가 유지되므로 누적 기부/기록을 그대로 조회 가능.
- **포트**: 배포 환경에선 포트 번호 불필요 (Render/Vercel이 443/HTTPS로 처리). 로컬만 8000/5173 사용.
