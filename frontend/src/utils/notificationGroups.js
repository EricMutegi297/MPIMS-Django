const GROUPS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "older", label: "Earlier" },
];

export function notificationCategory(notification) {
  if (["case_comment", "case_comment_reply"].includes(notification?.related_model)) {
    return "Case comments";
  }
  const labels = {
    incident: "Incidents",
    case: "Cases",
    morning_brief: "Morning briefs",
    system: "System",
    alert: "Alerts",
  };
  return labels[notification?.notification_type] || "Other";
}

export function groupNotifications(notifications) {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString();
  const sections = [];

  for (const read of [false, true]) {
    for (const group of GROUPS) {
      const items = notifications.filter((notification) => {
        if (Boolean(notification.is_read) !== read) return false;
        const date = new Date(notification.created_at);
        const dateKey = Number.isNaN(date.getTime()) ? "" : date.toDateString();
        if (group.key === "today") return dateKey === today;
        if (group.key === "yesterday") return dateKey === yesterday;
        return dateKey !== today && dateKey !== yesterday;
      });
      if (items.length) {
        sections.push({
          key: `${read ? "read" : "unread"}-${group.key}`,
          label: `${read ? "Read" : "Unread"} · ${group.label}`,
          read,
          items,
        });
      }
    }
  }
  return sections;
}
