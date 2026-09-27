import React, { useEffect, useState } from "react";
import { caseService, formationService } from "../services/api";

const asArray = (data) => (Array.isArray(data) ? data : data?.results || []);

export default function TransferCases() {
  const [cases, setCases] = useState([]);
  const [transferableCases, setTransferableCases] = useState([]);
  const [battalions, setBattalions] = useState([]);
  const [search, setSearch] = useState("");
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [selected, setSelected] = useState([]);
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");
  const [letter, setLetter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [caseResponse, transferableResponse, battalionResponse] = await Promise.all([
        caseService.transferred(),
        caseService.transferable(),
        formationService.battalions({ page_size: 200 }),
      ]);
      setCases(asArray(caseResponse.data));
      setTransferableCases(asArray(transferableResponse.data));
      setBattalions(asArray(battalionResponse.data));
    } catch {
      setError("Unable to load transferable cases.");
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = (id) => setSelected((ids) => (
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
  ));

  const matchingCases = (items) => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => [
      item.case_number,
      item.title,
      item.status,
      item.tasked_battalion_name,
      item.accused_name,
      item.accused_service_number,
      item.offence_name,
      item.offence,
      item.description,
      item.transfer_from,
      item.transfer_to,
      item.transfer_reason,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!selected.length || !destination || !reason.trim() || !instructions.trim() || !letter) {
      setError("Select cases, destination Battalion, reason, instructions, and a transfer letter.");
      return;
    }
    const form = new FormData();
    selected.forEach((id) => form.append("case_ids", id));
    form.append("destination_battalion", destination);
    form.append("reason", reason.trim());
    form.append("instructions", instructions.trim());
    form.append("transfer_letter", letter);
    setBusy(true);
    try {
      const response = await caseService.transfer(form);
      setMessage(`${response.data.transferred} case(s) transferred to ${response.data.destination_battalion}.`);
      setSelected([]);
      setReason("");
      setInstructions("");
      setLetter(null);
      event.target.reset();
      setShowTransferForm(false);
      await load();
    } catch (err) {
      const data = err.response?.data || {};
      setError(data.detail || data.case_ids || data.transfer_letter || "Transfer failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-900 text-gray-100 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Transferred Cases</h2>
        <p className="text-sm text-gray-400 mt-1">Cases that have already been transferred by HQ.</p>
      </div>
      {error && <p className="rounded bg-red-500/10 border border-red-500/40 p-3 text-sm text-red-300">{String(error)}</p>}
      {message && <p className="rounded bg-green-500/10 border border-green-500/40 p-3 text-sm text-green-300">{message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowTransferForm((visible) => !visible)}
          className="rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500"
        >
          {showTransferForm ? "Close Transfer" : "Transfer Cases"}
        </button>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search case, accused, offence, Battalion..."
          className="min-w-[280px] flex-1 rounded bg-gray-800 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring-2"
        />
      </div>
      <div className="rounded-xl bg-gray-800 overflow-x-auto">
        <table className="min-w-[1500px] w-full text-sm">
          <thead className="text-left text-gray-400 border-b border-gray-700">
            <tr>
              <th className="p-3">Case #</th>
              <th className="p-3">Service No</th>
              <th className="p-3">Rank</th>
              <th className="p-3">Accused</th>
              <th className="p-3">Unit</th>
              <th className="p-3">Offence</th>
              <th className="p-3">Description</th>
              <th className="p-3">Reason for transfer</th>
              <th className="p-3">Transferred from</th>
              <th className="p-3">Transferred to</th>
            </tr>
          </thead>
          <tbody>
            {matchingCases(cases).map((item) => (
              <tr key={item.id} className="border-b border-gray-700/60">
                <td className="p-3 font-medium">{item.case_number || item.id}</td>
                <td className="p-3">{item.accused_service_number || "—"}</td>
                <td className="p-3">{item.accused_rank || "—"}</td>
                <td className="p-3">{item.accused_name || "—"}</td>
                <td className="p-3">{item.accused_unit_name || "—"}</td>
                <td className="p-3">{item.offence_name || item.offence || "—"}</td>
                <td className="p-3 max-w-[280px] whitespace-normal">{item.description || "—"}</td>
                <td className="p-3 max-w-[240px] whitespace-normal">{item.transfer_reason || "—"}</td>
                <td className="p-3">{item.transfer_from || "—"}</td>
                <td className="p-3">{item.transfer_to || item.tasked_battalion_name || "—"}</td>
              </tr>
            ))}
            {!matchingCases(cases).length && <tr><td className="p-4 text-gray-400" colSpan="10">No transferred cases found.</td></tr>}
          </tbody>
        </table>
      </div>
      {showTransferForm && (
      <form onSubmit={submit} className="rounded-xl bg-gray-800 p-4 space-y-4 max-w-5xl">
        <h3 className="font-semibold">Transfer details</h3>
        <div className="rounded-lg border border-gray-700 overflow-x-auto">
          <table className="min-w-[1400px] w-full text-sm">
            <thead className="text-left text-gray-400 border-b border-gray-700">
              <tr>
                <th className="p-3">Select</th>
                <th className="p-3">Case #</th>
                <th className="p-3">Service No</th>
                <th className="p-3">Rank</th>
                <th className="p-3">Accused</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Offence</th>
                <th className="p-3">Description</th>
                <th className="p-3">Status</th>
                <th className="p-3">Current Battalion</th>
              </tr>
            </thead>
            <tbody>
              {matchingCases(transferableCases).map((item) => (
                <tr key={item.id} className="border-b border-gray-700/60">
                  <td className="p-3"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td>
                  <td className="p-3 font-medium">{item.case_number || item.id}</td>
                  <td className="p-3">{item.accused_service_number || "—"}</td>
                  <td className="p-3">{item.accused_rank || "—"}</td>
                  <td className="p-3">{item.accused_name || "—"}</td>
                  <td className="p-3">{item.accused_unit_name || "—"}</td>
                  <td className="p-3">{item.offence_name || item.offence || "—"}</td>
                  <td className="p-3 max-w-[280px] whitespace-normal">{item.description || "—"}</td>
                  <td className="p-3 capitalize">{String(item.status || "").replaceAll("_", " ")}</td>
                  <td className="p-3">{item.tasked_battalion_name || "Unassigned"}</td>
                </tr>
              ))}
              {!matchingCases(transferableCases).length && <tr><td className="p-4 text-gray-400" colSpan="10">No active cases available for transfer.</td></tr>}
            </tbody>
          </table>
        </div>
        <label className="block text-sm">Destination Battalion
          <select className="mt-1 w-full rounded bg-gray-700 p-2" value={destination} onChange={(e) => setDestination(e.target.value)} required>
            <option value="">Select Battalion</option>
            {battalions.map((battalion) => <option key={battalion.id} value={battalion.id}>{battalion.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">Reason
          <textarea className="mt-1 w-full rounded bg-gray-700 p-2" rows="2" value={reason} onChange={(e) => setReason(e.target.value)} required />
        </label>
        <label className="block text-sm">Instructions
          <textarea className="mt-1 w-full rounded bg-gray-700 p-2" rows="3" value={instructions} onChange={(e) => setInstructions(e.target.value)} required />
        </label>
        <label className="block text-sm">Transfer letter (PDF)
          <input className="mt-1 block w-full text-sm" type="file" accept=".pdf,application/pdf" onChange={(e) => setLetter(e.target.files?.[0] || null)} required />
        </label>
        <button disabled={busy} className="rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 disabled:opacity-50">
          {busy ? "Transferring..." : `Transfer ${selected.length || ""} case(s)`}
        </button>
      </form>
      )}
    </div>
  );
}
