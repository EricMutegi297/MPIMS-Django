import React from "react";
import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-5xl font-bold font-condensed text-white tracking-widest uppercase mb-4">
        MPIMS
      </h1>
      <p className="text-gray-400 max-w-xl mb-8 leading-relaxed">
        Military Police Information Management System — secure, centralised
        management of cases, incidents, guardrooms and morning briefs.
      </p>
      <button
        onClick={() => navigate("/login")}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors text-lg"
      >
        Sign In
      </button>
    </div>
  );
}
