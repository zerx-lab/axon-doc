import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { toSafeUser, hasPermission, canManageUser, isSuperAdmin } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import type { User } from "@/lib/supabase/types";
import bcrypt from "bcryptjs";
import { escapeSearchPattern, validatePassword, validatePagination } from "@/lib/validation";

// GET /api/admin/users - List users
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get("operatorId");
    const search = searchParams.get("search") || "";
    const { limit, page, offset } = validatePagination(
      searchParams.get("limit"),
      searchParams.get("page"),
      { maxLimit: 100, defaultLimit: 20 }
    );

    if (!operatorId) {
      return NextResponse.json(
        { error: "Operator ID is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check permission
    const hasListPermission = await hasPermission(
      supabase,
      operatorId,
      Permissions.USERS_LIST
    );
    if (!hasListPermission) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("users")
      .select("*, roles!inner(id, name, is_super_admin)", { count: "exact" });

    // Apply search filter with escaped pattern to prevent SQL injection
    if (search) {
      const escapedSearch = escapeSearchPattern(search);
      query = query.or(`username.ilike.%${escapedSearch}%,display_name.ilike.%${escapedSearch}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

    const { data: users, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    const safeUsers = users?.map((user) => {
      const { roles, ...userData } = user;
      return {
        ...toSafeUser(userData as User),
        role: roles,
      };
    }) || [];

    return NextResponse.json({
      users: safeUsers,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error("List users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Create user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operatorId, username, password, roleId, displayName } = body;

    if (!operatorId || !username || !password || !roleId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check permission
    const hasCreatePermission = await hasPermission(
      supabase,
      operatorId,
      Permissions.USERS_CREATE
    );
    if (!hasCreatePermission) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Check if role is super admin (only super admin can create super admin)
    const { data: targetRole } = await supabase
      .from("roles")
      .select("is_super_admin")
      .eq("id", roleId)
      .single();

    if (targetRole?.is_super_admin) {
      const operatorIsSuperAdmin = await isSuperAdmin(supabase, operatorId);
      if (!operatorIsSuperAdmin) {
        return NextResponse.json(
          { error: "Only super admin can create super admin users" },
          { status: 403 }
        );
      }
    }

    // Check if username exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const { data: newUser, error: createError } = await supabase
      .from("users")
      .insert({
        username,
        password_hash: passwordHash,
        role_id: roleId,
        display_name: displayName || null,
        is_active: true,
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: toSafeUser(newUser),
    });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users - Update user
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { operatorId, userId, username, roleId, displayName, avatar } = body;

    if (!operatorId || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check permission
    const hasUpdatePermission = await hasPermission(
      supabase,
      operatorId,
      Permissions.USERS_UPDATE
    );
    if (!hasUpdatePermission) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Check if can manage user
    const canManage = await canManageUser(supabase, operatorId, userId);
    if (!canManage && operatorId !== userId) {
      return NextResponse.json(
        { error: "Cannot manage this user" },
        { status: 403 }
      );
    }

    // If changing role, check if target role is super admin
    if (roleId) {
      const { data: targetRole } = await supabase
        .from("roles")
        .select("is_super_admin")
        .eq("id", roleId)
        .single();

      if (targetRole?.is_super_admin) {
        const operatorIsSuperAdmin = await isSuperAdmin(supabase, operatorId);
        if (!operatorIsSuperAdmin) {
          return NextResponse.json(
            { error: "Only super admin can assign super admin role" },
            { status: 403 }
          );
        }
      }
    }

    // If changing username, check if it exists
    if (username) {
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .neq("id", userId)
        .single();

      if (existingUser) {
        return NextResponse.json(
          { error: "Username already exists" },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (username !== undefined) updateData.username = username;
    if (roleId !== undefined) updateData.role_id = roleId;
    if (displayName !== undefined) updateData.display_name = displayName;
    if (avatar !== undefined) updateData.avatar = avatar;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: toSafeUser(updatedUser),
    });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users - Delete user
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get("operatorId");
    const userId = searchParams.get("userId");

    if (!operatorId || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check permission
    const hasDeletePermission = await hasPermission(
      supabase,
      operatorId,
      Permissions.USERS_DELETE
    );
    if (!hasDeletePermission) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Cannot delete self
    if (operatorId === userId) {
      return NextResponse.json(
        { error: "Cannot delete yourself" },
        { status: 400 }
      );
    }

    // Check if can manage user
    const canManage = await canManageUser(supabase, operatorId, userId);
    if (!canManage) {
      return NextResponse.json(
        { error: "Cannot delete this user" },
        { status: 403 }
      );
    }

    // Delete user's sessions first
    await supabase.from("sessions").delete().eq("user_id", userId);

    // Delete user
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", userId);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
