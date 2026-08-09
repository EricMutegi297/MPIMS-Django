import React, { useEffect, useState, useCallback } from "react";
import { userService, formationService } from "../services/api";

function SuccessToast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl animate-fade-in-down">
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {message}
    </div>
  );
}

const ROLE_LABELS = {
  admin:        "Admin",
  co:           "Commanding Officer",
  corps_cmd:    "Corps Commander",
  investigator: "Investigator",
  duty_officer: "Duty Officer",
  guardroom_ic: "Guardroom IC",
  detachment:   "IC Det",
  personnel:    "Personnel",
  legal:        "Legal",
  order_nco:    "Order NCO",
  mpc_hqs:      "MPC HQS",
  bsm:          "BSM",
  cop:          "COP",
  adj:          "Adjutant",
  "2ic":        "2nd in Command",
  so1_legal:    "SO 1 Legal",
  so1_ops:      "SO 1 OPs",
  so2_legal:    "SO 2 Legal",
  so2_ops:      "SO 2 OPs",
};

const ROLE_BADGE = {
  admin:        "bg-blue-500/20 text-blue-400",
  co:           "bg-purple-500/20 text-purple-400",
  corps_cmd:    "bg-red-500/20 text-red-400",
  investigator: "bg-indigo-500/20 text-indigo-400",
  duty_officer: "bg-yellow-500/20 text-yellow-400",
  guardroom_ic: "bg-orange-500/20 text-orange-400",
  detachment:   "bg-teal-500/20 text-teal-400",
  personnel:    "bg-gray-500/20 text-gray-400",
  legal:        "bg-pink-500/20 text-pink-400",
  order_nco:    "bg-cyan-500/20 text-cyan-400",
  mpc_hqs:      "bg-green-500/20 text-green-400",
  bsm:          "bg-amber-500/20 text-amber-400",
  cop:          "bg-rose-500/20 text-rose-400",
  adj:          "bg-violet-500/20 text-violet-400",
  "2ic":        "bg-sky-500/20 text-sky-400",
  so1_legal:    "bg-fuchsia-500/20 text-fuchsia-400",
  so1_ops:      "bg-lime-500/20 text-lime-400",
  so2_legal:    "bg-pink-500/20 text-pink-400",
  so2_ops:      "bg-emerald-500/20 text-emerald-400",
};

const GLOBAL_ROLES = ["corps_cmd", "cop", "so1_legal", "so1_ops", "so2_legal", "so2_ops"];

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

