import React, { useEffect, useState, useCallback } from "react";
import { teamService, userService } from "../services/api";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

/* ─── Create / Edit Team Modal ───────────────────────────── */
function TeamModal({ team, battalionUsers, onClose, onSaved }) {
  const isEdit = !!team;
  const [form, setForm] = useState({
    name: team?.name || "",
    team_ic: team?.team_ic || "",
    members: team?.members || [],
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function toggleMember(id) {
    setForm((f) => ({
      ...f,
      members: f.members.includes(id)
        ? f.members.filter((m) => m !== id)
        : [...f.members, id],
    }));
  }

  function handleIcChange(val) {
    // If the newly selected IC was already a member, remove them
    setForm((f) => ({
      ...f,
      team_ic: val,
      members: f.members.filter((m) => String(m) !== String(val)),
    }));
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Team name is required.";
    if (!form.team_ic) e.team_ic = "Team IC is required.";
    if (form.members.length < 2) e.members = "At least 2 members required.";
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setSubmitting(true); setErrors({});
    try {
      const payload = {
        name: form.name.trim(),
        team_ic: form.team_ic,
        members: form.members,
      };
      if (isEdit) {
        await teamService.update(team.id, payload);
      } else {
        await teamService.create(payload);
      }
      onSaved();
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        const mapped = {};
        if (data.name) mapped.name = [].concat(data.name).join(" ");
        if (data.team_ic) mapped.team_ic = [].concat(data.team_ic).join(" ");
        if (data.members) mapped.members = [].concat(data.members).join(" ");
        if (data.non_field_errors) mapped.general = [].concat(data.non_field_errors).join(" ");
        setErrors(Object.keys(mapped).length ? mapped : { general: "Failed to save team." });
      } else {
        setErrors({ general: "Failed to save team." });
      }
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <h3 className="text-white font-semibold text-base">
            {isEdit ? "Edit Team" : "Create New Team"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {errors.general && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">
              {errors.general}
            </div>
          )}

          {/* Team Name */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Team Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Alpha Investigation Team"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Team IC */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Team IC (In-Charge) <span className="text-red-400">*</span>
            </label>
            <select
              value={form.team_ic}
              onChange={(e) => handleIcChange(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select Team IC —</option>
              {battalionUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.rank ? `${u.rank} ` : ""}{u.name} ({u.service_number})
                </option>
              ))}
            </select>
            {errors.team_ic && <p className="text-red-400 text-xs mt-1">{errors.team_ic}</p>}
          </div>

          {/* Members */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Members <span className="text-red-400">*</span>
              <span className="text-gray-500 ml-1 normal-case">(min. 2, selected: {form.members.length})</span>
            </label>
            <div className="bg-gray-700/50 border border-gray-600 rounded max-h-48 overflow-y-auto">
              {battalionUsers.filter((u) => String(u.id) !== String(form.team_ic)).length === 0 ? (
                <p className="text-gray-500 text-xs p-3">No users available.</p>
              ) : (
                battalionUsers.filter((u) => String(u.id) !== String(form.team_ic)).map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-700/60 cursor-pointer border-b border-gray-700/50 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={form.members.includes(u.id)}
                      onChange={() => toggleMember(u.id)}
                      className="rounded border-gray-500 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-white">
                      {u.rank ? `${u.rank} ` : ""}{u.name}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">{u.service_number}</span>
                  </label>
                ))
              )}
            </div>
            {errors.members && <p className="text-red-400 text-xs mt-1">{errors.members}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : isEdit ? "Save Changes" : "Create Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Confirm Delete Dialog ──────────────────────────────── */
function ConfirmDelete({ team, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  async function doDelete() {
    setDeleting(true);
    try { await onConfirm(); } finally { setDeleting(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700 p-6">
        <h3 className="text-white font-semibold text-base mb-2">Delete Team?</h3>
        <p className="text-gray-400 text-sm mb-5">
          Are you sure you want to delete <span className="text-white font-medium">{team.name}</span>? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded">Cancel</button>
          <button onClick={doDelete} disabled={deleting}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded">
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Teams Page ─────────────────────────────────────────── */
export default function Teams({ user }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [battalionUsers, setBattalionUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editTeam, setEditTeam] = useState(null);
  const [deleteTeam, setDeleteTeam] = useState(null);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await teamService.list();
      setTeams(toArray(res.data));
    } catch {
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
    // Only investigators can be IC or members of an investigation team
    userService.list({ role: "investigator" }).then((res) => {
      const all = toArray(res.data);
      setBattalionUsers(all.filter((u) => u.role === "investigator"));
    }).catch(() => {});
  }, [loadTeams]);

  const isAdmin = user?.role === "admin";

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Investigation Teams</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {user?.battalion_name} — {teams.length} team{teams.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded transition-colors"
          >
            + New Team
          </button>
        )}
      </div>

      {/* Teams list */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading teams…</div>
      ) : teams.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-10 text-center">
          <svg className="w-10 h-10 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500 text-sm">No investigation teams yet.</p>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
            >
              Create first team
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <div key={team.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
              {/* Team header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-white font-semibold text-sm">{team.name}</h3>
                  <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-700/50 text-blue-300 mt-1">
                    Investigation Team
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setEditTeam(team)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTeam(team)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Team IC */}
              <div className="flex items-center gap-2 py-2 border-t border-gray-700">
                <span className="text-xs text-gray-400 shrink-0">Team IC:</span>
                {team.team_ic_detail ? (
                  <span className="text-xs text-white font-medium">
                    {team.team_ic_detail.rank ? `${team.team_ic_detail.rank} ` : ""}{team.team_ic_detail.name}
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">—</span>
                )}
              </div>

              {/* Members */}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">
                  Members ({team.members_detail?.length || 0})
                </p>
                <div className="space-y-1">
                  {team.members_detail?.slice(0, 4).map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-300">{m.rank ? `${m.rank} ` : ""}{m.name}</span>
                      <span className="text-gray-500">{m.service_number}</span>
                    </div>
                  ))}
                  {(team.members_detail?.length || 0) > 4 && (
                    <p className="text-xs text-gray-500">
                      +{team.members_detail.length - 4} more
                    </p>
                  )}
                  {(!team.members_detail || team.members_detail.length === 0) && (
                    <p className="text-xs text-gray-600">No members listed.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {(showCreate || editTeam) && (
        <TeamModal
          team={editTeam || null}
          battalionUsers={battalionUsers}
          onClose={() => { setShowCreate(false); setEditTeam(null); }}
          onSaved={() => { setShowCreate(false); setEditTeam(null); loadTeams(); }}
        />
      )}

      {deleteTeam && (
        <ConfirmDelete
          team={deleteTeam}
          onClose={() => setDeleteTeam(null)}
          onConfirm={async () => {
            await teamService.delete(deleteTeam.id);
            setDeleteTeam(null);
            loadTeams();
          }}
        />
      )}
    </div>
  );
}
