import React, { useEffect, useMemo, useState } from "react";
import useAutoDismiss from "../hooks/useAutoDismiss";
import { dutyRoomService, userService } from "../services/api";
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

function entryTypeLabel(value) {
  return ENTRY_TYPES.find(([type]) => type === value)?.[1] || String(value || "").replace(/_/g, " ");
}

const ENTRY_TYPES = [
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
    entry_type: "routine",
    road_traffic_type: "",
    injured_count: "",
    dead_count: "",
    injury_severity: "",
    incident_title: "",
    place: "",
    service_vehicle: "",
    unit_involved: "",
    civilian: "",
    service_member: "",
    description: "",
    history: "",
    injuries: "",
    damages: "",
    how_occurred: "",
    action_taken: "",
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

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[status] || "bg-slate-100 text-slate-700"}`}>
      {String(status || "").replace(/_/g, " ")}
    </span>
  );
}

export default function DutyRoom({ user }) {
  const [activeTab, setActiveTab] = useState("rosters");
  const [rosters, setRosters] = useState([]);
  const [entries, setEntries] = useState([]);
  const [personnel, setPersonnel] = useState([]);
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
  const previewGroups = useMemo(() => partOneOrderGroups(previewRoster, personnelById), [previewRoster, personnelById]);
  const previewCanPrint = previewRoster ? canPrintRoster(previewRoster) : false;
  const mobilePartOneOrdersBlocked = activeTab === "rosters" && isMobileClient;
  const entryIsRoadTraffic = isRoadTrafficEntryType(entryForm.entry_type);

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

  function loadData() {
    setLoading(true);
    const shouldLoadPartOneOrders = !isMobilePartOneOrdersClient();
    Promise.allSettled([
      shouldLoadPartOneOrders ? dutyRoomService.rosters({ page_size: 200 }) : Promise.resolve({ data: [] }),
      dutyRoomService.entries({ page_size: 200 }),
      dutyRoomService.activeDutyRoom(),
      isOrderNco && shouldLoadPartOneOrders ? dutyRoomService.approvers() : Promise.resolve({ data: [] }),
      isOrderNco && shouldLoadPartOneOrders ? userService.list({ page_size: 300 }) : Promise.resolve({ data: [] }),
    ])
      .then(([rosterRes, entryRes, activeRes, approverRes, userRes]) => {
        setRosters(toArray(settledData(rosterRes)));
        setEntries(toArray(settledData(entryRes)));
        setActiveDuty(settledData(activeRes) || null);
        setApprovers(toArray(settledData(approverRes)));
        setPersonnel(toArray(settledData(userRes)));

        const failures = [
          settledError(rosterRes, "Failed to load Part 1 Orders."),
          settledError(entryRes, "Failed to load occurrence book entries."),
          settledError(activeRes, "Failed to check current Duty Room assignment."),
          isOrderNco && shouldLoadPartOneOrders ? settledError(approverRes, "Failed to load Part 1 Orders approvers.") : "",
          isOrderNco && shouldLoadPartOneOrders ? settledError(userRes, "Failed to load personnel list.") : "",
        ].filter(Boolean);
        setError(failures[0] || "");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setError("Order NCO account must be attached to a battalion or detachment before generating Part 1 Orders.");
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
      if (isInjuryRoadTrafficType(payload.road_traffic_type)) {
        if (!Number(payload.injured_count || 0)) {
          setError("Enter the number of injured persons for an Injury Road Traffic Accident.");
          return;
        }
        if (!payload.injury_severity) {
          setError("Select injury severity for an Injury Road Traffic Accident.");
          return;
        }
        payload.dead_count = null;
      } else if (isFatalRoadTrafficType(payload.road_traffic_type)) {
        if (!Number(payload.dead_count || 0)) {
          setError("Enter the number of dead persons for a Fatal Road Traffic Accident.");
          return;
        }
        payload.injured_count = null;
        payload.injury_severity = "";
      } else {
        payload.injured_count = null;
        payload.dead_count = null;
        payload.injury_severity = "";
      }
      payload.requires_investigation = true;
      payload.incident_title = roadTrafficTypeLabel(payload.road_traffic_type);
    } else {
      payload.road_traffic_type = "";
      payload.injured_count = null;
      payload.dead_count = null;
      payload.injury_severity = "";
    }
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
                    This Order NCO account must be attached to a battalion or detachment before it can generate Part 1 Orders.
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
              <Field label="OB Category">
                <select
                  value={entryForm.entry_type}
                  onChange={(event) => {
                    const entryType = event.target.value;
                    setEntryForm((prev) => {
                      const isRoadTraffic = isRoadTrafficEntryType(entryType);
                      return {
                        ...prev,
                        entry_type: entryType,
                        road_traffic_type: isRoadTraffic ? prev.road_traffic_type : "",
                        injured_count: isRoadTraffic ? prev.injured_count : "",
                        dead_count: isRoadTraffic ? prev.dead_count : "",
                        injury_severity: isRoadTraffic ? prev.injury_severity : "",
                        incident_title: isRoadTraffic
                          ? roadTrafficTypeLabel(prev.road_traffic_type)
                          : (isRoadTrafficEntryType(prev.entry_type) ? "" : prev.incident_title),
                        requires_investigation: isRoadTraffic ? true : prev.requires_investigation,
                      };
                    });
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={!activeDuty?.can_record_ob}
                >
                  {ENTRY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={entryIsRoadTraffic || entryForm.requires_investigation}
                  onChange={(event) => setEntryForm((prev) => ({ ...prev, requires_investigation: event.target.checked }))}
                  disabled={!activeDuty?.can_record_ob || entryIsRoadTraffic}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                Requires investigation
              </label>
              {(entryIsRoadTraffic || entryForm.requires_investigation || entryForm.entry_type === "incident") && (
                <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3 md:col-span-2 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">Morning Brief Report Fields</h4>
                    <p className="mt-1 text-xs text-slate-600">Select the RTA type or type the incident heading as it should appear in the morning brief. Originating Unit is filled automatically from this Duty Room.</p>
                  </div>
                  {entryIsRoadTraffic ? (
                    <>
                      <Field label="Road Traffic Accident Type">
                        <select
                          value={entryForm.road_traffic_type}
                          onChange={(event) => {
                            const roadTrafficType = event.target.value;
                            setEntryForm((prev) => ({
                              ...prev,
                              road_traffic_type: roadTrafficType,
                              injured_count: isInjuryRoadTrafficType(roadTrafficType) ? prev.injured_count : "",
                              dead_count: isFatalRoadTrafficType(roadTrafficType) ? prev.dead_count : "",
                              injury_severity: isInjuryRoadTrafficType(roadTrafficType) ? prev.injury_severity : "",
                              incident_title: roadTrafficTypeLabel(roadTrafficType),
                              requires_investigation: true,
                            }));
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
                      {isInjuryRoadTrafficType(entryForm.road_traffic_type) && (
                        <>
                          <Field label="Number Injured">
                            <input
                              type="number"
                              min="1"
                              value={entryForm.injured_count}
                              onChange={(event) => setEntryForm((prev) => ({ ...prev, injured_count: event.target.value }))}
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              disabled={!activeDuty?.can_record_ob}
                              required
                            />
                          </Field>
                          <Field label="Injury Severity">
                            <select
                              value={entryForm.injury_severity}
                              onChange={(event) => setEntryForm((prev) => ({ ...prev, injury_severity: event.target.value }))}
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
                        </>
                      )}
                      {isFatalRoadTrafficType(entryForm.road_traffic_type) && (
                        <Field label="Number Dead">
                          <input
                            type="number"
                            min="1"
                            value={entryForm.dead_count}
                            onChange={(event) => setEntryForm((prev) => ({ ...prev, dead_count: event.target.value }))}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            disabled={!activeDuty?.can_record_ob}
                            required
                          />
                        </Field>
                      )}
                    </>
                  ) : (
                    <Field label="Incident">
                      <input
                        value={entryForm.incident_title}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, incident_title: event.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                        placeholder="e.g. Impersonation, Alleged Theft"
                        required={entryForm.requires_investigation}
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
                    <input
                      value={entryForm.unit_involved}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, unit_involved: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      placeholder="Unit involved"
                    />
                  </Field>
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
                  <Field label="Police / External OB Ref">
                    <input
                      value={entryForm.police_ob_reference}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, police_ob_reference: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                      placeholder="e.g. OB No. 57/13/07/2026"
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="History of the Incident / Accident">
                      <textarea
                        value={entryForm.history}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, history: event.target.value }))}
                        className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                      />
                    </Field>
                  </div>
                  <Field label="Injuries">
                    <textarea
                      value={entryForm.injuries}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, injuries: event.target.value }))}
                      className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                    />
                  </Field>
                  <Field label="Damages">
                    <textarea
                      value={entryForm.damages}
                      onChange={(event) => setEntryForm((prev) => ({ ...prev, damages: event.target.value }))}
                      className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={!activeDuty?.can_record_ob}
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="How It Occurred">
                      <textarea
                        value={entryForm.how_occurred}
                        onChange={(event) => setEntryForm((prev) => ({ ...prev, how_occurred: event.target.value }))}
                        className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        disabled={!activeDuty?.can_record_ob}
                      />
                    </Field>
                  </div>
                </div>
              )}
              <div className="md:col-span-2">
                <Field label="Details">
                  <textarea
                    value={entryForm.description}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, description: event.target.value }))}
                    className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    disabled={!activeDuty?.can_record_ob}
                    required
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Action Taken">
                  <textarea
                    value={entryForm.action_taken}
                    onChange={(event) => setEntryForm((prev) => ({ ...prev, action_taken: event.target.value }))}
                    className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    disabled={!activeDuty?.can_record_ob}
                  />
                </Field>
              </div>
              <div className="flex justify-end md:col-span-2">
                <button type="submit" disabled={!activeDuty?.can_record_ob || savingEntry} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {savingEntry ? "Recording..." : "Record OB Entry"}
                </button>
              </div>
            </div>
          </form>

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
                          {entry.road_traffic_type === "injury" && (
                            <p className="mt-1 text-xs text-slate-500">
                              Injured: {entry.injured_count || "--"}
                              {entry.injury_severity ? `, Severity: ${injurySeverityLabel(entry.injury_severity)}` : ""}
                            </p>
                          )}
                          {entry.road_traffic_type === "fatal" && (
                            <p className="mt-1 text-xs text-slate-500">Dead: {entry.dead_count || "--"}</p>
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
                          {entry.action_taken && <p className="mt-1 text-xs text-slate-500">Action: {entry.action_taken}</p>}
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
