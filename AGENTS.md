# GeoLab Classroom 에이전트 공통 작업 규칙

이 파일은 Codex·Claude·OpenCode가 교대로 이 저장소를 작업할 때 따르는 공통 진입점이다. 현재 구현 상태와 다음 작업은 [`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md)를 기준으로 하고, 2D 기능의 설계·완료 조건은 [`docs/2D_IMPLEMENTATION_PLAN.md`](docs/2D_IMPLEMENTATION_PLAN.md)를 기준으로 한다.

## 작업 시작 전에 읽을 순서

1. 이 파일(`AGENTS.md`)
2. [`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md)
3. [`docs/2D_IMPLEMENTATION_PLAN.md`](docs/2D_IMPLEMENTATION_PLAN.md)
4. 변경하려는 영역에 해당하는 문서와 소스

Claude는 [`CLAUDE.md`](CLAUDE.md), OpenCode는 [`OPENCODE.md`](OPENCODE.md)를 먼저 발견할 수 있다. 두 파일은 이 문서와 인계 문서로 안내하는 얇은 진입점이므로, 별도 규칙으로 해석하지 말고 이 문서의 내용을 따른다.

## 프로젝트 불변 원칙

- **2D 우선:** 국내·세계 2D에서 실제 데이터의 지도·그래프·표·출처·내보내기가 완료되기 전에는 3D 기능을 확장하지 않는다.
- **실제값만 시각화:** 실제 snapshot이 없는 데이터셋은 준비 상태만 표시한다. 임의의 값, 데모 값, 추정값을 실제 통계값처럼 지도·그래프에 그리지 않는다.
- **공개형 MVP:** 현재 로그인은 구현 범위가 아니다. Supabase는 로그인 provider가 아니라 과거·반복 사용 자료의 snapshot, 정규화 값, 출처 저장소다.
- **공개 읽기와 쓰기 분리:** 브라우저는 Supabase publishable key로 게시된 행만 읽는다. service-role key와 원천 API 인증키는 브라우저 번들·문서·Git에 넣지 않는다.
- **정확한 공간 결합:** KOSIS 값과 SGIS 경계는 같은 기준연도·행정수준·코드일 때만 `region_code === adm_cd`로 결합한다. 이름 유사도만으로 조인하지 않는다.
- **하나의 조회 상태:** 동일한 dataset·지표·기간·공간 필터가 지도·그래프·표·파일 내보내기에 함께 전달되어야 한다.
- **원자료 보존:** API 응답, snapshot metadata, checksum, 단위, 결측 부호, 출처 URL을 가능한 범위에서 보존하고 정규화 결과와 구분한다.
- **기존 변경 보존:** 작업 시작 시점의 uncommitted 변경은 다른 작업자의 변경일 수 있다. 확인 없이 reset, checkout, clean, 대량 삭제로 없애지 않는다.

## 현재 작업 방식

이 저장소는 순차 교대 작업을 기본으로 한다.

