import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { attachmentService, caseService, guardroomService, incidentService } from "../services/api";
import NotificationBell from "./NotificationBell";
import useAutoDismiss from "../hooks/useAutoDismiss";
import { openProtectedFile } from "../utils/protectedFiles";

// ── Helpers ──────────────────────────────────────────────────────────────────
function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function responseCount(response) {
  const value = Number(response?.data?.count);
  return Number.isFinite(value) ? value : toArray(response?.data).length;
}

function settledResponse(result) {
  return result.status === "fulfilled" ? result.value : null;
}

function scheduleAfterPaint(callback) {
  if (typeof window === "undefined") {
    callback();
    return undefined;
  }

  let timeoutId;
  const frameId = window.requestAnimationFrame(() => {
    timeoutId = window.setTimeout(callback, 0);
  });

  return () => {
    window.cancelAnimationFrame(frameId);
    if (timeoutId) window.clearTimeout(timeoutId);
  };
}

const PAGE_SIZE = 25;

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

const CLOSURE_BASIS_OPTIONS = [
  { value: "part_ii_orders", label: "Part II Orders" },
  { value: "cancellation_letter", label: "Cancellation Letter" },
  { value: "service_hqs_authority", label: "Authority From Service HQs" },
];

function closureDocumentLabel(value) {
  if (value === "part_ii_orders") return "Part II Orders PDF";
  if (value === "cancellation_letter") return "Cancellation Letter PDF";
  if (value === "service_hqs_authority") return "Authority From Service HQs PDF";
  return "Closure PDF";
}

function formatDateForDisplay(value) {
  if (!value) return "";
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return text;
}

function parseDisplayDateForApi(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return text;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, accent, loading, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`min-h-[82px] bg-gray-800 rounded-xl p-4 flex items-start gap-4 w-full text-left ${
        onClick ? "cursor-pointer hover:bg-gray-700 transition-colors" : ""
      }`}
    >
      <div className={`p-2.5 rounded-lg ${accent} shrink-0`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <div className="min-h-[30px] mt-0.5 flex items-center">
          {loading ? (
            <div className="h-7 w-12 bg-gray-700 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-white">{value ?? 0}</p>
          )}
        </div>
      </div>
    </Tag>
  );
}

