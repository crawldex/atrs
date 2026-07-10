import { readFileSync } from "node:fs";

export const ATR_VERSION = "0.1" as const;
export const ATR_VERDICTS = ["proceed", "proceed_with_guardrails", "handoff_required", "user_needed", "avoid", "unknown"] as const;
export const AGENT_HOSTILITY = ["none", "low", "medium", "high", "wall", "unknown"] as const;
export const DOMAIN_RISK = ["none", "caution", "risk", "unknown"] as const;
export const EVIDENCE_SOURCE_TIERS = [
  "seeded_example",
  "public_web_observation",
  "anonymous_report",
  "merchant_report",
  "attested_sdk",
  "human_attested",
  "synthetic_canary"
] as const;
export const FEEDBACK_ACTIONS = ["followed", "overrode", "partial"] as const;
export const FEEDBACK_OUTCOMES = ["success", "success_with_handoff", "partial", "blocked", "failed", "abandoned"] as const;
export const REDACTION_STATUSES = ["not_captured", "redacted", "hash_only", "private_artifact"] as const;

export type AtrVerdict = typeof ATR_VERDICTS[number];
export type AgentHostility = typeof AGENT_HOSTILITY[number];
export type DomainRisk = typeof DOMAIN_RISK[number];
export type EvidenceSourceTier = typeof EVIDENCE_SOURCE_TIERS[number];
export type FeedbackAction = typeof FEEDBACK_ACTIONS[number];
export type FeedbackOutcome = typeof FEEDBACK_OUTCOMES[number];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const RECORD_ID_RE = /^atr_[0-9a-f]{16}$/;

export function loadRecordSchema(): unknown {
  return readSchema("record-0.1.schema.json");
}

export function loadFeedbackSchema(): unknown {
  return readSchema("feedback-0.1.schema.json");
}

export function validateRecord(payload: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(payload)) {
    return invalid("record must be an object");
  }

  requireExactKeys(payload, "$", [
    "atr_version",
    "site",
    "task",
    "issued_at",
    "record_id",
    "verdict",
    "confidence",
    "accessibility",
    "safety",
    "freshness",
    "task_compatibility",
    "known_blockers",
    "user_present",
    "agent_instruction",
    "evidence",
    "publisher",
    "how_to_improve"
  ], errors);

  expectConst(payload.atr_version, ATR_VERSION, "$.atr_version", errors);
  expectString(payload.site, "$.site", errors, { min: 1, max: 253 });
  expectNullableString(payload.task, "$.task", errors, { min: 1, max: 160 });
  expectDateTime(payload.issued_at, "$.issued_at", errors);
  expectRecordId(payload.record_id, "$.record_id", errors);
  expectEnum(payload.verdict, ATR_VERDICTS, "$.verdict", errors);
  expectRatio(payload.confidence, "$.confidence", errors);
  validateAccessibility(payload.accessibility, errors);
  validateSafety(payload.safety, errors);
  validateFreshness(payload.freshness, errors);
  validateTaskCompatibility(payload.task_compatibility, errors);
  validateKnownBlockers(payload.known_blockers, errors);
  validateUserPresent(payload.user_present, errors);
  expectString(payload.agent_instruction, "$.agent_instruction", errors, { min: 1 });
  validateEvidence(payload.evidence, errors);
  validatePublisher(payload.publisher, errors);
  expectNullableString(payload.how_to_improve, "$.how_to_improve", errors, { min: 1 });

  return { valid: errors.length === 0, errors };
}

export function validateFeedback(payload: unknown): ValidationResult {
  const decisionErrors = validateDecisionEcho(payload);
  if (decisionErrors.length === 0) {
    return { valid: true, errors: [] };
  }
  const outcomeErrors = validateOutcomeStatus(payload);
  if (outcomeErrors.length === 0) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: [
      "feedback must match either decision echo or outcome status",
      ...decisionErrors.map((error) => `decision_echo: ${error}`),
      ...outcomeErrors.map((error) => `outcome_status: ${error}`)
    ]
  };
}

function validateAccessibility(value: unknown, errors: string[]): void {
  if (!expectRecord(value, "$.accessibility", errors)) return;
  requireExactKeys(value, "$.accessibility", ["reachable", "agent_hostility", "success_rate", "handoff_rate", "blocked_rate", "n", "last_verified"], errors);
  expectBooleanOrUnknown(value.reachable, "$.accessibility.reachable", errors);
  expectEnum(value.agent_hostility, AGENT_HOSTILITY, "$.accessibility.agent_hostility", errors);
  expectRatioOrUnknown(value.success_rate, "$.accessibility.success_rate", errors);
  expectRatioOrUnknown(value.handoff_rate, "$.accessibility.handoff_rate", errors);
  expectRatioOrUnknown(value.blocked_rate, "$.accessibility.blocked_rate", errors);
  expectInteger(value.n, "$.accessibility.n", errors);
  expectNullableString(value.last_verified, "$.accessibility.last_verified", errors, { min: 1 });
}

