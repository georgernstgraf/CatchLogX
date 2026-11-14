import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-middleware";
import {
  deleteFishSpecies,
  updateFishSpecies,
  type UpdateFishSpeciesInput,
} from "@/services/fishSpeciesService";

/** Renames or re-describes a fish species. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { error: "Invalid species id" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const input: UpdateFishSpeciesInput = {};

    if (typeof body?.speciesName === "string") {
      input.speciesName = body.speciesName;
    }
    if (body?.germanName === null || typeof body.germanName === "string") {
      input.germanName = body.germanName;
    }
    if (body?.family === null || typeof body.family === "string") {
      input.family = body.family;
    }

    const result = await updateFishSpecies(id, input);

    if (result.invalid) {
      return NextResponse.json(
        { error: "Species name must not be empty" },
        { status: 400 },
      );
    }

    if (result.notFound) {
      return NextResponse.json(
        { error: "Fish species not found" },
        { status: 404 },
      );
    }

    if (result.conflict) {
      return NextResponse.json(
        { error: "A species with this name already exists" },
        { status: 409 },
      );
    }

    return NextResponse.json({ species: result.species }, { status: 200 });
  } catch (error) {
    console.error("[ADMIN] Error updating fish species:", error);
    return NextResponse.json(
      { error: "Failed to update fish species" },
      { status: 500 },
    );
  }
}

/** Deletes a fish species, unless catches still reference it. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { error: "Invalid species id" },
        { status: 400 },
      );
    }

    const result = await deleteFishSpecies(id);

    if (result.notFound) {
      return NextResponse.json(
        { error: "Fish species not found" },
        { status: 404 },
      );
    }

    if (result.conflict) {
      const catchCount = result.catchCount;
      return NextResponse.json(
        {
          error:
            catchCount === undefined
              ? "Species is still used by catches"
              : `Species is used by ${catchCount} catch${catchCount === 1 ? "" : "es"}`,
          ...(catchCount !== undefined ? { catchCount } : {}),
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "Fish species deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("[ADMIN] Error deleting fish species:", error);
    return NextResponse.json(
      { error: "Failed to delete fish species" },
      { status: 500 },
    );
  }
}
