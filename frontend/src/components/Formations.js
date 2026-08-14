import React, { useCallback, useEffect, useMemo, useState } from "react";
import { caseService, formationService } from "../services/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toArr(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function matchesSearch(query, values) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SERVICES = [
  { value: "KA",  label: "KA - Kenya Army" },
  { value: "KAF", label: "KAF - Kenya Air Force" },
  { value: "KN",  label: "KN - Kenya Navy" },
];
const EMPTY_FORMATION = { name: "", location: "" };
const EMPTY_UNIT = { name: "", code: "", formation: "", service: "KA", email: "", mobile_no: "", location_county: "" };

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

// ─── Main component ───────────────────────────────────────────────────────────
export default function Formations({ user }) {
  const [formations, setFormations] = useState([]);
  const [units,      setUnits]      = useState([]);
  const [battalions, setBattalions] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [message,    setMessage]    = useState("");

  const [fmModal,      setFmModal]      = useState(null);
  const [fmSaving,     setFmSaving]     = useState(false);
  const [fmDeleteId,   setFmDeleteId]   = useState(null);

  const [unitModal,    setUnitModal]    = useState(null);
  const [unitSaving,   setUnitSaving]   = useState(false);
  const [unitDeleteId, setUnitDeleteId] = useState(null);
  const [detachmentView, setDetachmentView] = useState(null);
  const [caseView, setCaseView] = useState(null);
  const [caseViewLoading, setCaseViewLoading] = useState(false);
  const [battalionSearch, setBattalionSearch] = useState("");
  const [formationSearch, setFormationSearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [unitFormationFilter, setUnitFormationFilter] = useState("");
  const [unitServiceFilter, setUnitServiceFilter] = useState("");

  const isSuperAdmin = Boolean(user?.is_superuser);
  const isHqsAdmin = user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() === "hqs";
  const canViewBattalionSummary = isSuperAdmin || isHqsAdmin;
  const visibleBattalions = useMemo(
    () => battalions.filter((b) => String(b?.battalion_type || "").toLowerCase() !== "hqs"),
    [battalions]
  );
  const filteredBattalions = useMemo(
    () => visibleBattalions.filter((b) => matchesSearch(battalionSearch, [
      b.name,
      b.case_count,
      ...(Array.isArray(b.detachments) ? b.detachments.flatMap((d) => [d.name, d.company, d.aor]) : []),
    ])),
    [visibleBattalions, battalionSearch]
  );
  const filteredFormations = useMemo(
    () => formations.filter((f) => {
      const fUnits = units.filter((u) => String(u.formation) === String(f.id));
      return matchesSearch(formationSearch, [
        f.name,
        f.location,
        ...fUnits.flatMap((u) => [u.name, u.code, u.service, u.email, u.mobile_no, u.location_county]),
      ]);
    }),
    [formations, units, formationSearch]
  );
  const filteredUnits = useMemo(
    () => units.filter((u) => {
      const formationMatches = !unitFormationFilter || String(u.formation) === String(unitFormationFilter);
      const serviceMatches = !unitServiceFilter || u.service === unitServiceFilter;
      return formationMatches && serviceMatches && matchesSearch(unitSearch, [
        u.name,
        u.code,
        u.formation_name,
        u.service,
        u.email,
        u.mobile_no,
        u.location_county,
      ]);
    }),
    [units, unitSearch, unitFormationFilter, unitServiceFilter]
  );

  const loadAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [fRes, uRes, bRes] = await Promise.all([
        formationService.formations(),
        formationService.units({ page_size: 500 }),
        formationService.battalions({ page_size: 500 }),
      ]);
      setFormations(toArr(fRes.data));
      setUnits(toArr(uRes.data));
      setBattalions(toArr(bRes.data));
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Formation CRUD ──
  const saveFormation = async (form) => {
    setFmSaving(true); setError(""); setMessage("");
    try {
      if (fmModal.mode === "add") {
        await formationService.createFormation(form);
        setMessage("Formation created.");
      } else {
        await formationService.updateFormation(fmModal.data.id, form);
        setMessage("Formation updated.");
      }
      setFmModal(null);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.name?.[0] || err.response?.data?.detail || "Failed to save formation.");
    } finally {
      setFmSaving(false);
    }
  };

  const deleteFormation = async () => {
    setError(""); setMessage("");
    try {
      await formationService.deleteFormation(fmDeleteId);
      setFmDeleteId(null);
      setMessage("Formation deleted.");
      await loadAll();
    } catch {
      setError("Failed to delete formation. Remove its units first.");
    }
  };

  // ── Unit CRUD ──
  const saveUnit = async (form) => {
    setUnitSaving(true); setError(""); setMessage("");
    try {
      const payload = {
        ...form,
        formation: form.service === "KA" && form.formation ? Number(form.formation) : null,
      };
      if (unitModal.mode === "add") {
        await formationService.createUnit(payload);
        setMessage("Unit created.");
      } else {
        await formationService.updateUnit(unitModal.data.id, payload);
        setMessage("Unit updated.");
      }
      setUnitModal(null);
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save unit."));
    } finally {
      setUnitSaving(false);
    }
  };

  const deleteUnit = async () => {
    setError(""); setMessage("");
    try {
      await formationService.deleteUnit(unitDeleteId);
      setUnitDeleteId(null);
      setMessage("Unit deleted.");
      await loadAll();
    } catch {
      setError("Failed to delete unit.");
    }
  };

  const openDetachments = (battalion) => {
    setDetachmentView({
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
        rows: toArr(res.data),
      });
    } catch {
      setError("Failed to load battalion cases.");
    } finally {
      setCaseViewLoading(false);
    }
  };

  if (!canViewBattalionSummary) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white">Formations</h2>
        <p className="text-gray-400 mt-2 text-sm">Only Super Admin can manage formations and units.</p>
      </div>
    );
  }

  if (isHqsAdmin && !isSuperAdmin) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Battalions</h2>
          <p className="text-gray-400 text-sm mt-1">Available battalions and their case counts.</p>
        </div>

        {error && <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2 rounded">{error}</div>}

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="text-white font-medium">
                Battalions <span className="text-gray-400 text-xs">({filteredBattalions.length}/{visibleBattalions.length})</span>
              </span>
            </div>
            <input
              type="search"
              value={battalionSearch}
              onChange={(e) => setBattalionSearch(e.target.value)}
              placeholder="Search battalions"
              className="w-full md:w-64 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Battalion</th>
                  <th className="text-left px-4 py-2">Companies</th>
                  <th className="text-left px-4 py-2">Case Count</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
                ) : visibleBattalions.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No battalions found.</td></tr>
                ) : filteredBattalions.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No battalions match your filters.</td></tr>
                ) : filteredBattalions.map((b) => (
                  <tr key={b.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-2 text-white font-medium">{b.name}</td>
                    <td className="px-4 py-2 text-gray-300">
                      <button
                        type="button"
                        onClick={() => openDetachments(b)}
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        {Array.isArray(b.detachments) ? b.detachments.length : 0}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-gray-300">
                      <button
                        type="button"
                        onClick={() => openCases(b)}
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        {b.case_count ?? 0}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {detachmentView && (
          <ModalWrap title={`${detachmentView.battalionName} Companies`} onClose={() => setDetachmentView(null)}>
            {detachmentView.rows.length === 0 ? (
              <p className="text-sm text-gray-400">No companies found.</p>
            ) : (
              <div className="space-y-2">
                {detachmentView.rows.map((d) => (
                  <div key={d.id} className="rounded border border-gray-700 bg-gray-900/50 px-3 py-2">
                    <p className="text-sm text-white font-medium">{d.name || "Unnamed company"}</p>
                    <p className="text-xs text-gray-400">Company: {d.company || " - "} | AOR: {d.aor || " - "}</p>
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
                {caseView.rows.map((c) => (
                  <div key={c.id} className="rounded border border-gray-700 bg-gray-900/50 px-3 py-2">
                    <p className="text-sm text-white font-medium">{c.case_number || `Case #${c.id}`}</p>
                    <p className="text-xs text-gray-400">Status: {c.status || " - "}</p>
                  </div>
                ))}
              </div>
            )}
          </ModalWrap>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">Formation Management</h2>
        <p className="text-gray-400 text-sm mt-1">Manage formations and their units.</p>
      </div>

      {error   && <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2 rounded">{error}</div>}
      {message && <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm px-4 py-2 rounded">{message}</div>}

      {/* ── FORMATIONS ── */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="text-white font-medium">
              Formations <span className="text-gray-400 text-xs">({filteredFormations.length}/{formations.length})</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={formationSearch}
              onChange={(e) => setFormationSearch(e.target.value)}
              placeholder="Search formations"
              className="w-full sm:w-64 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setFmModal({ mode: "add", data: { ...EMPTY_FORMATION } })}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
            >
              + Add Formation
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Location</th>
              <th className="text-left px-4 py-2">Units</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : formations.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No formations found.</td></tr>
            ) : filteredFormations.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No formations match your filters.</td></tr>
            ) : filteredFormations.map((f) => {
              const fUnits = units.filter((u) => String(u.formation) === String(f.id));
              return (
                <tr key={f.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-2 text-white font-medium">{f.name}</td>
                  <td className="px-4 py-2 text-gray-300">{f.location || " - "}</td>
                  <td className="px-4 py-2 text-gray-300">{fUnits.length}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-3">
                      <ABtn label="Edit"   color="blue" onClick={() => setFmModal({ mode: "edit", data: { id: f.id, name: f.name, location: f.location || "" } })} />
                      <ABtn label="Delete" color="red"  onClick={() => setFmDeleteId(f.id)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── UNITS ── */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <span className="text-white font-medium">
              Units <span className="text-gray-400 text-xs">({filteredUnits.length}/{units.length})</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              type="search"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="Search units"
              className="w-full md:w-56 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <select
              value={unitFormationFilter}
              onChange={(e) => setUnitFormationFilter(e.target.value)}
              className="w-full md:w-52 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All formations</option>
              {formations.map((f) => (
                <option key={f.id} value={String(f.id)}>{f.name}</option>
              ))}
            </select>
            <select
              value={unitServiceFilter}
              onChange={(e) => setUnitServiceFilter(e.target.value)}
              className="w-full md:w-36 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All services</option>
              {SERVICES.map((service) => (
                <option key={service.value} value={service.value}>{service.value}</option>
              ))}
            </select>
            <button
              onClick={() => setUnitModal({ mode: "add", data: { ...EMPTY_UNIT } })}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
            >
              + Add Unit
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Formation</th>
              <th className="text-left px-4 py-2">Service</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : units.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No units found.</td></tr>
            ) : filteredUnits.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No units match your filters.</td></tr>
            ) : filteredUnits.map((u) => (
              <tr key={u.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-2 text-white font-medium">{u.name}</td>
                <td className="px-4 py-2 text-gray-300">{u.formation_name || " - "}</td>
                <td className="px-4 py-2 text-gray-300">{u.service || " - "}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-3">
                    <ABtn label="Edit" color="blue" onClick={() => setUnitModal({ mode: "edit", data: {
                      id: u.id, name: u.name, code: u.code || "",
                      formation: u.formation ? String(u.formation) : "",
                      service: u.service || "KA", email: u.email || "",
                      mobile_no: u.mobile_no || "", location_county: u.location_county || "",
                    }})} />
                    <ABtn label="Delete" color="red" onClick={() => setUnitDeleteId(u.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── MODALS ── */}
      {fmModal    && <FormationModal mode={fmModal.mode}   initial={fmModal.data}   saving={fmSaving}   onSave={saveFormation} onClose={() => setFmModal(null)} />}
      {unitModal  && <UnitModal      mode={unitModal.mode} initial={unitModal.data} saving={unitSaving} formations={formations} onSave={saveUnit} onClose={() => setUnitModal(null)} />}
      {fmDeleteId   && <ConfirmDelete label="formation" onConfirm={deleteFormation} onCancel={() => setFmDeleteId(null)} />}
      {unitDeleteId && <ConfirmDelete label="unit"       onConfirm={deleteUnit}      onCancel={() => setUnitDeleteId(null)} />}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
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
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">x</button>
        </div>
        <div className="px-6 py-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function FInput({ label, type = "text", value, onChange, required }) {
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
        {saving ? "Saving..." : mode === "add" ? "Create" : "Save Changes"}
      </button>
    </div>
  );
}

function FormationModal({ mode, initial, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <ModalWrap title={mode === "add" ? "Add Formation" : "Edit Formation"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
        <FInput label="Formation Name *" value={form.name || ""} onChange={s("name")} required />
        <FInput label="Location"         value={form.location || ""} onChange={s("location")} />
        <SaveCancel saving={saving} canSave={!!form.name?.trim()} mode={mode} onClose={onClose} />
      </form>
    </ModalWrap>
  );
}

function UnitModal({ mode, initial, saving, formations, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isArmy = form.service === "KA";
  const canSave = Boolean(form.name?.trim()) && (!isArmy || Boolean(form.formation));
  const setService = (e) => {
    const service = e.target.value;
    setForm((f) => ({
      ...f,
      service,
      formation: service === "KA" ? f.formation : "",
    }));
  };
  return (
    <ModalWrap title={mode === "add" ? "Add Unit" : "Edit Unit"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
        <div>
          <label className="text-xs text-gray-400">Service</label>
          <select value={form.service} onChange={setService}
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
            {SERVICES.map((sv) => (
              <option key={sv.value} value={sv.value}>{sv.label}</option>
            ))}
          </select>
        </div>
        <FInput label="Unit Name *" value={form.name || ""} onChange={s("name")} required />
        <FInput label="Code"        value={form.code || ""} onChange={s("code")} />
        {isArmy && (
        <div>
          <label className="text-xs text-gray-400">Formation *</label>
          <select value={form.formation} onChange={s("formation")} required
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
            <option value="">Select formation...</option>
            {formations.map((f) => (
              <option key={f.id} value={String(f.id)}>{f.name}</option>
            ))}
          </select>
        </div>
        )}
        <FInput label="Unit Mobile No (optional)" value={form.mobile_no || ""} onChange={s("mobile_no")} />
        <FInput label="Unit Email (optional)" type="email" value={form.email || ""} onChange={s("email")} />
        <FInput label="Region/County (optional)" value={form.location_county || ""} onChange={s("location_county")} />
        <SaveCancel saving={saving} canSave={canSave} mode={mode} onClose={onClose} />
      </form>
    </ModalWrap>
  );
}


