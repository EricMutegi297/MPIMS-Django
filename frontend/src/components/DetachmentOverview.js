import React, { useEffect, useState, useCallback, useRef } from "react";
import { caseService, formationService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";
import AddAnotherModal from "./common/AddAnotherModal";
import { caseAccusedUnitLabel } from "../utils/caseTypes";

/* ─────────────────────── constants ────────────────────────────── */

const STATUS_STYLE = {
  new:                 "bg-gray-500/20   text-gray-300",
  open:                "bg-blue-500/20   text-blue-400",
  tasked:              "bg-yellow-500/20 text-yellow-400",
  under_investigation: "bg-indigo-500/20 text-indigo-400",
  pending:             "bg-orange-500/20 text-orange-400",
  served:              "bg-purple-500/20 text-purple-400",
  closed:              "bg-green-500/20  text-green-400",
  referred:            "bg-cyan-500/20   text-cyan-400",
};

const DRILLDOWN_STATUSES = [
  { value: "all",                 label: "All Statuses" },
  { value: "new",                 label: "New" },
  { value: "open",                label: "Open" },
  { value: "tasked",              label: "Tasked" },
  { value: "under_investigation", label: "Under Investigation" },
  { value: "pending",             label: "Pending" },
  { value: "served",              label: "Served" },
  { value: "closed",              label: "Closed" },
  { value: "referred",            label: "Referred" },
];
const COMPANY_OPTIONS = ["A", "B", "C", "D"];
const EMPTY_COMPANY = { company: "A", name: "", aor: "", mobile_no: "", email: "" };

/* ─────────────────────── small helpers ────────────────────────── */

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function companyLabel(det) {
  const company = det?.company ? `${det.company} Coy` : "Coy";
  return det?.name ? `${company} - ${det.name}` : company;
}

function battalionAllowsCompanies(battalion) {
  return String(battalion?.battalion_type || "normal").toLowerCase() === "normal";
}

function Badge({ label }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
        STATUS_STYLE[label] || "bg-gray-600 text-gray-300"
      }`}
    >
      {label?.replace(/_/g, " ")}
    </span>
  );
}

function SkeletonRow({ cols = 7 }) {
  return (
    <tr className="border-b border-gray-700/40">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3">
          <div className="h-4 bg-gray-700 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

/* ─────────────────────── Drilldown slide-in panel ─────────────── */

function DrilldownPanel({ drill, onClose }) {
  const [cases, setCases]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatus] = useState(drill.status);
  const [search, setSearch]       = useState("");
  const panelRef                  = useRef(null);

  /* fetch cases whenever company or status filter changes */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        [drill.isChild ? "tasked_detachment" : "tasked_company"]: drill.detId,
        page_size: 200,
      };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await caseService.list(params);
      setCases(toArray(res.data));
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [drill.detId, drill.isChild, statusFilter]);

  useEffect(() => { load(); }, [load]);

  /* close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* client-side search */
  const filtered = cases.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.case_number || "").toLowerCase().includes(q) ||
      (c.title || "").toLowerCase().includes(q) ||
      (c.accused_name || "").toLowerCase().includes(q) ||
      (c.accused_service_number || "").toLowerCase().includes(q) ||
      caseAccusedUnitLabel(c).toLowerCase().includes(q)
    );
  });

  /* print — opens formatted page in new window */
  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const statusLabel =
      DRILLDOWN_STATUSES.find((s) => s.value === statusFilter)?.label || statusFilter;

    const rows = filtered
      .map(
        (c) => `<tr>
          <td>${c.case_number || "--"}</td>
          <td>${c.title || c.offence || c.offence_name || "--"}</td>
          <td>${c.accused_name || "--"}</td>
          <td>${caseAccusedUnitLabel(c) || "--"}</td>
          <td>${(c.status || "").replace(/_/g, " ")}</td>
          <td>${c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB") : "--"}</td>
        </tr>`
      )
      .join("");

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Cases \u2013 ${drill.detName} (${statusLabel})</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}
    h2{margin:0 0 2px;font-size:16px}
    p{margin:0 0 12px;color:#555;font-size:11px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#f0f0f0;font-weight:600;font-size:11px;text-transform:uppercase}
    tr:nth-child(even) td{background:#fafafa}
  </style>
</head>
<body>
  <h2>Cases \u2014 ${drill.detName}</h2>
  <p>Filter: ${statusLabel} &nbsp;|&nbsp; ${filtered.length} case${filtered.length !== 1 ? "s" : ""}
     &nbsp;|&nbsp; Printed: ${new Date().toLocaleString("en-GB")}</p>
  <table>
    <thead>
      <tr><th>#</th><th>Title / Offence</th><th>Accused</th><th>Unit</th><th>Status</th><th>Date</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=function(){window.print();}</script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 left-56 z-50 flex justify-end">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* panel */}
      <div
        ref={panelRef}
        className="relative z-10 w-full bg-gray-900 shadow-2xl flex flex-col h-full overflow-hidden"
      >
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h3 className="text-base font-bold text-white">
              {drill.detName}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading
                ? "Loading cases…"
                : `${filtered.length} case${filtered.length !== 1 ? "s" : ""} shown`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              title="Print / Export to new window"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs transition-colors"
            >
              <PrintIcon className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-700/60 shrink-0 flex-wrap">
          {/* search */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <MagnifyIcon className="w-3.5 h-3.5 text-gray-500" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search case #, title, accused…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-8 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-300"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {DRILLDOWN_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* refresh */}
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* case table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <table className="w-full text-sm">
              <CaseTableHead />
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <SkeletonRow key={i} cols={6} />
                ))}
              </tbody>
            </table>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-gray-500">
              <MagnifyIcon className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No cases found.</p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-2 text-xs text-blue-400 hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <CaseTableHead />
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-5 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {c.case_number || "--"}
                    </td>
                    <td className="px-5 py-2.5 text-gray-200 max-w-[220px]">
                      <p className="truncate">{c.title || c.offence || c.offence_name || "--"}</p>
                    </td>
                    <td className="px-5 py-2.5 text-gray-300 whitespace-nowrap">
                      {c.accused_name || "--"}
                      {c.accused_rank && (
                        <span className="ml-1 text-[11px] text-gray-500">
                          ({c.accused_rank})
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-gray-300 min-w-[150px] max-w-[240px]">
                      <p className="line-clamp-2 break-words">{caseAccusedUnitLabel(c) || "--"}</p>
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge label={c.status} />
                    </td>
                    <td className="px-5 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {c.created_at
                        ? new Date(c.created_at).toLocaleDateString("en-GB")
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function CaseTableHead() {
  return (
    <thead className="sticky top-0 bg-gray-900 z-10">
      <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
        <th className="text-left px-5 py-3 font-medium">Case #</th>
        <th className="text-left px-5 py-3 font-medium">Title / Offence</th>
        <th className="text-left px-5 py-3 font-medium">Accused</th>
        <th className="text-left px-5 py-3 font-medium">Unit</th>
        <th className="text-left px-5 py-3 font-medium">Status</th>
        <th className="text-left px-5 py-3 font-medium">Date</th>
      </tr>
    </thead>
  );
}

/* ─────────────────────── main export ──────────────────────────── */

export default function DetachmentOverview({ user }) {
  const isSuperuser = Boolean(user?.is_superuser);
  const initialBattalion = String(user?.battalion ?? user?.battalion_id ?? "");
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState("");
  const [message, setMessage]                   = useState("");
  const [battalions, setBattalions]             = useState([]);
  const [selectedBattalion, setSelectedBattalion] = useState(initialBattalion);
  const [battalionLoading, setBattalionLoading] = useState(false);
  const [drill, setDrill]                       = useState(null); // { detId, detName, company, status }
  const [companyModal, setCompanyModal]         = useState(null);
  const [companySaving, setCompanySaving]       = useState(false);
  const [companyDeleteId, setCompanyDeleteId]   = useState(null);
  const [detachmentModal, setDetachmentModal]   = useState(null);
  const [detachmentSaving, setDetachmentSaving] = useState(false);
  const [detachmentDeleteId, setDetachmentDeleteId] = useState(null);
  const [detachmentRows, setDetachmentRows] = useState([]);
  const [detachmentSearch, setDetachmentSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [addAnotherPrompt, setAddAnotherPrompt] = useState(null);
  useAutoDismiss(message, setMessage);
  useAutoDismiss(error, setError);

  const selectedBattalionId = String(selectedBattalion || "");
  const selectedBattalionRecord = battalions.find((b) => String(b.id) === selectedBattalionId);
  const canManageCompanies = isSuperuser && selectedBattalionId && battalionAllowsCompanies(selectedBattalionRecord);
  const canManageDetachments = Boolean(
    selectedBattalionId
    && battalionAllowsCompanies(selectedBattalionRecord)
    && (
      isSuperuser
      || (
        user?.role === "admin"
        && String(user?.battalion ?? user?.battalion_id ?? "") === selectedBattalionId
      )
    )
  );

  const loadBattalionOptions = useCallback(async () => {
    setBattalionLoading(true);
    try {
      const res = await formationService.battalions({ page_size: 200 });
      const items = toArray(res.data);
      setBattalions(items);
      setSelectedBattalion((current) => {
        if (current) return current;
        const firstWithCompanies = items.find((b) => (b.detachments || []).length > 0);
        return String((firstWithCompanies || items[0])?.id ?? "");
      });
      return items;
    } catch {
      setError("Failed to load battalions.");
      return [];
    } finally {
      setBattalionLoading(false);
    }
  }, []);

  useEffect(() => { loadBattalionOptions(); }, [loadBattalionOptions]);

  const loadDetachments = useCallback(async () => {
    setLoading(true);
    if (!selectedBattalionId) {
      setDetachmentRows([]);
      setLoading(false);
      return;
    }
    try {
      const res = await formationService.subDetachments({
        "company__battalion": selectedBattalionId,
        page_size: 500,
      });
      setDetachmentRows(toArray(res.data));
    } catch {
      setError("Failed to load detachments.");
      setDetachmentRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedBattalionId]);

  useEffect(() => { loadDetachments(); }, [loadDetachments]);

  const openDrill = (det, status, isChild = false) =>
    setDrill({ detId: det.id, detName: companyLabel(det), company: det.company, status, isChild });

  const confirmAddAnother = () => {
    const nextAction = addAnotherPrompt?.onAddAnother;
    setAddAnotherPrompt(null);
    nextAction?.();
  };

  const finishAddAnother = () => {
    const nextAction = addAnotherPrompt?.onDone;
    setAddAnotherPrompt(null);
    nextAction?.();
  };

  const openCompanyModal = (detachment = null) => {
    if (!selectedBattalionId) return;
    const fullDetachment = detachment
      ? (selectedBattalionRecord?.detachments || []).find((d) => String(d.id) === String(detachment.id)) || detachment
      : null;
    setCompanyModal(fullDetachment ? {
      mode: "edit",
      id: fullDetachment.id,
      company: fullDetachment.company || "A",
      name: fullDetachment.name || "",
      aor: fullDetachment.aor || "",
      mobile_no: fullDetachment.mobile_no || "",
      email: fullDetachment.email || "",
    } : {
      mode: "add",
      ...EMPTY_COMPANY,
    });
  };

  const saveCompany = async (form) => {
    if (!selectedBattalionId) return;
    setCompanySaving(true);
    setError("");
    setMessage("");
    try {
      const { id, mode: formMode, ...values } = form;
      delete values.key;
      const payload = {
        ...values,
        battalion: Number(selectedBattalionId),
      };
      const adding = formMode !== "edit";
      if (formMode === "edit" && id) {
        await formationService.updateDetachment(id, payload);
        setMessage("Company updated.");
      } else {
        await formationService.createDetachment(payload);
        setMessage("Company created.");
      }
      await loadBattalionOptions();
      if (adding) {
        setCompanyModal(null);
        setAddAnotherPrompt({
          itemLabel: "Coy",
          message: "The Coy has been added to the selected battalion.",
          detail: selectedBattalionRecord?.name || "Selected Battalion",
          addLabel: "Add Another Coy",
          onAddAnother: () => setCompanyModal({
            mode: "add",
            ...EMPTY_COMPANY,
            key: Date.now(),
          }),
        });
      } else {
        setCompanyModal(null);
      }
    } catch (err) {
      const d = err.response?.data;
      setError(
        d?.battalion?.[0] ||
        d?.company?.[0] ||
        d?.name?.[0] ||
        d?.aor?.[0] ||
        d?.detail ||
        "Failed to create company."
      );
    } finally {
      setCompanySaving(false);
    }
  };

  const deleteCompany = async () => {
    setError("");
    setMessage("");
    try {
      await formationService.deleteDetachment(companyDeleteId);
      setCompanyDeleteId(null);
      setMessage("Company deleted.");
      await loadBattalionOptions();
    } catch {
      setError("Failed to delete company.");
    }
  };

  const openDetachmentModal = (company, detachment = null) => {
    setDetachmentModal(detachment ? {
      mode: "edit",
      id: detachment.id,
      company: company.id,
      companyName: `${company.company} Coy - ${company.name}`,
      name: detachment.name || "",
      aor: detachment.aor || "",
      mobile_no: detachment.mobile_no || "",
      email: detachment.email || "",
    } : {
      mode: "add",
      company: company.id,
      companyName: `${company.company} Coy - ${company.name}`,
      name: "",
      aor: "",
      mobile_no: "",
      email: "",
    });
  };

  const saveDetachment = async (form) => {
    setDetachmentSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        company: Number(form.company),
        name: form.name.trim(),
        aor: form.aor || "",
        mobile_no: form.mobile_no || "",
        email: form.email || "",
      };
      if (form.mode === "edit") {
        await formationService.updateDetachment(form.id, payload);
        setMessage("Detachment updated.");
      } else {
        await formationService.createDetachment(payload);
        setMessage("Detachment created.");
      }
      setDetachmentModal(null);
      await loadDetachments();
      await loadBattalionOptions();
    } catch (err) {
      const d = err.response?.data;
      setError(d?.company?.[0] || d?.name?.[0] || d?.detail || "Failed to save detachment.");
    } finally {
      setDetachmentSaving(false);
    }
  };

  const deleteDetachment = async () => {
    try {
      await formationService.deleteDetachment(detachmentDeleteId);
      setDetachmentDeleteId(null);
      setMessage("Detachment deleted.");
      await loadDetachments();
      await loadBattalionOptions();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete detachment.");
    }
  };

  const availableCompanies = selectedBattalionRecord?.companies || selectedBattalionRecord?.detachments || [];
  const visibleDetachments = detachmentRows.filter((detachment) => {
    const matchesCompany = !selectedCompany || String(detachment.company) === String(selectedCompany);
    const query = detachmentSearch.trim().toLowerCase();
    const text = [
      detachment.name,
      detachment.aor,
      detachment.company_name,
      detachment.company_code,
      detachment.battalion_name,
    ].filter(Boolean).join(" ").toLowerCase();
    return matchesCompany && (!query || text.includes(query));
  });

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Detachments Directory</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Browse detachments by Battalion and Company, then drill into their cases
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperuser && (
            <select
              value={selectedBattalion}
              onChange={(e) => {
                setSelectedBattalion(e.target.value);
                setDrill(null);
              }}
              disabled={battalionLoading}
              className="h-9 max-w-[220px] rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm text-gray-200 outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">{battalionLoading ? "Loading battalions..." : "Select battalion"}</option>
              {battalions.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {canManageDetachments && (
            <button
              type="button"
              onClick={() => {
                const company = availableCompanies.find((item) => String(item.id) === String(selectedCompany));
                if (company) openDetachmentModal(company);
              }}
              disabled={!selectedCompany}
              className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
              title="Select a company before adding a detachment"
            >
              + Add Detachment
            </button>
          )}
          {isSuperuser && (
            <button
              type="button"
              onClick={() => openCompanyModal()}
              disabled={!canManageCompanies}
              title={canManageCompanies ? "Add company to selected battalion" : "Select a normal battalion"}
              className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              + Add Coy
            </button>
          )}
          <button
            onClick={loadDetachments}
            disabled={loading || (isSuperuser && !selectedBattalionId)}
            className="p-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Detachment directory */}
      <div className="overflow-hidden rounded-xl bg-gray-800">
        <div className="border-b border-gray-700/60 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Available Detachments</h3>
            <p className="text-xs text-gray-500">{visibleDetachments.length} of {detachmentRows.length} detachments</p>
          </div>
          <div className="mt-4 grid w-full grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
            <input
              type="search"
              value={detachmentSearch}
              onChange={(event) => setDetachmentSearch(event.target.value)}
              placeholder="Search name, AOR, company..."
              className="h-10 min-w-0 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-sm text-white outline-none focus:border-blue-500"
            />
            <select
              value={selectedCompany}
              onChange={(event) => setSelectedCompany(event.target.value)}
              className="h-10 min-w-0 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-sm text-gray-200 outline-none focus:border-blue-500"
            >
              <option value="">All Companies</option>
              {availableCompanies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.company} Coy - {company.name}
                </option>
              ))}
            </select>
          </div>
        </div>
          {visibleDetachments.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              {detachmentRows.length ? "No detachments match the selected filters." : "No detachments available under this Battalion."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="w-[20%] px-3 py-3 sm:px-5">Detachment</th>
                    <th className="w-[25%] px-3 py-3 sm:px-5">Company</th>
                    <th className="w-[18%] px-3 py-3 sm:px-5">Battalion</th>
                    <th className="w-[17%] px-3 py-3 sm:px-5">AOR</th>
                    <th className="w-[10%] px-3 py-3 text-center sm:px-5">Cases</th>
                    <th className="w-[10%] px-3 py-3 text-right sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDetachments.map((detachment) => {
                    const company = availableCompanies.find((item) => String(item.id) === String(detachment.company)) || {
                      id: detachment.company,
                      company: detachment.company_code,
                      name: detachment.company_name,
                    };
                    return (
                      <tr key={detachment.id} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                        <td className="break-words px-3 py-3 font-medium text-white sm:px-5">{detachment.name}</td>
                        <td className="break-words px-3 py-3 text-gray-300 sm:px-5">{detachment.company_code} Coy - {detachment.company_name}</td>
                        <td className="break-words px-3 py-3 text-gray-400 sm:px-5">{detachment.battalion_name}</td>
                        <td className="break-words px-3 py-3 text-gray-400 sm:px-5">{detachment.aor || "--"}</td>
                        <td className="px-3 py-3 text-center sm:px-5">
                          <button type="button" onClick={() => openDrill({ ...detachment, name: detachment.name }, "all", true)} className="text-blue-400 hover:text-blue-300">
                            {detachment.case_count || 0}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right sm:px-5">
                          {canManageDetachments && (
                            <span className="inline-flex gap-3">
                              <button type="button" onClick={() => openDetachmentModal(company, detachment)} className="text-blue-400 hover:text-blue-300">Edit</button>
                              <button type="button" onClick={() => setDetachmentDeleteId(detachment.id)} className="text-red-400 hover:text-red-300">Delete</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-5 text-red-300 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-5 text-green-300 text-sm">
          {message}
        </div>
      )}

      {/* Drilldown panel */}
      {drill && (
        <DrilldownPanel drill={drill} onClose={() => setDrill(null)} />
      )}
      {companyModal && (
        <CompanyCreateModal
          key={companyModal.key || `${companyModal.mode || "add"}-${companyModal.id || "new"}`}
          mode={companyModal.mode || "add"}
          battalionName={selectedBattalionRecord?.name || "Selected Battalion"}
          initial={companyModal}
          saving={companySaving}
          onSave={saveCompany}
          onClose={() => setCompanyModal(null)}
        />
      )}
      {companyDeleteId && (
        <ConfirmDelete
          label="company"
          onConfirm={deleteCompany}
          onCancel={() => setCompanyDeleteId(null)}
        />
      )}
      {detachmentModal && (
        <DetachmentCreateModal
          key={`${detachmentModal.mode}-${detachmentModal.id || "new"}`}
          mode={detachmentModal.mode}
          companyName={detachmentModal.companyName}
          initial={detachmentModal}
          saving={detachmentSaving}
          onSave={saveDetachment}
          onClose={() => setDetachmentModal(null)}
        />
      )}
      {detachmentDeleteId && (
        <ConfirmDelete
          label="detachment"
          onConfirm={deleteDetachment}
          onCancel={() => setDetachmentDeleteId(null)}
        />
      )}
      {addAnotherPrompt && (
        <AddAnotherModal
          {...addAnotherPrompt}
          onAddAnother={confirmAddAnother}
          onDone={finishAddAnother}
        />
      )}
    </div>
  );
}

/* ─────────────────────── sub-components ───────────────────────── */

function CompanyCreateModal({ mode = "add", battalionName, initial, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h3 className="text-base font-semibold text-white">{mode === "add" ? "Add Coy" : "Edit Coy"}</h3>
          <button type="button" onClick={onClose} className="text-lg text-gray-400 hover:text-white">
            x
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3 px-6 py-4">
          <div>
            <label className="text-xs text-gray-400">Battalion</label>
            <div className="mt-1 rounded border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-200">
              {battalionName}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400">Coy *</label>
            <select
              value={form.company || "A"}
              onChange={s("company")}
              required
              className="mt-1 w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {COMPANY_OPTIONS.map((company) => (
                <option key={company} value={company}>{company} Coy</option>
              ))}
            </select>
          </div>
          <CompanyInput label="Company Name *" value={form.name || ""} onChange={s("name")} required />
          <CompanyInput label="AOR" value={form.aor || ""} onChange={s("aor")} />
          <CompanyInput label="Mobile No" value={form.mobile_no || ""} onChange={s("mobile_no")} />
          <CompanyInput label="Email" type="email" value={form.email || ""} onChange={s("email")} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button
              type="submit"
              disabled={saving || !form.company || !form.name?.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : mode === "add" ? "Create" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetachmentCreateModal({ mode = "add", companyName, initial, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h3 className="text-base font-semibold text-white">
            {mode === "add" ? "Add Detachment" : "Edit Detachment"}
          </h3>
          <button type="button" onClick={onClose} className="text-lg text-gray-400 hover:text-white">x</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3 px-6 py-4">
          <div>
            <label className="text-xs text-gray-400">Company</label>
            <div className="mt-1 rounded border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-200">
              {companyName}
            </div>
          </div>
          <CompanyInput label="Detachment Name *" value={form.name || ""} onChange={s("name")} required />
          <CompanyInput label="AOR" value={form.aor || ""} onChange={s("aor")} />
          <CompanyInput label="Mobile No" value={form.mobile_no || ""} onChange={s("mobile_no")} />
          <CompanyInput label="Email" type="email" value={form.email || ""} onChange={s("email")} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button
              type="submit"
              disabled={saving || !form.company || !form.name?.trim()}
              className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : mode === "add" ? "Create" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDelete({ label, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-gray-800 p-6 shadow-2xl">
        <h3 className="mb-2 font-semibold text-white">Delete {label}?</h3>
        <p className="mb-5 text-sm text-gray-400">This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  );
}

function CompanyInput({ label, type = "text", value, onChange, required }) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="mt-1 w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

/* ─────────────────────── icons ─────────────────────────────────── */

function MagnifyIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function CloseIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PrintIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
  );
}

function RefreshIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
