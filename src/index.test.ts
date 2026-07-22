import { readFileSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_HOSTILITY,
  ATR_VERDICTS,
  DOMAIN_RISK,
  EVIDENCE_SOURCE_TIERS,
  FEEDBACK_ACTIONS,
  FEEDBACK_OUTCOMES,
  REDACTION_STATUSES,
  loadFeedbackSchema,
  loadFeedbackSchemaV01,
  loadRecordSchema,
  validateFeedback,
  validateRecord
} from "./index.js";

const FIXTURE_DIR = new URL("../fixtures/", import.meta.url);

describe("ATRS record validator", () => {
  for (const fixture of fixtureRecords()) {
    it(`accepts fixture ${fixture.name}`, () => {
      const result = validateRecord(fixture.record);

      expect(result).toEqual({ valid: true, errors: [] });
      expect(Buffer.byteLength(JSON.stringify(fixture.record), "utf8")).toBeLessThanOrEqual(8192);
    });
  }

  it("rejects malformed records", () => {
    const base = fixtureRecords()[0]?.record;
    expect(base).toBeTruthy();

    const missingVerdict = structuredClone(base);
    delete (missingVerdict as Record<string, unknown>).verdict;
    expect(validateRecord(missingVerdict).valid).toBe(false);

    const badRecordId = structuredClone(base);
    badRecordId.record_id = "not-an-atr";
    expect(validateRecord(badRecordId).errors).toContain("$.record_id must match atr_[0-9a-f]{16}");

    const extraField = structuredClone(base);
    (extraField as Record<string, unknown>).raw_trace = "not allowed";
    expect(validateRecord(extraField).errors).toContain("$.raw_trace is not allowed");

    const badSource = structuredClone(base);
    badSource.evidence.sources.private_log = 1;
    expect(validateRecord(badSource).errors).toContain("$.evidence.sources.private_log is not an allowed source tier");
  });

  it("keeps schema enums aligned with validator constants", () => {
    const schema = loadRecordSchema() as RecordSchema;

    expect(schema.properties.verdict.enum).toEqual([...ATR_VERDICTS]);
    expect(schema.properties.accessibility.properties.agent_hostility.enum).toEqual([...AGENT_HOSTILITY]);
    expect(schema.properties.safety.properties.domain_risk.enum).toEqual([...DOMAIN_RISK]);
    expect(Object.keys(schema.properties.evidence.properties.sources.properties)).toEqual([...EVIDENCE_SOURCE_TIERS]);
  });
});

describe("ATRS feedback validator", () => {
  it("accepts decision echoes and outcome status without free text", () => {
    expect(validateFeedback({
      record_id: "atr_aaaaaaaaaaaaaaaa",
      action_taken: "followed",
      task_attempted: true
    })).toEqual({ valid: true, errors: [] });

    expect(validateFeedback({
      record_id: "atr_aaaaaaaaaaaaaaaa",
      action_taken: "partial",
      task_attempted: false,
      removed_in_batch: true
    })).toEqual({ valid: true, errors: [] });

    expect(validateFeedback({
      record_id: "atr_aaaaaaaaaaaaaaaa",
      action_taken: "overrode",
      task_attempted: false,
      removed_in_batch: false
    })).toEqual({ valid: true, errors: [] });

    expect(validateFeedback({
      record_id: "atr_bbbbbbbbbbbbbbbb",
      outcome: "success_with_handoff",
      task_attempted: true,
      redaction_status: "redacted"
    })).toEqual({ valid: true, errors: [] });
  });

  it("rejects comments, URLs, PII-shaped fields, and malformed enum values", () => {
    for (const payload of [
      { record_id: "atr_aaaaaaaaaaaaaaaa", action_taken: "followed", task_attempted: true, comment: "private detail" },
      { record_id: "atr_aaaaaaaaaaaaaaaa", action_taken: "followed", task_attempted: true, url: "https://private.example/path" },
      { record_id: "atr_aaaaaaaaaaaaaaaa", action_taken: "followed", task_attempted: false, removed_in_batch: "yes" },
      { record_id: "atr_aaaaaaaaaaaaaaaa", outcome: "success", task_attempted: true, email: "person@example.com" },
      { record_id: "atr_aaaaaaaaaaaaaaaa", action_taken: "ignored", task_attempted: true }
    ]) {
      expect(validateFeedback(payload).valid).toBe(false);
    }
  });

  it("keeps feedback schema locked to structured telemetry fields", () => {
    const schema = loadFeedbackSchema() as FeedbackSchema;
    const keys = collectSchemaPropertyKeys(schema);

    expect(schema.oneOf.every((branch) => branch.additionalProperties === false)).toBe(true);
    expect(keys.sort()).toEqual(["action_taken", "outcome", "record_id", "redaction_status", "removed_in_batch", "task_attempted"].sort());
    expect(schema.oneOf[0]?.required).not.toContain("removed_in_batch");
    expect(schema.oneOf[0]?.properties.removed_in_batch.type).toBe("boolean");
    expect(schema.oneOf[0]?.properties.action_taken.enum).toEqual([...FEEDBACK_ACTIONS]);
    expect(schema.oneOf[1]?.properties.outcome.enum).toEqual([...FEEDBACK_OUTCOMES]);
    expect(schema.oneOf[1]?.properties.redaction_status.enum).toEqual([...REDACTION_STATUSES]);
  });

  it("keeps feedback 0.1 immutable while 0.2 carries the batch signal", () => {
    const schemaV01 = loadFeedbackSchemaV01() as FeedbackSchema;
    const schemaV02 = loadFeedbackSchema() as FeedbackSchema & { $id: string; title: string };

    expect(schemaV01.oneOf[0]?.properties).not.toHaveProperty("removed_in_batch");
    expect(schemaV02.$id).toBe("https://crawldex.com/atrs/feedback-0.2.schema.json");
    expect(schemaV02.title).toBe("Agent Trust Record Feedback 0.2");
    expect(schemaV02.oneOf[0]?.properties.removed_in_batch).toEqual({ type: "boolean" });
  });
});

function fixtureRecords(): Array<{ name: string; record: Record<string, any> }> {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name: basename(name),
      record: JSON.parse(readFileSync(new URL(name, FIXTURE_DIR), "utf8")) as Record<string, any>
    }));
}

function collectSchemaPropertyKeys(schema: FeedbackSchema): string[] {
  const keys = new Set<string>();
  for (const branch of schema.oneOf) {
    for (const key of Object.keys(branch.properties)) {
      keys.add(key);
    }
  }
  return [...keys];
}

interface RecordSchema {
  properties: {
    verdict: { enum: string[] };
    accessibility: { properties: { agent_hostility: { enum: string[] } } };
    safety: { properties: { domain_risk: { enum: string[] } } };
    evidence: { properties: { sources: { properties: Record<string, unknown> } } };
  };
}

interface FeedbackSchema {
  oneOf: Array<{
    additionalProperties: boolean;
    required: string[];
    properties: Record<string, { enum?: string[]; type?: string }>;
  }>;
}
