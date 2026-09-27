import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { caseService, guardroomService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function formatDate(value) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function parseDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDurationSeconds(seconds) {
  const total = Math.max(Number(seconds || 0), 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function apiError(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (data.non_field_errors?.[0]) return data.non_field_errors[0];
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;
  const value = data[firstKey];
  return Array.isArray(value) ? value[0] : value || fallback;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uniqueOptions(items, getKey, getLabel) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (key === undefined || key === null || key === "") return;
    if (!map.has(String(key))) {
      map.set(String(key), getLabel(item) || String(key));
    }
  });
  return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
}

const REASONS = [
  { value: "investigation", label: "Investigation" },
  { value: "legal_court_process", label: "Legal/Court Process" },
  { value: "post_conviction", label: "Post-Conviction" },
  { value: "discipline_conduct", label: "Discipline/Conduct" },
  { value: "absentee_offences", label: "Absentee offences" },
];

const STATUS_STYLE = {
  pending: "bg-yellow-500/20 text-yellow-300",
  approved: "bg-green-500/20 text-green-300",
  rejected: "bg-red-500/20 text-red-300",
};

const BOOK_OUT_STATUS_LABELS = {
  not_requested: "Not Requested",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const INVESTIGATOR_VIEWS = [
  { key: "status", label: "View Guard Status" },
  { key: "request", label: "Request Guardroom" },
  { key: "requests", label: "View Requests" },
];

const BLANK_GUARDROOM = {
  name: "",
  location: "",
  phone_no: "",
  capacity: "",
  current_strength: "",
  established_strength: "",
  is_active: true,
};

const INPUT_CLASS = "w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500";

function toGuardroomForm(guardroom = {}) {
  return {
    name: guardroom.name || "",
    location: guardroom.location || "",
    phone_no: guardroom.phone_no || "",
    capacity: guardroom.capacity ?? "",
    current_strength: guardroom.current_strength ?? "",
    established_strength: guardroom.established_strength ?? guardroom.capacity ?? "",
    is_active: guardroom.is_active !== false,
  };
}

function toNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function buildGuardroomPayload(form) {
  const capacity = toNonNegativeInteger(form.capacity);
  const establishedStrength =
    form.established_strength === "" || form.established_strength == null
      ? capacity
      : form.established_strength;
  return {
    name: form.name.trim(),
    location: form.location || "",
    phone_no: form.phone_no || "",
    capacity,
    current_strength: toNonNegativeInteger(form.current_strength),
    established_strength: toNonNegativeInteger(establishedStrength),
    is_active: Boolean(form.is_active),
  };
}

export default function Guardrooms({ user }) {
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get("case");
  const isSuperuser = Boolean(user?.is_superuser);
  const isInvestigator = user?.role === "investigator";
  const canReviewPlacement = user?.role === "adj" || user?.role === "detachment" || isSuperuser;
  const canReviewBookOut = user?.role === "adj" || isSuperuser;

  const [activeView, setActiveView] = useState(caseId ? "request" : isInvestigator ? "status" : "register");
  const [guardrooms, setGuardrooms] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statusEntries, setStatusEntries] = useState([]);
  const [statusGuardroomId, setStatusGuardroomId] = useState("");
  const [caseOptions, setCaseOptions] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(caseId || "");
  const [caseObj, setCaseObj] = useState(null);
  const [loadingGuardrooms, setLoadingGuardrooms] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  const [guardroomForm, setGuardroomForm] = useState(BLANK_GUARDROOM);
  const [editingGuardroomId, setEditingGuardroomId] = useState(null);
  const [deletingGuardroomId, setDeletingGuardroomId] = useState(null);
  const [requestForm, setRequestForm] = useState({ guardroom: "", reason: "" });
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [savingGuardroom, setSavingGuardroom] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [bookOutId, setBookOutId] = useState(null);
  const [approvingBookOutId, setApprovingBookOutId] = useState(null);
  const [freeingRequest, setFreeingRequest] = useState(null);
  const [releaseLetter, setReleaseLetter] = useState(null);
  const [freeingId, setFreeingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useAutoDismiss(message, setMessage);
  useAutoDismiss(error, setError);

  const loadGuardrooms = useCallback(async () => {
    setLoadingGuardrooms(true);
    try {
      const res = await guardroomService.list({ page_size: 200 });
      setGuardrooms(toArray(res.data));
    } catch {
      setError("Failed to load guardrooms.");
    } finally {
      setLoadingGuardrooms(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const res = await guardroomService.placementRequests({ page_size: 200 });
      setRequests(toArray(res.data));
    } catch (ex) {
      setRequests([]);
      setError(apiError(ex?.response?.data, "Failed to load guardroom requests."));
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadStatusEntries = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await guardroomService.placementRequests({ page_size: 200, scope: "guardroom_status" });
      setStatusEntries(toArray(res.data));
    } catch (ex) {
      setStatusEntries([]);
      setError(apiError(ex?.response?.data, "Failed to load guardroom status."));
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadCaseOptions = useCallback(async () => {
    if (!isInvestigator) return;
    setLoadingCases(true);
    try {
      const res = await caseService.list({
        page_size: 200,
        status__in: "under_investigation,tasked,pending,served",
      });
      setCaseOptions(toArray(res.data));
    } catch {
      setCaseOptions([]);
    } finally {
      setLoadingCases(false);
    }
  }, [isInvestigator]);

  useEffect(() => {
    loadGuardrooms();
    loadRequests();
    loadStatusEntries();
  }, [loadGuardrooms, loadRequests, loadStatusEntries]);

  useEffect(() => {
    loadCaseOptions();
  }, [loadCaseOptions]);

  useEffect(() => {
    if (!caseId) {
      setCaseObj(null);
      return;
    }
    setSelectedCaseId(caseId);
    setActiveView("request");
    caseService
      .get(caseId)
      .then((res) => setCaseObj(res.data))
      .catch(() => setCaseObj(null));
  }, [caseId]);

  const selectedCase = useMemo(() => {
    if (caseObj && String(caseObj.id) === String(selectedCaseId)) return caseObj;
    return caseOptions.find((c) => String(c.id) === String(selectedCaseId)) || null;
  }, [caseObj, caseOptions, selectedCaseId]);

  const filteredStatusEntries = useMemo(() => {
    if (!statusGuardroomId) return statusEntries;
    return statusEntries.filter((entry) => String(entry.guardroom) === String(statusGuardroomId));
  }, [statusEntries, statusGuardroomId]);

  const selectedStatusGuardroom = useMemo(
    () => guardrooms.find((g) => String(g.id) === String(statusGuardroomId)) || null,
    [guardrooms, statusGuardroomId]
  );

  const showGuardroomStatus = (guardroomId = "") => {
    setStatusGuardroomId(guardroomId ? String(guardroomId) : "");
    setActiveView("status");
  };

  const cancelGuardroomEdit = () => {
    setGuardroomForm(BLANK_GUARDROOM);
    setEditingGuardroomId(null);
  };

  const startEditGuardroom = (guardroom) => {
    setGuardroomForm(toGuardroomForm(guardroom));
    setEditingGuardroomId(guardroom.id);
    setActiveView("register");
    setError("");
    setMessage("");
  };

  const handleSaveGuardroom = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!guardroomForm.name.trim()) {
      setError("Guardroom name is required.");
      return;
    }
    setSavingGuardroom(true);
    try {
      const payload = buildGuardroomPayload(guardroomForm);
      if (editingGuardroomId) {
        await guardroomService.update(editingGuardroomId, payload);
        setMessage("Guardroom updated.");
      } else {
        await guardroomService.create(payload);
        setMessage("Guardroom added.");
      }
      cancelGuardroomEdit();
      await loadGuardrooms();
    } catch (ex) {
      setError(apiError(ex?.response?.data, editingGuardroomId ? "Failed to update guardroom." : "Failed to add guardroom."));
    } finally {
      setSavingGuardroom(false);
    }
  };

  const handleDeleteGuardroom = async (guardroom) => {
    if (!window.confirm(`Delete ${guardroom.name}? This cannot be undone.`)) return;
    setDeletingGuardroomId(guardroom.id);
    setError("");
    setMessage("");
    try {
      await guardroomService.delete(guardroom.id);
      if (editingGuardroomId === guardroom.id) cancelGuardroomEdit();
      setMessage("Guardroom deleted.");
      await loadGuardrooms();
    } catch (ex) {
      setError(apiError(ex?.response?.data, "Failed to delete guardroom. If it has placement history, mark it inactive instead."));
    } finally {
      setDeletingGuardroomId(null);
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!selectedCaseId) {
      setError("Select the case/offender for the guardroom request.");
      return;
    }
    if (!requestForm.guardroom || !requestForm.reason) {
      setError("Select a guardroom and placement reason.");
      return;
    }
    setSubmittingRequest(true);
    try {
      await guardroomService.createPlacementRequest({
        case: selectedCaseId,
        guardroom: requestForm.guardroom,
        reason: requestForm.reason,
      });
      setRequestForm({ guardroom: "", reason: "" });
      setMessage("Guardroom placement request sent for review.");
      await loadRequests();
      setActiveView("requests");
    } catch (ex) {
      setError(apiError(ex?.response?.data, "Failed to submit placement request."));
    } finally {
      setSubmittingRequest(false);
    }
  };

  const updateDraft = (id, patch) => {
    setReviewDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  };

  const handleApprove = async (requestId) => {
    setReviewingId(requestId);
    setError("");
    setMessage("");
    try {
      await guardroomService.approvePlacementRequest(requestId, {
        comments: reviewDrafts[requestId]?.comments || "",
      });
      setMessage("Guardroom request approved.");
      loadRequests();
    } catch (ex) {
      setError(apiError(ex?.response?.data, "Failed to approve request."));
    } finally {
      setReviewingId(null);
    }
  };

  const handleReject = async (requestId) => {
    const rejection = (reviewDrafts[requestId]?.rejection_reason || "").trim();
    if (!rejection) {
      setError("Reason for rejection is required.");
      return;
    }
    setReviewingId(requestId);
    setError("");
    setMessage("");
    try {
      await guardroomService.rejectPlacementRequest(requestId, {
        rejection_reason: rejection,
        comments: reviewDrafts[requestId]?.comments || "",
      });
      setMessage("Guardroom request rejected.");
      loadRequests();
    } catch (ex) {
      setError(apiError(ex?.response?.data, "Failed to reject request."));
    } finally {
      setReviewingId(null);
    }
  };

  const handleBookIn = async (requestId) => {
    setBookingId(requestId);
    setError("");
    setMessage("");
    try {
      await guardroomService.bookInPlacementRequest(requestId);
      setMessage("Offender booked into the selected guardroom.");
      await Promise.all([loadRequests(), loadStatusEntries(), loadGuardrooms()]);
      setActiveView("status");
    } catch (ex) {
      setError(apiError(ex?.response?.data, "Failed to book in offender."));
    } finally {
      setBookingId(null);
    }
  };

  const handleRequestBookOut = async (requestId) => {
    setBookOutId(requestId);
    setError("");
    setMessage("");
    try {
      await guardroomService.requestBookOut(requestId);
      setMessage("Book-out request sent to the battalion Adjutant.");
      await Promise.all([loadRequests(), loadStatusEntries()]);
    } catch (ex) {
      setError(apiError(ex?.response?.data, "Failed to request book-out."));
    } finally {
      setBookOutId(null);
    }
  };

  const handleApproveBookOut = async (requestId) => {
    setApprovingBookOutId(requestId);
    setError("");
    setMessage("");
    try {
      await guardroomService.approveBookOut(requestId, {
        comments: reviewDrafts[requestId]?.book_out_comments || "",
      });
      setMessage("Book-out request approved.");
      await loadRequests();
    } catch (ex) {
      setError(apiError(ex?.response?.data, "Failed to approve book-out request."));
    } finally {
      setApprovingBookOutId(null);
    }
  };

  const openFreeModal = (request) => {
    setReleaseLetter(null);
    setFreeingRequest(request);
  };

  const handleFree = async (e) => {
    e.preventDefault();
    if (!freeingRequest) return;
    if (!releaseLetter) {
      setError("Attach the release letter before freeing this offender.");
      return;
    }
    setFreeingId(freeingRequest.id);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("release_letter", releaseLetter);
      await guardroomService.freePlacementRequest(freeingRequest.id, formData);
      setMessage("Release letter attached. Accused successfully removed from guardroom.");
      setFreeingRequest(null);
      setReleaseLetter(null);
      await Promise.all([loadRequests(), loadStatusEntries(), loadGuardrooms()]);
    } catch (ex) {
      setError(apiError(ex?.response?.data, "Failed to free offender from guardroom."));
    } finally {
      setFreeingId(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const reviewedRequests = requests.filter((r) => r.status !== "pending");
  const pendingBookOutRequests = requests.filter(
    (r) => r.book_out_status === "pending" && r.booked_in_at && !r.released_at
  );
  const orderedRequests = [...pendingRequests, ...reviewedRequests];

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 text-white space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Guardrooms</h2>
        <p className="text-sm text-gray-400 mt-1">
          {isInvestigator ? "Guard status, placement requests, and approved book-ins." : "Manage guardroom capacity and placement requests."}
        </p>
      </div>

      {message && <div className="bg-green-900/30 border border-green-700 text-green-300 text-sm rounded-lg px-4 py-3">{message}</div>}
      {error && <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}

      {isSuperuser && (
        <AddGuardroomForm
          guardroomForm={guardroomForm}
          setGuardroomForm={setGuardroomForm}
          savingGuardroom={savingGuardroom}
          editingGuardroomId={editingGuardroomId}
          onCancelEdit={cancelGuardroomEdit}
          onSubmit={handleSaveGuardroom}
        />
      )}

      {isInvestigator ? (
        <>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-2 flex flex-col sm:flex-row gap-2">
            {INVESTIGATOR_VIEWS.map((view) => (
              <button
                key={view.key}
                type="button"
                onClick={() => setActiveView(view.key)}
                className={`flex-1 rounded px-4 py-2 text-sm font-semibold transition-colors ${
                  activeView === view.key
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>

          {activeView === "status" && (
            <GuardStatusPanel
              entries={statusEntries}
              loading={loadingStatus}
              onRequestBookOut={handleRequestBookOut}
              onFree={openFreeModal}
              busyId={bookOutId || freeingId}
            />
          )}

          {activeView === "request" && (
            <RequestPlacementPanel
              caseId={caseId}
              caseOptions={caseOptions}
              selectedCaseId={selectedCaseId}
              selectedCase={selectedCase}
              loadingCases={loadingCases}
              onCaseChange={setSelectedCaseId}
              guardrooms={guardrooms}
              requestForm={requestForm}
              onFormChange={setRequestForm}
              onSubmit={handleSubmitRequest}
              submittingRequest={submittingRequest}
            />
          )}

          {activeView === "requests" && (
            <RequestsPanel
              title="Guardroom Requests"
              requests={orderedRequests}
              loading={loadingRequests}
              onBookIn={handleBookIn}
              bookingId={bookingId}
            />
          )}
        </>
      ) : (
        <>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setActiveView("register")}
              className={`flex-1 rounded px-4 py-2 text-sm font-semibold transition-colors ${
                activeView === "register"
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              Guardroom Register
            </button>
            <button
              type="button"
              onClick={() => showGuardroomStatus()}
              className={`flex-1 rounded px-4 py-2 text-sm font-semibold transition-colors ${
                activeView === "status"
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              Guardroom Status
            </button>
          </div>

          {activeView === "status" ? (
            <GuardStatusPanel
              entries={filteredStatusEntries}
              loading={loadingStatus}
              showActions={false}
              filterLabel={selectedStatusGuardroom?.name || ""}
              onClearFilter={() => setStatusGuardroomId("")}
            />
          ) : (
            <>
              <GuardroomRegister
                guardrooms={guardrooms}
                loading={loadingGuardrooms}
                onCountClick={(guardroom) => showGuardroomStatus(guardroom.id)}
                canManage={isSuperuser}
                editingId={editingGuardroomId}
                deletingId={deletingGuardroomId}
                onEdit={startEditGuardroom}
                onDelete={handleDeleteGuardroom}
              />

              {canReviewPlacement && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Placement Requests</h3>
                {loadingRequests ? (
                  <div className="text-sm text-gray-500">Loading requests...</div>
                ) : pendingRequests.length === 0 ? (
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 text-sm text-gray-500">No pending guardroom requests.</div>
                ) : (
                  pendingRequests.map((r) => (
                    <RequestReviewCard
                      key={r.id}
                      request={r}
                      draft={reviewDrafts[r.id] || {}}
                      busy={reviewingId === r.id}
                      onDraft={(patch) => updateDraft(r.id, patch)}
                      onApprove={() => handleApprove(r.id)}
                      onReject={() => handleReject(r.id)}
                    />
                  ))
                )}
              </section>
              )}

              {canReviewBookOut && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Book-Out Requests</h3>
                {loadingRequests ? (
                  <div className="text-sm text-gray-500">Loading requests...</div>
                ) : pendingBookOutRequests.length === 0 ? (
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 text-sm text-gray-500">No pending book-out requests.</div>
                ) : (
                  pendingBookOutRequests.map((r) => (
                    <BookOutReviewCard
                      key={r.id}
                      request={r}
                      draft={reviewDrafts[r.id] || {}}
                      busy={approvingBookOutId === r.id}
                      onDraft={(patch) => updateDraft(r.id, patch)}
                      onApprove={() => handleApproveBookOut(r.id)}
                    />
                  ))
                )}
              </section>
              )}

              {!canReviewPlacement && requests.length > 0 && (
                <RequestsPanel
                  title="My Guardroom Requests"
                  requests={orderedRequests}
                  loading={loadingRequests}
                />
              )}
            </>
          )}
        </>
      )}

      {freeingRequest && (
        <ReleaseLetterModal
          request={freeingRequest}
          file={releaseLetter}
          saving={freeingId === freeingRequest.id}
          onFile={setReleaseLetter}
          onClose={() => {
            setFreeingRequest(null);
            setReleaseLetter(null);
          }}
          onSubmit={handleFree}
        />
      )}
    </div>
  );
}

function AddGuardroomForm({
  guardroomForm,
  setGuardroomForm,
  savingGuardroom,
  editingGuardroomId,
  onCancelEdit,
  onSubmit,
}) {
  const isEditing = Boolean(editingGuardroomId);
  return (
    <section className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          {isEditing ? "Edit Guardroom" : "Add Guardroom"}
        </h3>
        {isEditing && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-600"
          >
            Cancel Edit
          </button>
        )}
      </div>
      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-7 gap-3">
        <Field label="Name *" className="md:col-span-2">
          <input
            required
            value={guardroomForm.name}
            onChange={(e) => setGuardroomForm({ ...guardroomForm, name: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Capacity *">
          <input
            required
            type="number"
            min="0"
            value={guardroomForm.capacity}
            onChange={(e) => setGuardroomForm({ ...guardroomForm, capacity: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Location" className="md:col-span-2">
          <input
            value={guardroomForm.location}
            onChange={(e) => setGuardroomForm({ ...guardroomForm, location: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Mobile No">
          <input
            value={guardroomForm.phone_no}
            onChange={(e) => setGuardroomForm({ ...guardroomForm, phone_no: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Current Strength">
          <input
            type="number"
            min="0"
            value={guardroomForm.current_strength}
            onChange={(e) => setGuardroomForm({ ...guardroomForm, current_strength: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Status">
          <label className="flex h-[38px] items-center gap-2 rounded-lg border border-gray-600 bg-gray-700 px-3 text-sm text-white">
            <input
              type="checkbox"
              checked={Boolean(guardroomForm.is_active)}
              onChange={(e) => setGuardroomForm({ ...guardroomForm, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-gray-500 bg-gray-800 text-blue-600 focus:ring-blue-500"
            />
            Active
          </label>
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={savingGuardroom}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
          >
            {savingGuardroom ? "Saving..." : isEditing ? "Save Changes" : "Add Guardroom"}
          </button>
        </div>
      </form>
    </section>
  );
}

function RequestPlacementPanel({
  caseId,
  caseOptions,
  selectedCaseId,
  selectedCase,
  loadingCases,
  onCaseChange,
  guardrooms,
  requestForm,
  onFormChange,
  onSubmit,
  submittingRequest,
}) {
  return (
    <section className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Request Guardroom Placement</h3>
      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {caseId ? (
          <div className="md:col-span-5 bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300">
            Case: <span className="font-mono text-blue-300">{selectedCase?.case_number || caseId}</span>
            {selectedCase?.accused_name ? <span className="text-gray-500"> - {selectedCase.accused_name}</span> : null}
          </div>
        ) : (
          <Field label="Case / offender *" className="md:col-span-5">
            <select
              required
              value={selectedCaseId}
              onChange={(e) => onCaseChange(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">{loadingCases ? "Loading cases..." : "Select case/offender"}</option>
              {caseOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.case_number} - {c.accused_name || "Accused not recorded"}
                </option>
              ))}
            </select>
          </Field>
        )}

        {selectedCase && (
          <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <InfoPill label="Offender" value={[selectedCase.accused_rank, selectedCase.accused_name, selectedCase.accused_service_number].filter(Boolean).join(" ") || "Not recorded"} />
            <InfoPill label="Unit" value={selectedCase.accused_unit_name || "--"} />
            <InfoPill label="Assignment" value={selectedCase.assigned_to_name || selectedCase.assigned_team_name || "--"} />
          </div>
        )}

        <Field label="Guardroom *" className="md:col-span-2">
          <select
            required
            value={requestForm.guardroom}
            onChange={(e) => onFormChange({ ...requestForm, guardroom: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="">Select guardroom</option>
            {guardrooms.filter((g) => g.is_active).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} {g.location ? `- ${g.location}` : ""} ({g.current_strength || 0}/{g.capacity || g.established_strength || 0})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason *" className="md:col-span-2">
          <select
            required
            value={requestForm.reason}
            onChange={(e) => onFormChange({ ...requestForm, reason: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="">Select reason</option>
            {REASONS.map((reason) => (
              <option key={reason.value} value={reason.value}>{reason.label}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submittingRequest}
            className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
          >
            {submittingRequest ? "Sending..." : "Send Request"}
          </button>
        </div>
      </form>
    </section>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2">
      <p className="text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-gray-200 mt-1 truncate">{value}</p>
    </div>
  );
}

function CountButton({ value, onClick, title }) {
  if (!onClick) return <span>{value}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="font-semibold text-blue-300 hover:text-blue-200 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
    >
      {value}
    </button>
  );
}

function statusOffender(entry) {
  return [entry.accused_rank, entry.accused_name].filter(Boolean).join(" ") || "Accused not recorded";
}

function statusAssignment(entry) {
  return entry.assigned_to_name || entry.assigned_team_name || "--";
}

function statusCompany(entry) {
  return entry.team_detachment_name || entry.tasked_detachment_name || "--";
}

function buildStatusRows(entries, getTimeInSeconds) {
  return entries.map((entry) => ({
    Offender: statusOffender(entry),
    "Service Number": entry.accused_service_number || "--",
    Case: entry.case_number || "--",
    Guardroom: entry.guardroom_name || "--",
    Location: entry.guardroom_location || "--",
    "Requested By": entry.requested_by_name || "--",
    Assignment: statusAssignment(entry),
    Coy: statusCompany(entry),
    Reason: entry.reason_display || entry.reason || "--",
    "Book-out Status": entry.book_out_status_display || BOOK_OUT_STATUS_LABELS[entry.book_out_status] || entry.book_out_status || "--",
    "Booked In": formatDate(entry.booked_in_at),
    "Booked In By": entry.booked_in_by_name || "--",
    "Time In": formatDurationSeconds(getTimeInSeconds(entry)),
  }));
}

function GuardroomRegister({
  guardrooms,
  loading,
  onCountClick,
  canManage = false,
  editingId,
  deletingId,
  onEdit,
  onDelete,
}) {
  const availableSpace = (guardroom) => {
    const capacity = Number(guardroom.capacity || guardroom.established_strength || 0);
    const current = Number(guardroom.current_strength || 0);
    return Math.max(capacity - current, 0);
  };
  const columnCount = canManage ? 8 : 7;

  return (
    <section className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Guardroom Register</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-left px-4 py-3">Mobile No</th>
              <th className="text-left px-4 py-3">Capacity</th>
              <th className="text-left px-4 py-3">Current</th>
              <th className="text-left px-4 py-3">Available Space</th>
              <th className="text-left px-4 py-3">Status</th>
              {canManage && <th className="text-right px-4 py-3">Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnCount} className="px-4 py-8 text-center text-gray-500">Loading guardrooms...</td></tr>
            ) : guardrooms.length === 0 ? (
              <tr><td colSpan={columnCount} className="px-4 py-8 text-center text-gray-500">No guardrooms found.</td></tr>
            ) : (
              guardrooms.map((g) => (
                <tr key={g.id} className={`border-b border-gray-700/40 ${editingId === g.id ? "bg-blue-500/10" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-100">{g.name}</td>
                  <td className="px-4 py-3 text-gray-400">{g.location || "--"}</td>
                  <td className="px-4 py-3 text-gray-400">{g.phone_no || "--"}</td>
                  <td className="px-4 py-3 text-gray-300">
                    <CountButton
                      value={g.capacity || g.established_strength || 0}
                      onClick={onCountClick ? () => onCountClick(g) : null}
                      title={`View status for ${g.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    <CountButton
                      value={g.current_strength || 0}
                      onClick={onCountClick ? () => onCountClick(g) : null}
                      title={`View booked-in accused at ${g.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-100">
                    <CountButton
                      value={availableSpace(g)}
                      onClick={onCountClick ? () => onCountClick(g) : null}
                      title={`View status for ${g.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${g.is_active ? "bg-green-500/20 text-green-300" : "bg-gray-600 text-gray-300"}`}>
                      {g.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(g)}
                          disabled={deletingId === g.id}
                          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(g)}
                          disabled={deletingId === g.id}
                          className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                        >
                          {deletingId === g.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GuardStatusPanel({
  entries,
  loading,
  onRequestBookOut,
  onFree,
  busyId,
  showActions = true,
  filterLabel = "",
  onClearFilter,
}) {
  const [tick, setTick] = useState(0);
  const [filters, setFilters] = useState({
    search: "",
    guardroom: "",
    reason: "",
    bookOutStatus: "",
    from: "",
    to: "",
  });
  const now = Date.now() + tick * 0;
  const columnCount = showActions ? 9 : 8;

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const timeInSeconds = (entry) => {
    if (!entry.booked_in_at) return entry.time_in_seconds || 0;
    const booked = new Date(entry.booked_in_at);
    if (Number.isNaN(booked.getTime())) return entry.time_in_seconds || 0;
    const released = entry.released_at ? new Date(entry.released_at).getTime() : null;
    const end = released && !Number.isNaN(released) ? released : now;
    return Math.max(Math.floor((end - booked.getTime()) / 1000), 0);
  };

  const guardroomOptions = useMemo(
    () => uniqueOptions(entries, (entry) => entry.guardroom, (entry) => entry.guardroom_name),
    [entries]
  );
  const reasonOptions = useMemo(
    () => uniqueOptions(entries, (entry) => entry.reason, (entry) => entry.reason_display || entry.reason),
    [entries]
  );
  const bookOutOptions = useMemo(
    () =>
      uniqueOptions(
        entries,
        (entry) => entry.book_out_status,
        (entry) => entry.book_out_status_display || BOOK_OUT_STATUS_LABELS[entry.book_out_status] || entry.book_out_status
      ),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const from = parseDateBoundary(filters.from);
    const to = parseDateBoundary(filters.to, true);

    return entries.filter((entry) => {
      if (filters.guardroom && String(entry.guardroom) !== String(filters.guardroom)) return false;
      if (filters.reason && String(entry.reason) !== String(filters.reason)) return false;
      if (filters.bookOutStatus && String(entry.book_out_status) !== String(filters.bookOutStatus)) return false;

      if (from || to) {
        const bookedIn = entry.booked_in_at ? new Date(entry.booked_in_at) : null;
        if (!bookedIn || Number.isNaN(bookedIn.getTime())) return false;
        if (from && bookedIn < from) return false;
        if (to && bookedIn > to) return false;
      }

      if (!search) return true;
      const haystack = [
        statusOffender(entry),
        entry.accused_service_number,
        entry.case_number,
        entry.guardroom_name,
        entry.guardroom_location,
        entry.requested_by_name,
        statusAssignment(entry),
        statusCompany(entry),
        entry.reason_display,
        entry.book_out_status_display,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [entries, filters]);

  const clearFilters = () => {
    setFilters({
      search: "",
      guardroom: "",
      reason: "",
      bookOutStatus: "",
      from: "",
      to: "",
    });
  };

  const exportStatusCsv = () => {
    const rows = buildStatusRows(filteredEntries, timeInSeconds);
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
    ].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `guardroom-status-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printStatusReport = () => {
    const rows = buildStatusRows(filteredEntries, timeInSeconds);
    const headers = rows[0] ? Object.keys(rows[0]) : Object.keys(buildStatusRows([{}], () => 0)[0]);
    const guardroomFilter = filters.guardroom
      ? guardroomOptions.find(([value]) => value === String(filters.guardroom))?.[1]
      : "";
    const summary = [
      filterLabel ? `Register filter: ${filterLabel}` : "",
      filters.search ? `Search: ${filters.search}` : "",
      guardroomFilter ? `Guardroom: ${guardroomFilter}` : "",
      filters.reason ? `Reason: ${reasonOptions.find(([value]) => value === String(filters.reason))?.[1] || filters.reason}` : "",
      filters.bookOutStatus
        ? `Book-out: ${bookOutOptions.find(([value]) => value === String(filters.bookOutStatus))?.[1] || filters.bookOutStatus}`
        : "",
      filters.from ? `From: ${filters.from}` : "",
      filters.to ? `To: ${filters.to}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    const printableRows =
      rows.length > 0
        ? rows
            .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`)
            .join("")
        : `<tr><td colspan="${headers.length}">No guardroom status records matched the filters.</td></tr>`;
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Guardroom Status Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
            h1 { font-size: 20px; margin: 0 0 6px; }
            p { margin: 0 0 16px; color: #4b5563; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; text-transform: uppercase; font-size: 10px; }
          </style>
        </head>
        <body>
          <h1>Guardroom Status Report</h1>
          <p>${escapeHtml(summary || "All active booked-in offenders")} | Printed ${escapeHtml(formatDate(new Date()))}</p>
          <table>
            <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
            <tbody>${printableRows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <section className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Guardroom Status</h3>
        {filterLabel && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>Showing {filterLabel}</span>
            <button
              type="button"
              onClick={onClearFilter}
              className="rounded border border-gray-600 px-2 py-1 text-gray-200 hover:bg-gray-700"
            >
              Show All
            </button>
          </div>
        )}
      </div>
      <div className="border-b border-gray-700 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <Field label="Search" className="md:col-span-2">
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search offender, case, guardroom..."
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Guardroom">
            <select
              value={filters.guardroom}
              onChange={(e) => setFilters({ ...filters, guardroom: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">All guardrooms</option>
              {guardroomOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Reason">
            <select
              value={filters.reason}
              onChange={(e) => setFilters({ ...filters, reason: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">All reasons</option>
              {reasonOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Book-out">
            <select
              value={filters.bookOutStatus}
              onChange={(e) => setFilters({ ...filters, bookOutStatus: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">All states</option>
              {bookOutOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="From Date">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="To Date">
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {filteredEntries.length} of {entries.length} booked-in offenders</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded border border-gray-600 px-3 py-1.5 text-gray-200 hover:bg-gray-700"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={exportStatusCsv}
              disabled={filteredEntries.length === 0}
              className="rounded bg-green-700 px-3 py-1.5 font-semibold text-white hover:bg-green-600 disabled:opacity-60"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={printStatusReport}
              disabled={filteredEntries.length === 0}
              className="rounded bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              Print
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Offender</th>
              <th className="text-left px-4 py-3">Case</th>
              <th className="text-left px-4 py-3">Guardroom</th>
              <th className="text-left px-4 py-3">Requested By</th>
              <th className="text-left px-4 py-3">Assignment</th>
              <th className="text-left px-4 py-3">Coy</th>
              <th className="text-left px-4 py-3">Booked In</th>
              <th className="text-left px-4 py-3">Time In</th>
              {showActions && <th className="text-left px-4 py-3">Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnCount} className="px-4 py-8 text-center text-gray-500">Loading guardroom status...</td></tr>
            ) : filteredEntries.length === 0 ? (
              <tr><td colSpan={columnCount} className="px-4 py-8 text-center text-gray-500">No booked-in offenders match the filters.</td></tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-700/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-100">{statusOffender(entry)}</p>
                    <p className="text-xs text-gray-500">{entry.accused_service_number || "--"}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{entry.case_number || "--"}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-100">{entry.guardroom_name || "--"}</p>
                    <p className="text-xs text-gray-500">{entry.guardroom_location || ""}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{entry.requested_by_name || "--"}</td>
                  <td className="px-4 py-3 text-gray-400">{statusAssignment(entry)}</td>
                  <td className="px-4 py-3 text-gray-400">{statusCompany(entry)}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-300">{formatDate(entry.booked_in_at)}</p>
                    <p className="text-xs text-gray-500">{entry.booked_in_by_name ? `By ${entry.booked_in_by_name}` : ""}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-100">{formatDurationSeconds(timeInSeconds(entry))}</td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <GuardroomStatusAction
                        entry={entry}
                        busy={busyId === entry.id}
                        onRequestBookOut={() => onRequestBookOut(entry.id)}
                        onFree={() => onFree(entry)}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GuardroomStatusAction({ entry, busy, onRequestBookOut, onFree }) {
  if (entry.book_out_status === "pending") {
    return (
      <span className="inline-flex px-3 py-1.5 rounded bg-yellow-500/20 text-yellow-700 text-xs font-semibold">
        Awaiting Adj
      </span>
    );
  }
  if (entry.book_out_status === "approved") {
    return (
      <button
        type="button"
        onClick={onFree}
        disabled={busy}
        className="px-3 py-1.5 text-xs rounded bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white font-semibold transition-colors"
      >
        {busy ? "Freeing..." : "Free"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onRequestBookOut}
      disabled={busy}
      className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition-colors"
    >
      {busy ? "Sending..." : "Book out"}
    </button>
  );
}

function RequestsPanel({ title, requests, loading, onBookIn, bookingId }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{title}</h3>
      {loading ? (
        <div className="text-sm text-gray-500">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 text-sm text-gray-500">No guardroom requests found.</div>
      ) : (
        requests.map((request) => (
          <RequestSummary
            key={request.id}
            request={request}
            onBookIn={onBookIn}
            booking={bookingId === request.id}
          />
        ))
      )}
    </section>
  );
}

function Field({ label, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function RequestSummary({ request, onBookIn, booking }) {
  const canBookIn = request.status === "approved" && !request.booked_in_at && onBookIn;
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-gray-100 font-medium">{request.case_number} - {request.guardroom_name}</p>
          <p className="text-gray-400 text-xs mt-1">
            {[request.accused_rank, request.accused_name, request.accused_service_number].filter(Boolean).join(" ") || "Accused not recorded"}
          </p>
          <p className="text-gray-500 text-xs mt-1">{request.reason_display} | Requested by {request.requested_by_name || "--"} | {formatDate(request.created_at)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[request.status] || "bg-gray-700 text-gray-300"}`}>
            {request.status_display || request.status}
          </span>
          {canBookIn && (
            <button
              type="button"
              onClick={() => onBookIn(request.id)}
              disabled={booking}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition-colors"
            >
              {booking ? "Booking..." : "Book-in"}
            </button>
          )}
          {request.booked_in_at && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
              Booked in
            </span>
          )}
          {request.book_out_status && request.book_out_status !== "not_requested" && (
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-700">
              Book-out {request.book_out_status_display || request.book_out_status}
            </span>
          )}
        </div>
      </div>
      {request.booked_in_at && <p className="text-blue-300 text-xs mt-3">Booked into {request.guardroom_name} on {formatDate(request.booked_in_at)}.</p>}
      {request.released_at && <p className="text-green-300 text-xs mt-3">Released on {formatDate(request.released_at)} with {request.release_letter_name || "release letter"}.</p>}
      {request.book_out_rejection_reason && <p className="text-red-300 text-xs mt-3">Book-out rejected: {request.book_out_rejection_reason}</p>}
      {request.book_out_comments && <p className="text-gray-400 text-xs mt-3">Book-out comments: {request.book_out_comments}</p>}
      {request.rejection_reason && <p className="text-red-300 text-xs mt-3">Rejected: {request.rejection_reason}</p>}
      {request.reviewer_comments && <p className="text-gray-400 text-xs mt-3">Comments: {request.reviewer_comments}</p>}
    </div>
  );
}

function BookOutReviewCard({ request, draft, busy, onDraft, onApprove }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <p className="text-white font-semibold">{request.case_number} - {request.accused_name || "Accused not recorded"}</p>
          <p className="text-sm text-gray-400 mt-1">Guardroom: {request.guardroom_name}</p>
          <p className="text-sm text-gray-400">Booked in: {formatDate(request.booked_in_at)}</p>
          <p className="text-xs text-gray-500 mt-1">Requested by {request.book_out_requested_by_name || "--"} on {formatDate(request.book_out_requested_at)}</p>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Approval comments</label>
          <textarea
            rows={3}
            value={draft.book_out_comments || ""}
            onChange={(e) => onDraft({ book_out_comments: e.target.value })}
            className={`${INPUT_CLASS} resize-none`}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onApprove}
          disabled={busy}
          className="px-4 py-2 text-sm rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white transition-colors"
        >
          {busy ? "Approving..." : "Approve Book-out"}
        </button>
      </div>
    </div>
  );
}

function ReleaseLetterModal({ request, file, saving, onFile, onClose, onSubmit }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-700 px-5 py-4">
          <h3 className="text-lg font-semibold text-white">Attach Release Letter</h3>
          <p className="mt-1 text-sm text-gray-400">{request.case_number} - {request.accused_name || "Accused not recorded"}</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-300">
            Guardroom: <span className="font-semibold text-gray-100">{request.guardroom_name}</span>
          </div>
          <Field label="Release Letter *">
            <input
              type="file"
              required
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
              className={INPUT_CLASS}
            />
          </Field>
          {file && <p className="text-xs text-gray-500">Selected: {file.name}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !file}
            className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-60"
          >
            {saving ? "Freeing..." : "Attach & Free"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RequestReviewCard({ request, draft, busy, onDraft, onApprove, onReject }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <p className="text-white font-semibold">{request.case_number} - {request.accused_name || "Accused not recorded"}</p>
          <p className="text-sm text-gray-400 mt-1">Guardroom: {request.guardroom_name}</p>
          <p className="text-sm text-gray-400">Reason: {request.reason_display}</p>
          <p className="text-xs text-gray-500 mt-1">Requested by {request.requested_by_name || "--"}</p>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Optional approval comments</label>
          <textarea
            rows={3}
            value={draft.comments || ""}
            onChange={(e) => onDraft({ comments: e.target.value })}
            className={`${INPUT_CLASS} resize-none`}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Reason for rejection *</label>
          <textarea
            rows={3}
            value={draft.rejection_reason || ""}
            onChange={(e) => onDraft({ rejection_reason: e.target.value })}
            className={`${INPUT_CLASS} resize-none`}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onReject}
          disabled={busy}
          className="px-4 py-2 text-sm rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white transition-colors"
        >
          Reject
        </button>
        <button
          onClick={onApprove}
          disabled={busy}
          className="px-4 py-2 text-sm rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white transition-colors"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
