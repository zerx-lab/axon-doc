"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { useRouter } from "next/navigation";
import { Permissions } from "@/lib/supabase/permissions";
import { Shield, Users, Database, Plus, Edit2, Trash2, Check, X } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description?: string;
  is_system: boolean;
  is_super_admin: boolean;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  is_public?: boolean;
  document_count?: number;
}

interface KBPermission {
  id: string;
  role_id: string;
  kb_id: string;
  can_read: boolean;
  can_ask: boolean;
  role?: Role;
  knowledge_base?: KnowledgeBase;
}

export default function KBPermissionsPage() {
  const { t } = useI18n();
  const { user: authUser, hasPermission } = useAuth();
  const router = useRouter();

  // Permission checks
  const canViewPermissions = hasPermission(Permissions.CHAT_KB_PERMISSIONS_VIEW);
  const canManagePermissions = hasPermission(Permissions.CHAT_KB_PERMISSIONS_MANAGE);

  const [permissions, setPermissions] = useState<KBPermission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPermission, setEditingPermission] = useState<KBPermission | null>(null);

  // Form state
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedKbId, setSelectedKbId] = useState("");
  const [canRead, setCanRead] = useState(true);
  const [canAsk, setCanAsk] = useState(true);
  const [formError, setFormError] = useState("");

  // Filter state
  const [filterRoleId, setFilterRoleId] = useState("");
  const [filterKbId, setFilterKbId] = useState("");

  // Batch operation state
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchAction, setBatchAction] = useState<"grant" | "revoke" | "delete">("grant");

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!canViewPermissions || !authUser) return;

    setLoading(true);
    try {
      // Fetch permissions
      const permResponse = await fetch(`/api/admin/kb-permissions?operatorId=${authUser.id}`);
      if (permResponse.ok) {
        const data = await permResponse.json();
        setPermissions(data.permissions || []);
        setRoles(data.roles || []);
      }

      // Fetch knowledge bases
      const kbResponse = await fetch(`/api/kb?operatorId=${authUser.id}`);
      if (kbResponse.ok) {
        const data = await kbResponse.json();
        setKnowledgeBases(data.knowledgeBases || []);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [authUser, canViewPermissions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle save permission
  const handleSavePermission = async () => {
    if (!selectedRoleId || !selectedKbId) {
      setFormError(t("kbPermissions.selectRoleAndKb"));
      return;
    }

    setFormError("");
    try {
      const method = editingPermission ? "PUT" : "POST";
      const url = editingPermission
        ? `/api/admin/kb-permissions/${editingPermission.id}?operatorId=${authUser?.id}`
        : "/api/admin/kb-permissions";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: authUser?.id,
          role_id: selectedRoleId,
          kb_id: selectedKbId,
          can_read: canRead,
          can_ask: canAsk,
        }),
      });

      if (response.ok) {
        setShowDialog(false);
        resetForm();
        fetchData();
      } else {
        const error = await response.json();
        setFormError(error.error || t("common.error"));
      }
    } catch (error) {
      console.error("Failed to save permission:", error);
      setFormError(t("common.error"));
    }
  };

  // Handle delete permission
  const handleDeletePermission = async (permission: KBPermission) => {
    if (!confirm(t("kbPermissions.confirmDelete"))) return;

    try {
      const response = await fetch(`/api/admin/kb-permissions/${permission.id}?operatorId=${authUser?.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Failed to delete permission:", error);
    }
  };

  // Handle batch operations
  const handleBatchOperation = async () => {
    if (selectedPermissions.size === 0) return;

    try {
      const response = await fetch("/api/admin/kb-permissions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: authUser?.id,
          permissionIds: Array.from(selectedPermissions),
          action: batchAction,
          updates: batchAction === "grant" ? { can_read: true, can_ask: true } :
                   batchAction === "revoke" ? { can_read: false, can_ask: false } : null,
        }),
      });

      if (response.ok) {
        setShowBatchDialog(false);
        setSelectedPermissions(new Set());
        fetchData();
      }
    } catch (error) {
      console.error("Failed to perform batch operation:", error);
    }
  };

  // Reset form
  const resetForm = () => {
    setSelectedRoleId("");
    setSelectedKbId("");
    setCanRead(true);
    setCanAsk(true);
    setFormError("");
    setEditingPermission(null);
  };

  // Open edit dialog
  const openEditDialog = (permission: KBPermission) => {
    setEditingPermission(permission);
    setSelectedRoleId(permission.role_id);
    setSelectedKbId(permission.kb_id);
    setCanRead(permission.can_read);
    setCanAsk(permission.can_ask);
    setShowDialog(true);
  };

  // Filter permissions
  const filteredPermissions = permissions.filter(p => {
    if (filterRoleId && p.role_id !== filterRoleId) return false;
    if (filterKbId && p.kb_id !== filterKbId) return false;
    return true;
  });

  // Toggle permission selection
  const togglePermissionSelection = (id: string) => {
    const newSelection = new Set(selectedPermissions);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedPermissions(newSelection);
  };

  // Select all visible permissions
  const selectAllPermissions = () => {
    setSelectedPermissions(new Set(filteredPermissions.map(p => p.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedPermissions(new Set());
  };

  if (!canViewPermissions) {
    return (
      <div className="p-8 text-center">
        <Shield className="mx-auto h-16 w-16 text-gray-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">{t("common.noPermission")}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">
            {t("kbPermissions.title")}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t("kbPermissions.description")}
          </p>
        </div>
        {canManagePermissions && (
          <Button onClick={() => { resetForm(); setShowDialog(true); }} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            {t("kbPermissions.addPermission")}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Select
          label={t("kbPermissions.filterByRole")}
          value={filterRoleId}
          onChange={(e) => setFilterRoleId(e.target.value)}
          options={[
            { value: "", label: t("common.all") },
            ...roles.map(r => ({ value: r.id, label: r.name }))
          ]}
        />
        <Select
          label={t("kbPermissions.filterByKb")}
          value={filterKbId}
          onChange={(e) => setFilterKbId(e.target.value)}
          options={[
            { value: "", label: t("common.all") },
            ...knowledgeBases.map(kb => ({ value: kb.id, label: kb.name }))
          ]}
        />
        {canManagePermissions && selectedPermissions.size > 0 && (
          <div className="flex items-end gap-2">
            <Button
              onClick={() => { setBatchAction("grant"); setShowBatchDialog(true); }}
              variant="secondary"
              size="sm"
            >
              {t("kbPermissions.grantSelected")} ({selectedPermissions.size})
            </Button>
            <Button
              onClick={() => { setBatchAction("delete"); setShowBatchDialog(true); }}
              variant="secondary"
              size="sm"
            >
              {t("kbPermissions.deleteSelected")}
            </Button>
          </div>
        )}
      </div>

      {/* Permissions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {canManagePermissions && (
                  <th className="px-6 py-3 text-left">
                    <Checkbox
                      checked={selectedPermissions.size === filteredPermissions.length && filteredPermissions.length > 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.checked ? selectAllPermissions() : clearSelection()}
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("kbPermissions.role")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("kbPermissions.knowledgeBase")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("kbPermissions.permissions")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={canManagePermissions ? 5 : 4} className="px-6 py-12 text-center text-gray-500">
                    {t("common.loading")}...
                  </td>
                </tr>
              ) : filteredPermissions.length === 0 ? (
                <tr>
                  <td colSpan={canManagePermissions ? 5 : 4} className="px-6 py-12 text-center text-gray-500">
                    {t("kbPermissions.noPermissions")}
                  </td>
                </tr>
              ) : (
                filteredPermissions.map((permission) => (
                  <tr key={permission.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    {canManagePermissions && (
                      <td className="px-6 py-4">
                        <Checkbox
                          checked={selectedPermissions.has(permission.id)}
                          onChange={() => togglePermissionSelection(permission.id)}
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Shield className="h-5 w-5 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {permission.role?.name}
                          </div>
                          {permission.role?.description && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {permission.role.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Database className="h-5 w-5 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {permission.knowledge_base?.name}
                          </div>
                          {permission.knowledge_base?.description && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {permission.knowledge_base.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        {permission.can_read && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            {t("kbPermissions.canRead")}
                          </span>
                        )}
                        {permission.can_ask && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {t("kbPermissions.canAsk")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {canManagePermissions && (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(permission)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePermission(permission)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Permission Dialog */}
      <Dialog
        open={showDialog}
        onClose={() => { setShowDialog(false); resetForm(); }}
        title={editingPermission ? t("kbPermissions.editPermission") : t("kbPermissions.addPermission")}
      >
        <div className="space-y-4">
          {formError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          <Select
            label={t("kbPermissions.selectRole")}
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            options={[
              { value: "", label: t("common.select") },
              ...roles.map(r => ({ value: r.id, label: r.name }))
            ]}
            disabled={!!editingPermission}
          />

          <Select
            label={t("kbPermissions.selectKnowledgeBase")}
            value={selectedKbId}
            onChange={(e) => setSelectedKbId(e.target.value)}
            options={[
              { value: "", label: t("common.select") },
              ...knowledgeBases.map(kb => ({ value: kb.id, label: kb.name }))
            ]}
            disabled={!!editingPermission}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("kbPermissions.permissions")}
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <Checkbox
                  checked={canRead}
                  onChange={(e) => setCanRead(e.target.checked)}
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  {t("kbPermissions.canRead")} - {t("kbPermissions.canReadDesc")}
                </span>
              </label>
              <label className="flex items-center">
                <Checkbox
                  checked={canAsk}
                  onChange={(e) => setCanAsk(e.target.checked)}
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  {t("kbPermissions.canAsk")} - {t("kbPermissions.canAskDesc")}
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => { setShowDialog(false); resetForm(); }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSavePermission}>
              {editingPermission ? t("common.save") : t("common.create")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Batch Operation Dialog */}
      <Dialog
        open={showBatchDialog}
        onClose={() => setShowBatchDialog(false)}
        title={t("kbPermissions.batchOperation")}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("kbPermissions.batchOperationDesc")} ({selectedPermissions.size})
          </p>

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowBatchDialog(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleBatchOperation}
              variant={batchAction === "delete" ? "danger" : "primary"}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}