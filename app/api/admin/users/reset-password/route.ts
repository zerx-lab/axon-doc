import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission, canManageUser } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/validation";

// POST /api/admin/users/reset-password - Reset user password
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operatorId, userId, newPassword } = body;

    if (!operatorId || !userId || !newPassword) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check permission
    const hasResetPermission = await hasPermission(
      supabase,
      operatorId,
      Permissions.USERS_RESET_PASSWORD
    );
    if (!hasResetPermission) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Check if can manage user (allow self password reset)
    if (operatorId !== userId) {
      const canManage = await canManageUser(supabase, operatorId, userId);
      if (!canManage) {
        return NextResponse.json(
          { error: "Cannot manage this user" },
          { status: 403 }
        );
      }
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    const { error: updateError } = await supabase
      .from("users")
      .update({ password_hash: passwordHash })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to reset password" },
        { status: 500 }
      );
    }

    // Delete all user sessions (force re-login)
    if (operatorId !== userId) {
      await supabase.from("sessions").delete().eq("user_id", userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
