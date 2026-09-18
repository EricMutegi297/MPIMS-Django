import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { caseService, caseBriefService, formationService, offenceService, teamService, attachmentService, userService, incidentService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";
import useDebouncedValue from "../hooks/useDebouncedValue";
import ActionModal from "./common/ActionModal";
import PaginationControls from "./common/PaginationControls";
import { openProtectedFile } from "../utils/protectedFiles";
import { caseDisplayDescription, isRoadTrafficAccidentCase, RTA_CASE_TYPE } from "../utils/caseTypes";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function resultCount(data) {
  if (typeof data?.count === "number") return data.count;
  return toArray(data).length;
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
    caseObj?.source_incident_unit,
  ].filter(Boolean);
  return [...new Set(units)].join("; ") || caseObj?.submitting_unit_name || "";
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
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  if (normalized) return normalized;
  if (!value) return "";
  return String(value);
}

function parseDisplayDateForApi(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return normalizeDateForApi(text);
}

function isApiDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function formatDateTimeForReport(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeDateForDisplay(value);
  return date.toLocaleString("en-GB");
}

function caseUnitLabel(caseObj) {
  const accusedEntryUnits = toArray(caseObj?.accused_entries)
    .map((entry) => entry?.unit_name || entry?.unit)
    .filter(Boolean);
  const taskedTo = [caseObj?.tasked_battalion_name, caseObj?.tasked_detachment_name].filter(Boolean).join(" / ");
  return [
    caseObj?.accused_unit_name,
    ...accusedEntryUnits,
    caseObj?.source_incident_unit,
    caseObj?.submitting_unit_name,
    taskedTo,
    caseObj?.assigned_team_name,
    caseObj?.assigned_to_name,
  ].filter(Boolean).join("; ");
}

function rtaSourceVehicles(caseObj) {
  return toArray(caseObj?.source_incident_rta_vehicles).map(cleanRtaVehicle);
}

function rtaFirstServiceDriver(caseObj) {
  return rtaSourceVehicles(caseObj).find((vehicle) =>
    vehicle.driver_person_type === "service"
    && (vehicle.driver_identifier || vehicle.driver_rank || vehicle.driver_name || vehicle.driver_unit)
  );
}

function descriptionSection(text, label) {
  const raw = String(text || "");
  if (!raw) return "";
  const marker = raw.toLowerCase().indexOf(label.toLowerCase());
  if (marker < 0) return "";
  const afterMarker = raw.slice(marker + label.length).replace(/^[:\s]+/, "");
  const nextSection = afterMarker.search(/\n{2,}[A-Z][^:\n]{2,80}:\s*/);
  return (nextSection >= 0 ? afterMarker.slice(0, nextSection) : afterMarker).trim();
}

function rtaCaseServiceNumber(caseObj) {
  return rtaFirstServiceDriver(caseObj)?.driver_identifier || caseObj?.accused_service_number || "";
}

function rtaCaseRank(caseObj) {
  return rtaFirstServiceDriver(caseObj)?.driver_rank || caseObj?.accused_rank || "";
}

function rtaCaseAccused(caseObj) {
  return rtaFirstServiceDriver(caseObj)?.driver_name || caseObj?.accused_name || "";
}

function rtaCaseUnit(caseObj) {
  return (
    caseObj?.source_incident_unit
    || rtaFirstServiceDriver(caseObj)?.driver_unit
    || accusedUnitLabel(caseObj)
    || caseObj?.submitting_unit_name
    || ""
  );
}

function rtaCaseOffence(caseObj) {
  return roadTrafficLabelFromText(
    caseObj?.source_incident_type
    || caseObj?.offence_name
    || caseObj?.offence
    || caseObj?.title
    || ""
  );
}

function rtaCasePlace(caseObj) {
  return caseObj?.source_incident_place || caseObj?.place_of_offence || "";
}

function rtaCaseTime(caseObj) {
  return caseObj?.source_incident_time || "";
}

function rtaCaseHistory(caseObj) {
  return (
    caseObj?.source_incident_history
    || descriptionSection(caseObj?.description, "History of the accident")
    || caseObj?.description
    || ""
  );
}

function rtaCaseHowOccurred(caseObj) {
  return caseObj?.source_incident_how_occurred || descriptionSection(caseObj?.description, "How the accident occurred") || "";
}

