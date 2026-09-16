# GeoLab Classroom

지리교육을 위한 자료 제작·자료 활용 탐구 학습 사이트의 초기 구현이다.

## 빠른 시작

```bash
cp .env.example .env.local
npm install
npm run dev
```

현재 작업 공간에는 사용자가 발급한 키가 들어간 `.env.local`이 이미 있다. 이 파일은 `.gitignore`로 제외되어 있으며, 실제 배포에서는 Vercel Environment Variables 또는 GitHub Actions Secrets를 사용한다.

## 주요 경로

- `/create`: 자료 제작 허브
- `/create/2d`: VWorld 2D 지도자료 작업공간과 KMA ASOS 관측소 레이어
- `/create/3d`: VWorld 3D 지도자료 작업공간 계약
- `/create/chart`: 통계·차트자료 작업공간 계약
- `/inquiry`: 6단계 자료 탐구 허브
- `/inquiry/2d/:activityId`, `/inquiry/3d/:activityId`, `/inquiry/chart/:activityId`: 자료 유형별 탐구 활동
- `/status`: API 레지스트리와 브라우저 환경 상태

`/create/chart`에는 KMA ASOS 일자료를 Supabase snapshot에서 읽는 기후 비교 실험이 들어 있다. 월 단위로 정렬된 장기 범위는 `climate_period_summaries` 요약 view를 사용하고, 짧거나 월 중간 범위는 일자료를 사용한다. 자료가 없으면 오류를 숨기지 않고 migration·수집기 실행 상태를 안내한다.

## 품질 확인

```bash
npm run typecheck
npm test
npm run build
node scripts/smoke-api.mjs
```

스모크 테스트는 키나 응답 본문을 출력하지 않는다. SGIS·기상청 ASOS·공공데이터포털 단기예보·VWorld 로더·KOSIS 검색·Supabase 공개 읽기·학습기록 직접 접근 차단을 확인한다. KOSIS 통계값 요청은 표의 `orgId`, `tblId`, 분류·항목 코드를 확정한 뒤 별도로 실행한다. 현재 MVP는 로그인 없이 공개 자료를 이용하는 방식이다.

## 문서

- [전체 개발 계획](docs/DEVELOPMENT_PLAN.md)
- [API 키 매니페스트](docs/API_KEY_MANIFEST.md)
- [구현 진행 현황](docs/IMPLEMENTATION_STATUS.md)
- [백엔드·저장소 선택 결정서](docs/BACKEND_STORAGE_DECISION.md)
- [Supabase 역할과 공개 이용 정책](docs/SUPABASE_ROLE.md)
- [다음 작업 준비](docs/NEXT_TASKS.md)
- [KOSIS adapter 계약](docs/KOSIS_ADAPTER.md)

로컬 VWorld 지도는 현재 브라우저의 `localhost` 또는 `127.0.0.1` hostname을 자동으로 domain 파라미터에 사용한다. Vercel 배포 후에는 VWorld에 등록한 운영 hostname을 `VITE_VWORLD_DOMAIN`에 설정한다.
