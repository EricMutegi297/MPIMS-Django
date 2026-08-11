import React from "react";
import { useNavigate } from "react-router-dom";
import AuthFrame from "./AuthFrame";

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <AuthFrame wide subtitle="Military Police Investigation Management System">
      <div className="text-center">
        <p className="mx-auto max-w-xl text-base leading-relaxed text-slate-700">
          Military Police Investigation Management System - secure, centralised
          management of cases, incidents, guardrooms and morning briefs.
        </p>
        <button
          onClick={() => navigate("/login")}
          className="mt-8 rounded-md bg-black px-8 py-3 font-serif text-lg font-bold text-white transition-colors hover:bg-slate-800"
        >
          Login
        </button>
      </div>
    </AuthFrame>
  );
}
