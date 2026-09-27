import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formationService } from "../services/api";
import AddAnotherModal from "./common/AddAnotherModal";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
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

export const UNIT_SERVICES = [
  { value: "KA", label: "Kenya Army", short: "Army", description: "Army units are attached to a formation." },
  { value: "KAF", label: "Kenya Air Force", short: "Air Force", description: "Air Force units are managed at service level." },
  { value: "KN", label: "Kenya Navy", short: "Navy", description: "Navy units are managed at service level." },
];

const EMPTY_UNIT_FORM = {
  name: "",
  code: "",
  formation: "",
  service: "KA",
  mobile_no: "",
  email: "",
  location_county: "",
};

const FORM_INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function unitSearchText(unit) {
  return [
    unit.name,
    unit.code,
    unit.service,
    unit.formation_name,
    unit.location_county,
    unit.mobile_no,
    unit.email,
  ].filter(Boolean).join(" ").toLowerCase();
}

function serviceLabel(value) {
  return UNIT_SERVICES.find((service) => service.value === value)?.label || value || "--";
}

function UnitServiceBadge({ service }) {
  const color = service === "KA"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : service === "KAF"
    ? "bg-sky-50 text-sky-700 ring-sky-200"
    : "bg-indigo-50 text-indigo-700 ring-indigo-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${color}`}>
      {service || "--"}
    </span>
  );
}

function FormLabel({ children }) {
  return (
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-700">
      {children}
    </label>
  );
}

