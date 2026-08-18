import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { caseService, caseBriefService, formationService, offenceService, teamService, attachmentService, userService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";
import AddAnotherModal from "./common/AddAnotherModal";
import { openProtectedFile } from "../utils/protectedFiles";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
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

function caseAssignmentLabel(caseObj) {
  return caseObj?.assigned_to_name || caseObj?.assigned_team_name || "";
}

function accusedUnitLabel(caseObj) {
  const units = [
    caseObj?.accused_unit_name,
    ...toArray(caseObj?.accused_entries).map((entry) => entry?.unit_name || entry?.unit),
  ].filter(Boolean);
  return [...new Set(units)].join("; ");
}

function taskedBattalionCompanyLabel(caseObj) {
  if (caseObj?.tasked_detachment_name) {
    return [caseObj?.tasked_battalion_name, caseObj.tasked_detachment_name].filter(Boolean).join(" / ");
  }
  return caseObj?.tasked_battalion_name || "";
}

function latestCaseUpdateText(caseObj) {
  return caseObj?.latest_update || caseObj?.action_taken || caseObj?.mentioning_remarks || caseObj?.remarks || "";
}

function latestCaseUpdateDate(caseObj) {
  return caseObj?.latest_update_at || caseObj?.mentioning_date || caseObj?.updated_at || "";
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

function normalizeDateForDisplay(value) {
  const normalized = normalizeDateForApi(value);
  if (normalized) return normalized;
  if (!value) return "";
  return String(value);
}

function formatDateTimeForReport(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeDateForDisplay(value);
  return date.toLocaleString("en-GB");
}

function caseDateValues(caseObj) {
  return [
    caseObj?.date_of_offence,
    caseObj?.created_at,
    caseObj?.updated_at,
    caseObj?.tasking_date,
    caseObj?.team_assigned_at,
    caseObj?.served_at,
    caseObj?.closed_at,
    caseObj?.mentioning_date,
    caseObj?.rfi_date,
    caseObj?.investigation_deadline,
  ].map(normalizeDateForApi).filter(Boolean);
}

function caseMatchesDateRange(caseObj, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  return caseDateValues(caseObj).some((dateValue) =>
    (!dateFrom || dateValue >= dateFrom) && (!dateTo || dateValue <= dateTo)
  );
}

function caseUnitLabel(caseObj) {
  const accusedEntryUnits = toArray(caseObj?.accused_entries)
    .map((entry) => entry?.unit_name || entry?.unit)
    .filter(Boolean);
  const taskedTo = [caseObj?.tasked_battalion_name, caseObj?.tasked_detachment_name].filter(Boolean).join(" / ");
  return [
    caseObj?.accused_unit_name,
    ...accusedEntryUnits,
    caseObj?.submitting_unit_name,
    taskedTo,
    caseObj?.assigned_team_name,
    caseObj?.assigned_to_name,
  ].filter(Boolean).join("; ");
}

function caseSearchText(caseObj) {
  const accusedEntries = toArray(caseObj?.accused_entries).flatMap((entry) => [
    entry?.name,
    entry?.rank,
    entry?.service_number,
    entry?.service,
    entry?.unit_name,
    entry?.unit,
  ]);
  return [
    caseObj?.case_number,
    caseObj?.status,
    STATUS_CHIP_META[caseObj?.status]?.label,
    caseObj?.title,
    caseObj?.offence,
    caseObj?.offence_name,
    caseObj?.description,
    caseObj?.place_of_offence,
    caseObj?.police_station,
    caseObj?.accused_name,
    caseObj?.accused_rank,
    caseObj?.accused_service_number,
    caseObj?.accused_service,
    caseObj?.accused_unit_name,
    accusedUnitLabel(caseObj),
    caseObj?.submitting_unit_name,
    caseObj?.tasked_battalion_name,
    caseObj?.tasked_detachment_name,
    caseObj?.assigned_team_name,
    caseObj?.assigned_to_name,
    caseObj?.remarks,
    caseObj?.action_taken,
    caseObj?.mentioning_remarks,
    caseObj?.latest_update,
    caseObj?.reason_for_pending,
    caseObj?.rfi_no,
    ...caseDateValues(caseObj),
    ...accusedEntries,
  ].filter(Boolean).join(" ").toLowerCase();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadTextFile(filename, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatActorLine(item) {
  const serviceNumber = item?.actor_service_number || "--";
  const rank = item?.actor_rank || "--";
  const name = item?.actor_display_name || item?.actor_name || "System";
  return `${serviceNumber} | ${rank} | ${name}`;
}

function formatUpdateFlowDetail(detail) {
  if (!detail) return "";
  return String(detail).replace(/^Case update posted for\s+/i, "On ");
}

function openReferencePdf(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function printReferencePdf(url) {
  if (!url) return;
  const printWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // ignore print blockers
    }
  };
  if (printWindow.document?.readyState === "complete") {
    triggerPrint();
  } else {
    printWindow.onload = triggerPrint;
  }
}

function ReferenceActions({ url, name }) {
  if (!url) return null;
  const filename = name || "reference.pdf";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => openReferencePdf(url)}
        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-sky-600/20 text-sky-300 border border-sky-500/40 hover:bg-sky-600/30 transition-colors"
      >
        View Reference
      </button>
      <button
        type="button"
        onClick={() => printReferencePdf(url)}
        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-colors"
      >
        Print Reference
      </button>
      <a
        href={url}
        download={filename}
        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-violet-600/20 text-violet-300 border border-violet-500/40 hover:bg-violet-600/30 transition-colors"
      >
        Export Reference
      </a>
    </div>
  );
}

function ProtectedDocumentButton({ url, label = "document", children, className = "", onError, stopPropagation = true }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const handleOpen = async (event) => {
    event.preventDefault();
    if (stopPropagation) event.stopPropagation();
    setError("");
    setOpening(true);
    await openProtectedFile(url, {
      label,
      onError: (message) => {
        setError(message);
        onError?.(message);
      },
    });
    setOpening(false);
  };

  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <button
        type="button"
        onClick={handleOpen}
        disabled={opening}
        className={className || "text-blue-400 hover:underline disabled:opacity-60"}
      >
        {opening ? "Opening..." : children}
      </button>
      {error && <span className="max-w-[240px] text-[11px] text-red-400">{error}</span>}
    </span>
  );
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

const STATUS_CHIP_META = {
  all: { label: "All", dot: "bg-blue-400" },
  new: { label: "New", dot: "bg-gray-400" },
  under_investigation: { label: "Under Investigation", dot: "bg-indigo-400" },
  pending: { label: "Pending", dot: "bg-orange-400" },
  served: { label: "Served", dot: "bg-purple-400" },
  closed: { label: "Close", dot: "bg-green-400" },
  open: { label: "Open", dot: "bg-blue-400" },
  tasked: { label: "Tasked", dot: "bg-yellow-400" },
  referred: { label: "Referred", dot: "bg-cyan-400" },
};

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
  "Sergeant",
  "Corporal",
  "Lance Corporal",
  "Private",
  "Recruit",
];

const INIT_ACCUSED_ENTRY = {
  name: "",
  rank: "",
  service_number: "",
  service: "",
  unit: "",
};

const INIT_CREATE = {
  title: "", description: "", offence: "", offence_ref: "", offence_type: "",
  service_offence_severity: "", criminal_offence_type: "",
  accused_entries: [INIT_ACCUSED_ENTRY],
  accused_service: "", submitting_unit: "", date_of_offence: "", place_of_offence: "",
  rfi_no: "", rfi_date: "", tasking_no: "",
  rfi_document: null,
};

function isBlank(value) {
  return !String(value ?? "").trim();
}

function validateRequiredCreateCase(form, offencesAvailable) {
  if (offencesAvailable && !form.offence_ref) return "Select an offence.";
  if (!offencesAvailable && isBlank(form.offence)) return "Offence is required.";
  if (!form.offence_type) return "Offence type is required.";
  if (form.offence_type === "service_offence" && !form.service_offence_severity) {
    return "Severity is required for service offences.";
  }
  if (form.offence_type === "criminal_offence" && !form.criminal_offence_type) {
    return "Criminal offence type is required.";
  }

  const accusedEntries = (Array.isArray(form.accused_entries) ? form.accused_entries : [])
    .filter((entry) => Object.values(entry || {}).some((value) => !isBlank(value)));
  for (let index = 0; index < accusedEntries.length; index += 1) {
    const entry = accusedEntries[index] || {};
    const label = `Accused #${index + 1}`;
    if (isBlank(entry.name)) return `${label} name is required.`;
    if (isBlank(entry.rank)) return `${label} rank is required.`;
    if (isBlank(entry.service_number)) return `${label} service number is required.`;
    if (isBlank(entry.service)) return `${label} service is required.`;
    if (!entry.unit) return `${label} unit is required.`;
  }

  if (!form.submitting_unit) return "Submitting unit is required.";
  if (!form.date_of_offence) return "Date of offence is required.";
  if (isBlank(form.place_of_offence)) return "Place of offence is required.";
  if (isBlank(form.description)) return "Description is required.";
  if (form.rfi_document && isBlank(form.rfi_no)) {
    return "RFI number is required when an RFI attachment is selected.";
  }
  if (form.rfi_document && !form.rfi_date) {
    return "RFI date is required when an RFI attachment is selected.";
  }
  return "";
}

function caseToForm(caseObj) {
  const accusedEntries = toArray(caseObj?.accused_entries).length
    ? toArray(caseObj.accused_entries).map((entry) => ({
        name: entry?.name || "",
        rank: entry?.rank || "",
        service_number: entry?.service_number || "",
        service: entry?.service || "",
        unit: entry?.unit ? String(entry.unit) : "",
      }))
    : [{
        name: caseObj?.accused_name || "",
        rank: caseObj?.accused_rank || "",
        service_number: caseObj?.accused_service_number || "",
        service: caseObj?.accused_service || "",
        unit: caseObj?.accused_unit ? String(caseObj.accused_unit) : "",
      }];

  return {
    title: caseObj?.title || "",
    description: caseObj?.description || "",
    offence: caseObj?.offence || "",
    offence_ref: caseObj?.offence_ref ? String(caseObj.offence_ref) : "",
    offence_type: caseObj?.offence_type || "",
    service_offence_severity: caseObj?.service_offence_severity || "",
    criminal_offence_type: caseObj?.criminal_offence_type || "",
    accused_entries: accusedEntries.length ? accusedEntries : [INIT_ACCUSED_ENTRY],
    accused_service: caseObj?.accused_service || "",
    submitting_unit: caseObj?.submitting_unit ? String(caseObj.submitting_unit) : "",
    date_of_offence: normalizeDateForApi(caseObj?.date_of_offence),
    place_of_offence: caseObj?.place_of_offence || "",
    rfi_no: caseObj?.rfi_no || "",
    rfi_date: normalizeDateForApi(caseObj?.rfi_date),
    tasking_no: caseObj?.tasking_no || "",
    rfi_document: null,
  };
}

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

const CASE_FORM_CONTROL =
  "w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-950 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

function CaseFormLabel({ children }) {
  return (
    <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">{children}</label>
  );
}

function CaseFormSectionLabel({ children }) {
  return (
    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">{children}</p>
  );
}

function ErrMsg({ msg }) {
  if (!msg) return null;
  return <p className="text-red-400 text-xs mt-1">{msg}</p>;
}

const SCANNER_HELPER_URL = "http://127.0.0.1:41527/scan";

function unitOptionLabel(unit) {
  if (!unit) return "";
  const bits = [
    unit.name,
    unit.code,
    unit.service,
    unit.formation_name || "Service-level",
    unit.location_county,
  ].filter(Boolean);
  return bits.join(" | ");
}

function unitSearchText(unit) {
  return [
    unit.name,
    unit.code,
    unit.service,
    unit.formation_name,
    unit.location_county,
    unit.email,
    unit.mobile_no,
  ].filter(Boolean).join(" ").toLowerCase();
}

function compactSearchText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function unitMatchesService(unit, serviceFilter) {
  return !serviceFilter || unit.service === serviceFilter;
}

function unitMatches(unit, query) {
  const trimmed = String(query || "").trim().toLowerCase();
  if (!trimmed) return true;
  const text = unitSearchText(unit);
  const compactText = compactSearchText(text);
  const compactQuery = compactSearchText(trimmed);
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return (
    text.includes(trimmed)
    || (compactQuery && compactText.includes(compactQuery))
    || tokens.every((token) => text.includes(token) || compactText.includes(compactSearchText(token)))
  );
}

