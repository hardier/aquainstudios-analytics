"use client";

import { useEffect, useState } from "react";

interface PlatformStatus {
  connected: boolean;
  lastSynced: string | null;
}

interface Status {
  etsy: PlatformStatus;
  tiktok: PlatformStatus;
}

function PlatformCard({
  name,
  logo,
  status,
  connectHref,
  disconnectPath,
  syncPath,
  onRefresh,
}: {
  name: string;
  logo: string;
  status: PlatformStatus;
  connectHref: string;
  disconnectPath: string;
  syncPath: string;
  onRefresh: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch(syncPath, { method: "POST" });
      const data = await res.json();
      setSyncMsg(data.ok ? `Synced ${data.ordersProcessed} orders` : `Error: ${data.error}`);
      if (data.ok) onRefresh();
    } catch {
      setSyncMsg("Network error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    await fetch(disconnectPath, { method: "POST" });
    onRefresh();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{logo}</span>
          <div>
            <h2 className="font-semibold text-gray-900">{name}</h2>
            <span
              className={`text-xs font-medium ${
                status.connected ? "text-green-600" : "text-gray-400"
              }`}
            >
              {status.connected ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>

        {status.connected ? (
          <button
            onClick={handleDisconnect}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Disconnect
          </button>
        ) : (
          <a
            href={connectHref}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Connect
          </a>
        )}
      </div>

      {status.connected && (
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500">
            Last synced:{" "}
            {status.lastSynced
              ? new Date(status.lastSynced).toLocaleString()
              : "Never"}
          </p>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            {syncMsg && (
              <span className="text-xs text-gray-500">{syncMsg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    setSearchParams(new URLSearchParams(window.location.search));
  }, []);

  async function fetchStatus() {
    const res = await fetch("/api/settings/status");
    setStatus(await res.json());
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  const successMsg = searchParams?.get("success");
  const errorMsg = searchParams?.get("error");

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mb-8 text-gray-500">Connect your sales platforms and sync data.</p>

      {successMsg && (
        <div className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMsg === "etsy_connected" && "Etsy connected successfully."}
          {successMsg === "tiktok_connected" && "TikTok Shop connected successfully."}
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Connection failed: {errorMsg.replace(/_/g, " ")}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {status ? (
          <>
            <PlatformCard
              name="Etsy"
              logo="🛍️"
              status={status.etsy}
              connectHref="/api/auth/etsy"
              disconnectPath="/api/auth/etsy/disconnect"
              syncPath="/api/sync/etsy"
              onRefresh={fetchStatus}
            />
            <PlatformCard
              name="TikTok Shop"
              logo="🎵"
              status={status.tiktok}
              connectHref="/api/auth/tiktok"
              disconnectPath="/api/auth/tiktok/disconnect"
              syncPath="/api/sync/tiktok"
              onRefresh={fetchStatus}
            />
          </>
        ) : (
          <p className="text-gray-400">Loading…</p>
        )}
      </div>

      <div className="mt-8 text-center">
        <a href="/" className="text-sm text-indigo-600 hover:underline">
          ← Back to dashboard
        </a>
      </div>
    </main>
  );
}
