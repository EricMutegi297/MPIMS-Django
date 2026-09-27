import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { authService } from "../services/api";

export default function MfaSetup({ user, onVerified }) {
  const navigate = useNavigate();
  const [setup, setSetup] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
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

  useEffect(() => {
    if (!setup?.provisioning_uri) return;
    QRCode.toDataURL(setup.provisioning_uri, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 7,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [setup?.provisioning_uri]);

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
    <div className="min-h-screen w-full bg-gray-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-400">MPIMS Security</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-white md:text-4xl">Google Authenticator Setup</h1>
            <p className="mt-2 text-sm text-gray-400">
              {user?.rank ? `${user.rank} ` : ""}{user?.name || user?.service_number || "Your account"} - {user?.service_number || "Service number"}
            </p>
          </div>
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
            Required before dashboard access
          </div>
        </header>

        <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-2xl sm:p-7">
            <div className="flex h-full flex-col">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Scan QR Code</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Open Google Authenticator and scan this code.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  TOTP
                </span>
              </div>

              <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(260px,360px)_1fr] xl:items-center">
                <div className="rounded-xl border border-gray-700 bg-white p-4">
                  {loading ? (
                    <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">
                      Loading QR...
                    </div>
                  ) : qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Google Authenticator setup QR code"
                      className="aspect-square w-full rounded-lg"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 px-4 text-center text-sm text-gray-600">
                      QR code unavailable. Use the setup key.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Steps</p>
                    <ol className="mt-3 space-y-3 text-sm text-gray-300">
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                        <span>Open Google Authenticator and tap the plus button.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
                        <span>Choose scan QR code, then scan the code shown here.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
                        <span>Enter the 6-digit code to complete setup.</span>
                      </li>
                    </ol>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Manual Setup Key</p>
                        <p className="mt-1 text-xs text-gray-500">Use this if scanning is not possible.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyValue(setup?.secret || "", "key")}
                        className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
                      >
                        {copied === "key" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 font-mono text-sm tracking-widest text-white break-all">
                      {loading ? "Loading..." : setup?.secret || "--"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-2xl sm:p-7">
            <div className="flex h-full flex-col">
              <div>
                <h2 className="text-xl font-semibold text-white">Verify Setup</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Enter the current code from Google Authenticator.
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                  Account
                </label>
                <div className="mt-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-gray-200">
                  {setup?.issuer || "MPIMS"} / {setup?.account || user?.service_number || "--"}
                </div>
              </div>

              <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-300">Advanced authenticator URI</summary>
                <div className="mt-3 flex gap-2">
                  <input
                    readOnly
                    value={setup?.provisioning_uri || ""}
                    className="flex-1 min-w-0 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-mono text-gray-300"
                  />
                  <button
                    type="button"
                    onClick={() => copyValue(setup?.provisioning_uri || "", "uri")}
                    className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-gray-200 hover:bg-gray-700"
                  >
                    {copied === "uri" ? "Copied" : "Copy"}
                  </button>
                </div>
              </details>

              <div className="mt-5 flex-1">
                {error && (
                  <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}

                {loading ? (
                  <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-5 text-sm text-gray-400">
                    Preparing authenticator setup...
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        6-Digit Code
                      </label>
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="h-14 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 text-center font-mono text-2xl tracking-[0.35em] text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        placeholder="000000"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={saving || code.length !== 6}
                      className="h-12 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-900 disabled:text-blue-200/70"
                    >
                      {saving ? "Verifying..." : "Enable Google Authenticator"}
                    </button>
                  </form>
                )}
              </div>

              <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Keep your authenticator app available. You will need the 6-digit code during future sign-ins.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