function unitRank(unit, query) {
  const trimmed = String(query || "").trim().toLowerCase();
  if (!trimmed) return 50;
  const name = String(unit.name || "").toLowerCase();
  const code = String(unit.code || "").toLowerCase();
  if (name === trimmed || code === trimmed) return 0;
  if (name.startsWith(trimmed) || code.startsWith(trimmed)) return 1;
  if (unitSearchText(unit).includes(trimmed)) return 2;
  return 3;
}

function UnitAutocomplete({ label, units, value, onChange, serviceFilter, placeholder = "Search unit by name or code..." }) {
  const selected = units.find((unit) => String(unit.id) === String(value));
  const [query, setQuery] = useState(selected ? unitOptionLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const [remoteUnits, setRemoteUnits] = useState([]);
  const [searchingUnits, setSearchingUnits] = useState(false);

  useEffect(() => {
    setQuery(selected ? unitOptionLabel(selected) : "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!open || !trimmedQuery || (selected && trimmedQuery === unitOptionLabel(selected))) {
      setRemoteUnits([]);
      setSearchingUnits(false);
      return undefined;
    }

    let cancelled = false;
    setSearchingUnits(true);
    const timerId = window.setTimeout(() => {
      formationService
        .units({
          page_size: 25,
          search: trimmedQuery,
          ...(serviceFilter ? { service: serviceFilter } : {}),
        })
        .then((res) => {
          if (!cancelled) setRemoteUnits(toArray(res.data));
        })
        .catch(() => {
          if (!cancelled) setRemoteUnits([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingUnits(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [open, query, selected, serviceFilter]);

  const trimmed = query.trim();
  const mergedUnits = [...units, ...remoteUnits].reduce((acc, unit) => {
    if (unit?.id && !acc.some((item) => String(item.id) === String(unit.id))) acc.push(unit);
    return acc;
  }, []);
  const matches = mergedUnits
    .filter((unit) => unitMatchesService(unit, serviceFilter))
    .filter((unit) => !trimmed || unitMatches(unit, trimmed))
    .sort((a, b) =>
      unitRank(a, trimmed) - unitRank(b, trimmed)
      || String(a.name || "").localeCompare(String(b.name || ""))
    )
    .slice(0, 20);

  return (
    <div className="relative">
      <CaseFormLabel>{label}</CaseFormLabel>
      <input
        type="search"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(true);
          if (value || !nextQuery.trim()) onChange("");
        }}
        placeholder={placeholder}
        className={`${CASE_FORM_CONTROL} pr-14`}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
            setOpen(false);
          }}
          className="absolute right-2 top-8 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          Clear
        </button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-xl">
          {matches.length === 0 && searchingUnits ? (
            <div className="px-3 py-2 text-xs text-slate-500">Searching units...</div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No matching units.</div>
          ) : matches.map((unit) => (
            <button
              key={unit.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(String(unit.id));
                setQuery(unitOptionLabel(unit));
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
            >
              <span className="block font-semibold text-slate-950">{unit.name}</span>
              <span className="text-xs text-slate-500">
                {[unit.code, unit.service, unit.formation_name || "Service-level", unit.location_county].filter(Boolean).join(" | ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function scanFromLocalScanner(documentType) {
  const response = await fetch(SCANNER_HELPER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_type: documentType || "document" }),
  });
  if (!response.ok) {
    throw new Error(`Scanner returned ${response.status}`);
  }
  const blob = await response.blob();
  const ext = blob.type.includes("image") ? "jpg" : "pdf";
  const safeType = String(documentType || "scanned-document").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return new File([blob], `${safeType}-${Date.now()}.${ext}`, {
    type: blob.type || "application/pdf",
  });
}

function ScannableFileInput({
  label,
  file,
  onFileChange,
  onScanError,
  accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png",
  documentType,
  disabled,
  variant = "dark",
  helperText = "",
  clearLabel = "Clear selected file",
}) {
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState("");
  const fileInputRef = useRef(null);
  const isLight = variant === "light";

  function handleFileSelection(event) {
    onFileChange(event.target.files?.[0] || null);
    setScanNotice("");
    onScanError?.("");
  }

  async function handleScan() {
    setScanning(true);
    setScanNotice("");
    onScanError?.("");
    try {
      const scannedFile = await scanFromLocalScanner(documentType || label);
      onFileChange(scannedFile);
      setScanNotice("Scanned document attached.");
    } catch {
      setScanNotice(
        "Direct scan is unavailable on this computer. Scan with the scanner app, save the file, then upload the saved scan here."
      );
      onScanError?.("");
    } finally {
      setScanning(false);
    }
  }

  const labelClass = isLight
    ? "text-xs font-semibold uppercase tracking-wide text-slate-700 block mb-1"
    : "text-xs text-gray-400 block mb-1";
  const inputClass = isLight
    ? "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-700 disabled:opacity-50"
    : "w-full text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-600 file:text-white file:text-xs disabled:opacity-50";
  const buttonClass = isLight
    ? "rounded-lg border border-blue-500 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
    : "rounded border border-sky-500/60 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-600/20 disabled:opacity-50";
  const selectedClass = isLight ? "mt-2 truncate text-xs text-slate-600" : "mt-2 truncate text-xs text-gray-300";
  const noticeClass = isLight
    ? "mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"
    : "mt-2 rounded-lg border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-xs text-sky-100";
  const helperClass = isLight ? "mt-2 text-xs text-slate-500" : "mt-2 text-xs text-gray-500";

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelection}
          accept={accept}
          disabled={disabled || scanning}
          className={inputClass}
        />
        <button
          type="button"
          onClick={handleScan}
          disabled={disabled || scanning}
          className={buttonClass}
        >
          {scanning ? "Scanning..." : "Scan then Upload"}
        </button>
      </div>
      {helperText && <p className={helperClass}>{helperText}</p>}
      {scanNotice && <p className={noticeClass}>{scanNotice}</p>}
      {file && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className={selectedClass}>Selected: {file.name}</p>
          <button
            type="button"
            onClick={() => {
              onFileChange(null);
              setScanNotice("");
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            disabled={disabled || scanning}
            className={isLight ? "text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50" : "text-xs font-medium text-red-300 hover:text-red-200 disabled:opacity-50"}
          >
            {clearLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmCaseDelete({ caseObj, saving, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-gray-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 font-semibold text-white">Delete case?</h3>
        <p className="mb-5 text-sm text-gray-400">
          This will permanently delete {caseObj?.case_number || "this case"}. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionLabel({ action }) {
  const labels = {
    case_created: "Case Created",
    status_changed: "Status Changed",
    attachment_uploaded: "Attachment Uploaded",
    attachment_deleted: "Attachment Deleted",
    team_assigned: "Investigation Assigned",
    battalion_tasked: "Battalion Tasked",
    detachment_tasked: "Company Tasked",
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

  const hasRfi = Boolean(c?.rfi_document || c?.rfi_no || c?.rfi_date);
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
            c.rfi_document ? (
              <ProtectedDocumentButton
                url={c.rfi_document}
                label="RFI document"
                className="block text-blue-400 hover:underline"
              >
                RFI Document - View
              </ProtectedDocumentButton>
            ) : (
              <div className="rounded-lg bg-gray-700/60 p-3 text-gray-300 text-xs">
                <p className="font-medium text-white">RFI reference</p>
                <p className="text-gray-400 mt-1">
                  {[c.rfi_no && `No: ${c.rfi_no}`, c.rfi_date && `Date: ${c.rfi_date}`]
                    .filter(Boolean)
                    .join(" | ") || "RFI reference"
                  }
                </p>
              </div>
            )
          )}

          {hasTaskingLetter && (
            <ProtectedDocumentButton
              url={c.tasking_letter}
              label="tasking letter"
              className="block text-blue-400 hover:underline"
            >
              Tasking Letter - View
            </ProtectedDocumentButton>
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
                <ProtectedDocumentButton
                  key={att.id || idx}
                  url={att.file}
                  label={att.label || "extra attachment"}
                  className="block text-blue-400 hover:underline"
                >
                  {att.label || att.file_name || `Extra Attachment ${idx + 1}`} - View
                </ProtectedDocumentButton>
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

const BRIEF_FORWARD_OPTIONS = [
  { value: "detachment", label: "IC COY" },
  { value: "hod", label: "HOD" },
  { value: "adj", label: "Adjutant" },
  { value: "2ic", label: "2IC" },
  { value: "oc", label: "OC" },
  { value: "co", label: "CO" },
  { value: "corps_cmd", label: "Corps Commander" },
];

function caseHasDetachmentRoute(user, caseObj) {
  return Boolean(caseObj?.tasked_detachment || caseObj?.tasked_detachment_name || user?.detachment);
}

function briefForwardHistory(brief) {
  return Array.isArray(brief?.forward_history) ? brief.forward_history : [];
}

function currentBriefForwardHistory(brief) {
  const revision = Number(brief?.revision || 1);
  return briefForwardHistory(brief).filter((event) => Number(event.revision || 1) === revision);
}

function hasBriefForwardAccess(user, caseObj) {
  const role = user?.role;
  if (role === "investigator") return true;
  const targetByRole = {
    detachment: "detachment",
    hod: "hod",
    adj: "adj",
    "2ic": "2ic",
    oc: "oc",
    co: "co",
    corps_cmd: "corps_cmd",
  };
  const target = targetByRole[role];
  const brief = caseObj?.brief || {};
  if (!target) return false;
  if (brief.forwarded_to_role === target) return true;
  return briefForwardHistory(brief).some((event) => event.to_role === target || event.from_role === role);
}

function removeUsedBriefForwardOptions(brief, options) {
  const usedTargets = new Set(currentBriefForwardHistory(brief).map((event) => event.to_role).filter(Boolean));
  return options.filter((option) => !usedTargets.has(option.value));
}

function getBriefForwardOptions(user, caseObj) {
  const currentTarget = caseObj?.brief?.forwarded_to_role || "";
  const brief = caseObj?.brief || {};
  let options = [];
  if (user?.role === "investigator") {
    if (caseHasDetachmentRoute(user, caseObj)) {
      options = BRIEF_FORWARD_OPTIONS.filter((option) => option.value === "detachment");
      return removeUsedBriefForwardOptions(brief, options);
    }
    options = BRIEF_FORWARD_OPTIONS.filter((option) => ["hod", "adj"].includes(option.value));
    return removeUsedBriefForwardOptions(brief, options);
  }
  if (user?.role === "detachment" && (currentTarget === "detachment" || hasBriefForwardAccess(user, caseObj))) {
    options = BRIEF_FORWARD_OPTIONS.filter((option) => ["adj", "hod", "2ic", "oc"].includes(option.value));
    return removeUsedBriefForwardOptions(brief, options);
  }
  if (user?.role === "hod" && (currentTarget === "hod" || hasBriefForwardAccess(user, caseObj))) {
    options = BRIEF_FORWARD_OPTIONS.filter((option) => ["2ic", "co"].includes(option.value));
    return removeUsedBriefForwardOptions(brief, options);
  }
  if (user?.role === "adj" && (currentTarget === "adj" || hasBriefForwardAccess(user, caseObj))) {
    options = BRIEF_FORWARD_OPTIONS.filter((option) => ["2ic", "co"].includes(option.value));
    return removeUsedBriefForwardOptions(brief, options);
  }
  if (user?.role === "2ic" && (currentTarget === "2ic" || hasBriefForwardAccess(user, caseObj))) {
    options = BRIEF_FORWARD_OPTIONS.filter((option) => option.value === "co");
    return removeUsedBriefForwardOptions(brief, options);
  }
  if (user?.role === "oc" && (currentTarget === "oc" || hasBriefForwardAccess(user, caseObj))) {
    options = BRIEF_FORWARD_OPTIONS.filter((option) => ["2ic", "co"].includes(option.value));
    return removeUsedBriefForwardOptions(brief, options);
  }
  if (user?.role === "co" && (currentTarget === "co" || hasBriefForwardAccess(user, caseObj))) {
    options = BRIEF_FORWARD_OPTIONS.filter((option) => option.value === "corps_cmd");
    return removeUsedBriefForwardOptions(brief, options);
  }
  return [];
}

export default function Cases({ user, criminalTypeFilter }) {
  const detailPanelRef = useRef(null);
  const actionSaveInFlightRef = useRef(new Set());
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const initialFilter = ALL_STATUSES.includes(initialStatus) ? initialStatus : "all";
  const placeOfOffenceFilter = searchParams.get("place_of_offence") || "";
  const accusedUnitQueryFilter = searchParams.get("accused_unit") || "";
  const accusedServiceFilter = searchParams.get("accused_service") || "";
  const offenceFilter = searchParams.get("offence") || "";
  const criminalTypeQueryFilter = searchParams.get("criminal_offence_type") || "";
  const createdFromFilter = searchParams.get("created_from") || "";
  const createdToFilter = searchParams.get("created_to") || "";
  const taskedBattalionFilter = searchParams.get("tasked_battalion") || "";
  const taskedDetachmentFilter = searchParams.get("tasked_detachment") || "";
  const activeCriminalTypeFilter = criminalTypeFilter || criminalTypeQueryFilter;
  const [cases, setCases]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState(initialFilter);
  const [search, setSearch]     = useState("");
  const [accusedUnitFilter, setAccusedUnitFilter] = useState(accusedUnitQueryFilter);
  const [dateFrom, setDateFrom] = useState(createdFromFilter);
  const [dateTo, setDateTo]     = useState(createdToFilter);
  const [selected, setSelected] = useState(null);
  const selectedId = selected?.id || null;
  const [expandedDesc, setExpandedDesc] = useState({});

  // Create form
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState(INIT_CREATE);
  const [caseFormMode, setCaseFormMode] = useState("create");
  const [caseDeleteTarget, setCaseDeleteTarget] = useState(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr]     = useState("");
  const [addAnotherPrompt, setAddAnotherPrompt] = useState(null);

  // Task form
  const [showTask, setShowTask]       = useState(false);
  const [taskModalMode, setTaskModalMode] = useState(false);
  const [taskBattalion, setTaskBattalion] = useState("");
  const [taskingNo, setTaskingNo] = useState("");
  const [taskingDate, setTaskingDate] = useState("");
  const [taskFile, setTaskFile]       = useState(null);
  const [taskSaving, setTaskSaving]   = useState(false);
  const [taskErr, setTaskErr]         = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState("success");

  function showToast(message, variant = "success") {
    setToastMessage(message);
    setToastVariant(variant);
  }

  // Assignment form
  const [showTeam, setShowTeam]       = useState(false);
  const [assignmentMode, setAssignmentMode] = useState("io");
  const [teamId, setTeamId]           = useState("");
  const [ioId, setIoId]               = useState("");
  const [teamDeadline, setTeamDeadline] = useState("");
  const [teamSaving, setTeamSaving]   = useState(false);
  const [teamErr, setTeamErr]         = useState("");

  // Status update
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusErr, setStatusErr]     = useState("");
  const [rowActionSavingId, setRowActionSavingId] = useState(null);
  const [rowActionErr, setRowActionErr] = useState("");

  // Document upload workflow
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [docLabel, setDocLabel] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadErr, setDocUploadErr] = useState("");

  // Brief upload workflow
  const [showBriefUpload, setShowBriefUpload] = useState(false);
  const [briefSummary, setBriefSummary] = useState("");
  const [briefFile, setBriefFile] = useState(null);
  const [briefUploading, setBriefUploading] = useState(false);
  const [briefUploadErr, setBriefUploadErr] = useState("");
  const [showForwardForm, setShowForwardForm] = useState(false);
  const [forwardRole, setForwardRole] = useState("");
  const [forwardNote, setForwardNote] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [forwardErr, setForwardErr] = useState("");

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
  const [courtCloseCase, setCourtCloseCase] = useState(null);
  const [showCourtCloseModal, setShowCourtCloseModal] = useState(false);
  const [judgmentFileRows, setJudgmentFileRows] = useState([]);
  const [courtCloseSaving, setCourtCloseSaving] = useState(false);
  const [courtCloseErr, setCourtCloseErr] = useState("");
  const [closeActionTaken, setCloseActionTaken] = useState("");
  const [closeChargesheetFile, setCloseChargesheetFile] = useState(null);
  const [closePartOneOrdersFile, setClosePartOneOrdersFile] = useState(null);
  const [closeRfiFile, setCloseRfiFile] = useState(null);
  const [dateFieldActive, setDateFieldActive] = useState(false);
  const [caseActivity, setCaseActivity] = useState([]);
  const [caseActivityLoading, setCaseActivityLoading] = useState(false);
  const [caseActivityErr, setCaseActivityErr] = useState("");
  const [updateFlowCase, setUpdateFlowCase] = useState(null);
  const [updateFlow, setUpdateFlow] = useState([]);
  const [updateFlowLoading, setUpdateFlowLoading] = useState(false);
  const [updateFlowErr, setUpdateFlowErr] = useState("");

  // Remote data for forms
  const [battalions, setBattalions]   = useState([]);
  const [teams, setTeams]             = useState([]);
  const [investigators, setInvestigators] = useState([]);
  const [workload, setWorkload]       = useState([]);
  const [offences, setOffences]       = useState([]);
  const [units, setUnits]             = useState([]);

  // ── Permissions ──────────────────────────────────────────────────
  const isHqsAdmin  = user?.role === "admin" && user?.battalion_type === "hqs";
  const isSuperuser = Boolean(user?.is_superuser);
  const canCreate   = isHqsAdmin || isSuperuser;
  const canTask     = isHqsAdmin || isSuperuser;
  const canManageCases = isHqsAdmin || isSuperuser;
  // Battalion admin/CO who is NOT HQS can assign teams
  const canAssignTeam = !isHqsAdmin && !isSuperuser &&
    (user?.role === "admin" || user?.role === "co");
  const isInvestigator = user?.role === "investigator";
  const briefForwardOptions = getBriefForwardOptions(user, selected);
  const workloadMap = Object.fromEntries(workload.map((w) => [w.id, w.total_engagement ?? 0]));
  const sortedInvestigators = [...investigators].sort(sortUsersByWorkload(workloadMap));
  useAutoDismiss(createErr, setCreateErr);
  useAutoDismiss(taskErr, setTaskErr);
  useAutoDismiss(toastMessage, setToastMessage, 4000);
  useAutoDismiss(teamErr, setTeamErr);
  useAutoDismiss(statusErr, setStatusErr);
  useAutoDismiss(rowActionErr, setRowActionErr);
  useAutoDismiss(docUploadErr, setDocUploadErr);
  useAutoDismiss(briefUploadErr, setBriefUploadErr);
  useAutoDismiss(forwardErr, setForwardErr);
  useAutoDismiss(courtMilestoneErr, setCourtMilestoneErr);
  useAutoDismiss(courtMilestoneSuccess, setCourtMilestoneSuccess);
  useAutoDismiss(courtCloseErr, setCourtCloseErr);

  // ── Load cases ────────────────────────────────────────────────────
  function loadCases() {
    setLoading(true);
    const params = { page_size: 200 };
    if (taskedDetachmentFilter) {
      params.tasked_detachment = taskedDetachmentFilter;
    } else if (taskedBattalionFilter) {
      params.tasked_battalion = taskedBattalionFilter;
    }
    caseService
      .list(params)
      .then((res) => setCases(toArray(res.data)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCases(); }, [taskedBattalionFilter, taskedDetachmentFilter]);

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
      .units({ page_size: 1000 })
      .then((res) => setUnits(toArray(res.data)))
      .catch(() => {});
  }, []);

  // Load assignment targets when a case is selected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedId) return;
    teamService
      .list()
      .then((res) => setTeams(toArray(res.data)))
      .catch(() => {});
    teamService
      .workload()
      .then((res) => setWorkload(toArray(res.data)))
      .catch(() => setWorkload([]));

    const params = { role: "investigator", page_size: 200 };
    const selectedDetachment = selected?.tasked_detachment || user?.detachment_id || user?.detachment;
    const selectedBattalion = selected?.tasked_battalion || user?.battalion_id || user?.battalion;
    if (selectedDetachment) {
      params.detachment = selectedDetachment;
    } else if (selectedBattalion) {
      params.battalion = selectedBattalion;
    }
    userService
      .list(params)
      .then((res) => setInvestigators(toArray(res.data).filter((u) => u.role === "investigator" && u.is_active !== false)))
      .catch(() => setInvestigators([]));
  }, [selectedId, selected?.tasked_detachment, selected?.tasked_battalion, user?.detachment_id, user?.detachment, user?.battalion_id, user?.battalion]);

  // Keep table status in sync with dashboard card links (?status=...)
  useEffect(() => {
    const status = searchParams.get("status");
    setFilter(ALL_STATUSES.includes(status) ? status : "all");
  }, [searchParams]);

  useEffect(() => {
    setDateFrom(createdFromFilter);
    setDateTo(createdToFilter);
  }, [createdFromFilter, createdToFilter]);

  useEffect(() => {
    setAccusedUnitFilter(accusedUnitQueryFilter);
  }, [accusedUnitQueryFilter]);

  // ── Helpers ───────────────────────────────────────────────────────
  const todayISO = new Date().toISOString().slice(0, 10);
  function refreshSelected(updated) {
    setSelected(updated);
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function closeCaseForm() {
    setShowCreate(false);
    setCreateErr("");
    setCreateForm(INIT_CREATE);
    setCaseFormMode("create");
  }

  function selectCase(c) {
    setSelected(c);
    setShowTask(false);
    setTaskModalMode(false);
    setShowTeam(false);
    setAssignmentMode(c?.assigned_team ? "team" : "io");
    setTeamId(c?.assigned_team ? String(c.assigned_team) : "");
    setIoId(c?.assigned_to ? String(c.assigned_to) : "");
    setTeamDeadline(normalizeDateForApi(c?.investigation_deadline));
    setTaskErr("");
    setTeamErr("");
    setStatusErr("");
    setCourtMilestoneErr("");
    setCourtMilestoneSuccess("");
    setCaseActivity([]);
    setCaseActivityErr("");
    setActionDrafts({});
    setEditingActionMilestoneId(null);
    if (!showCourtCloseModal) {
      setCourtCloseCase(null);
      setJudgmentFileRows([]);
      setCloseActionTaken("");
      setCloseChargesheetFile(null);
      setClosePartOneOrdersFile(null);
      setCloseRfiFile(null);
      setCourtCloseErr("");
    }
  }

  const selectedIsCourtMartial = selected?.criminal_offence_type === "court_martial";
  const selectedIsDci = selected?.criminal_offence_type === "dci_civ_police";
  const activeCloseCase = courtCloseCase || selected;
  const activeCloseCaseIsCourtMartial = activeCloseCase?.criminal_offence_type === "court_martial";
  const activeCloseCaseIsDci = activeCloseCase?.criminal_offence_type === "dci_civ_police";

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

  useEffect(() => {
    if (!updateFlowCase?.id) {
      setUpdateFlow([]);
      return;
    }
    setUpdateFlowLoading(true);
    setUpdateFlowErr("");
    caseService.activity(updateFlowCase.id)
      .then((res) => {
        const rows = toArray(res.data);
        const updateRows = rows
          .filter((item) => item.action === "case_updated")
          .sort((a, b) => {
            const aTs = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const bTs = b?.created_at ? new Date(b.created_at).getTime() : 0;
            return aTs - bTs;
          });
        setUpdateFlow(updateRows);
      })
      .catch(() => setUpdateFlowErr("Failed to load update flow."))
      .finally(() => setUpdateFlowLoading(false));
  }, [updateFlowCase?.id]);

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

  function judgmentLabelFromFilename(fileName) {
    const base = String(fileName || "").replace(/\.[^/.]+$/, "").trim();
    return base || "Judgment";
  }

  function handleJudgmentFileChange(rowId, file) {
    setJudgmentFileRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const label = String(row.label || "").trim()
          ? row.label
          : judgmentLabelFromFilename(file?.name);
        return { ...row, file, label };
      })
    );
    if (courtCloseErr) setCourtCloseErr("");
  }

  function closeCourtCloseModal() {
    if (courtCloseSaving) return;
    setShowCourtCloseModal(false);
    setCourtCloseCase(null);
    setJudgmentFileRows([]);
    setCloseActionTaken("");
    setCloseChargesheetFile(null);
    setClosePartOneOrdersFile(null);
    setCloseRfiFile(null);
    setCourtCloseErr("");
  }

  function openCourtCloseModal(caseObj = selected) {
    if (!caseObj?.id) return;
    setCourtCloseCase(caseObj);
    if (selected?.id !== caseObj.id) {
      setSelected(caseObj);
    }
    setCourtCloseErr("");
    setCloseActionTaken(caseObj.action_taken || "");
    setCloseChargesheetFile(null);
    setClosePartOneOrdersFile(null);
    setCloseRfiFile(null);
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
    const closeCase = courtCloseCase || selected;
    if (!closeCase) return;
    const rowsWithFiles = judgmentFileRows.filter((r) => r.file);
    if (!rowsWithFiles.length) {
      setCourtCloseErr("Attach at least one Judgment PDF file.");
      return;
    }

    if (!String(closeActionTaken || "").trim()) {
      setCourtCloseErr("Action taken is required before closing this case.");
      return;
    }

    const hasExistingChargesheet = Boolean(closeCase.chargesheet);
    const hasExistingPartOneOrders = Boolean(closeCase.part_one_orders);
    if (!closeChargesheetFile && !closePartOneOrdersFile && !hasExistingChargesheet && !hasExistingPartOneOrders) {
      setCourtCloseErr("Attach a Chargesheet or report before closing this case.");
      return;
    }

    if (!activeCloseCase?.rfi_document && !closeRfiFile) {
      setCourtCloseErr("Upload the RFI document before closing this case.");
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

    if (closeCase.criminal_offence_type === "court_martial") {
      if (!(isHqsAdmin || isSuperuser)) {
        setCourtCloseErr("Only HQ battalion admin can close a Court Martial case.");
        return;
      }
      const judgment = courtMilestones.find((m) => m.milestone_type === "judgment");
      if (!judgment?.scheduled_date) {
        setCourtCloseErr("Judgment date is required before closing a Court Martial case.");
        return;
      }
      if (!String(judgment.action_remarks || judgment.planning_comment || "").trim()) {
        setCourtCloseErr("Judgment remarks/comment are required before closing a Court Martial case.");
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
        await attachmentService.upload(closeCase.id, fd);
      }

      const fd = new FormData();
      fd.append("status", "closed");
      fd.append("action_taken", closeActionTaken.trim());
      if (closeChargesheetFile) fd.append("chargesheet", closeChargesheetFile);
      if (closePartOneOrdersFile) fd.append("part_one_orders", closePartOneOrdersFile);
      if (closeRfiFile) fd.append("rfi_document", closeRfiFile);

      const res = await caseService.update(closeCase.id, fd);
      refreshSelected(res.data);
      setFilter("closed");
      loadCases();

      setShowCourtCloseModal(false);
      setCourtCloseCase(null);
      setJudgmentFileRows([]);
      setCloseActionTaken("");
      setCloseChargesheetFile(null);
      setClosePartOneOrdersFile(null);
      setCloseRfiFile(null);
      setCourtCloseErr("");
      setStatusErr("");
      setRowActionErr("");
    } catch (err) {
      const d = err?.response?.data;
      if (d?.detail) {
        setCourtCloseErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setCourtCloseErr(msgs || "Failed to attach judgment files and close case.");
      } else {
        setCourtCloseErr("Failed to attach judgment files and close case.");
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
    const editing = caseFormMode === "edit" && selected?.id;
    if (!editing) {
      const validationError = validateRequiredCreateCase(createForm, offences.length > 0);
      if (validationError) {
        setCreateErr(validationError);
        return;
      }
    }
    setCreateSaving(true);
    setCreateErr("");
    const fd = new FormData();
    Object.entries(createForm).forEach(([k, v]) => {
      if (k === "offence_ref") return; // handled separately below
      if (k === "accused_entries") return; // handled separately below
      if (k === "submitting_unit") return; // handled separately
      if (k === "rfi_document") {
        if (v) fd.append(k, v);
        return;
      }
      if (editing || v) fd.append(k, v || "");
    });
    if (editing || createForm.offence_ref) fd.append("offence_ref", createForm.offence_ref || "");
    if (editing || createForm.submitting_unit) fd.append("submitting_unit", createForm.submitting_unit || "");
    const validAccusedEntries = (createForm.accused_entries || []).filter((entry) =>
      Object.values(entry).some((value) => String(value || "").trim())
    );
    if (editing || validAccusedEntries.length) {
      fd.append("accused_entries", JSON.stringify(validAccusedEntries));
    }
    try {
      if (editing) {
        const res = await caseService.update(selected.id, fd);
        refreshSelected(res.data);
        showToast("Case updated successfully.", "success");
        setShowCreate(false);
        setCreateForm(INIT_CREATE);
        setCaseFormMode("create");
      } else {
        await caseService.create(fd);
        showToast("Case created successfully.", "success");
        setCreateForm(INIT_CREATE);
        setCaseFormMode("create");
        setShowCreate(false);
        setAddAnotherPrompt({
          itemLabel: "case",
          message: "The case has been created and added to the case register.",
          addLabel: "Add Another Case",
        });
      }
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
        setCreateErr(err?.message || `Failed to ${editing ? "update" : "create"} case.`);
      }
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleDeleteCase() {
    if (!caseDeleteTarget?.id) return;
    setRowActionSavingId(caseDeleteTarget.id);
    setRowActionErr("");
    try {
      await caseService.delete(caseDeleteTarget.id);
      setCases((prev) => prev.filter((c) => c.id !== caseDeleteTarget.id));
      if (selected?.id === caseDeleteTarget.id) {
        setSelected(null);
      }
      setCaseDeleteTarget(null);
      showToast("Case deleted successfully.", "success");
    } catch (err) {
      const d = err?.response?.data;
      const message = d?.detail || "Failed to delete case.";
      setRowActionErr(message);
      showToast(message, "error");
    } finally {
      setRowActionSavingId(null);
    }
  }

  // ── Task case ─────────────────────────────────────────────────────
  async function handleTask(e) {
    e.preventDefault();
    if (!taskBattalion) { setTaskErr("Select a battalion."); return; }
    if (!taskingNo.trim()) { setTaskErr("Enter the tasking number."); return; }
    if (!taskFile)      { setTaskErr("Attach a tasking letter."); return; }
    if (!taskingDate)   { setTaskErr("Set a tasking date."); return; }
    const normalized = normalizeDateForApi(taskingDate);
    if (normalized !== todayISO) { setTaskErr("Tasking date must be today's date."); return; }
    setTaskSaving(true);
    setTaskErr("");
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const taskingDateTime = `${taskingDate}T${hh}:${mm}:${ss}`;
    const fd = new FormData();
    fd.append("tasked_battalion", taskBattalion);
    fd.append("tasking_no", taskingNo.trim());
    fd.append("tasking_letter", taskFile);
    fd.append("tasking_date", taskingDateTime);
    fd.append("status", "tasked");
    // Debug: log FormData contents to help diagnose backend mismatch
    try {
      for (const pair of fd.entries()) {
        // pair[1] may be a File object — log its name for readability
        if (pair[1] instanceof File) {
          console.debug("TaskFormData", pair[0], pair[1].name);
        } else {
          console.debug("TaskFormData", pair[0], pair[1]);
        }
      }
    } catch (e) {
      console.debug("TaskFormData: could not enumerate FormData", e);
    }
    try {
      const res = await caseService.taskCase(selected.id, fd);
      setCases((prev) => prev.map((c) => (c.id === res.data.id ? res.data : c)));
      showToast("Case tasked to battalion successfully.", "success");
      setSelected(null);
      setShowTask(false);
      setTaskModalMode(false);
      setTaskBattalion("");
      setTaskingNo("");
      setTaskFile(null);
      setTaskingDate("");
    } catch (err) {
      const d = err.response?.data;
      let message = "Failed to task case.";
      if (typeof d === "object") {
        message = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
      } else if (typeof d === "string" && d.trim()) {
        message = d;
      }
      setTaskErr(message);
      showToast(message, "error");
    } finally {
      setTaskSaving(false);
    }
  }

  // ── Assign team ───────────────────────────────────────────────────
  async function handleAssignTeam(e) {
    e.preventDefault();
    if (assignmentMode === "team" && !teamId) { setTeamErr("Select a team."); return; }
    if (assignmentMode === "io" && !ioId) { setTeamErr("Select an IO."); return; }
    if (!teamDeadline) { setTeamErr("Investigation deadline is required."); return; }
    setTeamSaving(true);
    setTeamErr("");
    try {
      const payload = {
        investigation_deadline: teamDeadline,
      };
      if (assignmentMode === "io") {
        payload.assigned_to = parseInt(ioId, 10);
        payload.assigned_team = null;
      } else {
        payload.assigned_team = parseInt(teamId, 10);
        payload.assigned_to = null;
      }
      const res = await caseService.update(selected.id, payload);
      refreshSelected(res.data);
      setShowTeam(false);
      setTeamId("");
      setIoId("");
      setTeamDeadline("");
      teamService
        .workload()
        .then((res) => setWorkload(toArray(res.data)))
        .catch(() => setWorkload([]));
      showToast("Case assigned for investigation.", "success");
    } catch (err) {
      const d = err?.response?.data;
      setTeamErr(
        d?.detail ||
        d?.non_field_errors?.[0] ||
        d?.assignment?.[0] ||
        d?.assigned_to?.[0] ||
        d?.assigned_team?.[0] ||
        d?.investigation_deadline?.[0] ||
        "Failed to assign case."
      );
    } finally {
      setTeamSaving(false);
    }
  }

  function toggleDocumentUpload() {
    setShowDocumentUpload((prev) => !prev);
    setDocUploadErr("");
    if (!showDocumentUpload) {
      setDocLabel("");
      setDocFile(null);
    }
  }

  function toggleBriefUpload() {
    setShowBriefUpload((prev) => !prev);
    setBriefUploadErr("");
    if (!showBriefUpload) {
      setBriefSummary("");
      setBriefFile(null);
    }
  }

  function toggleForwardForm() {
    setShowForwardForm((prev) => !prev);
    setForwardErr("");
    if (!showForwardForm) {
      setForwardRole("");
      setForwardNote("");
    }
  }

  async function handleForwardBrief(e) {
    e.preventDefault();
    if (!forwardRole) {
      setForwardErr("Select a recipient role.");
      return;
    }
    if (!briefForwardOptions.some((option) => option.value === forwardRole)) {
      setForwardErr("You cannot forward this brief to that role at this stage.");
      return;
    }
    setForwarding(true);
    setForwardErr("");
    try {
      const fd = new FormData();
      fd.append("forwarded_to_role", forwardRole);
      if (forwardNote.trim()) {
        fd.append("forwarded_note", forwardNote.trim());
      }
      await caseBriefService.update(selected.id, fd);
      refreshSelected(await caseService.get(selected.id).then((r) => r.data));
      setShowForwardForm(false);
      setForwardRole("");
      setForwardNote("");
      showToast("Brief forwarded successfully.", "success");
    } catch (err) {
      const d = err?.response?.data;
      if (d?.detail) {
        setForwardErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setForwardErr(msgs || "Failed to forward brief.");
      } else {
        setForwardErr("Failed to forward brief.");
      }
    } finally {
      setForwarding(false);
    }
  }

  async function handleDocumentUpload(e) {
    e.preventDefault();
    if (selected?.status === "closed") { setDocUploadErr("Closed cases do not allow further uploads or attachment changes."); return; }
    if (!docFile) { setDocUploadErr("Select a document to upload."); return; }
    if (!docLabel.trim()) { setDocUploadErr("Enter a document label."); return; }
    setDocUploading(true);
    setDocUploadErr("");
    try {
      const fd = new FormData();
      fd.append("label", docLabel.trim());
      fd.append("file", docFile);
      await attachmentService.upload(selected.id, fd);
      refreshSelected(await caseService.get(selected.id).then((r) => r.data));
      setDocLabel("");
      setDocFile(null);
      setShowDocumentUpload(false);
      showToast("Document uploaded successfully.", "success");
    } catch (err) {
      const d = err?.response?.data;
      if (d?.detail) {
        setDocUploadErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setDocUploadErr(msgs || "Failed to upload document.");
      } else {
        setDocUploadErr("Failed to upload document.");
      }
    } finally {
      setDocUploading(false);
    }
  }

  async function handleBriefUpload(e) {
    e.preventDefault();
    if (selected?.status === "closed") { setBriefUploadErr("Closed cases do not allow further uploads or attachment changes."); return; }
    if (!briefFile) { setBriefUploadErr("Select a brief document to upload."); return; }
    setBriefUploading(true);
    setBriefUploadErr("");
    try {
      const fd = new FormData();
      if (briefSummary.trim()) {
        fd.append("summary", briefSummary.trim());
      }
      fd.append("file", briefFile);
      await caseBriefService.upload(selected.id, fd);
      refreshSelected(await caseService.get(selected.id).then((r) => r.data));
      setBriefSummary("");
      setBriefFile(null);
      setShowBriefUpload(false);
      showToast("Brief uploaded successfully.", "success");
    } catch (err) {
      const d = err?.response?.data;
      if (d?.detail) {
        setBriefUploadErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setBriefUploadErr(msgs || "Failed to upload brief.");
      } else {
        setBriefUploadErr("Failed to upload brief.");
      }
    } finally {
      setBriefUploading(false);
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

  async function handleRequestClose(caseObj) {
    if (!caseObj?.id || caseObj.close_requested) return;
    setRowActionSavingId(caseObj.id);
    setRowActionErr("");
    try {
      const res = await caseService.update(caseObj.id, { close_requested: true });
      setCases((prev) => prev.map((row) => (row.id === caseObj.id ? res.data : row)));
      if (selected?.id === caseObj.id) {
        refreshSelected(res.data);
      }
    } catch (err) {
      const d = err?.response?.data;
      if (d?.detail) {
        setRowActionErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setRowActionErr(msgs || "Failed to request close.");
      } else {
        setRowActionErr("Failed to request close.");
      }
    } finally {
      setRowActionSavingId(null);
    }
  }

  function handleCloseFromRow(caseObj) {
    if (!caseObj?.id || !caseObj.close_requested) return;
    setRowActionErr("");
    openCourtCloseModal(caseObj);
  }

  // ── Filter / search ───────────────────────────────────────────────
  const caseMatchesFilters = (c, { includeStatus = true } = {}) => {
    const matchStatus = !includeStatus || filter === "all" || c.status === filter;
    const matchCriminalType = !activeCriminalTypeFilter || c.criminal_offence_type === activeCriminalTypeFilter;
    const matchPlace =
      !placeOfOffenceFilter ||
      String(c.place_of_offence || "").toLowerCase() === placeOfOffenceFilter.toLowerCase();
    const matchOffence =
      !offenceFilter ||
      String(c.offence || c.offence_name || "").toLowerCase() === offenceFilter.toLowerCase();
    const matchAccusedUnit =
      !accusedUnitFilter ||
      String(c.accused_unit || "") === String(accusedUnitFilter) ||
      (Array.isArray(c.accused_entries) && c.accused_entries.some((entry) => String(entry.unit || "") === String(accusedUnitFilter)));
    const matchAccusedService =
      !accusedServiceFilter ||
      String(c.accused_service || "") === String(accusedServiceFilter) ||
      (Array.isArray(c.accused_entries) && c.accused_entries.some((entry) => String(entry.service || "") === String(accusedServiceFilter)));
    const matchTaskedBattalion =
      !taskedBattalionFilter || String(c.tasked_battalion || "") === String(taskedBattalionFilter);
    const matchTaskedDetachment =
      !taskedDetachmentFilter || String(c.tasked_detachment || "") === String(taskedDetachmentFilter);
    const q = search.trim().toLowerCase();
    const matchSearch = !q || caseSearchText(c).includes(q);
    const matchDateRange = caseMatchesDateRange(c, dateFrom, dateTo);
    return (
      matchStatus &&
      matchSearch &&
      matchCriminalType &&
      matchPlace &&
      matchOffence &&
      matchAccusedUnit &&
      matchAccusedService &&
      matchTaskedBattalion &&
      matchTaskedDetachment &&
      matchDateRange
    );
  };

  const statusCountCases = cases.filter((c) => caseMatchesFilters(c, { includeStatus: false }));
  const filtered = cases.filter((c) => caseMatchesFilters(c));

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = statusCountCases.filter((c) => c.status === s).length;
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
  const isDciFilter = activeCriminalTypeFilter === "dci_civ_police";
  const isAllFilter = filter === "all";
  const isNewFilter = filter === "new" || filter === "open";
  const isTaskedFilter = filter === "tasked";
  const isUnderInvestigationFilter = filter === "under_investigation";
  const showDciUpdateColumns = isDciFilter && isUnderInvestigationFilter;
  const showDciActionColumn = isDciFilter && (isAllFilter || isUnderInvestigationFilter);
  const primaryStatusChips = isDciFilter
    ? PRIMARY_STATUS_CHIPS.filter((s) => s !== "pending" && s !== "served")
    : PRIMARY_STATUS_CHIPS;
  const isPendingFilter = filter === "pending";
  const isServedFilter = filter === "served";
  const isClosedFilter = filter === "closed";
  const canCloseServedCases = isHqsAdmin || isSuperuser;
  const defaultCaseExportColumns = [
    "Case #",
    "Status",
    "Service No",
    "Rank",
    "Accused",
    "Offence",
    "Unit",
    "Place",
    "Assignment",
    "Date of Offence",
    "Created",
    "Tasking Date",
    "Served Date",
    "Closed Date",
    "Description",
  ];
  const dciCaseExportColumns = [
    "Case #",
    "Service No",
    "Rank",
    "Accused",
    "Unit",
    "Offence",
    "Description",
    "Police Station",
    "Battalion/Coy",
    "Update",
    "Status",
  ];
  const caseExportColumns = isDciFilter ? dciCaseExportColumns : defaultCaseExportColumns;

  function caseViewTitle() {
    if (activeCriminalTypeFilter === "court_martial") return "Court Martial Cases";
    if (activeCriminalTypeFilter === "dci_civ_police") return "DCI / Civ Police Cases";
    return "Cases";
  }

  function caseFilterSummary() {
    const statusLabel = filter === "all"
      ? "All statuses"
      : STATUS_CHIP_META[filter]?.label || filter.replace(/_/g, " ");
    const rangeLabel = dateFrom || dateTo
      ? `Date range: ${dateFrom || "Start"} to ${dateTo || "End"}`
      : "Date range: All";
    const searchLabel = search.trim() ? `Search: ${search.trim()}` : "Search: All";
    return `${statusLabel} | ${rangeLabel} | ${searchLabel} | ${filtered.length} case${filtered.length !== 1 ? "s" : ""}`;
  }

  function caseExportRow(caseObj) {
    return {
      "Case #": caseObj.case_number || "",
      Status: STATUS_CHIP_META[caseObj.status]?.label || caseObj.status || "",
      "Service No": caseObj.accused_service_number || "",
      Rank: caseObj.accused_rank || "",
      Accused: caseObj.accused_name || "",
      Offence: caseObj.offence_name || caseObj.offence || "",
      Unit: isDciFilter ? accusedUnitLabel(caseObj) : caseUnitLabel(caseObj),
      Place: caseObj.place_of_offence || "",
      Assignment: caseAssignmentLabel(caseObj),
      "Police Station": caseObj.police_station || "",
      "Battalion/Coy": taskedBattalionCompanyLabel(caseObj),
      Update: formatUpdateFlowDetail(latestCaseUpdateText(caseObj)),
      "Date of Offence": normalizeDateForDisplay(caseObj.date_of_offence),
      Created: formatDateTimeForReport(caseObj.created_at),
      "Tasking Date": formatDateTimeForReport(caseObj.tasking_date),
      "Served Date": formatDateTimeForReport(caseObj.served_at),
      "Closed Date": formatDateTimeForReport(caseObj.closed_at),
      Description: caseObj.description || "",
    };
  }

  function exportFilteredCases() {
    if (!filtered.length) {
      showToast("No cases to export.", "error");
      return;
    }
    const rows = filtered.map(caseExportRow);
    const csv = [
      caseExportColumns.map(csvEscape).join(","),
      ...rows.map((row) => caseExportColumns.map((column) => csvEscape(row[column])).join(",")),
    ].join("\r\n");
    const filename = `${caseViewTitle().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(filename, csv);
  }

  function printFilteredCases() {
    if (!filtered.length) {
      showToast("No cases to print.", "error");
      return;
    }
    const rows = filtered.map(caseExportRow);
    const tableHead = caseExportColumns.map((column) => `<th>${htmlEscape(column)}</th>`).join("");
    const tableBody = rows
      .map((row) => `<tr>${caseExportColumns.map((column) => `<td>${htmlEscape(row[column] || "--")}</td>`).join("")}</tr>`)
      .join("");
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      showToast("Allow pop-ups to print cases.", "error");
      return;
    }
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <title>${htmlEscape(caseViewTitle())}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p { margin: 0 0 16px; color: #4b5563; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; text-align: left; }
    th { background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.04em; }
    td { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${htmlEscape(caseViewTitle())}</h1>
  <p>${htmlEscape(caseFilterSummary())}</p>
  <table>
    <thead><tr>${tableHead}</tr></thead>
    <tbody>${tableBody}</tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
    printWindow.document.close();
  }

  useEffect(() => {
    if (isDciFilter && (filter === "pending" || filter === "served")) {
      setFilter("under_investigation");
    }
  }, [isDciFilter, filter]);

  function toggleDescription(caseId, e) {
    e.stopPropagation();
    setExpandedDesc((prev) => ({ ...prev, [caseId]: !prev[caseId] }));
  }

  function toggleTaskPanel() {
    setShowTeam(false);
    setCreateErr("");
    setShowCreate(false);
    setCaseFormMode("create");
    setTaskModalMode(false);
    const willShow = !showTask;
    if (willShow) {
      setTaskBattalion("");
      setTaskingNo(selected?.tasking_no || "");
      setTaskFile(null);
      setTaskingDate(todayISO);
    }
    setShowTask((prev) => !prev);
    setTaskErr("");
  }

  function toggleTeamPanel() {
    setTaskModalMode(false);
    setShowTask(false);
    setTaskErr("");
    setCreateErr("");
    setShowCreate(false);
    setCaseFormMode("create");
    const willShow = !showTeam;
    if (willShow) {
      setAssignmentMode(selected?.assigned_team ? "team" : "io");
      setTeamId(selected?.assigned_team ? String(selected.assigned_team) : "");
      setIoId(selected?.assigned_to ? String(selected.assigned_to) : "");
      setTeamDeadline(normalizeDateForApi(selected?.investigation_deadline));
    }
    setShowTeam((prev) => !prev);
    setTeamErr("");
  }

  function openCreateModal() {
    setTaskModalMode(false);
    setShowTask(false);
    setTaskErr("");
    setShowTeam(false);
    setTeamErr("");
    setCreateForm(INIT_CREATE);
    setCaseFormMode("create");
    setShowCreate(true);
  }

  function confirmAddAnotherCase() {
    setAddAnotherPrompt(null);
    setCreateErr("");
    setCreateForm(INIT_CREATE);
    setCaseFormMode("create");
    setShowCreate(true);
  }

  function finishAddAnotherCase() {
    setAddAnotherPrompt(null);
    setCreateForm(INIT_CREATE);
    setCaseFormMode("create");
    setShowCreate(false);
  }

  function openEditCaseModal(caseObj) {
    setTaskModalMode(false);
    setShowTask(false);
    setTaskErr("");
    setShowTeam(false);
    setTeamErr("");
    setCreateErr("");
    setCreateForm(caseToForm(caseObj));
    setCaseFormMode("edit");
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
    setTaskingNo(c?.tasking_no || "");
    setTaskFile(null);
    setTaskingDate(todayISO);
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
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`text-white px-4 py-3 rounded-lg shadow-lg border flex items-start gap-3 min-w-[260px] ${toastVariant === "success" ? "bg-green-600 border-green-500/70" : "bg-red-600 border-red-500/70"}`}>
            <div className="flex-1 text-sm font-medium">{toastMessage}</div>
            <button
              type="button"
              onClick={() => setToastMessage("")}
              className="text-white/80 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      )}

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
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {statusCountCases.length} case{statusCountCases.length !== 1 ? "s" : ""}</p>
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
      <div className="rounded-xl border border-gray-700/70 bg-gray-800/40 p-2.5">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
              filter === "all"
                ? "border-blue-500/70 bg-blue-600/20 text-blue-200 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]"
                : "border-gray-600/70 bg-gray-800 text-gray-300 hover:border-gray-500 hover:bg-gray-700/80"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CHIP_META.all.dot}`} />
            <span>{STATUS_CHIP_META.all.label}</span>
            <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[11px] leading-none text-gray-200">
              {statusCountCases.length}
            </span>
          </button>

          {/* Primary flow chips: New -> Under Investigation -> Pending -> Close */}
          {primaryStatusChips.map((s) => {
            const meta = STATUS_CHIP_META[s] || { label: s.replace(/_/g, " "), dot: "bg-gray-400" };
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  filter === s
                    ? "border-blue-500/70 bg-blue-600/20 text-blue-200 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]"
                    : "border-gray-600/70 bg-gray-800 text-gray-300 hover:border-gray-500 hover:bg-gray-700/80"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                <span>{meta.label}</span>
                <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[11px] leading-none text-gray-200">
                  {counts[s] || 0}
                </span>
              </button>
            );
          })}

          {/* Secondary chips only when present */}
          {ALL_STATUSES
            .filter((s) => !primaryStatusChips.includes(s) && counts[s] > 0)
            .filter((s) => !(isDciFilter && (s === "pending" || s === "served")))
            .map((s) => {
              const meta = STATUS_CHIP_META[s] || { label: s.replace(/_/g, " "), dot: "bg-gray-400" };
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                    filter === s
                      ? "border-blue-500/70 bg-blue-600/20 text-blue-200 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]"
                      : "border-gray-600/70 bg-gray-800 text-gray-300 hover:border-gray-500 hover:bg-gray-700/80"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  <span>{meta.label}</span>
                  <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[11px] leading-none text-gray-200">
                    {counts[s]}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Search / actions */}
      <div className="rounded-xl border border-gray-700/70 bg-gray-800/40 p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_160px_160px_auto_auto_auto]">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Search</span>
            <input
              type="text"
              placeholder="Case #, title, offence, accused, description, police station, unit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Accused Unit</span>
            <select
              value={accusedUnitFilter}
              onChange={(e) => setAccusedUnitFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">All units</option>
              {accusedUnitFilter && !units.some((unit) => String(unit.id) === String(accusedUnitFilter)) && (
                <option value={accusedUnitFilter}>Selected unit</option>
              )}
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Date From</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Date To</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setAccusedUnitFilter("");
              setDateFrom("");
              setDateTo("");
            }}
            className="self-end rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={printFilteredCases}
            disabled={loading || !filtered.length}
            className="self-end rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Print
          </button>
          <button
            type="button"
            onClick={exportFilteredCases}
            disabled={loading || !filtered.length}
            className="self-end rounded-lg border border-sky-500/40 bg-sky-600/20 px-3 py-2 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-600/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Main content: list + optional detail panel */}
      <div className="space-y-4">

        {rowActionErr && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300">
            {rowActionErr}
          </div>
        )}

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
            <div className="max-h-[58vh] overflow-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
            <table className={`sticky-head w-full ${isDciFilter ? "min-w-[1760px]" : "min-w-[1380px]"} text-sm`}>
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-4 py-3 font-medium">Case #</th>
                  <th className="text-left px-4 py-3 font-medium">Service No</th>
                  <th className="text-left px-4 py-3 font-medium">Rank</th>
                  <th className="text-left px-4 py-3 font-medium">Accused</th>
                  {isDciFilter && (
                    <th className="text-left px-4 py-3 font-medium">Unit</th>
                  )}
                  <th className="text-left px-4 py-3 font-medium">Offence</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                  {isDciFilter && (
                    <th className="text-left px-4 py-3 font-medium">Police Station</th>
                  )}
                  {isDciFilter && (
                    <th className="text-left px-4 py-3 font-medium">Battalion/Coy</th>
                  )}
                  {isDciFilter && (
                    <th className="text-left px-4 py-3 font-medium">Update</th>
                  )}
                  {isDciFilter && (
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  )}
                  {!isDciFilter && isAllFilter && (
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  )}
                  {!isDciFilter && isNewFilter && (
                    <th className="text-left px-4 py-3 font-medium">Action To Task</th>
                  )}
                  {!isDciFilter && isTaskedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Tasking Letter</th>
                  )}
                  {!isDciFilter && isTaskedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Tasked Battalion/Company</th>
                  )}
                  {!isDciFilter && isUnderInvestigationFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {!isDciFilter && showDciUpdateColumns && (
                    <th className="text-left px-4 py-3 font-medium">Date Updated</th>
                  )}
                  {!isDciFilter && showDciUpdateColumns && (
                    <th className="text-left px-4 py-3 font-medium">Case Updates</th>
                  )}
                  {!isDciFilter && showDciActionColumn && (
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                  )}
                  {!isDciFilter && isPendingFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {!isDciFilter && isPendingFilter && (
                    <th className="text-left px-4 py-3 font-medium">Reason For Pending</th>
                  )}
                  {!isDciFilter && isServedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {!isDciFilter && isServedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Date Served</th>
                  )}
                  {!isDciFilter && isServedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Remarks</th>
                  )}
                  {!isDciFilter && isServedFilter && canCloseServedCases && (
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                  )}
                  {!isDciFilter && isClosedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {!isDciFilter && isClosedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Date Closed</th>
                  )}
                  {!isDciFilter && isClosedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Action Taken</th>
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
                    {isDciFilter && (
                      <td className="px-4 py-2.5 text-gray-300 min-w-[160px] max-w-[240px]">
                        <p className="line-clamp-2 break-words">{accusedUnitLabel(c) || "--"}</p>
                      </td>
                    )}
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
                    {isDciFilter && (
                      <td className="px-4 py-2.5 text-gray-300 min-w-[160px] max-w-[240px]">
                        <p className="line-clamp-2 break-words">{c.police_station || "--"}</p>
                      </td>
                    )}
                    {isDciFilter && (
                      <td className="px-4 py-2.5 text-gray-300 min-w-[180px] max-w-[280px]">
                        <p className="line-clamp-2 break-words">{taskedBattalionCompanyLabel(c) || "--"}</p>
                      </td>
                    )}
                    {isDciFilter && (
                      <td className="px-4 py-2.5 text-gray-300 min-w-[240px] max-w-[340px]">
                        <div className="space-y-1">
                          <p className="line-clamp-3 whitespace-pre-wrap break-words">{formatUpdateFlowDetail(latestCaseUpdateText(c)) || "--"}</p>
                          {latestCaseUpdateDate(c) && (
                            <p className="text-[11px] text-gray-500">{formatDateTimeForReport(latestCaseUpdateDate(c))}</p>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUpdateFlowCase(c);
                            }}
                            className="text-xs text-blue-400 hover:underline"
                          >
                            View update flow
                          </button>
                        </div>
                      </td>
                    )}
                    {isDciFilter && (
                      <td className="px-4 py-2.5">
                        <Badge
                          label={c.status}
                          style={STATUS_STYLE[c.status] || "bg-gray-600 text-gray-300"}
                        />
                      </td>
                    )}
                    {!isDciFilter && isAllFilter && (
                      <td className="px-4 py-2.5">
                        <Badge
                          label={c.status}
                          style={STATUS_STYLE[c.status] || "bg-gray-600 text-gray-300"}
                        />
                      </td>
                    )}
                    {!isDciFilter && isNewFilter && (
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
                    {!isDciFilter && isTaskedFilter && (
                      <td className="px-4 py-2.5">
                        {c.tasking_letter ? (
                          <ProtectedDocumentButton
                            url={c.tasking_letter}
                            label="tasking letter"
                            onError={(message) => showToast(message, "error")}
                            className="text-xs text-blue-400 hover:underline whitespace-nowrap"
                          >
                            View
                          </ProtectedDocumentButton>
                        ) : (
                          <span className="text-gray-500">--</span>
                        )}
                      </td>
                    )}
                    {!isDciFilter && isTaskedFilter && (
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                        {c.tasked_detachment_name
                          ? `${c.tasked_battalion_name || "--"} / ${c.tasked_detachment_name}`
                          : c.tasked_battalion_name || "--"}
                        </td>
                    )}
                    {!isDciFilter && isUnderInvestigationFilter && (
                      <td className="px-4 py-2.5 text-gray-300"><AbstractAttachmentsCell c={c} /></td>
                    )}
                    {!isDciFilter && showDciUpdateColumns && (
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                        {normalizeDateForDisplay(c.mentioning_date) || (c.updated_at ? new Date(c.updated_at).toLocaleDateString("en-GB") : "--")}
                      </td>
                    )}
                    {!isDciFilter && showDciUpdateColumns && (
                      <td className="px-4 py-2.5 text-gray-300 max-w-[280px]">
                        <div className="space-y-1">
                          <p className="line-clamp-2 break-words">{c.action_taken || "--"}</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUpdateFlowCase(c);
                            }}
                            className="text-xs text-blue-400 hover:underline"
                          >
                            View update flow
                          </button>
                        </div>
                      </td>
                    )}
                    {!isDciFilter && showDciActionColumn && (
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {c.status === "under_investigation" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {isInvestigator && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRequestClose(c);
                                }}
                                disabled={rowActionSavingId === c.id || c.close_requested}
                                className="px-2.5 py-1 rounded text-xs font-medium bg-purple-700/80 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                              >
                                {c.close_requested ? "Requested" : rowActionSavingId === c.id ? "Requesting..." : "Request Close"}
                              </button>
                            )}
                            {(isHqsAdmin || isSuperuser) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCloseFromRow(c);
                                }}
                                disabled={rowActionSavingId === c.id || !c.close_requested}
                                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                  c.close_requested
                                    ? "bg-green-700/80 hover:bg-green-600 text-white"
                                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                                }`}
                              >
                                {rowActionSavingId === c.id ? "Closing..." : "Close Case"}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500">--</span>
                        )}
                      </td>
                    )}
                    {!isDciFilter && isPendingFilter && (
                      <td className="px-4 py-2.5 text-gray-300"><AbstractAttachmentsCell c={c} /></td>
                    )}
                    {!isDciFilter && isPendingFilter && (
                      <td className="px-4 py-2.5 text-gray-300">{c.reason_for_pending || c.action_taken || c.remarks || "--"}</td>
                    )}
                    {!isDciFilter && isServedFilter && (
                      <td className="px-4 py-2.5 text-gray-300"><AbstractAttachmentsCell c={c} /></td>
                    )}
                    {!isDciFilter && isServedFilter && (
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                        {c.served_at ? new Date(c.served_at).toLocaleDateString("en-GB") : "--"}
                      </td>
                    )}
                    {!isDciFilter && isServedFilter && (
                      <td className="px-4 py-2.5 text-gray-300">{c.remarks || "--"}</td>
                    )}
                    {!isDciFilter && isServedFilter && canCloseServedCases && (
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCourtCloseModal(c);
                          }}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-green-700/80 hover:bg-green-600 text-white transition-colors"
                        >
                          Close Case
                        </button>
                      </td>
                    )}
                    {!isDciFilter && isClosedFilter && (
                      <td className="px-4 py-2.5 text-gray-300"><AbstractAttachmentsCell c={c} /></td>
                    )}
                    {!isDciFilter && isClosedFilter && (
                      <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                        {c.closed_at
                          ? new Date(c.closed_at).toLocaleDateString("en-GB")
                          : c.updated_at
                          ? new Date(c.updated_at).toLocaleDateString("en-GB")
                          : "--"}
                      </td>
                    )}
                    {!isDciFilter && isClosedFilter && (
                      <td className="px-4 py-2.5 text-gray-300 min-w-[220px] max-w-[340px]">
                        <p className="line-clamp-3 whitespace-pre-wrap break-words">{c.action_taken || "--"}</p>
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

            {canManageCases && (
              <div className="flex flex-wrap gap-2 border-y border-gray-700 py-3">
                <button
                  type="button"
                  onClick={() => openEditCaseModal(selected)}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white"
                >
                  Edit Case
                </button>
                <button
                  type="button"
                  onClick={() => setCaseDeleteTarget(selected)}
                  disabled={rowActionSavingId === selected.id}
                  className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 text-xs font-medium text-white"
                >
                  Delete Case
                </button>
              </div>
            )}

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Offence" value={selected.offence} />
              <Field label="Date of Offence" value={selected.date_of_offence} />
              <Field label="Place of Offence" value={selected.place_of_offence} />
              <Field
                label="Created"
                value={selected.created_at ? new Date(selected.created_at).toLocaleDateString("en-GB") : null}
              />
              <Field label="Created By" value={selected.created_by_name} />
            </div>

            {/* Accused */}
            {selected.accused_entries?.length > 0 ? (
              <div>
                <SectionLabel>Accused entries</SectionLabel>
                <div className="space-y-3 bg-gray-700/30 rounded-lg p-3">
                  {selected.accused_entries.map((entry, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-600 bg-gray-800 p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Name" value={entry.name} />
                        <Field label="Rank" value={entry.rank} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <Field label="Service #" value={entry.service_number} />
                        <Field label="Service" value={entry.service} />
                      </div>
                      <Field label="Unit" value={entry.unit_name} />
                    </div>
                  ))}
                  <Field label="Submitting Unit" value={selected.submitting_unit_name} />
                </div>
              </div>
            ) : (selected.accused_name || selected.accused_rank || selected.accused_service_number) && (
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
                  <Field label="Tasking No" value={selected.tasking_no} />
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
                      <ProtectedDocumentButton
                        url={selected.tasking_letter}
                        label="tasking letter"
                        onError={(message) => showToast(message, "error")}
                        className="text-sm text-blue-400 hover:underline"
                      >
                        View Document
                      </ProtectedDocumentButton>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RFI */}
            {(selected.rfi_no || selected.rfi_date || selected.rfi_document) && (
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
                      {item.detail && <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap break-words">{formatUpdateFlowDetail(item.detail)}</p>}
                      <ReferenceActions url={item.reference_pdf_url} name={item.reference_pdf_name} />
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
                      <label className="text-xs text-gray-400 block mb-1">Tasking No *</label>
                      <input
                        type="text"
                        value={taskingNo}
                        onChange={(e) => { setTaskingNo(e.target.value); if (taskErr) setTaskErr(""); }}
                        placeholder="Enter tasking number"
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Tasking Date *</label>
                      <input
                        type="date"
                        value={taskingDate}
                        onChange={(e) => setTaskingDate(e.target.value)}
                        min={todayISO}
                        max={todayISO}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">Time is auto-captured when tasking is submitted.</p>
                    </div>

                    <ScannableFileInput
                      label="Tasking Letter *"
                      file={taskFile}
                      onFileChange={(file) => { setTaskFile(file); if (taskErr) setTaskErr(""); }}
                      onScanError={setTaskErr}
                      documentType="tasking-letter"
                      disabled={taskSaving}
                    />
                    <ErrMsg msg={taskErr} />
                    <button
                      type="submit"
                      disabled={taskSaving || !taskingNo.trim() || !taskFile}
                      className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {taskSaving ? "Tasking…" : "Submit Tasking"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Battalion Admin/CO: Assign IO or Team */}
            {canAssignTeam && selected.status === "tasked" && (
              <div className="border-t border-gray-700 pt-4 space-y-3">
                <button
                  onClick={toggleTeamPanel}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {showTeam ? "Cancel" : "Assign IO / Team"}
                </button>
                {showTeam && (
                  <form onSubmit={handleAssignTeam} className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-800 p-1 border border-gray-700">
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
                    <div>
                      {assignmentMode === "io" ? (
                        <>
                          <label className="text-xs text-gray-400 block mb-1">Investigating Officer *</label>
                          <select
                            value={ioId}
                            onChange={(e) => setIoId(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                          >
                            <option value="">Select IO...</option>
                            {sortedInvestigators.map((io) => (
                              <option key={io.id} value={io.id}>
                                {userLabelWithWorkload(io, workloadMap)}
                              </option>
                            ))}
                          </select>
                          {investigators.length === 0 && (
                            <p className="text-xs text-orange-400 mt-2">No investigators found in this scope.</p>
                          )}
                        </>
                      ) : (
                        <>
                      <label className="text-xs text-gray-400 block mb-1">Investigation Team *</label>
                      <select
                        value={teamId}
                        onChange={(e) => setTeamId(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      >
                        <option value="">Select team...</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                          {teams.length === 0 && (
                            <p className="text-xs text-orange-400 mt-2">No investigation teams found in this scope.</p>
                          )}
                        </>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Investigation Deadline *</label>
                      <input
                        type="date"
                        value={teamDeadline}
                        onChange={(e) => setTeamDeadline(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      />
                    </div>
                    <ErrMsg msg={teamErr} />
                    <button
                      type="submit"
                      disabled={teamSaving || !teamDeadline || (assignmentMode === "io" ? !ioId : !teamId)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {teamSaving ? "Assigning..." : "Assign Case"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {selected.status !== "closed" && (selected.status === "under_investigation" || selected.status === "pending" || selected.assigned_team_name || selected.assigned_to_name) && (
              <div className="border-t border-gray-700 pt-4 space-y-3">
                <p className="text-sm text-gray-300">Investigation actions</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleDocumentUpload}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-medium"
                  >
                    {showDocumentUpload ? "Cancel Document Upload" : "Upload Document"}
                  </button>
                  {!selected.brief ? (
                    <button
                      type="button"
                      onClick={toggleBriefUpload}
                      className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-medium"
                    >
                      {showBriefUpload ? "Cancel Brief Upload" : "Upload Brief"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={toggleForwardForm}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium"
                    >
                      {showForwardForm ? "Cancel Forward" : "Brief uploaded - Forward"}
                    </button>
                  )}
                </div>
                {showDocumentUpload && (
                  <form onSubmit={handleDocumentUpload} className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Document Label</label>
                      <input
                        type="text"
                        value={docLabel}
                        onChange={(e) => setDocLabel(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                        placeholder="e.g. Evidence Document"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">File</label>
                      <input
                        type="file"
                        onChange={(e) => setDocFile(e.target.files[0] || null)}
                        className="w-full text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-slate-600 file:text-white"
                      />
                    </div>
                    <ErrMsg msg={docUploadErr} />
                    <button
                      type="submit"
                      disabled={docUploading || !docFile || !docLabel.trim()}
                      className="w-full py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {docUploading ? "Uploading…" : "Upload Document"}
                    </button>
                  </form>
                )}
                {showBriefUpload && !selected.brief && (
                  <form onSubmit={handleBriefUpload} className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Brief Summary</label>
                      <textarea
                        value={briefSummary}
                        onChange={(e) => setBriefSummary(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                        rows={3}
                        placeholder="Brief summary or notes (optional)"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Brief File</label>
                      <input
                        type="file"
                        onChange={(e) => setBriefFile(e.target.files[0] || null)}
                        className="w-full text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-violet-600 file:text-white"
                      />
                    </div>
                    <ErrMsg msg={briefUploadErr} />
                    <button
                      type="submit"
                      disabled={briefUploading || !briefFile}
                      className="w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {briefUploading ? "Uploading…" : "Upload Brief"}
                    </button>
                  </form>
                )}
                {selected.brief && (
                  <div className="bg-emerald-600/10 border border-emerald-500/30 rounded-lg p-4 text-sm text-emerald-200">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">Brief uploaded</p>
                        <p className="text-gray-300 text-xs mt-1">
                          A brief has already been attached. Forward it to HOD or Adjutant instead of uploading another one.
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] text-emerald-100">
                        {selected.brief.status === "forwarded" ? "Forwarded" : "Uploaded"}
                      </span>
                    </div>
                    {selected.brief.forwarded_to_role && (
                      <p className="text-gray-300 text-xs mt-2">
                        Forwarded to: <span className="text-white">{selected.brief.forwarded_to_role.toUpperCase()}</span>
                      </p>
                    )}
                  </div>
                )}
                {showForwardForm && selected.brief && (
                  <form onSubmit={handleForwardBrief} className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Forward brief to</label>
                      <select
                        value={forwardRole}
                        onChange={(e) => setForwardRole(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      >
                        <option value="">Select role…</option>
                        {briefForwardOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {briefForwardOptions.length === 0 && (
                        <p className="mt-2 text-xs text-gray-400">No forwarding action is available for your role at this stage.</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Note (optional)</label>
                      <textarea
                        value={forwardNote}
                        onChange={(e) => setForwardNote(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                        rows={3}
                        placeholder="Optional forwarding note"
                      />
                    </div>
                    <ErrMsg msg={forwardErr} />
                    <button
                      type="submit"
                      disabled={forwarding || !forwardRole || briefForwardOptions.length === 0}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {forwarding ? "Forwarding…" : "Forward Brief"}
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
                  {selected.status === "under_investigation" && !selectedIsDci && (
                    <button
                      onClick={() => handleStatus("pending")}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Mark Pending
                    </button>
                  )}
                  {selected.status === "pending" && !selectedIsDci && (
                    <button
                      onClick={() => handleStatus("under_investigation")}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Resume Investigation
                    </button>
                  )}
                  {["under_investigation", "pending"].includes(selected.status) && !selectedIsDci && (
                    <button
                      onClick={() => handleStatus("served")}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Mark Served
                    </button>
                  )}
                  {selected.status === "under_investigation" && selectedIsDci && isInvestigator && (
                    <button
                      onClick={() => handleRequestClose(selected)}
                      disabled={statusSaving || rowActionSavingId === selected.id || selected.close_requested}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      {selected.close_requested ? "Close Requested" : "Request Close"}
                    </button>
                  )}
                  {selected.status === "under_investigation" && selectedIsDci && (isHqsAdmin || isSuperuser) && (
                    <button
                      onClick={() => openCourtCloseModal(selected)}
                      disabled={statusSaving || !selected.close_requested}
                      className={`px-3 py-1.5 rounded text-xs font-medium ${
                        selected.close_requested
                          ? "bg-green-700 hover:bg-green-800 text-white"
                          : "bg-gray-700 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      Close Case
                    </button>
                  )}
                  {selected.status === "served" && (isHqsAdmin || isSuperuser) && (
                    <button
                      onClick={() => openCourtCloseModal(selected)}
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
      {showCourtCloseModal && activeCloseCase && (
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
              onClick={closeCourtCloseModal}
              disabled={courtCloseSaving}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors disabled:opacity-40"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-semibold text-white">
              {activeCloseCaseIsCourtMartial ? "Close Court Martial Case" : activeCloseCaseIsDci ? "Close DCI / Civ Police Case" : "Close Case"}
            </h3>
            <p className="text-xs text-gray-400">
              Attach one or more <span className="font-semibold text-gray-300">Judgment PDF</span> files with labels before closing this case.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Action Taken *</label>
                  <textarea
                    value={closeActionTaken}
                    onChange={(e) => setCloseActionTaken(e.target.value)}
                    disabled={courtCloseSaving}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                    rows={4}
                    placeholder="Describe the action taken in closing this case"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Chargesheet / Report</label>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => setCloseChargesheetFile(e.target.files?.[0] || null)}
                      disabled={courtCloseSaving}
                      className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-700 disabled:opacity-50"
                    />
                    {closeChargesheetFile && (
                      <p className="mt-2 text-xs text-gray-300">Selected: {closeChargesheetFile.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Part One Orders</label>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => setClosePartOneOrdersFile(e.target.files?.[0] || null)}
                      disabled={courtCloseSaving}
                      className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-700 disabled:opacity-50"
                    />
                    {closePartOneOrdersFile && (
                      <p className="mt-2 text-xs text-gray-300">Selected: {closePartOneOrdersFile.name}</p>
                    )}
                  </div>
                </div>
                {!activeCloseCase?.rfi_document && (

                  <div>
                    <ScannableFileInput
                      label="RFI Document *"
                      file={closeRfiFile}
                      onFileChange={(file) => setCloseRfiFile(file)}
                      onScanError={setCourtCloseErr}
                      documentType="rfi-document"
                      disabled={courtCloseSaving}
                    />
                    <p className="text-[11px] text-gray-500 mt-1">RFI upload is required unless an RFI document already exists for this case.</p>
                  </div>
                )}
              </div>
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
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleJudgmentFileChange(row.id, e.target.files?.[0] || null)}
                      disabled={courtCloseSaving}
                      className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-700 disabled:opacity-50"
                    />
                    <div
                      className={`mt-2 truncate rounded border px-3 py-2 text-xs ${
                        row.file
                          ? "border-green-500/40 bg-green-500/10 text-green-300"
                          : "border-gray-600 bg-gray-700/60 text-gray-400"
                      }`}
                    >
                      {row.file?.name || "No PDF selected"}
                    </div>
                    {row.file && (
                      <button
                        type="button"
                        onClick={() => handleJudgmentFileChange(row.id, null)}
                        disabled={courtCloseSaving}
                        className="mt-2 text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
                      >
                        Clear selected PDF
                      </button>
                    )}
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
                  onClick={closeCourtCloseModal}
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
            <label className="text-xs text-gray-400 block mb-1">Tasking No *</label>
            <input
              type="text"
              value={taskingNo}
              onChange={(e) => { setTaskingNo(e.target.value); if (taskErr) setTaskErr(""); }}
              placeholder="Enter tasking number"
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Tasking Date *</label>
            <input
                  type="date"
                  value={taskingDate}
                  onChange={(e) => setTaskingDate(e.target.value)}
                  min={todayISO}
                  max={todayISO}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                />
                <p className="text-[11px] text-gray-500 mt-1">Time is auto-captured when tasking is submitted.</p>
              </div>

              <ScannableFileInput
                label="Tasking Letter *"
                file={taskFile}
                onFileChange={(file) => { setTaskFile(file); if (taskErr) setTaskErr(""); }}
                onScanError={setTaskErr}
                documentType="tasking-letter"
                disabled={taskSaving}
              />
              <ErrMsg msg={taskErr} />
            <button
              type="submit"
              disabled={taskSaving || !taskingNo.trim() || !taskFile}
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
          onClick={closeCaseForm}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl p-6 space-y-4 relative text-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeCaseForm}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-lg font-semibold text-slate-950">
              {caseFormMode === "edit" ? `Edit ${selected?.case_number || "Case"}` : "New Case"}
            </h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">

                <div className="col-span-2">
                  <CaseFormLabel>Offence *</CaseFormLabel>
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
                      required={caseFormMode === "create"}
                      className={CASE_FORM_CONTROL}
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
                      required={caseFormMode === "create"}
                      className={CASE_FORM_CONTROL}
                    />
                  )}
                </div>

                <div>
                  <CaseFormLabel>Offence Type *</CaseFormLabel>
                  <select
                    value={createForm.offence_type}
                    onChange={(e) => setCreateForm((f) => ({ ...f, offence_type: e.target.value }))}
                    required={caseFormMode === "create"}
                    className={CASE_FORM_CONTROL}
                  >
                    <option value="">Select…</option>
                    <option value="service_offence">Service Offence</option>
                    <option value="criminal_offence">Criminal Offence</option>
                  </select>
                </div>

                {createForm.offence_type === "service_offence" && (
                  <div>
                    <CaseFormLabel>Severity *</CaseFormLabel>
                    <select
                      value={createForm.service_offence_severity}
                      onChange={(e) => setCreateForm((f) => ({ ...f, service_offence_severity: e.target.value }))}
                      required={caseFormMode === "create"}
                      className={CASE_FORM_CONTROL}
                    >
                      <option value="">Select…</option>
                      <option value="serious">Serious</option>
                      <option value="minor">Minor</option>
                    </select>
                  </div>
                )}

                {createForm.offence_type === "criminal_offence" && (
                  <div>
                    <CaseFormLabel>Criminal Offence Type *</CaseFormLabel>
                    <select
                      value={createForm.criminal_offence_type}
                      onChange={(e) => setCreateForm((f) => ({ ...f, criminal_offence_type: e.target.value }))}
                      required={caseFormMode === "create"}
                      className={CASE_FORM_CONTROL}
                    >
                      <option value="">Select…</option>
                      <option value="dci_civ_police">DCI / Civ Police</option>
                      <option value="court_martial">Court Martial</option>
                    </select>
                  </div>
                )}

                <div className="col-span-2">
                  <CaseFormSectionLabel>Accused entries (optional)</CaseFormSectionLabel>
                  <div className="space-y-3">
                    {createForm.accused_entries.map((accused, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-300 bg-slate-100 p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <p className="text-sm font-semibold text-slate-950">Accused #{idx + 1}</p>
                          {createForm.accused_entries.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setCreateForm((f) => ({
                                ...f,
                                accused_entries: f.accused_entries.filter((_, index) => index !== idx),
                              }))}
                              className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <CaseFormLabel>Name</CaseFormLabel>
                            <input
                              type="text"
                              value={accused.name}
                              onChange={(e) => setCreateForm((f) => ({
                                ...f,
                                accused_entries: f.accused_entries.map((entry, index) =>
                                  index === idx ? { ...entry, name: e.target.value } : entry
                                ),
                              }))}
                              className={CASE_FORM_CONTROL}
                            />
                          </div>
                          <div>
                            <CaseFormLabel>Rank</CaseFormLabel>
                            <select
                              value={accused.rank}
                              onChange={(e) => setCreateForm((f) => ({
                                ...f,
                                accused_entries: f.accused_entries.map((entry, index) =>
                                  index === idx ? { ...entry, rank: e.target.value } : entry
                                ),
                              }))}
                              className={CASE_FORM_CONTROL}
                            >
                              <option value="">Select rank...</option>
                              {ALL_RANKS.map((rank) => (
                                <option key={rank} value={rank}>{rank}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <CaseFormLabel>Service #</CaseFormLabel>
                            <input
                              type="text"
                              value={accused.service_number}
                              onChange={(e) => setCreateForm((f) => ({
                                ...f,
                                accused_entries: f.accused_entries.map((entry, index) =>
                                  index === idx ? { ...entry, service_number: e.target.value } : entry
                                ),
                              }))}
                              className={CASE_FORM_CONTROL}
                            />
                          </div>
                          <div>
                            <CaseFormLabel>Service</CaseFormLabel>
                            <select
                              value={accused.service}
                              onChange={(e) => setCreateForm((f) => ({
                                ...f,
                                accused_entries: f.accused_entries.map((entry, index) =>
                                  index === idx ? { ...entry, service: e.target.value, unit: "" } : entry
                                ),
                              }))}
                              className={CASE_FORM_CONTROL}
                            >
                              <option value="">Select…</option>
                              <option value="KA">KA</option>
                              <option value="KAF">KAF</option>
                              <option value="KN">KN</option>
                            </select>
                          </div>
                        </div>

                        <UnitAutocomplete
                          label="Unit"
                          units={units}
                          value={accused.unit}
                          serviceFilter={accused.service}
                          onChange={(value) => setCreateForm((f) => ({
                            ...f,
                            accused_entries: f.accused_entries.map((entry, index) =>
                              index === idx ? { ...entry, unit: value } : entry
                            ),
                          }))}
                          placeholder="Type unit name, code, service, or location..."
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCreateForm((f) => ({
                        ...f,
                        accused_entries: [...(f.accused_entries || []), INIT_ACCUSED_ENTRY],
                      }))}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    >
                      Add another accused
                    </button>
                    <p className="text-xs text-slate-500">Leave accused fields blank if the accused is not yet identified. The accused can be added later from Edit Case once identified.</p>
                  </div>
                </div>


                <UnitAutocomplete
                  label="Submitting Unit *"
                  units={units}
                  value={createForm.submitting_unit}
                  onChange={(value) => setCreateForm((f) => ({ ...f, submitting_unit: value }))}
                  placeholder="Type submitting unit..."
                />

                <div>
                  <CaseFormLabel>Date of Offence *</CaseFormLabel>
                  <input
                    type="date"
                    value={createForm.date_of_offence}
                    onChange={(e) => setCreateForm((f) => ({ ...f, date_of_offence: e.target.value }))}
                    required={caseFormMode === "create"}
                    className={CASE_FORM_CONTROL}
                  />
                </div>

                <div className="col-span-2">
                  <CaseFormLabel>Place of Offence *</CaseFormLabel>
                  <input
                    type="text"
                    value={createForm.place_of_offence}
                    onChange={(e) => setCreateForm((f) => ({ ...f, place_of_offence: e.target.value }))}
                    placeholder="e.g. Embakasi, Kahawa, barracks, office, road, or scene"
                    required={caseFormMode === "create"}
                    className={CASE_FORM_CONTROL}
                  />
                </div>

                <div className="col-span-2">
                  <CaseFormLabel>Description *</CaseFormLabel>
                  <textarea
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    required={caseFormMode === "create"}
                    className={`${CASE_FORM_CONTROL} resize-none`}
                  />
                </div>

                <div>
                  <CaseFormLabel>RFI No{createForm.rfi_document ? " *" : ""}</CaseFormLabel>
                  <input
                    type="text"
                    value={createForm.rfi_no}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rfi_no: e.target.value }))}
                    placeholder="Enter RFI number"
                    required={caseFormMode === "create" && Boolean(createForm.rfi_document)}
                    className={CASE_FORM_CONTROL}
                  />
                </div>

                <div>
                  <CaseFormLabel>RFI Date{createForm.rfi_document ? " *" : ""}</CaseFormLabel>
                  <input
                    type="date"
                    value={createForm.rfi_date}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rfi_date: e.target.value }))}
                    required={caseFormMode === "create" && Boolean(createForm.rfi_document)}
                    className={CASE_FORM_CONTROL}
                  />
                </div>

                <div className="col-span-2">
                  <CaseFormLabel>Tasking No</CaseFormLabel>
                  <input
                    type="text"
                    value={createForm.tasking_no}
                    onChange={(e) => setCreateForm((f) => ({ ...f, tasking_no: e.target.value }))}
                    placeholder="Optional until the case is tasked"
                    className={CASE_FORM_CONTROL}
                  />
                </div>

                <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <ScannableFileInput
                    key={createForm.rfi_document ? `rfi-${createForm.rfi_document.name}-${createForm.rfi_document.lastModified}` : "rfi-empty"}
                    label="RFI Attachment"
                    file={createForm.rfi_document}
                    onFileChange={(file) => setCreateForm((f) => ({ ...f, rfi_document: file }))}
                    onScanError={setCreateErr}
                    accept="application/pdf,.pdf,image/*"
                    documentType="rfi-attachment"
                    disabled={createSaving}
                    variant="light"
                    helperText="Optional during case creation. Upload RFI before closing the case."
                    clearLabel="Clear selected RFI"
                  />
                </div>

              </div>

              <ErrMsg msg={createErr} />

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={closeCaseForm}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {createSaving
                    ? (caseFormMode === "edit" ? "Saving..." : "Creating...")
                    : (caseFormMode === "edit" ? "Save Changes" : "Create Case")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {caseDeleteTarget && (
        <ConfirmCaseDelete
          caseObj={caseDeleteTarget}
          saving={rowActionSavingId === caseDeleteTarget.id}
          onCancel={() => setCaseDeleteTarget(null)}
          onConfirm={handleDeleteCase}
        />
      )}

      {addAnotherPrompt && (
        <AddAnotherModal
          {...addAnotherPrompt}
          onAddAnother={confirmAddAnotherCase}
          onDone={finishAddAnotherCase}
        />
      )}

      {updateFlowCase && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setUpdateFlowCase(null)}
        >
          <div
            className="w-full max-w-2xl bg-gray-800 rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Case Update Flow</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Case: <span className="font-mono text-gray-300">{updateFlowCase.case_number || "--"}</span>
                </p>
              </div>
              <button
                onClick={() => setUpdateFlowCase(null)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="rounded-lg border border-gray-700 bg-gray-700/20 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Most Recent Update</p>
              <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{updateFlowCase.action_taken || "No updates yet."}</p>
              <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-gray-500">Date updated: {normalizeDateForDisplay(updateFlowCase.mentioning_date) || "--"}</p>
                {updateFlow[updateFlow.length - 1]?.actor_name && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium">
                      Updated by: {formatActorLine(updateFlow[updateFlow.length - 1])}
                    </span>
                )}
              </div>
              <ReferenceActions url={updateFlow[updateFlow.length - 1]?.reference_pdf_url} name={updateFlow[updateFlow.length - 1]?.reference_pdf_name} />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Flow of Updates</p>
              {updateFlowLoading ? (
                <p className="text-sm text-gray-500">Loading update flow...</p>
              ) : updateFlowErr ? (
                <ErrMsg msg={updateFlowErr} />
              ) : updateFlow.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-700/30 rounded-lg p-3">No update history recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {updateFlow.map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-700 bg-gray-700/25 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-blue-400">{ActionLabel({ action: item.action })}</p>
                        <p className="text-[11px] text-gray-500 whitespace-nowrap">
                          {item.created_at ? new Date(item.created_at).toLocaleString("en-GB") : "--"}
                        </p>
                      </div>
                      <div className="mt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium">
                          Updated by: {formatActorLine(item)}
                        </span>
                      </div>
                      {item.detail && <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap break-words">{formatUpdateFlowDetail(item.detail)}</p>}
                      <ReferenceActions url={item.reference_pdf_url} name={item.reference_pdf_name} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
