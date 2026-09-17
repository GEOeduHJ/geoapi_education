# 에이전트 작업 로그

Codex·Claude·OpenCode가 교대로 수행한 작업을 append-only로 기록한다. 한 항목은 하나의 작업 단위를 뜻한다. 기존 기록을 수정하거나 성공하지 않은 작업을 완료로 바꾸지 않는다.

## 기록 원칙

- 날짜, 에이전트, task ID, 변경 범위, 검증 결과, 커밋을 남긴다.
- 키·토큰·비밀번호·Supabase secret·API 응답 원문은 남기지 않는다.
- 운영 DB나 Production을 확인했다면 URL·경로·행 수·상태만 기록한다.
- 실패는 실패로 기록하고, 코드 실패인지 환경·권한·외부 API 문제인지 구분한다.
- 상세한 현재 상태와 다음 작업은 [`AI_HANDOFF.md`](AI_HANDOFF.md)에 갱신한다.

## 작업 기록

### 2026-09-17 — Codex — 2D-BASELINE

- 결과: 완료된 1차 수직 슬라이스
- 변경: curated dataset catalog, 국내/세계 2D route, KMA ASOS 2D 지도·그래프·표, SGIS 선택 경계, VWorld 배경 선택, map/chart PNG/PDF
- 데이터: KMA 2016~2025 10개 관측소·36,530 일자료·1,200 월 요약을 Supabase에서 사용
- 검증: typecheck/test/build 통과; Production `/create/2d/domestic`에서 17개 경계·10개 관측소와 `서울특별시` 1개 필터 확인
- 주의: KOSIS는 코드 체계 검증 전까지 public snapshot을 만들지 않음
- 커밋: `183ed28 feat: start curated 2d data workspace`

### 2026-09-17 — Codex — 2D-VERIFY

- 결과: 완료
- 변경: 2D 구현 진척도·운영 브라우저 검증·다음 작업 문서화
- 검증: Production 국내/세계 2D, 브라우저 오류·경고 없음, 운영 데이터 범위 확인
- 주의: `supabase/migrations/0006_dataset_catalog.sql`은 저장소에 있으나 운영 적용 여부 미확인
- 커밋: `cd60ed5 docs: record 2d progress and verification`

### 2026-09-17 — Codex — DOCS-HANDOFF

- 결과: 완료된 로컬 문서화
- 변경: `AGENTS.md`, `CLAUDE.md`, `OPENCODE.md`, `docs/AI_HANDOFF.md`, `docs/AGENT_WORK_LOG.md`, README/2D 계획의 교대 작업 진입점
- 결정: 개발 완료 전 중간 커밋·GitHub push를 보류하고, 인계 문서와 작업 로그로 로컬 상태를 관리
- 검증: `git diff --check` 통과; `npm run typecheck`, `npm test`(15개 파일·51개 테스트), `npm run build` 통과
- 브라우저/API: 코드 변경 없는 문서 작업이므로 추가 브라우저 검증 없음; 기존 Production 검증은 `2D-VERIFY` 기록 참조
- 차단/주의: 현재 변경은 의도적으로 미커밋 로컬 상태
- 다음 작업: `2D-01` — `0005/0006` migration 상태 확인과 DB catalog repository 구현
- 커밋: `미커밋 로컬 변경`

### 2026-09-17 — Claude — 2D-01

- 결과: 완료
- 변경: `src/lib/dataset-catalog.ts`, `src/components/DatasetSelector.tsx`, `src/pages/CreatePage.tsx`, `src/lib/dataset-catalog.test.ts`, `.claude/launch.json`(로컬 브라우저 검증용 dev server 설정, 신규), `docs/AI_HANDOFF.md`
- 결정/데이터: Supabase REST를 anon key로 직접 read-only 조회해 `dataset_catalog`(0006)가 운영에 미적용(404 `PGRST205`)임을 확정하고, `geo_observations`(0005 대상 테이블)는 anon 조회 가능함을 확인. DB `status`(draft/published/retired)와 앱 `DatasetStatus`(ready/planned)를 서로 다른 축으로 보고 `status === "published" && storage_mode !== "planned"`일 때만 ready로 매핑(`mapDatasetCatalogRow`). 정적 catalog는 키 단위로 published 행에 override되고, DB가 비어있거나 실패하면 기존 정적 목록을 그대로 반환(`mergeDatasetCatalog`). `getDatasets`/`getDataset`(동기, 정적 전용)는 그대로 두고, `DatasetSelector`/`CreatePage`는 새 `useDatasetCatalog(scope)` 훅으로 전환.
- 검증: `npm run typecheck` 통과, `npm test` 통과(15개 파일·60개 테스트, `dataset-catalog.test.ts` 2→11개), `npm run build` 통과
- 브라우저/API: 로컬 Vite(`http://localhost:5173`, `.claude/launch.json` 신규 추가)에서 `/create/2d/domestic`, `/create/2d/world` 확인. 데이터셋 드롭다운 구성이 기존과 동일(국내 ready 1·planned 2, 세계 planned 3개, 라벨·개수 동일). `performance` resource timing으로 `dataset_catalog` PostgREST 요청이 페이지당 1회만 발생하고 `404`/`PGRST205`로 실패해 정적 목록으로 조용히 폴백됨을 확인. 이 폴백 경로에서 화면에 별도 에러 배너나 새 콘솔 경고 없음.
- 차단/주의: (1) `0006_dataset_catalog.sql`이 운영 Supabase에 미적용 상태로 확정됨 — 사용자가 Supabase SQL Editor에서 `0005`, `0006`을 적용해야 published override 경로를 실제로 검증할 수 있음(이 세션은 service-role/DB 실행 권한 없음). (2) 이번 작업과 무관하게 로컬 Vite에서 `climate_period_summaries` Supabase 조회가 매번 500을 반환함(관측소·일자료 조회는 200 정상)과 SGIS 경계 패널이 로컬에서 "경계 목록을 읽지 못했습니다"를 표시함을 발견함 — 둘 다 이번에 변경하지 않은 `src/lib/climate.ts`/`src/lib/sgis.ts` 관련이며, 후자는 AGENTS.md가 이미 문서화한 "로컬 Vite가 `api/*.ts`를 자동 실행하지 않는다"는 제약과 일치함. Production 또는 `vercel dev`에서 재확인 필요.
- 다음 작업: `2D-02` — 공통 시각화 계약·provenance·표 CSV. 단, 그 전에 사용자가 Supabase SQL Editor에서 `0005`/`0006`을 적용하고, 이번에 발견한 `climate_period_summaries` 500이 Production에서도 재현되는지 확인 필요.
- 커밋: 미커밋 로컬 변경

