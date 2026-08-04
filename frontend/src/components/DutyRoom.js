import React, { useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useAutoDismiss from "../hooks/useAutoDismiss";
import { dutyRoomService, offenceService, userService } from "../services/api";
import ActionModal from "./common/ActionModal";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function settledData(result) {
  return result.status === "fulfilled" ? result.value.data : null;
}

function settledError(result, fallback) {
  return result.status === "rejected" ? formatError(result.reason, fallback) : "";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDateTime(date = new Date()) {
  return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localTime(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datePart(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : localDate();
}

function timePart(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) ? text.slice(11, 16) : localTime();
}

function withDatePart(dateValue, dateTimeValue) {
  return `${dateValue || localDate()}T${timePart(dateTimeValue)}`;
}

function withTimePart(timeValue, dateTimeValue) {
  return `${datePart(dateTimeValue)}T${timeValue || localTime()}`;
}

function dutyStartToday() {
  const date = new Date();
  date.setHours(8, 0, 0, 0);
  return localDateTime(date);
}

function dutyEndTomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return localDateTime(date);
}

const DUTY_TYPE_MINUTES = {
  "12h": 12 * 60,
  "24h": 24 * 60,
  weekly: 7 * 24 * 60,
};

const MIN_REST_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_POST_NAMES = "Duty Officer, Duty Room, Gate";

function addMinutesToLocalDateTime(value, minutes) {
  if (!value || !minutes) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() + minutes);
  return localDateTime(date);
}

function dutyEndFromType(startsAt, dutyType) {
  return addMinutesToLocalDateTime(startsAt, DUTY_TYPE_MINUTES[dutyType]);
}

function dateAtDutyStart(value) {
  return value ? `${value}T08:00` : dutyStartToday();
}

function datesBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00`);
  const end = new Date(`${endDate}T00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates = [];
  for (const date = new Date(start); date <= end && dates.length < 62; date.setDate(date.getDate() + 1)) {
    dates.push(localDate(date));
  }
  return dates;
}

function parsePostNames(value) {
  return String(value || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function normalizePostName(value) {
  return String(value || "").trim().replace(/[^a-z0-9]+/gi, " ").replace(/\s+/g, " ").toLowerCase();
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

function formatOrderDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
  return `${weekday} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)}`;
}

function formatOrderHeaderDate(value) {
  if (!value) return "--";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).toUpperCase();
}

function formatOrderTimeRange(post) {
  const startsAt = new Date(post?.starts_at);
  const endsAt = new Date(post?.ends_at);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return "";
  return `${pad(startsAt.getHours())}${pad(startsAt.getMinutes())} - ${pad(endsAt.getHours())}${pad(endsAt.getMinutes())} HRS`;
}

function dutyPeriodLabel(post) {
  return `${formatDateTime(post?.starts_at)} - ${formatDateTime(post?.ends_at)}`;
}

function minutesBetweenLocalDateTimes(startsAt, endsAt) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function toInputDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return localDateTime(date);
}

function userOptionLabel(user) {
  if (!user) return "--";
  const rank = user.rank ? `${user.rank} ` : "";
  return `${rank}${user.name} (${user.service_number})`;
}

function userOriginatingSubUnitLabel(user, fallback = "") {
  return user?.detachment_name || user?.battalion_name || fallback || "--";
}

function userLabelById(personnelById, id) {
  return userOptionLabel(personnelById.get(Number(id))) || `Personnel ${id}`;
}

function orderPersonLine(person, personnelById = new Map()) {
  if (person && typeof person === "object") {
    const serviceNumber = person.service_number || person.service_no || "";
    const rank = person.rank || "";
    const name = person.name || "";
    const officialLine = [serviceNumber, rank, name].filter(Boolean).join(" ");
    return officialLine || person.label || "--";
  }
  const id = Number(person);
  const knownPerson = personnelById.get(id);
  if (knownPerson) {
    return orderPersonLine(knownPerson, personnelById);
  }
  return Number.isFinite(id) ? `Personnel ${id}` : "--";
}

function assignedOrderLines(post, personnelById = new Map()) {
  const details = toArray(post.assigned_personnel_details);
  const assigned = details.length ? details : toArray(post.assigned_personnel);
  const lines = assigned.map((person) => orderPersonLine(person, personnelById)).filter(Boolean);
  return lines.length ? lines : ["--"];
}

function partOneOrderGroups(roster, personnelById = new Map()) {
  const groups = [];
  const groupByPost = new Map();
  toArray(roster?.posts)
    .slice()
    .sort((left, right) => {
      const leftDate = new Date(left.starts_at).getTime() || 0;
      const rightDate = new Date(right.starts_at).getTime() || 0;
      if (leftDate !== rightDate) return leftDate - rightDate;
      return String(left.post_name || "").localeCompare(String(right.post_name || ""));
    })
    .forEach((post) => {
      const name = String(post.post_name || "Duty Post").trim();
      const key = normalizePostName(name) || name;
      if (!groupByPost.has(key)) {
        const group = { key, name, duties: [] };
        groupByPost.set(key, group);
        groups.push(group);
      }
      groupByPost.get(key).duties.push({
        id: post.id || `${key}-${post.starts_at}`,
        date: formatOrderDate(post.starts_at),
        timeRange: formatOrderTimeRange(post),
        personnel: assignedOrderLines(post, personnelById),
        notes: post.notes || "",
      });
    });
  return groups;
}

function partOneOrderUnitName(roster) {
  return roster?.battalion_name || roster?.unit_label || roster?.detachment_name || "UNIT";
}

function partOneOrderSerial(roster) {
  return roster?.part_one_order_serial || "--/--";
}

function previousPartOneOrderLine(roster) {
  const previous = roster?.previous_part_one_order;
  if (!previous?.serial) return "LAST PART ONE ORDERS ISSUED: NIL.";
  return `LAST PART ONE ORDERS ISSUED S/NO ${previous.serial} DATED ${formatOrderHeaderDate(previous.start_date)}.`;
}

function isMobilePartOneOrdersClient() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const phoneUserAgent = /Android.*Mobile|iPhone|iPod|IEMobile|Opera Mini|Mobi/i.test(userAgent);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
  return phoneUserAgent || (Boolean(coarsePointer) && window.innerWidth <= 820);
}

function partOnePrintDeniedMessage(roster, isMobileClient) {
  if (isMobileClient) {
    return "Part 1 Orders cannot be previewed, printed, downloaded, or captured on mobile phones. Use an authorised desktop terminal.";
  }
  if (roster?.status !== "published") {
    return "These Part 1 Orders are not published yet. Only the creating Order NCO and the selected approving officer can preview or print them before publication.";
  }
  return "You are not authorised to print these Part 1 Orders.";
}

const STATUS_STYLE = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  returned: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  declined: "bg-red-50 text-red-700 ring-1 ring-red-200",
  approved: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  published: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  closed: "bg-slate-200 text-slate-700",
};

const ROAD_TRAFFIC_ENTRY_TYPE = "road_traffic_accident";
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
  "Staff Sergeant",
  "Sergeant",
  "Corporal",
  "Lance Corporal",
  "Private",
  "Recruit",
];

function isRoadTrafficEntryType(value) {
  return value === ROAD_TRAFFIC_ENTRY_TYPE;
}

function isInjuryRoadTrafficType(value) {
  return value === "injury";
}

function isFatalRoadTrafficType(value) {
  return value === "fatal";
}

function roadTrafficTypeLabel(value) {
  return ROAD_TRAFFIC_TYPES.find(([type]) => type === value)?.[1] || "";
}

function injurySeverityLabel(value) {
  return INJURY_SEVERITIES.find(([severity]) => severity === value)?.[1] || "";
}

