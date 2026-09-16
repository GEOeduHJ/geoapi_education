# Supabase 역할과 공개 이용 정책

> 기준일: 2026-09-16

## 결론

현재 GeoLab Classroom에서 Supabase는 **로그인 구현을 위한 서비스가 아니다.**

MVP의 Supabase 역할은 다음 세 가지다.

1. 기상청·KOSIS·SGIS에서 수집한 반복 사용 자료를 저장한다.
2. 원자료 요청 시점, 기간, 출처, checksum, 변환 규칙을 보존한다.
3. 검증이 끝난 교육자료와 파생지표를 방문자에게 공개 읽기로 제공한다.

로그인과 계정은 구현하지 않는다. 교사나 학습자가 사이트에 접속하기 위해 계정을 만들 필요가 없으며, 브라우저에는 Supabase Publishable Key만 전달한다.

## 데이터 흐름

```text
기상청 / KOSIS / SGIS 공식 API
        ↓  서버 수집기·GitHub Actions
Supabase Postgres + PostGIS
  ├─ 출처·요청·checksum
  ├─ 정규화 관측값·통계값
  ├─ 파생지표·자료 제작 레시피
  └─ 공개 게시 상태
        ↓  Publishable Key + RLS
공개 방문자의 2D·3D·차트 탐구 화면
```

## 역할별 경계

| 기능 | Supabase 사용 여부 | 현재 정책 |
|---|---|---|
| 로그인·회원가입 | 사용하지 않음 | 공개 방문자로 이용 |
| 과거 기후·통계자료 저장 | 사용 | API를 매번 호출하지 않고 DB 스냅샷 조회 (`0003_kma_climate.sql`) |
| 장기 기후자료 조회 | 사용 | `climate_period_summaries` 월별 view로 일자료를 서버에서 집계 (`0004_climate_period_summaries.sql`) |
| 원자료 요청정보·출처 보존 | 사용 | `data_sources`, `source_snapshots`에 저장 |
| 공간자료·관측값 저장 | 사용 | Postgres/PostGIS와 정규화 테이블 사용 |
| 게시된 학습자료 조회 | 사용 | `anon`/`authenticated`의 SELECT만 허용 |
| 자료 제작 임시 저장 | 현재 미구현 | 브라우저 직접 INSERT 금지; 이후 서버 제출 경로 검토 |
| 학습자 답안 저장 | 현재 미구현 | `learner_attempts` 공개 SELECT/INSERT 금지 |
| 큰 원자료·GeoJSON·업로드 파일 | 향후 Storage 사용 | 공개/비공개 bucket과 별도 정책을 정한 뒤 추가 |

## 키와 실행 위치

| 키 | 실행 위치 | 역할 |
|---|---|---|
| `VITE_SUPABASE_URL` | 브라우저 번들 | 프로젝트 주소 |
| `VITE_SUPABASE_ANON_KEY` | 브라우저 번들 | Publishable Key 호환 변수명. RLS가 허용한 공개 SELECT만 수행 |
| `SUPABASE_URL` | Vercel 함수·수집기 | 서버용 프로젝트 주소 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel 함수·GitHub Actions·로컬 수집기 | Secret Key 호환 변수명. RLS를 우회하므로 브라우저에 절대 노출하지 않음 |

새 `sb_publishable_...`·`sb_secret_...` 값을 현재 호환 변수명에 넣어도 된다. 변수명에 `VITE_`가 붙은 서버 Secret은 만들지 않는다.

## 왜 API를 매번 호출하지 않는가

최근 10년 기후, KOSIS 시계열, 행정구역 경계처럼 값이 축적된 자료를 학생 화면에서 매번 원천 API로 요청하면 다음 문제가 생긴다.

- 수업 중 같은 자료를 반복 요청해 호출 한도를 소모한다.
- API 장애나 응답 형식 변경이 학생 화면에 즉시 전파된다.
- 당시 어떤 기간·단위·분모·경계·결측 규칙을 사용했는지 재현하기 어렵다.
- 학생마다 요청 시점이 달라져 같은 활동에서 서로 다른 자료를 볼 수 있다.

따라서 수집 단계에서 기간과 파라미터를 고정하고, 원자료 checksum과 정규화·집계식을 함께 저장한다. 학생 화면은 고정된 snapshot을 읽는다.

## 공개 RLS 정책

- `data_sources`: 공개 출처 목록 읽기
- `source_snapshots`: 게시 자료가 참조하거나 공개 데이터셋으로 표시된 snapshot만 읽기
- `learning_materials`: `status = 'published'`인 자료만 읽기
- `inquiry_activities`: 게시 자료에 연결된 활동만 읽기
- `climate_stations`, `climate_daily_observations`, `climate_period_summaries`: 개인정보가 없는 검증된 기후 데이터이므로 공개 읽기
- `learner_attempts`: 브라우저 권한 자체를 제거해 직접 읽기·쓰기를 차단

RLS는 “로그인 여부를 검사하는 기능”이 아니라 **같은 공개 키를 가진 모든 방문자가 볼 수 있는 행의 범위를 제한하는 데이터 접근 규칙**으로 사용한다. 상세 원칙은 [Supabase RLS 공식 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)와 [API 키 공식 문서](https://supabase.com/docs/guides/getting-started/api-keys)를 따른다.

## 향후 답안 저장을 추가할 때

로그인을 다시 도입하는 것이 첫 선택은 아니다. 답안 저장이 필요해지면 다음 순서로 검토한다.

1. 브라우저에는 답안을 저장하지 않고, 서버 함수가 허용된 필드만 받는다.
2. 서버에서 activity 공개 여부, payload 크기, 문자열 길이, rate limit을 검증한다.
3. 서버 Secret으로 `learner_attempts`에 기록하고 개인정보는 수집하지 않는다.
4. 교사가 학습기록을 식별해야 할 때만 별도 계정·익명 세션 도입을 검토한다.

즉, **공개 학습 이용**과 **내부 기록 관리**를 분리한다. 로그인은 향후 관리 요구가 생길 때 추가할 선택 기능이며, 현재 데이터 저장의 목적과는 별개다.
