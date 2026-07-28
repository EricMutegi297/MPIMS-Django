import React, { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { authService, notificationService, offenceService } from "../services/api";

const Overview = lazy(() => import("./Overview"));
const HQDashboard = lazy(() => import("./HQDashboard"));
const InvestigatorDashboard = lazy(() => import("./InvestigatorDashboard"));
const BattalionDashboard = lazy(() => import("./BattalionDashboard"));
const DetachmentDashboard = lazy(() => import("./DetachmentDashboard"));
const Cases = lazy(() => import("./Cases"));
const Incidents = lazy(() => import("./Incidents"));
const MorningBriefs = lazy(() => import("./MorningBriefs"));
const Guardrooms = lazy(() => import("./Guardrooms"));
const DutyRoom = lazy(() => import("./DutyRoom"));
const Exhibits = lazy(() => import("./Exhibits"));
const Briefs = lazy(() => import("./Briefs"));
const BackBriefs = lazy(() => import("./BackBriefs"));
const Users = lazy(() => import("./Users"));
const Notifications = lazy(() => import("./Notifications"));
const Formations = lazy(() => import("./Formations"));
const Offences = lazy(() => import("./Offences"));
const OffenceModal = lazy(() => import("./OffenceModal"));
const ChangePassword = lazy(() => import("./ChangePassword"));
const Teams = lazy(() => import("./Teams"));
const Analytics = lazy(() => import("./Analytics"));
const Statistics = lazy(() => import("./Statistics"));
const DetachmentOverview = lazy(() => import("./DetachmentOverview"));

const USER_CACHE_KEY = "mpims_user_cache";

function readCachedUser() {
  try {
    const cached = sessionStorage.getItem(USER_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (_) {
    sessionStorage.removeItem(USER_CACHE_KEY);
    return null;
  }
}

function cacheUser(user) {
  if (user) sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
}

function clearCachedUser() {
  sessionStorage.removeItem(USER_CACHE_KEY);
}

function scheduleNonCritical(callback) {
  if (typeof window === "undefined") {
    callback();
    return undefined;
  }

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, { timeout: 2000 });
    return () => window.cancelIdleCallback?.(idleId);
  }

  let timeoutId;
  const frameId = window.requestAnimationFrame(() => {
    timeoutId = window.setTimeout(callback, 700);
  });

  return () => {
    window.cancelAnimationFrame(frameId);
    if (timeoutId) window.clearTimeout(timeoutId);
  };
}

function ModuleFallback() {
  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 max-w-[70vw] rounded bg-gray-800 animate-pulse" />
        <div className="h-4 w-44 max-w-[60vw] rounded bg-gray-800 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div key={item} className="h-[82px] rounded-xl bg-gray-800 animate-pulse" />
        ))}
      </div>
      <div className="h-52 rounded-xl bg-gray-800 animate-pulse" />
    </div>
  );
}

const ROLE_LABELS = {
  admin: "Admin",
  co: "Commanding Officer",
  oc: "Officer Commanding",
  corps_cmd: "Corps Commander",
  investigator: "Investigator",
  duty_officer: "Duty Officer",
  hod: "Head of Department",
  guardroom_ic: "Guardroom IC",
  detachment: "Detachment IC",
  personnel: "Personnel",
  legal: "Legal Officer",
  order_nco: "Order NCO",
  mpc_hqs: "MPC HQS Admin",
  bsm: "BSM",
  cop: "COP",
  adj: "Adjutant",
  "2ic": "2nd in Command",
};

