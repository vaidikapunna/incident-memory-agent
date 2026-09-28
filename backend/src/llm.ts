import "dotenv/config";
import Groq from "groq-sdk";
import type { IncidentAnalysis, IncidentInput, IncidentMemory } from "./types.ts";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    likelyCauses: { type: "array", items: { type: "string" } },
    investigationSteps: { type: "array", items: { type: "string" } },
    recommendedAction: { type: "string" },
    reasoning: { type: "string" },
    confidence: { type: "number" },
    historicalResolutionMatch: { type: "string" },
  },
  required: [
    "summary",
    "likelyCauses",
    "investigationSteps",
    "recommendedAction",
    "reasoning",
    "confidence",
    "historicalResolutionMatch",
  ],
} as const;

interface HistoricalResolutionEvidence {
  text: string;
  sourceIncidentId?: string;
}

const outcomePattern = /\b(?:restored|resolved|reduced|returned|recovered|stabilized|stabilised|eliminated|cleared|fixed|repaired|mitigated|normalized|normalised)\b/i;
const speculativePattern = /\b(?:consider(?:ed|ing)?|plan(?:ned|ning)?|propos(?:ed|ing)|attempt(?:ed|ing)|tr(?:ied|ying)|might|could|should|would|recommend(?:ed|ing)?|suggest(?:ed|ing)?)\b/i;
const incidentIdPattern = /\b([A-Z][A-Z0-9]*-\d+)\b/i;
const ignoredRelevanceTerms = new Set([
  "after", "again", "also", "been", "being", "from", "into", "more", "most", "normal",
  "over", "same", "some", "than", "that", "their", "there", "these", "they", "this",
  "those", "through", "with", "without",
]);

function incidentTerms(value: string): Set<string> {
  return new Set(
    value.toLowerCase().match(/[a-z0-9]+/g)?.filter((term) => term.length > 2 && !ignoredRelevanceTerms.has(term)) ?? [],
  );
}

// Keep this match tied to an explicit recalled action and successful outcome; never infer one from an action alone.
function findHistoricalResolutionEvidence(
  incident: IncidentInput,
  memories: IncidentMemory[],
): HistoricalResolutionEvidence[] {
  const currentTerms = incidentTerms(`${incident.symptoms} ${incident.recentChange} ${incident.additionalContext ?? ""}`);
  const evidence: HistoricalResolutionEvidence[] = [];

  for (const memory of memories) {
    const sourceIncidentId = memory.content.match(incidentIdPattern)?.[1]?.toUpperCase();
    const clauses = memory.content
      .split(/[\r\n]+|(?<=[.!?])\s+/)
      .map((clause) => clause.split(/\s*\|\s*/)[0]?.trim() ?? "")
      .filter(Boolean);

    for (const clause of clauses) {
      const outcome = outcomePattern.exec(clause);
      if (!outcome || speculativePattern.test(clause)) continue;
      if (/\b(?:not|never|failed to|unable to)\s+(?:\w+\s+){0,2}$/i.test(clause.slice(0, outcome.index))) continue;

      const action = [...clause.slice(0, outcome.index).matchAll(/\b[a-z][a-z'-]*ing\b/gi)].at(-1);
      if (!action || action.index === undefined) continue;

      const matchedText = clause.slice(action.index).trim().replace(/[.!?]+$/, "");
      const resolutionTerms = incidentTerms(matchedText);
      if (![...currentTerms].some((term) => resolutionTerms.has(term))) continue;

      evidence.push({ text: matchedText, ...(sourceIncidentId ? { sourceIncidentId } : {}) });
      break;
    }
  }

  return evidence;
}

function validateAnalysis(value: unknown): IncidentAnalysis {
  if (!value || typeof value !== "object") throw new Error("LLM response was not a JSON object.");
  const candidate = value as Record<string, unknown>;
  const stringFields = ["summary", "recommendedAction", "reasoning", "historicalResolutionMatch"];
  for (const field of stringFields) {
    if (typeof candidate[field] !== "string") throw new Error(`LLM response is missing string field: ${field}`);
  }
  for (const field of ["likelyCauses", "investigationSteps"]) {
    if (!Array.isArray(candidate[field]) || !candidate[field].every((item) => typeof item === "string")) {
      throw new Error(`LLM response field ${field} must be an array of strings.`);
    }
  }
  if (typeof candidate.confidence !== "number" || candidate.confidence < 0 || candidate.confidence > 1) {
    throw new Error("LLM response confidence must be a number between 0 and 1.");
  }
  return candidate as unknown as IncidentAnalysis;
}

export async function analyzeIncident(
  incident: IncidentInput,
  memories: IncidentMemory[],
): Promise<IncidentAnalysis> {
  const provider = (process.env.LLM_PROVIDER ?? "groq").trim().toLowerCase();
  if (provider !== "groq") {
    throw new Error(`Unsupported LLM_PROVIDER "${provider}". This backend currently supports "groq".`);
  }
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is missing. Set it in backend/.env.");

  const client = new Groq({ apiKey });
  const model = process.env.LLM_MODEL?.trim() || "openai/gpt-oss-20b";
  const currentIncident = [
    `Incident ID: ${incident.incidentId}`,
    `Symptoms: ${incident.symptoms}`,
    `Recent change: ${incident.recentChange}`,
    `Additional context: ${incident.additionalContext || "None provided"}`,
  ].join("\n");
  const hindsightMemories = memories.length
    ? memories.map((memory, index) => `HINDSIGHT MEMORY ${index + 1} [${memory.type}]: ${memory.content}`).join("\n\n")
    : "No relevant Hindsight memories were returned.";
  const historicalResolutionEvidence = findHistoricalResolutionEvidence(incident, memories);
  const explicitResolutionEvidence = historicalResolutionEvidence.length
    ? historicalResolutionEvidence
        .map((item) => `- ${item.text}${item.sourceIncidentId ? ` (source incident: ${item.sourceIncidentId})` : ""}`)
        .join("\n")
    : "No explicit, relevant successful resolution was detected in the recalled memories.";

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You are a careful production incident-response analyst.",
          "Analyze the current incident using its evidence and the supplied Hindsight memories.",
          "Clearly distinguish observed evidence from inference in reasoning, and state uncertainty.",
          "Never invent historical incidents, facts, causes, or resolutions.",
          "Use the HISTORICAL RESOLUTION EVIDENCE section when explaining relevant prior resolutions. Do not claim a resolution that is absent from that evidence.",
          "Return only the requested structured JSON.",
        ].join(" "),
      },
      {
        role: "user",
        content: `CURRENT INCIDENT\n${currentIncident}\n\nRECALLED HINDSIGHT MEMORIES (historical evidence; do not treat as facts about the current incident without evidence)\n${hindsightMemories}\n\nHISTORICAL RESOLUTION EVIDENCE\n${explicitResolutionEvidence}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "incident_analysis", strict: true, schema: analysisSchema },
    },
  });

  const content = response.choices[0]?.message.content;
  if (!content) throw new Error("LLM returned an empty analysis.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`LLM returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const analysis = validateAnalysis(parsed);
  // This field is derived from validated retrieved evidence, not from a probabilistic model claim.
  const historicalResolutionMatch = historicalResolutionEvidence.length
    ? historicalResolutionEvidence
        .map((item) => `${item.text}${item.sourceIncidentId ? ` (source incident: ${item.sourceIncidentId})` : ""}`)
        .join("; ")
    : "No supported match found";

  return { ...analysis, historicalResolutionMatch };
}