function emptyRtaVehicle() {
  return {
    vehicle_type: "service",
    vehicle_details: "",
    driver_person_type: "service",
    driver_unknown: false,
    driver_identifier: "",
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

function cleanRtaVehicle(vehicle) {
  const driverPersonType = vehicle.driver_person_type || "service";
  const driverUnknown = driverPersonType === "civilian" && Boolean(vehicle.driver_unknown);
  return {
    vehicle_type: vehicle.vehicle_type || "service",
    vehicle_details: String(vehicle.vehicle_details || "").trim(),
    driver_person_type: driverPersonType,
    driver_unknown: driverUnknown,
    driver_identifier: driverUnknown ? "Unknown" : String(vehicle.driver_identifier || "").trim(),
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
  return cleaned.driver_unknown || ["vehicle_details", "driver_identifier", "driver_rank", "driver_name", "driver_unit"]
    .some((field) => String(cleaned[field] || "").trim());
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
    person.identifier ? `${identifierLabel}: ${person.identifier}` : "",
    person.rank,
    person.name,
    person.unit ? `Unit: ${person.unit}` : "",
  ].filter(Boolean);
  return parts.join(" ");
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

function vehicleSummary(vehicle, index) {
  const cleaned = cleanRtaVehicle(vehicle);
  const typeLabel = cleaned.vehicle_type === "civilian" ? "Civilian vehicle" : "Service vehicle";
  const driverLabel = personLabel({
    identifier: cleaned.driver_identifier,
    rank: cleaned.driver_rank,
    name: cleaned.driver_name,
    unit: cleaned.driver_unit,
    driver_unknown: cleaned.driver_unknown,
  }, cleaned.driver_person_type === "civilian" ? "ID No" : "Svc No");
  return `${index + 1}. ${typeLabel}: ${cleaned.vehicle_details || "Not specified"}${driverLabel ? `; Driver: ${driverLabel}` : ""}`;
}

function casualtySummary(casualty, index) {
  const cleaned = cleanRtaCasualty(casualty);
  const statusLabel = cleaned.casualty_status === "dead" ? "Dead" : "Injured";
  const person = personLabel(cleaned, cleaned.person_type === "civilian" ? "ID No" : "Svc No");
  const severity = cleaned.casualty_status === "injured" && cleaned.injury_severity
    ? `; Severity: ${injurySeverityLabel(cleaned.injury_severity)}`
    : "";
  return `${index + 1}. ${statusLabel}: ${person || "Details not specified"}${severity}`;
}

function buildRtaDescription(form) {
  const vehicles = toArray(form.rta_vehicles).filter(hasVehicleData).map(cleanRtaVehicle);
  const casualties = toArray(form.rta_casualties).map(cleanRtaCasualty);
  const sections = [
    `${roadTrafficTypeLabel(form.road_traffic_type) || "Road Traffic Accident"} recorded at ${form.place || "place not specified"}.`,
    `Personnel injured: ${countLabel(form.injured_count)}. Personnel dead: ${countLabel(form.dead_count)}.`,
  ];
  if (form.unit_involved) sections.push(`Unit involved: ${form.unit_involved}.`);
  if (vehicles.length) sections.push(`Vehicles / drivers:\n${vehicles.map(vehicleSummary).join("\n")}`);
  if (casualties.length) sections.push(`Onboard personnel / casualties:\n${casualties.map(casualtySummary).join("\n")}`);
  if (form.history) sections.push(`History: ${form.history}`);
  if (form.damages) sections.push(`Damages: ${form.damages}`);
  if (form.how_occurred) sections.push(`How the accident occurred: ${form.how_occurred}`);
  return sections.filter(Boolean).join("\n");
}

function entryTypeLabel(value) {
  return ENTRY_TYPE_LABELS.find(([type]) => type === value)?.[1] || String(value || "").replace(/_/g, " ");
}

const ENTRY_TYPES = [
  ["incident", "Incident"],
  [ROAD_TRAFFIC_ENTRY_TYPE, "Road Traffic Accident"],
  ["movement", "Movement"],
];

const ENTRY_TYPE_LABELS = [
  ["routine", "Routine"],
  ["incident", "Incident"],
  [ROAD_TRAFFIC_ENTRY_TYPE, "Road Traffic Accident"],
  ["message", "Message"],
  ["order", "Order"],
  ["movement", "Movement"],
  ["visitor", "Visitor"],
  ["guardroom", "Guardroom"],
  ["other", "Other"],
];

const TRAFFIC_METRIC_LABELS = {
  reported: "Reported",
  yankee: "Yankee",
  xray: "X-ray",
};

function occurrenceFilterParams(filters) {
  const params = { page_size: 200 };
  if (filters.entry_type) params.entry_type = filters.entry_type;
  if (filters.road_traffic_type) params.road_traffic_type = filters.road_traffic_type;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.metric) params.metric = filters.metric;
  return params;
}

function occurrenceFilterLabels(filters) {
  const labels = [];
  if (filters.entry_type) labels.push(entryTypeLabel(filters.entry_type));
  if (filters.road_traffic_type) labels.push(roadTrafficTypeLabel(filters.road_traffic_type));
  if (filters.metric) labels.push(TRAFFIC_METRIC_LABELS[filters.metric] || filters.metric);
  if (filters.date_from && filters.date_to) {
    labels.push(`${filters.date_from} to ${filters.date_to}`);
  } else if (filters.date_from) {
    labels.push(`From ${filters.date_from}`);
  } else if (filters.date_to) {
    labels.push(`To ${filters.date_to}`);
  }
  return labels;
}

const DUTY_TYPES = [
  ["12h", "12 Hours"],
  ["24h", "24 Hours"],
  ["weekly", "Weekly"],
  ["custom", "Custom"],
];

function emptyPost() {
  return {
    post_name: "Duty Room",
    duty_type: "24h",
    starts_at: dutyStartToday(),
    ends_at: dutyEndTomorrow(),
    required_personnel: 1,
    assigned_personnel: [],
    notes: "",
  };
}

function emptyRosterForm() {
  return {
    title: `PART 1 ORDERS ${formatDate(localDate())}`,
    start_date: localDate(),
    end_date: localDate(),
    posts: [emptyPost()],
  };
}

function emptyEntryForm() {
  return {
    occurred_at: localDateTime(),
    entry_type: "incident",
    road_traffic_type: "",
    injured_count: "0",
    dead_count: "0",
    injury_severity: "",
    rta_vehicles: [emptyRtaVehicle()],
    rta_casualties: [],
    incident_title: "",
    place: "",
    service_vehicle: "",
    unit_involved: "",
    civilian: "",
    service_member: "",
    service_member_number: "",
    service_member_rank: "",
    service_member_name: "",
    description: "",
    history: "",
    injuries: "",
    damages: "",
    how_occurred: "",
    police_ob_reference: "",
    requires_investigation: false,
  };
}

function emptyScheduleBuilder() {
  return {
    post_names: DEFAULT_DAILY_POST_NAMES,
    duty_type: "24h",
    required_personnel: 1,
  };
}

function toNumericIds(items) {
  return [...new Set(
    toArray(items)
      .map((item) => Number(typeof item === "object" && item !== null ? item.id : item))
      .filter(Number.isFinite)
  )];
}

function assignedPersonnelIds(post) {
  const ids = toNumericIds(post.assigned_personnel);
  return ids.length ? ids : toNumericIds(post.assigned_personnel_details);
}

function rosterToForm(roster) {
  const posts = toArray(roster.posts).map((post) => {
    const startsAt = toInputDateTime(post.starts_at) || dutyStartToday();
    const dutyType = post.duty_type || "24h";
    const endsAt = toInputDateTime(post.ends_at) || dutyEndFromType(startsAt, dutyType) || dutyEndTomorrow();
    return {
      post_name: post.post_name || "",
      duty_type: dutyType,
      starts_at: startsAt,
      ends_at: endsAt,
      required_personnel: post.required_personnel || 1,
      assigned_personnel: assignedPersonnelIds(post),
      notes: post.notes || "",
    };
  });
  return {
    title: roster.title || "",
    start_date: roster.start_date || localDate(),
    end_date: roster.end_date || roster.start_date || localDate(),
    posts: posts.length ? posts : [emptyPost()],
  };
}

function scheduleBuilderFromPosts(posts) {
  const names = [];
  const seenNames = new Set();
  toArray(posts).forEach((post) => {
    const name = String(post.post_name || "").trim();
    const key = normalizePostName(name);
    if (name && !seenNames.has(key)) {
      seenNames.add(key);
      names.push(name);
    }
  });
  const firstPost = toArray(posts)[0] || {};
  const dutyTypes = [...new Set(toArray(posts).map((post) => post.duty_type).filter(Boolean))];
  return {
    post_names: names.length ? names.join(", ") : DEFAULT_DAILY_POST_NAMES,
    duty_type: dutyTypes.length === 1 ? dutyTypes[0] : firstPost.duty_type || "24h",
    required_personnel: firstPost.required_personnel || 1,
  };
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function UnitAutocompleteInput({ value, onChange, disabled, options = [], placeholder = "Type to select unit...", required = false }) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = String(value || "").trim().toLowerCase();
  const suggestions = useMemo(() => {
    const startsWith = [];
    const contains = [];
    options.forEach((option) => {
      const name = String(option || "").trim();
      if (!name) return;
      const normalized = name.toLowerCase();
      if (!query || normalized.startsWith(query)) {
        startsWith.push(name);
      } else if (normalized.includes(query)) {
        contains.push(name);
      }
    });
    return [...startsWith, ...contains].slice(0, 10);
  }, [options, query]);
  const showSuggestions = open && !disabled && suggestions.length > 0;

  function chooseUnit(name) {
    onChange(name);
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div className="relative">
      <input
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
            chooseUnit(suggestions[activeIndex] || suggestions[0]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={listboxId}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      {showSuggestions && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
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
                chooseUnit(name);
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

function loadDutyRoomUnitOptions() {
  return dutyRoomService.unitOptions();
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[status] || "bg-slate-100 text-slate-700"}`}>
      {String(status || "").replace(/_/g, " ")}
    </span>
  );
}

export default function DutyRoom({ user }) {
  const [searchParams] = useSearchParams();
  const occurrenceSearch = searchParams.toString();
  const occurrenceFilters = useMemo(() => {
    const params = new URLSearchParams(occurrenceSearch);
    return {
      entry_type: params.get("entry_type") || "",
      road_traffic_type: params.get("road_traffic_type") || "",
      date_from: params.get("date_from") || "",
      date_to: params.get("date_to") || params.get("as_at") || "",
      metric: params.get("metric") || "",
    };
  }, [occurrenceSearch]);
  const hasOccurrenceFilters = useMemo(
    () => ["entry_type", "road_traffic_type", "date_from", "date_to", "metric"].some((field) => Boolean(occurrenceFilters[field])),
    [occurrenceFilters]
  );
  const occurrenceFilterSummary = useMemo(() => occurrenceFilterLabels(occurrenceFilters), [occurrenceFilters]);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return ["entry_type", "road_traffic_type", "date_from", "date_to", "as_at", "metric"].some((field) => Boolean(params.get(field))) ? "ob" : "rosters";
  });
  const [rosters, setRosters] = useState([]);
  const [entries, setEntries] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [units, setUnits] = useState([]);
  const [offences, setOffences] = useState([]);
  const [approvers, setApprovers] = useState([]);
  const [activeDuty, setActiveDuty] = useState(null);
  const [rosterForm, setRosterForm] = useState(emptyRosterForm());
  const [editingRosterId, setEditingRosterId] = useState(null);
  const [editingRosterTitle, setEditingRosterTitle] = useState("");
  const [loadingEditRosterId, setLoadingEditRosterId] = useState(null);
  const [previewRoster, setPreviewRoster] = useState(null);
  const [loadingPreviewRosterId, setLoadingPreviewRosterId] = useState(null);
  const [printAfterPreview, setPrintAfterPreview] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approvingRosterId, setApprovingRosterId] = useState(null);
  const [publishTarget, setPublishTarget] = useState(null);
  const [publishingRosterId, setPublishingRosterId] = useState(null);
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [incidentTarget, setIncidentTarget] = useState(null);
  const [convertingEntryId, setConvertingEntryId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingRosterId, setDeletingRosterId] = useState(null);
  const [scheduleBuilder, setScheduleBuilder] = useState(emptyScheduleBuilder());
  const [entryForm, setEntryForm] = useState(emptyEntryForm());
  const [forwardTargets, setForwardTargets] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingRoster, setSavingRoster] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [isMobileClient, setIsMobileClient] = useState(() => isMobilePartOneOrdersClient());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useAutoDismiss(notice, setNotice);
  useAutoDismiss(error, setError);

  const isOrderNco = user?.role === "order_nco";
  const orderNcoHasUnit = !!(user?.battalion || user?.detachment);
  const canApproveRole = ["detachment", "adj", "hod", "2ic", "oc"].includes(user?.role);
  const canConvertIncident = ["duty_officer", "admin", "co", "oc", "hod", "adj", "2ic", "detachment"].includes(user?.role) || activeDuty?.can_record_ob;

  const personnelOptions = useMemo(() => personnel.filter((item) => item.is_active !== false), [personnel]);
  const personnelById = useMemo(() => new Map(personnel.map((person) => [Number(person.id), person])), [personnel]);
  const unitNames = useMemo(() => {
    const seen = new Set();
    return units
      .map((unit) => String(typeof unit === "string" ? unit : unit?.name || "").trim())
      .filter((name) => {
        const key = name.toLowerCase();
        if (!name || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [units]);
  const offenceNames = useMemo(() => {
    const seen = new Set();
    return offences
      .map((offence) => String(typeof offence === "string" ? offence : offence?.name || "").trim())
      .filter((name) => {
        const key = name.toLowerCase();
        if (!name || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [offences]);
  const previewGroups = useMemo(() => partOneOrderGroups(previewRoster, personnelById), [previewRoster, personnelById]);
  const previewCanPrint = previewRoster ? canPrintRoster(previewRoster) : false;
  const mobilePartOneOrdersBlocked = activeTab === "rosters" && isMobileClient;
  const entryIsRoadTraffic = isRoadTrafficEntryType(entryForm.entry_type);
  const entryIsIncident = entryForm.entry_type === "incident";
  const entryIsMovement = entryForm.entry_type === "movement";
  const showManualDateTime = !entryIsIncident && !entryIsMovement;
  const originatingSubUnitLabel = userOriginatingSubUnitLabel(user, activeDuty?.post?.unit_label);
  const rtaType = entryForm.road_traffic_type;
  const showRtaInjuredCount = entryIsRoadTraffic && rtaType && rtaType !== "non_injury";
  const showRtaDeadCount = entryIsRoadTraffic && rtaType && !["non_injury", "injury"].includes(rtaType);

  useEffect(() => {
    if (!entryIsRoadTraffic || !entryForm.road_traffic_type) return;
    if (rtaCasualtiesMatchCounts(entryForm.rta_casualties, entryForm.road_traffic_type, entryForm.injured_count, entryForm.dead_count)) return;
    setEntryForm((prev) => {
      if (!isRoadTrafficEntryType(prev.entry_type) || !prev.road_traffic_type) return prev;
      if (rtaCasualtiesMatchCounts(prev.rta_casualties, prev.road_traffic_type, prev.injured_count, prev.dead_count)) return prev;
      return {
        ...prev,
        rta_casualties: syncRtaCasualtiesForCounts(prev.rta_casualties, prev.road_traffic_type, prev.injured_count, prev.dead_count),
      };
    });
  }, [entryForm.dead_count, entryForm.injured_count, entryForm.road_traffic_type, entryForm.rta_casualties, entryIsRoadTraffic]);

  useEffect(() => {
    function refreshDevicePolicy() {
      setIsMobileClient(isMobilePartOneOrdersClient());
    }
    refreshDevicePolicy();
    window.addEventListener("resize", refreshDevicePolicy);
    return () => window.removeEventListener("resize", refreshDevicePolicy);
  }, []);

  useEffect(() => {
    if (!isMobileClient || !previewRoster) return;
    setPreviewRoster(null);
    setPrintAfterPreview(false);
    setError(partOnePrintDeniedMessage(previewRoster, true));
  }, [isMobileClient, previewRoster]);

  useEffect(() => {
    if (!isMobileClient) return;
    setRosters([]);
    setPreviewRoster(null);
    setPrintAfterPreview(false);
  }, [isMobileClient]);

  useEffect(() => {
    if (!previewRoster || !printAfterPreview) return undefined;
    if (!previewCanPrint) {
      setError(partOnePrintDeniedMessage(previewRoster, isMobileClient));
      setPrintAfterPreview(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      window.print();
      setPrintAfterPreview(false);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [isMobileClient, previewRoster, previewCanPrint, printAfterPreview]);

  function isRosterOwnerOrderNco(roster) {
    return Boolean(isOrderNco && roster?.created_by && Number(roster.created_by) === Number(user?.id));
  }

  function isForwardedApprover(roster) {
    return Boolean(canApproveRole && roster?.forwarded_to && Number(roster.forwarded_to) === Number(user?.id));
  }

  function canPreviewRoster(roster) {
    if (!roster || isMobileClient) return false;
    if (roster.status === "published") return true;
    if (!["pending_approval", "approved"].includes(roster.status)) return false;
    return isRosterOwnerOrderNco(roster) || isForwardedApprover(roster);
  }

  function canPrintRoster(roster) {
    if (!canPreviewRoster(roster)) return false;
    if (roster.status === "published") return true;
    return isRosterOwnerOrderNco(roster) || isForwardedApprover(roster);
  }

  function printPreviewRoster() {
    if (!previewCanPrint) {
      setError(partOnePrintDeniedMessage(previewRoster, isMobileClient));
      return;
    }
    window.print();
  }

  function updateRtaVehicle(index, field, value) {
    setEntryForm((prev) => ({
      ...prev,
      rta_vehicles: prev.rta_vehicles.map((vehicle, vehicleIndex) => {
        if (vehicleIndex !== index) return vehicle;
        const next = { ...vehicle, [field]: value };
        if (field === "driver_person_type" && value === "civilian") {
          next.driver_rank = "";
          next.driver_unit = "";
        }
        if (field === "driver_person_type" && value === "service") {
          next.driver_unknown = false;
          if (next.driver_identifier === "Unknown") next.driver_identifier = "";
          if (next.driver_name === "Unknown") next.driver_name = "";
        }
        if (field === "driver_unknown") {
          next.driver_unknown = Boolean(value);
          next.driver_rank = "";
          next.driver_unit = "";
          if (value) {
            next.driver_identifier = "Unknown";
            next.driver_name = "Unknown";
          } else {
            next.driver_identifier = "";
            next.driver_name = "";
          }
        }
        return next;
      }),
    }));
  }

  function updateRtaCasualty(index, field, value) {
    setEntryForm((prev) => ({
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
  }

  function loadData() {
    setLoading(true);
    const shouldLoadPartOneOrders = !isMobilePartOneOrdersClient();
    Promise.allSettled([
      shouldLoadPartOneOrders ? dutyRoomService.rosters({ page_size: 200 }) : Promise.resolve({ data: [] }),
      dutyRoomService.entries(occurrenceFilterParams(occurrenceFilters)),
      dutyRoomService.activeDutyRoom(),
      isOrderNco && shouldLoadPartOneOrders ? dutyRoomService.approvers() : Promise.resolve({ data: [] }),
      isOrderNco && shouldLoadPartOneOrders ? userService.list({ page_size: 300 }) : Promise.resolve({ data: [] }),
      loadDutyRoomUnitOptions(),
      offenceService.list(),
    ])
      .then(([rosterRes, entryRes, activeRes, approverRes, userRes, unitRes, offenceRes]) => {
        setRosters(toArray(settledData(rosterRes)));
        setEntries(toArray(settledData(entryRes)));
        setActiveDuty(settledData(activeRes) || null);
        setApprovers(toArray(settledData(approverRes)));
        setPersonnel(toArray(settledData(userRes)));
        setUnits(toArray(settledData(unitRes)));
        setOffences(toArray(settledData(offenceRes)));

        const failures = [
          settledError(rosterRes, "Failed to load Part 1 Orders."),
          settledError(entryRes, "Failed to load occurrence book entries."),
          settledError(activeRes, "Failed to check current Duty Room assignment."),
          isOrderNco && shouldLoadPartOneOrders ? settledError(approverRes, "Failed to load Part 1 Orders approvers.") : "",
          isOrderNco && shouldLoadPartOneOrders ? settledError(userRes, "Failed to load personnel list.") : "",
          settledError(unitRes, "Failed to load unit list."),
          settledError(offenceRes, "Failed to load offence list."),
        ].filter(Boolean);
        setError(failures[0] || "");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occurrenceFilters]);

  useEffect(() => {
    if (hasOccurrenceFilters) {
      setActiveTab("ob");
    }
  }, [hasOccurrenceFilters]);

  function updateRosterField(field, value) {
    setRosterForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "start_date" && prev.posts.length === 1) {
        const startsAt = dateAtDutyStart(value);
        next.posts = prev.posts.map((post) => {
          const autoEnd = dutyEndFromType(startsAt, post.duty_type);
          return {
            ...post,
            starts_at: startsAt,
            ends_at: autoEnd || post.ends_at,
          };
        });
      }
      return next;
    });
  }

  function updatePost(index, field, value) {
    setRosterForm((prev) => ({
      ...prev,
      posts: prev.posts.map((post, idx) => {
        if (idx !== index) return post;
        const next = { ...post, [field]: value };
        if (field === "duty_type") {
          const autoEnd = dutyEndFromType(next.starts_at, value);
          if (autoEnd) next.ends_at = autoEnd;
        }
        if (field === "starts_at") {
          const autoEnd = dutyEndFromType(value, next.duty_type);
          if (autoEnd) next.ends_at = autoEnd;
        }
        return next;
      }),
    }));
  }

  function updateScheduleBuilder(field, value) {
    setScheduleBuilder((prev) => ({ ...prev, [field]: value }));
  }

  function generateDailyPosts() {
    const names = parsePostNames(scheduleBuilder.post_names);
    const dates = datesBetween(rosterForm.start_date, rosterForm.end_date);
    if (!names.length) {
      setError("Enter at least one post name, for example Duty Room or Gate.");
      return;
    }
    if (!dates.length) {
      setError("Select a valid Part 1 Orders start and end date before generating daily posts.");
      return;
    }
    const requiredPersonnel = Math.max(Number(scheduleBuilder.required_personnel || 1), 1);
    const posts = dates.flatMap((date) =>
      names.map((postName) => {
        const startsAt = `${date}T08:00`;
        const endsAt = dutyEndFromType(startsAt, scheduleBuilder.duty_type) || addMinutesToLocalDateTime(startsAt, 24 * 60);
        return {
          post_name: postName,
          duty_type: scheduleBuilder.duty_type,
          starts_at: startsAt,
          ends_at: endsAt,
          required_personnel: requiredPersonnel,
          assigned_personnel: [],
          notes: "",
        };
      })
    );
    setRosterForm((prev) => ({ ...prev, posts }));
    setError("");
    setNotice(`${posts.length} duty post rows generated for ${names.join(", ")}.`);
  }

  function addPost() {
    setRosterForm((prev) => ({ ...prev, posts: [...prev.posts, { ...emptyPost(), post_name: "Gate" }] }));
  }

  function addNextPeriod(index) {
    setRosterForm((prev) => {
      const source = prev.posts[index];
      if (!source) return prev;
      const startsAt = source.ends_at || dutyEndFromType(source.starts_at, source.duty_type) || dutyStartToday();
      const customMinutes = minutesBetweenLocalDateTimes(source.starts_at, source.ends_at);
      const endsAt =
        dutyEndFromType(startsAt, source.duty_type) ||
        addMinutesToLocalDateTime(startsAt, customMinutes || 24 * 60) ||
        dutyEndTomorrow();
      const nextPost = {
        ...source,
        starts_at: startsAt,
        ends_at: endsAt,
        assigned_personnel: [],
        notes: "",
      };
      const posts = [...prev.posts];
      posts.splice(index + 1, 0, nextPost);
      return { ...prev, posts };
    });
    setError("");
  }

  function removePost(index) {
    setRosterForm((prev) => ({
      ...prev,
      posts: prev.posts.length === 1 ? prev.posts : prev.posts.filter((_, idx) => idx !== index),
    }));
  }

  async function startEditRoster(roster) {
    setLoadingEditRosterId(roster.id);
    setError("");
    setNotice("");
    try {
      const response = await dutyRoomService.getRoster(roster.id);
      const fullRoster = response.data || roster;
      const form = rosterToForm(fullRoster);
      setEditingRosterId(fullRoster.id || roster.id);
      setEditingRosterTitle(fullRoster.title || roster.title || "");
      setRosterForm(form);
      setScheduleBuilder(scheduleBuilderFromPosts(form.posts));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const form = rosterToForm(roster);
      setEditingRosterId(roster.id);
      setEditingRosterTitle(roster.title || "");
      setRosterForm(form);
      setScheduleBuilder(scheduleBuilderFromPosts(form.posts));
      setError(formatError(err, "Loaded table details, but failed to fetch the latest saved Part 1 Orders."));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoadingEditRosterId(null);
    }
  }

  function cancelEditRoster() {
    setEditingRosterId(null);
    setEditingRosterTitle("");
    setRosterForm(emptyRosterForm());
    setScheduleBuilder(emptyScheduleBuilder());
    setError("");
  }

  function deleteDraftRoster(roster) {
    setDeleteTarget(roster);
    setError("");
  }

  async function openPreviewRoster(roster, { print = false } = {}) {
    if (!canPreviewRoster(roster)) {
      setError(partOnePrintDeniedMessage(roster, isMobileClient));
      setPrintAfterPreview(false);
      return;
    }
    if (print && !canPrintRoster(roster)) {
      setError(partOnePrintDeniedMessage(roster, isMobileClient));
      setPrintAfterPreview(false);
      return;
    }
    setLoadingPreviewRosterId(roster.id);
    setPrintAfterPreview(print);
    setError("");
    try {
      const response = await dutyRoomService.getRoster(roster.id);
      setPreviewRoster(response.data || roster);
    } catch (err) {
      setPreviewRoster(roster);
      setError(formatError(err, "Loaded table details, but failed to fetch the latest saved Part 1 Orders preview."));
    } finally {
      setLoadingPreviewRosterId(null);
    }
  }

  function closePreviewRoster() {
    setPreviewRoster(null);
    setPrintAfterPreview(false);
  }

  async function confirmDeleteDraftRoster() {
    if (!deleteTarget) return;
    setDeletingRosterId(deleteTarget.id);
    try {
      await dutyRoomService.deleteRoster(deleteTarget.id);
      if (Number(editingRosterId) === Number(deleteTarget.id)) {
        setEditingRosterId(null);
        setEditingRosterTitle("");
        setRosterForm(emptyRosterForm());
        setScheduleBuilder(emptyScheduleBuilder());
      }
      setDeleteTarget(null);
      setNotice("Part 1 Orders draft deleted.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to delete Part 1 Orders draft."));
    } finally {
      setDeletingRosterId(null);
    }
  }

  function handleAssignedPersonnel(index, options) {
    const selected = Array.from(options).filter((option) => option.selected).map((option) => Number(option.value));
    updatePost(index, "assigned_personnel", selected);
  }

  function rosterShortfalls(roster) {
    return toArray(roster.posts)
      .filter((post) => Number(post.assigned_count || 0) < Number(post.required_personnel || 0))
      .map((post) => `${post.post_name}: ${post.assigned_count || 0}/${post.required_personnel || 0}`);
  }

  function assignmentConflictMessage(posts) {
    const assignments = posts.flatMap((post, index) =>
      toArray(post.assigned_personnel).map((personId) => ({
        personId: Number(personId),
        postName: post.post_name || `Post ${index + 1}`,
        startsAt: new Date(post.starts_at),
        endsAt: new Date(post.ends_at),
      }))
    );
    for (let leftIndex = 0; leftIndex < assignments.length; leftIndex += 1) {
      const left = assignments[leftIndex];
      if (!left.personId || Number.isNaN(left.startsAt.getTime()) || Number.isNaN(left.endsAt.getTime())) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < assignments.length; rightIndex += 1) {
        const right = assignments[rightIndex];
        if (left.personId !== right.personId || Number.isNaN(right.startsAt.getTime()) || Number.isNaN(right.endsAt.getTime())) continue;
        const label = userLabelById(personnelById, left.personId);
        if (left.startsAt < right.endsAt && right.startsAt < left.endsAt) {
          return `${label} is assigned to ${left.postName} and ${right.postName} at overlapping times.`;
        }
        const [earlier, later] = left.endsAt <= right.startsAt ? [left, right] : [right, left];
        const restMs = later.startsAt.getTime() - earlier.endsAt.getTime();
        if (restMs >= 0 && restMs < MIN_REST_MS) {
          if (normalizePostName(earlier.postName) === normalizePostName(later.postName)) {
            continue;
          }
          return `${label} must have at least 24 hours rest between ${earlier.postName} and ${later.postName}.`;
        }
      }
    }
    return "";
  }

  async function createRoster(event) {
    event.preventDefault();
    if (isMobilePartOneOrdersClient()) {
      setError(partOnePrintDeniedMessage(null, true));
      return;
    }
    if (!orderNcoHasUnit) {
      setError("Order NCO account must be attached to a battalion or company before generating Part 1 Orders.");
      return;
    }
    setSavingRoster(true);
    setError("");
    try {
      const posts = rosterForm.posts.map((post) => ({
        ...post,
        post_name: String(post.post_name || "").trim(),
        required_personnel: Number(post.required_personnel || 1),
        assigned_personnel: toArray(post.assigned_personnel).map(Number).filter(Number.isFinite),
      }));
      if (!String(rosterForm.title || "").trim()) {
        setError("Part 1 Orders title is required.");
        return;
      }
      if (!rosterForm.start_date || !rosterForm.end_date || rosterForm.start_date > rosterForm.end_date) {
        setError("Part 1 Orders end date cannot be before the start date.");
        return;
      }
      if (!posts.length) {
        setError("Add at least one duty post.");
        return;
      }
      const invalidPostIndex = posts.findIndex((post) => !post.post_name || !post.starts_at || !post.ends_at || post.required_personnel < 1);
      if (invalidPostIndex >= 0) {
        setError(`Post ${invalidPostIndex + 1} must have a name, start time, end time, and at least one required personnel.`);
        return;
      }
      const invalidTimeIndex = posts.findIndex((post) => new Date(post.starts_at) >= new Date(post.ends_at));
      if (invalidTimeIndex >= 0) {
        const post = posts[invalidTimeIndex];
        setError(`Post ${invalidTimeIndex + 1} (${post.post_name}) end time must be after the start time. ${post.duty_type === "24h" ? "For 24 Hours, the end time should be the next day at 0800 hrs." : ""}`);
        return;
      }
      const conflictMessage = assignmentConflictMessage(posts);
      if (conflictMessage) {
        setError(conflictMessage);
        return;
      }
      const payload = {
        ...rosterForm,
        title: String(rosterForm.title || "").trim(),
        posts,
      };
      if (editingRosterId) {
        await dutyRoomService.updateRoster(editingRosterId, payload);
        setNotice("Part 1 Orders updated and returned to draft.");
      } else {
        await dutyRoomService.createRoster(payload);
        setNotice("Part 1 Orders saved as draft.");
      }
      setRosterForm(emptyRosterForm());
      setScheduleBuilder(emptyScheduleBuilder());
      setEditingRosterId(null);
      setEditingRosterTitle("");
      loadData();
    } catch (err) {
      setError(formatError(err, editingRosterId ? "Failed to update Part 1 Orders." : "Failed to save Part 1 Orders."));
    } finally {
      setSavingRoster(false);
    }
  }

  async function forwardRoster(roster) {
    const forwardedTo = forwardTargets[roster.id];
    if (!forwardedTo) {
      setError("Select an approver before forwarding Part 1 Orders.");
      return;
    }
    try {
      await dutyRoomService.forwardRoster(roster.id, { forwarded_to: forwardedTo });
      setNotice("Part 1 Orders forwarded for approval.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to forward Part 1 Orders."));
    }
  }

  async function approveRoster(roster) {
    setApproveTarget(roster);
    setError("");
  }

  async function confirmApproveRoster() {
    if (!approveTarget) return;
    setApprovingRosterId(approveTarget.id);
    try {
      await dutyRoomService.approveRoster(approveTarget.id, {});
      setApproveTarget(null);
      setNotice("Part 1 Orders approved.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to approve Part 1 Orders."));
    } finally {
      setApprovingRosterId(null);
    }
  }

  async function returnRoster(roster) {
    setReviewAction({ mode: "return", roster, reason: "" });
    setError("");
  }

  async function declineRoster(roster) {
    setReviewAction({ mode: "decline", roster, reason: "" });
    setError("");
  }

  async function confirmReviewAction() {
    if (!reviewAction?.roster) return;
    const reason = String(reviewAction.reason || "").trim();
    if (!reason) return;
    setReviewSaving(true);
    try {
      if (reviewAction.mode === "return") {
        await dutyRoomService.returnRoster(reviewAction.roster.id, { reason });
        setNotice("Part 1 Orders returned to Order NCO.");
      } else {
        await dutyRoomService.declineRoster(reviewAction.roster.id, { reason });
        setNotice("Part 1 Orders declined.");
      }
      setReviewAction(null);
      loadData();
    } catch (err) {
      setError(formatError(err, reviewAction.mode === "return" ? "Failed to return Part 1 Orders." : "Failed to decline Part 1 Orders."));
    } finally {
      setReviewSaving(false);
    }
  }

  async function publishRoster(roster) {
    setPublishTarget(roster);
    setError("");
  }

  async function confirmPublishRoster() {
    if (!publishTarget) return;
    setPublishingRosterId(publishTarget.id);
    try {
      await dutyRoomService.publishRoster(publishTarget.id);
      setPublishTarget(null);
      setNotice("Part 1 Orders published. Assigned personnel have been notified.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to publish Part 1 Orders."));
    } finally {
      setPublishingRosterId(null);
    }
  }

  async function createEntry(event) {
    event.preventDefault();
    const payload = { ...entryForm };
    if (isRoadTrafficEntryType(payload.entry_type)) {
      if (!payload.road_traffic_type) {
        setError("Select the road traffic accident type before recording the OB entry.");
        return;
      }
      const { injuredCount, deadCount } = casualtyCountsForType(
        payload.road_traffic_type,
        payload.injured_count,
        payload.dead_count
      );
      const cleanedVehicles = toArray(payload.rta_vehicles).filter(hasVehicleData).map(cleanRtaVehicle);
      const cleanedCasualties = syncRtaCasualtiesForCounts(
        payload.rta_casualties,
        payload.road_traffic_type,
        injuredCount,
        deadCount
      ).map(cleanRtaCasualty);
      const casualtyMissingSeverity = cleanedCasualties.some((casualty) =>
        casualty.casualty_status === "injured" && !casualty.injury_severity
      );
      if (cleanedVehicles.length === 0) {
        setError("Add at least one vehicle and driver entry for the road traffic accident.");
        return;
      }
      if (
        payload.road_traffic_type === "non_injury" &&
        !cleanedVehicles.some((vehicle) => vehicle.driver_unknown || vehicle.driver_identifier || vehicle.driver_name)
      ) {
        setError("Capture driver details for a Non-Injury Road Traffic Accident.");
        return;
      }
      if (isInjuryRoadTrafficType(payload.road_traffic_type) && injuredCount < 1) {
        setError("Enter the number of injured personnel for an Injury Road Traffic Accident.");
        return;
      }
      if (isFatalRoadTrafficType(payload.road_traffic_type) && deadCount < 1) {
        setError("Enter the number of dead personnel for a Fatal Road Traffic Accident.");
        return;
      }
      if (!String(payload.history || "").trim()) {
        setError("Enter the history of the road traffic accident.");
        return;
      }
      if (!String(payload.how_occurred || "").trim()) {
        setError("Enter how the road traffic accident occurred.");
        return;
      }
      if (casualtyMissingSeverity) {
        setError("Select injury severity for every injured onboard person.");
        return;
      }
      payload.injured_count = injuredCount;
      payload.dead_count = deadCount;
      payload.rta_vehicles = cleanedVehicles;
      payload.rta_casualties = cleanedCasualties;
      payload.injury_severity = cleanedCasualties.find((casualty) => casualty.casualty_status === "injured")?.injury_severity || "";
      payload.service_vehicle = cleanedVehicles
        .filter((vehicle) => vehicle.vehicle_type === "service")
        .map((vehicle, index) => vehicleSummary(vehicle, index))
        .join("\n");
      payload.civilian = cleanedVehicles
        .filter((vehicle) => vehicle.vehicle_type === "civilian")
        .map((vehicle, index) => vehicleSummary(vehicle, index))
        .join("\n");
      payload.service_member = cleanedVehicles
        .map((vehicle) => {
          const driver = personLabel({
            identifier: vehicle.driver_identifier,
            rank: vehicle.driver_rank,
            name: vehicle.driver_name,
            unit: vehicle.driver_unit,
            driver_unknown: vehicle.driver_unknown,
          }, vehicle.driver_person_type === "civilian" ? "ID No" : "Svc No");
          return driver ? `Driver: ${driver}` : "";
        })
        .filter(Boolean)
        .join("\n");
      payload.injuries = cleanedCasualties.length
        ? cleanedCasualties.map(casualtySummary).join("\n")
        : `Personnel injured: ${countLabel(payload.injured_count)}. Personnel dead: ${countLabel(payload.dead_count)}.`;
      payload.description = buildRtaDescription(payload);
      payload.requires_investigation = true;
      payload.incident_title = roadTrafficTypeLabel(payload.road_traffic_type);
    } else {
      payload.road_traffic_type = "";
      payload.injured_count = null;
      payload.dead_count = null;
      payload.injury_severity = "";
      payload.rta_vehicles = [];
      payload.rta_casualties = [];
      if (payload.entry_type === "incident") {
        payload.requires_investigation = true;
        payload.incident_title = String(payload.incident_title || "").trim();
        payload.service_member = serviceMemberSummary(payload);
        payload.description = String(payload.history || "").trim();
        if (!payload.occurred_at) {
          payload.occurred_at = localDateTime();
        }
        if (!payload.incident_title) {
          setError("Enter the incident.");
          return;
        }
        if (!String(payload.place || "").trim()) {
          setError("Enter the place of the incident.");
          return;
        }
        if (!String(payload.unit_involved || "").trim()) {
          setError("Select the unit involved in the incident.");
          return;
        }
        if (!String(payload.history || "").trim()) {
          setError("Enter the history of the incident.");
          return;
        }
      } else if (payload.entry_type === "movement") {
        payload.occurred_at = localDateTime();
        payload.requires_investigation = false;
        payload.incident_title = "";
        payload.place = "";
        payload.service_vehicle = "";
        payload.unit_involved = "";
        payload.civilian = "";
        payload.service_member = "";
        payload.history = "";
        payload.injuries = "";
        payload.damages = "";
        payload.how_occurred = "";
        if (!String(payload.description || "").trim()) {
          setError("Enter the description of the movement.");
          return;
        }
      }
    }
    delete payload.action_taken;
    delete payload.service_member_number;
    delete payload.service_member_rank;
    delete payload.service_member_name;
    setSavingEntry(true);
    setError("");
    try {
      await dutyRoomService.createEntry(payload);
      setEntryForm(emptyEntryForm());
      setNotice("OB entry recorded.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to record OB entry."));
    } finally {
      setSavingEntry(false);
    }
  }

  async function createIncident(entry) {
    setIncidentTarget(entry);
    setError("");
  }

  async function confirmCreateIncident() {
    if (!incidentTarget) return;
    setConvertingEntryId(incidentTarget.id);
    try {
      await dutyRoomService.createIncident(incidentTarget.id, {
        incident_type: incidentTarget.incident_title,
      });
      setIncidentTarget(null);
      setNotice("OB entry converted to incident.");
      loadData();
    } catch (err) {
      setError(formatError(err, "Failed to convert OB entry to incident."));
    } finally {
      setConvertingEntryId(null);
    }
  }

  return (
    <div className="min-h-screen space-y-5 bg-slate-100 p-4 text-slate-900 md:p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">Duty Room</h2>
        <p className="text-sm text-slate-600">Part 1 Orders approval, published duty visibility, and daily occurrence book entries.</p>
      </div>

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || notice}
        </div>
      )}

      {mobilePartOneOrdersBlocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Restricted order policy: mobile phone access, preview, printing, downloading, and screenshots of Part 1 Orders are prohibited. Use an authorised desktop terminal.
        </div>
      )}

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab("rosters")}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === "rosters" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          PART 1 ORDERS
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ob")}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === "ob" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Occurrence Book
        </button>
      </div>

      {activeTab === "rosters" && isOrderNco && !isMobileClient && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold">Part 1 Orders warning</p>
          <p className="mt-1">
            Review the draft carefully before forwarding. Unforwarded Part 1 Orders can be edited or deleted by the creating Order NCO, but once forwarded they cannot be deleted. The same post can run on different days in one publication, but personnel cannot be assigned to overlapping duties or switched to another post without at least 24 hours rest.
          </p>
        </div>
      )}

      {mobilePartOneOrdersBlocked ? (
        <section className="rounded-lg border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-amber-900">Part 1 Orders Restricted</h3>
          </div>
          <div className="space-y-2 p-4 text-sm text-slate-700">
            <p>
              Part 1 Orders are not displayed on mobile phones because downloading, photographing, and screenshots are prohibited.
            </p>
            <p className="font-semibold text-slate-900">
              Open this page on an authorised desktop terminal to generate, approve, preview, publish, or print Part 1 Orders.
            </p>
          </div>
        </section>
      ) : activeTab === "rosters" ? (
        <>
          {isOrderNco && (
            <form onSubmit={createRoster} className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                    {editingRosterId ? "Edit PART 1 ORDERS" : "Generate PART 1 ORDERS"}
                  </h3>
                  {editingRosterId && (
                    <p className="mt-1 text-xs text-slate-500">
                      Editing {editingRosterTitle || rosterForm.title}
                    </p>
                  )}
                </div>
                {editingRosterId && (
                  <button type="button" onClick={cancelEditRoster} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Cancel Edit
                  </button>
                )}
              </div>
              <div className="space-y-4 p-4">
                {!orderNcoHasUnit && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    This Order NCO account must be attached to a battalion or company before it can generate Part 1 Orders.
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Part 1 Orders Title">
                    <input
                      value={rosterForm.title}
                      onChange={(event) => updateRosterField("title", event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      required
                    />
                  </Field>
                  <Field label="Start Date">
                    <input
                      type="date"
                      value={rosterForm.start_date}
                      onChange={(event) => updateRosterField("start_date", event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      required
                    />
                  </Field>
                  <Field label="End Date">
                    <input
                      type="date"
                      value={rosterForm.end_date}
                      onChange={(event) => updateRosterField("end_date", event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      required
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">Posts and Personnel Required</h4>
                  <button type="button" onClick={addPost} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                    Add Single Post
                  </button>
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_160px_auto]">
                    <Field label="Daily Post Names">
                      <input
                        value={scheduleBuilder.post_names}
                        onChange={(event) => updateScheduleBuilder("post_names", event.target.value)}
                        className="w-full rounded-md border border-blue-200 px-3 py-2 text-sm"
                        placeholder="Duty Room, Gate"
                      />
                    </Field>
                    <Field label="Duty Type">
                      <select
                        value={scheduleBuilder.duty_type}
                        onChange={(event) => updateScheduleBuilder("duty_type", event.target.value)}
                        className="w-full rounded-md border border-blue-200 px-3 py-2 text-sm"
                      >
                        {DUTY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                    <Field label="Personnel Per Post">
                      <input
                        type="number"
                        min="1"
                        value={scheduleBuilder.required_personnel}
                        onChange={(event) => updateScheduleBuilder("required_personnel", event.target.value)}
                        className="w-full rounded-md border border-blue-200 px-3 py-2 text-sm"
                      />
                    </Field>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={generateDailyPosts}
                        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Generate Daily Posts
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {rosterForm.posts.map((post, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {post.post_name || `Post ${index + 1}`}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">
                            {dutyPeriodLabel(post)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button type="button" onClick={() => addNextPeriod(index)} className="rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                            Add Next Period
                          </button>
                          <button type="button" onClick={() => removePost(index)} className="text-xs font-semibold text-red-600 hover:underline" disabled={rosterForm.posts.length === 1}>
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-6">
                        <Field label="Post">
                          <input
                            value={post.post_name}
                            onChange={(event) => updatePost(index, "post_name", event.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            required
                          />
                        </Field>
                        <Field label="Duty Type">
                          <select value={post.duty_type} onChange={(event) => updatePost(index, "duty_type", event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                            {DUTY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </Field>
                        <Field label="Starts">
                          <input
                            type="datetime-local"
                            value={post.starts_at}
                            onChange={(event) => updatePost(index, "starts_at", event.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            required
                          />
                        </Field>
                        <Field label="Ends">
                          <input
                            type="datetime-local"
                            value={post.ends_at}
                            onChange={(event) => updatePost(index, "ends_at", event.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            required
                          />
                        </Field>
                        <Field label="Required Personnel">
                          <input
                            type="number"
                            min="1"
                            value={post.required_personnel}
                            onChange={(event) => updatePost(index, "required_personnel", event.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            required
                          />
                        </Field>
                        <Field label="Assigned Count">
                          <div className={`rounded-md border px-3 py-2 text-sm font-bold ${post.assigned_personnel.length >= Number(post.required_personnel || 1) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                            {post.assigned_personnel.length} / {post.required_personnel || 1}
                          </div>
                        </Field>
                      </div>
                      <div className="mt-3">
                        <Field label="Assign Personnel For This Period">
                          <select
                            multiple
                            value={post.assigned_personnel.map(String)}
                            onChange={(event) => handleAssignedPersonnel(index, event.target.options)}
                            className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          >
                            {personnelOptions.map((person) => (
                              <option key={person.id} value={person.id}>{userOptionLabel(person)}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button type="submit" disabled={savingRoster || !orderNcoHasUnit} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                    {savingRoster ? "Saving..." : editingRosterId ? "Update Draft Part 1 Orders" : "Save Draft Part 1 Orders"}
                  </button>
                </div>
              </div>
            </form>
          )}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">PART 1 ORDERS</h3>
              <span className="text-xs text-slate-500">{rosters.length} total</span>
            </div>
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading Part 1 Orders...</p>
            ) : rosters.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No Part 1 Orders found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Part 1 Orders</th>
                      <th className="px-4 py-3 text-left">Unit</th>
                      <th className="px-4 py-3 text-left">Period</th>
                      <th className="px-4 py-3 text-left">Posts</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Approval</th>
                      <th className="px-4 py-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rosters.map((roster) => {
                      const shortfalls = rosterShortfalls(roster);
                      const isOwnRoster = isOrderNco && Number(roster.created_by) === Number(user?.id);
                      const isForwardable = isOrderNco && ["draft", "returned", "declined"].includes(roster.status);
                      const isOwnUnforwardedDraft = isOwnRoster && roster.status === "draft" && !roster.forwarded_to && !roster.forwarded_at;
                      const isEditableReturned = isOwnRoster && roster.status === "returned";
                      const isEditableDraft = isOwnUnforwardedDraft || isEditableReturned;
                      const isApprovalTarget = isForwardedApprover(roster) && roster.status === "pending_approval";
                      const canPreviewCurrent = canPreviewRoster(roster);
                      const canPrintCurrent = canPrintRoster(roster);
                      return (
                        <tr key={roster.id} className="align-top hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{roster.title}</p>
                            <p className="text-xs text-slate-500">By {roster.created_by_name || "--"}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{roster.unit_label || "--"}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(roster.start_date)} - {formatDate(roster.end_date)}</td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {toArray(roster.posts).map((post) => (
                                <div key={post.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                                  <span className="font-semibold">{post.post_name}</span>
                                  <span className={post.is_filled ? "ml-2 text-emerald-700" : "ml-2 text-amber-700"}>
                                    {post.assigned_count}/{post.required_personnel}
                                  </span>
                                  <span className="ml-2 text-slate-500">{formatDateTime(post.starts_at)} - {formatDateTime(post.ends_at)}</span>
                                </div>
                              ))}
                            </div>
                            {shortfalls.length > 0 && <p className="mt-2 text-xs text-amber-700">Short: {shortfalls.join(", ")}</p>}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={roster.status} /></td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {roster.forwarded_to_name && <p>To: {roster.forwarded_to_name}</p>}
                            {roster.approved_by_name && <p>Approved by: {roster.approved_by_name}</p>}
                            {roster.returned_reason && <p className="text-orange-700">Returned: {roster.returned_reason}</p>}
                            {roster.declined_reason && <p className="text-red-700">Declined: {roster.declined_reason}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              {isEditableDraft && (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditRoster(roster)}
                                    disabled={Boolean(loadingEditRosterId)}
                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    {loadingEditRosterId === roster.id ? "Loading..." : roster.status === "returned" ? "Edit Returned" : "Edit Draft"}
                                  </button>
                                  {isOwnUnforwardedDraft && (
                                    <button type="button" onClick={() => deleteDraftRoster(roster)} className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
                                      Delete Draft
                                    </button>
                                  )}
                                </div>
                              )}
                              {isForwardable && (
                                <>
                                  <select
                                    value={forwardTargets[roster.id] || ""}
                                    onChange={(event) => setForwardTargets((prev) => ({ ...prev, [roster.id]: event.target.value }))}
                                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                                  >
                                    <option value="">Select approver</option>
                                    {approvers.map((person) => (
                                      <option key={person.id} value={person.id}>{person.label}</option>
                                    ))}
                                  </select>
                                  <button type="button" onClick={() => forwardRoster(roster)} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                                    Forward
                                  </button>
                                </>
                              )}
                              {isOrderNco && roster.status === "approved" && canPreviewCurrent && (
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openPreviewRoster(roster)}
                                    disabled={Boolean(loadingPreviewRosterId) || !canPreviewCurrent}
                                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    {loadingPreviewRosterId === roster.id ? "Loading..." : "Preview Before Print"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPreviewRoster(roster, { print: true })}
                                    disabled={Boolean(loadingPreviewRosterId) || !canPrintCurrent}
                                    className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                  >
                                    {loadingPreviewRosterId === roster.id ? "Loading..." : "Print"}
                                  </button>
                                  <button type="button" onClick={() => publishRoster(roster)} className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                                    Publish
                                  </button>
                                </div>
                              )}
                              {isApprovalTarget && (
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openPreviewRoster(roster)}
                                    disabled={Boolean(loadingPreviewRosterId) || !canPreviewCurrent}
                                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    {loadingPreviewRosterId === roster.id ? "Loading..." : "Preview"}
                                  </button>
                                  <button type="button" onClick={() => approveRoster(roster)} className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button>
                                  <button type="button" onClick={() => returnRoster(roster)} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">Return</button>
                                  <button type="button" onClick={() => declineRoster(roster)} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Decline</button>
                                </div>
                              )}
                              {roster.status === "published" && canPreviewCurrent && (
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openPreviewRoster(roster)}
                                    disabled={Boolean(loadingPreviewRosterId)}
                                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    {loadingPreviewRosterId === roster.id ? "Loading..." : "Preview"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPreviewRoster(roster, { print: true })}
                                    disabled={Boolean(loadingPreviewRosterId) || !canPrintCurrent}
                                    className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                  >
                                    {loadingPreviewRosterId === roster.id ? "Loading..." : "Print"}
                                  </button>
                                </div>
                              )}
                              {isForwardedApprover(roster) && roster.status === "approved" && canPreviewCurrent && (
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openPreviewRoster(roster)}
                                    disabled={Boolean(loadingPreviewRosterId)}
                                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    {loadingPreviewRosterId === roster.id ? "Loading..." : "Preview"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPreviewRoster(roster, { print: true })}
                                    disabled={Boolean(loadingPreviewRosterId) || !canPrintCurrent}
                                    className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                  >
                                    {loadingPreviewRosterId === roster.id ? "Loading..." : "Print"}
                                  </button>
                                </div>
                              )}
                              {isMobileClient && ["pending_approval", "approved", "published"].includes(roster.status) && (
                                <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                                  Mobile preview and print prohibited
                                </span>
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
        </>
      ) : (
        <>
          <section className={`rounded-lg border px-4 py-3 text-sm ${activeDuty?.can_record_ob ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {activeDuty?.can_record_ob ? (
              <p>
                Current Duty Room duty: <strong>{activeDuty.post?.roster}</strong>, {activeDuty.post?.unit_label}, until {formatDateTime(activeDuty.post?.ends_at)}.
              </p>
            ) : (
              <p>{activeDuty?.message || "Only personnel currently assigned to Duty Room duty can record OB entries."}</p>
            )}
          </section>

          <form onSubmit={createEntry} className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Record OB Entry</h3>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {showManualDateTime && (
                <Field label="Time">
                  <input
                    type="datetime-local"
                    value={entryForm.occurred_at}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, occurred_at: event.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    disabled={!activeDuty?.can_record_ob}
                    required
                  />
                </Field>
              )}
              <Field label="OB Category">
                <select
                  value={entryForm.entry_type}
                  onChange={(event) => {
                    const entryType = event.target.value;
                    setEntryForm((prev) => {
                      const isRoadTraffic = isRoadTrafficEntryType(entryType);
                      const isIncident = entryType === "incident";
                      const isMovement = entryType === "movement";
                      return {
                        ...prev,
                        entry_type: entryType,
                        road_traffic_type: isRoadTraffic ? prev.road_traffic_type : "",
                        injured_count: isRoadTraffic ? (prev.injured_count || "0") : "0",
                        dead_count: isRoadTraffic ? (prev.dead_count || "0") : "0",
                        injury_severity: isRoadTraffic ? prev.injury_severity : "",
                        rta_vehicles: isRoadTraffic && prev.rta_vehicles.length ? prev.rta_vehicles : [emptyRtaVehicle()],
                        rta_casualties: isRoadTraffic
                          ? syncRtaCasualtiesForCounts(prev.rta_casualties, prev.road_traffic_type, prev.injured_count, prev.dead_count)
                          : [],
                        incident_title: isRoadTraffic
                          ? roadTrafficTypeLabel(prev.road_traffic_type)
                          : (isIncident ? prev.incident_title : ""),
                        place: isMovement ? "" : prev.place,
                        unit_involved: isMovement ? "" : prev.unit_involved,
                        service_vehicle: isMovement || isIncident ? "" : prev.service_vehicle,
                        civilian: isMovement || isIncident ? "" : prev.civilian,
                        service_member: isMovement ? "" : prev.service_member,
                        service_member_number: isIncident ? prev.service_member_number : "",
                        service_member_rank: isIncident ? prev.service_member_rank : "",
                        service_member_name: isIncident ? prev.service_member_name : "",
                        history: isMovement ? "" : prev.history,
                        injuries: isRoadTraffic ? prev.injuries : "",
                        damages: isRoadTraffic ? prev.damages : "",
                        how_occurred: isRoadTraffic ? prev.how_occurred : "",
                        description: isMovement ? prev.description : "",
                        occurred_at: isMovement ? localDateTime() : (prev.occurred_at || localDateTime()),
                        requires_investigation: isRoadTraffic || isIncident,
                      };
                    });
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={!activeDuty?.can_record_ob}
                >
                  {ENTRY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              {!entryIsMovement && (
                <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={entryIsRoadTraffic || entryIsIncident || entryForm.requires_investigation}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, requires_investigation: event.target.checked }))}
                    disabled={!activeDuty?.can_record_ob || entryIsRoadTraffic || entryIsIncident}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  Requires investigation
                </label>
              )}
              {entryIsRoadTraffic && (
                <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3 md:col-span-2 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">Morning Brief Report Fields</h4>
                    <p className="mt-1 text-xs text-slate-600">Select the RTA type or type the incident heading as it should appear in the morning brief. Originating Unit is filled automatically from this Duty Room.</p>
                  </div>
                  <Field label="Road Traffic Accident Type">
                    <select
                      value={entryForm.road_traffic_type}
                      onChange={(event) => {
                        const roadTrafficType = event.target.value;
                        setEntryForm((prev) => {
                          const injured = roadTrafficType === "non_injury" ? "0" : prev.injured_count;
                          const dead = ["non_injury", "injury"].includes(roadTrafficType) ? "0" : prev.dead_count;
                          return {
                            ...prev,
                            road_traffic_type: roadTrafficType,
                            injured_count: injured,
                            dead_count: dead,
                            injury_severity: "",
                            rta_casualties: syncRtaCasualtiesForCounts(prev.rta_casualties, roadTrafficType, injured, dead),
                            incident_title: roadTrafficTypeLabel(roadTrafficType),
                            requires_investigation: true,
                          };
                        });
                      }}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      required
                    >
                      <option value="">Select accident type...</option>
                      {ROAD_TRAFFIC_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  {showRtaInjuredCount && (
                    <Field label="Number Injured">
                      <input
                        type="number"
                        min={isInjuryRoadTrafficType(entryForm.road_traffic_type) ? "1" : "0"}
                        value={entryForm.injured_count}
                        onChange={(event) => {
                          const injured = event.target.value;
                          setEntryForm((prev) => ({
                            ...prev,
                            injured_count: injured,
                            rta_casualties: syncRtaCasualtiesForCounts(prev.rta_casualties, prev.road_traffic_type, injured, prev.dead_count),
                          }));
                        }}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                        placeholder="0 means Nil"
                        required={isInjuryRoadTrafficType(entryForm.road_traffic_type)}
                      />
                    </Field>
                  )}
                  {showRtaDeadCount && (
                    <Field label="Number Dead">
                      <input
                        type="number"
                        min={isFatalRoadTrafficType(entryForm.road_traffic_type) ? "1" : "0"}
                        value={entryForm.dead_count}
                        onChange={(event) => {
                          const dead = event.target.value;
                          setEntryForm((prev) => ({
                            ...prev,
                            dead_count: dead,
                            rta_casualties: syncRtaCasualtiesForCounts(prev.rta_casualties, prev.road_traffic_type, prev.injured_count, dead),
                          }));
                        }}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                        placeholder="0 means Nil"
                        required={isFatalRoadTrafficType(entryForm.road_traffic_type)}
                      />
                    </Field>
                  )}
                  <Field label="Place">
                    <input
                      value={entryForm.place}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, place: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      placeholder="e.g. Along Juja Farm Road Mastore Centre"
                      required={entryIsRoadTraffic || entryForm.requires_investigation}
                    />
                  </Field>
                  <Field label="Unit">
                    <UnitAutocompleteInput
                      value={entryForm.unit_involved}
                      onChange={(value) => setEntryForm((prev) => ({ ...prev, unit_involved: value }))}
                      disabled={!activeDuty?.can_record_ob}
                      options={unitNames}
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="History of the Accident">
                      <textarea
                        value={entryForm.history}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, history: event.target.value }))}
                        className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Damages">
                    <textarea
                      value={entryForm.damages}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, damages: event.target.value }))}
                      className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="How the Accident Occurred">
                      <textarea
                        value={entryForm.how_occurred}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, how_occurred: event.target.value }))}
                        className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                        required
                      />
                    </Field>
                  </div>
                  {!entryIsRoadTraffic && (
                    <>
                      <Field label="Svc Veh">
                        <input
                          value={entryForm.service_vehicle}
                          onChange={(event) => setEntryForm((prev) => ({ ...prev, service_vehicle: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          disabled={!activeDuty?.can_record_ob}
                          placeholder="Service vehicle if any"
                        />
                      </Field>
                      <Field label="Svc Member">
                        <input
                          value={entryForm.service_member}
                          onChange={(event) => setEntryForm((prev) => ({ ...prev, service_member: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          disabled={!activeDuty?.can_record_ob}
                          placeholder="Service member details"
                        />
                      </Field>
                      <Field label="Civ / Versus">
                        <input
                          value={entryForm.civilian}
                          onChange={(event) => setEntryForm((prev) => ({ ...prev, civilian: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          disabled={!activeDuty?.can_record_ob}
                          placeholder="Civilian / opposite party"
                        />
                      </Field>
                    </>
                  )}
                  {entryIsRoadTraffic && (
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">Vehicles and Drivers</h4>
                        <button
                          type="button"
                          onClick={() => setEntryForm((prev) => ({ ...prev, rta_vehicles: [...prev.rta_vehicles, emptyRtaVehicle()] }))}
                          className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          disabled={!activeDuty?.can_record_ob}
                        >
                          Add Vehicle
                        </button>
                      </div>
                      {entryForm.rta_vehicles.map((vehicle, index) => (
                        <div key={index} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle / Driver #{index + 1}</p>
                            {entryForm.rta_vehicles.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setEntryForm((prev) => ({
                                  ...prev,
                                  rta_vehicles: prev.rta_vehicles.filter((_, vehicleIndex) => vehicleIndex !== index),
                                }))}
                                className="text-xs font-semibold text-red-600 hover:text-red-700"
                                disabled={!activeDuty?.can_record_ob}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <Field label="Vehicle Type">
                              <select
                                value={vehicle.vehicle_type}
                                onChange={(event) => updateRtaVehicle(index, "vehicle_type", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                disabled={!activeDuty?.can_record_ob}
                              >
                                <option value="service">Service Vehicle</option>
                                <option value="civilian">Civilian Vehicle</option>
                              </select>
                            </Field>
                            <Field label="Vehicle Details">
                              <input
                                value={vehicle.vehicle_details}
                                onChange={(event) => updateRtaVehicle(index, "vehicle_details", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                disabled={!activeDuty?.can_record_ob}
                                placeholder="Reg no, make, call sign"
                              />
                            </Field>
                            <Field label="Driver Type">
                              <select
                                value={vehicle.driver_person_type}
                                onChange={(event) => updateRtaVehicle(index, "driver_person_type", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                disabled={!activeDuty?.can_record_ob}
                              >
                                <option value="service">Service Member</option>
                                <option value="civilian">Civilian</option>
                              </select>
                            </Field>
                            {vehicle.driver_person_type === "civilian" && (
                              <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={Boolean(vehicle.driver_unknown)}
                                  onChange={(event) => updateRtaVehicle(index, "driver_unknown", event.target.checked)}
                                  disabled={!activeDuty?.can_record_ob}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                />
                                Civilian driver unknown
                              </label>
                            )}
                            <Field label={vehicle.driver_person_type === "civilian" ? "Driver ID No" : "Driver Service No"}>
                              <input
                                value={vehicle.driver_identifier}
                                onChange={(event) => updateRtaVehicle(index, "driver_identifier", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                disabled={!activeDuty?.can_record_ob || Boolean(vehicle.driver_unknown)}
                              />
                            </Field>
                            <Field label="Driver Rank">
                              <select
                                value={vehicle.driver_rank}
                                onChange={(event) => updateRtaVehicle(index, "driver_rank", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                disabled={!activeDuty?.can_record_ob || vehicle.driver_person_type === "civilian"}
                              >
                                <option value="">{vehicle.driver_person_type === "civilian" ? "NIL" : "Select rank..."}</option>
                                {RANK_OPTIONS.map((rank) => (
                                  <option key={rank} value={rank}>{rank}</option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Driver Name">
                              <input
                                value={vehicle.driver_name}
                                onChange={(event) => updateRtaVehicle(index, "driver_name", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                disabled={!activeDuty?.can_record_ob || Boolean(vehicle.driver_unknown)}
                              />
                            </Field>
                            <Field label="Driver Unit">
                              <UnitAutocompleteInput
                                value={vehicle.driver_unit}
                                onChange={(value) => updateRtaVehicle(index, "driver_unit", value)}
                                disabled={!activeDuty?.can_record_ob || vehicle.driver_person_type === "civilian"}
                                options={unitNames}
                                placeholder={vehicle.driver_person_type === "civilian" ? "Civilian / N/A" : "Type to select unit..."}
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {entryIsRoadTraffic && entryForm.road_traffic_type && entryForm.road_traffic_type !== "non_injury" && (
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">Onboard Personnel / Casualties</h4>
                          <p className="mt-1 text-xs text-slate-500">Rows are generated from the injured and dead counts above. Mark unknown civilians where details are not available.</p>
                        </div>
                      </div>
                      {entryForm.rta_casualties.length === 0 ? (
                        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          No onboard personnel rows because injured and dead counts are Nil.
                        </p>
                      ) : entryForm.rta_casualties.map((casualty, index) => {
                        const status = casualty.casualty_status === "dead" ? "dead" : "injured";
                        return (
                          <div key={index} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {status === "dead" ? "Dead person" : "Injured person"} #{index + 1}
                              </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <Field label="Status">
                                <input
                                  value={status === "dead" ? "Dead" : "Injured"}
                                  readOnly
                                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm"
                                />
                              </Field>
                              <Field label="Person Type">
                                <select
                                  value={casualty.person_type}
                                  onChange={(event) => updateRtaCasualty(index, "person_type", event.target.value)}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  disabled={!activeDuty?.can_record_ob}
                                >
                                  <option value="service">Service Member</option>
                                  <option value="civilian">Civilian</option>
                                </select>
                              </Field>
                              {casualty.person_type === "civilian" && (
                                <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(casualty.is_unknown)}
                                    onChange={(event) => updateRtaCasualty(index, "is_unknown", event.target.checked)}
                                    disabled={!activeDuty?.can_record_ob}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                  />
                                  Civilian details unknown
                                </label>
                              )}
                              <Field label={casualty.person_type === "civilian" ? "ID No" : "Service No"}>
                                <input
                                  value={casualty.identifier}
                                  onChange={(event) => updateRtaCasualty(index, "identifier", event.target.value)}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  disabled={!activeDuty?.can_record_ob || Boolean(casualty.is_unknown)}
                                />
                              </Field>
                              <Field label="Rank">
                                <select
                                  value={casualty.rank}
                                  onChange={(event) => updateRtaCasualty(index, "rank", event.target.value)}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  disabled={!activeDuty?.can_record_ob || casualty.person_type === "civilian"}
                                >
                                  <option value="">{casualty.person_type === "civilian" ? "NIL" : "Select rank..."}</option>
                                  {RANK_OPTIONS.map((rank) => (
                                    <option key={rank} value={rank}>{rank}</option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Name">
                                <input
                                  value={casualty.name}
                                  onChange={(event) => updateRtaCasualty(index, "name", event.target.value)}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  disabled={!activeDuty?.can_record_ob || Boolean(casualty.is_unknown)}
                                />
                              </Field>
                              <Field label="Unit">
                                <UnitAutocompleteInput
                                  value={casualty.unit}
                                  onChange={(value) => updateRtaCasualty(index, "unit", value)}
                                  disabled={!activeDuty?.can_record_ob || casualty.person_type === "civilian"}
                                  options={unitNames}
                                  placeholder={casualty.person_type === "civilian" ? "Civilian / N/A" : "Type to select unit..."}
                                />
                              </Field>
                              {status === "injured" && (
                                <Field label="Injury Severity">
                                  <select
                                    value={casualty.injury_severity}
                                    onChange={(event) => updateRtaCasualty(index, "injury_severity", event.target.value)}
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    disabled={!activeDuty?.can_record_ob}
                                    required
                                  >
                                    <option value="">Select severity...</option>
                                    {INJURY_SEVERITIES.map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                </Field>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Field label="Police / External OB Ref">
                    <input
                      value={entryForm.police_ob_reference}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, police_ob_reference: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      placeholder="e.g. OB No. 57/13/07/2026"
                    />
                  </Field>
                  {!entryIsRoadTraffic && (
                    <Field label="Injuries">
                      <textarea
                        value={entryForm.injuries}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, injuries: event.target.value }))}
                        className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                      />
                    </Field>
                  )}
                </div>
              )}
              {entryIsIncident && (
                <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3 md:col-span-2 md:grid-cols-3">
                  <div className="md:col-span-3">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">Incident Details</h4>
                  </div>
                  <div className="md:col-span-3">
                    <Field label="Incident">
                      <UnitAutocompleteInput
                        value={entryForm.incident_title}
                        onChange={(value) => setEntryForm((prev) => ({ ...prev, incident_title: value }))}
                        disabled={!activeDuty?.can_record_ob}
                        options={offenceNames}
                        placeholder="Type incident..."
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Date">
                    <input
                      type="date"
                      value={datePart(entryForm.occurred_at)}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, occurred_at: withDatePart(event.target.value, prev.occurred_at) }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      required
                    />
                  </Field>
                  <Field label="Time">
                    <input
                      type="time"
                      value={timePart(entryForm.occurred_at)}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, occurred_at: withTimePart(event.target.value, prev.occurred_at) }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      required
                    />
                  </Field>
                  <Field label="Place">
                    <input
                      value={entryForm.place}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, place: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      placeholder="e.g. Along Juja Farm Road Mastore Centre"
                      required
                    />
                  </Field>
                  <Field label="Service No">
                    <input
                      value={entryForm.service_member_number}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, service_member_number: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                    />
                  </Field>
                  <Field label="Rank">
                    <select
                      value={entryForm.service_member_rank}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, service_member_rank: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                    >
                      <option value="">Select rank...</option>
                      {RANK_OPTIONS.map((rank) => (
                        <option key={rank} value={rank}>{rank}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Name">
                    <input
                      value={entryForm.service_member_name}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, service_member_name: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                    />
                  </Field>
                  <Field label="Unit">
                    <UnitAutocompleteInput
                      value={entryForm.unit_involved}
                      onChange={(value) => setEntryForm((prev) => ({ ...prev, unit_involved: value }))}
                      disabled={!activeDuty?.can_record_ob}
                      options={unitNames}
                      required
                    />
                  </Field>
                  <Field label="Originating Sub-Unit">
                    <input
                      value={originatingSubUnitLabel}
                      readOnly
                      className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm"
                    />
                  </Field>
                  <div className="md:col-span-3">
                    <Field label="History of the Incident">
                      <textarea
                        value={entryForm.history}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, history: event.target.value }))}
                        className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                        required
                      />
                    </Field>
                  </div>
                </div>
              )}
              {entryIsMovement && (
                <div className="md:col-span-2">
                  <Field label="Description of Movement">
                    <textarea
                      value={entryForm.description}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, description: event.target.value }))}
                      className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      required
                    />
                  </Field>
                </div>
              )}
              <div className="flex justify-end md:col-span-2">
                <button type="submit" disabled={!activeDuty?.can_record_ob || savingEntry} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {savingEntry ? "Recording..." : "Record OB Entry"}
                </button>
              </div>
            </div>
          </form>

          {hasOccurrenceFilters && (
            <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold">
                Filtered: {occurrenceFilterSummary.length ? occurrenceFilterSummary.join(" / ") : "Occurrence Book"}
              </span>
              <Link to="/dashboard/duty-room" className="text-xs font-bold uppercase tracking-wide text-blue-700 hover:text-blue-900">
                Clear
              </Link>
            </div>
          )}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Daily Occurrence Book Entries</h3>
              <span className="text-xs text-slate-500">{entries.length} total</span>
            </div>
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading OB entries...</p>
            ) : entries.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No OB entries found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">OB #</th>
                      <th className="px-4 py-3 text-left">Time</th>
                      <th className="px-4 py-3 text-left">OB Category</th>
                      <th className="px-4 py-3 text-left">Incident / Details</th>
                      <th className="px-4 py-3 text-left">Recorded By</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="align-top hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{entry.book_date}/{entry.serial_no}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDateTime(entry.occurred_at)}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <p>{entryTypeLabel(entry.entry_type)}</p>
                          {entry.road_traffic_type && (
                            <p className="mt-1 text-xs font-semibold text-blue-700">
                              {roadTrafficTypeLabel(entry.road_traffic_type)}
                            </p>
                          )}
                          {entry.road_traffic_type && (
                            <p className="mt-1 text-xs text-slate-500">
                              Injured: {countLabel(entry.injured_count)}; Dead: {countLabel(entry.dead_count)}
                              {toArray(entry.rta_vehicles).length ? `; Vehicles: ${toArray(entry.rta_vehicles).length}` : ""}
                              {toArray(entry.rta_casualties).length ? `; Persons: ${toArray(entry.rta_casualties).length}` : ""}
                              {entry.injury_severity ? `; First severity: ${injurySeverityLabel(entry.injury_severity)}` : ""}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(entry.incident_title || roadTrafficTypeLabel(entry.road_traffic_type)) && (
                            <p className="font-semibold text-slate-900">{entry.incident_title || roadTrafficTypeLabel(entry.road_traffic_type)}</p>
                          )}
                          <p className="max-w-xl text-slate-800">{entry.description}</p>
                          {(entry.place || entry.originating_unit || entry.unit_involved) && (
                            <p className="mt-1 text-xs text-slate-500">
                              {entry.place && <>Place: {entry.place}. </>}
                              {entry.unit_involved && <>Unit: {entry.unit_involved}. </>}
                              {entry.originating_unit && <>Originating Unit: {entry.originating_unit}.</>}
                            </p>
                          )}
                          {entry.requires_investigation && <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">Requires investigation</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{entry.recorded_by_name || "--"}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={entry.status} />
                          {entry.linked_incident_number && <p className="mt-1 text-xs font-semibold text-blue-700">{entry.linked_incident_number}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {entry.requires_investigation && !entry.linked_incident && canConvertIncident ? (
                            <button type="button" onClick={() => createIncident(entry)} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                              Create Incident
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">--</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {previewRoster && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-slate-300 bg-slate-100 shadow-2xl">
            <div className="print-hide flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-white px-4 py-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">Preview Part 1 Orders</h3>
                <p className="text-xs text-slate-500">{previewRoster.title || "PART 1 ORDERS"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {previewCanPrint ? (
                  <button
                    type="button"
                    onClick={printPreviewRoster}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Print
                  </button>
                ) : (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                    Print restricted
                  </span>
                )}
                <button
                  type="button"
                  onClick={closePreviewRoster}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="print-hide border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
              RESTRICTED: Part 1 Orders must not be downloaded, photographed, screenshotted, or shared through mobile phones.
            </div>
            <div className="max-h-[82vh] overflow-y-auto bg-slate-200 px-3 py-5">
              <article
                className="part-one-print-area mx-auto min-h-[900px] max-w-[860px] select-none bg-white px-8 py-10 font-serif text-[15px] leading-relaxed text-slate-950 shadow md:px-12"
                onContextMenu={(event) => event.preventDefault()}
              >
                <p className="text-center text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">RESTRICTED</p>
                <div className="mt-10 text-center">
                  <p className="font-semibold uppercase tracking-[0.16em] text-slate-500">RESTRICTED</p>
                  <p className="mx-auto mt-5 max-w-3xl text-sm font-semibold">
                    The information contained in this Order is NOT to be communicated either directly or indirectly to the press or to any other person(s) not authorized to receive it.
                  </p>
                  <div className="mt-4 border-t-2 border-double border-slate-500" />
                </div>

                <div className="mt-8 text-center text-base font-bold uppercase leading-snug">
                  <p>PART I ORDERS</p>
                  <p>BY</p>
                  <p>ORDER OF</p>
                  <p>THE COMMANDING OFFICER</p>
                  <p>{String(partOneOrderUnitName(previewRoster)).toUpperCase()}</p>
                  {previewRoster.commanding_officer_name && (
                    <p>{String(previewRoster.commanding_officer_name).toUpperCase()}</p>
                  )}
                </div>

                <div className="mt-8 text-sm font-bold uppercase">
                  <p>
                    PART ONE ORDERS S/NO {partOneOrderSerial(previewRoster)} DATED {formatOrderHeaderDate(previewRoster.start_date)}.
                  </p>
                  <p>
                    {previousPartOneOrderLine(previewRoster)}
                  </p>
                </div>

                <section className="mt-8">
                  <p className="font-bold uppercase">080. &nbsp; DUTIES</p>
                  {previewGroups.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No duties recorded.</p>
                  ) : (
                    <div className="mt-5 space-y-8">
                      {previewGroups.map((group) => (
                        <div key={group.key}>
                          <h4 className="text-base font-bold uppercase tracking-wide">{group.name}</h4>
                          <div className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                            {group.duties.map((duty) => (
                              <div key={duty.id} className="break-inside-avoid">
                                <p className="font-bold uppercase">{duty.date}</p>
                                <p className="text-xs font-semibold uppercase text-slate-500">{duty.timeRange}</p>
                                <div className="mt-1 space-y-0.5">
                                  {duty.personnel.map((line, index) => (
                                    <p key={`${duty.id}-${index}`} className="uppercase">{line}</p>
                                  ))}
                                </div>
                                {duty.notes && <p className="mt-1 text-xs italic text-slate-600">Note: {duty.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <p className="mt-16 text-center text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">RESTRICTED</p>
              </article>
            </div>
          </div>
        </div>
      )}

      {approveTarget && (
        <ActionModal
          eyebrow="Approval Confirmation"
          title="Approve Part 1 Orders?"
          message="The Order NCO will be notified and can publish these approved orders."
          tone="green"
          confirmLabel="Confirm Approval"
          savingLabel="Approving..."
          saving={Boolean(approvingRosterId)}
          onCancel={() => setApproveTarget(null)}
          onConfirm={confirmApproveRoster}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-base font-bold text-slate-950">{approveTarget.title || "Part 1 Orders"}</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unit</p>
                <p className="mt-1 font-medium text-slate-800">{approveTarget.unit_label || "--"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period</p>
                <p className="mt-1 font-medium text-slate-800">{formatDate(approveTarget.start_date)} - {formatDate(approveTarget.end_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Forwarded By</p>
                <p className="mt-1 font-medium text-slate-800">{approveTarget.created_by_name || "--"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval Status</p>
                <p className="mt-1"><StatusBadge status={approveTarget.status} /></p>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Confirm only after previewing the orders and verifying the assigned posts and personnel.
          </div>
        </ActionModal>
      )}

      {publishTarget && (
        <ActionModal
          eyebrow="Publish Confirmation"
          title="Publish Part 1 Orders?"
          message="Assigned personnel will receive notifications and the orders will become visible in the Duty Room."
          tone="blue"
          confirmLabel="Publish Orders"
          savingLabel="Publishing..."
          saving={Boolean(publishingRosterId)}
          onCancel={() => setPublishTarget(null)}
          onConfirm={confirmPublishRoster}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-base font-bold text-slate-950">{publishTarget.title || "Part 1 Orders"}</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unit</p>
                <p className="mt-1 font-medium text-slate-800">{publishTarget.unit_label || "--"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period</p>
                <p className="mt-1 font-medium text-slate-800">{formatDate(publishTarget.start_date)} - {formatDate(publishTarget.end_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approved By</p>
                <p className="mt-1 font-medium text-slate-800">{publishTarget.approved_by_name || "--"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-1"><StatusBadge status={publishTarget.status} /></p>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Once published, personnel assigned to each post will be notified. Use preview before printing if you need one final check.
          </div>
        </ActionModal>
      )}

      {reviewAction && (
        <ActionModal
          eyebrow={reviewAction.mode === "return" ? "Return for Correction" : "Decline Part 1 Orders"}
          title={reviewAction.mode === "return" ? "Return Part 1 Orders?" : "Decline Part 1 Orders?"}
          message={reviewAction.mode === "return" ? "The Order NCO will receive your correction reason." : "The Order NCO will receive your decline reason."}
          tone={reviewAction.mode === "return" ? "amber" : "red"}
          confirmLabel={reviewAction.mode === "return" ? "Return Orders" : "Decline Orders"}
          savingLabel={reviewAction.mode === "return" ? "Returning..." : "Declining..."}
          saving={reviewSaving}
          disabled={!String(reviewAction.reason || "").trim()}
          onCancel={() => setReviewAction(null)}
          onConfirm={confirmReviewAction}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-base font-bold text-slate-950">{reviewAction.roster?.title || "Part 1 Orders"}</p>
            <p className="mt-1 text-sm text-slate-600">{reviewAction.roster?.unit_label || "--"} - {formatDate(reviewAction.roster?.start_date)} - {formatDate(reviewAction.roster?.end_date)}</p>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reason
            <textarea
              value={reviewAction.reason}
              onChange={(event) => setReviewAction((prev) => ({ ...prev, reason: event.target.value }))}
              className="mt-1 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
              placeholder={reviewAction.mode === "return" ? "What should the Order NCO correct?" : "Why are these Part 1 Orders being declined?"}
              disabled={reviewSaving}
              required
            />
          </label>
        </ActionModal>
      )}

      {incidentTarget && (
        <ActionModal
          eyebrow="Occurrence Book"
          title="Convert OB Entry to Incident?"
          message="This will create an incident from the selected OB entry for the investigation chain."
          tone="blue"
          confirmLabel="Create Incident"
          savingLabel="Creating..."
          saving={Boolean(convertingEntryId)}
          onCancel={() => setIncidentTarget(null)}
          onConfirm={confirmCreateIncident}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-bold text-slate-950">OB {incidentTarget.book_date}/{incidentTarget.serial_no}</p>
            <p className="mt-1 text-slate-600">{formatDateTime(incidentTarget.occurred_at)}</p>
            {incidentTarget.incident_title && <p className="mt-3 font-semibold text-slate-900">{incidentTarget.incident_title}</p>}
            {incidentTarget.place && <p className="text-xs font-semibold text-blue-700">Place: {incidentTarget.place}</p>}
            <p className="mt-3 text-slate-800">{incidentTarget.description}</p>
          </div>
        </ActionModal>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-lg border border-red-200 bg-white shadow-2xl">
            <div className="border-b border-red-100 bg-red-50 px-5 py-4">
              <h3 className="text-base font-bold text-red-800">Delete Draft Part 1 Orders?</h3>
              <p className="mt-1 text-sm text-red-700">This action will permanently remove these draft Part 1 Orders before they are forwarded.</p>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
              <p>
                You are about to delete <strong className="text-slate-950">{deleteTarget.title}</strong>.
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                Only continue if this draft was created in error. Deleted draft Part 1 Orders cannot be recovered.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingRosterId)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteDraftRoster}
                disabled={Boolean(deletingRosterId)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingRosterId ? "Deleting..." : "Delete Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
