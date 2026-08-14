import React, { useEffect, useState, useCallback } from "react";
import { guardroomService, detaineeRequestService, userService, formationService } from "../services/api";

// ─── Small helpers ────────────────────────────────────────────────────────────
function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function LiveDuration({ bookedInAt }) {
  const calcSecs = (from) =>
    from ? Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000)) : null;

  const [totalSecs, setTotalSecs] = useState(() => calcSecs(bookedInAt));

  useEffect(() => {
    if (!bookedInAt) return;
    const id = setInterval(() => setTotalSecs(calcSecs(bookedInAt)), 1000);
    return () => clearInterval(id);
  }, [bookedInAt]);

  if (totalSecs === null) return <span className="text-gray-500">—</span>;

  const p2 = (n) => String(n).padStart(2, "0");
  const days = Math.floor(totalSecs / 86400);
  const hrs  = Math.floor(totalSecs / 3600) % 24;
  const mins = Math.floor(totalSecs / 60)   % 60;
  const secs = totalSecs % 60;

  // Adaptive format — introduce a unit only once the next-lower unit overflows
  let display;
  if      (totalSecs < 60)    display = `${secs}s`;
  else if (totalSecs < 3600)  display = `${mins}:${p2(secs)}`;
  else if (totalSecs < 86400) display = `${hrs}:${p2(mins)}:${p2(secs)}`;
  else                        display = `${days}d ${p2(hrs)}:${p2(mins)}:${p2(secs)}`;

  // Colour escalates with detention length
  const [textCls, dotCls] =
    days  < 1 ? ["text-emerald-400", "bg-emerald-400"] :
    days  < 3 ? ["text-yellow-400",  "bg-yellow-400"]  :
    days  < 7 ? ["text-orange-400",  "bg-orange-400"]  :
                ["text-red-400",     "bg-red-500"];

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider ${textCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse ${dotCls}`} />
      {display}
    </span>
  );
}

const STATUS_BADGE = {
  pending: "bg-yellow-700/60 text-yellow-300",
  approved: "bg-blue-700/60 text-blue-300",
  rejected: "bg-red-800/60 text-red-300",
  booked_in: "bg-green-800/60 text-green-300",
  booked_out: "bg-gray-600 text-gray-300",
};

// ─── Book-In Modal (Committal Receipt 2) ──────────────────────────────────────
function BookInModal({ req, user, units, onClose, onDone }) {
  // Silent auto-fills for Guard Commander statement (not shown as inputs)
  const _now      = new Date();
  const gcDate    = req.guard_commander_date || _now.toISOString().split("T")[0];
  const gcTime    = req.guard_commander_time || (_now.getHours().toString().padStart(2, "0") + _now.getMinutes().toString().padStart(2, "0"));
  const gcLocation = req.location || req.guardroom_name || "";
  const [handedByName, setHandedByName] = useState(req.handed_by_name || "");
  const [handedByRank, setHandedByRank] = useState(req.handed_by_rank || "");

  // IC signature block — auto-filled from the logged-in IC's profile
  const [signedName, setSignedName]   = useState(user?.name || "");
  const [signedUnit, setSignedUnit]   = useState(user?.unit?.toString() || "");
  const [signedNo, setSignedNo]       = useState(user?.service_number || "");
  const [signedRank, setSignedRank]   = useState(user?.rank || "");
  const [bookInDate, setBookInDate]   = useState(_now.toISOString().split("T")[0]);

  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const [success, setSuccess] = useState(false);

  const inputCls = "w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-500 placeholder-gray-500";
  const labelCls = "block text-xs text-gray-400 mb-1";

  const handleSubmit = async () => {
    if (!signedName.trim())   { setErr("Signed name is required."); return; }
    if (!signedUnit.trim())   { setErr("Signed unit is required."); return; }
    if (!signedNo.trim())     { setErr("Signed service number is required."); return; }
    if (!signedRank.trim())   { setErr("Signed rank is required."); return; }
    if (!bookInDate)          { setErr("Book-in date is required."); return; }

    setSaving(true);
    setErr("");
    try {
      await detaineeRequestService.bookIn(req.id, {
        gc_date: gcDate,
        gc_time: gcTime.trim(),
        gc_location: gcLocation.trim(),
        handed_by_name: handedByName.trim(),
        handed_by_rank: handedByRank.trim(),
        book_in_signed_name: signedName.trim(),
        book_in_signed_unit: signedUnit.trim(),
        book_in_signed_no: signedNo.trim(),
        book_in_signed_rank: signedRank.trim(),
        book_in_date: bookInDate,
      });
      setSuccess(true);
      onDone();
    } catch (ex) {
      const d = ex?.response?.data;
      setErr(d?.detail || Object.values(d || {})[0]?.[0] || "Failed to book in.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && !success && onClose()}
    >
      <div className="bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between shrink-0">
          <div>
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">Military Police</p>
            <h3 className="text-white font-semibold">Committal Receipt</h3>
            <p className="text-gray-500 text-xs mt-0.5">MPC 6009</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {success ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-5 text-center space-y-2">
              <p className="text-green-400 font-semibold text-lg">Book In Successful</p>
              <p className="text-gray-400 text-sm">
                <span className="text-white font-medium">{req.accused_rank} {req.accused_name}</span> has been booked into the guardroom.
              </p>
            </div>
          ) : (
            <>
              {/* ── Accused / Detainee Details ─────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Accused / Detainee Details</p>
                <div className="bg-gray-700/40 border border-gray-600/40 rounded-lg p-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <p className="text-gray-500">No. <span className="text-white font-medium">{req.accused_no || "—"}</span></p>
                  <p className="text-gray-500">Rank <span className="text-white font-medium">{req.accused_rank || "—"}</span></p>
                  <p className="text-gray-500 col-span-2">Name <span className="text-white font-medium">{req.accused_name || "—"}</span></p>
                  <p className="text-gray-500 col-span-2">Unit <span className="text-white font-medium">{req.accused_unit || "—"}</span></p>
                </div>
              </div>

              {/* ── Guard Commander Statement (read-only banner) ──────── */}
              <div className="bg-gray-700/30 border border-gray-600/40 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Guard Commander Statement</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  "I was Guard Commander on <span className="text-white font-medium">{gcDate}</span> at{" "}
                  <span className="text-white font-medium">{gcTime}</span> hrs, when at{" "}
                  <span className="text-white font-medium">{gcLocation || "—"}</span>, the above-named was handed over to me to be detained by{" "}
                  <span className="text-white font-medium">{handedByName || "—"}</span> of the K.M.P."
                </p>
              </div>

              {/* ── Handed Over By ─────────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Handed Over By</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Name</label>
                    <input className={inputCls} value={handedByName} onChange={(e) => setHandedByName(e.target.value)} placeholder="Full name of handing officer" />
                  </div>
                  <div>
                    <label className={labelCls}>SVC No / Rank</label>
                    <input className={inputCls} value={handedByRank} onChange={(e) => setHandedByRank(e.target.value)} placeholder="e.g. SGT / 000055" />
                  </div>
                </div>
              </div>

              {/* ── IC Signature Block (auto-filled from IC profile) ─── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Signed — Guard Commander (IC)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Name <span className="text-red-400">*</span></label>
                    <input className={inputCls} value={signedName} onChange={(e) => setSignedName(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Unit <span className="text-red-400">*</span></label>
                    <select
                      className={inputCls}
                      value={signedUnit}
                      onChange={(e) => setSignedUnit(e.target.value)}
                    >
                      <option value="">-- Select Unit --</option>
                      {(units || []).map((u) => (
                        <option key={u.id} value={u.name}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>No. <span className="text-red-400">*</span></label>
                    <input className={inputCls} value={signedNo} onChange={(e) => setSignedNo(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Rank <span className="text-red-400">*</span></label>
                    <input className={inputCls} value={signedRank} onChange={(e) => setSignedRank(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Book In Date <span className="text-red-400">*</span></label>
                    <input type="date" className={inputCls} value={bookInDate} onChange={(e) => setBookInDate(e.target.value)} />
                  </div>
                </div>
              </div>

              {err && <p className="text-red-400 text-xs">{err}</p>}
            </>
          )}
        </div>

        <div className="px-5 pb-4 pt-2 border-t border-gray-700 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600">
            {success ? "Close" : "Cancel"}
          </button>
          {!success && (
            <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-green-700 hover:bg-green-600 disabled:opacity-50">
              {saving ? "Saving..." : "Save & Book In"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ req, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleReject = async () => {
    if (!reason.trim()) { setErr("A rejection reason is required."); return; }
    setSaving(true);
    try {
      await detaineeRequestService.reject(req.id, reason.trim());
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Failed to reject request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Reject Request</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">
            Case: <span className="font-mono text-blue-400">{req.case_number}</span> — {req.accused_rank} {req.accused_name}
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Reason for Rejection <span className="text-red-400">*</span></label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setErr(""); }}
              placeholder="State the reason for rejecting this request..."
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500 placeholder-gray-500 resize-none"
            />
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600">Cancel</button>
          <button onClick={handleReject} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-red-700 hover:bg-red-600 disabled:opacity-50">
            {saving ? "Rejecting..." : "Confirm Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Guardroom Add/Edit Modal ─────────────────────────────────────────────────
function GuardroomFormModal({ guardroom, onClose, onDone }) {
  const [form, setForm] = useState({
    name: guardroom?.name || "",
    capacity: guardroom?.capacity ?? "",
    location: guardroom?.location || "",
    phone_no: guardroom?.phone_no || "",
    is_active: guardroom?.is_active ?? true,
    ic: guardroom?.ic ?? "",
  });
  const [icUsers, setIcUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    userService.list({ role: "guardroom_ic" })
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        setIcUsers(rows);
      })
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("Guardroom name is required."); return; }
    setSaving(true);
    setErr("");
    try {
      const payload = {
        name: form.name.trim(),
        capacity: form.capacity !== "" ? Number(form.capacity) : 0,
        location: form.location.trim(),
        phone_no: form.phone_no.trim(),
        is_active: form.is_active,
        ic: form.ic || null,
      };
      if (guardroom?.id) {
        await guardroomService.update(guardroom.id, payload);
      } else {
        await guardroomService.create(payload);
      }
      onDone();
      onClose();
    } catch (ex) {
      const d = ex?.response?.data;
      setErr(d?.detail || Object.values(d || {})[0]?.[0] || "Failed to save guardroom.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-500";
  const labelCls = "block text-xs text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">{guardroom ? "Edit Guardroom" : "Add Guardroom"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className={labelCls}>Name <span className="text-red-400">*</span></label>
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. HQ Guardroom" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Capacity</label>
              <input type="number" min="0" className={inputCls} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Phone No</label>
              <input className={inputCls} value={form.phone_no} onChange={(e) => set("phone_no", e.target.value)} placeholder="e.g. 0722 000 000" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <input className={inputCls} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. DOD, Nairobi" />
          </div>
          <div>
            <label className={labelCls}>Guardroom IC</label>
            <select
              className={inputCls}
              value={form.ic}
              onChange={(e) => set("ic", e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— Select IC —</option>
              {icUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.rank ? `${u.rank} ` : ""}{u.name || u.service_number}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="rounded" />
            <label htmlFor="is_active" className="text-sm text-gray-400 cursor-pointer">Active</label>
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────
function RequestCard({ req, onApprove, onReject, onBookIn, onBookOut, approving }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white font-medium text-sm">{req.accused_rank} {req.accused_name}</p>
          <p className="text-gray-500 text-xs">SVC: {req.accused_no || "--"} · {req.accused_unit || "--"}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${STATUS_BADGE[req.status] || "bg-gray-600 text-gray-300"}`}>
          {req.status?.replace(/_/g, " ")}
        </span>
      </div>

      <div className="text-xs text-gray-400 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <p>Case: <span className="font-mono text-blue-400">{req.case_number}</span></p>
        <p>Guardroom: <span className="text-gray-300">{req.guardroom_name}</span></p>
        <p>By: <span className="text-gray-300">{req.requested_by_name}</span></p>
        <p>Date: <span className="text-gray-300">{req.guard_commander_date || "--"}</span></p>
        <p>Time: <span className="text-gray-300">{req.guard_commander_time || "--"} hrs</span></p>
        <p>At: <span className="text-gray-300">{req.location || "--"}</span></p>
        {req.accused_offence && (
          <p className="col-span-2">Offence: <span className="text-gray-300">{req.accused_offence}</span></p>
        )}
        <p>Handed by: <span className="text-gray-300">{req.handed_by_name} ({req.handed_by_rank})</span></p>
      </div>

      {req.status === "rejected" && req.rejection_reason && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-2 text-xs text-red-300">
          Rejection reason: {req.rejection_reason}
        </div>
      )}
      {req.status === "booked_in" && (
        <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-2 text-xs text-green-300 space-y-0.5">
          <p>Booked in: {req.booked_in_at ? new Date(req.booked_in_at).toLocaleString("en-GB") : "--"}</p>
          <p>Offence: {req.offence_description || "--"} at {req.offence_at || "--"}</p>
        </div>
      )}

      {/* Actions */}
      {req.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onApprove(req)}
            disabled={approving === req.id}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white bg-green-700 hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {approving === req.id ? "Approving..." : "Approve"}
          </button>
          <button
            onClick={() => onReject(req)}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white bg-red-800 hover:bg-red-700 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
      {req.status === "approved" && (
        <div className="pt-1">
          <div className="mb-2 text-xs text-blue-300 bg-blue-900/20 border border-blue-700/40 rounded-lg p-2">
            Awaiting physical presentation of accused. Click Book In when the accused is presented.
          </div>
          <button
            onClick={() => onBookIn(req)}
            className="w-full py-1.5 rounded-lg text-xs font-medium text-white bg-green-800 hover:bg-green-700 transition-colors"
          >
            Book In Accused
          </button>
        </div>
      )}
      {req.status === "booked_in" && (
        <button
          onClick={() => onBookOut(req)}
          className="w-full py-1.5 rounded-lg text-xs font-medium text-white bg-orange-700 hover:bg-orange-600 transition-colors"
        >
          Book Out
        </button>
      )}
    </div>
  );
}

