import React from "react";
import { useNavigate } from "react-router-dom";
import AuthFrame from "./AuthFrame";

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <AuthFrame wide subtitle="Military Police Investigation Management System">
      <div className="text-center">
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-slate-700 sm:text-base">
          Military Police Investigation Management System - secure, centralised
          management of cases, incidents, guardrooms and morning briefs.
        </p>
        <button
          onClick={() => navigate("/login")}
          className="mt-5 rounded-md bg-black px-6 py-2.5 font-serif text-base font-bold text-white transition-colors hover:bg-slate-800 sm:mt-6"
        >
          Login
        </button>
      </div>
    </AuthFrame>
  );
}
