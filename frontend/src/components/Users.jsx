import React, { useEffect, useState, useCallback } from "react";
import { userService, formationService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

const ROLE_LABELS = {
  admin:        "Admin",
  co:           "Commanding Officer",
  company_cmd:  "Company Commander",
  oc:           "Officer Commanding",
  corps_cmd:    "Corps Commander",
  sec_corps_cmd: "Secretary Corps Commander",
  investigator: "Investigator",
  duty_officer: "Duty Officer",
  hod:          "Head of Department",
  guardroom_ic: "Guardroom IC",
  detachment:   "Detachment IC",
  ic_cases:     "IC Cases",
  det_cmdr:     "Detachment Commander",
  pltn_cmdr:    "Platoon Commander",
  det_2ic:      "Detachment 2IC",
  personnel:    "Personnel",
  legal:        "Legal",
  order_nco:    "Order NCO",
  mpc_hqs:      "MPC HQS",
  bsm:          "BSM",
  cop:          "COP",
  adj:          "Adjutant",
  "2ic":        "2nd in Command",
  docus_clerk:  "Docus Clerk",
  commandant:   "Commandant",
  ci:           "Chief Instructor",
  si:           "SI",
};

const ROLE_BADGE = {
  admin:        "bg-blue-500/20 text-blue-400",
  co:           "bg-purple-500/20 text-purple-400",
  company_cmd:  "bg-violet-500/20 text-violet-300",
  oc:           "bg-fuchsia-500/20 text-fuchsia-400",
  corps_cmd:    "bg-red-500/20 text-red-400",
  investigator: "bg-indigo-500/20 text-indigo-400",
  duty_officer: "bg-yellow-500/20 text-yellow-400",
  hod:          "bg-lime-500/20 text-lime-400",
  guardroom_ic: "bg-orange-500/20 text-orange-400",
  detachment:   "bg-teal-500/20 text-teal-400",
  ic_cases:     "bg-cyan-500/20 text-cyan-300",
  personnel:    "bg-gray-500/20 text-gray-400",
  legal:        "bg-pink-500/20 text-pink-400",
  order_nco:    "bg-cyan-500/20 text-cyan-400",
  mpc_hqs:      "bg-green-500/20 text-green-400",
  bsm:          "bg-amber-500/20 text-amber-400",
  cop:          "bg-rose-500/20 text-rose-400",
  adj:          "bg-violet-500/20 text-violet-400",
  "2ic":        "bg-sky-500/20 text-sky-400",
  docus_clerk:  "bg-emerald-500/20 text-emerald-400",
  commandant:   "bg-blue-500/20 text-blue-300",
  ci:           "bg-teal-500/20 text-teal-300",
  si:           "bg-cyan-500/20 text-cyan-300",
};

const UNIT_COMMAND_ROLES = ["adj", "co", "2ic", "commandant", "ci", "si"];
const UNIT_SCOPED_ROLES = ["docus_clerk", "commandant", "ci", "si"];

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function compactSearchText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function unitLabel(unit) {
  if (!unit) return "";
  return [unit.name, unit.code, unit.service, unit.battalion_name || unit.formation_name, unit.location_county]
    .filter(Boolean)
    .join(" | ");
}

function unitSearchText(unit) {
  return [
    unit?.name,
    unit?.code,
    unit?.service,
    unit?.battalion_name,
    unit?.formation_name,
    unit?.location_county,
    unit?.mobile_no,
    unit?.email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function unitMatches(unit, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  const text = unitSearchText(unit);
  const compactText = compactSearchText(text);
  const compactNeedle = compactSearchText(needle);
  const tokens = needle.split(/\s+/).filter(Boolean);
  return (
    text.includes(needle)
    || (compactNeedle && compactText.includes(compactNeedle))
    || tokens.every((token) => text.includes(token) || compactText.includes(compactSearchText(token)))
  );
}

function unitRank(unit, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return 50;
  const name = String(unit?.name || "").toLowerCase();
  const code = String(unit?.code || "").toLowerCase();
  if (name === needle || code === needle) return 0;
  if (name.startsWith(needle) || code.startsWith(needle)) return 1;
  if (unitSearchText(unit).includes(needle)) return 2;
  return 3;
}

function UnitPicker({ units, value, onChange, disabled = false, placeholder = "Type to search accused unit..." }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = units.find((unit) => String(unit.id) === String(value));
  const visibleUnits = units
    .filter((unit) => unitMatches(unit, query))
    .sort((a, b) => unitRank(a, query) - unitRank(b, query) || unitLabel(a).localeCompare(unitLabel(b)))
    .slice(0, 60);

  return (
    <div className="relative">
      <input
        value={open ? query : unitLabel(selected)}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            setQuery("");
          }, 120);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-300"
      />
      {open && !disabled && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 shadow-xl">
          {visibleUnits.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No matching units found.</div>
          ) : (
            visibleUnits.map((unit) => (
              <button
                key={unit.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(String(unit.id));
                  setOpen(false);
                  setQuery("");
                }}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-blue-600/30 ${
                  String(unit.id) === String(value) ? "bg-blue-600/20 text-blue-200" : "text-gray-100"
                }`}
              >
                <span className="block font-medium">{unit.name || "Unnamed unit"}</span>
                <span className="block text-[11px] text-gray-400">
                  {[unit.code, unit.service, unit.battalion_name || unit.formation_name, unit.location_county]
                    .filter(Boolean)
                    .join(" | ") || "No extra details"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function mfaBadge(user) {
  if (user?.totp_configured) {
    return { label: "Authenticator", className: "bg-blue-500/20 text-blue-300" };
  }
  return { label: "Setup Required", className: "bg-red-500/20 text-red-300" };
}

export default function Users({ user }) {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  useAutoDismiss(error, setError);

  const isHqsAdmin      = user?.role === "admin" && user?.battalion_type === "hqs";
  const isSuperuser     = Boolean(user?.is_superuser);
  const isBattalionAdmin = user?.role === "admin" && !isHqsAdmin && !isSuperuser;
  const isDetachmentIC  = user?.role === "detachment";
  const isDocusClerk    = user?.role === "docus_clerk";
  const isCompanyUserManager =
    ["company_cmd", "pltn_cmdr"].includes(user?.role) && Boolean(user?.company_id);
  const isDetachmentUserManager =
    ["detachment", "det_cmdr"].includes(user?.role) && Boolean(user?.detachment);
  const canCreateUsers  = isSuperuser || isHqsAdmin || isBattalionAdmin || isDocusClerk;
  const canManage       = canCreateUsers || isCompanyUserManager || isDetachmentUserManager;
  const canDeleteUsers  = isSuperuser || isHqsAdmin || isBattalionAdmin || isDocusClerk;
  // Roles each actor type can assign
  const ASSIGNABLE_ROLES = isSuperuser || isHqsAdmin
    ? ["admin","co","company_cmd","oc","corps_cmd","sec_corps_cmd","investigator","duty_officer","hod","guardroom_ic","detachment","ic_cases","det_cmdr","pltn_cmdr","det_2ic","personnel","legal","order_nco","mpc_hqs","bsm","cop","adj","2ic","docus_clerk","commandant","ci","si"]
    : isBattalionAdmin
    ? ["co","company_cmd","oc","detachment","ic_cases","det_cmdr","pltn_cmdr","det_2ic","personnel","investigator","hod","adj","2ic","docus_clerk"]
    : isCompanyUserManager
    ? ["detachment","det_cmdr","pltn_cmdr","det_2ic","personnel","investigator"]
    : isDocusClerk
    ? UNIT_COMMAND_ROLES
    : isDetachmentUserManager
    ? ["personnel","investigator"]
    : [];

  // Roles allowed to edit/delete (for row-level buttons)
  const MANAGED_ROLES = new Set(
    isSuperuser || isHqsAdmin
      ? Object.keys(ROLE_LABELS)
      : isBattalionAdmin
      ? ["co","company_cmd","oc","detachment","ic_cases","det_cmdr","pltn_cmdr","det_2ic","personnel","investigator","hod","adj","2ic","docus_clerk"]
      : isCompanyUserManager || isDetachmentUserManager
      ? Object.keys(ROLE_LABELS)
      : isDocusClerk
      ? UNIT_COMMAND_ROLES
      : []
  );

  // Create user modal state
  const BLANK_FORM = {
    service_number: "", name: "", rank: "", email: "", role: "",
    battalion: "", detachment: "", company: "", ic_cases_scope: "battalion", unit: "",
  };
  const [showCreate, setShowCreate]     = useState(false);
  const [form, setForm]                 = useState(BLANK_FORM);
  const [battalions, setBattalions]     = useState([]);
  const [companies, setCompanies]       = useState([]);
  const [units, setUnits]               = useState([]);
  const [detachments, setDetachments]   = useState([]);
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState("");
  const [createNotice, setCreateNotice] = useState("");
  const [createActivationLink, setCreateActivationLink] = useState("");

  // Roles that can optionally be scoped to a company
  const DETACHMENT_LEVEL_ROLES = ["company_cmd", "detachment", "det_cmdr", "pltn_cmdr", "det_2ic", "investigator", "personnel"];
  const GLOBAL_LEVEL_ROLES = ["corps_cmd", "cop"];
  const roleNeedsUnit = useCallback((role) => (
    UNIT_SCOPED_ROLES.includes(role) || (isDocusClerk && UNIT_COMMAND_ROLES.includes(role))
  ), [isDocusClerk]);

  const loadDetachments = useCallback((battalionId) => {
    if (!battalionId) { setDetachments([]); return; }
    formationService.subDetachments({ "company__battalion": battalionId, page_size: 200 })
      .then((r) => setDetachments(Array.isArray(r.data) ? r.data : r.data?.results ?? []))
      .catch(() => setDetachments([]));
  }, []);

  const loadCompanies = useCallback((battalionId) => {
    if (!battalionId) { setCompanies([]); return; }
    formationService.companies({ battalion: battalionId, page_size: 200 })
      .then((r) => setCompanies(Array.isArray(r.data) ? r.data : r.data?.results ?? []))
      .catch(() => {
        setCompanies([]);
        setError("Failed to load companies for user assignment.");
      });
  }, []);

  const loadUnits = useCallback((battalionId = "") => {
    const params = { page_size: 1000 };
    if (battalionId) params.battalion = battalionId;
    formationService.units(params)
      .then((r) => setUnits(Array.isArray(r.data) ? r.data : r.data?.results ?? []))
      .catch(() => setUnits([]));
  }, []);

  // Edit modal state
  const [showEdit, setShowEdit]         = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [editing, setEditing]           = useState(false);
  const [editError, setEditError]       = useState("");
  useAutoDismiss(createError, setCreateError);
  useAutoDismiss(createNotice, setCreateNotice);
  useAutoDismiss(editError, setEditError);

  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting]               = useState(false);

  const ALL_RANKS = [
    "General",
    "Lieutenant General",
    "Major General",
    "Brigadier",
    "Colonel",
    "Lieutenant Colonel",
    "Major",
    "Captain",
    "Lieutenant",
    "2nd Lieutenant",
    "Warrant Officer Class 1",
    "Warrant Officer Class 2",
    "Senior Sergeant",
    "Sergeant",
    "Corporal",
    "Lance Corporal",
    "Private",
    "Recruit",
  ];

  const openCreate = () => {
    const prefill = {
      ...BLANK_FORM,
      battalion: isBattalionAdmin ? String(user.battalion ?? "") : "",
      unit: isDocusClerk ? String(user.unit ?? "") : "",
      detachment: "",
      company: "",
      ic_cases_scope: "battalion",
    };
    setForm(prefill);
    setCreateError("");
    setCreateNotice("");
    setCreateActivationLink("");
    setDetachments([]);
    setCompanies([]);
    setShowCreate(true);
    if (battalions.length === 0) {
      formationService.battalions({ page_size: 200 })
        .then((r) => setBattalions(Array.isArray(r.data) ? r.data : r.data?.results ?? []))
        .catch(() => {});
    }
    // Pre-load detachments when battalion is already known
    if (isBattalionAdmin && user.battalion) {
      loadDetachments(String(user.battalion));
      loadCompanies(String(user.battalion));
      loadUnits();
    } else if (isDocusClerk) {
      setUnits(user?.unit ? [{ id: user.unit, name: user.unit_name || "Assigned unit" }] : []);
    } else {
      loadUnits();
    }
  };

  const openEdit = (u) => {
    const nextForm = {
      name: u.name || "",
      rank: u.rank || "",
      email: u.email || "",
      role: u.role || "",
      detachment: String(u.detachment ?? ""),
      company: String(u.company ?? ""),
      ic_cases_scope: u.role === "ic_cases"
        ? (u.detachment ? "detachment" : u.company ? "company" : "battalion")
        : "battalion",
      is_active: u.is_active,
    };
    setEditTarget(u);
    setEditForm(nextForm);
    setEditError("");
    setDetachments([]);
    setShowEdit(true);
    if (u.battalion) {
      loadDetachments(String(u.battalion));
      loadCompanies(String(u.battalion));
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setEditing(true);
    setEditError("");
    try {
      const payload = { ...editForm };
      delete payload.ic_cases_scope;
      if (editForm.role === "ic_cases") {
        if (editForm.ic_cases_scope === "company") {
          payload.detachment = null;
          if (!payload.company) {
            setEditError("Select a company for this IC Cases account.");
            return;
          }
        } else if (editForm.ic_cases_scope === "detachment") {
          payload.company = null;
          if (!payload.detachment) {
            setEditError("Select a detachment for this IC Cases account.");
            return;
          }
        } else {
          payload.company = null;
          payload.detachment = null;
        }
      } else if (editTarget.company) {
        payload.company = null;
      } else {
        delete payload.company;
      }
      await userService.update(editTarget.id, payload);
      setShowEdit(false);
      loadUsers();
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        setEditError(Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : v}`).join(" | "));
      } else {
        setEditError("Failed to update user.");
      }
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteUser = async (id) => {
    setDeleting(true);
    try {
      await userService.delete(id);
      setConfirmDeleteId(null);
      loadUsers();
    } catch {
      // silently ignore
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    if (!canCreateUsers) {
      setCreateError("You do not have permission to add users.");
      setCreating(false);
      return;
    }
    if (roleNeedsUnit(form.role) && !form.unit && !(isDocusClerk && user?.unit)) {
      setCreateError("Select the accused unit for this account.");
      setCreating(false);
      return;
    }
    try {
      const payload = { ...form };
      delete payload.ic_cases_scope;
      if (form.role === "ic_cases") {
        if (form.ic_cases_scope === "company") {
          payload.detachment = "";
          if (!payload.company) {
            setCreateError("Select a company for this IC Cases account.");
            return;
          }
        } else if (form.ic_cases_scope === "detachment") {
          payload.company = "";
          if (!payload.detachment) {
            setCreateError("Select a detachment for this IC Cases account.");
            return;
          }
        } else {
          payload.company = "";
          payload.detachment = "";
        }
      } else {
        delete payload.company;
      }
      if (!payload.detachment) delete payload.detachment;
      if (!payload.company) delete payload.company;
      if (!payload.battalion) delete payload.battalion;
      if (!payload.unit) delete payload.unit;
      if (isDocusClerk && user?.unit) payload.unit = user.unit;
      delete payload.password;
      // For battalion admin the backend auto-assigns battalion; for superuser use form value.
      if (isBattalionAdmin) delete payload.battalion;
      const res = await userService.create(payload);
      const email = res.data?.activation_email || payload.email;
      const sent = Boolean(res.data?.activation_email_sent);
      const delivery = res.data?.activation_delivery;
      setCreateActivationLink(res.data?.activation_setup_url || "");
      setCreateNotice(
        sent && delivery === "console"
          ? `Account created. Activation link is available below for ${email}.`
          : sent
          ? `Account created. Activation link sent to ${email}.`
          : `Account created, but activation email could not be sent to ${email}. Use the activation link below and check email settings.`
      );
      setShowCreate(false);
      loadUsers();
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        const msgs = Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : v}`).join(" | ");
        setCreateError(msgs);
      } else {
        setCreateError("Failed to create user.");
      }
    } finally {
      setCreating(false);
    }
  };

  const loadUsers = useCallback(() => {
    setLoading(true);
    setError("");
    const params = { page_size: 200 };
    // Non-HQS/non-superuser battalion restriction
    if (isDocusClerk && user?.unit) {
      params.unit = user.unit;
    } else if (!isHqsAdmin && !isSuperuser && !isDetachmentIC && !isCompanyUserManager && user?.battalion) {
      params.battalion = user.battalion;
    }
    if (isDetachmentIC && user?.detachment) {
      params.detachment = user.detachment;
    }
    if (isCompanyUserManager && user?.company_id) {
      params.company = user.company_id;
    }
    userService
      .list(params)
      .then((res) => setUsers(toArray(res.data)))
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, [isHqsAdmin, isSuperuser, isDetachmentIC, isDocusClerk, isCompanyUserManager, user?.battalion, user?.company_id, user?.detachment, user?.unit]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.service_number?.toLowerCase().includes(search.toLowerCase()) ||
      u.unit_name?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const allRoles = [...new Set(users.map((u) => u.role).filter(Boolean))].sort();

  const title = isHqsAdmin || isSuperuser
    ? "All Users"
    : isDetachmentUserManager
    ? `${user?.detachment_name ?? "Company"} — Personnel`
    : isCompanyUserManager
    ? `${user?.battalion_name ?? "Company"} — Personnel`
    : isDocusClerk
    ? `${user?.unit_name ?? "Unit"} - Unit Command`
    : user?.battalion_name
    ? `${user.battalion_name} — Personnel`
    : "Battalion Personnel";

  return (
    <>
    <div className="p-4 md:p-6 min-h-screen bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          {!loading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} {filtered.length === 1 ? "user" : "users"} found
            </p>
          )}
        </div>
        <button
          onClick={loadUsers}
          className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
        {(isSuperuser || isHqsAdmin) && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </button>
        )}
        {isBattalionAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </button>
        )}
        {isDocusClerk && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or service #..."
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 w-64 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Roles</option>
          {allRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r] || r}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm rounded-lg px-4 py-3 mb-5">
          {error}
        </div>
      )}

      {createNotice && (
        <div className="bg-blue-900/30 border border-blue-700 text-blue-200 text-sm rounded-lg px-4 py-3 mb-5 space-y-2">
          <p>{createNotice}</p>
          {createActivationLink && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                readOnly
                value={createActivationLink}
                className="min-w-0 flex-1 rounded-md border border-blue-700 bg-gray-900 px-3 py-2 font-mono text-xs text-blue-100"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(createActivationLink)}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Copy Link
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p>No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left px-5 py-3 font-medium">Service #</th>
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Rank</th>
                  <th className="text-left px-5 py-3 font-medium">Role</th>
                  <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Battalion</th>
                  <th className="text-left px-5 py-3 font-medium hidden lg:table-cell">Unit</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium hidden xl:table-cell">MFA</th>
                  {canManage && <th className="text-left px-5 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-gray-700/40 hover:bg-gray-700/20 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {u.service_number}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white font-medium">{u.name || "--"}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-400 hidden sm:table-cell">
                      {u.rank || "--"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          ROLE_BADGE[u.role] || "bg-gray-600 text-gray-300"
                        }`}
                      >
                        {ROLE_LABELS[u.role] || u.role || "--"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell">
                      {u.battalion_name || "--"}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs hidden lg:table-cell">
                      {u.unit_name || "--"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                          u.is_active ? "text-green-400" : "text-gray-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.is_active ? "bg-green-400" : "bg-gray-600"
                          }`}
                        />
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden xl:table-cell">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${mfaBadge(u).className}`}>
                        {mfaBadge(u).label}
                      </span>
                    </td>
                    {canManage && MANAGED_ROLES.has(u.role) && (
                      <td className="px-5 py-3">
                        {confirmDeleteId === u.id ? (
                          <span className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400">Delete?</span>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              disabled={deleting}
                              className="text-red-400 hover:text-red-300 font-medium disabled:opacity-60"
                            >Yes</button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-gray-400 hover:text-white"
                            >No</button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <button
                              onClick={() => openEdit(u)}
                              className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                            >Edit</button>
                            {canDeleteUsers && (
                              <button
                                onClick={() => setConfirmDeleteId(u.id)}
                                className="text-red-400 hover:text-red-300 text-xs font-medium"
                              >Delete</button>
                            )}
                          </span>
                        )}
                      </td>
                    )}
                    {canManage && !MANAGED_ROLES.has(u.role) && <td className="px-5 py-3" />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    {/* Create User Modal */}
    {showCreate && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-700 bg-gray-800 shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
            <h2 className="text-white font-semibold text-base">Add New User</h2>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleCreateUser} className="px-6 py-4 space-y-3">
            {createError && (
              <p className="text-red-400 text-xs bg-red-900/30 rounded px-3 py-2">{createError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Service Number *</label>
                <input
                  required value={form.service_number}
                  onChange={(e) => setForm({ ...form, service_number: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Full Name *</label>
                <input
                  required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Rank *</label>
                <select
                  required value={form.rank}
                  onChange={(e) => setForm({ ...form, rank: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select rank</option>
                  {ALL_RANKS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email *</label>
                <input
                  required type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Role *</label>
                <select
                  required value={form.role}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    const isGlobalRole = GLOBAL_LEVEL_ROLES.includes(newRole);
                    const needsUnit = roleNeedsUnit(newRole);
                    const clearDet = !DETACHMENT_LEVEL_ROLES.includes(newRole);
                    setForm({
                      ...form,
                      role: newRole,
                      battalion: isGlobalRole || needsUnit ? "" : form.battalion,
                      detachment: clearDet || isGlobalRole || needsUnit ? "" : form.detachment,
                      company: newRole === "ic_cases" ? form.company : "",
                      ic_cases_scope: newRole === "ic_cases"
                        ? (form.role === "ic_cases" ? form.ic_cases_scope : "battalion")
                        : "battalion",
                      unit: needsUnit ? (isDocusClerk ? String(user?.unit ?? "") : form.unit) : "",
                    });
                    // Load companies when switching to a company-level role and battalion is known
                    if (DETACHMENT_LEVEL_ROLES.includes(newRole) && form.battalion && !isGlobalRole) {
                      loadDetachments(form.battalion);
                    }
                    if (needsUnit && !isDocusClerk) {
                      loadUnits();
                    }
                  }}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select role</option>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                  ))}
                </select>
              </div>
              {!roleNeedsUnit(form.role) && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Battalion {GLOBAL_LEVEL_ROLES.includes(form.role) ? "" : "*"}
                  </label>
                  {GLOBAL_LEVEL_ROLES.includes(form.role) ? (
                    <input
                      readOnly value="No battalion required"
                      className="w-full bg-gray-600 border border-gray-600 text-gray-300 text-sm rounded-lg px-3 py-2 cursor-not-allowed"
                    />
                  ) : isSuperuser || isHqsAdmin ? (
                    <select
                      required={!GLOBAL_LEVEL_ROLES.includes(form.role)} value={form.battalion}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm({ ...form, battalion: val, detachment: "", company: "", unit: "" });
                        loadDetachments(val);
                        loadCompanies(val);
                        loadUnits(val);
                      }}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select battalion</option>
                      {battalions.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      readOnly value={user?.battalion_name ?? user?.battalion ?? ""}
                      className="w-full bg-gray-600 border border-gray-600 text-gray-300 text-sm rounded-lg px-3 py-2 cursor-not-allowed"
                    />
                  )}
                </div>
              )}
              {roleNeedsUnit(form.role) && (
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Accused Unit *</label>
                  {isDocusClerk ? (
                    <input
                      readOnly
                      value={user?.unit_name ?? "Assigned unit"}
                      className="w-full bg-gray-600 border border-gray-600 text-gray-300 text-sm rounded-lg px-3 py-2 cursor-not-allowed"
                    />
                  ) : (
                    <UnitPicker
                      units={units}
                      value={form.unit}
                      onChange={(unit) => setForm({ ...form, unit })}
                      placeholder="Type unit name, code, service, battalion, or location..."
                    />
                  )}
                  {form.role === "docus_clerk" && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      Each accused unit can have two Docus Clerk accounts. A third account must be created by the superuser.
                    </p>
                  )}
                </div>
              )}
              {DETACHMENT_LEVEL_ROLES.includes(form.role) && (
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">
                    {form.role === "company_cmd"
                      ? "Company assignment *"
                      : "Detachment (optional — leave blank for battalion-level)"}
                  </label>
                  <select
                    required={form.role === "company_cmd"}
                    value={form.detachment}
                    onChange={(e) => setForm({ ...form, detachment: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">
                      {form.role === "company_cmd" ? "Select a company" : "— Battalion level (no company) —"}
                    </option>
                    {detachments
                      .filter((d) => {
                        if (isCompanyUserManager) return String(d.company) === String(user?.company_id);
                        if (isDetachmentUserManager) return String(d.id) === String(user?.detachment);
                        return true;
                      })
                      .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.company_code ? `${d.company_code} Coy` : "Coy"}{d.company_name ? ` - ${d.company_name}` : ""} — {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.role === "ic_cases" && (
                <div className="col-span-2 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">IC Cases scope *</label>
                    <select
                      required
                      value={form.ic_cases_scope}
                      onChange={(e) => setForm({
                        ...form,
                        ic_cases_scope: e.target.value,
                        company: "",
                        detachment: "",
                      })}
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="battalion">Battalion-wide</option>
                      <option value="company">Company</option>
                      <option value="detachment">Detachment</option>
                    </select>
                  </div>
                  {form.ic_cases_scope === "company" && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Company *</label>
                      <select
                        required
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select a company</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.company ? `${company.company} Coy` : "Company"} — {company.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {form.ic_cases_scope === "detachment" && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Detachment *</label>
                      <select
                        required
                        value={form.detachment}
                        onChange={(e) => setForm({ ...form, detachment: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select a detachment</option>
                        {detachments.map((detachment) => (
                          <option key={detachment.id} value={detachment.id}>
                            {detachment.company_code ? `${detachment.company_code} Coy` : "Coy"}{detachment.company_name ? ` — ${detachment.company_name}` : ""} / {detachment.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button" onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit" disabled={creating}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
              >
                {creating ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Edit User Modal */}
    {showEdit && editTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-700 bg-gray-800 shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
            <h2 className="text-white font-semibold text-base">Edit User — {editTarget.name}</h2>
            <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleEditUser} className="px-6 py-4 space-y-3">
            {editError && (
              <p className="text-red-400 text-xs bg-red-900/30 rounded px-3 py-2">{editError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Full Name *</label>
                <input
                  required value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Rank *</label>
                <select
                  required value={editForm.rank}
                  onChange={(e) => setEditForm({ ...editForm, rank: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select rank</option>
                  {ALL_RANKS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email *</label>
                <input
                  required type="email" value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Role *</label>
                <select
                  required value={editForm.role}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setEditForm({
                      ...editForm,
                      role: nextRole,
                      detachment: DETACHMENT_LEVEL_ROLES.includes(nextRole)
                        ? editForm.detachment
                        : "",
                      company: nextRole === "ic_cases" ? editForm.company : "",
                      ic_cases_scope: nextRole === "ic_cases"
                        ? (editForm.role === "ic_cases" ? editForm.ic_cases_scope : "battalion")
                        : "battalion",
                    });
                    if (DETACHMENT_LEVEL_ROLES.includes(nextRole) && editTarget?.battalion) {
                      loadDetachments(String(editTarget.battalion));
                    }
                    if (nextRole === "ic_cases" && editTarget?.battalion) {
                      loadCompanies(String(editTarget.battalion));
                      loadDetachments(String(editTarget.battalion));
                    }
                  }}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select role</option>
                  {editTarget?.role && !ASSIGNABLE_ROLES.includes(editTarget.role) && (
                    <option value={editTarget.role} disabled>
                      {ROLE_LABELS[editTarget.role] || editTarget.role} (no role change)
                    </option>
                  )}
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                  ))}
                </select>
              </div>
              {DETACHMENT_LEVEL_ROLES.includes(editForm.role) && (
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">
                    {editForm.role === "company_cmd" ? "Company assignment *" : "Detachment"}
                  </label>
                  <select
                    required={editForm.role === "company_cmd"}
                    value={editForm.detachment || ""}
                    onChange={(e) => setEditForm({ ...editForm, detachment: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">
                      {editForm.role === "company_cmd" ? "Select a company" : "— No detachment —"}
                    </option>
                    {detachments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.company_code ? `${d.company_code} Coy` : "Coy"}{d.company_name ? ` - ${d.company_name}` : ""} — {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {editForm.role === "ic_cases" && (
                <div className="col-span-2 space-y-3">
                  {isSuperuser || isHqsAdmin || isBattalionAdmin ? (
                    <>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">IC Cases scope *</label>
                        <select
                          required
                          value={editForm.ic_cases_scope}
                          onChange={(e) => setEditForm({
                            ...editForm,
                            ic_cases_scope: e.target.value,
                            company: "",
                            detachment: "",
                          })}
                          className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="battalion">Battalion-wide</option>
                          <option value="company">Company</option>
                          <option value="detachment">Detachment</option>
                        </select>
                      </div>
                      {editForm.ic_cases_scope === "company" && (
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Company *</label>
                          <select
                            required
                            value={editForm.company}
                            onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Select a company</option>
                            {companies.map((company) => (
                              <option key={company.id} value={company.id}>
                                {company.company ? `${company.company} Coy` : "Company"} — {company.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {editForm.ic_cases_scope === "detachment" && (
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Detachment *</label>
                          <select
                            required
                            value={editForm.detachment}
                            onChange={(e) => setEditForm({ ...editForm, detachment: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Select a detachment</option>
                            {detachments.map((detachment) => (
                              <option key={detachment.id} value={detachment.id}>
                                {detachment.company_code ? `${detachment.company_code} Coy` : "Coy"}{detachment.company_name ? ` — ${detachment.company_name}` : ""} / {detachment.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">
                      Scope: {editForm.ic_cases_scope === "company"
                        ? "Company"
                        : editForm.ic_cases_scope === "detachment"
                        ? "Detachment"
                        : "Battalion"}
                    </p>
                  )}
                </div>
              )}
              <div className="col-span-2 flex items-center gap-3">
                <label className="text-xs text-gray-400">Account Status</label>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    editForm.is_active
                      ? "bg-green-600/30 text-green-400 hover:bg-red-600/30 hover:text-red-400"
                      : "bg-gray-600/30 text-gray-400 hover:bg-green-600/30 hover:text-green-400"
                  }`}
                >
                  {editForm.is_active ? "Active (click to deactivate)" : "Inactive (click to activate)"}
                </button>
              </div>
              <div className="col-span-2 rounded-lg border border-blue-900 bg-blue-950/40 p-3">
                <p className="text-sm font-semibold text-blue-200">Authenticator MFA is mandatory</p>
                <p className="mt-1 text-xs text-blue-100/70">
                  Every MPIMS account must configure Google Authenticator before accessing operational data.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button" onClick={() => setShowEdit(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit" disabled={editing}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
              >
                {editing ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
