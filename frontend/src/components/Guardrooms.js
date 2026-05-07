import React, { useCallback, useEffect, useState } from "react";
import { formationService, guardroomService, userService } from "../services/api";

const EMPTY_GUARDROOM = {
  name: "",
  unit: "",
  capacity: "",
  location: "",
  phone_no: "",
  ic: "",
  current_strength: "0",
  established_strength: "0",
  is_active: true,
};

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

export default function Guardrooms({ user }) {
  const [guardrooms, setGuardrooms] = useState([]);
  const [units, setUnits] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = Boolean(user?.is_superuser);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [guardroomsRes, unitsRes, usersRes] = await Promise.all([
        guardroomService.list(),
        formationService.units(),
        userService.list(),
      ]);
      setGuardrooms(toArray(guardroomsRes.data));
      setUnits(toArray(unitsRes.data));
      setUsers(toArray(usersRes.data));
    } catch {
      setError("Failed to load guardrooms.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createGuardroom = async (form) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await guardroomService.create({
        name: form.name.trim(),
        unit: form.unit ? Number(form.unit) : null,
        capacity: Number(form.capacity || 0),
        location: (form.location || "").trim(),
        phone_no: (form.phone_no || "").trim(),
        ic: form.ic ? Number(form.ic) : null,
        current_strength: Number(form.current_strength || 0),
        established_strength: Number(form.established_strength || 0),
        is_active: Boolean(form.is_active),
      });
      setModalOpen(false);
      setMessage("Guardroom created.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create guardroom."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Guardrooms</h2>
          <p className="text-gray-400 text-sm mt-0.5">{guardrooms.length} guardrooms</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setModalOpen(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
          >
            + Add Guardroom
          </button>
        )}
      </div>

      {error && <div className="mb-4 bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2 rounded">{error}</div>}
      {message && <div className="mb-4 bg-green-900/40 border border-green-700 text-green-300 text-sm px-4 py-2 rounded">{message}</div>}

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Guardroom Name</th>
              <th className="text-left px-4 py-3">Capacity</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-left px-4 py-3">Phone No</th>
              <th className="text-left px-4 py-3">In-Charge</th>
              <th className="text-left px-4 py-3">Unit</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">Loading...</td>
              </tr>
            ) : guardrooms.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">No guardrooms found.</td>
              </tr>
            ) : (
              guardrooms.map((g) => (
                <tr key={g.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{g.name}</td>
                  <td className="px-4 py-3 text-gray-300">{g.capacity ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-300">{g.location || "-"}</td>
                  <td className="px-4 py-3 text-gray-300">{g.phone_no || "-"}</td>
                  <td className="px-4 py-3 text-gray-300">{g.ic_name || "-"}</td>
                  <td className="px-4 py-3 text-gray-300">{g.unit_name || g.unit || "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        g.is_active
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {g.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <GuardroomModal
          units={units}
          users={users}
          saving={saving}
          onSave={createGuardroom}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function GuardroomModal({ units, users, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_GUARDROOM });

  const setValue = (key) => (event) => {
    const value = key === "is_active" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800">
          <h3 className="text-white font-semibold">Add Guardroom</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">x</button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onSave(form); }} className="px-6 py-4 space-y-3">
          <Field label="Guardroom Name *" value={form.name} onChange={setValue("name")} required />
          <Field label="Capacity *" type="number" value={form.capacity} onChange={setValue("capacity")} required />
          <Field label="Location *" value={form.location} onChange={setValue("location")} required />
          <Field label="Phone No *" value={form.phone_no} onChange={setValue("phone_no")} required />

          <div>
            <label className="text-xs text-gray-400">In-Charge *</label>
            <select
              value={form.ic}
              onChange={setValue("ic")}
              required
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="">Select in-charge</option>
              {users.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name || u.service_number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400">Unit (optional)</label>
            <select
              value={form.unit}
              onChange={setValue("unit")}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="">No unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={String(unit.id)}>{unit.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Current Strength" type="number" value={form.current_strength} onChange={setValue("current_strength")} />
            <Field label="Established Strength" type="number" value={form.established_strength} onChange={setValue("established_strength")} />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={!!form.is_active} onChange={setValue("is_active")} className="rounded" />
            Active
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button
              type="submit"
              disabled={saving || !form.name?.trim() || !form.capacity || !form.location?.trim() || !form.phone_no?.trim() || !form.ic}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required, type = "text" }) {
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
