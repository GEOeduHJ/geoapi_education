import { useEffect, useState } from "react";
import { fetchSgisBoundaries, type SgisBoundaryResponse } from "../lib/sgis";

type PanelStatus = "loading" | "ready" | "error";

export function SgisBoundaryStatusPanel() {
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [data, setData] = useState<SgisBoundaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSgisBoundaries({ year: 2025, admCd: "non", lowSearch: 1 }).then((result) => {
      if (cancelled) return;
      setData(result.data);
      setError(result.error);
      setStatus(result.error ? "error" : "ready");
    }).catch(() => {
      if (cancelled) return;
      setStatus("error");
      setError("SGIS_BOUNDARY_REQUEST_FAILED");
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <section className="sgis-boundary-panel" aria-labelledby="sgis-boundary-panel-title">
      <div className="sgis-boundary-panel__heading">
        <div>
          <p className="eyebrow">SGIS BOUNDARY / 2D REFERENCE</p>
          <h4 id="sgis-boundary-panel-title">행정구역 경계 준비</h4>
        </div>
        <span>2025</span>
      </div>
      {status === "loading" && <p className="sgis-boundary-panel__message" role="status">시도 경계를 확인하는 중입니다…</p>}
      {status === "error" && (
        <div className="sgis-boundary-panel__message sgis-boundary-panel__message--error" role="alert">
          <strong>경계 API를 준비하지 못했습니다.</strong>
          <span>{error === "SGIS_NOT_CONFIGURED" ? "서버용 SGIS consumer key/secret이 Vercel에 연결되지 않았습니다." : "SGIS 인증·활용신청 상태 또는 일시적 장애를 확인하세요."}</span>
        </div>
      )}
      {status === "ready" && data && (
        <>
          <div className="sgis-boundary-panel__summary"><strong>{data.data.features.length}개 경계 확인</strong><span>{data.sourceCrs} · `adm_cd=non`</span></div>
          <div className="sgis-boundary-panel__items" aria-label="SGIS 행정구역 경계 일부">
            {data.data.features.slice(0, 3).map((feature) => <div key={feature.properties.adm_cd ?? feature.properties.adm_nm}><span>{feature.properties.adm_nm ?? "이름 없음"}</span><code>{feature.properties.adm_cd ?? "코드 없음"}</code></div>)}
          </div>
          <p className="sgis-boundary-panel__notice">경계는 EPSG:5179 좌표로 확인했습니다. KOSIS 지역코드와의 대응표를 검증한 뒤 면 레이어에 결합합니다.</p>
        </>
      )}
    </section>
  );
}
