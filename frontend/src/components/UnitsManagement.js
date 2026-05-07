import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formationService } from "../services/api";

const EMPTY_UNIT = {
  name: "",
  code: "",
  formation: "",
  service: "KA",
  mobile_no: "",
  email: "",
  location_county: "",
};

const SERVICE_OPTIONS = [
  { value: "KA", label: "KA (Kenya Army)" },
  { value: "KAF", label: "KAF (Kenya Air Force)" },
  { value: "KN", label: "KN (Kenya Navy)" },
];

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
  const firstKey = Object.keys(data)[0];
  if (firstKey && Array.isArray(data[firstKey])) return `${firstKey}: ${data[firstKey][0]}`;
  return fallback;
}

export default function UnitsManagement({ user }) {
  const [units, setUnits] = useState([]);
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const isSuperAdmin = Boolean(user?.is_superuser);

  const formationMap = useMemo(
    () => Object.fromEntries(formations.map((formation) => [String(formation.id), formation.name])),
    [formations]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [unitsRes, formationsRes] = await Promise.all([
        formationService.units(),
        formationService.formations(),
      ]);
      setUnits(toArray(unitsRes.data));
      setFormations(toArray(formationsRes.data));
    } catch {
      setError("Failed to load units.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveUnit = async (form) => {
    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      name: form.name.trim(),
      code: (form.code || "").trim(),
      formation: Number(form.formation),
      service: form.service,
      mobile_no: (form.mobile_no || "").trim(),
      email: (form.email || "").trim(),
      location_county: (form.location_county || "").trim(),
      battalion: null,
    };

    try {
      if (modal.mode === "add") {
        await formationService.createUnit(payload);
        setMessage("Unit created.");
      } else {
        await formationService.updateUnit(modal.data.id, payload);
        setMessage("Unit updated.");
      }
      setModal(null);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save unit."));
    } finally {
      setSaving(false);
    }
  };

  const deleteUnit = async () => {
    setError("");
    setMessage("");
    try {
      await formationService.deleteUnit(deleteId);
      setDeleteId(null);
      setMessage("Unit deleted.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete unit."));
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white">Units</h2>
        <p className="text-gray-400 mt-2 text-sm">Only Super Admin can manage units.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Units</h2>
        <p className="text-gray-400 text-sm mt-1">Manage units under formations and assign service branch.</p>
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2 rounded">{error}</div>}
      {message && <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm px-4 py-2 rounded">{message}</div>}

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <span className="text-white font-medium">
            Units <span className="text-gray-400 text-xs">({units.length})</span>
          </span>
          <button
            onClick={() => setModal({ mode: "add", data: { ...EMPTY_UNIT } })}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
          >
            + Add Unit
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Unit Name</th>
              <th className="text-left px-4 py-2">Formation</th>
              <th className="text-left px-4 py-2">Service</th>
              <th className="text-left px-4 py-2">Mobile</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Location/County</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : units.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No units found.</td></tr>
            ) : units.map((unit) => (
              <tr key={unit.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-2 text-white font-medium">{unit.name}</td>
                <td className="px-4 py-2 text-gray-300">{formationMap[String(unit.formation)] || "-"}</td>
                <td className="px-4 py-2 text-gray-300">{unit.service || "-"}</td>
                <td className="px-4 py-2 text-gray-300">{unit.mobile_no || "-"}</td>
                <td className="px-4 py-2 text-gray-300">{unit.email || "-"}</td>
                <td className="px-4 py-2 text-gray-300">{unit.location_county || "-"}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-3">
                    <ActionButton label="Edit" color="blue" onClick={() => setModal({ mode: "edit", data: { ...unit, formation: String(unit.formation || "") } })} />
                    <ActionButton label="Delete" color="red" onClick={() => setDeleteId(unit.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <UnitModal
          mode={modal.mode}
          initial={modal.data}
          formations={formations}
          saving={saving}
          onSave={saveUnit}
          onClose={() => setModal(null)}
        />
      )}
      {deleteId && (
        <ConfirmDelete
          label="unit"
          onConfirm={deleteUnit}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

function ActionButton({ label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium transition-colors ${color === "red" ? "text-red-400 hover:text-red-300" : "text-blue-400 hover:text-blue-300"}`}
    >
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

function Field({ label, type = "text", value, onChange, required }) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function UnitModal({ mode, initial, formations, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_UNIT, ...initial });
  const setValue = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <ModalWrap title={mode === "add" ? "Add Unit" : "Edit Unit"} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form); }} className="space-y-3">
        <Field label="Unit Name *" value={form.name || ""} onChange={setValue("name")} required />
        <Field label="Unit Code" value={form.code || ""} onChange={setValue("code")} />

        <div>
          <label className="text-xs text-gray-400">Formation *</label>
          <select
            value={form.formation || ""}
            onChange={setValue("formation")}
            required
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">Select formation</option>
            {formations.map((formation) => (
              <option key={formation.id} value={String(formation.id)}>{formation.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400">Service *</label>
          <select
            value={form.service || "KA"}
            onChange={setValue("service")}
            required
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            {SERVICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <Field label="Unit Mobile No" value={form.mobile_no || ""} onChange={setValue("mobile_no")} />
        <Field label="Unit Email" type="email" value={form.email || ""} onChange={setValue("email")} />
        <Field label="Location/County" value={form.location_county || ""} onChange={setValue("location_county")} />

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button
            type="submit"
            disabled={saving || !form.name?.trim() || !form.formation}
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
