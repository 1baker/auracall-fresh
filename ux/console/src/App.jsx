import {
  AlertTriangle,
  Archive,
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const EMPTY_FORM = {
  id: "",
  description: "",
  service: "",
  tenantKey: "",
  bindingKey: "",
  bindingId: "",
  runtimeProfile: "",
  modelSelector: "",
  model: "",
  projectBindingKey: "",
  instructions: "",
  modelStrategy: "",
  thinkingTime: "",
  composerTool: "",
  deepResearchPlanAction: "",
};

const NAV_ITEMS = [
  "Overview",
  "Agents",
  "Providers",
  "Projects",
  "Runs",
  "Handoffs",
  "Search",
  "API Access",
  "Diagnostics",
];

function App() {
  const [activeView, setActiveView] = useState(readViewFromUrl());
  const [choices, setChoices] = useState(null);
  const [agentsPayload, setAgentsPayload] = useState(null);
  const [statusPayload, setStatusPayload] = useState(null);
  const [runtimeRunsPayload, setRuntimeRunsPayload] = useState(null);
  const [completionRunsPayload, setCompletionRunsPayload] = useState(null);
  const [recoveryCandidatesPayload, setRecoveryCandidatesPayload] = useState(null);
  const [selectedRunKey, setSelectedRunKey] = useState(readParamFromUrl("run"));
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [selectedRunDetailLoading, setSelectedRunDetailLoading] = useState(false);
  const [runControlBusy, setRunControlBusy] = useState("");
  const [runControlResult, setRunControlResult] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(readAgentFromUrl());
  const [selectedProviderKey, setSelectedProviderKey] = useState(readParamFromUrl("provider"));
  const [selectedProjectKey, setSelectedProjectKey] = useState(readParamFromUrl("project"));
  const [query, setQuery] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [runQuery, setRunQuery] = useState("");
  const [runKindFilter, setRunKindFilter] = useState("all");
  const [runStateFilter, setRunStateFilter] = useState("all");
  const [handoffId, setHandoffId] = useState(readParamFromUrl("handoff"));
  const [handoffOutputDir, setHandoffOutputDir] = useState("");
  const [handoffTargetAdapter, setHandoffTargetAdapter] = useState("packet");
  const [handoffPayload, setHandoffPayload] = useState(null);
  const [handoffBusy, setHandoffBusy] = useState("");
  const [providerReadinessFilter, setProviderReadinessFilter] = useState("all");
  const [projectReadinessFilter, setProjectReadinessFilter] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingNew, setEditingNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [
        choicesResponse,
        agentsResponse,
        statusResponse,
        runtimeRunsResponse,
        completionRunsResponse,
        recoveryCandidatesResponse,
      ] = await Promise.all([
        fetchJson("/v1/config/agent-choices"),
        fetchJson("/v1/config/agents"),
        fetchJson("/status?recovery=true&sourceKind=all"),
        fetchJson("/v1/runtime-runs/recent?limit=50"),
        fetchJson("/v1/account-mirrors/completions?limit=50"),
        fetchJson("/v1/account-mirrors/recovery-candidates?limit=20"),
      ]);
      setChoices(choicesResponse);
      setAgentsPayload(agentsResponse);
      setStatusPayload(statusResponse);
      setRuntimeRunsPayload(runtimeRunsResponse);
      setCompletionRunsPayload(completionRunsResponse);
      setRecoveryCandidatesPayload(recoveryCandidatesResponse);
      const availableAgents = choicesResponse.agents ?? agentsResponse.agents ?? [];
      if (activeView === "agents" && !selectedAgentId && availableAgents.length > 0 && !editingNew) {
        selectAgent(availableAgents[0].id);
      }
      const nextProviderRows = buildProviderRows(choicesResponse, availableAgents, new Map());
      if (!selectedProviderKey && nextProviderRows.length > 0) {
        setSelectedProviderKey(nextProviderRows[0].key);
      }
      const nextProjectRows = buildProjectRows(choicesResponse, availableAgents, new Map());
      if (!selectedProjectKey && nextProjectRows.length > 0) {
        setSelectedProjectKey(nextProjectRows[0].key);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const agents = useMemo(() => choices?.agents ?? agentsPayload?.agents ?? [], [choices, agentsPayload]);
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const validationByAgent = useMemo(() => {
    const entries = choices?.validation?.agents ?? [];
    return new Map(entries.map((entry) => [entry.agentId, entry]));
  }, [choices]);
  const filteredAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return agents;
    return agents.filter((agent) =>
      [
        agent.id,
        agent.description,
        agent.service,
        agent.tenantKey,
        agent.bindingKey,
        agent.projectBinding?.label,
        agent.projectBinding?.providerProjectId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [agents, query]);

  const metrics = useMemo(() => {
    const ready = agents.filter((agent) => validationByAgent.get(agent.id)?.valid).length;
    const disabled = agents.filter((agent) => agent.enabled === false || agent.disabled === true).length;
    return {
      total: agents.length,
      ready,
      needsSetup: Math.max(agents.length - ready - disabled, 0),
      disabled,
    };
  }, [agents, validationByAgent]);
  const providerRows = useMemo(
    () => buildProviderRows(choices, agents, validationByAgent),
    [choices, agents, validationByAgent],
  );
  const projectRows = useMemo(
    () => buildProjectRows(choices, agents, validationByAgent),
    [choices, agents, validationByAgent],
  );
  const filteredProviderRows = useMemo(
    () => filterInventoryRows(providerRows, providerQuery, providerReadinessFilter),
    [providerRows, providerQuery, providerReadinessFilter],
  );
  const filteredProjectRows = useMemo(
    () => filterInventoryRows(projectRows, projectQuery, projectReadinessFilter),
    [projectRows, projectQuery, projectReadinessFilter],
  );
  const selectedProvider = useMemo(
    () => providerRows.find((provider) => provider.key === selectedProviderKey) ?? providerRows[0] ?? null,
    [providerRows, selectedProviderKey],
  );
  const selectedProject = useMemo(
    () => projectRows.find((project) => project.key === selectedProjectKey) ?? projectRows[0] ?? null,
    [projectRows, selectedProjectKey],
  );
  const providerMetrics = useMemo(() => inventoryMetrics(providerRows), [providerRows]);
  const projectMetrics = useMemo(() => inventoryMetrics(projectRows), [projectRows]);
  const overview = useMemo(
    () => buildOverviewData({
      status: statusPayload,
      agentMetrics: metrics,
      providerMetrics,
      projectMetrics,
      providerRows,
      projectRows,
      agents,
      validationByAgent,
    }),
    [statusPayload, metrics, providerMetrics, projectMetrics, providerRows, projectRows, agents, validationByAgent],
  );
  const runsData = useMemo(
    () => buildRunsData({
      status: statusPayload,
      runtimeRuns: runtimeRunsPayload?.data ?? [],
      completionRuns: completionRunsPayload?.data ?? [],
      recoveryCandidates: recoveryCandidatesPayload,
      agents,
    }),
    [statusPayload, runtimeRunsPayload, completionRunsPayload, recoveryCandidatesPayload, agents],
  );
  const filteredRunRows = useMemo(
    () => filterRunRows(runsData.rows, runQuery, runKindFilter, runStateFilter),
    [runsData.rows, runQuery, runKindFilter, runStateFilter],
  );
  const selectedRun = useMemo(
    () =>
      runsData.rows.find((row) => row.key === selectedRunKey) ??
      filteredRunRows[0] ??
      runsData.rows[0] ??
      null,
    [runsData.rows, filteredRunRows, selectedRunKey],
  );

  useEffect(() => {
    if (!selectedRun) {
      setSelectedRunDetail(null);
      return;
    }
    let cancelled = false;
    setSelectedRunDetailLoading(true);
    setSelectedRunDetail(null);
    loadRunDetail(selectedRun)
      .then((detail) => {
        if (!cancelled) setSelectedRunDetail(detail);
      })
      .catch((detailError) => {
        if (!cancelled) {
          setSelectedRunDetail({
            errors: [detailError instanceof Error ? detailError.message : String(detailError)],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setSelectedRunDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRun]);

  useEffect(() => {
    if (editingNew) return;
    setForm(agentToForm(selectedAgent));
  }, [selectedAgent, editingNew]);

  const selectAgent = (agentId) => {
    setEditingNew(false);
    setSelectedAgentId(agentId);
    setActiveView("agents");
    updateUrl({ view: "agents", agent: agentId || null, provider: null, project: null });
    setNotice("");
    setAdvancedOpen(false);
  };

  const startCreate = () => {
    setEditingNew(true);
    setSelectedAgentId("");
    setForm(EMPTY_FORM);
    setActiveView("agents");
    updateUrl({ view: "agents", agent: null, provider: null, project: null });
    setNotice("");
    setAdvancedOpen(false);
  };

  const saveAgent = async () => {
    const id = form.id.trim();
    if (!id) {
      setError("Agent id is required before save.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await putJson(`/v1/config/agents/${encodeURIComponent(id)}`, formToAgentConfig(form, choices));
      setNotice(`Agent ${id} saved.`);
      setEditingNew(false);
      setSelectedAgentId(id);
      setActiveView("agents");
      updateUrl({ view: "agents", agent: id, provider: null, project: null });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSaving(false);
    }
  };

  const duplicateAgent = () => {
    const source = selectedAgent ?? form;
    const nextId = `${source.id || "agent"}-copy`;
    setEditingNew(true);
    setSelectedAgentId("");
    setForm({
      ...agentToForm(source),
      id: nextId,
      description: source.description ? `${source.description} copy` : "",
    });
    setActiveView("agents");
    updateUrl({ view: "agents", agent: null, provider: null, project: null });
    setNotice(`Drafted duplicate ${nextId}. Save when ready.`);
  };

  const archiveAgent = async () => {
    const id = form.id.trim() || selectedAgent?.id;
    if (!id) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/v1/config/agents/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setNotice(`Agent ${id} archived.`);
      setSelectedAgentId("");
      setEditingNew(false);
      setForm(EMPTY_FORM);
      updateUrl({ view: "agents", agent: null, provider: null, project: null });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSaving(false);
    }
  };

  const validateNow = async () => {
    await refresh();
    setNotice("Validation refreshed.");
  };

  const performRunControl = async (action) => {
    if (!action?.available) return;
    const confirmed = window.confirm(action.confirmation);
    if (!confirmed) return;
    setRunControlBusy(action.action);
    setRunControlResult(null);
    setError("");
    setNotice("");
    try {
      const payload = await postJson(action.route, action.payload);
      setStatusPayload(payload);
      setRunControlResult({
        ok: true,
        action: action.label,
        message: describeControlResult(payload.controlResult),
        readback: summarizeControlReadback(payload, action),
      });
      await refresh();
    } catch (requestError) {
      setRunControlResult({
        ok: false,
        action: action.label,
        message: requestError instanceof Error ? requestError.message : String(requestError),
        readback: "",
      });
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      await refresh().catch(() => undefined);
    } finally {
      setRunControlBusy("");
    }
  };

  const selectedValidation = form.id ? validationByAgent.get(form.id) : null;
  const fieldErrors = validateForm(form, choices);
  const selectedIssues = selectedValidation?.issues ?? [];
  const switchView = (view) => {
    setActiveView(view);
    const next = { view };
    if (view !== "agents") next.agent = null;
    if (view !== "providers") next.provider = null;
    if (view !== "projects") next.project = null;
    if (view !== "runs") next.run = null;
    if (view !== "handoffs") next.handoff = null;
    updateUrl(next);
  };
  const selectProvider = (providerKey) => {
    setSelectedProviderKey(providerKey);
    setActiveView("providers");
    updateUrl({ view: "providers", provider: providerKey, agent: null, project: null });
  };
  const selectProject = (projectKey) => {
    setSelectedProjectKey(projectKey);
    setActiveView("projects");
    updateUrl({ view: "projects", project: projectKey, agent: null, provider: null });
  };
  const openAgentFromInventory = (agentId) => {
    if (!agentId) return;
    selectAgent(agentId);
  };
  const selectRun = (runKey) => {
    setSelectedRunKey(runKey);
    setActiveView("runs");
    updateUrl({ view: "runs", run: runKey, agent: null, provider: null, project: null });
  };
  const performHandoffAction = async (action) => {
    const id = handoffId.trim();
    if (!id) {
      setError("Enter a handoff id first.");
      return;
    }
    setHandoffBusy(action);
    setError("");
    setNotice("");
    try {
      const query = handoffOutputDir.trim()
        ? `?outputDir=${encodeURIComponent(handoffOutputDir.trim())}`
        : "";
      const endpoint = `/v1/handoffs/${encodeURIComponent(id)}/${action}`;
      const body = handoffOutputDir.trim() ? { outputDir: handoffOutputDir.trim() } : {};
      if (action === "recover-live") body.targetAdapter = handoffTargetAdapter;
      const payload =
        action === "status"
          ? await fetchJson(`${endpoint}${query}`)
          : await postJson(endpoint, body);
      setHandoffPayload(payload);
      setNotice(`Handoff ${action} completed.`);
      setActiveView("handoffs");
      updateUrl({ view: "handoffs", handoff: id, agent: null, provider: null, project: null, run: null });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setHandoffBusy("");
    }
  };

  return (
    <div className="console-shell">
      <header className="topbar">
        <a className="brand" href="/console" aria-label="AuraCall Console home">
          <span className="brand-mark">A</span>
          <span>AuraCall</span>
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          <a className="nav-item" href="/desktops">Desktops</a>
          {NAV_ITEMS.map((item) => (
            <a
              className={navItemToView(item) === activeView ? "nav-item active" : "nav-item"}
              href={navItemToView(item) ? `/console?view=${navItemToView(item)}` : "#diagnostics"}
              key={item}
              onClick={(event) => {
                const view = navItemToView(item);
                if (!view) return;
                event.preventDefault();
                switchView(view);
              }}
            >
              {item}
            </a>
          ))}
        </nav>
        <a className="operator-chip" href="/ops/browser">
          <ShieldCheck size={16} aria-hidden="true" />
          Legacy diagnostics
        </a>
      </header>

      <main className="page">
        {error ? <Notice tone="error" title="Action needed" message={error} /> : null}
        {notice ? <Notice tone="success" title="Saved" message={notice} /> : null}
        {activeView === "overview" ? (
          <OverviewPage
            loading={loading}
            overview={overview}
            status={statusPayload}
            onRefresh={validateNow}
            onSwitchView={switchView}
          />
        ) : activeView === "providers" ? (
          <InventoryPage
            kind="providers"
            title="Providers"
            scope="Review provider accounts, browser bindings, readiness, and linked agents."
            loading={loading}
            metrics={providerMetrics}
            query={providerQuery}
            onQueryChange={setProviderQuery}
            readinessFilter={providerReadinessFilter}
            onReadinessFilterChange={setProviderReadinessFilter}
            rows={filteredProviderRows}
            selectedRow={selectedProvider}
            onSelect={selectProvider}
            onRefresh={validateNow}
            onOpenAgent={openAgentFromInventory}
          />
        ) : activeView === "projects" ? (
          <InventoryPage
            kind="projects"
            title="Projects"
            scope="Review project defaults, unresolved bindings, and the agents that depend on them."
            loading={loading}
            metrics={projectMetrics}
            query={projectQuery}
            onQueryChange={setProjectQuery}
            readinessFilter={projectReadinessFilter}
            onReadinessFilterChange={setProjectReadinessFilter}
            rows={filteredProjectRows}
            selectedRow={selectedProject}
            onSelect={selectProject}
            onRefresh={validateNow}
            onOpenAgent={openAgentFromInventory}
          />
        ) : activeView === "runs" ? (
          <RunsPage
            loading={loading}
            detailLoading={selectedRunDetailLoading}
            runsData={runsData}
            rows={filteredRunRows}
            selectedRun={selectedRun}
            selectedDetail={selectedRunDetail}
            controlResult={runControlResult}
            controlBusy={runControlBusy}
            query={runQuery}
            onQueryChange={setRunQuery}
            kindFilter={runKindFilter}
            onKindFilterChange={setRunKindFilter}
            stateFilter={runStateFilter}
            onStateFilterChange={setRunStateFilter}
            onSelect={selectRun}
            onRefresh={validateNow}
            onControl={performRunControl}
            onSwitchView={switchView}
          />
        ) : activeView === "handoffs" ? (
          <HandoffsPage
            handoffId={handoffId}
            outputDir={handoffOutputDir}
            targetAdapter={handoffTargetAdapter}
            payload={handoffPayload}
            busy={handoffBusy}
            onHandoffIdChange={setHandoffId}
            onOutputDirChange={setHandoffOutputDir}
            onTargetAdapterChange={setHandoffTargetAdapter}
            onAction={performHandoffAction}
          />
        ) : (
          <AgentsPage
            loading={loading}
            saving={saving}
            metrics={metrics}
            query={query}
            setQuery={setQuery}
            filteredAgents={filteredAgents}
            selectedAgentId={selectedAgentId}
            validationByAgent={validationByAgent}
            choices={choices}
            form={form}
            fieldErrors={fieldErrors}
            selectedIssues={selectedIssues}
            selectedAgent={selectedAgent}
            editingNew={editingNew}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            onValidate={validateNow}
            onCreate={startCreate}
            onSelectAgent={selectAgent}
            onChange={setForm}
            onSave={saveAgent}
            onDuplicate={duplicateAgent}
            onArchive={archiveAgent}
          />
        )}
      </main>
    </div>
  );
}

function HandoffsPage({
  handoffId,
  outputDir,
  targetAdapter,
  payload,
  busy,
  onHandoffIdChange,
  onOutputDirChange,
  onTargetAdapterChange,
  onAction,
}) {
  const summary = summarizeHandoffPayload(payload);
  return (
    <>
      <section className="page-header">
        <div>
          <h1>Handoffs</h1>
          <p>Inspect cross-service handoff packets and operate resume, repair, and manual export artifacts.</p>
          <span className="freshness">Local packet state</span>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={() => onAction("status")} disabled={Boolean(busy)}>
            {busy === "status" ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <RefreshCcw size={16} aria-hidden="true" />}
            Status
          </button>
          <button className="ghost-button" type="button" onClick={() => onAction("resume")} disabled={Boolean(busy)}>
            {busy === "resume" ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            Resume
          </button>
          <button className="ghost-button" type="button" onClick={() => onAction("repair")} disabled={Boolean(busy)}>
            {busy === "repair" ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <RefreshCcw size={16} aria-hidden="true" />}
            Repair
          </button>
          <button className="primary-button" type="button" onClick={() => onAction("export")} disabled={Boolean(busy)}>
            {busy === "export" ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
            Export
          </button>
          <button className="primary-button" type="button" onClick={() => onAction("recover-live")} disabled={Boolean(busy)}>
            {busy === "recover-live" ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            Recover Live
          </button>
        </div>
      </section>

      <section className="workspace two-column">
        <aside className="agent-list" aria-label="Handoff query">
          <div className="command-bar stacked">
            <label className="field-label">
              Handoff id
              <input
                value={handoffId}
                onChange={(event) => onHandoffIdChange(event.target.value)}
                placeholder="handoff_..."
              />
            </label>
            <label className="field-label">
              Output directory
              <input
                value={outputDir}
                onChange={(event) => onOutputDirChange(event.target.value)}
                placeholder="optional packet root"
              />
            </label>
            <label className="field compact-field">
              <span>Target adapter</span>
              <select value={targetAdapter} onChange={(event) => onTargetAdapterChange(event.target.value)}>
                <option value="packet">Packet</option>
                <option value="chatgpt-browser">ChatGPT browser</option>
              </select>
            </label>
          </div>
          <div className="list-scroll">
            <EmptyState
              title="Packet-owned operator flow"
              detail="Use status first, then resume, repair, or export from the current handoff packet state."
            />
          </div>
        </aside>

        <section className="editor-panel" aria-label="Handoff operator result">
          <div className="inspector-inner">
            <div className="inspector-card">
              <div className="inspector-title">
                <Archive size={18} aria-hidden="true" />
                <div>
                  <h2>{summary.title}</h2>
                  <p>{summary.subtitle}</p>
                </div>
              </div>
            </div>
            <div className="status-strip compact" aria-label="Handoff result summary">
              <Metric label="Stage" value={summary.stage} />
              <Metric label="Next" value={summary.nextAction} tone={summary.nextAction === "complete" ? "ready" : "warning"} />
              <Metric label="Files" value={summary.fileCount} />
              <Metric label="Readback" value={summary.readback} tone={summary.readback === "readback_cached" ? "ready" : "muted"} />
            </div>
            <div className="inspector-card">
              <h3>Artifacts</h3>
              <dl className="details-list">
                <Detail label="Resume plan" value={summary.resumePlanRef} />
                <Detail label="Repair report" value={summary.repairReportRef} />
                <Detail label="Manual export" value={summary.exportRef} />
                <Detail label="Provider message" value={summary.providerMessageId} />
              </dl>
            </div>
            <div className="inspector-card">
              <h3>Raw response</h3>
              <pre>{payload ? JSON.stringify(payload, null, 2) : "No handoff response loaded."}</pre>
            </div>
          </div>
        </section>
      </section>
    </>
  );
}

function AgentsPage({
  loading,
  saving,
  metrics,
  query,
  setQuery,
  filteredAgents,
  selectedAgentId,
  validationByAgent,
  choices,
  form,
  fieldErrors,
  selectedIssues,
  selectedAgent,
  editingNew,
  advancedOpen,
  setAdvancedOpen,
  onValidate,
  onCreate,
  onSelectAgent,
  onChange,
  onSave,
  onDuplicate,
  onArchive,
}) {
  return (
    <>
      <section className="page-header">
        <div>
          <h1>Agents</h1>
          <p>Configure named agents for downstream apps without editing JSON.</p>
          <span className="freshness">
            {loading ? "Loading choices" : `Choices refreshed ${new Date().toLocaleTimeString()}`}
          </span>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={onValidate} disabled={loading || saving}>
            <RefreshCcw size={16} aria-hidden="true" />
            Validate
          </button>
          <button className="primary-button" type="button" onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            Create agent
          </button>
        </div>
      </section>

      <section className="status-strip" aria-label="Agent status summary">
        <Metric label="Total" value={metrics.total} />
        <Metric label="Ready" value={metrics.ready} tone="ready" />
        <Metric label="Needs setup" value={metrics.needsSetup} tone="warning" />
        <Metric label="Disabled" value={metrics.disabled} tone="muted" />
      </section>

      <section className="workspace">
        <aside className="agent-list" aria-label="Agent list">
          <div className="command-bar">
            <label className="search-field">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search agents</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search agents"
              />
            </label>
          </div>
          <div className="list-scroll">
            {loading ? <ListPlaceholder /> : null}
            {!loading && filteredAgents.length === 0 ? (
              <EmptyState title="No agents found" detail="Create an agent or clear the current search." />
            ) : null}
            {filteredAgents.map((agent) => {
              const validation = validationByAgent.get(agent.id);
              return (
                <button
                  className={agent.id === selectedAgentId ? "agent-row selected" : "agent-row"}
                  type="button"
                  onClick={() => onSelectAgent(agent.id)}
                  key={agent.id}
                >
                  <span className="row-main">
                    <span className="row-title">{agent.id}</span>
                    <span className="row-subtitle">{agent.tenantKey || agent.runtimeProfileId || "No provider account"}</span>
                  </span>
                  <StatusChip ready={validation?.valid} disabled={agent.enabled === false || agent.disabled === true} />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="editor-panel" aria-label="Agent editor">
          {loading ? (
            <div className="loading-state">
              <Loader2 className="spin" size={18} aria-hidden="true" />
              Loading agent choices
            </div>
          ) : (
            <AgentForm
              choices={choices}
              form={form}
              fieldErrors={fieldErrors}
              selectedIssues={selectedIssues}
              selectedAgent={selectedAgent}
              editingNew={editingNew}
              saving={saving}
              onChange={onChange}
              onSave={onSave}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
            />
          )}
        </section>

        <aside className="inspector" aria-label="Selected agent inspector">
          <Inspector
            agent={selectedAgent}
            form={form}
            choices={choices}
            validation={form.id ? validationByAgent.get(form.id) : null}
            fieldErrors={fieldErrors}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
          />
        </aside>
      </section>
    </>
  );
}

function OverviewPage({ loading, overview, status, onRefresh, onSwitchView }) {
  return (
    <>
      <section className="page-header">
        <div>
          <h1>Overview</h1>
          <p>Review service health, setup readiness, and the next operator action.</p>
          <span className="freshness">
            {loading ? "Loading health" : `Health refreshed ${new Date().toLocaleTimeString()}`}
          </span>
        </div>
        <div className="header-actions">
          <button className="primary-button" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            Refresh health
          </button>
        </div>
      </section>

      <section className="status-strip overview-strip" aria-label="Overview health summary">
        <Metric label="Service" value={overview.service.label} tone={overview.service.tone} />
        <Metric label="Agents ready" value={`${overview.agents.ready}/${overview.agents.total}`} tone={overview.agents.tone} />
        <Metric label="Provider accounts" value={overview.providers.readyLabel} tone={overview.providers.tone} />
        <Metric label="Attention" value={overview.attention.length} tone={overview.attention.length > 0 ? "danger" : "ready"} />
      </section>

      <section className="overview-grid">
        <section className="overview-main" aria-label="Health command center">
          <div className="overview-panel">
            <div className="panel-title">
              <h2>Next Actions</h2>
              <ReadinessChip state={overview.attention.length > 0 ? "attention" : "ready"} />
            </div>
            {loading ? (
              <div className="loading-state">
                <Loader2 className="spin" size={18} aria-hidden="true" />
                Loading health
              </div>
            ) : overview.attention.length === 0 ? (
              <EmptyState title="No immediate action" detail="Configured agents, providers, and background work have no current setup blockers." />
            ) : (
              <div className="attention-list">
                {overview.attention.map((item) => (
                  <button
                    className={`attention-row ${item.tone}`}
                    type="button"
                    key={item.key}
                    onClick={() => {
                      if (item.href) window.location.href = item.href;
                      else onSwitchView(item.view);
                    }}
                  >
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className="attention-action">{item.action}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overview-panel health-panel">
            <div className="panel-title">
              <h2>Health Snapshot</h2>
              <span className="muted-line">{overview.service.detail}</span>
            </div>
            <div className="health-grid">
              {overview.healthCards.map((card) => (
                <button className="health-card" type="button" key={card.key} onClick={() => onSwitchView(card.view)}>
                  <span className={`health-dot ${card.tone}`} />
                  <span>
                    <strong>{card.title}</strong>
                    <small>{card.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="inspector overview-inspector" aria-label="Overview inspector">
          <div className="inspector-inner">
            <div className="inspector-card">
              <div className="inspector-title">
                <ShieldCheck size={18} aria-hidden="true" />
                <div>
                  <h2>Service Readback</h2>
                  <p>{overview.service.url}</p>
                </div>
              </div>
              <StatusPill valid={overview.service.tone === "ready"} />
            </div>
            <div className="inspector-card">
              <h3>Background Work</h3>
              <dl className="compact-details">
                <Detail label="Live follow" value={overview.liveFollow.label} />
                <Detail label="Scheduler" value={overview.scheduler.label} />
                <Detail label="Drain" value={overview.background.label} />
                <Detail label="Runner" value={overview.runner.label} />
              </dl>
            </div>
            <div className="inspector-card">
              <h3>Linked Workflows</h3>
              <button type="button" onClick={() => onSwitchView("agents")}>Open Agents</button>
              <button type="button" onClick={() => onSwitchView("providers")}>Open Providers</button>
              <button type="button" onClick={() => onSwitchView("projects")}>Open Projects</button>
              <a href="/ops/browser">
                <ExternalLink size={15} aria-hidden="true" />
                Open Diagnostics
              </a>
            </div>
            <div className="inspector-card">
              <button
                className="advanced-toggle"
                type="button"
                onClick={(event) => {
                  const panel = event.currentTarget.nextElementSibling;
                  const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
                  event.currentTarget.setAttribute("aria-expanded", String(!expanded));
                  if (panel) panel.hidden = expanded;
                }}
                aria-expanded="false"
              >
                <ChevronDown size={15} aria-hidden="true" />
                Show technical details
              </button>
              <dl className="details-list" hidden>
                <Detail label="Local URL" value={status?.routes?.localServiceBaseUrl} />
                <Detail label="External URL" value={status?.routes?.externalServiceBaseUrl} />
                <Detail label="Status route" value={status?.routes?.status} />
                <Detail label="Console route" value={status?.routes?.operatorConsole} />
                <Detail label="API PID" value={status?.api?.process?.pid} />
              </dl>
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}

function InventoryPage({
  kind,
  title,
  scope,
  loading,
  metrics,
  query,
  onQueryChange,
  readinessFilter,
  onReadinessFilterChange,
  rows,
  selectedRow,
  onSelect,
  onRefresh,
  onOpenAgent,
}) {
  return (
    <>
      <section className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{scope}</p>
          <span className="freshness">
            {loading ? "Loading readiness" : `Readiness refreshed ${new Date().toLocaleTimeString()}`}
          </span>
        </div>
        <div className="header-actions">
          <button className="primary-button" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            Refresh health
          </button>
        </div>
      </section>

      <section className="status-strip" aria-label={`${title} status summary`}>
        <Metric label={kind === "providers" ? "Provider accounts" : "Project bindings"} value={metrics.total} />
        <Metric label="Ready" value={metrics.ready} tone="ready" />
        <Metric label="Needs setup" value={metrics.needsSetup} tone="warning" />
        <Metric label="Attention" value={metrics.attention} tone="danger" />
      </section>

      <section className="inventory-workspace">
        <section className="inventory-table-panel" aria-label={`${title} inventory`}>
          <div className="command-bar inventory-command-bar">
            <label className="search-field">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search {title.toLowerCase()}</span>
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={`Search ${title.toLowerCase()}`}
              />
            </label>
            <label className="field compact-field">
              <span>Readiness</span>
              <select value={readinessFilter} onChange={(event) => onReadinessFilterChange(event.target.value)}>
                <option value="all">All</option>
                <option value="ready">Ready</option>
                <option value="needs-setup">Needs setup</option>
                <option value="attention">Attention needed</option>
              </select>
            </label>
          </div>
          {loading ? (
            <div className="loading-state">
              <Loader2 className="spin" size={18} aria-hidden="true" />
              Loading readiness
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title={`No ${title.toLowerCase()} found`} detail="Refresh health or clear the current filters." />
          ) : (
            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>{kind === "providers" ? "Provider account" : "Project"}</th>
                    <th>Service</th>
                    <th>{kind === "providers" ? "Browser binding" : "Provider account"}</th>
                    <th>Linked agents</th>
                    <th>Readiness</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      className={selectedRow?.key === row.key ? "selected" : ""}
                      key={row.key}
                      onClick={() => onSelect(row.key)}
                    >
                      <td>
                        <button className="table-select" type="button" onClick={() => onSelect(row.key)}>
                          <span>{row.name}</span>
                          <small>{row.subtitle}</small>
                        </button>
                      </td>
                      <td>{serviceDisplay(row.service)}</td>
                      <td>{row.bindingLabel}</td>
                      <td>{row.linkedAgents.length}</td>
                      <td><ReadinessChip state={row.readiness} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="inspector inventory-inspector" aria-label={`Selected ${title.toLowerCase()} inspector`}>
          <InventoryInspector row={selectedRow} kind={kind} onOpenAgent={onOpenAgent} />
        </aside>
      </section>
    </>
  );
}

function RunsPage({
  loading,
  detailLoading,
  runsData,
  rows,
  selectedRun,
  selectedDetail,
  controlResult,
  controlBusy,
  query,
  onQueryChange,
  kindFilter,
  onKindFilterChange,
  stateFilter,
  onStateFilterChange,
  onSelect,
  onRefresh,
  onControl,
  onSwitchView,
}) {
  return (
    <>
      <section className="page-header">
        <div>
          <h1>Runs</h1>
          <p>Inspect active work, queues, recovery posture, and live-follow operations.</p>
          <span className="freshness">
            {loading ? "Loading runs" : `Runs refreshed ${new Date().toLocaleTimeString()}`}
          </span>
        </div>
        <div className="header-actions">
          <button className="primary-button" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            Refresh runs
          </button>
        </div>
      </section>

      <section className="status-strip runs-strip" aria-label="Runs status summary">
        <Metric label="Active work" value={runsData.metrics.active} tone={runsData.metrics.active > 0 ? "warning" : "ready"} />
        <Metric label="Waiting" value={runsData.metrics.waiting} tone={runsData.metrics.waiting > 0 ? "warning" : "muted"} />
        <Metric label="Needs attention" value={runsData.metrics.attention} tone={runsData.metrics.attention > 0 ? "danger" : "ready"} />
        <Metric label="Completed" value={runsData.metrics.completed} tone="ready" />
      </section>

      <section className="recovery-panel" aria-label="Artifact recovery posture">
        <div className="panel-title recovery-title">
          <div>
            <h2>Artifact Recovery</h2>
            <span className="muted-line">{runsData.recoveryCandidates.summary}</span>
          </div>
          <RunStateChip
            state={runsData.recoveryCandidates.remoteMissing > 0 ? "attention" : "completed"}
            label={runsData.recoveryCandidates.remoteMissing > 0 ? "Missing local assets" : "No missing assets"}
          />
        </div>
        <div className="recovery-grid">
          <Metric
            label="Remote missing"
            value={runsData.recoveryCandidates.remoteMissing}
            tone={runsData.recoveryCandidates.remoteMissing > 0 ? "danger" : "ready"}
          />
          <Metric
            label="Need detail"
            value={runsData.recoveryCandidates.unknownDeferred}
            tone={runsData.recoveryCandidates.unknownDeferred > 0 ? "warning" : "ready"}
          />
          <Metric label="Candidates" value={runsData.recoveryCandidates.total} tone="neutral" />
          <Metric label="Queueable" value={runsData.recoveryCandidates.queueable} tone={runsData.recoveryCandidates.queueable > 0 ? "warning" : "ready"} />
        </div>
        {runsData.recoveryCandidates.rows.length > 0 ? (
          <div className="recovery-candidate-list">
            {runsData.recoveryCandidates.rows.slice(0, 4).map((candidate) => (
              <div className="recovery-candidate-row" key={candidate.id}>
                <div>
                  <strong>{candidate.providerLabel}</strong>
                  <small>{candidate.tenantLabel}</small>
                </div>
                <span>{candidate.actionLabel}</span>
                <span>{candidate.missingLabel}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="runs-workspace">
        <section className="runs-table-panel" aria-label="Runs workbench">
          <div className="command-bar runs-command-bar">
            <label className="search-field">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search runs</span>
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search runs" />
            </label>
            <label className="field compact-field">
              <span>Kind</span>
              <select value={kindFilter} onChange={(event) => onKindFilterChange(event.target.value)}>
                <option value="all">All</option>
                <option value="response">Response runs</option>
                <option value="team">Team runs</option>
                <option value="runtime">Runtime</option>
                <option value="live-follow">Live follow</option>
              </select>
            </label>
            <label className="field compact-field">
              <span>State</span>
              <select value={stateFilter} onChange={(event) => onStateFilterChange(event.target.value)}>
                <option value="all">All</option>
                <option value="active">Active work</option>
                <option value="waiting">Waiting</option>
                <option value="attention">Needs attention</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>
          {loading ? (
            <div className="loading-state">
              <Loader2 className="spin" size={18} aria-hidden="true" />
              Loading runs
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No runs found" detail="Refresh runs or clear the current filters." />
          ) : (
            <div className="runs-table-scroll">
              <table className="inventory-table runs-table">
                <thead>
                  <tr>
                    <th>Work</th>
                    <th>Kind</th>
                    <th>State</th>
                    <th>Provider / agent</th>
                    <th>Updated</th>
                    <th>Attention</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className={selectedRun?.key === row.key ? "selected" : ""} key={row.key} onClick={() => onSelect(row.key)}>
                      <td>
                        <button className="table-select" type="button" onClick={() => onSelect(row.key)}>
                          <span>{row.title}</span>
                          <small>{row.subtitle}</small>
                        </button>
                      </td>
                      <td>{row.kindLabel}</td>
                      <td><RunStateChip state={row.stateGroup} label={row.statusLabel} /></td>
                      <td>{row.ownerLabel}</td>
                      <td>{formatTime(row.updatedAt)}</td>
                      <td>{row.attention || "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="inspector runs-inspector" aria-label="Selected run inspector">
          <RunsInspector
            runsData={runsData}
            run={selectedRun}
            detail={selectedDetail}
            controlResult={controlResult}
            controlBusy={controlBusy}
            loading={detailLoading}
            onControl={onControl}
            onSwitchView={onSwitchView}
          />
        </aside>
      </section>
    </>
  );
}

function RunsInspector({ runsData, run, detail, controlResult, controlBusy, loading, onControl, onSwitchView }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  if (!run) {
    return (
      <div className="inspector-inner">
        <div className="inspector-card">
          <div className="inspector-title">
            <Sparkles size={18} aria-hidden="true" />
            <div>
              <h2>No run selected</h2>
              <p>Select work to inspect timeline, recovery, and related records.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const runtimeInspection = detail?.runtimeInspection?.inspection ?? null;
  const teamInspection = detail?.teamInspection?.inspection ?? null;
  const runStatus = detail?.runStatus ?? null;
  const conversation = runtimeInspection?.conversation ?? null;
  const firstTurn = conversation?.turns?.find((turn) => turn.role === "assistant") ?? conversation?.turns?.[0] ?? null;
  const providerRefs = conversation?.providerConversationRefs ?? run.providerConversationRefs ?? [];
  const detailErrors = detail?.errors ?? [];
  const rowActions = run.controlActions ?? [];
  const backgroundActions = runsData.queue.backgroundActions ?? [];
  return (
    <div className="inspector-inner">
      <div className="inspector-card">
        <div className="inspector-title">
          <Bot size={18} aria-hidden="true" />
          <div>
            <h2>{run.title}</h2>
            <p>{run.subtitle}</p>
          </div>
        </div>
        <RunStateChip state={run.stateGroup} label={run.statusLabel} />
      </div>

      <div className="inspector-card">
        <h3>Timeline</h3>
        <dl className="compact-details">
          <Detail label="Created" value={formatTime(run.createdAt)} />
          <Detail label="Updated" value={formatTime(run.updatedAt)} />
          <Detail label="Kind" value={run.kindLabel} />
          <Detail label="Source" value={run.sourceLabel} />
          <Detail label="Current step" value={run.currentStepLabel} />
          <Detail label="Recovery" value={runsData.recovery.summary} />
        </dl>
      </div>

      <div className="inspector-card">
        <h3>Controls</h3>
        {rowActions.length === 0 ? (
          <p className="muted-line">No state-gated controls are available for this row.</p>
        ) : (
          <ControlActionList actions={rowActions} busyAction={controlBusy} onControl={onControl} />
        )}
        {controlResult ? (
          <div className={controlResult.ok ? "control-result success" : "control-result error"}>
            <strong>{controlResult.action}</strong>
            <p>{controlResult.message}</p>
            {controlResult.readback ? <small>{controlResult.readback}</small> : null}
          </div>
        ) : null}
      </div>

      <div className="inspector-card">
        <h3>Output Summary</h3>
        {loading ? (
          <p className="muted-line">Loading selected run detail.</p>
        ) : firstTurn?.content ? (
          <p className="summary-line">{truncateText(firstTurn.content, 420)}</p>
        ) : runStatus?.summary ? (
          <p className="summary-line">{truncateText(String(runStatus.summary), 420)}</p>
        ) : run.summary ? (
          <p className="summary-line">{run.summary}</p>
        ) : (
          <p className="muted-line">No output summary is available from current readback.</p>
        )}
        {detailErrors.length > 0 ? (
          <ul className="issue-list">
            {detailErrors.map((item) => (
              <li key={item}>
                <AlertTriangle size={15} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="inspector-card">
        <h3>Related Records</h3>
        {run.agentIds.map((agentId) => (
          <button type="button" key={agentId} onClick={() => window.location.assign(`/console?view=agents&agent=${encodeURIComponent(agentId)}`)}>
            <Bot size={15} aria-hidden="true" />
            Agent {agentId}
          </button>
        ))}
        {run.providerLinks.map((link) => (
          <a href={link.href} key={link.href}>
            <ExternalLink size={15} aria-hidden="true" />
            {link.label}
          </a>
        ))}
        {providerRefs.map((ref) => (
          <a href={ref.accountMirrorPath ?? ref.catalogItemPath} key={`${ref.provider}:${ref.conversationId}`}>
            <ExternalLink size={15} aria-hidden="true" />
            {serviceDisplay(ref.provider)} conversation
          </a>
        ))}
        {teamInspection ? (
          <button type="button" onClick={() => onSwitchView("runs")}>
            <CheckCircle2 size={15} aria-hidden="true" />
            Team inspection loaded
          </button>
        ) : null}
        <a href="/ops/browser">
          <ExternalLink size={15} aria-hidden="true" />
          Open Diagnostics
        </a>
      </div>

      <div className="inspector-card">
        <h3>Queue Context</h3>
        <dl className="compact-details">
          <Detail label="Background drain" value={runsData.queue.background} />
          <Detail label="Runner topology" value={runsData.queue.runners} />
          <Detail label="Local claim" value={runsData.queue.localClaim} />
          <Detail label="Live follow" value={runsData.queue.liveFollow} />
        </dl>
        {backgroundActions.length > 0 ? (
          <ControlActionList actions={backgroundActions} busyAction={controlBusy} onControl={onControl} />
        ) : null}
      </div>

      <div className="inspector-card">
        <button
          className="advanced-toggle"
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          aria-expanded={advancedOpen}
        >
          <ChevronDown size={15} aria-hidden="true" />
          Show technical details
        </button>
        {advancedOpen ? (
          <dl className="details-list">
            <Detail label="Runtime run id" value={run.runtimeRunId} />
            <Detail label="Team run id" value={run.teamRunId} />
            <Detail label="Task spec id" value={run.taskRunSpecId} />
            <Detail label="Response id" value={run.responseId} />
            <Detail label="Operation id" value={run.operationId} />
            <dt>Raw detail</dt>
            <dd>
              <pre>{JSON.stringify({ row: run.raw, detail }, null, 2)}</pre>
            </dd>
          </dl>
        ) : null}
      </div>
    </div>
  );
}

function AgentForm({
  choices,
  form,
  fieldErrors,
  selectedIssues,
  selectedAgent,
  editingNew,
  saving,
  onChange,
  onSave,
  onDuplicate,
  onArchive,
}) {
  const service = form.service || selectedAgent?.service || selectedAgent?.defaultService || "";
  const tenants = (choices?.tenants ?? []).filter((tenant) => !service || tenant.service === service);
  const providerAccounts = buildProviderAccountOptions(tenants, choices?.bindings ?? [], service);
  const validBindings = getValidBindingsForTenant(choices, form.tenantKey, service);
  const selectors = (choices?.modelSelectors ?? []).filter((selector) => !service || selector.service === service);
  const projects = (choices?.projectBindings ?? []).filter(
    (project) =>
      project.source === "none" ||
      (!service || !project.service || project.service === service) ||
      project.runtimeProfileId === form.runtimeProfile,
  );
  const models = choices?.models ?? [];
  const selectedBinding = validBindings.find((binding) => binding.bindingKey === form.bindingKey) ?? null;

  useEffect(() => {
    if (!form.tenantKey) return;
    const nextBindings = getValidBindingsForTenant(choices, form.tenantKey, service);
    const selectedStillValid = nextBindings.some((binding) => binding.bindingKey === form.bindingKey);
    if (selectedStillValid) return;
    const nextBinding = nextBindings.length === 1 ? nextBindings[0] : null;
    if (!nextBinding && !form.bindingKey && !form.bindingId && !form.runtimeProfile) return;
    onChange({
      ...form,
      bindingKey: nextBinding?.bindingKey ?? "",
      bindingId: nextBinding?.bindingId ?? "",
      runtimeProfile: nextBinding?.runtimeProfileId ?? "",
    });
  }, [choices, form, onChange, service]);

  return (
    <form
      className="agent-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave();
      }}
    >
      <div className="editor-header">
        <div>
          <h2>{editingNew ? "New agent" : form.id || "Select an agent"}</h2>
          <p>{editingNew ? "Create a reusable app-facing agent." : "Edit the selected agent contract."}</p>
        </div>
        <div className="editor-actions">
          <button className="ghost-button" type="button" onClick={onDuplicate} disabled={saving || (!selectedAgent && !form.id)}>
            <Copy size={15} aria-hidden="true" />
            Duplicate
          </button>
          <button className="ghost-button danger" type="button" onClick={onArchive} disabled={saving || !form.id}>
            <Archive size={15} aria-hidden="true" />
            Archive
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={15} aria-hidden="true" />
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      {selectedIssues.length > 0 || fieldErrors.length > 0 ? (
        <div className="validation-summary" role="status">
          <AlertTriangle size={17} aria-hidden="true" />
          <div>
            <strong>Review setup before save</strong>
            <ul>
              {[...fieldErrors, ...selectedIssues.map((issue) => issue.message)].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <fieldset>
        <legend>Identity</legend>
        <TextField label="Agent id" value={form.id} onChange={(id) => onChange({ ...form, id })} required />
        <TextField
          label="Description"
          value={form.description}
          onChange={(description) => onChange({ ...form, description })}
          placeholder="Short operator-facing purpose"
        />
      </fieldset>

      <fieldset>
        <legend>Provider</legend>
        <SelectField
          label="Service"
          value={form.service}
          onChange={(nextService) => onChange(resetProviderFields(form, nextService))}
          options={(choices?.services ?? []).map((item) => ({ value: item.id, label: item.label }))}
          placeholder="Choose service"
        />
        <SelectField
          label="Provider account"
          value={form.tenantKey}
          onChange={(tenantKey) => {
            const account = providerAccounts.find((item) => item.tenantKey === tenantKey);
            const nextBindings = getValidBindingsForTenant(choices, tenantKey, account?.service ?? form.service);
            const nextBinding = nextBindings.length === 1 ? nextBindings[0] : null;
            onChange({
              ...form,
              tenantKey,
              service: account?.service ?? form.service,
              bindingKey: nextBinding?.bindingKey ?? "",
              bindingId: nextBinding?.bindingId ?? "",
              runtimeProfile: nextBinding?.runtimeProfileId ?? "",
            });
          }}
          options={providerAccounts.map((account) => ({
            value: account.tenantKey,
            label: formatProviderAccountLabel(account),
          }))}
          placeholder="Choose provider account"
        />
        <BrowserBindingControl
          form={form}
          validBindings={validBindings}
          selectedBinding={selectedBinding}
          onChange={onChange}
        />
      </fieldset>

      <fieldset>
        <legend>Behavior</legend>
        <SelectField
          label="Model selector"
          value={form.modelSelector}
          onChange={(modelSelector) => onChange({ ...form, modelSelector, model: "" })}
          options={selectors.map((selector) => ({
            value: selector.id,
            label: `${selector.label}${selector.executionReady ? "" : " (not ready)"}`,
          }))}
          placeholder="Choose semantic selector"
        />
        <SelectField
          label="Exact model"
          value={form.model}
          onChange={(model) => onChange({ ...form, model, modelSelector: "" })}
          options={models.map((model) => ({ value: model.id, label: `${model.id} (${model.provider})` }))}
          placeholder="Compatibility escape hatch"
        />
        <textarea
          className="text-area"
          value={form.instructions}
          onChange={(event) => onChange({ ...form, instructions: event.target.value })}
          placeholder="Agent instructions"
          aria-label="Agent instructions"
          rows={4}
        />
      </fieldset>

      <fieldset>
        <legend>Project</legend>
        <SelectField
          label="Project"
          value={form.projectBindingKey}
          onChange={(projectBindingKey) => onChange({ ...form, projectBindingKey })}
          options={[
            { value: "none", label: "No project configured" },
            ...projects.map((project) => ({
              value: project.key,
              label: formatProjectLabel(project),
            })),
          ]}
          placeholder="Choose project behavior"
        />
      </fieldset>

      <fieldset>
        <legend>Extras</legend>
        <div className="two-column">
          <SelectField
            label="Model strategy"
            value={form.modelStrategy}
            onChange={(modelStrategy) => onChange({ ...form, modelStrategy })}
            options={(choices?.extras?.modelStrategy ?? []).map((value) => ({ value, label: value }))}
            placeholder="Default"
          />
          <SelectField
            label="Thinking"
            value={form.thinkingTime}
            onChange={(thinkingTime) => onChange({ ...form, thinkingTime })}
            options={(choices?.extras?.thinkingTime ?? []).map((value) => ({ value, label: value }))}
            placeholder="Default"
          />
          <SelectField
            label="Composer tool"
            value={form.composerTool}
            onChange={(composerTool) => onChange({ ...form, composerTool })}
            options={(choices?.extras?.composerTool ?? []).map((value) => ({ value, label: value }))}
            placeholder="Default"
          />
          <SelectField
            label="Research action"
            value={form.deepResearchPlanAction}
            onChange={(deepResearchPlanAction) => onChange({ ...form, deepResearchPlanAction })}
            options={(choices?.extras?.deepResearchPlanAction ?? []).map((value) => ({ value, label: value }))}
            placeholder="Default"
          />
        </div>
      </fieldset>
    </form>
  );
}

function Inspector({ agent, form, choices, validation, fieldErrors, advancedOpen, setAdvancedOpen }) {
  const issues = validation?.issues ?? [];
  const currentAgent = agent ?? form;
  return (
    <div className="inspector-inner">
      <div className="inspector-card">
        <div className="inspector-title">
          <Bot size={18} aria-hidden="true" />
          <div>
            <h2>{currentAgent.id || "No agent selected"}</h2>
            <p>{currentAgent.description || "Select or create an agent to inspect setup."}</p>
          </div>
        </div>
        <StatusPill valid={validation?.valid} hasDraft={!agent && Boolean(form.id)} />
      </div>

      <div className="inspector-card">
        <h3>Validation</h3>
        {fieldErrors.length === 0 && issues.length === 0 ? (
          <p className="good-line">
            <CheckCircle2 size={16} aria-hidden="true" />
            Ready for normal configuration work.
          </p>
        ) : (
          <ul className="issue-list">
            {[...fieldErrors, ...issues.map((issue) => issue.message)].map((message) => (
              <li key={message}>
                <AlertTriangle size={15} aria-hidden="true" />
                {message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="inspector-card">
        <h3>Linked actions</h3>
        {form.tenantKey || agent?.tenantKey ? (
          <a href={`/console?view=providers&provider=${encodeURIComponent(form.tenantKey || agent?.tenantKey)}`}>
            <ExternalLink size={15} aria-hidden="true" />
            Review provider account
          </a>
        ) : null}
        {agent?.projectBinding?.source && agent.projectBinding.source !== "none" ? (
          <a href={`/console?view=projects&agent=${encodeURIComponent(agent.id)}`}>
            <ExternalLink size={15} aria-hidden="true" />
            Review project binding
          </a>
        ) : null}
        <a href="/ops/browser">
          <ExternalLink size={15} aria-hidden="true" />
          Open legacy diagnostics
        </a>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(window.location.href)}>
          <Copy size={15} aria-hidden="true" />
          Copy handoff link
        </button>
      </div>

      <div className="inspector-card">
        <button
          className="advanced-toggle"
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          aria-expanded={advancedOpen}
        >
          <ChevronDown size={15} aria-hidden="true" />
          Show technical details
        </button>
        {advancedOpen ? (
          <dl className="details-list">
            <Detail label="Tenant key" value={form.tenantKey || agent?.tenantKey} />
            <Detail label="Binding key" value={form.bindingKey || agent?.bindingKey} />
            <Detail label="Runtime profile" value={form.runtimeProfile || agent?.runtimeProfileId} />
            <Detail label="Config path" value={choices?.configPath} />
            <Detail label="Registry path" value={choices?.registryPath} />
            <dt>Raw draft</dt>
            <dd>
              <pre>{JSON.stringify(formToAgentConfig(form, choices), null, 2)}</pre>
            </dd>
          </dl>
        ) : null}
      </div>
    </div>
  );
}

function InventoryInspector({ row, kind, onOpenAgent }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  if (!row) {
    return (
      <div className="inspector-inner">
        <div className="inspector-card">
          <div className="inspector-title">
            <Sparkles size={18} aria-hidden="true" />
            <div>
              <h2>No {kind === "providers" ? "provider account" : "project"} selected</h2>
              <p>Select a row to inspect readiness and linked agents.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="inspector-inner">
      <div className="inspector-card">
        <div className="inspector-title">
          {kind === "providers" ? <ShieldCheck size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
          <div>
            <h2>{row.name}</h2>
            <p>{row.subtitle}</p>
          </div>
        </div>
        <ReadinessChip state={row.readiness} />
      </div>

      <div className="inspector-card">
        <h3>Validation</h3>
        {row.issues.length === 0 ? (
          <p className="good-line">
            <CheckCircle2 size={16} aria-hidden="true" />
            Ready for configured agent work.
          </p>
        ) : (
          <ul className="issue-list">
            {row.issues.map((issue) => (
              <li key={issue}>
                <AlertTriangle size={15} aria-hidden="true" />
                {issue}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="inspector-card">
        <h3>Linked agents</h3>
        {row.linkedAgents.length === 0 ? (
          <p className="muted-line">No agents currently reference this {kind === "providers" ? "provider account" : "project"}.</p>
        ) : (
          <div className="linked-list">
            {row.linkedAgents.map((agent) => (
              <button type="button" key={agent.id} onClick={() => onOpenAgent(agent.id)}>
                <Bot size={15} aria-hidden="true" />
                <span>{agent.id}</span>
                <StatusChip ready={agent.valid} disabled={agent.disabled} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="inspector-card">
        <button
          className="advanced-toggle"
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          aria-expanded={advancedOpen}
        >
          <ChevronDown size={15} aria-hidden="true" />
          Show technical details
        </button>
        {advancedOpen ? (
          <dl className="details-list">
            <Detail label="Tenant key" value={row.tenantKey} />
            <Detail label="Binding key" value={row.bindingKey} />
            <Detail label="Runtime profile" value={row.runtimeProfileId} />
            <Detail label="Browser profile" value={row.browserProfileId} />
            <Detail label="Provider project id" value={row.providerProjectId} />
            <dt>Raw row</dt>
            <dd>
              <pre>{JSON.stringify(row.raw, null, 2)}</pre>
            </dd>
          </dl>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Notice({ tone, title, message }) {
  const Icon = tone === "success" ? CheckCircle2 : XCircle;
  return (
    <div className={`notice ${tone}`} role="status">
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder = "", required = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option value={option.value} key={`${label}:${option.value}`}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BrowserBindingControl({ form, validBindings, selectedBinding, onChange }) {
  if (!form.tenantKey) {
    return (
      <div className="field read-only-field">
        <span>Browser binding</span>
        <p>Choose a provider account first.</p>
      </div>
    );
  }
  if (validBindings.length === 0) {
    return (
      <div className="field read-only-field warning-field">
        <span>Browser binding</span>
        <p>No valid browser binding is available for this provider account.</p>
      </div>
    );
  }
  if (validBindings.length === 1) {
    const binding = validBindings[0];
    return (
      <div className="field read-only-field">
        <span>Browser binding</span>
        <p>{formatBindingLabel(binding)}</p>
      </div>
    );
  }
  return (
    <SelectField
      label="Browser binding"
      value={selectedBinding?.bindingKey ?? ""}
      onChange={(bindingKey) => {
        const binding = validBindings.find((item) => item.bindingKey === bindingKey);
        onChange({
          ...form,
          bindingKey,
          bindingId: binding?.bindingId ?? bindingKey,
          runtimeProfile: binding?.runtimeProfileId ?? "",
          service: binding?.service ?? form.service,
          tenantKey: binding?.tenantKey ?? form.tenantKey,
        });
      }}
      options={validBindings.map((binding) => ({
        value: binding.bindingKey,
        label: formatBindingLabel(binding),
      }))}
      placeholder="Choose browser binding"
    />
  );
}

function Detail({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || "not set"}</dd>
    </>
  );
}

function StatusChip({ ready, disabled }) {
  if (disabled) return <span className="chip disabled">Disabled</span>;
  if (ready) return <span className="chip ready">Ready</span>;
  return <span className="chip warning">Needs setup</span>;
}

function StatusPill({ valid, hasDraft }) {
  if (hasDraft) return <span className="status-pill draft">Draft</span>;
  if (valid) return <span className="status-pill ready">Ready</span>;
  return <span className="status-pill warning">Needs setup</span>;
}

function ReadinessChip({ state }) {
  if (state === "ready") return <span className="chip ready">Ready</span>;
  if (state === "attention") return <span className="chip danger">Attention needed</span>;
  return <span className="chip warning">Needs setup</span>;
}

function RunStateChip({ state, label }) {
  if (state === "completed") return <span className="chip ready">{label}</span>;
  if (state === "attention") return <span className="chip danger">{label}</span>;
  if (state === "cancelled") return <span className="chip disabled">{label}</span>;
  if (state === "active" || state === "waiting") return <span className="chip warning">{label}</span>;
  return <span className="chip disabled">{label}</span>;
}

function ControlActionList({ actions, busyAction, onControl }) {
  return (
    <div className="control-action-list">
      {actions.map((action) => (
        <div className="control-action-row" key={action.action}>
          <button
            className={action.action.includes("cancel") ? "ghost-button danger" : "ghost-button"}
            type="button"
            onClick={() => onControl(action)}
            disabled={!action.available || busyAction === action.action}
            title={action.available ? action.expectedTransition : action.blockedReason}
          >
            {controlActionIcon(action.action)}
            {busyAction === action.action ? "Working" : action.label}
          </button>
          <span>{action.available ? action.expectedEvidence : action.blockedReason}</span>
        </div>
      ))}
    </div>
  );
}

function controlActionIcon(action) {
  if (action.includes("pause")) return <Pause size={15} aria-hidden="true" />;
  if (action.includes("resume")) return <Play size={15} aria-hidden="true" />;
  if (action.includes("cancel")) return <XCircle size={15} aria-hidden="true" />;
  return <RefreshCcw size={15} aria-hidden="true" />;
}

function ListPlaceholder() {
  return (
    <div className="placeholder-list" aria-label="Loading agents">
      <span />
      <span />
      <span />
    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <Sparkles size={20} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

async function putJson(path, payload) {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

async function readError(response) {
  try {
    const payload = await response.json();
    return payload?.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

function readAgentFromUrl() {
  return readParamFromUrl("agent");
}

function readParamFromUrl(key) {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(key) ?? "";
  } catch {
    return "";
  }
}

function readViewFromUrl() {
  const view = readParamFromUrl("view");
  return view === "overview" ||
    view === "providers" ||
    view === "projects" ||
    view === "agents" ||
    view === "runs" ||
    view === "handoffs"
    ? view
    : "overview";
}

function updateUrl(updates) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", updates.view || readViewFromUrl());
  Object.entries(updates).forEach(([key, value]) => {
    if (key === "view") return;
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function navItemToView(item) {
  if (item === "Overview") return "overview";
  if (item === "Agents") return "agents";
  if (item === "Providers") return "providers";
  if (item === "Projects") return "projects";
  if (item === "Runs") return "runs";
  if (item === "Handoffs") return "handoffs";
  return "";
}

function summarizeHandoffPayload(payload) {
  if (!payload) {
    return {
      title: "No handoff loaded",
      subtitle: "Enter a handoff id and run a status or operator action.",
      stage: "unknown",
      nextAction: "unknown",
      fileCount: 0,
      readback: "unknown",
      resumePlanRef: "missing",
      repairReportRef: "missing",
      exportRef: "missing",
      providerMessageId: "missing",
    };
  }
  const resumePlan = payload.resumePlan ?? null;
  const recovery = payload.recovery ?? null;
  const report = payload.report ?? null;
  const exportBundle = payload.exportBundle ?? null;
  const target = payload.target ?? {};
  const fileCount = exportBundle?.selectedFiles?.length ?? target.selectedFileCount ?? 0;
  return {
    title: payload.runId ?? payload.run?.id ?? "Handoff packet",
    subtitle: payload.packetPath ?? "Packet path unavailable",
    stage: recovery?.status ?? resumePlan?.currentStage ?? target.submitStatus ?? target.uploadStatus ?? "unknown",
    nextAction:
      payload.afterResumePlan?.nextAction ??
      resumePlan?.nextAction ??
      (target.readbackStatus === "readback_cached" ? "complete" : "unknown"),
    fileCount,
    readback: exportBundle?.readbackStatus ?? target.readbackStatus ?? "unknown",
    resumePlanRef: report?.resumePlanRef ?? resumePlan?.refs?.manualExport ?? "target/resume-plan.json",
    repairReportRef: report ? "repair/report.json" : "missing",
    exportRef: recovery ? "target/live-recovery.json" : exportBundle ? "target/manual-handoff-export.json" : resumePlan?.refs?.manualExport ?? "missing",
    providerMessageId: exportBundle?.providerMessageId ?? target.providerMessageId ?? "missing",
  };
}

function agentToForm(agent) {
  if (!agent) return EMPTY_FORM;
  return {
    id: agent.id ?? "",
    description: agent.description ?? "",
    service: agent.service ?? agent.defaultService ?? "",
    tenantKey: agent.tenantKey ?? "",
    bindingKey: agent.bindingKey ?? "",
    bindingId: agent.bindingId ?? "",
    runtimeProfile: agent.runtimeProfile ?? agent.runtimeProfileId ?? "",
    modelSelector: agent.modelSelector ?? "",
    model: agent.model ?? "",
    projectBindingKey: "",
    instructions: agent.instructions ?? "",
    modelStrategy: agent.defaults?.modelStrategy ?? "",
    thinkingTime: agent.defaults?.thinkingTime ?? "",
    composerTool: agent.defaults?.composerTool ?? "",
    deepResearchPlanAction: agent.defaults?.deepResearchPlanAction ?? "",
  };
}

function formToAgentConfig(form, choices) {
  const config = {};
  setIfPresent(config, "description", form.description);
  setIfPresent(config, "service", form.service);
  setIfPresent(config, "tenantKey", form.tenantKey);
  setIfPresent(config, "bindingId", form.bindingId || form.bindingKey);
  setIfPresent(config, "runtimeProfile", form.runtimeProfile);
  setIfPresent(config, "modelSelector", form.modelSelector);
  setIfPresent(config, "model", form.model);
  setIfPresent(config, "instructions", form.instructions);

  const project = (choices?.projectBindings ?? []).find((item) => item.key === form.projectBindingKey);
  if (project && project.source !== "none") {
    config.projectBinding = {
      mode: project.mode,
      ...(project.id ? { id: project.id } : {}),
      ...(project.providerProjectId ? { providerProjectId: project.providerProjectId } : {}),
      ...(project.label ? { label: project.label } : {}),
    };
    if (project.providerProjectId) config.projectId = project.providerProjectId;
    if (project.label) config.projectName = project.label;
  }

  const defaults = {};
  setIfPresent(defaults, "modelStrategy", form.modelStrategy);
  setIfPresent(defaults, "thinkingTime", form.thinkingTime);
  setIfPresent(defaults, "composerTool", form.composerTool);
  setIfPresent(defaults, "deepResearchPlanAction", form.deepResearchPlanAction);
  if (Object.keys(defaults).length > 0) config.defaults = defaults;
  return config;
}

function setIfPresent(target, key, value) {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    target[key] = value;
  }
}

function resetProviderFields(form, service) {
  return {
    ...form,
    service,
    tenantKey: "",
    bindingKey: "",
    bindingId: "",
    runtimeProfile: "",
    modelSelector: "",
    model: "",
    projectBindingKey: "",
  };
}

function validateForm(form, choices) {
  const errors = [];
  if (!form.id.trim()) errors.push("Agent id is required.");
  if (!form.service) errors.push("Choose a service.");
  if (!form.tenantKey) errors.push("Choose a provider account.");
  if (!form.bindingKey) errors.push("Choose a browser binding.");
  const validBindings = getValidBindingsForTenant(choices, form.tenantKey, form.service);
  if (form.tenantKey && validBindings.length === 0) {
    errors.push("Selected provider account has no valid browser binding.");
  }
  if (form.bindingKey && !validBindings.some((item) => item.bindingKey === form.bindingKey)) {
    errors.push("Selected browser binding is not valid for this provider account.");
  }
  return errors;
}

function formatProjectLabel(project) {
  if (project.source === "none") return "No project configured";
  const name = project.label ?? project.providerProjectId ?? project.id ?? project.key;
  const source = project.source === "override-ready" ? "override available" : project.source;
  return `${name} (${source})`;
}

function buildProviderAccountOptions(tenants, bindings, service) {
  const accounts = new Map();
  for (const tenant of tenants) {
    const key = tenant.tenantKey;
    const existing = accounts.get(key);
    const validBindings = bindings.filter(
      (binding) =>
        binding.ready &&
        binding.tenantKey === tenant.tenantKey &&
        (!service || binding.service === service),
    );
    if (existing) {
      existing.validBindingCount = Math.max(existing.validBindingCount, validBindings.length);
      continue;
    }
    accounts.set(key, {
      ...tenant,
      validBindingCount: validBindings.length,
    });
  }
  return [...accounts.values()].sort(
    (left, right) =>
      left.service.localeCompare(right.service) ||
      providerAccountIdentity(left).localeCompare(providerAccountIdentity(right)),
  );
}

function getValidBindingsForTenant(choices, tenantKey, service) {
  if (!tenantKey) return [];
  return (choices?.bindings ?? [])
    .filter(
      (binding) =>
        binding.ready &&
        binding.tenantKey === tenantKey &&
        (!service || binding.service === service),
    )
    .sort((left, right) => left.runtimeProfileId.localeCompare(right.runtimeProfileId));
}

function formatProviderAccountLabel(account) {
  const identity = providerAccountIdentity(account);
  const bindingHint =
    account.validBindingCount > 1
      ? `${account.validBindingCount} browser bindings`
      : account.validBindingCount === 1
        ? "1 browser binding"
        : "needs browser binding";
  return `${serviceDisplay(account.service)} / ${identity} / ${bindingHint}`;
}

function providerAccountIdentity(account) {
  const base =
    account.identity?.email ??
    account.identity?.handle ??
    account.identity?.accountId ??
    account.identity?.id ??
    account.identity?.name ??
    account.tenantKey;
  const qualifiers = [
    account.identity?.accountLevel,
    account.identity?.accountLabel,
    account.identity?.accountPlanType,
    account.identity?.accountStructure,
    account.identity?.organizationId ? `org ${account.identity.organizationId}` : "",
  ].filter(Boolean);
  return qualifiers.length > 0 ? `${base} / ${qualifiers.join(" / ")}` : base;
}

function formatBindingLabel(binding) {
  return `${binding.runtimeProfileId} / ${binding.browserProfileId ?? "unbound browser"}`;
}

function buildProviderRows(choices, agents, validationByAgent) {
  const tenants = choices?.tenants ?? [];
  const bindings = choices?.bindings ?? [];
  const rows = new Map();
  for (const tenant of tenants) {
    const binding = bindings.find((item) => item.bindingKey === tenant.bindingKey);
    const linkedAgents = agentsForProvider(agents, tenant.tenantKey, tenant.bindingKey, validationByAgent);
    const issues = [];
    if (!binding) issues.push("No selectable browser binding is available for this provider account.");
    if (binding && !binding.ready) issues.push("Browser binding needs setup before agents can use this account.");
    if (linkedAgents.some((agent) => !agent.valid)) issues.push("One or more linked agents need setup.");
    rows.set(tenant.tenantKey, {
      key: tenant.tenantKey,
      name: providerAccountLabel(tenant),
      subtitle: tenant.identity?.email ?? tenant.identity?.handle ?? tenant.identity?.accountId ?? tenant.tenantKey,
      service: tenant.service,
      tenantKey: tenant.tenantKey,
      bindingKey: tenant.bindingKey,
      runtimeProfileId: tenant.runtimeProfileId,
      browserProfileId: tenant.browserProfileId,
      bindingLabel: bindingLabel(binding ?? tenant),
      readiness: issues.length > 0 ? "needs-setup" : "ready",
      issues,
      linkedAgents,
      searchable: [
        tenant.service,
        tenant.tenantKey,
        tenant.bindingKey,
        tenant.runtimeProfileId,
        tenant.browserProfileId,
        ...Object.values(tenant.identity ?? {}),
      ],
      raw: { tenant, binding },
    });
  }
  for (const binding of bindings) {
    if (binding.tenantKey && rows.has(binding.tenantKey)) continue;
    const linkedAgents = agentsForProvider(agents, binding.tenantKey, binding.bindingKey, validationByAgent);
    const issues = ["No provider account identity is resolved for this browser binding."];
    rows.set(binding.bindingKey, {
      key: binding.bindingKey,
      name: `${serviceDisplay(binding.service)} account not resolved`,
      subtitle: binding.runtimeProfileId,
      service: binding.service,
      tenantKey: binding.tenantKey,
      bindingKey: binding.bindingKey,
      runtimeProfileId: binding.runtimeProfileId,
      browserProfileId: binding.browserProfileId,
      bindingLabel: bindingLabel(binding),
      readiness: "attention",
      issues,
      linkedAgents,
      searchable: [binding.service, binding.bindingKey, binding.runtimeProfileId, binding.browserProfileId],
      raw: { binding },
    });
  }
  return [...rows.values()].sort((left, right) => left.service.localeCompare(right.service) || left.name.localeCompare(right.name));
}

function buildProjectRows(choices, agents, validationByAgent) {
  const projectBindings = choices?.projectBindings ?? [];
  const rows = projectBindings
    .filter((project) => project.source !== "none")
    .map((project) => {
      const linkedAgents = agentsForProject(agents, project, validationByAgent);
      const issues = [];
      if (!project.providerProjectId && !project.id && project.mode !== "none") {
        issues.push("Project binding does not expose a provider project id.");
      }
      if (linkedAgents.length === 0) {
        issues.push("No agents currently reference this project binding.");
      }
      if (linkedAgents.some((agent) => !agent.valid)) {
        issues.push("One or more linked agents need setup before this project is ready.");
      }
      const name = project.label ?? project.providerProjectId ?? project.id ?? "Unnamed project";
      return {
        key: project.key,
        name,
        subtitle: project.source === "service" ? "Default project" : project.source === "override-ready" ? "Available override" : "Agent project",
        service: project.service,
        tenantKey: project.tenantKey,
        bindingKey: project.bindingKey,
        runtimeProfileId: project.runtimeProfileId,
        browserProfileId: "",
        providerProjectId: project.providerProjectId,
        bindingLabel: providerAccountShort(project.tenantKey, project.bindingKey),
        readiness: issues.some((issue) => issue.includes("No agents")) ? "needs-setup" : issues.length > 0 ? "attention" : "ready",
        issues,
        linkedAgents,
        searchable: [
          project.service,
          project.tenantKey,
          project.bindingKey,
          project.runtimeProfileId,
          project.providerProjectId,
          project.id,
          project.label,
          project.source,
        ],
        raw: { project },
      };
    });
  const agentsWithoutProject = agents
    .filter((agent) => agent.projectBinding?.source === "none")
    .map((agent) => {
      const validation = validationByAgent.get(agent.id);
      return {
        key: `missing:${agent.id}`,
        name: `${agent.id} has no default project`,
        subtitle: "Missing default project",
        service: agent.service ?? agent.defaultService ?? "",
        tenantKey: agent.tenantKey,
        bindingKey: agent.bindingKey,
        runtimeProfileId: agent.runtimeProfileId,
        browserProfileId: "",
        providerProjectId: "",
        bindingLabel: providerAccountShort(agent.tenantKey, agent.bindingKey),
        readiness: "needs-setup",
        issues: ["Agent has no explicit or inherited provider project binding."],
        linkedAgents: [{
          id: agent.id,
          valid: Boolean(validation?.valid),
          disabled: agent.enabled === false || agent.disabled === true,
        }],
        searchable: [agent.id, agent.service, agent.tenantKey, agent.bindingKey, agent.runtimeProfileId],
        raw: { agent },
      };
    });
  return [...rows, ...agentsWithoutProject].sort(
    (left, right) => String(left.service).localeCompare(String(right.service)) || left.name.localeCompare(right.name),
  );
}

function agentsForProvider(agents, tenantKey, bindingKey, validationByAgent) {
  return agents
    .filter((agent) => (tenantKey && agent.tenantKey === tenantKey) || (bindingKey && agent.bindingKey === bindingKey))
    .map((agent) => {
      const validation = validationByAgent.get(agent.id);
      return {
        id: agent.id,
        valid: Boolean(validation?.valid),
        disabled: agent.enabled === false || agent.disabled === true,
      };
    });
}

function agentsForProject(agents, project, validationByAgent) {
  return agents
    .filter((agent) => {
      const binding = agent.projectBinding ?? {};
      return (
        binding.providerProjectId === project.providerProjectId ||
        binding.id === project.id ||
        binding.label === project.label ||
        (agent.tenantKey === project.tenantKey && agent.bindingKey === project.bindingKey && binding.source === project.source)
      );
    })
    .map((agent) => {
      const validation = validationByAgent.get(agent.id);
      return {
        id: agent.id,
        valid: Boolean(validation?.valid),
        disabled: agent.enabled === false || agent.disabled === true,
      };
    });
}

function filterInventoryRows(rows, query, readinessFilter) {
  const normalized = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (readinessFilter !== "all" && row.readiness !== readinessFilter) return false;
    if (!normalized) return true;
    return [row.name, row.subtitle, row.bindingLabel, ...row.searchable]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized));
  });
}

function inventoryMetrics(rows) {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.readiness === "ready").length,
    needsSetup: rows.filter((row) => row.readiness === "needs-setup").length,
    attention: rows.filter((row) => row.readiness === "attention").length,
  };
}

function buildRunsData({ status, runtimeRuns, completionRuns, recoveryCandidates, agents }) {
  const controlReadiness = status?.controlReadiness ?? {};
  const runtimeActionsById = controlReadiness.runtimeRunActionsById ?? {};
  const completionActionsById = controlReadiness.accountMirrorCompletionActionsById ?? {};
  const runtimeRows = runtimeRuns.map((run) => buildRuntimeRunRow(run, agents, runtimeActionsById));
  const completionRows = completionRuns.map((operation) => buildCompletionRunRow(operation, completionActionsById));
  const rows = [...runtimeRows, ...completionRows].sort((left, right) =>
    String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)),
  );
  const recovery = status?.recoverySummary ?? {};
  const localClaim = status?.localClaimSummary ?? recovery.localClaim ?? {};
  const runnerMetrics = status?.runnerTopology?.metrics ?? {};
  const background = status?.backgroundDrain ?? {};
  const liveFollowSeverity = status?.liveFollow?.severity ?? status?.liveFollow?.summary?.severity ?? "";
  const recoveryCandidateData = buildRecoveryCandidateData(recoveryCandidates);
  return {
    rows,
    metrics: {
      total: rows.length,
      active: rows.filter((row) => row.stateGroup === "active").length,
      waiting: rows.filter((row) => row.stateGroup === "waiting").length,
      attention: rows.filter((row) => row.stateGroup === "attention").length,
      completed: rows.filter((row) => row.stateGroup === "completed").length,
      cancelled: rows.filter((row) => row.stateGroup === "cancelled").length,
    },
    recovery: {
      summary: `${recovery.metrics?.actionableCount ?? 0} actionable, ${recovery.metrics?.activeLeaseCount ?? 0} active lease`,
      raw: recovery,
    },
    recoveryCandidates: recoveryCandidateData,
    queue: {
      background: background.paused ? "paused" : background.state ?? "unknown",
      backgroundActions: controlReadiness.backgroundDrain?.actions ?? [],
      runners: `${runnerMetrics.activeRunnerCount ?? 0} active / ${runnerMetrics.totalRunnerCount ?? 0} total`,
      localClaim: `${localClaim.metrics?.selectedCount ?? 0} selected, ${localClaim.metrics?.blockedCount ?? 0} blocked`,
      liveFollow: liveFollowSeverity || status?.accountMirrorScheduler?.operatorStatus?.posture || "unknown",
    },
  };
}

function buildRecoveryCandidateData(payload) {
  const metrics = payload?.metrics ?? {};
  const remote = metrics.remoteKnownMissingLocal ?? {};
  const unknown = metrics.unknownOrDeferred ?? {};
  const byAction = metrics.byAction ?? {};
  const rows = Array.isArray(payload?.candidates)
    ? payload.candidates.map((candidate) => {
        const missing = candidate?.counts?.remoteKnownMissingLocal ?? {};
        const provider = candidate?.provider ?? "unknown";
        const runtimeProfile = candidate?.runtimeProfileId ?? "default";
        const tenant = candidate?.tenantKey ?? candidate?.bindingKey ?? "unbound";
        return {
          id: candidate.id ?? `${provider}:${runtimeProfile}:${tenant}`,
          providerLabel: `${serviceDisplay(provider)} / ${runtimeProfile}`,
          tenantLabel: String(tenant).replace(/^service-account:[^:]+:/u, ""),
          actionLabel: formatRecoveryAction(candidate?.action),
          missingLabel: `${missing.total ?? 0} missing`,
        };
      })
    : [];
  const remoteMissing = remote.total ?? 0;
  const unknownDeferred = unknown.total ?? 0;
  const queueable = byAction.queue_history_materialization ?? 0;
  return {
    total: metrics.total ?? rows.length,
    returned: metrics.returned ?? rows.length,
    remoteMissing,
    unknownDeferred,
    queueable,
    rows,
    summary: `${remoteMissing} remote-known missing local assets; ${unknownDeferred} unknown or deferred.`,
  };
}

function formatRecoveryAction(action) {
  if (action === "queue_history_materialization") return "Queue materialization";
  if (action === "refresh_detail_inventory") return "Refresh detail";
  if (action === "start_materialization_policy_completion") return "Start policy pass";
  if (action === "inspect_archive_materialization") return "Inspect archive";
  if (action === "none") return "No action";
  return "Review";
}

function buildRuntimeRunRow(run, agents, actionsByRunId = {}) {
  const kind = run.sourceKind === "team-run" ? "team" : "response";
  const agentIds = agentsForRuntimeRun(run, agents);
  const providerRefs = run.providerConversationSummary?.conversations ?? [];
  const serviceIds = run.serviceIds ?? [];
  const runtimeProfileIds = run.runtimeProfileIds ?? [];
  const stateGroup = groupRuntimeRunState(run.status);
  const title =
    run.teamRunId ??
    run.taskRunSpecId ??
    (kind === "team" ? "Team run" : "Response run");
  const ownerLabel =
    agentIds.length > 0
      ? agentIds.slice(0, 2).join(", ")
      : serviceIds.length > 0
        ? serviceIds.map(serviceDisplay).join(", ")
        : runtimeProfileIds[0] ?? "No owner";
  return {
    key: `runtime:${run.runId}`,
    kind,
    kindLabel: kind === "team" ? "Team run" : "Response run",
    statusLabel: formatStatus(run.status),
    stateGroup,
    title,
    subtitle: run.runId,
    summary: `${run.stepCount ?? 0} step${run.stepCount === 1 ? "" : "s"}; ${run.runnableStepCount ?? 0} runnable`,
    sourceLabel: run.sourceKind,
    ownerLabel,
    currentStepLabel: `${run.runningStepCount ?? 0} running / ${run.runnableStepCount ?? 0} runnable`,
    attention: stateGroup === "attention" ? formatStatus(run.status) : "",
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    runtimeRunId: run.runId,
    teamRunId: run.teamRunId,
    taskRunSpecId: run.taskRunSpecId,
    responseId: run.runId,
    operationId: "",
    agentIds,
    providerConversationRefs: providerRefs,
    providerLinks: buildRuntimeProviderLinks(run),
    controlActions: actionsByRunId[run.runId] ?? [],
    searchable: [
      run.runId,
      run.teamRunId,
      run.taskRunSpecId,
      run.sourceKind,
      run.status,
      ...serviceIds,
      ...runtimeProfileIds,
      ...agentIds,
      ...providerRefs.flatMap((ref) => [ref.provider, ref.conversationId, ref.runtimeProfileId]),
    ],
    raw: run,
  };
}

function buildCompletionRunRow(operation, actionsById = {}) {
  const stateGroup = groupCompletionState(operation.status);
  const title = `${serviceDisplay(operation.provider)} live follow`;
  const completeness = operation.mirrorCompleteness;
  const remaining = completeness?.remainingDetailSurfaces ?? completeness?.remainingConversationDetails ?? null;
  const summary =
    remaining !== null && remaining !== undefined
      ? `${operation.passCount ?? 0} passes; ${remaining} remaining`
      : `${operation.passCount ?? 0} passes; ${operation.phase ?? "unknown phase"}`;
  return {
    key: `live-follow:${operation.id}`,
    kind: "live-follow",
    kindLabel: "Live follow",
    statusLabel: formatStatus(operation.status),
    stateGroup,
    title,
    subtitle: operation.runtimeProfileId,
    summary,
    sourceLabel: operation.mode ?? "live_follow",
    ownerLabel: `${serviceDisplay(operation.provider)} / ${operation.runtimeProfileId}`,
    currentStepLabel: operation.phase ?? operation.sweepMode ?? "live follow",
    attention: operation.error?.message ?? (stateGroup === "attention" ? formatStatus(operation.status) : ""),
    createdAt: operation.startedAt,
    updatedAt: operation.completedAt ?? operation.nextAttemptAt ?? operation.startedAt,
    runtimeRunId: "",
    teamRunId: "",
    taskRunSpecId: "",
    responseId: "",
    operationId: operation.id,
    agentIds: [],
    providerConversationRefs: [],
    providerLinks: [
      {
        label: "Review provider account",
        href: `/console?view=providers&provider=${encodeURIComponent(`service-account:${operation.provider}:${operation.runtimeProfileId}`)}`,
      },
      {
        label: "Open Diagnostics",
        href: "/ops/browser",
      },
    ],
    controlActions: actionsById[operation.id] ?? [],
    searchable: [
      operation.id,
      operation.provider,
      operation.runtimeProfileId,
      operation.status,
      operation.phase,
      operation.mode,
      operation.error?.message,
    ],
    raw: operation,
  };
}

function agentsForRuntimeRun(run, agents) {
  const runtimeProfiles = new Set(run.runtimeProfileIds ?? []);
  const services = new Set(run.serviceIds ?? []);
  return agents
    .filter((agent) => {
      const agentRuntime = agent.runtimeProfileId ?? agent.runtimeProfile;
      const agentService = agent.service ?? agent.defaultService;
      return (agentRuntime && runtimeProfiles.has(agentRuntime)) || (agentService && services.has(agentService));
    })
    .slice(0, 4)
    .map((agent) => agent.id);
}

function buildRuntimeProviderLinks(run) {
  const refs = run.providerConversationSummary?.conversations ?? [];
  const links = [];
  for (const ref of refs.slice(0, 3)) {
    if (ref.accountMirrorPath) {
      links.push({
        label: `${serviceDisplay(ref.provider)} cached conversation`,
        href: ref.accountMirrorPath,
      });
    }
  }
  return links;
}

function filterRunRows(rows, query, kindFilter, stateFilter) {
  const normalized = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (kindFilter !== "all" && row.kind !== kindFilter) return false;
    if (stateFilter !== "all" && row.stateGroup !== stateFilter) return false;
    if (!normalized) return true;
    return [
      row.title,
      row.subtitle,
      row.kindLabel,
      row.statusLabel,
      row.ownerLabel,
      row.summary,
      row.attention,
      ...row.searchable,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized));
  });
}

function describeControlResult(result) {
  if (!result) return "Control accepted; readback refreshed.";
  if (result.kind === "account-mirror-completion") {
    return `${result.id} is now ${formatStatus(result.status)}.`;
  }
  if (result.kind === "background-drain") {
    return `Background drain ${result.action} accepted.`;
  }
  if (result.action === "drain-run") {
    return `${result.runId} drain ${result.status}: ${result.reason ?? "readback refreshed"}.`;
  }
  return `${result.kind ?? result.action ?? "Control"} accepted.`;
}

function summarizeControlReadback(payload, action) {
  if (action.action.startsWith("background-drain")) {
    const background = payload?.backgroundDrain ?? {};
    return `backgroundDrain.state=${background.state ?? "unknown"} paused=${String(background.paused === true)}`;
  }
  if (action.action.startsWith("completion.")) {
    const id = action.payload?.accountMirrorCompletion?.id;
    const operation = [...(payload?.accountMirrorCompletions?.active ?? []), ...(payload?.accountMirrorCompletions?.recent ?? [])]
      .find((item) => item.id === id);
    return operation ? `completion.status=${operation.status}` : "completion readback refreshed";
  }
  if (action.action === "runtime.drain") {
    const result = payload?.controlResult ?? {};
    return `controlResult.status=${result.status ?? "unknown"}`;
  }
  return "";
}

async function loadRunDetail(run) {
  if (run.kind === "live-follow") {
    return {
      completion: run.raw,
      errors: [],
    };
  }
  const errors = [];
  const [runtimeInspection, teamInspection, runStatus] = await Promise.all([
    fetchJson(`/v1/runtime-runs/inspect?runtimeRunId=${encodeURIComponent(run.runtimeRunId)}`).catch((error) => {
      errors.push(`Runtime inspection unavailable: ${error.message ?? error}`);
      return null;
    }),
    run.teamRunId
      ? fetchJson(`/v1/team-runs/inspect?teamRunId=${encodeURIComponent(run.teamRunId)}`).catch((error) => {
          errors.push(`Team inspection unavailable: ${error.message ?? error}`);
          return null;
        })
      : Promise.resolve(null),
    run.responseId
      ? fetchJson(`/v1/runs/${encodeURIComponent(run.responseId)}/status`).catch((error) => {
          errors.push(`Run status unavailable: ${error.message ?? error}`);
          return null;
        })
      : Promise.resolve(null),
  ]);
  return { runtimeInspection, teamInspection, runStatus, errors };
}

function groupRuntimeRunState(status) {
  if (status === "succeeded") return "completed";
  if (status === "failed") return "attention";
  if (status === "cancelled") return "cancelled";
  if (status === "running") return "active";
  if (status === "planned") return "waiting";
  return "waiting";
}

function groupCompletionState(status) {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "blocked") return "attention";
  if (status === "cancelled") return "cancelled";
  if (status === "running") return "active";
  if (status === "queued" || status === "idle_waiting" || status === "paused") return "waiting";
  return "waiting";
}

function formatStatus(status) {
  return String(status || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value) {
  if (!value) return "not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function truncateText(value, maxLength) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function buildOverviewData({
  status,
  agentMetrics,
  providerMetrics,
  projectMetrics,
  providerRows,
  projectRows,
  agents,
  validationByAgent,
}) {
  const serviceReady = status?.ok === true;
  const authProtected = status?.binding?.unauthenticated === false;
  const liveFollowSeverity = status?.liveFollow?.severity ?? status?.liveFollow?.summary?.severity ?? "";
  const liveFollowTargets = status?.liveFollow?.targets?.accounts ?? status?.liveFollow?.targets ?? [];
  const targetList = Array.isArray(liveFollowTargets) ? liveFollowTargets : [];
  const attentionTargets = targetList.filter((target) => target?.attentionNeeded === true);
  const activeTargets = targetList.filter((target) =>
    ["running", "queued", "idle_waiting", "paused"].includes(String(target?.actualStatus ?? target?.latestCompletionStatus ?? "")),
  );
  const scheduler = status?.accountMirrorScheduler ?? {};
  const schedulerPosture = scheduler.operatorStatus?.posture ?? scheduler.state ?? "unknown";
  const schedulerReason = scheduler.operatorStatus?.reason ?? scheduler.lastPass?.backpressure?.message ?? "";
  const background = status?.backgroundDrain ?? {};
  const runnerMetrics = status?.runnerTopology?.metrics ?? status?.runnerTopology ?? {};
  const invalidAgents = agents.filter((agent) => !validationByAgent.get(agent.id)?.valid);
  const providerAttentionRows = providerRows.filter((row) => row.readiness !== "ready");
  const projectAttentionRows = projectRows.filter((row) => row.readiness !== "ready");
  const serviceTone = serviceReady ? "ready" : "danger";
  const agentTone = agentMetrics.needsSetup === 0 ? "ready" : "warning";
  const providerTone = providerMetrics.attention > 0 ? "danger" : providerMetrics.needsSetup > 0 ? "warning" : "ready";
  const liveFollowTone =
    liveFollowSeverity === "attention-needed" || attentionTargets.length > 0
      ? "danger"
      : liveFollowSeverity === "backpressured" || schedulerPosture === "waiting"
        ? "warning"
        : "ready";
  const backgroundTone = background.paused ? "warning" : background.state === "running" ? "warning" : "ready";
  const attention = [];
  if (!serviceReady) {
    attention.push({
      key: "service",
      title: "Service status is unavailable",
      detail: "Refresh health or inspect the local API service.",
      action: "Open Diagnostics",
      href: "/ops/browser",
      tone: "danger",
    });
  }
  if (invalidAgents.length > 0) {
    attention.push({
      key: "agents",
      title: `${invalidAgents.length} agent${invalidAgents.length === 1 ? "" : "s"} need setup`,
      detail: "Review missing account, binding, project, or model-selector setup.",
      action: "Open Agents",
      view: "agents",
      tone: "warning",
    });
  }
  if (providerAttentionRows.length > 0) {
    attention.push({
      key: "providers",
      title: `${providerAttentionRows.length} provider account${providerAttentionRows.length === 1 ? "" : "s"} need attention`,
      detail: "Review account readiness and browser binding setup.",
      action: "Open Providers",
      view: "providers",
      tone: providerMetrics.attention > 0 ? "danger" : "warning",
    });
  }
  if (projectAttentionRows.length > 0) {
    attention.push({
      key: "projects",
      title: `${projectAttentionRows.length} project binding${projectAttentionRows.length === 1 ? "" : "s"} need setup`,
      detail: "Review missing defaults and linked agent project choices.",
      action: "Open Projects",
      view: "projects",
      tone: projectMetrics.attention > 0 ? "danger" : "warning",
    });
  }
  if (attentionTargets.length > 0 || liveFollowSeverity === "attention-needed") {
    attention.push({
      key: "live-follow",
      title: `${attentionTargets.length || "Live follow"} target${attentionTargets.length === 1 ? "" : "s"} need attention`,
      detail: status?.liveFollow?.line ?? "Review account mirror live-follow posture.",
      action: "Open Diagnostics",
      href: "/ops/browser",
      tone: "danger",
    });
  } else if (schedulerPosture === "waiting" || scheduler.lastPass?.backpressure) {
    attention.push({
      key: "scheduler",
      title: "Live follow is waiting",
      detail: schedulerReason || "Scheduler is delayed by current work or provider backpressure.",
      action: "Open Diagnostics",
      href: "/ops/browser",
      tone: "warning",
    });
  }
  return {
    service: {
      label: serviceReady ? "Online" : "Offline",
      detail: authProtected ? "Local API is reachable and API routes are protected." : "Local API is reachable in development mode.",
      tone: serviceTone,
      url: status?.routes?.localServiceBaseUrl ?? status?.routes?.externalServiceBaseUrl ?? "service URL unavailable",
    },
    agents: {
      total: agentMetrics.total,
      ready: agentMetrics.ready,
      tone: agentTone,
    },
    providers: {
      readyLabel: `${providerMetrics.ready}/${providerMetrics.total}`,
      tone: providerTone,
    },
    liveFollow: {
      label: liveFollowSeverity || schedulerPosture,
      tone: liveFollowTone,
    },
    scheduler: {
      label: schedulerPosture,
      tone: schedulerPosture === "waiting" ? "warning" : "ready",
    },
    background: {
      label: background.paused ? "paused" : background.state ?? "unknown",
      tone: backgroundTone,
    },
    runner: {
      label: `${runnerMetrics.activeRunnerCount ?? 0} active`,
      tone: (runnerMetrics.activeRunnerCount ?? 0) > 0 ? "ready" : "warning",
    },
    attention,
    healthCards: [
      {
        key: "agents",
        title: "Agents",
        detail: `${agentMetrics.ready} ready, ${agentMetrics.needsSetup} need setup`,
        tone: agentTone,
        view: "agents",
      },
      {
        key: "providers",
        title: "Provider accounts",
        detail: `${providerMetrics.ready} ready, ${providerMetrics.needsSetup + providerMetrics.attention} need review`,
        tone: providerTone,
        view: "providers",
      },
      {
        key: "projects",
        title: "Projects",
        detail: `${projectMetrics.ready} ready, ${projectMetrics.needsSetup + projectMetrics.attention} need review`,
        tone: projectMetrics.attention > 0 ? "danger" : projectMetrics.needsSetup > 0 ? "warning" : "ready",
        view: "projects",
      },
      {
        key: "live-follow",
        title: "Live follow",
        detail: `${activeTargets.length} active target${activeTargets.length === 1 ? "" : "s"}; ${schedulerPosture}`,
        tone: liveFollowTone,
        view: "overview",
      },
    ],
  };
}

function providerAccountLabel(tenant) {
  const identity = tenant.identity?.email ?? tenant.identity?.handle ?? tenant.identity?.accountId ?? tenant.identity?.name;
  return identity ? `${serviceDisplay(tenant.service)} / ${identity}` : `${serviceDisplay(tenant.service)} provider account`;
}

function bindingLabel(binding) {
  if (!binding) return "No browser binding";
  return `${binding.runtimeProfileId || "default"} / ${binding.browserProfileId || "unbound browser"}`;
}

function providerAccountShort(tenantKey, bindingKey) {
  if (tenantKey) return tenantKey.replace(/^service-account:/, "");
  if (bindingKey) return bindingKey.replace(/^binding:/, "");
  return "No provider account";
}

function serviceDisplay(service) {
  if (service === "chatgpt") return "ChatGPT";
  if (service === "gemini") return "Gemini";
  if (service === "grok") return "Grok";
  return service || "Unknown";
}

export default App;
