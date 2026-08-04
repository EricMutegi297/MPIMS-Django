import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

function PhoneIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 18h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5.6 15.5A7 7 0 0017.7 18M18.4 8.5A7 7 0 006.3 6" />
    </svg>
  );
}

function tone(status) {
  if (!status?.required) return "bg-slate-100 text-slate-700 border-slate-200";
  if (status?.configured) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function Authenticator({ user, onTotpChanged }) {
  const navigate = useNavigate();
  const autoStartedRef = useRef(false);
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useAutoDismiss(error, setError);
  useAutoDismiss(notice, setNotice);

  const accountName = [user?.rank, user?.name].filter(Boolean).join(" ") || "MPIMS User";

  const loadStatus = () => {
    setLoading(true);
    authService
      .totpStatus()
      .then((res) => setStatus(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Could not load authenticator status."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const startSetup = useCallback(async () => {
    setStarting(true);
    setError("");
    setNotice("");
    try {
      const res = await authService.setupTotp();
      setSetup(res.data);
      setCode("");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not start authenticator setup.");
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !status || !status.required || status.configured || setup || autoStartedRef.current) return;
    autoStartedRef.current = true;
    startSetup();
  }, [loading, setup, startSetup, status]);

  const confirmSetup = async (event) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code from Google Authenticator.");
      return;
    }

    setConfirming(true);
    setError("");
    setNotice("");
    try {
      const res = await authService.confirmTotpSetup(code);
      onTotpChanged?.(res.data?.user);
      setNotice("Google Authenticator configured.");
      setSetup(null);
      setStatus((prev) => ({ ...(prev || {}), configured: true, pending: false }));
      window.setTimeout(() => navigate("/dashboard"), 900);
    } catch (err) {
      setError(err.response?.data?.detail || "Authenticator code was not accepted.");
    } finally {
      setConfirming(false);
    }
  };

  const statusLabel = status?.configured
    ? "Configured"
    : status?.required
    ? "Setup required"
    : "Optional";
  const canReturnToDashboard = Boolean(status && (status.configured || !status.required));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase text-blue-600">MPIMS</p>
            <h1 className="text-xl font-bold text-slate-950">Google Authenticator Setup</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {accountName} <span className="text-slate-300">|</span> {user?.service_number || "--"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${tone(status)}`}>
              {statusLabel}
            </span>
            {canReturnToDashboard && (
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Dashboard
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-white">
              <PhoneIcon />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Secure Your Account</h2>
              <p className="mt-0.5 text-sm text-slate-500">Scan the QR code, then enter the 6-digit code from the app.</p>
            </div>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {notice}
              </div>
            )}

            {status?.configured ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-emerald-600 text-white">
                  <CheckIcon />
                </div>
                <p className="mt-4 text-lg font-bold text-emerald-900">Authenticator active</p>
                <p className="mt-1 text-sm text-emerald-700">Future sign-ins require the current app code.</p>
              </div>
            ) : (
              <>
                {!setup && starting && (
                  <div className="grid gap-6 lg:grid-cols-[300px,1fr]">
                    <div className="flex aspect-square items-center justify-center border-r-0 border-slate-200 bg-slate-50 lg:border-r">
                      <div className="h-44 w-44 animate-pulse rounded-md bg-slate-200" />
                    </div>
                    <div className="flex min-h-[260px] items-center">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Preparing authenticator setup...</p>
                        <p className="mt-1 text-sm text-slate-500">The QR code will appear automatically.</p>
                      </div>
                    </div>
                  </div>
                )}

                {!setup && !starting && status?.required && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-6 text-center">
                    <p className="text-sm font-semibold text-amber-900">Authenticator setup could not start.</p>
                    <button
                      type="button"
                      onClick={startSetup}
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <RefreshIcon />
                      Try Again
                    </button>
                  </div>
                )}

                {!setup && !starting && !status?.required && (
                  <button
                    type="button"
                    onClick={startSetup}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <PhoneIcon />
                    Start Setup
                  </button>
                )}

                {setup && (
                  <div className="grid gap-6 lg:grid-cols-[300px,1fr]">
                    <div className="flex items-center justify-center bg-slate-50 p-5 lg:border-r lg:border-slate-200">
                      <img
                        src={setup.qr_code}
                        alt="Google Authenticator QR code"
                        className="h-64 w-64 rounded-md bg-white p-3 shadow-sm ring-1 ring-slate-200"
                      />
                    </div>
                    <form onSubmit={confirmSetup} className="space-y-5 py-1">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">6-Digit Code</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={code}
                          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          autoFocus
                          required
                          className="mt-1 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-center text-2xl font-bold tracking-[0.35em] text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          placeholder="000000"
                        />
                      </label>
                      <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <summary className="cursor-pointer font-semibold text-slate-700">Manual setup key</summary>
                        <div className="mt-2 break-all rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800">
                          {setup.secret}
                        </div>
                      </details>
                      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={startSetup}
                          disabled={starting || confirming}
                          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          <RefreshIcon />
                          New QR Code
                        </button>
                        <button
                          type="submit"
                          disabled={confirming}
                          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {confirming ? "Confirming..." : "Confirm"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
