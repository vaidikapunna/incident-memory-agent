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
          "Only identify a historical resolution match when a supplied Hindsight memory supports it; otherwise say no supported match was found.",
          "Return only the requested structured JSON.",
        ].join(" "),
      },
      {
        role: "user",
        content: `CURRENT INCIDENT\n${currentIncident}\n\nRECALLED HINDSIGHT MEMORIES (historical evidence; do not treat as facts about the current incident without evidence)\n${hindsightMemories}`,
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
  return validateAnalysis(parsed);
}
