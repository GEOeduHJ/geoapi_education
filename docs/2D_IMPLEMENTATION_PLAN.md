# 2D 자료 제작 구현 계획

> 이 문서를 2D 기능 개발의 실행 기준으로 사용한다. 교대 작업의 현재 상태와 다음 task는 [AI 작업 인계 문서](AI_HANDOFF.md), 에이전트 공통 규칙은 [AGENTS.md](../AGENTS.md)를 먼저 확인한다. API별 인증·한도·약관은 [API 키 매니페스트](API_KEY_MANIFEST.md), 기존 전체 설계는 [개발 계획](DEVELOPMENT_PLAN.md)을 참조한다.

## 1. 목표와 완료 조건

### 목표

국내·세계 자료를 `자료 선택 → 조건 선택 → 정규화 → 지도·그래프·표 → 파일 내보내기 → 출처 기록`의 동일한 흐름으로 제작한다. 학생 화면은 승인된 DB snapshot을 우선 조회하고, 실시간성이 필요한 경우에만 서버 프록시를 사용한다.

### 2D 완료 조건

- [ ] 국내/세계 작업공간과 curated dataset 드롭다운이 분리되어 있다.
- [ ] 선택한 데이터셋의 실제 최소·최대 시점만 선택할 수 있다.
- [ ] 하나의 조회 조건이 지도·그래프·표에 동일하게 반영된다.
- [ ] 국내 경계의 수준·연도·선택 지역 필터가 지도·범례·그래프·표에 함께 반영된다.
- [ ] KOSIS·KMA·SGIS의 snapshot/경계 버전·단위·결측·출처가 화면에 표시된다.
- [ ] 지도 PNG/PDF, 그래프 PNG/PDF, 표 CSV를 내려받을 수 있다.
- [ ] 실제 값이 없는 데이터셋은 지도·차트에 임의의 값을 그리지 않고 준비 상태를 명확히 표시한다.
- [ ] 위 조건을 통과하기 전에는 3D 기능을 확장하지 않는다.

## 2. 현재 기준선과 문제

| 영역 | 현재 상태 | 이번 개발의 조치 |
|---|---|---|
| VWorld 2D | 배경지도 5종, KMA 관측소, SGIS 기준경계, PNG/PDF | 공통 레이어 계약과 선택 지역 필터 연결 |
| KMA ASOS | Supabase에 2016~2025년 10개 지점·36,530 일자료와 월 요약 적재 | 2D에서 기후 지표의 지도·그래프·표를 하나의 조회로 연결 |
| KOSIS | 검색/미리보기는 있으나 공개 snapshot이 없어 값이 표시되지 않음 | 학습자 검색 제거, 승인 카탈로그 드롭다운으로 전환. 코드·경계 기준 검증 후 controlled ingest |
| SGIS | 2025 시도 경계 조회·EPSG:5179 변환 | 수준·연도·선택 지역 필터를 조인 계약에 포함 |
| 세계 자료 | API 레지스트리만 있고 2D 화면 연결 전 | World Bank부터 국가 단위 DB snapshot으로 확장 |
| 3D | 초기화 계약/placeholder | 2D 완료 gate 통과 전 동결 |

## 3. 화면·데이터 흐름

```text
국내/세계 모드
    ↓
curated dataset catalog
    ↓
DatasetQuery (dataset, metric, period, geography, selected codes)
    ↓
repository (Supabase snapshot 우선, 실시간 API는 서버 캐시)
    ↓
normalized records + provenance
    ├─ MapLayerSpec
    ├─ ChartSpec
    └─ TableModel
    ↓
PNG/PDF/CSV export + 탐구 활동 연결
```

### 화면 구조

| 경로 | 역할 |
|---|---|
| `/create/2d` | 국내 2D 기본 진입점(국내 모드로 이동) |
| `/create/2d/domestic` | SGIS 행정경계·KMA/KOSIS·국내 POI 제작 |
| `/create/2d/world` | 국가·도시·세계 POI 제작 |
| `/create/chart` | 기존 KMA 비교 화면을 공통 그래프/표 계약으로 이전 |
| `/inquiry/2d/:activityId` | 제작된 자료의 관찰·비교·설명·일반화 질문 연결 |

## 4. 데이터셋과 시각화 계약

