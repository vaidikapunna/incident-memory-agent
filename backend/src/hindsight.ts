import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { HindsightClient, HindsightError } from "@vectorize-io/hindsight-client";

export const INCIDENT_BANK_ID = "incident-memory-agent";

const INCIDENT_BANK_NAME = "Incident Memory Agent - Production Incident History";
const INCIDENT_BANK_BACKGROUND =
  "Stores production incident history for an incident-response agent, including symptoms, root causes, resolutions, and outcomes, so engineers can learn from prior incidents.";
const RETAIN_SUBMIT_MAX_ATTEMPTS = 3;
const RETAIN_SUBMIT_TIMEOUT_MS = 20_000;
const RETAIN_OPERATION_TIMEOUT_MS = 120_000;
const RETAIN_POLL_INTERVAL_MS = 1_000;

let client: HindsightClient | undefined;

export function getHindsightClient(): HindsightClient {
  const apiKey = process.env.HINDSIGHT_API_KEY?.trim();
  const baseUrl = process.env.HINDSIGHT_BASE_URL?.trim();

  if (!apiKey) {
    throw new Error("HINDSIGHT_API_KEY is missing. Set it in backend/.env.");
  }
  if (!baseUrl) {
    throw new Error("HINDSIGHT_BASE_URL is missing. Set it in backend/.env.");
  }

  client ??= new HindsightClient({ baseUrl, apiKey });
  return client;
}

/** createBank creates the bank or updates its configuration if it already exists. */
export async function createOrVerifyIncidentBank(): Promise<void> {
  const hindsight = getHindsightClient();
  await hindsight.createBank(INCIDENT_BANK_ID, {
    name: INCIDENT_BANK_NAME,
    background: INCIDENT_BANK_BACKGROUND,
  });
}

function isRetryableRetainError(error: unknown): boolean {
  if (error instanceof HindsightError && error.statusCode !== undefined) {
    return [408, 429, 500, 502, 503, 504].includes(error.statusCode);
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /timeout|stream timeout|fetch failed|network|socket|econnreset|eai_again|aborted/.test(message);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit retain asynchronously so Hindsight can finish extraction without holding
 * its response stream open. Stable document IDs and async operation IDs make retries
 * safe against duplicate incident documents and duplicate operation submission.
 */
export async function retainIncidentMemory(
  incidentId: string,
  content: string,
  options: { context: string; metadata: Record<string, string> },
): Promise<void> {
  const hindsight = getHindsightClient();
  const baseUrl = process.env.HINDSIGHT_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.HINDSIGHT_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("Hindsight configuration is missing.");

  const documentId = `incident-${createHash("sha256").update(`${INCIDENT_BANK_ID}:${incidentId}`).digest("hex")}`;
  const operationId = randomUUID();
  let submission: Awaited<ReturnType<typeof hindsight.retain>> | undefined;
  let lastSubmissionError: unknown;

  for (let attempt = 1; attempt <= RETAIN_SUBMIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      submission = await hindsight.retain(INCIDENT_BANK_ID, content, {
        ...options,
        documentId,
        updateMode: "replace",
        async: true,
        operationId,
        signal: AbortSignal.timeout(RETAIN_SUBMIT_TIMEOUT_MS),
      });
      break;
    } catch (error) {
      lastSubmissionError = error;
      if (attempt === RETAIN_SUBMIT_MAX_ATTEMPTS || !isRetryableRetainError(error)) throw error;
      await wait(500 * 2 ** (attempt - 1));
    }
  }

  if (!submission?.operation_id) {
    if (lastSubmissionError) throw lastSubmissionError;
    throw new Error("Hindsight accepted no retain operation ID.");
  }

  const deadline = Date.now() + RETAIN_OPERATION_TIMEOUT_MS;
  const statusUrl = `${baseUrl}/v1/default/banks/${encodeURIComponent(INCIDENT_BANK_ID)}/operations/${encodeURIComponent(submission.operation_id)}`;

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(RETAIN_SUBMIT_TIMEOUT_MS),
      });
    } catch (error) {
      if (!isRetryableRetainError(error)) throw error;
      await wait(RETAIN_POLL_INTERVAL_MS);
      continue;
    }
    if (!response.ok) {
      if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
        await wait(RETAIN_POLL_INTERVAL_MS);
        continue;
      }
      const detail = await response.text();
      throw new Error(`Hindsight retain status check failed with HTTP ${response.status}: ${detail}`);
    }

    const status = await response.json() as {
      status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "not_found";
      error_message?: string | null;
    };
    if (status.status === "completed") return;
    if (["failed", "cancelled", "not_found"].includes(status.status)) {
      throw new Error(`Hindsight retain operation ${status.status}: ${status.error_message ?? "no further details"}`);
    }
    await wait(RETAIN_POLL_INTERVAL_MS);
  }

  throw new Error(`Hindsight retain operation did not complete within ${RETAIN_OPERATION_TIMEOUT_MS}ms.`);
}
