import React, { useCallback, useEffect, useState } from "react";
import { formationService } from "../services/api";

const EMPTY_FORMATION = { name: "", code: "" };

function toArray(payload) {
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];
}

function getErrorMessage(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (Array.isArray(data.name)) return `Name: ${data.name[0]}`;
  if (Array.isArray(data.code)) return `Code: ${data.code[0]}`;
  return fallback;
}

function exportCsv(filename, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function printTable(title, headers, rows) {
  const th = headers.map((header) => `<th>${header}</th>`).join("");
  const tb = rows
    .map((row) => `<tr>${row.map((value) => `<td>${value ?? ""}</td>`).join("")}</tr>`)
    .join("");
  const html = `<html><head><title>${title}</title><style>
    body{font-family:sans-serif;padding:20px}h2{margin-bottom:12px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:8px 12px;text-align:left;font-size:13px}
    th{background:#f0f0f0;font-weight:600}tr:nth-child(even){background:#f9f9f9}
  </style></head><body><h2>${title}</h2>
  <table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>
  <script>window.onload=()=>window.print();</script></body></html>`;
  const printWindow = window.open("", "_blank");
  printWindow.document.write(html);
  printWindow.document.close();
}

export default function FormationManagement({ user }) {
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const isSuperAdmin = Boolean(user?.is_superuser);

  const loadFormations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await formationService.formations();
      setFormations(toArray(response.data));
    } catch {
      setError("Failed to load formations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFormations();
  }, [loadFormations]);

  const rows = formations.map((formation) => {
    const battalionNames = (formation.battalions || []).map((battalion) => battalion.name).join(", ");
    return [
      formation.name,
      formation.code || "-",
      formation.battalions?.length || 0,
      battalionNames || "-",
    ];
  });

  const saveFormation = async (form) => {
    setSaving(true);
    setError("");
    setMessage("");
    const payload = { name: form.name.trim(), code: (form.code || "").trim() };

    try {
      if (modal.mode === "add") {
        await formationService.createFormation(payload);
        setMessage("Formation created.");
      } else {
        await formationService.updateFormation(modal.data.id, payload);
        setMessage("Formation updated.");
      }
      setModal(null);
      await loadFormations();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save formation."));
    } finally {
      setSaving(false);
    }
  };

  const deleteFormation = async () => {
    setError("");
    setMessage("");
    try {
      await formationService.deleteFormation(deleteId);
      setDeleteId(null);
      setMessage("Formation deleted.");
      await loadFormations();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete formation."));
    }
  };

  const printFormations = () =>
    printTable("Formations", ["Name", "Code", "Battalions", "Battalion Names"], rows);

  const exportFormations = () =>
    exportCsv("formations.csv", ["Name", "Code", "Battalions", "Battalion Names"], rows);

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white">Formations</h2>
        <p className="text-gray-400 mt-2 text-sm">Only Super Admin can manage formations.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Formation Management</h2>
        <p className="text-gray-400 text-sm mt-1">Create and manage formations separately from battalions.</p>
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2 rounded">{error}</div>}
      {message && <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm px-4 py-2 rounded">{message}</div>}

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <span className="text-white font-medium">
            Formations <span className="text-gray-400 text-xs">({formations.length})</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <ToolbarButton icon={<PrintIcon />} label="Print" onClick={printFormations} />
            <ToolbarButton icon={<DownloadIcon />} label="Export" onClick={exportFormations} />
            <button
              onClick={() => setModal({ mode: "add", data: { ...EMPTY_FORMATION } })}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
            >
              + Add Formation
            </button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Code</th>
              <th className="text-left px-4 py-2">Battalions</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : formations.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No formations found.</td></tr>
            ) : formations.map((formation) => (
              <tr key={formation.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-2 text-white font-medium">{formation.name}</td>
                <td className="px-4 py-2 text-gray-300">{formation.code || "-"}</td>
                <td className="px-4 py-2 text-gray-300">
                  {formation.battalions?.length || 0}
                  {formation.battalions?.length ? (
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {formation.battalions.map((battalion) => battalion.name).join(", ")}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-3">
                    <ActionButton label="Edit" color="blue" onClick={() => setModal({ mode: "edit", data: { ...formation } })} />
                    <ActionButton label="Delete" color="red" onClick={() => setDeleteId(formation.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormationModal
          mode={modal.mode}
          initial={modal.data}
          saving={saving}
          onSave={saveFormation}
          onClose={() => setModal(null)}
        />
      )}
      {deleteId && (
        <ConfirmDelete
          label="formation"
          onConfirm={deleteFormation}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

function ToolbarButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors">
      {icon}
      {label}
    </button>
  );
}

function ActionButton({ label, color, onClick }) {
  return (
    <button onClick={onClick} className={`text-xs font-medium transition-colors ${color === "red" ? "text-red-400 hover:text-red-300" : "text-blue-400 hover:text-blue-300"}`}>
      {label}
    </button>
  );
}

function ModalWrap({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">x</button>
        </div>
        <div className="px-6 py-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required }) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        required={required}
        className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function FormationModal({ mode, initial, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_FORMATION, ...initial });
  const setValue = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <ModalWrap title={mode === "add" ? "Add Formation" : "Edit Formation"} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form); }} className="space-y-3">
        <Field label="Formation Name *" value={form.name || ""} onChange={setValue("name")} required />
        <Field label="Code" value={form.code || ""} onChange={setValue("code")} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button
            type="submit"
            disabled={saving || !form.name?.trim()}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
          >
            {saving ? "Saving..." : mode === "add" ? "Create" : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalWrap>
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

function PrintIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>;
}

function DownloadIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
}
