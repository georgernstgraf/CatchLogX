import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

// GET: Liste aller gespeicherten Queries des aktuellen Users
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  try {
    const queries = await prisma.userQueries.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ data: queries });
  } catch (error) {
    console.error("Error fetching saved queries:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden der gespeicherten Queries" },
      { status: 500 }
    );
  }
}

// POST: Neue Query speichern
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  try {
    const { name, query } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name darf nicht leer sein" }, { status: 400 });
    }
    if (!query || !query.trim()) {
      return NextResponse.json({ error: "Query darf nicht leer sein" }, { status: 400 });
    }

    const saved = await prisma.userQueries.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        query: query,
      },
    });

    return NextResponse.json({ data: saved }, { status: 201 });
  } catch (error) {
    console.error("Error saving query:", error);
    return NextResponse.json(
      { error: "Fehler beim Speichern der Query" },
      { status: 500 }
    );
  }
}

// PUT: Bestehende Query aktualisieren (name und/oder query)
export async function PUT(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  try {
    const { id, name, query } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Query-ID fehlt" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.userQueries.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Query nicht gefunden" }, { status: 404 });
    }

    const updateData: { name?: string; query?: string } = {};
    if (name !== undefined) updateData.name = name.trim();
    if (query !== undefined) updateData.query = query;

    const updated = await prisma.userQueries.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Error updating query:", error);
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Query" },
      { status: 500 }
    );
  }
}

// DELETE: Query löschen
export async function DELETE(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Query-ID fehlt" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.userQueries.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Query nicht gefunden" }, { status: 404 });
    }

    await prisma.userQueries.delete({ where: { id } });

    return NextResponse.json({ message: "Query gelöscht" });
  } catch (error) {
    console.error("Error deleting query:", error);
    return NextResponse.json(
      { error: "Fehler beim Löschen der Query" },
      { status: 500 }
    );
  }
}