| 데이터셋 | 공간 단위 | 지도 | 그래프 | 표 | 저장 원칙 | 단계 |
|---|---|---|---|---|---|---|
| KMA ASOS 기후 | 관측지점 | 지점 심볼/값 크기·색 | 관측소 비교, 기간 변화 | 지점·기간·지표·결측 | Supabase 일자료+월 요약 | 1 |
| KOSIS 승인 통계 | 시도/시군구 등 | 단계구분도 | 지역 순위·시계열 | 지역·시점·단위 | controlled snapshot | 2 |
| SGIS 경계 | 행정구역 | 기준경계/선택 영역 | 경계별 값의 기반 | 코드·명칭·버전 | 연도별 geometry snapshot | 1 |
| World Bank | 국가 | 국가 단계구분도 | 순위·시계열·산점도 | 국가·연도·지표 | 지표별 DB snapshot | 3 |
| Open-Meteo | 도시/격자 | 도시 심볼/등치 | 기후·계절 변화 | 도시·기간·변수 | 역사자료 DB화 | 4 |
| USGS 지진 | 지점 | 규모별 원/시간축 | 규모·깊이·시간 | 이벤트·좌표·규모 | 이력 DB, 최근 피드 캐시 | 4 |
| OpenTopoData | 점/경로 | 고도점·등고선 보조 | 고도 단면 | 좌표·고도·NODATA | 요청 결과 재사용 | 4/3D 보조 |
| GBIF | 생물 관측점 | 발생 밀도/점 | 종·시기 비교 | 종·좌표·출처 | 라이선스 포함 snapshot | 5 |
| TourAPI/충전소/에어코리아 | POI/관측소 | 점·밀도 | 지역별 수·변화 | 시설·관측값 | 주기별 snapshot | 5 |

표현은 자료의 공간 단위에 맞춘다. 점 자료를 임의로 행정구역 값으로 바꾸지 않으며, 관측값·모델값·예보값을 서로 다른 자료 배지로 표시한다.

## 5. 단계별 실행 항목

### Phase 0 — 문서·공통 계약 (진행 중)

- [x] 2D 완료 조건과 단계별 범위를 이 문서에 고정
- [~] `DatasetDefinition` 타입과 curated catalog 작성. `DatasetQuery`·`MapLayerSpec`·`ChartSpec`·`TableModel`은 KOSIS/세계 adapter 추가 때 공통 타입으로 확장
- [x] 데이터셋 key·provider·scope·capabilities·coverage·period bounds 필드 확정
- [x] 지도/그래프/표가 같은 metric·period·boundary 상태를 공유하도록 화면 상태 경계 확정

**종료 기준:** 새로운 provider를 추가할 때 화면 컴포넌트를 복제하지 않고 repository와 adapter만 추가할 수 있음.

### Phase 1 — 국내 KMA 수직 슬라이스 + 경계 필터 (이번 작업)

- [x] 승인 카탈로그 드롭다운 구현. learner UI에서 KOSIS 자유 검색 제거
- [x] KMA 지표·시작일·종료일·행정경계 선택 상태를 하나의 화면 query로 관리
- [x] KMA 관측소 값 기반 2D 지점 표현, 기간 비교 그래프, 상세 표 구현
- [x] 전체/선택 지역 필터를 지도·범례·그래프·표 범위에 전달
- [~] 실제 DB coverage를 화면에 표시하고 입력 범위를 제한. 날짜 옵션을 데이터셋 metadata에서 자동 생성하는 작업은 KOSIS adapter 단계에서 공통화
- [~] 자료 유형·실제 범위·결측률을 표시. 공식 출처 링크와 snapshot 식별자는 공통 provenance 패널로 확장 예정

**종료 기준:** KMA 한 데이터셋에서 지도·그래프·표의 지역 수와 값이 서로 일치하고 PNG/PDF/CSV가 동일 조건을 사용함.

### Phase 2 — KOSIS 실제 주제도

- [ ] `dataset_catalog` migration과 public read RLS 적용
- [ ] 수업용 KOSIS 표를 표 ID·분류·항목·단위·기간·경계 기준과 함께 등록
- [ ] 기존 후보의 `12` 통합지역과 SGIS `24/36` 불일치를 해결하거나 부분 범위로 명시
- [ ] DRY-RUN → checksum/행 수/코드 검증 → `--write --public` 순서로 적재
- [ ] 카탈로그의 공개 snapshot만 학습자에게 노출
- [ ] KOSIS 단계구분도·지역 순위·기간 그래프·표를 실제값으로 검증

**종료 기준:** “공개 snapshot이 아직 없습니다”가 승인 데이터셋에서 발생하지 않고, 조인 실패 시 원인과 미일치 코드가 표시됨.

### Phase 3 — 세계 World Bank 수직 슬라이스

- [ ] 국가 코드·이름·geometry 버전 고정
- [ ] 지표 metadata와 연도 범위를 DB snapshot으로 저장
- [ ] 세계 단계구분도·순위/시계열/산점도·표 구현
- [ ] 국내/세계 모드의 공통 export·출처 패널 재사용

### Phase 4 — 국내·세계 확장 자료

- [ ] Open-Meteo 도시 기후
- [ ] USGS 지진 이력과 60초 이상 캐시된 최근 피드
- [ ] OpenTopoData 고도 프로파일 및 3D 입력용 샘플
- [ ] TourAPI·전기차 충전소·에어코리아·GBIF를 라이선스와 snapshot 주기 확인 후 추가

### Phase 5 — 3D 전환 gate

