import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exhibitService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function displayDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function errorText(error, fallback = "Failed to save exhibit request.") {
  const data = error?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  const first = Object.values(data).flat().find(Boolean);
  return first ? String(first) : fallback;
}

function filenameFromDisposition(disposition, fallback) {
  const match = String(disposition || "").match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

async function scanErrorText(error, fallback = "Failed to scan evidence document.") {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      if (parsed.detail) return String(parsed.detail);
      const first = Object.values(parsed).flat().find(Boolean);
      return first ? String(first) : fallback;
    } catch (_err) {
      return fallback;
    }
  }
  return errorText(error, fallback);
}

function caseLabel(caseObj) {
  const number = caseObj?.case_number || `Case #${caseObj?.id || "--"}`;
  const accused = caseObj?.accused_name || "Accused not recorded";
  const offence = caseObj?.offence || caseObj?.offence_name || "Offence not recorded";
  return `${number} - ${accused} - ${offence}`;
}

function destinationLabel(row) {
  if (row.storage_scope === "detachment") return row.target_detachment_name || "Company";
  if (row.storage_scope === "special_battalion") return row.target_battalion_name || "Special Battalion";
  return row.target_battalion_name || "Battalion";
}

function destinationValueForRow(row) {
  if (row.storage_scope === "detachment" && row.target_detachment) {
    return `detachment:${row.target_detachment}`;
  }
  if ((row.storage_scope === "battalion" || row.storage_scope === "special_battalion") && row.target_battalion) {
    return `battalion:${row.target_battalion}`;
  }
  return "";
}

function makeDestinationOptions(destinations) {
  const options = [];
  const detachment = destinations?.detachment;
  if (detachment?.id) {
    options.push({
      value: `detachment:${detachment.id}`,
      label: `${detachment.name || "My Company"} (Company)`,
      storage_scope: "detachment",
      target_battalion: "",
    });
  }

  toArray(destinations?.battalions).forEach((bn) => {
    const isSpecial = String(bn.battalion_type || "").toLowerCase() === "special";
    options.push({
      value: `battalion:${bn.id}`,
      label: `${bn.name}${isSpecial ? " (Special Battalion)" : ""}`,
      storage_scope: isSpecial ? "special_battalion" : "battalion",
      target_battalion: String(bn.id),
    });
  });
  return options;
}

function preferredDestinationOption(options, userBattalionId) {
  if (options.length === 0) return null;
  const battalionId = String(userBattalionId || "");
  if (battalionId) {
    const ownBattalion = options.find((option) => option.value === `battalion:${battalionId}`);
    if (ownBattalion) return ownBattalion;
  }
  return options[0];
}

function createBlankExhibit() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    exhibit_name: "",
    description: "",
    quantity: 1,
    photo: null,
    photoPreviewUrl: "",
  };
}

const LIFECYCLE_ACTIONS = [
  { value: "return_owner", label: "Return to the Owner" },
  { value: "dispose", label: "Dispose" },
];

const LIFECYCLE_ACTION_LABELS = {
  return_accused: "Return to Accused",
  return_owner: "Return to the Owner",
  dispose: "Dispose",
  transfer: "Transfer to Another Authority",
  retain: "Retain for Court Martial",
};

const LIFECYCLE_PENDING_STATUSES = new Set([
  "return_requested",
  "disposal_requested",
  "transfer_requested",
  "retention_requested",
]);

function lifecycleActionLabel(value) {
  return LIFECYCLE_ACTION_LABELS[value] || value || "--";
}

function isLifecyclePendingStatus(status) {
  return LIFECYCLE_PENDING_STATUSES.has(status);
}

function statusLabel(status) {
  return {
    pending: "Pending Approval",
    approved: "Approved - Awaiting Physical Delivery",
    declined: "Declined",
    stored: "Stored",
    return_requested: "Return Requested",
    disposal_requested: "Disposal Requested",
    transfer_requested: "Transfer Requested",
    retention_requested: "Retention Requested",
    returned: "Returned",
    disposed: "Disposed",
    transferred: "Transferred",
    retained: "Retained",
  }[status] || status || "--";
}

function statusClass(status) {
  return {
    pending: "bg-amber-50 text-amber-700",
    approved: "bg-blue-50 text-blue-700",
    declined: "bg-red-50 text-red-700",
    stored: "bg-emerald-50 text-emerald-700",
    return_requested: "bg-orange-50 text-orange-700",
    disposal_requested: "bg-orange-50 text-orange-700",
    transfer_requested: "bg-orange-50 text-orange-700",
    retention_requested: "bg-orange-50 text-orange-700",
    returned: "bg-slate-100 text-slate-700",
    disposed: "bg-rose-50 text-rose-700",
    transferred: "bg-indigo-50 text-indigo-700",
    retained: "bg-purple-50 text-purple-700",
  }[status] || "bg-slate-100 text-slate-600";
}

function canReview(user, row) {
  if (user?.is_superuser) return true;
  const userBattalionId = String(user?.battalion_id ?? user?.battalion ?? "");
  const userDetachmentId = String(user?.detachment_id ?? user?.detachment ?? "");
  if (row.storage_scope === "detachment") {
    return user?.role === "detachment" && userDetachmentId && String(row.target_detachment || "") === userDetachmentId;
  }
  return user?.role === "admin" && userBattalionId && String(row.target_battalion || "") === userBattalionId;
}

