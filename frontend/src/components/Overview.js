import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { caseService, incidentService, userService } from "../services/api";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

const ROLE_LABELS = {
  admin: "Admin", co: "Commanding Officer", corps_cmd: "Corps Commander",
  investigator: "Investigator", duty_officer: "Duty Officer", guardroom_ic: "Guardroom IC",
  detachment: "Detachment IC", personnel: "Personnel", legal: "Legal Officer",
  order_nco: "Order NCO", mpc_hqs: "MPC HQS Admin", bsm: "BSM", cop: "COP",
};

const CASE_STATUS_STYLE = {
  new:                 "bg-gray-500/20 text-gray-300",
  open:                "bg-blue-500/20 text-blue-400",
  tasked:              "bg-yellow-500/20 text-yellow-400",
  under_investigation: "bg-indigo-500/20 text-indigo-400",
  pending:             "bg-orange-500/20 text-orange-400",
  served:              "bg-purple-500/20 text-purple-400",
  closed:              "bg-green-500/20 text-green-400",
  referred:            "bg-cyan-500/20 text-cyan-400",
};

const INCIDENT_STATUS_STYLE = {
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

function Badge({ label, style }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${style}`}>
      {label?.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({ icon, label, value, sub, accent, loading, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`bg-gray-800 rounded-xl p-5 border-l-4 ${accent} flex flex-col gap-1 text-left w-full${
        onClick ? " cursor-pointer hover:bg-gray-700 transition-colors" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-400">{icon}</span>
        {sub && <span className="text-[11px] text-gray-500">{sub}</span>}
      </div>
      <p className="text-3xl font-bold text-white mt-1">
        {loading ? <span className="animate-pulse text-gray-600">--</span> : value}
      </p>
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
    </Tag>
  );
}

function SectionHeader({ title }) {
  return (
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{title}</h3>
  );
}

export default function Overview({ user }) {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDesc, setExpandedDesc] = useState({});

  useEffect(() => {
    Promise.all([
      caseService.list({ page_size: 200 }).catch(() => null),
      incidentService.list({ page_size: 200 }).catch(() => null),
      userService.list({ page_size: 200 }).catch(() => null),
    ]).then(([cRes, iRes, uRes]) => {
      setCases(toArray(cRes?.data));
      setIncidents(toArray(iRes?.data));
      setUsers(toArray(uRes?.data));
      setLoading(false);
    });
  }, []);

  const roleLabel = user?.is_superuser ? "Superuser" : ROLE_LABELS[user?.role] || user?.role;
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const openCases         = cases.filter((c) => ["new", "open", "tasked", "under_investigation", "pending"].includes(c.status));
  const closedCases       = cases.filter((c) => ["closed", "served"].includes(c.status));
  const openIncidents     = incidents.filter((i) => ["reported", "under_investigation"].includes(i.status));
  const criticalIncidents = incidents.filter((i) => i.severity === "critical" || i.severity === "high");
  const descLimit = 120;

  const caseStatusBreakdown = [
    { label: "New",        key: "new" },
    { label: "Open",       key: "open" },
    { label: "Tasked",     key: "tasked" },
    { label: "Under Inv.", key: "under_investigation" },
    { label: "Pending",    key: "pending" },
    { label: "Served",     key: "served" },
    { label: "Closed",     key: "closed" },
    { label: "Referred",   key: "referred" },
  ]
    .map((s) => ({ ...s, count: cases.filter((c) => c.status === s.key).length }))
    .filter((s) => s.count > 0);

  const recentCases     = cases.slice(0, 6);
  const recentIncidents = incidents.slice(0, 5);

  const barColor = {
    new: "bg-gray-500", open: "bg-blue-500", tasked: "bg-yellow-500",
    under_investigation: "bg-indigo-500", pending: "bg-orange-500",
    served: "bg-purple-500", closed: "bg-green-500", referred: "bg-cyan-500",
  };

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-7 min-h-screen bg-gray-900">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {greeting},{" "}
            <span className="text-blue-400">{user?.name || user?.service_number}</span>
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {roleLabel}
            {user?.battalion_name && (
              <> &middot; <span className="text-gray-400">{user.battalion_name}</span></>
            )}
          </p>
        </div>
        <p className="text-xs text-gray-600 md:text-right md:mt-1">{today}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          loading={loading} label="Total Cases" value={cases.length}
          sub={`${openCases.length} open`} accent="border-blue-500"
          onClick={() => navigate("/dashboard/cases")}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>}
        />
        <StatCard
          loading={loading} label="Closed / Served" value={closedCases.length}
          sub={cases.length ? `${Math.round((closedCases.length / cases.length) * 100)}% resolved` : undefined}
          accent="border-green-500"
          onClick={() => navigate("/dashboard/cases?status=served")}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <StatCard
          loading={loading} label="Total Incidents" value={incidents.length}
          sub={`${openIncidents.length} open`} accent="border-purple-500"
          onClick={() => navigate("/dashboard/incidents")}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>}
        />
        <StatCard
          loading={loading} label="System Users" value={users.length}
          sub={`${users.filter((u) => u.is_active).length} active`} accent="border-orange-500"
          onClick={() => navigate("/dashboard/users")}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
        />
      </div>

      {/* Case Breakdown + High Priority Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-800 rounded-xl p-5">
          <SectionHeader title="Case Status Breakdown" />
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map((i) => <div key={i} className="h-6 bg-gray-700 rounded animate-pulse" />)}</div>
          ) : caseStatusBreakdown.length === 0 ? (
            <p className="text-gray-500 text-sm">No cases recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {caseStatusBreakdown.map((s) => {
                const pct = cases.length ? Math.round((s.count / cases.length) * 100) : 0;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => navigate(`/dashboard/cases?status=${s.key}`)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-300">{s.label}</span>
                      <span className="text-gray-500">{s.count} <span className="text-gray-600">({pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${barColor[s.key] || "bg-gray-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="High Priority Incidents" />
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-9 bg-gray-700 rounded animate-pulse" />)}</div>
          ) : criticalIncidents.length === 0 ? (
            <p className="text-gray-500 text-sm">No high-priority incidents.</p>
          ) : (
            <div className="space-y-1">
              {criticalIncidents.slice(0, 5).map((inc) => (
                <div key={inc.id} className="flex items-start gap-2 py-2 border-b border-gray-700/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{inc.incident_type}</p>
                    <p className="text-xs text-gray-500">{inc.incident_number}</p>
                  </div>
                  <Badge label={inc.severity} style={SEVERITY_STYLE[inc.severity] || "bg-gray-600 text-gray-300"} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Cases */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-700"><SectionHeader title="Recent Cases" /></div>
        {loading ? (
          <div className="p-5 space-y-3">{[1,2,3,4,5].map((i) => <div key={i} className="h-7 bg-gray-700 rounded animate-pulse" />)}</div>
        ) : recentCases.length === 0 ? (
          <p className="p-5 text-gray-500 text-sm">No cases recorded yet.</p>
        ) : (
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Case #</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Service No</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Rank</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Accused</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Offence</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Description</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentCases.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate("/dashboard/cases")}
                  className="border-b border-gray-700/40 hover:bg-gray-700/30 transition-colors cursor-pointer"
                >
                  <td className="px-3 md:px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{c.case_number || "--"}</td>
                  <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_service_number || "--"}</td>
                  <td className="px-3 md:px-5 py-3 text-gray-300 whitespace-nowrap">{c.accused_rank || "--"}</td>
                  <td className="px-3 md:px-5 py-3 text-gray-400 text-xs whitespace-nowrap">{c.accused_name || "--"}</td>
                  <td className="px-3 md:px-5 py-3 text-gray-200 whitespace-nowrap">{c.offence_name || c.offence || "--"}</td>
                  <td className="px-3 md:px-5 py-3 text-gray-300 min-w-[260px] max-w-[420px]">
                    {(() => {
                      const desc = c.description || "--";
                      const expanded = !!expandedDesc[c.id];
                      const longDesc = desc.length > descLimit;
                      const shown = expanded || !longDesc ? desc : `${desc.slice(0, descLimit)}...`;
                      return (
                        <>
                          <p className="whitespace-pre-wrap break-words">{shown}</p>
                          {longDesc && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDesc((prev) => ({ ...prev, [c.id]: !prev[c.id] }));
                              }}
                              className="mt-1 text-xs text-blue-400 hover:underline"
                            >
                              {expanded ? "Show less" : "Show more"}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-3 md:px-5 py-3"><Badge label={c.status} style={CASE_STATUS_STYLE[c.status] || "bg-gray-600 text-gray-300"} /></td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Incidents */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-700"><SectionHeader title="Recent Incidents" /></div>
        {loading ? (
          <div className="p-5 space-y-3">{[1,2,3].map((i) => <div key={i} className="h-7 bg-gray-700 rounded animate-pulse" />)}</div>
        ) : recentIncidents.length === 0 ? (
          <p className="p-5 text-gray-500 text-sm">No incidents recorded yet.</p>
        ) : (
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Incident #</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Type</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium hidden md:table-cell">Severity</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 md:px-5 py-2.5 font-medium hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentIncidents.map((inc) => (
                <tr
                  key={inc.id}
                  onClick={() => navigate("/dashboard/incidents")}
                  className="border-b border-gray-700/40 hover:bg-gray-700/30 transition-colors cursor-pointer"
                >
                  <td className="px-3 md:px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{inc.incident_number || "--"}</td>
                  <td className="px-3 md:px-5 py-3 text-gray-200 max-w-[200px] truncate">{inc.incident_type || "--"}</td>
                  <td className="px-3 md:px-5 py-3 hidden md:table-cell"><Badge label={inc.severity} style={SEVERITY_STYLE[inc.severity] || "bg-gray-600 text-gray-300"} /></td>
                  <td className="px-3 md:px-5 py-3"><Badge label={inc.status} style={INCIDENT_STATUS_STYLE[inc.status] || "bg-gray-600 text-gray-300"} /></td>
                  <td className="px-3 md:px-5 py-3 text-xs text-gray-500 hidden lg:table-cell whitespace-nowrap">
                    {inc.date_occurred ? new Date(inc.date_occurred).toLocaleDateString("en-GB") : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
