# Incident Memory Agent

An AI-powered incident-response agent that uses Hindsight persistent memory to recall previous production incidents, analyze a current incident with historical context, retain the new incident, and reflect on recurring patterns.

## What It Does

1. An engineer enters a production incident and its symptoms, recent changes, and optional context.
2. The agent recalls relevant historical incidents from Hindsight.
3. Groq analyzes the current incident together with the recalled memories.
4. The agent returns likely causes, investigation steps, a recommended action, reasoning, confidence, and any supported historical resolution match.
5. The current incident and analysis are retained in Hindsight. The final resolution remains pending operator confirmation.
6. Hindsight Reflect generates a learned pattern from the incident history.

The agent provides investigation guidance; it does not execute production changes or remediate incidents.

## Why Hindsight Matters

Without persistent memory, each incident would be analyzed independently. Hindsight gives the agent access to historical evidence, stores new incident experience, and supports reflection across incidents. It is central to the workflow, not an optional add-on.

```text
Incident 1 -> remembered -> Incident 2 -> historical evidence recalled
           -> better context -> new incident retained -> recurring pattern reflected
```

## Architecture

```text
Frontend (React + TypeScript + Vite)
        |
        v
Backend API (Node.js + Express + TypeScript)
        |
        v
Incident Agent
  |-- Hindsight RECALL
  |-- Groq LLM analysis
  |-- Hindsight RETAIN
  `-- Hindsight REFLECT
        |
        v
Persistent incident memory (Hindsight)
```

## Tech Stack

- React, TypeScript, and Vite
- Node.js and Express
- Hindsight Cloud using `@vectorize-io/hindsight-client`
- Groq using the official `groq-sdk`

## Project Structure

```text
backend/
  src/
    routes/incidents.ts   # Incident analysis endpoint
    agent.ts              # Recall, analysis, retain, and reflect orchestration
    hindsight.ts          # Shared Hindsight client and bank setup
    llm.ts                # Groq analysis and structured output validation
    server.ts             # Express app, health endpoint, and CORS
    test-hindsight.ts     # Hindsight connection and memory-operation check
    types.ts
  package.json
  .env.example
frontend/
  src/
    App.tsx               # Incident form and results UI
    main.tsx
    styles.css
  package.json
  .env.example
```

## Setup

Use Node.js 24 or newer. Install the backend and frontend dependencies separately:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Set these backend variables in `backend/.env`:

```dotenv
HINDSIGHT_API_KEY=your_hindsight_api_key
HINDSIGHT_BASE_URL=https://api.hindsight.vectorize.io
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
LLM_MODEL=openai/gpt-oss-20b
PORT=3000
```

Then install the frontend dependencies:

```powershell
cd ..\frontend
npm install
```

The frontend defaults to `http://localhost:3000`. To override it, optionally create `frontend/.env` with:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

`VITE_API_BASE_URL` is a public service URL, not a place for secrets. The repository ignores `.env` files; never commit API keys.

## Running Locally

Run each service in its own terminal:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

The backend defaults to port 3000 and the Vite frontend uses its normal development port. Both processes must be running for incident analysis.

## Testing

Backend:

```powershell
cd backend
npm run typecheck
npm run test:hindsight
```

`test:hindsight` connects to Hindsight, creates or updates the `incident-memory-agent` bank, then retains a sample INC-001 incident, recalls memories, and reflects on them. It writes persistent memory; rerunning it retains the sample again.

Frontend:

```powershell
cd frontend
npm run typecheck
npm run build
```

The backend health check is `GET http://localhost:3000/api/health`.

## Demo Flow

- INC-001 establishes history: API latency reached about 5.2 seconds after deployment v2.4.1, Redis memory reached about 93%, an investigation identified a cache invalidation bug, and rollback restored normal latency.
- INC-002 has similar latency and Redis symptoms following deployment v2.4.2.
- Hindsight recalls the relevant INC-001 memories.
- Groq analyzes INC-002 with those memories and can identify the historical cache-invalidation and rollback evidence. A matching cause in the new incident remains a hypothesis until confirmed by an operator.
- The agent retains INC-002 and its analysis in Hindsight; its outcome is recorded as pending operator confirmation.
- Hindsight Reflect synthesizes a recurring pattern from stored incident history.

The agent recommends actions; it does not perform a rollback or other production operation.

## Hindsight Memory Flow

**RECALL -> ANALYZE -> RETAIN -> REFLECT**

- **RECALL:** Search the `incident-memory-agent` bank for historical incidents related to current symptoms, metrics, and recent changes.
- **ANALYZE:** Send the current incident and clearly marked Hindsight memories to Groq for structured analysis.
- **RETAIN:** Store the current incident and analysis in the same Hindsight bank for future investigations.
- **REFLECT:** Ask Hindsight to identify a higher-level pattern or lesson from the accumulated incident memories.

## Security

- Store Hindsight and Groq API keys in local `backend/.env` only.
- `.env` files are ignored by Git; do not commit API keys or paste them into source files.
- Frontend environment variables are public in the browser bundle and must not contain secrets.

## Hackathon Demo

Show judges that Hindsight provides persistent memory across incidents: it recalls INC-001 for the similar INC-002 symptoms, informs the analysis with historical evidence, retains the new experience, and reflects on recurring patterns.
