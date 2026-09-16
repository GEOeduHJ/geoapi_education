import { describe, expect, it } from "vitest";
import {
  normalizePublicObservation,
  normalizePublicSnapshot,
} from "./geo-observations";

describe("public geo observation normalization", () => {
  it("normalizes Postgres numeric strings without exposing raw payload fields", () => {
    expect(normalizePublicSnapshot({
      id: "snapshot-1",
      data_source_id: "source-1",
      fetched_at: "2026-09-17T01:02:03Z",
      valid_from: "2024-01-01",
      valid_to: "2024-04-01",
      request_fingerprint: "kosis-statistics-v1:abc",
      schema_version: "kosis-statistics-v1",
      row_count: "8",
      checksum: "abc123",
      is_public: true,
      raw_payload: { rows: ["should not be selected"] },
    })).toEqual({
      id: "snapshot-1",
      data_source_id: "source-1",
      fetched_at: "2026-09-17T01:02:03Z",
      valid_from: "2024-01-01",
      valid_to: "2024-04-01",
      request_fingerprint: "kosis-statistics-v1:abc",
      schema_version: "kosis-statistics-v1",
      row_count: 8,
      checksum: "abc123",
      is_public: true,
    });
  });

  it("keeps symbolic values and classification metadata when value is not numeric", () => {
    expect(normalizePublicObservation({
      id: "observation-1",
      snapshot_id: "snapshot-1",
      observed_at: "2024-01-01T00:00:00Z",
      region_code: "11",
      label: "서울",
      value: "-",
      unit: "명",
      category: "총인구",
      attributes: { value_text: "-", value_symbol: "-", classifications: [{ level: 1, code: "11" }] },
    })).toEqual({
      id: "observation-1",
      snapshot_id: "snapshot-1",
      observed_at: "2024-01-01T00:00:00Z",
      region_code: "11",
      label: "서울",
      value: null,
      unit: "명",
      category: "총인구",
      attributes: { value_text: "-", value_symbol: "-", classifications: [{ level: 1, code: "11" }] },
    });
  });

  it("rejects rows without database identity fields", () => {
    expect(normalizePublicSnapshot({ data_source_id: "source-1" })).toBeNull();
    expect(normalizePublicObservation({ snapshot_id: "snapshot-1", value: 12 })).toBeNull();
  });
});
