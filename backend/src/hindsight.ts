import "dotenv/config";
import { HindsightClient } from "@vectorize-io/hindsight-client";

export const INCIDENT_BANK_ID = "incident-memory-agent";

const INCIDENT_BANK_NAME = "Incident Memory Agent - Production Incident History";
const INCIDENT_BANK_BACKGROUND =
  "Stores production incident history for an incident-response agent, including symptoms, root causes, resolutions, and outcomes, so engineers can learn from prior incidents.";

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
