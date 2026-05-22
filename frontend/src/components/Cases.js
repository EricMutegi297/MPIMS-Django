import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { caseService, formationService, offenceService, teamService, attachmentService } from "../services/api";

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

const ALL_STATUSES = [
  "new", "under_investigation", "pending", "served", "closed",
  "open", "tasked", "referred",
];

const PRIMARY_STATUS_CHIPS = ["new", "under_investigation", "pending", "served", "closed"];

const COURT_MILESTONE_TYPES = [
  { value: "mentioning", label: "Mentioning" },
  { value: "hearing", label: "Hearing" },
  { value: "defence", label: "Defence" },
  { value: "ruling", label: "Ruling" },
  { value: "judgment", label: "Judgment" },
];

const ALL_RANKS = [
  "General",
  "Lieutenant General",
  "Major General",
  "Brigadier",
  "Colonel",
  "Lieutenant Colonel",
  "Major",
  "Captain",
  "Lieutenant",
  "2nd Lieutenant",
  "Warrant Officer Class 1",
  "Warrant Officer Class 2",
  "Senior Sergeant",
  "Staff Sergeant",
  "Sergeant",
  "Corporal",
  "Lance Corporal",
  "Private",
  "Recruit",
];

const INIT_CREATE = {
  title: "", description: "", offence: "", offence_ref: "", offence_type: "",
  service_offence_severity: "", criminal_offence_type: "",
  accused_name: "", accused_rank: "", accused_service_number: "",
  accused_service: "", accused_unit: "", submitting_unit: "", date_of_offence: "",
};

