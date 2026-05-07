import React, { useEffect, useState, useCallback } from "react";
import { incidentService } from "../services/api";

const SEVERITY_COLORS = {
  low: "bg-green-500/20 text-green-400 border border-green-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  critical: "bg-red-500/20 text-red-400 border border-red-500/30",
};

const STATUS_COLORS = {
  reported: "bg-blue-500/20 text-blue-400",
  under_investigation: "bg-yellow-500/20 text-yellow-400",
  resolved: "bg-green-500/20 text-green-400",
  closed: "bg-gray-500/20 text-gray-400",
};

export default function Incidents({ user }) {
  const [incidents, setIncidents] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const canCreate = ["admin", "co", "duty_officer", "mpc_hqs", "cop"].includes(user?.role);

  const load = useCallback(() => {
    setLoading(true);
    incidentService
      .list({ page, severity: severity || undefined, search: search || undefined })
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [];
        setIncidents(items);
        setCount(r.data?.count ?? items.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, severity, search]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(count / 20);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Incidents</h2>
          <p className="text-gray-400 text-sm mt-0.5">{count} total</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            + Report Incident
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
          }}
          placeholder="Search incident # or type…"
          className="bg-gray-800 text-white text-sm px-3 py-1.5 rounded border border-gray-700 focus:outline-none focus:border-blue-500 w-64"
        />
        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
          className="bg-gray-800 text-white text-sm px-3 py-1.5 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
        >
          {["", "low", "medium", "high", "critical"].map((s) => (
            <option key={s} value={s}>{s || "All severities"}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Incident #</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-left px-4 py-3">Severity</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">Loading…</td>
              </tr>
            ) : incidents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">No incidents found.</td>
              </tr>
            ) : (
              incidents.map((inc) => (
                <tr key={inc.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-blue-400 font-mono text-xs">{inc.incident_number}</td>
                  <td className="px-4 py-3 text-white">{inc.incident_type}</td>
                  <td className="px-4 py-3 text-gray-300">{inc.location || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[inc.severity] || ""}`}>
                      {inc.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[inc.status] || ""}`}>
                      {inc.status?.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{inc.date_occurred?.slice(0, 10)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
        <IncidentForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function IncidentForm({ onClose, onSaved }) {
  const [form, setForm] = useState({
    incident_type: "",
    description: "",
    location: "",
    date_occurred: new Date().toISOString().slice(0, 16),
    severity: "medium",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await incidentService.create(form);
      onSaved();
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === "object" ? JSON.stringify(data) : String(data ?? "Failed to report incident."));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-white font-semibold">Report Incident</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div>
            <label className="text-xs text-gray-400">Incident Type *</label>
            <input
              value={form.incident_type}
              onChange={(e) => setForm({ ...form, incident_type: e.target.value })}
              required
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Date &amp; Time *</label>
            <input
              type="datetime-local"
              value={form.date_occurred}
              onChange={(e) => setForm({ ...form, date_occurred: e.target.value })}
              required
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Severity</label>
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="mt-1 w-full bg-gray-700 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              {["low", "medium", "high", "critical"].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
              rows={3}
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
              {saving ? "Saving…" : "Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
