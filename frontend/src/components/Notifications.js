import React, { useEffect, useState } from "react";
import { notificationService } from "../services/api";

const TYPE_COLORS = {
  incident: "bg-red-500/20 text-red-400",
  case: "bg-blue-500/20 text-blue-400",
  morning_brief: "bg-green-500/20 text-green-400",
  system: "bg-gray-500/20 text-gray-400",
  alert: "bg-yellow-500/20 text-yellow-400",
};

export default function Notifications({ onRead }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    notificationService
      .list()
      .then((r) => {
        const data = r.data;
        setNotifications(Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = async (id) => {
    await notificationService.markRead(id).catch(() => {});
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    onRead?.();
  };

  const markAll = async () => {
    await notificationService.markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    onRead?.();
  };

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Notifications</h2>
          <p className="text-gray-400 text-sm mt-0.5">{unread} unread</p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAll}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : notifications.length === 0 ? (
        <p className="text-gray-500 text-sm">No notifications.</p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`bg-gray-800 rounded-lg px-4 py-3 flex items-start gap-3 transition-opacity ${n.is_read ? "opacity-50" : ""}`}
            >
              <span className={`text-xs px-2 py-0.5 rounded-full mt-0.5 shrink-0 ${TYPE_COLORS[n.notification_type] || ""}`}>
                {n.notification_type?.replace(/_/g, " ")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm">{n.message}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
              {!n.is_read && (
                <button
                  onClick={() => markRead(n.id)}
                  className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