### 2026-09-17 — Claude — 2D-02 (1단계-3단계)

- 결과: 부분 완료 (Phase 1-3 완료, Phase 4 UI 통합 남음)
- 변경: `src/lib/data-contract.ts` (신규), `src/lib/kma-adapter.ts` (신규), `src/lib/material-export.ts` (CSV export 추가)
- 결정/데이터: 공통 시각화 계약 5개 인터페이스 정의 (DatasetQuery, NormalizedRecord, MapLayerSpec, ChartSpec, TableModel, Provenance). KMA 데이터를 이 계약으로 변환하는 adapter 함수 추가. CSV export에 UTF-8 BOM 포함, 파일명 정책 적용.
- 검증: `npm run typecheck` 통과, `npm test` 통과(60 tests), `npm run build` 통과
- 브라우저/API: UI 통합 전이므로 현재까지의 변경은 화면상 영향 없음. 다음 단계에서 Climate2DWorkspace와 CreatePage를 리팩토링할 때 adapter를 사용하고 Provenance panel을 추가해야 함.
- 차단/주의: (1) 새로운 타입들이 실제로 사용되지 않고 있음 — 다음 작업자가 Climate2DWorkspace/CreatePage 리팩토링 시 adapter를 통합해야 함. (2) toTableModel에서 metadata 필드에 값을 넣는 방식이 임시적 — 실제 TableModel.records 구조는 table 렌더링 시점에 확정되어야 함.
- 다음 작업: `2D-02` 4단계 — Climate2DWorkspace를 adapter 기반으로 리팩토링하고 CSV export 버튼 추가. CreatePage에 Provenance panel 통합. 지도/차트/표/CSV가 동일 필터를 공유하는지 브라우저에서 확인.
- 커밋: 미커밋 로컬 변경

### 2026-09-17 — Claude — 2D-02 (계획 수정 + 부분 구현)

- 결과: 부분 완료 (경계 집계 로직 구현, choropleth 렌더링 미확인)
- 변경: `src/lib/climate.ts` (STATION_TO_ADM_CODE 매핑), `src/lib/kma-adapter.ts` (toNormalizedRecords 재설계, aggregateByBoundary, toMapLayerSpec 재설계), `src/pages/CreatePage.tsx` (kmaAggregatedBoundaryValues 계산, VWorld2DMap props 변경)
- 결정/데이터: 사용자 피드백에 따라 2D-02 계획 전면 수정: 점 기반 시각화 → 행정경계 기반 choropleth. KMA 관측소를 행정경계별로 aggregation하고, 경계별 평균값을 BoundaryJoinValue 형식으로 변환해 VWorld2DMap에 전달. STATION_TO_ADM_CODE 매핑 추가 (10개 기본 관측소를 11/26/27/29/30/31/36/41/42/50 경계코드로).
- 검증: `npm run typecheck` 통과, `npm run build` 통과. 브라우저 `/create/2d/domestic`에서 지도 렌더링 중이나, 표시되는 객체가 점 기반인지 경계 기반인지 VWorld2DMap 렌더링 로직에서 확인 필요.
- 브라우저/API: 로컬 Vite (`localhost:5173/create/2d/domestic`). 지도가 표시되고 "18개 경계도"라는 범례가 보이나, 화면상 점들이 여전히 관측소 위치처럼 보임. stationValues=null, visibleStationIds=[], showStations=false로 설정했으므로 지점 레이어가 비활성화되어야 함.
- 차단/주의: (1) VWorld2DMap 또는 vworld2d.ts의 경계 렌더링 로직(createBoundaryLayer, updateVWorld2DBoundaryLayer)에서 aggregated 데이터(BoundaryJoinValue 형식)를 제대로 처리하는지 확인 필요. 특히 boundaryValues의 색상 맵핑 로직이 정상인지 검증. (2) STATION_TO_ADM_CODE 매핑이 실제 SGIS adm_cd와 일치하는지 SGIS 데이터 로드 후 비교 필요 (현재 추정치).
- 다음 작업: VWorld2D 경계 렌더링 로직 확인 + kmaAggregatedBoundaryValues가 실제로 생성·전달되는지 브라우저 디버거 검증 + 필요시 색상 맵핑 또는 aggregation 로직 수정.
- 커밋: 미커밋 로컬 변경

### 2026-09-17 — Claude — 2D-02 (choropleth 렌더링 버그 근본 원인 수정)

