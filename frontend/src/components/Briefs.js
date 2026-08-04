import React, { useCallback, useEffect, useMemo, useState } from "react";
import { caseBriefService, caseService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function caseLabel(caseObj) {
  const number = caseObj?.case_number || `Case #${caseObj?.id || "--"}`;
  const accused = caseObj?.accused_name || "Accused not recorded";
  return `${number} - ${accused}`;
}

function accusedDisplay(caseObj) {
  const entries = Array.isArray(caseObj?.accused_entries) ? caseObj.accused_entries : [];
  const names = entries
    .map((entry) => [entry.rank, entry.name].filter(Boolean).join(" ").trim() || entry.service_number)
    .filter(Boolean);
  if (names.length) return names.join(", ");
  return caseObj?.accused_name || "--";
}

function unitDisplay(caseObj) {
  const entries = Array.isArray(caseObj?.accused_entries) ? caseObj.accused_entries : [];
  const units = entries.map((entry) => entry.unit_name).filter(Boolean);
  const uniqueUnits = [...new Set(units)];
  if (uniqueUnits.length) return uniqueUnits.join(", ");
  return caseObj?.accused_unit_name || caseObj?.submitting_unit_name || "--";
}

function displayDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function formatStatus(status) {
  if (!status) return "Draft";
  return String(status)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fileName(url) {
  if (!url) return "";
  return String(url).split("/").pop() || "Brief document";
}

function printFile(url) {
  if (!url) return;
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) return;
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch (_) {
      // Browser may block scripted printing for some document types.
    }
  };
  if (win.document?.readyState === "complete") {
    setTimeout(trigger, 400);
  } else {
    win.onload = trigger;
  }
}