function UnitDirectoryContent({ units, formations, loading, onCreate, onUpdate, onDelete, onClose, modal = false }) {
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [mode, setMode] = useState("list");
  const [form, setForm] = useState({ ...EMPTY_UNIT_FORM });
  const [editingUnit, setEditingUnit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [addAnotherPrompt, setAddAnotherPrompt] = useState(null);

  const serviceCounts = useMemo(() => UNIT_SERVICES.map((service) => ({
    ...service,
    count: units.filter((unit) => unit.service === service.value).length,
  })), [units]);

  const filteredUnits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return units.filter((unit) => {
      const matchesSearch = !needle || unitSearchText(unit).includes(needle);
      const matchesService = !serviceFilter || unit.service === serviceFilter;
      return matchesSearch && matchesService;
    });
  }, [query, serviceFilter, units]);

  const isArmyUnit = form.service === "KA";
  const canSave = Boolean(form.name.trim()) && (!isArmyUnit || form.formation);
  const editing = mode === "edit" && editingUnit?.id;

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

  const updateForm = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const selectService = (service) => {
    setError("");
    setMessage("");
    setEditingUnit(null);
    setForm({ ...EMPTY_UNIT_FORM, service, formation: "" });
    setMode("form");
  };

  const startEdit = (unit) => {
    setError("");
    setMessage("");
    setEditingUnit(unit);
    setForm({
      name: unit.name || "",
      code: unit.code || "",
      formation: unit.formation ? String(unit.formation) : "",
      service: unit.service || "KA",
      mobile_no: unit.mobile_no || "",
      email: unit.email || "",
      location_county: unit.location_county || "",
    });
    setMode("edit");
  };

  const deleteUnit = async (unit) => {
    if (!unit?.id) return;
    if (!window.confirm(`Delete ${unit.name}? This cannot be undone.`)) return;
    setDeletingId(unit.id);
    setError("");
    setMessage("");
    try {
      await onDelete(unit.id);
      setMessage(`${unit.name} deleted successfully.`);
    } catch (err) {
      const data = err?.response?.data;
      setError(data?.detail || "Failed to delete unit.");
    } finally {
      setDeletingId(null);
    }
  };

  const submitUnit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const unitName = form.name.trim();
      const currentService = form.service || "KA";
      const payload = {
        ...form,
        formation: isArmyUnit ? Number(form.formation) : null,
      };
      if (editing) {
        await onUpdate(editingUnit.id, payload);
        setMessage(`${unitName} updated successfully.`);
        setEditingUnit(null);
        setForm({ ...EMPTY_UNIT_FORM });
        setMode("list");
      } else {
        await onCreate(payload);
        setMessage(`${unitName} added successfully.`);
        setForm({ ...EMPTY_UNIT_FORM, service: currentService });
        setMode("list");
        setAddAnotherPrompt({
          itemLabel: "unit",
          message: `${unitName} has been added to the unit directory.`,
          addLabel: "Add Another Unit",
          onAddAnother: () => {
            setForm({ ...EMPTY_UNIT_FORM, service: currentService });
            setMode("form");
          },
        });
      }
      setQuery("");
      setServiceFilter("");
    } catch (err) {
      const data = err?.response?.data;
      setError(
        data?.name?.[0] ||
        data?.formation?.[0] ||
        data?.service?.[0] ||
        data?.detail ||
        `Failed to ${editing ? "update" : "add"} unit.`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${modal ? "max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl" : "min-h-screen"} flex flex-col border border-slate-200 bg-slate-50 text-slate-950`}>
      <div className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Superuser Unit Control</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">Unit Directory</h2>
            <p className="text-sm text-slate-600">View every unit in the database and add new service units from one place.</p>
          </div>
          <div className="flex items-center gap-2">
            {mode === "list" ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setMode("service");
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                + Add Unit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setEditingUnit(null);
                  setMode("list");
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                Back to Units
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="h-9 w-9 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                aria-label="Close unit directory"
              >
                x
              </button>
            )}
          </div>
        </div>
      </div>

      {(message || error) && (
        <div className="border-b border-slate-200 bg-white px-5 py-3">
          {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{message}</p>}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {mode === "service" && (
          <div className="mx-auto max-w-4xl">
            <p className="mb-4 text-sm font-medium text-slate-600">Select the service first. The system will then render the correct unit form.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {UNIT_SERVICES.map((service) => (
                <button
                  key={service.value}
                  type="button"
                  onClick={() => selectService(service.value)}
                  className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50"
                >
                  <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">{service.value}</span>
                  <h3 className="mt-4 text-lg font-bold text-slate-950">{service.label}</h3>
                  <p className="mt-2 text-sm text-slate-600">{service.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {(mode === "form" || mode === "edit") && (
          <form onSubmit={submitUnit} className="mx-auto max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{editing ? "Update Unit" : "Add Unit"}</p>
                <h3 className="text-xl font-bold text-slate-950">{serviceLabel(form.service)}</h3>
              </div>
              <UnitServiceBadge service={form.service} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <FormLabel>Unit Name *</FormLabel>
                <input
                  type="text"
                  value={form.name}
                  onChange={updateForm("name")}
                  required
                  className={FORM_INPUT}
                  placeholder="e.g. KAF AW"
                />
              </div>
              <div>
                <FormLabel>Code</FormLabel>
                <input
                  type="text"
                  value={form.code}
                  onChange={updateForm("code")}
                  className={FORM_INPUT}
                  placeholder="Optional unit code"
                />
              </div>
              <div>
                <FormLabel>Service</FormLabel>
                <select
                  value={form.service}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    service: event.target.value,
                    formation: "",
                  }))}
                  className={FORM_INPUT}
                >
                  {UNIT_SERVICES.map((service) => (
                    <option key={service.value} value={service.value}>{service.label} ({service.value})</option>
                  ))}
                </select>
              </div>
              {isArmyUnit ? (
                <div className="md:col-span-2">
                  <FormLabel>Formation *</FormLabel>
                  <select
                    value={form.formation}
                    onChange={updateForm("formation")}
                    required
                    className={FORM_INPUT}
                  >
                    <option value="">Select formation...</option>
                    {formations.map((formation) => (
                      <option key={formation.id} value={String(formation.id)}>{formation.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="md:col-span-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800">
                  {serviceLabel(form.service)} units are saved as service-level units. No Army formation is required.
                </div>
              )}
              <div>
                <FormLabel>Mobile No</FormLabel>
                <input
                  type="text"
                  value={form.mobile_no}
                  onChange={updateForm("mobile_no")}
                  className={FORM_INPUT}
                />
              </div>
              <div>
                <FormLabel>Email</FormLabel>
                <input
                  type="email"
                  value={form.email}
                  onChange={updateForm("email")}
                  className={FORM_INPUT}
                />
              </div>
              <div className="md:col-span-2">
                <FormLabel>Location / County</FormLabel>
                <input
                  type="text"
                  value={form.location_county}
                  onChange={updateForm("location_county")}
                  className={FORM_INPUT}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  setEditingUnit(null);
                  setMode("service");
                }}
                disabled={saving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {editing ? "Add Different Service" : "Change Service"}
              </button>
              <button
                type="submit"
                disabled={saving || !canSave}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Unit"}
              </button>
            </div>
          </form>
        )}

        {mode === "list" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">All Units</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{units.length}</p>
              </div>
              {serviceCounts.map((service) => (
                <button
                  key={service.value}
                  type="button"
                  onClick={() => setServiceFilter((current) => current === service.value ? "" : service.value)}
                  className={`rounded-xl border p-4 text-left shadow-sm transition-colors ${
                    serviceFilter === service.value
                      ? "border-blue-400 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{service.short}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{service.count}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_190px_auto]">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={FORM_INPUT}
                placeholder="Search units by name, code, service, formation, county, contact..."
              />
              <select
                value={serviceFilter}
                onChange={(event) => setServiceFilter(event.target.value)}
                className={FORM_INPUT}
              >
                <option value="">All services</option>
                {UNIT_SERVICES.map((service) => (
                  <option key={service.value} value={service.value}>{service.value}</option>
                ))}
              </select>
              {(query || serviceFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setServiceFilter("");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-bold text-slate-950">Units</p>
                <p className="text-xs font-medium text-slate-500">{filteredUnits.length} shown</p>
              </div>
              {loading ? (
                <div className="space-y-3 p-4">{[1,2,3,4].map((item) => <div key={item} className="h-12 animate-pulse rounded bg-slate-100" />)}</div>
              ) : filteredUnits.length === 0 ? (
                <p className="p-5 text-center text-sm font-medium text-slate-500">No units match the current filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold">Unit</th>
                        <th className="px-4 py-3 text-left font-bold">Service</th>
                        <th className="px-4 py-3 text-left font-bold">Formation</th>
                        <th className="px-4 py-3 text-left font-bold">Location</th>
                        <th className="px-4 py-3 text-left font-bold">Contact</th>
                        <th className="px-4 py-3 text-right font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnits.map((unit) => (
                        <tr key={unit.id} className="border-t border-slate-200 hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-950">{unit.name}</p>
                            <p className="text-xs font-medium text-slate-500">{unit.code || "No code"}</p>
                          </td>
                          <td className="px-4 py-3"><UnitServiceBadge service={unit.service} /></td>
                          <td className="px-4 py-3 font-medium text-slate-700">{unit.formation_name || "Service-level"}</td>
                          <td className="px-4 py-3 font-medium text-slate-700">{unit.location_county || "--"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <p className="font-medium">{unit.mobile_no || "--"}</p>
                            <p className="text-xs">{unit.email || ""}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(unit)}
                                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteUnit(unit)}
                                disabled={deletingId === unit.id}
                                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                              >
                                {deletingId === unit.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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

export function UnitDirectoryModal({ units, formations, loading, onClose, onCreate, onUpdate, onDelete }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
        <UnitDirectoryContent
          units={units}
          formations={formations}
          loading={loading}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onClose={onClose}
          modal
        />
      </div>
    </div>
  );
}

export default function UnitDirectory({ user }) {
  const isSuperuser = Boolean(user?.is_superuser);
  const [units, setUnits] = useState([]);
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadDirectory = useCallback(async () => {
    if (!isSuperuser) return;
    setLoading(true);
    setLoadError("");
    try {
      const [unitRes, formationRes] = await Promise.all([
        formationService.units({ page_size: 1000 }),
        formationService.formations(),
      ]);
      setUnits(toArray(unitRes.data));
      setFormations(toArray(formationRes.data));
    } catch {
      setLoadError("Failed to load units.");
    } finally {
      setLoading(false);
    }
  }, [isSuperuser]);

  useEffect(() => scheduleAfterPaint(loadDirectory), [loadDirectory]);

  const handleCreate = async (payload) => {
    await formationService.createUnit(payload);
    await loadDirectory();
  };

  const handleUpdate = async (id, payload) => {
    await formationService.updateUnit(id, payload);
    await loadDirectory();
  };

  const handleDelete = async (id) => {
    await formationService.deleteUnit(id);
    await loadDirectory();
  };

  if (!isSuperuser) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 text-white">
        <h2 className="text-xl font-semibold">Units</h2>
        <p className="mt-2 text-sm text-gray-400">Unit management is only available to superusers.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {loadError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {loadError}
        </p>
      )}
      <UnitDirectoryContent
        units={units}
        formations={formations}
        loading={loading}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}
