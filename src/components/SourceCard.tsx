import type { ApiDefinition } from "../lib/api/registry";
import { ApiBadge } from "./ApiBadge";

interface SourceCardProps {
  definition: ApiDefinition;
}

export function SourceCard({ definition }: SourceCardProps) {
  const priorityTone = definition.priority === "P0" ? "teal" : definition.priority === "P1" ? "navy" : "amber";

  return (
    <article className="source-card">
      <div className="source-card__topline">
        <div>
          <p className="eyebrow">{definition.provider}</p>
          <h3>{definition.name}</h3>
        </div>
        <ApiBadge tone={priorityTone}>{definition.priority}</ApiBadge>
      </div>
      <p className="source-card__role">{definition.role}</p>
      <div className="badge-row">
        {definition.sessionUse.map((session) => (
          <ApiBadge key={session}>{session}</ApiBadge>
        ))}
        <ApiBadge tone="teal">{definition.storage}</ApiBadge>
      </div>
      <dl className="mini-dl">
        <div>
          <dt>인증</dt>
          <dd>{definition.auth}</dd>
        </div>
        <div>
          <dt>호출 조건</dt>
          <dd>{definition.limit}</dd>
        </div>
      </dl>
      <a className="text-link" href={definition.officialUrl} target="_blank" rel="noreferrer">
        공식 문서 열기 ↗
      </a>
    </article>
  );
}

