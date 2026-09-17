# Claude 작업 진입점

이 저장소는 에이전트 교대 작업을 전제로 한다. 작업 전에 루트의 [`AGENTS.md`](AGENTS.md)와 [`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md)를 읽고, 2D 기능을 맡는 경우 [`docs/2D_IMPLEMENTATION_PLAN.md`](docs/2D_IMPLEMENTATION_PLAN.md)도 읽는다.

현재 상태·완료/미완료·차단 사유·다음 작업은 `docs/AI_HANDOFF.md`가 우선한다. 작업이 끝나면 그 문서의 인계 템플릿과 `docs/AGENT_WORK_LOG.md`를 갱신하고, 검증 결과와 커밋 또는 `미커밋 로컬 변경` 상태를 남긴다. API 키·Supabase secret·토큰은 소스와 문서에 기록하지 않는다.
