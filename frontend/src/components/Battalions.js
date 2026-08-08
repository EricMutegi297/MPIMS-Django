import React, { useCallback, useEffect, useState } from "react";
import { caseService, formationService } from "../services/api";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

const BATTALION_TYPES = [
  { value: "normal", label: "Normal" },
  { value: "special", label: "Special" },
  { value: "hqs", label: "HQs" },
  { value: "protection", label: "Protection" },
];

const EMPTY_BATTALION = {
  name: "",
  code: "",
  battalion_type: "normal",
  formation: "",
  email: "",
  phone: "",
  aor: "",
};

function apiErrorMessage(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return Array.isArray(data.detail) ? data.detail.join(", ") : String(data.detail);
  if (typeof data === "object") {
    const message = Object.entries(data)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join(" | ");
    if (message) return message;
  }
  return fallback;
}

export default function Battalions({ user }) {
  const [battalions, setBattalions] = useState([]);
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [companyView, setCompanyView] = useState(null);
  const [caseView, setCaseView] = useState(null);
  const [caseViewLoading, setCaseViewLoading] = useState(false);

  const isSuperuser = Boolean(user?.is_superuser);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bRes, fRes] = await Promise.all([
        formationService.battalions({ page_size: 500 }),
        formationService.formations(),
      ]);
      setBattalions(toArray(bRes.data));
      setFormations(toArray(fRes.data));
    } catch {
      setError("Failed to load battalions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openAdd = () => setModal({ mode: "add", data: { ...EMPTY_BATTALION } });

  const openEdit = (battalion) => {
    setModal({
      mode: "edit",
      data: {
        id: battalion.id,
        name: battalion.name || "",
        code: battalion.code || "",
        battalion_type: battalion.battalion_type || "normal",
        formation: battalion.formation ? String(battalion.formation) : "",
        email: battalion.email || "",
        phone: battalion.phone || "",
        aor: battalion.aor || "",
      },
    });
  };

  const saveBattalion = async (form) => {
    setSaving(true);
    setError("");
    setMessage("");
    const payload = {
      ...form,
      formation: form.formation ? Number(form.formation) : null,
    };
    try {
      if (modal.mode === "add") {
        await formationService.createBattalion(payload);
        setMessage("Battalion created.");
      } else {
        await formationService.updateBattalion(modal.data.id, payload);
        setMessage("Battalion updated.");
      }
      setModal(null);
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save battalion."));
    } finally {
      setSaving(false);
    }
  };

  const deleteBattalion = async () => {
    setError("");
    setMessage("");
    try {
      await formationService.deleteBattalion(deleteId);
      setDeleteId(null);
      setMessage("Battalion deleted.");
      await loadAll();
    } catch {
      setError("Failed to delete battalion.");
    }
  };

  const openCompanies = (battalion) => {
    setCompanyView({
      battalionName: battalion?.name || "Battalion",
      rows: Array.isArray(battalion?.detachments) ? battalion.detachments : [],
    });
  };

  const openCases = async (battalion) => {
    setCaseView({ battalionName: battalion?.name || "Battalion", rows: [] });
    setCaseViewLoading(true);
    try {
      const res = await caseService.list({ tasked_battalion: battalion?.id, page_size: 300 });
      setCaseView({
        battalionName: battalion?.name || "Battalion",
        rows: toArray(res.data),
      });
    } catch {
      setError("Failed to load battalion cases.");
    } finally {
      setCaseViewLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Battalions</h2>
          <p className="text-sm text-gray-400 mt-0.5">Available battalions and case counts.</p>
        </div>
        {isSuperuser && (
          <button
            type="button"
            onClick={openAdd}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            + Add Battalion
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm px-4 py-3 rounded-lg">
          {message}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <span className="text-white font-medium">
            Battalions <span className="text-gray-400 text-xs">({battalions.length})</span>
          </span>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Battalion</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Formation</th>
                <th className="text-left px-4 py-3">Companies</th>
                <th className="text-left px-4 py-3">Case Count</th>
                <th className="text-left px-4 py-3">Contact</th>
                {isSuperuser && <th className="text-left px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isSuperuser ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : battalions.length === 0 ? (
                <tr>
                  <td colSpan={isSuperuser ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                    No battalions found.
                  </td>
                </tr>
              ) : (
                battalions.map((battalion) => (
                  <tr key={battalion.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-semibold">{battalion.name}</p>
                      <p className="text-xs text-gray-500">{battalion.code || "--"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">
                      {String(battalion.battalion_type || "--").replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{battalion.formation_name || "--"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openCompanies(battalion)}
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        {Array.isArray(battalion.detachments) ? battalion.detachments.length : 0}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openCases(battalion)}
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        {battalion.case_count ?? 0}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      <p>{battalion.email || "--"}</p>
                      <p>{battalion.phone || "--"}</p>
                    </td>
                    {isSuperuser && (
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <ActionButton label="Edit" onClick={() => openEdit(battalion)} />
                          <ActionButton label="Delete" danger onClick={() => setDeleteId(battalion.id)} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <BattalionModal
          mode={modal.mode}
          initial={modal.data}
          formations={formations}
          saving={saving}
          onSave={saveBattalion}
          onClose={() => setModal(null)}
        />
      )}
      {deleteId && (
        <ConfirmDelete
          onConfirm={deleteBattalion}
          onCancel={() => setDeleteId(null)}
        />
      )}
      {companyView && (
        <ModalWrap title={`${companyView.battalionName} Companies`} onClose={() => setCompanyView(null)}>
          {companyView.rows.length === 0 ? (
            <p className="text-sm text-gray-400">No companies found.</p>
          ) : (
            <div className="space-y-2">
              {companyView.rows.map((company) => (
                <div key={company.id} className="rounded border border-gray-700 bg-gray-900/50 px-3 py-2">
                  <p className="text-sm text-white font-medium">{company.name || "Unnamed company"}</p>
                  <p className="text-xs text-gray-400">Company: {company.company || "--"} | AOR: {company.aor || "--"}</p>
                </div>
              ))}
            </div>
          )}
        </ModalWrap>
      )}
      {caseView && (
        <ModalWrap title={`${caseView.battalionName} Cases`} onClose={() => setCaseView(null)}>
          {caseViewLoading ? (
            <p className="text-sm text-gray-400">Loading cases...</p>
          ) : caseView.rows.length === 0 ? (
            <p className="text-sm text-gray-400">No cases found.</p>
          ) : (
            <div className="space-y-2">
              {caseView.rows.map((item) => (
                <div key={item.id} className="rounded border border-gray-700 bg-gray-900/50 px-3 py-2">
                  <p className="text-sm text-white font-medium">{item.case_number || `Case #${item.id}`}</p>
                  <p className="text-xs text-gray-400">Status: {item.status || "--"}</p>
                </div>
              ))}
            </div>
          )}
        </ModalWrap>
      )}
    </div>
  );
}

function ActionButton({ label, danger, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium transition-colors ${
        danger ? "text-red-400 hover:text-red-300" : "text-blue-400 hover:text-blue-300"
      }`}
    >
      {label}
    </button>
  );
}

function ModalWrap({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 bg-gray-800 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-5 py-4">
          <h3 className="text-white font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            x
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required, type = "text" }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function BattalionModal({ mode, initial, formations, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const set = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));
  const canSave = Boolean(form.name?.trim());

  return (
    <ModalWrap title={mode === "add" ? "Add Battalion" : "Edit Battalion"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
        <Field label="Battalion Name *" value={form.name || ""} onChange={set("name")} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Battalion Type *</label>
            <select
              value={form.battalion_type}
              onChange={set("battalion_type")}
              required
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {BATTALION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <Field label="Code" value={form.code || ""} onChange={set("code")} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Formation</label>
          <select
            value={form.formation || ""}
            onChange={set("formation")}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">No formation</option>
            {formations.map((formation) => (
              <option key={formation.id} value={String(formation.id)}>{formation.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email" type="email" value={form.email || ""} onChange={set("email")} />
          <Field label="Phone" value={form.phone || ""} onChange={set("phone")} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">AOR</label>
          <textarea
            value={form.aor || ""}
            onChange={set("aor")}
            className="min-h-[84px] w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !canSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : mode === "add" ? "Create" : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalWrap>
  );
}

function ConfirmDelete({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl">
        <h3 className="text-white font-semibold">Delete Battalion?</h3>
        <p className="mt-2 text-sm text-gray-400">This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
