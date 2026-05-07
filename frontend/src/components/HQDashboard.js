import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  caseService,
  incidentService,
  morningBriefService,
  guardroomService,
  userService,
  notificationService,
  formationService,
} from "../services/api";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function StatCard({ label, value, sub, color, onClick, icon, compact }) {
  const borders = {
    blue: "border-blue-500", red: "border-red-500", yellow: "border-yellow-500",
    green: "border-green-500", purple: "border-purple-500", teal: "border-teal-500",
    orange: "border-orange-500", gray: "border-gray-500", indigo: "border-indigo-500",
  };
  const accents = {
    blue: "text-blue-400", red: "text-red-400", yellow: "text-yellow-400",
    green: "text-green-400", purple: "text-purple-400", teal: "text-teal-400",
    orange: "text-orange-400", gray: "text-gray-400", indigo: "text-indigo-400",
  };
  const accentClass = accents[color] || "text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`
        group relative bg-gray-800 rounded-xl border-l-4 ${borders[color] || borders.blue}
        ${compact ? "p-3" : "p-4"} w-full text-left transition-all duration-200
        ${onClick ? "hover:scale-[1.02] hover:shadow-lg cursor-pointer" : "cursor-default"}
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
          <p className={`${compact ? "text-2xl" : "text-3xl"} font-bold mt-1 ${accentClass}`}>
            {value === null ? <span className="text-gray-500 animate-pulse">—</span> : (value ?? 0)}
          </p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className={`p-2 rounded-lg bg-gray-700/60 ${accentClass} shrink-0`}>{icon}</div>
        )}
      </div>
      {onClick && (
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
          <span>View all</span>
          <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

const STATUS_BADGE = {
  new: "bg-teal-900/50 text-teal-300",
  open: "bg-blue-900/50 text-blue-300",
  tasked: "bg-yellow-900/50 text-yellow-300",
  under_investigation: "bg-indigo-900/50 text-indigo-300",
  pending: "bg-orange-900/50 text-orange-300",
  served: "bg-green-900/50 text-green-300",
  closed: "bg-gray-700 text-gray-400",
  referred: "bg-purple-900/50 text-purple-300",
};

const SEVERITY_BADGE = {
  low: "bg-green-900/50 text-green-300",
  medium: "bg-yellow-900/50 text-yellow-300",
  high: "bg-orange-900/50 text-orange-300",
  critical: "bg-red-900/50 text-red-300",
};

/* ─── Task Case Modal ─────────────────────────────────────────── */
function TaskCaseModal({ caseItem, onClose, onSuccess }) {
  const fileRef = useRef();
  const [battalions, setBattalions] = useState([]);
  const [form, setForm] = useState({
    tasked_battalion: "",
    tasking_date: new Date().toISOString(),
    tasking_letter: null,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    formationService.battalions().then((res) => {
      const all = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.results) ? res.data.results : [];
      const sorted = all.filter((b) => b.battalion_type === "normal" || b.battalion_type === "special");
      sorted.sort((a, b) => a.battalion_type.localeCompare(b.battalion_type) || a.name.localeCompare(b.name));
      setBattalions(sorted);
    }).catch(() => {});
  }, []);

  function validate() {
    const e = {};
    if (!form.tasked_battalion) e.tasked_battalion = "Select a battalion.";
    if (!form.tasking_letter) e.tasking_letter = "Attach a tasking letter.";
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setSubmitting(true);
    setErrors({});
    try {
      const fd = new FormData();
      fd.append("tasked_battalion", form.tasked_battalion);
      fd.append("tasking_date", new Date(form.tasking_date).toISOString());
      fd.append("tasking_letter", form.tasking_letter);
      await caseService.taskCase(caseItem.id, fd);
      onSuccess();
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        const mapped = {};
        if (data.tasked_battalion) mapped.tasked_battalion = data.tasked_battalion.join ? data.tasked_battalion.join(" ") : data.tasked_battalion;
        if (data.tasking_letter) mapped.tasking_letter = data.tasking_letter.join ? data.tasking_letter.join(" ") : data.tasking_letter;
        if (data.tasking_date) mapped.tasking_date = data.tasking_date.join ? data.tasking_date.join(" ") : data.tasking_date;
        if (data.non_field_errors) mapped.general = data.non_field_errors.join ? data.non_field_errors.join(" ") : data.non_field_errors;
        setErrors(Object.keys(mapped).length ? mapped : { general: "Tasking failed. Please try again." });
      } else {
        setErrors({ general: "Tasking failed. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold text-base">Task Case</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              <span className="text-blue-400 font-mono">{caseItem.case_number}</span>
              {" — "}{caseItem.accused_name || caseItem.title || "Case"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errors.general && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">
              {errors.general}
            </div>
          )}

          {/* Battalion select */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Task To Battalion <span className="text-red-400">*</span>
            </label>
            <select
              value={form.tasked_battalion}
              onChange={(e) => setForm((f) => ({ ...f, tasked_battalion: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select battalion —</option>
              {battalions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.tasked_battalion && <p className="text-red-400 text-xs mt-1">{errors.tasked_battalion}</p>}
          </div>

          {/* Tasking letter upload */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Tasking Letter <span className="text-red-400">*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className="w-full bg-gray-700 border-2 border-dashed border-gray-600 rounded px-4 py-3 cursor-pointer hover:border-blue-500 transition-colors text-center"
            >
              {form.tasking_letter ? (
                <p className="text-sm text-green-400 font-medium">{form.tasking_letter.name}</p>
              ) : (
                <div>
                  <svg className="w-6 h-6 text-gray-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <p className="text-gray-400 text-xs">Click to attach tasking letter (PDF, Word, image)</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setForm((f) => ({ ...f, tasking_letter: file }));
              }}
            />
            {errors.tasking_letter && <p className="text-red-400 text-xs mt-1">{errors.tasking_letter}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Tasking…
                </>
              ) : (
                "Confirm Tasking"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HQDashboard({ user }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalCases: null, newCases: null, taskedCases: null, underInvestigation: null, pendingCases: null,
    servedCases: null, closedCases: null, totalIncidents: null, activeIncidents: null,
    totalGuardrooms: null, activeGuardrooms: null, totalPersonnel: null, activePersonnel: null,
    briefs: null, unread: null,
  });
  const [recentCases, setRecentCases] = useState([]);
  const [recentIncidents, setRecentIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskModal, setTaskModal] = useState(null); // case object or null

  useEffect(() => {
    async function load() {
      const [casesRes, incidentsRes, guardroomsRes, usersRes, briefsRes, notifRes] =
        await Promise.allSettled([
          caseService.list(),
          incidentService.list(),
          guardroomService.list(),
          userService.list({ page_size: 1 }),
          morningBriefService.list({ page_size: 1 }),
          notificationService.list(),
        ]);

      const cases = toArray(casesRes.value?.data);
      const incidents = toArray(incidentsRes.value?.data);
      const guardrooms = toArray(guardroomsRes.value?.data);
      const users = casesRes.value ? (usersRes.value?.data?.count ?? toArray(usersRes.value?.data).length) : 0;
      const briefs = briefsRes.value?.data?.count ?? toArray(briefsRes.value?.data).length;
      const notifItems = toArray(notifRes.value?.data?.results ?? notifRes.value?.data);

      setStats({
        totalCases: casesRes.value?.data?.count ?? cases.length,
        newCases: cases.filter((c) => c.status === "new").length,
        taskedCases: cases.filter((c) => c.status === "tasked").length,
        underInvestigation: cases.filter((c) => c.status === "under_investigation").length,
        pendingCases: cases.filter((c) => c.status === "pending").length,
        servedCases: cases.filter((c) => c.status === "served").length,
        closedCases: cases.filter((c) => c.status === "closed").length,
        totalIncidents: incidentsRes.value?.data?.count ?? incidents.length,
        activeIncidents: incidents.filter((i) => i.status !== "closed" && i.status !== "resolved").length,
        totalGuardrooms: guardrooms.length,
        activeGuardrooms: guardrooms.filter((g) => g.is_active).length,
        totalPersonnel: users,
        briefs,
        unread: notifItems.filter((n) => !n.is_read).length,
      });
      setRecentCases(cases.slice(0, 5));
      setRecentIncidents(incidents.slice(0, 5));
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Task Case Modal */}
      {taskModal && (
        <TaskCaseModal
          caseItem={taskModal}
          onClose={() => setTaskModal(null)}
          onSuccess={() => {
            setTaskModal(null);
            // refresh recent cases list
            caseService.list().then((res) => {
              const cases = Array.isArray(res.data) ? res.data
                : Array.isArray(res.data?.results) ? res.data.results : [];
              setRecentCases(cases.slice(0, 5));
            }).catch(() => {});
          }}
        />
      )}
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-4 sm:p-5 border border-gray-700">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">HQ Battalion Dashboard</h2>
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-blue-700 text-blue-100 font-medium">
              MPC HQS
            </span>
            <p className="text-gray-400 text-sm mt-2">
              Welcome, <span className="text-white font-medium">{user?.rank} {user?.name}</span>
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Service No: <span className="text-gray-300">{user?.service_number}</span></p>
            <p className="mt-0.5">Role: <span className="text-gray-300 capitalize">{user?.role}</span></p>
            <p className="mt-0.5">{new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
        </div>
      </div>

      {/* Case Overview */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Case Overview</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
          <StatCard
            label="All Cases" value={stats.totalCases} color="blue" compact
            onClick={() => navigate("/dashboard/cases")}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
          />
          <StatCard
            label="New" value={stats.newCases} color="teal" compact
            onClick={() => navigate("/dashboard/cases")}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
          />
          <StatCard
            label="Tasked" value={stats.taskedCases} color="yellow" compact
            onClick={() => navigate("/dashboard/cases")}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
          />
          <StatCard
            label="Under Investigation" value={stats.underInvestigation} color="indigo" compact
            onClick={() => navigate("/dashboard/cases")}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" /></svg>}
          />
          <StatCard
            label="Pending" value={stats.pendingCases} color="orange" compact
            onClick={() => navigate("/dashboard/cases")}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            label="Served" value={stats.servedCases} color="green" compact
            onClick={() => navigate("/dashboard/cases")}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            label="Closed" value={stats.closedCases} color="gray" compact
            onClick={() => navigate("/dashboard/cases")}
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      </div>

      {/* Other stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Incidents" value={stats.totalIncidents}
          sub={loading ? "" : `${stats.activeIncidents ?? 0} unresolved`}
          color="red" onClick={() => navigate("/dashboard/incidents")}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
        />
        <StatCard
          label="Morning Briefs" value={stats.briefs} color="green"
          onClick={() => navigate("/dashboard/morning-briefs")}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        />
        <StatCard
          label="Personnel" value={stats.totalPersonnel} color="purple"
          onClick={() => navigate("/dashboard/users")}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard
          label="Unread Alerts" value={stats.unread} color="yellow"
          onClick={() => navigate("/dashboard/notifications")}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>}
        />
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Cases */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-white text-sm font-medium">Recent Cases</span>
            <button onClick={() => navigate("/dashboard/cases")} className="text-xs text-blue-400 hover:text-blue-300">
              View all →
            </button>
          </div>
          {loading ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center animate-pulse">Loading…</p>
          ) : recentCases.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No cases yet.</p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[320px]">
              <thead className="bg-gray-700/50 text-gray-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Case #</th>
                  <th className="text-left px-4 py-2">Accused</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2 hidden sm:table-cell">Date</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recentCases.map((c) => (
                  <tr key={c.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                    <td className="px-4 py-2 text-blue-400 font-mono cursor-pointer" onClick={() => navigate("/dashboard/cases")}>{c.case_number || "—"}</td>
                    <td className="px-4 py-2 text-white truncate max-w-[120px] cursor-pointer" onClick={() => navigate("/dashboard/cases")}>{c.accused_name || c.title || "—"}</td>
                    <td className="px-4 py-2 cursor-pointer" onClick={() => navigate("/dashboard/cases")}>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${STATUS_BADGE[c.status] || "bg-gray-700 text-gray-400"}`}>
                        {c.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400 hidden sm:table-cell cursor-pointer" onClick={() => navigate("/dashboard/cases")}>{c.created_at?.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right">
                      {(c.status === "new" || c.status === "open") && !c.tasked_battalion && (
                        <button
                          onClick={() => setTaskModal(c)}
                          className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white text-[10px] font-medium rounded transition-colors whitespace-nowrap"
                        >
                          Task
                        </button>
                      )}
                      {c.tasked_battalion && (
                        <span className="text-[10px] text-green-400 font-medium whitespace-nowrap">Tasked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>

        {/* Recent Incidents */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-white text-sm font-medium">Recent Incidents</span>
            <button onClick={() => navigate("/dashboard/incidents")} className="text-xs text-blue-400 hover:text-blue-300">
              View all →
            </button>
          </div>
          {loading ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center animate-pulse">Loading…</p>
          ) : recentIncidents.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No incidents yet.</p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[300px]">
              <thead className="bg-gray-700/50 text-gray-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Incident #</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Severity</th>
                  <th className="text-left px-4 py-2 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentIncidents.map((i) => (
                  <tr key={i.id} className="border-t border-gray-700 hover:bg-gray-700/30 cursor-pointer" onClick={() => navigate("/dashboard/incidents")}>
                    <td className="px-4 py-2 text-blue-400 font-mono">{i.incident_number || "—"}</td>
                    <td className="px-4 py-2 text-white truncate max-w-[120px]">{i.incident_type}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${SEVERITY_BADGE[i.severity] || "bg-gray-700 text-gray-400"}`}>
                        {i.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{i.date_occurred?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "View Cases", path: "/dashboard/cases" },
            { label: "Log Incident", path: "/dashboard/incidents" },
            { label: "Morning Briefs", path: "/dashboard/morning-briefs" },
            { label: "Guardrooms", path: "/dashboard/guardrooms" },
            { label: "Manage Users", path: "/dashboard/users" },
            { label: "Notifications", path: "/dashboard/notifications" },
          ].map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
