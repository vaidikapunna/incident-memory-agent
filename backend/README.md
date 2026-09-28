# Incident Memory Agent Backend

Node.js, Express, and TypeScript API for incident analysis. The backend coordinates Hindsight memory and Groq analysis; it does not execute production remediation.

## Architecture

`server.ts` configures Express, JSON parsing, local-development CORS, and routes. `routes/incidents.ts` validates requests. `agent.ts` performs Hindsight recall, Groq analysis, Hindsight retain, then Hindsight reflect. `hindsight.ts` provides the shared Hindsight client for the `incident-memory-agent` bank; `llm.ts` calls Groq and validates its structured response.

## Endpoints

### `GET /api/health`

Returns service health:

```json
{
  "status": "ok",
  "service": "incident-memory-agent"
}
```

### `POST /api/incidents/analyze`

Accepts a JSON incident:

```json
{
  "incidentId": "INC-002",
  "symptoms": "Production API latency increased to 5.1 seconds. Redis memory usage reached 94%.",
  "recentChange": "Deployment v2.4.2 was released 20 minutes before the incident.",
  "additionalContext": "Latency returned toward normal after traffic was reduced."
}
```

`incidentId`, `symptoms`, and `recentChange` are required non-empty strings. `additionalContext` is optional. Each supplied field is limited to 10,000 characters.

The response includes the incident, structured analysis, recalled `memories` and `memoryCount`, `learnedPattern`, `retained`, and `reflectionAvailable`. The endpoint returns HTTP 200 when retention succeeds and HTTP 207 when analysis is available but retention failed. Recall or analysis failures return an error response with the failed step. Reflection is best-effort; its failure is represented by `reflectionAvailable: false` and `learnedPattern: null`.

## Hindsight

The backend uses the official `@vectorize-io/hindsight-client` and the persistent bank ID `incident-memory-agent`:

1. **RECALL** searches for historical incidents similar to the current symptoms, metrics, and changes.
2. **RETAIN** stores the current incident and its analysis for future investigations. The final resolution is marked pending operator confirmation.
3. **REFLECT** asks Hindsight to synthesize a recurring pattern from the stored incidents.

Recall errors are returned to the API caller rather than treated as if memories were found. Retention failure is reported separately from analysis; reflection failure does not discard the analysis.

`npm run test:hindsight` creates or updates the bank, retains a sample INC-001 incident, then exercises recall and reflect. It writes persistent memory, so each run retains the sample again.

## Groq

The configured provider is Groq using the official `groq-sdk`. The current incident and recalled Hindsight memories are clearly separated in the prompt. The response is requested as structured JSON and validated before returning it to the frontend. The system prompt distinguishes evidence from inference and tells the model not to invent historical incidents.

## Environment

Create `backend/.env` from `.env.example` and configure:

```dotenv
HINDSIGHT_API_KEY=your_hindsight_api_key
HINDSIGHT_BASE_URL=https://api.hindsight.vectorize.io
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
LLM_MODEL=openai/gpt-oss-20b
PORT=3000
```

Keep real keys in `.env`; it is ignored by Git.

## Development and Checks

```powershell
npm install
npm run dev
```

The API listens on port 3000 by default. The CORS policy permits local `localhost` and `127.0.0.1` origins on Vite development ports.

```powershell
npm run typecheck
npm run test:hindsight
```
