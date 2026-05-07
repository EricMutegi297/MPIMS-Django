import React, { useEffect, useState, useCallback, useRef } from "react";
import { caseService, teamService, abstractService } from "../services/api";

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

const STATUS_COLORS = {
  new: "bg-gray-600 text-gray-200",
  open: "bg-blue-500/20 text-blue-400",
  tasked: "bg-yellow-500/20 text-yellow-400",
  under_investigation: "bg-indigo-500/20 text-indigo-400",
  pending: "bg-orange-500/20 text-orange-400",
  served: "bg-teal-500/20 text-teal-400",
  closed: "bg-green-500/20 text-green-400",
  dismissed: "bg-red-500/20 text-red-400",
  referred: "bg-purple-500/20 text-purple-400",
};

/* ─── Clickable Stat Card ───────────────────────────────── */
function StatCard({ label, value, color = "text-white", active, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      className={`bg-gray-800 rounded-lg p-4 border text-left w-full transition-all ${
        active
          ? "border-indigo-500 ring-1 ring-indigo-500 shadow-lg shadow-indigo-900/20"
          : "border-gray-700 hover:border-gray-500"
      }`}
    >
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{loading ? "…" : value}</p>
    </button>
  );
}

/* ─── Attachment Badge ───────────────────────────────────── */
function AttachBadge({ label, present }) {
  return (
    <span
      title={present ? `${label} attached` : `${label} not attached`}
      className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${
        present
          ? "bg-green-500/20 text-green-400 border border-green-500/30"
          : "bg-gray-700 text-gray-500 border border-gray-600"
      }`}
    >
      {present ? "✓" : "✗"} {label}
    </span>
  );
}

/* ─── Brief Upload Modal ─────────────────────────────────── */
function BriefModal({ caseObj, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError("Please select a file."); return; }
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("brief_document", file);
      const res = await caseService.attachBrief(caseObj.id, fd);
      onSuccess(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Attach Brief</h3>
          <span className="text-gray-400 text-sm font-mono">{caseObj.case_number}</span>
        </div>
        {error && (
          <p className="text-red-400 text-sm mb-3 bg-red-900/20 border border-red-700/30 rounded px-3 py-2">{error}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Brief Document</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files[0])}
              className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-indigo-600 file:text-white file:text-sm cursor-pointer"
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50 transition-colors"
            >
              {loading ? "Uploading…" : "Attach Brief"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Abstract Attachments Modal ─────────────────────────── */
function AbstractModal({ caseObj, onClose, onCountChange }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [desc, setDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await abstractService.list(caseObj.id);
      const items = toArray(res.data);
      setAttachments(items);
      return items.length;
    } catch {
      setAttachments([]);
      return 0;
    } finally {
      setLoading(false);
    }
  }, [caseObj.id]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) { setError("Select a file."); return; }
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("case", caseObj.id);
      fd.append("file", file);
      if (desc) fd.append("description", desc);
      await abstractService.create(fd);
      setFile(null);
      setDesc("");
      if (fileRef.current) fileRef.current.value = "";
      const newCount = await load();
      onCountChange?.(newCount);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await abstractService.delete(id);
      const newCount = await load();
      onCountChange?.(newCount);
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h3 className="text-white font-semibold">Abstract Attachments</h3>
            <p className="text-gray-500 text-xs font-mono">{caseObj.case_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-6">Loading…</p>
          ) : attachments.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">No abstract attachments yet.</p>
          ) : (
            attachments.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 bg-gray-700/40 rounded-lg p-3 border border-gray-600/40">
                <div className="min-w-0 flex-1">
                  <a
                    href={a.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm hover:underline truncate block"
                  >
                    {a.file?.split("/").pop() || "File"}
                  </a>
                  {a.description && <p className="text-gray-400 text-xs mt-0.5">{a.description}</p>}
                  <p className="text-gray-600 text-xs mt-0.5">{a.uploaded_at?.slice(0, 10)}</p>
                </div>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-red-400 hover:text-red-300 text-xs shrink-0 px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
        <div className="p-5 border-t border-gray-700 shrink-0">
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          <form onSubmit={handleUpload} className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.csv"
              onChange={(e) => setFile(e.target.files[0])}
              className="w-full text-xs text-gray-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-600 file:text-gray-200 file:text-xs cursor-pointer"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-white rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={uploading}
              className="w-full py-2 text-sm bg-yellow-600 hover:bg-yellow-700 text-white rounded disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading…" : "Add Attachment"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─── Serve Case Confirm Modal ───────────────────────────── */
function ServeModal({ caseObj, abstractCount, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleServe = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await caseService.serveCase(caseObj.id);
      onSuccess(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to serve case.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-sm p-6">
        <h3 className="text-white font-semibold mb-3">Serve Case</h3>
        <p className="text-gray-400 text-sm mb-1">
          Mark <span className="text-white font-mono">{caseObj.case_number}</span> as{" "}
          <span className="text-teal-400 font-semibold">Served</span>?
        </p>
        <p className="text-gray-500 text-xs mb-4">
          {abstractCount} abstract attachment{abstractCount !== 1 ? "s" : ""} on file.
          This action cannot be undone.
        </p>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleServe}
            disabled={loading}
            className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded disabled:opacity-50 transition-colors"
          >
            {loading ? "Processing…" : "Confirm Serve"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Case Row (with actions for under_investigation) ────── */
function CaseRow({ c, onRefresh }) {
  const [caseData, setCaseData] = useState(c);
  const [briefModal, setBriefModal] = useState(false);
  const [abstractModal, setAbstractModal] = useState(false);
  const [serveModal, setServeModal] = useState(false);
  const [forwarding, setForwarding] = useState("");

  const isUnderInv = caseData.status === "under_investigation";

  const handleForward = async (target) => {
    setForwarding(target);
    try {
      const res = await caseService.forwardBrief(caseData.id, { forward_to: target });
      setCaseData(res.data);
    } catch { /* ignore */ } finally {
      setForwarding("");
    }
  };

  return (
    <>
      <tr className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors align-top">
        <td className="px-4 py-3 text-blue-400 font-mono text-xs whitespace-nowrap">
          {caseData.case_number}
        </td>
        <td className="px-4 py-3">
          <div className="text-white text-sm font-medium">{caseData.accused_name || "—"}</div>
          <div className="text-gray-500 text-xs hidden md:block">{caseData.accused_service_number || ""}</div>
        </td>
        <td className="px-4 py-3 text-gray-300 text-sm hidden sm:table-cell">
          {caseData.offence_name || caseData.offence || "—"}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[caseData.status] || "bg-gray-600 text-gray-300"}`}>
            {caseData.status?.replace(/_/g, " ")}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-1">
              <AttachBadge label="RFI" present={!!caseData.rfi_document} />
              <AttachBadge label="TL" present={!!caseData.tasking_letter} />
              <AttachBadge label="Brief" present={!!caseData.brief_document} />
            </div>
            {caseData.abstracts_count > 0 && (
              <span className="text-[10px] text-teal-400 font-medium">
                {caseData.abstracts_count} abstract{caseData.abstracts_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          {isUnderInv ? (
            <div className="flex flex-col gap-1.5">
              {/* Attach Brief */}
              <button
                onClick={() => setBriefModal(true)}
                className="text-xs px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded border border-indigo-600/30 whitespace-nowrap transition-colors"
              >
                {caseData.brief_document ? "Replace Brief" : "Attach Brief"}
              </button>

              {/* Forward buttons — only shown when brief is attached */}
              {caseData.brief_document && (
                <>
                  <button
                    onClick={() => !caseData.brief_forwarded_co && handleForward("co")}
                    disabled={caseData.brief_forwarded_co || forwarding === "co"}
                    className={`text-xs px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                      caseData.brief_forwarded_co
                        ? "bg-green-500/10 text-green-500 border-green-500/30 cursor-default"
                        : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 border-gray-600 cursor-pointer"
                    }`}
                  >
                    {caseData.brief_forwarded_co ? "✓ Sent to CO" : forwarding === "co" ? "Sending…" : "→ Forward to CO"}
                  </button>
                  <button
                    onClick={() => !caseData.brief_forwarded_corps && handleForward("corps_cmd")}
                    disabled={caseData.brief_forwarded_corps || forwarding === "corps_cmd"}
                    className={`text-xs px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                      caseData.brief_forwarded_corps
                        ? "bg-green-500/10 text-green-500 border-green-500/30 cursor-default"
                        : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 border-gray-600 cursor-pointer"
                    }`}
                  >
                    {caseData.brief_forwarded_corps ? "✓ Sent to Corps" : forwarding === "corps_cmd" ? "Sending…" : "→ Forward to Corps"}
                  </button>
                </>
              )}

              {/* Compile Abstract */}
              <button
                onClick={() => setAbstractModal(true)}
                className="text-xs px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-300 rounded border border-yellow-600/30 whitespace-nowrap transition-colors"
              >
                Abstract{caseData.abstracts_count > 0 ? ` (${caseData.abstracts_count})` : ""}
              </button>

              {/* Serve Case — blocked when no abstracts */}
              <button
                onClick={() => caseData.abstracts_count > 0 && setServeModal(true)}
                disabled={!caseData.abstracts_count}
                title={!caseData.abstracts_count ? "Add abstract attachments before serving" : "Mark case as served"}
                className={`text-xs px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                  caseData.abstracts_count > 0
                    ? "bg-teal-600/20 hover:bg-teal-600/40 text-teal-300 border-teal-600/30 cursor-pointer"
                    : "bg-gray-700/20 text-gray-600 border-gray-700 cursor-not-allowed"
                }`}
              >
                Serve Case
              </button>
            </div>
          ) : (
            <span className="text-gray-600 text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell whitespace-nowrap">
          {caseData.created_at?.slice(0, 10)}
        </td>
      </tr>

      {briefModal && (
        <BriefModal
          caseObj={caseData}
          onClose={() => setBriefModal(false)}
          onSuccess={(updated) => setCaseData(updated)}
        />
      )}
      {abstractModal && (
        <AbstractModal
          caseObj={caseData}
          onClose={() => setAbstractModal(false)}
          onCountChange={(count) => setCaseData((prev) => ({ ...prev, abstracts_count: count }))}
        />
      )}
      {serveModal && (
        <ServeModal
          caseObj={caseData}
          abstractCount={caseData.abstracts_count}
          onClose={() => setServeModal(false)}
          onSuccess={(updated) => { setCaseData(updated); onRefresh?.(); }}
        />
      )}
    </>
  );
}

/* ─── Investigator Dashboard ─────────────────────────────── */
export default function InvestigatorDashboard({ user }) {
  const [myTeams, setMyTeams] = useState([]);
  const [cases, setCases] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingCases, setLoadingCases] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    try {
      const res = await teamService.list();
      const all = toArray(res.data);
      const mine = all.filter(
        (t) =>
          t.team_ic === user?.id ||
          t.team_ic_detail?.id === user?.id ||
          (t.members || []).includes(user?.id)
      );
      setMyTeams(mine);
    } catch {
      setMyTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  }, [user?.id]);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const res = await caseService.list();
      setCases(toArray(res.data));
    } catch {
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
    loadCases();
  }, [loadTeams, loadCases]);

  // My cases: directly assigned OR assigned to a team I belong to
  const myTeamIds = myTeams.map((t) => t.id);
  const myCases = cases.filter(
    (c) =>
      c.assigned_to === user?.id ||
      (c.assigned_team && myTeamIds.includes(c.assigned_team))
  );

  const counts = {
    all: myCases.length,
    under_investigation: myCases.filter((c) => c.status === "under_investigation").length,
    pending: myCases.filter((c) => c.status === "pending").length,
    served: myCases.filter((c) => c.status === "served").length,
  };

  const filteredCases =
    activeFilter === "all" ? myCases : myCases.filter((c) => c.status === activeFilter);

  const filterLabel =
    activeFilter === "all"
      ? "All Cases"
      : activeFilter.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Investigator Dashboard</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          {user?.rank ? `${user.rank} ` : ""}{user?.name}
          {user?.battalion_name ? ` — ${user.battalion_name}` : ""}
        </p>
      </div>

      {/* Clickable Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="My Cases"
          value={counts.all}
          color="text-white"
          active={activeFilter === "all"}
          onClick={() => setActiveFilter("all")}
          loading={loadingCases}
        />
        <StatCard
          label="Under Investigation"
          value={counts.under_investigation}
          color="text-indigo-400"
          active={activeFilter === "under_investigation"}
          onClick={() => setActiveFilter("under_investigation")}
          loading={loadingCases}
        />
        <StatCard
          label="Pending"
          value={counts.pending}
          color="text-orange-400"
          active={activeFilter === "pending"}
          onClick={() => setActiveFilter("pending")}
          loading={loadingCases}
        />
        <StatCard
          label="Served"
          value={counts.served}
          color="text-teal-400"
          active={activeFilter === "served"}
          onClick={() => setActiveFilter("served")}
          loading={loadingCases}
        />
      </div>

      {/* My Teams (compact) */}
      {!loadingTeams && myTeams.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
            My Investigation Teams
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myTeams.map((team) => {
              const isIC = team.team_ic === user?.id || team.team_ic_detail?.id === user?.id;
              const teamCases = myCases.filter((c) => c.assigned_team === team.id);
              return (
                <div key={team.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-white font-medium text-sm truncate">{team.name}</p>
                    {isIC && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
                        IC
                      </span>
                    )}
                  </div>
                  {team.team_ic_detail && (
                    <p className="text-xs text-gray-500 mb-2">
                      IC: {team.team_ic_detail.rank ? `${team.team_ic_detail.rank} ` : ""}{team.team_ic_detail.name}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{team.members_detail?.length || 0} member{(team.members_detail?.length || 0) !== 1 ? "s" : ""}</span>
                    <span className="text-indigo-400">{teamCases.length} case{teamCases.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Cases Table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            {filterLabel}
            {filteredCases.length > 0 && (
              <span className="ml-2 text-xs font-normal bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full normal-case">
                {filteredCases.length}
              </span>
            )}
          </h3>
          {activeFilter !== "all" && (
            <button
              onClick={() => setActiveFilter("all")}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← All cases
            </button>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg overflow-x-auto border border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 whitespace-nowrap">Case #</th>
                <th className="text-left px-4 py-3">Accused</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Offence</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Docs</th>
                <th className="text-left px-4 py-3">Actions</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {loadingCases ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">Loading cases…</td></tr>
              ) : filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    {activeFilter === "all"
                      ? "No cases assigned to you or your teams yet."
                      : `No ${filterLabel.toLowerCase()} cases.`}
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => (
                  <CaseRow key={c.id} c={c} onRefresh={loadCases} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
      {present ? (
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      )}
      {label}
    </span>
  );
}

/* ─── Case Row ──────────────────────────────────────────── */
function CaseRow({ c }) {
  const hasRfi = Boolean(c.rfi_document);
  const hasTl = Boolean(c.tasking_letter);
  const attachCount = (hasRfi ? 1 : 0) + (hasTl ? 1 : 0);

  return (
    <tr className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
      <td className="px-4 py-3 text-blue-400 font-mono text-xs whitespace-nowrap">{c.case_number}</td>
      <td className="px-4 py-3">
        <div className="text-white font-medium">{c.accused_name || "--"}</div>
        <div className="text-gray-500 text-xs mt-0.5 md:hidden">{c.accused_service_number || ""}</div>
      </td>
      <td className="px-4 py-3 text-gray-300 hidden md:table-cell">{c.accused_service_number || "--"}</td>
      <td className="px-4 py-3 text-gray-300 hidden sm:table-cell">{c.offence_name || c.offence || "--"}</td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] || "bg-gray-600 text-gray-300"}`}>
          {c.status?.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <AttachBadge label="RFI" present={hasRfi} />
            <AttachBadge label="TL" present={hasTl} />
          </div>
          <span className="text-[10px] text-gray-500">{attachCount}/2 docs</span>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">{c.created_at?.slice(0, 10)}</td>
    </tr>
  );
}

/* ─── Investigator Dashboard ────────────────────────────── */
export default function InvestigatorDashboard({ user }) {
  const [myTeams, setMyTeams] = useState([]);
  const [cases, setCases] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingCases, setLoadingCases] = useState(true);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    try {
      const res = await teamService.list();
      const all = toArray(res.data);
      // Only teams where this user is a member or the IC
      const mine = all.filter(
        (t) =>
          t.team_ic === user?.id ||
          (t.members || []).includes(user?.id)
      );
      setMyTeams(mine);
    } catch {
      setMyTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  }, [user?.id]);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const res = await caseService.list();
      setCases(toArray(res.data));
    } catch {
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
    loadCases();
  }, [loadTeams, loadCases]);

  // Cases under investigation (assigned to any of my teams)
  const myTeamIds = myTeams.map((t) => t.id);
  const myCases = cases.filter((c) => c.assigned_team && myTeamIds.includes(c.assigned_team));
  const openCount = myCases.filter((c) => c.status === "under_investigation").length;
  const closedCount = myCases.filter((c) => c.status === "closed" || c.status === "dismissed").length;
  const otherCases = cases.filter((c) => !c.assigned_team || !myTeamIds.includes(c.assigned_team));

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Investigator Dashboard</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Welcome, {user?.rank ? `${user.rank} ` : ""}{user?.name} — {user?.battalion_name}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="My Teams" value={loadingTeams ? "…" : myTeams.length} color="text-indigo-400" />
        <StatCard label="My Cases" value={loadingCases ? "…" : myCases.length} color="text-white" />
        <StatCard label="Under Investigation" value={loadingCases ? "…" : openCount} color="text-yellow-400" />
        <StatCard label="Closed / Dismissed" value={loadingCases ? "…" : closedCount} color="text-green-400" />
      </div>

      {/* My Teams */}
      <section>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">My Investigation Teams</h3>
        {loadingTeams ? (
          <div className="text-gray-500 text-sm py-6 text-center">Loading teams…</div>
        ) : myTeams.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-6 text-center border border-gray-700">
            <p className="text-gray-500 text-sm">You are not assigned to any investigation team yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myTeams.map((team) => {
              const isIC = team.team_ic === user?.id || team.team_ic_detail?.id === user?.id;
              const teamCases = myCases.filter((c) => c.assigned_team === team.id);
              return (
                <div key={team.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{team.name}</p>
                      {isIC && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 mt-1 inline-block">
                          Team IC
                        </span>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 whitespace-nowrap">
                      {teamCases.length} case{teamCases.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* IC info */}
                  {team.team_ic_detail && (
                    <div className="text-xs text-gray-400">
                      <span className="text-gray-500">IC: </span>
                      {team.team_ic_detail.rank ? `${team.team_ic_detail.rank} ` : ""}
                      {team.team_ic_detail.name}
                    </div>
                  )}

                  {/* Members */}
                  {team.members_detail && team.members_detail.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Members ({team.members_detail.length})</p>
                      <div className="space-y-1">
                        {team.members_detail.slice(0, 4).map((m) => (
                          <div key={m.id} className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-indigo-600/40 flex items-center justify-center shrink-0">
                              <span className="text-[9px] text-indigo-300 font-bold">
                                {m.name?.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-xs text-gray-300 truncate">
                              {m.rank ? `${m.rank} ` : ""}{m.name}
                            </span>
                          </div>
                        ))}
                        {team.members_detail.length > 4 && (
                          <p className="text-xs text-gray-500">+{team.members_detail.length - 4} more</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Cases Assigned to My Teams */}
      <section>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Cases Assigned to My Teams
          {myCases.length > 0 && (
            <span className="ml-2 text-xs font-normal bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
              {myCases.length}
            </span>
          )}
        </h3>
        <div className="bg-gray-800 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 whitespace-nowrap">Case #</th>
                <th className="text-left px-4 py-3">Accused</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Svc No</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Offence</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Attachments</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {loadingCases ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Loading…</td></tr>
              ) : myCases.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No cases assigned to your teams yet.</td></tr>
              ) : (
                myCases.map((c) => <CaseRow key={c.id} c={c} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Other Battalion Cases (awareness) */}
      {otherCases.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
            Other Battalion Cases
            <span className="ml-2 text-xs font-normal bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
              {otherCases.length}
            </span>
          </h3>
          <div className="bg-gray-800 rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-700/60 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Case #</th>
                  <th className="text-left px-4 py-3">Accused</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Svc No</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Offence</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Attachments</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {otherCases.map((c) => <CaseRow key={c.id} c={c} />)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
