import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { caseService, incidentService, formationService, guardroomService, teamService, userService } from "../services/api";
import NotificationBell from "./NotificationBell";
import useAutoDismiss from "../hooks/useAutoDismiss";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function userLabel(user) {
  if (!user) return "";
  const name = [user.rank, user.name].filter(Boolean).join(" ").trim();
  const serviceNumber = user.service_number ? ` (${user.service_number})` : "";
  return `${name || user.service_number || "Unknown"}${name ? serviceNumber : ""}`;
}

function userWorkload(user, workloadMap) {
  return workloadMap[user?.id] ?? 0;
}

function userLabelWithWorkload(user, workloadMap) {
  const load = userWorkload(user, workloadMap);
  return `${userLabel(user)} - ${load} active case${load !== 1 ? "s" : ""}`;
}

function sortUsersByWorkload(workloadMap) {
  return (a, b) =>
    userWorkload(a, workloadMap) - userWorkload(b, workloadMap) ||
    userLabel(a).localeCompare(userLabel(b));
}

function scheduleAfterPaint(callback) {
  if (typeof window === "undefined") {
    callback();
    return undefined;
  }

  let timeoutId;
  const frameId = window.requestAnimationFrame(() => {
    timeoutId = window.setTimeout(callback, 0);
  });

  return () => {
    window.cancelAnimationFrame(frameId);
    if (timeoutId) window.clearTimeout(timeoutId);
  };
}

