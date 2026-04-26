import { NextResponse } from "next/server";
import { getActiveGHLToken, GHLNotConnectedError } from "@/lib/ghl-token";
import { fetchNativeSmartLists } from "@/lib/ghl-smart-lists";

export async function GET() {
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

  const { smartLists, endpoint } = await fetchNativeSmartLists({
    accessToken,
    locationId,
  });

  return NextResponse.json({
    smartLists,
    source: endpoint ?? null,
    supportsNativeSmartLists: smartLists.length > 0,
  });
}
