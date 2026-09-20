import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { caseService, formationService, teamService, userService } from "../services/api";
import NotificationBell from "./NotificationBell";
import useAutoDismiss from "../hooks/useAutoDismiss";
import { openProtectedFile } from "../utils/protectedFiles";
import { RTA_CASE_TYPE, caseAccusedUnitLabel, caseDisplayDescription } from "../utils/caseTypes";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function responseCount(response) {
  const value = Number(response?.data?.count);
  return Number.isFinite(value) ? value : toArray(response?.data).length;
}

function settledResponse(result) {
  return result.status === "fulfilled" ? result.value : null;
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

function StatCard({ icon, label, value, accent, loading, onClick, action }) {
  return (
    <div
      className={`min-h-[82px] bg-gray-800 rounded-xl p-4 flex items-start gap-4 ${onClick ? "cursor-pointer hover:bg-gray-700 transition-colors" : ""}`}
      onClick={onClick}
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
        {action && (
          <div className="mt-1" onClick={(event) => event.stopPropagation()}>
            {action}
          </div>
        )}
      </div>
    </div>
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
      <span className="font-mono">{yy}{mm}{dd}&nbsp;&nbsp;{hh}{min}{ss}</span>
    </footer>
  );
}

export default function DetachmentDashboard({ user }) {
  const navigate = useNavigate();
  const detachmentId = user?.detachment_id ?? user?.detachment;
  const companyId = user?.company_id ?? user?.detachment?.company_id ?? user?.detachment_company_id ?? user?.company;
  const canManageDetachmentTeams = user?.role === "detachment";

  // Cases
  const [cases, setCases]               = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [statusCounts, setStatusCounts] = useState({
    total: 0, new: 0, tasked: 0, detCases: 0, under_investigation: 0, pending: 0, served: 0, closed: 0,
  });
  const [rtaCaseCount, setRtaCaseCount] = useState(0);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [expandedDesc, setExpandedDesc] = useState({});
  const [documentError, setDocumentError] = useState("");

  // Teams
  const [teams, setTeams]               = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  // Company users (for team creation)
  const [detUsers, setDetUsers]         = useState([]);
  const [workload, setWorkload]         = useState([]);

  // Assign team modal
  const [assignModal, setAssignModal]   = useState(null); // case object
  const [assignmentMode, setAssignmentMode] = useState("io");
  const [selTeam, setSelTeam]           = useState("");
  const [selIo, setSelIo]               = useState("");
  const [deadline, setDeadline]         = useState("");
  const [assigning, setAssigning]       = useState(false);
  const [assignError, setAssignError]   = useState("");

  // Task to detachment modal
  const [taskDetachmentModal, setTaskDetachmentModal] = useState(null);
  const [selDetachment, setSelDetachment] = useState("");
  const [companyDetachments, setCompanyDetachments] = useState([]);
  const [taskingDetachment, setTaskingDetachment] = useState(false);
  const [taskDetachmentError, setTaskDetachmentError] = useState("");
  const [caseListMode, setCaseListMode] = useState("recent");
  const [showBulkTaskModal, setShowBulkTaskModal] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const [bulkDetachment, setBulkDetachment] = useState("");
  const [bulkTasking, setBulkTasking] = useState(false);
  const [bulkTaskError, setBulkTaskError] = useState("");
  const [taskableCaseSearch, setTaskableCaseSearch] = useState("");
  const [detCaseStatusFilter, setDetCaseStatusFilter] = useState("all");

  // Create team modal
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName]       = useState("");
  const [newTeamIC, setNewTeamIC]           = useState("");
  const [newTeamMembers, setNewTeamMembers] = useState([]);
  const [creatingTeam, setCreatingTeam]     = useState(false);
  const [createTeamError, setCreateTeamError] = useState("");
  useAutoDismiss(assignError, setAssignError);
  useAutoDismiss(createTeamError, setCreateTeamError);
  useAutoDismiss(documentError, setDocumentError);
  const workloadMap = Object.fromEntries(workload.map((w) => [w.id, w.total_engagement ?? 0]));
  const sortedDetUsers = [...detUsers].sort(sortUsersByWorkload(workloadMap));
  const investigators = sortedDetUsers.filter((u) => u.role === "investigator" && u.is_active !== false);
  const companyCases = cases.filter((c) =>
    String(c.tasked_company ?? c.tasked_company_id) === String(companyId)
  );
  const companyDetachmentIds = new Set([
    ...companyDetachments.map((det) => String(det.id)),
  ]);
  const companyDetachmentNames = new Set([
    ...companyDetachments.map((det) => String(det.name).trim().toLowerCase()),
  ]);
  const isOwnDetachmentCase = useCallback((c) => {
    const taskedDetachmentId = c.tasked_detachment ?? c.tasked_detachment_id;
    const taskedDetachmentName = c.tasked_detachment_name;
    return (
      (taskedDetachmentId && String(taskedDetachmentId) === String(detachmentId)) ||
      (taskedDetachmentName &&
        String(taskedDetachmentName).trim().toLowerCase() ===
          String(user?.detachment_name || "").trim().toLowerCase())
    );
  }, [detachmentId, user?.detachment_name]);
  const detachmentCases = cases.filter((c) => {
    const taskedDetachmentId = c.tasked_detachment ?? c.tasked_detachment_id;
    const taskedDetachmentName = c.tasked_detachment_name;
    if (user?.role === "detachment") {
      return isOwnDetachmentCase(c);
    }
    return (
      (taskedDetachmentId && companyDetachmentIds.has(String(taskedDetachmentId))) ||
      (taskedDetachmentName && companyDetachmentNames.has(String(taskedDetachmentName).trim().toLowerCase()))
    );
  });
  const taskableCases = companyCases.filter((c) =>
    c.status === "tasked" &&
    !c.tasked_detachment &&
    !c.tasked_detachment_name &&
    !c.assigned_team &&
    !c.assigned_to
  );
  const filteredTaskableCases = taskableCases.filter((c) => {
    const query = taskableCaseSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      c.case_number,
      c.title,
      c.offence,
      c.accused_name,
      c.service_number,
      c.description,
    ].some((value) => String(value ?? "").toLowerCase().includes(query));
  });
  const canTaskToChildDetachment = user?.role !== "detachment";
  const recentCases = user?.role === "detachment"
    ? detachmentCases.filter((c) => c.status === "tasked")
    : cases.filter((c) => c.status === "tasked");
  const visibleCases = caseListMode === "det"
    ? detachmentCases.filter((c) => detCaseStatusFilter === "all" || c.status === detCaseStatusFilter)
    : recentCases;

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const res = await caseService.list({ page_size: 100 });
      const nextCases = toArray(res.data);
      setCases(nextCases);
      if (user?.role === "detachment") {
        const ownCases = nextCases.filter(isOwnDetachmentCase);
        const countByStatus = (status) => ownCases.filter((c) => c.status === status).length;
        setStatusCounts({
          total: ownCases.length,
          new: countByStatus("new"),
          tasked: countByStatus("tasked"),
          detCases: ownCases.length,
          under_investigation: countByStatus("under_investigation"),
          pending: countByStatus("pending"),
          served: countByStatus("served"),
          closed: countByStatus("closed"),
        });
        setRtaCaseCount(ownCases.filter((c) => c.case_type === RTA_CASE_TYPE).length);
        setLoadingCounts(false);
      }
    } catch {
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  }, [user, isOwnDetachmentCase]);
  const descLimit = 120;

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    if (user?.role === "detachment") {
      setLoadingCounts(false);
      return;
    }
    try {
      const [allRes, newRes, taskedRes, uiRes, peRes, seRes, clRes, rtaCaseRes] = (await Promise.allSettled([
        caseService.list({ page_size: 1 }),
        caseService.list({ page_size: 1, status: "new" }),
        caseService.list({ page_size: 1, status: "tasked" }),
        caseService.list({ page_size: 1, status: "under_investigation" }),
        caseService.list({ page_size: 1, status: "pending" }),
        caseService.list({ page_size: 1, status: "served" }),
        caseService.list({ page_size: 1, status: "closed" }),
        caseService.list({ page_size: 1, case_type: RTA_CASE_TYPE }),
      ])).map(settledResponse);
      setStatusCounts((prev) => ({
        total:               responseCount(allRes),
        new:                 responseCount(newRes),
        tasked:              responseCount(taskedRes),
        detCases:            prev.detCases,
        under_investigation: responseCount(uiRes),
        pending:             responseCount(peRes),
        served:              responseCount(seRes),
        closed:              responseCount(clRes),
      }));
      setRtaCaseCount(responseCount(rtaCaseRes));
    } catch {
      // keep zeros
    } finally {
      setLoadingCounts(false);
    }
  }, [user]);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    try {
      const res = await teamService.list({ page_size: 100 });
      setTeams(toArray(res.data));
    } catch {
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  const loadWorkload = useCallback(async () => {
    try {
      const res = await teamService.workload();
      setWorkload(toArray(res.data));
    } catch {
      setWorkload([]);
    }
  }, []);

  useEffect(() => scheduleAfterPaint(() => {
    loadCases();
    loadCounts();
    loadTeams();
    loadWorkload();
  }), [loadCases, loadCounts, loadTeams, loadWorkload]);

  useEffect(() => {
    if (canManageDetachmentTeams && detachmentId) {
      userService.list({ detachment: detachmentId, page_size: 200 })
        .then((r) => setDetUsers(toArray(r.data)))
        .catch(() => {});
    }
  }, [canManageDetachmentTeams, detachmentId]);

  useEffect(() => {
    if (!companyId) {
      setCompanyDetachments([]);
      return;
    }
    formationService.subDetachments({ company: companyId, page_size: 200 })
      .then((r) => {
        const items = toArray(r.data).filter((d) => String(d.id) !== String(detachmentId));
        setCompanyDetachments(items);
      })
      .catch(() => setCompanyDetachments([]));
  }, [companyId, detachmentId]);

  // Assign team
  const openAssignModal = (c) => {
    if (!canManageDetachmentTeams) return;
    setShowCreateTeam(false);
    setAssignModal(c);
    setAssignmentMode(c?.assigned_team ? "team" : "io");
    setSelTeam(c?.assigned_team ? String(c.assigned_team) : "");
    setSelIo(c?.assigned_to ? String(c.assigned_to) : "");
    setDeadline(c.investigation_deadline || "");
    setAssignError("");
  };

  const openTaskDetachmentModal = (c) => {
    const taskedCompanyId = c?.tasked_company ?? c?.tasked_company_id;
    if (
      !canTaskToChildDetachment ||
      !companyId ||
      String(taskedCompanyId) !== String(companyId) ||
      companyDetachments.length === 0
    ) {
      return;
    }
    setTaskDetachmentModal(c);
    setSelDetachment("");
    setTaskDetachmentError("");
  };

  const handleTaskToDetachment = async () => {
    const taskedCompanyId = taskDetachmentModal?.tasked_company ?? taskDetachmentModal?.tasked_company_id;
    if (
      !canTaskToChildDetachment ||
      !companyId ||
      String(taskedCompanyId) !== String(companyId)
    ) {
      setTaskDetachmentError("You can only task cases already assigned to your company.");
      return;
    }
    if (!selDetachment) {
      setTaskDetachmentError("Please select a detachment.");
      return;
    }
    setTaskingDetachment(true);
    setTaskDetachmentError("");
    try {
      await caseService.update(taskDetachmentModal.id, {
        tasked_detachment: selDetachment,
      });
      setTaskDetachmentModal(null);
      loadCases();
      loadCounts();
    } catch (e) {
      const data = e?.response?.data;
      const message = data && typeof data === "object"
        ? Object.entries(data)
            .flatMap(([field, value]) => {
              const values = Array.isArray(value) ? value : [value];
              return values
                .filter(Boolean)
                .map((item) => `${field}: ${typeof item === "object" ? JSON.stringify(item) : item}`);
            })
            .join(" ")
        : "";
      setTaskDetachmentError(message || "Failed to task case to detachment.");
    } finally {
      setTaskingDetachment(false);
    }
  };

  const openBulkTaskModal = () => {
    setSelectedCaseIds([]);
    setTaskableCaseSearch("");
    setBulkDetachment("");
    setBulkTaskError("");
    setShowBulkTaskModal(true);
  };

  const toggleCaseSelection = (caseId) => {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId) ? prev.filter((id) => id !== caseId) : [...prev, caseId]
    );
  };

  const handleBulkTask = async () => {
    if (!bulkDetachment) {
      setBulkTaskError("Select a detachment.");
      return;
    }
    if (selectedCaseIds.length === 0) {
      setBulkTaskError("Select at least one case.");
      return;
    }
    setBulkTasking(true);
    setBulkTaskError("");
    try {
      await Promise.all(selectedCaseIds.map((caseId) =>
        caseService.update(caseId, { tasked_detachment: bulkDetachment })
      ));
      setShowBulkTaskModal(false);
      setCaseListMode("det");
      loadCases();
      loadCounts();
    } catch (e) {
      const data = e?.response?.data;
      setBulkTaskError(
        data?.detail ||
        data?.tasked_detachment?.[0] ||
        data?.tasking?.[0] ||
        "One or more cases could not be tasked to the detachment."
      );
    } finally {
      setBulkTasking(false);
    }
  };

  const handleAssignTeam = async () => {
    if (!canManageDetachmentTeams) { setAssignError("Only IC Cases can assign cases."); return; }
    if (assignmentMode === "team" && !selTeam) { setAssignError("Please select a team."); return; }
    if (assignmentMode === "io" && !selIo) { setAssignError("Please select an IO."); return; }
    if (!deadline) { setAssignError("Investigation deadline is required."); return; }
    setAssigning(true);
    setAssignError("");
    try {
      const payload = {
        investigation_deadline: deadline,
      };
      if (assignmentMode === "io") {
        payload.assigned_to = selIo;
        payload.assigned_team = null;
      } else {
        payload.assigned_team = selTeam;
        payload.assigned_to = null;
      }
      await caseService.update(assignModal.id, payload);
      setAssignModal(null);
      loadCases();
      loadCounts();
      loadWorkload();
    } catch (e) {
      const data = e?.response?.data;
      setAssignError(
        data?.detail ||
        data?.non_field_errors?.[0] ||
        data?.assignment?.[0] ||
        data?.assigned_to?.[0] ||
        data?.assigned_team?.[0] ||
        data?.investigation_deadline?.[0] ||
        "Failed to assign case."
      );
    } finally {
      setAssigning(false);
    }
  };

  // Create team
  const toggleMember = (id) => {
    setNewTeamMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleCreateTeam = async () => {
    if (!canManageDetachmentTeams) { setCreateTeamError("Only IC Cases can create investigation teams."); return; }
    if (!newTeamName.trim()) { setCreateTeamError("Team name is required."); return; }
    if (newTeamMembers.length < 2) { setCreateTeamError("Team must have at least 2 members."); return; }
    setCreatingTeam(true);
    setCreateTeamError("");
    try {
      await teamService.create({
        name: newTeamName.trim(),
        team_ic: newTeamIC || null,
        members: newTeamMembers,
      });
      setShowCreateTeam(false);
      setNewTeamName("");
      setNewTeamIC("");
      setNewTeamMembers([]);
      loadTeams();
      loadWorkload();
    } catch (e) {
      const data = e?.response?.data;
      setCreateTeamError(
        data?.detail ||
        data?.non_field_errors?.[0] ||
        "Failed to create team."
      );
    } finally {
      setCreatingTeam(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = [user?.rank, user?.name?.split(" ")[0] || user?.service_number || "Officer"].filter(Boolean).join(" ");

  const handleProtectedDocumentOpen = async (url, label = "document") => {
    setDocumentError("");
    await openProtectedFile(url, { label, onError: setDocumentError });
  };

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {greeting}, {displayName}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {user?.detachment_name
              ? `${user.detachment_name} — Detachment Dashboard`
              : "Detachment Dashboard"}
          </p>
        </div>
        <NotificationBell />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
        <StatCard loading={loadingCounts} label="Total Cases" value={statusCounts.total}
          accent="bg-blue-500/10"
          onClick={() => navigate("/dashboard/cases")}
          icon={<svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>}
        />
        <StatCard loading={loadingCounts} label="RTA Cases" value={rtaCaseCount}
          accent="bg-amber-500/10"
          onClick={() => navigate(`/dashboard/cases?case_type=${RTA_CASE_TYPE}`)}
          icon={<svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 17h12M7 17a2 2 0 11-4 0 2 2 0 014 0zm14 0a2 2 0 11-4 0 2 2 0 014 0zM5 17l1.3-4.5A2 2 0 018.22 11h7.56a2 2 0 011.92 1.5L19 17M8 11l1.5-3h5L16 11"/></svg>}
        />
        <StatCard loading={loadingCounts} label="Tasked" value={statusCounts.tasked}
          accent="bg-yellow-500/10"
          onClick={() => navigate("/dashboard/cases?status=tasked")}
          icon={<svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>}
        />
        <StatCard loading={loadingCases} label="Det Cases" value={detachmentCases.length}
          accent="bg-cyan-500/10"
          onClick={() => {
            setCaseListMode("det");
            setDetCaseStatusFilter("all");
          }}
          icon={<svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M5 7v13h14V7M8 4h8l2 3H6l2-3zm1 7h6m-6 4h6"/></svg>}
        />
        <StatCard loading={loadingCounts} label="Under Investigation" value={statusCounts.under_investigation}
          accent="bg-indigo-500/10"
          onClick={() => navigate("/dashboard/cases?status=under_investigation")}
          icon={<svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>}
        />
        <StatCard loading={loadingCounts} label="Pending" value={statusCounts.pending}
          accent="bg-orange-500/10"
          onClick={() => navigate("/dashboard/cases?status=pending")}
          icon={<svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <StatCard loading={loadingCounts} label="Served" value={statusCounts.served}
          accent="bg-purple-500/10"
          onClick={() => navigate("/dashboard/cases?status=served")}
          icon={<svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <StatCard loading={loadingCounts} label="Closed" value={statusCounts.closed}
          accent="bg-green-500/10"
          onClick={() => navigate("/dashboard/cases?status=closed")}
          icon={<svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>}
        />
      </div>

      {/* Cases Table */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            {caseListMode === "det" ? "Cases Tasked to Detachments" : "Recent Cases"}
          </h3>
          <div className="flex items-center gap-3">
            {caseListMode === "det" && canTaskToChildDetachment && (
              <button
                onClick={openBulkTaskModal}
                disabled={taskableCases.length === 0 || companyDetachments.length === 0}
                className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                Task to Det
              </button>
            )}
            <button
              onClick={() => navigate("/dashboard/cases")}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors self-start sm:self-auto"
            >
              View All →
            </button>
          </div>
        </div>
        {caseListMode === "det" && (
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              ["all", "All"],
              ["under_investigation", "Under Investigation"],
              ["pending", "Pending"],
              ["served", "Served"],
              ["closed", "Closed"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setDetCaseStatusFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  detCaseStatusFilter === value
                    ? "bg-cyan-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                }`}
              >
                {label}
                <span className="ml-1.5 opacity-75">
                  {value === "all"
                    ? detachmentCases.length
                    : detachmentCases.filter((c) => c.status === value).length}
                </span>
              </button>
            ))}
          </div>
        )}
        {documentError && (
          <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {documentError}
          </p>
        )}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {loadingCases ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map((i) => (
                <div key={i} className="h-7 bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : visibleCases.length === 0 ? (
            <p className="p-5 text-gray-500 text-sm">
              {caseListMode === "det" ? "No cases have been tasked to detachments." : "No cases awaiting team assignment."}
            </p>
          ) : (
            <div className="max-h-[58vh] overflow-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
              <table className="sticky-head w-full min-w-[1520px] text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Case #</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Service No</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Rank</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Accused</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Unit</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Offence</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Description</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Tasking Letter</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Tasked Battalion/Company</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Deadline</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCases.map((c) => (
                  <tr key={c.id} className="border-b border-gray-700/40 hover:bg-gray-700/20 transition-colors">
                    <td className="px-3 md:px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {c.case_number || "--"}
                    </td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_service_number || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_rank || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_name || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 min-w-[150px] max-w-[240px]">
                      <p className="line-clamp-2 break-words">{caseAccusedUnitLabel(c) || "--"}</p>
                    </td>
                    <td className="px-3 md:px-5 py-3 text-gray-200 whitespace-nowrap">{c.offence_name || c.offence || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 min-w-[260px] max-w-[420px]">
                      {(() => {
                        const desc = caseDisplayDescription(c) || "--";
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
                    <td className="px-3 md:px-5 py-3">
                      {c.tasking_letter ? (
                        <button
                          type="button"
                          onClick={() => handleProtectedDocumentOpen(c.tasking_letter, "tasking letter")}
                          className="text-xs text-blue-400 hover:underline whitespace-nowrap"
                        >
                          View
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500">--</span>
                      )}
                    </td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">
                      {c.tasked_detachment_name
                        ? `${c.tasked_battalion_name || "--"} / ${c.tasked_company_name || "--"} / ${c.tasked_detachment_name}`
                        : c.tasked_company_name
                          ? `${c.tasked_battalion_name || "--"} / ${c.tasked_company_name}`
                          : c.tasked_battalion_name || "--"}
                    </td>
                    <td className="px-3 md:px-5 py-3 text-xs text-gray-400">
                      {c.investigation_deadline
                        ? new Date(c.investigation_deadline).toLocaleDateString("en-GB")
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 md:px-5 py-3 space-y-2">
                      {canTaskToChildDetachment &&
                        companyDetachments.length > 0 &&
                        c.status === "tasked" &&
                        String(c.tasked_company ?? c.tasked_company_id) === String(companyId) &&
                        !c.tasked_detachment &&
                        !c.assigned_team &&
                        !c.assigned_to && (
                        <button
                          onClick={() => openTaskDetachmentModal(c)}
                          className="px-3 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                        >
                          Task to Detachment
                        </button>
                      )}
                      {canManageDetachmentTeams && c.status === "tasked" && !c.assigned_team && !c.assigned_to && (
                        <button
                          onClick={() => openAssignModal(c)}
                          className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                        >
                          Assign IO / Team
                        </button>
                      )}
                      {c.assigned_to && (
                        <span className="text-xs text-indigo-300">{c.assigned_to_name || "Assigned IO"}</span>
                      )}
                      {c.assigned_team && (
                        <span className="text-xs text-cyan-300">{c.assigned_team_name || "Assigned Team"}</span>
                      )}
                      {c.status === "under_investigation" && (
                        <span className="text-xs text-indigo-400">Investigating</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Investigation Teams Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Investigation Teams
          </h3>
          {canManageDetachmentTeams && (
            <button
              onClick={() => {
                setShowCreateTeam(true);
                setNewTeamName("");
                setNewTeamIC("");
                setNewTeamMembers([]);
                setCreateTeamError("");
              }}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              + Create Team
            </button>
          )}
        </div>
        {loadingTeams ? (
          <div className="space-y-2">
            {[1,2].map((i) => (
              <div key={i} className="h-14 bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm">No investigation teams yet. Create your first team.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teams.map((t) => (
              <div key={t.id} className="bg-gray-800 rounded-xl px-4 md:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-white font-medium">{t.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.team_ic_detail?.name ? `IC: ${t.team_ic_detail.name}` : "No IC assigned"} ·{" "}
                    {t.members?.length ?? 0} member{t.members?.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
                  Team
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />

      {canTaskToChildDetachment && showBulkTaskModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowBulkTaskModal(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">Task Cases to Detachment</h2>
            <p className="text-sm text-gray-400 mb-4">Select company cases and the detachment that will receive them.</p>
            <div className="relative mb-3">
              <input
                type="search"
                value={taskableCaseSearch}
                onChange={(e) => setTaskableCaseSearch(e.target.value)}
                placeholder="Search by case number, accused, offence, service number..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 pl-9 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-amber-500"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z" />
              </svg>
            </div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={filteredTaskableCases.length > 0 && filteredTaskableCases.every((c) => selectedCaseIds.includes(c.id))}
                  onChange={() => {
                    const visibleIds = filteredTaskableCases.map((c) => c.id);
                    const allVisibleSelected = visibleIds.every((id) => selectedCaseIds.includes(id));
                    setSelectedCaseIds((prev) => allVisibleSelected
                      ? prev.filter((id) => !visibleIds.includes(id))
                      : [...new Set([...prev, ...visibleIds])]
                    );
                  }}
                  className="accent-amber-500"
                />
                Select all ({filteredTaskableCases.length})
              </label>
              <select value={bulkDetachment} onChange={(e) => setBulkDetachment(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                <option value="">-- Select Detachment --</option>
                {companyDetachments.map((det) => <option key={det.id} value={det.id}>{det.name}</option>)}
              </select>
            </div>
            <div className="border border-gray-700 rounded-lg divide-y divide-gray-700 max-h-80 overflow-y-auto">
              {taskableCases.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">There are no company cases awaiting detachment tasking.</p>
              ) : filteredTaskableCases.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No cases match your search.</p>
              ) : filteredTaskableCases.map((c) => (
                <label key={c.id} className="flex items-center gap-3 p-3 hover:bg-gray-700/50 cursor-pointer">
                  <input type="checkbox" checked={selectedCaseIds.includes(c.id)} onChange={() => toggleCaseSelection(c.id)} className="accent-amber-500" />
                  <span className="font-mono text-xs text-gray-300">{c.case_number}</span>
                  <span className="text-sm text-gray-200 truncate">{c.title || c.offence || "Untitled case"}</span>
                </label>
              ))}
            </div>
            {bulkTaskError && <p className="text-xs text-red-400 mt-3">{bulkTaskError}</p>}
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setShowBulkTaskModal(false)} className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300">Cancel</button>
              <button onClick={handleBulkTask} disabled={bulkTasking || !bulkDetachment || selectedCaseIds.length === 0} className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white">
                {bulkTasking ? "Tasking..." : `Task ${selectedCaseIds.length || ""} Case${selectedCaseIds.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign IO or Team Modal */}
      {canManageDetachmentTeams && assignModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setAssignModal(null)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-1">Assign Case</h2>
            <p className="text-sm text-gray-400 mb-5">
              Case <span className="font-mono text-gray-300">{assignModal.case_number}</span>:{" "}
              {assignModal.title || assignModal.offence}
            </p>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-900 p-1 border border-gray-700 mb-4">
              <button
                type="button"
                onClick={() => setAssignmentMode("io")}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  assignmentMode === "io"
                    ? "bg-indigo-600 text-white"
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
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                Team
              </button>
            </div>

            {assignmentMode === "io" ? (
              <>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Investigating Officer
                </label>
                <select
                  value={selIo}
                  onChange={(e) => setSelIo(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                >
                  <option value="">-- Select IO --</option>
                  {investigators.map((io) => (
                    <option key={io.id} value={io.id}>{userLabelWithWorkload(io, workloadMap)}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Investigation Team
                </label>
                <select
                  value={selTeam}
                  onChange={(e) => setSelTeam(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                >
                  <option value="">-- Select Team --</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </>
            )}

            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
              Investigation Deadline <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />

            {assignError && (
              <p className="text-xs text-red-400 mb-4">{assignError}</p>
            )}
            {assignmentMode === "io" && investigators.length === 0 && (
              <p className="text-xs text-orange-400 mb-4">No investigators found in this company.</p>
            )}
            {assignmentMode === "team" && teams.length === 0 && (
              <p className="text-xs text-orange-400 mb-4">No investigation teams found in this company.</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignTeam}
                disabled={assigning || !deadline || (assignmentMode === "io" ? !selIo : !selTeam)}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {assigning ? "Assigning..." : "Assign Case"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task to Detachment Modal */}
      {canTaskToChildDetachment && taskDetachmentModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setTaskDetachmentModal(null)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-1">Task Case to Detachment</h2>
            <p className="text-sm text-gray-400 mb-5">
              Case <span className="font-mono text-gray-300">{taskDetachmentModal.case_number}</span>: {taskDetachmentModal.title || taskDetachmentModal.offence}
            </p>

            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
              Select Detachment
            </label>
            <select
              value={selDetachment}
              onChange={(e) => setSelDetachment(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
            >
              <option value="">-- Select Detachment --</option>
              {companyDetachments.map((det) => (
                <option key={det.id} value={det.id}>{det.name}</option>
              ))}
            </select>

            {taskDetachmentError && (
              <p className="text-xs text-red-400 mb-4">{taskDetachmentError}</p>
            )}
            {companyDetachments.length === 0 && (
              <p className="text-xs text-orange-400 mb-4">No other detachments are available in this company.</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setTaskDetachmentModal(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTaskToDetachment}
                disabled={taskingDetachment || !selDetachment}
                className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {taskingDetachment ? "Tasking..." : "Task Case"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {canManageDetachmentTeams && showCreateTeam && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCreateTeam(false)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-5">Create Investigation Team</h2>

            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
              Team Name
            </label>
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="e.g. Alpha Investigation Team"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />

            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
              Team IC (optional)
            </label>
            <select
              value={newTeamIC}
              onChange={(e) => setNewTeamIC(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            >
              <option value="">-- Select IC --</option>
              {sortedDetUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabelWithWorkload(u, workloadMap)}
                </option>
              ))}
            </select>

            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
              Members <span className="text-gray-600">(select at least 2)</span>
            </label>
            <div className="bg-gray-700 rounded-lg p-3 max-h-52 overflow-y-auto space-y-1 mb-4">
              {sortedDetUsers.length === 0 ? (
                <p className="text-xs text-gray-500">No users found in this company.</p>
              ) : (
                sortedDetUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-600/40 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={newTeamMembers.includes(u.id)}
                      onChange={() => toggleMember(u.id)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-200">
                      {u.rank ? `${u.rank} ` : ""}{u.name}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {u.service_number || "--"} - {userWorkload(u, workloadMap)} active
                    </span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {newTeamMembers.length} member{newTeamMembers.length !== 1 ? "s" : ""} selected
            </p>

            {createTeamError && (
              <p className="text-xs text-red-400 mb-4">{createTeamError}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCreateTeam(false)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTeam}
                disabled={creatingTeam || !newTeamName.trim() || newTeamMembers.length < 2}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {creatingTeam ? "Creating..." : "Create Team"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
