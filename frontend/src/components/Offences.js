import React, { useMemo, useState } from "react";

export default function Offences({ user, offences = [], loading = false }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const categories = useMemo(
    () => Array.from(new Set(offences.map((o) => o.category).filter(Boolean))).sort(),
    [offences]
  );

  const filteredOffences = useMemo(() => {
    const query = search.trim().toLowerCase();
    return offences.filter((offence) => {
      const category = offence.category || "";
      const name = offence.name || "";
      const categoryMatches = !categoryFilter || category === categoryFilter;
      const searchMatches = !query || `${category} ${name}`.toLowerCase().includes(query);
      return categoryMatches && searchMatches;
    });
  }, [offences, search, categoryFilter]);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Offences</h2>
          <p className="text-xs text-gray-400 mt-1">
            Showing {filteredOffences.length} of {offences.length}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search offences"
            className="w-full sm:w-52 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-48 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>
      {loading ? (
        <div className="text-gray-300">Loading...</div>
      ) : offences.length === 0 ? (
        <div className="text-gray-400 italic py-8 text-center">No offences found.</div>
      ) : filteredOffences.length === 0 ? (
        <div className="text-gray-400 italic py-8 text-center">No offences match your filters.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow border border-gray-700 bg-gray-800">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-700 text-gray-200 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Offence Name</th>
              </tr>
            </thead>
            <tbody>
              {filteredOffences.map((o, idx) => (
                <tr
                  key={o.id}
                  className={
                    (idx % 2 === 0 ? "bg-gray-900" : "bg-gray-800") +
                    " hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0"
                  }
                >
                  <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-100">{o.category}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-100">{o.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
