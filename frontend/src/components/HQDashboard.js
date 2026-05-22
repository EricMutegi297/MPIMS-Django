import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { caseService, guardroomService, incidentService } from "../services/api";
import NotificationBell from "./NotificationBell";

// ── Helpers ──────────────────────────────────────────────────────────────────
function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

const PAGE_SIZE = 25;

const STATUS_STYLE = {
  new:                 "bg-gray-500/20 text-gray-300",
  open:                "bg-blue-500/20 text-blue-400",
  tasked:              "bg-yellow-500/20 text-yellow-400",
  under_investigation: "bg-indigo-500/20 text-indigo-400",
  pending:             "bg-orange-500/20 text-orange-400",
  served:              "bg-purple-500/20 text-purple-400",
  closed:              "bg-green-500/20 text-green-400",
  referred:            "bg-cyan-500/20 text-cyan-400",
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, accent, loading, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`bg-gray-800 rounded-xl p-4 flex items-start gap-4 w-full text-left ${
        onClick ? "cursor-pointer hover:bg-gray-700 transition-colors" : ""
      }`}
    >
      <div className={`p-2.5 rounded-lg ${accent} shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        {loading ? (
          <div className="h-7 w-12 bg-gray-700 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold text-white mt-0.5">{value ?? 0}</p>
        )}
      </div>
    </Tag>
  );
}

function Badge({ label, style }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${style}`}>
      {label?.replace(/_/g, " ")}
    </span>
  );
}

function Footer() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(2);
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return (
    <footer className="mt-8 border-t border-gray-700/60 py-3 px-1 flex items-center justify-between text-[11px] text-gray-600 select-none">
      <span className="font-semibold tracking-widest uppercase text-gray-500">MPIMS</span>
      <span className="font-mono">
        {yy}{mm}{dd}&nbsp;&nbsp;{hh}{min}{ss}
      </span>
    </footer>
  );
}