// Navigation items in sidebar order
function getNavItems(user) {
  const isSuperuser = !!user?.is_superuser;
  const isHqsBnAdmin = user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() === "hqs";
  const isBattalionAdmin = user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() !== "hqs";
  const isSpecialBattalionAdmin = user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() === "special";
  const isBattalionCommand = ["admin", "co", "hod", "oc", "adj", "2ic"].includes(user?.role) && !!user?.battalion;
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
      key: "cases", label: "Cases", path: "/dashboard/cases", show: ["admin", "co", "corps_cmd", "investigator", "detachment", "legal", "mpc_hqs", "cop", "adj"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
        </svg>
      ),
    },
    {
      key: "incidents", label: "Incidents", path: "/dashboard/incidents", show: ["admin", "co", "corps_cmd", "duty_officer", "detachment", "mpc_hqs", "cop", "adj"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      ),
    },
    {
      key: "morning-briefs", label: "Morning Briefs", path: "/dashboard/morning-briefs", show: true,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: "guardrooms", label: "Guardrooms", path: "/dashboard/guardrooms", show: ["admin", "co", "2ic", "duty_officer", "guardroom_ic", "order_nco", "mpc_hqs", "corps_cmd", "adj", "detachment"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      key: "duty-room", label: "Duty Room", path: "/dashboard/duty-room", show: true,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M6 21h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2zm3-6h6m-6 3h4" />
        </svg>
      ),
    },
    {
      key: "exhibits", label: "Exhibits", path: "/dashboard/exhibits", show: user?.role !== "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 10L4 17V7m8 4L4 7m8 4v10" />
        </svg>
      ),
    },
    {
      key: "briefs", label: "Briefs", path: "/dashboard/briefs", show: user?.role !== "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: "back-briefs", label: "Back-Briefs", path: "/dashboard/back-briefs", show: user?.role !== "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12M19 21H7a2 2 0 01-2-2v-2m14-10V5a2 2 0 00-2-2H7" />
        </svg>
      ),
    },
    {
      key: "users", label: "Users", path: "/dashboard/users", show: isSuperuser || ["admin", "mpc_hqs", "personnel", "detachment"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      key: "battalion-detachments",
      label: "Detachments",
      path: "/dashboard/battalion-detachments",
      show: (isBattalionCommand || isSuperuser) && !isHqsBnAdmin,
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      key: "battalions", label: "Battalions", path: "/dashboard/Battalions", show: ((["admin", "corps_cmd", "Superuser"].includes(user?.role) || isSuperuser) && !isBattalionAdmin),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        </svg>
      ),
    },
    {
      key: "formations", label: "Formations", path: "/dashboard/formations", show: ((["admin", "corps_cmd", "Superuser"].includes(user?.role) || isSuperuser) && !isHqsBnAdmin && !isBattalionAdmin),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 01-8 0M12 3v4m0 0a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4h1a4 4 0 014 4z" />
        </svg>
      ),
    },
    {
      key: "teams",
      label: "Teams",
      path: "/dashboard/teams",
      show: isSpecialBattalionAdmin || (user?.role === "detachment"),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      key: "det-teams", label: "Teams", path: "/dashboard/det-teams", show: user?.role === "detachment",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      key: "my-team", label: "My Team", path: "/dashboard/my-team", show: user?.role === "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      key: "court-martial",
      label: "Court Martial",
      path: "/dashboard/court-martial",
      show: isSuperuser || ["admin", "co", "corps_cmd", "investigator", "detachment", "legal", "mpc_hqs", "cop", "adj"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
        </svg>
      ),
    },
    {
      key: "dci-civ-police",
      label: "DCI/Civ Police",
      path: "/dashboard/dci-civ-police",
      show: isSuperuser || ["admin", "co", "corps_cmd", "investigator", "detachment", "legal", "mpc_hqs", "cop", "adj"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      key: "guardrooms-investigator", label: "Guardrooms", path: "/dashboard/guardrooms", show: user?.role === "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      key: "exhibits-investigator", label: "Exhibits", path: "/dashboard/exhibits", show: user?.role === "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 10L4 17V7m8 4L4 7m8 4v10" />
        </svg>
      ),
    },
    {
      key: "briefs-investigator", label: "Briefs", path: "/dashboard/briefs", show: user?.role === "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: "back-briefs-investigator", label: "Back-Briefs", path: "/dashboard/back-briefs", show: user?.role === "investigator",
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12M19 21H7a2 2 0 01-2-2v-2m14-10V5a2 2 0 00-2-2H7" />
        </svg>
      ),
    },
    {
      key: "statistics",
      label: "Statistics",
      path: "/dashboard/statistics",
      show: isSuperuser || ["admin", "co", "corps_cmd", "mpc_hqs", "cop", "detachment", "investigator", "duty_officer", "adj"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      key: "analytics",
      label: "Analytics",
      path: "/dashboard/analytics",
      show: isSuperuser || ["admin", "co", "corps_cmd", "mpc_hqs", "cop", "detachment", "investigator", "adj"].includes(user?.role),
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    // Always show Offence for Superuser
    ...(isSuperuser ? [
      {
        key: "offence",
        label: "Offence",
        path: "#offence-modal",
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
  ];
  return items.filter((item) => item.show);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [initialUser] = useState(() => readCachedUser());
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const [unreadCount, setUnreadCount] = useState(0);
  const [offences, setOffences] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [offenceModalOpen, setOffenceModalOpen] = useState(false);

  const closeAllModules = React.useCallback(() => {
    setMobileNavOpen(false);
    setLogoutConfirmOpen(false);
    setOffenceModalOpen(false);
  }, []);

  const openMobileNav = () => {
    closeAllModules();
    setMobileNavOpen(true);
  };

  const openOffenceModal = () => {
    closeAllModules();
    if (!offences.length) loadOffences();
    setOffenceModalOpen(true);
  };

  const openLogoutConfirm = () => {
    closeAllModules();
    setLogoutConfirmOpen(true);
  };

  const loadOffences = React.useCallback(() => {
    offenceService.list().then((r) => setOffences(Array.isArray(r.data) ? r.data : r.data?.results ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    authService
      .me()
      .then((res) => {
        setUser(res.data);
        cacheUser(res.data);
      })
      .catch(() => {
        clearCachedUser();
        navigate("/login");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const refreshUnreadCount = React.useCallback(() => {
    const access = sessionStorage.getItem("access_token");
    const refresh = sessionStorage.getItem("refresh_token");
    if (!access && !refresh) return;

    notificationService
      .list({ page_size: 100 })
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.results) ? res.data.results : [];
        setUnreadCount(items.filter((n) => !n.is_read).length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const cancelInitial = scheduleNonCritical(refreshUnreadCount);
    const id = setInterval(refreshUnreadCount, 30000);
    return () => {
      cancelInitial?.();
      clearInterval(id);
    };
  }, [user, refreshUnreadCount]);

  const handleLogout = () => {
    openLogoutConfirm();
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      await authService.logout();
      navigate("/login");
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  };

  const handleOffenceSave = (data) => {
    return offenceService.create(data)
      .then(() => { loadOffences(); })
      .catch(() => {});
  };

  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  // Show HQDashboard for HQ battalion admins, Overview for others
  const isHqsAdmin = user?.role === "admin" && user?.battalion_type === "hqs";
  const isCorpsCommander = user?.role === "corps_cmd";
  const isInvestigator = user?.role === "investigator";

  // Roles that are scoped to either a detachment or a battalion
  const DETACHMENT_LEVEL_ROLES = ["detachment", "investigator", "personnel"];
  const isDetachmentLevelRole = DETACHMENT_LEVEL_ROLES.includes(user?.role);
  const hasDetachment = !!user?.detachment;
  const isSpecialBattalionAdmin = user?.role === "admin" && String(user?.battalion_type || "").toLowerCase() === "special";

  // Sidebar navigation items
  const visibleNav = getNavItems(user);
  const roleLabel = !!user?.is_superuser
    ? "Superuser"
    : ROLE_LABELS[user?.role] || user?.role;
  const battalionLabel = isInvestigator
    ? user?.detachment_name
      ? `${user.detachment_name} Investigator Dashboard`
      : user?.battalion_name
      ? `${user.battalion_name} Investigator Dashboard`
      : "Investigator Dashboard"
    : isDetachmentLevelRole && hasDetachment && user?.detachment_name
    ? `${user.detachment_name} Detachment Dashboard`
    : isCorpsCommander
    ? "Corps Command Dashboard"
    : user?.battalion_name && String(user?.battalion_type || "").toLowerCase() === "hqs"
    ? `${user.battalion_name} Dashboard`
    : user?.battalion_name
    ? `${user.battalion_name} ${String(user.battalion_type || "").toUpperCase()} Dashboard`
    : "General Dashboard";

  if (location.pathname === "/dashboard/change-password") {
    return (
      <Suspense fallback={<ModuleFallback />}>
        <ChangePassword user={user} />
      </Suspense>
    );
  }

  return (
    <div className="dashboard-light min-h-screen bg-gray-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-56 bg-gray-800 flex-col">
        <div className="px-5 py-4 border-b border-gray-700">
          <h1 className="text-lg font-bold text-white tracking-widest uppercase">MPIMS</h1>
          <p className="text-xs text-gray-400 mt-0.5">{roleLabel}</p>
          <p className="text-xs text-gray-500 mt-1">{battalionLabel}</p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) =>
            item.key === "offence" ? (
              <button
                key={item.key}
                type="button"
                onClick={openOffenceModal}
                className="flex items-center justify-between w-full px-3 py-2 rounded text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2">
                  {item.icon}
                  {item.label}
                </span>
              </button>
            ) : (
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
            )
          )}
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

      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={openMobileNav}
          className="inline-flex items-center justify-center w-9 h-9 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
          aria-label="Open navigation menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0 text-center px-2">
          <p className="text-sm font-semibold text-white truncate">MPIMS</p>
          <p className="text-[11px] text-gray-400 truncate">{roleLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs px-2.5 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Mobile Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="relative w-72 max-w-[85vw] bg-gray-800 flex flex-col h-full shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-700 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white tracking-widest uppercase">MPIMS</h1>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{roleLabel}</p>
                <p className="text-xs text-gray-500 mt-1 truncate">{battalionLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="w-8 h-8 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
              {visibleNav.map((item) =>
                item.key === "offence" ? (
                  <button
                    key={item.key}
                    type="button"
                    onClick={openOffenceModal}
                    className="flex items-center justify-between w-full px-3 py-2 rounded text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </span>
                  </button>
                ) : (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    end={item.exact}
                    onClick={() => setMobileNavOpen(false)}
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
                )
              )}
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
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-900 pt-14 lg:pt-0">
        <Suspense fallback={<ModuleFallback />}>
          <Routes>
            <Route path="/" element={
              isInvestigator ? <InvestigatorDashboard user={user} /> :
              (isHqsAdmin || isCorpsCommander) ? <HQDashboard user={user} /> :
              (isDetachmentLevelRole && hasDetachment) ? <DetachmentDashboard user={user} /> :
              (isDetachmentLevelRole && !hasDetachment) ? <BattalionDashboard user={user} /> :
              user?.battalion_type ? <BattalionDashboard user={user} /> :
              <Overview user={user} />
            } />
            <Route path="/cases/*" element={<Cases user={user} />} />
            <Route path="/court-martial" element={<Cases user={user} criminalTypeFilter="court_martial" />} />
            <Route path="/dci-civ-police" element={<Cases user={user} criminalTypeFilter="dci_civ_police" />} />
            <Route path="/incidents/*" element={<Incidents user={user} />} />
            <Route path="/morning-briefs/*" element={<MorningBriefs user={user} />} />
            <Route path="/guardrooms/*" element={<Guardrooms user={user} />} />
            <Route path="/duty-room" element={<DutyRoom user={user} />} />
            <Route path="/exhibits" element={<Exhibits user={user} />} />
            <Route path="/briefs" element={<Briefs user={user} />} />
            <Route path="/back-briefs" element={<BackBriefs user={user} />} />
            <Route path="/users/*" element={<Users user={user} />} />
            <Route path="/teams" element={<Teams user={user} scope={isSpecialBattalionAdmin ? "battalion" : "detachment"} />} />
            <Route path="/Battalions" element={<Formations user={user} />} />
            <Route path="/formations" element={<Formations user={user} />} />
            <Route path="/formations-btn" element={<Offences user={user} />} />
            <Route
              path="/notifications"
              element={<Notifications onRead={refreshUnreadCount} />}
            />
            <Route path="/change-password" element={<ChangePassword user={user} />} />
            <Route path="/det-teams" element={<Teams user={user} />} />
            <Route path="/my-team" element={<InvestigatorDashboard user={user} />} />
            <Route path="/statistics" element={<Statistics user={user} />} />
            <Route path="/analytics" element={<Analytics user={user} />} />
            <Route path="/battalion-detachments" element={<DetachmentOverview user={user} />} />
          </Routes>
          {offenceModalOpen && (
            <OffenceModal
              open={offenceModalOpen}
              onClose={() => setOffenceModalOpen(false)}
              onSave={handleOffenceSave}
              user={user}
              offences={offences}
            />
          )}
        </Suspense>
      </main>

      {logoutConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setLogoutConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-white">Confirm Logout</h3>
              <p className="mt-1 text-sm text-gray-400">You are about to end your current session.</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-300">Do you want to log out now?</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-5 py-4">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                disabled={loggingOut}
                className="rounded px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                disabled={loggingOut}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