function canAuthorizeRelease(user, row) {
  if (user?.is_superuser) return true;
  const userBattalionId = String(user?.battalion_id ?? user?.battalion ?? "");
  const userDetachmentId = String(user?.detachment_id ?? user?.detachment ?? "");
  if (
    user?.role === "detachment"
    && userDetachmentId
    && row.storage_scope === "detachment"
    && String(row.target_detachment || "") === userDetachmentId
  ) {
    return true;
  }
  if (!["admin", "adj", "hod", "oc", "co", "2ic"].includes(user?.role) || !userBattalionId) {
    return false;
  }
  const battalionIds = [
    row.target_battalion,
    row.target_detachment_battalion,
  ].filter((value) => value !== null && value !== undefined && value !== "");
  return battalionIds.some((value) => String(value) === userBattalionId);
}

function canRequestLifecycle(user, row) {
  return user?.role === "investigator" && row.status === "stored";
}

function ownerNameForRow(row) {
  return String(row?.case_accused || "").trim() || "NIL";
}

function ownerServiceNumberForRow(row) {
  return String(row?.case_accused_service_number || "").trim() || "NIL";
}

function hasOwnerIdentity(row) {
  return Boolean(String(row?.case_accused || "").trim() || String(row?.case_accused_service_number || "").trim());
}

function allRowsHaveOwnerIdentity(rows) {
  return rows.length > 0 && rows.every(hasOwnerIdentity);
}