function PaginationBar({ page, totalPages, totalCount, onChange }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalCount);

  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1 text-xs text-gray-500">
      <span>Showing {start}–{end} of {totalCount} cases</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="px-1">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-7 h-7 rounded transition-colors ${
                p === page
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-400"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── HQDashboard ───────────────────────────────────────────────────────────────
export default function HQDashboard({ user }) {
  const navigate = useNavigate();

  const [cases, setCases]             = useState([]);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [loadingCases, setLoadingCases]   = useState(true);
  const [page, setPage]               = useState(1);
  const [totalCount, setTotalCount]   = useState(0);
  const [statusCounts, setStatusCounts] = useState({
    total: 0, new: 0, newOpen: 0, tasked: 0,
    under_investigation: 0, pending: 0, served: 0, closed: 0, referred: 0,
  });
  const [totalInc, setTotalInc] = useState(0);
  const [openInc, setOpenInc]   = useState(0);
  const [totalGuardrooms, setTotalGuardrooms] = useState(0);
  const [activeFilter, setActiveFilter] = useState("all");
  const [expandedDesc, setExpandedDesc] = useState({});

  // ── fetch per-status counts (once, tiny requests) ──────────────────────────
  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const [
        allRes, newRes, openRes, taskedRes,
        uiRes, peRes, seRes, clRes, rfRes,
        incRes, incOpenRes, guardroomRes,
      ] = await Promise.all([
        caseService.list({ page_size: 1 }),
        caseService.list({ page_size: 1, status: "new" }),
        caseService.list({ page_size: 1, status: "open" }),
        caseService.list({ page_size: 1, status: "tasked" }),
        caseService.list({ page_size: 1, status: "under_investigation" }),
        caseService.list({ page_size: 1, status: "pending" }),
        caseService.list({ page_size: 1, status: "served" }),
        caseService.list({ page_size: 1, status: "closed" }),
        caseService.list({ page_size: 1, status: "referred" }),
        incidentService.list({ page_size: 1 }),
        incidentService.list({ page_size: 1, status: "reported" }),
        guardroomService.list(),
      ]);
      setStatusCounts({
        total:               allRes.data.count    || 0,
        new:                 newRes.data.count    || 0,
        newOpen:             (newRes.data.count   || 0) + (openRes.data.count || 0),
        tasked:              taskedRes.data.count || 0,
        under_investigation: uiRes.data.count     || 0,
        pending:             peRes.data.count     || 0,
        served:              seRes.data.count     || 0,
        closed:              clRes.data.count     || 0,
        referred:            rfRes.data.count     || 0,
      });
      setTotalInc(incRes.data.count    || 0);
      setOpenInc(incOpenRes.data.count || 0);
      setTotalGuardrooms(toArray(guardroomRes.data).length);
    } catch (_) {}
    finally { setLoadingCounts(false); }
  }, []);

  // ── fetch paginated cases for the table ────────────────────────────────────
  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (activeFilter !== "all") params.status = activeFilter;
      const res = await caseService.list(params);
      setCases(toArray(res.data));
      setTotalCount(res.data.count || 0);
    } catch (_) {}
    finally { setLoadingCases(false); }
  }, [page, activeFilter]);

  useEffect(() => { loadCounts(); }, [loadCounts]);
  useEffect(() => { loadCases();  }, [loadCases]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = user?.name?.split(" ")[0] || "Officer";

  const FILTERS = [
    { key: "all",                 label: "All",              style: "bg-gray-600 text-gray-200"   },
    { key: "new",                 label: "New",              style: "bg-gray-500/20 text-gray-300"},
    { key: "tasked",              label: "Tasked",           style: "bg-yellow-500/20 text-yellow-300"},
    { key: "under_investigation", label: "Under Invest.",    style: "bg-indigo-500/20 text-indigo-300"},
    { key: "pending",             label: "Pending",          style: "bg-orange-500/20 text-orange-300"},
    { key: "served",              label: "Served",           style: "bg-purple-500/20 text-purple-300"},
    { key: "closed",              label: "Closed",           style: "bg-green-500/20 text-green-300"},
  ];

  const handleFilter = (key) => { setActiveFilter(key); setPage(1); };
  const descLimit = 120;
  const isTaskedFilter = activeFilter === "tasked";

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {greeting}, {displayName}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">HQ Overview — All Battalions</p>
        </div>
        <NotificationBell />
      </div>

      {/* ── Row 1: Summary Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          loading={loadingCounts}
          label="Total Cases"
          value={statusCounts.total}
          accent="bg-blue-500/10"
          onClick={() => navigate("/dashboard/cases")}
          icon={
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="Guardrooms"
          value={totalGuardrooms}
          accent="bg-gray-500/10"
          onClick={() => navigate("/dashboard/guardrooms")}
          icon={
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12l5-7 5 7v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7z" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="Total Incidents"
          value={totalInc}
          accent="bg-red-500/10"
          onClick={() => navigate("/dashboard/incidents")}
          icon={
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="Active Incidents"
          value={openInc}
          accent="bg-orange-500/10"
          onClick={() => navigate("/dashboard/incidents")}
          icon={
            <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      {/* ── Row 2: Status Breakdown ─────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Case Status Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard loading={loadingCounts} label="New"               value={statusCounts.new}                 accent="bg-gray-500/10" onClick={() => navigate("/dashboard/cases?status=new")}
            icon={<svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 4h.01M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Tasked"            value={statusCounts.tasked}              accent="bg-yellow-500/10" onClick={() => navigate("/dashboard/cases?status=tasked")}
            icon={<svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Under Invest."     value={statusCounts.under_investigation} accent="bg-indigo-500/10" onClick={() => navigate("/dashboard/cases?status=under_investigation")}
            icon={<svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Pending"           value={statusCounts.pending}             accent="bg-orange-500/10" onClick={() => navigate("/dashboard/cases?status=pending")}
            icon={<svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Served"            value={statusCounts.served}              accent="bg-purple-500/10" onClick={() => navigate("/dashboard/cases?status=served")}
            icon={<svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Closed"            value={statusCounts.closed}              accent="bg-green-500/10"  onClick={() => navigate("/dashboard/cases?status=closed")}
            icon={<svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
          />
        </div>
      </div>

      {/* ── Cases Table ─────────────────────────────────────────────── */}
      <div>
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeFilter === f.key
                  ? "ring-2 ring-white/30 " + f.style
                  : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="w-full sm:w-auto sm:ml-auto text-xs text-gray-500">
            {loadingCounts ? "…" : `${totalCount} total`}
          </span>
        </div>

        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {loadingCases ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="h-7 bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : cases.length === 0 ? (
            <p className="p-5 text-gray-500 text-sm">No cases found.</p>
          ) : (
            <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Case #</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Service No</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Rank</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Accused</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Offence</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Description</th>
                  {isTaskedFilter ? (
                    <>
                      <th className="text-left px-3 md:px-5 py-3 font-medium">Tasking Letter</th>
                      <th className="text-left px-3 md:px-5 py-3 font-medium">Tasked Battalion/Detachment</th>
                    </>
                  ) : (
                    <th className="text-left px-3 md:px-5 py-3 font-medium">Status</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-700/40 hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-3 md:px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {c.case_number || "--"}
                    </td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_service_number || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_rank || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_name || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-200 whitespace-nowrap">{c.offence_name || c.offence || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 min-w-[260px] max-w-[420px]">
                      {(() => {
                        const desc = c.description || "--";
                        const expanded = !!expandedDesc[c.id];
                        const longDesc = desc.length > descLimit;
                        const shown = expanded || !longDesc ? desc : `${desc.slice(0, descLimit)}...`;
                        return (
                          <>
                            <p className="whitespace-pre-wrap break-words">{shown}</p>
                            {longDesc && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedDesc((prev) => ({ ...prev, [c.id]: !prev[c.id] }));
                                }}
                                className="mt-1 text-xs text-blue-400 hover:underline"
                              >
                                {expanded ? "Show less" : "Show more"}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    {isTaskedFilter ? (
                      <>
                        <td className="px-3 md:px-5 py-3">
                          {c.tasking_letter ? (
                            <a
                              href={c.tasking_letter}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-400 hover:underline whitespace-nowrap"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-xs text-gray-500">--</span>
                          )}
                        </td>
                        <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">
                          {c.tasked_detachment_name
                            ? `${c.tasked_battalion_name || "--"} / ${c.tasked_detachment_name}`
                            : c.tasked_battalion_name || "--"}
                        </td>
                      </>
                    ) : (
                      <td className="px-3 md:px-5 py-3">
                        <Badge
                          label={c.status}
                          style={STATUS_STYLE[c.status] || "bg-gray-600 text-gray-300"}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onChange={setPage}
        />
      </div>

      <Footer />
    </div>
  );
}
