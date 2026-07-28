import React, { useEffect, useState, useCallback, useRef } from "react";
import { teamService, userService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

const ROLE_LABELS = {
  investigator: "Investigator",
  personnel:    "Personnel",
  detachment:   "IC Det",
};

function displayUser(u) {
  if (!u) return "—";
  const name = u.name ?? String(u);
  // Don't prepend rank if name already starts with it
  if (!u.rank || name.startsWith(u.rank)) return name;
  return `${u.rank} ${name}`;
}

// Fixed-position modal listing team members
function MembersModal({ teamName, members, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={ref}
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-white">{teamName} — Members</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-2 max-h-72 overflow-y-auto">
          {members.length === 0 ? (
            <p className="text-xs text-gray-500 px-3 py-4 text-center">No members assigned.</p>
          ) : members.map((m, i) => (
            <div key={m.id ?? i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700/60">
              <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
              <span className="text-sm text-gray-200 flex-1">{displayUser(m)}</span>
              <span className="text-xs text-gray-500">{m.service_number}</span>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-gray-700 text-right">
          <span className="text-xs text-gray-500">{members.length} member{members.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}


// Shared form for Create/Edit outside Teams so React never remounts it
function TeamFormFields({ name, setName, ic, onICChange, mems, toggleMem, eligibleMems, error, detUsers, workloadMap }) {
  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-red-400 bg-red-900/30 rounded px-3 py-2">{error}</p>
      )}
      <div>
        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
          Team Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alpha Investigation Team"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
          Team IC <span className="text-red-400">*</span>
        </label>
        <select
          value={ic}
          onChange={(e) => onICChange(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Select Team IC --</option>
          {detUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.rank ? `${u.rank} ` : ""}{u.name} - {ROLE_LABELS[u.role] || u.role} ({u.service_number})
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-400 uppercase tracking-wider">
            Members <span className="text-red-400">*</span>{" "}
            <span className="text-gray-600 normal-case tracking-normal">-- at least 2{ic ? " (IC excluded)" : ""}</span>
          </label>
          <span className="text-xs text-gray-600 italic">least engaged first</span>
        </div>
        <div className="flex items-center gap-4 mb-2 px-1">
          <span className="inline-flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />0 cases</span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />1-2 cases</span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />3+ cases</span>
        </div>
        {eligibleMems.length === 0 ? (
          <p className="text-sm text-gray-500 bg-gray-700/50 rounded-lg px-3 py-4 text-center">
            {ic ? "No other members available." : "No investigators or personnel found."}
          </p>
        ) : (
          <div className="bg-gray-700/60 rounded-lg p-3 max-h-52 overflow-y-auto space-y-0.5">
            {eligibleMems.map((u) => {
              const load = workloadMap[u.id] ?? 0;
              const dot  = load === 0 ? "bg-emerald-500" : load <= 2 ? "bg-yellow-500" : "bg-red-500";
              const badge = load === 0 ? "bg-emerald-900/50 text-emerald-400" : load <= 2 ? "bg-yellow-900/50 text-yellow-400" : "bg-red-900/50 text-red-400";
              return (
                <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-600/40 px-2 py-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={mems.includes(u.id)}
                    onChange={() => toggleMem(u.id)}
                    className="accent-blue-500 shrink-0"
                  />
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                  <span className="text-sm text-gray-200 flex-1">
                    {u.rank ? `${u.rank} ` : ""}{u.name}
                  </span>
                  <span className="text-xs text-indigo-400">{ROLE_LABELS[u.role] || u.role}</span>
                  <span className="text-xs text-gray-500">{u.service_number}</span>
                  <span
                    title={`${load} case${load !== 1 ? "s" : ""} under investigation`}
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${badge}`}
                  >{load}</span>
                </label>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1.5">
          {mems.length} member{mems.length !== 1 ? "s" : ""} selected
        </p>
      </div>
    </div>
  );
}

export default function Teams({ user, scope = "detachment" }) {
  const isDetachmentIC = user?.role === "detachment";
  const isBattalionScope = scope === "battalion";
  const canManageTeams = isDetachmentIC || isBattalionScope;
  const scopeId = isBattalionScope ? (user?.battalion ?? user?.battalion_id) : (user?.detachment ?? user?.detachment_id);

  const [teams, setTeams]               = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [detUsers, setDetUsers]         = useState([]);
  const [memberListPopup, setMemberListPopup] = useState(null); // { teamName, members }

  // ── Active tab ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("teams"); // "teams" | "workload"

  // ── Workload ──────────────────────────────────────────────────
  const [workload, setWorkload]           = useState([]);
  const [loadingWorkload, setLoadingWorkload] = useState(false);
  // map userId → total_engagement for badge display in form
  const workloadMap = Object.fromEntries(workload.map((w) => [w.id, w.total_engagement]));

  const loadWorkload = useCallback(() => {
    setLoadingWorkload(true);
    teamService.workload()
      .then((r) => setWorkload(Array.isArray(r.data) ? r.data : []))
      .catch(() => setWorkload([]))
      .finally(() => setLoadingWorkload(false));
  }, []);

  // â”€â”€ Create modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showCreate, setShowCreate]   = useState(false);
  const [teamName, setTeamName]       = useState("");
  const [teamIC, setTeamIC]           = useState("");
  const [members, setMembers]         = useState([]);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState("");

  // â”€â”€ Edit modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [editingTeam, setEditingTeam]   = useState(null);
  const [editName, setEditName]         = useState("");
  const [editIC, setEditIC]             = useState("");
  const [editMembers, setEditMembers]   = useState([]);
  const [editing, setEditing]           = useState(false);
  const [editError, setEditError]       = useState("");
  useAutoDismiss(createError, setCreateError);
  useAutoDismiss(editError, setEditError);

  // â”€â”€ Delete confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting]               = useState(false);

  const loadTeams = useCallback(() => {
    setLoadingTeams(true);
    const params = { page_size: 200 };
    if (scopeId) {
      if (isBattalionScope) params.battalion = scopeId;
      else params.detachment = scopeId;
    }
    teamService.list(params)
      .then((r) => setTeams(toArray(r.data)))
      .catch(() => setTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [isBattalionScope, scopeId]);

  useEffect(() => { loadTeams(); loadWorkload(); }, [loadTeams, loadWorkload]);

  useEffect(() => {
    if (!scopeId) return;
    const params = { page_size: 200 };
    if (isBattalionScope) params.battalion = scopeId;
    else params.detachment = scopeId;
    userService.list(params)
      .then((r) => {
        const all = toArray(r.data);
        if (isBattalionScope) {
          setDetUsers(all.filter((u) => ["investigator", "personnel", "detachment", "admin"].includes(u.role)));
        } else {
          setDetUsers(all.filter((u) => ["investigator", "personnel", "detachment"].includes(u.role)));
        }
      })
      .catch(() => setDetUsers([]));
  }, [isBattalionScope, scopeId]);

  // â”€â”€ Create helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Sort least-engaged first using workload data
  const byLoad = (a, b) => (workloadMap[a.id] ?? 0) - (workloadMap[b.id] ?? 0);
  const eligibleCreateMembers = detUsers
    .filter((u) => String(u.id) !== String(teamIC))
    .sort(byLoad);

  const handleICChange = (val) => {
    setTeamIC(val);
    setMembers((prev) => prev.filter((id) => String(id) !== String(val)));
  };

  const toggleMember = (id) =>
    setMembers((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  const openCreate = () => {
    setTeamName(""); setTeamIC(""); setMembers([]); setCreateError("");
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!teamName.trim())   { setCreateError("Team name is required."); return; }
    if (!teamIC)            { setCreateError("Team IC is required."); return; }
    if (members.length < 2) { setCreateError("Select at least 2 members."); return; }
    setCreating(true); setCreateError("");
    try {
      await teamService.create({ name: teamName.trim(), team_ic: teamIC, members });
      setShowCreate(false);
      loadTeams();
    } catch (e) {
      const d = e?.response?.data;
      setCreateError(d?.detail || d?.non_field_errors?.[0] || d?.members?.[0] || "Failed to create team.");
    } finally {
      setCreating(false);
    }
  };

  // â”€â”€ Edit helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const eligibleEditMembers = detUsers
    .filter((u) => String(u.id) !== String(editIC))
    .sort(byLoad);

  const handleEditICChange = (val) => {
    setEditIC(val);
    setEditMembers((prev) => prev.filter((id) => String(id) !== String(val)));
  };

  const toggleEditMember = (id) =>
    setEditMembers((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  const openEdit = (t) => {
    setEditingTeam(t);
    setEditName(t.name ?? "");
    setEditIC(t.team_ic != null ? String(t.team_ic) : "");
    // members PKs, exclude IC
    const mPks = (t.members ?? []).map((m) => (typeof m === "object" ? m.id : m));
    setEditMembers(mPks.filter((id) => String(id) !== String(t.team_ic)));
    setEditError("");
  };

  const handleEdit = async () => {
    if (!editName.trim())        { setEditError("Team name is required."); return; }
    if (!editIC)                 { setEditError("Team IC is required."); return; }
    if (editMembers.length < 2)  { setEditError("Select at least 2 members."); return; }
    setEditing(true); setEditError("");
    try {
      await teamService.update(editingTeam.id, {
        name: editName.trim(),
        team_ic: editIC,
        members: editMembers,
      });
      setEditingTeam(null);
      loadTeams();
    } catch (e) {
      const d = e?.response?.data;
      setEditError(d?.detail || d?.non_field_errors?.[0] || d?.members?.[0] || "Failed to update team.");
    } finally {
      setEditing(false);
    }
  };

  // â”€â”€ Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await teamService.delete(id);
      setConfirmDeleteId(null);
      loadTeams();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };


  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {isBattalionScope ? "Battalion Teams" : "Investigation Teams"}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isBattalionScope
              ? (user?.battalion_name ? `${user.battalion_name} Teams` : "Battalion Teams")
              : (user?.detachment_name ? `${user.detachment_name} Detachment` : "Detachment Teams")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); loadTeams(); }}
            className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          {canManageTeams && (
            <button
              onClick={(e) => { e.stopPropagation(); openCreate(); }}
              className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Team
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 bg-gray-800 rounded-lg p-1 w-fit border border-gray-700">
        <button
          onClick={() => setActiveTab("teams")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "teams" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
        >Teams</button>
        <button
          onClick={() => setActiveTab("workload")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "workload" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
        >Workload</button>
      </div>

      {/* Workload tab */}
      {activeTab === "workload" && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Personnel Engagement (Cases Under Investigation)</h3>
            {loadingWorkload && <span className="text-xs text-gray-500 animate-pulse">Loading...</span>}
          </div>
          {workload.length === 0 && !loadingWorkload ? (
            <p className="text-gray-500 text-sm text-center py-10">No workload data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/80 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-10">#</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">As IC</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">As Member</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {[...workload].sort((a, b) => (a.total_engagement ?? 0) - (b.total_engagement ?? 0)).map((w, idx) => {
                    const total = w.total_engagement ?? 0;
                    const totalColor = total === 0 ? "text-emerald-400" : total <= 2 ? "text-yellow-400" : "text-red-400";
                    const barColor  = total === 0 ? "bg-emerald-500" : total <= 2 ? "bg-yellow-500" : "bg-red-500";
                    const maxLoad   = Math.max(...workload.map((x) => x.total_engagement ?? 0), 1);
                    return (
                      <tr key={w.id} className="hover:bg-gray-700/40 transition-colors">
                        <td className="px-4 py-3 text-gray-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="text-white text-sm font-medium">{w.rank ? `${w.rank} ` : ""}{w.name}</div>
                          <div className="text-xs text-gray-500">{w.service_number}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-indigo-400">{ROLE_LABELS[w.role] || w.role}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-300">{w.ic_cases ?? 0}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-300">{w.member_cases ?? 0}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-sm font-bold ${totalColor}`}>{total}</span>
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.round((total / maxLoad) * 100)}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Teams table */}
      {activeTab === "teams" && (
        <>
          {loadingTeams ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />)}
        </div>
          ) : teams.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-10 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500">No investigation teams yet.</p>
          {canManageTeams && (
            <button onClick={openCreate} className="mt-4 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              Create First Team
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-10">#</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Team IC</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Members</th>
                {canManageTeams && (
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {teams.map((t, idx) => {
                const memberDetail = Array.isArray(t.members_detail) ? t.members_detail : [];
                const count = memberDetail.length || (Array.isArray(t.members) ? t.members.length : 0);
                const icDetail = t.team_ic_detail;

                return (
                  <tr key={t.id} className="bg-gray-800/60 hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 text-gray-500 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 text-white font-semibold">{t.name}</td>
                    <td className="px-4 py-3">
                      {icDetail
                        ? <span className="text-indigo-300 text-sm">{displayUser(icDetail)}</span>
                        : <span className="text-gray-600 italic text-xs">â€”</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setMemberListPopup({ teamName: t.name, members: memberDetail })}
                        className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-indigo-700/60 border border-gray-600 hover:border-indigo-500 text-gray-200 text-xs font-medium px-3 py-1 rounded-full transition-colors"
                      >
                        <svg className="w-3 h-3 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                        {count} member{count !== 1 ? "s" : ""}
                      </button>
                    </td>
                    {canManageTeams && (
                      <td className="px-4 py-3 text-right">
                        {confirmDeleteId === t.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-gray-400">Delete?</span>
                            <button
                              onClick={() => handleDelete(t.id)}
                              disabled={deleting}
                              className="text-xs text-red-400 hover:text-red-300 font-semibold disabled:opacity-60"
                            >Yes</button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-gray-400 hover:text-white"
                            >No</button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-3">
                            <button
                              onClick={() => openEdit(t)}
                              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                            >Edit</button>
                            <button
                              onClick={() => setConfirmDeleteId(t.id)}
                              className="text-xs text-red-400 hover:text-red-300 font-medium"
                            >Delete</button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}

      {/* Members List Modal */}
      {memberListPopup && (
        <MembersModal
          teamName={memberListPopup.teamName}
          members={memberListPopup.members}
          onClose={() => setMemberListPopup(null)}
        />
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Create Investigation Team</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <TeamFormFields
              name={teamName} setName={setTeamName}
              ic={teamIC} onICChange={handleICChange}
              mems={members} toggleMem={toggleMember}
              eligibleMems={eligibleCreateMembers}
              error={createError}
              detUsers={detUsers}
              workloadMap={workloadMap}
            />
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating || !teamName.trim() || !teamIC || members.length < 2}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {creating ? "Creatingâ€¦" : "Create Team"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Edit Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {editingTeam && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingTeam(null)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Edit Team â€” {editingTeam.name}</h2>
              <button onClick={() => setEditingTeam(null)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <TeamFormFields
              name={editName} setName={setEditName}
              ic={editIC} onICChange={handleEditICChange}
              mems={editMembers} toggleMem={toggleEditMember}
              eligibleMems={eligibleEditMembers}
              error={editError}
            />
            <div className="flex gap-3 justify-end mt-6">
              detUsers={detUsers}
              workloadMap={workloadMap}
            />
              <button
                onClick={handleEdit}
                disabled={editing || !editName.trim() || !editIC || editMembers.length < 2}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {editing ? "Savingâ€¦" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
