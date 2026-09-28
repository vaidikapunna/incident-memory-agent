import { useEffect, useRef, useState, type FormEvent } from "react";

type IncidentMemory = { content: string; when: string | null; type: string };
type Analysis = {
  summary: string;
  likelyCauses: string[];
  investigationSteps: string[];
  recommendedAction: string;
  reasoning: string;
  confidence: number;
  historicalResolutionMatch: string;
};
type AnalyzeResponse = {
  incident: { id: string; symptoms: string; recentChange: string; additionalContext?: string };
  analysis: Analysis;
  memories: IncidentMemory[];
  memoryCount: number;
  learnedPattern: string | null;
  retained: boolean;
  reflectionAvailable: boolean;
  memoryPersistenceError?: string;
};
type IncidentForm = {
  incidentId: string;
  symptoms: string;
  recentChange: string;
  additionalContext: string;
};
type ProgressStage = "idle" | "recall" | "analyze" | "retain" | "reflect" | "complete";

const processSteps = ["recall", "analyze", "retain", "reflect"] as const;
const processLabels: Record<(typeof processSteps)[number], string> = {
  recall: "RECALL",
  analyze: "ANALYZE",
  retain: "RETAIN",
  reflect: "REFLECT",
};
const progressMessages: Record<ProgressStage, string> = {
  idle: "Ready to investigate",
  recall: "Recalling historical incidents...",
  analyze: "Analyzing incident against historical evidence...",
  retain: "Saving this incident to persistent memory...",
  reflect: "Refining the learned pattern...",
  complete: "Analysis complete",
};

