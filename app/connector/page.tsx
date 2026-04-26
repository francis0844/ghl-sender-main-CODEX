"use client";

import Link from "next/link";
import { ArrowRight, Link2, RefreshCw } from "lucide-react";
import AppSectionTabs from "@/components/AppSectionTabs";

export default function ConnectorPage() {
  return (
    <div className="flex flex-col min-h-full">
      <header
        className="sticky top-0 z-10 px-4 pb-4 border-b border-border bg-card/90 backdrop-blur-sm"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
      >
        <h1 className="text-xl font-bold tracking-tight text-foreground">Connector</h1>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
        <AppSectionTabs />

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            GoHighLevel Account Connector
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Connect sub-accounts, set active account, reconnect tokens, and disconnect accounts.
          </p>

          <div className="space-y-2">
            <Link
              href="/connections"
              className="rounded-xl border border-border px-3 py-3 text-sm flex items-center justify-between active:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2">
                <Link2 size={14} aria-hidden />
                Manage connected accounts
              </span>
              <ArrowRight size={14} aria-hidden />
            </Link>

            <Link
              href="/connections?connected=true"
              className="rounded-xl border border-border px-3 py-3 text-sm flex items-center justify-between active:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2">
                <RefreshCw size={14} aria-hidden />
                Refresh connection state
              </span>
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
