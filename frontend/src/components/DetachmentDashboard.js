import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { caseService, teamService, userService } from "../services/api";
import NotificationBell from "./NotificationBell";
import useAutoDismiss from "../hooks/useAutoDismiss";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
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

function StatCard({ icon, label, value, accent, loading, onClick }) {
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
  const canManageDetachmentTeams = user?.role === "detachment";

  // Cases
  const [cases, setCases]               = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [statusCounts, setStatusCounts] = useState({
    total: 0, new: 0, tasked: 0, under_investigation: 0, pending: 0, served: 0, closed: 0,
  });
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [expandedDesc, setExpandedDesc] = useState({});

  // Teams
  const [teams, setTeams]               = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  // Detachment users (for team creation)
  const [detUsers, setDetUsers]         = useState([]);

  // Assign team modal
  const [assignModal, setAssignModal]   = useState(null); // case object
  const [selTeam, setSelTeam]           = useState("");
  const [deadline, setDeadline]         = useState("");
  const [assigning, setAssigning]       = useState(false);
  const [assignError, setAssignError]   = useState("");

  // Create team modal
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName]       = useState("");
  const [newTeamIC, setNewTeamIC]           = useState("");
  const [newTeamMembers, setNewTeamMembers] = useState([]);
  const [creatingTeam, setCreatingTeam]     = useState(false);
  const [createTeamError, setCreateTeamError] = useState("");
  useAutoDismiss(assignError, setAssignError);
  useAutoDismiss(createTeamError, setCreateTeamError);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const res = await caseService.list({ page_size: 100 });
      setCases(toArray(res.data));
    } catch {
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  }, []);
  const descLimit = 120;

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const [allRes, newRes, taskedRes, uiRes, peRes, seRes, clRes] = await Promise.all([
        caseService.list({ page_size: 1 }),
        caseService.list({ page_size: 1, status: "new" }),
        caseService.list({ page_size: 1, status: "tasked" }),
        caseService.list({ page_size: 1, status: "under_investigation" }),
        caseService.list({ page_size: 1, status: "pending" }),
        caseService.list({ page_size: 1, status: "served" }),
        caseService.list({ page_size: 1, status: "closed" }),
      ]);
      setStatusCounts({
        total:               allRes.data.count || 0,
        new:                 newRes.data.count || 0,
        tasked:              taskedRes.data.count || 0,
        under_investigation: uiRes.data.count || 0,
        pending:             peRes.data.count || 0,
        served:              seRes.data.count || 0,
        closed:              clRes.data.count || 0,
      });
    } catch {
      // keep zeros
    } finally {
      setLoadingCounts(false);
    }
  }, []);

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

  useEffect(() => scheduleAfterPaint(() => {
    loadCases();
    loadCounts();
    loadTeams();
  }), [loadCases, loadCounts, loadTeams]);

  useEffect(() => {
    if (canManageDetachmentTeams && detachmentId) {
      userService.list({ detachment: detachmentId, page_size: 200 })
        .then((r) => setDetUsers(toArray(r.data)))
        .catch(() => {});
    }
  }, [canManageDetachmentTeams, detachmentId]);

  // Assign team
  const openAssignModal = (c) => {
    if (!canManageDetachmentTeams) return;
    setShowCreateTeam(false);
    setAssignModal(c);
    setSelTeam(c.assigned_team || "");
    setDeadline(c.investigation_deadline || "");
    setAssignError("");
  };

  const handleAssignTeam = async () => {
    if (!canManageDetachmentTeams) { setAssignError("Only Detachment IC can assign investigation teams."); return; }
    if (!selTeam) { setAssignError("Please select a team."); return; }
    if (!deadline) { setAssignError("Investigation deadline is required."); return; }
    setAssigning(true);
    setAssignError("");
    try {
      await caseService.update(assignModal.id, {
        assigned_team: selTeam,
        investigation_deadline: deadline,
      });
      setAssignModal(null);
      loadCases();
      loadCounts();
    } catch (e) {
      const data = e?.response?.data;
      setAssignError(
        data?.detail ||
        data?.non_field_errors?.[0] ||
        data?.investigation_deadline?.[0] ||
        "Failed to assign team."
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
    if (!canManageDetachmentTeams) { setCreateTeamError("Only Detachment IC can create investigation teams."); return; }
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard loading={loadingCounts} label="Total Cases" value={statusCounts.total}
          accent="bg-blue-500/10"
          onClick={() => navigate("/dashboard/cases")}
          icon={<svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>}
        />
        <StatCard loading={loadingCounts} label="Tasked" value={statusCounts.tasked}
          accent="bg-yellow-500/10"
          onClick={() => navigate("/dashboard/cases?status=tasked")}
          icon={<svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>}
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
            Recent Cases
          </h3>
          <button
            onClick={() => navigate("/dashboard/cases")}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors self-start sm:self-auto"
          >
            View All →
          </button>
        </div>
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {loadingCases ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map((i) => (
                <div key={i} className="h-7 bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : cases.filter((c) => c.status === "tasked").length === 0 ? (
            <p className="p-5 text-gray-500 text-sm">No cases awaiting team assignment.</p>
          ) : (
            <div className="max-h-[58vh] overflow-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
              <table className="sticky-head w-full min-w-[1380px] text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Case #</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Service No</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Rank</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Accused</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Offence</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Description</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Tasking Letter</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Tasked Battalion/Detachment</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Deadline</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.filter((c) => c.status === "tasked").map((c) => (
                  <tr key={c.id} className="border-b border-gray-700/40 hover:bg-gray-700/20 transition-colors">
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
                    <td className="px-3 md:px-5 py-3 text-xs text-gray-400">
                      {c.investigation_deadline
                        ? new Date(c.investigation_deadline).toLocaleDateString("en-GB")
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 md:px-5 py-3">
                      {canManageDetachmentTeams && c.status === "tasked" && (
                        <button
                          onClick={() => openAssignModal(c)}
                          className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                        >
                          Assign Team
                        </button>
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

      {/* Assign Team Modal */}
      {canManageDetachmentTeams && assignModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setAssignModal(null)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-1">Assign Investigation Team</h2>
            <p className="text-sm text-gray-400 mb-5">
              Case <span className="font-mono text-gray-300">{assignModal.case_number}</span>:{" "}
              {assignModal.title || assignModal.offence}
            </p>

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

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignTeam}
                disabled={assigning || !selTeam || !deadline}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {assigning ? "Assigning..." : "Assign Team"}
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
              {detUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.rank ? `${u.rank} ` : ""}{u.name} ({u.service_number})
                </option>
              ))}
            </select>

            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
              Members <span className="text-gray-600">(select at least 2)</span>
            </label>
            <div className="bg-gray-700 rounded-lg p-3 max-h-52 overflow-y-auto space-y-1 mb-4">
              {detUsers.length === 0 ? (
                <p className="text-xs text-gray-500">No users found in this detachment.</p>
              ) : (
                detUsers.map((u) => (
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
                    <span className="text-xs text-gray-500 ml-auto">{u.service_number}</span>
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
