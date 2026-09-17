import { useId } from "react";
import { useDatasetCatalog, type DatasetDefinition, type DatasetScope } from "../lib/dataset-catalog";

function capabilityLabel(capability: DatasetDefinition["capabilities"][number]): string {
  return { map: "지도", chart: "그래프", table: "표" }[capability];
}

export function DatasetSelector({
  scope,
  value,
  onChange,
}: {
  scope: DatasetScope;
  value: string;
  onChange: (datasetKey: string) => void;
}) {
  const rawId = useId();
  const selectId = `dataset-select-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const datasets = useDatasetCatalog(scope);
  const selected = datasets.find((dataset) => dataset.key === value) ?? datasets[0];
  const ready = datasets.filter((dataset) => dataset.status === "ready");
  const planned = datasets.filter((dataset) => dataset.status === "planned");

  return (
    <div className="dataset-selector">
      <label className="field-label" htmlFor={selectId}>승인된 데이터셋</label>
      <select id={selectId} value={value} onChange={(event) => onChange(event.target.value)}>
        {ready.length > 0 && (
          <optgroup label="현재 사용 가능">
            {ready.map((dataset) => <option key={dataset.key} value={dataset.key}>{dataset.title} · {dataset.provider}</option>)}
          </optgroup>
        )}
        {planned.length > 0 && (
          <optgroup label="다음 단계 준비">
            {planned.map((dataset) => <option key={dataset.key} value={dataset.key}>{dataset.title} · 준비 중</option>)}
          </optgroup>
        )}
      </select>
      {selected && (
        <div className={`dataset-selector__detail dataset-selector__detail--${selected.status}`}>
          <div className="dataset-selector__title"><strong>{selected.title}</strong><span>{selected.status === "ready" ? "공개 사용 가능" : "controlled ingest 대기"}</span></div>
          <p>{selected.description}</p>
          <div className="dataset-selector__meta"><span>{selected.space}</span><span>{selected.coverage}</span><span>{selected.period.label}</span><span>{selected.capabilities.map(capabilityLabel).join(" · ")}</span></div>
        </div>
      )}
    </div>
  );
}

