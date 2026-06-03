import React from "react";

export default function Offences({ user, offences = [], loading = false }) {
  const isSuperuser = !!user?.is_superuser;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4 text-white">Offences</h2>
      {loading ? (
        <div className="text-gray-300">Loading...</div>
      ) : offences.length === 0 ? (
        <div className="text-gray-400 italic py-8 text-center">No offences found.</div>
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
              {offences.map((o, idx) => (
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
