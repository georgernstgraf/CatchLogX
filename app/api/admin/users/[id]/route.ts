import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAuth } from "@/lib/admin-middleware";
import bcrypt from "bcrypt";

export const PATCH = withAdminAuth(
  async (
    request: NextRequest,
    sessionData,
    { params }: { params: { id: string } }
  ) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { username, email, name, role, password } = body;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, username: true, role: true },
      });

      if (!existingUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // Prevent editing other admin users (except yourself)
      if (
        existingUser.role === "admin" &&
        existingUser.id !== sessionData.user.id
      ) {
        return NextResponse.json(
          { error: "Cannot edit other admin users" },
          { status: 403 }
        );
      }

      // Check for username/email conflicts (excluding current user)
      if (username || email) {
        const conflictUser = await prisma.user.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              {
                OR: [
                  ...(username ? [{ username }] : []),
                  ...(email ? [{ email }] : []),
                ],
              },
            ],
          },
        });

        if (conflictUser) {
          return NextResponse.json(
            { error: "Username or email already exists" },
            { status: 409 }
          );
        }
      }

      // Prepare update data
      const updateData: any = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (name !== undefined) updateData.name = name;
      if (role && role !== existingUser.role) {
        // Only allow role changes if the current user is admin
        updateData.role = role;
      }
      if (password) {
        updateData.hashedPassword = await bcrypt.hash(password, 10);
        updateData.isFirstLogin = true; // Force password change on next login
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      console.log(
        `[ADMIN] User updated by ${sessionData.user.username}:`,
        updatedUser.username
      );

      return NextResponse.json(
        {
          message: "User updated successfully",
          user: updatedUser,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("[ADMIN] Error updating user:", error);
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withAdminAuth(
  async (
    request: NextRequest,
    sessionData,
    { params }: { params: { id: string } }
  ) => {
    try {
      const { id } = await params;

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, username: true, role: true },
      });

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // Prevent deleting admin users (including self)
      if (user.role === "admin") {
        return NextResponse.json(
          { error: "Cannot delete admin users" },
          { status: 403 }
        );
      }

      // Delete user (cascade will handle related records)
      await prisma.user.delete({
        where: { id },
      });

      console.log(
        `[ADMIN] User deleted by ${sessionData.user.username}:`,
        user.username
      );

      return NextResponse.json(
        { message: "User deleted successfully" },
        { status: 200 }
      );
    } catch (error) {
      console.error("[ADMIN] Error deleting user:", error);
      return NextResponse.json(
        { error: "Failed to delete user" },
        { status: 500 }
      );
    }
  }
);