function validateSafety(value: unknown, errors: string[]): void {
  if (!expectRecord(value, "$.safety", errors)) return;
  requireExactKeys(value, "$.safety", ["canonical", "canonical_alternative", "domain_risk", "notes"], errors);
  expectBooleanOrUnknown(value.canonical, "$.safety.canonical", errors);
  expectNullableString(value.canonical_alternative, "$.safety.canonical_alternative", errors, { min: 1 });
  expectEnum(value.domain_risk, DOMAIN_RISK, "$.safety.domain_risk", errors);
  expectStringArray(value.notes, "$.safety.notes", errors);
}

function validateFreshness(value: unknown, errors: string[]): void {
  if (!expectRecord(value, "$.freshness", errors)) return;
  requireExactKeys(value, "$.freshness", ["median_evidence_age_days", "surface_last_changed", "stale"], errors);
  expectNullableInteger(value.median_evidence_age_days, "$.freshness.median_evidence_age_days", errors);
  expectNullableString(value.surface_last_changed, "$.freshness.surface_last_changed", errors, { min: 1 });
  expectBooleanOrUnknown(value.stale, "$.freshness.stale", errors);
}

function validateTaskCompatibility(value: unknown, errors: string[]): void {
  if (!expectRecord(value, "$.task_compatibility", errors)) return;
  requireExactKeys(value, "$.task_compatibility", ["supported", "expected_steps", "recipe_available", "alternatives"], errors);
  expectBooleanOrUnknown(value.supported, "$.task_compatibility.supported", errors);
  if (value.expected_steps !== "unknown") {
    expectInteger(value.expected_steps, "$.task_compatibility.expected_steps", errors);
  }
  expectBoolean(value.recipe_available, "$.task_compatibility.recipe_available", errors);
  expectStringArray(value.alternatives, "$.task_compatibility.alternatives", errors);
}

function validateKnownBlockers(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("$.known_blockers must be an array");
    return;
  }
  value.forEach((blocker, index) => {
    const path = `$.known_blockers[${index}]`;
    if (!expectRecord(blocker, path, errors)) return;
    requireExactKeys(blocker, path, ["kind", "since", "n", "persistent"], errors);
    expectString(blocker.kind, `${path}.kind`, errors, { min: 1 });
    if (blocker.since !== "unknown") {
      expectString(blocker.since, `${path}.since`, errors, { min: 1 });
    }
    if (blocker.n !== "unknown") {
      expectInteger(blocker.n, `${path}.n`, errors);
    }
    expectBooleanOrUnknown(blocker.persistent, `${path}.persistent`, errors);
  });
}

function validateUserPresent(value: unknown, errors: string[]): void {
  if (!expectRecord(value, "$.user_present", errors)) return;
  requireExactKeys(value, "$.user_present", ["required", "reasons", "irreversible_action"], errors);
  expectBooleanOrUnknown(value.required, "$.user_present.required", errors);
  expectStringArray(value.reasons, "$.user_present.reasons", errors);
  expectBooleanOrUnknown(value.irreversible_action, "$.user_present.irreversible_action", errors);
}

function validateEvidence(value: unknown, errors: string[]): void {
  if (!expectRecord(value, "$.evidence", errors)) return;
  requireExactKeys(value, "$.evidence", ["sources", "canonical_url", "dispute_url"], errors);
  if (expectRecord(value.sources, "$.evidence.sources", errors)) {
    const allowed = new Set<string>(EVIDENCE_SOURCE_TIERS);
    for (const [key, count] of Object.entries(value.sources)) {
      if (!allowed.has(key)) {
        errors.push(`$.evidence.sources.${key} is not an allowed source tier`);
      }
      expectInteger(count, `$.evidence.sources.${key}`, errors);
    }
  }
  expectString(value.canonical_url, "$.evidence.canonical_url", errors, { min: 1 });
  expectString(value.dispute_url, "$.evidence.dispute_url", errors, { min: 1 });
}

function validatePublisher(value: unknown, errors: string[]): void {
  if (!expectRecord(value, "$.publisher", errors)) return;
  requireExactKeys(value, "$.publisher", ["claimed", "statement"], errors);
  expectBoolean(value.claimed, "$.publisher.claimed", errors);
  expectNullableString(value.statement, "$.publisher.statement", errors, { min: 1, max: 280 });
}