const initialIncident: IncidentForm = {
  incidentId: "INC-002",
  symptoms: "Production API latency increased to 5.1 seconds. Redis memory usage reached 94%.",
  recentChange: "Deployment v2.4.2 was released 20 minutes before the incident.",
  additionalContext: "Latency returned toward normal after traffic was reduced.",
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

function StageIcon({ complete }: { complete: boolean }) {
  return <span className={`stage-icon ${complete ? "complete" : "pending"}`} aria-hidden="true">{complete ? "✓" : "—"}</span>;
}

function memoryIncident(content: string): string {
  return content.match(/INC-\d{3,}/i)?.[0]?.toUpperCase() ?? "HISTORY";
}

function cleanMemoryContent(content: string): string {
  return content
    .replace(/\s*\|\s*(?:When|Resolution for):.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function formatReflection(reflection: string): { summary: string; points: string[] } {
  const paragraphs: string[] = [];
  const points: string[] = [];
  for (const rawLine of reflection.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^\|/.test(line) || /^\|?\s*:?-{3,}/.test(line) || /^#{1,6}\s/.test(line)) continue;
    const listItem = line.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    const clean = (listItem?.[1] ?? line)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean || /^[-|\s:]+$/.test(clean)) continue;
    if (listItem) points.push(clean);
    else paragraphs.push(clean);
  }

  const sentences = paragraphs.join(" ").match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const summary = shorten(sentences.slice(0, 2).join(" ").trim(), 360);
  return { summary: summary || "Hindsight did not return a readable reflection summary.", points: points.slice(0, 2).map((point) => shorten(point, 190)) };
}

function App() {
  const [form, setForm] = useState(initialIncident);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<ProgressStage>("idle");
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recalledCount = result?.memoryCount ?? 0;
  const visibleMemories = result?.memories.slice(0, 5) ?? [];
  const reflection = result?.learnedPattern ? formatReflection(result.learnedPattern) : null;

  function clearProgressTimers() {
    for (const timer of progressTimers.current) clearTimeout(timer);
    progressTimers.current = [];
  }

  useEffect(() => () => {
    for (const timer of progressTimers.current) clearTimeout(timer);
  }, []);

  function updateField(field: keyof IncidentForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    clearProgressTimers();
    setProgressStage("recall");
    progressTimers.current = [
      setTimeout(() => setProgressStage("analyze"), 1_500),
      setTimeout(() => setProgressStage("retain"), 3_500),
      setTimeout(() => setProgressStage("reflect"), 5_000),
    ];
    try {
      const response = await fetch(`${apiBaseUrl}/api/incidents/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: form.incidentId,
          symptoms: form.symptoms,
          recentChange: form.recentChange,
          additionalContext: form.additionalContext,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Analysis request failed (${response.status}).`;
        throw new Error(message);
      }
      clearProgressTimers();
      setProgressStage("complete");
      setResult(payload as AnalyzeResponse);
    } catch (requestError) {
      clearProgressTimers();
      setProgressStage("idle");
      setError(requestError instanceof Error ? requestError.message : "Could not reach the incident analysis service.");
    } finally {
      clearProgressTimers();
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Incident Memory Agent home">
          <span className="brand-mark"><span /></span>
          <span>INCIDENT<span className="brand-light"> MEMORY</span></span>
        </a>
        <div className="topbar-right">
          <span className="environment-label"><i /> PRODUCTION RESPONSE</span>
          <span className="memory-active"><i /> HINDSIGHT MEMORY ACTIVE</span>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> INCIDENT OPERATIONS / MEMORY-ENABLED</div>
          <h1>Incident Memory Agent</h1>
          <p>AI incident response that learns from production history.</p>
        </div>
        <div className="hero-note"><span className="note-label">SYSTEM</span><span>Persistent memory · Hindsight</span></div>
      </section>

      <section className="learning-strip" aria-label="How it learns">
        <div className="learning-title"><span className="spark">✳</span><div><span className="eyebrow">THE LEARNING LOOP</span><strong>How it learns</strong></div></div>
        <div className="learning-step"><span className="step-number">01</span><span>Incident 1</span></div>
        <span className="flow-arrow">→</span>
        <div className="learning-step memory-step"><span className="step-number">02</span><span>Remembered by Hindsight</span></div>
        <span className="flow-arrow">→</span>
        <div className="learning-step"><span className="step-number">03</span><span>Incident 2</span></div>
        <span className="flow-arrow">→</span>
        <div className="learning-step memory-step"><span className="step-number">04</span><span>Historical memory recalled</span></div>
        <span className="flow-arrow">→</span>
        <div className="learning-step outcome-step"><span className="step-number">05</span><span>Better recommendation</span></div>
      </section>

      <div className="section-heading">
        <div><span className="eyebrow">LIVE INCIDENT WORKSPACE</span><h2>Investigate with context</h2></div>
        <div className={`request-path ${loading ? "processing" : ""}`} aria-live="polite">
          <div className="process-sequence">
            {processSteps.map((step, index) => {
              const activeIndex = processSteps.indexOf(progressStage as (typeof processSteps)[number]);
              const complete = progressStage === "complete" || (activeIndex >= 0 && index < activeIndex);
              const active = loading && progressStage === step;
              return <span className={`process-step ${complete ? "is-complete" : ""} ${active ? "is-active" : ""}`} key={step}>
                <i className="process-light" aria-hidden="true">{complete ? "✓" : ""}</i>{processLabels[step]}
                {index < processSteps.length - 1 && <b aria-hidden="true">→</b>}
              </span>;
            })}
          </div>
          <span className="process-status">{progressMessages[progressStage]}</span>
        </div>
      </div>

      <section className="workspace-grid">
        <section className="panel incident-panel">
          <div className="panel-heading"><div className="panel-icon incident-icon">01</div><div><span className="eyebrow">CURRENT INCIDENT</span><h3>Incident details</h3></div><span className="required-chip">REQUIRED</span></div>
          <form onSubmit={analyze}>
            <label className="field-label" htmlFor="incidentId">Incident ID</label>
            <input id="incidentId" className="mono-input" value={form.incidentId} onChange={(event) => updateField("incidentId", event.target.value)} required />

            <label className="field-label" htmlFor="symptoms">Symptoms <span>What is degraded?</span></label>
            <textarea id="symptoms" rows={3} value={form.symptoms} onChange={(event) => updateField("symptoms", event.target.value)} required />

            <label className="field-label" htmlFor="recentChange">Recent change <span>Deployment, config, traffic</span></label>
            <textarea id="recentChange" rows={2} value={form.recentChange} onChange={(event) => updateField("recentChange", event.target.value)} required />

            <label className="field-label" htmlFor="additionalContext">Additional context <span>Optional</span></label>
            <textarea id="additionalContext" rows={2} value={form.additionalContext} onChange={(event) => updateField("additionalContext", event.target.value)} />

            <button className="analyze-button" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> Agent is investigating...</> : <>Analyze incident <span>↗</span></>}
            </button>
            <div className="form-footnote"><span className="lock-icon">◈</span> Analysis and learning are powered by your Hindsight memory bank.</div>
          </form>
        </section>

        <section className="panel results-panel" aria-live="polite">
          <div className="panel-heading results-heading"><div className="panel-icon result-icon">02</div><div><span className="eyebrow">INVESTIGATION OUTPUT</span><h3>{loading ? "Agent is investigating..." : result ? `Analysis · ${result.incident.id}` : "Awaiting incident analysis"}</h3></div>{result && <span className="complete-chip"><i /> COMPLETE</span>}</div>

          {loading && <div className="loading-state"><span className={`investigation-orb phase-${progressStage}`} aria-hidden="true"><i /></span><div><strong>Agent is investigating...</strong><p>{progressMessages[progressStage]}</p></div></div>}
          {error && <div className="error-banner" role="alert"><span className="error-symbol">!</span><div><strong>Analysis could not be completed</strong><p>{error}</p><span>Check the backend service and try again.</span></div></div>}

          {!result && !loading && !error && <div className="empty-state"><div className="empty-glyph">⌁</div><strong>Ready when you are</strong><p>Submit an incident to recall related production history and generate a memory-informed investigation.</p><div className="empty-flow"><span>INCIDENT</span><b>→</b><span>HINDSIGHT</span><b>→</b><span>ANALYSIS</span></div></div>}

          {result && <div className="result-content">
            <section className="memory-card">
              <div className="subsection-heading"><div><span className="memory-kicker"><i /> HINDSIGHT MEMORY</span><h4>{recalledCount} historical memories recalled</h4><span className="memory-showing">{recalledCount > 5 ? `Showing ${visibleMemories.length} most relevant of ${recalledCount} recalled` : `Showing all ${visibleMemories.length} recalled`}</span></div><span className="memory-count">{String(recalledCount).padStart(2, "0")}</span></div>
              {visibleMemories.length > 0 ? <div className="memory-list">{visibleMemories.map((memory, index) => (
                <article className="memory-item" key={`${memory.content}-${index}`}><span className="memory-incident">{memoryIncident(memory.content)}</span><div><p>{shorten(cleanMemoryContent(memory.content), 190)}</p><span>{memory.type.toUpperCase()}{memory.when ? ` · ${memory.when.slice(0, 10)}` : ""}</span></div><span className="memory-link">↗</span></article>
              ))}</div> : <div className="no-memories">No relevant historical memories were returned for this incident.</div>}
            </section>

            <section className="analysis-card">
              <div className="subsection-heading"><div><span className="eyebrow">AI ANALYSIS</span><h4>Incident assessment</h4></div><span className="confidence">{Math.round(result.analysis.confidence * 100)}% <small>CONFIDENCE</small></span></div>
              <div className="analysis-summary"><span className="detail-label">INCIDENT SUMMARY</span><p>{result.analysis.summary}</p></div>
              <div className="analysis-columns">
                <div className="analysis-block"><span className="detail-label">LIKELY CAUSES</span><ul>{result.analysis.likelyCauses.map((cause, index) => <li key={index}>{cause}</li>)}</ul></div>
                <div className="analysis-block"><span className="detail-label">INVESTIGATION STEPS</span><ol>{result.analysis.investigationSteps.map((step, index) => <li key={index}>{step}</li>)}</ol></div>
              </div>
              <div className="action-callout"><span className="action-icon">↗</span><div><span className="detail-label">RECOMMENDED IMMEDIATE ACTION</span><p>{result.analysis.recommendedAction}</p></div></div>
              <div className="analysis-detail"><span className="detail-label">REASONING</span><p>{result.analysis.reasoning}</p></div>
              <div className="match-row"><span className="detail-label">HISTORICAL RESOLUTION MATCH</span><p>{result.analysis.historicalResolutionMatch}</p></div>
            </section>

            <section className={`pattern-card ${result.reflectionAvailable && result.learnedPattern ? "pattern-ready" : "pattern-unavailable"}`}>
              <div className="pattern-top"><span className="pattern-symbol">✳</span><div><span className="eyebrow">HINDSIGHT REFLECT</span><h4>Learned pattern</h4></div><span className="reflect-tag">{result.reflectionAvailable ? "REFLECTION COMPLETE" : "REFLECTION UNAVAILABLE"}</span></div>
              {reflection && <p>{reflection.summary}</p>}
              {reflection && reflection.points.length > 0 && <ul className="pattern-points">{reflection.points.map((point, index) => <li key={index}>{point}</li>)}</ul>}
              {!reflection && <p>Hindsight reflection was unavailable for this analysis.</p>}
              <span className="pattern-foot">A lesson synthesized from incident history stored in Hindsight.</span>
            </section>

            {result.memoryPersistenceError && <div className="warning-banner" role="status">Analysis completed, but the incident could not be retained: {result.memoryPersistenceError}</div>}
          </div>}
        </section>
      </section>

      {result && <section className="memory-status panel">
        <div className="status-heading"><span className="eyebrow">MEMORY STATUS</span><span>LIVE RESULT</span></div>
        <div className="status-items">
          <div className="status-item"><StageIcon complete={recalledCount > 0} /><div><strong>Historical memories recalled</strong><span>{recalledCount > 0 ? `${recalledCount} memories returned from Hindsight` : "No matching memories returned"}</span></div></div>
          <div className="status-item"><StageIcon complete={result.retained} /><div><strong>Incident retained</strong><span>{result.retained ? "Current incident and analysis saved to memory" : "Incident was not saved to memory"}</span></div></div>
          <div className="status-item"><StageIcon complete={result.reflectionAvailable} /><div><strong>Reflection completed</strong><span>{result.reflectionAvailable ? "Pattern generated from incident history" : "Reflection unavailable for this request"}</span></div></div>
        </div>
      </section>}

      <footer className="footer"><span>INCIDENT MEMORY AGENT <b>·</b> LEARNING FROM EVERY RESPONSE</span><span>API <code>{apiBaseUrl}</code></span></footer>
    </main>
  );
}

export default App;
