import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import { createFishSpecies, listFishSpecies } from "@/services/fishSpeciesService";

/** Lists all fish species with their catch counts. */
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const fishSpecies = await listFishSpecies();
    return NextResponse.json({ fishSpecies }, { status: 200 });
  } catch (error) {
    console.error("[ADMIN] Error listing fish species:", error);
    return NextResponse.json(
      { error: "Failed to load fish species" },
      { status: 500 },
    );
  }
}

/** Creates a fish species. */
export async function POST(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json();
    const speciesName =
      typeof body?.speciesName === "string" ? body.speciesName : "";

    if (!speciesName.trim()) {
      return NextResponse.json(
        { error: "Species name is required" },
        { status: 400 },
      );
    }

    const result = await createFishSpecies({
      speciesName,
      germanName: typeof body.germanName === "string" ? body.germanName : null,
      family: typeof body.family === "string" ? body.family : null,
    });

    if (result.invalid) {
      return NextResponse.json(
        { error: "Species name is required" },
        { status: 400 },
      );
    }

    if (result.conflict) {
      return NextResponse.json(
        { error: "A species with this name already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json({ species: result.species }, { status: 201 });
  } catch (error) {
    console.error("[ADMIN] Error creating fish species:", error);
    return NextResponse.json(
      { error: "Failed to create fish species" },
      { status: 500 },
    );
  }
}
