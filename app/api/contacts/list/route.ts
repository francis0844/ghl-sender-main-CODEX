import { NextRequest, NextResponse } from "next/server";
import { getActiveGHLToken, GHLNotConnectedError } from "@/lib/ghl-token";

const GHL_API = "https://services.leadconnectorhq.com";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type RawTag = string | { name?: string; label?: string };

type GHLContact = {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  tags?: RawTag[];
};

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  if (value < 1) return DEFAULT_LIMIT;
  if (value > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(value);
}

function extractTags(tags: RawTag[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => {
      if (typeof t === "string") return t.trim();
      return (t?.name ?? t?.label ?? "").trim();
    })
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("query")?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = clampLimit(Number.parseInt(params.get("limit") ?? `${DEFAULT_LIMIT}`, 10));
  const requireEmail = params.get("requireEmail") === "true";
  const requirePhone = params.get("requirePhone") === "true";
  const tag = params.get("tag")?.trim().toLowerCase() ?? "";

  let accessToken: string, locationId: string;
  try {
    ({ accessToken, locationId } = await getActiveGHLToken());
  } catch (e) {
    if (e instanceof GHLNotConnectedError) {
      return NextResponse.json(
        { error: "not_connected", message: "No active GHL account connected" },
        { status: 401 }
      );
    }
    throw e;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
  };

  let data: { contacts?: GHLContact[] };

  if (query.length >= 2) {
    const searchRes = await fetch(`${GHL_API}/contacts/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ locationId, query, limit, page }),
      cache: "no-store",
    });

    if (searchRes.ok) {
      data = await searchRes.json();
    } else {
      const fallback = await fetch(
        `${GHL_API}/contacts/?${new URLSearchParams({
          locationId,
          query,
          limit: `${limit}`,
          page: `${page}`,
        })}`,
        { headers, cache: "no-store" }
      );
      if (!fallback.ok) {
        const err = await fallback.text();
        return NextResponse.json(
          { error: "GHL API error", detail: err },
          { status: fallback.status }
        );
      }
      data = await fallback.json();
    }
  } else {
    const listRes = await fetch(
      `${GHL_API}/contacts/?${new URLSearchParams({
        locationId,
        limit: `${limit}`,
        page: `${page}`,
      })}`,
      { headers, cache: "no-store" }
    );
    if (!listRes.ok) {
      const err = await listRes.text();
      return NextResponse.json(
        { error: "GHL API error", detail: err },
        { status: listRes.status }
      );
    }
    data = await listRes.json();
  }

  const mapped = (data.contacts ?? []).map((c: GHLContact) => {
    const tags = extractTags(c.tags);
    return {
      contactId: c.id,
      name:
        c.contactName ||
        `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() ||
        "Unknown",
      phone: c.phone ?? null,
      email: c.email ?? null,
      tags,
    };
  });

  const contacts = mapped.filter((contact) => {
    if (requireEmail && !contact.email) return false;
    if (requirePhone && !contact.phone) return false;
    if (tag && !contact.tags.some((t) => t.toLowerCase().includes(tag))) return false;
    return true;
  });

  return NextResponse.json({
    contacts,
    page,
    limit,
    hasMore: (data.contacts ?? []).length === limit,
  });
}
