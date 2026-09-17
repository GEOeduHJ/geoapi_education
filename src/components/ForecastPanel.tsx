import type { ForecastSlot } from "../lib/forecast";
import { rainTypeLabel, skyLabel } from "../lib/forecast";

export interface ForecastResult {
  lon: number;
  lat: number;
  nx: number;
  ny: number;
  baseDate: string;
  baseTime: string;
  slots: ForecastSlot[];
  status: "loading" | "ready" | "error";
  error: string | null;
}

function formatSlot(date: string, time: string): string {
  return `${date.slice(4, 6)}/${date.slice(6, 8)} ${time.slice(0, 2)}시`;
}

export function ForecastPanel({ result, onClose }: { result: ForecastResult; onClose: () => void }) {
  return (
    <section className="climate-2d-workspace" aria-labelledby="forecast-title">
      <div className="climate-2d-workspace__heading">
        <div>
          <p className="eyebrow">FORECAST · GRID {result.nx}, {result.ny}</p>
          <h2 id="forecast-title">클릭 지점 단기예보</h2>
          <p>기상청 5km 격자 예보(현재성 자료)입니다. 기후 평균·관측값과 섞어 해석하지 마세요. 기준 발표: {result.baseDate} {result.baseTime}.</p>
        </div>
        <button className="button" type="button" onClick={onClose}>닫기</button>
      </div>
      {result.status === "loading" && <div className="climate-message" role="status">예보를 불러오는 중입니다…</div>}
      {result.status === "error" && <div className="climate-message climate-message--error" role="alert"><strong>예보를 불러오지 못했습니다.</strong>{result.error && <small>{result.error}</small>}</div>}
      {result.status === "ready" && (
        <div className="climate-table-wrap"><table className="climate-table"><thead><tr><th scope="col">시각</th><th scope="col">기온 (°C)</th><th scope="col">하늘</th><th scope="col">강수확률 (%)</th><th scope="col">강수형태</th></tr></thead><tbody>{result.slots.map((slot) => <tr key={`${slot.date}${slot.time}`}><th scope="row">{formatSlot(slot.date, slot.time)}</th><td>{slot.temperature ?? "-"}</td><td>{skyLabel(slot.sky)}</td><td>{slot.rainProbability ?? "-"}</td><td>{rainTypeLabel(slot.rainType)}</td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}
