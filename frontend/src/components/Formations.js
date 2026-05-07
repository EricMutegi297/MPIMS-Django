import React, { useCallback, useEffect, useRef, useState } from "react";
import { formationService } from "../services/api";

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function exportCsv(filename, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function printTable(title, headers, rows) {
  const th = headers.map((h) => `<th>${h}</th>`).join("");
  const tb = rows.map((r) => `<tr>${r.map((v) => `<td>${v ?? ""}</td>`).join("")}</tr>`).join("");
  const html = `<html><head><title>${title}</title><style>
    body{font-family:sans-serif;padding:20px}h2{margin-bottom:12px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:8px 12px;text-align:left;font-size:13px}
    th{background:#f0f0f0;font-weight:600}tr:nth-child(even){background:#f9f9f9}
  </style></head><body><h2>${title}</h2>
  <table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>
  <script>window.onload=()=>window.print();</script></body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const BAT_TYPES = [
  { value: "normal", label: "Normal" },
  { value: "special", label: "Special" },
  { value: "hqs", label: "HQs" },
  { value: "protection", label: "Protection" },
];
const EMPTY_BAT = { name: "", email: "", phone: "", aor: "", battalion_type: "normal" };
const EMPTY_DET = { battalion: "", company: "A", name: "", aor: "", mobile_no: "", email: "" };

// ─── Main component ───────────────────────────────────────────────────────────
export default function Formations({ user }) {
  const [battalions, setBattalions] = useState([]);
  const [detachments, setDetachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [batModal, setBatModal] = useState(null);
  const [batSaving, setBatSaving] = useState(false);
  const [batDeleteId, setBatDeleteId] = useState(null);

  const [detModal, setDetModal] = useState(null);
  const [detSaving, setDetSaving] = useState(false);
  const [detDeleteId, setDetDeleteId] = useState(null);

  const importBatRef = useRef();
  const importDetRef = useRef();

  const isSuperAdmin = Boolean(user?.is_superuser);

  const loadAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [bRes, dRes] = await Promise.all([
        formationService.battalions(),
        formationService.detachments(),
      ]);
      const toArr = (p) => Array.isArray(p) ? p : Array.isArray(p?.results) ? p.results : [];
      setBattalions(toArr(bRes.data));
      setDetachments(toArr(dRes.data));
    } catch { setError("Failed to load data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Battalion CRUD ──
  const saveBattalion = async (form) => {
    setBatSaving(true); setError(""); setMessage("");
    try {
      if (batModal.mode === "add") { await formationService.createBattalion(form); setMessage("Battalion created."); }
      else { await formationService.updateBattalion(batModal.data.id, form); setMessage("Battalion updated."); }
      setBatModal(null); await loadAll();
    } catch (err) { setError(err.response?.data?.detail || "Failed to save battalion."); }
    finally { setBatSaving(false); }
  };

  const deleteBattalion = async () => {
    setError(""); setMessage("");
    try { await formationService.deleteBattalion(batDeleteId); setBatDeleteId(null); setMessage("Battalion deleted."); await loadAll(); }
    catch { setError("Failed to delete battalion."); }
  };

  // ── Detachment CRUD ──
  const saveDetachment = async (form) => {
    setDetSaving(true); setError(""); setMessage("");
    try {
      const payload = { ...form, battalion: Number(form.battalion) };
      if (detModal.mode === "add") { await formationService.createDetachment(payload); setMessage("Detachment created."); }
      else { await formationService.updateDetachment(detModal.data.id, payload); setMessage("Detachment updated."); }
      setDetModal(null); await loadAll();
    } catch (err) {
      const d = err.response?.data;
      setError(d?.battalion?.[0] || d?.detail || "Failed to save detachment.");
    } finally { setDetSaving(false); }
  };

  const deleteDetachment = async () => {
    setError(""); setMessage("");
    try { await formationService.deleteDetachment(detDeleteId); setDetDeleteId(null); setMessage("Detachment deleted."); await loadAll(); }
    catch { setError("Failed to delete detachment."); }
  };

  // ── Print ──
  const printBattalions = () => printTable("Battalions", ["Name", "Email", "Phone", "AOR"],
    battalions.map((b) => [b.name, b.email || "—", b.phone || "—", b.aor || "—"]));

  const printDetachments = () => printTable("Detachments", ["Battalion", "COY", "Name", "AOR", "Mobile", "Email"],
    detachments.map((d) => {
      const bat = battalions.find((b) => String(b.id) === String(d.battalion));
      return [bat?.name || "—", d.company, d.name, d.aor || "—", d.mobile_no || "—", d.email || "—"];
    }));

  // ── Export CSV ──
  const exportBattalions = () => exportCsv("battalions.csv", ["Name", "Email", "Phone", "AOR", "Type"],
    battalions.map((b) => [b.name, b.email, b.phone, b.aor, b.battalion_type]));

  const exportDetachments = () => exportCsv("detachments.csv", ["Battalion", "COY", "Name", "AOR", "Mobile", "Email"],
    detachments.map((d) => {
      const bat = battalions.find((b) => String(b.id) === String(d.battalion));
      return [bat?.name || "", d.company, d.name, d.aor, d.mobile_no, d.email];
    }));

  // ── Import CSV ──
  const handleImportBattalions = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    const rows = parseCsv(await file.text());
    let ok = 0, fail = 0;
    for (const row of rows) {
      try {
        await formationService.createBattalion({
          name: row.Name || row.name || "", email: row.Email || row.email || "",
          phone: row.Phone || row.phone || "", aor: row.AOR || row.aor || "",
          battalion_type: row.Type || row.battalion_type || "normal",
        }); ok++;
      } catch { fail++; }
    }
    setMessage(`Imported ${ok} battalion(s).${fail ? ` ${fail} failed.` : ""}`);
    await loadAll();
  };

  const handleImportDetachments = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    const rows = parseCsv(await file.text());
    let ok = 0, fail = 0;
    for (const row of rows) {
      const batName = row.Battalion || row.battalion || "";
      const bat = battalions.find((b) => b.name.toLowerCase() === batName.toLowerCase());
      if (!bat) { fail++; continue; }
      try {
        await formationService.createDetachment({
          battalion: bat.id, company: row.COY || row.company || "A",
          name: row.Name || row.name || "", aor: row.AOR || row.aor || "",
          mobile_no: row.Mobile || row.mobile_no || "", email: row.Email || row.email || "",
        }); ok++;
      } catch { fail++; }
    }
    setMessage(`Imported ${ok} detachment(s).${fail ? ` ${fail} failed.` : ""}`);
    await loadAll();
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white">Battalions</h2>
        <p className="text-gray-400 mt-2 text-sm">Only Super Admin can manage battalions and detachments.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">Battalion Management</h2>
        <p className="text-gray-400 text-sm mt-1">Detachments are only allowed in Normal battalions.</p>
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2 rounded">{error}</div>}
      {message && <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm px-4 py-2 rounded">{message}</div>}

      {/* ── BATTALIONS ── */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <span className="text-white font-medium">Battalions <span className="text-gray-400 text-xs">({battalions.length})</span></span>
          <div className="flex flex-wrap gap-2">
            <TBtn icon={<IcoPrint />} label="Print" onClick={printBattalions} />
            <TBtn icon={<IcoUp />} label="Import" onClick={() => importBatRef.current?.click()} />
            <TBtn icon={<IcoDown />} label="Export" onClick={exportBattalions} />
            <input ref={importBatRef} type="file" accept=".csv" className="hidden" onChange={handleImportBattalions} />
            <button onClick={() => setBatModal({ mode: "add", data: { ...EMPTY_BAT } })}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">
              + Add Battalion
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Phone</th>
              <th className="text-left px-4 py-2">AOR</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : battalions.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No battalions found.</td></tr>
            ) : battalions.map((b) => (
              <tr key={b.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-2 text-white font-medium">{b.name}</td>
                <td className="px-4 py-2 text-gray-300">{b.email || "—"}</td>
                <td className="px-4 py-2 text-gray-300">{b.phone || "—"}</td>
                <td className="px-4 py-2 text-gray-300">{b.aor || "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-3">
                    <ABtn label="Edit" color="blue" onClick={() => setBatModal({ mode: "edit", data: { ...b } })} />
                    <ABtn label="Delete" color="red" onClick={() => setBatDeleteId(b.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── DETACHMENTS ── */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <span className="text-white font-medium">Detachments <span className="text-gray-400 text-xs">({detachments.length})</span></span>
          <div className="flex flex-wrap gap-2">
            <TBtn icon={<IcoPrint />} label="Print" onClick={printDetachments} />
            <TBtn icon={<IcoUp />} label="Import" onClick={() => importDetRef.current?.click()} />
            <TBtn icon={<IcoDown />} label="Export" onClick={exportDetachments} />
            <input ref={importDetRef} type="file" accept=".csv" className="hidden" onChange={handleImportDetachments} />
            <button onClick={() => setDetModal({ mode: "add", data: { ...EMPTY_DET } })}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">
              + Add Detachment
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Battalion</th>
              <th className="text-left px-4 py-2">COY</th>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">AOR</th>
              <th className="text-left px-4 py-2">Mobile</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : detachments.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No detachments found.</td></tr>
            ) : detachments.map((d) => {
              const bat = battalions.find((b) => String(b.id) === String(d.battalion));
              return (
                <tr key={d.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-2 text-gray-300">{bat?.name || "—"}</td>
                  <td className="px-4 py-2 text-gray-300">{d.company}</td>
                  <td className="px-4 py-2 text-white font-medium">{d.name}</td>
                  <td className="px-4 py-2 text-gray-300">{d.aor || "—"}</td>
                  <td className="px-4 py-2 text-gray-300">{d.mobile_no || "—"}</td>
                  <td className="px-4 py-2 text-gray-300">{d.email || "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-3">
                      <ABtn label="Edit" color="blue" onClick={() => setDetModal({ mode: "edit", data: { id: d.id, battalion: String(d.battalion), company: d.company, name: d.name, aor: d.aor || "", mobile_no: d.mobile_no || "", email: d.email || "" } })} />
                      <ABtn label="Delete" color="red" onClick={() => setDetDeleteId(d.id)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── MODALS ── */}
      {batModal && <BattalionModal mode={batModal.mode} initial={batModal.data} saving={batSaving} onSave={saveBattalion} onClose={() => setBatModal(null)} />}
      {detModal && <DetachmentModal mode={detModal.mode} initial={detModal.data} saving={detSaving} battalionOptions={battalions} onSave={saveDetachment} onClose={() => setDetModal(null)} />}
      {batDeleteId && <ConfirmDelete label="battalion" onConfirm={deleteBattalion} onCancel={() => setBatDeleteId(null)} />}
      {detDeleteId && <ConfirmDelete label="detachment" onConfirm={deleteDetachment} onCancel={() => setDetDeleteId(null)} />}
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────
function TBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors">
      {icon}{label}
    </button>
  );
}
function ABtn({ label, color, onClick }) {
  return (
    <button onClick={onClick} className={`text-xs font-medium transition-colors ${color === "red" ? "text-red-400 hover:text-red-300" : "text-blue-400 hover:text-blue-300"}`}>
      {label}
    </button>
  );
}
function ConfirmDelete({ label, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm">
        <h3 className="text-white font-semibold mb-2">Delete {label}?</h3>
        <p className="text-gray-400 text-sm mb-5">This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded">Delete</button>
        </div>
      </div>
    </div>
  );
}
function ModalWrap({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>
        <div className="px-6 py-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, type = "text", value, onChange, required }) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input type={type} value={value} onChange={onChange} required={required}
        className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500" />
    </div>
  );
}
function SaveCancel({ saving, canSave, mode, onClose }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
      <button type="submit" disabled={saving || !canSave}
        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
        {saving ? "Saving…" : mode === "add" ? "Create" : "Save Changes"}
      </button>
    </div>
  );
}

function BattalionModal({ mode, initial, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <ModalWrap title={mode === "add" ? "Add Battalion" : "Edit Battalion"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
        <Field label="Battalion Name *" value={form.name || ""} onChange={s("name")} required />
        <Field label="Email" type="email" value={form.email || ""} onChange={s("email")} />
        <Field label="Phone" value={form.phone || ""} onChange={s("phone")} />
        <Field label="AOR" value={form.aor || ""} onChange={s("aor")} />
        <div>
          <label className="text-xs text-gray-400">Battalion Type *</label>
          <select value={form.battalion_type} onChange={s("battalion_type")}
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
            {BAT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <SaveCancel saving={saving} canSave={!!form.name?.trim()} mode={mode} onClose={onClose} />
      </form>
    </ModalWrap>
  );
}

function DetachmentModal({ mode, initial, saving, battalionOptions, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <ModalWrap title={mode === "add" ? "Add Detachment" : "Edit Detachment"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
        <div>
          <label className="text-xs text-gray-400">Battalion * (Normal only)</label>
          <select value={form.battalion} onChange={s("battalion")} required
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
            <option value="">Select battalion</option>
            {battalionOptions.map((b) => (
              <option key={b.id} value={String(b.id)} disabled={b.battalion_type !== "normal"}>
                {b.name}{b.battalion_type !== "normal" ? " (not eligible)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Company (COY) *</label>
          <select value={form.company} onChange={s("company")}
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
            {["A", "B", "C", "D"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Field label="Detachment Name *" value={form.name || ""} onChange={s("name")} required />
        <Field label="AOR *" value={form.aor || ""} onChange={s("aor")} required />
        <Field label="Mobile No" value={form.mobile_no || ""} onChange={s("mobile_no")} />
        <Field label="Email" type="email" value={form.email || ""} onChange={s("email")} />
        <SaveCancel saving={saving} canSave={!!form.battalion && !!form.name?.trim()} mode={mode} onClose={onClose} />
      </form>
    </ModalWrap>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function IcoPrint() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>;
}
function IcoDown() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
}
function IcoUp() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
}
