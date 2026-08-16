import React, { useCallback, useEffect, useMemo, useState } from "react";
import { caseBriefService, caseService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function accusedDisplay(caseObj) {
  const entries = Array.isArray(caseObj?.accused_entries) ? caseObj.accused_entries : [];
  const names = entries
    .map((entry) => [entry.rank, entry.name].filter(Boolean).join(" ").trim() || entry.service_number)
    .filter(Boolean);
  if (names.length) return names.join(", ");
  return caseObj?.accused_name || "--";
}

function unitDisplay(caseObj) {
  const entries = Array.isArray(caseObj?.accused_entries) ? caseObj.accused_entries : [];
  const units = entries.map((entry) => entry.unit_name).filter(Boolean);
  const uniqueUnits = [...new Set(units)];
  if (uniqueUnits.length) return uniqueUnits.join(", ");
  return caseObj?.accused_unit_name || caseObj?.submitting_unit_name || "--";
}

function fileName(url) {
  if (!url) return "";
  return String(url).split("/").pop() || "Document";
}

function displayDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function errorText(error) {
  const data = error?.response?.data;
  if (!data) return "Failed to save back-brief.";
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  const first = Object.values(data).flat().find(Boolean);
  return first ? String(first) : "Failed to save back-brief.";
}

function canUploadBackBrief(user) {
  return Boolean(
    user?.is_superuser ||
      ((user?.role === "admin" || user?.role === "mpc_hqs") && user?.battalion_type === "hqs")
  );
}

function backBriefStatus(caseObj) {
  const brief = caseObj?.brief || {};
  if (brief.back_brief) return "attached";
  if (brief.approved_at) return "ready";
  if (brief.forwarded_to_role === "corps_cmd") return "awaiting_approval";
  return "awaiting_corps";
}

function backBriefStatusLabel(status) {
  return {
    attached: "Attached",
    ready: "Ready for Back-Brief",
    awaiting_approval: "Awaiting Corps Approval",
    awaiting_corps: "Awaiting Corps Cmd",
  }[status] || "Pending";
}

function printFile(url) {
  if (!url) return;
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) return;
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch (_) {
      // Browser may block scripted printing for some document types.
    }
  };
  if (win.document?.readyState === "complete") {
    setTimeout(trigger, 400);
  } else {
    win.onload = trigger;
  }
}

