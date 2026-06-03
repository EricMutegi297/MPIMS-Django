import React, { useState, useEffect, useCallback } from "react";
import { notificationService } from "../services/api";

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const diffMin = Math.floor((Date.now() - d) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function Notifications({ onRead }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyAll, setBusyAll] = useState(false);

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
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (n) => {
    if (n.is_read) return;
    try {
      await notificationService.markRead(n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      if (onRead) onRead();
    } catch {}
  };

  const handleMarkAllRead = async () => {
    setBusyAll(true);
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      if (onRead) onRead();
    } catch {}
    finally { setBusyAll(false); }
  };

  const handleDelete = async (id) => {
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
      if (onRead) onRead();
    } catch {}
    finally { setBusyAll(false); }
  };

  const unread = notifications.filter((n) => !n.is_read);
  const read = notifications.filter((n) => n.is_read);

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Notifications</h2>
          {unread.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
              {unread.length} unread
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {unread.length > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={busyAll}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors border border-blue-400/30 rounded px-3 py-1"
            >
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={busyAll}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors border border-red-400/30 rounded px-3 py-1"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-600">
          <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-sm">No notifications</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Unread section */}
          {unread.length > 0 && (
            <>
              <div className="px-4 py-2 bg-gray-750 border-b border-gray-700">
                <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide">
                  New . {unread.length}
                </span>
              </div>
              <ul>
                {unread.map((n) => (
                  <NotifRow key={n.id} n={n} onRead={handleMarkRead} onDelete={handleDelete} />
                ))}
              </ul>
            </>
          )}

          {/* Read section */}
          {read.length > 0 && (
            <>
              <div className="px-4 py-2 border-b border-gray-700 bg-gray-800">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Earlier . {read.length}
                </span>
              </div>
              <ul>
                {read.map((n) => (
                  <NotifRow key={n.id} n={n} onRead={handleMarkRead} onDelete={handleDelete} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NotifRow({ n, onRead, onDelete }) {
  return (
    <li
      onClick={() => onRead(n)}
      className={`group flex items-start gap-3 px-4 py-3.5 border-b border-gray-700/40 cursor-pointer transition-colors ${
        n.is_read ? "hover:bg-gray-700/20" : "bg-blue-950/30 hover:bg-blue-900/30"
      }`}
    >
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0 w-2 h-2">
        {!n.is_read && <span className="block w-2 h-2 rounded-full bg-blue-400" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed break-words ${n.is_read ? "text-gray-400" : "text-gray-100 font-medium"}`}>
          {n.message}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {!n.is_read && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-blue-400">Unread</span>
          )}
          <span className="text-[11px] text-gray-600">{fmtTime(n.created_at)}</span>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all mt-0.5"
        title="Delete"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </li>
  );
}