1. 작업자는 `git status --short --branch`로 현재 상태를 확인한다.
2. worktree가 깨끗하면 현재 브랜치의 최신 커밋에서 작업한다. 변경이 있으면 변경 파일과 의도를 먼저 확인하고, 겹치지 않는 파일만 수정한다.
3. 한 번의 작업에서는 인계 문서에 적힌 **현재 다음 작업** 또는 사용자가 새로 지정한 하나의 작업만 완료한다.
4. 완료·부분완료·차단을 구분하여 [`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md)와 [`docs/AGENT_WORK_LOG.md`](docs/AGENT_WORK_LOG.md)를 갱신한다.
5. 코드 변경 후에는 관련 테스트와 아래 공통 검증을 실행한다.
6. 변경 사항과 검증 결과를 인계 문서에 기록한다. 현재 작업 방침은 개발 완료 전 중간 커밋·GitHub push를 보류하고, 최종 통합 시 사용자의 확인에 따라 커밋하는 것이다. 기본 브랜치를 바꾸거나 history를 재작성하지 않는다.

브랜치 정책을 별도로 지정하지 않으면 현재 프로젝트의 `main`을 유지한다. 병렬 작업이 필요할 때만 작업별 브랜치를 만들고, 파일 소유권과 병합 순서를 인계 문서에 기록한다. 서로 다른 에이전트가 같은 컴포넌트·migration을 동시에 고치지 않는다.

## 작업 종료 시 필수 기록

인계 문서의 `최근 작업 기록`과 `다음 작업`을 다음 내용으로 갱신한다.

- 작업 날짜와 에이전트 이름
- 완료한 목적과 사용자에게 보이는 변화
- 변경 파일 또는 migration
- 데이터 계약·스키마·환경변수 이름의 변경 여부
- `npm run typecheck`, `npm test`, `npm run build` 결과
- UI를 바꿨다면 로컬 또는 Production 브라우저 검증 결과
- 실제 API·Supabase를 확인했다면 범위, 행 수, 상태 코드만 기록하고 키·토큰·원문 비밀값은 기록하지 않음
- 남은 문제, 차단 사유, 다음 에이전트가 바로 실행할 작업
- 커밋 해시 또는 `미커밋 로컬 변경` 상태

막힌 경우에도 임의로 완료 처리하지 않는다. 실패한 명령과 환경 문제를 구분해 기록하고, 안전한 대체 검증을 시도한 뒤 같은 문제가 반복되면 `blocked`로 남긴다.

## 권장 검증 명령

```bash
npm run typecheck
npm test
npm run build
```

API 키가 필요한 스모크 테스트는 로컬 `.env.local`을 사용하며 키나 응답 본문을 출력하지 않는다.

```bash
node scripts/smoke-api.mjs
```

Vite 로컬 서버는 정적 SPA 확인에 사용한다. `api/*.ts` Vercel 함수와 SGIS 서버 프록시까지 확인해야 하면 Production URL 또는 `vercel dev`를 사용하고, 검증 환경을 결과에 명시한다.

## 코드 영역별 책임

| 영역 | 주요 파일 | 책임 |
|---|---|---|
| 라우팅 | `src/app/App.tsx` | 제작·탐구·상태 화면 경로 |
| 제작 화면 조합 | `src/pages/CreatePage.tsx` | 국내/세계 scope, dataset, 공간 필터, 시각화 패널 연결 |
| 데이터셋 선택 | `src/components/DatasetSelector.tsx`, `src/lib/dataset-catalog.ts` | 학습자에게 공개할 curated catalog와 ready/planned 상태 |
| KMA 2D 수직 슬라이스 | `src/components/Climate2DWorkspace.tsx`, `src/lib/climate.ts` | 기후 query, 관측소 값, 그래프·표·내보내기 |
| 지도 | `src/components/VWorld2DMap.tsx`, `src/lib/vworld2d.ts` | VWorld 2D runtime, 배경지도, 관측소·경계·주제도 레이어 |
| 공간 결합 | `src/lib/geo-join.ts`, `src/lib/geo-observations.ts`, `src/lib/sgis.ts` | 코드 기반 조인 진단, 공개 KOSIS 읽기, SGIS 응답 정규화 |
| KOSIS | `src/lib/kosis.ts`, `src/lib/kosis-client.ts`, `api/kosis-*.ts`, `scripts/kosis-snapshot.mjs` | 서버 프록시, 메타데이터, 제한 조회, controlled ingest |
| KMA 수집 | `api/kma-asos.ts`, `scripts/kma-climate.mjs` | 실시간 프록시와 31일 배치·정규화·Supabase 적재 |
| API 보안 경계 | `api/*.ts`, `src/lib/api/registry.ts` | 서버 전용 키, 허용 파라미터, provider 오류의 안전한 반환 |
| DB | `supabase/migrations/*.sql` | schema, 공개 RLS, snapshot·관측값·catalog |
| 문서·인계 | `docs/AI_HANDOFF.md`, `docs/AGENT_WORK_LOG.md` | 현재 상태, 다음 작업, 교대 기록 |

## 데이터와 보안 규칙

- `.env.local`은 로컬 전용이며 Git에 커밋하지 않는다.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VWORLD_API_KEY`, `VITE_VWORLD_DOMAIN`은 브라우저에서 사용 가능한 client 설정이다. publishable/공개 키라도 문서에 실제 값을 복사하지 않는다.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KOSIS_API_KEY`, `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET`, `KMA_AUTH_KEY`, `DATA_GO_KR_SERVICE_KEY`는 서버·수집기·CI 전용이다.
- 도로명주소 관련 `JUSO_*` 키는 기능과 활용 승인이 확정된 뒤에만 추가한다.
- VWorld domain은 키와 별개의 허용 hostname이다. 로컬은 현재 hostname 자동 감지, 운영은 `geoapieducation.vercel.app`과 VWorld 등록 hostname 일치가 필요하다.
- SQL migration을 코드에 추가하는 것과 운영 Supabase에 실행하는 것은 별개다. 운영 적용 여부를 추측하지 말고 SQL Editor 또는 Supabase migration 기록으로 확인한다.
- controlled ingest는 `DRY-RUN → 코드·기간·단위·행 수·checksum 확인 → --write → public 전환` 순서를 지킨다. `publish`를 먼저 실행하지 않는다.

## 2D 완료 전 금지 사항

- 2D 완료 gate를 통과하기 전 VWorld 3D·Cesium·terrain 기능에 새 의존성을 추가하지 않는다.
- KOSIS 지역코드가 SGIS 경계와 맞지 않는 상태에서 전국 단계구분도를 공개하지 않는다.
- `status='published'`가 아닌 snapshot을 학습자 화면에 노출하지 않는다.
- 데이터가 없다는 오류를 숨기기 위해 mock 값을 운영 경로에 섞지 않는다.
- 수업 자료의 출처·기준기간·단위·결측률을 확인하지 않은 채 “검증 완료”라고 문서화하지 않는다.

## 완료 정의

작업은 다음을 모두 만족할 때 완료로 기록한다.

- 구현 또는 문서 변경이 요청 범위를 충족한다.
- 관련 typecheck/test/build가 통과하거나, 실패 원인이 코드가 아닌 환경 문제로 분리되어 기록되어 있다.
- UI 변경은 실제 화면에서 핵심 상태와 오류 상태를 확인했다.
- 데이터 변경은 snapshot 범위·행 수·코드·단위·출처를 확인했다.
- 인계 문서와 작업 로그가 최신 상태다.
- 다음 작업이 한 문장으로 지정되어 있고, 최종 통합 전이라면 미커밋 변경 상태가 명확히 기록되어 있다.
