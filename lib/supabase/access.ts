import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SafeUser, User, Role } from "./types";
import type { Permission } from "./permissions";

/**
 * Check if a user has a specific permission
 * Optimized to use JOIN to avoid N+1 query
 */
export async function hasPermission(
  supabase: SupabaseClient<Database>,
  userId: string,
  permission: Permission
): Promise<boolean> {
  const { data: user, error } = await supabase
    .from("users")
    .select("role_id, roles!inner(permissions, is_super_admin)")
    .eq("id", userId)
    .single();

  if (error || !user) return false;

  const role = user.roles as unknown as { permissions: unknown; is_super_admin: boolean };
  if (!role) return false;

  // Super admin has all permissions
  if (role.is_super_admin) {
    return true;
  }

  // Ensure permissions is an array before checking
  const permissions = Array.isArray(role.permissions) ? role.permissions : [];
  if (permissions.includes("*")) {
    return true;
  }

  return permissions.includes(permission);
}

/**
 * Require a permission, throw error if not granted
 */
export async function requirePermission(
  supabase: SupabaseClient<Database>,
  userId: string,
  permission: Permission
): Promise<void> {
  const granted = await hasPermission(supabase, userId, permission);
  if (!granted) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

/**
 * Get all permissions for a user
 * Optimized to use JOIN to avoid N+1 query
 */
export async function getUserPermissions(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string[]> {
  const { data: user } = await supabase
    .from("users")
    .select("role_id, roles!inner(permissions, is_super_admin)")
    .eq("id", userId)
    .single();

  if (!user) return [];

  const role = user.roles as unknown as { permissions: unknown; is_super_admin: boolean };
  if (!role) return [];

  // Super admin has all permissions
  if (role.is_super_admin) {
    return ["*"];
  }

  // Ensure permissions is an array
  return Array.isArray(role.permissions) ? role.permissions : [];
}

/**
 * Check if a user is a super admin
 * Optimized to use JOIN to avoid N+1 query
 */
export async function isSuperAdmin(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data: user } = await supabase
    .from("users")
    .select("role_id, roles!inner(is_super_admin)")
    .eq("id", userId)
    .single();

  if (!user) return false;

  const role = user.roles as unknown as { is_super_admin: boolean };
  return role?.is_super_admin ?? false;
}

/**
 * Check if actor can manage target user
 * Rules:
 * 1. Cannot manage yourself (for certain operations)
 * 2. Only super admins can manage other super admins
 * 3. Only users with system roles can manage users with system roles
 * 4. Users can only manage other users with equal or lesser permissions
 * Optimized to use JOINs and parallel queries to avoid N+1
 */
export async function canManageUser(
  supabase: SupabaseClient<Database>,
  actorId: string,
  targetUserId: string
): Promise<boolean> {
  // Cannot manage yourself in certain ways
  if (actorId === targetUserId) {
    return false;
  }

  // Fetch both users with their roles in parallel using JOINs
  const [actorResult, targetResult] = await Promise.all([
    supabase
      .from("users")
      .select("role_id, roles!inner(is_super_admin, is_system, permissions)")
      .eq("id", actorId)
      .single(),
    supabase
      .from("users")
      .select("role_id, roles!inner(is_super_admin, is_system, permissions)")
      .eq("id", targetUserId)
      .single(),
  ]);

  if (!actorResult.data || !targetResult.data) return false;

  const actorRole = actorResult.data.roles as unknown as {
    is_super_admin: boolean;
    is_system: boolean;
    permissions: unknown;
  };
  const targetRole = targetResult.data.roles as unknown as {
    is_super_admin: boolean;
    is_system: boolean;
    permissions: unknown;
  };

  if (!actorRole || !targetRole) return false;

  // Only super admins can manage other super admins
  if (targetRole.is_super_admin && !actorRole.is_super_admin) {
    return false;
  }

  // Super admins can manage anyone
  if (actorRole.is_super_admin) {
    return true;
  }

  // Non-system role users cannot manage users with system roles
  // (e.g., custom role cannot manage Administrator)
  if (targetRole.is_system && !actorRole.is_system) {
    return false;
  }

  // For system roles, check permission count (more permissions = higher level)
  // This prevents User Manager from managing Administrator
  if (actorRole.is_system && targetRole.is_system) {
    const actorPerms = Array.isArray(actorRole.permissions) ? actorRole.permissions : [];
    const targetPerms = Array.isArray(targetRole.permissions) ? targetRole.permissions : [];
    const actorPermCount = actorPerms.includes("*") ? 999 : actorPerms.length;
    const targetPermCount = targetPerms.includes("*") ? 999 : targetPerms.length;

    // Can only manage users with fewer or equal permissions
    if (targetPermCount > actorPermCount) {
      return false;
    }
  }

  return true;
}

/**
 * Convert user to safe user (without password hash)
 */
export function toSafeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

/**
 * Get user with role information
 * Optimized to use JOIN to avoid N+1 query
 */
export async function getUserWithRole(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{
  user: SafeUser;
  role: Role;
  permissions: string[];
  isSuperAdmin: boolean;
} | null> {
  const { data } = await supabase
    .from("users")
    .select("*, roles!inner(*)")
    .eq("id", userId)
    .single();

  if (!data) return null;

  const { roles: role, ...userData } = data as unknown as User & { roles: Role };
  if (!role) return null;

  // Ensure permissions is an array
  const rolePermissions = Array.isArray(role.permissions) ? role.permissions : [];
  const permissions = role.is_super_admin ? ["*"] : rolePermissions;

  return {
    user: toSafeUser(userData),
    role,
    permissions,
    isSuperAdmin: role.is_super_admin,
  };
}
