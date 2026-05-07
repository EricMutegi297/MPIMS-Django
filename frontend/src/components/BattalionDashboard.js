import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { caseService, incidentService, guardroomService, userService, teamService, formationService } from "../services/api";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

/* ─── Assign Team Modal (Special Battalion) ──────────────── */
function AssignTeamModal({ caseItem, teams, onClose, onSuccess }) {
  const [selectedTeam, setSelectedTeam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedTeam) { setError("Please select a team."); return; }
    setSubmitting(true); setError("");
    try {
      await caseService.update(caseItem.id, { assigned_team: selectedTeam });
      onSuccess();
    } catch (err) {
      const msg = err?.response?.data?.assigned_team || err?.response?.data?.non_field_errors || "Failed to assign team.";
      setError([].concat(msg).join(" "));
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold text-base">Assign to Investigation Team</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              <span className="text-blue-400 font-mono">{caseItem.case_number}</span>
              {" — "}{caseItem.accused_name || caseItem.title || "Case"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">{error}</div>
          )}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Investigation Team <span className="text-red-400">*</span>
            </label>
            {teams.length === 0 ? (
              <p className="text-yellow-400 text-sm">No teams found. Create a team first via the Teams menu.</p>
            ) : (
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.team_ic_detail ? ` (IC: ${t.team_ic_detail.name})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded">Cancel</button>
            <button type="submit" disabled={submitting || teams.length === 0}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded flex items-center justify-center gap-2">
              {submitting ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Assigning…</>
              ) : "Assign Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Task to Detachment Modal (Normal Battalion) ────────── */
function TaskDetachmentModal({ caseItem, detachments, onClose, onSuccess }) {
  const [selectedDet, setSelectedDet] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedDet) { setError("Please select a detachment."); return; }
    setSubmitting(true); setError("");
    try {
      await caseService.update(caseItem.id, { tasked_detachment: selectedDet });
      onSuccess();
    } catch (err) {
      const msg = err?.response?.data?.tasked_detachment || err?.response?.data?.non_field_errors || "Failed to task detachment.";
      setError([].concat(msg).join(" "));
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold text-base">Task Case to Detachment</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              <span className="text-blue-400 font-mono">{caseItem.case_number}</span>
              {" — "}{caseItem.accused_name || caseItem.title || "Case"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">{error}</div>
          )}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Detachment <span className="text-red-400">*</span>
            </label>
            {detachments.length === 0 ? (
              <p className="text-yellow-400 text-sm">No detachments found for this battalion.</p>
            ) : (
              <select
                value={selectedDet}
                onChange={(e) => setSelectedDet(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select detachment —</option>
                {detachments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.company ? ` (Coy ${d.company})` : ""}</option>
                ))}
              </select>
            )}
          </div>
          <p className="text-xs text-gray-500">Note: Tasking to a detachment will not change the case status.</p>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded">Cancel</button>
            <button type="submit" disabled={submitting || detachments.length === 0}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium rounded flex items-center justify-center gap-2">
              {submitting ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Tasking…</>
              ) : "Task to Detachment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function StatCard({ label, value, sub, color, onClick, icon, compact }) {
  const borders = {
    blue: "border-blue-500", red: "border-red-500", yellow: "border-yellow-500",
    green: "border-green-500", purple: "border-purple-500", teal: "border-teal-500",
    orange: "border-orange-500", gray: "border-gray-500", indigo: "border-indigo-500",
  };
  const accents = {
    blue: "text-blue-400", red: "text-red-400", yellow: "text-yellow-400",
    green: "text-green-400", purple: "text-purple-400", teal: "text-teal-400",
    orange: "text-orange-400", gray: "text-gray-400", indigo: "text-indigo-400",
  };
  const accentClass = accents[color] || "text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`
        group relative bg-gray-800 rounded-xl border-l-4 ${borders[color] || borders.blue}
        ${compact ? "p-3" : "p-4"} w-full text-left transition-all duration-200
        ${onClick ? "hover:scale-[1.02] hover:shadow-lg cursor-pointer" : "cursor-default"}
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
          <p className={`${compact ? "text-2xl" : "text-3xl"} font-bold mt-1 ${accentClass}`}>{value ?? 0}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className={`p-2 rounded-lg bg-gray-700/60 ${accentClass} shrink-0`}>{icon}</div>
        )}
      </div>
      {onClick && (
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
          <span>View all</span>
          <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-700 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-white font-medium">{value || "—"}</span>
    </div>
  );
}

export default function BattalionDashboard({ user }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [detachments, setDetachments] = useState([]);
  const [assignTeamModal, setAssignTeamModal] = useState(null);
  const [taskDetModal, setTaskDetModal] = useState(null);

  const isSpecial = user?.battalion_type === "special";
  const isNormal = user?.battalion_type === "normal";
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      const [casesRes, incidentsRes, guardroomsRes, usersRes] = await Promise.allSettled([
        caseService.list(),
        incidentService.list(),
        guardroomService.list(),
        userService.list(),
      ]);

      const cases = toArray(casesRes.value?.data);
      const incidents = toArray(incidentsRes.value?.data);
      const guardrooms = toArray(guardroomsRes.value?.data);
      const users = toArray(usersRes.value?.data);

      setStats({
        totalCases: cases.length,
        newCases: cases.filter((c) => c.status === "new").length,
        taskedCases: cases.filter((c) => c.status === "tasked").length,
        underInvestigation: cases.filter((c) => c.status === "under_investigation").length,
        pendingCases: cases.filter((c) => c.status === "pending").length,
        servedCases: cases.filter((c) => c.status === "served").length,
        closedCases: cases.filter((c) => c.status === "closed").length,
        totalIncidents: incidents.length,
        activeIncidents: incidents.filter((i) => i.status !== "closed" && i.status !== "resolved").length,
        totalGuardrooms: guardrooms.length,
        activeGuardrooms: guardrooms.filter((g) => g.is_active).length,
        totalPersonnel: users.length,
        activePersonnel: users.filter((u) => u.is_active).length,
        recentCases: cases.slice(0, 5),
        recentIncidents: incidents.slice(0, 5),
      });
      setLoading(false);
    }
    loadStats();
  }, []);

  // Load teams for Special battalion, detachments for Normal battalion
  useEffect(() => {
    if (!user) return;
    if (isSpecial) {
      teamService.list().then((res) => setTeams(toArray(res.data))).catch(() => {});
    }
    if (isNormal && user.battalion_id) {
      formationService.detachments({ battalion: user.battalion_id })
        .then((res) => setDetachments(toArray(res.data)))
        .catch(() => {});
    }
  }, [user, isSpecial, isNormal]);

  const BATTALION_TYPE_LABELS = {
    special: "Special",
    normal: "Normal",
    hqs: "HQs",
    protection: "Protection",
  };

  const battalionType = user?.battalion_type
    ? BATTALION_TYPE_LABELS[user.battalion_type] || user.battalion_type
    : null;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-4 sm:p-5 border border-gray-700">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">
              {user?.battalion_name || "Battalion"} Dashboard
            </h2>
            {battalionType && (
              <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-blue-700 text-blue-100 font-medium">
                {battalionType} Battalion
              </span>
            )}
            <p className="text-gray-400 text-sm mt-2">
              Welcome, <span className="text-white font-medium">{user?.rank} {user?.name}</span>
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Service No: <span className="text-gray-300">{user?.service_number}</span></p>
            <p className="mt-0.5">Role: <span className="text-gray-300 capitalize">{user?.role}</span></p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading statistics…</div>
      ) : stats ? (
        <>
          {/* Case status breakdown */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Case Overview</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
              <StatCard
                label="All Cases"
                value={stats.totalCases}
                color="blue"
                compact
                onClick={() => navigate("/dashboard/cases")}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
              />
              <StatCard
                label="New"
                value={stats.newCases}
                color="teal"
                compact
                onClick={() => navigate("/dashboard/cases")}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
              />
              <StatCard
                label="Tasked"
                value={stats.taskedCases}
                color="yellow"
                compact
                onClick={() => navigate("/dashboard/cases")}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
              />
              <StatCard
                label="Under Investigation"
                value={stats.underInvestigation}
                color="indigo"
                compact
                onClick={() => navigate("/dashboard/cases")}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" /></svg>}
              />
              <StatCard
                label="Pending"
                value={stats.pendingCases}
                color="orange"
                compact
                onClick={() => navigate("/dashboard/cases")}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard
                label="Served"
                value={stats.servedCases}
                color="green"
                compact
                onClick={() => navigate("/dashboard/cases")}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard
                label="Closed"
                value={stats.closedCases}
                color="gray"
                compact
                onClick={() => navigate("/dashboard/cases")}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
            </div>
          </div>

          {/* Other stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <StatCard
              label="Incidents"
              value={stats.totalIncidents}
              sub={`${stats.activeIncidents} unresolved`}
              color="red"
              onClick={() => navigate("/dashboard/incidents")}
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
            />
            <StatCard
              label="Guardrooms"
              value={stats.totalGuardrooms}
              sub={`${stats.activeGuardrooms} active`}
              color="purple"
              onClick={() => navigate("/dashboard/guardrooms")}
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
            />
            <StatCard
              label="Personnel"
              value={stats.totalPersonnel}
              sub={`${stats.activePersonnel} active`}
              color="yellow"
              onClick={() => navigate("/dashboard/users")}
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            />
          </div>

          {/* Recent activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recent Cases */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <span className="text-white text-sm font-medium">Recent Cases</span>
                <button
                  onClick={() => navigate("/dashboard/cases")}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  View all
                </button>
              </div>
              {stats.recentCases.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">No cases yet.</p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[320px]">
                  <thead className="bg-gray-700/50 text-gray-400 uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">No.</th>
                      <th className="text-left px-4 py-2">Accused</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-left px-4 py-2 hidden sm:table-cell">Date</th>
                      {isAdmin && (isSpecial || isNormal) && <th className="px-4 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentCases.map((c) => (
                      <tr key={c.id} className="border-t border-gray-700 hover:bg-gray-700/30 cursor-pointer" onClick={() => navigate("/dashboard/cases")}>
                        <td className="px-4 py-2 text-blue-400 font-mono">{c.case_number || "—"}</td>
                        <td className="px-4 py-2 text-white truncate max-w-[120px]">{c.accused_name || c.title || "—"}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{c.created_at?.slice(0, 10)}</td>
                        {isAdmin && (isSpecial || isNormal) && (
                          <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            {c.status === "tasked" && isSpecial && !c.assigned_team && (
                              <button
                                onClick={() => setAssignTeamModal(c)}
                                className="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-[11px] font-medium rounded whitespace-nowrap transition-colors"
                              >
                                Assign Team
                              </button>
                            )}
                            {c.status === "tasked" && isSpecial && c.assigned_team && (
                              <span className="text-[11px] text-indigo-400 font-medium">✓ Team Assigned</span>
                            )}
                            {c.status === "tasked" && isNormal && (
                              <button
                                onClick={() => setTaskDetModal(c)}
                                className="px-2 py-1 bg-teal-700 hover:bg-teal-600 text-white text-[11px] font-medium rounded whitespace-nowrap transition-colors"
                              >
                                {c.tasked_detachment ? "Re-assign Det." : "Task to Det."}
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

            {/* Recent Incidents */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <span className="text-white text-sm font-medium">Recent Incidents</span>
                <button
                  onClick={() => navigate("/dashboard/incidents")}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  View all
                </button>
              </div>
              {stats.recentIncidents.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">No incidents yet.</p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[300px]">
                  <thead className="bg-gray-700/50 text-gray-400 uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">No.</th>
                      <th className="text-left px-4 py-2">Type</th>
                      <th className="text-left px-4 py-2">Severity</th>
                      <th className="text-left px-4 py-2 hidden sm:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentIncidents.map((i) => (
                      <tr key={i.id} className="border-t border-gray-700 hover:bg-gray-700/30 cursor-pointer" onClick={() => navigate("/dashboard/incidents")}>
                        <td className="px-4 py-2 text-blue-400 font-mono">{i.incident_number || "—"}</td>
                        <td className="px-4 py-2 text-white truncate max-w-[120px]">{i.incident_type}</td>
                        <td className="px-4 py-2">
                          <SeverityBadge severity={i.severity} />
                        </td>
                        <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{i.date_occurred?.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "View Cases", path: "/dashboard/cases" },
                { label: "Log Incident", path: "/dashboard/incidents" },
                { label: "Morning Briefs", path: "/dashboard/morning-briefs" },
                { label: "Guardrooms", path: "/dashboard/guardrooms" },
                { label: "Manage Users", path: "/dashboard/users" },
                ...(isSpecial && isAdmin ? [{ label: "Teams", path: "/dashboard/teams" }] : []),
              ].map((action) => (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/* Modals */}
      {assignTeamModal && (
        <AssignTeamModal
          caseItem={assignTeamModal}
          teams={teams}
          onClose={() => setAssignTeamModal(null)}
          onSuccess={() => {
            setAssignTeamModal(null);
            // Refresh recent cases
            caseService.list().then((res) => {
              const cases = toArray(res.data);
              setStats((s) => s ? { ...s, recentCases: cases.slice(0, 5), taskedCases: cases.filter((c) => c.status === "tasked").length, underInvestigation: cases.filter((c) => c.status === "under_investigation").length } : s);
            }).catch(() => {});
          }}
        />
      )}
      {taskDetModal && (
        <TaskDetachmentModal
          caseItem={taskDetModal}
          detachments={detachments}
          onClose={() => setTaskDetModal(null)}
          onSuccess={() => {
            setTaskDetModal(null);
            caseService.list().then((res) => {
              const cases = toArray(res.data);
              setStats((s) => s ? { ...s, recentCases: cases.slice(0, 5) } : s);
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    new: "bg-teal-900/50 text-teal-300",
    open: "bg-blue-900/50 text-blue-300",
    tasked: "bg-yellow-900/50 text-yellow-300",
    under_investigation: "bg-indigo-900/50 text-indigo-300",
    pending: "bg-orange-900/50 text-orange-300",
    served: "bg-green-900/50 text-green-300",
    closed: "bg-gray-700 text-gray-400",
    referred: "bg-purple-900/50 text-purple-300",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${map[status] || "bg-gray-700 text-gray-400"}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const map = {
    low: "bg-green-900/50 text-green-300",
    medium: "bg-yellow-900/50 text-yellow-300",
    high: "bg-orange-900/50 text-orange-300",
    critical: "bg-red-900/50 text-red-300",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${map[severity] || "bg-gray-700 text-gray-400"}`}>
      {severity}
    </span>
  );
}
