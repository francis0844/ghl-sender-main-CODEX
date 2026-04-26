"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, Save, Send, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contact";
import type { Channel } from "@/types/message";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const PAGE_SIZE = 25;
const MAX_BULK = 50;
const SMART_LISTS_KEY = "ghl_smart_lists";
const CHANNELS: Channel[] = ["SMS", "Email", "WhatsApp"];

interface SmartListPreset {
  id: string;
  name: string;
  query: string;
  requireEmail: boolean;
  requirePhone: boolean;
  tag: string;
}

interface ToastState {
  type: "success" | "error";
  text: string;
}

interface FilterValues {
  query: string;
  tag: string;
  requireEmail: boolean;
  requirePhone: boolean;
}

function mergeUniqueContacts(prev: Contact[], next: Contact[]): Contact[] {
  const map = new Map<string, Contact>();
  for (const contact of prev) map.set(contact.contactId, contact);
  for (const contact of next) map.set(contact.contactId, contact);
  return Array.from(map.values());
}

function readSmartLists(): SmartListPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SMART_LISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SmartListPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSmartLists(list: SmartListPreset[]) {
  try {
    localStorage.setItem(SMART_LISTS_KEY, JSON.stringify(list));
  } catch {}
}

export default function SmartListBulkSender() {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [requireEmail, setRequireEmail] = useState(false);
  const [requirePhone, setRequirePhone] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channel, setChannel] = useState<Channel>("SMS");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [smartLists, setSmartLists] = useState<SmartListPreset[]>([]);
  const [smartListName, setSmartListName] = useState("");

  const [toast, setToast] = useState<ToastState | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    successCount: number;
    failedCount: number;
    failures: string[];
  } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSmartLists(readSmartLists());
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (type: "success" | "error", text: string) => {
    clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

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

  const loadContacts = async (
    targetPage: number,
    reset: boolean,
    override?: Partial<FilterValues>
  ) => {
    if (isLoadingList) return;
    setIsLoadingList(true);

    try {
      const filters: FilterValues = {
        query,
        tag,
        requireEmail,
        requirePhone,
        ...override,
      };

      const params = new URLSearchParams({
        page: `${targetPage}`,
        limit: `${PAGE_SIZE}`,
      });
      if (filters.query.trim()) params.set("query", filters.query.trim());
      if (filters.tag.trim()) params.set("tag", filters.tag.trim());
      if (filters.requireEmail) params.set("requireEmail", "true");
      if (filters.requirePhone) params.set("requirePhone", "true");

      const res = await fetch(`${API_BASE}/api/contacts/list?${params.toString()}`, {
        credentials: "include",
      });
      const data: { contacts?: Contact[]; hasMore?: boolean; error?: string } =
        await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load contacts");
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
    loadContacts(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => {
      const contact = contactById.get(id);
      return contact ? canContactBeSent(contact) : false;
    }));
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

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const applyFilters = () => {
    loadContacts(1, true);
  };

  const saveSmartList = () => {
    const name = smartListName.trim();
    if (!name) {
      showToast("error", "Enter a smart list name");
      return;
    }
    const next: SmartListPreset[] = [
      {
        id: crypto.randomUUID(),
        name,
        query: query.trim(),
        requireEmail,
        requirePhone,
        tag: tag.trim(),
      },
      ...smartLists.filter((s) => s.name.toLowerCase() !== name.toLowerCase()),
    ].slice(0, 20);

    setSmartLists(next);
    writeSmartLists(next);
    setSmartListName("");
    showToast("success", `Saved smart list: ${name}`);
  };

  const applySmartList = (preset: SmartListPreset) => {
    setQuery(preset.query);
    setTag(preset.tag);
    setRequireEmail(preset.requireEmail);
    setRequirePhone(preset.requirePhone);
    loadContacts(1, true, {
      query: preset.query,
      tag: preset.tag,
      requireEmail: preset.requireEmail,
      requirePhone: preset.requirePhone,
    });
  };

  const removeSmartList = (id: string) => {
    const next = smartLists.filter((s) => s.id !== id);
    setSmartLists(next);
    writeSmartLists(next);
  };

  const sendBulk = async () => {
    if (!message.trim()) {
      showToast("error", "Message is required");
      return;
    }
    if (eligibleSelectedIds.length === 0) {
      showToast("error", "Select at least one eligible contact");
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
        showToast("success", `Sent to ${data.summary?.successCount ?? eligibleSelectedIds.length} contacts`);
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
            <h2 className="text-base font-semibold text-foreground">Smart List & Bulk Send</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <Input
              placeholder="Name/email/phone contains..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            <Input
              placeholder="Tag contains..."
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              autoComplete="off"
            />
          </div>

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
              {isLoadingList ? "Loading..." : "Apply Filters"}
            </button>
            <button
              type="button"
              onClick={() => loadContacts(page + 1, false)}
              disabled={isLoadingList || !hasMore}
              className="min-h-[44px] rounded-xl border border-border text-sm font-semibold px-4 text-foreground active:bg-muted transition-colors disabled:opacity-60"
            >
              {hasMore ? "Load More" : "No More"}
            </button>
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Save Current Filters
            </p>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Smart list name"
                value={smartListName}
                onChange={(e) => setSmartListName(e.target.value)}
              />
              <button
                type="button"
                onClick={saveSmartList}
                className="h-12 w-12 rounded-xl border border-border text-muted-foreground flex items-center justify-center active:bg-muted transition-colors"
                aria-label="Save smart list"
              >
                <Save size={16} aria-hidden />
              </button>
            </div>
            {smartLists.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {smartLists.map((preset) => (
                  <div
                    key={preset.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-1"
                  >
                    <button
                      type="button"
                      onClick={() => applySmartList(preset)}
                      className="text-xs font-medium text-foreground"
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSmartList(preset.id)}
                      className="h-5 w-5 rounded-full text-muted-foreground active:bg-border transition-colors flex items-center justify-center"
                      aria-label={`Delete ${preset.name}`}
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Contacts ({contacts.length})
            </h3>
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
            <p className="text-sm text-muted-foreground">No contacts found for these filters.</p>
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
                      {Array.isArray(contact.tags) && contact.tags.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">
                          Tags: {contact.tags.join(", ")}
                        </p>
                      )}
                      {!eligible && (
                        <p className="text-[11px] text-amber-600 mt-1">
                          Not eligible for {channel}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-foreground">Bulk Message</h3>
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

          <Textarea
            rows={4}
            placeholder={`Write your ${channel} bulk message...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ fontSize: "16px" }}
          />

          <div className="text-xs text-muted-foreground">
            Selected: <span className="font-semibold text-foreground">{selectedIds.length}</span>
            {" · "}
            Eligible for {channel}:{" "}
            <span className="font-semibold text-foreground">{eligibleSelectedIds.length}</span>
            {" · "}
            Max per send: {MAX_BULK}
            {ineligibleSelected > 0 && (
              <span className="text-amber-600"> · {ineligibleSelected} ineligible</span>
            )}
          </div>

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
                Sending Bulk...
              </>
            ) : (
              <>
                <Send size={16} aria-hidden />
                Send Bulk Message
              </>
            )}
          </button>

          {summary && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="font-semibold text-foreground">
                Sent {summary.successCount}/{summary.total} successfully
              </p>
              {summary.failedCount > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-red-600">
                  {summary.failures.slice(0, 5).map((line, idx) => (
                    <li key={`${line}-${idx}`}>{line}</li>
                  ))}
                  {summary.failures.length > 5 && (
                    <li>+{summary.failures.length - 5} more failures</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
