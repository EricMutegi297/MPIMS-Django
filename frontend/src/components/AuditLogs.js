import React, { useCallback, useEffect, useMemo, useState } from "react";
import { auditService } from "../services/api";

const ACTIONS = [
  ["", "All actions"],
  ["login", "Login"],
  ["login_failed", "Login Failed"],
  ["logout", "Logout"],
  ["view", "View"],
  ["create", "Create"],
  ["update", "Update"],
  ["delete", "Delete"],
  ["action", "Action"],
  ["error", "Error"],
];

const MODULES = [
  ["", "All modules"],
  ["auth", "Auth"],
  ["cases", "Cases"],
  ["incidents", "Incidents"],
  ["dutyrooms", "Duty Rooms"],
  ["guardrooms", "Guardrooms"],
  ["morning_briefs", "Morning Briefs"],
  ["formations", "Formations"],
  ["offences", "Offences"],
  ["notifications", "Notifications"],
  ["audit", "Audit"],
  ["admin", "Admin"],
];

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function titleCase(value) {
  return String(value || "--")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportRows(rows) {
  const header = [
    "Time",
    "Service No",
    "Rank",
    "User",
    "Role",
    "Battalion",
    "Company",
    "Action",
    "Module",
    "Method",
    "Path",
    "Status",
    "IP",
    "Description",
  ];
  const body = rows.map((row) => [
    formatDateTime(row.created_at),
    row.service_number,
    row.user_rank,
    row.user_name,
    row.user_role,
    row.battalion_name,
    row.detachment_name,
    row.action_display || titleCase(row.action),
    row.module,
    row.method,
    row.path,
    row.status_code,
    row.ip_address,
    row.description,
  ]);
  const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-rose-100 text-rose-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

function actionTone(action) {
  if (["delete", "login_failed", "error"].includes(action)) return "red";
  if (["create", "login"].includes(action)) return "green";
  if (action === "update") return "amber";
  if (action === "view") return "blue";
  return "slate";
}

export default function AuditLogs({ user }) {
  const [logs, setLogs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    action: "",
    module: "",
    date_from: "",
    date_to: "",
  });

  const params = useMemo(() => ({
    page,
    page_size: 50,
    search: filters.search || undefined,
    action: filters.action || undefined,
    module: filters.module || undefined,
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    ordering: "-created_at",
  }), [filters, page]);

  const loadLogs = useCallback(() => {
    if (!user?.is_superuser) return;
    setLoading(true);
    setError("");
    auditService.list(params)
      .then((res) => {
        setLogs(toArray(res.data));
        setCount(Number(res.data?.count ?? toArray(res.data).length ?? 0));
      })
      .catch((err) => {
        const detail = err?.response?.data?.detail;
        setError(detail || "Failed to load audit logs.");
      })
      .finally(() => setLoading(false));
  }, [params, user?.is_superuser]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  if (!user?.is_superuser) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 text-center text-sm text-slate-600">
        Audit logs are only available to superusers.
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(count / 50));

  return (
    <div className="min-h-screen space-y-5 bg-slate-100 p-4 text-slate-900 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">System Logs</h2>
          <p className="text-sm text-slate-600">Audit trail of system activity.</p>
        </div>
        <button
          type="button"
          onClick={() => exportRows(logs)}
          disabled={!logs.length}
          className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1.6fr,0.8fr,0.9fr,0.8fr,0.8fr,auto] md:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              value={filters.search}
              onChange={(event) => { setPage(1); setFilters({ ...filters, search: event.target.value }); }}
              placeholder="Service no, name, battalion, company, action..."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action</span>
            <select
              value={filters.action}
              onChange={(event) => { setPage(1); setFilters({ ...filters, action: event.target.value }); }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {ACTIONS.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Module</span>
            <select
              value={filters.module}
              onChange={(event) => { setPage(1); setFilters({ ...filters, module: event.target.value }); }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {MODULES.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date From</span>
            <input
              type="date"
              value={filters.date_from}
              onChange={(event) => { setPage(1); setFilters({ ...filters, date_from: event.target.value }); }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date To</span>
            <input
              type="date"
              value={filters.date_to}
              onChange={(event) => { setPage(1); setFilters({ ...filters, date_to: event.target.value }); }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => { setPage(1); setFilters({ search: "", action: "", module: "", date_from: "", date_to: "" }); }}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </section>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">{count.toLocaleString()} log entries</p>
          <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Time</th>
                <th className="px-4 py-3 text-left font-semibold">Who</th>
                <th className="px-4 py-3 text-left font-semibold">Battalion / Company</th>
                <th className="px-4 py-3 text-left font-semibold">Did What</th>
                <th className="px-4 py-3 text-left font-semibold">Module</th>
                <th className="px-4 py-3 text-left font-semibold">Result</th>
                <th className="px-4 py-3 text-left font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No audit logs found.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{[log.user_rank, log.user_name].filter(Boolean).join(" ") || "Anonymous"}</p>
                    <p className="text-xs text-slate-500">{log.service_number || "--"} - {titleCase(log.user_role)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{log.battalion_name || "--"}</p>
                    <p className="text-xs text-slate-500">{log.detachment_name || "--"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={actionTone(log.action)}>{log.action_display || titleCase(log.action)}</Badge>
                    <p className="mt-1 max-w-xl text-xs text-slate-600">{log.description || log.path}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{titleCase(log.module)}</p>
                    <p className="text-xs text-slate-500">{log.method} {log.path}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={log.success ? "green" : "red"}>{log.status_code || "--"}</Badge>
                    <p className="mt-1 text-xs text-slate-500">{log.duration_ms ?? 0} ms</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{log.ip_address || "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