다음 항목이 모두 통과할 때만 시작한다.

- [ ] 국내/세계 2D 모드가 실제 자료로 동작
- [ ] 최소 KMA·KOSIS·World Bank에서 지도·그래프·표·출처·export 동작
- [ ] 선택 경계 필터가 전 표현에 일관되게 반영
- [ ] 공개 snapshot과 코드 조인 검증이 자동 테스트됨
- [ ] 고도·지형 자료의 해상도·범위·용량 예산 확정

## 6. Supabase 사용 범위

Supabase는 로그인 provider가 아니다. 이 프로젝트에서의 역할은 다음 세 가지다.

1. KMA·KOSIS·세계 지표처럼 과거·누적·반복 사용 자료의 snapshot 저장
2. 정규화 관측값·월별 요약·출처/버전/checksum 조회
3. 로그인 없이 공개된 자료를 RLS로 읽기 전용 제공

브라우저는 publishable key로 공개 행만 읽는다. API key와 service-role key는 Vercel server function 또는 GitHub Actions secret에만 둔다. 학생 답안 저장은 현재 범위가 아니며, 이후 필요하면 별도 서버 제출 경로와 익명 식별 정책을 설계한다.

### 필요한 스키마

| 구조 | 용도 | 공개 읽기 |
|---|---|---|
| `data_sources` | 제공기관·출처·약관 | 허용 |
| `source_snapshots` | 요청 범위·checksum·공개 여부 | `is_public=true`만 |
| `geo_observations` | KOSIS 등 정규화 값 | 공개 snapshot만 |
| `climate_*` | KMA 관측소·일자료·월 요약 | 공개 자료만 |
| `dataset_catalog` | 학습자에게 허용한 데이터셋과 기능/coverage | `status='published'`만 |

## 7. 행정경계 필터 규칙 (2026-09-17 결정: 시도 단위로 고정)

1. `level`은 `"sido"`로 고정하고, `year=2025`, `parentCode=non`, `selectedCodes`만 query에 저장한다. 시군구·읍면동(행정동/법정동)은 값 원천과 코드 대응표가 확보될 때까지 지원하지 않는다. 근거: KOSIS 후보 표는 시도급까지만 검증됐고(`geo_observations` 0행), KMA는 10개 관측소로 시군구를 채울 수 없으며, 시군구 5자리·읍면동 8자리 crosswalk가 없다.
2. 경계 API 응답과 값 snapshot의 코드는 같은 기준연도에서 `code === adm_cd`일 때만 조인한다.
3. `전체`는 해당 응답의 모든 feature, `선택`은 `selectedCodes`와 일치하는 feature만 렌더링한다.
4. 동일한 filtered set을 지도 layer, 범례 min/max, 그래프 rows, 표 rows, export에 전달한다.
5. 미일치·중복·복수 시점·복수 단위가 있으면 색상 결합을 보류하고 진단을 표시한다. 지역명 추정 조인은 하지 않는다.

## 8. 검증과 배포 체크리스트

### 코드 검증

```bash
npm run typecheck
npm test
npm run build
```

### 브라우저 검증

- `/create/2d/domestic`에서 데이터셋·지표·기간·경계 선택
- 같은 지역 수와 값이 지도·그래프·표에 표시되는지 확인
- 전체↔선택 지역을 바꾸고 세 표현과 export 결과가 함께 바뀌는지 확인
- 데이터셋 미공개/결측/조인 실패 상태가 오류 없이 설명되는지 확인
- `/create/2d/world`에서 준비된 국가 데이터셋을 같은 방식으로 확인
- 콘솔 오류·실패 요청이 없는지 확인

### 배포

1. migration을 Supabase SQL Editor에 적용한다.
2. GitHub Actions의 KOSIS workflow는 DRY-RUN을 먼저 실행한다.
3. 검증 로그가 통과한 경우에만 공개 적재한다.
4. main push 후 Vercel Preview를 브라우저 검증하고 Production을 확인한다.
5. VWorld 운영 domain은 `geoapieducation.vercel.app`으로 유지하며 로컬에서는 현재 hostname 자동 감지를 사용한다.

## 9. 현재 진행도

| 단계 | 상태 | 다음 산출물 |
|---|---|---|
| Phase 0 | 1차 완료 | KOSIS/세계 adapter와 공통 시각화 타입 확장 |
| Phase 1 | 완료 | KMA 지도·그래프·표·export·provenance, 시도 경계 필터 (브라우저 재확인 잔여) |
| Phase 2 | 완료 | KOSIS 승인 snapshot 공개, 17/17 조인, 단계구분도·순위 그래프·표·CSV·provenance (브라우저 재확인 잔여) |
| Phase 3 | 대기 | World Bank 세계 자료 |
| Phase 4 | 대기 | 확장 provider adapters |
| Phase 5 | 차단 | 2D 완료 gate 이후 3D |
