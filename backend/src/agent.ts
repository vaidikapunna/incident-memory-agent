import { HindsightError } from "@vectorize-io/hindsight-client";
import { getHindsightClient, INCIDENT_BANK_ID } from "./hindsight.ts";
import { analyzeIncident } from "./llm.ts";
import type { IncidentInput, IncidentMemory } from "./types.ts";

export class AgentStepError extends Error {
  public readonly statusCode: number;
  public readonly step: string;

  constructor(
    message: string,
    statusCode: number,
    step: string,
  ) {
    super(message);
    this.name = "AgentStepError";
    this.statusCode = statusCode;
    this.step = step;
  }
}

export interface AnalyzeIncidentResult {
  incident: {
    id: string;
    symptoms: string;
    recentChange: string;
    additionalContext?: string;
  };
  analysis: Awaited<ReturnType<typeof analyzeIncident>>;
  memories: IncidentMemory[];
  memoryCount: number;
  learnedPattern: string | null;
  retained: boolean;
  reflectionAvailable: boolean;
  memoryPersistenceError?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function analyzeAndLearn(incident: IncidentInput): Promise<AnalyzeIncidentResult> {
  const hindsight = getHindsightClient();
  const recallQuery = [
    `Production incident ${incident.incidentId}.`,
    `Symptoms: ${incident.symptoms}.`,
    `Recent deployment or change: ${incident.recentChange}.`,
    `Additional context: ${incident.additionalContext || "none"}.`,
    "Find historical incidents with similar symptoms, metrics, recent changes, root causes, and successful resolutions.",
  ].join(" ");

  let recall;
  try {
    recall = await hindsight.recall(INCIDENT_BANK_ID, recallQuery, { budget: "mid" });
  } catch (error) {
    const status = error instanceof HindsightError ? error.statusCode : undefined;
    throw new AgentStepError(
      `Hindsight recall failed: ${errorMessage(error)}`,
      status && status >= 400 && status < 500 ? 502 : 503,
      "recall",
    );
  }

  const memories: IncidentMemory[] = recall.results.map((result) => ({
    content: result.text,
    when: result.occurred_start ?? result.mentioned_at ?? null,
    type: result.type ?? "unknown",
  }));

  let analysis;
  try {
    analysis = await analyzeIncident(incident, memories);
  } catch (error) {
    throw new AgentStepError(`Incident analysis failed: ${errorMessage(error)}`, 502, "analysis");
  }

  let retained = false;
  let memoryPersistenceError: string | undefined;
  const retainedContent = [
    `Incident ${incident.incidentId}`,
    `Symptoms: ${incident.symptoms}`,
    `Recent change: ${incident.recentChange}`,
    `Additional context: ${incident.additionalContext || "None provided"}`,
    `Agent analysis: ${JSON.stringify(analysis)}`,
    "Resolution and final outcome: pending operator confirmation.",
  ].join("\n");
  try {
    await hindsight.retain(INCIDENT_BANK_ID, retainedContent, {
      context: "Incident response analysis; outcome pending operator confirmation",
      metadata: { incidentId: incident.incidentId, source: "incident-memory-agent" },
    });
    retained = true;
  } catch (error) {
    memoryPersistenceError = `Hindsight retain failed: ${errorMessage(error)}`;
  }

  let learnedPattern: string | null = null;
  let reflectionAvailable = false;
  try {
    const reflection = await hindsight.reflect(
      INCIDENT_BANK_ID,
      `Across the stored production incidents, what recurring pattern or lesson is relevant to incident ${incident.incidentId}? Distinguish repeated evidence from a tentative pattern.`,
      { budget: "mid" },
    );
    learnedPattern = reflection.text;
    reflectionAvailable = true;
  } catch {
    // Reflection is supplementary: preserve the completed analysis in the response.
  }

  return {
    incident: {
      id: incident.incidentId,
      symptoms: incident.symptoms,
      recentChange: incident.recentChange,
      ...(incident.additionalContext ? { additionalContext: incident.additionalContext } : {}),
    },
    analysis,
    memories,
    memoryCount: memories.length,
    learnedPattern,
    retained,
    reflectionAvailable,
    ...(memoryPersistenceError ? { memoryPersistenceError } : {}),
  };
}
