# 백엔드·저장소 선택 결정서

> 검토 기준일: 2026-09-16
>
> 대상: 지리교육용 자료 제작·자료 활용 탐구 학습 사이트

## 결정

현재 MVP는 **Supabase를 유지**한다.

이 사이트의 핵심 데이터는 단순한 사용자 문서가 아니라 다음 네 종류가 결합된 형태다.

- KOSIS·기상청·SGIS의 시계열·지역 통계
- 관측소·행정구역·관광지·충전소·지진 등의 점·선·면 공간자료
- 원자료 스냅샷, 출처, 라이선스, 변환식, 파생지표의 계보
- 교사가 만든 2D·3D·차트 자료와 학습자의 탐구 답안

따라서 현재 설계의 **관계형 질의 + PostGIS + RLS + 파일 Storage + 선택적 Auth**를 한 프로젝트 안에서 유지할 수 있는 Supabase가 가장 적은 추가 인프라로 요구사항을 충족한다. 초기 MVP에서는 Auth를 사용하지 않고 공개 게시 자료 읽기만 허용하며, 필요할 때만 익명 제출용 서버 경로 또는 교사 계정을 추가한다. Supabase는 PostGIS 확장을 대시보드에서 활성화할 수 있고, 이를 통해 Point·Polygon·LineString과 공간 인덱스를 사용할 수 있다.

