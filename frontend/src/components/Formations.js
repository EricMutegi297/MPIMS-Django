import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { caseService, formationService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toArr(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function searchable(value) {
  return String(value ?? "").trim().toLowerCase();
}

function countLabel(filtered, total) {
  return filtered === total ? `(${total})` : `(${filtered}/${total})`;
}

function battalionAllowsCompanies(battalion) {
  return String(battalion?.battalion_type || "normal").toLowerCase() === "normal";
}

function companyLabel(detachment) {
  return detachment?.company ? `${detachment.company} Coy` : "Coy";
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SERVICES = [
  { value: "KA",  label: "Kenya Army (KA)" },
  { value: "KAF", label: "Kenya Air Force (KAF)" },
  { value: "KN",  label: "Kenya Navy (KN)" },
];
const BATTALION_TYPES = [
  { value: "normal", label: "Normal" },
  { value: "special", label: "Special" },
  { value: "hqs", label: "HQs" },
  { value: "protection", label: "Protection" },
];
const EMPTY_FORMATION = { name: "", location: "" };
const EMPTY_UNIT = { name: "", code: "", formation: "", service: "KA", email: "", mobile_no: "", location_county: "" };
const EMPTY_BATTALION = {
  name: "",
  code: "",
  battalion_type: "normal",
  email: "",
  phone: "",
  aor: "",
};
const COMPANY_OPTIONS = ["A", "B", "C", "D"];
const EMPTY_DETACHMENT = {
  battalion: "",
  company: "A",
  name: "",
  aor: "",
  mobile_no: "",
  email: "",
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function Formations({ user, mode = "formations" }) {
  const navigate = useNavigate();
  const [formations, setFormations] = useState([]);
  const [units,      setUnits]      = useState([]);
  const [battalions, setBattalions] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [message,    setMessage]    = useState("");
  const [formationQuery, setFormationQuery] = useState("");
  const [unitQuery, setUnitQuery] = useState("");
  const [unitFormationFilter, setUnitFormationFilter] = useState("");
  const [unitServiceFilter, setUnitServiceFilter] = useState("");
  const [formationVisibleLimit, setFormationVisibleLimit] = useState(25);
  const [unitVisibleLimit, setUnitVisibleLimit] = useState(50);
  useAutoDismiss(message, setMessage);
  useAutoDismiss(error, setError);

  const [fmModal,      setFmModal]      = useState(null);
  const [fmSaving,     setFmSaving]     = useState(false);
  const [fmDeleteId,   setFmDeleteId]   = useState(null);
  const [bnModal,      setBnModal]      = useState(null);
  const [bnSaving,     setBnSaving]     = useState(false);
  const [bnDeleteId,   setBnDeleteId]   = useState(null);
  const [detModal,     setDetModal]     = useState(null);
  const [detSaving,    setDetSaving]    = useState(false);
  const [detDeleteId,  setDetDeleteId]  = useState(null);

  const [unitModal,    setUnitModal]    = useState(null);
  const [unitSaving,   setUnitSaving]   = useState(false);
  const [unitDeleteId, setUnitDeleteId] = useState(null);
  const [detachmentView, setDetachmentView] = useState(null);
  const [caseView, setCaseView] = useState(null);
  const [caseViewLoading, setCaseViewLoading] = useState(false);

  const isSuperAdmin = Boolean(user?.is_superuser);
  const isHqsAdmin = user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() === "hqs";
  const isCorpsCommander = user?.role === "corps_cmd";
  const canViewBattalionSummary = isSuperAdmin || isHqsAdmin || isCorpsCommander;
  const showBattalionSummary = mode === "battalions" && canViewBattalionSummary;
  const visibleBattalions = battalions.filter(
    (b) => isSuperAdmin || String(b?.battalion_type || "").toLowerCase() !== "hqs"
  );

  const filteredFormations = useMemo(() => {
    const query = searchable(formationQuery);
    if (!query) return formations;
    return formations.filter((formation) => (
      searchable(formation.name).includes(query) ||
      searchable(formation.location).includes(query)
    ));
  }, [formations, formationQuery]);

  const filteredUnits = useMemo(() => {
    const query = searchable(unitQuery);
    return units.filter((unit) => {
      const matchesSearch = !query || [
        unit.name,
        unit.code,
        unit.formation_name,
        unit.service,
        unit.email,
        unit.mobile_no,
        unit.location_county,
      ].some((value) => searchable(value).includes(query));
      const matchesFormation = !unitFormationFilter
        || (unitFormationFilter === "__none__" && !unit.formation)
        || String(unit.formation) === String(unitFormationFilter);
      const matchesService = !unitServiceFilter || String(unit.service) === String(unitServiceFilter);
      return matchesSearch && matchesFormation && matchesService;
    });
  }, [units, unitQuery, unitFormationFilter, unitServiceFilter]);

  const serviceCounts = useMemo(() => SERVICES.map((service) => ({
    ...service,
    count: units.filter((unit) => unit.service === service.value).length,
  })), [units]);
  const ungroupedUnitCount = useMemo(() => units.filter((unit) => !unit.formation).length, [units]);
  const visibleFormationsForTable = filteredFormations.slice(0, formationVisibleLimit);
  const visibleUnitsForTable = filteredUnits.slice(0, unitVisibleLimit);

  const hasFormationFilter = Boolean(formationQuery.trim());
  const hasUnitFilter = Boolean(unitQuery.trim() || unitFormationFilter || unitServiceFilter);
  const clearFormationFilters = () => {
    setFormationQuery("");
    setFormationVisibleLimit(25);
  };
  const clearUnitFilters = () => {
    setUnitQuery("");
    setUnitFormationFilter("");
    setUnitServiceFilter("");
    setUnitVisibleLimit(50);
  };

  const loadAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [fRes, uRes, bRes] = await Promise.all([
        formationService.formations(),
        formationService.units({ page_size: 500 }),
        formationService.battalions({ page_size: 500 }),
      ]);
      const nextFormations = toArr(fRes.data);
      const nextUnits = toArr(uRes.data);
      const nextBattalions = toArr(bRes.data);
      setFormations(nextFormations);
      setUnits(nextUnits);
      setBattalions(nextBattalions);
      return { formations: nextFormations, units: nextUnits, battalions: nextBattalions };
    } catch {
      setError("Failed to load data.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Formation CRUD ──
  const saveFormation = async (form) => {
    setFmSaving(true); setError(""); setMessage("");
    const adding = fmModal.mode === "add";
    try {
      if (adding) {
        await formationService.createFormation(form);
        setMessage("Formation created.");
      } else {
        await formationService.updateFormation(fmModal.data.id, form);
        setMessage("Formation updated.");
      }
      await loadAll();
      if (adding && window.confirm("Formation created successfully. Add another formation?")) {
        setFmModal({ mode: "add", data: { ...EMPTY_FORMATION }, key: Date.now() });
      } else {
        setFmModal(null);
      }
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
  const saveBattalion = async (form) => {
    setBnSaving(true); setError(""); setMessage("");
    try {
      if (bnModal.mode === "add") {
        await formationService.createBattalion(form);
        setMessage("Battalion created.");
      } else {
        await formationService.updateBattalion(bnModal.data.id, form);
        setMessage("Battalion updated.");
      }
      setBnModal(null);
      await loadAll();
    } catch (err) {
      const d = err.response?.data;
      setError(
        d?.name?.[0] ||
        d?.formation?.[0] ||
        d?.battalion_type?.[0] ||
        d?.detail ||
        "Failed to save battalion."
      );
    } finally {
      setBnSaving(false);
    }
  };

  const deleteBattalion = async () => {
    setError(""); setMessage("");
    try {
      await formationService.deleteBattalion(bnDeleteId);
      setBnDeleteId(null);
      setMessage("Battalion deleted.");
      await loadAll();
    } catch {
      setError("Failed to delete battalion.");
    }
  };

  const syncDetachmentView = (nextBattalions) => {
    setDetachmentView((current) => {
      if (!current?.battalionId) return current;
      const battalion = nextBattalions.find((b) => String(b.id) === String(current.battalionId));
      if (!battalion) return current;
      return {
        ...current,
        battalionName: battalion.name || current.battalionName,
        battalionType: battalion.battalion_type || current.battalionType,
        rows: Array.isArray(battalion.detachments) ? battalion.detachments : [],
      };
    });
  };

  const openCompanyModal = (battalion, detachment = null) => {
    const currentBattalion = battalion || (detachmentView ? {
      id: detachmentView.battalionId,
      name: detachmentView.battalionName,
      battalion_type: detachmentView.battalionType,
    } : null);
    const battalionId = detachment?.battalion || currentBattalion?.id;
    if (!battalionId) return;

    setDetModal({
      mode: detachment ? "edit" : "add",
      data: detachment ? {
        id: detachment.id,
        battalion: String(battalionId),
        battalionName: currentBattalion?.name || detachmentView?.battalionName || "Battalion",
        company: detachment.company || "A",
        name: detachment.name || "",
        aor: detachment.aor || "",
        mobile_no: detachment.mobile_no || "",
        email: detachment.email || "",
      } : {
        ...EMPTY_DETACHMENT,
        battalion: String(battalionId),
        battalionName: currentBattalion?.name || "Battalion",
      },
    });
  };

  const saveDetachment = async (form) => {
    setDetSaving(true); setError(""); setMessage("");
    const adding = detModal.mode === "add";
    try {
      const values = { ...form };
      delete values.battalionName;
      const payload = { ...values, battalion: Number(values.battalion) };
      if (adding) {
        await formationService.createDetachment(payload);
        setMessage("Company created.");
      } else {
        await formationService.updateDetachment(detModal.data.id, payload);
        setMessage("Company updated.");
      }
      const loaded = await loadAll();
      if (loaded?.battalions) syncDetachmentView(loaded.battalions);
      if (adding && window.confirm("Company created successfully. Add another Coy?")) {
        setDetModal({
          mode: "add",
          data: {
            ...EMPTY_DETACHMENT,
            battalion: String(payload.battalion),
            battalionName: form.battalionName || "Battalion",
          },
          key: Date.now(),
        });
      } else {
        setDetModal(null);
      }
    } catch (err) {
      const d = err.response?.data;
      setError(
        d?.battalion?.[0] ||
        d?.company?.[0] ||
        d?.name?.[0] ||
        d?.aor?.[0] ||
        d?.detail ||
        "Failed to save company."
      );
    } finally {
      setDetSaving(false);
    }
  };

  const deleteDetachment = async () => {
    setError(""); setMessage("");
    try {
      await formationService.deleteDetachment(detDeleteId);
      setDetDeleteId(null);
      setMessage("Company deleted.");
      const loaded = await loadAll();
      if (loaded?.battalions) syncDetachmentView(loaded.battalions);
    } catch {
      setError("Failed to delete company.");
    }
  };

  const saveUnit = async (form) => {
    setUnitSaving(true); setError(""); setMessage("");
    const adding = unitModal.mode === "add";
    try {
      const payload = { ...form, formation: form.formation ? Number(form.formation) : null };
      if (adding) {
        await formationService.createUnit(payload);
        setMessage("Unit created.");
      } else {
        await formationService.updateUnit(unitModal.data.id, payload);
        setMessage("Unit updated.");
      }
      await loadAll();
      if (adding && window.confirm("Unit created successfully. Add another unit?")) {
        setUnitModal({ mode: "add", data: { ...EMPTY_UNIT, service: form.service || "KA" }, key: Date.now() });
      } else {
        setUnitModal(null);
      }
    } catch (err) {
      const d = err.response?.data;
      setError(d?.name?.[0] || d?.detail || "Failed to save unit.");
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
      battalionId: battalion?.id,
      battalionName: battalion?.name || "Battalion",
      battalionType: battalion?.battalion_type || "normal",
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

  const openCompanyCases = (detachment) => {
    if (!detachment?.id) return;
    navigate(`/dashboard/cases?tasked_detachment=${encodeURIComponent(detachment.id)}`);
  };

  if (mode === "battalions" && !canViewBattalionSummary) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white">Battalions</h2>
        <p className="text-gray-400 mt-2 text-sm">Only Corps Commander, HQ Admin, or Super Admin can view all battalions.</p>
      </div>
    );
  }

  if (mode !== "battalions" && !isSuperAdmin) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white">Formations</h2>
        <p className="text-gray-400 mt-2 text-sm">Only Super Admin can manage formations and units.</p>
      </div>
    );
  }

  if (showBattalionSummary) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Battalions</h2>
          <p className="text-gray-400 text-sm mt-1">Available battalions and their case counts.</p>
        </div>

        {error && <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2 rounded">{error}</div>}
        {message && <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm px-4 py-2 rounded">{message}</div>}

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
            <span className="text-white font-medium">
              Battalions <span className="text-gray-400 text-xs">({visibleBattalions.length})</span>
            </span>
            {isSuperAdmin && (
              <button
                onClick={() => setBnModal({ mode: "add", data: { ...EMPTY_BATTALION } })}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
              >
                + Add Battalion
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Battalion</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Companies</th>
                  <th className="text-left px-4 py-2">Case Count</th>
                  {isSuperAdmin && <th className="text-left px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isSuperAdmin ? 5 : 4} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
                ) : visibleBattalions.length === 0 ? (
                  <tr><td colSpan={isSuperAdmin ? 5 : 4} className="px-4 py-8 text-center text-gray-500">No battalions found.</td></tr>
                ) : visibleBattalions.map((b) => (
                  <tr key={b.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-2 text-white font-medium">
                      <div>{b.name}</div>
                      {(b.code || b.email || b.phone) && (
                        <div className="mt-0.5 text-xs text-gray-500">
                          {[b.code, b.email, b.phone].filter(Boolean).join(" | ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-300 capitalize">
                      {String(b.battalion_type || "normal").replace(/_/g, " ")}
                    </td>
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
                    {isSuperAdmin && (
                      <td className="px-4 py-2">
                        <div className="flex gap-3">
                          <ABtn
                            label="Edit"
                            color="blue"
                            onClick={() => setBnModal({ mode: "edit", data: {
                              id: b.id,
                              name: b.name || "",
                              code: b.code || "",
                              battalion_type: b.battalion_type || "normal",
                              email: b.email || "",
                              phone: b.phone || "",
                              aor: b.aor || "",
                            }})}
                          />
                          {battalionAllowsCompanies(b) && (
                            <ABtn label="Add Coy" color="blue" onClick={() => openCompanyModal(b)} />
                          )}
                          <ABtn label="Delete" color="red" onClick={() => setBnDeleteId(b.id)} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {detachmentView && (
          <ModalWrap title={`${detachmentView.battalionName} Companies`} onClose={() => setDetachmentView(null)}>
            {isSuperAdmin && battalionAllowsCompanies(detachmentView) && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => openCompanyModal(null)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                >
                  + Add Coy
                </button>
              </div>
            )}
            {detachmentView.rows.length === 0 ? (
              <p className="text-sm text-gray-400">No companies found.</p>
            ) : (
              <div className="space-y-2">
                {detachmentView.rows.map((d) => (
                  <div key={d.id} className="rounded border border-gray-700 bg-gray-900/50 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openCompanyCases(d)}
                      className="w-full text-left transition-colors hover:text-blue-300"
                    >
                      <p className="text-sm text-white font-medium">
                        {companyLabel(d)}
                      </p>
                      <p className="text-xs text-gray-400">Name: {d.name || "—"} | AOR: {d.aor || "—"}</p>
                      <p className="text-xs text-blue-400 mt-1">
                        Case Count: <span className="underline underline-offset-2">{d.case_count ?? 0}</span>
                      </p>
                    </button>
                    {isSuperAdmin && (
                      <div className="mt-2 flex gap-3 border-t border-gray-700/70 pt-2">
                        <ABtn label="Edit" color="blue" onClick={() => openCompanyModal(null, d)} />
                        <ABtn label="Delete" color="red" onClick={() => setDetDeleteId(d.id)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ModalWrap>
        )}

        {caseView && (
          <ModalWrap title={`${caseView.battalionName} Cases`} onClose={() => setCaseView(null)}>
            {caseViewLoading ? (
              <p className="text-sm text-gray-400">Loading cases…</p>
            ) : caseView.rows.length === 0 ? (
              <p className="text-sm text-gray-400">No cases found.</p>
            ) : (
              <div className="space-y-2">
                {caseView.rows.map((c) => (
                  <div key={c.id} className="rounded border border-gray-700 bg-gray-900/50 px-3 py-2">
                    <p className="text-sm text-white font-medium">{c.case_number || `Case #${c.id}`}</p>
                    <p className="text-xs text-gray-400">Status: {c.status || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </ModalWrap>
        )}

        {bnModal && (
          <BattalionModal
            mode={bnModal.mode}
            initial={bnModal.data}
            saving={bnSaving}
            onSave={saveBattalion}
            onClose={() => setBnModal(null)}
          />
        )}
        {bnDeleteId && (
          <ConfirmDelete
            label="battalion"
            onConfirm={deleteBattalion}
            onCancel={() => setBnDeleteId(null)}
          />
        )}
        {detModal && (
          <CompanyModal
            key={detModal.key || `${detModal.mode}-${detModal.data?.id || detModal.data?.battalion || "new"}`}
            mode={detModal.mode}
            initial={detModal.data}
            saving={detSaving}
            onSave={saveDetachment}
            onClose={() => setDetModal(null)}
          />
        )}
        {detDeleteId && (
          <ConfirmDelete
            label="company"
            onConfirm={deleteDetachment}
            onCancel={() => setDetDeleteId(null)}
          />
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
        <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <span className="text-white font-medium">
            Formations <span className="text-gray-400 text-xs">{countLabel(filteredFormations.length, formations.length)}</span>
          </span>
          <button
            onClick={() => setFmModal({ mode: "add", data: { ...EMPTY_FORMATION } })}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
          >
            + Add Formation
          </button>
        </div>
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/30">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              type="search"
              value={formationQuery}
              onChange={(event) => setFormationQuery(event.target.value)}
              placeholder="Search formations by name or location..."
              className="w-full sm:max-w-md bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            />
            {hasFormationFilter && (
              <button
                type="button"
                onClick={clearFormationFilters}
                className="px-3 py-2 text-xs text-gray-300 hover:text-white border border-gray-600 rounded transition-colors"
              >
                Clear
              </button>
            )}
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
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : formations.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No formations found.</td></tr>
            ) : filteredFormations.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No matching formations found.</td></tr>
            ) : visibleFormationsForTable.map((f) => {
              const fUnits = units.filter((u) => String(u.formation) === String(f.id));
              return (
                <tr key={f.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-2 text-white font-medium">{f.name}</td>
                  <td className="px-4 py-2 text-gray-300">{f.location || "—"}</td>
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
        {filteredFormations.length > visibleFormationsForTable.length && (
          <div className="border-t border-gray-700 px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => setFormationVisibleLimit((limit) => limit + 25)}
              className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
            >
              Show more formations ({filteredFormations.length - visibleFormationsForTable.length} remaining)
            </button>
          </div>
        )}
      </div>

      {/* ── UNITS ── */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <span className="text-white font-medium">
            Units <span className="text-gray-400 text-xs">{countLabel(filteredUnits.length, units.length)}</span>
          </span>
          <button
            onClick={() => setUnitModal({ mode: "add", data: { ...EMPTY_UNIT } })}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
          >
            + Add Unit
          </button>
        </div>
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/30">
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {serviceCounts.map((service) => (
              <button
                key={service.value}
                type="button"
                onClick={() => {
                  setUnitServiceFilter((current) => current === service.value ? "" : service.value);
                  setUnitVisibleLimit(50);
                }}
                className={`rounded border px-3 py-2 text-left transition-colors ${
                  unitServiceFilter === service.value
                    ? "border-blue-500 bg-blue-600/20 text-blue-200"
                    : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
                }`}
              >
                <span className="block font-semibold">{service.value}</span>
                <span className="text-gray-400">{service.count} units</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setUnitFormationFilter((current) => current === "__none__" ? "" : "__none__");
                setUnitVisibleLimit(50);
              }}
              className={`rounded border px-3 py-2 text-left transition-colors ${
                unitFormationFilter === "__none__"
                  ? "border-amber-500 bg-amber-600/20 text-amber-200"
                  : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
              }`}
            >
              <span className="block font-semibold">Service-level</span>
              <span className="text-gray-400">{ungroupedUnitCount} units</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_minmax(180px,240px)_minmax(150px,180px)_auto] gap-2">
            <input
              type="search"
              value={unitQuery}
              onChange={(event) => {
                setUnitQuery(event.target.value);
                setUnitVisibleLimit(50);
              }}
              placeholder="Search units by name, code, contact, county..."
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            />
            <select
              value={unitFormationFilter}
              onChange={(event) => {
                setUnitFormationFilter(event.target.value);
                setUnitVisibleLimit(50);
              }}
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="">All formations</option>
              <option value="__none__">No formation / service-level</option>
              {formations.map((formation) => (
                <option key={formation.id} value={String(formation.id)}>{formation.name}</option>
              ))}
            </select>
            <select
              value={unitServiceFilter}
              onChange={(event) => {
                setUnitServiceFilter(event.target.value);
                setUnitVisibleLimit(50);
              }}
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="">All services</option>
              {SERVICES.map((service) => (
                <option key={service.value} value={service.value}>{service.value}</option>
              ))}
            </select>
            {hasUnitFilter && (
              <button
                type="button"
                onClick={clearUnitFilters}
                className="px-3 py-2 text-xs text-gray-300 hover:text-white border border-gray-600 rounded transition-colors"
              >
                Clear
              </button>
            )}
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
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : units.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No units found.</td></tr>
            ) : filteredUnits.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No matching units found.</td></tr>
            ) : visibleUnitsForTable.map((u) => (
              <tr key={u.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-2 text-white font-medium">{u.name}</td>
                <td className="px-4 py-2 text-gray-300">{u.formation_name || "Service-level"}</td>
                <td className="px-4 py-2 text-gray-300">{u.service || "—"}</td>
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
        {filteredUnits.length > visibleUnitsForTable.length && (
          <div className="border-t border-gray-700 px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => setUnitVisibleLimit((limit) => limit + 50)}
              className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
            >
              Show more units ({filteredUnits.length - visibleUnitsForTable.length} remaining)
            </button>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {fmModal    && <FormationModal key={fmModal.key || `${fmModal.mode}-${fmModal.data?.id || "new"}`} mode={fmModal.mode}   initial={fmModal.data}   saving={fmSaving}   onSave={saveFormation} onClose={() => setFmModal(null)} />}
      {unitModal  && <UnitModal      key={unitModal.key || `${unitModal.mode}-${unitModal.data?.id || unitModal.data?.service || "new"}`} mode={unitModal.mode} initial={unitModal.data} saving={unitSaving} formations={formations} onSave={saveUnit} onClose={() => setUnitModal(null)} />}
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
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
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
        {saving ? "Saving…" : mode === "add" ? "Create" : "Save Changes"}
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

function BattalionModal({ mode = "add", initial, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <ModalWrap title={mode === "add" ? "Add Battalion" : "Edit Battalion"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
        <FInput label="Battalion Name *" value={form.name || ""} onChange={s("name")} required />
        <FInput label="Code" value={form.code || ""} onChange={s("code")} />
        <div>
          <label className="text-xs text-gray-400">Type</label>
          <select value={form.battalion_type} onChange={s("battalion_type")}
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
            {BATTALION_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
        <FInput label="AOR" value={form.aor || ""} onChange={s("aor")} />
        <FInput label="Phone" value={form.phone || ""} onChange={s("phone")} />
        <FInput label="Email" type="email" value={form.email || ""} onChange={s("email")} />
        <SaveCancel saving={saving} canSave={!!form.name?.trim()} mode={mode} onClose={onClose} />
      </form>
    </ModalWrap>
  );
}

function CompanyModal({ mode = "add", initial, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <ModalWrap title={mode === "add" ? "Add Coy" : "Edit Coy"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
        {form.battalionName && (
          <div>
            <label className="text-xs text-gray-400">Battalion</label>
            <div className="mt-1 w-full bg-gray-900/50 text-gray-200 text-sm px-3 py-2 rounded border border-gray-700">
              {form.battalionName}
            </div>
          </div>
        )}
        <div>
          <label className="text-xs text-gray-400">Coy *</label>
          <select value={form.company || "A"} onChange={s("company")} required
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
            {COMPANY_OPTIONS.map((company) => (
              <option key={company} value={company}>{company} Coy</option>
            ))}
          </select>
        </div>
        <FInput label="Company Name *" value={form.name || ""} onChange={s("name")} required />
        <FInput label="AOR" value={form.aor || ""} onChange={s("aor")} />
        <FInput label="Mobile No" value={form.mobile_no || ""} onChange={s("mobile_no")} />
        <FInput label="Email" type="email" value={form.email || ""} onChange={s("email")} />
        <SaveCancel
          saving={saving}
          canSave={!!form.battalion && !!form.company && !!form.name?.trim()}
          mode={mode}
          onClose={onClose}
        />
      </form>
    </ModalWrap>
  );
}

function UnitModal({ mode, initial, saving, formations, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isArmyUnit = form.service === "KA";
  const canSave = !!form.name?.trim() && (!isArmyUnit || !!form.formation);
  return (
    <ModalWrap title={mode === "add" ? "Add Unit" : "Edit Unit"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
        <FInput label="Unit Name *" value={form.name || ""} onChange={s("name")} required />
        <FInput label="Code"        value={form.code || ""} onChange={s("code")} />
        <div>
          <label className="text-xs text-gray-400">Formation {isArmyUnit ? "*" : "(Army only)"}</label>
          <select
            value={form.formation}
            onChange={s("formation")}
            required={isArmyUnit}
            disabled={!isArmyUnit}
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select formation…</option>
            {formations.map((f) => (
              <option key={f.id} value={String(f.id)}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Service</label>
          <select
            value={form.service}
            onChange={(event) => setForm((current) => ({
              ...current,
              service: event.target.value,
              formation: event.target.value === "KA" ? current.formation : "",
            }))}
            className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
            {SERVICES.map((sv) => (
              <option key={sv.value} value={sv.value}>{sv.label}</option>
            ))}
          </select>
        </div>
        <FInput label="Mobile No"         value={form.mobile_no || ""}       onChange={s("mobile_no")} />
        <FInput label="Email" type="email" value={form.email || ""}           onChange={s("email")} />
        <FInput label="Location / County" value={form.location_county || ""} onChange={s("location_county")} />
        {!isArmyUnit && (
          <p className="text-[11px] text-gray-500">
            Air Force and Navy units are kept as service-level units, not under Army formations.
          </p>
        )}
        <SaveCancel saving={saving} canSave={canSave} mode={mode} onClose={onClose} />
      </form>
    </ModalWrap>
  );
}


