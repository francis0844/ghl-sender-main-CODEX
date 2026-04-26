import { NextRequest, NextResponse } from "next/server";
import {
  getActiveGHLToken,
  getGHLTokenById,
  GHLNotConnectedError,
} from "@/lib/ghl-token";
import { getSupabase } from "@/lib/supabase";

const GHL_API = "https://services.leadconnectorhq.com";
type MessageType = "SMS" | "Email" | "WhatsApp";
const VALID_TYPES: MessageType[] = ["SMS", "Email", "WhatsApp"];
const MAX_CONTACTS_PER_REQUEST = 50;

interface BulkResult {
  contactId: string;
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  let body: {
    contactIds: string[];
    type: MessageType;
    message: string;
    connectionId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contactIds, type, message, connectionId: requestedId } = body ?? {};
  const uniqueContactIds = Array.from(new Set((contactIds ?? []).filter(Boolean)));

  if (!uniqueContactIds.length || !type || !message?.trim()) {
    return NextResponse.json(
      { error: "contactIds, type, and message are required" },
      { status: 400 }
    );
  }
  if (uniqueContactIds.length > MAX_CONTACTS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Max ${MAX_CONTACTS_PER_REQUEST} contacts per bulk send` },
      { status: 400 }
    );
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  let accessToken: string, locationId: string, activeConnectionId: string;
  try {
    if (requestedId) {
      ({ accessToken, locationId, connectionId: activeConnectionId } =
        await getGHLTokenById(requestedId));
    } else {
      ({ accessToken, locationId, connectionId: activeConnectionId } =
        await getActiveGHLToken());
    }
  } catch (e) {
    if (e instanceof GHLNotConnectedError) {
      return NextResponse.json(
        { error: "not_connected", message: "No active GHL account connected" },
        { status: 401 }
      );
    }
    throw e;
  }

  const results: BulkResult[] = [];

  for (const contactId of uniqueContactIds) {
    try {
      const res = await fetch(`${GHL_API}/conversations/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          contactId,
          message: message.trim(),
          locationId,
        }),
        cache: "no-store",
      });

      if (res.ok) {
        results.push({ contactId, success: true });
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        results.push({
          contactId,
          success: false,
          error: data.message ?? `Failed with status ${res.status}`,
        });
      }
    } catch {
      results.push({ contactId, success: false, error: "Network/API error" });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.length - successCount;

  if (successCount > 0) {
    await getSupabase()
      .from("ghl_connections")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", activeConnectionId);
  }

  return NextResponse.json({
    success: failedCount === 0,
    summary: {
      total: results.length,
      successCount,
      failedCount,
    },
    results,
  });
}
