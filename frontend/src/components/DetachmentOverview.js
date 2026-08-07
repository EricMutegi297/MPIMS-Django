import React, { useEffect, useState, useCallback, useRef } from "react";
import api from "../axiosConfig";
import { caseService } from "../services/api";

/* ─────────────────────── constants ────────────────────────────── */

const STATUS_PILL = {
  tasked:              "bg-yellow-500/20 text-yellow-300",
  under_investigation: "bg-indigo-500/20 text-indigo-300",
  pending:             "bg-orange-500/20  text-orange-300",
  closed:              "bg-green-500/20   text-green-300",
};

const STATUS_STYLE = {
  new:                 "bg-gray-500/20   text-gray-300",
  open:                "bg-blue-500/20   text-blue-400",
  tasked:              "bg-yellow-500/20 text-yellow-400",
  under_investigation: "bg-indigo-500/20 text-indigo-400",
  pending:             "bg-orange-500/20 text-orange-400",
  served:              "bg-purple-500/20 text-purple-400",
  closed:              "bg-green-500/20  text-green-400",
  referred:            "bg-cyan-500/20   text-cyan-400",
};

const DRILLDOWN_STATUSES = [
  { value: "all",                 label: "All Statuses" },
  { value: "new",                 label: "New" },
  { value: "open",                label: "Open" },
  { value: "tasked",              label: "Tasked" },
  { value: "under_investigation", label: "Under Investigation" },
  { value: "pending",             label: "Pending" },
  { value: "served",              label: "Served" },
  { value: "closed",              label: "Closed" },
  { value: "referred",            label: "Referred" },
];

/* ─────────────────────── small helpers ────────────────────────── */

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function ClickPill({ value, style, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-70 cursor-pointer ${style}`}
    >
      {value ?? 0}
    </button>
  );
}

function Badge({ label }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
        STATUS_STYLE[label] || "bg-gray-600 text-gray-300"
      }`}
    >
      {label?.replace(/_/g, " ")}
    </span>
  );
}

