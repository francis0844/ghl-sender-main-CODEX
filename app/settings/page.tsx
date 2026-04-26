"use client";

import Link from "next/link";
import { ExternalLink, MessageSquare, Shield, Link2 } from "lucide-react";
import AppSectionTabs from "@/components/AppSectionTabs";

export default function SettingsPage() {
  return (
    <div className="flex flex-col min-h-full">
      <header
        className="sticky top-0 z-10 px-4 pb-4 border-b border-border bg-card/90 backdrop-blur-sm"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
      >
        <h1 className="text-xl font-bold tracking-tight text-foreground">Settings</h1>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
        <AppSectionTabs />

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">Workflow</h2>
          <div className="space-y-2">
            <Link
              href="/"
              className="rounded-xl border border-border px-3 py-3 text-sm flex items-center gap-2 active:bg-muted transition-colors"
            >
              <MessageSquare size={14} aria-hidden />
              Open quick single-send page
            </Link>
            <Link
              href="/contacts"
              className="rounded-xl border border-border px-3 py-3 text-sm flex items-center gap-2 active:bg-muted transition-colors"
            >
              <Link2 size={14} aria-hidden />
              Open contact list + bulk send
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">Security</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Access and tokens are handled by your deployed API backend.
          </p>
          <Link
            href="/login"
            className="rounded-xl border border-border px-3 py-3 text-sm flex items-center gap-2 active:bg-muted transition-colors"
          >
            <Shield size={14} aria-hidden />
            Open app login
          </Link>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">Support</h2>
          <a
            href="https://marketplace.gohighlevel.com/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-border px-3 py-3 text-sm flex items-center gap-2 active:bg-muted transition-colors"
          >
            <ExternalLink size={14} aria-hidden />
            HighLevel API docs
          </a>
        </section>
      </main>
    </div>
  );
}
