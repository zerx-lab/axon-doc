"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { Button, Input, Select, Dialog } from "@/components/ui";
import { useRouter } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import type { Role } from "@/lib/supabase/types";

// Types
interface UserWithRole {
  id: string;
  username: string;
  role_id: string;
  display_name: string | null;
  avatar: string | null;
  last_login_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role?: {
    id: string;
    name: string;
    is_super_admin: boolean;
  };
}

type DialogType = "create" | "edit" | "delete" | "resetPassword" | null;

export default function UsersPage() {
  const { t } = useI18n();
  const { user: authUser, isLoading: authLoading, hasPermission } = useAuth();
  const router = useRouter();
  
  // Permission checks
  const canListUsers = hasPermission(PERMISSIONS.USERS_LIST);
  const canCreateUser = hasPermission(PERMISSIONS.USERS_CREATE);
  const canUpdateUser = hasPermission(PERMISSIONS.USERS_UPDATE);
  const canDeleteUser = hasPermission(PERMISSIONS.USERS_DELETE);
  const canToggleActive = hasPermission(PERMISSIONS.USERS_TOGGLE_ACTIVE);
  const canResetPassword = hasPermission(PERMISSIONS.USERS_RESET_PASSWORD);
  
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialog state
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    displayName: "",
    roleId: "" as string,
  });
  const [formError, setFormError] = useState("");

  // Get current user ID from auth context
  const currentUserId = authUser?.id;

  // Fetch users
  const fetchUsers = useCallback(async () => {
    if (!currentUserId || !canListUsers) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
        limit: "50",
        page: "1",
      });
      if (search) {
        params.append("search", search);
      }
      
      const response = await fetch(`/api/admin/users?${params}`);
      const result = await response.json();
      
      if (result.users) {
        setUsers(result.users);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, search, canListUsers]);

  // Fetch roles
  const fetchRoles = useCallback(async () => {
    if (!currentUserId) return;
    
    try {
      const response = await fetch(`/api/admin/roles?operatorId=${currentUserId}`);
      const result = await response.json();
      
      if (result.roles) {
        setRoles(result.roles);
      }
    } catch (error) {
      console.error("Failed to fetch roles:", error);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, [fetchUsers, fetchRoles]);
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push("/login");
    }
  }, [authLoading, authUser, router]);
  
  // Show access denied if user doesn't have permission to list users
  if (!authLoading && authUser && !canListUsers) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h2 className="font-mono text-lg font-medium text-red-500">{t("error.accessDenied")}</h2>
          <p className="mt-2 font-mono text-sm text-muted-foreground">{t("error.noPermission")}</p>
        </div>
      </div>
    );
  }

  // Dialog handlers
  const openCreateDialog = () => {
    setFormData({
      username: "",
      password: "",
      displayName: "",
      roleId: roles.length > 0 ? roles[0].id : "",
    });
    setFormError("");
    setDialogType("create");
  };

  const openEditDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      password: "",
      displayName: user.display_name || "",
      roleId: user.role_id,
    });
    setFormError("");
    setDialogType("edit");
  };

  const openDeleteDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setDialogType("delete");
  };

  const openResetPasswordDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setFormData((prev) => ({ ...prev, password: "" }));
    setFormError("");
    setDialogType("resetPassword");
  };

  const closeDialog = () => {
    setDialogType(null);
    setSelectedUser(null);
    setFormError("");
  };

  // Action handlers
  const handleCreate = async () => {
    if (!currentUserId) return;
    if (!formData.username || !formData.password) {
      setFormError(t("auth.enterUsername"));
      return;
    }

    if (!formData.roleId) {
      setFormError(t("users.roleRequired"));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          username: formData.username,
          password: formData.password,
          displayName: formData.displayName || undefined,
          roleId: formData.roleId,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchUsers();
      } else {
        setFormError(result.error || t("error.createUserFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.createUserFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!currentUserId || !selectedUser) return;

    if (!formData.roleId) {
      setFormError(t("users.roleRequired"));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          userId: selectedUser.id,
          username: formData.username !== selectedUser.username ? formData.username : undefined,
          displayName: formData.displayName,
          roleId: formData.roleId !== selectedUser.role_id ? formData.roleId : undefined,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchUsers();
      } else {
        setFormError(result.error || t("error.updateUserFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.updateUserFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (user: UserWithRole) => {
    if (!currentUserId) return;

    try {
      const response = await fetch("/api/admin/users/toggle-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          userId: user.id,
          isActive: !user.is_active,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Failed to toggle user status:", error);
    }
  };

  const handleResetPassword = async () => {
    if (!currentUserId || !selectedUser || !formData.password) return;

    setActionLoading(true);
    try {
      const response = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          userId: selectedUser.id,
          newPassword: formData.password,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
      } else {
        setFormError(result.error || t("error.resetPasswordFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.resetPasswordFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUserId || !selectedUser) return;

    setActionLoading(true);
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
        userId: selectedUser.id,
      });
      
      const response = await fetch(`/api/admin/users?${params}`, {
        method: "DELETE",
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchUsers();
      } else {
        setFormError(result.error || t("error.deleteUserFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.deleteUserFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  // Role options
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }));

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg md:text-xl font-medium">{t("users.title")}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {users.length} {t("common.user").toLowerCase()}(s)
          </p>
        </div>
        {canCreateUser && (
          <Button onClick={openCreateDialog} className="w-full sm:w-auto">
            <PlusIcon className="mr-2 h-3 w-3" />
            {t("users.createUser")}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder={t("users.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-sm"
        />
      </div>

      {/* Users Table */}
      <div className="border border-border overflow-x-auto">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_1fr_150px_100px_140px] gap-4 border-b border-border bg-card px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("users.username")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("users.displayName")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("users.role")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("common.status")}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("common.actions")}
          </div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-xs text-muted-foreground">{t("common.loading")}...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-xs text-muted-foreground">{t("common.noData")}</span>
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[1fr_1fr_150px_100px_140px] gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-card/50"
            >
              <div className="font-mono text-sm">{user.username}</div>
              <div className="font-mono text-sm text-muted-foreground">
                {user.display_name || "-"}
              </div>
              <div>
                <span className="inline-block border border-border px-2 py-0.5 font-mono text-[10px] uppercase">
                  {user.role?.name || "-"}
                </span>
              </div>
              <div>
                {canToggleActive ? (
                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase ${
                      user.is_active ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        user.is_active ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    {user.is_active ? t("common.active") : t("common.inactive")}
                  </button>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase ${
                      user.is_active ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        user.is_active ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    {user.is_active ? t("common.active") : t("common.inactive")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canUpdateUser && (
                  <button
                    onClick={() => openEditDialog(user)}
                    className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                    title={t("common.edit")}
                  >
                    <EditIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {canResetPassword && (
                  <button
                    onClick={() => openResetPasswordDialog(user)}
                    className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                    title={t("users.resetPassword")}
                  >
                    <KeyIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDeleteUser && (
                  <button
                    onClick={() => openDeleteDialog(user)}
                    className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-red-500"
                    title={t("common.delete")}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog
        open={dialogType === "create"}
        onClose={closeDialog}
        title={t("users.createUser")}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreate} loading={actionLoading}>
              {t("common.create")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t("users.username")}
            value={formData.username}
            onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
            required
          />
          <Input
            label={t("auth.password")}
            type="password"
            value={formData.password}
            onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          <Input
            label={t("users.displayName")}
            value={formData.displayName}
            onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
          />
          <Select
            label={t("users.role")}
            options={roleOptions}
            value={formData.roleId}
            onChange={(e) => setFormData((prev) => ({ ...prev, roleId: e.target.value }))}
          />
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={dialogType === "edit"}
        onClose={closeDialog}
        title={t("users.editUser")}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleUpdate} loading={actionLoading}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t("users.username")}
            value={formData.username}
            onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
          />
          <Input
            label={t("users.displayName")}
            value={formData.displayName}
            onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
          />
          <Select
            label={t("users.role")}
            options={roleOptions}
            value={formData.roleId}
            onChange={(e) => setFormData((prev) => ({ ...prev, roleId: e.target.value }))}
          />
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={dialogType === "resetPassword"}
        onClose={closeDialog}
        title={t("users.resetPassword")}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleResetPassword} loading={actionLoading}>
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="font-mono text-sm text-muted-foreground">
            {t("users.resetPassword")}: <strong>{selectedUser?.username}</strong>
          </p>
          <Input
            label={t("users.newPassword")}
            type="password"
            value={formData.password}
            onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog
        open={dialogType === "delete"}
        onClose={closeDialog}
        title={t("users.deleteUser")}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={actionLoading}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="font-mono text-sm">{t("users.confirmDelete")}</p>
          <p className="font-mono text-sm text-muted-foreground">
            {t("users.username")}: <strong>{selectedUser?.username}</strong>
          </p>
          {formError && (
            <p className="font-mono text-xs text-red-500">{formError}</p>
          )}
        </div>
      </Dialog>
    </div>
  );
}

// Icons
function PlusIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function EditIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function KeyIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function TrashIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