function SkeletonRow({ cols = 7 }) {
  return (
    <tr className="border-b border-gray-700/40">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3">
          <div className="h-4 bg-gray-700 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

/* ─────────────────────── Drilldown slide-in panel ─────────────── */

function DrilldownPanel({ drill, onClose }) {
  const [cases, setCases]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatus] = useState(drill.status);
  const [search, setSearch]       = useState("");
  const panelRef                  = useRef(null);

  /* fetch cases whenever detachment or status filter changes */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { tasked_detachment: drill.detId, page_size: 200 };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await caseService.list(params);
      setCases(toArray(res.data));
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [drill.detId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  /* close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* client-side search */
  const filtered = cases.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.case_number || "").toLowerCase().includes(q) ||
      (c.title || "").toLowerCase().includes(q) ||
      (c.accused_name || "").toLowerCase().includes(q) ||
      (c.accused_service_number || "").toLowerCase().includes(q)
    );
  });

  /* print  -  opens formatted page in new window */
  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const statusLabel =
      DRILLDOWN_STATUSES.find((s) => s.value === statusFilter)?.label || statusFilter;

    const rows = filtered
      .map(
        (c) => `<tr>
          <td>${c.case_number || "--"}</td>
          <td>${c.title || c.offence || c.offence_name || "--"}</td>
          <td>${c.accused_name || "--"}</td>
          <td>${(c.status || "").replace(/_/g, " ")}</td>
          <td>${c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB") : "--"}</td>
        </tr>`
      )
      .join("");

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Cases \u2013 ${drill.detName} (${statusLabel})</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}
    h2{margin:0 0 2px;font-size:16px}
    p{margin:0 0 12px;color:#555;font-size:11px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#f0f0f0;font-weight:600;font-size:11px;text-transform:uppercase}
    tr:nth-child(even) td{background:#fafafa}
  </style>
</head>
<body>
  <h2>Cases \u2014 ${drill.detName} (Coy ${drill.company})</h2>
  <p>Filter: ${statusLabel} &nbsp;|&nbsp; ${filtered.length} case${filtered.length !== 1 ? "s" : ""}
     &nbsp;|&nbsp; Printed: ${new Date().toLocaleString("en-GB")}</p>
  <table>
    <thead>
      <tr><th>#</th><th>Title / Offence</th><th>Accused</th><th>Status</th><th>Date</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=function(){window.print();}<\/script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 left-56 z-50 flex justify-end">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* panel */}
      <div
        ref={panelRef}
        className="relative z-10 w-full bg-gray-900 shadow-2xl flex flex-col h-full overflow-hidden"
      >
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h3 className="text-base font-bold text-white">
              {drill.detName}
              <span className="ml-2 text-xs font-normal text-gray-400">
                Coy {drill.company}
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading
                ? "Loading cases..."
                : `${filtered.length} case${filtered.length !== 1 ? "s" : ""} shown`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              title="Print / Export to new window"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs transition-colors"
            >
              <PrintIcon className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-700/60 shrink-0 flex-wrap">
          {/* search */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <MagnifyIcon className="w-3.5 h-3.5 text-gray-500" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search case #, title, accused..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-8 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-300"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {DRILLDOWN_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* refresh */}
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* case table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <table className="w-full text-sm">
              <CaseTableHead />
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <SkeletonRow key={i} cols={5} />
                ))}
              </tbody>
            </table>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-gray-500">
              <MagnifyIcon className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No cases found.</p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-2 text-xs text-blue-400 hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <CaseTableHead />
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-5 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {c.case_number || "--"}
                    </td>
                    <td className="px-5 py-2.5 text-gray-200 max-w-[220px]">
                      <p className="truncate">{c.title || c.offence || c.offence_name || "--"}</p>
                    </td>
                    <td className="px-5 py-2.5 text-gray-300 whitespace-nowrap">
                      {c.accused_name || "--"}
                      {c.accused_rank && (
                        <span className="ml-1 text-[11px] text-gray-500">
                          ({c.accused_rank})
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge label={c.status} />
                    </td>
                    <td className="px-5 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {c.created_at
                        ? new Date(c.created_at).toLocaleDateString("en-GB")
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function CaseTableHead() {
  return (
    <thead className="sticky top-0 bg-gray-900 z-10">
      <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
        <th className="text-left px-5 py-3 font-medium">Case #</th>
        <th className="text-left px-5 py-3 font-medium">Title / Offence</th>
        <th className="text-left px-5 py-3 font-medium">Accused</th>
        <th className="text-left px-5 py-3 font-medium">Status</th>
        <th className="text-left px-5 py-3 font-medium">Date</th>
      </tr>
    </thead>
  );
}

/* ─────────────────────── main export ──────────────────────────── */

export default function DetachmentOverview({ user }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [drill, setDrill]     = useState(null); // { detId, detName, company, status }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/cases/detachment-summary/");
      setData(res.data);
    } catch (e) {
      setError(
        e?.response?.data?.detail ||
        "Failed to load detachment summary. Check your permissions."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const detachments = data?.detachments ?? [];
  const totalTasked   = detachments.reduce((s, d) => s + (d.tasked || 0), 0);
  const totalUnderInv = detachments.reduce((s, d) => s + (d.under_investigation || 0), 0);
  const totalPending  = detachments.reduce((s, d) => s + (d.pending || 0), 0);
  const totalClosed   = detachments.reduce((s, d) => s + (d.closed || 0), 0);
  const grandTotal    = detachments.reduce((s, d) => s + (d.total || 0), 0);

  const openDrill = (det, status) =>
    setDrill({ detId: det.id, detName: det.name, company: det.company, status });

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">COY Overview</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Click any count or company name to drill into the cases
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary cards */}
      {!loading && !error && detachments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard
            label="Companies"
            value={detachments.length}
            accent="bg-blue-500/10"
            textColor="text-blue-400"
            icon={BuildingIcon}
          />
          <SummaryCard
            label="Tasked"
            value={totalTasked}
            accent="bg-yellow-500/10"
            textColor="text-yellow-400"
            icon={TaskedIcon}
          />
          <SummaryCard
            label="Under Investigation"
            value={totalUnderInv}
            accent="bg-indigo-500/10"
            textColor="text-indigo-400"
            icon={MagnifyIcon}
          />
          <SummaryCard
            label="Pending"
            value={totalPending}
            accent="bg-orange-500/10"
            textColor="text-orange-400"
            icon={ClockIcon}
          />
          <SummaryCard
            label="Closed"
            value={totalClosed}
            accent="bg-green-500/10"
            textColor="text-green-400"
            icon={CheckIcon}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-5 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Summary table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            COY Case Summary
          </h3>
          {!loading && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-700 text-gray-400">
              {detachments.length} compan{detachments.length !== 1 ? "ies" : "y"}
            </span>
          )}
        </div>

        {loading ? (
          <table className="w-full text-sm">
            <SummaryTableHead />
            <tbody>
              {[1, 2, 3, 4].map((i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        ) : !error && detachments.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm text-center">
            No companies found under your battalion.
          </p>
        ) : !error ? (
          <table className="w-full text-sm">
            <SummaryTableHead />
            <tbody>
              {detachments.map((det) => (
                <tr
                  key={det.id}
                  className="border-b border-gray-700/40 hover:bg-gray-700/20 transition-colors"
                >
                  {/* name -> all cases */}
                  <td className="px-5 py-3">
                    <button
                      onClick={() => openDrill(det, "all")}
                      className="text-gray-200 font-medium hover:text-blue-400 transition-colors text-left"
                    >
                      {det.name}
                    </button>
                  </td>

                  {/* company badge */}
                  <td className="px-5 py-3 text-gray-400 text-center">
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">
                      Coy {det.company}
                    </span>
                  </td>

                  {/* under investigation */}
                  <td className="px-5 py-3 text-center">
                    <ClickPill
                      value={det.tasked}
                      style={STATUS_PILL.tasked}
                      title={`${det.tasked} tasked  -  click to view`}
                      onClick={() => openDrill(det, "tasked")}
                    />
                  </td>

                  {/* under investigation */}
                  <td className="px-5 py-3 text-center">
                    <ClickPill
                      value={det.under_investigation}
                      style={STATUS_PILL.under_investigation}
                      title={`${det.under_investigation} under investigation  -  click to view`}
                      onClick={() => openDrill(det, "under_investigation")}
                    />
                  </td>

                  {/* pending */}
                  <td className="px-5 py-3 text-center">
                    <ClickPill
                      value={det.pending}
                      style={STATUS_PILL.pending}
                      title={`${det.pending} pending  -  click to view`}
                      onClick={() => openDrill(det, "pending")}
                    />
                  </td>

                  {/* closed */}
                  <td className="px-5 py-3 text-center">
                    <ClickPill
                      value={det.closed}
                      style={STATUS_PILL.closed}
                      title={`${det.closed} closed  -  click to view`}
                      onClick={() => openDrill(det, "closed")}
                    />
                  </td>

                  {/* total -> all */}
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => openDrill(det, "all")}
                      className="text-white font-semibold hover:text-blue-400 transition-colors"
                      title="View all cases for this company"
                    >
                      {det.total ?? 0}
                    </button>
                  </td>
                </tr>
              ))}

              {/* totals footer */}
              <tr className="border-t-2 border-gray-600 bg-gray-700/40">
                <td
                  className="px-5 py-3 text-gray-400 font-semibold text-xs uppercase tracking-wider"
                  colSpan={2}
                >
                  Total
                </td>
                <td className="px-5 py-3 text-center">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_PILL.tasked}`}>
                    {totalTasked}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_PILL.under_investigation}`}>
                    {totalUnderInv}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_PILL.pending}`}>
                    {totalPending}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_PILL.closed}`}>
                    {totalClosed}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className="text-white font-bold">{grandTotal}</span>
                </td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>

      {!loading && !error && detachments.length > 0 && (
        <p className="text-xs text-gray-600 text-center">
          Click any count or company name to drill down. Use the Print button inside the panel to export.
        </p>
      )}

      {/* Drilldown panel */}
      {drill && (
        <DrilldownPanel drill={drill} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

/* ─────────────────────── sub-components ───────────────────────── */

function SummaryTableHead() {
  return (
    <thead>
      <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
        <th className="text-left   px-5 py-3 font-medium">Detachment</th>
        <th className="text-center px-5 py-3 font-medium">Company</th>
        <th className="text-center px-5 py-3 font-medium">Tasked</th>
        <th className="text-center px-5 py-3 font-medium">Under Investigation</th>
        <th className="text-center px-5 py-3 font-medium">Pending</th>
        <th className="text-center px-5 py-3 font-medium">Closed</th>
        <th className="text-center px-5 py-3 font-medium">Total Cases</th>
      </tr>
    </thead>
  );
}

function SummaryCard({ label, value, accent, textColor, icon: Icon }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${accent} shrink-0`}>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${textColor}`}>{value}</p>
      </div>
    </div>
  );
}

/* ─────────────────────── icons ─────────────────────────────────── */

function BuildingIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function MagnifyIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function ClockIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TaskedIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PrintIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
  );
}

function RefreshIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
