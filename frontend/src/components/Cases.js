import React, { useEffect, useState, useCallback, useRef } from "react";
import { caseService, offenceService, formationService, teamService } from "../services/api";

/* ─── Task Case Modal ─────────────────────────────────────── */
function TaskCaseModal({ caseItem, onClose, onSuccess }) {
  const fileRef = useRef();
  const [battalions, setBattalions] = useState([]);
  const [form, setForm] = useState({ tasked_battalion: "", tasking_date: new Date().toISOString(), tasking_letter: null });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    formationService.battalions().then((res) => {
      const all = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.results) ? res.data.results : [];
      const sorted = all.filter((b) => b.battalion_type === "normal" || b.battalion_type === "special");
      sorted.sort((a, b) => a.battalion_type.localeCompare(b.battalion_type) || a.name.localeCompare(b.name));
      setBattalions(sorted);
    }).catch(() => {});
  }, []);

  function validate() {
    const e = {};
    if (!form.tasked_battalion) e.tasked_battalion = "Select a battalion.";
    if (!form.tasking_letter) e.tasking_letter = "Attach a tasking letter.";
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setSubmitting(true); setErrors({});
    try {
      const fd = new FormData();
      fd.append("tasked_battalion", form.tasked_battalion);
      fd.append("tasking_date", new Date(form.tasking_date).toISOString());
      fd.append("tasking_letter", form.tasking_letter);
      await caseService.taskCase(caseItem.id, fd);
      onSuccess();
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        const mapped = {};
        if (data.tasked_battalion) mapped.tasked_battalion = [].concat(data.tasked_battalion).join(" ");
        if (data.tasking_letter) mapped.tasking_letter = [].concat(data.tasking_letter).join(" ");
        if (data.tasking_date) mapped.tasking_date = [].concat(data.tasking_date).join(" ");
        if (data.non_field_errors) mapped.general = [].concat(data.non_field_errors).join(" ");
        setErrors(Object.keys(mapped).length ? mapped : { general: "Tasking failed. Please try again." });
      } else {
        setErrors({ general: "Tasking failed. Please try again." });
      }
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold text-base">Task Case</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              <span className="text-blue-400 font-mono">{caseItem.case_number}</span>{" — "}{caseItem.accused_name || caseItem.title || "Case"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errors.general && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">{errors.general}</div>
          )}
          {/* Battalion */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Task To Battalion <span className="text-red-400">*</span></label>
            <select value={form.tasked_battalion} onChange={(e) => setForm((f) => ({ ...f, tasked_battalion: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Select battalion —</option>
              {battalions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.tasked_battalion && <p className="text-red-400 text-xs mt-1">{errors.tasked_battalion}</p>}
          </div>
          {/* Letter upload */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">Tasking Letter <span className="text-red-400">*</span></label>
            <div onClick={() => fileRef.current?.click()}
              className="w-full bg-gray-700 border-2 border-dashed border-gray-600 rounded px-4 py-3 cursor-pointer hover:border-blue-500 transition-colors text-center">
              {form.tasking_letter ? (
                <p className="text-sm text-green-400 font-medium">{form.tasking_letter.name}</p>
              ) : (
                <div>
                  <svg className="w-6 h-6 text-gray-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <p className="text-gray-400 text-xs">Click to attach tasking letter (PDF, Word, image)</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setForm((prev) => ({ ...prev, tasking_letter: f })); }} />
            {errors.tasking_letter && <p className="text-red-400 text-xs mt-1">{errors.tasking_letter}</p>}
          </div>
          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors">Cancel</button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2">
              {submitting ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Tasking…</>
              ) : "Confirm Tasking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
              <span className="text-blue-400 font-mono">{caseItem.case_number}</span>{" — "}{caseItem.accused_name || caseItem.title || "Case"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Investigation Team <span className="text-red-400">*</span>
            </label>
            {teams.length === 0 ? (
              <p className="text-yellow-400 text-sm">No teams found. Create a team via the Teams menu first.</p>
            ) : (
              <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.team_ic_detail ? ` (IC: ${t.team_ic_detail.name})` : ""}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded">Cancel</button>
            <button type="submit" disabled={submitting || teams.length === 0}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded flex items-center justify-center gap-2">
              {submitting ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Assigning…</>) : "Assign Team"}
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
              <span className="text-blue-400 font-mono">{caseItem.case_number}</span>{" — "}{caseItem.accused_name || caseItem.title || "Case"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Detachment <span className="text-red-400">*</span>
            </label>
            {detachments.length === 0 ? (
              <p className="text-yellow-400 text-sm">No detachments found for this battalion.</p>
            ) : (
              <select value={selectedDet} onChange={(e) => setSelectedDet(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select detachment —</option>
                {detachments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.company ? ` (Coy ${d.company})` : ""}</option>
                ))}
              </select>
            )}
          </div>
          <p className="text-xs text-gray-500">Note: Tasking to a detachment will not change the case status.</p>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded">Cancel</button>
            <button type="submit" disabled={submitting || detachments.length === 0}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium rounded flex items-center justify-center gap-2">
              {submitting ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Tasking…</>) : "Task to Detachment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  new: "bg-teal-500/20 text-teal-400 border border-teal-500/30",
  open: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  tasked: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  under_investigation: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  closed: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
  referred: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
  pending: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
};

const STATUS_OPTIONS = ["", "new", "open", "tasked", "under_investigation", "closed", "referred", "pending"];

const RANKS = [
  "General", "Lieutenant General", "Major General", "Brigadier", "Colonel",
  "Lieutenant Colonel", "Major", "Captain", "Lieutenant", "Second Lieutenant",
  "Warrant Officer Class 1", "Warrant Officer Class 2", "Senior Sergeant",
  "Sergeant", "Corporal", "Lance Corporal", "Private", "Recruit",
];

export default function Cases({ user }) {
  const [cases, setCases] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const canCreate =
    user?.is_superuser ||
    (user?.role === "admin" && user?.battalion_type === "hqs");

  const canTask =
    user?.is_superuser ||
    (user?.role === "admin" && user?.battalion_type === "hqs");

  const canAssignTeam = user?.role === "admin" && user?.battalion_type === "special";
  const canTaskDetachment = user?.role === "admin" && user?.battalion_type === "normal";
  const showActionCol = canTask || canAssignTeam || canTaskDetachment;

  const [taskModal, setTaskModal] = useState(null);
  const [assignTeamModal, setAssignTeamModal] = useState(null);
  const [taskDetModal, setTaskDetModal] = useState(null);
  const [teams, setTeams] = useState([]);
  const [detachments, setDetachments] = useState([]);

  // Load teams or detachments once based on battalion type
  useEffect(() => {
    if (canAssignTeam) {
      teamService.list().then((r) => {
        const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
        setTeams(items);
      }).catch(() => {});
    }
    if (canTaskDetachment && user?.battalion_id) {
      formationService.detachments({ battalion: user.battalion_id }).then((r) => {
        const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
        setDetachments(items);
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAssignTeam, canTaskDetachment]);

  const load = useCallback(() => {
    setLoading(true);
    caseService
      .list({ page, status: status || undefined, search: search || undefined })
      .then((r) => {
        const items = Array.isArray(r.data)
          ? r.data
          : Array.isArray(r.data?.results)
          ? r.data.results
          : [];
        setCases(items);
        setCount(r.data?.count ?? items.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, status, search]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(count / 20);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Cases</h2>
          <p className="text-gray-400 text-sm mt-0.5">{count} total</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            + New Case
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
          placeholder="Search case # or accused..."
          className="bg-gray-800 text-white text-sm px-3 py-1.5 rounded border border-gray-700 focus:outline-none focus:border-blue-500 w-full sm:w-64"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="bg-gray-800 text-white text-sm px-3 py-1.5 rounded border border-gray-700 focus:outline-none focus:border-blue-500 w-full sm:w-auto"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>
          ))}
        </select>
      </div>

      <div className="bg-gray-800 rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 whitespace-nowrap">Case #</th>
              <th className="text-left px-4 py-3">Accused</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Svc No</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Offence</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Type</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Tasked To</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
              {showActionCol && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={showActionCol ? 9 : 8} className="px-4 py-10 text-center text-gray-500">Loading...</td></tr>
            ) : cases.length === 0 ? (
              <tr><td colSpan={showActionCol ? 9 : 8} className="px-4 py-10 text-center text-gray-500">No cases found.</td></tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-blue-400 font-mono text-xs whitespace-nowrap">{c.case_number}</td>
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{c.accused_name || "--"}</div>
                    <div className="md:hidden text-gray-500 text-xs mt-0.5">{c.accused_service_number || ""}</div>
                    <div className="sm:hidden text-gray-400 text-xs mt-0.5">{c.offence_name || c.offence || ""}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 hidden md:table-cell">{c.accused_service_number || "--"}</td>
                  <td className="px-4 py-3 text-gray-300 hidden sm:table-cell">{c.offence_name || c.offence || "--"}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">{c.offence_type ? c.offence_type.replace(/_/g, " ") : "--"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] || "bg-gray-600 text-gray-300"}`}>
                      {c.status?.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs hidden md:table-cell">
                    {c.tasked_battalion_name
                      ? <span className="text-yellow-400 font-medium">{c.tasked_battalion_name}</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{c.created_at?.slice(0, 10)}</td>
                  {showActionCol && (
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      {/* HQ/Superuser: Task to battalion */}
                      {canTask && (c.status === "new" || c.status === "open") && !c.tasked_battalion && (
                        <button
                          onClick={() => setTaskModal(c)}
                          className="px-2.5 py-1 bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
                        >
                          Task
                        </button>
                      )}
                      {canTask && c.tasked_battalion && c.status === "tasked" && (
                        <span className="text-xs text-green-400 font-medium">✓ Tasked</span>
                      )}
                      {/* Special battalion admin: Assign to investigation team */}
                      {canAssignTeam && c.status === "tasked" && !c.assigned_team && (
                        <button
                          onClick={() => setAssignTeamModal(c)}
                          className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-medium rounded transition-colors"
                        >
                          Assign Team
                        </button>
                      )}
                      {canAssignTeam && c.assigned_team && (
                        <span className="text-xs text-indigo-400 font-medium">✓ Team: {c.assigned_team_name || "Assigned"}</span>
                      )}
                      {/* Normal battalion admin: Task to detachment */}
                      {canTaskDetachment && c.status === "tasked" && (
                        <button
                          onClick={() => setTaskDetModal(c)}
                          className="px-2.5 py-1 bg-teal-700 hover:bg-teal-600 text-white text-xs font-medium rounded transition-colors"
                        >
                          {c.tasked_detachment ? "Re-assign Det." : "Task to Det."}
                        </button>
                      )}
                      {canTaskDetachment && c.tasked_detachment && c.status !== "tasked" && (
                        <span className="text-xs text-teal-400 font-medium">Det: {c.tasked_detachment_name || "Assigned"}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4 text-sm text-gray-400">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {showForm && (
        <CaseForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}

      {taskModal && (
        <TaskCaseModal
          caseItem={taskModal}
          onClose={() => setTaskModal(null)}
          onSuccess={() => { setTaskModal(null); load(); }}
        />
      )}

      {assignTeamModal && (
        <AssignTeamModal
          caseItem={assignTeamModal}
          teams={teams}
          onClose={() => setAssignTeamModal(null)}
          onSuccess={() => { setAssignTeamModal(null); load(); }}
        />
      )}

      {taskDetModal && (
        <TaskDetachmentModal
          caseItem={taskDetModal}
          detachments={detachments}
          onClose={() => setTaskDetModal(null)}
          onSuccess={() => { setTaskDetModal(null); load(); }}
        />
      )}
    </div>
  );
}

const EMPTY_FORM = {
  accused_service_number: "", accused_rank: "", accused_name: "",
  accused_service: "", accused_unit: "", submitting_unit: "",
  rfi_date: "", rfi_no: "", offence_ref: "", offence_type: "",
  service_offence_severity: "", criminal_offence_type: "", description: "",
};

function SectionTitle({ children }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400 border-b border-gray-700 pb-1 mb-3">
      {children}
    </h4>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs text-gray-400">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const inputCls = "w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500";

function CaseForm({ onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [rfiFile, setRfiFile] = useState(null);
  const [units, setUnits] = useState([]);
  const [offences, setOffences] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    formationService.units().then((r) => {
      const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
      setUnits(items);
    });
    offenceService.list().then((r) => {
      const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
      setOffences(items);
    });
  }, []);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleOffenceTypeChange = (e) => {
    setForm((prev) => ({ ...prev, offence_type: e.target.value, service_offence_severity: "", criminal_offence_type: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.accused_service_number.trim()) return setError("Accused Service Number is required.");
    if (!form.accused_rank) return setError("Accused Rank is required.");
    if (!form.accused_name.trim()) return setError("Accused Name is required.");
    if (!form.accused_service) return setError("Accused Service (KA/KAF/KN) is required.");
    if (!form.accused_unit) return setError("Accused Unit is required.");
    if (!form.submitting_unit) return setError("Submitting Unit is required.");
    if (!form.rfi_date) return setError("RFI Date is required.");
    if (!form.rfi_no.trim()) return setError("RFI / Tasking No is required.");
    if (!rfiFile) return setError("RFI Attachment (PDF) is required.");
    if (rfiFile && rfiFile.type !== "application/pdf") return setError("RFI Attachment must be a PDF file.");
    if (!form.offence_ref) return setError("Offence is required.");
    if (!form.offence_type) return setError("Offence Type is required.");
    if (form.offence_type === "service_offence" && !form.service_offence_severity) return setError("Select Serious or Minor for Service Offence.");
    if (form.offence_type === "criminal_offence" && !form.criminal_offence_type) return setError("Select DCI/Civ Police or Court Martial for Criminal Offence.");

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) fd.append(k, v); });
    fd.append("rfi_document", rfiFile);

    setSaving(true);
    try {
      await caseService.create(fd);
      onSaved();
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        setError(Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | "));
      } else {
        setError(String(data ?? "Failed to create case."));
      }
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl my-6">
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800 rounded-t-lg z-10">
          <h3 className="text-white font-semibold text-base">New Case</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">x</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</p>
          )}

          <div>
            <SectionTitle>Personal Information (Accused)</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Service Number" required>
                <input value={form.accused_service_number} onChange={set("accused_service_number")} className={inputCls} placeholder="e.g. 123456" />
              </Field>
              <Field label="Rank" required>
                <select value={form.accused_rank} onChange={set("accused_rank")} className={inputCls}>
                  <option value="">-- Select Rank --</option>
                  {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Full Name" required>
                <input value={form.accused_name} onChange={set("accused_name")} className={inputCls} placeholder="Surname, First names" />
              </Field>
              <Field label="Service" required>
                <select value={form.accused_service} onChange={set("accused_service")} className={inputCls}>
                  <option value="">-- Select Service --</option>
                  <option value="KA">KA</option>
                  <option value="KAF">KAF</option>
                  <option value="KN">KN</option>
                </select>
              </Field>
              <Field label="Unit" required>
                <select value={form.accused_unit} onChange={set("accused_unit")} className={inputCls}>
                  <option value="">-- Select Unit --</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Submitting Unit" required>
                <select value={form.submitting_unit} onChange={set("submitting_unit")} className={inputCls}>
                  <option value="">-- Select Unit --</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div>
            <SectionTitle>RFI Information</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <Field label="RFI Date" required>
                <input type="date" value={form.rfi_date} onChange={set("rfi_date")} className={inputCls} />
              </Field>
              <Field label="RFI No / Tasking No" required>
                <input value={form.rfi_no} onChange={set("rfi_no")} className={inputCls} placeholder="e.g. MPC/RFI/001/2026" />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="RFI Attachment (PDF)" required>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setRfiFile(e.target.files[0] || null)}
                  className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-xs file:cursor-pointer hover:file:bg-blue-700 cursor-pointer"
                />
                {rfiFile && <p className="text-xs text-green-400 mt-1">{rfiFile.name}</p>}
              </Field>
            </div>
          </div>

          <div>
            <SectionTitle>Offence Details</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Offence" required>
                <select value={form.offence_ref} onChange={set("offence_ref")} className={inputCls}>
                  <option value="">-- Select Offence --</option>
                  {offences.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="Offence Type" required>
                <select value={form.offence_type} onChange={handleOffenceTypeChange} className={inputCls}>
                  <option value="">-- Select Type --</option>
                  <option value="service_offence">Service Offence</option>
                  <option value="criminal_offence">Criminal Offence</option>
                </select>
              </Field>
            </div>

            {form.offence_type === "service_offence" && (
              <div className="mt-3">
                <label className="text-xs text-gray-400">Service Offence Severity <span className="text-red-400">*</span></label>
                <div className="flex gap-6 mt-2">
                  {["serious", "minor"].map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="service_offence_severity" value={v} checked={form.service_offence_severity === v} onChange={set("service_offence_severity")} className="accent-blue-500" />
                      <span className="text-sm text-white capitalize">{v}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.offence_type === "criminal_offence" && (
              <div className="mt-3">
                <label className="text-xs text-gray-400">Criminal Offence Authority <span className="text-red-400">*</span></label>
                <div className="flex gap-6 mt-2">
                  {[{ v: "dci_civ_police", label: "DCI / Civ Police" }, { v: "court_martial", label: "Court Martial" }].map(({ v, label }) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="criminal_offence_type" value={v} checked={form.criminal_offence_type === v} onChange={set("criminal_offence_type")} className="accent-blue-500" />
                      <span className="text-sm text-white">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <Field label="Case Description">
                <textarea value={form.description} onChange={set("description")} rows={4} placeholder="Briefly describe the case..." className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 font-medium">
              {saving ? "Saving..." : "Save Case"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
