import React, { useEffect, useState } from "react";
import { incidentService } from "../services/api";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

const STATUS_STYLE = {
  reported:            "bg-red-500/20 text-red-400",
  under_investigation: "bg-yellow-500/20 text-yellow-400",
  resolved:            "bg-blue-500/20 text-blue-400",
  closed:              "bg-green-500/20 text-green-400",
};

const SEVERITY_STYLE = {
  low:      "bg-green-500/20 text-green-400",
  medium:   "bg-yellow-500/20 text-yellow-400",
  high:     "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
};

const ALL_STATUSES = ["reported","under_investigation","resolved","closed"];
const ALL_SEVERITIES = ["critical","high","medium","low"];

function Badge({ label, style }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${style}`}>
      {label?.replace(/_/g, " ")}
    </span>
  );
}

export default function Incidents({ user }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    incidentService
      .list({ page_size: 200 })
      .then((res) => setIncidents(toArray(res.data)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = incidents.filter((i) => {
    const matchStatus   = statusFilter === "all"   || i.status === statusFilter;
    const matchSeverity = severityFilter === "all" || i.severity === severityFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (i.incident_number || "").toLowerCase().includes(q) ||
      (i.incident_type || "").toLowerCase().includes(q) ||
      (i.location || "").toLowerCase().includes(q) ||
      (i.description || "").toLowerCase().includes(q);
    return matchStatus && matchSeverity && matchSearch;
  });

  const statusCounts   = ALL_STATUSES.reduce((a, s) => ({ ...a, [s]: incidents.filter((i) => i.status === s).length }), {});
  const severityCounts = ALL_SEVERITIES.reduce((a, s) => ({ ...a, [s]: incidents.filter((i) => i.severity === s).length }), {});

  return (
    <div className="p-6 min-h-screen bg-gray-900 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Incidents</h2>
        <p className="text-sm text-gray-500 mt-0.5">{incidents.length} total incident{incidents.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-gray-500 self-center mr-1">Status:</span>
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
        >
          All ({incidents.length})
        </button>
        {ALL_STATUSES.map((s) =>
          statusCounts[s] > 0 ? (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              {s.replace(/_/g, " ")} ({statusCounts[s]})
            </button>
          ) : null
        )}
      </div>

      {/* Severity filter chips */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-gray-500 self-center mr-1">Severity:</span>
        <button
          onClick={() => setSeverityFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${severityFilter === "all" ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
        >
          All
        </button>
        {ALL_SEVERITIES.map((s) =>
          severityCounts[s] > 0 ? (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${severityFilter === s ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              {s} ({severityCounts[s]})
            </button>
          ) : null
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by incident #, type, location..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full md:w-96 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      {/* Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map((i) => <div key={i} className="h-8 bg-gray-700 rounded animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No incidents found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                <th className="text-left px-5 py-3 font-medium">Incident #</th>
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Location</th>
                <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Severity</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inc) => (
                <tr key={inc.id} className="border-b border-gray-700/40 hover:bg-gray-700/30 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                    {inc.incident_number || "--"}
                  </td>
                  <td className="px-5 py-3 text-gray-200 max-w-[220px]">
                    <p className="truncate">{inc.incident_type || "--"}</p>
                    {inc.is_belated && (
                      <span className="text-[10px] text-orange-400 font-medium">Belated</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell truncate max-w-[160px]">
                    {inc.location || "--"}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <Badge label={inc.severity} style={SEVERITY_STYLE[inc.severity] || "bg-gray-600 text-gray-300"} />
                  </td>
                  <td className="px-5 py-3">
                    <Badge label={inc.status} style={STATUS_STYLE[inc.status] || "bg-gray-600 text-gray-300"} />
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500 hidden lg:table-cell whitespace-nowrap">
                    {inc.date_occurred ? new Date(inc.date_occurred).toLocaleDateString("en-GB") : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