- [Supabase PostGIS 안내](https://supabase.com/docs/guides/database/extensions/postgis)
- [Supabase Database 개요](https://supabase.com/docs/guides/database/overview)
- [Supabase Storage 보안·RLS](https://supabase.com/docs/guides/storage/security/access-control)

## 무료 플랜에서의 운영 전제

Supabase 무료 플랜은 공식 요금표 기준으로 프로젝트당 데이터베이스 500MB, 파일 Storage 1GB, egress 5GB, 월간 활성 사용자 50,000명, 무제한 API 요청을 제공한다. 무료 프로젝트는 1주일 비활성 후 일시 정지될 수 있고, 무료 플랜에는 자동 백업이 포함되지 않으며 최대 2개의 활성 프로젝트가 제공된다.

- [Supabase 공식 요금표](https://supabase.com/pricing)

따라서 원자료 전체를 Postgres의 `jsonb`에 무제한 쌓지 않는다.

1. Postgres에는 정규화된 관측값·통계값·기하·파생지표·자료 메타데이터를 저장한다.
2. 큰 원자료 응답·GeoJSON·교사 업로드 파일은 Storage 또는 별도 버전 보관 대상으로 분리한다.
3. 학생 화면은 매번 원천 API를 호출하지 않고 스냅샷과 파생지표를 조회한다.
4. GitHub Actions에서 정기 백업·checksum·스키마 검사를 수행한다.
5. 실제 수업 운영 전에는 무료 프로젝트 일시 정지와 백업 부재를 고려해 내보내기 파일을 별도로 보관한다.

## 후보 비교

| 후보 | 강점 | 이 프로젝트에서의 제약 | 판단 |
| --- | --- | --- | --- |
| **Supabase** | PostgreSQL, PostGIS, SQL migration, RLS, Storage, Auth, REST/JS 클라이언트가 한 프로젝트에 통합됨 | 무료 DB 500MB, 파일 1GB, 1주 비활성 시 일시 정지, 자동 백업 없음 | **현재 선택**. 지도·공간통계·자료 계보 요구에 가장 잘 맞음 |
| **Neon** | Postgres 중심, 무료 플랜은 시간 제한·카드 등록 없이 시작 가능. 공식 요금표 기준 프로젝트당 100 CU-hours/월, 0.5GB 저장공간 | Supabase처럼 자료 Storage·RLS 기반 브라우저 API·Auth·파일 권한을 한 번에 제공하는 구조가 아님. Storage와 인증·정책을 추가 구성해야 함 | DB만 필요하면 좋은 대안. 현재는 인프라가 늘어남 |
| **Firebase Firestore** | Spark 플랜 무료 시작, 인증·모바일·실시간 문서 동기화에 강함 | Firestore는 SQL 테이블이 아닌 NoSQL 문서 모델이다. 관측값·지역코드·스냅샷·공간관계·집계를 반복적으로 조인하는 현재 모델과 맞지 않음 | 실시간 협업 앱으로 바뀔 때 검토. 현재는 부적합 |
| **Cloudflare D1 + R2** | D1 SQL과 R2 파일 저장을 조합할 수 있고, 무료 D1은 DB당 500MB·계정당 5GB 저장 한도를 제공 | D1은 SQLite 계열이며 공식 지원 확장이 FTS5·JSON·Math 중심이다. PostGIS를 그대로 사용할 수 없고, Auth·RLS·API·파일 정책을 Workers 조합으로 직접 설계해야 함 | 초저비용 엣지 서비스에는 유리하지만 현재 공간자료 기능에는 과한 재구현 |
| **직접 운영 PostgreSQL** | 공간·관계형 구조를 완전히 통제하고 비용을 낮출 수 있음 | 서버 보안, 백업, TLS, 장애 대응, 업데이트, 연결 풀링을 직접 담당해야 함 | 연구용 로컬·장기 운영 서버가 생길 때만 검토 |

비교에 사용한 공식 문서:

- [Neon 요금표](https://neon.com/pricing)
- [Firebase 요금표](https://firebase.google.com/pricing)
- [Firebase Firestore 데이터 모델](https://firebase.google.com/docs/firestore/data-model)
- [Cloudflare D1 한도](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 SQL 문법·지원 확장](https://developers.cloudflare.com/d1/sql-api/sql-statements/)

## 대안으로 바꿀 조건

다음 조건이 실제로 발생하면 Neon 또는 Cloudflare 조합을 다시 비교한다.

- PostGIS 공간질의를 포기하고 단순한 위도·경도와 사전 계산된 GeoJSON만 사용하게 되는 경우
- 자료 제작·탐구 결과를 전부 정적 JSON으로 배포하고 계정·답안 저장이 필요 없어지는 경우
- Supabase 무료 DB·Storage 한도를 지속적으로 초과하는 경우
- 무료 프로젝트의 일시 정지가 수업 운영에 반복적으로 문제가 되는 경우
- 사용자가 수십만 명으로 증가해 Supabase egress 또는 DB 용량이 주된 병목이 되는 경우

그 전까지는 애플리케이션 코드가 Supabase SDK에 직접 흩어지지 않도록 `repositories`와 `ingest adapters` 경계를 유지한다. 그러면 필요할 경우 DB provider만 교체할 수 있다.

## 현재 구현에 적용하는 구성

```text
Supabase Postgres + PostGIS
  ├─ data_sources / source_snapshots
  ├─ geo_observations / learning_materials
  ├─ inquiry_activities / learner_attempts
  └─ RLS + published material read policy

Supabase Storage
  └─ 큰 원자료·GeoJSON·교사 업로드 파일

Vercel Functions
  └─ 실시간 API 프록시·짧은 TTL 캐시

GitHub Actions
  └─ KMA·KOSIS·SGIS 백필, 월별 갱신, 품질검사, 백업 내보내기
```

브라우저에는 Publishable Key만 사용하고, Vercel 함수·Actions에는 Secret Key를 사용한다. Supabase 공식 문서는 기존 `anon`·`service_role` 키보다 `sb_publishable_...`·`sb_secret_...` 형식을 권장하며, Secret Key는 RLS를 우회하므로 공개해서는 안 된다고 안내한다.

- [Supabase API Keys 안내](https://supabase.com/docs/guides/getting-started/api-keys)

## 실행 순서

1. Supabase 프로젝트 생성
2. PostGIS extension 활성화
3. `supabase/migrations/0001_initial_schema.sql` 실행
4. 공개 자료 조회 RLS를 확인하고, 로그인 없는 MVP에서는 `learner_attempts`의 브라우저 직접 접근을 차단
5. KMA ASOS·KOSIS·SGIS의 작은 샘플을 적재
6. DB 크기·응답속도·Storage 사용량을 확인
7. 무료 플랜 한도에 맞춰 원자료 보관 범위와 백업 주기 확정
