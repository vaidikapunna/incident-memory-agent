import "dotenv/config";
import { HindsightError } from "@vectorize-io/hindsight-client";
import {
  createOrVerifyIncidentBank,
  getHindsightClient,
  INCIDENT_BANK_ID,
} from "./hindsight.ts";

const incident = `Incident INC-001:
Production API latency increased to 5.2 seconds after deployment v2.4.1.
Redis memory reached 93%.
Investigation found a cache invalidation bug.
Rolling back the deployment restored normal latency.`;

async function main(): Promise<void> {
  console.log("HINDSIGHT CONNECTION");
  const hindsight = getHindsightClient();
  const version = await hindsight.getVersion();
  console.log(`Connected to Hindsight API ${version.api_version} at ${process.env.HINDSIGHT_BASE_URL}`);

  console.log("\nBANK");
  await createOrVerifyIncidentBank();
  console.log(`Created or verified bank: ${INCIDENT_BANK_ID}`);

  console.log("\nRETAIN");
  await hindsight.retain(INCIDENT_BANK_ID, incident, {
    context: "Production incident report and resolution",
    metadata: { incidentId: "INC-001", deployment: "v2.4.1" },
  });
  console.log("Retained incident INC-001 successfully.");

  console.log("\nRECALL");
  const recall = await hindsight.recall(
    INCIDENT_BANK_ID,
    "Have we previously seen an API latency incident involving high Redis memory after a deployment?",
  );
  if (recall.results.length === 0) {
    console.log("No matching memories returned.");
  } else {
    for (const [index, memory] of recall.results.entries()) {
      console.log(`${index + 1}. [${memory.type}] ${memory.text}`);
    }
  }

  console.log("\nREFLECT");
  const reflection = await hindsight.reflect(
    INCIDENT_BANK_ID,
    "What should an incident-response engineer learn from the stored incident?",
  );
  console.log(reflection.text);
}

main().catch((error: unknown) => {
  if (error instanceof HindsightError) {
    console.error(`Hindsight API error${error.statusCode ? ` (HTTP ${error.statusCode})` : ""}: ${error.message}`);
    if (error.statusCode === 401) console.error("Check that HINDSIGHT_API_KEY is valid.");
    if (error.statusCode === 402) console.error("The Hindsight account may need additional credits.");
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Hindsight integration failed: ${message}`);
  }
  process.exitCode = 1;
});
