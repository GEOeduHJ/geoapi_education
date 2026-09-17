import { useState, type RefObject } from "react";
import { exportElementAsPdf, exportElementAsPng } from "../lib/material-export";

type ExportStatus = "idle" | "working" | "success" | "error";

export function MaterialExportActions({
  targetRef,
  fileName,
}: {
  targetRef: RefObject<HTMLElement | null>;
  fileName: string;
}) {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport(format: "png" | "pdf") {
    const target = targetRef.current;
    if (!target) {
      setStatus("error");
      setMessage("내보낼 자료 영역을 아직 준비하지 못했습니다.");
      return;
    }

    setStatus("working");
    setMessage(null);
    try {
      if (format === "png") await exportElementAsPng(target, fileName);
      else await exportElementAsPdf(target, fileName);
      setStatus("success");
      setMessage(`${format.toUpperCase()} 파일을 다운로드했습니다.`);
    } catch {
      setStatus("error");
      setMessage("자료를 파일로 변환하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <section className="material-export" data-export-ignore="true" aria-label="자료 파일 다운로드">
      <div className="material-export__copy">
        <p className="eyebrow">EXPORT MATERIAL</p>
        <strong>제작한 자료 내려받기</strong>
        <span>현재 화면의 자료와 범례를 이미지 또는 PDF로 저장합니다.</span>
      </div>
      <div className="material-export__actions">
        <button className="button button-secondary" type="button" onClick={() => void handleExport("png")} disabled={status === "working"}>{status === "working" ? "변환 중…" : "PNG 이미지"}</button>
        <button className="button button-primary" type="button" onClick={() => void handleExport("pdf")} disabled={status === "working"}>{status === "working" ? "변환 중…" : "PDF 문서"}</button>
      </div>
      {message && <small className={`material-export__message material-export__message--${status}`} role={status === "error" ? "alert" : "status"}>{message}</small>}
    </section>
  );
}