function validateDecisionEcho(payload: unknown): string[] {
  const errors: string[] = [];
  if (!expectRecord(payload, "$", errors)) return errors;
  requireExactKeys(payload, "$", ["record_id", "action_taken", "task_attempted"], errors);
  expectRecordId(payload.record_id, "$.record_id", errors);
  expectEnum(payload.action_taken, FEEDBACK_ACTIONS, "$.action_taken", errors);
  expectBoolean(payload.task_attempted, "$.task_attempted", errors);
  return errors;
}

function validateOutcomeStatus(payload: unknown): string[] {
  const errors: string[] = [];
  if (!expectRecord(payload, "$", errors)) return errors;
  requireAllowedKeys(payload, "$", ["record_id", "outcome", "task_attempted", "redaction_status"], errors);
  for (const key of ["record_id", "outcome", "task_attempted"]) {
    if (!(key in payload)) errors.push(`$.${key} is required`);
  }
  expectRecordId(payload.record_id, "$.record_id", errors);
  expectEnum(payload.outcome, FEEDBACK_OUTCOMES, "$.outcome", errors);
  expectBoolean(payload.task_attempted, "$.task_attempted", errors);
  if ("redaction_status" in payload) {
    expectEnum(payload.redaction_status, REDACTION_STATUSES, "$.redaction_status", errors);
  }
  return errors;
}

function readSchema(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8"));
}

function invalid(error: string): ValidationResult {
  return { valid: false, errors: [error] };
}

function requireExactKeys(value: Record<string, unknown>, path: string, keys: string[], errors: string[]): void {
  requireAllowedKeys(value, path, keys, errors);
  for (const key of keys) {
    if (!(key in value)) {
      errors.push(`${path}.${key} is required`);
    }
  }
}

function requireAllowedKeys(value: Record<string, unknown>, path: string, keys: string[], errors: string[]): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} is not allowed`);
    }
  }
}

function expectRecord(value: unknown, path: string, errors: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  return true;
}

function expectConst(value: unknown, expected: string, path: string, errors: string[]): void {
  if (value !== expected) {
    errors.push(`${path} must be ${expected}`);
  }
}

function expectEnum<T extends readonly string[]>(value: unknown, allowed: T, path: string, errors: string[]): void {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    errors.push(`${path} must be one of ${allowed.join(", ")}`);
  }
}

function expectString(value: unknown, path: string, errors: string[], options: { min?: number; max?: number } = {}): void {
  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return;
  }
  if (options.min !== undefined && value.length < options.min) {
    errors.push(`${path} must be at least ${options.min} chars`);
  }
  if (options.max !== undefined && value.length > options.max) {
    errors.push(`${path} must be at most ${options.max} chars`);
  }
}

function expectNullableString(value: unknown, path: string, errors: string[], options: { min?: number; max?: number } = {}): void {
  if (value === null) return;
  expectString(value, path, errors, options);
}

function expectDateTime(value: unknown, path: string, errors: string[]): void {
  expectString(value, path, errors, { min: 1 });
  if (typeof value === "string" && (Number.isNaN(Date.parse(value)) || !/(Z|[+-]\d{2}:\d{2})$/.test(value))) {
    errors.push(`${path} must be an ISO 8601 datetime with timezone`);
  }
}

function expectRecordId(value: unknown, path: string, errors: string[]): void {
  expectString(value, path, errors, { min: 20, max: 20 });
  if (typeof value === "string" && !RECORD_ID_RE.test(value)) {
    errors.push(`${path} must match atr_[0-9a-f]{16}`);
  }
}

function expectRatio(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${path} must be a number from 0 to 1`);
  }
}

function expectRatioOrUnknown(value: unknown, path: string, errors: string[]): void {
  if (value === "unknown") return;
  expectRatio(value, path, errors);
}

function expectBoolean(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "boolean") {
    errors.push(`${path} must be a boolean`);
  }
}

function expectBooleanOrUnknown(value: unknown, path: string, errors: string[]): void {
  if (value === "unknown") return;
  expectBoolean(value, path, errors);
}

function expectInteger(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors.push(`${path} must be a non-negative integer`);
  }
}

function expectNullableInteger(value: unknown, path: string, errors: string[]): void {
  if (value === null) return;
  expectInteger(value, path, errors);
}

function expectStringArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  value.forEach((entry, index) => expectString(entry, `${path}[${index}]`, errors));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