function rtaCaseOriginatingUnit(caseObj) {
  return caseObj?.source_incident_originating_unit || caseObj?.tasked_detachment_name || "";
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

const CRIMINAL_CASE_TYPE_LABELS = {
  court_martial: "Court Martial",
  dci_civ_police: "DCI / Civ Police",
};

const CRIMINAL_ASSIGNMENT_TYPES = Object.keys(CRIMINAL_CASE_TYPE_LABELS);

const COURT_MILESTONE_TYPES = [
  { value: "mentioning", label: "Mentioning" },
  { value: "hearing", label: "Hearing" },
  { value: "defence", label: "Defence" },
  { value: "ruling", label: "Ruling" },
  { value: "judgment", label: "Judgment" },
];

const CLOSURE_BASIS_OPTIONS = [
  { value: "part_ii_orders", label: "Part II Orders" },
  { value: "cancellation_letter", label: "Cancellation Letter" },
  { value: "service_hqs_authority", label: "Authority From Service HQs" },
];

const RTA_DAMAGE_AUTHORITY_SOURCES = [
  { value: "hq_ka_moves", label: "HQ KA Moves" },
  { value: "legal", label: "Legal" },
];

const CASE_SOURCE_RFI = "rfi";
const CASE_SOURCE_INCIDENT = "incident";
const CASE_SOURCE_RTA = "road_traffic_accident";

const CASE_SOURCE_OPTIONS = [
  {
    value: CASE_SOURCE_RFI,
    label: "RFI Case",
    summary: "Create a case from an RFI reference and attachment.",
  },
  {
    value: CASE_SOURCE_INCIDENT,
    label: "Incident",
    summary: "Capture incident details directly at Admin HQ.",
  },
  {
    value: CASE_SOURCE_RTA,
    label: "Road Traffic Accident",
    summary: "Capture RTA vehicles, drivers, casualties, and accident history.",
  },
];

const ROAD_TRAFFIC_TYPES = [
  ["injury", "Injury Road Traffic Accident"],
  ["non_injury", "Non-Injury Road Traffic Accident"],
  ["self_involved", "Self Involved Road Traffic Accident"],
  ["fatal", "Fatal Road Traffic Accident"],
  ["hit_and_run", "Hit and Run Road Traffic Accident"],
];

const INJURY_SEVERITIES = [
  ["minor", "Minor"],
  ["serious", "Serious"],
  ["critical", "Critical"],
];
const DRIVER_SERVICES = [
  ["KA", "Kenya Army (KA)"],
  ["KAF", "Kenya Air Force (KAF)"],
  ["KN", "Kenya Navy (KN)"],
];
const RTA_VEHICLE_OWNERS = [
  ["service", "Official Service Vehicle"],
  ["service_member_personal", "Service Member Personal Vehicle"],
  ["civilian", "Civilian Vehicle"],
];
const RTA_VEHICLE_BODY_TYPES = [
  ["motor_vehicle", "Motor Vehicle"],
  ["motorcycle", "Motorcycle"],
  ["truck", "Truck"],
  ["bus", "Bus"],
  ["other", "Other"],
];

function closureBasisLabel(value) {
  return CLOSURE_BASIS_OPTIONS.find((option) => option.value === value)?.label || "";
}

function closureDocumentLabel(value) {
  if (value === "part_ii_orders") return "Part II Orders PDF";
  if (value === "cancellation_letter") return "Cancellation Letter PDF";
  if (value === "service_hqs_authority") return "Authority From Service HQs PDF";
  return "Closure PDF";
}

function rtaDamageAuthorityLabel(value) {
  return RTA_DAMAGE_AUTHORITY_SOURCES.find((option) => option.value === value)?.label || "";
}

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

function pad2(value) {
  return String(value).padStart(2, "0");
}

function localDateApi(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function localTimeValue(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function localDateDisplay(date = new Date()) {
  return normalizeDateForDisplay(localDateApi(date));
}

function caseSourceLabel(value) {
  return CASE_SOURCE_OPTIONS.find((option) => option.value === value)?.label || "Case";
}

function roadTrafficTypeLabel(value) {
  return ROAD_TRAFFIC_TYPES.find(([type]) => type === value)?.[1] || "";
}

function driverServiceLabel(value) {
  return DRIVER_SERVICES.find(([service]) => service === value)?.[1] || value || "";
}

function roadTrafficLabelFromText(value) {
  const text = String(value || "").toLowerCase().replace(/[-_]+/g, " ");
  if (!text) return "";
  if (text.includes("non injury") || text.includes("noninjury")) return roadTrafficTypeLabel("non_injury");
  if (text.includes("self involved")) return roadTrafficTypeLabel("self_involved");
  if (text.includes("hit and run") || text.includes("hit run")) return roadTrafficTypeLabel("hit_and_run");
  if (text.includes("fatal")) return roadTrafficTypeLabel("fatal");
  if (text.includes("injury")) return roadTrafficTypeLabel("injury");
  return value;
}

function detachmentOptionLabel(detachment) {
  const name = String(detachment?.name || "").trim();
  const company = detachment?.company ? `${detachment.company} Coy` : "Coy";
  if (!name) return company;
  if (name.toLowerCase().includes("coy")) return name;
  return `${company} - ${name}`;
}

function injurySeverityLabel(value) {
  return INJURY_SEVERITIES.find(([severity]) => severity === value)?.[1] || "";
}

function isInjuryRoadTrafficType(value) {
  return value === "injury";
}

function isFatalRoadTrafficType(value) {
  return value === "fatal";
}

function emptyRtaVehicle() {
  return {
    vehicle_type: "service",
    vehicle_body_type: "motor_vehicle",
    vehicle_details: "",
    driver_person_type: "service",
    driver_service: "",
    driver_unknown: false,
    driver_identifier: "",
    driver_license_no: "",
    driver_rank: "",
    driver_name: "",
    driver_unit: "",
  };
}

function emptyRtaCasualty(status = "injured") {
  return {
    casualty_status: status,
    person_type: "service",
    is_unknown: false,
    identifier: "",
    rank: "",
    name: "",
    unit: "",
    injury_severity: "",
  };
}

function emptyIncidentCaseForm(source = CASE_SOURCE_INCIDENT) {
  return {
    occurred_date: localDateDisplay(),
    occurred_time: localTimeValue(),
    incident_title: "",
    road_traffic_type: "",
    place: "",
    unit_involved: "",
    originating_unit: "",
    service_vehicle: "",
    service_member_number: "",
    service_member_rank: "",
    service_member_name: "",
    civilian: "",
    history: "",
    injuries: "",
    damages: "",
    service_vehicle_damaged: "no",
    how_occurred: "",
    action_taken: "",
    police_ob_reference: "",
    injured_count: "0",
    dead_count: "0",
    rta_vehicles: [emptyRtaVehicle()],
    rta_casualties: [],
    source,
  };
}

function cleanRtaVehicle(vehicle) {
  const vehicleOwner = RTA_VEHICLE_OWNERS.some(([value]) => value === vehicle.vehicle_type)
    ? vehicle.vehicle_type
    : "service";
  const vehicleBodyType = RTA_VEHICLE_BODY_TYPES.some(([value]) => value === vehicle.vehicle_body_type)
    ? vehicle.vehicle_body_type
    : "motor_vehicle";
  const driverPersonType = vehicle.driver_person_type || (vehicleOwner === "civilian" ? "civilian" : "service");
  const driverUnknown = driverPersonType === "civilian" && Boolean(vehicle.driver_unknown);
  return {
    vehicle_type: vehicleOwner,
    vehicle_body_type: vehicleBodyType,
    vehicle_details: String(vehicle.vehicle_details || "").trim(),
    driver_person_type: driverPersonType,
    driver_service: driverPersonType === "civilian" ? "" : String(vehicle.driver_service || "").trim(),
    driver_unknown: driverUnknown,
    driver_identifier: driverUnknown ? "Unknown" : String(vehicle.driver_identifier || "").trim(),
    driver_license_no: driverUnknown || driverPersonType !== "civilian" ? "" : String(vehicle.driver_license_no || "").trim(),
    driver_rank: driverPersonType === "civilian" ? "" : String(vehicle.driver_rank || "").trim(),
    driver_name: driverUnknown ? "Unknown" : String(vehicle.driver_name || "").trim(),
    driver_unit: driverPersonType === "civilian" ? "" : String(vehicle.driver_unit || "").trim(),
  };
}

function cleanRtaCasualty(casualty) {
  const status = casualty.casualty_status || "injured";
  const personType = casualty.person_type || "service";
  const isUnknown = personType === "civilian" && Boolean(casualty.is_unknown);
  return {
    casualty_status: status,
    person_type: personType,
    is_unknown: isUnknown,
    identifier: isUnknown ? "Unknown" : String(casualty.identifier || "").trim(),
    rank: personType === "civilian" ? "" : String(casualty.rank || "").trim(),
    name: isUnknown ? "Unknown" : String(casualty.name || "").trim(),
    unit: personType === "civilian" ? "" : String(casualty.unit || "").trim(),
    injury_severity: status === "injured" ? String(casualty.injury_severity || "").trim() : "",
  };
}

function hasVehicleData(vehicle) {
  const cleaned = cleanRtaVehicle(vehicle);
  return cleaned.driver_unknown || ["vehicle_details", "driver_identifier", "driver_license_no", "driver_rank", "driver_name", "driver_unit"]
    .some((field) => String(cleaned[field] || "").trim());
}

function vehicleBodyLabel(value) {
  return RTA_VEHICLE_BODY_TYPES.find(([type]) => type === value)?.[1] || "Motor Vehicle";
}

function vehicleTypeDescription(vehicle) {
  const cleaned = cleanRtaVehicle(vehicle);
  if (cleaned.vehicle_type === "service_member_personal") {
    return `Service member personal ${vehicleBodyLabel(cleaned.vehicle_body_type).toLowerCase()}`;
  }
  if (cleaned.vehicle_type === "civilian") {
    return `Civilian ${vehicleBodyLabel(cleaned.vehicle_body_type).toLowerCase()}`;
  }
  return `Official service ${vehicleBodyLabel(cleaned.vehicle_body_type).toLowerCase()}`;
}

function vehicleRegisterLabel(vehicle) {
  const cleaned = cleanRtaVehicle(vehicle);
  if (!cleaned.vehicle_details) return "";
  if (cleaned.vehicle_type === "service_member_personal") {
    return `Personal ${vehicleBodyLabel(cleaned.vehicle_body_type).toLowerCase()}: ${cleaned.vehicle_details}`;
  }
  if (cleaned.vehicle_type === "civilian") {
    return `Civilian ${vehicleBodyLabel(cleaned.vehicle_body_type).toLowerCase()}: ${cleaned.vehicle_details}`;
  }
  return cleaned.vehicle_details;
}

function driverSummary(vehicle, index) {
  const cleaned = cleanRtaVehicle(vehicle);
  const driverLabel = personLabel({
    service: cleaned.driver_service,
    identifier: cleaned.driver_identifier,
    driver_license_no: cleaned.driver_license_no,
    rank: cleaned.driver_rank,
    name: cleaned.driver_name,
    unit: cleaned.driver_unit,
    driver_unknown: cleaned.driver_unknown,
  }, cleaned.driver_person_type === "civilian" ? "ID No" : "Svc No");
  return driverLabel ? `${index + 1}. Driver/Rider: ${driverLabel}` : "";
}

function safeRtaCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function casualtyCountsForType(roadTrafficType, injured, dead) {
  const injuredCount = roadTrafficType === "non_injury" ? 0 : safeRtaCount(injured);
  const deadCount = ["non_injury", "injury"].includes(roadTrafficType) ? 0 : safeRtaCount(dead);
  return { injuredCount, deadCount };
}

function syncRtaCasualtiesForCounts(casualties, roadTrafficType, injured, dead) {
  const { injuredCount, deadCount } = casualtyCountsForType(roadTrafficType, injured, dead);
  const existing = toArray(casualties);
  const existingInjured = existing
    .filter((casualty) => casualty?.casualty_status !== "dead")
    .map((casualty) => ({ ...casualty, casualty_status: "injured" }));
  const existingDead = existing
    .filter((casualty) => casualty?.casualty_status === "dead")
    .map((casualty) => ({ ...casualty, casualty_status: "dead", injury_severity: "" }));
  return [
    ...Array.from({ length: injuredCount }, (_, index) => existingInjured[index] || emptyRtaCasualty("injured")),
    ...Array.from({ length: deadCount }, (_, index) => existingDead[index] || emptyRtaCasualty("dead")),
  ];
}

function rtaCasualtiesMatchCounts(casualties, roadTrafficType, injured, dead) {
  const { injuredCount, deadCount } = casualtyCountsForType(roadTrafficType, injured, dead);
  const existing = toArray(casualties);
  if (existing.length !== injuredCount + deadCount) return false;
  const actualDead = existing.filter((casualty) => casualty?.casualty_status === "dead").length;
  const actualInjured = existing.length - actualDead;
  return actualInjured === injuredCount && actualDead === deadCount;
}

function countLabel(value) {
  const number = Number(value || 0);
  return number > 0 ? String(number) : "Nil";
}

function personLabel(person, identifierLabel = "Svc/ID") {
  if (person.is_unknown || person.driver_unknown) return "Unknown civilian";
  const parts = [
    person.service ? `Service: ${driverServiceLabel(person.service)}` : "",
    person.identifier ? `${identifierLabel}: ${person.identifier}` : "",
    person.driver_license_no ? `DL No: ${person.driver_license_no}` : "",
    person.rank,
    person.name,
    person.unit ? `Unit: ${person.unit}` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function sourceServiceMemberSummary(form) {
  return [
    form.service_member_number ? `Service No: ${String(form.service_member_number).trim()}` : "",
    form.service_member_rank,
    form.service_member_name,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function vehicleSummary(vehicle, index) {
  const cleaned = cleanRtaVehicle(vehicle);
  const driverLabel = personLabel({
    service: cleaned.driver_service,
    identifier: cleaned.driver_identifier,
    driver_license_no: cleaned.driver_license_no,
    rank: cleaned.driver_rank,
    name: cleaned.driver_name,
    unit: cleaned.driver_unit,
    driver_unknown: cleaned.driver_unknown,
  }, cleaned.driver_person_type === "civilian" ? "ID No" : "Svc No");
  return `${index + 1}. ${vehicleTypeDescription(cleaned)}: ${cleaned.vehicle_details || "Not specified"}${driverLabel ? `; Driver/Rider: ${driverLabel}` : ""}`;
}

function casualtySummary(casualty, index) {
  const cleaned = cleanRtaCasualty(casualty);
  const statusLabel = cleaned.casualty_status === "dead" ? "Zulu (Dead)" : "Yankee (Injured)";
  const personType = cleaned.person_type === "civilian" ? "Civilian" : "Service member";
  const person = personLabel(cleaned, cleaned.person_type === "civilian" ? "ID No" : "Svc No");
  const severity = cleaned.casualty_status === "injured" && cleaned.injury_severity
    ? `; Severity: ${injurySeverityLabel(cleaned.injury_severity)}`
    : "";
  return `${index + 1}. ${statusLabel} - ${personType}: ${person || "Details not specified"}${severity}`;
}

function buildIncidentCaseDescription(form) {
  const sections = [
    `Incident: ${form.incident_title || "Incident"}.`,
    `Place: ${form.place || "Not specified"}.`,
  ];
  const serviceMember = sourceServiceMemberSummary(form);
  if (form.unit_involved) sections.push(`Unit involved: ${form.unit_involved}.`);
  if (form.originating_unit) sections.push(`Originating sub-unit: ${form.originating_unit}.`);
  if (serviceMember) sections.push(`Service member: ${serviceMember}.`);
  if (form.history) sections.push(`History of the incident:\n${form.history}`);
  if (form.police_ob_reference) sections.push(`Police / External OB Ref: ${form.police_ob_reference}`);
  return sections.filter(Boolean).join("\n\n");
}

function isRtaServiceVehicleDamaged(form) {
  return String(form?.service_vehicle_damaged || "").toLowerCase() === "yes";
}

function buildRtaCaseDescription(form) {
  const vehicles = toArray(form.rta_vehicles).filter(hasVehicleData).map(cleanRtaVehicle);
  const casualties = toArray(form.rta_casualties).map(cleanRtaCasualty);
  const sections = [
    `${roadTrafficTypeLabel(form.road_traffic_type) || "Road Traffic Accident"} recorded at ${form.place || "place not specified"}.`,
    `Yankee (injured): ${countLabel(form.injured_count)}. Zulu (dead): ${countLabel(form.dead_count)}.`,
    `Service vehicle damaged: ${isRtaServiceVehicleDamaged(form) ? "Yes" : "No"}.`,
  ];
  if (form.unit_involved) sections.push(`Unit involved: ${form.unit_involved}.`);
  if (form.originating_unit) sections.push(`Originating sub-unit: ${form.originating_unit}.`);
  if (vehicles.length) sections.push(`Vehicles / drivers:\n${vehicles.map(vehicleSummary).join("\n")}`);
  if (casualties.length) sections.push(`Yankee / Zulu details:\n${casualties.map(casualtySummary).join("\n")}`);
  if (form.history) sections.push(`History of the accident:\n${form.history}`);
  if (form.damages) sections.push(`Damages:\n${form.damages}`);
  if (form.how_occurred) sections.push(`How the accident occurred:\n${form.how_occurred}`);
  if (form.action_taken) sections.push(`Initial action taken:\n${form.action_taken}`);
  if (form.police_ob_reference) sections.push(`Police / External OB Ref: ${form.police_ob_reference}`);
  return sections.filter(Boolean).join("\n\n");
}

function validateCaseClassification(form) {
  if (!form.offence_type) return "Offence type is required.";
  if (form.offence_type === "service_offence" && !form.service_offence_severity) {
    return "Severity is required for service offences.";
  }
  if (form.offence_type === "criminal_offence" && !form.criminal_offence_type) {
    return "Criminal offence type is required.";
  }
  if (!form.submitting_unit) return "Submitting unit is required.";
  return "";
}

function validateIncidentSourceCase(form, sourceForm, source) {
  const classificationError = source === CASE_SOURCE_RTA ? "" : validateCaseClassification(form);
  if (classificationError) return classificationError;
  if (
    source !== CASE_SOURCE_RTA
    &&
    form.offence_type === "criminal_offence"
    && form.criminal_offence_type === "dci_civ_police"
    && isBlank(sourceForm.police_ob_reference)
  ) {
    return "Police / External OB Ref is required for DCI / Civ Police cases.";
  }
  const occurredDateApi = parseDisplayDateForApi(sourceForm.occurred_date);
  if (!sourceForm.occurred_date) return "Date of occurrence is required.";
  if (!isApiDate(occurredDateApi)) return "Use date format dd/mm/yyyy for Date of Occurrence.";
  if (!sourceForm.occurred_time) return "Time of occurrence is required.";
  if (isBlank(sourceForm.place)) return "Place is required.";
  if (isBlank(sourceForm.unit_involved)) return "Unit involved is required.";

  if (source === CASE_SOURCE_INCIDENT) {
    if (isBlank(sourceForm.incident_title)) return "Incident is required.";
    if (isBlank(sourceForm.history)) return "History of the incident is required.";
    return "";
  }

  if (!sourceForm.road_traffic_type) return "Select the road traffic accident type.";
  const { injuredCount, deadCount } = casualtyCountsForType(
    sourceForm.road_traffic_type,
    sourceForm.injured_count,
    sourceForm.dead_count
  );
  const vehicles = toArray(sourceForm.rta_vehicles).filter(hasVehicleData);
  if (!vehicles.length) return "Add at least one vehicle and driver entry.";
  const cleanedVehicles = vehicles.map(cleanRtaVehicle);
  if (!cleanedVehicles.some((vehicle) => vehicle.vehicle_type !== "civilian")) {
    return "Add at least one official service vehicle or service member personal vehicle.";
  }
  if (cleanedVehicles.some((vehicle) => !vehicle.vehicle_details)) {
    return "Enter the vehicle registration or description for every RTA vehicle.";
  }
  if (cleanedVehicles.some((vehicle) => vehicle.driver_person_type === "service" && !vehicle.driver_service)) {
    return "Select driver/rider service for every service member driver or rider.";
  }
  if (
    sourceForm.road_traffic_type === "non_injury"
    && !cleanedVehicles.some((vehicle) => vehicle.driver_unknown || vehicle.driver_identifier || vehicle.driver_license_no || vehicle.driver_name)
  ) {
    return "Capture driver/rider details or driving licence no for a Non-Injury Road Traffic Accident.";
  }
  if (isInjuryRoadTrafficType(sourceForm.road_traffic_type) && injuredCount < 1) {
    return "Enter the Yankee count for an Injury Road Traffic Accident.";
  }
  if (isFatalRoadTrafficType(sourceForm.road_traffic_type) && deadCount < 1) {
    return "Enter the Zulu count for a Fatal Road Traffic Accident.";
  }
  if (isBlank(sourceForm.history)) return "History of the accident is required.";
  if (isBlank(sourceForm.how_occurred)) return "How the accident occurred is required.";
  if (isRtaServiceVehicleDamaged(sourceForm) && isBlank(sourceForm.damages)) {
    return "Describe the service vehicle damage before creating the RTA case.";
  }
  const casualtyMissingSeverity = toArray(sourceForm.rta_casualties)
    .map(cleanRtaCasualty)
    .some((casualty) => casualty.casualty_status === "injured" && !casualty.injury_severity);
  if (casualtyMissingSeverity) return "Select injury severity for every Yankee entry.";
  return "";
}

function buildSourceCasePayload(form, sourceForm, source) {
  const occurredDateApi = parseDisplayDateForApi(sourceForm.occurred_date);
  const sourceOffence = source === CASE_SOURCE_RTA
    ? roadTrafficTypeLabel(sourceForm.road_traffic_type) || "Road Traffic Accident"
    : sourceForm.incident_title || "Incident";
  const description = source === CASE_SOURCE_RTA
    ? buildRtaCaseDescription(sourceForm)
    : sourceForm.history;
  const firstServiceDriver = toArray(sourceForm.rta_vehicles)
    .map(cleanRtaVehicle)
    .find((vehicle) =>
      vehicle.driver_person_type === "service"
      && (vehicle.driver_identifier || vehicle.driver_rank || vehicle.driver_name)
    );
  const accusedServiceNumber = source === CASE_SOURCE_RTA
    ? firstServiceDriver?.driver_identifier || ""
    : sourceForm.service_member_number || "";
  const accusedRank = source === CASE_SOURCE_RTA
    ? firstServiceDriver?.driver_rank || ""
    : sourceForm.service_member_rank || "";
  const accusedName = source === CASE_SOURCE_RTA
    ? firstServiceDriver?.driver_name || ""
    : sourceForm.service_member_name || "";
  const accusedService = source === CASE_SOURCE_RTA
    ? firstServiceDriver?.driver_service || ""
    : "";

  const payload = {
    case_type: source === CASE_SOURCE_RTA
      ? RTA_CASE_TYPE
      : (source === CASE_SOURCE_INCIDENT ? "incident" : CASE_SOURCE_RFI),
    title: sourceOffence,
    offence: form.offence || sourceOffence,
    date_of_offence: occurredDateApi,
    place_of_offence: sourceForm.place,
    description,
    accused_service_number: accusedServiceNumber,
    accused_rank: accusedRank,
    accused_name: accusedName,
    accused_service: accusedService,
    police_station: sourceForm.police_ob_reference || "",
    rta_service_vehicle_damaged: source === CASE_SOURCE_RTA && isRtaServiceVehicleDamaged(sourceForm),
  };

  if (source !== CASE_SOURCE_RTA) {
    payload.offence_type = form.offence_type;
    payload.service_offence_severity = form.service_offence_severity;
    payload.criminal_offence_type = form.criminal_offence_type;
    payload.submitting_unit = form.submitting_unit;
  }

  return payload;
}

function sourceIncidentType(sourceForm, source) {
  if (source === CASE_SOURCE_RTA) {
    return roadTrafficTypeLabel(sourceForm.road_traffic_type) || "Road Traffic Accident";
  }
  return sourceForm.incident_title || "Incident";
}

function sourceIncidentDescription(sourceForm, source) {
  return source === CASE_SOURCE_RTA
    ? buildRtaCaseDescription(sourceForm)
    : buildIncidentCaseDescription(sourceForm);
}

function sourceIncidentSeverity(form, sourceForm, source) {
  if (source === CASE_SOURCE_RTA) {
    if (isFatalRoadTrafficType(sourceForm.road_traffic_type)) return "critical";
    if (sourceForm.road_traffic_type === "injury" || sourceForm.road_traffic_type === "hit_and_run") return "high";
    return "medium";
  }
  if (form.offence_type === "criminal_offence") return "high";
  if (form.service_offence_severity === "serious") return "high";
  return "medium";
}

function buildIncidentRecordPayload(form, sourceForm, source) {
  const occurredDateApi = parseDisplayDateForApi(sourceForm.occurred_date);
  const occurredTime = sourceForm.occurred_time || "00:00";
  const incidentType = sourceIncidentType(sourceForm, source);
  const description = sourceIncidentDescription(sourceForm, source);
  const serviceMember = sourceServiceMemberSummary(sourceForm);
  const rtaVehicles = source === CASE_SOURCE_RTA
    ? toArray(sourceForm.rta_vehicles).filter(hasVehicleData).map(cleanRtaVehicle)
    : [];
  const rtaCasualties = source === CASE_SOURCE_RTA
    ? toArray(sourceForm.rta_casualties).map(cleanRtaCasualty)
    : [];

  return {
    incident_type: incidentType,
    description: description || incidentType,
    location: sourceForm.place || "",
    service_vehicle: source === CASE_SOURCE_RTA
      ? rtaVehicles.filter((vehicle) => vehicle.vehicle_type !== "civilian").map(vehicleRegisterLabel).filter(Boolean).join("\n")
      : "",
    unit_involved: sourceForm.unit_involved || "",
    originating_unit: sourceForm.originating_unit || "",
    civilian: source === CASE_SOURCE_RTA
      ? rtaVehicles.filter((vehicle) => vehicle.vehicle_type === "civilian").map(vehicleSummary).join("\n")
      : "",
    service_member: source === CASE_SOURCE_RTA
      ? rtaVehicles.map(driverSummary).filter(Boolean).join("\n")
      : serviceMember,
    rta_vehicles: rtaVehicles,
    rta_casualties: rtaCasualties,
    history: sourceForm.history || description || incidentType,
    injuries: source === CASE_SOURCE_RTA
      ? rtaCasualties.map(casualtySummary).join("\n") || `Yankee (injured): ${countLabel(sourceForm.injured_count)}. Zulu (dead): ${countLabel(sourceForm.dead_count)}.`
      : "",
    damages: source === CASE_SOURCE_RTA ? sourceForm.damages || "" : "",
    how_occurred: source === CASE_SOURCE_RTA ? sourceForm.how_occurred || "" : "",
    action_taken: source === CASE_SOURCE_RTA ? sourceForm.action_taken || "" : "",
    police_ob_reference: sourceForm.police_ob_reference || "",
    date_occurred: `${occurredDateApi}T${occurredTime}:00`,
    severity: sourceIncidentSeverity(form, sourceForm, source),
  };
}

function isBlank(value) {
  return !String(value ?? "").trim();
}

function entityId(value) {
  if (value && typeof value === "object") return value.id || value.pk || "";
  return value || "";
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
  if (!isApiDate(parseDisplayDateForApi(form.date_of_offence))) return "Use date format dd/mm/yyyy for Date of Offence.";
  if (isBlank(form.place_of_offence)) return "Place of offence is required.";
  if (isBlank(form.description)) return "Description is required.";
  if (form.rfi_document && isBlank(form.rfi_no)) {
    return "RFI REF No is required when an RFI attachment is selected.";
  }
  if (form.rfi_document && !form.rfi_date) {
    return "RFI date is required when an RFI attachment is selected.";
  }
  if (form.rfi_document && !isApiDate(parseDisplayDateForApi(form.rfi_date))) {
    return "Use date format dd/mm/yyyy for RFI Date.";
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
    date_of_offence: normalizeDateForDisplay(caseObj?.date_of_offence),
    place_of_offence: caseObj?.place_of_offence || "",
    rfi_no: caseObj?.rfi_no || "",
    rfi_date: normalizeDateForDisplay(caseObj?.rfi_date),
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

function TextAutocompleteInput({ value, onChange, options = [], placeholder = "Type to search...", required = false, disabled = false }) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = String(value || "").trim().toLowerCase();
  const suggestions = useMemo(() => {
    const startsWith = [];
    const contains = [];
    const seen = new Set();
    options.forEach((option) => {
      const name = String(option || "").trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      if (!query || key.startsWith(query)) {
        startsWith.push(name);
      } else if (key.includes(query)) {
        contains.push(name);
      }
    });
    return [...startsWith, ...contains].slice(0, 12);
  }, [options, query]);
  const showSuggestions = open && !disabled && suggestions.length > 0;

  function chooseOption(name) {
    onChange(name);
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && suggestions.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
          } else if (event.key === "ArrowUp" && suggestions.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && showSuggestions) {
            event.preventDefault();
            chooseOption(suggestions[activeIndex] || suggestions[0]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={listboxId}
        className={CASE_FORM_CONTROL}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      {showSuggestions && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 text-sm shadow-xl"
        >
          {suggestions.map((name, index) => (
            <button
              type="button"
              key={name}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                chooseOption(name);
              }}
              className={`block w-full px-3 py-2 text-left ${
                index === activeIndex ? "bg-blue-50 text-blue-900" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {name}
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

function ScanThenUploadModal({ documentLabel, scanning, directScanFailed, onDirectScan, onUpload, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Scan Then Upload</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">Attach a scanned document</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close scan instructions"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm leading-6 text-slate-600">
          Use your scanner software to scan {documentLabel ? documentLabel.toLowerCase() : "the document"}, save it as
          a PDF or image, then upload the saved scan here. If the MPIMS scanner helper is already running on this
          computer, you can use direct scan as a shortcut.
        </p>

        {directScanFailed && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Direct scan is not available on this computer right now. You can still scan with the normal scanner app and
            upload the saved file.
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-slate-950">1. Scan and save</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Open the scanner app on this PC, scan the document, and save it as PDF, JPG, or PNG.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-slate-950">2. Upload saved file</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Return to MPIMS, choose the saved scan, and submit the form normally.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={scanning}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDirectScan}
            disabled={scanning}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {scanning ? "Scanning..." : "Scan Directly"}
          </button>
          <button
            type="button"
            onClick={onUpload}
            disabled={scanning}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Choose Saved File
          </button>
        </div>
      </div>
    </div>
  );
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
  const [showScanGuide, setShowScanGuide] = useState(false);
  const [directScanFailed, setDirectScanFailed] = useState(false);
  const fileInputRef = useRef(null);
  const isLight = variant === "light";

  function handleFileSelection(event) {
    onFileChange(event.target.files?.[0] || null);
    setScanNotice("");
    onScanError?.("");
  }

  async function runDirectScan() {
    setScanning(true);
    setScanNotice("");
    onScanError?.("");
    try {
      const scannedFile = await scanFromLocalScanner(documentType || label);
      onFileChange(scannedFile);
      setShowScanGuide(false);
      setDirectScanFailed(false);
      setScanNotice("Scanned document attached.");
    } catch {
      setShowScanGuide(true);
      setDirectScanFailed(true);
      onScanError?.("");
    } finally {
      setScanning(false);
    }
  }

  function handleScanRequest() {
    setDirectScanFailed(false);
    runDirectScan();
  }

  function handleDirectScan() {
    setDirectScanFailed(false);
    runDirectScan();
  }

  function handleChooseSavedFile() {
    setShowScanGuide(false);
    setDirectScanFailed(false);
    setScanNotice("Scan with your scanner app, save the file, then choose the saved scan here.");
    fileInputRef.current?.click();
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
          onClick={handleScanRequest}
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
      {showScanGuide && (
        <ScanThenUploadModal
          documentLabel={label}
          scanning={scanning}
          directScanFailed={directScanFailed}
          onDirectScan={handleDirectScan}
          onUpload={handleChooseSavedFile}
          onCancel={() => setShowScanGuide(false)}
        />
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
  const hasTrafficAccidentReport = Boolean(c?.traffic_accident_report);
  const hasRtaDamageAuthority = Boolean(c?.rta_damage_authority);
  const extraCount = Number(c?.extra_attachment_count || 0);
  const totalCount = (hasRfi ? 1 : 0)
    + (hasTaskingLetter ? 1 : 0)
    + (hasTrafficAccidentReport ? 1 : 0)
    + (hasRtaDamageAuthority ? 1 : 0)
    + extraCount;

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
                  {[c.rfi_no && `REF No: ${c.rfi_no}`, c.rfi_date && `Date: ${normalizeDateForDisplay(c.rfi_date)}`]
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

          {hasTrafficAccidentReport && (
            <ProtectedDocumentButton
              url={c.traffic_accident_report}
              label="traffic accident report"
              className="block text-blue-400 hover:underline"
            >
              Traffic Accident Report - View
            </ProtectedDocumentButton>
          )}

          {hasRtaDamageAuthority && (
            <ProtectedDocumentButton
              url={c.rta_damage_authority}
              label="RTA damage authority"
              className="block text-blue-400 hover:underline"
            >
              {rtaDamageAuthorityLabel(c.rta_damage_authority_source) || "RTA Damage Authority"} - View
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
  { value: "detachment", label: "IC Cases" },
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

export default function Cases({ user, criminalTypeFilter, clearanceOnly = false }) {
  const detailPanelRef = useRef(null);
  const actionSaveInFlightRef = useRef(new Set());
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const caseQueryId = searchParams.get("case");
  const caseAction = searchParams.get("action");
  const initialStatus = searchParams.get("status");
  const initialFilter = ALL_STATUSES.includes(initialStatus) ? initialStatus : "all";
  const placeOfOffenceFilter = searchParams.get("place_of_offence") || "";
  const accusedUnitQueryFilter = searchParams.get("accused_unit") || "";
  const accusedServiceFilter = searchParams.get("accused_service") || "";
  const offenceFilter = searchParams.get("offence") || "";
  const criminalTypeQueryFilter = searchParams.get("criminal_offence_type") || "";
  const caseTypeQueryFilter = searchParams.get("case_type") || "";
  const createdFromFilter = searchParams.get("created_from") || "";
  const createdToFilter = searchParams.get("created_to") || "";
  const taskedBattalionFilter = searchParams.get("tasked_battalion") || "";
  const taskedDetachmentFilter = searchParams.get("tasked_detachment") || "";
  const activeCriminalTypeFilter = criminalTypeFilter || criminalTypeQueryFilter;
  const activeCaseTypeFilter = String(caseTypeQueryFilter || "").toLowerCase();
  const isRtaCaseFilter = activeCaseTypeFilter === RTA_CASE_TYPE;
  const [cases, setCases]       = useState([]);
  const [caseCount, setCaseCount] = useState(0);
  const [caseStatusTotal, setCaseStatusTotal] = useState(0);
  const [caseStatusCounts, setCaseStatusCounts] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading]   = useState(true);
  const [countLoading, setCountLoading] = useState(false);
  const [filter, setFilter]     = useState(initialFilter);
  const [search, setSearch]     = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [accusedUnitFilter, setAccusedUnitFilter] = useState(accusedUnitQueryFilter);
  const [dateFrom, setDateFrom] = useState(createdFromFilter);
  const [dateTo, setDateTo]     = useState(createdToFilter);
  const [selected, setSelected] = useState(null);
  const selectedId = selected?.id || null;
  const [expandedDesc, setExpandedDesc] = useState({});

  // Create form
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState(INIT_CREATE);
  const [caseSource, setCaseSource] = useState("");
  const [sourceCaseForm, setSourceCaseForm] = useState(emptyIncidentCaseForm());
  const [caseFormMode, setCaseFormMode] = useState("create");
  const [caseDeleteTarget, setCaseDeleteTarget] = useState(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr]     = useState("");
  const [postCreateTaskPrompt, setPostCreateTaskPrompt] = useState(null);
  const [discardCreateConfirmOpen, setDiscardCreateConfirmOpen] = useState(false);
  const [criminalAssignOpen, setCriminalAssignOpen] = useState(false);
  const [criminalAssignCases, setCriminalAssignCases] = useState([]);
  const [criminalAssignSelectedIds, setCriminalAssignSelectedIds] = useState(() => new Set());
  const [criminalAssignSearch, setCriminalAssignSearch] = useState("");
  const [criminalAssignLoading, setCriminalAssignLoading] = useState(false);
  const [criminalAssignSaving, setCriminalAssignSaving] = useState(false);
  const [criminalAssignErr, setCriminalAssignErr] = useState("");

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
  const [serveAbstractFile, setServeAbstractFile] = useState(null);
  const [serveFormOpen, setServeFormOpen] = useState(false);
  const [servePromptCase, setServePromptCase] = useState(null);
  const [acknowledgementPromptCase, setAcknowledgementPromptCase] = useState(null);
  const [rowActionSavingId, setRowActionSavingId] = useState(null);
  const [rowActionErr, setRowActionErr] = useState("");
  const [unitWorkflowSaving, setUnitWorkflowSaving] = useState(false);
  const [unitWorkflowErr, setUnitWorkflowErr] = useState("");
  const [acknowledgementFile, setAcknowledgementFile] = useState(null);
  const [clearanceFile, setClearanceFile] = useState(null);
  const [closureReviewComment, setClosureReviewComment] = useState("");
  const [closurePromptCase, setClosurePromptCase] = useState(null);
  const [closureChargesheetFile, setClosureChargesheetFile] = useState(null);

  // Document upload workflow
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [docLabel, setDocLabel] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadErr, setDocUploadErr] = useState("");
  const [showTrafficReportUpload, setShowTrafficReportUpload] = useState(false);
  const [trafficReportFile, setTrafficReportFile] = useState(null);
  const [trafficReportDamaged, setTrafficReportDamaged] = useState("no");
  const [trafficReportSaving, setTrafficReportSaving] = useState(false);
  const [trafficReportErr, setTrafficReportErr] = useState("");

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
  const [closeClosureBasis, setCloseClosureBasis] = useState("");
  const [closePartIiOrderSerialNo, setClosePartIiOrderSerialNo] = useState("");
  const [closePartIiOrderDate, setClosePartIiOrderDate] = useState("");
  const [closeChargesheetFile, setCloseChargesheetFile] = useState(null);
  const [closeRtaAuthoritySource, setCloseRtaAuthoritySource] = useState("");
  const [closeRtaAuthorityFile, setCloseRtaAuthorityFile] = useState(null);
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
  const [detachments, setDetachments] = useState([]);

  // ── Permissions ──────────────────────────────────────────────────
  const isHqsAdmin  = user?.role === "admin" && user?.battalion_type === "hqs";
  const isSuperuser = Boolean(user?.is_superuser);
  const canCreate   = isHqsAdmin || isSuperuser;
  const canTask     = isHqsAdmin || isSuperuser;
  const canManageCases = isHqsAdmin || isSuperuser;
  const canEditTrafficDamageStatus = isHqsAdmin
    || isSuperuser
    || (user?.role === "mpc_hqs" && String(user?.battalion_type || "").toLowerCase() === "hqs");
  const isCriminalAssignmentView = CRIMINAL_ASSIGNMENT_TYPES.includes(activeCriminalTypeFilter);
  const criminalAssignmentLabel = CRIMINAL_CASE_TYPE_LABELS[activeCriminalTypeFilter] || "Criminal Offence";
  // Battalion admin/CO who is NOT HQS can assign teams
  const canAssignTeam = !isHqsAdmin && !isSuperuser &&
    (user?.role === "admin" || user?.role === "co");
  const isInvestigator = user?.role === "investigator";
  const isAccusedUnitUser = Boolean(user?.unit_id || user?.unit) && ["adj", "co", "2ic", "commandant", "ci", "si", "docus_clerk"].includes(user?.role);
  const selectedCriminalWorkflowType = String(selected?.criminal_offence_type || activeCriminalTypeFilter || "").toLowerCase();
  const supportsUnitServiceAcknowledgement = selectedCriminalWorkflowType !== "dci_civ_police";
  const supportsUnitClosureWorkflow = !["dci_civ_police", "court_martial"].includes(selectedCriminalWorkflowType);
  const briefForwardOptions = getBriefForwardOptions(user, selected);
  const workloadMap = Object.fromEntries(workload.map((w) => [w.id, w.total_engagement ?? 0]));
  const sortedInvestigators = [...investigators].sort(sortUsersByWorkload(workloadMap));
  const unitNames = [...new Set(units.map((unit) => unit.name).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  const originatingSubUnitOptions = [...new Set(detachments.map(detachmentOptionLabel).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  const offenceNames = [...new Set(offences.map((offence) => offence.name).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  const criminalAssignVisibleCases = useMemo(() => {
    const query = criminalAssignSearch.trim().toLowerCase();
    return criminalAssignCases.filter((caseObj) => {
      const status = String(caseObj?.status || "").toLowerCase();
      if (status === "closed" || status === "actioned") return false;
      if (String(caseObj?.criminal_offence_type || "") === activeCriminalTypeFilter) return false;
      if (!query) return true;
      const haystack = [
        caseObj.case_number,
        caseObj.accused_service_number,
        caseObj.accused_rank,
        caseObj.accused_name,
        accusedUnitLabel(caseObj),
        caseObj.offence_name,
        caseObj.offence,
        caseDisplayDescription(caseObj),
        STATUS_CHIP_META[caseObj.status]?.label || caseObj.status,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [activeCriminalTypeFilter, criminalAssignCases, criminalAssignSearch]);
  const allCriminalAssignVisibleSelected = criminalAssignVisibleCases.length > 0
    && criminalAssignVisibleCases.every((caseObj) => criminalAssignSelectedIds.has(caseObj.id));
  const activeCaseSource = caseFormMode === "edit" ? CASE_SOURCE_RFI : caseSource;
  const creatingFromRfi = activeCaseSource === CASE_SOURCE_RFI;
  const creatingFromIncident = activeCaseSource === CASE_SOURCE_INCIDENT;
  const creatingFromRta = activeCaseSource === CASE_SOURCE_RTA;
  const showRtaInjuredCount = creatingFromRta
    && sourceCaseForm.road_traffic_type
    && sourceCaseForm.road_traffic_type !== "non_injury";
  const showRtaDeadCount = creatingFromRta
    && sourceCaseForm.road_traffic_type
    && !["non_injury", "injury"].includes(sourceCaseForm.road_traffic_type);
  useAutoDismiss(createErr, setCreateErr);
  useAutoDismiss(taskErr, setTaskErr);
  useAutoDismiss(toastMessage, setToastMessage, 4000);
  useAutoDismiss(teamErr, setTeamErr);
  useAutoDismiss(statusErr, setStatusErr);
  useAutoDismiss(rowActionErr, setRowActionErr);
  useAutoDismiss(unitWorkflowErr, setUnitWorkflowErr);
  useAutoDismiss(docUploadErr, setDocUploadErr);
  useAutoDismiss(trafficReportErr, setTrafficReportErr);
  useAutoDismiss(briefUploadErr, setBriefUploadErr);
  useAutoDismiss(forwardErr, setForwardErr);
  useAutoDismiss(courtMilestoneErr, setCourtMilestoneErr);
  useAutoDismiss(courtMilestoneSuccess, setCourtMilestoneSuccess);
  useAutoDismiss(courtCloseErr, setCourtCloseErr);

  useEffect(() => {
    if (!creatingFromRta || !sourceCaseForm.road_traffic_type) return;
    if (
      rtaCasualtiesMatchCounts(
        sourceCaseForm.rta_casualties,
        sourceCaseForm.road_traffic_type,
        sourceCaseForm.injured_count,
        sourceCaseForm.dead_count
      )
    ) {
      return;
    }
    setSourceCaseForm((prev) => ({
      ...prev,
      rta_casualties: syncRtaCasualtiesForCounts(
        prev.rta_casualties,
        prev.road_traffic_type,
        prev.injured_count,
        prev.dead_count
      ),
    }));
  }, [
    creatingFromRta,
    sourceCaseForm.dead_count,
    sourceCaseForm.injured_count,
    sourceCaseForm.road_traffic_type,
    sourceCaseForm.rta_casualties,
  ]);

  // ── Load cases ────────────────────────────────────────────────────
  const buildCaseListParams = useCallback(({ includePage = true, includeStatus = true, statusOverride } = {}) => {
    const params = { ordering: "-created_at" };
    if (includePage) {
      params.page = page;
      params.page_size = pageSize;
    }
    const statusValue = statusOverride || (includeStatus && filter !== "all" ? filter : "");
    if (statusValue && statusValue !== "all") params.status = statusValue;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (accusedUnitFilter) params.accused_unit = accusedUnitFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (placeOfOffenceFilter) params.place_of_offence = placeOfOffenceFilter;
    if (offenceFilter) params.offence = offenceFilter;
    if (accusedServiceFilter) params.accused_service = accusedServiceFilter;
    if (activeCriminalTypeFilter) params.criminal_offence_type = activeCriminalTypeFilter;
    if (taskedDetachmentFilter) {
      params.tasked_detachment = taskedDetachmentFilter;
    } else if (taskedBattalionFilter) {
      params.tasked_battalion = taskedBattalionFilter;
    }
    if (isRtaCaseFilter) params.case_type = RTA_CASE_TYPE;
    return params;
  }, [
    accusedServiceFilter,
    accusedUnitFilter,
    activeCriminalTypeFilter,
    dateFrom,
    dateTo,
    debouncedSearch,
    filter,
    isRtaCaseFilter,
    offenceFilter,
    page,
    pageSize,
    placeOfOffenceFilter,
    taskedBattalionFilter,
    taskedDetachmentFilter,
  ]);

  const loadCases = useCallback(() => {
    setLoading(true);
    const params = buildCaseListParams();
    caseService
      .list(params)
      .then((res) => {
        setCases(toArray(res.data));
        setCaseCount(resultCount(res.data));
      })
      .catch((err) => {
        if (err?.response?.status === 404 && page > 1) {
          setPage(1);
        }
      })
      .finally(() => setLoading(false));
  }, [buildCaseListParams, page]);

  useEffect(() => { loadCases(); }, [loadCases]);

  const loadCaseCounts = useCallback(() => {
    setCountLoading(true);
    const baseParams = buildCaseListParams({ includePage: false, includeStatus: false });
    return Promise.all([
      caseService.list({ ...baseParams, page_size: 1 }),
      ...ALL_STATUSES.map((status) => caseService.list({ ...baseParams, status, page_size: 1 })),
    ])
      .then(([totalRes, ...statusResults]) => {
        setCaseStatusTotal(resultCount(totalRes.data));
        const nextCounts = {};
        ALL_STATUSES.forEach((status, index) => {
          nextCounts[status] = resultCount(statusResults[index].data);
        });
        setCaseStatusCounts(nextCounts);
      })
      .catch(() => {})
      .finally(() => setCountLoading(false));
  }, [buildCaseListParams]);

  useEffect(() => {
    loadCaseCounts();
  }, [loadCaseCounts]);

  useEffect(() => {
    if (!caseQueryId || loading) return;
    const caseFromQuery = cases.find((caseObj) => String(caseObj.id) === String(caseQueryId));
    if (caseFromQuery) {
      if (caseAction === "acknowledge" && caseFromQuery.served_abstract && !caseFromQuery.abstract_acknowledged_at) {
        setAcknowledgementFile(null);
        setUnitWorkflowErr("");
        setAcknowledgementPromptCase(caseFromQuery);
      } else {
        setSelected(caseFromQuery);
      }
    }
  }, [caseAction, caseQueryId, cases, loading]);

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

  // Load battalion companies/coys for Originating Sub-Unit autocomplete
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!canCreate) return;
    formationService
      .detachments({ page_size: 1000 })
      .then((res) => setDetachments(toArray(res.data)))
      .catch(() => setDetachments([]));
  }, [canCreate]);

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

  useEffect(() => {
    setPage(1);
  }, [
    accusedUnitFilter,
    activeCriminalTypeFilter,
    dateFrom,
    dateTo,
    debouncedSearch,
    filter,
    isRtaCaseFilter,
    offenceFilter,
    placeOfOffenceFilter,
    taskedBattalionFilter,
    taskedDetachmentFilter,
  ]);

  // ── Helpers ───────────────────────────────────────────────────────
  const todayISO = new Date().toISOString().slice(0, 10);
  function refreshSelected(updated) {
    setSelected(updated);
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function canServeCase(caseObj) {
    if (!caseObj || caseObj.status === "served" || caseObj.status === "closed" || caseObj.served_abstract) return false;
    if (isHqsAdmin || isSuperuser || isSpecialBattalionAdmin) return true;
    if (user?.role === "detachment") {
      return Boolean(userDetachmentId && caseObj.tasked_detachment && String(userDetachmentId) === String(caseObj.tasked_detachment));
    }
    return ["co", "oc", "adj", "2ic", "commandant"].includes(user?.role)
      && Boolean(userDetachmentId && caseObj.tasked_detachment && String(userDetachmentId) === String(caseObj.tasked_detachment));
  }

  async function serveCaseWithAbstract(caseObj = selected) {
    if (!caseObj?.id || !serveAbstractFile) {
      setStatusErr("Attach the abstract PDF before serving this case.");
      return;
    }
    setStatusSaving(true);
    setStatusErr("");
    try {
      const formData = new FormData();
      formData.append("status", "under_investigation");
      formData.append("served_abstract", serveAbstractFile);
      const res = await caseService.update(caseObj.id, formData);
      if (selected?.id === caseObj.id) {
        refreshSelected(res.data);
      } else {
        setCases((prev) => prev.map((row) => (row.id === res.data.id ? res.data : row)));
      }
      setServeAbstractFile(null);
      setServeFormOpen(false);
      setServePromptCase(null);
      loadCases();
      showToast("Abstract uploaded. Case is awaiting unit acknowledgement.", "success");
    } catch (err) {
      const data = err?.response?.data;
      setStatusErr(data?.detail || data?.served_abstract?.[0] || data?.status?.[0] || "Failed to serve case.");
    } finally {
      setStatusSaving(false);
    }
  }

  function closeCaseForm() {
    setDiscardCreateConfirmOpen(false);
    setShowCreate(false);
    setCreateErr("");
    setCreateForm(INIT_CREATE);
    setCaseSource("");
    setSourceCaseForm(emptyIncidentCaseForm());
    setCaseFormMode("create");
    setPostCreateTaskPrompt(null);
  }

  function createFormHasDraft() {
    if (caseFormMode === "edit") return true;
    if (caseSource) return true;
    const accusedHasDraft = toArray(createForm.accused_entries).some((entry) =>
      Object.values(entry || {}).some((value) => !isBlank(value))
    );
    return Object.entries(createForm).some(([field, value]) => {
      if (field === "accused_entries") return accusedHasDraft;
      if (field === "rfi_document") return Boolean(value);
      return !isBlank(value);
    });
  }

  function requestCloseCaseForm() {
    if (createSaving) return;
    if (createFormHasDraft()) {
      setDiscardCreateConfirmOpen(true);
      return;
    }
    closeCaseForm();
  }

  function confirmDiscardCaseForm() {
    closeCaseForm();
  }

  function chooseCaseSource(source) {
    setCaseSource(source);
    setSourceCaseForm(emptyIncidentCaseForm(source));
    setCreateForm((f) => ({ ...f, offence: "", offence_ref: "" }));
    setCreateErr("");
  }

  function changeCaseSource() {
    setCaseSource("");
    setSourceCaseForm(emptyIncidentCaseForm());
    setCreateErr("");
  }

  function resetCriminalAssignment() {
    setCriminalAssignOpen(false);
    setCriminalAssignCases([]);
    setCriminalAssignSelectedIds(new Set());
    setCriminalAssignSearch("");
    setCriminalAssignErr("");
  }

  async function loadCriminalAssignmentCandidates() {
    setCriminalAssignLoading(true);
    setCriminalAssignErr("");
    try {
      const pageSizeLimit = 1000;
      let nextPage = 1;
      let rows = [];
      let total = null;
      while (nextPage <= 20) {
        const res = await caseService.list({
          ordering: "-created_at",
          page: nextPage,
          page_size: pageSizeLimit,
        });
        const pageRows = toArray(res.data);
        rows = rows.concat(pageRows);
        total = resultCount(res.data);
        if (!Array.isArray(res.data?.results) || rows.length >= total || pageRows.length === 0) break;
        nextPage += 1;
      }
      setCriminalAssignCases(
        rows.filter((caseObj) => {
          const status = String(caseObj?.status || "").toLowerCase();
          return status !== "closed"
            && status !== "actioned"
            && String(caseObj?.criminal_offence_type || "") !== activeCriminalTypeFilter;
        })
      );
    } catch (err) {
      setCriminalAssignCases([]);
      setCriminalAssignErr(err?.response?.data?.detail || "Failed to load eligible cases.");
    } finally {
      setCriminalAssignLoading(false);
    }
  }

  function openCriminalAssignmentModal() {
    setPostCreateTaskPrompt(null);
    setTaskModalMode(false);
    setShowTask(false);
    setShowTeam(false);
    setCreateErr("");
    setCriminalAssignOpen(true);
    setCriminalAssignSelectedIds(new Set());
    setCriminalAssignSearch("");
    loadCriminalAssignmentCandidates();
  }

  function closeCriminalAssignmentModal() {
    if (criminalAssignSaving) return;
    resetCriminalAssignment();
  }

  function toggleCriminalAssignmentCase(caseId) {
    setCriminalAssignSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
    setCriminalAssignErr("");
  }

  function toggleAllVisibleCriminalAssignmentCases() {
    setCriminalAssignSelectedIds((prev) => {
      const next = new Set(prev);
      if (allCriminalAssignVisibleSelected) {
        criminalAssignVisibleCases.forEach((caseObj) => next.delete(caseObj.id));
      } else {
        criminalAssignVisibleCases.forEach((caseObj) => next.add(caseObj.id));
      }
      return next;
    });
    setCriminalAssignErr("");
  }

  async function assignSelectedCasesToCriminalType() {
    const ids = [...criminalAssignSelectedIds];
    if (!ids.length) {
      setCriminalAssignErr(`Select at least one case to add to ${criminalAssignmentLabel}.`);
      return;
    }
    setCriminalAssignSaving(true);
    setCriminalAssignErr("");
    try {
      await Promise.all(
        ids.map((caseId) =>
          caseService.update(caseId, {
            offence_type: "criminal_offence",
            criminal_offence_type: activeCriminalTypeFilter,
          })
        )
      );
      resetCriminalAssignment();
      loadCases();
      loadCaseCounts();
      showToast(`${ids.length} case${ids.length !== 1 ? "s" : ""} added to ${criminalAssignmentLabel}.`, "success");
    } catch (err) {
      const data = err?.response?.data;
      if (data?.detail) {
        setCriminalAssignErr(String(data.detail));
      } else if (data && typeof data === "object") {
        setCriminalAssignErr(
          Object.entries(data)
            .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(", ") : value}`)
            .join(" | ")
        );
      } else {
        setCriminalAssignErr(`Failed to add selected cases to ${criminalAssignmentLabel}.`);
      }
    } finally {
      setCriminalAssignSaving(false);
    }
  }

  function updateSourceCaseField(field, value) {
    setSourceCaseForm((prev) => ({ ...prev, [field]: value }));
    if (createErr) setCreateErr("");
  }

  function updateRoadTrafficType(roadTrafficType) {
    const offenceName = roadTrafficTypeLabel(roadTrafficType);
    setSourceCaseForm((prev) => {
      const injured = !roadTrafficType || roadTrafficType === "non_injury" ? "0" : prev.injured_count;
      const dead = !roadTrafficType || ["non_injury", "injury"].includes(roadTrafficType) ? "0" : prev.dead_count;
      return {
        ...prev,
        road_traffic_type: roadTrafficType,
        incident_title: offenceName,
        injured_count: injured,
        dead_count: dead,
        rta_casualties: syncRtaCasualtiesForCounts(prev.rta_casualties, roadTrafficType, injured, dead),
      };
    });
    setCreateForm((f) => ({
      ...f,
      offence_ref: "",
      offence: offenceName || "",
    }));
    if (createErr) setCreateErr("");
  }

  function updateSourceRtaVehicle(index, field, value) {
    setSourceCaseForm((prev) => ({
      ...prev,
      rta_vehicles: prev.rta_vehicles.map((vehicle, vehicleIndex) => {
        if (vehicleIndex !== index) return vehicle;
        const next = { ...vehicle, [field]: value };
        if (field === "vehicle_type") {
          if (value === "civilian") {
            next.driver_person_type = "civilian";
            next.driver_service = "";
            next.driver_rank = "";
            next.driver_unit = "";
          } else if (next.driver_person_type === "civilian") {
            next.driver_person_type = "service";
            next.driver_service = "";
            next.driver_unknown = false;
            next.driver_license_no = "";
            if (next.driver_identifier === "Unknown") next.driver_identifier = "";
            if (next.driver_name === "Unknown") next.driver_name = "";
          }
        }
        if (field === "driver_person_type" && value === "civilian") {
          next.driver_service = "";
          next.driver_rank = "";
          next.driver_unit = "";
        }
        if (field === "driver_person_type" && value === "service") {
          next.driver_service = "";
          next.driver_unknown = false;
          next.driver_license_no = "";
          if (next.driver_identifier === "Unknown") next.driver_identifier = "";
          if (next.driver_name === "Unknown") next.driver_name = "";
        }
        if (field === "driver_unknown") {
          next.driver_unknown = Boolean(value);
          next.driver_service = "";
          next.driver_rank = "";
          next.driver_unit = "";
          if (value) {
            next.driver_identifier = "Unknown";
            next.driver_license_no = "";
            next.driver_name = "Unknown";
          } else {
            next.driver_identifier = "";
            next.driver_license_no = "";
            next.driver_name = "";
          }
        }
        return next;
      }),
    }));
    if (createErr) setCreateErr("");
  }

  function updateSourceRtaCasualty(index, field, value) {
    setSourceCaseForm((prev) => ({
      ...prev,
      rta_casualties: prev.rta_casualties.map((casualty, casualtyIndex) => {
        if (casualtyIndex !== index) return casualty;
        const next = { ...casualty, [field]: value };
        if (field === "casualty_status" && value === "dead") {
          next.injury_severity = "";
        }
        if (field === "person_type" && value === "civilian") {
          next.rank = "";
          next.unit = "";
        }
        if (field === "person_type" && value === "service") {
          next.is_unknown = false;
          if (next.identifier === "Unknown") next.identifier = "";
          if (next.name === "Unknown") next.name = "";
        }
        if (field === "is_unknown") {
          next.is_unknown = Boolean(value);
          next.rank = "";
          next.unit = "";
          if (value) {
            next.identifier = "Unknown";
            next.name = "Unknown";
          } else {
            next.identifier = "";
            next.name = "";
          }
        }
        return next;
      }),
    }));
    if (createErr) setCreateErr("");
  }

  function selectCase(c) {
    setSelected(c);
    setServeFormOpen(false);
    setServeAbstractFile(null);
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
    setShowTrafficReportUpload(false);
    setTrafficReportFile(null);
    setTrafficReportDamaged(c?.rta_service_vehicle_damaged ? "yes" : "no");
    setTrafficReportErr("");
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
      setCloseClosureBasis("");
      setClosePartIiOrderSerialNo("");
      setClosePartIiOrderDate("");
      setCloseChargesheetFile(null);
      setCloseRtaAuthoritySource("");
      setCloseRtaAuthorityFile(null);
      setCourtCloseErr("");
    }
  }

  function openServeFromRow(caseObj, event) {
    event.stopPropagation();
    if (!canServeCase(caseObj)) return;
    setServeAbstractFile(null);
    setStatusErr("");
    setServePromptCase(caseObj);
  }

  const selectedIsCourtMartial = selected?.criminal_offence_type === "court_martial";
  const selectedIsDci = selected?.criminal_offence_type === "dci_civ_police";
  const selectedIsRta = isRoadTrafficAccidentCase(selected);
  const canManageSelectedCourtMartialProgress = selectedIsCourtMartial && (isHqsAdmin || isSuperuser || isInvestigator);
  const courtMartialProgressUnlocked = selectedIsCourtMartial && selected?.status === "served" && Boolean(selected?.abstract_acknowledged_at);
  const activeCloseCase = courtCloseCase || selected;
  const activeCloseCaseIsCourtMartial = activeCloseCase?.criminal_offence_type === "court_martial";
  const activeCloseCaseIsDci = activeCloseCase?.criminal_offence_type === "dci_civ_police";
  const activeCloseCaseIsRta = isRoadTrafficAccidentCase(activeCloseCase);
  const userBattalionId = entityId(user?.battalion_id || user?.battalion);
  const userDetachmentId = entityId(user?.detachment_id || user?.detachment);
  const userBattalionType = String(user?.battalion_type || user?.battalion?.battalion_type || "").toLowerCase();
  const isSpecialBattalionAdmin = user?.role === "admin" && userBattalionType === "special";

  function caseHasInvestigationAssignment(caseObj) {
    return Boolean(
      caseObj?.assigned_to
      || caseObj?.assigned_to_name
      || caseObj?.assigned_team
      || caseObj?.assigned_team_name
    );
  }

  function canUploadTrafficAccidentReportForCase(caseObj) {
    if (!isRoadTrafficAccidentCase(caseObj) || caseObj?.status === "closed") return false;
    return (
      isHqsAdmin
      || isSuperuser
      || (
        user?.role === "detachment"
        && caseObj?.tasked_detachment
        && String(userDetachmentId) === String(caseObj.tasked_detachment)
      )
      || (
        isSpecialBattalionAdmin
        && caseObj?.tasked_battalion
        && String(userBattalionId) === String(caseObj.tasked_battalion)
      )
    );
  }

  const canUploadTrafficAccidentReport = canUploadTrafficAccidentReportForCase(selected)
    && caseHasInvestigationAssignment(selected);

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
      setCourtMilestones((prev) => [...prev, row].sort((a, b) => String(a.scheduled_date || "") > String(b.scheduled_date || "") ? 1 : -1));
      setActionDrafts((prev) => ({ ...prev, [row.id]: row.action_remarks || "" }));

      // Refresh the authoritative case data so the cases list and selected case reflect
      // any server-side changes (e.g. milestone-derived flags) and allow the UI to flip
      // the per-row action to Close when appropriate.
      try {
        const caseRes = await caseService.get(selected.id);
        const caseData = caseRes.data;
        // Preserve current client-side status if server unexpectedly returned 'closed'
        if (selected && selected.status && selected.status !== "closed" && caseData.status === "closed") {
          caseData.status = selected.status;
        }
        refreshSelected(caseData);
        setCases((prev) => prev.map((r) => (r.id === caseData.id ? caseData : r)));
      } catch (fetchErr) {
        // Non-fatal: preserve milestone success even if fetching the case failed.
        console.warn("Failed to refresh case after adding court milestone", fetchErr);
      }

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

      // Refresh the authoritative case data so the UI flips the per-row action to Close
      // when a Judgment milestone with action_recorded_at has been recorded.
      try {
        const caseRes = await caseService.get(selected.id);
        const caseData = caseRes.data;
        // Preserve current client-side status if server unexpectedly returned 'closed'
        if (selected && selected.status && selected.status !== "closed" && caseData.status === "closed") {
          caseData.status = selected.status;
        }
        refreshSelected(caseData);
        setCases((prev) => prev.map((r) => (r.id === caseData.id ? caseData : r)));
      } catch (fetchErr) {
        console.warn("Failed to refresh case after saving milestone action", fetchErr);
      }
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
    setCloseClosureBasis("");
    setClosePartIiOrderSerialNo("");
    setClosePartIiOrderDate("");
    setCloseChargesheetFile(null);
    setCloseRtaAuthoritySource("");
    setCloseRtaAuthorityFile(null);
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
    setCloseClosureBasis(caseObj.closure_basis || "");
    setClosePartIiOrderSerialNo(caseObj.part_ii_order_serial_no || "");
    setClosePartIiOrderDate(normalizeDateForDisplay(caseObj.part_ii_order_date || ""));
    setCloseChargesheetFile(null);
    setCloseRtaAuthoritySource(caseObj.rta_damage_authority_source || "");
    setCloseRtaAuthorityFile(null);
    setJudgmentFileRows([]);
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
    setJudgmentFileRows((prev) => prev.filter((r) => r.id !== rowId));
    if (courtCloseErr) setCourtCloseErr("");
  }

  async function submitCourtCloseWithJudgmentFiles() {
    const closeCase = courtCloseCase || selected;
    if (!closeCase) return;
    if (activeCloseCaseIsRta) {
      if (!closeCase.traffic_accident_report) {
        setCourtCloseErr("Attach the Traffic Accident Report before closing this RTA case.");
        return;
      }
      if (!String(closeActionTaken || "").trim()) {
        setCourtCloseErr("Verdict is required before closing this RTA case.");
        return;
      }
      if (closeCase.rta_service_vehicle_damaged) {
        if (!closeRtaAuthoritySource) {
          setCourtCloseErr("Select whether the damage authority is from HQ KA Moves or Legal.");
          return;
        }
        if (!closeCase.rta_damage_authority && !closeRtaAuthorityFile) {
          setCourtCloseErr("Attach authority from HQ KA Moves or Legal before closing a damaged service-vehicle RTA case.");
          return;
        }
        if (closeRtaAuthorityFile && !String(closeRtaAuthorityFile.name || "").toLowerCase().endsWith(".pdf")) {
          setCourtCloseErr("RTA damage authority must be uploaded as a PDF.");
          return;
        }
      }

      setCourtCloseSaving(true);
      setCourtCloseErr("");
      try {
        const fd = new FormData();
        fd.append("status", "closed");
        fd.append("action_taken", closeActionTaken.trim());
        if (closeCase.rta_service_vehicle_damaged) {
          fd.append("rta_damage_authority_source", closeRtaAuthoritySource);
          if (closeRtaAuthorityFile) fd.append("rta_damage_authority", closeRtaAuthorityFile);
        }
        const res = await caseService.update(closeCase.id, fd);
        refreshSelected(res.data);
        setFilter("closed");
        loadCases();
        setShowCourtCloseModal(false);
        setCourtCloseCase(null);
        setJudgmentFileRows([]);
        setCloseActionTaken("");
        setCloseClosureBasis("");
        setClosePartIiOrderSerialNo("");
        setClosePartIiOrderDate("");
        setCloseChargesheetFile(null);
        setCloseRtaAuthoritySource("");
        setCloseRtaAuthorityFile(null);
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
          setCourtCloseErr(msgs || "Failed to close RTA case.");
        } else {
          setCourtCloseErr("Failed to close RTA case.");
        }
      } finally {
        setCourtCloseSaving(false);
      }
      return;
    }
    const closeBasisIsPartIi = closeClosureBasis === "part_ii_orders";
    const partIiOrderDateApi = parseDisplayDateForApi(closePartIiOrderDate);
    const hasSelectedClosureFile = closeBasisIsPartIi
      ? true
      : Boolean(closeClosureBasis && closeChargesheetFile);
    const rowsWithFiles = judgmentFileRows.filter((r) => r.file);
    if (!closeClosureBasis) {
      setCourtCloseErr("Select what this case is being closed with.");
      return;
    }
    if (!hasSelectedClosureFile) {
      setCourtCloseErr(`Attach the ${closureDocumentLabel(closeClosureBasis)} before closing this case.`);
      return;
    }
    if (closeBasisIsPartIi && !String(closePartIiOrderSerialNo || "").trim()) {
      setCourtCloseErr("Part II Order Serial No is required.");
      return;
    }
    if (closeBasisIsPartIi && !closePartIiOrderDate) {
      setCourtCloseErr("Part II Order Date is required.");
      return;
    }
    if (closeBasisIsPartIi && !isApiDate(partIiOrderDateApi)) {
      setCourtCloseErr("Use date format dd/mm/yyyy.");
      return;
    }
    if (!String(closeActionTaken || "").trim()) {
      setCourtCloseErr("Verdict is required before closing this case.");
      return;
    }

    for (const row of rowsWithFiles) {
      if (!String(row.label || "").trim()) {
        setCourtCloseErr("Each supporting PDF must have a file label.");
        return;
      }
      const name = String(row.file?.name || "").toLowerCase();
      if (!name.endsWith(".pdf")) {
        setCourtCloseErr("Only PDF files are allowed for supporting attachments.");
        return;
      }
    }

    if (closeCase.criminal_offence_type === "court_martial") {
      if (!(isHqsAdmin || isSuperuser)) {
        setCourtCloseErr("Only HQ battalion admin can close a Court Martial case.");
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
      fd.append("closure_basis", closeClosureBasis);
      fd.append("action_taken", closeActionTaken.trim());
      if (closeBasisIsPartIi) {
        fd.append("part_ii_order_serial_no", closePartIiOrderSerialNo.trim());
        fd.append("part_ii_order_date", partIiOrderDateApi);
      } else if (closeChargesheetFile) {
        fd.append("chargesheet", closeChargesheetFile);
      }

      const res = await caseService.update(closeCase.id, fd);
      refreshSelected(res.data);
      setFilter("closed");
      loadCases();

      setShowCourtCloseModal(false);
      setCourtCloseCase(null);
      setJudgmentFileRows([]);
      setCloseActionTaken("");
      setCloseClosureBasis("");
      setClosePartIiOrderSerialNo("");
      setClosePartIiOrderDate("");
      setCloseChargesheetFile(null);
      setCloseRtaAuthoritySource("");
      setCloseRtaAuthorityFile(null);
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
          setCourtCloseErr(msgs || "Failed to attach supporting files and close case.");
        } else {
          setCourtCloseErr("Failed to attach supporting files and close case.");
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
    const source = editing ? CASE_SOURCE_RFI : caseSource;
    if (!editing) {
      if (!source) {
        setCreateErr("Choose whether this is an RFI Case, Incident, or Road Traffic Accident.");
        return;
      }
      const validationError = source === CASE_SOURCE_RFI
        ? validateRequiredCreateCase(createForm, offences.length > 0)
        : validateIncidentSourceCase(createForm, sourceCaseForm, source);
      if (validationError) {
        setCreateErr(validationError);
        return;
      }
    }
    setCreateSaving(true);
    setCreateErr("");
    const validAccusedEntries = (createForm.accused_entries || []).filter((entry) =>
      Object.values(entry).some((value) => String(value || "").trim())
    );
    try {
      if (editing) {
        const fd = new FormData();
        Object.entries(createForm).forEach(([k, v]) => {
          if (k === "offence_ref") return;
          if (k === "accused_entries") return;
          if (k === "submitting_unit") return;
          if (k === "rfi_document") {
            if (v) fd.append(k, v);
            return;
          }
          if (k === "date_of_offence" || k === "rfi_date") {
            const normalizedDate = parseDisplayDateForApi(v);
            fd.append(k, normalizedDate || "");
            return;
          }
          fd.append(k, v || "");
        });
        fd.append("offence_ref", createForm.offence_ref || "");
        fd.append("submitting_unit", createForm.submitting_unit || "");
        fd.append("accused_entries", JSON.stringify(validAccusedEntries));
        const res = await caseService.update(selected.id, fd);
        refreshSelected(res.data);
        showToast("Case updated successfully.", "success");
        setShowCreate(false);
        setCreateForm(INIT_CREATE);
        setCaseSource("");
        setSourceCaseForm(emptyIncidentCaseForm());
        setCaseFormMode("create");
      } else if (source === CASE_SOURCE_RFI) {
        const fd = new FormData();
        Object.entries(createForm).forEach(([k, v]) => {
          if (k === "offence_ref") return;
          if (k === "accused_entries") return;
          if (k === "submitting_unit") return;
          if (k === "rfi_document") {
            if (v) fd.append(k, v);
            return;
          }
          if (k === "date_of_offence" || k === "rfi_date") {
            const normalizedDate = parseDisplayDateForApi(v);
            if (normalizedDate) fd.append(k, normalizedDate);
            return;
          }
          if (v) fd.append(k, v);
        });
        if (createForm.offence_ref) fd.append("offence_ref", createForm.offence_ref);
        if (createForm.submitting_unit) fd.append("submitting_unit", createForm.submitting_unit);
        if (validAccusedEntries.length) {
          fd.append("accused_entries", JSON.stringify(validAccusedEntries));
        }
        const res = await caseService.create(fd);
        showToast("RFI case created successfully.", "success");
        setCreateForm(INIT_CREATE);
        setCaseSource("");
        setSourceCaseForm(emptyIncidentCaseForm());
        setCaseFormMode("create");
        setShowCreate(false);
        setPostCreateTaskPrompt({
          caseObj: res.data,
          sourceLabel: "RFI Case",
        });
      } else {
        const sourcePayload = buildSourceCasePayload(createForm, sourceCaseForm, source);
        const incidentRes = await incidentService.create(buildIncidentRecordPayload(createForm, sourceCaseForm, source));
        const conversionPayload = { ...sourcePayload };
        if (source !== CASE_SOURCE_RTA && createForm.offence_ref) {
          conversionPayload.offence_ref = createForm.offence_ref;
        }
        if (validAccusedEntries.length) {
          conversionPayload.accused_entries = validAccusedEntries;
        }
        const conversionRes = await incidentService.convertToCase(incidentRes.data.id, conversionPayload);
        const convertedCaseId = conversionRes.data?.converted_case;
        let createdCase = convertedCaseId
          ? {
              id: convertedCaseId,
              case_number: conversionRes.data?.converted_case_number,
            }
          : null;
        if (convertedCaseId) {
          try {
            const caseRes = await caseService.get(convertedCaseId);
            createdCase = caseRes.data;
          } catch (_) {}
        }
        showToast(`${caseSourceLabel(source)} saved as an incident and linked case successfully.`, "success");
        setCreateForm(INIT_CREATE);
        setCaseSource("");
        setSourceCaseForm(emptyIncidentCaseForm());
        setCaseFormMode("create");
        setShowCreate(false);
        if (createdCase?.id) {
          setPostCreateTaskPrompt({
            caseObj: createdCase,
            sourceLabel: caseSourceLabel(source),
            incidentNumber: conversionRes.data?.incident_number,
          });
        }
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
    if (!taskingNo.trim()) { setTaskErr("Enter the Tasking REF No."); return; }
    if (!taskFile)      { setTaskErr("Attach a tasking letter."); return; }
    if (!taskingDate)   { setTaskErr("Set a tasking date."); return; }
    const normalized = parseDisplayDateForApi(taskingDate);
    if (!isApiDate(normalized)) { setTaskErr("Use date format dd/mm/yyyy."); return; }
    if (normalized !== todayISO) { setTaskErr("Tasking date must be today's date."); return; }
    setTaskSaving(true);
    setTaskErr("");
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const taskingDateTime = `${normalized}T${hh}:${mm}:${ss}`;
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

  function toggleTrafficReportUpload() {
    setShowTrafficReportUpload((prev) => !prev);
    setTrafficReportErr("");
    if (!showTrafficReportUpload) {
      setTrafficReportFile(null);
      setTrafficReportDamaged(selected?.rta_service_vehicle_damaged ? "yes" : "no");
    }
  }

  function openTrafficReportUploadFromRow(caseObj, event) {
    event.stopPropagation();
    if (!canUploadTrafficAccidentReportForCase(caseObj)) {
      setRowActionErr("Only IC Cases for the tasked Coy/Det, Special Admin battalion, or HQ Admin can upload Traffic Accident Reports.");
      return;
    }
    if (!caseHasInvestigationAssignment(caseObj)) {
      setRowActionErr("Assign this RTA case to an IO or team before uploading the Traffic Accident Report.");
      return;
    }
    setRowActionErr("");
    selectCase(caseObj);
    setShowTrafficReportUpload(true);
    setTrafficReportFile(null);
    setTrafficReportDamaged(caseObj?.rta_service_vehicle_damaged ? "yes" : "no");
    setTrafficReportErr("");
    window.setTimeout(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  // Open the selected case detail and focus the Court Martial milestones section
  function openCourtMartialProgressFromRow(caseObj, event) {
    event?.stopPropagation?.();
    setRowActionErr("");
    if (!caseObj?.id) return;
    // Select the case (opens the detail modal)
    setSelected(caseObj);

    // Wait for the detail panel to render then scroll the milestones into view
    window.setTimeout(() => {
      try {
        const panel = detailPanelRef.current;
        if (!panel) return;
        const target = panel.querySelector('#court-milestones');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          // Fallback: scroll the panel itself
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (e) {
        console.warn('Failed to focus Court Martial milestones', e);
      }
    }, 50);
  }

  async function handleTrafficAccidentReportUpload(e) {
    e.preventDefault();
    if (!selected) return;
    if (selected.status === "closed") {
      setTrafficReportErr("Closed cases do not allow further uploads or attachment changes.");
      return;
    }
    if (!caseHasInvestigationAssignment(selected)) {
      setTrafficReportErr("Assign this RTA case to an IO or team before uploading the Traffic Accident Report.");
      return;
    }
    if (!trafficReportFile) {
      setTrafficReportErr("Attach the Traffic Accident Report PDF.");
      return;
    }
    if (!String(trafficReportFile.name || "").toLowerCase().endsWith(".pdf")) {
      setTrafficReportErr("Traffic Accident Report must be uploaded as a PDF.");
      return;
    }
    setTrafficReportSaving(true);
    setTrafficReportErr("");
    try {
      const fd = new FormData();
      fd.append("traffic_accident_report", trafficReportFile);
      if (canEditTrafficDamageStatus) {
        fd.append("rta_service_vehicle_damaged", trafficReportDamaged === "yes" ? "true" : "false");
      }
      const res = await caseService.update(selected.id, fd);
      refreshSelected(res.data);
      setTrafficReportFile(null);
      setTrafficReportDamaged(res.data?.rta_service_vehicle_damaged ? "yes" : "no");
      setShowTrafficReportUpload(false);
      loadCases();
      showToast("Traffic Accident Report attached. HQ Admin has been notified.", "success");
    } catch (err) {
      const d = err?.response?.data;
      if (d?.detail) {
        setTrafficReportErr(String(d.detail));
      } else if (d && typeof d === "object") {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        setTrafficReportErr(msgs || "Failed to attach Traffic Accident Report.");
      } else {
        setTrafficReportErr("Failed to attach Traffic Accident Report.");
      }
    } finally {
      setTrafficReportSaving(false);
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

  async function acknowledgeServedCase(caseObj = selected) {
    if (!caseObj?.id) return;
    setUnitWorkflowSaving(true);
    setUnitWorkflowErr("");
    try {
      const formData = new FormData();
      if (acknowledgementFile) {
        formData.append("abstract_acknowledgement_form", acknowledgementFile);
      }
      const res = await caseService.acknowledge(caseObj.id, formData);
      refreshSelected(res.data);
      setCases((prev) => prev.map((row) => (row.id === res.data.id ? res.data : row)));
      setAcknowledgementFile(null);
      setAcknowledgementPromptCase(null);
      showToast("Abstract receipt acknowledged.", "success");
    } catch (err) {
      setUnitWorkflowErr(err?.response?.data?.detail || "Failed to acknowledge receipt of the abstract.");
    } finally {
      setUnitWorkflowSaving(false);
    }
  }

  function openAcknowledgementFromRow(caseObj, event) {
    event.stopPropagation();
    if (!caseObj?.served_abstract) return;
    setAcknowledgementFile(null);
    setUnitWorkflowErr("");
    setAcknowledgementPromptCase(caseObj);
  }

  async function requestUnitClosure(caseObj = selected) {
    if (!caseObj?.id) return;
    if (!closureChargesheetFile) {
      setUnitWorkflowErr("Attach the charge sheet before requesting closure.");
      return;
    }
    setUnitWorkflowSaving(true);
    setUnitWorkflowErr("");
    try {
      const formData = new FormData();
      formData.append("chargesheet", closureChargesheetFile);
      const res = await caseService.requestClosure(caseObj.id, formData);
      refreshSelected(res.data);
      setCases((prev) => prev.map((row) => (row.id === res.data.id ? res.data : row)));
      showToast("Closure request sent to Admin HQs.", "success");
      setClosureChargesheetFile(null);
      setClosurePromptCase(null);
    } catch (err) {
      setUnitWorkflowErr(err?.response?.data?.detail || "Failed to request case closure.");
    } finally {
      setUnitWorkflowSaving(false);
    }
  }

  function openClosurePrompt(caseObj, event) {
    event?.stopPropagation();
    setClosurePromptCase(caseObj);
    setClosureChargesheetFile(null);
    setUnitWorkflowErr("");
  }

  async function uploadClearanceCertificate() {
    if (!selected?.id || !clearanceFile) return;
    setUnitWorkflowSaving(true);
    setUnitWorkflowErr("");
    try {
      const formData = new FormData();
      formData.append("clearance_certificate", clearanceFile);
      const res = await caseService.uploadClearanceCertificate(selected.id, formData);
      refreshSelected(res.data);
      setCases((prev) => prev.map((row) => (row.id === res.data.id ? res.data : row)));
      setClearanceFile(null);
      showToast("Clearance certificate attached.", "success");
    } catch (err) {
      setUnitWorkflowErr(err?.response?.data?.detail || "Failed to attach the clearance certificate.");
    } finally {
      setUnitWorkflowSaving(false);
    }
  }

  async function reviewUnitClosure(decision) {
    if (!selected?.id) return;
    if (decision === "reject" && !closureReviewComment.trim()) {
      setUnitWorkflowErr("Add a comment before rejecting the closure request.");
      return;
    }
    setUnitWorkflowSaving(true);
    setUnitWorkflowErr("");
    try {
      const res = await caseService.reviewClosure(selected.id, {
        decision,
        comment: closureReviewComment.trim(),
      });
      refreshSelected(res.data);
      setCases((prev) => prev.map((row) => (row.id === res.data.id ? res.data : row)));
      setClosureReviewComment("");
      showToast(`Closure request ${decision}d.`, "success");
    } catch (err) {
      setUnitWorkflowErr(err?.response?.data?.detail || `Failed to ${decision} the closure request.`);
    } finally {
      setUnitWorkflowSaving(false);
    }
  }

  function handleCloseFromRow(caseObj) {
    if (!caseObj?.id || !caseObj.close_requested) return;
    setRowActionErr("");
    openCourtCloseModal(caseObj);
  }

  // ── Filter / search ───────────────────────────────────────────────
  const statusCountCases = { length: caseStatusTotal };
  const filtered = clearanceOnly
    ? cases.filter((caseObj) => caseObj.status === "served" || caseObj.clearance_certificate)
    : cases;

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = caseStatusCounts[s] || 0;
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
  const showUnderInvestigationActionColumn = isUnderInvestigationFilter && !isDciFilter;
  const primaryStatusChips = isDciFilter
    ? PRIMARY_STATUS_CHIPS.filter((s) => s !== "pending" && s !== "served")
    : PRIMARY_STATUS_CHIPS;
  const isPendingFilter = filter === "pending";
  const isServedFilter = filter === "served";
  const isClosedFilter = filter === "closed";
  const canCloseServedCases = isHqsAdmin || isSuperuser;
  const showServedActionColumn = isServedFilter && (canCloseServedCases || (isAccusedUnitUser && supportsUnitServiceAcknowledgement));
  const defaultCaseExportColumns = [
    "Case #",
    "Status",
    "Service No",
    "Rank",
    "Accused",
    "Unit",
    "Offence",
    "Place",
    "Assignment",
    "Date of Offence",
    "Created",
    "Tasking Date",
    "Served Date",
    "Closed Date",
    "Description",
  ];
  const rtaCaseExportColumns = [
    "Case #",
    "Service No",
    "Rank",
    "Unit",
    "Accused",
    "Offence",
    "Place",
    "Time",
    "History of the Accident",
    "How the Accident Occurred",
    "Originating Unit",
    "Traffic Accident Report",
    "Status",
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
  const caseExportColumns = isRtaCaseFilter
    ? rtaCaseExportColumns
    : isDciFilter
      ? dciCaseExportColumns
      : defaultCaseExportColumns;

  function caseViewTitle() {
    if (clearanceOnly) return "Clearance Certificates";
    if (isRtaCaseFilter) return "RTA Cases";
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
    const typeLabel = isRtaCaseFilter
      ? "Type: RTA"
      : activeCriminalTypeFilter
        ? `Type: ${activeCriminalTypeFilter.replace(/_/g, " ")}`
        : "Type: All";
    return `${typeLabel} | ${statusLabel} | ${rangeLabel} | ${searchLabel} | ${caseCount} case${caseCount !== 1 ? "s" : ""}`;
  }

  function caseExportRow(caseObj) {
    const row = {
      "Case #": caseObj.case_number || "",
      Status: STATUS_CHIP_META[caseObj.status]?.label || caseObj.status || "",
      "Service No": caseObj.accused_service_number || "",
      Rank: caseObj.accused_rank || "",
      Accused: caseObj.accused_name || "",
      Offence: caseObj.offence_name || caseObj.offence || "",
      Unit: accusedUnitLabel(caseObj) || caseUnitLabel(caseObj),
      Place: caseObj.place_of_offence || "",
      Time: "",
      Assignment: caseAssignmentLabel(caseObj),
      "Police Station": caseObj.police_station || "",
      "Battalion/Coy": taskedBattalionCompanyLabel(caseObj),
      Update: formatUpdateFlowDetail(latestCaseUpdateText(caseObj)),
      "Date of Offence": normalizeDateForDisplay(caseObj.date_of_offence),
      Created: formatDateTimeForReport(caseObj.created_at),
      "Tasking Date": formatDateTimeForReport(caseObj.tasking_date),
      "Served Date": formatDateTimeForReport(caseObj.served_at),
      "Closed Date": formatDateTimeForReport(caseObj.closed_at),
      Description: caseDisplayDescription(caseObj) || "",
      "History of the Accident": rtaCaseHistory(caseObj),
      "How the Accident Occurred": rtaCaseHowOccurred(caseObj),
      "Originating Unit": rtaCaseOriginatingUnit(caseObj),
      "Traffic Accident Report": caseObj.traffic_accident_report ? "Attached" : "Not attached",
    };
    if (isRtaCaseFilter) {
      row["Service No"] = rtaCaseServiceNumber(caseObj);
      row.Rank = rtaCaseRank(caseObj);
      row.Unit = rtaCaseUnit(caseObj);
      row.Accused = rtaCaseAccused(caseObj);
      row.Offence = rtaCaseOffence(caseObj);
      row.Place = rtaCasePlace(caseObj);
      row.Time = rtaCaseTime(caseObj);
    }
    return row;
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
      setTaskingDate(normalizeDateForDisplay(todayISO));
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
    if (isCriminalAssignmentView) {
      openCriminalAssignmentModal();
      return;
    }
    setPostCreateTaskPrompt(null);
    setTaskModalMode(false);
    setShowTask(false);
    setTaskErr("");
    setShowTeam(false);
    setTeamErr("");
    setCreateForm(INIT_CREATE);
    setCaseSource("");
    setSourceCaseForm(emptyIncidentCaseForm());
    setCaseFormMode("create");
    setShowCreate(true);
  }

  function assignCreatedCaseNow() {
    const caseObj = postCreateTaskPrompt?.caseObj;
    setPostCreateTaskPrompt(null);
    if (caseObj?.id) {
      openTaskForCase(caseObj);
    }
  }

  function assignCreatedCaseLater() {
    setPostCreateTaskPrompt(null);
  }

  function openEditCaseModal(caseObj) {
    setTaskModalMode(false);
    setShowTask(false);
    setTaskErr("");
    setShowTeam(false);
    setTeamErr("");
    setCreateErr("");
    setCreateForm(caseToForm(caseObj));
    setCaseSource(CASE_SOURCE_RFI);
    setSourceCaseForm(emptyIncidentCaseForm());
    setCaseFormMode("edit");
    setShowCreate(true);
  }

  function openTaskForCase(c, e) {
    e?.stopPropagation?.();
    setSelected(c);
    setShowCreate(false);
    setShowTeam(false);
    setTeamErr("");
    setTaskModalMode(true);
    setTaskErr("");
    setTaskBattalion("");
    setTaskingNo(c?.tasking_no || "");
    setTaskFile(null);
    setTaskingDate(normalizeDateForDisplay(todayISO));
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
            {caseViewTitle()}
          </h2>
          {(criminalTypeFilter || isRtaCaseFilter) && (
            <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isRtaCaseFilter
                ? "bg-amber-900/50 text-amber-200 border border-amber-700/70"
                : criminalTypeFilter === "court_martial"
                  ? "bg-purple-900/60 text-purple-300 border border-purple-700"
                  : "bg-blue-900/60 text-blue-300 border border-blue-700"
            }`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Filtered: {isRtaCaseFilter ? "RTA Cases" : criminalTypeFilter === "court_martial" ? "Court Martial" : "DCI / Civ Police"}
            </span>
          )}
          <p className="text-sm text-gray-500 mt-0.5">
            {caseCount} of {caseStatusTotal} case{caseStatusTotal !== 1 ? "s" : ""}
            {countLoading ? " (updating counts...)" : ""}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {isCriminalAssignmentView ? "Add Case" : "New Case"}
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
            Print Page
          </button>
          <button
            type="button"
            onClick={exportFilteredCases}
            disabled={loading || !filtered.length}
            className="self-end rounded-lg border border-sky-500/40 bg-sky-600/20 px-3 py-2 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-600/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export Page CSV
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
            {isRtaCaseFilter ? (
              <table className="sticky-head w-full min-w-[2300px] text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                    <th className="text-left px-4 py-3 font-medium">Case #</th>
                    <th className="text-left px-4 py-3 font-medium">Service No</th>
                    <th className="text-left px-4 py-3 font-medium">Rank</th>
                    <th className="text-left px-4 py-3 font-medium">Unit</th>
                    <th className="text-left px-4 py-3 font-medium">Accused</th>
                    <th className="text-left px-4 py-3 font-medium">Offence</th>
                    <th className="text-left px-4 py-3 font-medium">Place</th>
                    <th className="text-left px-4 py-3 font-medium">Time</th>
                    <th className="text-left px-4 py-3 font-medium">History of the Accident</th>
                    <th className="text-left px-4 py-3 font-medium">How the Accident Occurred</th>
                    <th className="text-left px-4 py-3 font-medium">Originating Unit</th>
                    <th className="text-left px-4 py-3 font-medium">Traffic Accident Report</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const history = rtaCaseHistory(c) || "--";
                    const howOccurred = rtaCaseHowOccurred(c) || "--";
                    const historyKey = `rta-history-${c.id}`;
                    const howKey = `rta-how-${c.id}`;
                    const historyExpanded = !!expandedDesc[historyKey];
                    const howExpanded = !!expandedDesc[howKey];
                    const longHistory = history.length > descLimit;
                    const longHow = howOccurred.length > descLimit;
                    const shownHistory = historyExpanded || !longHistory ? history : `${history.slice(0, descLimit)}...`;
                    const shownHow = howExpanded || !longHow ? howOccurred : `${howOccurred.slice(0, descLimit)}...`;
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
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{c.case_number || "--"}</td>
                        <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{rtaCaseServiceNumber(c) || "--"}</td>
                        <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{rtaCaseRank(c) || "--"}</td>
                        <td className="px-4 py-2.5 text-gray-300 min-w-[160px] max-w-[240px]">
                          <p className="line-clamp-2 break-words">{rtaCaseUnit(c) || "--"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{rtaCaseAccused(c) || "--"}</td>
                        <td className="px-4 py-2.5 text-gray-200 min-w-[180px] max-w-[260px]">
                          <p className="line-clamp-2 break-words">{rtaCaseOffence(c) || "--"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 min-w-[180px] max-w-[260px]">
                          <p className="line-clamp-2 break-words">{rtaCasePlace(c) || "--"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{rtaCaseTime(c) || "--"}</td>
                        <td className="px-4 py-2.5 text-gray-300 min-w-[280px] max-w-[420px]">
                          <p className="whitespace-pre-wrap break-words">{shownHistory}</p>
                          {longHistory && (
                            <button
                              type="button"
                              onClick={(e) => toggleDescription(historyKey, e)}
                              className="mt-1 text-xs text-blue-400 hover:underline"
                            >
                              {historyExpanded ? "Show less" : "Show more"}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 min-w-[280px] max-w-[420px]">
                          <p className="whitespace-pre-wrap break-words">{shownHow}</p>
                          {longHow && (
                            <button
                              type="button"
                              onClick={(e) => toggleDescription(howKey, e)}
                              className="mt-1 text-xs text-blue-400 hover:underline"
                            >
                              {howExpanded ? "Show less" : "Show more"}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 min-w-[160px] max-w-[240px]">
                          <p className="line-clamp-2 break-words">{rtaCaseOriginatingUnit(c) || "--"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 min-w-[180px]">
                          {(() => {
                            const canUploadReport = canUploadTrafficAccidentReportForCase(c);
                            const hasAssignment = caseHasInvestigationAssignment(c);
                            const uploadDisabled = !hasAssignment || trafficReportSaving;
                            return (
                              <div className="flex flex-col items-start gap-1.5">
                                {c.traffic_accident_report ? (
                                  <ProtectedDocumentButton
                                    url={c.traffic_accident_report}
                                    label="traffic accident report"
                                    onError={(message) => showToast(message, "error")}
                                    className="text-xs text-blue-400 hover:underline"
                                  >
                                    View
                                  </ProtectedDocumentButton>
                                ) : (
                                  <span className="text-xs text-gray-500">Not attached</span>
                                )}
                                {canUploadReport && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(event) => openTrafficReportUploadFromRow(c, event)}
                                      disabled={uploadDisabled}
                                      title={hasAssignment ? "Upload Traffic Accident Report" : "Assign this case to an IO or team first"}
                                      className="rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-300"
                                    >
                                      {c.traffic_accident_report ? "Replace Report" : "Upload Report"}
                                    </button>
                                    {!hasAssignment && (
                                      <span className="text-[10px] font-medium text-amber-300">Assign IO/team first</span>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge
                            label={c.status}
                            style={STATUS_STYLE[c.status] || "bg-gray-600 text-gray-300"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
            <table className={`sticky-head w-full ${isDciFilter ? "min-w-[1760px]" : "min-w-[1520px]"} text-sm`}>
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-4 py-3 font-medium">Case #</th>
                  <th className="text-left px-4 py-3 font-medium">Service No</th>
                  <th className="text-left px-4 py-3 font-medium">Rank</th>
                  <th className="text-left px-4 py-3 font-medium">Accused</th>
                  <th className="text-left px-4 py-3 font-medium">Unit</th>
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
                  {showUnderInvestigationActionColumn && (
                    <th className="text-left px-4 py-3 font-medium">Action</th>
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
                  {!isDciFilter && showServedActionColumn && (
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                  )}
                  {!isDciFilter && isClosedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Abstract</th>
                  )}
                  {!isDciFilter && isClosedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Date Closed</th>
                  )}
                  {!isDciFilter && isClosedFilter && (
                    <th className="text-left px-4 py-3 font-medium">Verdict</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  (() => {
                    const desc = caseDisplayDescription(c) || "--";
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
                    <td className="px-4 py-2.5 text-gray-300 min-w-[160px] max-w-[240px]">
                      <p className="line-clamp-2 break-words">{accusedUnitLabel(c) || "--"}</p>
                    </td>
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
                    {showUnderInvestigationActionColumn && (
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {canServeCase(c) ? (
                          <button
                            type="button"
                            onClick={(event) => openServeFromRow(c, event)}
                            className="px-2.5 py-1 rounded text-xs font-medium bg-purple-700/80 hover:bg-purple-600 text-white transition-colors"
                          >
                            Serve Case
                          </button>
                        ) : c.served_abstract ? (
                          <button
                            type="button"
                            onClick={(event) => openAcknowledgementFromRow(c, event)}
                            className="px-2.5 py-1 rounded text-xs font-medium bg-sky-700/80 hover:bg-sky-600 text-white transition-colors"
                          >
                            Attach Acknowledgement
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">--</span>
                        )}
                      </td>
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
                    {!isDciFilter && showServedActionColumn && (
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {canCloseServedCases ? (
                          // For Court Martial cases: if abstract is not yet acknowledged, keep Close disabled with tooltip.
                          // If abstract is acknowledged, offer a 'Court Martial update' action that opens the case detail so the user can manage milestones.
                          c.criminal_offence_type === "court_martial" ? (
                            c.abstract_acknowledged_at ? (
                              <button
                                type="button"
                                onClick={(e) => openCourtMartialProgressFromRow(c, e)}
                                className="px-2.5 py-1 rounded text-xs font-medium bg-blue-700/80 hover:bg-blue-600 text-white transition-colors"
                                title="Open Court Martial progress to add or edit milestones"
                              >
                                Court Martial update
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); /* keep existing behaviour: do not open */ }}
                                disabled
                                className="px-2.5 py-1 rounded text-xs font-medium bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed text-white transition-colors"
                                title="Court Martial cases can be closed after abstract acknowledgement."
                              >
                                Close Case
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openCourtCloseModal(c); }}
                              className="px-2.5 py-1 rounded text-xs font-medium bg-green-700/80 hover:bg-green-600 text-white transition-colors"
                            >
                              Close Case
                            </button>
                          )
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {!c.abstract_acknowledged_at && c.served_abstract && String(c.criminal_offence_type || "").toLowerCase() !== "dci_civ_police" && (
                              <button type="button" onClick={(e) => openAcknowledgementFromRow(c, e)} disabled={rowActionSavingId === c.id || unitWorkflowSaving} className="px-2.5 py-1 rounded text-xs font-medium bg-sky-700/80 hover:bg-sky-600 disabled:opacity-50 text-white transition-colors">Attach Acknowledgement</button>
                            )}
                            {c.abstract_acknowledged_at && !["dci_civ_police", "court_martial"].includes(String(c.criminal_offence_type || "").toLowerCase()) && !["pending", "approved"].includes(c.unit_closure_status) && (
                              <button type="button" onClick={(e) => openClosurePrompt(c, e)} disabled={rowActionSavingId === c.id || unitWorkflowSaving} className="px-2.5 py-1 rounded text-xs font-medium bg-amber-700/80 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors">Request Closure</button>
                            )}
                            <button type="button" onClick={(e) => { e.stopPropagation(); selectCase(c); }} className="px-2.5 py-1 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors">Details</button>
                          </div>
                        )}
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
            )}
            </div>
          )}
        </div>

        {/* ── Case detail panel ──────────────────────────────────── */}
        <PaginationControls
          page={page}
          pageSize={pageSize}
          totalCount={caseCount}
          itemLabel="cases"
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          variant="dark"
        />

        {selected && !taskModalMode && (
          <div
            className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8"
            role="dialog"
            aria-modal="true"
            onClick={() => setSelected(null)}
          >
          <div ref={detailPanelRef} className="relative w-full max-w-5xl rounded-xl bg-gray-800 p-5 space-y-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>

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
              {caseDisplayDescription(selected) && (
                <p className="text-sm text-gray-400 mt-1">{caseDisplayDescription(selected)}</p>
              )}
            </div>

            {supportsUnitServiceAcknowledgement && (isAccusedUnitUser || ((isHqsAdmin || isSuperuser) && supportsUnitClosureWorkflow && selected.unit_closure_status === "pending")) && (
              <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionLabel>Unit service workflow</SectionLabel>
                  {selected.unit_closure_status && (
                    <span className="inline-block rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium capitalize text-sky-200">
                      Closure {selected.unit_closure_status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                {selected.served_abstract && (
                  <ProtectedDocumentButton url={selected.served_abstract} label="abstract of evidence" className="text-xs text-blue-300 hover:underline">
                    View abstract of evidence
                  </ProtectedDocumentButton>
                )}
                {isAccusedUnitUser && ["under_investigation", "served"].includes(selected.status) && selected.served_abstract && !selected.abstract_acknowledged_at && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300">The abstract has been served. Attach the signed acknowledgement sheet to confirm receipt and complete service.</p>
                    <input type="file" accept="application/pdf,.pdf" onChange={(event) => setAcknowledgementFile(event.target.files[0] || null)} className="w-full text-xs text-gray-400" />
                    <button type="button" onClick={acknowledgeServedCase} disabled={unitWorkflowSaving} className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium">
                      {unitWorkflowSaving ? "Saving..." : "Acknowledge Abstract Received"}
                    </button>
                  </div>
                )}
                {selected.abstract_acknowledged_at && (
                  <div className="space-y-1">
                    <p className="text-xs text-emerald-300">Abstract acknowledged{selected.abstract_acknowledged_by_name ? ` by ${selected.abstract_acknowledged_by_name}` : ""}.</p>
                    {selected.abstract_acknowledgement_form && (
                      <ProtectedDocumentButton url={selected.abstract_acknowledgement_form} label="acknowledgement form" className="text-xs text-blue-300 hover:underline">
                        View acknowledgement form
                      </ProtectedDocumentButton>
                    )}
                  </div>
                )}
                {supportsUnitClosureWorkflow && isAccusedUnitUser && selected.status === "served" && selected.abstract_acknowledged_at && selected.unit_closure_status !== "pending" && selected.unit_closure_status !== "approved" && (
                  <button type="button" onClick={() => openClosurePrompt(selected)} disabled={unitWorkflowSaving} className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium">
                    {unitWorkflowSaving ? "Sending..." : "Request Closure from Admin HQs"}
                  </button>
                )}
                {supportsUnitClosureWorkflow && isAccusedUnitUser && selected.status !== "closed" && (
                  <div className="space-y-2 border-t border-sky-500/20 pt-3">
                    <p className="text-xs text-gray-300">Clearance certificate</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="file" accept="application/pdf,.pdf" onChange={(event) => setClearanceFile(event.target.files[0] || null)} className="min-w-0 flex-1 text-xs text-gray-400" />
                      <button type="button" onClick={uploadClearanceCertificate} disabled={unitWorkflowSaving || !clearanceFile} className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium">
                        Attach Clearance Certificate
                      </button>
                    </div>
                    {selected.clearance_certificate && <ProtectedDocumentButton url={selected.clearance_certificate} label="clearance certificate" className="text-xs text-blue-300 hover:underline">View current certificate</ProtectedDocumentButton>}
                  </div>
                )}
                {supportsUnitClosureWorkflow && (isHqsAdmin || isSuperuser) && selected.unit_closure_status === "pending" && (
                  <div className="space-y-2 border-t border-sky-500/20 pt-3">
                    <textarea value={closureReviewComment} onChange={(event) => setClosureReviewComment(event.target.value)} rows={2} placeholder="Comment or rejection reason" className="w-full rounded bg-gray-700 border border-gray-600 px-3 py-2 text-sm text-white" />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => reviewUnitClosure("approve")} disabled={unitWorkflowSaving} className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium">Approve Closure Request</button>
                      <button type="button" onClick={() => reviewUnitClosure("reject")} disabled={unitWorkflowSaving} className="px-3 py-2 rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium">Reject with Comment</button>
                    </div>
                  </div>
                )}
                <ErrMsg msg={unitWorkflowErr} />
              </div>
            )}

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
                  <Field label="Tasking REF No" value={selected.tasking_no} />
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
                  <Field label="RFI REF No" value={selected.rfi_no} />
                  <Field label="RFI Date" value={normalizeDateForDisplay(selected.rfi_date)} />
                </div>
              </div>
            )}

            {selectedIsRta && (
              <div>
                <SectionLabel>Road Traffic Accident</SectionLabel>
                <div className="grid grid-cols-1 gap-3 bg-gray-700/30 rounded-lg p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">Traffic Accident Report</p>
                    {selected.traffic_accident_report ? (
                      <ProtectedDocumentButton
                        url={selected.traffic_accident_report}
                        label="traffic accident report"
                        onError={(message) => showToast(message, "error")}
                        className="text-sm text-blue-400 hover:underline"
                      >
                        View Report
                      </ProtectedDocumentButton>
                    ) : (
                      <p className="text-sm text-amber-300">Pending upload</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">Service Vehicle Damage</p>
                    <p className="text-sm text-gray-200">{selected.rta_service_vehicle_damaged ? "Damaged" : "No damage recorded"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">Damage Authority</p>
                    {selected.rta_service_vehicle_damaged ? (
                      selected.rta_damage_authority ? (
                        <ProtectedDocumentButton
                          url={selected.rta_damage_authority}
                          label="RTA damage authority"
                          onError={(message) => showToast(message, "error")}
                          className="text-sm text-blue-400 hover:underline"
                        >
                          {rtaDamageAuthorityLabel(selected.rta_damage_authority_source) || "View Authority"}
                        </ProtectedDocumentButton>
                      ) : (
                        <p className="text-sm text-amber-300">Required before HQ closure</p>
                      )
                    ) : (
                      <p className="text-sm text-gray-200">Not required</p>
                    )}
                  </div>
                  {selected.traffic_accident_report_uploaded_at && (
                    <Field
                      label="Report Uploaded"
                      value={new Date(selected.traffic_accident_report_uploaded_at).toLocaleString("en-GB")}
                    />
                  )}
                </div>
              </div>
            )}

            {selectedIsRta && canUploadTrafficAccidentReport && (
              <div className="border-t border-gray-700 pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <SectionLabel>Traffic Accident Report</SectionLabel>
                    <p className="text-xs text-gray-400">
                      Required for every RTA before HQ Admin can close the case. Authority is required later only when the service vehicle is damaged.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTrafficReportUpload}
                    disabled={trafficReportSaving}
                    className="px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                  >
                    {showTrafficReportUpload ? "Cancel Report Upload" : (selected.traffic_accident_report ? "Replace Report" : "Attach Report")}
                  </button>
                </div>
                {showTrafficReportUpload && (
                  <form onSubmit={handleTrafficAccidentReportUpload} className="bg-gray-700/40 rounded-lg p-4 space-y-3">
                    <ScannableFileInput
                      label="Traffic Accident Report *"
                      file={trafficReportFile}
                      onFileChange={(file) => { setTrafficReportFile(file); if (trafficReportErr) setTrafficReportErr(""); }}
                      onScanError={setTrafficReportErr}
                      accept="application/pdf,.pdf"
                      documentType="traffic-accident-report"
                      disabled={trafficReportSaving}
                      helperText="Upload the signed Traffic Accident Report as a PDF."
                    />
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Service Vehicle Damaged *</label>
                      <select
                        value={trafficReportDamaged}
                        onChange={(e) => {
                          setTrafficReportDamaged(e.target.value);
                          if (trafficReportErr) setTrafficReportErr("");
                        }}
                        disabled={trafficReportSaving || !canEditTrafficDamageStatus}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      >
                        <option value="no">No damage to service vehicle</option>
                        <option value="yes">Service vehicle damaged</option>
                      </select>
                      {!canEditTrafficDamageStatus && (
                        <p className="mt-1 text-xs text-gray-400">
                          Only Superuser or HQ Admin can change service vehicle damage status.
                        </p>
                      )}
                    </div>
                    <ErrMsg msg={trafficReportErr} />
                    <button
                      type="submit"
                      disabled={trafficReportSaving || !trafficReportFile}
                      className="w-full py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded text-sm font-medium"
                    >
                      {trafficReportSaving ? "Saving..." : "Submit Traffic Accident Report"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {(selected.closure_basis || selected.part_ii_order_serial_no || selected.part_ii_order_date) && (
              <div>
                <SectionLabel>Closure</SectionLabel>
                <div className="grid grid-cols-2 gap-3 bg-gray-700/30 rounded-lg p-3">
                  <Field label="Closed With" value={closureBasisLabel(selected.closure_basis)} />
                  <Field label="Part II Order Serial No" value={selected.part_ii_order_serial_no} />
                  <Field label="Part II Order Date" value={normalizeDateForDisplay(selected.part_ii_order_date)} />
                </div>
              </div>
            )}

            {/* Remarks / Verdict */}
            {(selected.action_taken || selected.remarks) && (
              <div className="space-y-2">
                {selected.action_taken && (
                  <div>
                    <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-1">Verdict</p>
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

            {selectedIsCourtMartial && !courtMartialProgressUnlocked && (
              <div className="border-t border-gray-700 pt-4">
                <SectionLabel>Court Martial Progress</SectionLabel>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Court Martial progress becomes available after the case is served and the abstract is acknowledged.
                </div>
              </div>
            )}

            {canManageSelectedCourtMartialProgress && courtMartialProgressUnlocked && (
              <div id="court-milestones" className="border-t border-gray-700 pt-4 space-y-3">
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
                      <label className="text-xs text-gray-400 block mb-1">Tasking REF No *</label>
                      <input
                        type="text"
                        value={taskingNo}
                        onChange={(e) => { setTaskingNo(e.target.value); if (taskErr) setTaskErr(""); }}
                        placeholder="Enter tasking reference number"
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Tasking Date *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={taskingDate}
                        onChange={(e) => setTaskingDate(e.target.value)}
                        placeholder="dd/mm/yyyy"
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
                  {isInvestigator && ["under_investigation", "pending"].includes(selected.status) && (
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard/guardrooms?case=${selected.id}`)}
                      className="px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded text-xs font-medium"
                    >
                      Request Guardroom
                    </button>
                  )}
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
            {(canTask || canServeCase(selected)) &&
              ["under_investigation", "pending", "served", "referred"].includes(selected.status) && (
              <div className="border-t border-gray-700 pt-4">
                <SectionLabel>Update Status</SectionLabel>
                <ErrMsg msg={statusErr} />
                <div className="flex flex-wrap gap-2 mt-2">
                  {["under_investigation", "pending"].includes(selected.status) && !selectedIsDci && canServeCase(selected) && !serveFormOpen && (
                    <button
                      onClick={() => { setServeFormOpen(true); setStatusErr(""); }}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Serve Case
                    </button>
                  )}
                  {selected.status === "under_investigation" && !selectedIsDci && isInvestigator && (
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
                  {selected.status === "served" && (isHqsAdmin || isSuperuser) && (!selectedIsCourtMartial || selected.abstract_acknowledged_at) && (
                    <button
                      onClick={() => openCourtCloseModal(selected)}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Close Case
                    </button>
                  )}
                  {selected.status === "referred" ? (
                    <button
                      onClick={() => handleStatus("under_investigation")}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Undo Referral
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatus("referred")}
                      disabled={statusSaving}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Refer Case
                    </button>
                  )}
                </div>
                {serveFormOpen && ["under_investigation", "pending"].includes(selected.status) && canServeCase(selected) && (
                  <div className="mt-3 rounded-lg border border-purple-500/30 bg-purple-950/20 p-4 space-y-3">
                    <p className="text-xs text-gray-300">Attach the abstract PDF to serve this case. Serving cannot be completed without it.</p>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(event) => { setServeAbstractFile(event.target.files[0] || null); setStatusErr(""); }}
                      disabled={statusSaving}
                      className="w-full text-xs text-gray-400"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={serveCaseWithAbstract} disabled={statusSaving || !serveAbstractFile} className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium">
                        {statusSaving ? "Serving..." : "Serve with Abstract"}
                      </button>
                      <button type="button" onClick={() => { setServeFormOpen(false); setServeAbstractFile(null); }} disabled={statusSaving} className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-medium">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
          </div>
        )}
      </div>

      {servePromptCase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget && !statusSaving) {
              setServePromptCase(null);
              setServeAbstractFile(null);
              setStatusErr("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-gray-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white">Attach Abstract of Evidence</h3>
                <p className="mt-1 font-mono text-xs text-gray-400">{servePromptCase.case_number}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setServePromptCase(null);
                  setServeAbstractFile(null);
                  setStatusErr("");
                }}
                disabled={statusSaving}
                className="text-gray-500 hover:text-white disabled:opacity-40"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 py-4">
              <p className="text-sm text-gray-300">
                Attach the abstract PDF to serve this case. The case will not be served without the document.
              </p>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  setServeAbstractFile(event.target.files[0] || null);
                  setStatusErr("");
                }}
                disabled={statusSaving}
                className="w-full text-xs text-gray-400"
              />
              <ErrMsg msg={statusErr} />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-700 pt-3">
              <button
                type="button"
                onClick={() => {
                  setServePromptCase(null);
                  setServeAbstractFile(null);
                  setStatusErr("");
                }}
                disabled={statusSaving}
                className="rounded bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => serveCaseWithAbstract(servePromptCase)}
                disabled={statusSaving || !serveAbstractFile}
                className="rounded bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {statusSaving ? "Serving..." : "Serve Case"}
              </button>
            </div>
          </div>
        </div>
      )}

      {acknowledgementPromptCase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget && !unitWorkflowSaving) {
              setAcknowledgementPromptCase(null);
              setAcknowledgementFile(null);
              setUnitWorkflowErr("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-gray-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white">Attach Acknowledgement Sheet</h3>
                <p className="mt-1 font-mono text-xs text-gray-400">{acknowledgementPromptCase.case_number}</p>
              </div>
              <button type="button" onClick={() => { setAcknowledgementPromptCase(null); setAcknowledgementFile(null); setUnitWorkflowErr(""); }} disabled={unitWorkflowSaving} className="text-gray-500 hover:text-white disabled:opacity-40">✕</button>
            </div>
            <div className="space-y-3 py-4">
              <p className="text-sm text-gray-300">Upload the signed acknowledgement sheet to confirm receipt of the abstract. The case will then move to Served.</p>
              <input type="file" accept="application/pdf,.pdf" onChange={(event) => { setAcknowledgementFile(event.target.files[0] || null); setUnitWorkflowErr(""); }} disabled={unitWorkflowSaving} className="w-full text-xs text-gray-400" />
              <ErrMsg msg={unitWorkflowErr} />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-700 pt-3">
              <button type="button" onClick={() => { setAcknowledgementPromptCase(null); setAcknowledgementFile(null); setUnitWorkflowErr(""); }} disabled={unitWorkflowSaving} className="rounded bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => acknowledgeServedCase(acknowledgementPromptCase)} disabled={unitWorkflowSaving || !acknowledgementFile} className="rounded bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">{unitWorkflowSaving ? "Uploading..." : "Attach and Mark Served"}</button>
            </div>
          </div>
        </div>
      )}

      {closurePromptCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-gray-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white">Request Case Closure</h3>
                <p className="mt-1 font-mono text-xs text-gray-400">{closurePromptCase.case_number}</p>
              </div>
              <button type="button" onClick={() => { setClosurePromptCase(null); setClosureChargesheetFile(null); setUnitWorkflowErr(""); }} disabled={unitWorkflowSaving} className="text-gray-500 hover:text-white disabled:opacity-40">✕</button>
            </div>
            <div className="space-y-3 py-4">
              <p className="text-sm text-gray-300">Attach the charge sheet before sending this closure request to Admin HQs.</p>
              <input type="file" accept="application/pdf,.pdf" onChange={(event) => { setClosureChargesheetFile(event.target.files[0] || null); setUnitWorkflowErr(""); }} disabled={unitWorkflowSaving} className="w-full text-xs text-gray-400" />
              <ErrMsg msg={unitWorkflowErr} />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-700 pt-3">
              <button type="button" onClick={() => { setClosurePromptCase(null); setClosureChargesheetFile(null); setUnitWorkflowErr(""); }} disabled={unitWorkflowSaving} className="rounded bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => requestUnitClosure(closurePromptCase)} disabled={unitWorkflowSaving || !closureChargesheetFile} className="rounded bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">{unitWorkflowSaving ? "Sending..." : "Attach and Request Closure"}</button>
            </div>
          </div>
        </div>
      )}

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
              {activeCloseCaseIsRta
                ? "Close Road Traffic Accident Case"
                : activeCloseCaseIsCourtMartial
                  ? "Close Court Martial Case"
                  : activeCloseCaseIsDci
                    ? "Close DCI / Civ Police Case"
                    : "Close Case"}
            </h3>
            <p className="text-xs text-gray-400">
              {activeCloseCaseIsRta ? (
                "Traffic Accident Report is required for every RTA. Authority from HQ KA Moves or Legal is required only when the service vehicle is damaged."
              ) : (
                <>
                  Select the closure basis and record the verdict. Supporting PDFs can be attached where available.
                </>
              )}
            </p>

            {activeCloseCaseIsRta ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">Traffic Accident Report</p>
                      {activeCloseCase.traffic_accident_report ? (
                        <ProtectedDocumentButton
                          url={activeCloseCase.traffic_accident_report}
                          label="traffic accident report"
                          onError={(message) => setCourtCloseErr(message)}
                          className="text-sm text-blue-400 hover:underline"
                        >
                          View Report
                        </ProtectedDocumentButton>
                      ) : (
                        <p className="text-sm text-red-300">Missing. Attach report before closing.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">Service Vehicle Damage</p>
                      <p className="text-sm text-gray-200">
                        {activeCloseCase.rta_service_vehicle_damaged ? "Damaged" : "No damage recorded"}
                      </p>
                    </div>
                  </div>
                </div>

                {activeCloseCase.rta_service_vehicle_damaged ? (
                  <div className="rounded-lg border border-gray-700 bg-gray-700/40 p-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Authority Source *</label>
                      <select
                        value={closeRtaAuthoritySource}
                        onChange={(e) => {
                          setCloseRtaAuthoritySource(e.target.value);
                          setCourtCloseErr("");
                        }}
                        disabled={courtCloseSaving}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      >
                        <option value="">Select authority source...</option>
                        {RTA_DAMAGE_AUTHORITY_SOURCES.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    {activeCloseCase.rta_damage_authority && (
                      <div>
                        <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">Existing Authority</p>
                        <ProtectedDocumentButton
                          url={activeCloseCase.rta_damage_authority}
                          label="RTA damage authority"
                          onError={(message) => setCourtCloseErr(message)}
                          className="text-sm text-blue-400 hover:underline"
                        >
                          {rtaDamageAuthorityLabel(activeCloseCase.rta_damage_authority_source) || "View Authority"}
                        </ProtectedDocumentButton>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-gray-400 block mb-1">
                        Authority PDF {activeCloseCase.rta_damage_authority ? "(replace optional)" : "*"}
                      </label>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          setCloseRtaAuthorityFile(e.target.files?.[0] || null);
                          setCourtCloseErr("");
                        }}
                        disabled={courtCloseSaving}
                        className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-700 disabled:opacity-50"
                      />
                      {closeRtaAuthorityFile && (
                        <p className="mt-2 text-xs text-gray-300">Selected: {closeRtaAuthorityFile.name}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-700 bg-gray-700/30 px-4 py-3 text-sm text-gray-300">
                    Authority attachment is not required because no service vehicle damage is recorded.
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Verdict *</label>
                  <textarea
                    value={closeActionTaken}
                    onChange={(e) => {
                      setCloseActionTaken(e.target.value);
                      setCourtCloseErr("");
                    }}
                    disabled={courtCloseSaving}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                    rows={4}
                    placeholder="Enter the final RTA verdict"
                  />
                </div>
              </div>
            ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Close With *</label>
                  <select
                    value={closeClosureBasis}
                    onChange={(e) => {
                      setCloseClosureBasis(e.target.value);
                      setCloseChargesheetFile(null);
                      setCourtCloseErr("");
                    }}
                    disabled={courtCloseSaving}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                  >
                    <option value="">Select close document...</option>
                    {CLOSURE_BASIS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                {closeClosureBasis && closeClosureBasis !== "part_ii_orders" && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{closureDocumentLabel(closeClosureBasis)} *</label>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => {
                        setCloseChargesheetFile(e.target.files?.[0] || null);
                        setCourtCloseErr("");
                      }}
                      disabled={courtCloseSaving}
                      className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-700 disabled:opacity-50"
                    />
                    {closeChargesheetFile && (
                      <p className="mt-2 text-xs text-gray-300">
                        Selected: {closeChargesheetFile.name}
                      </p>
                    )}
                  </div>
                )}
                {closeClosureBasis === "part_ii_orders" && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Part II Order Serial No *</label>
                      <input
                        type="text"
                        value={closePartIiOrderSerialNo}
                        onChange={(e) => { setClosePartIiOrderSerialNo(e.target.value); setCourtCloseErr(""); }}
                        disabled={courtCloseSaving}
                        placeholder="Enter serial number"
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Part II Order Date *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={closePartIiOrderDate}
                        onChange={(e) => { setClosePartIiOrderDate(e.target.value); setCourtCloseErr(""); }}
                        disabled={courtCloseSaving}
                        placeholder="dd/mm/yyyy"
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      />
                    </div>
                  </div>
                )}
                {closeClosureBasis && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Verdict *</label>
                    <textarea
                      value={closeActionTaken}
                      onChange={(e) => setCloseActionTaken(e.target.value)}
                      disabled={courtCloseSaving}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      rows={4}
                      placeholder="Enter the final verdict"
                    />
                  </div>
                )}
              </div>
              {judgmentFileRows.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end bg-gray-700/40 rounded-lg p-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Supporting PDF Label #{idx + 1}</label>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateJudgmentFileRow(row.id, { label: e.target.value })}
                      disabled={courtCloseSaving}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
                      placeholder="e.g. Judgment Order, covering memo, or related PDF"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Supporting PDF</label>
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
            )}

            <div className="flex items-center justify-between gap-3">
              {!activeCloseCaseIsRta ? (
                <button
                  type="button"
                  onClick={addJudgmentFileRow}
                  disabled={courtCloseSaving}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                >
                  + Add Supporting PDF
                </button>
              ) : (
                <span />
              )}
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
                  {courtCloseSaving ? "Closing..." : (activeCloseCaseIsRta ? "Close RTA Case" : "Close Case")}
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
            <label className="text-xs text-gray-400 block mb-1">Tasking REF No *</label>
            <input
              type="text"
              value={taskingNo}
              onChange={(e) => { setTaskingNo(e.target.value); if (taskErr) setTaskErr(""); }}
              placeholder="Enter tasking reference number"
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Tasking Date *</label>
            <input
                  type="text"
                  inputMode="numeric"
                  value={taskingDate}
                  onChange={(e) => setTaskingDate(e.target.value)}
                  placeholder="dd/mm/yyyy"
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
      {criminalAssignOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Add existing cases</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{criminalAssignmentLabel}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Select one or more non-actioned cases. The selected cases will be moved to {criminalAssignmentLabel}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCriminalAssignmentModal}
                disabled={criminalAssignSaving}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(240px,1fr)_auto_auto]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Search cases</span>
                <input
                  type="text"
                  value={criminalAssignSearch}
                  onChange={(event) => setCriminalAssignSearch(event.target.value)}
                  placeholder="Case #, service no, accused, unit, offence, description..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <button
                type="button"
                onClick={toggleAllVisibleCriminalAssignmentCases}
                disabled={criminalAssignLoading || criminalAssignSaving || criminalAssignVisibleCases.length === 0}
                className="self-end rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allCriminalAssignVisibleSelected ? "Clear Shown" : "Select Shown"}
              </button>
              <button
                type="button"
                onClick={loadCriminalAssignmentCandidates}
                disabled={criminalAssignLoading || criminalAssignSaving}
                className="self-end rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <ErrMsg msg={criminalAssignErr} />

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              {criminalAssignLoading ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">Loading eligible cases...</div>
              ) : criminalAssignVisibleCases.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No eligible non-actioned cases found.
                </div>
              ) : (
                <div className="max-h-[55vh] overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="w-12 px-3 py-3">Select</th>
                        <th className="px-3 py-3">Case #</th>
                        <th className="px-3 py-3">Service No</th>
                        <th className="px-3 py-3">Rank</th>
                        <th className="px-3 py-3">Accused</th>
                        <th className="px-3 py-3">Unit</th>
                        <th className="px-3 py-3">Offence</th>
                        <th className="px-3 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {criminalAssignVisibleCases.map((caseObj) => {
                        const checked = criminalAssignSelectedIds.has(caseObj.id);
                        return (
                          <tr
                            key={caseObj.id}
                            className={`cursor-pointer transition-colors ${checked ? "bg-blue-50" : "bg-white hover:bg-slate-50"}`}
                            onClick={() => !criminalAssignSaving && toggleCriminalAssignmentCase(caseObj.id)}
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={criminalAssignSaving}
                                onChange={() => toggleCriminalAssignmentCase(caseObj.id)}
                                onClick={(event) => event.stopPropagation()}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-blue-700">{caseObj.case_number || "--"}</td>
                            <td className="px-3 py-3">{caseObj.accused_service_number || "--"}</td>
                            <td className="px-3 py-3">{caseObj.accused_rank || "--"}</td>
                            <td className="px-3 py-3">{caseObj.accused_name || "--"}</td>
                            <td className="px-3 py-3">{accusedUnitLabel(caseObj) || "--"}</td>
                            <td className="px-3 py-3">{caseObj.offence_name || caseObj.offence || "--"}</td>
                            <td className="px-3 py-3">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                {STATUS_CHIP_META[caseObj.status]?.label || caseObj.status || "--"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {criminalAssignSelectedIds.size} selected
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={closeCriminalAssignmentModal}
                  disabled={criminalAssignSaving}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={assignSelectedCasesToCriminalType}
                  disabled={criminalAssignSaving || criminalAssignLoading || criminalAssignSelectedIds.size === 0}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {criminalAssignSaving ? "Adding..." : `Add to ${criminalAssignmentLabel}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
        >
          <div
            className="w-full max-w-4xl bg-white rounded-2xl p-6 space-y-4 relative text-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={requestCloseCaseForm}
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
              {caseFormMode === "create" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <CaseFormSectionLabel>Create case from</CaseFormSectionLabel>
                  <div className="grid gap-3 md:grid-cols-3">
                    {CASE_SOURCE_OPTIONS.map((option) => {
                      const selectedSource = caseSource === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => chooseCaseSource(option.value)}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            selectedSource
                              ? "border-blue-500 bg-blue-50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                          }`}
                        >
                          <span className="block text-sm font-bold text-slate-950">{option.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-600">{option.summary}</span>
                        </button>
                      );
                    })}
                  </div>
                  {caseSource && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">
                      <span>
                        Selected: <span className="font-semibold text-blue-700">{caseSourceLabel(caseSource)}</span>
                      </span>
                      <button type="button" onClick={changeCaseSource} className="font-semibold text-blue-700 hover:text-blue-900">
                        Change
                      </button>
                    </div>
                  )}
                </div>
              )}

              {caseFormMode === "create" && !activeCaseSource && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  Choose RFI Case, Incident, or Road Traffic Accident to continue.
                </div>
              )}

              {activeCaseSource && !creatingFromRfi && !creatingFromRta && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <CaseFormSectionLabel>Case classification</CaseFormSectionLabel>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <CaseFormLabel>Offence</CaseFormLabel>
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
                          className={CASE_FORM_CONTROL}
                        >
                          <option value="">Use incident/RTA heading if not selected</option>
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
                          placeholder="Optional: type offence or use incident/RTA heading"
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
                        <option value="">Select...</option>
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
                          <option value="">Select...</option>
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
                          <option value="">Select...</option>
                          <option value="dci_civ_police">DCI / Civ Police</option>
                          <option value="court_martial">Court Martial</option>
                        </select>
                      </div>
                    )}

                    <div className="md:col-span-2">
                      <UnitAutocomplete
                        label="Submitting Unit *"
                        units={units}
                        value={createForm.submitting_unit}
                        onChange={(value) => setCreateForm((f) => ({ ...f, submitting_unit: value }))}
                        placeholder="Type submitting unit..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {creatingFromRfi && (
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
                    type="text"
                    inputMode="numeric"
                    value={createForm.date_of_offence}
                    onChange={(e) => setCreateForm((f) => ({ ...f, date_of_offence: e.target.value }))}
                    placeholder="dd/mm/yyyy"
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
                  <CaseFormLabel>RFI REF No{createForm.rfi_document ? " *" : ""}</CaseFormLabel>
                  <input
                    type="text"
                    value={createForm.rfi_no}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rfi_no: e.target.value }))}
                    placeholder="Enter RFI reference number"
                    required={caseFormMode === "create" && Boolean(createForm.rfi_document)}
                    className={CASE_FORM_CONTROL}
                  />
                </div>

                <div>
                  <CaseFormLabel>RFI Date{createForm.rfi_document ? " *" : ""}</CaseFormLabel>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={createForm.rfi_date}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rfi_date: e.target.value }))}
                    placeholder="dd/mm/yyyy"
                    required={caseFormMode === "create" && Boolean(createForm.rfi_document)}
                    className={CASE_FORM_CONTROL}
                  />
                </div>

                <div className="col-span-2">
                  <CaseFormLabel>Tasking REF No</CaseFormLabel>
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
              )}

              {creatingFromIncident && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <div className="mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">Incident Details</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="md:col-span-3">
                      <CaseFormLabel>Incident *</CaseFormLabel>
                      <TextAutocompleteInput
                        value={sourceCaseForm.incident_title}
                        onChange={(value) => updateSourceCaseField("incident_title", value)}
                        options={offenceNames}
                        placeholder="Type incident..."
                        required
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Date *</CaseFormLabel>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={sourceCaseForm.occurred_date}
                        onChange={(e) => updateSourceCaseField("occurred_date", e.target.value)}
                        placeholder="dd/mm/yyyy"
                        required
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Time *</CaseFormLabel>
                      <input
                        type="time"
                        value={sourceCaseForm.occurred_time}
                        onChange={(e) => updateSourceCaseField("occurred_time", e.target.value)}
                        required
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Place *</CaseFormLabel>
                      <input
                        value={sourceCaseForm.place}
                        onChange={(e) => updateSourceCaseField("place", e.target.value)}
                        placeholder="e.g. Along Juja Farm Road"
                        required
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Service No</CaseFormLabel>
                      <input
                        value={sourceCaseForm.service_member_number}
                        onChange={(e) => updateSourceCaseField("service_member_number", e.target.value)}
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Rank</CaseFormLabel>
                      <select
                        value={sourceCaseForm.service_member_rank}
                        onChange={(e) => updateSourceCaseField("service_member_rank", e.target.value)}
                        className={CASE_FORM_CONTROL}
                      >
                        <option value="">Select rank...</option>
                        {ALL_RANKS.map((rank) => (
                          <option key={rank} value={rank}>{rank}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <CaseFormLabel>Name</CaseFormLabel>
                      <input
                        value={sourceCaseForm.service_member_name}
                        onChange={(e) => updateSourceCaseField("service_member_name", e.target.value)}
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Unit *</CaseFormLabel>
                      <TextAutocompleteInput
                        value={sourceCaseForm.unit_involved}
                        onChange={(value) => updateSourceCaseField("unit_involved", value)}
                        options={unitNames}
                        placeholder="Type to select unit..."
                        required
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Originating Sub-Unit</CaseFormLabel>
                      <TextAutocompleteInput
                        value={sourceCaseForm.originating_unit}
                        onChange={(value) => updateSourceCaseField("originating_unit", value)}
                        options={originatingSubUnitOptions}
                        placeholder="Search Coy or detachment..."
                      />
                    </div>
                    <div className="md:col-span-3">
                      <CaseFormLabel>History of the Incident *</CaseFormLabel>
                      <textarea
                        value={sourceCaseForm.history}
                        onChange={(e) => updateSourceCaseField("history", e.target.value)}
                        className={`${CASE_FORM_CONTROL} min-h-28 resize-none`}
                        required
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Police / External OB Ref</CaseFormLabel>
                      <input
                        value={sourceCaseForm.police_ob_reference}
                        onChange={(e) => updateSourceCaseField("police_ob_reference", e.target.value)}
                        placeholder="e.g. OB No. 57/13/07/2026"
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                  </div>
                </div>
              )}

              {creatingFromRta && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <div className="mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">Road Traffic Accident Details</h4>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="md:col-span-3">
                      <CaseFormLabel>Road Traffic Accident Type *</CaseFormLabel>
                      <select
                        value={sourceCaseForm.road_traffic_type}
                        onChange={(e) => updateRoadTrafficType(e.target.value)}
                        required
                        className={CASE_FORM_CONTROL}
                      >
                        <option value="">Select accident type...</option>
                        {ROAD_TRAFFIC_TYPES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    {showRtaInjuredCount && (
                      <div>
                        <CaseFormLabel>Yankee (Injured) Count *</CaseFormLabel>
                        <input
                          type="number"
                          min={isInjuryRoadTrafficType(sourceCaseForm.road_traffic_type) ? "1" : "0"}
                          value={sourceCaseForm.injured_count}
                          onChange={(e) => {
                            const injured = e.target.value;
                            setSourceCaseForm((prev) => ({
                              ...prev,
                              injured_count: injured,
                              rta_casualties: syncRtaCasualtiesForCounts(prev.rta_casualties, prev.road_traffic_type, injured, prev.dead_count),
                            }));
                          }}
                          placeholder="0 means Nil"
                          required={isInjuryRoadTrafficType(sourceCaseForm.road_traffic_type)}
                          className={CASE_FORM_CONTROL}
                        />
                      </div>
                    )}
                    {showRtaDeadCount && (
                      <div>
                        <CaseFormLabel>Zulu (Dead) Count *</CaseFormLabel>
                        <input
                          type="number"
                          min={isFatalRoadTrafficType(sourceCaseForm.road_traffic_type) ? "1" : "0"}
                          value={sourceCaseForm.dead_count}
                          onChange={(e) => {
                            const dead = e.target.value;
                            setSourceCaseForm((prev) => ({
                              ...prev,
                              dead_count: dead,
                              rta_casualties: syncRtaCasualtiesForCounts(prev.rta_casualties, prev.road_traffic_type, prev.injured_count, dead),
                            }));
                          }}
                          placeholder="0 means Nil"
                          required={isFatalRoadTrafficType(sourceCaseForm.road_traffic_type)}
                          className={CASE_FORM_CONTROL}
                        />
                      </div>
                    )}
                    <div>
                      <CaseFormLabel>Date *</CaseFormLabel>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={sourceCaseForm.occurred_date}
                        onChange={(e) => updateSourceCaseField("occurred_date", e.target.value)}
                        placeholder="dd/mm/yyyy"
                        required
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Time *</CaseFormLabel>
                      <input
                        type="time"
                        value={sourceCaseForm.occurred_time}
                        onChange={(e) => updateSourceCaseField("occurred_time", e.target.value)}
                        required
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Place *</CaseFormLabel>
                      <input
                        value={sourceCaseForm.place}
                        onChange={(e) => updateSourceCaseField("place", e.target.value)}
                        placeholder="e.g. Along Juja Farm Road"
                        required
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Unit *</CaseFormLabel>
                      <TextAutocompleteInput
                        value={sourceCaseForm.unit_involved}
                        onChange={(value) => updateSourceCaseField("unit_involved", value)}
                        options={unitNames}
                        placeholder="Type to select unit..."
                        required
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Originating Sub-Unit</CaseFormLabel>
                      <TextAutocompleteInput
                        value={sourceCaseForm.originating_unit}
                        onChange={(value) => updateSourceCaseField("originating_unit", value)}
                        options={originatingSubUnitOptions}
                        placeholder="Search Coy or detachment..."
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Police / External OB Ref</CaseFormLabel>
                      <input
                        value={sourceCaseForm.police_ob_reference}
                        onChange={(e) => updateSourceCaseField("police_ob_reference", e.target.value)}
                        placeholder="e.g. OB No. 57/13/07/2026"
                        className={CASE_FORM_CONTROL}
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Service Vehicle Damaged *</CaseFormLabel>
                      <select
                        value={sourceCaseForm.service_vehicle_damaged}
                        onChange={(e) => updateSourceCaseField("service_vehicle_damaged", e.target.value)}
                        required
                        className={CASE_FORM_CONTROL}
                      >
                        <option value="no">No damage to service vehicle</option>
                        <option value="yes">Service vehicle damaged</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <CaseFormLabel>History of the Accident *</CaseFormLabel>
                      <textarea
                        value={sourceCaseForm.history}
                        onChange={(e) => updateSourceCaseField("history", e.target.value)}
                        className={`${CASE_FORM_CONTROL} min-h-28 resize-none`}
                        required
                      />
                    </div>
                    <div className="md:col-span-3">
                      <CaseFormLabel>How the Accident Occurred *</CaseFormLabel>
                      <textarea
                        value={sourceCaseForm.how_occurred}
                        onChange={(e) => updateSourceCaseField("how_occurred", e.target.value)}
                        className={`${CASE_FORM_CONTROL} min-h-28 resize-none`}
                        required
                      />
                    </div>
                    <div>
                      <CaseFormLabel>Damages {isRtaServiceVehicleDamaged(sourceCaseForm) ? "*" : ""}</CaseFormLabel>
                      <textarea
                        value={sourceCaseForm.damages}
                        onChange={(e) => updateSourceCaseField("damages", e.target.value)}
                        required={isRtaServiceVehicleDamaged(sourceCaseForm)}
                        placeholder={isRtaServiceVehicleDamaged(sourceCaseForm) ? "Describe service vehicle damage" : "Optional if there is no service vehicle damage"}
                        className={`${CASE_FORM_CONTROL} min-h-20 resize-none`}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <CaseFormLabel>Initial Action Taken</CaseFormLabel>
                      <textarea
                        value={sourceCaseForm.action_taken}
                        onChange={(e) => updateSourceCaseField("action_taken", e.target.value)}
                        className={`${CASE_FORM_CONTROL} min-h-20 resize-none`}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">Vehicles and Drivers</h4>
                      <button
                        type="button"
                        onClick={() => setSourceCaseForm((prev) => ({ ...prev, rta_vehicles: [...prev.rta_vehicles, emptyRtaVehicle()] }))}
                        className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Add Vehicle
                      </button>
                    </div>
                    {sourceCaseForm.rta_vehicles.map((vehicle, index) => (
                      <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle / Driver #{index + 1}</p>
                          {sourceCaseForm.rta_vehicles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSourceCaseForm((prev) => ({
                                ...prev,
                                rta_vehicles: prev.rta_vehicles.filter((_, vehicleIndex) => vehicleIndex !== index),
                              }))}
                              className="text-xs font-semibold text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                          <div>
                            <CaseFormLabel>Ownership</CaseFormLabel>
                            <select
                              value={vehicle.vehicle_type}
                              onChange={(e) => updateSourceRtaVehicle(index, "vehicle_type", e.target.value)}
                              className={CASE_FORM_CONTROL}
                            >
                              {RTA_VEHICLE_OWNERS.map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <CaseFormLabel>Vehicle Category</CaseFormLabel>
                            <select
                              value={vehicle.vehicle_body_type || "motor_vehicle"}
                              onChange={(e) => updateSourceRtaVehicle(index, "vehicle_body_type", e.target.value)}
                              className={CASE_FORM_CONTROL}
                            >
                              {RTA_VEHICLE_BODY_TYPES.map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <CaseFormLabel>Vehicle Details</CaseFormLabel>
                            <input
                              value={vehicle.vehicle_details}
                              onChange={(e) => updateSourceRtaVehicle(index, "vehicle_details", e.target.value)}
                              placeholder={vehicle.vehicle_body_type === "motorcycle" ? "Motorcycle reg, make, or description" : "Reg no, make, call sign"}
                              className={CASE_FORM_CONTROL}
                            />
                          </div>
                          <div>
                            <CaseFormLabel>Driver / Rider Type</CaseFormLabel>
                            <select
                              value={vehicle.driver_person_type}
                              onChange={(e) => updateSourceRtaVehicle(index, "driver_person_type", e.target.value)}
                              className={CASE_FORM_CONTROL}
                            >
                              <option value="service">Service Member</option>
                              <option value="civilian">Civilian</option>
                            </select>
                          </div>
                          {vehicle.driver_person_type === "service" && (
                            <div>
                              <CaseFormLabel>Driver / Rider Service *</CaseFormLabel>
                              <select
                                value={vehicle.driver_service || ""}
                                onChange={(e) => updateSourceRtaVehicle(index, "driver_service", e.target.value)}
                                required
                                className={CASE_FORM_CONTROL}
                              >
                                <option value="">Select service...</option>
                                {DRIVER_SERVICES.map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {vehicle.driver_person_type === "civilian" && (
                            <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={Boolean(vehicle.driver_unknown)}
                                onChange={(e) => updateSourceRtaVehicle(index, "driver_unknown", e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                              />
                              Civilian driver / rider unknown
                            </label>
                          )}
                          <div>
                            <CaseFormLabel>{vehicle.driver_person_type === "civilian" ? "Driver / Rider ID No" : "Driver / Rider Service No"}</CaseFormLabel>
                            <input
                              value={vehicle.driver_identifier}
                              onChange={(e) => updateSourceRtaVehicle(index, "driver_identifier", e.target.value)}
                              disabled={Boolean(vehicle.driver_unknown)}
                              className={CASE_FORM_CONTROL}
                            />
                          </div>
                          {vehicle.driver_person_type === "civilian" && (
                            <div>
                              <CaseFormLabel>Driving Licence No</CaseFormLabel>
                              <input
                                value={vehicle.driver_license_no || ""}
                                onChange={(e) => updateSourceRtaVehicle(index, "driver_license_no", e.target.value)}
                                disabled={Boolean(vehicle.driver_unknown)}
                                className={CASE_FORM_CONTROL}
                              />
                            </div>
                          )}
                          <div>
                            <CaseFormLabel>Driver / Rider Rank</CaseFormLabel>
                            <select
                              value={vehicle.driver_rank}
                              onChange={(e) => updateSourceRtaVehicle(index, "driver_rank", e.target.value)}
                              disabled={vehicle.driver_person_type === "civilian"}
                              className={CASE_FORM_CONTROL}
                            >
                              <option value="">{vehicle.driver_person_type === "civilian" ? "NIL" : "Select rank..."}</option>
                              {ALL_RANKS.map((rank) => (
                                <option key={rank} value={rank}>{rank}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <CaseFormLabel>Driver / Rider Name</CaseFormLabel>
                            <input
                              value={vehicle.driver_name}
                              onChange={(e) => updateSourceRtaVehicle(index, "driver_name", e.target.value)}
                              disabled={Boolean(vehicle.driver_unknown)}
                              className={CASE_FORM_CONTROL}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <CaseFormLabel>Driver / Rider Unit</CaseFormLabel>
                            <TextAutocompleteInput
                              value={vehicle.driver_unit}
                              onChange={(value) => updateSourceRtaVehicle(index, "driver_unit", value)}
                              options={unitNames}
                              disabled={vehicle.driver_person_type === "civilian"}
                              placeholder={vehicle.driver_person_type === "civilian" ? "Civilian / N/A" : "Type to select unit..."}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {sourceCaseForm.road_traffic_type && sourceCaseForm.road_traffic_type !== "non_injury" && (
                    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">Yankee / Zulu Details</h4>
                        <p className="mt-1 text-xs text-slate-500">Rows are generated from the injured and dead counts above. Select service member or civilian for each person.</p>
                      </div>
                      {sourceCaseForm.rta_casualties.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          No onboard personnel rows because injured and dead counts are Nil.
                        </p>
                      ) : sourceCaseForm.rta_casualties.map((casualty, index) => {
                        const status = casualty.casualty_status === "dead" ? "dead" : "injured";
                        return (
                          <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {status === "dead" ? "Zulu (Dead)" : "Yankee (Injured)"} #{index + 1}
                              </p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <div>
                                <CaseFormLabel>Status</CaseFormLabel>
                                <input
                                  value={status === "dead" ? "Dead" : "Injured"}
                                  readOnly
                                  className={`${CASE_FORM_CONTROL} bg-slate-100`}
                                />
                              </div>
                              <div>
                                <CaseFormLabel>Person Type</CaseFormLabel>
                                <select
                                  value={casualty.person_type}
                                  onChange={(e) => updateSourceRtaCasualty(index, "person_type", e.target.value)}
                                  className={CASE_FORM_CONTROL}
                                >
                                  <option value="service">Service Member</option>
                                  <option value="civilian">Civilian</option>
                                </select>
                              </div>
                              {casualty.person_type === "civilian" && (
                                <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(casualty.is_unknown)}
                                    onChange={(e) => updateSourceRtaCasualty(index, "is_unknown", e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                  />
                                  Civilian details unknown
                                </label>
                              )}
                              <div>
                                <CaseFormLabel>{casualty.person_type === "civilian" ? "ID No" : "Service No"}</CaseFormLabel>
                                <input
                                  value={casualty.identifier}
                                  onChange={(e) => updateSourceRtaCasualty(index, "identifier", e.target.value)}
                                  disabled={Boolean(casualty.is_unknown)}
                                  className={CASE_FORM_CONTROL}
                                />
                              </div>
                              <div>
                                <CaseFormLabel>Rank</CaseFormLabel>
                                <select
                                  value={casualty.rank}
                                  onChange={(e) => updateSourceRtaCasualty(index, "rank", e.target.value)}
                                  disabled={casualty.person_type === "civilian"}
                                  className={CASE_FORM_CONTROL}
                                >
                                  <option value="">{casualty.person_type === "civilian" ? "NIL" : "Select rank..."}</option>
                                  {ALL_RANKS.map((rank) => (
                                    <option key={rank} value={rank}>{rank}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <CaseFormLabel>Name</CaseFormLabel>
                                <input
                                  value={casualty.name}
                                  onChange={(e) => updateSourceRtaCasualty(index, "name", e.target.value)}
                                  disabled={Boolean(casualty.is_unknown)}
                                  className={CASE_FORM_CONTROL}
                                />
                              </div>
                              <div>
                                <CaseFormLabel>Unit</CaseFormLabel>
                                <TextAutocompleteInput
                                  value={casualty.unit}
                                  onChange={(value) => updateSourceRtaCasualty(index, "unit", value)}
                                  options={unitNames}
                                  disabled={casualty.person_type === "civilian"}
                                  placeholder={casualty.person_type === "civilian" ? "Civilian / N/A" : "Type to select unit..."}
                                />
                              </div>
                              {status === "injured" && (
                                <div>
                                  <CaseFormLabel>Injury Severity *</CaseFormLabel>
                                  <select
                                    value={casualty.injury_severity}
                                    onChange={(e) => updateSourceRtaCasualty(index, "injury_severity", e.target.value)}
                                    required
                                    className={CASE_FORM_CONTROL}
                                  >
                                    <option value="">Select severity...</option>
                                    {INJURY_SEVERITIES.map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <ErrMsg msg={createErr} />

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={requestCloseCaseForm}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSaving || (caseFormMode === "create" && !activeCaseSource)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {createSaving
                    ? (caseFormMode === "edit" ? "Saving..." : "Creating...")
                    : (caseFormMode === "edit" ? "Save Changes" : `Create ${caseSourceLabel(activeCaseSource)}`)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {discardCreateConfirmOpen && (
        <ActionModal
          eyebrow="Unsaved case"
          title="Discard this case form?"
          message="You have entered details that have not been saved. Keep editing to return to the form."
          confirmLabel="Discard form"
          cancelLabel="Keep editing"
          tone="amber"
          onCancel={() => setDiscardCreateConfirmOpen(false)}
          onConfirm={confirmDiscardCaseForm}
        />
      )}

      {caseDeleteTarget && (
        <ConfirmCaseDelete
          caseObj={caseDeleteTarget}
          saving={rowActionSavingId === caseDeleteTarget.id}
          onCancel={() => setCaseDeleteTarget(null)}
          onConfirm={handleDeleteCase}
        />
      )}

      {postCreateTaskPrompt && (
        <ActionModal
          eyebrow="Created"
          title={`${postCreateTaskPrompt.sourceLabel || "Case"} created successfully`}
          message="Do you want to assign this case to a battalion now, or leave it for later?"
          tone="blue"
          confirmLabel="Assign to Battalion Now"
          cancelLabel="Later"
          onConfirm={assignCreatedCaseNow}
          onCancel={assignCreatedCaseLater}
          disabled={!postCreateTaskPrompt.caseObj?.id}
        >
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-semibold">{postCreateTaskPrompt.caseObj?.case_number || "New case"}</p>
            {postCreateTaskPrompt.incidentNumber && (
              <p className="mt-1 text-xs text-blue-700">
                Linked incident: <span className="font-mono">{postCreateTaskPrompt.incidentNumber}</span>
              </p>
            )}
          </div>
        </ActionModal>
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
