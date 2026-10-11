import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clearanceService } from "../services/api";

const UNIT_REQUEST_ROLES = ["co", "adj", "2ic", "commandant", "ci", "si", "docus_clerk"];

function errorMessage(error) {
  if (error?.response?.status === 500) {
    return "The server could not process this clearance request. Please try again or contact the administrator.";
  }
  const data = error?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (data && typeof data === "object") {
    const firstError = Object.values(data).flat()[0];
    if (typeof firstError === "string") return firstError;
  }
  return "The clearance request could not be completed. Please try again.";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function Clearance({ user }) {
  const isHqsAdmin = Boolean(
    user?.is_superuser ||
    (user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() === "hqs")
  );
  const canSubmitRequest = Boolean(
    (user?.unit || user?.unit_id) &&
    UNIT_REQUEST_ROLES.includes(user?.role)
  );
  const [requests, setRequests] = useState([]);
  const [serviceNumber, setServiceNumber] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [caseBlock, setCaseBlock] = useState(null);
  const caseBlockCloseRef = useRef(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await clearanceService.list();
      setRequests(Array.isArray(response.data) ? response.data : []);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    if (!caseBlock) return undefined;
    caseBlockCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setCaseBlock(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [caseBlock]);

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === "pending").length,
    [requests]
  );

  async function submitRequest(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    setCaseBlock(null);
    try {
      const response = await clearanceService.request(serviceNumber.trim());
      setRequests((current) => [response.data, ...current]);
      setServiceNumber("");
      setNotice("Clearance request submitted for Admin HQ approval.");
    } catch (requestError) {
      const data = requestError?.response?.data;
      if (Array.isArray(data?.ongoing_cases) && data.ongoing_cases.length) {
        setCaseBlock(data.ongoing_cases);
      } else {
        setError(errorMessage(requestError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function reviewRequest(item, decision) {
    setBusyRequestId(item.id);
    setError("");
    setNotice("");
    setCaseBlock(null);
    try {
      const response = decision === "approve"
        ? await clearanceService.approve(item.id)
        : await clearanceService.reject(item.id, rejectionNotes[item.id] || "");
      setRequests((current) => current.map((request) =>
        request.id === item.id ? { ...request, ...response.data } : request
      ));
      setRejectionNotes((current) => ({ ...current, [item.id]: "" }));
      setNotice(decision === "approve"
        ? "Request approved. The certificate is ready to download."
        : "Clearance request rejected.");
    } catch (reviewError) {
      const data = reviewError?.response?.data;
      if (Array.isArray(data?.ongoing_cases) && data.ongoing_cases.length) {
        setCaseBlock(data.ongoing_cases);
      } else {
        setError(errorMessage(reviewError));
      }
      if (reviewError?.response?.status === 409) loadRequests();
    } finally {
      setBusyRequestId(null);
    }
  }

  async function downloadCertificate(item) {
    setError("");
    try {
      const response = await clearanceService.certificate(item.id);
      const fileUrl = URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `${item.certificate_number || "clearance-certificate"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(fileUrl);
    } catch (downloadError) {
      setError(errorMessage(downloadError));
    }
  }

  async function previewCertificate(item) {
    setError("");
    try {
      const response = await clearanceService.previewCertificate(item.id);
      const url = URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      setPreview({ url, item });
    } catch (previewError) {
      setError(errorMessage(previewError));
      if (previewError?.response?.status === 410) loadRequests();
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 p-4 text-slate-100 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            MPIMS Personnel Services
          </p>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">Clearance Certificates</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Approved certificates are valid for six months unless a new MPIMS case is
            recorded for the personnel. Preview the certificate before downloading it.
          </p>
        </div>
        <Link
          to="/dashboard/case-clearance-documents"
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          Case closure documents
        </Link>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/50 bg-red-950/50 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-emerald-500/50 bg-emerald-950/40 p-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}
      {caseBlock && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[3px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCaseBlock(null);
          }}
        >
          <section
            aria-labelledby="clearance-block-title"
            aria-modal="true"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.45)]"
            role="alertdialog"
          >
            <div className="flex items-start gap-4 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-6 py-6 sm:px-7">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 shadow-sm shadow-amber-900/5">
                <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3m0 4h.01M10.3 3.86 1.82 18.14A2 2 0 0 0 3.54 21h16.92a2 2 0 0 0 1.72-2.86L13.7 3.86a2 2 0 0 0-3.4 0Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Personnel services <span className="px-1 text-slate-300">/</span> Clearance review
                </p>
                <h2 id="clearance-block-title" className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                  Clearance certificate cannot be issued
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  We regret that a certificate is unavailable while this personnel member has
                  ongoing MPIMS cases. The listed cases must be cleared by the Military Police
                  Corps (MPC) before a certificate can be issued.
                </p>
              </div>
              <button
                ref={caseBlockCloseRef}
                type="button"
                onClick={() => setCaseBlock(null)}
                aria-label="Close clearance notice"
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-6 py-5 sm:px-7 sm:py-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Ongoing MPIMS cases</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {caseBlock.length} {caseBlock.length === 1 ? "case requires" : "cases require"} attention
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600">
                  {caseBlock.length} {caseBlock.length === 1 ? "record" : "records"}
                </span>
              </div>
              <div className="space-y-3">
                {caseBlock.map((caseItem) => (
                  <article
                    key={`${caseItem.case_number}-${caseItem.status}`}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.03] transition-colors hover:border-slate-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Case reference
                        </p>
                        <p className="mt-1 font-semibold tracking-wide text-slate-900">
                          {caseItem.case_number}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                        {caseItem.status_label || caseItem.status}
                      </span>
                    </div>
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Investigating formation
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-700">
                        {caseItem.investigating_unit || "Not recorded in MPIMS"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:px-7">
              <p className="max-w-md text-xs leading-5 text-slate-500">
                For assistance, contact the investigating formation or follow the appropriate MPC process.
              </p>
              <button
                type="button"
                onClick={() => setCaseBlock(null)}
                className="min-w-28 rounded-lg border border-blue-800 bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                style={{ color: "#ffffff" }}
              >
                Close notice
              </button>
            </div>
          </section>
        </div>
      )}

      {canSubmitRequest && (
        <form onSubmit={submitRequest} className="rounded-xl border border-slate-700 bg-slate-800/70 p-5 shadow-lg">
          <h2 className="text-lg font-semibold">Request a unit member’s certificate</h2>
          <p className="mt-1 text-sm text-slate-300">
            Enter a service number for personnel assigned to your unit. MPIMS blocks a
            request if an ongoing case is recorded.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label className="flex-1">
              <span className="mb-1 block text-sm font-medium text-slate-200">Service number</span>
              <input
                value={serviceNumber}
                onChange={(event) => setServiceNumber(event.target.value)}
                autoComplete="off"
                required
                placeholder="Enter service number"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/40"
              />
            </label>
            <button
              type="submit"
              disabled={submitting || !serviceNumber.trim()}
              className="self-end rounded-lg bg-amber-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Check eligibility & request"}
            </button>
          </div>
        </form>
      )}

      {isHqsAdmin && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Admin HQ review queue</h2>
              <p className="mt-1 text-sm text-slate-300">
                {pendingCount} request{pendingCount === 1 ? "" : "s"} awaiting review.
              </p>
            </div>
            <button
              type="button"
              onClick={loadRequests}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/60">
        <div className="border-b border-slate-700 px-5 py-4">
          <h2 className="font-semibold">
            {isHqsAdmin ? "Clearance requests" : "Unit clearance history"}
          </h2>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-slate-300">Loading clearance requests…</p>
        ) : requests.length === 0 ? (
          <p className="p-5 text-sm text-slate-300">
            {isHqsAdmin
              ? "There are no clearance requests yet."
              : "There are no clearance requests for your unit yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="px-4 py-3">Personnel</th>
                  {(isHqsAdmin || canSubmitRequest) && <th className="px-4 py-3">Requested by</th>}
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Status / eligibility</th>
                  {isHqsAdmin && <th className="px-4 py-3">Decision</th>}
                  <th className="px-4 py-3">Certificate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {requests.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="font-semibold">{item.subject_rank} {item.subject_name}</div>
                      <div className="mt-1 text-xs text-slate-300">
                        {item.subject_service_number} · {item.subject_unit || "Unit not recorded"}
                      </div>
                    </td>
                    {(isHqsAdmin || canSubmitRequest) && (
                      <td className="px-4 py-4">
                        <div>{item.requester_name}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.requester_service_number}</div>
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-4 text-slate-300">
                      {formatDate(item.requested_at)}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.status === "approved"
                          ? "bg-emerald-400/15 text-emerald-300"
                          : item.status === "rejected"
                          ? "bg-red-400/15 text-red-300"
                          : "bg-amber-400/15 text-amber-200"
                      }`}>
                        {item.status_label}
                      </span>
                      {isHqsAdmin && item.status === "pending" && (
                        <div className={`mt-2 text-xs ${
                          item.ongoing_case_count ? "text-red-300" : "text-emerald-300"
                        }`}>
                          {item.ongoing_case_count
                            ? `${item.ongoing_case_count} ongoing MPIMS case(s); not eligible`
                            : "No ongoing MPIMS cases found"}
                        </div>
                      )}
                      {isHqsAdmin && item.status === "pending" && item.ongoing_cases?.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-red-200">
                          {item.ongoing_cases.map((caseItem) => (
                            <li key={`${item.id}-${caseItem.case_number}`}>
                              {caseItem.case_number} — {caseItem.status_label || caseItem.status}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.decision_note && (
                        <p className="mt-2 max-w-xs text-xs text-slate-300">{item.decision_note}</p>
                      )}
                      {item.status === "approved" && (
                        <p className="mt-2 text-xs text-slate-300">
                          {item.validity_status === "valid"
                            ? `Valid until ${formatDate(item.expires_at)}`
                            : item.validity_status === "invalidated"
                            ? `Invalidated ${formatDate(item.invalidated_at)}`
                            : "Certificate validity has expired"}
                        </p>
                      )}
                    </td>
                    {isHqsAdmin && (
                      <td className="min-w-56 px-4 py-4">
                        {item.status === "pending" ? (
                          <div className="space-y-2">
                            <button
                              type="button"
                              disabled={busyRequestId === item.id || item.ongoing_case_count > 0}
                              onClick={() => reviewRequest(item, "approve")}
                              className="w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Approve & generate
                            </button>
                            <textarea
                              aria-label={`Rejection reason for ${item.subject_name}`}
                              value={rejectionNotes[item.id] || ""}
                              onChange={(event) => setRejectionNotes((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))}
                              rows={2}
                              placeholder="Reason required to reject"
                              className="w-full rounded-md border border-slate-600 bg-slate-950 p-2 text-xs text-white"
                            />
                            <button
                              type="button"
                              disabled={busyRequestId === item.id || !rejectionNotes[item.id]?.trim()}
                              onClick={() => reviewRequest(item, "reject")}
                              className="w-full rounded-md border border-red-500/60 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reject request
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {item.reviewed_by_name ? `Reviewed by ${item.reviewed_by_name}` : "Reviewed"}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-4">
                      {item.status === "approved" && item.validity_status === "valid" ? (
                        <div className="flex flex-col items-start gap-2">
                          <button
                            type="button"
                            onClick={() => previewCertificate(item)}
                            className="whitespace-nowrap rounded-md border border-sky-400/60 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-950/50"
                          >
                            Preview certificate
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadCertificate(item)}
                            className="whitespace-nowrap rounded-md border border-emerald-500/60 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-950/50"
                          >
                            Download PDF
                          </button>
                        </div>
                      ) : item.validity_status === "invalidated" ? (
                        <span className="text-xs font-semibold text-red-300">Invalidated</span>
                      ) : item.validity_status === "expired" ? (
                        <span className="text-xs text-slate-400">Expired</span>
                      ) : (
                        <span className="text-xs text-slate-500">Not issued</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clearance-preview-title"
        >
          <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-900 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
              <div>
                <h2 id="clearance-preview-title" className="font-semibold text-white">
                  Certificate preview
                </h2>
                <p className="text-xs text-slate-300">
                  {preview.item.certificate_number} · valid until {formatDate(preview.item.expires_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadCertificate(preview.item)}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              title="Clearance certificate PDF preview"
              src={preview.url}
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      )}
    </section>
  );
}