- 결과: 완료 (KMA choropleth 렌더링 파이프라인 검증 완료)
- 변경: `src/lib/climate.ts` (`STATION_TO_ADM_CODE` 삭제 → `LAW_CODE_PREFIX_TO_SGIS_ADM_CD` + `lawCodeToSgisAdmCd()`로 교체), `src/lib/kma-adapter.ts` (`toNormalizedRecords`가 `lawCodeToSgisAdmCd` 사용하도록 수정), `src/pages/CreatePage.tsx` (기존 `station.law_code?.slice(0,2) === boundaryCode` 버그도 동일 함수로 수정, `boundaryNames`/`boundaryValueLabel` 추가), `src/components/VWorld2DMap.tsx` (`boundaryValueLabel` prop 추가, 범례 "KOSIS 값" 하드코딩 제거), `src/lib/climate.test.ts`·`src/lib/kma-adapter.test.ts`(신규) 테스트 추가.
- 결정/데이터: **근본 원인** — 이전 작업에서 만든 `STATION_TO_ADM_CODE`가 표준 법정동코드 체계(부산=26 등)를 SGIS `adm_cd`인 줄 알고 하드코딩했으나, `/api/sgis-boundary` 실측 결과 SGIS는 완전히 다른 자체 순번(부산=21, 대구=22, 인천=23 …)을 쓴다는 걸 Production에서 직접 확인함(`geoapieducation.vercel.app/api/sgis-boundary?year=2025&admCd=non&lowSearch=1`). 더 중요한 발견: 기존 `CreatePage.tsx`의 `station.law_code?.slice(0,2) === boundaryCode` 필터도 같은 두 체계를 직접 비교하고 있어서, 서울(둘 다 "11")만 우연히 맞고 나머지 16개 시도는 전부 관측소 필터링이 깨져 있었음(2D-01 기록의 "서울특별시 1개 필터만 확인"이 이 버그를 가려온 것). `climate_stations.law_code`(법정동코드) 앞 2자리 → SGIS `adm_cd` lookup table(`LAW_CODE_PREFIX_TO_SGIS_ADM_CD`)을 만들어 두 곳 모두 통일. Production REST 조회로 실제 관측소 9곳의 `law_code`를 확인해 매핑을 검증(9/10 정확히 일치, 나머지 1곳은 아래 주의사항 참조).
- 검증: `npm run typecheck` 통과, `npm test` 통과(16개 파일·67개 테스트, `climate.test.ts` 4→6, `kma-adapter.test.ts` 신규 5개), `npm run build` 통과.
- 브라우저/API: 로컬 Vite(`localhost:5173/create/2d/domestic`)에서 `window.fetch`를 패치해 `/api/sgis-boundary` 응답을 mock(실제 SGIS `adm_cd`/`adm_nm` + 단순 격자 geometry, Supabase `climate_stations`/관측 데이터는 실제 값 그대로 사용)한 뒤 SPA 내 라우트 전환으로 재요청을 트리거해 전체 파이프라인을 시각적으로 검증함. 결과: "17개 경계 · 8개 경계값 · 13.178–17.211°C" 범례가 실제 9개 유효 관측소(광주 제외, 춘천+강릉은 강원으로 합산)의 값과 정확히 일치. `boundaryCode`를 "부산광역시"(adm_cd=21)로 바꾸면 "1개 경계 · 1개 경계값 · 15.704–15.704°C"로 부산 관측소 실측값과 정확히 일치해, 기존에 깨져 있던 지역 필터도 함께 고쳐졌음을 확인. **참고**: 로컬 Vite는 `/api/*.ts`를 실행하지 않는 기존 제약(AGENTS.md 기록)이 있어 이 mock 검증은 로컬 전용 임시 기법이며 코드에는 남기지 않음; `vercel dev`도 시도했으나 이 저장소의 Vite 7 설정과 충돌해(`index.html` import-analysis 파싱 오류) 로컬에서 사용 불가로 확인됨 — Production 또는 향후 Vite/vercel dev 호환성이 맞는 환경에서 실제 SGIS 응답으로 최종 1회 확인 필요.
- 차단/주의: (1) KMA station_id `156`(광주) 관측소의 `law_code`가 `"1230010900"`으로 실제 존재하지 않는 법정동코드 접두사("12")이고 `address`도 "전남광주통합특별시 북구 운암동"이라는 존재하지 않는 지명임 — DB 시드 데이터 자체의 품질 문제로 이번 작업 범위 밖. 현재는 `lawCodeToSgisAdmCd`가 `null`을 반환해 이 관측소만 경계 집계에서 조용히 제외됨(에러 없이 스킵, 지도가 깨지지 않음). 다음 작업자가 `climate_stations` 테이블에서 이 행의 `law_code`/`address`를 실제 광주광역시 값으로 정정 필요. (2) `LAW_CODE_PREFIX_TO_SGIS_ADM_CD`는 현재 KMA 10개 기본 관측소가 걸치는 9개 시도만이 아니라 17개 시도 전체를 채워뒀지만, 법정동코드의 강원(42→51 개편)·전북(45→52 개편) 신·구 코드를 모두 넣어둔 것 외에는 다른 시도 실측 검증은 못 했음(Production SGIS 응답으로 코드→이름만 대조, KMA 관측소가 없는 시도는 law_code 실측 불가).
- 다음 작업: (선택) 광주 관측소 `law_code`/`address` 데이터 정정을 사용자에게 요청. `2D-02` 나머지 — Provenance panel을 CreatePage에 표시하는 UI 작업이 아직 남아있음(계획서 5단계 일부).
- 커밋: 미커밋 로컬 변경

### 2026-09-17 — Claude — 2D-02b (전남광주통합특별시 fan-out + Provenance/CSV UI 연결)

