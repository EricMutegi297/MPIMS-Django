import React, { useEffect, useMemo, useState } from "react";
import useAutoDismiss from "../hooks/useAutoDismiss";
import { formationService, incidentService, morningBriefService } from "../services/api";
import ActionModal from "./common/ActionModal";
import { isRoadTrafficAccidentIncident, ROAD_TRAFFIC_ACCIDENT_LABELS } from "../utils/caseTypes";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeNow() {
  const date = new Date();
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function formatDate(value) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateTimeValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfLocalDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatError(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (Array.isArray(data)) return data.join(", ");
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join(" | ");
  }
  return fallback;
}

const ALL_STATUSES = ["reported", "under_investigation", "resolved", "closed"];
const ALL_SEVERITIES = ["critical", "high", "medium", "low"];
const RANK_OPTIONS = [
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
const INJURY_SEVERITIES = [
  ["minor", "Minor"],
  ["serious", "Serious"],
  ["critical", "Critical"],
];
const VIEW_INCIDENT = "incident";
const VIEW_RTA = "rta";

function emptyCivilianVehicle() {
  return {
    vehicle_details: "",
    driver_identifier: "",
    driver_name: "",
    driver_unknown: false,
  };
}

function emptyRtaPerson(category = "yankee") {
  return {
    category,
    person_type: "service",
    is_unknown: false,
    identifier: "",
    rank: "",
    name: "",
    unit: "",
    injury_severity: "",
  };
}

const INIT_FORM = {
  incident_type: "",
  road_traffic_type: "",
  place: "",
  date: todayIso(),
  time: timeNow(),
  service_member_number: "",
  service_member_rank: "",
  service_member_name: "",
  service_vehicle: "",
  service_driver_number: "",
  service_driver_rank: "",
  service_driver_name: "",
  service_driver_unit: "",
  civilian_vehicle_involved: false,
  civilian_vehicles: [],
  yankee_count: "0",
  zulu_count: "0",
  rta_persons: [],
  unit_involved: "",
  originating_unit: "",
  history: "",
  how_occurred: "",
  police_ob_reference: "",
  severity: "medium",
};

const FORM_INPUT = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function FieldLabel({ children }) {
  return (
    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
      {children}
    </label>
  );
}

function textOrDash(value) {
  const text = String(value || "").trim();
  return text || "--";
}

function rtaServiceVehicleDisplay(value) {
  const raw = String(value || "").trim();
  if (!raw) return "--";
  const normalized = raw.replace(/\r/g, "").replace(/\s+/g, " ").trim();
  const matches = [...normalized.matchAll(/(?:^|\s)\d*\.?\s*Service vehicle:\s*(.*?)(?=(?:\s*;\s*Driver:|\s+Driver:|\s+\d+\.?\s*(?:Service|Civilian) vehicle:|$))/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (matches.length) return matches.join(", ");
  return textOrDash(
    normalized
      .replace(/^\d+\.?\s*/i, "")
      .replace(/^Service vehicle:\s*/i, "")
      .replace(/\s*;\s*Driver:.*$/i, "")
      .replace(/\s+Driver:.*$/i, "")
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function csvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, content, type) {
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

function registerLabel(mode) {
  return mode === VIEW_RTA ? "RTA Incidents" : "Incidents";
}

function registerFilename(mode) {
  return mode === VIEW_RTA ? "rta-incidents" : "incidents";
}

function exportColumns(mode) {
  if (mode === VIEW_RTA) {
    return [
      ["Incident #", (incident) => textOrDash(incident.incident_number)],
      ["Incident", (incident) => textOrDash(incident.incident_type)],
      ["Place", (incident) => textOrDash(incident.location)],
      ["Date", (incident) => formatDate(incident.date_occurred)],
      ["Time", (incident) => formatTime(incident.date_occurred)],
      ["Service Vehicle", (incident) => rtaServiceVehicleDisplay(incident.service_vehicle)],
      ["Unit", (incident) => textOrDash(incident.unit_involved)],
      ["Originating Sub-Unit", (incident) => textOrDash(incident.originating_unit)],
      ["History Of the Accident", (incident) => textOrDash(incident.history || incident.description)],
      ["How the Accident Occurred", (incident) => textOrDash(incident.how_occurred)],
      ["OB No", (incident) => textOrDash(incident.police_ob_reference || incident.source_ob_number)],
    ];
  }
  return [
    ["Incident #", (incident) => textOrDash(incident.incident_number)],
    ["Incident", (incident) => textOrDash(incident.incident_type)],
    ["Place", (incident) => textOrDash(incident.location)],
    ["Date", (incident) => formatDate(incident.date_occurred)],
    ["Time", (incident) => formatTime(incident.date_occurred)],
    ["Svc Member", (incident) => textOrDash(incident.service_member)],
    ["Unit", (incident) => textOrDash(incident.unit_involved)],
    ["Originating Sub-Unit", (incident) => textOrDash(incident.originating_unit)],
    ["History Of the Incident", (incident) => textOrDash(incident.history || incident.description)],
    ["OB (if any)", (incident) => textOrDash(incident.police_ob_reference || incident.source_ob_number)],
  ];
}

function detachmentOptionLabel(detachment) {
  const name = String(detachment?.name || "").trim();
  const company = detachment?.company ? `${detachment.company} Coy` : "";
  return [company, name].filter(Boolean).join(" - ") || name || company;
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function serviceMemberSummary(form) {
  return [
    form.service_member_number ? `Service No: ${String(form.service_member_number).trim()}` : "",
    form.service_member_rank,
    form.service_member_name,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function cleanCivilianVehicle(vehicle) {
  const driverUnknown = Boolean(vehicle?.driver_unknown);
  return {
    vehicle_details: String(vehicle?.vehicle_details || "").trim(),
    driver_identifier: driverUnknown ? "Unknown" : String(vehicle?.driver_identifier || "").trim(),
    driver_name: driverUnknown ? "Unknown" : String(vehicle?.driver_name || "").trim(),
    driver_unknown: driverUnknown,
  };
}

function civilianVehicleHasData(vehicle) {
  const cleaned = cleanCivilianVehicle(vehicle);
  return cleaned.driver_unknown || Boolean(cleaned.vehicle_details || cleaned.driver_identifier || cleaned.driver_name);
}

function civilianVehicleSummary(form) {
  if (!form.civilian_vehicle_involved) return "";
  return toArray(form.civilian_vehicles)
    .filter(civilianVehicleHasData)
    .map(cleanCivilianVehicle)
    .map((vehicle, index) => {
      const driver = vehicle.driver_unknown
        ? "Driver: Unknown"
        : [
            vehicle.driver_identifier ? `Driver ID No: ${vehicle.driver_identifier}` : "",
            vehicle.driver_name,
          ].filter(Boolean).join(" ");
      return `${index + 1}. Civilian vehicle: ${vehicle.vehicle_details}${driver ? `; ${driver}` : ""}`;
    })
    .join("\n");
}

function serviceDriverSummary(form) {
  return [
    form.service_driver_number ? `Svc No: ${String(form.service_driver_number).trim()}` : "",
    form.service_driver_rank,
    form.service_driver_name,
    form.service_driver_unit ? `Unit: ${form.service_driver_unit}` : "",
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function safeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function roadTrafficKind(value) {
  const text = String(value || "").toLowerCase();
  if (text.startsWith("non-injury") || text.includes("non injury")) return "non_injury";
  if (text.startsWith("injury")) return "injury";
  if (text.startsWith("fatal")) return "fatal";
  if (text.includes("hit and run")) return "hit_and_run";
  if (text.includes("self involved")) return "self_involved";
  return "";
}

function rtaCountsForType(roadTrafficType, yankee, zulu) {
  const type = roadTrafficKind(roadTrafficType);
  const yankeeCount = type === "non_injury" ? 0 : safeCount(yankee);
  const zuluCount = ["non_injury", "injury"].includes(type) ? 0 : safeCount(zulu);
  return { yankeeCount, zuluCount };
}

function cleanRtaPerson(person) {
  const category = person?.category === "zulu" ? "zulu" : "yankee";
  const personType = person?.person_type === "civilian" ? "civilian" : "service";
  const isUnknown = personType === "civilian" && Boolean(person?.is_unknown);
  return {
    category,
    person_type: personType,
    is_unknown: isUnknown,
    identifier: isUnknown ? "Unknown" : String(person?.identifier || "").trim(),
    rank: personType === "civilian" ? "" : String(person?.rank || "").trim(),
    name: isUnknown ? "Unknown" : String(person?.name || "").trim(),
    unit: personType === "civilian" ? "" : String(person?.unit || "").trim(),
    injury_severity: category === "yankee" ? String(person?.injury_severity || "").trim() : "",
  };
}

function syncRtaPersons(persons, roadTrafficType, yankee, zulu) {
  const { yankeeCount, zuluCount } = rtaCountsForType(roadTrafficType, yankee, zulu);
  const existing = toArray(persons);
  const existingYankee = existing
    .filter((person) => person?.category !== "zulu")
    .map((person) => ({ ...person, category: "yankee" }));
  const existingZulu = existing
    .filter((person) => person?.category === "zulu")
    .map((person) => ({ ...person, category: "zulu", injury_severity: "" }));
  return [
    ...Array.from({ length: yankeeCount }, (_, index) => existingYankee[index] || emptyRtaPerson("yankee")),
    ...Array.from({ length: zuluCount }, (_, index) => existingZulu[index] || emptyRtaPerson("zulu")),
  ];
}

function rtaPersonSummary(person, index) {
  const cleaned = cleanRtaPerson(person);
  const label = cleaned.category === "zulu" ? "Zulu" : "Yankee";
  if (cleaned.is_unknown) return `${index + 1}. ${label}: Unknown civilian`;
  const identifierLabel = cleaned.person_type === "civilian" ? "ID No" : "Svc No";
  const parts = [
    cleaned.identifier ? `${identifierLabel}: ${cleaned.identifier}` : "",
    cleaned.rank,
    cleaned.name,
    cleaned.unit ? `Unit: ${cleaned.unit}` : "",
    cleaned.injury_severity ? `Severity: ${injurySeverityLabel(cleaned.injury_severity)}` : "",
  ].filter(Boolean);
  return `${index + 1}. ${label}: ${parts.join(" ") || "Details not specified"}`;
}

function rtaPersonnelSummary(form) {
  return toArray(form.rta_persons).map(rtaPersonSummary).join("\n");
}

function countLabel(value) {
  const number = safeCount(value);
  return number > 0 ? String(number) : "Nil";
}

function buildRtaIncidentDescription(form, incidentType) {
  const sections = [
    `${incidentType || "Road Traffic Accident"} recorded at ${form.place || "place not specified"}.`,
    `Yankee: ${countLabel(form.yankee_count)}. Zulu: ${countLabel(form.zulu_count)}.`,
  ];
  if (form.unit_involved) sections.push(`Unit involved: ${form.unit_involved}.`);
  if (form.service_vehicle) sections.push(`Service vehicle: ${String(form.service_vehicle).trim()}.`);
  const serviceDriver = serviceDriverSummary(form);
  if (serviceDriver) sections.push(`Service vehicle driver: ${serviceDriver}.`);
  const civilianVehicles = civilianVehicleSummary(form);
  if (civilianVehicles) sections.push(`Civilian vehicle(s):\n${civilianVehicles}`);
  const personnel = rtaPersonnelSummary(form);
  if (personnel) sections.push(`Yankee / Zulu details:\n${personnel}`);
  if (form.history) sections.push(`History: ${form.history}`);
  if (form.how_occurred) sections.push(`How the accident occurred: ${form.how_occurred}`);
  return sections.filter(Boolean).join("\n");
}

function buildDateTime(form) {
  return `${form.date || todayIso()}T${form.time || "00:00"}:00`;
}

function resetForm() {
  return { ...INIT_FORM, date: todayIso(), time: timeNow() };
}

function sourceLabel(mode) {
  return mode === VIEW_RTA ? "Road Traffic Accident" : "Incident";
}

function injurySeverityLabel(value) {
  return INJURY_SEVERITIES.find(([severity]) => severity === value)?.[1] || value;
}

function matchingUnitId(units, value) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return "";
  const found = units.find((unit) =>
    String(unit?.name || "").trim().toLowerCase() === query ||
    String(unit?.code || "").trim().toLowerCase() === query
  );
  return found?.id || "";
}

function makeIncidentPayload(form, mode, units) {
  const incidentType = mode === VIEW_RTA ? form.road_traffic_type : form.incident_type;
  const description = mode === VIEW_RTA
    ? buildRtaIncidentDescription(form, incidentType)
    : form.history || incidentType;
  const serviceDriver = serviceDriverSummary(form);
  const civilianVehicles = civilianVehicleSummary(form);
  const personnel = rtaPersonnelSummary(form);
  const payload = {
    incident_type: incidentType,
    description,
    location: form.place,
    service_vehicle: mode === VIEW_RTA ? String(form.service_vehicle || "").trim() : "",
    unit_involved: form.unit_involved,
    originating_unit: form.originating_unit,
    civilian: mode === VIEW_RTA ? civilianVehicles : "",
    service_member: mode === VIEW_RTA ? serviceDriver : serviceMemberSummary(form),
    history: form.history,
    injuries: mode === VIEW_RTA
      ? personnel || `Yankee: ${countLabel(form.yankee_count)}. Zulu: ${countLabel(form.zulu_count)}.`
      : "",
    damages: "",
    how_occurred: mode === VIEW_RTA ? form.how_occurred : "",
    action_taken: "",
    police_ob_reference: form.police_ob_reference,
    date_occurred: buildDateTime(form),
    severity: form.severity || "medium",
    status: "reported",
  };
  const unitId = matchingUnitId(units, form.unit_involved);
  if (unitId) payload.unit = unitId;
  return payload;
}

function validateIncidentForm(form, mode) {
  if (mode === VIEW_RTA && !String(form.road_traffic_type || "").trim()) {
    return "Select the road traffic accident type.";
  }
  if (mode !== VIEW_RTA && !String(form.incident_type || "").trim()) {
    return "Enter the incident.";
  }
  if (!String(form.place || "").trim()) return "Enter the place.";
  if (!form.date) return "Select the date.";
  if (!form.time) return "Select the time.";
  if (mode === VIEW_RTA && !String(form.service_vehicle || "").trim()) {
    return "Enter the service vehicle.";
  }
  if (mode === VIEW_RTA) {
    const { yankeeCount, zuluCount } = rtaCountsForType(form.road_traffic_type, form.yankee_count, form.zulu_count);
    const type = roadTrafficKind(form.road_traffic_type);
    if (type === "injury" && yankeeCount < 1) return "Enter the Yankee count for an injury RTA.";
    if (type === "fatal" && zuluCount < 1) return "Enter the Zulu count for a fatal RTA.";
    if (form.civilian_vehicle_involved) {
      const civilianVehicles = toArray(form.civilian_vehicles).filter(civilianVehicleHasData).map(cleanCivilianVehicle);
      if (!civilianVehicles.length) return "Record the civilian vehicle details.";
      const missingCivilianVehicle = civilianVehicles.some((vehicle) => !vehicle.vehicle_details);
      if (missingCivilianVehicle) return "Enter the civilian vehicle registration or description.";
      const missingCivilianDriver = civilianVehicles.some((vehicle) =>
        !vehicle.driver_unknown && !vehicle.driver_identifier && !vehicle.driver_name
      );
      if (missingCivilianDriver) return "Enter civilian driver details or mark the driver as unknown.";
    }
    const people = toArray(form.rta_persons).map(cleanRtaPerson);
    const missingPerson = people.some((person) =>
      !person.is_unknown && !person.identifier && !person.name
    );
    if (missingPerson) return "Enter details for every Yankee/Zulu person or mark civilian details as unknown.";
    const missingSeverity = people.some((person) => person.category === "yankee" && !person.injury_severity);
    if (missingSeverity) return "Select injury severity for every Yankee entry.";
  }
  if (!String(form.unit_involved || "").trim()) return "Enter the unit.";
  if (!String(form.originating_unit || "").trim()) return "Enter the originating sub-unit.";
  if (!String(form.history || "").trim()) {
    return mode === VIEW_RTA ? "Enter the history of the accident." : "Enter the history of the incident.";
  }
  if (mode === VIEW_RTA && !String(form.how_occurred || "").trim()) {
    return "Enter how the accident occurred.";
  }
  return "";
}

function incidentMatchesSearch(incident, search) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [
    incident.incident_number,
    incident.incident_type,
    incident.location,
    incident.description,
    incident.service_vehicle,
    incident.civilian,
    incident.unit_involved,
    incident.originating_unit,
    incident.service_member,
    incident.history,
    incident.how_occurred,
    incident.police_ob_reference,
    incident.source_ob_number,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function SourceChoiceModal({ onChoose, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600">New report</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Choose incident type</h3>
          <p className="mt-1 text-sm text-slate-600">
            Select the register you want to capture. The next form will only show the fields needed for that type.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChoose(VIEW_INCIDENT)}
            className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-left transition hover:border-blue-400 hover:bg-blue-100"
          >
            <p className="text-sm font-bold text-slate-950">Incident</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              General incident with service member, unit, history, and OB reference.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onChoose(VIEW_RTA)}
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-left transition hover:border-amber-400 hover:bg-amber-100"
          >
            <p className="text-sm font-bold text-slate-950">RTA</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Road traffic accident with vehicle, unit, accident history, and OB number.
            </p>
          </button>
        </div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateIncidentModal({
  mode,
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
  error,
  unitOptions,
  subUnitOptions,
}) {
  const isRta = mode === VIEW_RTA;
  const update = (field, value) => onChange({ ...form, [field]: value });
  const civilianVehicles = toArray(form.civilian_vehicles);
  const rtaPersons = toArray(form.rta_persons);
  const rtaType = roadTrafficKind(form.road_traffic_type);
  const showYankeeCount = isRta && Boolean(rtaType) && rtaType !== "non_injury";
  const showZuluCount = isRta && Boolean(rtaType) && !["non_injury", "injury"].includes(rtaType);

  function updateRtaType(value) {
    const nextType = roadTrafficKind(value);
    const yankeeCount = nextType === "non_injury" ? "0" : form.yankee_count;
    const zuluCount = ["non_injury", "injury"].includes(nextType) ? "0" : form.zulu_count;
    onChange({
      ...form,
      road_traffic_type: value,
      yankee_count: yankeeCount,
      zulu_count: zuluCount,
      rta_persons: syncRtaPersons(form.rta_persons, value, yankeeCount, zuluCount),
    });
  }

  function updateRtaCount(field, value) {
    const next = {
      ...form,
      [field]: value,
    };
    next.rta_persons = syncRtaPersons(
      form.rta_persons,
      next.road_traffic_type,
      next.yankee_count,
      next.zulu_count
    );
    onChange(next);
  }

  function toggleCivilianVehicleInvolved(checked) {
    onChange({
      ...form,
      civilian_vehicle_involved: checked,
      civilian_vehicles: checked
        ? (civilianVehicles.length ? civilianVehicles : [emptyCivilianVehicle()])
        : [],
    });
  }

  function updateCivilianVehicle(index, field, value) {
    onChange({
      ...form,
      civilian_vehicles: civilianVehicles.map((vehicle, vehicleIndex) => {
        if (vehicleIndex !== index) return vehicle;
        const next = { ...vehicle, [field]: value };
        if (field === "driver_unknown") {
          next.driver_unknown = Boolean(value);
          next.driver_identifier = value ? "Unknown" : "";
          next.driver_name = value ? "Unknown" : "";
        }
        return next;
      }),
    });
  }

  function addCivilianVehicle() {
    onChange({ ...form, civilian_vehicles: [...civilianVehicles, emptyCivilianVehicle()] });
  }

  function removeCivilianVehicle(index) {
    const nextVehicles = civilianVehicles.filter((_, vehicleIndex) => vehicleIndex !== index);
    onChange({
      ...form,
      civilian_vehicles: nextVehicles.length ? nextVehicles : [emptyCivilianVehicle()],
    });
  }

  function updateRtaPerson(index, field, value) {
    onChange({
      ...form,
      rta_persons: rtaPersons.map((person, personIndex) => {
        if (personIndex !== index) return person;
        const next = { ...person, [field]: value };
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
          next.identifier = value ? "Unknown" : "";
          next.name = value ? "Unknown" : "";
        }
        return next;
      }),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={(event) => event.target === event.currentTarget && !saving && onClose()}
    >
      <form
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className={`text-xs font-bold uppercase tracking-wide ${isRta ? "text-amber-600" : "text-blue-600"}`}>
              {sourceLabel(mode)}
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-950">
              {isRta ? "New RTA Incident" : "New Incident"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            X
          </button>
        </div>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto px-5 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {isRta ? (
              <div>
                <FieldLabel>Road Traffic Accident Type *</FieldLabel>
                <select
                  value={form.road_traffic_type}
                  onChange={(event) => updateRtaType(event.target.value)}
                  className={FORM_INPUT}
                  required
                >
                  <option value="">Select RTA type...</option>
                  {ROAD_TRAFFIC_ACCIDENT_LABELS.map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <FieldLabel>Incident *</FieldLabel>
                <input
                  value={form.incident_type}
                  onChange={(event) => update("incident_type", event.target.value)}
                  className={FORM_INPUT}
                  placeholder="e.g. Assault, theft, absentee incident"
                  required
                />
              </div>
            )}

            <div>
              <FieldLabel>Place *</FieldLabel>
              <input
                value={form.place}
                onChange={(event) => update("place", event.target.value)}
                className={FORM_INPUT}
                placeholder="Where it happened"
                required
              />
            </div>

            <div>
              <FieldLabel>Date *</FieldLabel>
              <input
                type="date"
                value={form.date}
                onChange={(event) => update("date", event.target.value)}
                className={FORM_INPUT}
                required
              />
            </div>

            <div>
              <FieldLabel>Time *</FieldLabel>
              <input
                type="time"
                value={form.time}
                onChange={(event) => update("time", event.target.value)}
                className={FORM_INPUT}
                required
              />
            </div>

            {isRta ? (
              <>
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 md:col-span-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-950">Vehicles Involved</h4>
                    <p className="mt-1 text-xs text-slate-600">
                      Every RTA must involve a service vehicle. Add civilian vehicle details only where a civilian vehicle was involved.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <FieldLabel>Service Vehicle *</FieldLabel>
                      <input
                        value={form.service_vehicle}
                        onChange={(event) => update("service_vehicle", event.target.value)}
                        className={FORM_INPUT}
                        placeholder="e.g. 59 KA 123A"
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel>Driver Service No</FieldLabel>
                      <input
                        value={form.service_driver_number}
                        onChange={(event) => update("service_driver_number", event.target.value)}
                        className={FORM_INPUT}
                      />
                    </div>
                    <div>
                      <FieldLabel>Driver Rank</FieldLabel>
                      <select
                        value={form.service_driver_rank}
                        onChange={(event) => update("service_driver_rank", event.target.value)}
                        className={FORM_INPUT}
                      >
                        <option value="">Select rank...</option>
                        {RANK_OPTIONS.map((rank) => (
                          <option key={rank} value={rank}>{rank}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Driver Name</FieldLabel>
                      <input
                        value={form.service_driver_name}
                        onChange={(event) => update("service_driver_name", event.target.value)}
                        className={FORM_INPUT}
                      />
                    </div>
                    <div>
                      <FieldLabel>Driver Unit</FieldLabel>
                      <input
                        list="incident-unit-options"
                        value={form.service_driver_unit}
                        onChange={(event) => update("service_driver_unit", event.target.value)}
                        className={FORM_INPUT}
                        placeholder="Type unit name"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(form.civilian_vehicle_involved)}
                      onChange={(event) => toggleCivilianVehicleInvolved(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600"
                    />
                    Civilian vehicle involved
                  </label>

                  {form.civilian_vehicle_involved && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h5 className="text-xs font-bold uppercase tracking-wide text-slate-700">Civilian Vehicle Details</h5>
                        <button
                          type="button"
                          onClick={addCivilianVehicle}
                          className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Add Civilian Vehicle
                        </button>
                      </div>
                      {civilianVehicles.map((vehicle, index) => (
                        <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Civilian Vehicle #{index + 1}
                            </p>
                            {civilianVehicles.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeCivilianVehicle(index)}
                                className="text-xs font-semibold text-red-600 hover:text-red-700"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="md:col-span-2">
                              <FieldLabel>Vehicle Details *</FieldLabel>
                              <input
                                value={vehicle.vehicle_details}
                                onChange={(event) => updateCivilianVehicle(index, "vehicle_details", event.target.value)}
                                className={FORM_INPUT}
                                placeholder="Registration, make, or description"
                                required={Boolean(form.civilian_vehicle_involved)}
                              />
                            </div>
                            <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={Boolean(vehicle.driver_unknown)}
                                onChange={(event) => updateCivilianVehicle(index, "driver_unknown", event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                              />
                              Civilian driver unknown
                            </label>
                            <div>
                              <FieldLabel>Driver ID No</FieldLabel>
                              <input
                                value={vehicle.driver_identifier}
                                onChange={(event) => updateCivilianVehicle(index, "driver_identifier", event.target.value)}
                                className={FORM_INPUT}
                                disabled={Boolean(vehicle.driver_unknown)}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <FieldLabel>Driver Name</FieldLabel>
                              <input
                                value={vehicle.driver_name}
                                onChange={(event) => updateCivilianVehicle(index, "driver_name", event.target.value)}
                                className={FORM_INPUT}
                                disabled={Boolean(vehicle.driver_unknown)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <FieldLabel>Yankee Count</FieldLabel>
                  <input
                    type="number"
                    min="0"
                    value={form.yankee_count}
                    onChange={(event) => updateRtaCount("yankee_count", event.target.value)}
                    className={FORM_INPUT}
                    disabled={!showYankeeCount}
                    required={rtaType === "injury"}
                  />
                </div>
                <div>
                  <FieldLabel>Zulu Count</FieldLabel>
                  <input
                    type="number"
                    min="0"
                    value={form.zulu_count}
                    onChange={(event) => updateRtaCount("zulu_count", event.target.value)}
                    className={FORM_INPUT}
                    disabled={!showZuluCount}
                    required={rtaType === "fatal"}
                  />
                </div>

                {rtaPersons.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950">Yankee / Zulu Details</h4>
                      <p className="mt-1 text-xs text-slate-600">
                        Rows are generated from the counts above. Mark civilian details as unknown where particulars are not available.
                      </p>
                    </div>
                    {rtaPersons.map((person, index) => {
                      const isZulu = person.category === "zulu";
                      const isCivilian = person.person_type === "civilian";
                      return (
                        <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                            {isZulu ? "Zulu" : "Yankee"} #{index + 1}
                          </p>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div>
                              <FieldLabel>Person Type</FieldLabel>
                              <select
                                value={person.person_type}
                                onChange={(event) => updateRtaPerson(index, "person_type", event.target.value)}
                                className={FORM_INPUT}
                              >
                                <option value="service">Service Member</option>
                                <option value="civilian">Civilian</option>
                              </select>
                            </div>
                            {isCivilian && (
                              <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={Boolean(person.is_unknown)}
                                  onChange={(event) => updateRtaPerson(index, "is_unknown", event.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                />
                                Details unknown
                              </label>
                            )}
                            <div>
                              <FieldLabel>{isCivilian ? "ID No" : "Service No"}</FieldLabel>
                              <input
                                value={person.identifier}
                                onChange={(event) => updateRtaPerson(index, "identifier", event.target.value)}
                                className={FORM_INPUT}
                                disabled={Boolean(person.is_unknown)}
                              />
                            </div>
                            <div>
                              <FieldLabel>Rank</FieldLabel>
                              <select
                                value={person.rank}
                                onChange={(event) => updateRtaPerson(index, "rank", event.target.value)}
                                className={FORM_INPUT}
                                disabled={isCivilian}
                              >
                                <option value="">{isCivilian ? "NIL" : "Select rank..."}</option>
                                {RANK_OPTIONS.map((rank) => (
                                  <option key={rank} value={rank}>{rank}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <FieldLabel>Name</FieldLabel>
                              <input
                                value={person.name}
                                onChange={(event) => updateRtaPerson(index, "name", event.target.value)}
                                className={FORM_INPUT}
                                disabled={Boolean(person.is_unknown)}
                              />
                            </div>
                            <div>
                              <FieldLabel>Unit</FieldLabel>
                              <input
                                list="incident-unit-options"
                                value={person.unit}
                                onChange={(event) => updateRtaPerson(index, "unit", event.target.value)}
                                className={FORM_INPUT}
                                disabled={isCivilian}
                                placeholder={isCivilian ? "Civilian / N/A" : "Type unit name"}
                              />
                            </div>
                            {!isZulu && (
                              <div>
                                <FieldLabel>Injury Severity *</FieldLabel>
                                <select
                                  value={person.injury_severity}
                                  onChange={(event) => updateRtaPerson(index, "injury_severity", event.target.value)}
                                  className={FORM_INPUT}
                                  required
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
              </>
            ) : (
              <>
                <div>
                  <FieldLabel>Service No</FieldLabel>
                  <input
                    value={form.service_member_number}
                    onChange={(event) => update("service_member_number", event.target.value)}
                    className={FORM_INPUT}
                  />
                </div>
                <div>
                  <FieldLabel>Rank</FieldLabel>
                  <input
                    value={form.service_member_rank}
                    onChange={(event) => update("service_member_rank", event.target.value)}
                    className={FORM_INPUT}
                  />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>Name</FieldLabel>
                  <input
                    value={form.service_member_name}
                    onChange={(event) => update("service_member_name", event.target.value)}
                    className={FORM_INPUT}
                  />
                </div>
              </>
            )}

            <div>
              <FieldLabel>Unit *</FieldLabel>
              <input
                list="incident-unit-options"
                value={form.unit_involved}
                onChange={(event) => update("unit_involved", event.target.value)}
                className={FORM_INPUT}
                placeholder="Type unit name"
                required
              />
              <datalist id="incident-unit-options">
                {unitOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
            </div>

            <div>
              <FieldLabel>Originating Sub-Unit *</FieldLabel>
              <input
                list="incident-sub-unit-options"
                value={form.originating_unit}
                onChange={(event) => update("originating_unit", event.target.value)}
                className={FORM_INPUT}
                placeholder="Type Coy or detachment"
                required
              />
              <datalist id="incident-sub-unit-options">
                {subUnitOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
            </div>

            <div>
              <FieldLabel>Severity</FieldLabel>
              <select
                value={form.severity}
                onChange={(event) => update("severity", event.target.value)}
                className={FORM_INPUT}
              >
                {ALL_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>{severity.charAt(0).toUpperCase() + severity.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>OB {isRta ? "No" : "(if any)"}</FieldLabel>
              <input
                value={form.police_ob_reference}
                onChange={(event) => update("police_ob_reference", event.target.value)}
                className={FORM_INPUT}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <FieldLabel>{isRta ? "History Of the Accident *" : "History Of the Incident *"}</FieldLabel>
            <textarea
              value={form.history}
              onChange={(event) => update("history", event.target.value)}
              className={`${FORM_INPUT} min-h-28 resize-y`}
              required
            />
          </div>

          {isRta && (
            <div>
              <FieldLabel>How the Accident Occurred *</FieldLabel>
              <textarea
                value={form.how_occurred}
                onChange={(event) => update("how_occurred", event.target.value)}
                className={`${FORM_INPUT} min-h-24 resize-y`}
                required
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${isRta ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {saving ? "Saving..." : `Save ${sourceLabel(mode)}`}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Incidents({ user }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(VIEW_INCIDENT);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIncidents, setSelectedIncidents] = useState([]);
  const [briefDate, setBriefDate] = useState(todayIso());
  const [remarks, setRemarks] = useState("");
  const [compileOpen, setCompileOpen] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compilerStatus, setCompilerStatus] = useState({ can_compile: false, post: null, message: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sourceChoiceOpen, setSourceChoiceOpen] = useState(false);
  const [createMode, setCreateMode] = useState(VIEW_INCIDENT);
  const [createOpen, setCreateOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState(resetForm());
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [units, setUnits] = useState([]);
  const [detachments, setDetachments] = useState([]);

  useAutoDismiss(notice, setNotice);
  useAutoDismiss(error, setError);
  useAutoDismiss(createError, setCreateError);

  const canCompileMorningBrief = Boolean(compilerStatus?.can_compile);

  function loadData() {
    setLoading(true);
    morningBriefService
      .compilerStatus()
      .then((statusRes) => {
        const status = statusRes.data || {};
        setCompilerStatus(status);
        const params = status.can_compile
          ? { page_size: 200, requires_investigation: true, pending_morning_brief: true }
          : { page_size: 200 };
        return incidentService.list(params);
      })
      .then((res) => {
        const items = toArray(res.data);
        setIncidents(items);
        setSelectedIncidents((prev) => prev.filter((id) => items.some((incident) => incident.id === id)));
      })
      .catch((err) => setError(formatError(err, "Failed to load incidents.")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    Promise.all([
      formationService.units({ page_size: 1000 }).catch(() => null),
      formationService.detachments({ page_size: 1000 }).catch(() => null),
    ]).then(([unitRes, detachmentRes]) => {
      setUnits(toArray(unitRes?.data));
      setDetachments(toArray(detachmentRes?.data));
    });
  }, []);

  const incidentRows = useMemo(
    () => incidents.filter((incident) => !isRoadTrafficAccidentIncident(incident)),
    [incidents]
  );
  const rtaRows = useMemo(
    () => incidents.filter(isRoadTrafficAccidentIncident),
    [incidents]
  );
  const activeRows = viewMode === VIEW_RTA ? rtaRows : incidentRows;
  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const filtered = useMemo(() => activeRows.filter((incident) => {
    if (dateRangeInvalid) return false;
    const matchStatus = statusFilter === "all" || incident.status === statusFilter;
    const matchSeverity = severityFilter === "all" || incident.severity === severityFilter;
    const occurredAt = dateTimeValue(incident.date_occurred);
    const fromDate = startOfLocalDate(dateFrom);
    const toDate = endOfLocalDate(dateTo);
    const matchFrom = !fromDate || (occurredAt && occurredAt >= fromDate);
    const matchTo = !toDate || (occurredAt && occurredAt <= toDate);
    return matchStatus && matchSeverity && matchFrom && matchTo && incidentMatchesSearch(incident, search);
  }), [activeRows, dateFrom, dateRangeInvalid, dateTo, search, severityFilter, statusFilter]);

  const selectedIncidentRows = useMemo(
    () => incidents.filter((incident) => selectedIncidents.includes(incident.id)),
    [incidents, selectedIncidents]
  );

  const selectableIds = useMemo(() => filtered.map((incident) => incident.id), [filtered]);
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIncidents.includes(id));
  const statusCounts = ALL_STATUSES.reduce((acc, status) => ({ ...acc, [status]: activeRows.filter((incident) => incident.status === status).length }), {});
  const severityCounts = ALL_SEVERITIES.reduce((acc, severity) => ({ ...acc, [severity]: activeRows.filter((incident) => incident.severity === severity).length }), {});
  const unitOptions = useMemo(
    () => uniqueSorted(units.flatMap((unit) => [unit.name, unit.code])),
    [units]
  );
  const subUnitOptions = useMemo(
    () => uniqueSorted(detachments.map(detachmentOptionLabel)),
    [detachments]
  );
  const hasActiveFilters = Boolean(
    search.trim() || dateFrom || dateTo || statusFilter !== "all" || severityFilter !== "all"
  );

  function toggleIncident(id) {
    setSelectedIncidents((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }

  function toggleAllFiltered() {
    setSelectedIncidents((prev) => {
      if (allFilteredSelected) {
        return prev.filter((id) => !selectableIds.includes(id));
      }
      return [...new Set([...prev, ...selectableIds])];
    });
  }

  function switchView(mode) {
    setViewMode(mode);
    setStatusFilter("all");
    setSeverityFilter("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSelectedIncidents([]);
  }

  function clearFilters() {
    setStatusFilter("all");
    setSeverityFilter("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  }

  function filterSummary() {
    const labels = [];
    if (search.trim()) labels.push(`Search: ${search.trim()}`);
    if (statusFilter !== "all") labels.push(`Status: ${statusFilter.replace(/_/g, " ")}`);
    if (severityFilter !== "all") labels.push(`Severity: ${severityFilter}`);
    if (dateFrom) labels.push(`From: ${dateFrom}`);
    if (dateTo) labels.push(`To: ${dateTo}`);
    return labels.length ? labels.join(" | ") : "All records";
  }

  function exportFilteredCsv() {
    if (dateRangeInvalid) {
      setError("Date From cannot be later than Date To.");
      return;
    }
    if (filtered.length === 0) {
      setError(`No ${registerLabel(viewMode).toLowerCase()} to export.`);
      return;
    }
    const columns = exportColumns(viewMode);
    const rows = [
      columns.map(([label]) => csvCell(label)).join(","),
      ...filtered.map((incident) => columns.map(([, getter]) => csvCell(getter(incident))).join(",")),
    ];
    const filename = `${registerFilename(viewMode)}-${todayIso()}.csv`;
    downloadTextFile(filename, `\uFEFF${rows.join("\r\n")}`, "text/csv;charset=utf-8");
  }

  function printFilteredRegister() {
    if (dateRangeInvalid) {
      setError("Date From cannot be later than Date To.");
      return;
    }
    if (filtered.length === 0) {
      setError(`No ${registerLabel(viewMode).toLowerCase()} to print.`);
      return;
    }
    const columns = exportColumns(viewMode);
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) {
      setError("The print window was blocked. Allow pop-ups for this site and try again.");
      return;
    }
    const heading = registerLabel(viewMode);
    const bodyRows = filtered.map((incident) => (
      `<tr>${columns.map(([, getter]) => `<td>${escapeHtml(getter(incident))}</td>`).join("")}</tr>`
    )).join("");
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(heading)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
            h1 { font-size: 20px; margin: 0 0 4px; }
            .meta { color: #475569; font-size: 12px; margin-bottom: 16px; }
            table { border-collapse: collapse; width: 100%; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; }
            th { background: #e2e8f0; text-transform: uppercase; letter-spacing: .04em; }
            tr:nth-child(even) td { background: #f8fafc; }
            @page { size: landscape; margin: 12mm; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(heading)}</h1>
          <div class="meta">${escapeHtml(filterSummary())} | ${filtered.length} record${filtered.length === 1 ? "" : "s"}</div>
          <table>
            <thead>
              <tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function openCreateChoice() {
    setError("");
    setCreateError("");
    setSourceChoiceOpen(true);
  }

  function chooseCreateMode(mode) {
    setCreateMode(mode);
    setIncidentForm(resetForm());
    setCreateError("");
    setSourceChoiceOpen(false);
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (incidentSaving) return;
    setCreateOpen(false);
    setCreateError("");
    setIncidentForm(resetForm());
  }

  async function submitIncident(event) {
    event.preventDefault();
    const validationError = validateIncidentForm(incidentForm, createMode);
    if (validationError) {
      setCreateError(validationError);
      return;
    }
    setIncidentSaving(true);
    setCreateError("");
    try {
      await incidentService.create(makeIncidentPayload(incidentForm, createMode, units));
      setNotice(`${sourceLabel(createMode)} saved successfully.`);
      setCreateOpen(false);
      setIncidentForm(resetForm());
      setViewMode(createMode === VIEW_RTA ? VIEW_RTA : VIEW_INCIDENT);
      loadData();
    } catch (err) {
      setCreateError(formatError(err, `Failed to save ${sourceLabel(createMode).toLowerCase()}.`));
    } finally {
      setIncidentSaving(false);
    }
  }

  function openCompileModal() {
    if (selectedIncidents.length === 0) {
      setError("Select at least one investigation-required incident to compile.");
      return;
    }
    setCompileOpen(true);
    setError("");
  }

  async function confirmCompileMorningBrief() {
    if (selectedIncidents.length === 0) return;
    setCompiling(true);
    try {
      await morningBriefService.compileFromIncidents({
        date: briefDate,
        incident_ids: selectedIncidents,
        remarks,
      });
      setSelectedIncidents([]);
      setRemarks("");
      setCompileOpen(false);
      setNotice("Morning brief compiled from selected incidents.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to compile morning brief."));
    } finally {
      setCompiling(false);
    }
  }

  return (
    <div className="min-h-screen space-y-5 bg-gray-900 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Incidents</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {canCompileMorningBrief
              ? `${incidents.length} investigation-required incident${incidents.length !== 1 ? "s" : ""} pending morning brief`
              : `${incidentRows.length} incident${incidentRows.length !== 1 ? "s" : ""} and ${rtaRows.length} RTA incident${rtaRows.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateChoice}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          + Add New Incident
        </button>
      </div>

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || notice}
        </div>
      )}

      {!canCompileMorningBrief && compilerStatus?.message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Morning brief compilation restricted</p>
          <p className="mt-1">{compilerStatus.message}</p>
        </div>
      )}

      {canCompileMorningBrief && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Morning Brief Compilation</h3>
              <p className="mt-1 text-sm text-slate-600">
                Select incidents that require investigation, then compile them into the daily morning brief.
              </p>
              {compilerStatus?.post && (
                <p className="mt-1 text-xs text-slate-500">
                  Duty Officer assignment: <strong>{compilerStatus.post.roster}</strong>, {compilerStatus.post.unit_label}, {formatDateTime(compilerStatus.post.starts_at)} to {formatDateTime(compilerStatus.post.ends_at)}.
                  {!compilerStatus.post.is_current && compilerStatus.post.compile_window_ends_at
                    ? ` Handover compile window ends ${formatDateTime(compilerStatus.post.compile_window_ends_at)}.`
                    : ""}
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(220px,1fr)_auto]">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Brief Date
                <input
                  type="date"
                  value={briefDate}
                  onChange={(event) => setBriefDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Remarks
                <input
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Optional remarks"
                />
              </label>
              <button
                type="button"
                onClick={openCompileModal}
                disabled={selectedIncidents.length === 0}
                className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Compile Selected ({selectedIncidents.length})
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="rounded-xl border border-gray-700/70 bg-gray-800/50 p-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => switchView(VIEW_INCIDENT)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${viewMode === VIEW_INCIDENT ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            Incidents ({incidentRows.length})
          </button>
          <button
            type="button"
            onClick={() => switchView(VIEW_RTA)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${viewMode === VIEW_RTA ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            RTA ({rtaRows.length})
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-gray-700/70 bg-gray-800 p-4 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_160px_160px_auto] xl:items-end">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Search {registerLabel(viewMode)}
              <input
                type="text"
                placeholder={viewMode === VIEW_RTA ? "Incident #, vehicle, unit, OB, place..." : "Incident #, service member, unit, OB, place..."}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </label>

            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Date From
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </label>

            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Date To
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="rounded-lg border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-200 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={printFilteredRegister}
                disabled={dateRangeInvalid || filtered.length === 0}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Print
              </button>
              <button
                type="button"
                onClick={exportFilteredCsv}
                disabled={dateRangeInvalid || filtered.length === 0}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
          </div>

          {dateRangeInvalid && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              Date From cannot be later than Date To.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <span className="mr-1 self-center text-xs text-gray-500">Status:</span>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              All ({activeRows.length})
            </button>
            {ALL_STATUSES.map((status) =>
              statusCounts[status] > 0 ? (
                <button
                  type="button"
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${statusFilter === status ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                  {status.replace(/_/g, " ")} ({statusCounts[status]})
                </button>
              ) : null
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="mr-1 self-center text-xs text-gray-500">Severity:</span>
            <button
              type="button"
              onClick={() => setSeverityFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${severityFilter === "all" ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              All ({activeRows.length})
            </button>
            {ALL_SEVERITIES.map((severity) =>
              severityCounts[severity] > 0 ? (
                <button
                  type="button"
                  key={severity}
                  onClick={() => setSeverityFilter(severity)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${severityFilter === severity ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                  {severity} ({severityCounts[severity]})
                </button>
              ) : null
            )}
          </div>

          <p className="text-xs font-medium text-gray-400">
            Showing {filtered.length} of {activeRows.length} {registerLabel(viewMode).toLowerCase()}.
          </p>
        </div>
      </section>

      <div className="overflow-hidden rounded-xl bg-gray-800">
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-8 animate-pulse rounded bg-gray-700" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">
            {viewMode === VIEW_RTA ? "No RTA incidents found." : canCompileMorningBrief ? "No investigation-required incidents pending morning brief." : "No incidents found."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            {viewMode === VIEW_RTA ? (
              <table className="w-full min-w-[1440px] text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-xs uppercase tracking-wider text-gray-500">
                    {canCompileMorningBrief && (
                      <th className="px-4 py-3 text-left font-medium">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleAllFiltered}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          aria-label="Select all visible RTA incidents"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left font-medium">Incident #</th>
                    <th className="px-4 py-3 text-left font-medium">Incident</th>
                    <th className="px-4 py-3 text-left font-medium">Place</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Time</th>
                    <th className="px-4 py-3 text-left font-medium">Service Vehicle</th>
                    <th className="px-4 py-3 text-left font-medium">Unit</th>
                    <th className="px-4 py-3 text-left font-medium">Originating Sub-Unit</th>
                    <th className="px-4 py-3 text-left font-medium">History Of the Accident</th>
                    <th className="px-4 py-3 text-left font-medium">How the Accident Occurred</th>
                    <th className="px-4 py-3 text-left font-medium">OB No</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((incident) => (
                    <tr key={incident.id} className="border-b border-gray-700/40 align-top transition-colors hover:bg-gray-700/30">
                      {canCompileMorningBrief && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIncidents.includes(incident.id)}
                            onChange={() => toggleIncident(incident.id)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            aria-label={`Select ${incident.incident_number || "RTA incident"}`}
                          />
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-400">{textOrDash(incident.incident_number)}</td>
                      <td className="max-w-[190px] px-4 py-3 text-gray-200">
                        <p>{textOrDash(incident.incident_type)}</p>
                      </td>
                      <td className="max-w-[160px] px-4 py-3 text-gray-300">{textOrDash(incident.location)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-300">{formatDate(incident.date_occurred)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-300">{formatTime(incident.date_occurred)}</td>
                      <td className="max-w-[180px] px-4 py-3 text-gray-300">{rtaServiceVehicleDisplay(incident.service_vehicle)}</td>
                      <td className="max-w-[180px] px-4 py-3 text-gray-300">{textOrDash(incident.unit_involved)}</td>
                      <td className="max-w-[180px] px-4 py-3 text-gray-300">{textOrDash(incident.originating_unit)}</td>
                      <td className="max-w-[300px] whitespace-pre-wrap px-4 py-3 text-gray-300">{textOrDash(incident.history || incident.description)}</td>
                      <td className="max-w-[260px] whitespace-pre-wrap px-4 py-3 text-gray-300">{textOrDash(incident.how_occurred)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-blue-300">{textOrDash(incident.police_ob_reference || incident.source_ob_number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[1400px] text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-xs uppercase tracking-wider text-gray-500">
                    {canCompileMorningBrief && (
                      <th className="px-4 py-3 text-left font-medium">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleAllFiltered}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          aria-label="Select all visible incidents"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left font-medium">Incident #</th>
                    <th className="px-4 py-3 text-left font-medium">Incident</th>
                    <th className="px-4 py-3 text-left font-medium">Place</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Time</th>
                    <th className="px-4 py-3 text-left font-medium">Svc Member</th>
                    <th className="px-4 py-3 text-left font-medium">Unit</th>
                    <th className="px-4 py-3 text-left font-medium">Originating Sub-Unit</th>
                    <th className="px-4 py-3 text-left font-medium">History Of the Incident</th>
                    <th className="px-4 py-3 text-left font-medium">OB (if any)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((incident) => (
                    <tr key={incident.id} className="border-b border-gray-700/40 align-top transition-colors hover:bg-gray-700/30">
                      {canCompileMorningBrief && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIncidents.includes(incident.id)}
                            onChange={() => toggleIncident(incident.id)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            aria-label={`Select ${incident.incident_number || "incident"}`}
                          />
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-400">
                        {textOrDash(incident.incident_number)}
                        {canCompileMorningBrief && incident.requires_investigation && (
                          <span className="mt-1 block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                            Requires investigation
                          </span>
                        )}
                      </td>
                      <td className="max-w-[180px] px-4 py-3 text-gray-200">
                        <p>{textOrDash(incident.incident_type)}</p>
                        {incident.is_belated && (
                          <span className="text-[10px] font-medium text-orange-400">Belated</span>
                        )}
                      </td>
                      <td className="max-w-[160px] px-4 py-3 text-gray-300">{textOrDash(incident.location)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-300">{formatDate(incident.date_occurred)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-300">{formatTime(incident.date_occurred)}</td>
                      <td className="max-w-[240px] whitespace-pre-wrap px-4 py-3 text-gray-300">{textOrDash(incident.service_member)}</td>
                      <td className="max-w-[180px] px-4 py-3 text-gray-300">{textOrDash(incident.unit_involved)}</td>
                      <td className="max-w-[180px] px-4 py-3 text-gray-300">{textOrDash(incident.originating_unit)}</td>
                      <td className="max-w-[320px] whitespace-pre-wrap px-4 py-3 text-gray-300">{textOrDash(incident.history || incident.description)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-blue-300">{textOrDash(incident.police_ob_reference || incident.source_ob_number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {sourceChoiceOpen && (
        <SourceChoiceModal
          onChoose={chooseCreateMode}
          onClose={() => setSourceChoiceOpen(false)}
        />
      )}

      {createOpen && (
        <CreateIncidentModal
          mode={createMode}
          form={incidentForm}
          onChange={setIncidentForm}
          onClose={closeCreateModal}
          onSubmit={submitIncident}
          saving={incidentSaving}
          error={createError}
          unitOptions={unitOptions}
          subUnitOptions={subUnitOptions}
        />
      )}

      {compileOpen && (
        <ActionModal
          eyebrow="Morning Brief"
          title="Compile Selected Incidents?"
          message="Selected investigation-required incidents will be added to the morning brief for HQ review."
          tone="blue"
          confirmLabel="Compile Morning Brief"
          savingLabel="Compiling..."
          saving={compiling}
          onCancel={() => setCompileOpen(false)}
          onConfirm={confirmCompileMorningBrief}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brief Date</p>
                <p className="mt-1 font-medium text-slate-900">{briefDate}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Incidents</p>
                <p className="mt-1 font-medium text-slate-900">{selectedIncidentRows.length}</p>
              </div>
            </div>
            <div className="mt-4 max-h-44 space-y-2 overflow-y-auto">
              {selectedIncidentRows.map((incident) => (
                <div key={incident.id} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                  <p className="font-semibold text-slate-950">{incident.incident_number || "Incident"}</p>
                  <p className="text-xs text-slate-600">{incident.incident_type || "--"} - OB {incident.police_ob_reference || incident.source_ob_number || "--"}</p>
                </div>
              ))}
            </div>
            {remarks && <p className="mt-3 text-slate-700">Remarks: {remarks}</p>}
          </div>
        </ActionModal>
      )}
    </div>
  );
}