export default function Users({ user }) {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const isHqsAdmin      = user?.role === "admin" && user?.battalion_type === "hqs";
  const isSuperuser     = Boolean(user?.is_superuser);
  const isBattalionAdmin = user?.role === "admin" && !isHqsAdmin && !isSuperuser;
  const isDetachmentIC  = user?.role === "detachment";
  const canManage       = isSuperuser || isHqsAdmin || isBattalionAdmin || isDetachmentIC;

  // Roles each actor type can assign
  const ASSIGNABLE_ROLES = isSuperuser || isHqsAdmin
    ? ["admin","co","corps_cmd","investigator","duty_officer","guardroom_ic","detachment","personnel","legal","order_nco","mpc_hqs","bsm","cop","adj","2ic","so1_legal","so1_ops","so2_legal","so2_ops"]
    : isBattalionAdmin
    ? ["co","detachment","personnel","investigator","adj","2ic"]
    : isDetachmentIC
    ? ["personnel","investigator"]
    : [];

  // Roles allowed to edit/delete (for row-level buttons)
  const MANAGED_ROLES = new Set(
    isSuperuser || isHqsAdmin
      ? Object.keys(ROLE_LABELS)
      : isBattalionAdmin
      ? ["co","detachment","personnel","investigator","adj","2ic"]
      : isDetachmentIC
      ? ["personnel","investigator"]
      : []
  );

  // Create user modal state
  const BLANK_FORM = {
    service_number: "", name: "", rank: "", email: "", role: "",
    battalion: "", detachment: "",
  };
  const [showCreate, setShowCreate]     = useState(false);
  const [form, setForm]                 = useState(BLANK_FORM);
  const [battalions, setBattalions]     = useState([]);
  const [detachments, setDetachments]   = useState([]);
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState("");
  const [successMsg, setSuccessMsg]     = useState("");

  // Roles that can optionally be scoped to a detachment
  const DETACHMENT_LEVEL_ROLES = ["detachment", "investigator", "personnel"];

  const loadDetachments = useCallback((battalionId) => {
    if (!battalionId) { setDetachments([]); return; }
    formationService.detachments({ battalion: battalionId, page_size: 200 })
      .then((r) => setDetachments(Array.isArray(r.data) ? r.data : r.data?.results ?? []))
      .catch(() => setDetachments([]));
  }, []);

  // Edit modal state
  const [showEdit, setShowEdit]         = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [editing, setEditing]           = useState(false);
  const [editError, setEditError]       = useState("");

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
    "Staff Sergeant",
    "Sergeant",
    "Corporal",
    "Lance Corporal",
    "Private",
    "Recruit",
  ];

  const openCreate = () => {
    const prefill = {
      ...BLANK_FORM,
      battalion: isBattalionAdmin || isDetachmentIC ? String(user.battalion ?? "") : "",
      detachment: isDetachmentIC ? String(user.detachment ?? "") : "",
    };
    setForm(prefill);
    setCreateError("");
    setDetachments([]);
    setShowCreate(true);
    if (battalions.length === 0) {
      formationService.battalions({ page_size: 200 })
        .then((r) => setBattalions(Array.isArray(r.data) ? r.data : r.data?.results ?? []))
        .catch(() => {});
    }
    // Pre-load detachments when battalion is already known
    if ((isBattalionAdmin || isDetachmentIC) && user.battalion) {
      loadDetachments(String(user.battalion));
    }
  };

  const openEdit = (u) => {
    setEditTarget(u);
    setEditForm({
      name: u.name || "",
      rank: u.rank || "",
      email: u.email || "",
      role: u.role || "",
      is_active: u.is_active,
    });
    setEditError("");
    setShowEdit(true);
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setEditing(true);
    setEditError("");
    try {
      await userService.update(editTarget.id, editForm);
      setShowEdit(false);
      loadUsers();
      setSuccessMsg("User updated successfully.");
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
      setSuccessMsg("User deleted successfully.");
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
    try {
      const payload = { ...form };
      if (!payload.detachment) delete payload.detachment;
      if (!payload.battalion) delete payload.battalion;
      // Ensure battalion is always included; backend enforce-assigns it for battalion admin/IC Det anyway
      if ((isBattalionAdmin || isDetachmentIC) && !payload.battalion) {
        payload.battalion = user?.battalion ?? payload.battalion;
      }
      await userService.create(payload);
      setShowCreate(false);
      loadUsers();
      setSuccessMsg("User created. A password setup link has been sent to their email.");
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
    if (!isHqsAdmin && !isSuperuser && !isDetachmentIC && user?.battalion) {
      params.battalion = user.battalion;
    }
    if (isDetachmentIC && user?.detachment) {
      params.detachment = user.detachment;
    }
    userService
      .list(params)
      .then((res) => setUsers(toArray(res.data)))
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, [isDetachmentIC, isHqsAdmin, isSuperuser, user?.battalion, user?.detachment]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.service_number?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const allRoles = [...new Set(users.map((u) => u.role).filter(Boolean))].sort();

  const title = isHqsAdmin || isSuperuser
    ? "All Users"
    : isDetachmentIC
    ? `${user?.detachment_name ?? "Detachment"}  -  Personnel`
    : user?.battalion_name
    ? `${user.battalion_name}  -  Personnel`
    : "Battalion Personnel";

  return (
    <>
    {successMsg && <SuccessToast message={successMsg} onDone={() => setSuccessMsg("")} />}
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
        {(isBattalionAdmin || isDetachmentIC) && (
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
                  <th className="text-left px-5 py-3 font-medium">Status</th>
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
                            <button
                              onClick={() => setConfirmDeleteId(u.id)}
                              className="text-red-400 hover:text-red-300 text-xs font-medium"
                            >Delete</button>
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
        <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">
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
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
              MPIMS will email this user a secure link to choose their own password.
            </div>
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
                    const clearOrg = GLOBAL_ROLES.includes(newRole);
                    const clearDet = !DETACHMENT_LEVEL_ROLES.includes(newRole);
                    setForm({
                      ...form,
                      role: newRole,
                      battalion: clearOrg ? "" : form.battalion,
                      detachment: clearOrg || clearDet ? "" : form.detachment,
                    });
                    // Load detachments when switching to a detachment-level role and battalion is known
                    if (!clearOrg && DETACHMENT_LEVEL_ROLES.includes(newRole) && form.battalion) {
                      loadDetachments(form.battalion);
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
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Battalion {!GLOBAL_ROLES.includes(form.role) && "*"}
                </label>
                {isSuperuser || isHqsAdmin ? (
                  <select
                    required={!GLOBAL_ROLES.includes(form.role)}
                    value={form.battalion}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm({ ...form, battalion: val, detachment: "" });
                      loadDetachments(val);
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
              {DETACHMENT_LEVEL_ROLES.includes(form.role) && (
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">
                    Detachment <span className="text-gray-500">(optional  -  leave blank for battalion-level)</span>
                  </label>
                  <select
                    value={form.detachment}
                    onChange={(e) => setForm({ ...form, detachment: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value=""> -  Battalion level (no detachment)  - </option>
                    {detachments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
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
        <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
            <h2 className="text-white font-semibold text-base">Edit User  -  {editTarget.name}</h2>
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
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                  ))}
                </select>
              </div>
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
