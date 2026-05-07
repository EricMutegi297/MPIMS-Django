import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  caseService,
  incidentService,
  morningBriefService,
  guardroomService,
  userService,
  notificationService,
} from "../services/api";

const CASE_STATUS_COLORS = {
  new: "bg-teal-500/20 text-teal-400",
  open: "bg-yellow-500/20 text-yellow-400",
  tasked: "bg-amber-500/20 text-amber-400",
  under_investigation: "bg-blue-500/20 text-blue-400",
  closed: "bg-gray-500/20 text-gray-400",
  referred: "bg-purple-500/20 text-purple-400",
  pending: "bg-orange-500/20 text-orange-400",
};

const INCIDENT_SEVERITY_COLORS = {
  low: "bg-green-500/20 text-green-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  high: "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
};

function StatCard({ title, value, color, accent, loading, onClick, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`
        group relative bg-gray-800 rounded-xl p-3 sm:p-5 border-l-4 ${color}
        w-full text-left transition-all duration-200
        ${onClick ? "hover:bg-gray-750 hover:scale-[1.02] hover:shadow-lg cursor-pointer" : "cursor-default"}
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">{title}</p>
          <p className={`text-2xl sm:text-3xl font-bold ${accent || "text-white"}`}>
            {loading ? <span className="text-gray-500 text-xl animate-pulse">â€”</span> : (value ?? 0)}
          </p>
        </div>
        <div className={`p-2 rounded-lg bg-gray-700/60 ${accent || "text-gray-400"} shrink-0`}>
          {icon}
        </div>
      </div>
      {onClick && (
        <div className="flex items-center gap-1 mt-3 text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
          <span>View all</span>
          <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

export default function Overview({ user }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    cases: null, incidents: null, briefs: null, guardrooms: null, users: null, unread: null,
  });
  const [recentCases, setRecentCases] = useState([]);
  const [recentIncidents, setRecentIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  const canSeeCases = user?.is_superuser || ["admin", "co", "corps_cmd", "investigator", "detachment", "legal", "mpc_hqs", "cop"].includes(user?.role);
  const canSeeIncidents = user?.is_superuser || ["admin", "co", "corps_cmd", "duty_officer", "detachment", "mpc_hqs", "cop"].includes(user?.role);
  const canSeeBriefs = user?.is_superuser || ["admin", "co", "corps_cmd", "detachment", "mpc_hqs", "bsm"].includes(user?.role);
  const canSeeGuardrooms = user?.is_superuser || ["admin", "duty_officer", "guardroom_ic", "order_nco", "mpc_hqs"].includes(user?.role);
  const canSeeUsers = user?.is_superuser || ["admin", "mpc_hqs", "personnel"].includes(user?.role);

  useEffect(() => {
    const fetches = [];

    if (canSeeCases) {
      fetches.push(
        caseService.list({ page_size: 5 }).then((r) => {
          const items = Array.isArray(r.data) ? r.data : r.data?.results ?? [];
          setStats((s) => ({ ...s, cases: r.data?.count ?? items.length }));
          setRecentCases(items.slice(0, 5));
        }).catch(() => {})
      );
    }

    if (canSeeIncidents) {
      fetches.push(
        incidentService.list({ page_size: 5 }).then((r) => {
          const items = Array.isArray(r.data) ? r.data : r.data?.results ?? [];
          setStats((s) => ({ ...s, incidents: r.data?.count ?? items.length }));
          setRecentIncidents(items.slice(0, 5));
        }).catch(() => {})
      );
    }

    if (canSeeBriefs) {
      fetches.push(
        morningBriefService.list({ page_size: 1 }).then((r) => {
          const count = r.data?.count ?? (Array.isArray(r.data) ? r.data.length : 0);
          setStats((s) => ({ ...s, briefs: count }));
        }).catch(() => {})
      );
    }

    if (canSeeGuardrooms) {
      fetches.push(
        guardroomService.list().then((r) => {
          const items = Array.isArray(r.data) ? r.data : r.data?.results ?? [];
          setStats((s) => ({ ...s, guardrooms: items.length }));
        }).catch(() => {})
      );
    }

    if (canSeeUsers) {
      fetches.push(
        userService.list({ page_size: 1 }).then((r) => {
          const count = r.data?.count ?? (Array.isArray(r.data) ? r.data.length : 0);
          setStats((s) => ({ ...s, users: count }));
        }).catch(() => {})
      );
    }

    fetches.push(
      notificationService.list().then((r) => {
        const items = r.data?.results ?? (Array.isArray(r.data) ? r.data : []);
        setStats((s) => ({ ...s, unread: items.filter((n) => !n.is_read).length }));
      }).catch(() => {})
    );

    Promise.all(fetches).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const CARDS = [
    {
      show: canSeeCases,
      title: "Total Cases",
      value: stats.cases,
      color: "border-blue-500",
      accent: "text-blue-400",
      path: "/dashboard/cases",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
        </svg>
      ),
    },
    {
      show: canSeeIncidents,
      title: "Incidents",
      value: stats.incidents,
      color: "border-red-500",
      accent: "text-red-400",
      path: "/dashboard/incidents",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      ),
    },
    {
      show: canSeeBriefs,
      title: "Morning Briefs",
      value: stats.briefs,
      color: "border-green-500",
      accent: "text-green-400",
      path: "/dashboard/morning-briefs",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      show: canSeeGuardrooms,
      title: "Guardrooms",
      value: stats.guardrooms,
      color: "border-purple-500",
      accent: "text-purple-400",
      path: "/dashboard/guardrooms",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      show: canSeeUsers,
      title: "Personnel",
      value: stats.users,
      color: "border-teal-500",
      accent: "text-teal-400",
      path: "/dashboard/users",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      show: true,
      title: "Unread Alerts",
      value: stats.unread,
      color: "border-yellow-500",
      accent: "text-yellow-400",
      path: "/dashboard/notifications",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
  ].filter((c) => c.show);

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-white">
          Welcome, {user?.name || user?.service_number}
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })}
        </p>
      </div>

      {/* Clickable summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {CARDS.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            value={card.value}
            color={card.color}
            accent={card.accent}
            loading={loading}
            onClick={() => navigate(card.path)}
            icon={card.icon}
          />
        ))}
      </div>

      {/* Recent Cases */}
      {canSeeCases && recentCases.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Cases</h3>
            <button
              onClick={() => navigate("/dashboard/cases")}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all â†’
            </button>
          </div>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Case #</th>
                  <th className="text-left px-4 py-2">Accused</th>
                  <th className="text-left px-4 py-2">Offence</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentCases.map((c) => (
                  <tr key={c.id} className="border-t border-gray-700 hover:bg-gray-700/30 cursor-pointer" onClick={() => navigate("/dashboard/cases")}>
                    <td className="px-4 py-2 text-blue-400 font-mono text-xs">{c.case_number}</td>
                    <td className="px-4 py-2 text-white">{c.accused_name || "â€”"}</td>
                    <td className="px-4 py-2 text-gray-300">{c.offence_name || c.offence || "â€”"}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CASE_STATUS_COLORS[c.status] || "bg-gray-600 text-gray-300"}`}>
                        {c.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400">{c.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Incidents */}
      {canSeeIncidents && recentIncidents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Incidents</h3>
            <button
              onClick={() => navigate("/dashboard/incidents")}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all â†’
            </button>
          </div>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Incident #</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2 hidden sm:table-cell">Severity</th>
                  <th className="text-left px-4 py-2 hidden sm:table-cell">Status</th>
                  <th className="text-left px-4 py-2 hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentIncidents.map((inc) => (
                  <tr key={inc.id} className="border-t border-gray-700 hover:bg-gray-700/30 cursor-pointer" onClick={() => navigate("/dashboard/incidents")}>
                    <td className="px-4 py-2 text-blue-400 font-mono text-xs">{inc.incident_number}</td>
                    <td className="px-4 py-2 text-white">{inc.incident_type}</td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${INCIDENT_SEVERITY_COLORS[inc.severity] || ""}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{inc.status?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2 text-gray-400 hidden md:table-cell">{inc.date_occurred?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {!loading && !canSeeCases && !canSeeIncidents && (
        <p className="text-gray-500 text-sm">No activity data available for your role.</p>
      )}
    </div>
  );
}

