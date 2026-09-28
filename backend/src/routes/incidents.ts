import { Router } from "express";
import { analyzeAndLearn, AgentStepError } from "../agent.ts";

export const incidentsRouter = Router();

incidentsRouter.post("/analyze", async (request, response) => {
  const body: unknown = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    response.status(400).json({ error: "Request body must be a JSON object." });
    return;
  }
  const input = body as Record<string, unknown>;
  const errors: string[] = [];
  for (const field of ["incidentId", "symptoms", "recentChange"] as const) {
    if (typeof input[field] !== "string" || !input[field].trim()) errors.push(`${field} is required and must be a non-empty string.`);
    else if (input[field].length > 10_000) errors.push(`${field} must be at most 10000 characters.`);
  }
  if (input.additionalContext !== undefined && typeof input.additionalContext !== "string") {
    errors.push("additionalContext must be a string when provided.");
  }
  if (typeof input.additionalContext === "string" && input.additionalContext.length > 10_000) {
    errors.push("additionalContext must be at most 10000 characters.");
  }
  if (errors.length) {
    response.status(400).json({ error: "Invalid incident request.", details: errors });
    return;
  }

  try {
    const result = await analyzeAndLearn({
      incidentId: (input.incidentId as string).trim(),
      symptoms: (input.symptoms as string).trim(),
      recentChange: (input.recentChange as string).trim(),
      ...(typeof input.additionalContext === "string" && input.additionalContext.trim()
        ? { additionalContext: input.additionalContext.trim() }
        : {}),
    });
    response.status(result.retained ? 200 : 207).json(result);
  } catch (error) {
    if (error instanceof AgentStepError) {
      response.status(error.statusCode).json({ error: error.message, step: error.step });
      return;
    }
    console.error("Unexpected incident analysis error:", error);
    response.status(500).json({ error: "Unexpected incident analysis error." });
  }
});
