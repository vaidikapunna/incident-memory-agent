# Incident Memory Agent Frontend

React, TypeScript, and Vite single-page interface for submitting production incidents to the Incident Memory Agent backend and reviewing its memory-informed investigation.

## UI Sections

- **Current incident:** editable incident ID, symptoms, recent change, and optional context. The form starts with the INC-002 demo example.
- **How it learns:** concise visual flow from an earlier incident through Hindsight memory to a better-informed investigation.
- **Hindsight memory:** shows the API-reported total and up to five returned memories, with memory type and date when available.
- **AI analysis:** renders the structured summary, likely causes, investigation steps, recommended immediate action, reasoning, confidence, and historical resolution match.
- **Learned pattern:** presents a concise formatted summary of the Hindsight Reflect response.
- **Memory status:** displays the API response states for recalled memories, retention, and reflection.

## Incident Submission and Processing

Submitting the form sends `POST /api/incidents/analyze` to the configured backend URL. While the single request is pending, the interface cycles through RECALL, ANALYZE, RETAIN, and REFLECT as a user-facing progress animation. The frontend cannot observe the backend's individual operation timings; it marks the process complete when the API response arrives. Errors are shown in the results panel and the form can be retried.

## Environment

The optional `frontend/.env` setting is:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

If unset, the app defaults to `http://localhost:3000`. Vite variables are exposed to the browser bundle; do not put API keys or other secrets in frontend environment variables.

## Development and Checks

```powershell
npm install
npm run dev
```

Vite serves the frontend on its normal development port (usually `http://127.0.0.1:5173`). The backend must also be running for incident analysis.

```powershell
npm run typecheck
npm run build
```
