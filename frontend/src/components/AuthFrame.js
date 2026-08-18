import React from "react";

export default function AuthFrame({ children, subtitle, wide = false }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-[#f7f7f4] px-3 py-4 text-slate-950 sm:px-4 sm:py-6">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-1 bg-[#3b1f1f]" />
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="overflow-hidden rounded-lg border border-blue-200 bg-white shadow-xl shadow-slate-300/60">
          <div className="border-b border-blue-200 px-4 py-4 text-center sm:px-6 sm:py-5">
            <h1 className="font-serif text-xl font-bold uppercase tracking-wider text-black sm:text-2xl">
              MILITARY POLICE CORPS
            </h1>
            <img
              src="/mpc-logo.png"
              alt="Military Police Corps logo"
              className="mx-auto mt-3 h-20 w-auto object-contain sm:h-24 md:h-28"
            />
            <h2 className="mt-3 font-serif text-xl font-bold uppercase tracking-wider text-black sm:text-2xl">
              MPIMS
            </h2>
            {subtitle && (
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-600 sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
          <div className="px-4 py-4 sm:px-5 sm:py-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