function Badge({ label, style }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${style}`}>
      {label?.replace(/_/g, " ")}
    </span>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-gray-200">{value}</p>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{children}</p>
  );
}

function ErrMsg({ msg }) {
  if (!msg) return null;
  return <p className="text-red-400 text-xs mt-1">{msg}</p>;
}

function ActionLabel({ action }) {
  const labels = {
    case_created: "Case Created",
    status_changed: "Status Changed",
    attachment_uploaded: "Attachment Uploaded",
    attachment_deleted: "Attachment Deleted",
    team_assigned: "Team Assigned",
    battalion_tasked: "Battalion Tasked",
    detachment_tasked: "Detachment Tasked",
    case_updated: "Case Updated",
  };
  return labels[action] || (action || "Update").replace(/_/g, " ");
}

function AbstractAttachmentsCell({ c, clickable = true }) {
  const [open, setOpen] = useState(false);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [loadedExtra, setLoadedExtra] = useState(false);
  const [extraAttachments, setExtraAttachments] = useState([]);
  const [extraErr, setExtraErr] = useState("");
  const panelRef = useRef(null);
  const dropdownIdRef = useRef(`attachments-${Math.random().toString(36).slice(2)}`);

  const hasRfi = Boolean(c?.rfi_document);
  const hasTaskingLetter = Boolean(c?.tasking_letter);
  const extraCount = Number(c?.extra_attachment_count || 0);
  const totalCount = (hasRfi ? 1 : 0) + (hasTaskingLetter ? 1 : 0) + extraCount;

  async function toggleOpen(e) {
    if (clickable) e.stopPropagation();
    const next = !open;
    setOpen(next);

    if (next) {
      window.dispatchEvent(
        new CustomEvent("mpims:attachments-open", {
          detail: { id: dropdownIdRef.current },
        })
      );
    }

    if (next && extraCount > 0 && !loadedExtra && !loadingExtra) {
      setLoadingExtra(true);
      setExtraErr("");
      try {
        const res = await attachmentService.list(c.id);
        setExtraAttachments(toArray(res.data));
        setLoadedExtra(true);
      } catch {
        setExtraErr("Failed to load extra attachments.");
      } finally {
        setLoadingExtra(false);
      }
    }
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(evt) {
      if (panelRef.current && !panelRef.current.contains(evt.target)) {
        setOpen(false);
      }
    }

    function onOtherDropdownOpen(evt) {
      if (evt.detail?.id !== dropdownIdRef.current) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mpims:attachments-open", onOtherDropdownOpen);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("mpims:attachments-open", onOtherDropdownOpen);
    };
  }, [open]);

  if (!totalCount) {
    return <span className="text-gray-500">--</span>;
  }

  return (
    <div ref={panelRef} className="text-xs" onClick={clickable ? (e) => e.stopPropagation() : undefined}>
      <button
        type="button"
        onClick={toggleOpen}
        className="text-blue-400 hover:underline"
      >
        {totalCount} attachment{totalCount !== 1 ? "s" : ""}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-gray-700 bg-gray-800/90 p-2.5 min-w-[220px] space-y-1.5">
          {hasRfi && (
            <a
              href={c.rfi_document}
              target="_blank"
              rel="noreferrer"
              className="block text-blue-400 hover:underline"
            >
              RFI Document - View
            </a>
          )}

          {hasTaskingLetter && (
            <a
              href={c.tasking_letter}
              target="_blank"
              rel="noreferrer"
              className="block text-blue-400 hover:underline"
            >
              Tasking Letter - View
            </a>
          )}

          {extraCount > 0 && loadingExtra && (
            <p className="text-gray-400">Loading extra attachments...</p>
          )}

          {extraCount > 0 && !loadingExtra && extraErr && (
            <p className="text-red-400">{extraErr}</p>
          )}

          {extraCount > 0 && !loadingExtra && !extraErr && extraAttachments.length > 0 && (
            <div className="space-y-1">
              {extraAttachments.map((att, idx) => (
                <a
                  key={att.id || idx}
                  href={att.file}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-blue-400 hover:underline"
                >
                  {att.label || att.file_name || `Extra Attachment ${idx + 1}`} - View
                </a>
              ))}
            </div>
          )}

          {extraCount > 0 && !loadingExtra && !extraErr && loadedExtra && extraAttachments.length === 0 && (
            <p className="text-gray-400">{extraCount} extra attachment{extraCount !== 1 ? "s" : ""} available.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Cases({ user, criminalTypeFilter }) {
  const detailPanelRef = useRef(null);
  const actionSaveInFlightRef = useRef(new Set());
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const initialFilter = ALL_STATUSES.includes(initialStatus) ? initialStatus : "all";
  const [cases, setCases]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState(initialFilter);
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);
  const selectedId = selected?.id || null;
  const [expandedDesc, setExpandedDesc] = useState({});

  // Create form
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState(INIT_CREATE);
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr]     = useState("");

  // Task form
  const [showTask, setShowTask]       = useState(false);
  const [taskModalMode, setTaskModalMode] = useState(false);
  const [taskBattalion, setTaskBattalion] = useState("");
  const [taskingDate, setTaskingDate] = useState("");
  const [taskFile, setTaskFile]       = useState(null);
  const [taskSaving, setTaskSaving]   = useState(false);
  const [taskErr, setTaskErr]         = useState("");

  // Assign team form
  const [showTeam, setShowTeam]       = useState(false);
  const [teamId, setTeamId]           = useState("");
  const [teamSaving, setTeamSaving]   = useState(false);
  const [teamErr, setTeamErr]         = useState("");

  // Status update
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusErr, setStatusErr]     = useState("");

  // Court Martial workflow
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
  const [showCourtCloseModal, setShowCourtCloseModal] = useState(false);
  const [judgmentFileRows, setJudgmentFileRows] = useState([]);
  const [courtCloseSaving, setCourtCloseSaving] = useState(false);
  const [courtCloseErr, setCourtCloseErr] = useState("");
  const [dateFieldActive, setDateFieldActive] = useState(false);
  const [caseActivity, setCaseActivity] = useState([]);
  const [caseActivityLoading, setCaseActivityLoading] = useState(false);
  const [caseActivityErr, setCaseActivityErr] = useState("");

  // Remote data for forms
  const [battalions, setBattalions]   = useState([]);
  const [teams, setTeams]             = useState([]);
  const [offences, setOffences]       = useState([]);
  const [units, setUnits]             = useState([]);

  // ── Permissions ──────────────────────────────────────────────────
  const isHqsAdmin  = user?.role === "admin" && user?.battalion_type === "hqs";
  const isSuperuser = Boolean(user?.is_superuser);
  const canCreate   = isHqsAdmin || isSuperuser;
  const canTask     = isHqsAdmin || isSuperuser;
  // Battalion admin/CO who is NOT HQS can assign teams
  const canAssignTeam = !isHqsAdmin && !isSuperuser &&
    (user?.role === "admin" || user?.role === "co");
  const isInvestigator = user?.role === "investigator";

  // ── Load cases ────────────────────────────────────────────────────
  function loadCases() {
    setLoading(true);
    caseService
      .list({ page_size: 200 })
      .then((res) => setCases(toArray(res.data)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCases(); }, []);

  // Load offences for dropdown
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    offenceService.list()
      .then((res) => setOffences(toArray(res.data)))
      .catch(() => {});
  }, []);

  // Load battalions for tasking form
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!canTask) return;
    formationService
      .battalions({ page_size: 200 })
      .then((res) =>
        setBattalions(
          toArray(res.data).filter(
            (b) => b.battalion_type === "special" || b.battalion_type === "normal"
          )
        )
      )
      .catch(() => {});
  }, [canTask]);

  // Load units for accused_unit / submitting_unit dropdowns
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    formationService
      .units({ page_size: 500 })
      .then((res) => setUnits(toArray(res.data)))
      .catch(() => {});
  }, []);

  // Load teams when a case is selected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedId) return;
    teamService
      .list()
      .then((res) => setTeams(toArray(res.data)))
      .catch(() => {});
  }, [selectedId]);

  // Keep table status in sync with dashboard card links (?status=...)
  useEffect(() => {
    const status = searchParams.get("status");
    setFilter(ALL_STATUSES.includes(status) ? status : "all");
  }, [searchParams]);

  // ── Helpers ───────────────────────────────────────────────────────
  function refreshSelected(updated) {
    setSelected(updated);
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function selectCase(c) {
    setSelected(c);
    setShowTask(false);
    setTaskModalMode(false);
    setShowTeam(false);
    setTaskErr("");
    setTeamErr("");
    setStatusErr("");
    setCourtMilestoneErr("");
    setCourtMilestoneSuccess("");
    setCaseActivity([]);
    setCaseActivityErr("");
    setActionDrafts({});
    setEditingActionMilestoneId(null);
    setShowCourtCloseModal(false);
    setJudgmentFileRows([]);
    setCourtCloseErr("");
  }

  const selectedIsCourtMartial = selected?.criminal_offence_type === "court_martial";

  useEffect(() => {
    if (!selectedId || !selectedIsCourtMartial) {
      setCourtMilestones([]);
      return;
    }
    setCourtMilestonesLoading(true);
    setCourtMilestoneErr("");
    caseService.listCourtMilestones(selectedId)
      .then((res) => {
        const rows = toArray(res.data);
        setCourtMilestones(rows);
        const drafts = {};
        rows.forEach((m) => {
          drafts[m.id] = m.action_remarks || "";
        });
        setActionDrafts(drafts);
        setEditingActionMilestoneId(null);
      })
      .catch(() => setCourtMilestoneErr("Failed to load Court Martial milestones."))
      .finally(() => setCourtMilestonesLoading(false));
  }, [selectedId, selectedIsCourtMartial]);

  useEffect(() => {
    if (!selectedId) {
      setCaseActivity([]);
      return;
    }
    setCaseActivityLoading(true);
    setCaseActivityErr("");
    caseService.activity(selectedId)
      .then((res) => setCaseActivity(toArray(res.data)))
      .catch(() => setCaseActivityErr("Failed to load case progress updates."))
      .finally(() => setCaseActivityLoading(false));
  }, [selectedId]);

  async function addCourtMilestone() {
    if (!selected) return;
    if (!milestoneType) {
      setCourtMilestoneErr("Select a milestone type.");
      return;
    }
    if (!milestoneDate) {
      setCourtMilestoneErr("Select a milestone date.");
      return;
    }
    if (!milestoneComment.trim()) {
      setCourtMilestoneErr("Milestone comment is required.");
      return;
    }
    setMilestoneSaving(true);
    setCourtMilestoneErr("");
    setCourtMilestoneSuccess("");
    try {
      const res = await caseService.addCourtMilestone(selected.id, {
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
      if (d?.detail) {
        setCourtMilestoneErr(String(d.detail));
      } else {
        setCourtMilestoneErr("Failed to save Court Martial milestone.");
      }
    } finally {
      setMilestoneSaving(false);
    }
  }

  async function saveMilestoneAction(milestoneId) {
    if (!selected) return;
    if (latestCourtMilestoneId && milestoneId !== latestCourtMilestoneId) {
      setCourtMilestoneErr("Only the most current milestone can be edited for Court Action / Remarks.");
      setCourtMilestoneSuccess("");
      return;
    }
    if (actionSaveInFlightRef.current.has(milestoneId)) return;
    const draft = (actionDrafts[milestoneId] || "").trim();
    if (!draft) {
      setCourtMilestoneErr("Action remarks are required.");
      setCourtMilestoneSuccess("");
      return;
    }
    const existing = courtMilestones.find((m) => m.id === milestoneId);
    if (existing && draft === String(existing.action_remarks || "").trim()) {
      setCourtMilestoneErr("");
      setCourtMilestoneSuccess("Action remarks already saved.");
      return;
    }
    actionSaveInFlightRef.current.add(milestoneId);
    setActionSavingId(milestoneId);
    setCourtMilestoneErr("");
    setCourtMilestoneSuccess("");
    try {
      const res = await caseService.updateCourtMilestone(selected.id, milestoneId, {
        action_remarks: draft,
      });
      setCourtMilestones((prev) => prev.map((m) => (m.id === milestoneId ? res.data : m)));
      setActionDrafts((prev) => ({ ...prev, [milestoneId]: res.data.action_remarks || "" }));
      setEditingActionMilestoneId(null);
      setCourtMilestoneSuccess("Court action remarks saved successfully.");
    } catch (err) {
      const d = err.response?.data;
      if (d?.detail) {
        setCourtMilestoneErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setCourtMilestoneErr(msgs || "Failed to save action remarks.");
      } else {
        setCourtMilestoneErr("Failed to save action remarks.");
      }
      setCourtMilestoneSuccess("");
    } finally {
      actionSaveInFlightRef.current.delete(milestoneId);
      setActionSavingId(null);
    }
  }

  function newJudgmentFileRow() {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: "",
      file: null,
    };
  }

  function openCourtCloseModal() {
    setCourtCloseErr("");
    setJudgmentFileRows([newJudgmentFileRow()]);
    setShowCourtCloseModal(true);
  }

  function addJudgmentFileRow() {
    setJudgmentFileRows((prev) => [...prev, newJudgmentFileRow()]);
  }

  function updateJudgmentFileRow(rowId, patch) {
    setJudgmentFileRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
    if (courtCloseErr) setCourtCloseErr("");
  }

  function removeJudgmentFileRow(rowId) {
    setJudgmentFileRows((prev) => {
      const next = prev.filter((r) => r.id !== rowId);
      return next.length ? next : [newJudgmentFileRow()];
    });
    if (courtCloseErr) setCourtCloseErr("");
  }

  async function submitCourtCloseWithJudgmentFiles() {
    if (!selected) return;
    const rowsWithFiles = judgmentFileRows.filter((r) => r.file);
    if (!rowsWithFiles.length) {
      setCourtCloseErr("Attach at least one Judgment PDF file.");
      return;
    }

    for (const row of rowsWithFiles) {
      if (!String(row.label || "").trim()) {
        setCourtCloseErr("Each Judgment PDF must have a file label.");
        return;
      }
      const name = String(row.file?.name || "").toLowerCase();
      if (!name.endsWith(".pdf")) {
        setCourtCloseErr("Only PDF files are allowed for Judgment attachments.");
        return;
      }
    }

    setCourtCloseSaving(true);
    setCourtCloseErr("");
    try {
      for (const row of rowsWithFiles) {
        const fd = new FormData();
        fd.append("document_type", "judgment");
        fd.append("label", row.label.trim());
        fd.append("file", row.file);
        await attachmentService.upload(selected.id, fd);
      }

      const closed = await handleStatus("closed");
      if (!closed) {
        setCourtCloseErr("Failed to close case after attaching judgment files.");
        return;
      }

      setShowCourtCloseModal(false);
      setJudgmentFileRows([]);
      setCourtCloseErr("");
    } catch (err) {
      const d = err?.response?.data;
      if (d?.detail) {
        setCourtCloseErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setCourtCloseErr(msgs || "Failed to upload judgment files.");
      } else {
        setCourtCloseErr("Failed to upload judgment files.");
      }
    } finally {
      setCourtCloseSaving(false);
    }
  }

  function startEditMilestoneAction(milestoneId) {
    if (latestCourtMilestoneId && milestoneId !== latestCourtMilestoneId) {
      setCourtMilestoneErr("Only the most current milestone can be edited for Court Action / Remarks.");
      setCourtMilestoneSuccess("");
      return;
    }
    setCourtMilestoneErr("");
    setCourtMilestoneSuccess("");
    setEditingActionMilestoneId(milestoneId);
  }

  function cancelEditMilestoneAction(milestoneId) {
    const existing = courtMilestones.find((m) => m.id === milestoneId);
    setActionDrafts((prev) => ({
      ...prev,
      [milestoneId]: existing?.action_remarks || "",
    }));
    setEditingActionMilestoneId(null);
  }

  // ── Create case ───────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setCreateSaving(true);
    setCreateErr("");
    const fd = new FormData();
    Object.entries(createForm).forEach(([k, v]) => {
      if (k === "offence_ref") return; // handled separately below
      if (k === "accused_unit" || k === "submitting_unit") return; // handled separately
      if (v) fd.append(k, v);
    });
    if (createForm.offence_ref) fd.append("offence_ref", createForm.offence_ref);
    if (createForm.accused_unit) fd.append("accused_unit", createForm.accused_unit);
    if (createForm.submitting_unit) fd.append("submitting_unit", createForm.submitting_unit);
    try {
      await caseService.create(fd);
      setShowCreate(false);
      setCreateForm(INIT_CREATE);
      loadCases();
    } catch (err) {
      const d = err.response?.data;
      if (typeof d === "string" && d.trim()) {
        setCreateErr(d);
      } else if (d?.detail) {
        setCreateErr(Array.isArray(d.detail) ? d.detail.join(", ") : String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setCreateErr(msgs);
      } else {
        setCreateErr(err?.message || "Failed to create case.");
      }
    } finally {
      setCreateSaving(false);
    }
  }

  // ── Task case ─────────────────────────────────────────────────────
  async function handleTask(e) {
    e.preventDefault();
    if (!taskBattalion) { setTaskErr("Select a battalion."); return; }
    if (!taskFile)      { setTaskErr("Attach a tasking letter."); return; }
    if (!taskingDate)   { setTaskErr("Set a tasking date."); return; }
    setTaskSaving(true);
    setTaskErr("");
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const taskingDateTime = `${taskingDate}T${hh}:${mm}:${ss}`;
    const fd = new FormData();
    fd.append("tasked_battalion", taskBattalion);
    fd.append("tasking_letter", taskFile);
    fd.append("tasking_date", taskingDateTime);
    try {
      const res = await caseService.taskCase(selected.id, fd);
      setCases((prev) => prev.map((c) => (c.id === res.data.id ? res.data : c)));
      setSelected(null);
      setShowTask(false);
      setTaskModalMode(false);
      setTaskBattalion("");
      setTaskFile(null);
      setTaskingDate("");
    } catch (err) {
      const d = err.response?.data;
      if (typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setTaskErr(msgs);
      } else {
        setTaskErr("Failed to task case.");
      }
    } finally {
      setTaskSaving(false);
    }
  }

  // ── Assign team ───────────────────────────────────────────────────
  async function handleAssignTeam(e) {
    e.preventDefault();
    if (!teamId) { setTeamErr("Select a team."); return; }
    setTeamSaving(true);
    setTeamErr("");
    try {
      const res = await caseService.update(selected.id, { assigned_team: parseInt(teamId) });
      refreshSelected(res.data);
      setShowTeam(false);
      setTeamId("");
    } catch (err) {
      setTeamErr("Failed to assign team.");
    } finally {
      setTeamSaving(false);
    }
  }

  // ── Status change ─────────────────────────────────────────────────
  async function handleStatus(newStatus) {
    setStatusSaving(true);
    setStatusErr("");
    try {
      const payload = { status: newStatus };
      if (selectedIsCourtMartial && newStatus === "closed") {
        if (!(isHqsAdmin || isSuperuser)) {
          setStatusErr("Only HQ battalion admin can close a Court Martial case.");
          setStatusSaving(false);
          return false;
        }
        const judgment = courtMilestones.find((m) => m.milestone_type === "judgment");
        if (!judgment?.scheduled_date) {
          setStatusErr("Judgment date is required before closing a Court Martial case.");
          setStatusSaving(false);
          return false;
        }
        if (!String(judgment.action_remarks || judgment.planning_comment || "").trim()) {
          setStatusErr("Judgment remarks/comment are required before closing a Court Martial case.");
          setStatusSaving(false);
          return false;
        }
      }
      const res = await caseService.update(selected.id, payload);
      refreshSelected(res.data);
      loadCases();
      return true;
    } catch (err) {
      const d = err.response?.data;
      if (d?.detail) {
        setStatusErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setStatusErr(msgs || "Failed to update status.");
      } else {
        setStatusErr("Failed to update status.");
      }
      return false;
    } finally {
      setStatusSaving(false);
    }
  }

  // ── Filter / search ───────────────────────────────────────────────
  const filtered = cases.filter((c) => {
    const matchStatus = filter === "all" || c.status === filter;
    const matchCriminalType = !criminalTypeFilter || c.criminal_offence_type === criminalTypeFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (c.case_number || "").toLowerCase().includes(q) ||
      (c.title || "").toLowerCase().includes(q) ||
      (c.offence || "").toLowerCase().includes(q) ||
      (c.accused_name || "").toLowerCase().includes(q) ||
      (c.accused_rank || "").toLowerCase().includes(q);
    return matchStatus && matchSearch && matchCriminalType;
  });

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = cases.filter((c) => c.status === s).length;
    return acc;
  }, {});

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

  const descLimit = 120;
  const isAllFilter = filter === "all";
  const isNewFilter = filter === "new" || filter === "open";
  const isTaskedFilter = filter === "tasked";
  const isUnderInvestigationFilter = filter === "under_investigation";
  const isPendingFilter = filter === "pending";
  const isServedFilter = filter === "served";
  const isClosedFilter = filter === "closed";

  function toggleDescription(caseId, e) {
    e.stopPropagation();
    setExpandedDesc((prev) => ({ ...prev, [caseId]: !prev[caseId] }));
  }

  function toggleTaskPanel() {
    setShowTeam(false);
    setCreateErr("");
    setShowCreate(false);
    setTaskModalMode(false);
    setShowTask((prev) => !prev);
    setTaskErr("");
  }

  function toggleTeamPanel() {
    setTaskModalMode(false);
    setShowTask(false);
    setTaskErr("");
    setCreateErr("");
    setShowCreate(false);
    setShowTeam((prev) => !prev);
    setTeamErr("");
  }

  function openCreateModal() {
    setTaskModalMode(false);
    setShowTask(false);
    setTaskErr("");
    setShowTeam(false);
    setTeamErr("");
    setShowCreate(true);
  }

  function openTaskForCase(c, e) {
    e.stopPropagation();
    setSelected(c);
    setShowCreate(false);
    setShowTeam(false);
    setTeamErr("");
    setTaskModalMode(true);
    setTaskErr("");
    setTaskBattalion("");
    setTaskFile(null);
    setTaskingDate("");
    setShowTask(true);
  }

  function handleDateFieldFocus() {
    setDateFieldActive(true);
  }

  function handleDateFieldBlur() {
    window.setTimeout(() => setDateFieldActive(false), 0);
  }

  useEffect(() => {
    if (!selected || taskModalMode || showCreate) return;

    function onPointerDown(evt) {
      if (dateFieldActive) return;
      if (detailPanelRef.current && !detailPanelRef.current.contains(evt.target)) {
        setSelected(null);
        setShowTask(false);
        setTaskModalMode(false);
        setTaskErr("");
        setShowTeam(false);
        setTeamErr("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [selected, taskModalMode, showCreate, dateFieldActive]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {criminalTypeFilter === "court_martial" ? "Court Martial Cases" : criminalTypeFilter === "dci_civ_police" ? "DCI / Civ Police Cases" : "Cases"}
          </h2>
          {criminalTypeFilter && (
            <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              criminalTypeFilter === "court_martial" ? "bg-purple-900/60 text-purple-300 border border-purple-700" : "bg-blue-900/60 text-blue-300 border border-blue-700"
            }`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Filtered: {criminalTypeFilter === "court_martial" ? "Court Martial" : "DCI / Civ Police"}
            </span>
          )}
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {cases.length} case{cases.length !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Case
          </button>
        )}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          All ({cases.length})
        </button>

        {/* Primary flow chips: New -> Under Investigation -> Pending -> Close */}
        {PRIMARY_STATUS_CHIPS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === s ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {(s === "closed" ? "close" : s.replace(/_/g, " "))} ({counts[s] || 0})
          </button>
        ))}

        {/* Secondary chips only when present */}
        {ALL_STATUSES
          .filter((s) => !PRIMARY_STATUS_CHIPS.includes(s) && counts[s] > 0)
          .map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                filter === s ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {s.replace(/_/g, " ")} ({counts[s]})
            </button>
          ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by case #, title, offence, accused..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full md:w-96 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      {/* Main content: list + optional detail panel */}
      <div className="space-y-4">

        {/* ── Case list ──────────────────────────────────────────── */}
        <div className="w-full bg-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-gray-500 text-sm">No cases found.</p>
          ) : (
            <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-4 py-3 font-medium">Case #</th>
                  <th className="text-left px-4 py-3 font-medium">Service No</th>
                  <th className="text-left px-4 py-3 font-medium">Rank</th>
                  <th className="text-left px-4 py-3 font-medium">Accused</th>
                  <th className="text-left px-4 py-3 font-medium">Offence</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                  {isAllFilter && (
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  )}
                  {isNewFilter && (
                    <th className="text-left px-4 py-3 font-medium">Action To Task</th>
                  )}
                  {isTaskedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Tasking Letter</th>
                  )}
                  {isTaskedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Tasked Battalion/Detachment</th>
                  )}
                  {isUnderInvestigationFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {isPendingFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {isPendingFilter && (
                    <th className="text-left px-4 py-3 font-medium">Reason For Pending</th>
                  )}
                  {isServedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {isServedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Date Served</th>
                  )}
                  {isServedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Remarks</th>
                  )}
                  {isClosedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {isClosedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Date Closed</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  (() => {
                    const desc = c.description || "--";
                    const expanded = !!expandedDesc[c.id];
                    const longDesc = desc.length > descLimit;
                    const shownDesc = expanded || !longDesc ? desc : `${desc.slice(0, descLimit)}...`;
                    return (
                  <tr
                    key={c.id}
                    onClick={() => selectCase(c)}
                    className={`border-b border-gray-700/40 cursor-pointer transition-colors ${
                      selected?.id === c.id
                        ? "bg-blue-900/30"
                        : "hover:bg-gray-700/30"
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {c.case_number || "--"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{c.accused_service_number || "--"}</td>
                    <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{c.accused_rank || "--"}</td>
                    <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{c.accused_name || "--"}</td>
                    <td className="px-4 py-2.5 text-gray-200 whitespace-nowrap">{c.offence_name || c.offence || "--"}</td>
                    <td className="px-4 py-2.5 text-gray-300 min-w-[260px] max-w-[420px]">
                      <p className="whitespace-pre-wrap break-words">{shownDesc}</p>
                      {longDesc && (
                        <button
                          type="button"
                          onClick={(e) => toggleDescription(c.id, e)}
                          className="mt-1 text-xs text-blue-400 hover:underline"
                        >
                          {expanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </td>
                    {isAllFilter && (
                      <td className="px-4 py-2.5">
                        <Badge
                          label={c.status}
                          style={STATUS_STYLE[c.status] || "bg-gray-600 text-gray-300"}
                        />
                      </td>
                    )}
                    {isNewFilter && (
                      <td className="px-4 py-2.5">
                        {canTask ? (
                          <button
                            type="button"
                            onClick={(e) => openTaskForCase(c, e)}
                            className="px-2.5 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs font-medium"
                          >
                            Task
                          </button>
                        ) : (
                          <span className="text-gray-500">--</span>
                        )}
                      </td>
                    )}
                    {isTaskedFilter && (
                      <td className="px-4 py-2.5">
                        {c.tasking_letter ? (
                          <a
                            href={c.tasking_letter}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-400 hover:underline whitespace-nowrap"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-gray-500">--</span>
                        )}
                      </td>
                    )}
                    {isTaskedFilter && (
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                        {c.tasked_detachment_name
                          ? `${c.tasked_battalion_name || "--"} / ${c.tasked_detachment_name}`
                          : c.tasked_battalion_name || "--"}
                      </td>
                    )}
                    {isUnderInvestigationFilter && (
                      <td className="px-4 py-2.5 text-gray-300"><AbstractAttachmentsCell c={c} /></td>
                    )}
                    {isPendingFilter && (
                      <td className="px-4 py-2.5 text-gray-300"><AbstractAttachmentsCell c={c} /></td>
                    )}
                    {isPendingFilter && (
                      <td className="px-4 py-2.5 text-gray-300">{c.reason_for_pending || c.action_taken || c.remarks || "--"}</td>
                    )}
                    {isServedFilter && (
                      <td className="px-4 py-2.5 text-gray-300"><AbstractAttachmentsCell c={c} /></td>
                    )}
                    {isServedFilter && (
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                        {c.served_at ? new Date(c.served_at).toLocaleDateString("en-GB") : "--"}
                      </td>
                    )}
                    {isServedFilter && (
                      <td className="px-4 py-2.5 text-gray-300">{c.remarks || "--"}</td>
                    )}
                    {isClosedFilter && (
                      <td className="px-4 py-2.5 text-gray-300"><AbstractAttachmentsCell c={c} /></td>
                    )}
                    {isClosedFilter && (
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                        {c.closed_at
                          ? new Date(c.closed_at).toLocaleDateString("en-GB")
                          : c.updated_at
                          ? new Date(c.updated_at).toLocaleDateString("en-GB")
                          : "--"}
                      </td>
                    )}
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* ── Case detail panel ──────────────────────────────────── */}
        {selected && !taskModalMode && (
          <div ref={detailPanelRef} className="w-full bg-gray-800 rounded-xl p-5 space-y-5 relative">

            {/* Close */}
            <button
              onClick={() => setSelected(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Case header */}
            <div className="pr-8">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-gray-400">{selected.case_number}</span>
                <Badge
                  label={selected.status}
                  style={STATUS_STYLE[selected.status] || "bg-gray-600 text-gray-300"}
                />
              </div>
              <h3 className="text-lg font-semibold text-white mt-1">
                {selected.title || selected.offence || "Untitled Case"}
              </h3>
              {selected.description && (
                <p className="text-sm text-gray-400 mt-1">{selected.description}</p>
              )}
            </div>

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Offence" value={selected.offence} />
              <Field label="Date of Offence" value={selected.date_of_offence} />
              <Field
                label="Created"
                value={selected.created_at ? new Date(selected.created_at).toLocaleDateString("en-GB") : null}
              />
              <Field label="Created By" value={selected.created_by_name} />
            </div>

            {/* Accused */}
            {(selected.accused_name || selected.accused_rank || selected.accused_service_number) && (
              <div>
                <SectionLabel>Accused</SectionLabel>
                <div className="grid grid-cols-2 gap-3 bg-gray-700/30 rounded-lg p-3">
                  <Field label="Name" value={selected.accused_name} />
                  <Field label="Rank" value={selected.accused_rank} />
                  <Field label="Service #" value={selected.accused_service_number} />
                  <Field label="Service" value={selected.accused_service} />
                  <Field label="Unit" value={selected.accused_unit_name} />
                  <Field label="Submitting Unit" value={selected.submitting_unit_name} />
                </div>
              </div>
            )}

            {/* Tasking info */}
            {selected.tasked_battalion_name && (
              <div>
                <SectionLabel>Tasking</SectionLabel>
                <div className="grid grid-cols-2 gap-3 bg-gray-700/30 rounded-lg p-3">
                  <Field label="Tasked Battalion" value={selected.tasked_battalion_name} />
                  <Field label="Type" value={selected.tasked_battalion_type} />
                  <Field
                    label="Tasking Date"
                    value={selected.tasking_date ? new Date(selected.tasking_date).toLocaleString("en-GB") : null}
                  />
                  {selected.assigned_team_name && (
                    <Field label="Investigation Team" value={selected.assigned_team_name} />
                  )}
                  {selected.assigned_to_name && (
                    <Field label="Assigned To" value={selected.assigned_to_name} />
                  )}
                  {selected.tasking_letter && (
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">Tasking Letter</p>
                      <a
                        href={selected.tasking_letter}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-400 hover:underline"
                      >
                        View Document
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RFI */}
            {selected.rfi_no && (
              <div>
                <SectionLabel>RFI</SectionLabel>
                <div className="grid grid-cols-2 gap-3 bg-gray-700/30 rounded-lg p-3">
                  <Field label="RFI No" value={selected.rfi_no} />
                  <Field label="RFI Date" value={selected.rfi_date} />
                </div>
              </div>
            )}

            {/* Remarks / Action Taken */}
            {(selected.action_taken || selected.remarks) && (
              <div className="space-y-2">
                {selected.action_taken && (
                  <div>
                    <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-1">Action Taken</p>
                    <p className="text-sm text-gray-200 bg-gray-700/30 rounded-lg p-3">{selected.action_taken}</p>
                  </div>
                )}
                {selected.remarks && (
                  <div>
                    <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-1">Remarks</p>
                    <p className="text-sm text-gray-200 bg-gray-700/30 rounded-lg p-3">{selected.remarks}</p>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-gray-700 pt-4 space-y-3">
              <SectionLabel>Case Progress Timeline</SectionLabel>
              {caseActivityLoading ? (
                <p className="text-sm text-gray-500">Loading progress updates...</p>
              ) : caseActivityErr ? (
                <ErrMsg msg={caseActivityErr} />
              ) : caseActivity.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-700/30 rounded-lg p-3">No progress updates recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {caseActivity.map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-700 bg-gray-700/25 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-blue-400">{ActionLabel({ action: item.action })}</p>
                        <p className="text-[11px] text-gray-500 whitespace-nowrap">
                          {item.created_at ? new Date(item.created_at).toLocaleString("en-GB") : "--"}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{item.actor_name || "System"}</p>
                      {item.detail && <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap break-words">{item.detail}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedIsCourtMartial && (
              <div className="border-t border-gray-700 pt-4 space-y-3">
                <SectionLabel>Court Martial Progress</SectionLabel>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gray-700/30 rounded-lg p-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Milestone Type</label>
                    <select
                      value={milestoneType}
                      onChange={(e) => setMilestoneType(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                    >
                      {COURT_MILESTONE_TYPES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Milestone Date</label>
                    <input
                      type="date"
                      value={milestoneDate}
                      onChange={(e) => setMilestoneDate(e.target.value)}
                      onFocus={handleDateFieldFocus}
                      onBlur={handleDateFieldBlur}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-xs text-gray-400 block mb-1">Planning Comment</label>
                    <input
                      type="text"
                      value={milestoneComment}
                      onChange={(e) => setMilestoneComment(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      placeholder="Reason/context for the selected milestone"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <button
                      type="button"
                      onClick={addCourtMilestone}
                      disabled={milestoneSaving}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      {milestoneSaving ? "Saving..." : "Add Milestone"}
                    </button>
                  </div>
                </div>

                <div className="bg-gray-700/30 rounded-lg p-3 space-y-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Milestones and Court Action Remarks</p>
                  {courtMilestonesLoading ? (
                    <p className="text-sm text-gray-500">Loading milestones...</p>
                  ) : courtMilestones.length === 0 ? (
                    <p className="text-sm text-gray-500">No milestones set yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {courtMilestones.map((m) => (
                        <div key={m.id} className="rounded bg-gray-800 px-3 py-3 border border-gray-700 space-y-2">
                          {(() => {
                            const isLatestMilestone = m.id === latestCourtMilestoneId;
                            const isEditing = editingActionMilestoneId === m.id;
                            return (
                              <>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm text-white font-medium capitalize">
                                {m.milestone_type} - {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString("en-GB") : "--"}
                              </p>
                              {isEditing && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-600/30 text-sky-300 border border-sky-500/40 uppercase tracking-wide">
                                  Editing
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-gray-400">{m.created_by_name || "--"}</span>
                          </div>
                          <p className="text-xs text-gray-400">{m.planning_comment || "No planning comment"}</p>

                          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">Court Action / Remarks</label>
                              <input
                                type="text"
                                value={actionDrafts[m.id] ?? ""}
                                onChange={(e) => {
                                  setActionDrafts((prev) => ({ ...prev, [m.id]: e.target.value }));
                                  if (courtMilestoneSuccess) setCourtMilestoneSuccess("");
                                }}
                                disabled={!isLatestMilestone || !isEditing || actionSavingId === m.id}
                                className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                                placeholder="Enter action taken by Court Martial"
                              />
                            </div>
                            {!isLatestMilestone && (
                              <button
                                type="button"
                                disabled
                                className="px-3 py-2 bg-indigo-600 disabled:opacity-40 text-white rounded text-xs font-medium"
                              >
                                Save Action
                              </button>
                            )}
                            {isLatestMilestone && !isEditing && (
                              <button
                                type="button"
                                onClick={() => startEditMilestoneAction(m.id)}
                                className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-medium"
                              >
                                Edit Action
                              </button>
                            )}
                            {isLatestMilestone && isEditing && (
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

                          {!isLatestMilestone && (
                            <p className="text-[11px] text-amber-400">Only the most current milestone can be edited.</p>
                          )}

                          {m.action_recorded_at && (
                            <p className="text-[11px] text-gray-500">
                              Last action update: {new Date(m.action_recorded_at).toLocaleString("en-GB")} by {m.action_recorded_by_name || "--"}
                            </p>
                          )}
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                  {courtMilestoneSuccess && (
                    <p className="text-xs text-green-400">{courtMilestoneSuccess}</p>
                  )}
                  <ErrMsg msg={courtMilestoneErr} />
                </div>
              </div>
            )}

            {/* ═══════════════ ACTIONS ═══════════════ */}

            {/* HQS Admin / Superuser: Task to Battalion */}
            {canTask && (selected.status === "new" || selected.status === "open") && (
              <div className="border-t border-gray-700 pt-4 space-y-3">
                <button
                  onClick={toggleTaskPanel}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {showTask ? "Cancel Tasking" : "Task to Battalion"}
                </button>
                {showTask && (
                  <form onSubmit={handleTask} className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Battalion *</label>
                      <select
                        value={taskBattalion}
                        onChange={(e) => setTaskBattalion(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      >
                        <option value="">Select battalion…</option>
                        {battalions.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Tasking Date *</label>
                      <input
                        type="date"
                        value={taskingDate}
                        onChange={(e) => setTaskingDate(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">Time is auto-captured when tasking is submitted.</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Tasking Letter *</label>
                      <input
                        type="file"
                        onChange={(e) => setTaskFile(e.target.files[0])}
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="w-full text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-600 file:text-white file:text-xs"
                      />
                    </div>
                    <ErrMsg msg={taskErr} />
                    <button
                      type="submit"
                      disabled={taskSaving}
                      className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {taskSaving ? "Tasking…" : "Submit Tasking"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Battalion Admin/CO: Assign Investigation Team */}
            {canAssignTeam && selected.status === "tasked" && (
              <div className="border-t border-gray-700 pt-4 space-y-3">
                <button
                  onClick={toggleTeamPanel}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {showTeam ? "Cancel" : "Assign Investigation Team"}
                </button>
                {showTeam && (
                  <form onSubmit={handleAssignTeam} className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Investigation Team *</label>
                      <select
                        value={teamId}
                        onChange={(e) => setTeamId(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      >
                        <option value="">Select team…</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <ErrMsg msg={teamErr} />
                    <button
                      type="submit"
                      disabled={teamSaving}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {teamSaving ? "Assigning…" : "Assign Team"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Investigator / Admin: Status transitions */}
            {(isInvestigator || canTask) &&
              ["under_investigation", "pending", "served"].includes(selected.status) && (
              <div className="border-t border-gray-700 pt-4">
                <SectionLabel>Update Status</SectionLabel>
                <ErrMsg msg={statusErr} />
                <div className="flex flex-wrap gap-2 mt-2">
                  {selected.status === "under_investigation" && (
                    <button
                      onClick={() => handleStatus("pending")}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Mark Pending
                    </button>
                  )}
                  {selected.status === "pending" && (
                    <button
                      onClick={() => handleStatus("under_investigation")}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Resume Investigation
                    </button>
                  )}
                  {["under_investigation", "pending"].includes(selected.status) && (
                    <button
                      onClick={() => handleStatus("served")}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Mark Served
                    </button>
                  )}
                  {selected.status === "served" && (!selectedIsCourtMartial || isHqsAdmin || isSuperuser) && (
                    <button
                      onClick={() => {
                        if (selectedIsCourtMartial) {
                          openCourtCloseModal();
                        } else {
                          handleStatus("closed");
                        }
                      }}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Close Case
                    </button>
                  )}
                  <button
                    onClick={() => handleStatus("referred")}
                    disabled={statusSaving}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                  >
                    Refer Case
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ══════════════ CLOSE COURT MARTIAL MODAL ══════════════ */}
      {showCourtCloseModal && selected && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          onClick={() => { if (!courtCloseSaving) setShowCourtCloseModal(false); }}
        >
          <div
            className="w-full max-w-2xl bg-gray-800 rounded-2xl p-6 space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { if (!courtCloseSaving) setShowCourtCloseModal(false); }}
              disabled={courtCloseSaving}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors disabled:opacity-40"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-semibold text-white">Close Court Martial Case</h3>
            <p className="text-xs text-gray-400">
              Attach one or more <span className="font-semibold text-gray-300">Judgment PDF</span> files with labels before closing this case.
            </p>

            <div className="space-y-3">
              {judgmentFileRows.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end bg-gray-700/40 rounded-lg p-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">File Label #{idx + 1}</label>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateJudgmentFileRow(row.id, { label: e.target.value })}
                      disabled={courtCloseSaving}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      placeholder="e.g. Judgment Order - Session 1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Judgment PDF</label>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => updateJudgmentFileRow(row.id, { file: e.target.files?.[0] || null })}
                      disabled={courtCloseSaving}
                      className="w-full text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-600 file:text-white file:text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeJudgmentFileRow(row.id)}
                    disabled={courtCloseSaving}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded text-xs font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={addJudgmentFileRow}
                disabled={courtCloseSaving}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                + Add Another PDF
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCourtCloseModal(false)}
                  disabled={courtCloseSaving}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCourtCloseWithJudgmentFiles}
                  disabled={courtCloseSaving}
                  className="px-4 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white rounded text-xs font-medium"
                >
                  {courtCloseSaving ? "Closing..." : "Attach PDFs & Close Case"}
                </button>
              </div>
            </div>

            <ErrMsg msg={courtCloseErr} />
          </div>
        </div>
      )}

      {/* ══════════════ TASKING MODAL (from row Task button) ══════════════ */}
      {showTask && taskModalMode && selected && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          onClick={() => { setShowTask(false); setTaskModalMode(false); setTaskErr(""); }}
        >
          <div
            className="w-full max-w-lg bg-gray-800 rounded-2xl p-6 space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setShowTask(false); setTaskModalMode(false); setTaskErr(""); }}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-semibold text-white">Task to Battalion</h3>
            <p className="text-xs text-gray-400">
              Case: <span className="font-mono">{selected.case_number || "--"}</span>
            </p>

            <form onSubmit={handleTask} className="bg-gray-700/40 rounded-lg p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Battalion *</label>
                <select
                  value={taskBattalion}
                  onChange={(e) => setTaskBattalion(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                >
                  <option value="">Select battalion…</option>
                  {battalions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Tasking Date *</label>
                <input
                  type="date"
                  value={taskingDate}
                  onChange={(e) => setTaskingDate(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                />
                <p className="text-[11px] text-gray-500 mt-1">Time is auto-captured when tasking is submitted.</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Tasking Letter *</label>
                <input
                  type="file"
                  onChange={(e) => setTaskFile(e.target.files[0])}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="w-full text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-600 file:text-white file:text-xs"
                />
              </div>
              <ErrMsg msg={taskErr} />
              <button
                type="submit"
                disabled={taskSaving}
                className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded text-sm font-medium"
              >
                {taskSaving ? "Tasking…" : "Submit Tasking"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ CREATE CASE MODAL ══════════════ */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          onClick={() => { setShowCreate(false); setCreateErr(""); setCreateForm(INIT_CREATE); }}
        >
          <div
            className="w-full max-w-xl bg-gray-800 rounded-2xl p-6 space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setShowCreate(false); setCreateErr(""); setCreateForm(INIT_CREATE); }}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-lg font-semibold text-white">New Case</h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">

                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Offence</label>
                  {offences.length > 0 ? (
                    <select
                      value={createForm.offence_ref}
                      onChange={(e) => {
                        const selected = offences.find((o) => String(o.id) === e.target.value);
                        setCreateForm((f) => ({
                          ...f,
                          offence_ref: e.target.value,
                          offence: selected ? selected.name : "",
                        }));
                      }}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                    >
                      <option value="">Select offence…</option>
                      {offences
                        .slice()
                        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                        .map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={createForm.offence}
                      onChange={(e) => setCreateForm((f) => ({ ...f, offence: e.target.value }))}
                      placeholder="No offences defined yet — type manually"
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2 placeholder-gray-500"
                    />
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Offence Type</label>
                  <select
                    value={createForm.offence_type}
                    onChange={(e) => setCreateForm((f) => ({ ...f, offence_type: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  >
                    <option value="">Select…</option>
                    <option value="service_offence">Service Offence</option>
                    <option value="criminal_offence">Criminal Offence</option>
                  </select>
                </div>

                {createForm.offence_type === "service_offence" && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Severity</label>
                    <select
                      value={createForm.service_offence_severity}
                      onChange={(e) => setCreateForm((f) => ({ ...f, service_offence_severity: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                    >
                      <option value="">Select…</option>
                      <option value="serious">Serious</option>
                      <option value="minor">Minor</option>
                    </select>
                  </div>
                )}

                {createForm.offence_type === "criminal_offence" && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Criminal Offence Type</label>
                    <select
                      value={createForm.criminal_offence_type}
                      onChange={(e) => setCreateForm((f) => ({ ...f, criminal_offence_type: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                    >
                      <option value="">Select…</option>
                      <option value="dci_civ_police">DCI / Civ Police</option>
                      <option value="court_martial">Court Martial</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Accused Name</label>
                  <input
                    type="text"
                    value={createForm.accused_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, accused_name: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Accused Rank</label>
                  <select
                    value={createForm.accused_rank}
                    onChange={(e) => setCreateForm((f) => ({ ...f, accused_rank: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  >
                    <option value="">Select rank...</option>
                    {ALL_RANKS.map((rank) => (
                      <option key={rank} value={rank}>{rank}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Accused Service #</label>
                  <input
                    type="text"
                    value={createForm.accused_service_number}
                    onChange={(e) => setCreateForm((f) => ({ ...f, accused_service_number: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Service</label>
                  <select
                    value={createForm.accused_service}
                    onChange={(e) => setCreateForm((f) => ({ ...f, accused_service: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  >
                    <option value="">Select…</option>
                    <option value="KA">KA</option>
                    <option value="KAF">KAF</option>
                    <option value="KN">KN</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Accused Unit</label>
                  <select
                    value={createForm.accused_unit}
                    onChange={(e) => setCreateForm((f) => ({ ...f, accused_unit: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  >
                    <option value="">Select unit…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Submitting Unit</label>
                  <select
                    value={createForm.submitting_unit}
                    onChange={(e) => setCreateForm((f) => ({ ...f, submitting_unit: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  >
                    <option value="">Select unit…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Date of Offence</label>
                  <input
                    type="date"
                    value={createForm.date_of_offence}
                    onChange={(e) => setCreateForm((f) => ({ ...f, date_of_offence: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Description</label>
                  <textarea
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2 resize-none"
                  />
                </div>

              </div>

              <ErrMsg msg={createErr} />

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateErr(""); setCreateForm(INIT_CREATE); }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {createSaving ? "Creating…" : "Create Case"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