function normalizeDateForInput(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  return isoPrefix ? isoPrefix[1] : "";
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

function StatCard({ icon, label, value, accent, loading, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`min-h-[82px] bg-gray-800 rounded-xl p-4 flex items-start gap-4 w-full text-left ${
        onClick ? "cursor-pointer hover:bg-gray-700 transition-colors" : ""
      }`}
    >
      <div className={`p-2.5 rounded-lg ${accent} shrink-0`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <div className="min-h-[30px] mt-0.5 flex items-center">
          {loading ? (
            <div className="h-7 w-12 bg-gray-700 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-white">{value ?? 0}</p>
          )}
        </div>
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

export default function BattalionDashboard({ user }) {
  const navigate = useNavigate();
  const isNormalAdmin = user?.role === "admin" && user?.battalion_type === "normal";
  const isSpecialBattalionAdmin = user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() === "special";
  const isInvestigator = user?.role === "investigator";

  const [cases, setCases]           = useState([]);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [loadingCases, setLoadingCases]   = useState(true);
  const [page, setPage]             = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState({
    total: 0, new: 0, newOpen: 0, tasked: 0, under_investigation: 0,
    pending: 0, served: 0, closed: 0,
  });
  const [totalInc, setTotalInc]   = useState(0);
  const [openInc, setOpenInc]     = useState(0);
  const [courtMartialCount, setCourtMartialCount] = useState(0);
  const [dciCivPoliceCount, setDciCivPoliceCount] = useState(0);
  const [totalGuardrooms, setTotalGuardrooms] = useState(0);
  const [expandedDesc, setExpandedDesc] = useState({});

  // Task-to-company modal state
  const [taskModal, setTaskModal]       = useState(null); // case object or null
  const [detachments, setDetachments]   = useState([]);
  const [selDetachment, setSelDetachment] = useState("");
  const [taskingCase, setTaskingCase]   = useState(false);
  const [taskError, setTaskError]       = useState("");

  const [teamTaskModal, setTeamTaskModal] = useState(null);
  const [teams, setTeams] = useState([]);
  const [investigators, setInvestigators] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [assignmentMode, setAssignmentMode] = useState("io");
  const [selTeam, setSelTeam] = useState("");
  const [selIo, setSelIo] = useState("");
  const [selTeamDeadline, setSelTeamDeadline] = useState("");
  const [assigningTeam, setAssigningTeam] = useState(false);
  const [teamTaskError, setTeamTaskError] = useState("");
  const [teamDetails, setTeamDetails] = useState(null);
  useAutoDismiss(taskError, setTaskError);
  useAutoDismiss(teamTaskError, setTeamTaskError);
  const workloadMap = Object.fromEntries(workload.map((w) => [w.id, w.total_engagement ?? 0]));
  const sortedInvestigators = [...investigators].sort(sortUsersByWorkload(workloadMap));

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const descLimit = 120;

  // One-time counts fetch (tiny requests — just need the `count` field)
  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const [
        allRes,
        newRes,
        openRes,
        taskedRes,
        uiRes,
        peRes,
        seRes,
        clRes,
        incRes,
        incOpenRes,
        courtMartialRes,
        dciCivPoliceRes,
        guardroomRes,
      ] =
        await Promise.all([
          caseService.list({ page_size: 1 }),
          caseService.list({ page_size: 1, status: "new" }),
          caseService.list({ page_size: 1, status: "open" }),
          caseService.list({ page_size: 1, status: "tasked" }),
          caseService.list({ page_size: 1, status: "under_investigation" }),
          caseService.list({ page_size: 1, status: "pending" }),
          caseService.list({ page_size: 1, status: "served" }),
          caseService.list({ page_size: 1, status: "closed" }),
          incidentService.list({ page_size: 1 }),
          incidentService.list({ page_size: 1, status: "reported" }),
          caseService.list({ page_size: 1, criminal_offence_type: "court_martial" }),
          caseService.list({ page_size: 1, criminal_offence_type: "dci_civ_police" }),
          guardroomService.list(),
        ]);
      setStatusCounts({
        total:               allRes.data.count   || 0,
        new:                 newRes.data.count   || 0,
        newOpen:             (newRes.data.count || 0) + (openRes.data.count || 0),
        tasked:              taskedRes.data.count || 0,
        under_investigation: (uiRes.data.count || 0) + (isInvestigator ? (taskedRes.data.count || 0) : 0),
        pending:             peRes.data.count    || 0,
        served:              seRes.data.count    || 0,
        closed:              clRes.data.count    || 0,
      });
      setTotalInc(incRes.data.count || 0);
      setOpenInc(incOpenRes.data.count || 0);
      setCourtMartialCount(courtMartialRes.data.count || 0);
      setDciCivPoliceCount(dciCivPoliceRes.data.count || 0);
      setTotalGuardrooms(toArray(guardroomRes.data).length);
    } catch {
      // keep zeros
    } finally {
      setLoadingCounts(false);
    }
  }, [isInvestigator]);

  // Paginated cases for the table
  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const res = await caseService.list({ page, page_size: PAGE_SIZE });
      setCases(toArray(res.data));
      setTotalCount(res.data.count || 0);
    } catch {
      setCases([]);
      setTotalCount(0);
    } finally {
      setLoadingCases(false);
    }
  }, [page]);

  useEffect(() => scheduleAfterPaint(loadCounts), [loadCounts]);
  useEffect(() => scheduleAfterPaint(loadCases), [loadCases]);

  // Load companies under this battalion (backed by detachment records)
  useEffect(() => {
    if (isNormalAdmin && (user?.battalion_id ?? user?.battalion)) {
      formationService.detachments({ battalion: user.battalion_id ?? user.battalion, page_size: 100 })
        .then((r) => setDetachments(toArray(r.data)))
        .catch(() => {});
    }
  }, [isNormalAdmin, user?.battalion_id, user?.battalion]);

  useEffect(() => {
    if (isSpecialBattalionAdmin && (user?.battalion_id ?? user?.battalion)) {
      const battalionId = user.battalion_id ?? user.battalion;
      teamService.list({ battalion: battalionId, page_size: 200 })
        .then((r) => setTeams(toArray(r.data)))
        .catch(() => setTeams([]));
      teamService.workload()
        .then((r) => setWorkload(toArray(r.data)))
        .catch(() => setWorkload([]));
      userService.list({ battalion: battalionId, role: "investigator", page_size: 200 })
        .then((r) => setInvestigators(toArray(r.data).filter((u) => u.role === "investigator" && u.is_active !== false)))
        .catch(() => setInvestigators([]));
    }
  }, [isSpecialBattalionAdmin, user?.battalion_id, user?.battalion]);

  const openTaskModal = (caseObj) => {
    setTaskModal(caseObj);
    setSelDetachment("");
    setTaskError("");
  };

  const openTeamTaskModal = (caseObj) => {
    setTeamTaskModal(caseObj);
    setAssignmentMode(caseObj?.assigned_team ? "team" : "io");
    setSelTeam(caseObj?.assigned_team ? String(caseObj.assigned_team) : "");
    setSelIo(caseObj?.assigned_to ? String(caseObj.assigned_to) : "");
    setSelTeamDeadline(normalizeDateForInput(caseObj?.investigation_deadline));
    setTeamTaskError("");
  };

  const getCaseTeam = (caseObj) => {
    const teamId = caseObj?.assigned_team;
    const teamName = caseObj?.assigned_team_name;
    return teams.find((t) => String(t.id) === String(teamId)) || teams.find((t) => t.name === teamName) || null;
  };

  const openTeamDetails = (caseObj) => {
    const team = getCaseTeam(caseObj) || {
      id: caseObj?.assigned_team,
      name: caseObj?.assigned_team_name || "Assigned Team",
      team_ic_detail: null,
      members_detail: [],
    };
    setTeamDetails(team);
  };

  const handleTaskToDetachment = async () => {
    if (!selDetachment) { setTaskError("Please select a company."); return; }
    setTaskingCase(true);
    setTaskError("");
    try {
      await caseService.update(taskModal.id, { tasked_detachment: selDetachment });
      setTaskModal(null);
      loadCases();
      loadCounts();
    } catch (e) {
      setTaskError(e?.response?.data?.detail || "Failed to task case to company.");
    } finally {
      setTaskingCase(false);
    }
  };

  const handleAssignTeam = async () => {
    if (assignmentMode === "team" && !selTeam) { setTeamTaskError("Please select a team."); return; }
    if (assignmentMode === "io" && !selIo) { setTeamTaskError("Please select an IO."); return; }
    if (!selTeamDeadline) { setTeamTaskError("Investigation deadline is required."); return; }
    setAssigningTeam(true);
    setTeamTaskError("");
    try {
      const payload = {
        investigation_deadline: selTeamDeadline,
      };
      if (assignmentMode === "io") {
        payload.assigned_to = selIo;
        payload.assigned_team = null;
      } else {
        payload.assigned_team = selTeam;
        payload.assigned_to = null;
      }
      await caseService.update(teamTaskModal.id, payload);
      setTeamTaskModal(null);
      loadCases();
      loadCounts();
      teamService
        .workload()
        .then((res) => setWorkload(toArray(res.data)))
        .catch(() => setWorkload([]));
    } catch (e) {
      const data = e?.response?.data;
      setTeamTaskError(
        data?.detail ||
        data?.non_field_errors?.[0] ||
        data?.assignment?.[0] ||
        data?.assigned_to?.[0] ||
        data?.assigned_team?.[0] ||
        data?.investigation_deadline?.[0] ||
        "Failed to assign case."
      );
    } finally {
      setAssigningTeam(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = [user?.rank, user?.name?.split(" ")[0] || user?.service_number || "Officer"].filter(Boolean).join(" ");

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {greeting}, {displayName}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {user?.battalion_name
              ? `${user.battalion_name} — Battalion Overview`
              : "Battalion Overview"}
          </p>
        </div>
        <NotificationBell />
      </div>

      {/* ── Row 1: Total Cases + Incidents ─────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
          label="Court Martial"
          value={courtMartialCount}
          accent="bg-violet-500/10"
          onClick={() => navigate("/dashboard/court-martial")}
          icon={
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="DCI / Civ Police"
          value={dciCivPoliceCount}
          accent="bg-cyan-500/10"
          onClick={() => navigate("/dashboard/dci-civ-police")}
          icon={
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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

      {/* ── Row 2: Status Breakdown Cards ──────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Case Status Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            loading={loadingCounts}
            label="Tasked"
            value={statusCounts.tasked}
            accent="bg-yellow-500/10"
            onClick={() => navigate("/dashboard/cases?status=tasked")}
            icon={
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
              </svg>
            }
          />
          <StatCard
            loading={loadingCounts}
            label="Under Investigation"
            value={statusCounts.under_investigation}
            accent="bg-indigo-500/10"
            onClick={() => navigate(
              user?.role === "investigator"
                ? "/dashboard/my-team?status=under_investigation"
                : "/dashboard/cases?status=under_investigation"
            )}
            icon={
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
          <StatCard
            loading={loadingCounts}
            label="Pending"
            value={statusCounts.pending}
            accent="bg-orange-500/10"
            onClick={() => navigate("/dashboard/cases?status=pending")}
            icon={
              <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            loading={loadingCounts}
            label="Served"
            value={statusCounts.served}
            accent="bg-purple-500/10"
            onClick={() => navigate("/dashboard/cases?status=served")}
            icon={
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            loading={loadingCounts}
            label="Closed"
            value={statusCounts.closed}
            accent="bg-green-500/10"
            onClick={() => navigate("/dashboard/cases?status=closed")}
            icon={
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            }
          />
        </div>
      </div>

      {/* ── Cases Table (paginated) ─────────────────────────────── */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Cases</h3>
            {!loadingCounts && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                {statusCounts.total} total
              </span>
            )}
          </div>
          <button
            onClick={() => navigate("/dashboard/cases")}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors self-start sm:self-auto"
          >
            Manage →
          </button>
        </div>
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {loadingCases ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-7 bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : cases.length === 0 ? (
            <p className="p-5 text-gray-500 text-sm">No cases assigned to this battalion.</p>
          ) : (
            <div className="max-h-[58vh] overflow-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
              <table className="sticky-head w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Case #</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Service No</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Rank</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Accused</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Offence</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Description</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Status</th>
                  {(isNormalAdmin || isSpecialBattalionAdmin) && (
                    <th className="text-left px-3 md:px-5 py-3 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-700/40 hover:bg-gray-700/30 transition-colors"
                  >
                    <td
                      className="px-3 md:px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap cursor-pointer"
                      onClick={() => navigate("/dashboard/cases")}
                    >
                      {c.case_number || "--"}
                    </td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap cursor-pointer" onClick={() => navigate("/dashboard/cases")}>{c.accused_service_number || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap cursor-pointer" onClick={() => navigate("/dashboard/cases")}>{c.accused_rank || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap cursor-pointer" onClick={() => navigate("/dashboard/cases")}>{c.accused_name || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-200 whitespace-nowrap cursor-pointer" onClick={() => navigate("/dashboard/cases")}>{c.offence_name || c.offence || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 min-w-[260px] max-w-[420px] cursor-pointer" onClick={() => navigate("/dashboard/cases")}>
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
                    <td className="px-3 md:px-5 py-3 cursor-pointer" onClick={() => navigate("/dashboard/cases")}>
                      <Badge
                        label={c.status}
                        style={STATUS_STYLE[c.status] || "bg-gray-600 text-gray-300"}
                      />
                    </td>
                    {isNormalAdmin && (
                      <td className="px-3 md:px-5 py-3">
                        {c.status === "tasked" && !c.tasked_detachment && (
                          <button
                            onClick={() => openTaskModal(c)}
                            className="px-3 py-1 text-xs rounded bg-yellow-600 hover:bg-yellow-500 text-white transition-colors"
                          >
                            Task to Coy
                          </button>
                        )}
                        {c.tasked_detachment && (
                          <span className="text-xs text-gray-500 italic">
                            Coy tasked
                          </span>
                        )}
                      </td>
                    )}
                    {isSpecialBattalionAdmin && (
                      <td className="px-3 md:px-5 py-3">
                        {c.status === "tasked" && !c.assigned_team && !c.assigned_to && (
                          <button
                            onClick={() => openTeamTaskModal(c)}
                            className="px-3 py-1 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
                          >
                            Assign IO / Team
                          </button>
                        )}
                        {c.assigned_to && (
                          <span className="text-xs font-semibold text-indigo-300">
                            {c.assigned_to_name || "Assigned IO"}
                          </span>
                        )}
                        {c.assigned_team && (
                          <button
                            onClick={() => openTeamDetails(c)}
                            className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 hover:underline"
                          >
                            {c.assigned_team_name || getCaseTeam(c)?.name || "View Team"}
                          </button>
                        )}
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

      {/* Task to Coy Modal */}
      {taskModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setTaskModal(null)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-1">Task Case to Coy</h2>
            <p className="text-sm text-gray-400 mb-5">
              Case <span className="font-mono text-gray-300">{taskModal.case_number}</span>:{" "}
              {taskModal.title || taskModal.offence}
            </p>

            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
              Select Coy
            </label>
            <select
              value={selDetachment}
              onChange={(e) => setSelDetachment(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 mb-4"
            >
              <option value="">-- Choose Coy --</option>
              {detachments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.company ? `${d.company} Coy` : "Coy"}{d.name ? ` - ${d.name}` : ""}
                </option>
              ))}
            </select>

            {detachments.length === 0 && (
              <p className="text-xs text-orange-400 mb-4">No companies found under this battalion.</p>
            )}

            {taskError && (
              <p className="text-xs text-red-400 mb-4">{taskError}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setTaskModal(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTaskToDetachment}
                disabled={taskingCase || !selDetachment}
                className="px-4 py-2 text-sm rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {taskingCase ? "Tasking..." : "Task to Coy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to IO or Team Modal */}
      {teamTaskModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setTeamTaskModal(null)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-1">Assign Case</h2>
            <p className="text-sm text-gray-400 mb-5">
              Case <span className="font-mono text-gray-300">{teamTaskModal.case_number}</span>: {teamTaskModal.title || teamTaskModal.offence}
            </p>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-900 p-1 border border-gray-700 mb-4">
              <button
                type="button"
                onClick={() => setAssignmentMode("io")}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  assignmentMode === "io"
                    ? "bg-cyan-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                Single IO
              </button>
              <button
                type="button"
                onClick={() => setAssignmentMode("team")}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  assignmentMode === "team"
                    ? "bg-cyan-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                Team
              </button>
            </div>

            {assignmentMode === "io" ? (
              <>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Select IO
                </label>
                <select
                  value={selIo}
                  onChange={(e) => setSelIo(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
                >
                  <option value="">-- Choose IO --</option>
                  {sortedInvestigators.map((io) => (
                    <option key={io.id} value={io.id}>{userLabelWithWorkload(io, workloadMap)}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Select Team
                </label>
                <select
                  value={selTeam}
                  onChange={(e) => setSelTeam(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
                >
                  <option value="">-- Choose Team --</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </>
            )}

            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
              Investigation Deadline
            </label>
            <input
              type="date"
              value={selTeamDeadline}
              onChange={(e) => setSelTeamDeadline(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
            />

            {assignmentMode === "team" && teams.length === 0 && (
              <p className="text-xs text-orange-400 mb-4">No teams found under this battalion.</p>
            )}
            {assignmentMode === "io" && investigators.length === 0 && (
              <p className="text-xs text-orange-400 mb-4">No investigators found under this battalion.</p>
            )}

            {teamTaskError && (
              <p className="text-xs text-red-400 mb-4">{teamTaskError}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setTeamTaskModal(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignTeam}
                disabled={assigningTeam || !selTeamDeadline || (assignmentMode === "io" ? !selIo : !selTeam)}
                className="px-4 py-2 text-sm rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {assigningTeam ? "Assigning..." : "Assign Case"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Details Modal */}
      {teamDetails && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setTeamDetails(null)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">{teamDetails.name}</h2>
                <p className="text-sm text-gray-400 mt-1">Team details</p>
              </div>
              <button
                onClick={() => setTeamDetails(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div className="rounded-lg bg-gray-700/50 p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Team IC</p>
                <p className="text-sm text-gray-200">
                  {teamDetails.team_ic_detail
                    ? `${teamDetails.team_ic_detail.rank ? `${teamDetails.team_ic_detail.rank} ` : ""}${teamDetails.team_ic_detail.name}`
                    : "—"}
                </p>
                {teamDetails.team_ic_detail?.service_number && (
                  <p className="text-xs text-gray-500 mt-1">{teamDetails.team_ic_detail.service_number}</p>
                )}
              </div>
              <div className="rounded-lg bg-gray-700/50 p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Members</p>
                <p className="text-sm text-gray-200">{Array.isArray(teamDetails.members_detail) ? teamDetails.members_detail.length : 0} total</p>
              </div>
            </div>

            <div className="border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/80">
                <h3 className="text-sm font-semibold text-gray-300">Team Members</h3>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-700/60">
                {(Array.isArray(teamDetails.members_detail) ? teamDetails.members_detail : []).length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-500">No members found.</p>
                ) : (
                  teamDetails.members_detail.map((member) => (
                    <div key={member.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-gray-200">{member.rank ? `${member.rank} ` : ""}{member.name}</p>
                        <p className="text-xs text-gray-500">{member.service_number}</p>
                      </div>
                      <span className="text-xs text-indigo-400">{member.role}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end mt-5">
              <button
                onClick={() => setTeamDetails(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
