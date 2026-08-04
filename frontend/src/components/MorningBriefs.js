import React, { useEffect, useMemo, useState } from "react";
import useAutoDismiss from "../hooks/useAutoDismiss";
import { formationService, incidentService, morningBriefService, offenceService } from "../services/api";

const MORNING_BRIEF_LOGO_PATH = "/mpc-logo.png";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "--";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB");
}

function formatDateTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatLongDate(value) {
  if (!value) return "--";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatIncidentDate(value) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatIncidentTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCountdown(seconds) {
  if (seconds == null) return "";
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainingSeconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function secondsUntil(value, nowValue) {
  if (!value) return null;
  return Math.floor((new Date(value).getTime() - nowValue) / 1000);
}

const STATUS_STYLE = {
  draft: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  ready: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  published: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  submitted: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  late: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  belated: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

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

function StatusBadge({ status }) {
  const label = status === "pending" ? "draft" : status === "submitted" ? "published" : status === "ready" ? "ready for 0800" : status;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[status] || "bg-slate-100 text-slate-700"}`}>
      {String(label || "").replace(/_/g, " ")}
    </span>
  );
}

function isDraftStatus(status) {
  return ["draft", "pending", "ready"].includes(status);
}

function ReportLine({ label, value }) {
  if (!value) return null;
  return (
    <>
      <strong>{label}:</strong> {value}.{" "}
    </>
  );
}

function isRoadTrafficIncident(incident) {
  return String(incident?.incident_type || "").toLowerCase().includes("road traffic accident");
}

function MorningBriefReport({ brief }) {
  const incidents = toArray(brief?.incidents);
  return (
    <article className="mx-auto max-w-4xl bg-white p-8 font-serif text-[15px] leading-relaxed text-slate-950 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">CONFIDENTIAL</p>
      <div className="mt-8 grid grid-cols-3 items-start gap-4 text-sm text-slate-600">
        <div>
          <p>Telegrams: "DEFENCE" Nairobi</p>
          <p>Email: mpc-hqs@mod.go.ke</p>
          <p>Telephone: 2722100 Ext. 5561</p>
          <p>When replying please quote</p>
          <p>Ref. No. {brief?.morning_brief_serial || "--"}</p>
        </div>
        <div className="text-center text-slate-500">
          <img
            src={MORNING_BRIEF_LOGO_PATH}
            alt="Military Police Corps logo"
            className="mx-auto h-24 w-24 object-contain"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              const fallback = event.currentTarget.nextElementSibling;
              if (fallback) fallback.style.display = "flex";
            }}
          />
          <div className="mx-auto hidden h-24 w-24 items-center justify-center rounded-full border border-slate-300 text-xs font-bold uppercase">
            MPC
          </div>
        </div>
        <div className="text-right">
          <p>Headquarters</p>
          <p>Military Police Corps</p>
          <p>P. O Box 68278 - 00200</p>
          <p>Nairobi</p>
          <p className="mt-3">{formatLongDate(brief?.date)}</p>
        </div>
      </div>
      <p className="mt-8 font-semibold">See Distribution:</p>
      <h3 className="mt-5 text-base font-bold uppercase">
        Military Police Incident Report for {formatLongDate(brief?.date)}
      </h3>
      <p className="text-sm font-semibold text-slate-700">Serial No. {brief?.morning_brief_serial || "--"}</p>
      <p className="text-slate-700">
        This report contains information reported to HQs MPC during the last twenty-four hours and is based on first hand reports subject to investigation.
      </p>
      <div className="mt-6 space-y-5">
        {incidents.length === 0 ? (
          <p>No incidents recorded.</p>
        ) : incidents.map((incident, index) => (
          <div key={incident.id} className="grid grid-cols-[36px_1fr] gap-3">
            <p>{index + 1}.</p>
            <div>
              <p>
                <strong>
                  {incident.incident_type || "Incident"}{incident.is_belated ? " (Belated)" : ""}:
                </strong>{" "}
                <strong>Place:</strong> {incident.place || incident.location || "--"}.{" "}
                <ReportLine label="Date" value={formatIncidentDate(incident.date_occurred)} />
                <ReportLine label="Time" value={`${formatIncidentTime(incident.date_occurred)} Hrs`} />
                <ReportLine label="Svc Veh" value={incident.service_vehicle} />
                <ReportLine label="Unit" value={incident.unit_involved} />
                <ReportLine label="Originating Sub-Unit" value={incident.originating_unit} />
                <ReportLine label="Svc Member" value={incident.service_member} />
                <ReportLine label="Civ" value={incident.civilian} />
              </p>
              {incident.police_ob_reference && (
                <p>
                  <ReportLine label="Police / External OB" value={incident.police_ob_reference} />
                </p>
              )}
              <p>
                <strong>{isRoadTrafficIncident(incident) ? "History of the Accident" : "History of the Incident"}:</strong> {incident.history || incident.description || "--"}
              </p>
              {incident.injuries && <p><strong>Injuries:</strong> {incident.injuries}</p>}
              {incident.damages && <p><strong>Damages:</strong> {incident.damages}</p>}
              {incident.how_occurred && <p><strong>{isRoadTrafficIncident(incident) ? "How the Accident Occurred" : "How the Incident Occurred"}:</strong> {incident.how_occurred}</p>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-10 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">CONFIDENTIAL</p>
    </article>
  );
}

function formatError(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (data.detail) return String(data.detail);
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join(" | ");
  }
  return fallback;
}

const EMPTY_ACCUSED = {
  name: "",
  rank: "",
  service_number: "",
  service: "",
  unit: "",
};

function buildConvertForm(incident) {
  return {
    title: incident?.incident_type || "",
    offence_ref: "",
    offence: incident?.incident_type || "",
    offence_type: "",
    service_offence_severity: "",
    criminal_offence_type: "",
    description: incident?.history || incident?.description || "",
    date_of_offence: toDateInput(incident?.date_occurred),
    place_of_offence: incident?.place || incident?.location || "",
    submitting_unit: "",
    police_station: incident?.police_ob_reference || "",
    accused_entries: [{ ...EMPTY_ACCUSED }],
  };
}

function compactConvertPayload(form) {
  const payload = {};
  Object.entries(form).forEach(([key, value]) => {
    if (key === "accused_entries") return;
    if (key === "police_station" && !requiresPoliceStationOb(form)) return;
    if (value !== "" && value != null) {
      payload[key] = value;
    }
  });
  const accused = (form.accused_entries || []).filter((entry) =>
    Object.values(entry).some((value) => String(value || "").trim())
  );
  if (accused.length) {
    payload.accused_entries = accused;
  }
  return payload;
}

function requiresPoliceStationOb(form) {
  return form?.offence_type === "criminal_offence" && form?.criminal_offence_type === "dci_civ_police";
}

export default function MorningBriefs({ user }) {
  const [briefs, setBriefs] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [offences, setOffences] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedIncidents, setSelectedIncidents] = useState([]);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertForm, setConvertForm] = useState(buildConvertForm(null));
  const [convertingIncidentId, setConvertingIncidentId] = useState(null);
  const [previewBrief, setPreviewBrief] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [briefDate, setBriefDate] = useState(todayIso());
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [compilerStatus, setCompilerStatus] = useState({ can_compile: false, post: null, message: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useAutoDismiss(notice, setNotice);
  useAutoDismiss(error, setError);

  const canCompileMorningBrief = Boolean(compilerStatus?.can_compile);
  const canConvertToCase =
    user?.is_superuser ||
    user?.role === "mpc_hqs" ||
    (user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() === "hqs");
  const conversionRequiresPoliceOb = requiresPoliceStationOb(convertForm);

  function loadData() {
    setLoading(true);
    Promise.all([
      morningBriefService.list({ page_size: 100 }),
      morningBriefService.compilerStatus(),
    ])
      .then(([briefRes, statusRes]) => {
        const status = statusRes.data || {};
        setBriefs(toArray(briefRes.data));
        setCompilerStatus(status);
        if (!status.can_compile) {
          setIncidents([]);
          setSelectedIncidents([]);
          return null;
        }
        return incidentService
          .list({ page_size: 200, requires_investigation: true, pending_morning_brief: true })
          .then((incidentRes) => {
            const items = toArray(incidentRes.data);
            setIncidents(items);
            setSelectedIncidents((prev) => prev.filter((id) => items.some((incident) => incident.id === id)));
          });
      })
      .catch(() => setError("Failed to load morning briefs."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Promise.all([
      offenceService.list(),
      formationService.units({ page_size: 500 }),
    ])
      .then(([offenceRes, unitRes]) => {
        setOffences(toArray(offenceRes.data));
        setUnits(toArray(unitRes.data));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
      loadData();
    }, 60000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingIncidents = useMemo(
    () => incidents.filter((incident) => !incident.morning_brief && incident.status === "reported"),
    [incidents]
  );
  const draftBriefs = useMemo(
    () => briefs.filter((brief) => isDraftStatus(brief.status)),
    [briefs]
  );
  const activeDraft = useMemo(
    () => draftBriefs.find((brief) => Number(brief.id) === Number(activeDraftId)) || null,
    [activeDraftId, draftBriefs]
  );
  const countdownDrafts = useMemo(
    () => draftBriefs
      .map((brief) => ({ brief, seconds: secondsUntil(brief.publish_due_at, nowTick) }))
      .filter((item) => item.seconds != null && item.seconds > 0 && item.seconds <= 30 * 60),
    [draftBriefs, nowTick]
  );

  useEffect(() => {
    if (activeDraftId && !draftBriefs.some((brief) => Number(brief.id) === Number(activeDraftId))) {
      setActiveDraftId(null);
    }
  }, [activeDraftId, draftBriefs]);

  function toggleIncident(id) {
    setSelectedIncidents((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }

  async function compileBrief(event) {
    event.preventDefault();
    if (selectedIncidents.length === 0) {
      setError(activeDraft ? "Select at least one incident to add to the draft." : "Select at least one incident to compile.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = activeDraft
        ? await morningBriefService.addIncidents(activeDraft.id, {
            incident_ids: selectedIncidents,
            remarks,
          })
        : await morningBriefService.compileFromIncidents({
            date: briefDate,
            incident_ids: selectedIncidents,
            remarks,
          });
      setSelectedIncidents([]);
      setRemarks("");
      if (response?.data?.id) {
        setActiveDraftId(response.data.id);
      }
      setNotice(activeDraft ? "Draft morning brief updated with selected incidents." : "Morning brief saved as draft. You can update it with new incidents before publishing.");
      loadData();
    } catch (err) {
      setError(formatError(err, activeDraft ? "Failed to update draft morning brief." : "Failed to compile morning brief."));
    } finally {
      setSaving(false);
    }
  }

  function startUpdateDraft(brief) {
    setActiveDraftId(brief.id);
    setBriefDate(brief.date || todayIso());
    setRemarks(brief.remarks || "");
    setSelectedIncidents([]);
    setError("");
    setNotice(`Select new pending incidents, then update draft ${brief.morning_brief_serial || formatDate(brief.date)}.`);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function resetDraftMode() {
    setActiveDraftId(null);
    setBriefDate(todayIso());
    setRemarks("");
    setSelectedIncidents([]);
    setError("");
  }

  async function publishBrief(brief) {
    setPublishingId(brief.id);
    setError("");
    try {
      await morningBriefService.publish(brief.id);
      setNotice("Morning brief marked ready. It will auto-publish at 0800 hrs.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to publish morning brief."));
    } finally {
      setPublishingId(null);
    }
  }

  async function convertIncidentToCase(incident) {
    setConvertTarget({ incident });
    setConvertForm(buildConvertForm(incident));
    setError("");
  }

  async function confirmConvertIncidentToCase() {
    if (!convertTarget) return;
    if (conversionRequiresPoliceOb && !String(convertForm.police_station || "").trim()) {
      setError("Police Station / OB Ref is required when Criminal Offence Type is DCI / Civ Police.");
      return;
    }
    setConvertingIncidentId(convertTarget.incident.id);
    try {
      await incidentService.convertToCase(convertTarget.incident.id, compactConvertPayload(convertForm));
      setConvertTarget(null);
      setConvertForm(buildConvertForm(null));
      setNotice("Incident converted to a new case. Task the battalion from the case module.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to convert incident to case."));
    } finally {
      setConvertingIncidentId(null);
    }
  }

  function closeConvertModal() {
    setConvertTarget(null);
    setConvertForm(buildConvertForm(null));
  }

  function updateConvertField(field, value) {
    setConvertForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateConvertAccused(index, field, value) {
    setConvertForm((prev) => ({
      ...prev,
      accused_entries: prev.accused_entries.map((entry, entryIndex) => (
        entryIndex === index ? { ...entry, [field]: value } : entry
      )),
    }));
  }

  return (
    <div className="min-h-screen space-y-5 bg-slate-100 p-4 text-slate-900 md:p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">Morning Briefs</h2>
        <p className="text-sm text-slate-600">Compile reported incidents from the Duty Room chain for HQ review.</p>
      </div>

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || notice}
        </div>
      )}

      {countdownDrafts.map(({ brief, seconds }) => (
        <div key={brief.id} className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <p className="font-semibold">Morning brief auto-publish countdown</p>
          <p className="mt-1">
            {brief.status === "ready" ? "Ready brief" : "Draft"} for {formatDate(brief.date)} will auto-publish at {formatDateTime(brief.publish_due_at)}.
            Time remaining: <strong>{formatCountdown(seconds)}</strong>
          </p>
        </div>
      ))}

      {!canCompileMorningBrief && compilerStatus?.message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Morning brief compilation restricted</p>
          <p className="mt-1">{compilerStatus.message}</p>
        </div>
      )}

      {canCompileMorningBrief && (
        <form onSubmit={compileBrief} className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                  {activeDraft ? "Update Draft Morning Brief" : "Compile From Incidents"}
                </h3>
                {activeDraft && (
                  <p className="mt-1 text-xs font-medium text-blue-700">
                    Updating draft {activeDraft.morning_brief_serial || "--"} for {formatDate(activeDraft.date)} with {activeDraft.incident_count || 0} incident(s) already attached.
                  </p>
                )}
              </div>
              {activeDraft && (
                <button
                  type="button"
                  onClick={resetDraftMode}
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Cancel Update
                </button>
              )}
            </div>
            {compilerStatus?.post && (
              <p className="mt-1 text-xs text-slate-500">
                Duty Officer assignment: <strong>{compilerStatus.post.roster}</strong>, {compilerStatus.post.unit_label}, {formatDateTime(compilerStatus.post.starts_at)} to {formatDateTime(compilerStatus.post.ends_at)}.
                {!compilerStatus.post.is_current && compilerStatus.post.compile_window_ends_at
                  ? ` Handover compile window ends ${formatDateTime(compilerStatus.post.compile_window_ends_at)}.`
                  : ""}
              </p>
            )}
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Brief Date
                <input
                  type="date"
                  value={activeDraft?.date || briefDate}
                  onChange={(event) => setBriefDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={Boolean(activeDraft)}
                  required
                />
              </label>
              {draftBriefs.length > 0 && (
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Draft to Update
                  <select
                    value={activeDraftId || ""}
                    onChange={(event) => {
                      const draft = draftBriefs.find((item) => String(item.id) === event.target.value);
                      if (draft) {
                        startUpdateDraft(draft);
                      } else {
                        resetDraftMode();
                      }
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Create new draft</option>
                    {draftBriefs.map((brief) => (
                      <option key={brief.id} value={brief.id}>
                        {brief.morning_brief_serial || formatDate(brief.date)} - {formatDate(brief.date)} - {String(brief.status || "draft").replace(/_/g, " ")} - {brief.incident_count || 0} incident(s)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Remarks
                <input
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Optional remarks"
                />
              </label>
            </div>

            {activeDraft && toArray(activeDraft.incidents).length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-900">
                    Incidents Already on This Draft
                  </p>
                  <span className="text-xs font-semibold text-blue-700">{toArray(activeDraft.incidents).length} attached</span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {toArray(activeDraft.incidents).map((incident) => (
                    <div key={incident.id} className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">{incident.incident_number || "Incident"}</span>
                      <span className="ml-2">{incident.incident_type || "--"}</span>
                      {incident.is_belated && (
                        <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 ring-1 ring-orange-200">
                          Belated
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  {activeDraft ? "New Incidents Available to Add" : "Reported Incidents Pending Brief"}
                </p>
                <span className="text-xs text-slate-500">{selectedIncidents.length} selected</span>
              </div>
              {pendingIncidents.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">
                  {activeDraft ? "No new reported incidents are pending. This draft can be published when ready." : "No reported incidents pending morning brief."}
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {pendingIncidents.map((incident) => (
                    <label key={incident.id} className="flex cursor-pointer gap-3 border-b border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedIncidents.includes(incident.id)}
                        onChange={() => toggleIncident(incident.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-900">{incident.incident_number || "Incident"}</span>
                        <span className="ml-2 text-slate-600">{incident.incident_type}</span>
                        {incident.source_ob_number && <span className="ml-2 text-xs font-semibold text-blue-700">OB {incident.source_ob_number}</span>}
                        {incident.is_belated && (
                          <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 ring-1 ring-orange-200">
                            Belated
                          </span>
                        )}
                        <span className="block truncate text-xs text-slate-500">{incident.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {activeDraft && (
                <button
                  type="button"
                  onClick={resetDraftMode}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Update
                </button>
              )}
              <button type="submit" disabled={saving || selectedIncidents.length === 0} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? (activeDraft ? "Updating..." : "Compiling...") : (activeDraft ? "Update Draft" : "Compile Morning Brief")}
              </button>
            </div>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Morning Brief Register</h3>
          <span className="text-xs text-slate-500">{briefs.length} total</span>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading morning briefs...</p>
        ) : briefs.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No morning briefs found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Serial</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Unit</th>
                  <th className="px-4 py-3 text-left">Incidents</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Submitted By</th>
                  <th className="px-4 py-3 text-left">Remarks</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {briefs.map((brief) => {
                  const editingThisDraft = activeDraft && Number(activeDraft.id) === Number(brief.id);
                  return (
                  <tr key={brief.id} className={`align-top hover:bg-slate-50 ${editingThisDraft ? "bg-blue-50/70 ring-1 ring-inset ring-blue-200" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{brief.morning_brief_serial || "--"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatDate(brief.date)}</td>
                    <td className="px-4 py-3 text-slate-700">{brief.detachment_name || brief.battalion_name || brief.unit_name || "--"}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{brief.incident_count || 0} incident(s)</p>
                      <div className="mt-1 space-y-1">
                        {toArray(brief.incidents).map((incident) => (
                          <div key={incident.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700">
                            <div>
                              <span className="font-semibold">{incident.incident_number}</span>
                              <span className="ml-2">{incident.incident_type}</span>
                              {incident.source_ob_number && <span className="ml-2 text-blue-700">OB {incident.source_ob_number}</span>}
                              {incident.is_belated && (
                                <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 ring-1 ring-orange-200">
                                  Belated
                                </span>
                              )}
                              <span className="ml-2 text-slate-500">{formatDateTime(incident.date_occurred)}</span>
                              {incident.converted_case_number && <span className="ml-2 font-semibold text-emerald-700">{incident.converted_case_number}</span>}
                            </div>
                            {canConvertToCase && !incident.converted_case && (
                              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <button
                                  type="button"
                                  onClick={() => convertIncidentToCase(incident)}
                                  className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                                >
                                  Convert to Case
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={brief.status} />
                      {isDraftStatus(brief.status) && brief.publish_due_at && (
                        <p className="mt-1 text-xs text-slate-500">Auto-publish: {formatDateTime(brief.publish_due_at)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{brief.submitted_by_name || "--"}</td>
                    <td className="px-4 py-3 text-slate-600">{brief.remarks || "--"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewBrief(brief)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View Report
                        </button>
                        {canCompileMorningBrief && isDraftStatus(brief.status) && (
                          <>
                            {editingThisDraft ? (
                              <button
                                type="button"
                                onClick={resetDraftMode}
                                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                              >
                                Cancel Update
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startUpdateDraft(brief)}
                                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                              >
                                Edit Draft
                              </button>
                            )}
                              {brief.status === "ready" ? (
                                <button
                                  type="button"
                                  disabled
                                  className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                                >
                                  Waiting 0800
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => publishBrief(brief)}
                                  disabled={publishingId === brief.id}
                                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {publishingId === brief.id ? "Setting..." : "Set for 0800 Publish"}
                                </button>
                              )}
                          </>
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

      {previewBrief && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-slate-300 bg-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">Morning Brief Report</h3>
                <p className="text-xs text-slate-500">{formatLongDate(previewBrief.date)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBrief(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="max-h-[82vh] overflow-y-auto bg-slate-200 p-4">
              <MorningBriefReport brief={previewBrief} />
            </div>
          </div>
        </div>
      )}

      {convertTarget && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4"
          onClick={(event) => event.target === event.currentTarget && !convertingIncidentId && closeConvertModal()}
        >
          <div className="my-4 w-full max-w-3xl overflow-hidden rounded-lg border border-blue-200 bg-white shadow-2xl">
            <div className="border-b border-blue-100 bg-blue-50 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Case Creation</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">Confirm Conversion to Case</h3>
              <p className="mt-1 text-sm text-blue-800">
                This will create a new un-tasked case. Task the battalion later from the Cases module with the tasking letter and date.
              </p>
            </div>
            <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-slate-950">{convertTarget.incident.incident_number || "Incident"}</p>
                <p className="mt-1 text-slate-600">{convertTarget.incident.incident_type || "--"} - OB {convertTarget.incident.source_ob_number || "--"}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Offence
                  {offences.length > 0 ? (
                    <select
                      value={convertForm.offence_ref}
                      onChange={(event) => {
                        const selected = offences.find((offence) => String(offence.id) === event.target.value);
                        setConvertForm((prev) => ({
                          ...prev,
                          offence_ref: event.target.value,
                          offence: selected ? selected.name : convertTarget.incident.incident_type || "",
                        }));
                      }}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                    >
                      <option value="">Use incident type</option>
                      {offences
                        .slice()
                        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                        .map((offence) => (
                          <option key={offence.id} value={offence.id}>{offence.name}</option>
                        ))}
                    </select>
                  ) : (
                    <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-700">
                      {convertForm.offence || convertTarget.incident.incident_type || "--"}
                    </p>
                  )}
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Offence Type
                  <select
                    value={convertForm.offence_type}
                    onChange={(event) => updateConvertField("offence_type", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                  >
                    <option value="">Select...</option>
                    <option value="service_offence">Service Offence</option>
                    <option value="criminal_offence">Criminal Offence</option>
                  </select>
                </label>
                {convertForm.offence_type === "service_offence" && (
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Severity
                    <select
                      value={convertForm.service_offence_severity}
                      onChange={(event) => updateConvertField("service_offence_severity", event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                    >
                      <option value="">Select...</option>
                      <option value="serious">Serious</option>
                      <option value="minor">Minor</option>
                    </select>
                  </label>
                )}
                {convertForm.offence_type === "criminal_offence" && (
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Criminal Offence Type
                    <select
                      value={convertForm.criminal_offence_type}
                      onChange={(event) => updateConvertField("criminal_offence_type", event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                    >
                      <option value="">Select...</option>
                      <option value="dci_civ_police">DCI / Civ Police</option>
                      <option value="court_martial">Court Martial</option>
                    </select>
                  </label>
                )}
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Date of Offence
                  <input
                    type="date"
                    value={convertForm.date_of_offence}
                    onChange={(event) => updateConvertField("date_of_offence", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Place of Offence
                  <input
                    value={convertForm.place_of_offence}
                    onChange={(event) => updateConvertField("place_of_offence", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Submitting Unit
                  <select
                    value={convertForm.submitting_unit}
                    onChange={(event) => updateConvertField("submitting_unit", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                  >
                    <option value="">Select unit...</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                </label>
                {conversionRequiresPoliceOb && (
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Police Station / OB Ref *
                    <input
                      value={convertForm.police_station}
                      onChange={(event) => updateConvertField("police_station", event.target.value)}
                      required
                      placeholder="Police station and OB reference"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                    />
                  </label>
                )}
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
                  Description
                  <textarea
                    value={convertForm.description}
                    onChange={(event) => updateConvertField("description", event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Accused Entries</p>
                  <button
                    type="button"
                    onClick={() => setConvertForm((prev) => ({ ...prev, accused_entries: [...prev.accused_entries, { ...EMPTY_ACCUSED }] }))}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Add Accused
                  </button>
                </div>
                <div className="space-y-3">
                  {convertForm.accused_entries.map((accused, index) => (
                    <div key={index} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accused #{index + 1}</p>
                        {convertForm.accused_entries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setConvertForm((prev) => ({
                              ...prev,
                              accused_entries: prev.accused_entries.filter((_, entryIndex) => entryIndex !== index),
                            }))}
                            className="text-xs font-semibold text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={accused.name}
                          onChange={(event) => updateConvertAccused(index, "name", event.target.value)}
                          placeholder="Name"
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <select
                          value={accused.rank}
                          onChange={(event) => updateConvertAccused(index, "rank", event.target.value)}
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                          <option value="">Select rank...</option>
                          {ALL_RANKS.map((rank) => (
                            <option key={rank} value={rank}>{rank}</option>
                          ))}
                        </select>
                        <input
                          value={accused.service_number}
                          onChange={(event) => updateConvertAccused(index, "service_number", event.target.value)}
                          placeholder="Service number"
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <select
                          value={accused.service}
                          onChange={(event) => updateConvertAccused(index, "service", event.target.value)}
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                          <option value="">Service...</option>
                          <option value="KA">KA</option>
                          <option value="KAF">KAF</option>
                          <option value="KN">KN</option>
                        </select>
                        <select
                          value={accused.unit}
                          onChange={(event) => updateConvertAccused(index, "unit", event.target.value)}
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
                        >
                          <option value="">Accused unit...</option>
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>{unit.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Leave accused fields blank if the accused is not yet identified.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeConvertModal}
                disabled={Boolean(convertingIncidentId)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmConvertIncidentToCase}
                disabled={Boolean(convertingIncidentId)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {convertingIncidentId ? "Converting..." : "Confirm Convert to Case"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
