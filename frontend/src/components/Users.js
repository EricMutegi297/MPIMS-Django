import React, { useEffect, useState, useCallback } from "react";
import api from "../axiosConfig";
import { formationService } from "../services/api";

const ROLE_LABELS = {
  admin: "Admin",
  co: "Commanding Officer",
  corps_cmd: "Corps Commander",
  investigator: "Investigator",
  duty_officer: "Duty Officer",
  guardroom_ic: "Guardroom IC",
  detachment: "Detachment IC",
  personnel: "Personnel",
  legal: "Legal Officer",
  order_nco: "Order NCO",
  mpc_hqs: "MPC HQS Admin",
  bsm: "BSM",
  cop: "COP",
};

const RANKS = [
  // Officers
  "General",
  "Lieutenant General",
  "Major General",
  "Brigadier",
  "Colonel",
  "Lieutenant Colonel",
  "Major",
  "Captain",
  "Lieutenant",
  "Second Lieutenant",
  // Senior NCOs
  "Warrant Officer Class 1",
  "Warrant Officer Class 2",
  "Senior Sergeant",
  "Sergeant",
  // Junior NCOs & Enlisted
  "Corporal",
  "Lance Corporal",
  "Private",
  "Recruit",
];

export default function Users({ user }) {
  const [users, setUsers] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canCreate = user?.is_superuser || ["admin", "mpc_hqs"].includes(user?.role);

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/auth/users/${deleteUser.id}/`);
      setDeleteUser(null);
      load();
    } catch {}
    finally { setDeleteLoading(false); }
  };

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/api/auth/users/", { params: { page } })
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
        setUsers(items);
        setCount(r.data?.count ?? items.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(count / 20);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Users</h2>
          <p className="text-gray-400 text-sm mt-0.5">{count} total</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            + Add User
          </button>
        )}
      </div>

      <div className="bg-gray-800 rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 whitespace-nowrap">Service #</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Rank</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Role</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Email</th>
              <th className="text-left px-4 py-3">Active</th>
              {canCreate && <th className="text-left px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canCreate ? 7 : 6} className="px-4 py-10 text-center text-gray-500">Loading…</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={canCreate ? 7 : 6} className="px-4 py-10 text-center text-gray-500">No users found.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-blue-400 font-mono whitespace-nowrap">{u.service_number}</td>
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{u.name}</div>
                    {u.rank && <div className="text-gray-500 text-xs mt-0.5 md:hidden">{u.rank}</div>}
                    <div className="sm:hidden mt-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 hidden md:table-cell">{u.rank || "—"}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{u.email || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canCreate && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditUser(u)}
                          className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteUser(u)}
                          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4 text-sm text-gray-400">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <UserForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {editUser && (
        <EditUserForm
          target={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load(); }}
        />
      )}

      {deleteUser && (
        <ConfirmDelete
          name={deleteUser.name || deleteUser.service_number}
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteUser(null)}
        />
      )}
    </div>
  );
}

function UserForm({ onClose, onSaved }) {
  const [saved, setSaved] = useState(false);
  const [savedName, setSavedName] = useState("");
  const EXEMPT_ROLES = ["corps_cmd", "cop"];

  const [form, setForm] = useState({
    service_number: "", name: "", rank: "", email: "",
    role: "personnel", password: "", must_change_password: true,
    battalion: "", detachment: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [battalions, setBattalions] = useState([]);
  const [detachments, setDetachments] = useState([]);

  useEffect(() => {
    formationService.battalions().then((r) => {
      const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
      setBattalions(items);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.battalion) { setDetachments([]); return; }
    formationService.detachments({ battalion: form.battalion }).then((r) => {
      const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
      setDetachments(items);
    }).catch(() => {});
  }, [form.battalion]);

  const needsBattalion = !EXEMPT_ROLES.includes(form.role);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    // Build payload — omit empty optional fields
    const payload = { ...form };
    if (!payload.battalion) delete payload.battalion;
    if (!payload.detachment) delete payload.detachment;
    if (!payload.rank) delete payload.rank;
    if (!payload.email) delete payload.email;
    try {
      await api.post("/api/auth/users/", payload);
      setSavedName(form.name || form.service_number);
      setSaved(true);
    } catch (err) {
      const data = err.response?.data;
      setError(
        typeof data === "object"
          ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ")
          : String(data ?? "Failed to create user.")
      );
      setSaving(false);
    }
  };

  const textFields = [
    ["Service Number *", "service_number", true, "text"],
    ["Full Name *", "name", true, "text"],
    ["Email", "email", false, "email"],
  ];

  // ── Success confirmation screen ──────────────────────────
  if (saved) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700 p-8 text-center">
          <div className="w-14 h-14 bg-green-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-lg mb-1">User Added</h3>
          <p className="text-gray-400 text-sm mb-6">
            <span className="text-white font-medium">{savedName}</span> was successfully created.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setSaved(false);
                setSavedName("");
                setForm({ service_number: "", name: "", rank: "", email: "", role: "personnel", password: "", must_change_password: true, battalion: "", detachment: "" });
                setError("");
                setSaving(false);
              }}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Add Another User
            </button>
            <button
              onClick={() => { onSaved(); onClose(); }}
              className="w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800">
          <h3 className="text-white font-semibold">Add User</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {textFields.map(([label, key, req, type]) => (
            <div key={key}>
              <label className="text-xs text-gray-400">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={req}
                className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-400">Rank</label>
            <select
              value={form.rank}
              onChange={(e) => setForm({ ...form, rank: e.target.value })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="">— Select Rank —</option>
              {RANKS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">Role *</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value, battalion: "", detachment: "" })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">
              Battalion {needsBattalion ? "*" : "(optional)"}
            </label>
            <select
              value={form.battalion}
              onChange={(e) => setForm({ ...form, battalion: e.target.value, detachment: "" })}
              required={needsBattalion}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="">— Select Battalion —</option>
              {battalions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          {detachments.length > 0 && (
            <div>
              <label className="text-xs text-gray-400">Detachment (optional)</label>
              <select
                value={form.detachment}
                onChange={(e) => setForm({ ...form, detachment: e.target.value })}
                className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              >
                <option value="">— Select Detachment —</option>
                {detachments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400">Initial Password *</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                className="w-full bg-gray-700 text-white text-sm px-3 py-2 pr-10 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-white"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="mcp"
              checked={form.must_change_password}
              onChange={(e) => setForm({ ...form, must_change_password: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="mcp" className="text-xs text-gray-400">
              Require password change on first login
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Edit User Form ─────────────────────────────────────── */
function EditUserForm({ target, onClose, onSaved }) {
  const EXEMPT_ROLES = ["corps_cmd", "cop"];
  const [form, setForm] = useState({
    name: target.name || "",
    rank: target.rank || "",
    email: target.email || "",
    role: target.role || "personnel",
    battalion: target.battalion || "",
    detachment: target.detachment || "",
    is_active: target.is_active ?? true,
    must_change_password: target.must_change_password ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [battalions, setBattalions] = useState([]);
  const [detachments, setDetachments] = useState([]);

  useEffect(() => {
    formationService.battalions().then((r) => {
      const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
      setBattalions(items);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.battalion) { setDetachments([]); return; }
    formationService.detachments({ battalion: form.battalion }).then((r) => {
      const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
      setDetachments(items);
    }).catch(() => {});
  }, [form.battalion]);

  const needsBattalion = !EXEMPT_ROLES.includes(form.role);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = { ...form };
    if (!payload.battalion) delete payload.battalion;
    if (!payload.detachment) delete payload.detachment;
    if (!payload.rank) delete payload.rank;
    if (!payload.email) delete payload.email;
    try {
      await api.patch(`/api/auth/users/${target.id}/`, payload);
      onSaved();
    } catch (err) {
      const data = err.response?.data;
      setError(
        typeof data === "object"
          ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ")
          : String(data ?? "Failed to update user.")
      );
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800">
          <h3 className="text-white font-semibold">Edit User — {target.service_number}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {/* Name */}
          <div>
            <label className="text-xs text-gray-400">Full Name *</label>
            <input type="text" value={form.name} required
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500" />
          </div>
          {/* Email */}
          <div>
            <label className="text-xs text-gray-400">Email</label>
            <input type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500" />
          </div>
          {/* Rank */}
          <div>
            <label className="text-xs text-gray-400">Rank</label>
            <select value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
              <option value="">— Select Rank —</option>
              {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {/* Role */}
          <div>
            <label className="text-xs text-gray-400">Role *</label>
            <select value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value, battalion: "", detachment: "" })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {/* Battalion */}
          <div>
            <label className="text-xs text-gray-400">Battalion {needsBattalion ? "*" : "(optional)"}</label>
            <select value={form.battalion} required={needsBattalion}
              onChange={(e) => setForm({ ...form, battalion: e.target.value, detachment: "" })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
              <option value="">— Select Battalion —</option>
              {battalions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {/* Detachment */}
          {detachments.length > 0 && (
            <div>
              <label className="text-xs text-gray-400">Detachment (optional)</label>
              <select value={form.detachment}
                onChange={(e) => setForm({ ...form, detachment: e.target.value })}
                className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500">
                <option value="">— Select Detachment —</option>
                {detachments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {/* Active toggle */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="edit-active" checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
            <label htmlFor="edit-active" className="text-xs text-gray-400">Active</label>
          </div>
          {/* Must change password */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="edit-mcp" checked={form.must_change_password}
              onChange={(e) => setForm({ ...form, must_change_password: e.target.checked })} className="rounded" />
            <label htmlFor="edit-mcp" className="text-xs text-gray-400">Require password change on next login</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Confirm Delete ─────────────────────────────────────── */
function ConfirmDelete({ name, loading, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700 p-6 text-center">
        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-white font-semibold mb-1">Delete User</h3>
        <p className="text-gray-400 text-sm mb-6">
          Are you sure you want to delete <span className="text-white font-medium">{name}</span>? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
