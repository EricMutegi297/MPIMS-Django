import React, { useEffect, useState, useCallback } from "react";
import { morningBriefService } from "../services/api";

const STATUS_COLORS = {
  pending: "bg-gray-500/20 text-gray-400",
  submitted: "bg-green-500/20 text-green-400",
  late: "bg-orange-500/20 text-orange-400",
  belated: "bg-red-500/20 text-red-400",
};

export default function MorningBriefs({ user }) {
  const [briefs, setBriefs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const canCreate = ["admin", "detachment", "bsm", "mpc_hqs"].includes(user?.role);

  const load = useCallback(() => {
    setLoading(true);
    morningBriefService
      .list({ page })
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
        setBriefs(items);
        setCount(r.data?.count ?? items.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (id) => {
    await morningBriefService.submit(id).catch(() => {});
    load();
  };

  const totalPages = Math.ceil(count / 20);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Morning Briefs</h2>
          <p className="text-gray-400 text-sm mt-0.5">{count} total</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            + New Brief
          </button>
        )}
      </div>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Unit</th>
              <th className="text-left px-4 py-3">Strength</th>
              <th className="text-left px-4 py-3">Present</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Submitted By</th>
              {canCreate && <th className="text-left px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">Loading…</td>
              </tr>
            ) : briefs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">No morning briefs found.</td>
              </tr>
            ) : (
              briefs.map((b) => (
                <tr key={b.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-white">{b.date}</td>
                  <td className="px-4 py-3 text-gray-300">{b.unit_name || b.unit}</td>
                  <td className="px-4 py-3 text-gray-300">{b.total_strength}</td>
                  <td className="px-4 py-3 text-gray-300">{b.present}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] || ""}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{b.submitted_by_name || b.submitted_by || "—"}</td>
                  {canCreate && (
                    <td className="px-4 py-3">
                      {b.status === "pending" && (
                        <button
                          onClick={() => handleSubmit(b.id)}
                          className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                        >
                          Submit
                        </button>
                      )}
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
        <BriefForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function BriefForm({ onClose, onSaved }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    unit: "",
    total_strength: 0, present: 0, absent: 0, sick: 0, on_leave: 0, on_duty: 0,
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await morningBriefService.create(form);
      onSaved();
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === "object" ? JSON.stringify(data) : String(data ?? "Failed to create brief."));
      setSaving(false);
    }
  };

  const numField = (label, key) => (
    <div key={key}>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type="number"
        min={0}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
        className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800">
          <h3 className="text-white font-semibold">New Morning Brief</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div>
            <label className="text-xs text-gray-400">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Unit ID *</label>
            <input
              type="number"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              required
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {numField("Total Strength", "total_strength")}
            {numField("Present", "present")}
            {numField("Absent", "absent")}
            {numField("Sick", "sick")}
            {numField("On Leave", "on_leave")}
            {numField("On Duty", "on_duty")}
          </div>
          <div>
            <label className="text-xs text-gray-400">Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              rows={2}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            />
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
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
