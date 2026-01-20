"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { Button, Input, Dialog } from "@/components/ui";
import { useRouter } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import type { Role } from "@/lib/supabase/types";
import type { Permission } from "@/lib/supabase/permissions";

// Types
interface PermissionInfo {
  key: string;
  category: string;
  i18nKey: string;
}

type DialogType = "create" | "edit" | "delete" | null;

export default function RolesPage() {
  const { t } = useI18n();
  const { user: authUser, isLoading: authLoading, hasPermission } = useAuth();
  const router = useRouter();
  
  // Permission checks
  const canListRoles = hasPermission(PERMISSIONS.ROLES_LIST);
  const canCreateRole = hasPermission(PERMISSIONS.ROLES_CREATE);
  const canUpdateRole = hasPermission(PERMISSIONS.ROLES_UPDATE);
  const canDeleteRole = hasPermission(PERMISSIONS.ROLES_DELETE);
  
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [permissionsByCategory, setPermissionsByCategory] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);
  
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });
  const [formError, setFormError] = useState("");

  // Get current user ID from auth context
  const currentUserId = authUser?.id;

  // Fetch roles
  const fetchRoles = useCallback(async () => {
    if (!currentUserId || !canListRoles) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/roles?operatorId=${currentUserId}`);
      const result = await response.json();
      
      if (result.roles) {
        setRoles(result.roles);
      }
    } catch (error) {
      console.error("Failed to fetch roles:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, canListRoles]);

  // Fetch permissions
  const fetchPermissions = useCallback(async () => {
    if (!currentUserId || !canListRoles) return;
    
    try {
      const response = await fetch(`/api/admin/roles/permissions?operatorId=${currentUserId}`);
      const result = await response.json();
      
      if (result.permissions) {
        setAllPermissions(result.permissions);
      }
      if (result.byCategory) {
        setPermissionsByCategory(result.byCategory);
      }
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
    }
  }, [currentUserId, canListRoles]);

  useEffect(() => {
    fetchRoles();
    fetchPermissions();
  }, [fetchRoles, fetchPermissions]);
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push("/login");
    }
  }, [authLoading, authUser, router]);
  
  // Show access denied if user doesn't have permission to list roles
  if (!authLoading && authUser && !canListRoles) {
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
      name: "",
      description: "",
      permissions: [],
    });
    setFormError("");
    setDialogType("create");
  };

  const openEditDialog = (role: Role) => {
    setSelectedRole(role);
    setFormData({
      name: role.name,
      description: role.description || "",
      permissions: role.permissions,
    });
    setFormError("");
    setDialogType("edit");
  };

  const openDeleteDialog = (role: Role) => {
    setSelectedRole(role);
    setDialogType("delete");
  };

  const closeDialog = () => {
    setDialogType(null);
    setSelectedRole(null);
    setFormError("");
  };

  // Action handlers
  const handleCreate = async () => {
    if (!currentUserId) return;
    if (!formData.name) {
      setFormError(t("validation.roleNameRequired"));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          name: formData.name,
          description: formData.description || undefined,
          permissions: formData.permissions,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchRoles();
      } else {
        setFormError(result.error || t("error.createRoleFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.createRoleFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!currentUserId || !selectedRole) return;

    setActionLoading(true);
    try {
      const response = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: currentUserId,
          roleId: selectedRole.id,
          name: formData.name !== selectedRole.name ? formData.name : undefined,
          description: formData.description,
          permissions: formData.permissions,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchRoles();
      } else {
        setFormError(result.error || t("error.updateRoleFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.updateRoleFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUserId || !selectedRole) return;

    setActionLoading(true);
    try {
      const params = new URLSearchParams({
        operatorId: currentUserId,
        roleId: selectedRole.id,
      });
      
      const response = await fetch(`/api/admin/roles?${params}`, {
        method: "DELETE",
      });
      
      const result = await response.json();
      if (result.success) {
        closeDialog();
        fetchRoles();
      } else {
        setFormError(result.error || t("error.deleteRoleFailed"));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("error.deleteRoleFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const togglePermission = (permissionKey: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permissionKey)
        ? prev.permissions.filter((p) => p !== permissionKey)
        : [...prev.permissions, permissionKey],
    }));
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg md:text-xl font-medium">{t("roles.title")}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {roles.length} {t("common.role").toLowerCase()}(s)
          </p>
        </div>
        {canCreateRole && (
          <Button onClick={openCreateDialog} className="w-full sm:w-auto">
            <PlusIcon className="mr-2 h-3 w-3" />
            {t("roles.createRole")}
          </Button>
        )}
      </div>

      {/* Roles Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="font-mono text-xs text-muted-foreground">{t("common.loading")}...</span>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <div
              key={role.id}
              className="border border-border bg-card p-6 transition-colors hover:border-foreground/20"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-mono text-sm font-medium">{role.name}</h3>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {role.description || "-"}
                  </p>
                </div>
                {role.is_system ? (
                  <span className="inline-block border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                    {t("roles.systemRole")}
                  </span>
                ) : (
                  <span className="inline-block border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-emerald-600">
                    {t("roles.customRole")}
                  </span>
                )}
              </div>

              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("roles.permissions")} ({role.permissions.length})
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {role.permissions.slice(0, 5).map((permission) => (
                    <span
                      key={permission}
                      className="inline-block bg-foreground/5 px-1.5 py-0.5 font-mono text-[9px]"
                    >
                      {permission}
                    </span>
                  ))}
                  {role.permissions.length > 5 && (
                    <span className="inline-block bg-foreground/5 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                      +{role.permissions.length - 5}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-1">
                {canUpdateRole && (
                  <button
                    onClick={() => openEditDialog(role)}
                    className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                    title={t("common.edit")}
                  >
                    <EditIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDeleteRole && !role.is_system && (
                  <button
                    onClick={() => openDeleteDialog(role)}
                    className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-red-500"
                    title={t("common.delete")}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Role Dialog */}
      <Dialog
        open={dialogType === "create" || dialogType === "edit"}
        onClose={closeDialog}
        title={dialogType === "create" ? t("roles.createRole") : t("roles.editRole")}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={dialogType === "create" ? handleCreate : handleUpdate}
              loading={actionLoading}
            >
              {dialogType === "create" ? t("common.create") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t("roles.name")}
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            disabled={selectedRole?.is_system}
          />
          <Input
            label={t("roles.description")}
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          />

          {/* Permissions */}
          <div className="space-y-3">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("roles.permissions")}
            </label>
            <div className="max-h-60 overflow-y-auto border border-border p-3">
              {Object.entries(permissionsByCategory).map(([category, perms]) => (
                <div key={category} className="mb-4 last:mb-0">
                  <h4 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {t(`permission.category.${category}`)}
                  </h4>
                  <div className="space-y-1.5">
                    {perms.map((permission) => (
                      <label
                        key={permission}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(permission)}
                          onChange={() => togglePermission(permission)}
                          className="h-3.5 w-3.5 accent-foreground"
                        />
                        <span className="font-mono text-xs">{permission}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formError && <p className="font-mono text-xs text-red-500">{formError}</p>}
        </div>
      </Dialog>

      {/* Delete Role Dialog */}
      <Dialog
        open={dialogType === "delete"}
        onClose={closeDialog}
        title={t("roles.deleteRole")}
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
          <p className="font-mono text-sm">{t("roles.confirmDelete")}</p>
          <p className="font-mono text-sm text-muted-foreground">
            {t("roles.name")}: <strong>{selectedRole?.name}</strong>
          </p>
          {formError && <p className="font-mono text-xs text-red-500">{formError}</p>}
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

function TrashIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
