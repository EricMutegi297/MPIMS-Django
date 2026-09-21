import React, { useCallback, useEffect, useMemo, useState } from "react";
import { todoService } from "../services/api";

const MANAGER_ROLES = ["admin", "adj", "sec_corps_cmd"];

function dateLabel(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function EventsTable({ events, canManage, onEdit, onDelete }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left">
          <thead className="border-b border-gray-700 bg-gray-700/30">
            <tr className="text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3 font-semibold">#</th>
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Description</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {canManage && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/80">
            {events.map((event, index) => {
              const finished = event.is_finished;
              return (
                <tr key={event.id} className="align-top transition-colors hover:bg-gray-700/30">
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">{index + 1}</td>
                  <td className="max-w-[190px] px-4 py-4">
                    <div className="font-semibold text-white">{event.title}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-300">{dateLabel(event.event_date)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-300">{event.event_time ? event.event_time.slice(0, 5) : "—"}</td>
                  <td className="max-w-[150px] px-4 py-4 text-sm text-gray-300">{event.location || "—"}</td>
                  <td className="max-w-[240px] px-4 py-4 text-sm leading-5 text-gray-400">
                    {event.description || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      finished
                        ? "bg-gray-700 text-gray-300"
                        : event.days_until === 0
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-blue-500/15 text-blue-300"
                    }`}>
                      {finished ? "Finished" : event.days_until === 0 ? "Today" : `In ${event.days_until} day${event.days_until === 1 ? "" : "s"}`}
                    </span>
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <button onClick={() => onEdit(event)} className="mr-3 text-xs font-medium text-blue-400 hover:text-blue-300">Edit</button>
                      <button onClick={() => onDelete(event)} className="text-xs font-medium text-red-400 hover:text-red-300">Delete</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!events.length && (
        <div className="border-t border-gray-700 px-6 py-12 text-center text-sm text-gray-500">
          No events in this list.
        </div>
      )}
    </div>
  );
}

export default function TodoList({ user }) {
  const [events, setEvents] = useState([]);
  const [showFinished, setShowFinished] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", event_date: "", event_time: "", location: "", scope: "battalion" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canManage = MANAGER_ROLES.includes(user?.role);
  const isCorpsManager = user?.role === "sec_corps_cmd" || user?.is_superuser;
  const userBattalionId = user?.battalion_id
    || (typeof user?.battalion === "number" ? user.battalion : user?.battalion?.id);

  const load = useCallback(async () => {
    try {
      const response = await todoService.list({ page_size: 200 });
      const data = response.data;
      setEvents(Array.isArray(data) ? data : data.results || []);
    } catch {
      setError("Unable to load the To-Do and Calendar events.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleEvents = useMemo(
    () => events.filter((event) => Boolean(event.is_finished) === showFinished),
    [events, showFinished]
  );

  const resetForm = () => {
    setEditing(null);
    setForm({ title: "", description: "", event_date: "", event_time: "", location: "", scope: isCorpsManager ? "corps" : "battalion" });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        battalion: form.scope === "battalion" ? userBattalionId : null,
      };
      if (editing) await todoService.update(editing.id, payload);
      else await todoService.create(payload);
      resetForm();
      await load();
    } catch (err) {
      const responseData = err.response?.data;
      const fieldErrors = responseData && typeof responseData === "object"
        ? Object.entries(responseData)
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages}`)
          .join(" | ")
        : "";
      setError(fieldErrors || responseData?.detail || "Unable to save this event.");
    } finally {
      setBusy(false);
    }
  };

  const edit = (event) => {
    setEditing(event);
    setForm({
      title: event.title,
      description: event.description || "",
      event_date: event.event_date,
      event_time: event.event_time || "",
      location: event.location || "",
      scope: event.scope,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (event) => {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    try {
      await todoService.delete(event.id);
      setEvents((current) => current.filter((item) => item.id !== event.id));
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to delete this event.");
    }
  };

  return (
    <div className="min-h-full bg-gray-900 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Events & reminders</p>
          <h1 className="mt-1 text-2xl font-bold text-white">To-Do List & Calendar</h1>
          <p className="mt-1 text-sm text-gray-400">Upcoming events remain visible until their date; past events move automatically to Finished.</p>
        </header>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {canManage && (
          <form onSubmit={submit} className="rounded-xl border border-gray-700 bg-gray-800 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-white">{editing ? "Edit event" : "Add event"}</h2>
              {editing && <button type="button" onClick={resetForm} className="text-xs text-gray-400 hover:text-white">Cancel</button>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white" />
              <input required type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white" />
              <input type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white" />
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white" />
              {user?.is_superuser && (
                <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white">
                  <option value="battalion">Battalion event</option>
                  <option value="corps">Corps event</option>
                </select>
              )}
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What must the CO or Corps Commander participate in?" rows={2} className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white md:col-span-2" />
            </div>
            <button disabled={busy} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{busy ? "Saving..." : editing ? "Save changes" : "Add event"}</button>
          </form>
        )}

        <div className="flex gap-2">
          <button onClick={() => setShowFinished(false)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${!showFinished ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}>Upcoming ({events.filter((event) => !event.is_finished).length})</button>
          <button onClick={() => setShowFinished(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${showFinished ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}>Finished ({events.filter((event) => event.is_finished).length})</button>
        </div>
        <section>
          <EventsTable events={visibleEvents} canManage={canManage} onEdit={edit} onDelete={remove} />
        </section>
      </div>
    </div>
  );
}
