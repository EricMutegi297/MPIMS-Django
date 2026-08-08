import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

export default function MfaSetup({ user, onVerified }) {
  const navigate = useNavigate();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    authService
      .mfaSetup()
      .then((res) => {
        if (alive) setSetup(res.data);
      })
      .catch(() => {
        if (alive) setError("Failed to load authenticator setup.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const copyValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await authService.mfaVerify({ otp_code: code });
      onVerified?.(res.data.user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.otp_code ||
          err.response?.data?.detail ||
          "Invalid authentication code."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full flex items-start justify-center px-4 py-10 sm:py-16 bg-gray-900">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Google Authenticator</h1>
          <p className="mt-1 text-sm text-gray-400">
            Account security setup for {user?.service_number || "your account"}.
          </p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 sm:p-8 space-y-5">
          {loading ? (
            <p className="text-sm text-gray-400 animate-pulse">Loading setup...</p>
          ) : (
            <>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
                  Setup Key
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={setup?.secret || ""}
                    className="flex-1 min-w-0 bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => copyValue(setup?.secret || "", "key")}
                    className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
                  >
                    {copied === "key" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
                  Account
                </label>
                <input
                  readOnly
                  value={`${setup?.issuer || "MPIMS"} / ${setup?.account || ""}`}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <details className="rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2">
                <summary className="cursor-pointer text-xs text-gray-400">Authenticator URI</summary>
                <div className="mt-2 flex gap-2">
                  <input
                    readOnly
                    value={setup?.provisioning_uri || ""}
                    className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1.5 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => copyValue(setup?.provisioning_uri || "", "uri")}
                    className="px-2.5 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs"
                  >
                    {copied === "uri" ? "Copied" : "Copy"}
                  </button>
                </div>
              </details>

              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    6-Digit Code
                  </label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    placeholder="000000"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving || code.length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
                >
                  {saving ? "Verifying..." : "Enable Authenticator"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
