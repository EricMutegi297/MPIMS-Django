import React, { useEffect, useMemo, useState } from "react";
import useAutoDismiss from "../hooks/useAutoDismiss";
import { incidentService, morningBriefService } from "../services/api";
import ActionModal from "./common/ActionModal";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatError(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (Array.isArray(data)) return data.join(", ");
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join(" | ");
  }
  return fallback;
}

const STATUS_STYLE = {
  reported: "bg-red-500/20 text-red-400",
  under_investigation: "bg-yellow-500/20 text-yellow-400",
  resolved: "bg-blue-500/20 text-blue-400",
  closed: "bg-green-500/20 text-green-400",
};

const SEVERITY_STYLE = {
  low: "bg-green-500/20 text-green-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  high: "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
};

const ALL_STATUSES = ["reported", "under_investigation", "resolved", "closed"];
const ALL_SEVERITIES = ["critical", "high", "medium", "low"];

function Badge({ label, style }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium capitalize ${style}`}>
      {label?.replace(/_/g, " ")}
    </span>
  );
}

export default function Incidents({ user }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIncidents, setSelectedIncidents] = useState([]);
  const [briefDate, setBriefDate] = useState(todayIso());
  const [remarks, setRemarks] = useState("");
  const [compileOpen, setCompileOpen] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compilerStatus, setCompilerStatus] = useState({ can_compile: false, post: null, message: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useAutoDismiss(notice, setNotice);
  useAutoDismiss(error, setError);

  const canCompileMorningBrief = Boolean(compilerStatus?.can_compile);

  function loadData() {
    setLoading(true);
    morningBriefService
      .compilerStatus()
      .then((statusRes) => {
        const status = statusRes.data || {};
        setCompilerStatus(status);
        const params = status.can_compile
          ? { page_size: 200, requires_investigation: true, pending_morning_brief: true }
          : { page_size: 200 };
        return incidentService.list(params);
      })
      .then((res) => {
        const items = toArray(res.data);
        setIncidents(items);
        setSelectedIncidents((prev) => prev.filter((id) => items.some((incident) => incident.id === id)));
      })
      .catch((err) => setError(formatError(err, "Failed to load incidents.")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => incidents.filter((incident) => {
    const matchStatus = statusFilter === "all" || incident.status === statusFilter;
    const matchSeverity = severityFilter === "all" || incident.severity === severityFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (incident.incident_number || "").toLowerCase().includes(q) ||
      (incident.incident_type || "").toLowerCase().includes(q) ||
      (incident.location || "").toLowerCase().includes(q) ||
      (incident.description || "").toLowerCase().includes(q) ||
      (incident.source_ob_number || "").toLowerCase().includes(q);
    return matchStatus && matchSeverity && matchSearch;
  }), [incidents, search, severityFilter, statusFilter]);

  const selectedIncidentRows = useMemo(
    () => incidents.filter((incident) => selectedIncidents.includes(incident.id)),
    [incidents, selectedIncidents]
  );

  const selectableIds = useMemo(() => filtered.map((incident) => incident.id), [filtered]);
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIncidents.includes(id));
  const statusCounts = ALL_STATUSES.reduce((acc, status) => ({ ...acc, [status]: incidents.filter((incident) => incident.status === status).length }), {});
  const severityCounts = ALL_SEVERITIES.reduce((acc, severity) => ({ ...acc, [severity]: incidents.filter((incident) => incident.severity === severity).length }), {});

  function toggleIncident(id) {
    setSelectedIncidents((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }

  function toggleAllFiltered() {
    setSelectedIncidents((prev) => {
      if (allFilteredSelected) {
        return prev.filter((id) => !selectableIds.includes(id));
      }
      return [...new Set([...prev, ...selectableIds])];
    });
  }

  function openCompileModal() {
    if (selectedIncidents.length === 0) {
      setError("Select at least one investigation-required incident to compile.");
      return;
    }
    setCompileOpen(true);
    setError("");
  }

  async function confirmCompileMorningBrief() {
    if (selectedIncidents.length === 0) return;
    setCompiling(true);
    try {
      await morningBriefService.compileFromIncidents({
        date: briefDate,
        incident_ids: selectedIncidents,
        remarks,
      });
      setSelectedIncidents([]);
      setRemarks("");
      setCompileOpen(false);
      setNotice("Morning brief compiled from selected incidents.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to compile morning brief."));
    } finally {
      setCompiling(false);
    }
  }

  return (
    <div className="min-h-screen space-y-5 bg-gray-900 p-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Incidents</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          {canCompileMorningBrief
            ? `${incidents.length} investigation-required incident${incidents.length !== 1 ? "s" : ""} pending morning brief`
            : `${incidents.length} total incident${incidents.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || notice}
        </div>
      )}

      {!canCompileMorningBrief && compilerStatus?.message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Morning brief compilation restricted</p>
          <p className="mt-1">{compilerStatus.message}</p>
        </div>
      )}

      {canCompileMorningBrief && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Morning Brief Compilation</h3>
              <p className="mt-1 text-sm text-slate-600">
                Select incidents that require investigation, then compile them into the daily morning brief.
              </p>
              {compilerStatus?.post && (
                <p className="mt-1 text-xs text-slate-500">
                  Duty Officer assignment: <strong>{compilerStatus.post.roster}</strong>, {compilerStatus.post.unit_label}, {formatDateTime(compilerStatus.post.starts_at)} to {formatDateTime(compilerStatus.post.ends_at)}.
                  {!compilerStatus.post.is_current && compilerStatus.post.compile_window_ends_at
                    ? ` Handover compile window ends ${formatDateTime(compilerStatus.post.compile_window_ends_at)}.`
                    : ""}
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(220px,1fr)_auto]">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Brief Date
                <input
                  type="date"
                  value={briefDate}
                  onChange={(event) => setBriefDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Remarks
                <input
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Optional remarks"
                />
              </label>
              <button
                type="button"
                onClick={openCompileModal}
                disabled={selectedIncidents.length === 0}
                className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Compile Selected ({selectedIncidents.length})
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <span className="mr-1 self-center text-xs text-gray-500">Status:</span>
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
        >
          All ({incidents.length})
        </button>
        {ALL_STATUSES.map((status) =>
          statusCounts[status] > 0 ? (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${statusFilter === status ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              {status.replace(/_/g, " ")} ({statusCounts[status]})
            </button>
          ) : null
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="mr-1 self-center text-xs text-gray-500">Severity:</span>
        <button
          onClick={() => setSeverityFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${severityFilter === "all" ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
        >
          All
        </button>
        {ALL_SEVERITIES.map((severity) =>
          severityCounts[severity] > 0 ? (
            <button
              key={severity}
              onClick={() => setSeverityFilter(severity)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${severityFilter === severity ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              {severity} ({severityCounts[severity]})
            </button>
          ) : null
        )}
      </div>

      <input
        type="text"
        placeholder="Search by incident #, incident, OB source, place..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none md:w-96"
      />

      <div className="overflow-hidden rounded-xl bg-gray-800">
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-8 animate-pulse rounded bg-gray-700" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">
            {canCompileMorningBrief ? "No investigation-required incidents pending morning brief." : "No incidents found."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-xs uppercase tracking-wider text-gray-500">
                  {canCompileMorningBrief && (
                    <th className="px-5 py-3 text-left font-medium">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                        aria-label="Select all visible incidents"
                      />
                    </th>
                  )}
                  <th className="px-5 py-3 text-left font-medium">Incident #</th>
                  <th className="px-5 py-3 text-left font-medium">Incident</th>
                  <th className="hidden px-5 py-3 text-left font-medium md:table-cell">Place</th>
                  <th className="hidden px-5 py-3 text-left font-medium md:table-cell">Severity</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="hidden px-5 py-3 text-left font-medium xl:table-cell">OB Source</th>
                  <th className="hidden px-5 py-3 text-left font-medium lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((incident) => (
                  <tr key={incident.id} className="border-b border-gray-700/40 transition-colors hover:bg-gray-700/30">
                    {canCompileMorningBrief && (
                      <td className="px-5 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIncidents.includes(incident.id)}
                          onChange={() => toggleIncident(incident.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          aria-label={`Select ${incident.incident_number || "incident"}`}
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-gray-400">
                      {incident.incident_number || "--"}
                      {canCompileMorningBrief && incident.requires_investigation && (
                        <span className="mt-1 block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          Requires investigation
                        </span>
                      )}
                    </td>
                    <td className="max-w-[220px] px-5 py-3 text-gray-200">
                      <p className="truncate">{incident.incident_type || "--"}</p>
                      {incident.is_belated && (
                        <span className="text-[10px] font-medium text-orange-400">Belated</span>
                      )}
                    </td>
                    <td className="hidden max-w-[160px] truncate px-5 py-3 text-xs text-gray-400 md:table-cell">
                      {incident.location || "--"}
                    </td>
                    <td className="hidden px-5 py-3 md:table-cell">
                      <Badge label={incident.severity} style={SEVERITY_STYLE[incident.severity] || "bg-gray-600 text-gray-300"} />
                    </td>
                    <td className="px-5 py-3">
                      <Badge label={incident.status} style={STATUS_STYLE[incident.status] || "bg-gray-600 text-gray-300"} />
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-xs text-blue-300 xl:table-cell">
                      {incident.source_ob_number || "--"}
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-xs text-gray-500 lg:table-cell">
                      {formatDateTime(incident.date_occurred)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {compileOpen && (
        <ActionModal
          eyebrow="Morning Brief"
          title="Compile Selected Incidents?"
          message="Selected investigation-required incidents will be added to the morning brief for HQ review."
          tone="blue"
          confirmLabel="Compile Morning Brief"
          savingLabel="Compiling..."
          saving={compiling}
          onCancel={() => setCompileOpen(false)}
          onConfirm={confirmCompileMorningBrief}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brief Date</p>
                <p className="mt-1 font-medium text-slate-900">{briefDate}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Incidents</p>
                <p className="mt-1 font-medium text-slate-900">{selectedIncidentRows.length}</p>
              </div>
            </div>
            <div className="mt-4 max-h-44 space-y-2 overflow-y-auto">
              {selectedIncidentRows.map((incident) => (
                <div key={incident.id} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                  <p className="font-semibold text-slate-950">{incident.incident_number || "Incident"}</p>
                  <p className="text-xs text-slate-600">{incident.incident_type || "--"} - OB {incident.source_ob_number || "--"}</p>
                </div>
              ))}
            </div>
            {remarks && <p className="mt-3 text-slate-700">Remarks: {remarks}</p>}
          </div>
        </ActionModal>
      )}
    </div>
  );
}
