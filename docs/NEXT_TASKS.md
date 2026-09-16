# 다음 작업 준비

> 현재 단계: API 승인·Vercel 배포 완료, 로그인 없는 공개형 Supabase 읽기 경로 검증 완료, KMA 10년 백필·월별 요약 view 운영 검증 완료, KOSIS 공개 snapshot 읽기 UI 구현
>
> 기준일: 2026-09-17

## 사용자가 준비할 입력

### Supabase

필수:

- Supabase Project URL
- 브라우저용 Publishable Key를 현재 코드의 `VITE_SUPABASE_ANON_KEY`에 설정
- 서버용 Secret Key를 현재 코드의 `SUPABASE_SERVICE_ROLE_KEY`에 설정
- `0001_initial_schema.sql`~`0003_kma_climate.sql` 실행 여부
- 장기 조회 최적화를 위한 `0004_climate_period_summaries.sql` 실행 및 공개 조회 여부
- 로그인 없이 공개 읽기만 허용하는 RLS 검증 결과

현재 MVP는 로그인 화면을 제공하지 않는다. 방문자는 게시된 자료와 활동을 공개적으로 읽고 사용할 수 있으며, `learner_attempts`는 브라우저에서 직접 읽거나 쓰지 못한다. 학습 기록을 저장할 필요가 생기면 로그인 도입 대신 먼저 검증·속도제한된 서버 제출 함수를 추가한다.

Supabase의 핵심 목적은 로그인보다 데이터 저장이다. API를 매번 호출하지 않고 KMA·KOSIS·SGIS의 기간 자료를 snapshot·정규화 관측값·파생지표로 저장해 같은 수업 자료를 재현 가능하게 제공한다. 자세한 경계는 [Supabase 역할 문서](SUPABASE_ROLE.md)를 따른다.

Secret Key·계정 비밀번호·데이터베이스 비밀번호는 채팅이나 GitHub에 올리지 않는다. 로컬 `.env.local`과 Vercel Environment Variables에 직접 저장한다.

선택:

- Storage bucket 이름과 공개/비공개 여부
- 학습자 인증 방식: 초기에는 미로그인 공개 탐구, 이후 anonymous sign-in 또는 교사 계정

### VWorld

Vercel 배포 후 다음 두 값을 확정한다.

1. 실제 운영 hostname: `geoapieducation.vercel.app`
2. VWorld 관리 화면에 등록한 hostname

두 값이 일치하도록 Vercel 환경변수 `VITE_VWORLD_DOMAIN`을 설정한다. 로컬에서는 코드가 현재 브라우저 hostname을 자동 사용한다.

### KOSIS

첫 번째 탐구 자료로 사용할 통계표의 다음 정보가 필요하다.

- `orgId`
- `tblId`
- 지역코드 수준
- 지표·항목 코드
- 기준연도 범위
- 총량 또는 비율 분모

## 구현 작업 순서

| 순서 | 작업 | 선행조건 | 완료 기준 |
| --- | --- | --- | --- |
| 1 | Supabase 연결·PostGIS·공개 RLS 확인 | 프로젝트 생성, `0001`~`0003` migration 실행 | `data_sources`·기후자료 read가 실제 REST에서 동작하고 `learner_attempts` 공개 접근은 `401/403`으로 차단 |
| 2 | KMA 관측소·ASOS 일자료 수집 계약 | 승인된 API, 대표 도시 목록 | station metadata와 daily snapshot fixture/schema 통과 |
| 3 | KMA 최근 10년 백필 | 작은 샘플 성공, `0003` 적용 | 10개 도시·36,530행 백필 및 `0004` 월별 요약 조회 완료 |
| 4 | KOSIS 첫 통계표 adapter | 표 ID와 코드 확정 | **검색·메타데이터·제한 조회·controlled snapshot CLI·공개 snapshot 읽기 UI 구현**; 첫 수업용 표의 실제 적재 대기 |
| 5 | 2D 지도 제작기 | 1~4번의 snapshot + SGIS/VWorld 경계 | **KMA 관측소 위치 레이어·KOSIS 공개값 준비 패널·SGIS 경계 확인 패널·정확한 코드 조인 진단·조건부 단계구분도·값 결합 없는 기준 면 레이어 완료**; 검증된 단일 기간·단위 snapshot으로 실제 색상·범례를 검증한 뒤 범례 편집·출처·분류 설정 확장 |
| 6 | 자료 활용 탐구 활동 | 5번의 material | 관찰·증거 선택·주장·근거·제한점 입력과 재생 가능 |
| 7 | 3D 지형·입체 통계 | 5번의 공통 data contract | 3D 장면과 2D/표 fallback, 고도·배율·출처 표시 |
| 8 | 배포·운영 QA | Vercel hostname, secrets | CI, API failure fallback, 모바일·접근성·키 노출 검사 |

