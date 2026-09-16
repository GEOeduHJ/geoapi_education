# API 키 매니페스트

> 실제 인증값은 저장소 문서에 기록하지 않는다. 로컬 개발은 `.env.local`, 배포는 Vercel/CI Secret에 넣는다.

## 현재 등록한 키

사용자가 발급한 값은 작업 공간의 `.env.local`에 반영했다. 아래 표는 값 자체가 아니라 변수명·노출 범위·용도를 기록한다.

| 서비스 | 환경변수 | 상태 | 노출 범위 | 비고 |
| --- | --- | --- | --- | --- |
| KOSIS 공유서비스 | `KOSIS_API_KEY` | 등록 | 서버 전용 | 통계표 ID 확정 후 데이터 스모크 테스트 |
| SGIS | `SGIS_CONSUMER_KEY` / `SGIS_CONSUMER_SECRET` | 등록 | 서버 전용 | 인증 토큰은 브라우저로 전달하지 않음 |
| VWorld | `VITE_VWORLD_API_KEY` | 운영 hostname 확인: `geoapieducation.vercel.app`; 허용목록 등록 대기 | 등록 도메인 브라우저 | 로컬은 현재 브라우저 hostname을 자동 사용하고, Production `VITE_VWORLD_DOMAIN`에는 운영 hostname을 넣는다 |
| 기상청 API 허브 | `KMA_AUTH_KEY` | 신청·승인·HTTP 200 확인 | 서버 전용 | ASOS 관측·기후 스냅샷 적재 |
| 공공데이터포털 | `DATA_GO_KR_SERVICE_KEY` | 신청·승인 완료·단기예보 정상 응답 확인 | 서버 전용 | 하나의 ServiceKey를 승인된 공공데이터포털 API에 공통 사용하고, URL 생성 전에 한 번만 정규화 |
| 에어코리아 | `DATA_GO_KR_SERVICE_KEY` | 신청·승인 완료·endpoint 재검증 대기 | 서버 전용 | 공공데이터포털 공통 ServiceKey 사용 |
| TourAPI | `DATA_GO_KR_SERVICE_KEY` | 신청·승인 완료·endpoint 재검증 대기 | 서버 전용 | 공공데이터포털 공통 ServiceKey 사용 |
| 전기차 충전소 | `DATA_GO_KR_SERVICE_KEY` | 신청·승인 완료·endpoint 재검증 대기 | 서버 전용 | P1 확장 시 공공데이터포털 공통 ServiceKey 사용 |

## 아직 비워둔 모듈

도로명주소 API는 사용 목적에 따라 신청 모듈이 달라진다. 따라서 다음 변수는 빈 값으로 두었고, 실제 기능 범위가 확정된 뒤 해당 키만 추가한다.

- `JUSO_CONFIRM_KEY`: 주소 검색 확인용
- `JUSO_COORDINATE_KEY`: 좌표 변환용
- `JUSO_DETAIL_KEY`: 상세주소용
- `JUSO_MAP_KEY`: 지도 모듈용

## 보안·배포 규칙

1. `.env.local`과 모든 `.env.*` 파일은 `.gitignore`로 제외한다. 커밋·PR·스크린샷·브라우저 로그에 값을 남기지 않는다.
2. `VITE_` 접두사가 붙은 값은 브라우저 번들에 포함될 수 있다. 현재는 VWorld처럼 등록 도메인으로 제한되는 클라이언트 키만 허용한다.
3. KOSIS·SGIS·기상청·공공데이터포털 키는 Vercel Serverless/Edge 함수 또는 별도 수집 작업에서만 사용한다.
4. 공공데이터포털 서비스키는 환경에 따라 이미 인코딩된 값으로 발급될 수 있으므로 URL 생성 전에 한 번만 디코딩한다. 이 규칙은 `src/lib/api/requests.ts`와 `scripts/smoke-api.mjs`에 반영했다.
5. Supabase 브라우저에는 Publishable Key만 사용하고 Secret Key는 Vercel 함수·Actions에만 둔다. 새 키 형식(`sb_publishable_...`, `sb_secret_...`)을 우선 사용하며, 어느 키도 `VITE_` Secret 변수로 만들지 않는다.
6. 키가 유출되었다고 판단되면 제공기관에서 즉시 폐기·재발급하고 `.env.local`을 교체한다.

## 다음 입력

Supabase를 연결할 때 `VITE_SUPABASE_URL`, Publishable Key, 서버 수집 작업용 `SUPABASE_URL`, Secret Key를 별도로 넣는다. 현재 저장소의 호환용 변수명은 각각 `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`이며, 새 형식의 키 값을 넣어도 된다. 도로명주소 키는 첫 번째 주소 검색 기능의 요구사항이 확정될 때 신청한다.

## VWorld domain 운용

VWorld 브라우저 로더의 `domain`은 API key와 별도로 현재 웹 페이지가 실행된 hostname을 허용목록과 대조하는 값이다. 로컬 개발에서는 `localhost`와 `127.0.0.1` 중 실제 브라우저 주소의 hostname을 코드가 자동 감지한다. Vite 포트가 바뀌어도 hostname이 같으면 환경변수를 매번 수정하지 않는다.

```text
로컬: http://localhost:5175       → domain=localhost
로컬: http://127.0.0.1:5175       → domain=127.0.0.1
운영: https://geoapieducation.vercel.app → domain=geoapieducation.vercel.app
```

현재 운영 주소는 `geoapieducation.vercel.app`이다. VWorld 관리 화면에 이 hostname을 등록하고, Vercel Production 환경변수 `VITE_VWORLD_DOMAIN`에도 같은 hostname을 넣는다. `https://`, 경로, 포트 포함 여부는 VWorld 관리 화면의 입력 규칙을 따른다. [VWorld 2D 지도 API 안내](https://www.vworld.kr/dev/v4dv_opn2dmap2guide_s001.do)

## 2026-09-16 스모크 결과

- SGIS 인증: 성공.
- 기상청 API 허브 ASOS: `HTTP 200` 확인.
- 공공데이터포털 단기예보: 활용승인 후 `HTTP 200 / NORMAL_SERVICE` 확인.
- VWorld: 로컬에서는 브라우저 hostname 자동 감지. Vercel 운영 hostname 등록 후 실제 지도 로더를 검증한다.
- KOSIS: 키만으로는 통계표 요청 파라미터를 정할 수 없어 첫 `orgId`·`tblId` 선정 후 검증.
