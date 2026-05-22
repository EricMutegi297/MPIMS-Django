import React, { useState, useEffect, useCallback, useRef } from "react";
import { notificationService } from "../services/api";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notificationService.list({ page_size: 100 });
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
        ? data.results
        : [];
      setNotifications(items);
    } catch {
      // network / auth errors — leave state unchanged
    }
  }, []);

  // Initial load + 30-second polling
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Refresh whenever the panel is opened so the list is always fresh
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkRead = async (n) => {
    if (n.is_read) return;
    try {
      await notificationService.markRead(n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
    } catch {}
  };

  const handleMarkAllRead = async () => {
    setBusyAll(true);
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
    finally { setBusyAll(false); }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await notificationService.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  };

  const handleClearAll = async () => {
    setBusyAll(true);
    try {
      await Promise.all(notifications.map((n) => notificationService.delete(n.id)));
      setNotifications([]);
    } catch {}
    finally { setBusyAll(false); }
  };

  const fmtTime = (ts) => {
    if (!ts) return "";
    const diff = Math.floor((Date.now() - new Date(ts)) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const unread = notifications.filter((n) => !n.is_read);
  const read   = notifications.filter((n) =>  n.is_read);

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Bell button ───────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors focus:outline-none"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ────────────────────────────────────── */}
      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 flex flex-col max-h-[520px]">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-red-500/20 text-red-400 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={busyAll}
                  className="text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  disabled={busyAll}
                  className="text-[11px] text-gray-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                <svg className="w-9 h-9 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              <>
                {/* ── Unread section ── */}
                {unread.length > 0 && (
                  <>
                    <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-blue-400 bg-blue-900/10 border-b border-gray-700/40">
                      New · {unread.length}
                    </p>
                    <ul>
                      {unread.map((n) => (
                        <NotifRow key={n.id} n={n} onRead={handleMarkRead} onDelete={handleDelete} fmtTime={fmtTime} />
                      ))}
                    </ul>
                  </>
                )}

                {/* ── Read section ── */}
                {read.length > 0 && (
                  <>
                    <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500 bg-gray-700/20 border-b border-t border-gray-700/40 mt-0">
                      Earlier · {read.length}
                    </p>
                    <ul>
                      {read.map((n) => (
                        <NotifRow key={n.id} n={n} onRead={handleMarkRead} onDelete={handleDelete} fmtTime={fmtTime} />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifRow({ n, onRead, onDelete, fmtTime }) {
  return (
    <li
      onClick={() => onRead(n)}
      className={`group flex items-start gap-2.5 px-4 py-3 border-b border-gray-700/30 cursor-pointer transition-colors ${
        n.is_read
          ? "hover:bg-gray-700/20"
          : "bg-blue-950/30 hover:bg-blue-900/30"
      }`}
    >
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0 w-2 h-2">
        {!n.is_read && <span className="block w-2 h-2 rounded-full bg-blue-400" />}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-xs leading-relaxed break-words ${
            n.is_read ? "text-gray-400" : "text-gray-100 font-medium"
          }`}
        >
          {n.message}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {!n.is_read && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-blue-400">
              Unread
            </span>
          )}
          <span className="text-[10px] text-gray-600">{fmtTime(n.created_at)}</span>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => onDelete(e, n.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all mt-0.5"
        title="Delete"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </li>
  );
}