function printTable(title, headers, rows) {
  const escapeHtml = (value) =>
    String(value ?? "--").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  const html = `<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#111827}
    h1{font-size:18px;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}
    th{background:#e2e8f0;text-transform:uppercase}
  </style></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

const FORWARD_OPTIONS = [
  { value: "detachment", label: "IC COY" },
  { value: "hod", label: "HOD" },
  { value: "adj", label: "Adjutant" },
  { value: "2ic", label: "2IC" },
  { value: "oc", label: "OC" },
  { value: "co", label: "CO (Commanding Officer)" },
  { value: "corps_cmd", label: "Corps Commander" },
];

const BRIEF_STAGE_LABELS = {
  investigator: "Investigator",
  detachment: "IC COY",
  adj: "Adjutant",
  hod: "HOD",
  "2ic": "2IC",
  oc: "OC",
  co: "CO (Commanding Officer)",
  corps_cmd: "Corps Comd",
};

function forwardLabel(value) {
  return FORWARD_OPTIONS.find((option) => option.value === value)?.label || formatStatus(value);
}

function roleLabel(value) {
  const labels = {
    investigator: "Investigator",
    hod: "HOD",
    detachment: "IC COY",
    adj: "Adjutant",
    "2ic": "2IC",
    oc: "OC",
    co: "CO (Commanding Officer)",
    corps_cmd: "Corps Commander",
    admin: "Admin",
    mpc_hqs: "MPC HQS",
  };
  return labels[value] || forwardLabel(value);
}

function targetForRole(role) {
  return {
    detachment: "detachment",
    hod: "hod",
    adj: "adj",
    "2ic": "2ic",
    oc: "oc",
    co: "co",
    corps_cmd: "corps_cmd",
  }[role] || "";
}

function briefHistory(brief) {
  return Array.isArray(brief?.forward_history) ? brief.forward_history : [];
}

function currentRevisionHistory(brief) {
  const revision = Number(brief?.revision || 1);
  return briefHistory(brief).filter((event) => Number(event.revision || 1) === revision);
}

function forwardedEventText(event) {
  const target = forwardLabel(event?.to_role);
  const actor = event?.forwarded_by_name || roleLabel(event?.from_role) || "Unknown user";
  return `${target} by ${actor}`;
}

function forwardHistoryNotice(brief) {
  const events = currentRevisionHistory(brief);
  if (!events.length) return "";
  const details = events.map(forwardedEventText).join("; ");
  return `Already forwarded: ${details}. Edit the brief before forwarding to the same level again.`;
}

function forwardedByText(event) {
  if (!event) return "";
  const role = event.from_role ? roleLabel(event.from_role) : "";
  const actor = event.forwarded_by_name || "";
  return [role, actor].filter(Boolean).join(" - ") || "Unknown user";
}

function forwardedSource(brief, user) {
  const history = briefHistory(brief);
  const viewerTarget = targetForRole(user?.role);
  if (viewerTarget) {
    const viewerEvent = history.find((event) => event.to_role === viewerTarget);
    const viewerText = forwardedByText(viewerEvent);
    if (viewerText) return viewerText;
  }
  if (["detachment", "hod", "adj"].includes(viewerTarget) && brief?.attached_by_name) {
    return `Investigator - ${brief.attached_by_name}`;
  }
  const latestEvent = history[0];
  const latestText = forwardedByText(latestEvent);
  if (latestText) return latestText;
  if (!brief?.forwarded_by_name && !brief?.forwarded_from_role && brief?.forwarded_to_role && brief?.attached_by_name) {
    return `Investigator - ${brief.attached_by_name}`;
  }
  if (!brief?.forwarded_by_name && !brief?.forwarded_from_role) return "--";
  const fallback = [brief.forwarded_from_role ? roleLabel(brief.forwarded_from_role) : "", brief.forwarded_by_name || ""]
    .filter(Boolean)
    .join(" - ");
  return fallback || "--";
}

function hasDetachmentRoute(user, caseObj) {
  return Boolean(caseObj?.tasked_detachment || caseObj?.tasked_detachment_name || caseObj?.assigned_team_detachment || user?.detachment);
}

function hasForwardStageAccess(user, caseObj) {
  const role = user?.role;
  if (role === "investigator") return true;
  const target = targetForRole(role);
  const brief = caseObj?.brief || {};
  if (!target) return false;
  if (brief.forwarded_to_role === target) return true;
  return briefHistory(brief).some((event) => event.to_role === target || event.from_role === role);
}

function removeAlreadyForwardedOptions(brief, options) {
  const alreadyForwarded = new Set(currentRevisionHistory(brief).map((event) => event.to_role).filter(Boolean));
  return options.filter((option) => !alreadyForwarded.has(option.value));
}

function forwardOptionsFor(user, caseObj) {
  const currentTarget = caseObj?.brief?.forwarded_to_role || "";
  const brief = caseObj?.brief || {};
  let options = [];
  if (user?.role === "investigator") {
    if (hasDetachmentRoute(user, caseObj)) {
      options = FORWARD_OPTIONS.filter((option) => option.value === "detachment");
      return removeAlreadyForwardedOptions(brief, options);
    }
    options = FORWARD_OPTIONS.filter((option) => ["hod", "adj"].includes(option.value));
    return removeAlreadyForwardedOptions(brief, options);
  }
  if (user?.role === "detachment" && (currentTarget === "detachment" || hasForwardStageAccess(user, caseObj))) {
    options = FORWARD_OPTIONS.filter((option) => ["adj", "hod", "2ic", "oc"].includes(option.value));
    return removeAlreadyForwardedOptions(brief, options);
  }
  if (user?.role === "hod" && (currentTarget === "hod" || hasForwardStageAccess(user, caseObj))) {
    options = FORWARD_OPTIONS.filter((option) => ["2ic", "co"].includes(option.value));
    return removeAlreadyForwardedOptions(brief, options);
  }
  if (user?.role === "adj" && (currentTarget === "adj" || hasForwardStageAccess(user, caseObj))) {
    options = FORWARD_OPTIONS.filter((option) => ["2ic", "co"].includes(option.value));
    return removeAlreadyForwardedOptions(brief, options);
  }
  if (user?.role === "2ic" && (currentTarget === "2ic" || hasForwardStageAccess(user, caseObj))) {
    options = FORWARD_OPTIONS.filter((option) => option.value === "co");
    return removeAlreadyForwardedOptions(brief, options);
  }
  if (user?.role === "oc" && (currentTarget === "oc" || hasForwardStageAccess(user, caseObj))) {
    options = FORWARD_OPTIONS.filter((option) => ["2ic", "co"].includes(option.value));
    return removeAlreadyForwardedOptions(brief, options);
  }
  if (user?.role === "co" && (currentTarget === "co" || hasForwardStageAccess(user, caseObj))) {
    options = FORWARD_OPTIONS.filter((option) => option.value === "corps_cmd");
    return removeAlreadyForwardedOptions(brief, options);
  }
  return [];
}

function briefStatus(brief) {
  const currentStage = brief?.forwarded_to_role || "investigator";
  return BRIEF_STAGE_LABELS[currentStage] || formatStatus(currentStage);
}

function canEditBrief(user, caseObj) {
  if (user?.role === "investigator") return true;
  if (user?.role === "hod" && hasForwardStageAccess(user, caseObj)) return true;
  if (user?.role === "oc" && hasForwardStageAccess(user, caseObj)) return true;
  if (user?.role === "adj" && hasForwardStageAccess(user, caseObj)) return true;
  return false;
}

function canApproveBrief(user, caseObj) {
  const brief = caseObj?.brief || {};
  return user?.role === "corps_cmd" && brief.forwarded_to_role === "corps_cmd" && !brief.approved_at;
}

function errorText(error) {
  const data = error?.response?.data;
  if (!data) return "Failed to save brief.";
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  const first = Object.values(data).flat().find(Boolean);
  return first ? String(first) : "Failed to save brief.";
}

export default function Briefs({ user }) {
  const [briefableCases, setBriefableCases] = useState([]);
  const [briefCases, setBriefCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [summary, setSummary] = useState("");
  const [briefFile, setBriefFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionMode, setActionMode] = useState("");
  const [activeCase, setActiveCase] = useState(null);
  const [editSummary, setEditSummary] = useState("");
  const [editFile, setEditFile] = useState(null);
  const [forwardRole, setForwardRole] = useState("");
  const [forwardNote, setForwardNote] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const canCreateBrief = user?.role === "investigator";
  const isAdminViewer = user?.role === "admin" || user?.role === "mpc_hqs" || user?.is_superuser;
  const showForwardedFromColumn = !canCreateBrief;
  useAutoDismiss(notice, setNotice);
  useAutoDismiss(error, setError);

  const loadBriefs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [casesRes, briefsRes] = await Promise.all([
        canCreateBrief ? caseService.briefableCases() : Promise.resolve({ data: [] }),
        caseService.briefs(),
      ]);
      const nextCases = toArray(casesRes.data);
      setBriefableCases(nextCases);
      setBriefCases(toArray(briefsRes.data));
      setSelectedCaseId((current) => {
        if (current && nextCases.some((caseObj) => String(caseObj.id) === String(current))) {
          return current;
        }
        return nextCases[0]?.id ? String(nextCases[0].id) : "";
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [canCreateBrief]);

  useEffect(() => {
    loadBriefs();
  }, [loadBriefs]);

  const selectedCase = useMemo(
    () => briefableCases.find((caseObj) => String(caseObj.id) === String(selectedCaseId)),
    [briefableCases, selectedCaseId]
  );

  const filteredBriefCases = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    return briefCases.filter((caseObj) => {
      const brief = caseObj.brief || {};
      const stage = brief.forwarded_to_role || "investigator";
      const matchesStage = stageFilter === "all" || stage === stageFilter;
      const haystack = [
        caseObj.case_number,
        accusedDisplay(caseObj),
        unitDisplay(caseObj),
        caseObj.offence || caseObj.offence_name,
        caseObj.description,
        briefStatus(brief),
        forwardedSource(brief, user),
        brief.approved_by_name,
        brief.approved_note,
        fileName(brief.file),
      ].join(" ").toLowerCase();
      return matchesStage && (!query || haystack.includes(query));
    });
  }, [briefCases, stageFilter, tableSearch, user]);

  function handlePrintBriefTable() {
    const headers = ["Case", "Accused", "Unit", "Offence", "Description", "Status"];
    const rows = filteredBriefCases.map((caseObj) => {
      const brief = caseObj.brief || {};
      const base = [
        caseObj.case_number || "--",
        accusedDisplay(caseObj),
        unitDisplay(caseObj),
        caseObj.offence || caseObj.offence_name || "--",
        caseObj.description || "--",
        briefStatus(brief),
      ];
      if (showForwardedFromColumn) base.push(forwardedSource(brief, user));
      base.push(fileName(brief.file) || "--");
      return base;
    });
    printTable(
      canCreateBrief ? "Created Briefs" : isAdminViewer ? "Briefs" : "Forwarded Briefs",
      showForwardedFromColumn ? [...headers, "Forwarded From", "File"] : [...headers, "File"],
      rows
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!selectedCaseId) {
      setError("Select a case.");
      return;
    }
    if (!briefFile) {
      setError("Attach a brief document.");
      return;
    }
    if (selectedCase?.status === "closed") {
      setError("Closed cases do not allow further uploads or attachment changes.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      if (summary.trim()) {
        formData.append("summary", summary.trim());
      }
      formData.append("file", briefFile);
      await caseBriefService.upload(selectedCaseId, formData);
      setSummary("");
      setBriefFile(null);
      const fileInput = document.getElementById("brief-file-input");
      if (fileInput) fileInput.value = "";
      setNotice("Brief created successfully.");
      await loadBriefs();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  function openAction(mode, caseObj) {
    const brief = caseObj.brief || {};
    setActionMode(mode);
    setActiveCase(caseObj);
    setEditSummary(brief.summary || "");
    setEditFile(null);
    setForwardRole("");
    setForwardNote(brief.forwarded_note || "");
    setError("");
    setNotice("");
  }

  function closeAction() {
    setActionMode("");
    setActiveCase(null);
    setEditSummary("");
    setEditFile(null);
    setForwardRole("");
    setForwardNote("");
    setActionSubmitting(false);
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!activeCase) return;
    if (activeCase.status === "closed" && editFile) {
      setError("Closed cases do not allow further uploads or attachment changes.");
      return;
    }
    setActionSubmitting(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("summary", editSummary);
      if (editFile) {
        formData.append("file", editFile);
      }
      await caseBriefService.update(activeCase.id, formData);
      setNotice("Brief updated successfully.");
      closeAction();
      await loadBriefs();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleForwardSubmit(event) {
    event.preventDefault();
    if (!activeCase) return;
    if (!forwardRole) {
      setError("Select a forwarding recipient.");
      return;
    }
    const allowedOptions = forwardOptionsFor(user, activeCase);
    if (!allowedOptions.some((option) => option.value === forwardRole)) {
      setError(forwardHistoryNotice(activeCase.brief || {}) || "You cannot forward this brief to that role at this stage.");
      return;
    }
    setActionSubmitting(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("forwarded_to_role", forwardRole);
      if (forwardNote.trim()) {
        formData.append("forwarded_note", forwardNote.trim());
      }
      await caseBriefService.update(activeCase.id, formData);
      setNotice(`Brief forwarded to ${forwardLabel(forwardRole)}.`);
      closeAction();
      await loadBriefs();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleApprove(caseObj) {
    setActionSubmitting(true);
    setError("");
    setNotice("");
    try {
      await caseBriefService.approve(caseObj.id);
      setNotice("Brief approved. HQ admin can now attach the back-brief.");
      await loadBriefs();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setActionSubmitting(false);
    }
  }

  const activeBrief = activeCase?.brief || {};
  const activeForwardOptions = activeCase ? forwardOptionsFor(user, activeCase) : [];
  const activeForwardNotice = activeCase ? forwardHistoryNotice(activeBrief) : "";

  return (
    <div className="p-4 md:p-6 text-slate-900 space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">Briefs</h2>
        <p className="text-sm text-slate-600">{user?.role === "investigator" ? "Investigator" : "Dashboard"}</p>
      </div>

      {(error || notice) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || notice}
        </div>
      )}

      <div className={canCreateBrief ? "grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5" : "grid grid-cols-1 gap-5"}>
        {canCreateBrief && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Create Brief</h3>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Case</label>
              <select
                value={selectedCaseId}
                onChange={(event) => setSelectedCaseId(event.target.value)}
                disabled={loading || briefableCases.length === 0}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              >
                {briefableCases.length === 0 ? (
                  <option value="">No assigned cases available</option>
                ) : (
                  briefableCases.map((caseObj) => (
                    <option key={caseObj.id} value={caseObj.id}>
                      {caseLabel(caseObj)}
                    </option>
                  ))
                )}
              </select>
            </div>

            {selectedCase && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Assignment" value={selectedCase.assigned_to_name || selectedCase.assigned_team_name || "--"} />
                <Info label="Status" value={formatStatus(selectedCase.status)} />
                <Info label="Offence" value={selectedCase.offence || selectedCase.offence_name || "--"} />
                <Info label="Tasked By" value={selectedCase.tasked_battalion_name || "--"} />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Summary</label>
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={5}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief summary or notes"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Brief File</label>
              <input
                id="brief-file-input"
                type="file"
                onChange={(event) => setBriefFile(event.target.files?.[0] || null)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedCaseId || !briefFile}
              className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "Saving..." : "Create Brief"}
            </button>
          </div>
        </form>
        )}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">{canCreateBrief ? "Created Briefs" : isAdminViewer ? "Briefs" : "Forwarded Briefs"}</h3>
            <span className="text-xs font-medium text-slate-500">{filteredBriefCases.length} of {briefCases.length} total</span>
          </div>
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[1fr_220px_auto]">
            <input
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Search briefs"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All stages</option>
              <option value="investigator">Investigator</option>
              <option value="detachment">IC COY</option>
              <option value="hod">HOD</option>
              <option value="adj">Adjutant</option>
              <option value="2ic">2IC</option>
              <option value="oc">OC</option>
              <option value="co">CO</option>
              <option value="corps_cmd">Corps Comd</option>
            </select>
            <button
              type="button"
              onClick={handlePrintBriefTable}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Print Table
            </button>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-sm text-slate-500">Loading briefs...</div>
          ) : filteredBriefCases.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-500">No briefs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Case</th>
                    <th className="px-4 py-3 text-left font-semibold">Accused</th>
                    <th className="px-4 py-3 text-left font-semibold">Unit</th>
                    <th className="px-4 py-3 text-left font-semibold">Offence</th>
                    <th className="px-4 py-3 text-left font-semibold">Description</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    {showForwardedFromColumn && <th className="px-4 py-3 text-left font-semibold">Forwarded From</th>}
                    <th className="px-4 py-3 text-left font-semibold">File</th>
                    <th className="px-4 py-3 text-left font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredBriefCases.map((caseObj) => {
                    const brief = caseObj.brief || {};
                    const forwardOptions = forwardOptionsFor(user, caseObj);
                    const forwardNotice = forwardHistoryNotice(brief);
                    return (
                      <tr key={caseObj.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-blue-700 whitespace-nowrap">{caseObj.case_number || "--"}</td>
                        <td className="px-4 py-3 text-slate-800">{accusedDisplay(caseObj)}</td>
                        <td className="px-4 py-3 text-slate-600">{unitDisplay(caseObj)}</td>
                        <td className="px-4 py-3 text-slate-600">{caseObj.offence || caseObj.offence_name || "--"}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs whitespace-normal break-words">{caseObj.description || "--"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                            {briefStatus(brief)}
                          </span>
                        </td>
                        {showForwardedFromColumn && <td className="px-4 py-3 text-slate-600">{forwardedSource(brief, user)}</td>}
                        <td className="px-4 py-3">
                          {brief.file ? (
                            <a href={brief.file} target="_blank" rel="noreferrer" className="text-blue-700 hover:text-blue-900 font-medium">
                              {fileName(brief.file)}
                            </a>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openAction("view", caseObj)}
                              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              View
                            </button>
                            {canEditBrief(user, caseObj) && (
                              <button
                                type="button"
                                onClick={() => openAction("edit", caseObj)}
                                className="rounded-md border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                Edit
                              </button>
                            )}
                            {brief.file && (
                              <button
                                type="button"
                                onClick={() => printFile(brief.file)}
                                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Print
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openAction("forward", caseObj)}
                              disabled={forwardOptions.length === 0}
                              title={forwardOptions.length === 0 ? forwardNotice || "No forwarding action is available." : ""}
                              className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              Forward
                            </button>
                            {canApproveBrief(user, caseObj) && (
                              <button
                                type="button"
                                onClick={() => handleApprove(caseObj)}
                                disabled={actionSubmitting}
                                className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
                              >
                                {actionSubmitting ? "Approving..." : "Approve"}
                              </button>
                            )}
                            {brief.approved_at && user?.role === "corps_cmd" && (
                              <p className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                                Approved by {brief.approved_by_name || "Corps Commander"} on {displayDate(brief.approved_at)}.
                              </p>
                            )}
                            {forwardNotice && (
                              <p className="w-full rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                                {forwardNotice}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {activeCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={(event) => event.target === event.currentTarget && closeAction()}>
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {actionMode === "view" ? "View Brief" : actionMode === "edit" ? "Edit Brief" : "Forward Brief"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{caseLabel(activeCase)}</p>
              </div>
              <button type="button" onClick={closeAction} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">Close</button>
            </div>

            {actionMode === "view" && (
              <div className="space-y-4 px-5 py-4 text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Info label="Status" value={briefStatus(activeBrief)} />
                  <Info label="Forwarded To" value={activeBrief.forwarded_to_role ? forwardLabel(activeBrief.forwarded_to_role) : "--"} />
                  <Info label="Forwarded From" value={forwardedSource(activeBrief, user)} />
                  <Info label="Created By" value={activeBrief.attached_by_name || "--"} />
                  <Info label="Approved By" value={activeBrief.approved_by_name || "--"} />
                  <Info label="Approved At" value={displayDate(activeBrief.approved_at)} />
                  <Info label="Updated" value={displayDate(activeBrief.updated_at)} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
                  <div className="max-h-56 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700 whitespace-pre-wrap">
                    {activeBrief.summary || "--"}
                  </div>
                </div>
                {activeBrief.forwarded_note && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Forwarding Note</p>
                    <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">{activeBrief.forwarded_note}</p>
                  </div>
                )}
                {activeBrief.file && (
                  <a href={activeBrief.file} target="_blank" rel="noreferrer" className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                    Open Brief File
                  </a>
                )}
              </div>
            )}

            {actionMode === "edit" && (
              <form onSubmit={handleEditSubmit} className="space-y-4 px-5 py-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Summary</label>
                  <textarea
                    value={editSummary}
                    onChange={(event) => setEditSummary(event.target.value)}
                    rows={5}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Brief summary or notes"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Replace Brief File</label>
                  <input
                    type="file"
                    disabled={activeCase.status === "closed"}
                    onChange={(event) => setEditFile(event.target.files?.[0] || null)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  {activeCase.status === "closed" && <p className="mt-2 text-xs text-slate-500">Closed cases are read-only for uploads and attachments.</p>}
                  {activeBrief.file && <p className="mt-2 text-xs text-slate-500">Current file: {fileName(activeBrief.file)}</p>}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                  <button type="button" onClick={closeAction} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={actionSubmitting} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300">
                    {actionSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}

            {actionMode === "forward" && (
              <form onSubmit={handleForwardSubmit} className="space-y-4 px-5 py-4">
                {activeForwardNotice && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                    {activeForwardNotice}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Forward To</label>
                  <select
                    value={forwardRole}
                    onChange={(event) => setForwardRole(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select recipient</option>
                    {activeForwardOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {activeForwardOptions.length === 0 && (
                    <p className="mt-2 text-xs text-slate-500">No forwarding action is available for your role at this stage.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Note</label>
                  <textarea
                    value={forwardNote}
                    onChange={(event) => setForwardNote(event.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Forwarding note"
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                  <button type="button" onClick={closeAction} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={actionSubmitting || !forwardRole || activeForwardOptions.length === 0} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300">
                    {actionSubmitting ? "Forwarding..." : "Forward Brief"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800 truncate">{value}</p>
    </div>
  );
}
