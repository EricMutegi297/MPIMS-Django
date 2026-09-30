import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { notificationService } from "../services/api";
import { groupNotifications, notificationCategory } from "../utils/notificationGroups";

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
  const navigate = useNavigate();
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
  const notificationSections = groupNotifications(notifications);

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
          {notificationSections.map((section) => (
            <section key={section.key}>
              <div className="px-4 py-2 border-b border-gray-700 bg-gray-800">
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${
                  section.read ? "text-gray-500" : "text-blue-400"
                }`}>
                  {section.label} · {section.items.length}
                </span>
              </div>
              <ul>
                {section.items.map((n) => (
                  <NotifRow
                    key={n.id}
                    n={n}
                    category={notificationCategory(n)}
                    onRead={handleMarkRead}
                    onDelete={handleDelete}
                    onNavigate={navigate}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NotifRow({ n, category, onRead, onDelete, onNavigate }) {
  const acknowledgementNotice = n.related_model === "case" && /acknowledgement sheet/i.test(n.message || "");
  const caseCommentNotice = ["case_comment", "case_comment_reply"].includes(n.related_model) && n.related_case_id && n.related_id;
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
        <span className="inline-flex mb-1 rounded bg-gray-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-300">
          {category}
        </span>
        <p className={`text-sm leading-relaxed break-words ${n.is_read ? "text-gray-400" : "text-gray-100 font-medium"}`}>
          {n.message}
        </p>
        {acknowledgementNotice && n.related_id && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRead(n);
              onNavigate(`/dashboard/cases?case=${n.related_id}&action=acknowledge`);
            }}
            className="mt-2 text-xs font-semibold text-sky-400 hover:text-sky-300 hover:underline"
          >
            Click here to attach acknowledgement
          </button>
        )}
        {caseCommentNotice && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRead(n);
              onNavigate(`/dashboard/cases?case=${n.related_case_id}&comment=${n.related_id}`);
            }}
            className="mt-2 text-xs font-semibold text-sky-400 hover:text-sky-300 hover:underline"
          >
            Read comment and reply
          </button>
        )}
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
