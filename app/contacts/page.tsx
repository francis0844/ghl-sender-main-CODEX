"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import AccountSwitcher from "@/components/AccountSwitcher";
import AppSectionTabs from "@/components/AppSectionTabs";
import SmartListBulkSender from "@/components/SmartListBulkSender";

export default function ContactsPage() {
  return (
    <div className="flex flex-col min-h-full">
      <header
        className="sticky top-0 z-10 px-4 pb-4 border-b border-border bg-card/90 backdrop-blur-sm"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Contacts
          </h1>
          <AccountSwitcher />
        </div>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        <AppSectionTabs />

        <SmartListBulkSender />

        <div className="mt-5">
          <Link
            href="/"
            className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground active:bg-muted transition-colors"
          >
            <MessageSquare size={14} aria-hidden />
            Quick single-send mode
          </Link>
        </div>
      </main>
    </div>
  );
}
