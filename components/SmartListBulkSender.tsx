"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, Send, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contact";
import type { Channel } from "@/types/message";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const PAGE_SIZE = 25;
const MAX_BULK = 50;
const CHANNELS: Channel[] = ["Email", "SMS", "WhatsApp"];

interface SmartList {
  id: string;
  name: string;
}

interface ToastState {
  type: "success" | "error";
  text: string;
}

function mergeUniqueContacts(prev: Contact[], next: Contact[]): Contact[] {
  const map = new Map<string, Contact>();
  for (const contact of prev) map.set(contact.contactId, contact);
  for (const contact of next) map.set(contact.contactId, contact);
  return Array.from(map.values());
}

export default function SmartListBulkSender() {
  const [smartLists, setSmartLists] = useState<SmartList[]>([]);
  const [smartListsLoading, setSmartListsLoading] = useState(false);
  const [smartListsError, setSmartListsError] = useState("");
  const [selectedSmartListId, setSelectedSmartListId] = useState("");

  const [query, setQuery] = useState("");
  const [requireEmail, setRequireEmail] = useState(false);
  const [requirePhone, setRequirePhone] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channel, setChannel] = useState<Channel>("Email");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    successCount: number;
    failedCount: number;
    failures: string[];
  } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (type: "success" | "error", text: string) => {
    clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const loadSmartLists = async () => {
    setSmartListsLoading(true);
    setSmartListsError("");

    try {
      const res = await fetch(`${API_BASE}/api/contacts/smart-lists`, {
        credentials: "include",
      });
      const data: {
        smartLists?: SmartList[];
        message?: string;
      } = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message ?? "Failed to load smart lists");
      }

      setSmartLists(data.smartLists ?? []);
      if ((data.smartLists ?? []).length === 0) {
        setSmartListsError("No native smart lists found or API does not expose them for this sub-account.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load smart lists";
      setSmartListsError(msg);
    } finally {
      setSmartListsLoading(false);
    }
  };

  const loadContacts = async (targetPage: number, reset: boolean) => {
    if (isLoadingList) return;
    setIsLoadingList(true);

    try {
      const params = new URLSearchParams({
        page: `${targetPage}`,
        limit: `${PAGE_SIZE}`,
      });
      if (query.trim()) params.set("query", query.trim());
      if (selectedSmartListId) params.set("smartListId", selectedSmartListId);
      if (requireEmail) params.set("requireEmail", "true");
      if (requirePhone) params.set("requirePhone", "true");

      const res = await fetch(`${API_BASE}/api/contacts/list?${params.toString()}`, {
        credentials: "include",
      });
      const data: {
        contacts?: Contact[];
        hasMore?: boolean;
        error?: string;
        message?: string;
      } = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? "Failed to load contacts");
      }

      const next = data.contacts ?? [];
      setContacts((prev) => (reset ? next : mergeUniqueContacts(prev, next)));
      setHasMore(Boolean(data.hasMore));
      setPage(targetPage);

      if (reset) {
        setSelectedIds([]);
        setSummary(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load contacts";
      showToast("error", msg);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    loadSmartLists();
  }, []);

  useEffect(() => {
    loadContacts(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contactById = useMemo(
    () => new Map(contacts.map((c) => [c.contactId, c])),
    [contacts]
  );

  const canContactBeSent = (contact: Contact): boolean => {
    if (channel === "Email") return !!contact.email;
    return !!contact.phone;
  };

  const selectedContacts = selectedIds
    .map((id) => contactById.get(id))
    .filter((c): c is Contact => !!c);

  const eligibleSelectedIds = selectedContacts
    .filter(canContactBeSent)
    .map((c) => c.contactId)
    .slice(0, MAX_BULK);

  const ineligibleSelected = selectedContacts.length - eligibleSelectedIds.length;

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => {
        const contact = contactById.get(id);
        return contact ? canContactBeSent(contact) : false;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, contacts]);

  const toggleSelected = (contactId: string) => {
    setSelectedIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  const selectAllVisibleEligible = () => {
    const visibleEligible = contacts.filter(canContactBeSent).map((c) => c.contactId);
    setSelectedIds(visibleEligible.slice(0, MAX_BULK));
  };

  const clearSelection = () => setSelectedIds([]);

  const applyFilters = () => {
    loadContacts(1, true);
  };

  const sendBulk = async () => {
    if (!message.trim()) {
      showToast("error", "Message is required");
      return;
    }
    if (eligibleSelectedIds.length === 0) {
      showToast("error", `Select at least one ${channel} eligible contact`);
      return;
    }

    setIsSending(true);
    setSummary(null);

    try {
      const res = await fetch(`${API_BASE}/api/messages/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contactIds: eligibleSelectedIds,
          type: channel,
          message: message.trim(),
        }),
      });
      const data: {
        error?: string;
        summary?: { total: number; successCount: number; failedCount: number };
        results?: Array<{ contactId: string; success: boolean; error?: string }>;
      } = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? "Bulk send failed");
      }

      const failures = (data.results ?? [])
        .filter((r) => !r.success)
        .map((r) => {
          const name = contactById.get(r.contactId)?.name ?? r.contactId;
          return `${name}: ${r.error ?? "Failed"}`;
        });

      setSummary({
        total: data.summary?.total ?? eligibleSelectedIds.length,
        successCount: data.summary?.successCount ?? 0,
        failedCount: data.summary?.failedCount ?? failures.length,
        failures,
      });

      if ((data.summary?.failedCount ?? 0) === 0) {
        showToast("success", `Sent ${channel} to ${data.summary?.successCount ?? eligibleSelectedIds.length} contacts`);
      } else {
        showToast(
          "error",
          `Sent ${data.summary?.successCount ?? 0}, failed ${data.summary?.failedCount ?? 0}`
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bulk send failed";
      showToast("error", msg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users size={16} aria-hidden className="text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Contacts & Smart Lists</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Imported Native Smart List
            </label>
            <select
              value={selectedSmartListId}
              onChange={(e) => setSelectedSmartListId(e.target.value)}
              className="w-full h-12 rounded-xl border border-input bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Contacts</option>
              {smartLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            {smartListsLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" aria-hidden />
                Importing smart lists...
              </p>
            )}
            {smartListsError && (
              <p className="text-xs text-amber-600">{smartListsError}</p>
            )}
          </div>

          <Input
            placeholder="Search name/email/phone..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRequireEmail((v) => !v)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors",
                requireEmail
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              Has Email
            </button>
            <button
              type="button"
              onClick={() => setRequirePhone((v) => !v)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors",
                requirePhone
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              Has Phone
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyFilters}
              disabled={isLoadingList}
              className="min-h-[44px] rounded-xl bg-foreground text-background text-sm font-semibold px-4 active:opacity-80 transition-opacity disabled:opacity-60"
            >
              {isLoadingList ? "Loading..." : "Apply"}
            </button>
            <button
              type="button"
              onClick={() => loadContacts(page + 1, false)}
              disabled={isLoadingList || !hasMore}
              className="min-h-[44px] rounded-xl border border-border text-sm font-semibold px-4 text-foreground active:bg-muted transition-colors disabled:opacity-60"
            >
              {hasMore ? "Load More" : "No More"}
            </button>
            <button
              type="button"
              onClick={loadSmartLists}
              className="h-11 w-11 rounded-xl border border-border text-muted-foreground flex items-center justify-center active:bg-muted transition-colors"
              aria-label="Refresh smart lists"
            >
              <RefreshCw size={14} aria-hidden />
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Contact List ({contacts.length})</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllVisibleEligible}
                className="text-xs font-semibold text-foreground px-2 py-1 rounded-lg border border-border active:bg-muted transition-colors"
              >
                Select Visible
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs font-semibold text-muted-foreground px-2 py-1 rounded-lg border border-border active:bg-muted transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {contacts.length === 0 && !isLoadingList ? (
            <p className="text-sm text-muted-foreground">No contacts found for this smart list/filter.</p>
          ) : (
            contacts.map((contact) => {
              const checked = selectedIds.includes(contact.contactId);
              const eligible = canContactBeSent(contact);
              return (
                <button
                  key={contact.contactId}
                  type="button"
                  onClick={() => eligible && toggleSelected(contact.contactId)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                    checked ? "border-emerald-400 bg-emerald-50/60" : "border-border bg-card",
                    !eligible && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "h-5 w-5 mt-0.5 rounded border flex items-center justify-center",
                        checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-border",
                        !eligible && "bg-muted"
                      )}
                    >
                      {checked && <Check size={12} aria-hidden />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {contact.phone ?? "No phone"} · {contact.email ?? "No email"}
                      </p>
                      {!eligible && (
                        <p className="text-[11px] text-amber-600 mt-1">No {channel} destination</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card className="sticky bottom-0 z-30 border-foreground/10 shadow-xl">
          <CardHeader>
            <h3 className="text-sm font-semibold text-foreground">Selected Contacts Action</h3>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              role="group"
              aria-label="Bulk channel"
              className="flex rounded-xl border border-border overflow-hidden bg-muted p-1 gap-1"
            >
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={cn(
                    "flex-1 py-2 min-h-[40px] text-sm font-medium rounded-lg transition-colors",
                    channel === ch ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {ch}
                </button>
              ))}
            </div>

            <div className="text-xs text-muted-foreground">
              Selected: <span className="font-semibold text-foreground">{selectedIds.length}</span>
              {" · "}
              Eligible for {channel}: <span className="font-semibold text-foreground">{eligibleSelectedIds.length}</span>
              {" · Max "}
              {MAX_BULK}
              {ineligibleSelected > 0 && (
                <span className="text-amber-600"> · {ineligibleSelected} ineligible</span>
              )}
            </div>

            <Textarea
              rows={4}
              placeholder={`Write your ${channel} message for selected contacts...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ fontSize: "16px" }}
            />

            <button
              type="button"
              onClick={sendBulk}
              disabled={isSending || eligibleSelectedIds.length === 0 || !message.trim()}
              className={cn(
                "w-full min-h-[52px] rounded-2xl text-base font-semibold flex items-center justify-center gap-2",
                isSending || eligibleSelectedIds.length === 0 || !message.trim()
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-background active:opacity-80"
              )}
            >
              {isSending ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Sending {channel}...
                </>
              ) : (
                <>
                  <Send size={16} aria-hidden />
                  Send {channel} to Selected
                </>
              )}
            </button>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-semibold text-foreground">
              Sent {summary.successCount}/{summary.total} successfully
            </p>
            {summary.failedCount > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-red-600">
                {summary.failures.slice(0, 8).map((line, idx) => (
                  <li key={`${line}-${idx}`}>{line}</li>
                ))}
                {summary.failures.length > 8 && (
                  <li>+{summary.failures.length - 8} more failures</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {isLoadingList && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <RefreshCw size={12} className="animate-spin" aria-hidden />
          Loading contacts...
        </div>
      )}

      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          className={cn(
            "fixed left-4 right-4 z-50 flex items-start justify-between gap-3",
            "px-4 py-3.5 rounded-2xl shadow-xl text-sm font-medium",
            toast.type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
          )}
          style={{
            bottom: "calc(max(env(safe-area-inset-bottom, 0px), 0px) + 88px)",
            animation: "toast-up 0.22s ease-out",
          }}
        >
          <span className="flex-1 leading-snug">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="shrink-0 min-h-[24px] min-w-[24px] flex items-center justify-center opacity-80 active:opacity-100"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
