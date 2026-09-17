# GeoLab Classroom

지리교육을 위한 자료 제작·자료 활용 탐구 학습 사이트의 초기 구현이다.

Codex·Claude·OpenCode가 교대로 작업할 때는 먼저 [에이전트 공통 작업 규칙](AGENTS.md)을 읽고, 현재 상태와 다음 작업은 [AI 작업 인계 문서](docs/AI_HANDOFF.md)를 기준으로 한다.

## 빠른 시작

```bash
cp .env.example .env.local
npm install
npm run dev
```

현재 작업 공간에는 사용자가 발급한 키가 들어간 `.env.local`이 이미 있다. 이 파일은 `.gitignore`로 제외되어 있으며, 실제 배포에서는 Vercel Environment Variables 또는 GitHub Actions Secrets를 사용한다.

## 주요 경로

- `/create`: 자료 제작 허브
- `/create/2d`: `/create/2d/domestic`로 이동하는 2D 지도자료 허브
- `/create/2d/domestic`: curated 데이터셋 드롭다운, VWorld 2D 배경, KMA ASOS 지점값 지도·그래프·표, SGIS 선택 경계
- `/create/2d/world`: 세계 데이터셋을 같은 계약으로 확장하는 작업공간
- `/create/3d`: VWorld 3D 지도자료 작업공간 계약
- `/create/chart`: 통계·차트자료 작업공간 계약
- `/inquiry`: 6단계 자료 탐구 허브
- `/inquiry/2d/:activityId`, `/inquiry/3d/:activityId`, `/inquiry/chart/:activityId`: 자료 유형별 탐구 활동
- `/status`: API 레지스트리와 브라우저 환경 상태

`/create/chart`에는 KMA ASOS 일자료를 Supabase snapshot에서 읽는 기후 비교 실험이 들어 있다. 월 단위로 정렬된 장기 범위는 `climate_period_summaries` 요약 view를 사용하고, 짧거나 월 중간 범위는 일자료를 사용한다. `/create/2d/domestic`에서는 같은 KMA 자료를 지점값 기반 VWorld 2D 지도·그래프·표로 표현하고, SGIS 시도 경계를 전체 또는 선택 지역으로 필터링한다. KOSIS는 learner UI에서 자유 검색하지 않고 승인 카탈로그 드롭다운으로만 공개하며, 코드·기간·출처 검증을 통과한 snapshot만 시각화한다. 지도 배경은 백지도를 기본값으로 하고 기본도(도로)·야간지도·항공사진·항공사진+표시로 전환할 수 있다. 2D 지도와 기후 비교 자료는 현재 화면에서 조작 패널을 제외하고 PNG 이미지 또는 A4 PDF로 내려받을 수 있다. 세부 실행 순서와 3D 전환 조건은 [2D 구현 실행 계획](docs/2D_IMPLEMENTATION_PLAN.md)에 있다.

## 품질 확인

```bash
npm run typecheck
npm test
npm run build
node scripts/smoke-api.mjs
```

스모크 테스트는 키나 응답 본문을 출력하지 않는다. SGIS·기상청 ASOS·공공데이터포털 단기예보·VWorld 로더·KOSIS 검색·Supabase 공개 읽기·학습기록 직접 접근 차단을 확인한다. KOSIS 통계값 요청은 표의 `orgId`, `tblId`, 분류·항목 코드를 확정한 뒤 별도로 실행한다. 현재 MVP는 로그인 없이 공개 자료를 이용하는 방식이다.

## 문서

- [에이전트 공통 작업 규칙](AGENTS.md)
- [Claude 작업 진입점](CLAUDE.md)
- [OpenCode 작업 진입점](OPENCODE.md)
- [AI 작업 인계 문서](docs/AI_HANDOFF.md)
- [에이전트 작업 로그](docs/AGENT_WORK_LOG.md)
- [전체 개발 계획](docs/DEVELOPMENT_PLAN.md)
- [2D 구현 실행 계획](docs/2D_IMPLEMENTATION_PLAN.md)
- [API 키 매니페스트](docs/API_KEY_MANIFEST.md)
- [구현 진행 현황](docs/IMPLEMENTATION_STATUS.md)
- [백엔드·저장소 선택 결정서](docs/BACKEND_STORAGE_DECISION.md)
- [Supabase 역할과 공개 이용 정책](docs/SUPABASE_ROLE.md)
- [다음 작업 준비](docs/NEXT_TASKS.md)
- [KOSIS adapter 계약](docs/KOSIS_ADAPTER.md)

로컬 VWorld 지도는 현재 브라우저의 `localhost` 또는 `127.0.0.1` hostname을 자동으로 domain 파라미터에 사용한다. Vercel 배포 후에는 VWorld에 등록한 운영 hostname을 `VITE_VWORLD_DOMAIN`에 설정한다.
