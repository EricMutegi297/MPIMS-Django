import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { caseService, teamService, attachmentService } from "../services/api";
import NotificationBell from "./NotificationBell";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function normalizeDateForApi(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoPrefix) return isoPrefix[1];
  return text;
}

const COURT_MILESTONE_TYPES = [
  { value: "mentioning", label: "Mentioning" },
  { value: "hearing", label: "Hearing" },
  { value: "defence", label: "Defence" },
  { value: "ruling", label: "Ruling" },
  { value: "judgment", label: "Judgment" },
];

const STATUS_COLORS = {
  new: "bg-gray-600 text-gray-200",
  open: "bg-blue-500/20 text-blue-400",
  tasked: "bg-yellow-500/20 text-yellow-400",
  under_investigation: "bg-indigo-500/20 text-indigo-400",
  pending: "bg-orange-500/20 text-orange-400",
  served: "bg-purple-500/20 text-purple-400",
  closed: "bg-green-500/20 text-green-400",
  referred: "bg-cyan-500/20 text-cyan-400",
  dismissed: "bg-red-500/20 text-red-400",
};

const FILTERS = [
  {
    key: "all",
    label: "My Cases",
    valueColor: "text-white",
    ring: "ring-gray-500",
    activeBg: "bg-gray-700",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    key: "under_investigation",
    label: "Under Investigation",
    valueColor: "text-indigo-400",
    ring: "ring-indigo-500",
    activeBg: "bg-indigo-500/10",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    key: "pending",
    label: "Pending",
    valueColor: "text-orange-400",
    ring: "ring-orange-500",
    activeBg: "bg-orange-500/10",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "served",
    label: "Served",
    valueColor: "text-purple-400",
    ring: "ring-purple-500",
    activeBg: "bg-purple-500/10",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "closed",
    label: "Closed",
    valueColor: "text-green-400",
    ring: "ring-green-500",
    activeBg: "bg-green-500/10",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
];

function ErrMsg({ msg }) {
  if (!msg) return null;
  return <p className="text-red-400 text-xs mt-1">{msg}</p>;
}

// ── CourtMilestoneHistoryModal (read-only) ─────────────────────────────────────
function CourtMilestoneHistoryModal({ caseObj, onClose }) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caseObj?.id) return;
    setLoading(true);
    caseService.listCourtMilestones(caseObj.id)
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data) ? data : (data.results || []);
        setMilestones(list.sort((a, b) => a.id - b.id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseObj?.id]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Court Milestones - {caseObj.case_number}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading milestones...</p>
        ) : milestones.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No milestones recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {milestones.map((m, idx) => {
              const isCurrent = idx === milestones.length - 1;
              return (
                <div key={m.id} className={`rounded-lg p-4 space-y-2 ${isCurrent ? "bg-purple-900/30 border border-purple-700/40" : "bg-gray-700/40"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${isCurrent ? "bg-purple-600 text-white" : "bg-gray-600 text-gray-300"}`}>
                      {m.milestone_type}
                    </span>
                    <span className="text-gray-400 text-xs">{m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString("en-GB") : "--"}</span>
                    <span className="text-gray-500 text-xs">by {m.created_by_name || "--"}</span>
                    {isCurrent && <span className="ml-auto text-[10px] bg-purple-700/50 text-purple-300 px-1.5 py-0.5 rounded font-medium">Current</span>}
                  </div>
                  {m.planning_comment && <p className="text-gray-300 text-sm">{m.planning_comment}</p>}
                  {(m.action_remarks || (isCurrent && m.planning_comment)) && (
                    <div className="text-xs text-gray-400 border-l-2 border-gray-600 pl-2">
                      <span className="text-gray-500">Court Action: </span>{m.action_remarks || m.planning_comment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CourtMilestoneCell ──────────────────────────────────────────────────────────
function CourtMilestoneCell({ caseObj, onViewHistory, onUpdate, onMilestonesLoaded }) {
  const [milestones, setMilestones] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!caseObj?.id) return;
    caseService.listCourtMilestones(caseObj.id)
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data) ? data : (data.results || []);
        const sorted = list.sort((a, b) => a.id - b.id);
        setMilestones(sorted);
        if (onMilestonesLoaded) onMilestonesLoaded(sorted);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [caseObj.id]);

  const latest = milestones[milestones.length - 1] || null;

  return (
    <div className="flex flex-col gap-1.5 min-w-[150px]">
      <button
        type="button"
        onClick={() => onViewHistory(caseObj)}
        className="text-left hover:opacity-75 transition-opacity"
        title="Click to view milestone history"
      >
        {!loaded ? (
          <span className="text-xs text-gray-500">...</span>
        ) : latest ? (
          <div className="space-y-0.5">
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-700/50 text-purple-300 capitalize inline-block">{latest.milestone_type}</span>
            <div className="text-[10px] text-gray-400">{latest.scheduled_date ? new Date(latest.scheduled_date).toLocaleDateString("en-GB") : "--"}</div>
            {(latest.action_remarks || latest.planning_comment) && (
              <div className="text-[10px] text-gray-300 line-clamp-2 border-l-2 border-purple-700/50 pl-1.5 mt-0.5">{latest.action_remarks || latest.planning_comment}</div>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-500 italic">No milestones</span>
        )}
      </button>
      {onUpdate && (
        <button
          type="button"
          onClick={() => onUpdate(caseObj)}
          className="text-[10px] px-2 py-0.5 rounded bg-purple-700/80 hover:bg-purple-600 text-white transition-colors whitespace-nowrap self-start"
        >
          Update
        </button>
      )}
    </div>
  );
}

function CourtMartialMilestoneModal({ caseObj, onClose, user }) {
  const [courtMilestones, setCourtMilestones] = useState([]);
  const [courtMilestonesLoading, setCourtMilestonesLoading] = useState(false);
  const [courtMilestoneErr, setCourtMilestoneErr] = useState("");
  const [courtMilestoneSuccess, setCourtMilestoneSuccess] = useState("");
  const [milestoneType, setMilestoneType] = useState("mentioning");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [milestoneComment, setMilestoneComment] = useState("");
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [actionDrafts, setActionDrafts] = useState({});
  const [actionSavingId, setActionSavingId] = useState(null);
  const [editingActionMilestoneId, setEditingActionMilestoneId] = useState(null);
  const actionSaveInFlightRef = useRef(new Set());
  const actionInputRefs = useRef({});

  const isHqsAdmin = user?.role === "admin" && user?.battalion_type === "hqs";
  const isSuperuser = Boolean(user?.is_superuser);
  const isInvestigator = user?.role === "investigator";

  const latestCourtMilestoneId = courtMilestones.reduce((latestId, m) => {
    if (latestId === null) return m.id;
    const latest = courtMilestones.find((row) => row.id === latestId);
    if (!latest) return m.id;
    const currentDate = String(m.scheduled_date || "");
    const latestDate = String(latest.scheduled_date || "");
    if (currentDate > latestDate) return m.id;
    if (currentDate === latestDate) {
      const currentCreatedAt = String(m.created_at || "");
      const latestCreatedAt = String(latest.created_at || "");
      if (currentCreatedAt > latestCreatedAt) return m.id;
      if (currentCreatedAt === latestCreatedAt && m.id > latest.id) return m.id;
    }
    return latestId;
  }, null);

  useEffect(() => {
    if (!caseObj?.id) return;
    setCourtMilestonesLoading(true);
    setCourtMilestoneErr("");
    caseService.listCourtMilestones(caseObj.id)
      .then((res) => {
        const rows = toArray(res.data);
        setCourtMilestones(rows);
        const drafts = {};
        rows.forEach((m) => { drafts[m.id] = m.action_remarks || ""; });
        setActionDrafts(drafts);
      })
      .catch(() => { setCourtMilestoneErr("Failed to load milestones."); })
      .finally(() => setCourtMilestonesLoading(false));
  }, [caseObj?.id]);

  async function addCourtMilestone() {
    if (!milestoneType) { setCourtMilestoneErr("Select a milestone type."); return; }
    if (!milestoneDate) { setCourtMilestoneErr("Select a milestone date."); return; }
    if (!milestoneComment.trim()) { setCourtMilestoneErr("Milestone comment is required."); return; }
    setMilestoneSaving(true);
    setCourtMilestoneErr("");
    setCourtMilestoneSuccess("");
    try {
      const res = await caseService.addCourtMilestone(caseObj.id, {
        milestone_type: milestoneType,
        scheduled_date: normalizeDateForApi(milestoneDate),
        planning_comment: milestoneComment,
      });
      const row = res.data;
      setCourtMilestones((prev) => [...prev, row].sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date))));
      setActionDrafts((prev) => ({ ...prev, [row.id]: row.action_remarks || "" }));
      setMilestoneType("mentioning");
      setMilestoneDate("");
      setMilestoneComment("");
      setCourtMilestoneSuccess("Milestone saved successfully.");
    } catch (err) {
      const d = err.response?.data;
      setCourtMilestoneErr(d?.detail ? String(d.detail) : "Failed to save milestone.");
    } finally {
      setMilestoneSaving(false);
    }
  }

  async function saveMilestoneAction(milestoneId) {
    if (latestCourtMilestoneId && milestoneId !== latestCourtMilestoneId) {
      setCourtMilestoneErr("Only the most current milestone can be edited for Court Action / Remarks.");
      return;
    }
    if (actionSaveInFlightRef.current.has(milestoneId)) return;
    const draft = (actionDrafts[milestoneId] || "").trim();
    if (!draft) { setCourtMilestoneErr("Action remarks are required."); return; }
    const existing = courtMilestones.find((m) => m.id === milestoneId);
    if (existing && draft === String(existing.action_remarks || "").trim()) {
      setCourtMilestoneSuccess("Action remarks already saved.");
      return;
    }
    actionSaveInFlightRef.current.add(milestoneId);
    setActionSavingId(milestoneId);
    setCourtMilestoneErr("");
    setCourtMilestoneSuccess("");
    try {
      const res = await caseService.updateCourtMilestone(caseObj.id, milestoneId, { action_remarks: draft });
      setCourtMilestones((prev) => prev.map((m) => (m.id === milestoneId ? res.data : m)));
      setActionDrafts((prev) => ({ ...prev, [milestoneId]: res.data.action_remarks || "" }));
      setEditingActionMilestoneId(null);
      setCourtMilestoneSuccess("Court action remarks saved successfully.");
    } catch (err) {
      const d = err.response?.data;
      setCourtMilestoneErr(d?.detail ? String(d.detail) : "Failed to save action remarks.");
    } finally {
      actionSaveInFlightRef.current.delete(milestoneId);
      setActionSavingId(null);
    }
  }

  function startEditMilestoneAction(milestoneId) {
    if (latestCourtMilestoneId && milestoneId !== latestCourtMilestoneId) {
      setCourtMilestoneErr("Only the most current milestone can be edited.");
      return;
    }
    setCourtMilestoneErr("");
    setCourtMilestoneSuccess("");
    setEditingActionMilestoneId(milestoneId);
    setTimeout(() => { actionInputRefs.current[milestoneId]?.focus(); }, 0);
  }

  function cancelEditMilestoneAction(milestoneId) {
    const existing = courtMilestones.find((m) => m.id === milestoneId);
    setActionDrafts((prev) => ({ ...prev, [milestoneId]: existing?.action_remarks || "" }));
    setEditingActionMilestoneId(null);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl bg-gray-800 rounded-2xl p-6 space-y-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-lg font-semibold text-white">Court Martial Milestones</h3>
        <p className="text-xs text-gray-400">
          Case: <span className="font-mono text-gray-300">{caseObj.case_number || "--"}</span>
          {caseObj.accused_name && (
            <> &mdash; {caseObj.accused_rank && <span className="text-gray-300">{caseObj.accused_rank} </span>}{caseObj.accused_name}</>
          )}
        </p>

        {(isHqsAdmin || isSuperuser || isInvestigator) && (
          <div className="bg-gray-700/40 rounded-lg p-4 space-y-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Add Milestone</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Milestone Type *</label>
                <select
                  value={milestoneType}
                  onChange={(e) => setMilestoneType(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                >
                  {COURT_MILESTONE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Scheduled Date *</label>
                <input
                  type="date"
                  value={milestoneDate}
                  onChange={(e) => setMilestoneDate(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Planning Comment *</label>
                <input
                  type="text"
                  value={milestoneComment}
                  onChange={(e) => setMilestoneComment(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  placeholder="e.g. First mentioning before the bench"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={addCourtMilestone}
              disabled={milestoneSaving}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {milestoneSaving ? "Saving..." : "Add Milestone"}
            </button>
          </div>
        )}

        <div className="bg-gray-700/30 rounded-lg p-3 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Milestones and Court Action Remarks</p>
          {courtMilestonesLoading ? (
            <p className="text-sm text-gray-500">Loading milestones...</p>
          ) : courtMilestones.length === 0 ? (
            <p className="text-sm text-gray-500">No milestones set yet.</p>
          ) : (
            <div className="space-y-2">
              {courtMilestones.map((m) => {
                const isLatest = m.id === latestCourtMilestoneId;
                const isEditing = editingActionMilestoneId === m.id;
                return (
                  <div key={m.id} className="rounded bg-gray-800 px-3 py-3 border border-gray-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-white font-medium capitalize">
                        {m.milestone_type} &mdash; {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString("en-GB") : "--"}
                      </p>
                      <span className="text-[11px] text-gray-400">{m.created_by_name || "--"}</span>
                    </div>
                    <p className="text-xs text-gray-400">{m.planning_comment || "No planning comment"}</p>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                      <div>
                        <label className="text-[11px] text-gray-500 block mb-1">Court Action / Remarks</label>
                        <input
                          type="text"
                          ref={(el) => { actionInputRefs.current[m.id] = el; }}
                          value={actionDrafts[m.id] ?? ""}
                          onChange={(e) => {
                            setActionDrafts((prev) => ({ ...prev, [m.id]: e.target.value }));
                            if (courtMilestoneSuccess) setCourtMilestoneSuccess("");
                          }}
                          disabled={!isLatest || !isEditing || actionSavingId === m.id}
                          className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                          placeholder="Enter action taken by Court Martial"
                        />
                      </div>
                      {!isLatest && (
                        <button type="button" disabled className="px-3 py-2 bg-indigo-600 disabled:opacity-40 text-white rounded text-xs font-medium">
                          Save Action
                        </button>
                      )}
                      {isLatest && !isEditing && (
                        <button
                          type="button"
                          onClick={() => startEditMilestoneAction(m.id)}
                          className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-medium"
                        >
                          Edit Action
                        </button>
                      )}
                      {isLatest && isEditing && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveMilestoneAction(m.id)}
                            disabled={actionSavingId === m.id}
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                          >
                            {actionSavingId === m.id ? "Saving..." : "Save Action"}
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEditMilestoneAction(m.id)}
                            disabled={actionSavingId === m.id}
                            className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    {!isLatest && (
                      <p className="text-[11px] text-amber-400">Only the most current milestone can be edited.</p>
                    )}
                    {m.action_recorded_at && (
                      <p className="text-[11px] text-gray-500">
                        Last action: {new Date(m.action_recorded_at).toLocaleString("en-GB")} by {m.action_recorded_by_name || "--"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {courtMilestoneSuccess && <p className="text-xs text-green-400">{courtMilestoneSuccess}</p>}
          <ErrMsg msg={courtMilestoneErr} />
        </div>
      </div>
    </div>
  );
}

function FilterCard({ cfg, value, isActive, loading, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg p-4 border transition-all focus:outline-none ${
        isActive
          ? `${cfg.activeBg} border-gray-500 ring-2 ${cfg.ring}`
          : "bg-gray-800 border-gray-700 hover:border-gray-500"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`${isActive ? cfg.valueColor : "text-gray-500"}`}>{cfg.icon}</span>
        {isActive && (
          <span className="text-[9px] uppercase tracking-widest text-gray-500 font-semibold">active</span>
        )}
      </div>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 leading-tight">{cfg.label}</p>
      <p className={`text-2xl font-bold ${cfg.valueColor}`}>{loading ? "..." : value}</p>
    </button>
  );
}

// â"€â"€ Activity helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const ACTION_META = {
  case_created:          { color: "text-green-400",  bg: "bg-green-500/10",  label: "Case Created" },
  status_changed:        { color: "text-blue-400",   bg: "bg-blue-500/10",   label: "Status Changed" },
  attachment_uploaded:   { color: "text-blue-400",   bg: "bg-blue-500/10",   label: "File Uploaded" },
  attachment_deleted:    { color: "text-red-400",    bg: "bg-red-500/10",    label: "File Deleted" },
  team_assigned:         { color: "text-purple-400", bg: "bg-purple-500/10", label: "Team Assigned" },
  battalion_tasked:      { color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Tasked" },
  case_updated:          { color: "text-gray-400",   bg: "bg-gray-700",      label: "Updated" },
};

function ActionIcon({ action }) {
  const icons = {
    case_created: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />,
    status_changed: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />,
    attachment_uploaded: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />,
    attachment_deleted: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
    team_assigned: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
    battalion_tasked: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />,
  };
  const meta = ACTION_META[action] || ACTION_META.case_updated;
  const path = icons[action] || <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />;
  return (
    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${meta.bg}`}>
      <svg className={`w-3.5 h-3.5 ${meta.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{path}</svg>
    </span>
  );
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

// â"€â"€ Attach Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function AttachModal({ caseObj, onClose, onUploaded }) {
  const [activeTab, setActiveTab] = useState("files");
  const [attachments, setAttachments] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [err, setErr] = useState("");

  // Activity log state
  const [activityLog, setActivityLog] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);

  const fetchAttachments = useCallback(() => {
    setLoadingList(true);
    attachmentService
      .list(caseObj.id)
      .then((res) => setAttachments(toArray(res.data)))
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, [caseObj.id]);

  const fetchActivity = useCallback(() => {
    if (activityLoaded) return;
    setLoadingActivity(true);
    attachmentService
      .activity(caseObj.id)
      .then((res) => {
        setActivityLog(toArray(res.data));
        setActivityLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoadingActivity(false));
  }, [caseObj.id, activityLoaded]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  useEffect(() => {
    if (activeTab === "activity") fetchActivity();
  }, [activeTab, fetchActivity]);

  // Refresh activity after an upload/delete
  const refreshActivity = () => {
    setActivityLoaded(false);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) { setErr("Please select a file."); return; }
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      if (label.trim()) fd.append("label", label.trim());
      fd.append("file", file);
      const res = await attachmentService.upload(caseObj.id, fd);
      setAttachments((prev) => [res.data, ...prev]);
      setLabel("");
      setFile(null);
      refreshActivity();
      onUploaded();
    } catch (ex) {
      const data = ex?.response?.data;
      setErr(data?.file?.[0] || data?.detail || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (att) => {
    setDeleting(att.id);
    try {
      await attachmentService.delete(caseObj.id, att.id);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      refreshActivity();
      onUploaded();
    } catch {
      // silently ignore
    } finally {
      setDeleting(null);
    }
  };

  // Official documents: RFI is always shown when the case has RFI metadata,
  // even if no uploaded RFI file exists yet.
  const systemFiles = [
    (caseObj.rfi_document || caseObj.rfi_no || caseObj.rfi_date) && {
      key: "rfi",
      label: "RFI",
      url: caseObj.rfi_document || null,
      fileName: caseObj.rfi_document
        ? caseObj.rfi_document.split("/").pop()
        : [caseObj.rfi_no, caseObj.rfi_date].filter(Boolean).join(" - ") || "RFI reference",
      meta: !caseObj.rfi_document
        ? [caseObj.rfi_no && `No: ${caseObj.rfi_no}`, caseObj.rfi_date && `Date: ${caseObj.rfi_date}`].filter(Boolean).join(" | ")
        : "",
    },
    caseObj.tasking_letter && { key: "tasking", label: "Tasking Letter", url: caseObj.tasking_letter, fileName: caseObj.tasking_letter.split("/").pop() },
  ].filter(Boolean);

  const totalFileCount = systemFiles.length + attachments.length;
  const canUpload = caseObj.status === "under_investigation" || caseObj.status === "pending";

  const tabs = [
    { key: "files",    label: `Files (${totalFileCount})` },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h3 className="text-white font-semibold text-sm">Case Documents</h3>
            <p className="text-gray-500 text-xs mt-0.5 font-mono">{caseObj.case_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-5 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`py-2.5 px-1 mr-5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* â"€â"€ FILES TAB â"€â"€ */}
        {activeTab === "files" && (
          <>
            {/* Upload form - only when case status allows uploads */}
            {canUpload ? (
              <form onSubmit={handleUpload} className="px-5 py-4 border-b border-gray-700 shrink-0 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Upload New File</p>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Label / description (optional)"
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
                />
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="bg-gray-700 border border-dashed border-gray-500 hover:border-blue-500 rounded-lg px-3 py-2 text-sm text-center transition-colors">
                      {file ? (
                        <span className="text-blue-400 truncate block">{file.name}</span>
                      ) : (
                        <span className="text-gray-500">Click to select file...</span>
                      )}
                    </div>
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(e) => { setFile(e.target.files[0] || null); setErr(""); }}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={uploading || !file}
                    className="shrink-0 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
                {err && <p className="text-red-400 text-xs">{err}</p>}
              </form>
            ) : (
              <div className="px-5 py-3 border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-2 bg-gray-700/40 border border-gray-600/40 rounded-lg px-3 py-2.5">
                  <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-xs text-gray-500">
                    Uploads locked - case is <span className="capitalize font-medium text-gray-400">{caseObj.status?.replace(/_/g, " ")}</span>.
                  </p>
                </div>
              </div>
            )}

            {/* Files list */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

              {/* â"€â"€ System files (read-only) â"€â"€ */}
              {systemFiles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Official Documents
                    <span className="ml-2 text-gray-600 normal-case font-normal">({systemFiles.length})</span>
                  </p>
                  <ul className="space-y-2">
                    {systemFiles.map((sf) => (
                      <li key={sf.key} className="flex items-center gap-3 bg-gray-700/40 border border-gray-700 rounded-lg px-3 py-2.5">
                        <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{sf.label}</p>
                          <p className="text-gray-400 text-[11px] truncate">{sf.fileName}</p>
                          {sf.meta && <p className="text-gray-500 text-[10px] truncate mt-0.5">{sf.meta}</p>}
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-500 font-medium shrink-0">official</span>
                        {sf.url ? (
                          <>
                            <a
                              href={sf.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-500 hover:text-blue-400 transition-colors p-1 shrink-0"
                              title="View / Open"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </a>
                            <a
                              href={sf.url}
                              download
                              className="text-gray-500 hover:text-green-400 transition-colors p-1 shrink-0"
                              title="Download"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                          </>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 shrink-0">reference</span>
                        )}
                        {/* No delete for official docs */}
                        <span className="w-6 shrink-0" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* â"€â"€ Investigator uploads (deletable) â"€â"€ */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Investigator Uploads
                  {!loadingList && (
                    <span className="ml-2 text-gray-600 normal-case font-normal">({attachments.length})</span>
                  )}
                </p>
                {loadingList ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-gray-700 rounded animate-pulse" />
                    ))}
                  </div>
                ) : attachments.length === 0 ? (
                  <p className="text-gray-500 text-sm py-2 text-center">No files uploaded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {attachments.map((att) => (
                      <li key={att.id} className="flex items-center gap-3 bg-gray-700/50 rounded-lg px-3 py-2.5">
                        <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          {att.label && (
                            <p className="text-white text-xs font-medium truncate">{att.label}</p>
                          )}
                          <p className="text-gray-400 text-[11px] truncate">{att.file_name || att.file}</p>
                          {att.uploaded_by_name && (
                            <p className="text-gray-600 text-[10px]">by {att.uploaded_by_name}</p>
                          )}
                        </div>
                        <a
                          href={att.file}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-500 hover:text-blue-400 transition-colors p-1 shrink-0"
                          title="View / Open"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </a>
                        <a
                          href={att.file}
                          download
                          className="text-gray-500 hover:text-green-400 transition-colors p-1 shrink-0"
                          title="Download"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                        {canUpload && (
                          <button
                            onClick={() => handleDelete(att)}
                            disabled={deleting === att.id}
                            className="text-gray-600 hover:text-red-400 transition-colors p-1 shrink-0 disabled:opacity-50"
                            title="Remove"
                          >
                            {deleting === att.id ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}

        {/* â"€â"€ ACTIVITY TAB â"€â"€ */}
        {activeTab === "activity" && (
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {loadingActivity ? (
              <div className="space-y-3 pt-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-700 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5 pt-1">
                      <div className="h-3 bg-gray-700 rounded animate-pulse w-3/4" />
                      <div className="h-2.5 bg-gray-700/60 rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityLog.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">No activity recorded yet.</p>
            ) : (
              <ol className="relative border-l border-gray-700 ml-3 space-y-0">
                {activityLog.map((entry, idx) => {
                  const meta = ACTION_META[entry.action] || ACTION_META.case_updated;
                  return (
                    <li key={entry.id} className={`ml-4 pb-5 ${idx === activityLog.length - 1 ? "" : ""}`}>
                      {/* Timeline dot */}
                      <span className={`absolute -left-3.5 flex items-center justify-center w-7 h-7 rounded-full ${meta.bg}`}>
                        <ActionIcon action={entry.action} />
                      </span>
                      <div className="ml-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                          <span className="text-gray-600 text-[10px]">.</span>
                          <span className="text-gray-500 text-[10px]">{fmtTime(entry.created_at)}</span>
                        </div>
                        {entry.detail && (
                          <p className="text-gray-300 text-xs mt-0.5">{entry.detail}</p>
                        )}
                        {entry.actor_name && (
                          <p className="text-gray-600 text-[10px] mt-0.5">by {entry.actor_name}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// â"€â"€ Abstract / attachment pill helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function AbstractCell({ c, onAttach }) {
  const baseCount = ((c.rfi_document || c.rfi_no || c.rfi_date) ? 1 : 0) + (c.tasking_letter ? 1 : 0);
  const extraCount = c.extra_attachment_count || 0;
  const totalCount = baseCount + extraCount;
  const isLocked = c.status === "served" || c.status === "closed";
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onAttach(c)}
        title="View attachments"
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
          totalCount > 0
            ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            : "bg-gray-700 text-gray-500 hover:bg-gray-600"
        }`}
      >
        {totalCount} {totalCount === 1 ? "doc" : "docs"}
      </button>
      {isLocked ? (
        <button
          onClick={() => onAttach(c)}
          title="View documents (locked - case is served/closed)"
          className="text-gray-500 hover:text-gray-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => onAttach(c)}
          title="Manage attachments"
          className="text-gray-500 hover:text-blue-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
      )}
    </div>
  );
}

function DescriptionCell({ text }) {
  const [expanded, setExpanded] = useState(false);
  const value = text || "--";
  const limit = 120;
  const longDesc = value.length > limit;
  const shown = expanded || !longDesc ? value : `${value.slice(0, limit)}...`;

  return (
    <div className="max-w-[260px]">
      <p className="text-gray-400 text-xs whitespace-pre-wrap break-words">{shown}</p>
      {longDesc && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-blue-400 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

// â"€â"€ Resume Investigation Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ResumeModal({ caseObj, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleResume = async () => {
    setSaving(true);
    setErr("");
    try {
      await caseService.update(caseObj.id, { status: "under_investigation" });
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Failed to update status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Resume Investigation</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">Case: <span className="font-mono text-blue-400">{caseObj.case_number}</span></p>
          <p className="text-sm text-gray-400">Accused: <span className="text-white">{caseObj.accused_name || "--"}</span></p>
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 text-sm text-indigo-300">
            Status will change from <strong>Pending</strong> -> <strong>Under Investigation</strong>.
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
          <button onClick={handleResume} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Resume Investigation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CaseUpdateModal({ caseObj, onClose, onDone }) {
  const [updateText, setUpdateText] = useState("");
  const [updateDate, setUpdateDate] = useState(normalizeDateForApi(caseObj?.mentioning_date));
  const [referencePdf, setReferencePdf] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!updateText.trim()) {
      setErr("Case update is required.");
      return;
    }
    if (!updateDate) {
      setErr("Update date is required.");
      return;
    }
    if (referencePdf && referencePdf.name && !referencePdf.name.toLowerCase().endsWith(".pdf")) {
      setErr("Reference file must be a PDF.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("action_taken", updateText.trim());
      fd.append("mentioning_date", updateDate);
      if (referencePdf) {
        fd.append("reference_pdf", referencePdf);
      }
      await caseService.update(caseObj.id, fd);
      onDone();
      onClose();
    } catch (ex) {
      const data = ex?.response?.data;
      if (data?.detail) {
        setErr(data.detail);
      } else if (data && typeof data === "object") {
        const msg = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setErr(msg || "Failed to save case update.");
      } else {
        setErr("Failed to save case update.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Case Update</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">Case: <span className="font-mono text-blue-400">{caseObj.case_number}</span></p>
          {caseObj?.action_taken && (
            <div className="bg-gray-700/40 border border-gray-600/50 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Most Recent Saved Update</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{caseObj.action_taken}</p>
              <p className="text-[11px] text-gray-500 mt-2">Older updates remain available in update flow.</p>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Date of Update <span className="text-red-400">*</span></label>
            <input
              type="date"
              value={updateDate}
              onChange={(e) => { setUpdateDate(e.target.value); setErr(""); }}
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Case Update <span className="text-red-400">*</span></label>
            <textarea
              rows={4}
              value={updateText}
              onChange={(e) => { setUpdateText(e.target.value); setErr(""); }}
              placeholder="Enter a new update entry..."
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-gray-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Reference PDF <span className="text-gray-500">(optional)</span></label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                setReferencePdf(e.target.files?.[0] || null);
                setErr("");
              }}
              className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-cyan-500"
            />
            {referencePdf && <p className="text-[11px] text-gray-500 mt-1">Selected: {referencePdf.name}</p>}
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Save Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

// â"€â"€ Close Case Modal (HQ Admin only) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function CloseModal({ caseObj, onClose, onDone }) {
  const [judgmentFiles, setJudgmentFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const canClose = judgmentFiles.length > 0;

  const handleClose = async () => {
    if (!canClose) { setErr("Attach at least one judgment file before closing."); return; }
    setSaving(true);
    setErr("");
    try {
      setUploading(true);
      for (const file of judgmentFiles) {
        const fdUpload = new FormData();
        fdUpload.append("document_type", "judgment");
        fdUpload.append("label", `Judgment - ${file.name}`);
        fdUpload.append("file", file);
        await attachmentService.upload(caseObj.id, fdUpload);
      }
      setUploading(false);
      const fd = new FormData();
      fd.append("status", "closed");
      await caseService.close(caseObj.id, fd);
      onDone();
      onClose();
    } catch (ex) {
      setUploading(false);
      const data = ex?.response?.data;
      setErr(data?.detail || data?.non_field_errors?.[0] || "Failed to close case.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">Close Case</h3>
            <p className="text-gray-500 text-xs mt-0.5">Admin HQ - both documents required</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">Case: <span className="font-mono text-blue-400">{caseObj.case_number}</span></p>
          <p className="text-sm text-gray-400">Accused: <span className="text-white">{caseObj.accused_name || "--"}</span></p>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Judgment Files <span className="text-red-400">*</span></label>
            <label className="cursor-pointer block">
              <div className={`bg-gray-700 border border-dashed rounded-lg px-3 py-2.5 text-sm text-center transition-colors ${judgmentFiles.length > 0 ? "border-green-500/60" : "border-gray-500 hover:border-blue-500"}`}>
                {judgmentFiles.length > 0 ? (
                  <span className="text-green-400 truncate block">{judgmentFiles.length} file(s) selected</span>
                ) : (
                  <span className="text-gray-500">Click to select judgment files...</span>
                )}
              </div>
              <input type="file" multiple accept=".pdf" className="sr-only" onChange={(e) => { setJudgmentFiles(Array.from(e.target.files || [])); setErr(""); }} />
            </label>
          </div>
          {!canClose && <p className="text-yellow-500 text-xs">Attach at least one judgment PDF to enable closing.</p>}
          {uploading && <p className="text-cyan-400 text-xs">Uploading judgment files...</p>}
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
          <button onClick={handleClose} disabled={saving || !canClose} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-green-700 hover:bg-green-600 disabled:opacity-50 transition-colors">
            {saving ? "Closing..." : "Close Case"}
          </button>
        </div>
      </div>
    </div>
  );
}

// â"€â"€ Under-Investigation table (9 specific columns) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// â"€â"€ Case Action Modals â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ServeModal({ caseObj, attachCount, onClose, onDone }) {
  const isCourtMartial = caseObj?.criminal_offence_type === "court_martial";
  const isDciCiv = caseObj?.criminal_offence_type === "dci_civ_police";
  const [rfiSaved, setRfiSaved] = useState(false);
  const [rfiSavedMsg, setRfiSavedMsg] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const hasRfi = !!(caseObj?.rfi_no || caseObj?.rfi_document || caseObj?.rfi_date) || rfiSaved;
  const canServe = isDciCiv ? hasRfi : attachCount > 3;
  const [remarks, setRemarks] = useState("");
  const [mentioningDate, setMentioningDate] = useState(normalizeDateForApi(caseObj?.mentioning_date));
  const [mentioningRemarks, setMentioningRemarks] = useState(caseObj?.mentioning_remarks || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [rfiNo, setRfiNo] = useState("");
  const [rfiDate, setRfiDate] = useState("");
  const [rfiFile, setRfiFile] = useState(null);
  const [rfiSaving, setRfiSaving] = useState(false);
  const [rfiErr, setRfiErr] = useState("");

  const handleSaveRfi = async () => {
    if (!rfiFile && !rfiDate) {
      setRfiErr("Please select an RFI date or attach an RFI document before saving.");
      return;
    }
    setRfiSaving(true);
    setRfiErr("");
    try {
      const fd = new FormData();
      if (rfiNo.trim()) fd.append("rfi_no", rfiNo.trim());
      if (rfiDate) fd.append("rfi_date", rfiDate);
      if (rfiFile) fd.append("rfi_document", rfiFile);
      await caseService.update(caseObj.id, fd);
      setRfiSaved(true);
      setRfiSavedMsg("RFI saved successfully. You can now confirm the close request.");
      onDone();
    } catch (ex) {
      const data = ex?.response?.data;
      setRfiErr(data?.rfi_no?.[0] || data?.rfi_document?.[0] || data?.detail || "Failed to save RFI.");
    } finally {
      setRfiSaving(false);
    }
  };

  const handleServe = async () => {
    if (!canServe) return;
    setSaving(true);
    setErr("");
    try {
      const payload = isDciCiv
        ? {
            close_requested: true,
            remarks: remarks.trim(),
          }
        : {
            status: "served",
            remarks: remarks.trim(),
          };
      if (isCourtMartial) {
        const normalizedMentioningDate = normalizeDateForApi(mentioningDate);
        if (normalizedMentioningDate) {
          payload.mentioning_date = normalizedMentioningDate;
        }
        payload.mentioning_remarks = mentioningRemarks.trim();
      }
      await caseService.update(caseObj.id, payload);
      onDone();
      if (isDciCiv) {
        setRequestSent(true);
      } else {
        onClose();
      }
    } catch (ex) {
      const data = ex?.response?.data;
      if (data?.detail) {
        setErr(data.detail);
      } else if (data && typeof data === "object") {
        const msg = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setErr(msg || "Failed to update status.");
      } else {
        setErr("Failed to update status.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">{isDciCiv ? "Request Close" : "Mark as Served"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">Case: <span className="font-mono text-blue-400">{caseObj.case_number}</span></p>
          {requestSent ? (
            <div className="bg-green-500/10 border border-green-500/40 rounded-lg p-4 text-sm text-green-400 text-center space-y-1">
              <p className="font-semibold text-green-300 text-base">Close Request Sent</p>
              <p>Your closure request for <span className="font-mono">{caseObj.case_number}</span> has been submitted to HQ for approval.</p>
            </div>
          ) : !canServe ? (
            isDciCiv ? (
              <div className="space-y-3">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-400">
                  (!) RFI is required before requesting case closure. Please fill in the RFI details below.
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">RFI Number <span className="text-gray-500">(optional)</span></label>
                  <input
                    type="text"
                    value={rfiNo}
                    onChange={(e) => { setRfiNo(e.target.value); setRfiErr(""); }}
                    placeholder="e.g. RFI/2026/001"
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">RFI Date <span className="text-red-400">*</span></label>
                  <input
                    type="date"
                    value={rfiDate}
                    onChange={(e) => { setRfiDate(e.target.value); setRfiErr(""); }}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">RFI Document (PDF)</label>
                  <label className="cursor-pointer block">
                    <div className={`bg-gray-700 border border-dashed rounded-lg px-3 py-2 text-sm text-center transition-colors ${rfiFile ? "border-green-500/60" : "border-gray-500 hover:border-purple-500"}`}>
                      {rfiFile ? <span className="text-green-400 truncate block">{rfiFile.name}</span> : <span className="text-gray-500">Click to select RFI PDF...</span>}
                    </div>
                    <input type="file" accept=".pdf" className="sr-only" onChange={(e) => { setRfiFile(e.target.files?.[0] || null); setRfiErr(""); }} />
                  </label>
                </div>
                {rfiErr && <p className="text-red-400 text-xs">{rfiErr}</p>}
              </div>
            ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {`(!)  Cannot serve - needs more than 3 abstract documents (${attachCount} currently). Upload additional investigation documents first.`}
            </div>
            )
          ) : (
            <>
              {rfiSavedMsg && (
                <div className="bg-green-500/10 border border-green-500/40 rounded-lg p-3 text-sm text-green-400">
                  {rfiSavedMsg}
                </div>
              )}
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-400">
                (OK)  {attachCount} documents attached - {isDciCiv ? "you can now request HQ closure" : "case is eligible to be served"}.
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">{isDciCiv ? "Close Request Remarks (optional)" : "Remarks (optional)"}</label>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(e) => { setRemarks(e.target.value); setErr(""); }}
                  placeholder={isDciCiv ? "Enter close request remarks..." : "Enter any remarks..."}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-gray-500 resize-none"
                />
              </div>

              {isCourtMartial && (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Mentioning Date (optional)</label>
                    <input
                      type="date"
                      value={mentioningDate}
                      onChange={(e) => { setMentioningDate(e.target.value); setErr(""); }}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Mentioning Remarks (optional)</label>
                    <textarea
                      rows={3}
                      value={mentioningRemarks}
                      onChange={(e) => { setMentioningRemarks(e.target.value); setErr(""); }}
                      placeholder="Enter mentioning remarks..."
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-gray-500 resize-none"
                    />
                  </div>
                </>
              )}
            </>
          )}
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors">{requestSent ? "Close" : "Cancel"}</button>
          {!canServe && isDciCiv && !requestSent && (
            <button onClick={handleSaveRfi} disabled={rfiSaving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors">
              {rfiSaving ? "Saving..." : "Save RFI"}
            </button>
          )}
          {canServe && !requestSent && (
            <button onClick={handleServe} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors">
              {saving ? "Sending..." : isDciCiv ? "Confirm Close Request" : "Confirm Served"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MentioningPromptModal({ caseObj, onClose, onSaved }) {
  const [mentioningDate, setMentioningDate] = useState(normalizeDateForApi(caseObj?.mentioning_date));
  const [mentioningRemarks, setMentioningRemarks] = useState(caseObj?.mentioning_remarks || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    const normalizedMentioningDate = normalizeDateForApi(mentioningDate);
    if (!normalizedMentioningDate) {
      setErr("Please select the Mentioning Date to continue.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await caseService.update(caseObj.id, {
        mentioning_date: normalizedMentioningDate,
        mentioning_remarks: mentioningRemarks.trim(),
      });
      onSaved({
        ...caseObj,
        mentioning_date: normalizedMentioningDate,
        mentioning_remarks: mentioningRemarks.trim(),
      });
    } catch (ex) {
      const data = ex?.response?.data;
      if (data?.detail) {
        setErr(data.detail);
      } else if (data && typeof data === "object") {
        const msg = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setErr(msg || "Failed to save mentioning details.");
      } else {
        setErr("Failed to save mentioning details.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Court Martial Mentioning Date</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">
            Case: <span className="font-mono text-blue-400">{caseObj.case_number}</span>
          </p>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-300">
            This served Court Martial case requires a Mentioning Date before proceeding.
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Mentioning Date <span className="text-red-400">*</span></label>
            <input
              type="date"
              value={mentioningDate}
              onChange={(e) => { setMentioningDate(e.target.value); setErr(""); }}
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Mentioning Remarks (optional)</label>
            <textarea
              rows={3}
              value={mentioningRemarks}
              onChange={(e) => { setMentioningRemarks(e.target.value); setErr(""); }}
              placeholder="Add mentioning remarks if available..."
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-500 resize-none"
            />
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingModal({ caseObj, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handlePending = async () => {
    if (!reason.trim()) { setErr("A reason is required."); return; }
    setSaving(true);
    setErr("");
    try {
      await caseService.update(caseObj.id, { status: "pending", action_taken: reason.trim() });
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Failed to update status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Mark as Pending</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">Case: <span className="font-mono text-blue-400">{caseObj.case_number}</span></p>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Reason for Pending <span className="text-red-400">*</span></label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setErr(""); }}
              placeholder="Enter reason why this case is being marked as pending..."
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-500 resize-none"
            />
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
          <button onClick={handlePending} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-orange-600 hover:bg-orange-500 disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Mark Pending"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GuardroomModal({ caseObj, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const handleRequest = async () => {
    if (!reason.trim()) { setErr("Please provide a reason for the guardroom request."); return; }
    setSaving(true);
    setErr("");
    try {
      await caseService.update(caseObj.id, { action_taken: `[GUARDROOM REQUEST] ${reason.trim()}` });
      setDone(true);
      onDone();
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Failed to submit request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && !done && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Request Guardroom</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {done ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
              <p className="text-green-400 font-medium">Request Submitted</p>
              <p className="text-gray-400 text-xs mt-1">Guardroom request for <span className="font-mono text-blue-400">{caseObj.case_number}</span> has been recorded.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400">Case: <span className="font-mono text-blue-400">{caseObj.case_number}</span> - <span className="text-gray-300">{caseObj.accused_name || ""}</span></p>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Reason / Justification <span className="text-red-400">*</span></label>
                <textarea
                  rows={4}
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setErr(""); }}
                  placeholder="State the reason for requesting guardroom detention..."
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500 placeholder-gray-500 resize-none"
                />
              </div>
              {err && <p className="text-red-400 text-xs">{err}</p>}
            </>
          )}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors">{done ? "Close" : "Cancel"}</button>
          {!done && (
            <button onClick={handleRequest} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-red-700 hover:bg-red-600 disabled:opacity-50 transition-colors">
              {saving ? "Submitting..." : "Submit Request"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UnderInvestigationRow({ c, onAttach, onServe, onMarkPending, onGuardroom, onCaseUpdate }) {
  const isDciCiv = c?.criminal_offence_type === "dci_civ_police";
  const latestUpdateDate = normalizeDateForApi(c?.mentioning_date) || c?.updated_at?.slice(0, 10) || "--";
  const latestUpdateText = c?.action_taken || c?.remarks || "--";
  return (
    <tr className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
      <td className="px-3 py-3 text-blue-400 font-mono text-xs whitespace-nowrap">{c.case_number}</td>
      <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">{c.accused_service_number || "--"}</td>
      <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">{c.accused_rank || "--"}</td>
      <td className="px-3 py-3 text-white font-medium text-xs">{c.accused_name || "--"}</td>
      <td className="px-3 py-3 text-gray-300 text-xs">{c.offence_name || c.offence || "--"}</td>
      <td className="px-3 py-3"><DescriptionCell text={c.description} /></td>
      <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{latestUpdateDate}</td>
      <td className="px-3 py-3 text-gray-300 text-xs max-w-[220px]">
        <span className="line-clamp-3 block">{latestUpdateText}</span>
      </td>
      <td className="px-3 py-3">
        <AbstractCell c={c} onAttach={onAttach} />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1.5 items-start">
          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[c.status] || "bg-gray-600 text-gray-300"}`}>
            {c.status?.replace(/_/g, " ")}
          </span>
          {(c.status === "under_investigation" || c.status === "pending") && (
            <div className="flex flex-wrap gap-1">
              {c.status === "under_investigation" && (
                isDciCiv ? (
                  <>
                    <button onClick={() => onCaseUpdate(c)} className="text-[10px] px-2 py-0.5 rounded bg-cyan-700/80 hover:bg-cyan-600 text-white transition-colors whitespace-nowrap" title="Case Update">Case Update</button>
                    <button onClick={() => onServe(c)} className="text-[10px] px-2 py-0.5 rounded bg-purple-700/80 hover:bg-purple-600 text-white transition-colors whitespace-nowrap" title="Request Close">Request Close</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => onServe(c)} className="text-[10px] px-2 py-0.5 rounded bg-purple-700/80 hover:bg-purple-600 text-white transition-colors whitespace-nowrap" title="Mark as Served">Serve</button>
                    <button onClick={() => onMarkPending(c)} className="text-[10px] px-2 py-0.5 rounded bg-orange-700/80 hover:bg-orange-600 text-white transition-colors whitespace-nowrap" title="Mark as Pending">Pending</button>
                  </>
                )
              )}
              {!isDciCiv && (
                <button onClick={() => onGuardroom(c)} className="text-[10px] px-2 py-0.5 rounded bg-red-800/80 hover:bg-red-700 text-white transition-colors whitespace-nowrap" title="Request Guardroom">Guardroom</button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function UnderInvestigationTable({ cases, loading, emptyMsg, onAttach, onServe, onMarkPending, onGuardroom, onCaseUpdate }) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
      <table className="min-w-[1200px] text-sm">
        <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-3 whitespace-nowrap">Case #</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Service No</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Rank</th>
            <th className="text-left px-3 py-3">Accused</th>
            <th className="text-left px-3 py-3">Offence</th>
            <th className="text-left px-3 py-3">Description</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Update Date</th>
            <th className="text-left px-3 py-3">Latest Update</th>
            <th className="text-left px-3 py-3">Abstract</th>
            <th className="text-left px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-500">Loading...</td></tr>
          ) : cases.length === 0 ? (
            <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-500">{emptyMsg}</td></tr>
          ) : (
            cases.map((c) => <UnderInvestigationRow key={c.id} c={c} onAttach={onAttach} onServe={onServe} onMarkPending={onMarkPending} onGuardroom={onGuardroom} onCaseUpdate={onCaseUpdate} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

// â"€â"€ Pending cases table (dedicated columns) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function PendingRow({ c, onAttach, onResume }) {
  const latestUpdateDate = normalizeDateForApi(c?.mentioning_date) || "--";
  const latestUpdateText = c?.action_taken || "--";
  return (
    <tr className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
      <td className="px-3 py-3 text-blue-400 font-mono text-xs whitespace-nowrap">{c.case_number}</td>
      <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">{c.accused_service_number || "--"}</td>
      <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">{c.accused_rank || "--"}</td>
      <td className="px-3 py-3 text-white font-medium text-xs">{c.accused_name || "--"}</td>
      <td className="px-3 py-3 text-gray-300 text-xs">{c.offence_name || c.offence || "--"}</td>
      <td className="px-3 py-3"><DescriptionCell text={c.description} /></td>
      <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{latestUpdateDate}</td>
      <td className="px-3 py-3 text-gray-300 text-xs max-w-[220px]">
        <span className="line-clamp-3 block">{latestUpdateText}</span>
      </td>
      <td className="px-3 py-3">
        <AbstractCell c={c} onAttach={onAttach} />
      </td>
      <td className="px-3 py-3 text-orange-300 text-xs max-w-[160px]">
        <span className="line-clamp-3 block">{c.reason_for_pending || c.action_taken || c.remarks || "--"}</span>
      </td>
      <td className="px-3 py-3">
        <button
          onClick={() => onResume(c)}
          className="text-[10px] px-2.5 py-1 rounded bg-indigo-700/80 hover:bg-indigo-600 text-white transition-colors whitespace-nowrap"
          title="Resume Investigation"
        >
          Resume Investigation
        </button>
      </td>
    </tr>
  );
}

function PendingTable({ cases, loading, emptyMsg, onAttach, onResume }) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
      <table className="min-w-[1200px] text-sm">
        <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-3 whitespace-nowrap">Case #</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Service No</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Rank</th>
            <th className="text-left px-3 py-3">Accused</th>
            <th className="text-left px-3 py-3">Offence</th>
            <th className="text-left px-3 py-3">Description</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Update Date</th>
            <th className="text-left px-3 py-3">Latest Update</th>
            <th className="text-left px-3 py-3">Abstract</th>
            <th className="text-left px-3 py-3">Reason for Pending</th>
            <th className="text-left px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">Loading...</td></tr>
          ) : cases.length === 0 ? (
            <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">{emptyMsg}</td></tr>
          ) : (
            cases.map((c) => <PendingRow key={c.id} c={c} onAttach={onAttach} onResume={onResume} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

// â"€â"€ Served cases table (dedicated columns) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ServedRow({ c, onAttach, onCloseCase, isHQAdmin, onMilestone, onViewHistory }) {
  const isCourtMartial = c?.criminal_offence_type === "court_martial";
  const [courtMilestones, setCourtMilestones] = useState([]);

  const dateServed = c.served_at?.slice(0, 10) || c.updated_at?.slice(0, 10) || "--";
  const latestMilestone = courtMilestones.length > 0 ? courtMilestones[courtMilestones.length - 1] : null;
  const latestUpdateDate = (isCourtMartial && latestMilestone)
    ? (latestMilestone.action_remarks
        ? latestMilestone.updated_at?.slice(0, 10)
        : latestMilestone.scheduled_date?.slice(0, 10)) || "--"
    : (normalizeDateForApi(c?.mentioning_date) || c?.served_at?.slice(0, 10) || c?.updated_at?.slice(0, 10) || "--");
  const latestCourtAction = courtMilestones.length > 0
    ? (courtMilestones[courtMilestones.length - 1].action_remarks || courtMilestones[courtMilestones.length - 1].planning_comment)
    : null;
  const latestUpdateText = (isCourtMartial && latestCourtAction) ? latestCourtAction : (c?.action_taken || c?.remarks || "--");
  return (
    <tr className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
      <td className="px-3 py-3 text-blue-400 font-mono text-xs whitespace-nowrap">{c.case_number}</td>
      <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">{c.accused_service_number || "--"}</td>
      <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">{c.accused_rank || "--"}</td>
      <td className="px-3 py-3 text-white font-medium text-xs">{c.accused_name || "--"}</td>
      <td className="px-3 py-3 text-gray-300 text-xs">{c.offence_name || c.offence || "--"}</td>
      <td className="px-3 py-3"><DescriptionCell text={c.description} /></td>
      <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{latestUpdateDate}</td>
      <td className="px-3 py-3 text-gray-300 text-xs max-w-[220px]">
        <span className="line-clamp-3 block">{latestUpdateText}</span>
      </td>
      <td className="px-3 py-3">
        <AbstractCell c={c} onAttach={onAttach} />
      </td>
      <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{dateServed}</td>
      <td className="px-3 py-3 text-gray-400 text-xs max-w-[120px]">
        <span className="line-clamp-2 block">{c.remarks || "--"}</span>
      </td>
      {isCourtMartial ? (
        <td className="px-3 py-3">
          <CourtMilestoneCell
            caseObj={c}
            onViewHistory={(caseObj) => onViewHistory && onViewHistory(caseObj)}
            onUpdate={(caseObj) => onMilestone && onMilestone(caseObj)}
            onMilestonesLoaded={setCourtMilestones}
          />
        </td>
      ) : (
        <td className="px-3 py-3" />
      )}
      <td className="px-3 py-3">
        {isHQAdmin ? (
          <button
            onClick={() => onCloseCase(c)}
            className="text-[10px] px-2.5 py-1 rounded bg-green-800/80 hover:bg-green-700 text-white transition-colors whitespace-nowrap"
            title="Close Case"
          >
            Close Case
          </button>
        ) : (
          <span className="text-xs text-gray-600 italic">HQ Admin only</span>
        )}
      </td>
    </tr>
  );
}

function ServedTable({ cases, loading, emptyMsg, onAttach, onCloseCase, isHQAdmin, onMilestone, onViewHistory }) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
      <table className="min-w-[1260px] text-sm">
        <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-3 whitespace-nowrap">Case #</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Service No</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Rank</th>
            <th className="text-left px-3 py-3">Accused</th>
            <th className="text-left px-3 py-3">Offence</th>
            <th className="text-left px-3 py-3">Description</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Update Date</th>
            <th className="text-left px-3 py-3">Latest Update</th>
            <th className="text-left px-3 py-3">Abstract</th>
            <th className="text-left px-3 py-3 whitespace-nowrap">Date Served</th>
            <th className="text-left px-3 py-3">Remarks</th>
            <th className="text-left px-3 py-3">Current Milestone</th>
            <th className="text-left px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-500">Loading...</td></tr>
          ) : cases.length === 0 ? (
            <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-500">{emptyMsg}</td></tr>
          ) : (
            cases.map((c) => <ServedRow key={c.id} c={c} onAttach={onAttach} onCloseCase={onCloseCase} isHQAdmin={isHQAdmin} onMilestone={onMilestone} onViewHistory={onViewHistory} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

// â"€â"€ Generic table (all other filters) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function GenericCaseRow({ c, onAttach, onServe, onMarkPending, onGuardroom, onResume, onCloseCase, onCaseUpdate, isHQAdmin }) {
  const renderAction = () => {
    const isDciCiv = c?.criminal_offence_type === "dci_civ_police";
    if (c.status === "under_investigation") {
      if (isDciCiv) {
        return (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => onCaseUpdate(c)}
              className="text-[10px] px-2 py-0.5 rounded bg-cyan-700/80 hover:bg-cyan-600 text-white transition-colors whitespace-nowrap"
              title="Case Update"
            >
              Case Update
            </button>
            <button
              onClick={() => onServe(c)}
              className="text-[10px] px-2 py-0.5 rounded bg-purple-700/80 hover:bg-purple-600 text-white transition-colors whitespace-nowrap"
              title="Request Close"
            >
              Request Close
            </button>
          </div>
        );
      }
      return (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onServe(c)}
            className="text-[10px] px-2 py-0.5 rounded bg-purple-700/80 hover:bg-purple-600 text-white transition-colors whitespace-nowrap"
            title="Mark as Served"
          >
            Serve
          </button>
          <button
            onClick={() => onMarkPending(c)}
            className="text-[10px] px-2 py-0.5 rounded bg-orange-700/80 hover:bg-orange-600 text-white transition-colors whitespace-nowrap"
            title="Mark as Pending"
          >
            Pending
          </button>
          <button
            onClick={() => onGuardroom(c)}
            className="text-[10px] px-2 py-0.5 rounded bg-red-800/80 hover:bg-red-700 text-white transition-colors whitespace-nowrap"
            title="Request Guardroom"
          >
            Guardroom
          </button>
        </div>
      );
    }

    if (c.status === "pending") {
      return (
        <button
          onClick={() => onResume(c)}
          className="text-[10px] px-2.5 py-1 rounded bg-indigo-700/80 hover:bg-indigo-600 text-white transition-colors whitespace-nowrap"
          title="Resume Investigation"
        >
          Resume
        </button>
      );
    }

    if (c.status === "served") {
      if (!isHQAdmin) return <span className="text-xs text-gray-600 italic">HQ Admin only</span>;
      return (
        <button
          onClick={() => onCloseCase(c)}
          className="text-[10px] px-2.5 py-1 rounded bg-green-800/80 hover:bg-green-700 text-white transition-colors whitespace-nowrap"
          title="Close Case"
        >
          Close Case
        </button>
      );
    }

    if (c.status === "closed") {
      return <span className="text-xs text-gray-500 italic">Closed</span>;
    }

    return <span className="text-xs text-gray-500">--</span>;
  };

  return (
    <tr className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
      <td className="px-4 py-3 text-blue-400 font-mono text-xs whitespace-nowrap">{c.case_number}</td>
      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">{c.accused_service_number || "--"}</td>
      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">{c.accused_rank || "--"}</td>
      <td className="px-4 py-3 text-white font-medium text-xs">{c.accused_name || "--"}</td>
      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">{c.offence_name || c.offence || "--"}</td>
      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">{c.police_station || "--"}</td>
      <td className="px-4 py-3"><DescriptionCell text={c.description} /></td>
      <td className="px-4 py-3 text-gray-300 text-xs max-w-[200px]">
        {c.criminal_offence_type === "dci_civ_police" ? (
          <div className="space-y-0.5">
            <span className="line-clamp-2 block">{c.action_taken || "--"}</span>
            {c.action_taken && (
              <button type="button" onClick={() => onCaseUpdate(c)} className="text-[10px] text-cyan-400 hover:underline">Edit</button>
            )}
          </div>
        ) : <span className="text-gray-600">--</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] || "bg-gray-600 text-gray-300"}`}>
          {c.status?.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-4 py-3">
        <AbstractCell c={c} onAttach={onAttach} />
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{c.created_at?.slice(0, 10)}</td>
      <td className="px-4 py-3 text-xs text-gray-500">{renderAction()}</td>
    </tr>
  );
}

function CasesTable({ cases, loading, emptyMsg, onAttach, isUnderInvestigation, isPending, isServed, onServe, onMarkPending, onGuardroom, onResume, onCloseCase, onCaseUpdate, isHQAdmin, onMilestone, onViewHistory }) {
  if (isUnderInvestigation) {
    return <UnderInvestigationTable cases={cases} loading={loading} emptyMsg={emptyMsg} onAttach={onAttach} onServe={onServe} onMarkPending={onMarkPending} onGuardroom={onGuardroom} onCaseUpdate={onCaseUpdate} />;
  }
  if (isPending) {
    return <PendingTable cases={cases} loading={loading} emptyMsg={emptyMsg} onAttach={onAttach} onResume={onResume} />;
  }
  if (isServed) {
    return <ServedTable cases={cases} loading={loading} emptyMsg={emptyMsg} onAttach={onAttach} onCloseCase={onCloseCase} isHQAdmin={isHQAdmin} onMilestone={onMilestone} onViewHistory={onViewHistory} />;
  }
  return (
    <div className="bg-gray-800 rounded-lg overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
      <table className="min-w-[1220px] text-sm">
        <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-3 whitespace-nowrap">Case #</th>
            <th className="text-left px-4 py-3 whitespace-nowrap">Service No</th>
            <th className="text-left px-4 py-3">Rank</th>
            <th className="text-left px-4 py-3">Accused</th>
            <th className="text-left px-4 py-3">Offence</th>
            <th className="text-left px-4 py-3 whitespace-nowrap">P/Station</th>
            <th className="text-left px-4 py-3">Description</th>
            <th className="text-left px-4 py-3 whitespace-nowrap">Updates</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Abstract</th>
            <th className="text-left px-4 py-3">Date</th>
            <th className="text-left px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-500">Loading...</td></tr>
          ) : cases.length === 0 ? (
            <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-500">{emptyMsg}</td></tr>
          ) : (
            cases.map((c) => (
              <GenericCaseRow
                key={c.id}
                c={c}
                onAttach={onAttach}
                onServe={onServe}
                onMarkPending={onMarkPending}
                onGuardroom={onGuardroom}
                onResume={onResume}
                onCloseCase={onCloseCase}
                onCaseUpdate={onCaseUpdate}
                isHQAdmin={isHQAdmin}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// â"€â"€ Footer â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function Footer() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n, len = 2) => String(n).padStart(len, "0");
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

// â"€â"€ Pagination Bar â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const PAGE_SIZE = 25;

function PaginationBar({ page, totalPages, totalCount, onChange }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalCount);

  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1 text-xs text-gray-500">
      <span>Showing {start}-{end} of {totalCount} cases</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          &lt;- Prev
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1">...</span>
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
          Next ->
        </button>
      </div>
    </div>
  );
}

// â"€â"€ Main Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export default function InvestigatorDashboard({ user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [myTeams, setMyTeams] = useState([]);
  const [cases, setCases] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingCases, setLoadingCases] = useState(true);
  const [activeFilter, setActiveFilter] = useState("under_investigation");
  const [attachingCase, setAttachingCase] = useState(null);
  const [mentioningPromptCase, setMentioningPromptCase] = useState(null);
  const [servingCase, setServingCase] = useState(null);
  const [pendingCase, setPendingCase] = useState(null);
  const [guardroomCase, setGuardroomCase] = useState(null);
  const [updatingCase, setUpdatingCase] = useState(null);
  const [resumingCase, setResumingCase] = useState(null);
  const [closingCase, setClosingCase] = useState(null);
  const [milestoneModalCase, setMilestoneModalCase] = useState(null);
  const [historyModalData, setHistoryModalData] = useState(null); // { caseObj, milestones }
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ all: 0, under_investigation: 0, pending: 0, served: 0, closed: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    const statusFromUrl = searchParams.get("status");
    const allowedStatuses = new Set(FILTERS.map((f) => f.key));
    if (statusFromUrl && allowedStatuses.has(statusFromUrl) && statusFromUrl !== activeFilter) {
      setActiveFilter(statusFromUrl);
      setPage(1);
    }
  }, [searchParams, activeFilter]);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    try {
      const res = await teamService.list();
      const all = toArray(res.data);
      const mine = all.filter(
        (t) =>
          t.team_ic === user?.id ||
          t.team_ic_detail?.id === user?.id ||
          (t.members || []).includes(user?.id)
      );
      setMyTeams(mine);
    } catch {
      setMyTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  }, [user?.id]);

  // Fetch per-status counts once (page_size=1 gives us just the count from DRF)
  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const [allRes, uiRes, peRes, seRes, clRes] = await Promise.all([
        caseService.list({ page_size: 1 }),
        caseService.list({ page_size: 1, status: "under_investigation" }),
        caseService.list({ page_size: 1, status: "pending" }),
        caseService.list({ page_size: 1, status: "served" }),
        caseService.list({ page_size: 1, status: "closed" }),
      ]);
      setStatusCounts({
        all:                allRes.data.count || 0,
        under_investigation: uiRes.data.count || 0,
        pending:            peRes.data.count || 0,
        served:             seRes.data.count || 0,
        closed:             clRes.data.count || 0,
      });
    } catch {
      // keep zeros
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (activeFilter !== "all") params.status = activeFilter;
      const res = await caseService.list(params);
      setCases(toArray(res.data));
      setTotalCount(res.data.count || 0);
    } catch {
      setCases([]);
      setTotalCount(0);
    } finally {
      setLoadingCases(false);
    }
  }, [page, activeFilter]);

  useEffect(() => {
    loadTeams();
    loadCounts();
  }, [loadTeams, loadCounts]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // With server-side pagination `cases` is only one page, so team-case counts
  // are shown without a per-team breakdown (team cards focus on team composition)
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const activeFilterCfg = FILTERS.find((f) => f.key === activeFilter);
  const isHQAdmin = user?.role === "admin" && user?.battalion_type === "hqs";

  const handleFilterChange = (key) => {
    setActiveFilter(key);
    setPage(1);
    if (key === "all") {
      setSearchParams({});
    } else {
      setSearchParams({ status: key });
    }
  };

  const handleAttachmentChanged = () => {
    loadCases();
    loadCounts();
  };

  const handleOpenCase = (c) => {
    const needsMentioningDate =
      c?.criminal_offence_type === "court_martial" &&
      c?.status === "served" &&
      !c?.mentioning_date;

    if (needsMentioningDate) {
      setMentioningPromptCase(c);
      return;
    }

    setAttachingCase(c);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Investigator Dashboard</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Welcome, {user?.rank ? `${user.rank} ` : ""}{user?.name}
            {user?.battalion_name ? ` -- ${user.battalion_name}` : ""}
          </p>
        </div>
        <NotificationBell />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {FILTERS.map((cfg) => (
          <FilterCard
            key={cfg.key}
            cfg={cfg}
            value={statusCounts[cfg.key] ?? 0}
            isActive={activeFilter === cfg.key}
            loading={loadingCounts}
            onClick={() => handleFilterChange(cfg.key)}
          />
        ))}
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">My Investigation Teams</h3>
        {loadingTeams ? (
          <div className="text-gray-500 text-sm py-6 text-center">Loading teams...</div>
        ) : myTeams.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-6 text-center border border-gray-700">
            <p className="text-gray-500 text-sm">You are not assigned to any investigation team yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myTeams.map((team) => {
              const isIC = team.team_ic === user?.id || team.team_ic_detail?.id === user?.id;
              return (
                <div key={team.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{team.name}</p>
                      {isIC && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 mt-1 inline-block">
                          Team IC
                        </span>
                      )}
                    </div>
                  </div>
                  {team.team_ic_detail && (
                    <div className="text-xs text-gray-400">
                      <span className="text-gray-500">IC: </span>
                      {team.team_ic_detail.rank ? `${team.team_ic_detail.rank} ` : ""}
                      {team.team_ic_detail.name}
                    </div>
                  )}
                  {team.members_detail && team.members_detail.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Members ({team.members_detail.length})</p>
                      <div className="space-y-1">
                        {team.members_detail.slice(0, 4).map((m) => (
                          <div key={m.id} className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-indigo-600/40 flex items-center justify-center shrink-0">
                              <span className="text-[9px] text-indigo-300 font-bold">
                                {m.name?.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-xs text-gray-300 truncate">
                              {m.rank ? `${m.rank} ` : ""}{m.name}
                            </span>
                          </div>
                        ))}
                        {team.members_detail.length > 4 && (
                          <p className="text-xs text-gray-500">+{team.members_detail.length - 4} more</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            {activeFilterCfg?.label}
          </h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[activeFilter] || "bg-gray-700 text-gray-400"}`}>
            {loadingCounts ? "..." : `${totalCount} total`}
          </span>
        </div>
        <CasesTable
          cases={cases}
          loading={loadingCases}
          onAttach={handleOpenCase}
          isUnderInvestigation={activeFilter === "under_investigation"}
          isPending={activeFilter === "pending"}
          isServed={activeFilter === "served"}
          onServe={(c) => setServingCase(c)}
          onMarkPending={(c) => setPendingCase(c)}
          onGuardroom={(c) => setGuardroomCase(c)}
          onCaseUpdate={(c) => setUpdatingCase(c)}
          onResume={(c) => setResumingCase(c)}
          onCloseCase={(c) => setClosingCase(c)}
          isHQAdmin={isHQAdmin}
          onMilestone={(c) => setMilestoneModalCase(c)}
          onViewHistory={(caseObj) => setHistoryModalData({ caseObj })}
          emptyMsg={
            activeFilter === "all"
              ? "No cases associated with your teams or assignments yet."
              : `No ${activeFilterCfg?.label?.toLowerCase()} cases.`
          }
        />
        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onChange={setPage}
        />
      </section>

      {attachingCase && (
        <AttachModal
          caseObj={attachingCase}
          onClose={() => setAttachingCase(null)}
          onUploaded={handleAttachmentChanged}
        />
      )}

      {milestoneModalCase && (
        <CourtMartialMilestoneModal
          caseObj={milestoneModalCase}
          onClose={() => setMilestoneModalCase(null)}
          user={user}
        />
      )}

      {historyModalData && (
        <CourtMilestoneHistoryModal
          caseObj={historyModalData.caseObj}
          onClose={() => setHistoryModalData(null)}
        />
      )}

      {mentioningPromptCase && (
        <MentioningPromptModal
          caseObj={mentioningPromptCase}
          onClose={() => setMentioningPromptCase(null)}
          onSaved={(updatedCase) => {
            setMentioningPromptCase(null);
            setAttachingCase(updatedCase);
            handleAttachmentChanged();
          }}
        />
      )}

      {servingCase && (
        <ServeModal
          caseObj={servingCase}
          attachCount={((servingCase.rfi_document || servingCase.rfi_no || servingCase.rfi_date) ? 1 : 0) + (servingCase.tasking_letter ? 1 : 0) + (servingCase.extra_attachment_count || 0)}
          onClose={() => setServingCase(null)}
          onDone={handleAttachmentChanged}
        />
      )}

      {pendingCase && (
        <PendingModal
          caseObj={pendingCase}
          onClose={() => setPendingCase(null)}
          onDone={handleAttachmentChanged}
        />
      )}

      {guardroomCase && (
        <GuardroomModal
          caseObj={guardroomCase}
          onClose={() => setGuardroomCase(null)}
          onDone={handleAttachmentChanged}
        />
      )}

      {updatingCase && (
        <CaseUpdateModal
          caseObj={updatingCase}
          onClose={() => setUpdatingCase(null)}
          onDone={handleAttachmentChanged}
        />
      )}

      {resumingCase && (
        <ResumeModal
          caseObj={resumingCase}
          onClose={() => setResumingCase(null)}
          onDone={handleAttachmentChanged}
        />
      )}

      {closingCase && (
        <CloseModal
          caseObj={closingCase}
          onClose={() => setClosingCase(null)}
          onDone={handleAttachmentChanged}
        />
      )}

      <Footer />
    </div>
  );
}