## 병렬 에이전트 작업 레인

작업 충돌을 줄이기 위해 migration·공통 계약을 먼저 고정한다.

```text
Lane A: Supabase schema / repositories / RLS
        ↓
Lane B: KMA ingest / climate metrics
Lane C: KOSIS ingest / metadata normalization
Lane D: 2D VWorld renderer / material recipe UI
Lane E: 3D renderer / terrain interaction
        ↓
Lane F: inquiry flow / provenance / E2E QA
```

각 레인은 다음을 커밋 단위에 포함한다.

- 변경 파일 범위
- data contract 또는 schema version
- fixture와 실제 데이터의 구분
- `npm run typecheck`, `npm test`, `npm run build` 결과
- API 출처·약관·호출량 확인일
- 다른 레인과의 의존성 또는 충돌 가능성

## 첫 번째 실제 구현 단위

첫 구현은 다음 범위로 제한한다.

```text
KMA ASOS station info
      +
KMA ASOS daily period data
      ↓
Supabase source_snapshots / climate_stations / climate_daily_observations
      ↓
최근 10년 주요 도시 기후 비교표
      ↓
2D 자료 제작 → 비교·변화 탐구 활동
```

이 단위를 끝낸 뒤에 KOSIS 주제도와 3D 지형 자료를 병렬로 확장한다. 원천 API를 학생 화면에서 직접 반복 호출하지 않고, 작은 범위의 수집·검증·스냅샷 생성이 통과한 뒤 범위를 늘린다.

현재 Supabase 공개 읽기 스모크 검증은 완료되었다. `data_sources`와 게시 자료 조회는 `HTTP 200`, `learner_attempts` 조회는 `HTTP 401`로 확인했다. 이 결과는 로그인 없는 공개 이용 정책과 직접 학습기록 차단 정책이 운영 프로젝트에서 작동함을 뜻한다.

이번 단계에서 추가한 `0005_kosis_observation_access.sql`은 첫 KOSIS snapshot을 적재하기 전에 Supabase
SQL Editor에서 한 번 실행한다. 이 migration을 실행하기 전에는 `--write` 적재를 진행하지 않는다.

다음 데이터 작업 명령은 작은 샘플부터 실행한다.

```bash
# Supabase SQL Editor에서 0003_kma_climate.sql과 0004_climate_period_summaries.sql 실행 후 (운영 프로젝트에는 적용 완료)
node scripts/kma-climate.mjs --from=2024-01-01 --to=2024-01-03 --stations=108,133,159 --write
```

작은 적재가 성공한 뒤 운영 범위를 늘린다.

```bash
node scripts/kma-climate.mjs \
  --from=2016-01-01 --to=2025-12-31 \
  --stations=101,105,108,112,133,143,146,156,159,184 \
  --write
```

적재 후 `/create/chart`에서 기간·지표를 바꾸어 관측소별 값과 유효 관측일수를 확인한다. 10년 백필과 `0004_climate_period_summaries.sql` 적용은 완료되었으며, 월 경계 장기 범위는 요약 view를 읽고 월 중간 범위는 정확성을 위해 일자료를 읽는다. `/create/2d`에서는 같은 관측소 집합을 VWorld 배경 위에 표시하고, KOSIS를 선택하면 SGIS 기준경계 면 레이어도 표시한다. 다음 단계는 `0005_kosis_observation_access.sql` 적용 여부를 확인하고, KOSIS 검색 결과에서 첫 수업용 통계표를 확정한 뒤 controlled snapshot CLI로 메타데이터·원자료·지역코드를 Supabase에 적재하고 KOSIS 지역코드와 SGIS `adm_cd` 대응표를 검증하는 것이다. 대응표가 검증된 뒤에만 2D 주제 레이어·단계구분도를 연결한다. adapter·적재·브라우저 읽기 경로는 [KOSIS adapter 계약](KOSIS_ADAPTER.md)에 기록했다.