export default function Exhibits({ user }) {
  const [requests, setRequests] = useState([]);
  const [eligibleCases, setEligibleCases] = useState([]);
  const [storageDestinations, setStorageDestinations] = useState({ detachment: null, battalions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    case: "",
    parent_request: "",
    storage_destination: "",
    storage_scope: "",
    target_battalion: "",
    exhibits: [createBlankExhibit()],
  });
  const [additionalSource, setAdditionalSource] = useState(null);
  const [fileInputResetKey, setFileInputResetKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState(null);
  const [actionForm, setActionForm] = useState({
    comments: "",
    reason: "",
    physical_location: "",
    storage_reference: "",
    confirmStore: false,
  });
  const [actionSaving, setActionSaving] = useState(false);
  const [lifecycle, setLifecycle] = useState(null);
  const [lifecycleForm, setLifecycleForm] = useState({
    action: "return_owner",
    reason: "",
    recipient_name: "",
    recipient_identifier: "",
    authority: "",
    disposal_mode: "",
    comments: "",
    decline_reason: "",
    attachment: null,
  });
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleNotice, setLifecycleNotice] = useState("");
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [lifecycleScanning, setLifecycleScanning] = useState(false);
  const [lifecycleFileResetKey, setLifecycleFileResetKey] = useState(0);
  const [selectedLifecycleIds, setSelectedLifecycleIds] = useState(() => new Set());
  const [camera, setCamera] = useState({
    open: false,
    exhibitId: null,
    loading: false,
    error: "",
  });
  const videoRef = useRef(null);
  const formRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const photoPreviewUrlsRef = useRef(new Set());

  const canCreate = user?.role === "investigator";
  const userBattalionId = String(user?.battalion_id ?? user?.battalion ?? "");
  const destinationOptions = useMemo(() => makeDestinationOptions(storageDestinations), [storageDestinations]);
  useAutoDismiss(notice, setNotice);
  useAutoDismiss(error, setError);
  useAutoDismiss(lifecycleNotice, setLifecycleNotice);
  useAutoDismiss(lifecycleError, setLifecycleError);

  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const revokePhotoPreview = useCallback((url) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    photoPreviewUrlsRef.current.delete(url);
  }, []);

  const releasePhotoPreviews = useCallback((exhibits) => {
    exhibits.forEach((item) => revokePhotoPreview(item.photoPreviewUrl));
  }, [revokePhotoPreview]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fetches = [exhibitService.list()];
      if (canCreate) {
        fetches.push(exhibitService.eligibleCases());
        fetches.push(exhibitService.storageDestinations());
      }
      const [requestsRes, casesRes, destinationsRes] = await Promise.all(fetches);
      setRequests(toArray(requestsRes.data));
      if (canCreate) {
        const cases = toArray(casesRes.data);
        const destinations = destinationsRes?.data || { detachment: null, battalions: [] };
        const options = makeDestinationOptions(destinations);
        setEligibleCases(cases);
        setStorageDestinations(destinations);
        setForm((prev) => ({
          ...prev,
          case: prev.case || (cases[0]?.id ? String(cases[0].id) : ""),
          ...(() => {
            const existingOption = options.find((option) => option.value === prev.storage_destination);
            const defaultOption = existingOption || preferredDestinationOption(options, userBattalionId);
            return {
              storage_destination: defaultOption?.value || "",
              storage_scope: defaultOption?.storage_scope || "",
              target_battalion: defaultOption?.target_battalion || "",
            };
          })(),
        }));
      } else {
        setStorageDestinations({ detachment: null, battalions: [] });
      }
    } catch (err) {
      setError(errorText(err, "Failed to load exhibits."));
    } finally {
      setLoading(false);
    }
  }, [canCreate, userBattalionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => () => {
    stopCameraStream();
    photoPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoPreviewUrlsRef.current.clear();
  }, [stopCameraStream]);

  useEffect(() => {
    if (!camera.open || camera.loading || !videoRef.current || !cameraStreamRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
    const playPromise = videoRef.current.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  }, [camera.open, camera.loading]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const haystack = [
        row.case_number,
        row.case_offence,
        row.case_accused,
        row.exhibit_name,
        row.description,
        destinationLabel(row),
        row.requested_by_name,
        statusLabel(row.status),
        row.physical_location,
        lifecycleActionLabel(row.lifecycle_action),
        row.lifecycle_reason,
        row.lifecycle_recipient_name,
        row.lifecycle_recipient_identifier,
        row.lifecycle_authority,
        row.lifecycle_disposal_mode,
        row.lifecycle_decline_reason,
      ].join(" ").toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [requests, search, statusFilter]);

  const lifecycleSelectableRows = useMemo(
    () => filteredRequests.filter((row) => canRequestLifecycle(user, row)),
    [filteredRequests, user]
  );
  const selectedLifecycleRows = useMemo(
    () => requests.filter((row) => selectedLifecycleIds.has(row.id) && canRequestLifecycle(user, row)),
    [requests, selectedLifecycleIds, user]
  );
  const allDisplayedLifecycleSelected = (
    lifecycleSelectableRows.length > 0
    && lifecycleSelectableRows.every((row) => selectedLifecycleIds.has(row.id))
  );

  const completedExhibits = form.exhibits.filter((item) => item.exhibit_name.trim() && Number(item.quantity || 0) >= 1);
  const hasIncompleteStartedExhibit = form.exhibits.some((item) => {
    const hasStarted = Boolean(item.exhibit_name.trim() || item.description.trim() || item.photo);
    return hasStarted && (!item.exhibit_name.trim() || Number(item.quantity || 0) < 1);
  });
  const canSubmitRequest = (
    form.case
    && form.storage_destination
    && form.storage_scope
    && !(["battalion", "special_battalion"].includes(form.storage_scope) && !form.target_battalion)
    && completedExhibits.length > 0
    && !hasIncompleteStartedExhibit
  );

  function handleDestinationChange(value) {
    const selected = destinationOptions.find((option) => option.value === value);
    setForm((prev) => ({
      ...prev,
      storage_destination: value,
      storage_scope: selected?.storage_scope || "",
      target_battalion: selected?.target_battalion || "",
    }));
  }

  function handleCaseChange(value) {
    setAdditionalSource((current) => (
      current && String(current.case) !== String(value) ? null : current
    ));
    setForm((prev) => ({
      ...prev,
      case: value,
      parent_request: prev.parent_request && additionalSource && String(additionalSource.case) === String(value)
        ? prev.parent_request
        : "",
    }));
  }

  function updateExhibit(exhibitId, changes) {
    setForm((prev) => ({
      ...prev,
      exhibits: prev.exhibits.map((item) => (
        item.id === exhibitId ? { ...item, ...changes } : item
      )),
    }));
  }

  function setExhibitPhoto(exhibitId, file) {
    setForm((prev) => ({
      ...prev,
      exhibits: prev.exhibits.map((item) => {
        if (item.id !== exhibitId) return item;
        revokePhotoPreview(item.photoPreviewUrl);
        const photoPreviewUrl = file ? URL.createObjectURL(file) : "";
        if (photoPreviewUrl) photoPreviewUrlsRef.current.add(photoPreviewUrl);
        return {
          ...item,
          photo: file || null,
          photoPreviewUrl,
        };
      }),
    }));
  }

  function removeExhibitPhoto(exhibitId) {
    setExhibitPhoto(exhibitId, null);
    setFileInputResetKey((key) => key + 1);
  }

  function addExhibit() {
    setForm((prev) => ({
      ...prev,
      exhibits: [...prev.exhibits, createBlankExhibit()],
    }));
  }

  function removeExhibit(exhibitId) {
    const removed = form.exhibits.find((item) => item.id === exhibitId);
    revokePhotoPreview(removed?.photoPreviewUrl);
    setForm((prev) => ({
      ...prev,
      exhibits: prev.exhibits.length > 1
        ? prev.exhibits.filter((item) => item.id !== exhibitId)
        : prev.exhibits,
    }));
  }

  function toggleLifecycleSelection(rowId) {
    setSelectedLifecycleIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function toggleAllDisplayedLifecycleSelections() {
    setSelectedLifecycleIds((prev) => {
      const next = new Set(prev);
      if (allDisplayedLifecycleSelected) {
        lifecycleSelectableRows.forEach((row) => next.delete(row.id));
      } else {
        lifecycleSelectableRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  }

  function clearLifecycleSelections() {
    setSelectedLifecycleIds(new Set());
  }

  function startAdditionalRequest(row) {
    const requestedDestination = destinationValueForRow(row);
    const selected = destinationOptions.find((option) => option.value === requestedDestination)
      || preferredDestinationOption(destinationOptions, userBattalionId);
    if (!selected) {
      setError("No storage destination is available for adding more exhibits.");
      setNotice("");
      return;
    }

    releasePhotoPreviews(form.exhibits);
    setAdditionalSource(row);
    setError("");
    setNotice("");
    setForm((prev) => ({
      ...prev,
      case: row.case ? String(row.case) : "",
      parent_request: row.id ? String(row.id) : "",
      storage_destination: selected.value,
      storage_scope: selected.storage_scope,
      target_battalion: selected.target_battalion,
      exhibits: [createBlankExhibit()],
    }));
    setFileInputResetKey((key) => key + 1);
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function openCamera(exhibitId) {
    stopCameraStream();
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({
        open: true,
        exhibitId,
        loading: false,
        error: "Camera access is not supported in this browser. Use Upload Photo instead.",
      });
      return;
    }

    setCamera({ open: true, exhibitId, loading: true, error: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      cameraStreamRef.current = stream;
      setCamera({ open: true, exhibitId, loading: false, error: "" });
    } catch (err) {
      stopCameraStream();
      setCamera({
        open: true,
        exhibitId,
        loading: false,
        error: "Camera access was blocked or unavailable. Allow camera permission, then try again.",
      });
    }
  }

  function closeCamera() {
    stopCameraStream();
    setCamera({ open: false, exhibitId: null, loading: false, error: "" });
  }

  async function captureCameraPhoto() {
    const video = videoRef.current;
    if (!video || !camera.exhibitId) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setCamera((prev) => ({ ...prev, error: "Unable to capture photo from this camera." }));
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setCamera((prev) => ({ ...prev, error: "Unable to capture photo from this camera." }));
      return;
    }

    const file = new File([blob], `exhibit-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    setExhibitPhoto(camera.exhibitId, file);
    closeCamera();
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!canSubmitRequest) {
      setError("Select a case, select storage, and complete at least one exhibit name and quantity.");
      setNotice("");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const exhibitsToSubmit = completedExhibits;
      for (const item of exhibitsToSubmit) {
        const fd = new FormData();
        fd.append("case", form.case);
        fd.append("exhibit_name", item.exhibit_name.trim());
        fd.append("quantity", item.quantity || 1);
        fd.append("storage_scope", form.storage_scope);
        if (form.parent_request) fd.append("parent_request", form.parent_request);
        if (item.description.trim()) fd.append("description", item.description.trim());
        if (form.target_battalion) fd.append("target_battalion", form.target_battalion);
        if (item.photo) fd.append("photo", item.photo);
        await exhibitService.create(fd);
      }
      setNotice(`${exhibitsToSubmit.length} exhibit storage request${exhibitsToSubmit.length === 1 ? "" : "s"} submitted.`);
      releasePhotoPreviews(form.exhibits);
      setForm((prev) => ({
        ...prev,
        parent_request: "",
        exhibits: [createBlankExhibit()],
      }));
      setAdditionalSource(null);
      setFileInputResetKey((key) => key + 1);
      await loadData();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  function openAction(mode, row) {
    setAction({ mode, row });
    setActionForm({
      comments: "",
      reason: "",
      physical_location: "",
      storage_reference: "",
      confirmStore: false,
    });
    setError("");
    setNotice("");
  }

  function closeAction() {
    setAction(null);
    setActionSaving(false);
  }

  async function handleActionSubmit(event) {
    event.preventDefault();
    if (!action?.row) return;
    if (action.mode === "store" && !actionForm.confirmStore) {
      setActionForm((prev) => ({ ...prev, confirmStore: true }));
      return;
    }
    setActionSaving(true);
    setError("");
    setNotice("");
    try {
      if (action.mode === "approve") {
        await exhibitService.approve(action.row.id, { comments: actionForm.comments });
        setNotice("Exhibit storage request approved.");
      } else if (action.mode === "decline") {
        await exhibitService.decline(action.row.id, {
          reason: actionForm.reason,
          comments: actionForm.comments,
        });
        setNotice("Exhibit storage request declined.");
      } else {
        await exhibitService.store(action.row.id, {
          physical_location: actionForm.physical_location,
          storage_reference: actionForm.storage_reference,
        });
        setNotice("Exhibit marked as physically stored.");
      }
      closeAction();
      await loadData();
    } catch (err) {
      setError(errorText(err, "Failed to update exhibit request."));
    } finally {
      setActionSaving(false);
    }
  }

  function openLifecycle(mode, row, rows = null) {
    const targetRows = Array.isArray(rows) && rows.length > 0 ? rows : row ? [row] : [];
    const primaryRow = row || targetRows[0];
    if (!primaryRow) return;
    const ownerAvailable = allRowsHaveOwnerIdentity(targetRows);
    let selectedAction = LIFECYCLE_ACTIONS.some((option) => option.value === primaryRow.lifecycle_action)
      ? primaryRow.lifecycle_action
      : ownerAvailable
      ? "return_owner"
      : "dispose";
    if (selectedAction === "return_owner" && !ownerAvailable) {
      selectedAction = "dispose";
    }
    setLifecycle({ mode, row: primaryRow, rows: targetRows });
    setLifecycleForm({
      action: selectedAction,
      reason: targetRows.length > 1 ? "" : primaryRow.lifecycle_reason || "",
      recipient_name: selectedAction === "return_owner" ? ownerNameForRow(primaryRow) : "",
      recipient_identifier: selectedAction === "return_owner" ? ownerServiceNumberForRow(primaryRow) : "",
      authority: targetRows.length > 1 ? "" : primaryRow.lifecycle_authority || "",
      disposal_mode: targetRows.length > 1 ? "" : primaryRow.lifecycle_disposal_mode || "",
      comments: "",
      decline_reason: "",
      attachment: null,
    });
    setLifecycleFileResetKey((key) => key + 1);
    setLifecycleError("");
    setLifecycleNotice("");
  }

  function closeLifecycle() {
    setLifecycle(null);
    setLifecycleSaving(false);
    setLifecycleScanning(false);
    setLifecycleError("");
    setLifecycleNotice("");
  }

  function lifecycleNeedsRecipient(actionValue) {
    return actionValue === "return_owner";
  }

  async function handleScanReleaseDocument() {
    setLifecycleScanning(true);
    setLifecycleError("");
    setLifecycleNotice("");
    try {
      const response = await exhibitService.scanReleaseDocument();
      const contentType = response.headers?.["content-type"] || response.data?.type || "application/octet-stream";
      const fallbackName = `release_evidence_scan_${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
      const filename = filenameFromDisposition(response.headers?.["content-disposition"], fallbackName);
      const file = new File([response.data], filename, { type: contentType });
      setLifecycleForm((prev) => ({ ...prev, attachment: file }));
      setLifecycleFileResetKey((key) => key + 1);
      setLifecycleNotice("Evidence document scanned and attached.");
    } catch (err) {
      setLifecycleError(await scanErrorText(err));
    } finally {
      setLifecycleScanning(false);
    }
  }

  function clearLifecycleAttachment() {
    setLifecycleForm((prev) => ({ ...prev, attachment: null }));
    setLifecycleFileResetKey((key) => key + 1);
  }

  async function handleLifecycleSubmit(event) {
    event.preventDefault();
    if (!lifecycle?.row) return;
    const targetRows = lifecycle.rows?.length ? lifecycle.rows : [lifecycle.row];
    setLifecycleError("");
    setLifecycleNotice("");

    if (lifecycle.mode === "request") {
      if (!lifecycleForm.reason.trim()) {
        setLifecycleError("Reason for release is required.");
        return;
      }
      if (lifecycleForm.action === "dispose" && !lifecycleForm.disposal_mode.trim()) {
        setLifecycleError("Mode of disposal is required when disposing an exhibit.");
        return;
      }
      if (lifecycleForm.action === "return_owner" && !allRowsHaveOwnerIdentity(targetRows)) {
        setLifecycleError("Return to the Owner is invalid because the selected case has no accused name or service number recorded.");
        return;
      }
      if (!lifecycleForm.attachment) {
        setLifecycleError("Attach the release evidence document before submitting.");
        return;
      }
    }
    if (lifecycle.mode === "decline" && !lifecycleForm.decline_reason.trim()) {
      setLifecycleError("Decline reason is required.");
      return;
    }

    setLifecycleSaving(true);
    setLifecycleError("");
    setLifecycleNotice("");
    try {
      if (lifecycle.mode === "request") {
        await Promise.all(targetRows.map((row) => {
          const fd = new FormData();
          fd.append("action", lifecycleForm.action);
          fd.append("reason", lifecycleForm.reason.trim());
          if (lifecycleForm.action === "return_owner") {
            fd.append("recipient_name", ownerNameForRow(row));
            fd.append("recipient_identifier", ownerServiceNumberForRow(row));
          }
          if (lifecycleForm.authority.trim()) fd.append("authority", lifecycleForm.authority.trim());
          if (lifecycleForm.action === "dispose" && lifecycleForm.disposal_mode.trim()) fd.append("disposal_mode", lifecycleForm.disposal_mode.trim());
          if (lifecycleForm.attachment) fd.append("attachment", lifecycleForm.attachment);
          return exhibitService.requestLifecycle(row.id, fd);
        }));
        setSelectedLifecycleIds(new Set());
        setNotice(`${targetRows.length} exhibit release request${targetRows.length === 1 ? "" : "s"} submitted.`);
      } else if (lifecycle.mode === "approve") {
        await exhibitService.approveLifecycle(lifecycle.row.id, { comments: lifecycleForm.comments });
        setNotice("Exhibit release approved.");
      } else {
        await exhibitService.declineLifecycle(lifecycle.row.id, {
          reason: lifecycleForm.decline_reason,
          comments: lifecycleForm.comments,
        });
        setNotice("Exhibit release declined.");
      }
      closeLifecycle();
      await loadData();
    } catch (err) {
      setLifecycleError(errorText(err, "Failed to update exhibit release."));
    } finally {
      setLifecycleSaving(false);
    }
  }

  const lifecycleRows = lifecycle?.rows?.length ? lifecycle.rows : lifecycle?.row ? [lifecycle.row] : [];
  const lifecycleOwnerAvailable = lifecycle ? allRowsHaveOwnerIdentity(lifecycleRows) : true;
  const lifecycleOwnerName = lifecycleRows.length > 1 ? "Auto-filled per selected case" : ownerNameForRow(lifecycle?.row);
  const lifecycleOwnerServiceNumber = lifecycleRows.length > 1 ? "Auto-filled per selected case" : ownerServiceNumberForRow(lifecycle?.row);

  return (
    <div className="space-y-5 p-4 text-slate-900 md:p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">Exhibits</h2>
        <p className="text-sm text-slate-600">Request, approve, receive, and track exhibits collected during investigations.</p>
      </div>

      {(error || notice) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || notice}
        </div>
      )}

      {canCreate && (
        <form ref={formRef} onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Request Exhibit Storage</h3>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {additionalSource && (
              <div className="md:col-span-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Adding additional exhibits under <strong>{additionalSource.exhibit_name}</strong> for <strong>{additionalSource.case_number}</strong>.
                    The new exhibit will still require approval before storage.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdditionalSource(null);
                      setForm((prev) => ({ ...prev, parent_request: "" }));
                    }}
                    className="self-start rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 sm:self-auto"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Case</label>
              <select
                value={form.case}
                onChange={(event) => handleCaseChange(event.target.value)}
                disabled={eligibleCases.length === 0}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              >
                {eligibleCases.length === 0 ? (
                  <option value="">No assigned cases available</option>
                ) : (
                  eligibleCases.map((caseObj) => (
                    <option key={caseObj.id} value={caseObj.id}>{caseLabel(caseObj)}</option>
                  ))
                )}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Storage Destination</label>
              <select
                value={form.storage_destination}
                onChange={(event) => handleDestinationChange(event.target.value)}
                disabled={destinationOptions.length === 0}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              >
                {destinationOptions.length === 0 ? (
                  <option value="">No storage destinations available</option>
                ) : (
                  <>
                    <option value="">Select destination</option>
                    {destinationOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Exhibits</h4>
                <button
                  type="button"
                  onClick={addExhibit}
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Add Exhibit
                </button>
              </div>

              {form.exhibits.map((item, index) => (
                <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Exhibit {index + 1}</span>
                    {form.exhibits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeExhibit(item.id)}
                        className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_130px]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Exhibit Name</label>
                      <input
                        value={item.exhibit_name}
                        onChange={(event) => updateExhibit(item.id, { exhibit_name: event.target.value })}
                        placeholder="e.g. Mobile phone, uniform, document"
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) => updateExhibit(item.id, { quantity: event.target.value })}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</label>
                      <textarea
                        rows={2}
                        value={item.description}
                        onChange={(event) => updateExhibit(item.id, { description: event.target.value })}
                        placeholder="Condition, serial number, collection details, packaging notes"
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Upload Photo</label>
                      <input
                        key={`upload-${fileInputResetKey}-${item.id}`}
                        type="file"
                        accept="image/*"
                        onChange={(event) => setExhibitPhoto(item.id, event.target.files?.[0] || null)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Take Photo</label>
                      <button
                        type="button"
                        onClick={() => openCamera(item.id)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        Open Camera
                      </button>
                    </div>

                    {item.photo && (
                      <div className="md:col-span-2 rounded-md border border-slate-200 bg-white p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                          {item.photoPreviewUrl && (
                            <img
                              src={item.photoPreviewUrl}
                              alt={`${item.exhibit_name || "Exhibit"} preview`}
                              className="h-32 w-full rounded-md border border-slate-200 object-contain sm:w-48"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-slate-600">
                              Selected photo: {item.photo.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeExhibitPhoto(item.id)}
                              className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Remove Photo
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={saving || !canSubmitRequest}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {saving ? "Submitting..." : "Submit Storage Requests"}
              </button>
            </div>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Exhibit Storage Register</h3>
            <span className="text-xs font-medium text-slate-500">{filteredRequests.length} of {requests.length} total</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search exhibits"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="stored">Stored</option>
              <option value="return_requested">Return Requested</option>
              <option value="disposal_requested">Disposal Requested</option>
              <option value="returned">Returned</option>
              <option value="disposed">Disposed</option>
            </select>
          </div>
          {canCreate && selectedLifecycleRows.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 sm:flex-row sm:items-center sm:justify-between">
              <span>{selectedLifecycleRows.length} stored exhibit{selectedLifecycleRows.length === 1 ? "" : "s"} selected for release.</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openLifecycle("request", selectedLifecycleRows[0], selectedLifecycleRows)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Release Selected
                </button>
                <button
                  type="button"
                  onClick={clearLifecycleSelections}
                  className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-slate-500">Loading exhibits...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">No exhibit storage requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {canCreate && (
                    <th className="px-4 py-3 text-left font-semibold">
                      <input
                        type="checkbox"
                        checked={allDisplayedLifecycleSelected}
                        onChange={toggleAllDisplayedLifecycleSelections}
                        disabled={lifecycleSelectableRows.length === 0}
                        title="Select all stored exhibits shown"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold">Case</th>
                  <th className="px-4 py-3 text-left font-semibold">Exhibit</th>
                  <th className="px-4 py-3 text-left font-semibold">Destination</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Photo</th>
                  <th className="px-4 py-3 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRequests.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    {canCreate && (
                      <td className="px-4 py-3 align-top">
                        {canRequestLifecycle(user, row) ? (
                          <input
                            type="checkbox"
                            checked={selectedLifecycleIds.has(row.id)}
                            onChange={() => toggleLifecycleSelection(row.id)}
                            title="Select for release"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <span className="block font-mono text-xs text-blue-700">{row.case_number || "--"}</span>
                      <span className="block text-xs text-slate-500">{row.case_accused || "--"}</span>
                      <span className="block text-xs text-slate-500">{row.case_offence || "--"}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="font-medium text-slate-900">{row.exhibit_name}</span>
                      <span className="block text-xs text-slate-500">Qty: {row.quantity || 1}</span>
                      {row.parent_request_label && (
                        <span className="mt-1 block text-xs font-medium text-blue-700">
                          Additional to: {row.parent_request_label}
                        </span>
                      )}
                      {row.description && <span className="block max-w-xs whitespace-normal break-words text-xs text-slate-500">{row.description}</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600">{destinationLabel(row)}</td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">Requested by {row.requested_by_name || "--"} on {displayDate(row.created_at)}</span>
                      {row.reviewed_at && <span className="mt-1 block text-xs text-slate-400">Reviewed on {displayDate(row.reviewed_at)}</span>}
                      {row.stored_at && <span className="mt-1 block text-xs text-slate-400">Stored on {displayDate(row.stored_at)}</span>}
                      {row.decline_reason && <span className="block mt-1 text-xs text-red-600">Reason: {row.decline_reason}</span>}
                      {row.physical_location && <span className="block mt-1 text-xs text-slate-500">Stored at {row.physical_location}</span>}
                      {row.lifecycle_action && (
                        <div className="mt-2 max-w-xs rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                          <span className="block font-semibold text-slate-700">{lifecycleActionLabel(row.lifecycle_action)}</span>
                          {row.lifecycle_reason && <span className="block">Reason: {row.lifecycle_reason}</span>}
                          {row.lifecycle_recipient_name && <span className="block">Owner: {row.lifecycle_recipient_name}</span>}
                          {row.lifecycle_recipient_identifier && <span className="block">ID/Service No: {row.lifecycle_recipient_identifier}</span>}
                          {row.lifecycle_authority && <span className="block">Authority: {row.lifecycle_authority}</span>}
                          {row.lifecycle_disposal_mode && <span className="block">Mode of disposal: {row.lifecycle_disposal_mode}</span>}
                          {row.lifecycle_requested_by_name && <span className="block text-slate-400">Requested by {row.lifecycle_requested_by_name} on {displayDate(row.lifecycle_requested_at)}</span>}
                          {row.lifecycle_reviewed_by_name && <span className="block text-slate-400">Reviewed by {row.lifecycle_reviewed_by_name} on {displayDate(row.lifecycle_reviewed_at)}</span>}
                          {row.lifecycle_decline_reason && <span className="block text-red-600">Declined: {row.lifecycle_decline_reason}</span>}
                          {row.lifecycle_attachment && (
                            <a href={row.lifecycle_attachment} target="_blank" rel="noreferrer" className="mt-1 inline-block font-medium text-blue-700 hover:text-blue-900">
                              Evidence Document
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.photo ? (
                        <a href={row.photo} target="_blank" rel="noreferrer" className="text-blue-700 hover:text-blue-900 font-medium">
                          View Photo
                        </a>
                      ) : (
                        <span className="text-slate-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        {row.status === "pending" && canReview(user, row) && (
                          <>
                            <button type="button" onClick={() => openAction("approve", row)} className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                              Approve
                            </button>
                            <button type="button" onClick={() => openAction("decline", row)} className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                              Decline
                            </button>
                          </>
                        )}
                        {row.status === "approved" && canReview(user, row) && (
                          <button type="button" onClick={() => openAction("store", row)} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                            Store
                          </button>
                        )}
                        {row.status === "stored" && canCreate && (
                          <>
                            <button type="button" onClick={() => startAdditionalRequest(row)} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                              Add More
                            </button>
                            <button type="button" onClick={() => openLifecycle("request", row)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                              Release Exhibit
                            </button>
                          </>
                        )}
                        {isLifecyclePendingStatus(row.status) && canAuthorizeRelease(user, row) && (
                          <>
                            <button type="button" onClick={() => openLifecycle("approve", row)} className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                              Approve Release
                            </button>
                            <button type="button" onClick={() => openLifecycle("decline", row)} className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                              Decline Release
                            </button>
                          </>
                        )}
                        {row.reviewed_by_name && <span className="w-full text-xs text-slate-400">Reviewed by {row.reviewed_by_name}</span>}
                        {row.stored_by_name && <span className="w-full text-xs text-slate-400">Stored by {row.stored_by_name}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {camera.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={(event) => event.target === event.currentTarget && closeCamera()}>
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-950">Take Exhibit Photo</h3>
            </div>
            <div className="space-y-4 px-5 py-4">
              {camera.loading && (
                <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  Opening camera...
                </div>
              )}
              {camera.error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {camera.error}
                </div>
              )}
              <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-950">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-[62vh] max-h-[420px] w-full object-contain ${camera.error ? "hidden" : "block"}`}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={closeCamera} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button
                type="button"
                onClick={captureCameraPhoto}
                disabled={camera.loading || !!camera.error}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                Capture Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={(event) => event.target === event.currentTarget && closeAction()}>
          <form onSubmit={handleActionSubmit} className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-950">
                {action.mode === "approve" ? "Approve Exhibit Storage" : action.mode === "decline" ? "Decline Exhibit Storage" : "Store Exhibit"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{action.row.case_number} - {action.row.exhibit_name}</p>
            </div>
            <div className="space-y-4 px-5 py-4">
              {action.mode === "decline" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Decline Reason</label>
                  <textarea
                    rows={3}
                    value={actionForm.reason}
                    onChange={(event) => setActionForm((prev) => ({ ...prev, reason: event.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {action.mode !== "store" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Comments</label>
                  <textarea
                    rows={3}
                    value={actionForm.comments}
                    onChange={(event) => setActionForm((prev) => ({ ...prev, comments: event.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {action.mode === "store" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Physical Storage Location</label>
                    <input
                      value={actionForm.physical_location}
                      onChange={(event) => setActionForm((prev) => ({ ...prev, physical_location: event.target.value, confirmStore: false }))}
                      placeholder="e.g. Exhibit locker A, shelf 2"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Storage Reference</label>
                    <input
                      value={actionForm.storage_reference}
                      onChange={(event) => setActionForm((prev) => ({ ...prev, storage_reference: event.target.value, confirmStore: false }))}
                      placeholder="Locker tag, bag seal, register number"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {actionForm.confirmStore && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Confirm that <strong>{action.row.exhibit_name}</strong> for <strong>{action.row.case_number}</strong> has been physically received and should now be marked as stored.
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={closeAction} disabled={actionSaving} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
                Cancel
              </button>
              <button type="submit" disabled={actionSaving || (action.mode === "decline" && !actionForm.reason.trim()) || (action.mode === "store" && !actionForm.physical_location.trim())} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300">
                {actionSaving ? "Saving..." : action.mode === "approve" ? "Approve" : action.mode === "decline" ? "Decline" : actionForm.confirmStore ? "Confirm Store" : "Review Store"}
              </button>
            </div>
          </form>
        </div>
      )}

      {lifecycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={(event) => event.target === event.currentTarget && closeLifecycle()}>
          <form onSubmit={handleLifecycleSubmit} className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-950">
                {lifecycle.mode === "request" ? "Request Exhibit Release" : lifecycle.mode === "approve" ? "Approve Exhibit Release" : "Decline Exhibit Release"}
              </h3>
              {lifecycle.rows?.length > 1 ? (
                <p className="mt-1 text-sm text-slate-500">{lifecycle.rows.length} exhibits selected for one release request.</p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">{lifecycle.row.case_number} - {lifecycle.row.exhibit_name}</p>
              )}
            </div>

            <div className="space-y-4 px-5 py-4">
              {(lifecycleError || lifecycleNotice) && (
                <div className={`rounded-lg border px-3 py-2 text-sm ${lifecycleError ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  {lifecycleError || lifecycleNotice}
                </div>
              )}

              {lifecycle.mode === "request" && (
                <>
                  {lifecycle.rows?.length > 1 && (
                    <div className="max-h-28 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {lifecycle.rows.map((row) => (
                        <div key={row.id} className="py-0.5">
                          <span className="font-mono text-blue-700">{row.case_number}</span> - {row.exhibit_name}
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Mode of Release</label>
                    <select
                      value={lifecycleForm.action}
                      onChange={(event) => setLifecycleForm((prev) => ({
                        ...prev,
                        action: event.target.value,
                        recipient_name: event.target.value === "return_owner" ? lifecycleOwnerName : "",
                        recipient_identifier: event.target.value === "return_owner" ? lifecycleOwnerServiceNumber : "",
                        disposal_mode: event.target.value === "dispose" ? prev.disposal_mode : "",
                      }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {LIFECYCLE_ACTIONS.map((option) => (
                        <option key={option.value} value={option.value} disabled={option.value === "return_owner" && !lifecycleOwnerAvailable}>
                          {option.label}{option.value === "return_owner" && !lifecycleOwnerAvailable ? " (No accused details)" : ""}
                        </option>
                      ))}
                    </select>
                    {!lifecycleOwnerAvailable && (
                      <p className="mt-1 text-xs text-amber-700">Return to the Owner is unavailable because no accused name or service number is recorded.</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</label>
                    <textarea
                      rows={3}
                      value={lifecycleForm.reason}
                      onChange={(event) => setLifecycleForm((prev) => ({ ...prev, reason: event.target.value }))}
                      placeholder="Why should this exhibit be released?"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {lifecycleNeedsRecipient(lifecycleForm.action) && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Owner
                        </label>
                        <input
                          value={lifecycleOwnerName}
                          readOnly
                          className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">ID / Service No</label>
                        <input
                          value={lifecycleOwnerServiceNumber}
                          readOnly
                          className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                    </div>
                  )}

                  {lifecycleForm.action === "dispose" && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Mode of Disposal</label>
                      <input
                        value={lifecycleForm.disposal_mode}
                        onChange={(event) => setLifecycleForm((prev) => ({ ...prev, disposal_mode: event.target.value }))}
                        placeholder="e.g. Burnt, crushed, handed to disposal board, auctioned as scrap"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Authority / Reference</label>
                    <input
                      value={lifecycleForm.authority}
                      onChange={(event) => setLifecycleForm((prev) => ({ ...prev, authority: event.target.value }))}
                      placeholder="Approving authority or letter reference"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence Document</label>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        key={`lifecycle-file-${lifecycleFileResetKey}`}
                        type="file"
                        onChange={(event) => setLifecycleForm((prev) => ({ ...prev, attachment: event.target.files?.[0] || null }))}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                      />
                      <button
                        type="button"
                        onClick={handleScanReleaseDocument}
                        disabled={lifecycleScanning || lifecycleSaving}
                        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                      >
                        {lifecycleScanning ? "Scanning..." : "Scan Document"}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Upload from local storage or scan directly from a connected scanner. Evidence document is required.</p>
                    {lifecycleForm.attachment && (
                      <div className="mt-2 flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
                        <span>Selected evidence: <strong>{lifecycleForm.attachment.name}</strong></span>
                        <button
                          type="button"
                          onClick={clearLifecycleAttachment}
                          className="self-start rounded-md border border-emerald-200 bg-white px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 sm:self-auto"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {lifecycle.mode === "approve" && (
                <>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Confirm approval of <strong>{lifecycleActionLabel(lifecycle.row.lifecycle_action)}</strong>. The exhibit status will be updated and the investigation team will be notified.
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Comments</label>
                    <textarea
                      rows={3}
                      value={lifecycleForm.comments}
                      onChange={(event) => setLifecycleForm((prev) => ({ ...prev, comments: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {lifecycle.mode === "decline" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Decline Reason</label>
                    <textarea
                      rows={3}
                      value={lifecycleForm.decline_reason}
                      onChange={(event) => setLifecycleForm((prev) => ({ ...prev, decline_reason: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Comments</label>
                    <textarea
                      rows={3}
                      value={lifecycleForm.comments}
                      onChange={(event) => setLifecycleForm((prev) => ({ ...prev, comments: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={closeLifecycle} disabled={lifecycleSaving || lifecycleScanning} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
                Cancel
              </button>
              <button
                type="submit"
                disabled={lifecycleSaving || lifecycleScanning}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {lifecycleSaving ? "Saving..." : lifecycle.mode === "request" ? "Submit Release Request" : lifecycle.mode === "approve" ? "Approve Release" : "Decline Release"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