// ─── Main Guardrooms Component ─────────────────────────────────────────────────
export default function Guardrooms({ user }) {
  const isSuperuser = Boolean(user?.is_superuser);
  const isHqsAdmin =
    !isSuperuser &&
    user?.role === "admin" &&
    String(user?.battalion_type || "").toLowerCase() === "hqs";
  const isIC = user?.role === "guardroom_ic";
  const isInvestigator = user?.role === "investigator";
  const canViewRequests = !isHqsAdmin;
  const canManage = isSuperuser || (!isHqsAdmin && ["admin", "mpc_hqs", "co", "detachment"].includes(user?.role));
  const defaultTab = isInvestigator || isIC || isHqsAdmin ? "overview" : "requests";

  const [guardrooms, setGuardrooms] = useState([]);
  const [myGuardroom, setMyGuardroom] = useState(null);
  const [requests, setRequests] = useState([]);
  const [units, setUnits] = useState([]);
  const [loadingGuardrooms, setLoadingGuardrooms] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [filterStatus, setFilterStatus] = useState("pending");

  const [bookInReq, setBookInReq] = useState(null);
  const [rejectReq, setRejectReq] = useState(null);
  const [guardroomForm, setGuardroomForm] = useState(null);
  const [approving, setApproving] = useState(null);

  const fetchGuardrooms = useCallback(() => {
    setLoadingGuardrooms(true);
    guardroomService.list()
      .then((res) => {
        const rows = toArray(res.data);
        setGuardrooms(rows);
      })
      .catch(() => {})
      .finally(() => setLoadingGuardrooms(false));
  }, []);

  // For IC users: explicitly fetch their assigned guardroom by ic filter
  const fetchMyGuardroom = useCallback(() => {
    if (!isIC || !user?.id) return;
    guardroomService.list({ ic: user.id })
      .then((res) => {
        const rows = toArray(res.data);
        setMyGuardroom(rows.length > 0 ? rows[0] : null);
      })
      .catch(() => {});
  }, [isIC, user?.id]);

  const fetchRequests = useCallback(() => {
    if (!canViewRequests) {
      setRequests([]);
      setLoadingRequests(false);
      return;
    }
    setLoadingRequests(true);
    detaineeRequestService.list()
      .then((res) => setRequests(toArray(res.data)))
      .catch(() => {})
      .finally(() => setLoadingRequests(false));
  }, [canViewRequests]);

  useEffect(() => { fetchGuardrooms(); }, [fetchGuardrooms]);
  useEffect(() => { fetchMyGuardroom(); }, [fetchMyGuardroom]);
  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => {
    formationService.units().then((res) => {
      const rows = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.results) ? res.data.results : [];
      setUnits(rows);
    }).catch(() => {});
  }, []);

  const handleApprove = async (req) => {
    setApproving(req.id);
    try {
      await detaineeRequestService.approve(req.id);
      fetchRequests();
    } catch (ex) {
      alert(ex?.response?.data?.detail || "Failed to approve.");
    } finally {
      setApproving(null);
    }
  };

  const handleBookOut = async (req) => {
    if (!window.confirm("Book out this detainee?")) return;
    try {
      await detaineeRequestService.bookOut(req.id, "");
      fetchRequests();
      fetchGuardrooms();
      fetchMyGuardroom();
    } catch (ex) {
      alert(ex?.response?.data?.detail || "Failed to book out.");
    }
  };

  const tabs = isIC
    ? [
        { key: "overview", label: "My Guardroom" },
        { key: "requests", label: "All Requests" },
      ]
    : [
        ...(canViewRequests ? [{ key: "requests", label: "Detainee Requests" }] : []),
        { key: "overview", label: "Guardroom Status" },
        ...(canManage ? [{ key: "manage", label: "Manage Guardrooms" }] : []),
      ];

  const filteredRequests = requests.filter((r) =>
    filterStatus === "all" ? true : r.status === filterStatus
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          {isIC ? (
            <>
              <h1 className="text-xl font-bold text-white">
                {myGuardroom ? myGuardroom.name : "Guardroom Dashboard"}
              </h1>
              <p className="text-gray-500 text-sm">
                {myGuardroom
                  ? `${myGuardroom.location ? myGuardroom.location + " \u00b7 " : ""}Capacity ${myGuardroom.capacity} \u00b7 ${myGuardroom.detainee_count} detained`
                  : "You are not yet assigned to a guardroom — contact an administrator"}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white">Guardrooms</h1>
              <p className="text-gray-500 text-sm">
                {isHqsAdmin ? "Guardroom status overview" : "Detainee management and placement requests"}
              </p>
            </>
          )}
        </div>
        {canManage && (
          <button
            onClick={() => setGuardroomForm({})}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            + Add Guardroom
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── REQUESTS TAB ── */}
      {canViewRequests && activeTab === "requests" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "pending", label: "Pending", color: "text-yellow-400" },
              { key: "approved", label: "Approved", color: "text-blue-400" },
              { key: "rejected", label: "Rejected", color: "text-red-400" },
              { key: "booked_in", label: "Booked In", color: "text-green-400" },
              { key: "booked_out", label: "Booked Out", color: "text-gray-400" },
              { key: "all", label: "All", color: "text-gray-300" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterStatus === f.key
                    ? "border-gray-500 bg-gray-700 " + f.color
                    : "border-gray-700 text-gray-500 hover:border-gray-600"
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-gray-600">
                  ({f.key === "all" ? requests.length : requests.filter((r) => r.status === f.key).length})
                </span>
              </button>
            ))}
          </div>

          {loadingRequests ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center italic">
              {isIC && !myGuardroom
                ? "You are not assigned to any guardroom. Contact an administrator to assign you as IC."
                : `No ${filterStatus !== "all" ? filterStatus.replace(/_/g, " ") : ""} requests found.`}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredRequests.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  onApprove={handleApprove}
                  onReject={(r) => setRejectReq(r)}
                  onBookIn={(r) => setBookInReq(r)}
                  onBookOut={handleBookOut}
                  approving={approving}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <>
          {/* IC-specific detainee-focused overview */}
          {isIC ? (
            <div className="space-y-6">
              {!myGuardroom ? (
                <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-6 text-center">
                  <p className="text-yellow-400 font-medium">You are not assigned to any guardroom.</p>
                  <p className="text-gray-500 text-sm mt-1">Contact an administrator to assign you as IC of a guardroom.</p>
                </div>
              ) : (
                <>
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Capacity</p>
                      <p className="text-blue-400 font-bold text-2xl mt-1">{myGuardroom.capacity}</p>
                    </div>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Detainees</p>
                      <p className="text-orange-400 font-bold text-2xl mt-1">{myGuardroom.detainee_count}</p>
                    </div>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Vacant Slots</p>
                      <p className={`font-bold text-2xl mt-1 ${myGuardroom.vacant_slots === 0 ? "text-red-400" : "text-green-400"}`}>
                        {myGuardroom.vacant_slots}
                      </p>
                    </div>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Pending Requests</p>
                      <p className="text-yellow-400 font-bold text-2xl mt-1">
                        {requests.filter((r) => r.status === "pending").length}
                      </p>
                    </div>
                  </div>

                  {/* Pending guardroom requests */}
                  {requests.filter((r) => r.status === "pending").length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-white font-semibold text-base flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                        Pending Requests
                        <span className="text-xs bg-yellow-700/50 text-yellow-300 px-2 py-0.5 rounded-full">
                          {requests.filter((r) => r.status === "pending").length}
                        </span>
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {requests.filter((r) => r.status === "pending").map((req) => (
                          <RequestCard
                            key={req.id} req={req}
                            onApprove={handleApprove}
                            onReject={(r) => setRejectReq(r)}
                            onBookIn={(r) => setBookInReq(r)}
                            onBookOut={handleBookOut}
                            approving={approving}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Approved — awaiting book-in */}
                  {requests.filter((r) => r.status === "approved").length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-white font-semibold text-base flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                        Approved — Awaiting Book In
                        <span className="text-xs bg-blue-700/50 text-blue-300 px-2 py-0.5 rounded-full">
                          {requests.filter((r) => r.status === "approved").length}
                        </span>
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {requests.filter((r) => r.status === "approved").map((req) => (
                          <RequestCard
                            key={req.id} req={req}
                            onApprove={handleApprove}
                            onReject={(r) => setRejectReq(r)}
                            onBookIn={(r) => setBookInReq(r)}
                            onBookOut={handleBookOut}
                            approving={approving}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Current detainees (booked in) — tabular view */}
                  <div className="space-y-3">
                    <h2 className="text-white font-semibold text-base flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                      Current Detainees
                      <span className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded-full">
                        {requests.filter((r) => r.status === "booked_in").length}
                      </span>
                    </h2>
                    {loadingRequests ? (
                      <div className="h-24 bg-gray-800 rounded-xl animate-pulse" />
                    ) : requests.filter((r) => r.status === "booked_in").length === 0 ? (
                      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm italic">
                        No detainees currently booked in.
                      </div>
                    ) : (
                      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto">
                        <table className="w-full text-sm min-w-[900px]">
                          <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase tracking-wider">
                            <tr>
                              <th className="text-left px-4 py-3">Svc No</th>
                              <th className="text-left px-4 py-3">Rank</th>
                              <th className="text-left px-4 py-3">Name</th>
                              <th className="text-left px-4 py-3">Unit</th>
                              <th className="text-left px-4 py-3">Offence</th>
                              <th className="text-left px-4 py-3">Case No</th>
                              <th className="text-left px-4 py-3">Investigating Unit</th>
                              <th className="text-center px-4 py-3">Days In</th>
                              <th className="text-left px-4 py-3">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {requests.filter((r) => r.status === "booked_in").map((req) => (
                              <tr key={req.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                                <td className="px-4 py-3 font-mono text-blue-400 text-xs whitespace-nowrap">{req.accused_no || "--"}</td>
                                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{req.accused_rank || "--"}</td>
                                <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{req.accused_name || "--"}</td>
                                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{req.accused_unit || "--"}</td>
                                <td className="px-4 py-3 text-gray-400 max-w-[180px] truncate" title={req.accused_offence || ""}>{req.accused_offence || "--"}</td>
                                <td className="px-4 py-3 font-mono text-blue-400 text-xs whitespace-nowrap">{req.case_number || "--"}</td>
                                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{req.requested_by_unit || "--"}</td>
                                <td className="px-4 py-3 text-center">
                                  <LiveDuration bookedInAt={req.booked_in_at} />
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => handleBookOut(req)}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-orange-700/60 hover:bg-orange-600 text-white transition-colors whitespace-nowrap"
                                  >
                                    Book Out
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Recently booked out */}
                  {requests.filter((r) => r.status === "booked_out").length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-white font-semibold text-base flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                        Recently Released
                        <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
                          {requests.filter((r) => r.status === "booked_out").length}
                        </span>
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {requests.filter((r) => r.status === "booked_out").map((req) => (
                          <RequestCard
                            key={req.id} req={req}
                            onApprove={handleApprove}
                            onReject={(r) => setRejectReq(r)}
                            onBookIn={(r) => setBookInReq(r)}
                            onBookOut={handleBookOut}
                            approving={approving}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Non-IC: existing guardroom status table */
            <div className="space-y-4">
              <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Guardroom</th>
                      <th className="text-left px-4 py-3">Location</th>
                      <th className="text-left px-4 py-3">IC</th>
                      <th className="text-center px-4 py-3">Capacity</th>
                      <th className="text-center px-4 py-3">Detainees</th>
                      <th className="text-center px-4 py-3">Vacant</th>
                      <th className="text-center px-4 py-3">Occupancy</th>
                      <th className="text-center px-4 py-3">Status</th>
                      {canManage && <th className="text-left px-4 py-3">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingGuardrooms ? (
                      <tr><td colSpan={canManage ? 9 : 8} className="px-4 py-10 text-center text-gray-500">Loading...</td></tr>
                    ) : guardrooms.length === 0 ? (
                      <tr><td colSpan={canManage ? 9 : 8} className="px-4 py-10 text-center text-gray-500 italic">No guardrooms configured.</td></tr>
                    ) : (
                      guardrooms.map((g) => {
                        const pct = g.capacity > 0 ? Math.round((g.detainee_count / g.capacity) * 100) : 0;
                        const barColor = pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-orange-500" : pct >= 50 ? "bg-yellow-500" : "bg-green-500";
                        return (
                          <tr key={g.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                            <td className="px-4 py-3 text-white font-medium">{g.name}</td>
                            <td className="px-4 py-3 text-gray-400">{g.location || "--"}</td>
                            <td className="px-4 py-3 text-gray-400">{g.ic_name || "--"}</td>
                            <td className="px-4 py-3 text-center text-blue-400 font-semibold">{g.capacity}</td>
                            <td className="px-4 py-3 text-center text-orange-400 font-semibold">{g.detainee_count}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`font-semibold ${g.vacant_slots === 0 ? "text-red-400" : "text-green-400"}`}>
                                {g.vacant_slots}
                              </span>
                            </td>
                            <td className="px-4 py-3 w-32">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                                  <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className="text-xs text-gray-400 w-9 text-right">{pct}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {!g.is_active ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-500">Inactive</span>
                              ) : g.vacant_slots === 0 ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-400">Full</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400">Available</span>
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => setGuardroomForm(g)}
                                  className="text-xs px-3 py-1 rounded-lg bg-indigo-700/60 hover:bg-indigo-600 text-white transition-colors"
                                >
                                  Edit
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── MANAGE TAB (Superuser) ── */}
      {activeTab === "manage" && canManage && (
        <div className="space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Location</th>
                  <th className="text-left px-4 py-3">Capacity</th>
                  <th className="text-left px-4 py-3">Detainees</th>
                  <th className="text-left px-4 py-3">Vacant</th>
                  <th className="text-left px-4 py-3">IC</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingGuardrooms ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Loading...</td></tr>
                ) : guardrooms.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 italic">No guardrooms yet. Add one above.</td></tr>
                ) : (
                  guardrooms.map((g) => (
                    <tr key={g.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{g.name}</td>
                      <td className="px-4 py-3 text-gray-400">{g.location || "--"}</td>
                      <td className="px-4 py-3 text-gray-300">{g.capacity}</td>
                      <td className="px-4 py-3 text-orange-400">{g.detainee_count}</td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${g.vacant_slots === 0 ? "text-red-400" : "text-green-400"}`}>{g.vacant_slots}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{g.ic_name || "--"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${g.is_active ? "bg-green-900/50 text-green-400" : "bg-gray-700 text-gray-500"}`}>
                          {g.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setGuardroomForm(g)}
                          className="text-xs px-3 py-1 rounded-lg bg-indigo-700/60 hover:bg-indigo-600 text-white transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {bookInReq && (
        <BookInModal
          req={bookInReq}
          user={user}
          units={units}
          onClose={() => setBookInReq(null)}
          onDone={() => { setBookInReq(null); fetchRequests(); fetchGuardrooms(); fetchMyGuardroom(); }}
        />
      )}
      {rejectReq && (
        <RejectModal
          req={rejectReq}
          onClose={() => setRejectReq(null)}
          onDone={() => { setRejectReq(null); fetchRequests(); }}
        />
      )}
      {guardroomForm !== null && (
        <GuardroomFormModal
          guardroom={guardroomForm?.id ? guardroomForm : null}
          onClose={() => setGuardroomForm(null)}
          onDone={() => { setGuardroomForm(null); fetchGuardrooms(); fetchMyGuardroom(); }}
        />
      )}
    </div>
  );
}
