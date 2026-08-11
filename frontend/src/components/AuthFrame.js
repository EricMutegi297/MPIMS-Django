import React from "react";

export default function AuthFrame({ children, subtitle, wide = false }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-4 py-10 text-slate-950">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-1 bg-[#3b1f1f]" />
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-2xl"}`}>
        <div className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-2xl shadow-slate-300/70">
          <div className="border-b border-blue-200 px-6 py-8 text-center">
            <h1 className="font-serif text-2xl font-bold uppercase tracking-wider text-black md:text-3xl">
              MILITARY POLICE CORPS
            </h1>
            <img
              src="/mpc-logo.png"
              alt="Military Police Corps logo"
              className="mx-auto mt-6 h-36 w-auto object-contain"
            />
            <h2 className="mt-6 font-serif text-2xl font-bold uppercase tracking-wider text-black">
              MPIMS
            </h2>
            {subtitle && (
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
                {subtitle}
              </p>
            )}
          </div>
          <div className="px-5 py-6 md:px-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
