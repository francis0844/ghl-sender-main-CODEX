const GHL_API = "https://services.leadconnectorhq.com";

export interface GHLSmartList {
  id: string;
  name: string;
}

export interface GHLBasicContact {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  tags?: Array<string | { name?: string; label?: string }>;
}

const SMART_LIST_ENDPOINT_CANDIDATES = [
  "/contacts/smart_lists",
  "/contacts/smartlists",
  "/contacts/smart-lists",
  "/contacts/smart_lists/list",
  "/contacts/smartlists/list",
  "/contacts/smart-lists/list",
];

const SMART_LIST_CONTACT_ENDPOINT_CANDIDATES = [
  (id: string) => `/contacts/smart_lists/${id}/contacts`,
  (id: string) => `/contacts/smartlists/${id}/contacts`,
  (id: string) => `/contacts/smart-lists/${id}/contacts`,
];

function readArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const candidates = [
    obj.smartLists,
    obj.smartlists,
    obj.lists,
    obj.data,
    obj.items,
    obj.results,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as T[];
  }
  return [];
}

function normalizeSmartListRows(rows: unknown[]): GHLSmartList[] {
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const id = item.id ?? item._id ?? item.listId ?? item.smartListId;
      const name = item.name ?? item.title ?? item.listName ?? item.label;
      if (typeof id !== "string" || typeof name !== "string") return null;
      return { id, name } as GHLSmartList;
    })
    .filter((item): item is GHLSmartList => !!item);
}

function normalizeContactRows(rows: unknown[]): GHLBasicContact[] {
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const id =
        (item.id as string | undefined) ??
        (item.contactId as string | undefined) ??
        (item._id as string | undefined);
      if (!id) return null;
      return {
        id,
        contactName: (item.contactName as string | undefined) ?? undefined,
        firstName: (item.firstName as string | undefined) ?? undefined,
        lastName: (item.lastName as string | undefined) ?? undefined,
        phone: (item.phone as string | undefined) ?? undefined,
        email: (item.email as string | undefined) ?? undefined,
        tags: (item.tags as GHLBasicContact["tags"]) ?? undefined,
      } as GHLBasicContact;
    })
    .filter((item): item is GHLBasicContact => !!item);
}

function ghlHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
  };
}

export async function fetchNativeSmartLists(params: {
  accessToken: string;
  locationId: string;
}): Promise<{ smartLists: GHLSmartList[]; endpoint?: string }> {
  const { accessToken, locationId } = params;
  const headers = ghlHeaders(accessToken);

  for (const endpoint of SMART_LIST_ENDPOINT_CANDIDATES) {
    const url = `${GHL_API}${endpoint}?${new URLSearchParams({ locationId })}`;
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const rows = readArray<unknown>(data);
      const smartLists = normalizeSmartListRows(rows);
      if (smartLists.length > 0) {
        return { smartLists, endpoint };
      }
    } catch {
      // Keep trying candidates
    }
  }

  return { smartLists: [] };
}

export async function fetchContactsForNativeSmartList(params: {
  accessToken: string;
  locationId: string;
  smartListId: string;
  page: number;
  limit: number;
}): Promise<{ contacts: GHLBasicContact[]; endpoint?: string } | null> {
  const { accessToken, locationId, smartListId, page, limit } = params;
  const headers = ghlHeaders(accessToken);

  for (const getEndpoint of SMART_LIST_CONTACT_ENDPOINT_CANDIDATES) {
    const url = `${GHL_API}${getEndpoint(smartListId)}?${new URLSearchParams({
      locationId,
      page: `${page}`,
      limit: `${limit}`,
    })}`;
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const rows = readArray<unknown>(data);
      const contacts = normalizeContactRows(rows);
      return { contacts, endpoint: getEndpoint(smartListId) };
    } catch {
      // Keep trying candidates
    }
  }

  // Potential support through advanced search body
  try {
    const searchRes = await fetch(`${GHL_API}/contacts/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        locationId,
        page,
        limit,
        // This field is not documented clearly; include as best-effort.
        smartListId,
      }),
      cache: "no-store",
    });
    if (searchRes.ok) {
      const data = await searchRes.json().catch(() => ({}));
      const rows = readArray<unknown>(data);
      const contacts = normalizeContactRows(rows);
      return { contacts, endpoint: "/contacts/search" };
    }
  } catch {
    // ignored
  }

  return null;
}