function Badge({ label, style }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${style}`}>
      {label?.replace(/_/g, " ")}
    </span>
  );
}

function Footer() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(2);
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return (
    <footer className="mt-8 border-t border-gray-700/60 py-3 px-1 flex items-center justify-between text-[11px] text-gray-600 select-none">
      <span className="font-semibold tracking-widest uppercase text-gray-500">MPIMS</span>
      <span className="font-mono">
        {yy}{mm}{dd}&nbsp;&nbsp;{hh}{min}{ss}
      </span>
    </footer>
  );
}

function CloseCaseModal({ caseObj, onClose, onClosed }) {
  const [judgmentFiles, setJudgmentFiles] = useState([]);
  const [verdict, setVerdict] = useState(caseObj?.action_taken || "");
  const [closureBasis, setClosureBasis] = useState(caseObj?.closure_basis || "");
  const [closureFile, setClosureFile] = useState(null);
  const [partIiOrderSerialNo, setPartIiOrderSerialNo] = useState(caseObj?.part_ii_order_serial_no || "");
  const [partIiOrderDate, setPartIiOrderDate] = useState(formatDateForDisplay(caseObj?.part_ii_order_date || ""));
  const [rfiFile, setRfiFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const isDciCiv = caseObj?.criminal_offence_type === "dci_civ_police";
  const closureFileLabel = isDciCiv ? "Closure Files" : "Judgment Files";
  const isPartIiOrders = closureBasis === "part_ii_orders";
  const hasClosureFile = isPartIiOrders
    ? true
    : Boolean(closureBasis && closureFile);
  const hasPartIiDetails = !isPartIiOrders || (String(partIiOrderSerialNo).trim() && partIiOrderDate);
  const hasRfi = Boolean(rfiFile || caseObj?.rfi_document);
  const canClose = Boolean(
    closureBasis &&
    String(verdict).trim() &&
    hasClosureFile &&
    hasPartIiDetails &&
    judgmentFiles.length > 0 &&
    hasRfi
  );
  useAutoDismiss(err, setErr);

  const handleCloseCase = async () => {
    const partIiOrderDateApi = parseDisplayDateForApi(partIiOrderDate);
    if (!closureBasis) {
      setErr("Select what this case is being closed with.");
      return;
    }
    if (isPartIiOrders && !String(partIiOrderSerialNo).trim()) {
      setErr("Part II Order Serial No is required.");
      return;
    }
    if (isPartIiOrders && !partIiOrderDate) {
      setErr("Part II Order Date is required.");
      return;
    }
    if (isPartIiOrders && !/^\d{4}-\d{2}-\d{2}$/.test(partIiOrderDateApi)) {
      setErr("Use date format dd/mm/yyyy.");
      return;
    }
    if (!isPartIiOrders && !hasClosureFile) {
      setErr(`Attach the ${closureDocumentLabel(closureBasis)} before closing.`);
      return;
    }
    if (!judgmentFiles.length) {
      setErr(`Attach at least one ${closureFileLabel.toLowerCase()} PDF before closing.`);
      return;
    }
    if (!String(verdict).trim()) {
      setErr("Verdict is required before closing.");
      return;
    }
    if (!hasRfi) {
      setErr("Upload the RFI document before closing.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      setUploading(true);
      for (const file of judgmentFiles) {
        const fdUpload = new FormData();
        fdUpload.append("document_type", "judgment");
        fdUpload.append("label", `${isDciCiv ? "Closure" : "Judgment"} - ${file.name}`);
        fdUpload.append("file", file);
        await attachmentService.upload(caseObj.id, fdUpload);
      }
      setUploading(false);

      const fd = new FormData();
      fd.append("status", "closed");
      fd.append("closure_basis", closureBasis);
      fd.append("action_taken", verdict.trim());
      if (isPartIiOrders) {
        fd.append("part_ii_order_serial_no", partIiOrderSerialNo.trim());
        fd.append("part_ii_order_date", partIiOrderDateApi);
      } else if (closureFile) {
        fd.append("chargesheet", closureFile);
      }
      if (rfiFile) fd.append("rfi_document", rfiFile);
      await caseService.close(caseObj.id, fd);
      onClosed();
      onClose();
    } catch (ex) {
      setUploading(false);
      const data = ex?.response?.data;
      const validationMsg = data && typeof data === "object"
        ? Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join(" | ")
        : "";
      setErr(validationMsg || data?.detail || "Failed to close case.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Close Case</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">Case: <span className="font-mono text-blue-400">{caseObj.case_number}</span></p>
          <p className="text-sm text-gray-400">Accused: <span className="text-white">{caseObj.accused_name || "--"}</span></p>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Close With <span className="text-red-400">*</span></label>
            <select
              value={closureBasis}
              onChange={(e) => {
                setClosureBasis(e.target.value);
                setClosureFile(null);
                setErr("");
              }}
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">Select close document...</option>
              {CLOSURE_BASIS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {closureBasis && !isPartIiOrders && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">{closureDocumentLabel(closureBasis)} <span className="text-red-400">*</span></label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => { setClosureFile(e.target.files?.[0] || null); setErr(""); }}
                className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-1 file:text-xs file:text-white"
              />
              {closureFile && <p className="mt-2 text-xs text-gray-300">Selected: {closureFile.name}</p>}
            </div>
          )}
          {isPartIiOrders && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Part II Order Serial No <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={partIiOrderSerialNo}
                  onChange={(e) => { setPartIiOrderSerialNo(e.target.value); setErr(""); }}
                  placeholder="Enter serial number"
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-500 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Part II Order Date <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={partIiOrderDate}
                  onChange={(e) => { setPartIiOrderDate(e.target.value); setErr(""); }}
                  placeholder="dd/mm/yyyy"
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-500 placeholder-gray-500"
                />
              </div>
            </div>
          )}
          {closureBasis && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Verdict <span className="text-red-400">*</span></label>
              <textarea
                rows={3}
                value={verdict}
                onChange={(e) => { setVerdict(e.target.value); setErr(""); }}
                placeholder="Enter the final verdict"
                className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-500 placeholder-gray-500 resize-none"
              />
            </div>
          )}
          {!caseObj.rfi_document && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">RFI Document <span className="text-red-400">*</span></label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(e) => { setRfiFile(e.target.files?.[0] || null); setErr(""); }}
                className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-1 file:text-xs file:text-white"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">{closureFileLabel} <span className="text-red-400">*</span></label>
            <label className="cursor-pointer block">
              <div className={`bg-gray-700 border border-dashed rounded-lg px-3 py-2.5 text-sm text-center transition-colors ${judgmentFiles.length > 0 ? "border-green-500/60" : "border-gray-500 hover:border-blue-500"}`}>
                {judgmentFiles.length > 0 ? (
                  <span className="text-green-400 truncate block">{judgmentFiles.length} file(s) selected</span>
                ) : (
                  <span className="text-gray-500">Click to select PDF files...</span>
                )}
              </div>
              <input type="file" multiple accept=".pdf" className="sr-only" onChange={(e) => { setJudgmentFiles(Array.from(e.target.files || [])); setErr(""); }} />
            </label>
          </div>
          {!canClose && <p className="text-yellow-500 text-xs">Complete the required fields to enable closing.</p>}
          {uploading && <p className="text-cyan-400 text-xs">Uploading judgment files...</p>}
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
        <div className="px-5 pb-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
          <button onClick={handleCloseCase} disabled={saving || !canClose} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-green-700 hover:bg-green-600 disabled:opacity-50 transition-colors">
            {saving ? "Closing..." : "Close Case"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaginationBar({ page, totalPages, totalCount, onChange }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalCount);

  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1 text-xs text-gray-500">
      <span>Showing {start}–{end} of {totalCount} cases</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="px-1">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-7 h-7 rounded transition-colors ${
                p === page
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-400"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── HQDashboard ───────────────────────────────────────────────────────────────
export default function HQDashboard({ user }) {
  const navigate = useNavigate();
  const isCorpsCommander = user?.role === "corps_cmd";

  const [cases, setCases]             = useState([]);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [loadingCases, setLoadingCases]   = useState(true);
  const [page, setPage]               = useState(1);
  const [totalCount, setTotalCount]   = useState(0);
  const [statusCounts, setStatusCounts] = useState({
    total: 0, new: 0, newOpen: 0, tasked: 0,
    under_investigation: 0, pending: 0, served: 0, closed: 0, referred: 0,
  });
  const [totalInc, setTotalInc] = useState(0);
  const [openInc, setOpenInc]   = useState(0);
  const [courtMartialCount, setCourtMartialCount] = useState(0);
  const [dciCivPoliceCount, setDciCivPoliceCount] = useState(0);
  const [totalGuardrooms, setTotalGuardrooms] = useState(0);
  const [activeFilter, setActiveFilter] = useState("all");
  const [expandedDesc, setExpandedDesc] = useState({});
  const [documentError, setDocumentError] = useState("");
  const [closingCase, setClosingCase] = useState(null);
  useAutoDismiss(documentError, setDocumentError);

  // ── fetch per-status counts (once, tiny requests) ──────────────────────────
  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const [
        allRes, newRes, openRes, taskedRes,
        uiRes, peRes, seRes, clRes, rfRes,
        incRes, incOpenRes, courtMartialRes, dciCivPoliceRes, guardroomRes,
      ] = (await Promise.allSettled([
        caseService.list({ page_size: 1 }),
        caseService.list({ page_size: 1, status: "new" }),
        caseService.list({ page_size: 1, status: "open" }),
        caseService.list({ page_size: 1, status: "tasked" }),
        caseService.list({ page_size: 1, status: "under_investigation" }),
        caseService.list({ page_size: 1, status: "pending" }),
        caseService.list({ page_size: 1, status: "served" }),
        caseService.list({ page_size: 1, status: "closed" }),
        caseService.list({ page_size: 1, status: "referred" }),
        incidentService.list({ page_size: 1 }),
        incidentService.list({ page_size: 1, status: "reported" }),
        caseService.list({ page_size: 1, criminal_offence_type: "court_martial" }),
        caseService.list({ page_size: 1, criminal_offence_type: "dci_civ_police" }),
        guardroomService.list(),
      ])).map(settledResponse);
      setStatusCounts({
        total:               responseCount(allRes),
        new:                 responseCount(newRes),
        newOpen:             responseCount(newRes) + responseCount(openRes),
        tasked:              responseCount(taskedRes),
        under_investigation: responseCount(uiRes),
        pending:             responseCount(peRes),
        served:              responseCount(seRes),
        closed:              responseCount(clRes),
        referred:            responseCount(rfRes),
      });
      setTotalInc(responseCount(incRes));
      setOpenInc(responseCount(incOpenRes));
      setCourtMartialCount(responseCount(courtMartialRes));
      setDciCivPoliceCount(responseCount(dciCivPoliceRes));
      setTotalGuardrooms(toArray(guardroomRes?.data).length);
    } catch (_) {}
    finally { setLoadingCounts(false); }
  }, []);

  // ── fetch paginated cases for the table ────────────────────────────────────
  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (activeFilter !== "all") params.status = activeFilter;
      const res = await caseService.list(params);
      setCases(toArray(res.data));
      setTotalCount(responseCount(res));
    } catch (_) {}
    finally { setLoadingCases(false); }
  }, [page, activeFilter]);

  useEffect(() => scheduleAfterPaint(loadCounts), [loadCounts]);
  useEffect(() => scheduleAfterPaint(loadCases), [loadCases]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = [user?.rank, user?.name?.split(" ")[0] || user?.service_number || "Officer"].filter(Boolean).join(" ");

  const handleProtectedDocumentOpen = async (url, label = "document") => {
    setDocumentError("");
    await openProtectedFile(url, { label, onError: setDocumentError });
  };

  const FILTERS = [
    { key: "all",                 label: "All",              style: "bg-gray-600 text-gray-200"   },
    { key: "new",                 label: "New",              style: "bg-gray-500/20 text-gray-300"},
    { key: "tasked",              label: "Tasked",           style: "bg-yellow-500/20 text-yellow-300"},
    { key: "under_investigation", label: "Under Invest.",    style: "bg-indigo-500/20 text-indigo-300"},
    { key: "pending",             label: "Pending",          style: "bg-orange-500/20 text-orange-300"},
    { key: "served",              label: "Unactioned",       style: "bg-purple-500/20 text-purple-300"},
    { key: "closed",              label: "Actioned",         style: "bg-green-500/20 text-green-300"},
  ];

  const handleFilter = (key) => { setActiveFilter(key); setPage(1); };
  const descLimit = 120;
  const isTaskedFilter = activeFilter === "tasked";
  const isServedFilter = activeFilter === "served";
  const isClosedFilter = activeFilter === "closed";
  const showCloseRequestActionColumn =
    !isTaskedFilter &&
    !isServedFilter &&
    !isClosedFilter &&
    cases.some((c) => c.criminal_offence_type === "dci_civ_police" && c.status === "under_investigation" && c.close_requested);
  const showActionColumn = isServedFilter || showCloseRequestActionColumn;
  const handleClosedCase = () => {
    loadCases();
    loadCounts();
  };

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {greeting}, {displayName}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {isCorpsCommander ? "Corps Command Overview" : "HQ Overview"} — All Battalions
          </p>
        </div>
        <NotificationBell />
      </div>

      {/* ── Row 1: Summary Cards ────────────────────────────────────── */}
      {documentError && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {documentError}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard
          loading={loadingCounts}
          label="Total Cases"
          value={statusCounts.total}
          accent="bg-blue-500/10"
          onClick={() => navigate("/dashboard/cases")}
          icon={
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="Court Martial"
          value={courtMartialCount}
          accent="bg-violet-500/10"
          onClick={() => navigate("/dashboard/court-martial")}
          icon={
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="DCI / Civ Police"
          value={dciCivPoliceCount}
          accent="bg-cyan-500/10"
          onClick={() => navigate("/dashboard/dci-civ-police")}
          icon={
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="Guardrooms"
          value={totalGuardrooms}
          accent="bg-gray-500/10"
          onClick={() => navigate("/dashboard/guardrooms")}
          icon={
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12l5-7 5 7v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7z" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="Total Incidents"
          value={totalInc}
          accent="bg-red-500/10"
          onClick={() => navigate("/dashboard/incidents")}
          icon={
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          }
        />
        <StatCard
          loading={loadingCounts}
          label="Active Incidents"
          value={openInc}
          accent="bg-orange-500/10"
          onClick={() => navigate("/dashboard/incidents")}
          icon={
            <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      {/* ── Row 2: Status Breakdown ─────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Case Status Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard loading={loadingCounts} label="New"               value={statusCounts.new}                 accent="bg-gray-500/10" onClick={() => navigate("/dashboard/cases?status=new")}
            icon={<svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 4h.01M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Tasked"            value={statusCounts.tasked}              accent="bg-yellow-500/10" onClick={() => navigate("/dashboard/cases?status=tasked")}
            icon={<svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Under Invest."     value={statusCounts.under_investigation} accent="bg-indigo-500/10" onClick={() => navigate("/dashboard/cases?status=under_investigation")}
            icon={<svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Pending"           value={statusCounts.pending}             accent="bg-orange-500/10" onClick={() => navigate("/dashboard/cases?status=pending")}
            icon={<svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Unactioned"        value={statusCounts.served}              accent="bg-purple-500/10" onClick={() => navigate("/dashboard/cases?status=served")}
            icon={<svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard loading={loadingCounts} label="Actioned"          value={statusCounts.closed}              accent="bg-green-500/10"  onClick={() => navigate("/dashboard/cases?status=closed")}
            icon={<svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
          />
        </div>
      </div>

      {/* ── Cases Table ─────────────────────────────────────────────── */}
      <div>
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeFilter === f.key
                  ? "ring-2 ring-white/30 " + f.style
                  : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="w-full sm:w-auto sm:ml-auto text-xs text-gray-500">
            {loadingCounts ? "…" : `${totalCount} total`}
          </span>
        </div>

        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {loadingCases ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="h-7 bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : cases.length === 0 ? (
            <p className="p-5 text-gray-500 text-sm">No cases found.</p>
          ) : (
            <div className="max-h-[58vh] overflow-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
              <table className="sticky-head w-full min-w-[1340px] text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Case #</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Service No</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Rank</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Accused</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Offence</th>
                  <th className="text-left px-3 md:px-5 py-3 font-medium">Description</th>
                  {isTaskedFilter ? (
                    <>
                      <th className="text-left px-3 md:px-5 py-3 font-medium">Tasking Letter</th>
                      <th className="text-left px-3 md:px-5 py-3 font-medium">Tasked Battalion/Company</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left px-3 md:px-5 py-3 font-medium">Status</th>
                      {isClosedFilter && <th className="text-left px-3 md:px-5 py-3 font-medium">Date Closed</th>}
                      {isClosedFilter && <th className="text-left px-3 md:px-5 py-3 font-medium">Verdict</th>}
                      {showActionColumn && <th className="text-left px-3 md:px-5 py-3 font-medium">Action</th>}
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-700/40 hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-3 md:px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {c.case_number || "--"}
                    </td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_service_number || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_rank || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_name || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-200 whitespace-nowrap">{c.offence_name || c.offence || "--"}</td>
                    <td className="px-3 md:px-5 py-3 text-gray-300 min-w-[260px] max-w-[420px]">
                      {(() => {
                        const desc = c.description || "--";
                        const expanded = !!expandedDesc[c.id];
                        const longDesc = desc.length > descLimit;
                        const shown = expanded || !longDesc ? desc : `${desc.slice(0, descLimit)}...`;
                        return (
                          <>
                            <p className="whitespace-pre-wrap break-words">{shown}</p>
                            {longDesc && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedDesc((prev) => ({ ...prev, [c.id]: !prev[c.id] }));
                                }}
                                className="mt-1 text-xs text-blue-400 hover:underline"
                              >
                                {expanded ? "Show less" : "Show more"}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    {isTaskedFilter ? (
                      <>
                        <td className="px-3 md:px-5 py-3">
                          {c.tasking_letter ? (
                            <button
                              type="button"
                              onClick={() => handleProtectedDocumentOpen(c.tasking_letter, "tasking letter")}
                              className="text-xs text-blue-400 hover:underline whitespace-nowrap"
                            >
                              View
                            </button>
                          ) : (
                            <span className="text-xs text-gray-500">--</span>
                          )}
                        </td>
                        <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">
                          {c.tasked_detachment_name
                            ? `${c.tasked_battalion_name || "--"} / ${c.tasked_detachment_name}`
                            : c.tasked_battalion_name || "--"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 md:px-5 py-3">
                          <Badge
                            label={c.status}
                            style={STATUS_STYLE[c.status] || "bg-gray-600 text-gray-300"}
                          />
                        </td>
                        {isClosedFilter && (
                          <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">
                            {c.closed_at
                              ? new Date(c.closed_at).toLocaleDateString("en-GB")
                              : c.updated_at
                              ? new Date(c.updated_at).toLocaleDateString("en-GB")
                              : "--"}
                          </td>
                        )}
                        {isClosedFilter && (
                          <td className="px-3 md:px-5 py-3 text-gray-300 min-w-[220px] max-w-[340px]">
                            <p className="line-clamp-3 whitespace-pre-wrap break-words">{c.action_taken || "--"}</p>
                          </td>
                        )}
                        {showActionColumn && (
                          <td className="px-3 md:px-5 py-3">
                            {isServedFilter || (c.criminal_offence_type === "dci_civ_police" && c.status === "under_investigation" && c.close_requested) ? (
                              <button
                                onClick={() => setClosingCase(c)}
                                className="text-[10px] px-2.5 py-1 rounded bg-green-800/80 hover:bg-green-700 text-white transition-colors whitespace-nowrap"
                              >
                                Close Case
                              </button>
                            ) : (
                              <span className="text-xs text-gray-500">--</span>
                            )}
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onChange={setPage}
        />
      </div>

      <Footer />

      {closingCase && (
        <CloseCaseModal
          caseObj={closingCase}
          onClose={() => setClosingCase(null)}
          onClosed={handleClosedCase}
        />
      )}
    </div>
  );
}