function printTable(title, headers, rows) {
  const escapeHtml = (value) =>
    String(value ?? "--").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  const html = `<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#111827}
    h1{font-size:18px;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}
    th{background:#e2e8f0;text-transform:uppercase}
  </style></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

export default function BackBriefs({ user }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeCase, setActiveCase] = useState(null);
  const [backBriefFile, setBackBriefFile] = useState(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canUpload = canUploadBackBrief(user);
  useAutoDismiss(notice, setNotice);
  useAutoDismiss(error, setError);

  const loadBackBriefs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await caseService.backBriefs();
      setCases(toArray(res.data));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackBriefs();
  }, [loadBackBriefs]);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((caseObj) => {
      const brief = caseObj.brief || {};
      const backBrief = brief.back_brief || null;
      const status = backBriefStatus(caseObj);
      const matchesStatus = statusFilter === "all" || statusFilter === status;
      const haystack = [
        caseObj.case_number,
        accusedDisplay(caseObj),
        unitDisplay(caseObj),
        caseObj.offence || caseObj.offence_name,
        caseObj.description,
        fileName(brief.file),
        fileName(backBrief?.file),
        backBrief?.uploaded_by_name,
        brief.approved_by_name,
        backBriefStatusLabel(status),
      ].join(" ").toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [cases, search, statusFilter]);

  function openAttach(caseObj) {
    setActiveCase(caseObj);
    setBackBriefFile(null);
    setNote("");
    setError("");
    setNotice("");
  }

  function closeAttach() {
    setActiveCase(null);
    setBackBriefFile(null);
    setNote("");
    setSubmitting(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (activeCase?.status === "closed") {
      setError("Closed cases do not allow further uploads or attachment changes.");
      return;
    }
    if (!activeCase || !backBriefFile) {
      setError("Attach a back-brief file.");
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", backBriefFile);
      if (note.trim()) formData.append("note", note.trim());
      await caseBriefService.uploadBackBrief(activeCase.id, formData);
      setNotice("Back-brief uploaded successfully.");
      closeAttach();
      await loadBackBriefs();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handlePrintTable() {
    const rows = filteredCases.map((caseObj) => {
      const brief = caseObj.brief || {};
      const backBrief = brief.back_brief || {};
      const status = backBriefStatus(caseObj);
      return [
        caseObj.case_number || "--",
        accusedDisplay(caseObj),
        unitDisplay(caseObj),
        caseObj.offence || caseObj.offence_name || "--",
        caseObj.description || "--",
        backBriefStatusLabel(status),
        backBrief.uploaded_by_name || "--",
        displayDate(backBrief.uploaded_at),
        fileName(brief.file) || "--",
        fileName(backBrief.file) || "--",
      ];
    });
    printTable(
      "Back-Briefs",
      ["Case", "Accused", "Unit", "Offence", "Description", "Status", "Uploaded By", "Uploaded", "Brief File", "Back-Brief File"],
      rows
    );
  }

  return (
    <div className="p-4 md:p-6 text-slate-900 space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">Back-Briefs</h2>
        <p className="text-sm text-slate-600">Review, attach, upload, and print back-briefs.</p>
      </div>

      {(error || notice) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || notice}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Back-Briefs</h3>
          <span className="text-xs font-medium text-slate-500">{filteredCases.length} of {cases.length} total</span>
        </div>
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[1fr_220px_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search back-briefs"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All statuses</option>
            <option value="attached">Attached</option>
            <option value="ready">Ready for Back-Brief</option>
            <option value="awaiting_approval">Awaiting Corps Approval</option>
            <option value="awaiting_corps">Awaiting Corps Cmd</option>
          </select>
          <button
            type="button"
            onClick={handlePrintTable}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Print Table
          </button>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-slate-500">Loading back-briefs...</div>
        ) : filteredCases.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">
            {cases.length === 0 ? "No back-briefs found." : "No back-briefs match the current search or status filter."}
            {cases.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
                className="ml-3 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Case</th>
                  <th className="px-4 py-3 text-left font-semibold">Accused</th>
                  <th className="px-4 py-3 text-left font-semibold">Unit</th>
                  <th className="px-4 py-3 text-left font-semibold">Offence</th>
                  <th className="px-4 py-3 text-left font-semibold">Description</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Uploaded By</th>
                  <th className="px-4 py-3 text-left font-semibold">File</th>
                  <th className="px-4 py-3 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredCases.map((caseObj) => {
                  const brief = caseObj.brief || {};
                  const backBrief = brief.back_brief || null;
                  const status = backBriefStatus(caseObj);
                  return (
                    <tr key={caseObj.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-blue-700 whitespace-nowrap">{caseObj.case_number || "--"}</td>
                      <td className="px-4 py-3 text-slate-800">{accusedDisplay(caseObj)}</td>
                      <td className="px-4 py-3 text-slate-600">{unitDisplay(caseObj)}</td>
                      <td className="px-4 py-3 text-slate-600">{caseObj.offence || caseObj.offence_name || "--"}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs whitespace-normal break-words">{caseObj.description || "--"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${status === "attached" ? "bg-emerald-50 text-emerald-700" : status === "ready" ? "bg-blue-50 text-blue-700" : status === "awaiting_approval" ? "bg-purple-50 text-purple-700" : "bg-amber-50 text-amber-700"}`}>
                          {backBriefStatusLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {backBrief ? (
                          <>
                            <span>{backBrief.uploaded_by_name || "--"}</span>
                            <span className="block text-xs text-slate-400">{displayDate(backBrief.uploaded_at)}</span>
                          </>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {backBrief?.file ? (
                          <a href={backBrief.file} target="_blank" rel="noreferrer" className="text-blue-700 hover:text-blue-900 font-medium">
                            {fileName(backBrief.file)}
                          </a>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {brief.file && (
                            <>
                              <a href={brief.file} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                                View Brief
                              </a>
                              <button type="button" onClick={() => printFile(brief.file)} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                                Print Brief
                              </button>
                            </>
                          )}
                          {backBrief?.file && (
                            <>
                              <a href={backBrief.file} target="_blank" rel="noreferrer" className="rounded-md border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                                View Back-Brief
                              </a>
                              <button type="button" onClick={() => printFile(backBrief.file)} className="rounded-md border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                                Print Back-Brief
                              </button>
                            </>
                          )}
                          {canUpload && caseObj.status !== "closed" && !backBrief && status === "ready" && (
                            <button type="button" onClick={() => openAttach(caseObj)} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                              Attach Back-Brief
                            </button>
                          )}
                          {canUpload && caseObj.status !== "closed" && !backBrief && status !== "ready" && (
                            <button type="button" disabled className="rounded-md bg-slate-300 px-2.5 py-1.5 text-xs font-semibold text-white">
                              {backBriefStatusLabel(status)}
                            </button>
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

      {activeCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={(event) => event.target === event.currentTarget && closeAttach()}>
          <form onSubmit={handleSubmit} className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Attach Back-Brief</h3>
                <p className="mt-1 text-sm text-slate-500">{activeCase.case_number || `Case #${activeCase.id}`}</p>
              </div>
              <button type="button" onClick={closeAttach} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">Close</button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Back-Brief File</label>
                <input
                  type="file"
                  onChange={(event) => setBackBriefFile(event.target.files?.[0] || null)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Note</label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Back-brief note"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button type="button" onClick={closeAttach} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={submitting || !backBriefFile} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300">
                  {submitting ? "Uploading..." : "Upload Back-Brief"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