- 결과: 완료 (`2D-02` 전체 완료 처리)
- 변경: `src/lib/climate.ts`(`lawCodeToSgisAdmCd`→`lawCodeToSgisAdmCds`, `LAW_CODE_PREFIX_TO_SGIS_ADM_CD` 값 타입 `string`→`string[]`, `"12": ["24","36"]` 추가), `src/lib/data-contract.ts`(`NormalizedRecord.location.admCds?: string[]` 추가), `src/lib/kma-adapter.ts`(`toNormalizedRecords`가 `admCds` 채움, `aggregateByBoundary`가 `admCds`를 순회하며 fan-out 집계), `src/pages/CreatePage.tsx`(`visibleStationIds` 필터를 `lawCodeToSgisAdmCds(...).includes(boundaryCode)`로 수정), `src/components/MaterialExportActions.tsx`(선택적 `onExportCsv` prop, CSV 버튼), `src/components/ProvenancePanel.tsx`(신규), `src/components/Climate2DWorkspace.tsx`(CSV 핸들러·Provenance panel 연결, 기존 `climate-footnote` 제거), `src/app/styles.css`(`.provenance-panel*` 규칙 추가), `src/lib/climate.test.ts`·`src/lib/kma-adapter.test.ts`(fan-out 테스트 추가).
- 결정/데이터: **이전 세션의 "차단/주의" 기록(바로 위 항목)이 오판이었음이 밝혀짐** — 광주 관측소의 `law_code`("1230010900")와 `address`("전남광주통합특별시...")는 잘못된 시드 데이터가 아니라, 2026-07-01 실제 출범한 광주광역시·전라남도 행정통합("전남광주통합특별시", [위키백과](https://ko.wikipedia.org/wiki/전남광주통합특별시))을 반영한 올바른 최신 데이터였음(사용자가 직접 확인·정정 요청). 다만 Production `/api/sgis-years`를 호출해 확인한 결과 SGIS의 `tboudary_yr`(경계 polygon 존재 연도)는 2025까지만 있어, SGIS가 아직 통합 후 경계를 발행하지 않은 상태임 — 즉 우리 DB(law_code)는 새 코드를 반영했지만 SGIS 경계 도형은 옛 상태(광주 SGIS adm_cd `24`, 전남 `36`, 별개 도형) 그대로. 이 lag를 메우기 위해 법정동코드→SGIS adm_cd 매핑을 1:1에서 1:N으로 바꿔, "12" 접두사가 `["24","36"]` 둘 다를 가리키도록 하고 `aggregateByBoundary`가 한 관측소 값을 여러 경계 그룹에 동시에 채우도록(fan-out) 구현. 동시에 국내 2D 데이터 완성도를 Supabase 직접 조회로 점검(`climate_stations` 10행=기본 관측소와 정확히 일치, `geo_observations`(KOSIS) 0행 — 숨겨진 미사용 데이터셋 없음 확인) → 실제 남은 gap은 새 데이터셋이 아니라 이미 구현된 `kma-adapter.ts`의 `toChartSpec`/`toTableModel`/`toProvenance`와 `exportTableAsCsv`가 UI에 연결되지 않은 것뿐임을 확인, 이번에 연결함.
- 검증: `npm run typecheck` 통과, `npm test` 통과(16개 파일·70개 테스트, `climate.test.ts` 6→7 [전남광주통합특별시 fan-out 케이스 추가], `kma-adapter.test.ts` 5→7), `npm run build` 통과.
- 브라우저/API: 로컬 Vite(`localhost:5173/create/2d/domestic`)에서 이전과 동일한 `window.fetch` SGIS mock 기법으로 검증. (1) 전체 시도 선택 시 "10개 경계값"(이전 세션 8개에서 광주 fan-out으로 +2 정확히 증가) 확인. (2) "광주광역시"(adm_cd 24)와 "전라남도"(adm_cd 36)를 각각 선택 — 둘 다 "1개 경계 · 2개 경계값 · 15.025–15.025°C"로 동일한 광주 관측소 값이 나옴을 확인(경계값 개수가 2로 나오는 건 boundaryValues 딕셔너리 자체가 fan-out으로 24/36 두 키를 갖기 때문이며, 실제 화면에 그려지는 도형은 선택된 1개뿐이라 렌더링 오류 아님). (3) Climate2DWorkspace에 새 "CSV 표" 버튼이 나타나고 클릭 시 "CSV 파일을 다운로드했습니다" 성공 메시지 확인. (4) Provenance panel이 기존 `climate-footnote` 자리에 렌더링되어 신청기간/실제기간/단위/관측치 수(36,522)/결측률(<1%)/snapshot ID(kma-asos-10y)/출처 링크를 모두 표시함을 확인.
- 차단/주의: (1) 여전히 로컬 Vite는 `/api/*.ts`를 실행하지 않아 실제 SGIS 응답으로 최종 검증은 못 함(mock 기법으로 로직만 검증) — Production 배포 후 1회 확인 권장. (2) `vercel dev`는 이 저장소의 Vite 7 설정과 충돌해 로컬에서 사용 불가로 재확인됨(이전 세션 기록과 동일). (3) SGIS `tboudary_yr`에 `2026`이 추가되면(SGIS가 통합 경계를 발행하면) `LAW_CODE_PREFIX_TO_SGIS_ADM_CD["12"]`의 fan-out 매핑과 `api/sgis-boundary.ts`의 `MAX_YEAR=2025` 캡을 함께 재검토해야 함 — 그때는 광주·전남이 SGIS에서도 폴리곤 하나로 합쳐질 가능성이 있음.
- 다음 작업: `2D-03`(KOSIS controlled snapshot) 착수 가능. 그 전에 SGIS `tboudary_yr`를 가끔 확인해 2026이 추가됐는지 확인 권장(위 주의사항 (3)).
- 커밋: 미커밋 로컬 변경

### 2026-09-17 — OpenCode — SIDO-LOCK

- 결과: 완료
- 변경: `src/lib/data-contract.ts`(`BoundaryLevel`, `SUPPORTED_DOMESTIC_BOUNDARY_LEVELS`, `DatasetQuery.boundaryLevel`), `src/lib/dataset-catalog.ts`(`supportedLevels`, `supportsBoundaryLevel`, DB 행 scope 기반 매핑), `src/lib/sgis.ts`(`DOMESTIC_SIDO_BOUNDARY_QUERY`, `buildDomesticSidoBoundaryQuery`), `src/pages/CreatePage.tsx`(builder 사용, 지리 필터 문구 시도 고정), `src/components/DatasetSelector.tsx`(시도/국가 단위 칩), `src/components/SgisBoundaryStatusPanel.tsx`(`2025 · 시도` 라벨), `src/lib/sgis.test.ts`(신규 2개), `src/lib/dataset-catalog.test.ts`(3개 추가), `docs/2D_IMPLEMENTATION_PLAN.md` §7, `docs/AI_HANDOFF.md`
- 결정/데이터: 사용자 결정에 따라 domestic 2D를 시도 단위로 고정. 시군구는 crosswalk·시군구급 snapshot 부재로 대기, 행정동(행정동/법정동 불일치)은 구현 제외. `dataset_catalog` DB에 level 컬럼이 없어 scope 기준 기본값으로 매핑.
- 검증: `npm run typecheck` 통과, `npm test` 통과(17개 파일·75개 테스트), `npm run build` 통과, 로컬 Vite dev 서버 `/create/2d/domestic` 200 확인
- 브라우저/API: 렌더 수준 검증은 미실시(이 세션에 브라우저 도구 없음). Production에서 시도 칩·필터 문구 1회 확인 권장. 실제 API·Supabase 호출 없음.
- 차단/주의: 없음
- 다음 작업: `2D-03` — 시도급 KOSIS 표 controlled snapshot 적재 후 실제 주제도 검증
- 커밋: `12402f4`에 포함

### 2026-09-17 — OpenCode — 2D-03 (적재 전 단계)

- 결과: 부분 완료 (DRY-RUN·대응표·조인 연결 완료, `--write --public` 차단)
- 변경: `src/lib/kosis-crosswalk.ts`(신규), `src/lib/kosis-crosswalk.test.ts`(신규 2개), `src/lib/geo-join.ts`(`codeMap` 옵션·`crosswalk` 진단), `src/lib/geo-join.test.ts`(2개 추가), `src/pages/CreatePage.tsx`(KOSIS 조인에 대응표 전달), `src/components/KosisBoundaryJoinStatusPanel.tsx`(대응표 적용 표시), `docs/KOSIS_ADAPTER.md`, `docs/AI_HANDOFF.md`
- 결정/데이터: `getMeta` 22행에서 `1224` 광주·`1236` 전남이 상위 `12`의 하위 코드임을 확인 — 이름 추정이 아닌 공식 분류 계층 기반 대응표(`1224→24`, `1236→36`). DRY-RUN 17행·단일 시점(2025)·단일 단위(천㎡)·결측 0, SGIS 17/17 조인 설계. 지표 `T10`(A÷B×1000), 분모 `T001`/`T002`는 문서로 보존하고 snapshot은 단일 항목만 적재. 원자료 `region_code`는 보존하고 조인 시점에만 변환
- 검증: `npm run typecheck` 통과, `npm test` 통과(18개 파일·79개 테스트), `npm run build` 통과
- 브라우저/API: KOSIS metadata·테이블 API 실측(HTTP 200, 22행·17행). 키·원문 비밀값 기록 없음. 브라우저 렌더 검증은 공개 적재 후 실시
- 차단/주의: `--write --public`은 `0005` migration(SQL Editor 적용, unique index) 확인 전까지 실행하지 않음. 사용자가 적용 후 알리면 적재 명령(`docs/KOSIS_ADAPTER.md` 참조) 실행
- 다음 작업: `0005` 적용 확인 → `--write --public` → 공개 snapshot·17개 경계값·조인 패널 브라우저 검증
- 커밋: `12402f4 feat: sido-only boundary contract, KOSIS public snapshot and crosswalk join`에 포함

### 2026-09-17 — OpenCode — 2D-03 (적재·공개 완료)

- 결과: 완료
- 변경: `scripts/kosis-snapshot.mjs`(`PRD_SE="A"` 연간 처리, `buildSnapshotChecksum` 통일), `scripts/kosis-snapshot.test.mjs`(2개 추가), 운영 DB에 KOSIS snapshot 1개·관측값 17행 공개 적재
- 결정/데이터: `0005` 재실행 policy 중복 에러(`42710`)는 기존 전체 적용의 증거로 판단하고, 동일 ID upsert 성공으로 unique index 동작을 기능 확인. `0006` 적용 성공 후 anon `dataset_catalog` 조회가 `404`→`200`(0행)으로 전환. `--write`(비공개)→검증→`--write --public` 순서 준수. snapshot ID `b0f7f9c9-a796-46fc-b275-66a0a1ea55e0`, 17행, checksum 앞 16자리 `44b8a961090c2fb5`, 지표 T10·단위 천㎡·시점 2025
- 검증: `npm run typecheck` 통과, `npm test` 통과(18개 파일·81개 테스트), `npm run build` 통과. 비공개 검증(service-role 17행·결측 0·anon 0행)과 공개 검증(anon snapshot 1행·관측값 17행·결측 0) 완료. Production SGIS 17경계 + 공개 snapshot 실측 조인 `ready` 17/17 확인(일회성 테스트 후 삭제)
- 브라우저/API: KOSIS metadata·테이블·SGIS 경계·Supabase REST 실측. 키·원문 비밀값 기록 없음. `/create/2d/domestic` 렌더 확인은 Production 배포 후 권장
- 차단/주의: 없음
- 다음 작업: `2D-04` — World Bank 세계 2D 수직 슬라이스. 또는 KOSIS dataset_catalog published 행 등록으로 DB override 경로 재검증(2D-01 잔여)
- 커밋: `12402f4 feat: sido-only boundary contract, KOSIS public snapshot and crosswalk join`에 포함

### 2026-09-17 — OpenCode — 국내 Audit·KOSIS ready 전환·통합 커밋

- 결과: 완료
- 변경: `src/lib/dataset-catalog.ts`(KOSIS `ready`, `capabilities: ["map"]`, coverage·설명 갱신), `src/lib/dataset-catalog.test.ts`, `docs/AI_HANDOFF.md`(2D-04 세계 연기, KOSIS 그래프·표 잔여 명시)
- 결정/데이터: 사용자 결정 — 세계 지도는 국내 완성(KMA·KOSIS 지도·그래프·표·출처·export) 후에 착수. 국내 Audit 결과: KMA 5종 완비, KOSIS는 지도만(그래프·표·provenance 잔여), 에어코리아 planned 유지. KOSIS 그래프·표 UI가 없으므로 `capabilities`를 `["map"]`으로 정직 표기
- 검증: `npm run typecheck` 통과, `npm test` 통과(18개 파일·81개 테스트), `npm run build` 통과, diff 비밀값 스캔 clean
- 브라우저/API: 추가 API 호출 없음. KOSIS choropleth 렌더는 Production 배포 후 확인 필요
- 차단/주의: 없음
- 다음 작업: KOSIS 그래프·표·provenance 연결 (국내 완성 잔여)
- 커밋: `12402f4 feat: sido-only boundary contract, KOSIS public snapshot and crosswalk join`에 포함

### 2026-09-17 — OpenCode — KOSIS-VIZ (그래프·표·provenance 연결)

- 결과: 완료
- 변경: `src/lib/kosis-adapter.ts`(신규), `src/lib/kosis-adapter.test.ts`(신규 4개), `src/components/Kosis2DWorkspace.tsx`(신규), `src/pages/CreatePage.tsx`(KOSIS 선택 시 연결), `src/lib/dataset-catalog.ts`+테스트(KOSIS `capabilities` 복원), `docs/AI_HANDOFF.md`
- 결정/데이터: 공개 snapshot 17행이 단일 지표·시점·단위임을 이용해 join값을 순위 정렬 NormalizedRecord로 변환하고 ChartSpec·TableModel·Provenance를 같은 집합에서 생성. 경계 필터(전체/특정 시도)가 지도·그래프·표에 함께 반영됨. CSV 파일명 `geolab-2d-kosis-park`
- 검증: `npm run typecheck` 통과, `npm test` 통과(19개 파일·85개 테스트), `npm run build` 통과, 로컬 dev 서버 `/create/2d/domestic` 200
- 브라우저/API: 렌더 수준 미확인(이 세션 브라우저 도구 없음). 배포 후 KOSIS 선택 시 17개 순위 그래프·표·CSV·provenance 확인 필요. 추가 API 호출 없음
- 차단/주의: 없음
- 다음 작업: Production `/create/2d/domestic`에서 KMA·KOSIS 전환 렌더 확인 후 국내 완성 선언, 이후 2D-04 착수 여부 결정
- 커밋: `c695e54 feat: KOSIS chart, table and provenance workspace`에 포함 (origin/main push済, Vercel 배포 트리거)

### 2026-09-17 — OpenCode — BREADTH 계획 (다중 API 자동 시각화)

- 결과: 계획 수립 (코드 변경 없음)
- 변경: `docs/AI_HANDOFF.md` (BREADTH 방향·후보·병목 기록)
- 결정/데이터: KOSIS search 실측으로 시도급 후보 7종 확보(GRDP·사교육비·PM10/2.5·자동차·출산성비·사업체·공원). 표별 코드체계 상이 확인(24/36 분리형 표 존재). 다중화 병목 4건 특정(단일 snapshot 읽기·정적 카탈로그·연도 고정·isKosis 단일 분기)
- 검증: KOSIS 검색 API 실측(HTTP 200). 키·원문 비밀값 기록 없음
- 차단/주의: 없음
- 다음 작업: Phase A 구조 일반화(아래 계획 참조) 또는 1차 배치 주제 확정
- 커밋: `88c9f20`에 포함 (docs 변경분)

### 2026-09-17 — OpenCode — PHASE-A 구조 일반화

- 결과: 완료
- 변경: `src/lib/geo-observations.ts`(snapshot 지정/목록 읽기·연도 헬퍼), `src/lib/dataset-catalog.ts`(`snapshotId`), `src/pages/CreatePage.tsx`(지정 snapshot 읽기·연도 필터), `src/components/Kosis2DWorkspace.tsx`(연도 셀렉터·요청시점 전달), `src/lib/kosis-adapter.ts`(`requestedYear`), 테스트 4개 추가
- 결정/데이터: 연도는 snapshot 통째 적재 + 조인 전 필터 방식(복수시점 색칠금지원칙 유지). DB 쓰기·API 호출 없음
- 검증: `npm run typecheck` 통과, `npm test` 통과(19개 파일·89개 테스트), `npm run build` 통과
- 브라우저/API: 미실시·없음. 현 snapshot 단일 연도라 실동작 동일
- 차단/주의: 없음
- 다음 작업: Phase B 1차 배치 적재 (인구·출산/경제/환경·교통/사업체·주택)
- 커밋: `88c9f20`에 포함

### 2026-09-17 — OpenCode — PHASE-B1 GRDP 적재·dataset-keyed 일반화

- 결과: 완료
- 변경: `src/lib/dataset-catalog.ts`(GRDP 정적 항목), `src/pages/CreatePage.tsx`(`isKosis`→`provider==="KOSIS"` dataset-keyed), `src/components/Kosis2DWorkspace.tsx`(exportSlug), 운영 DB에 GRDP snapshot 633행 공개 적재 + `dataset_catalog` published 2행(park·GRDP) 등록
- 결정/데이터: `DT_1C96/T1` metadata 구체계 17코드 확인 → DRY-RUN 633행·결측 0 → `--write`→검증→`--write --public`. snapshot `b2e3a59f-6fa9-40ae-9730-abb27527da3f`. 지역별 시작연도 상이(광주 1987·대전 1989·울산 1998·세종 2013)는 승격 연도와 일치하는 정상 결측으로, 연도 필터가 정직하게 부분결합 표시
- 검증: typecheck/test(89)/build 통과. anon 실측: 카탈로그 2행·snapshot 분리 정상. 실측 조인 park 2025 17/17·GRDP 2024 17/17·GRDP 1990 15+2 통과(일회성 테스트 후 삭제)
- 브라우저/API: KOSIS 테이블 API 실측. 키·원문 비밀값 기록 없음. 화면 렌더는 배포 후 확인
- 차단/주의: 없음
- 다음 작업: 사교육비·PM10/PM2.5·자동차·출산성비·사업체 순차 적재
- 커밋: `88c9f20`에 포함

### 2026-09-17 — OpenCode — PHASE-B2 배치 4종 적재

- 결과: 완료
- 변경: `src/lib/dataset-catalog.ts`(정적 4항목), `src/lib/geo-observations.ts`(`aggregateObservationsByRegion`), `src/lib/kosis-crosswalk.ts`(자동차 17건), 테스트 3개 추가, 운영 DB에 snapshot 4개·관측값 2,730행 공개 적재 + `dataset_catalog` published 4행 등록
- 결정/데이터: 3중 분류 표는 `OBJ_ID_SN` 순서대로 objL1~3 필수. 106번대 PM10/PM2.5는 전수 조합 실패로 제외(에어코리아로 이관). 출산성비 29결측은 승격 전 정상 결측. 국내 ready 7개(KMA+KOSIS 6)
- 검증: typecheck/test(92)/build 통과. 실측 조인 4건 통과(2000년 출생성비는 16+1 부분결합이 정상)
- 브라우저/API: KOSIS API 실측. 키·원문 비밀값 기록 없음. 화면 렌더는 배포 후 확인
- 차단/주의: 없음
- 다음 작업: 배포 후 7개 dataset 렌더 확인
- 커밋: `88c9f20`에 포함

### 2026-09-17 — OpenCode — QUERY-UX 조건·시각화 분리

- 결과: 완료
- 변경: `src/pages/CreatePage.tsx`(01 QUERY 섹션에 dataset·지표/기간·연도·시도경계 통합, 02/03 재번호), `src/components/Climate2DWorkspace.tsx`(조건 컨트롤 제거·보기 토글만), `src/components/Kosis2DWorkspace.tsx`(연도 셀렉터 제거·보기 토글만)
- 결정/데이터: 지도·그래프·표가 원래 같은 조회 상태를 공유하고 있었으므로, 컨트롤 위치만 위로 옮기고 데이터 흐름은 불변. DB·API 변경 없음
- 검증: typecheck/test(92)/build 통과, dev 서버 200
- 브라우저/API: 렌더 미확인. 배포 후 연도 변경 시 지도·그래프·표 동반 갱신 확인 필요
- 차단/주의: 없음
- 다음 작업: 배포 후 렌더 확인
- 커밋: `bb362be feat: unified query section with dataset, year and boundary controls`에 포함 (origin/main push済)

### 2026-09-17 — OpenCode — NGII-BASEMAP 교육용 백지도 옵션

- 결과: 부분 완료 (구현済, 타일 실측 차단)
- 변경: `src/lib/api/requests.ts`(`buildNgiiWmtsUrl`), `src/lib/env.ts`(`VITE_NGII_WMTS_KEY`), `src/lib/vworld2d.ts`(NGII_EDU 옵션·WMTS 레이어 관리·EPSG:5179 그리드), `src/components/VWorld2DMap.tsx`(키 있을 때만 옵션 노출·실패 안내), 테스트 2개 추가, `.env.example`(변수명만)
- 결정/데이터: 키는 `.env.local`에만 저장하고 Git·문서·코드에 값을 남기지 않음. 레이어명 `white_edu_map`·matrixSet `EPSG:5179`·L05~L18은 공개 ol-ngii 샘플 기준. 서버 직접 타일 요청이 빈 200만 반환해 키 미활성(승인 대기) 또는 도메인 등록 문제로 판단, 브라우저 확인으로 이관
- 검증: typecheck/test(94)/build 통과, dev 서버 200. WMTS 타일 렌더·EPSG:5179 extent·PNG/PDF export는 브라우저에서 확인 필요
- 브라우저/API: NGII Gettile 서버 실측(빈 응답). 키 값 기록 없음
- 차단/주의: 국토정보플랫폼에서 키 활성화 상태와 등록 도메인/Referer 조건을 먼저 확인해야 함
- 다음 작업: 키 활성화 후 브라우저에서 교육용 백지도 선택·주제도 겹침·export 확인
- 커밋: 미커밋 로컬 변경

### 2026-09-17 — OpenCode — ESRI-BASEMAP 밝은 회색지도 옵션

- 결과: 부분 완료 (구현済, 브라우저 렌더 확인 대기)
- 변경: `src/lib/api/requests.ts`(`buildEsriCanvasTileUrl`), `src/lib/vworld2d.ts`(ESRI_GRAY 옵션·XYZ 레이어 관리·출처 상수), `src/components/VWorld2DMap.tsx`(실패 안내·출처 캡션), 테스트 2개 추가. NGII 구현은 키 미활성으로 전면 원복했고 `.env.local` 키도 삭제함(채팅 노출분은 재발급 권장)
- 결정/데이터: CARTO 키 필수화·OSMF 정책·정부 표기 감사(2026-01)를 근거로 외산 OSM 직접 타일 대신 Esri Light Gray Canvas(Base+Reference, 키 불필요, OSM 기여자 포함 표기) 선정. XYZ 래스터라 VWorld 구형 runtime과 호환. OpenFreeMap 벡터는 런타임 버전 리스크로 보류
- 검증: typecheck/test(94)/build 통과, dev 서버 200. Esri 타일 200 실측. 한글 라벨·동해 표기·주제도 겹침·export는 브라우저 확인 필요
- 브라우저/API: Esri 타일 서버 실측(HTTP 200). 키 없음
- 차단/주의: 없음
- 다음 작업: 브라우저에서 밝은 회색지도 선택·주제도 겹침·출처 표시 확인
- 커밋: `fb3314a feat: Esri light gray canvas basemap option`에 포함 (origin/main push済)

### 2026-09-17 — OpenCode — VIZ-TYPE 지표 세분화 유형화 + 지도 크기 조절

- 결과: 완료 (세분화 적재는 후속)
- 변경: `src/components/VWorld2DMap.tsx`(지도 크기 기본/크게/더 크게 + `updateSize`), `src/app/styles.css`(size 토글), `docs/AI_HANDOFF.md`
- 결정/데이터: 세분화 실측 — 공원 3지표·GRDP 5지표·사교육비 5지표·자동차 4용도·출생성비 6순위·사업체 2지표×19산업. 방향: snapshot=지표 1개, dataset=지표 셀렉터(KMA metric 선행 사례), metadata에 지표→snapshot 매핑. 지도 크기는 export 캡처에도 반영됨
- 검증: typecheck/test(94)/build 통과
- 브라우저/API: 렌더 미확인. KOSIS metadata 실측만 수행
- 차단/주의: 없음
- 다음 작업: 지표별 snapshot 적재 + 셀렉터 연결
- 커밋: `f008dff feat: indicator and industry selectors with 27 public snapshots`에 포함 (origin/main push済)

### 2026-09-17 — OpenCode — API 전수 가용성 Audit

- 결과: 완료 (코드 변경 없음)
- 변경: 없음 (read-only 실측)
- 결정/데이터: 7개가 전부가 아님. 실측 통과(미연결): 에어코리아(https 00)·TourAPI(0000/2032건)·EV충전소(00)·단기예보(00/980건)·SGIS 지오코딩(0/Success)·WorldBank·USGS·Open-Meteo·OpenTopoData·GBIF(887만건)·Nominatim. SGIS 센서스는 auth 통과이나 KOSIS와 중복이라 역할 분리상 미사용. 도로명주소는 키 미발급으로 불가. NGII는 미활성 대기
- 검증: 각 API HTTP 실측. 키·원문 비밀값 기록 없음
- 차단/주의: 없음
- 다음 작업: 에어코리아 snapshot (PM10/PM2.5 탈락분 대체) → TourAPI/EV POI → 단기예보
- 커밋: 미커밋 로컬 변경 (문서만)

### 2026-09-17 — OpenCode — PHASE-C 지표·산업 셀렉터

- 결과: 완료
- 변경: 지표 snapshot 21건 공개 적재(총 27개·17,820행), `src/lib/dataset-catalog.ts`(indicators), `src/lib/kosis-dimensions.ts`(신규·산업 19종), `src/lib/geo-observations.ts`(분류 필터), `src/pages/CreatePage.tsx`(지표·산업 셀렉터), `scripts/kosis-snapshot.mjs`(label 지역명), `dataset_catalog` 6행 indicators 등록, 테스트 6개 추가
- 결정/데이터: snapshot=지표 1개, dataset=지표 셀렉터(KMA metric 선행 사례). 산업 선택지는 ind-T1/ind-T2에만 표시. PM10/PM2.5 제외 유지
- 검증: typecheck/test(100)/build 통과. 27 snapshot 전수·indicators 연결·실측 조인 통과
- 브라우저/API: KOSIS API 실측. 키·원문 비밀값 기록 없음. 화면 렌더는 배포 후 확인
- 차단/주의: 없음
- 다음 작업: 배포 후 지표·산업·연도 전환 렌더 확인
- 커밋: `f008dff feat: indicator and industry selectors with 27 public snapshots`에 포함 (origin/main push済)

### 2026-09-17 — OpenCode — PHASE-D 에어코리아 시도 실시간

- 결과: 완료
- 변경: `scripts/airkorea-snapshot.mjs`+테스트(신규), `src/lib/geo-observations.ts`(schema 파라미터), `src/lib/geo-join.ts`(1:N fan-out), `src/lib/kosis-crosswalk.ts`(시도명 17종), `src/lib/kosis-adapter.ts`(provider 파라미터), `Snapshot2DWorkspace` 개명·일반화, `src/pages/CreatePage.tsx`(provider 게이트), 카탈로그 정적·DB 등록. snapshot 2건·32행 공개 적재
- 결정/데이터: 측정소 672행→최다시각 664행→시도 평균 16행. 전남광주는 24·36 fan-out. 공공누리 3유형 출처 보존. 국내 ready 8개
- 검증: typecheck/test(103)/build 통과. 실측 fan-out 17/17 통과
- 브라우저/API: AirKorea API 실측. 키·원문 비밀값 기록 없음. 화면 렌더는 배포 후 확인
- 차단/주의: 없음
- 다음 작업: 배포 후 에어코리아 전환 렌더 확인
- 커밋: `fdac808 feat: TourAPI attraction point distribution pipeline`에 포함 (origin/main push済)

### 2026-09-17 — OpenCode — PHASE-E TourAPI 관광지 점분포

- 결과: 완료
- 변경: `scripts/tourapi-snapshot.mjs`+테스트(신규), `src/lib/tourapi-adapter.ts`+테스트(신규), `src/components/Poi2DWorkspace.tsx`(신규), `src/lib/vworld2d.ts`(POI 레이어·클릭), `src/components/VWorld2DMap.tsx`(점·상세), `src/lib/dataset-catalog.ts`(`kind`), `src/pages/CreatePage.tsx`(POI 분기), 운영 DB에 17 snapshots·6,677행 공개 적재 + 카탈로그 등록
- 결정/데이터: 지표 셀렉터를 지역 선택으로 재사용(17 지역 snapshots). 이미지는 URL·라이선스만 보관. EV는 시도 상한 초과로 시군구 분할 이관
- 검증: typecheck/test(109)/build 통과. 실측 POI 294/294 변환 통과
- 브라우저/API: TourAPI 실측. 키·원문 비밀값 기록 없음. 점 렌더는 배포 후 확인
- 차단/주의: 없음
- 다음 작업: EV 시군구 분할 또는 단기예보 클릭 조회
- 커밋: `fdac808 feat: TourAPI attraction point distribution pipeline`에 포함 (origin/main push済)

### 2026-09-17 — OpenCode — PHASE-F 단기예보 클릭 조회

- 결과: 완료 (EV 적재는 일일한도 대기)
- 변경: `src/lib/forecast.ts`+테스트(신규 6개), `src/components/ForecastPanel.tsx`(신규), `src/lib/vworld2d.ts`(빈 곳 클릭 좌표), `src/components/VWorld2DMap.tsx`(예보 모드 전달), `src/pages/CreatePage.tsx`(토글·조회·패널), `scripts/ev-snapshot.mjs`(신규, 미적재)
- 결정/데이터: DFS 공식 실측 검증(서울시청→60,127). 예보는 현재성 배지. EV는 45만 행 집계 확인 후 429로 중단, 재시도 로직 추가하고 내일 재개
- 검증: typecheck/test(115)/build 통과. Production 프록시 실측
- 브라우저/API: 클릭→좌표 변환은 브라우저 확인 필요. 키·원문 비밀값 기록 없음
- 차단/주의: EV data.go.kr 일일한도 (429) — 내일 `node scripts/ev-snapshot.mjs --write` 재개
- 다음 작업: EV 적재 재개 → 세계 5종
- 커밋: `8ba1bf7 feat: short-term forecast click lookup and EV ingest script`에 포함 (origin/main push済)

### 2026-09-17 — [Codex|Claude|OpenCode] — [TASK-ID]

- 결과: [완료|부분 완료|차단]
- 변경:
- 결정/데이터:
- 검증:
- 브라우저/API:
- 차단/주의:
- 다음 작업:
- 커밋:
