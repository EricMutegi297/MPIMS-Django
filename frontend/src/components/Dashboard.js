import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { authService, notificationService } from "../services/api";
import Overview from "./Overview";
import HQDashboard from "./HQDashboard";
import BattalionDashboard from "./BattalionDashboard";
import Cases from "./Cases";
import Incidents from "./Incidents";
import MorningBriefs from "./MorningBriefs";
import Guardrooms from "./Guardrooms";
import Users from "./Users";
import Notifications from "./Notifications";
import Formations from "./Formations";
import FormationManagement from "./FormationManagement";
import UnitsManagement from "./UnitsManagement";
import OffencePage from "./OffencePage";
import Teams from "./Teams";
import InvestigatorDashboard from "./InvestigatorDashboard";
import { offenceService } from "../services/api";

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

// Navigation items in sidebar order
function getNavItems(user) {
  const isSuperuser = !!user?.is_superuser;
  const items = [
    {
      key: "overview", label: "Overview", path: "/dashboard", exact: true, show: true,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      key: "cases", label: "Cases", path: "/dashboard/cases", show: ["admin", "co", "corps_cmd", "investigator", "detachment", "legal", "mpc_hqs", "cop"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
        </svg>
      ),
    },
    {
      key: "incidents", label: "Incidents", path: "/dashboard/incidents", show: ["admin", "co", "corps_cmd", "duty_officer", "detachment", "mpc_hqs", "cop"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      ),
    },
    {
      key: "morning-briefs", label: "Morning Briefs", path: "/dashboard/morning-briefs", show: ["admin", "co", "corps_cmd", "detachment", "mpc_hqs", "bsm"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: "guardrooms", label: "Guardrooms", path: "/dashboard/guardrooms", show: ["admin", "duty_officer", "guardroom_ic", "order_nco", "mpc_hqs"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      key: "users", label: "Users", path: "/dashboard/users", show: ["admin", "mpc_hqs", "personnel"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      key: "battalions", label: "Battalions", path: "/dashboard/Battalions", show: isSuperuser,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        </svg>
      ),
    },
    {
      key: "formations", label: "Formations", path: "/dashboard/formations", show: isSuperuser,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 01-8 0M12 3v4m0 0a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4h1a4 4 0 014 4z" />
        </svg>
      ),
    },
    {
      key: "units", label: "Units", path: "/dashboard/units", show: isSuperuser,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
        </svg>
      ),
    },
    // Always show Offence for Superuser
    ...(isSuperuser ? [
      {
        key: "offence",
        label: "Offence",
        path: "/dashboard/offence",
        show: true,
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z" />
          </svg>
        ),
      },
    ] : []),
    {
      key: "notifications", label: "Notifications", path: "/dashboard/notifications", show: true,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      key: "teams", label: "Teams", path: "/dashboard/teams",
      show: user?.role === "admin" && user?.battalion_type === "special",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      key: "my-team", label: "My Team", path: "/dashboard/my-team",
      show: user?.role === "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
  ];
  return items.filter((item) => item.show);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [offences, setOffences] = useState([]);
  const [offencesLoading, setOffencesLoading] = useState(true);

  useEffect(() => {
    authService
      .me()
      .then((res) => setUser(res.data))
      .catch(() => navigate("/login"))
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    notificationService
      .list()
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.results) ? res.data.results : [];
        setUnreadCount(items.filter((n) => !n.is_read).length);
      })
      .catch(() => {});
  }, [user]);

  // Fetch offences
  const fetchOffences = async () => {
    setOffencesLoading(true);
    try {
      const res = await offenceService.list();
      setOffences(Array.isArray(res.data.results) ? res.data.results : res.data);
    } catch (err) {
      console.error("[Offences API error]", err, err?.response);
      if (err?.response) {
        console.error("API response data:", err.response.data);
      }
    }
    setOffencesLoading(false);
  };

  useEffect(() => {
    if (user) fetchOffences();
    // eslint-disable-next-line
  }, [user]);

  const handleLogout = async () => {
    await authService.logout();
    navigate("/login");
  };


  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Offence panel and modal state
  const [offencePanelOpen, setOffencePanelOpen] = useState(false);
  const [offenceModalOpen, setOffenceModalOpen] = useState(false);
  const handleOffenceSave = async (data) => {
    try {
      await offenceService.create(data);
      fetchOffences();
    } catch (err) {
      // Optionally show error
    }
    setOffenceModalOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        Loading…
      </div>
    );
  }


  // Sidebar navigation items
  const visibleNav = getNavItems(user);
  const roleLabel = !!user?.is_superuser
    ? "Superuser"
    : ROLE_LABELS[user?.role] || user?.role;
  const battalionLabel = user?.battalion_name
    ? `${user.battalion_name} ${String(user.battalion_type || "").toUpperCase()} Dashboard`
    : "General Dashboard";

  // Show HQDashboard for HQ battalion admins, BattalionDashboard for regular battalion admins, Overview for others
  const isHqsAdmin = user?.role === "admin" && user?.battalion_type === "hqs" && !user?.is_superuser;
  const isBattalionAdmin = Boolean(user?.is_battalion_admin);
  const isInvestigator = user?.role === "investigator";

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-56 bg-gray-800 flex flex-col
        transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 lg:z-auto
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="px-5 py-4 border-b border-gray-700">
          <h1 className="text-lg font-bold text-white tracking-widest uppercase">MPIMS</h1>
          <p className="text-xs text-gray-400 mt-0.5">{roleLabel}</p>
          <p className="text-xs text-gray-500 mt-1">{battalionLabel}</p>
          <p className="text-[10px] text-gray-500 mt-1">
            role={String(user?.role)} | is_superuser={String(!!user?.is_superuser)}
          </p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center justify-between w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                  isActive ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`
              }
            >
              <span className="flex items-center gap-2">
                {item.icon}
                {item.label}
              </span>
              {item.key === "notifications" && unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 min-w-[20px] text-center">
                  {unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-2 pb-4">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded text-sm font-medium text-gray-300 bg-red-600 hover:bg-red-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-900 min-w-0">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-10 lg:hidden bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white focus:outline-none"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-white font-bold tracking-widest uppercase text-sm">MPIMS</span>
          {unreadCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 min-w-[20px] text-center">
              {unreadCount}
            </span>
          )}
        </div>
        <Routes>
          <Route path="/" element={
            isHqsAdmin ? <HQDashboard user={user} /> :
            isBattalionAdmin ? <BattalionDashboard user={user} /> :
            isInvestigator ? <InvestigatorDashboard user={user} /> :
            <Overview user={user} />
          } />
          <Route path="cases/*" element={<Cases user={user} />} />
          <Route path="incidents/*" element={<Incidents user={user} />} />
          <Route path="morning-briefs/*" element={<MorningBriefs user={user} />} />
          <Route path="guardrooms/*" element={<Guardrooms user={user} />} />
          <Route path="users/*" element={<Users user={user} />} />
          <Route path="Battalions" element={<Formations user={user} />} />
          <Route path="formations" element={<FormationManagement user={user} />} />
          <Route path="units" element={<UnitsManagement user={user} />} />
          <Route path="offence" element={<OffencePage user={user} />} />
          <Route path="notifications" element={<Notifications onRead={() => setUnreadCount(0)} />} />
          <Route path="teams" element={<Teams user={user} />} />
          <Route path="my-team" element={<InvestigatorDashboard user={user} />} />
        </Routes>
      </main>
    </div>
  );
}

