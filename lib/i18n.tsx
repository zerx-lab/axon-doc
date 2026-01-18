"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Locale = "zh" | "en";

interface Translations {
  [key: string]: {
    zh: string;
    en: string;
  };
}

// All translations
const translations: Translations = {
  // Navigation
  "nav.overview": { zh: "概览", en: "Overview" },
  "nav.users": { zh: "用户", en: "Users" },
  "nav.roles": { zh: "角色", en: "Roles" },
  "nav.knowledgeBases": { zh: "知识库", en: "Knowledge Bases" },
  "nav.settings": { zh: "设置", en: "Settings" },

  // Auth
  "auth.signOut": { zh: "退出登录", en: "Sign Out" },
  "auth.signIn": { zh: "登录", en: "Sign In" },
  "auth.username": { zh: "用户名", en: "Username" },
  "auth.password": { zh: "密码", en: "Password" },
  "auth.loading": { zh: "加载中", en: "Loading" },
  "auth.signingIn": { zh: "登录中...", en: "Signing in..." },
  "auth.invalidCredentials": { zh: "用户名或密码错误", en: "Invalid credentials" },
  "auth.enterUsername": { zh: "请输入用户名", en: "Enter username" },
  "auth.enterPassword": { zh: "请输入密码", en: "Enter password" },
  "auth.securePortal": { zh: "安全访问入口", en: "Secure Access Portal" },
  "auth.connectionFailed": { zh: "连接失败，请重试", en: "Connection failed. Please try again." },

  // Roles
  "role.super_admin": { zh: "超级管理员", en: "Super Admin" },
  "role.admin": { zh: "管理员", en: "Admin" },
  "role.user": { zh: "用户", en: "User" },

  // Dashboard
  "dashboard.title": { zh: "仪表盘", en: "Dashboard" },
  "dashboard.welcome": { zh: "欢迎回来", en: "Welcome back" },
  "dashboard.overview": { zh: "概览", en: "Overview" },
  "dashboard.quickActions": { zh: "快捷操作", en: "Quick Actions" },
  "dashboard.recentActivity": { zh: "最近活动", en: "Recent Activity" },
  "dashboard.sessionStarted": { zh: "会话已开始", en: "Session started" },
  "dashboard.systemInitialized": { zh: "系统已初始化", en: "System initialized" },
  "dashboard.welcomeToAxonBase": { zh: "欢迎使用 AxonBase", en: "Welcome to AxonBase" },
  "dashboard.justNow": { zh: "刚刚", en: "Just now" },

  // Greetings
  "greeting.morning": { zh: "早上好", en: "Good morning" },
  "greeting.afternoon": { zh: "下午好", en: "Good afternoon" },
  "greeting.evening": { zh: "晚上好", en: "Good evening" },

  // Stats
  "stats.totalUsers": { zh: "用户总数", en: "Total Users" },
  "stats.activeSessions": { zh: "活跃会话", en: "Active Sessions" },
  "stats.systemStatus": { zh: "系统状态", en: "System Status" },
  "stats.uptime": { zh: "运行时间", en: "Uptime" },
  "stats.online": { zh: "在线", en: "Online" },

  // Actions
  "action.manageUsers": { zh: "管理用户", en: "Manage Users" },
  "action.manageUsersDesc": { zh: "添加、编辑或删除用户账户", en: "Add, edit, or remove user accounts" },
  "action.systemSettings": { zh: "系统设置", en: "System Settings" },
  "action.systemSettingsDesc": { zh: "配置应用程序偏好设置", en: "Configure application preferences" },
  "action.viewLogs": { zh: "查看日志", en: "View Logs" },
  "action.viewLogsDesc": { zh: "监控系统活动", en: "Monitor system activity" },

  // Settings
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.language": { zh: "语言", en: "Language" },
  "settings.theme": { zh: "主题", en: "Theme" },
  "settings.themeLight": { zh: "亮色", en: "Light" },
  "settings.themeDark": { zh: "暗色", en: "Dark" },
  "settings.embeddingModel": { zh: "向量模型配置", en: "Embedding Model Configuration" },
  "settings.provider": { zh: "服务提供商", en: "Provider" },
  "settings.provider_openai": { zh: "OpenAI", en: "OpenAI" },
  "settings.provider_azure": { zh: "Azure OpenAI", en: "Azure OpenAI" },
  "settings.provider_aliyun": { zh: "阿里云", en: "Alibaba Cloud" },
  "settings.provider_local": { zh: "本地模型", en: "Local Model" },
  "settings.baseUrl": { zh: "API 地址", en: "API Base URL" },
  "settings.apiKey": { zh: "API 密钥", en: "API Key" },
  "settings.apiKeyPlaceholder": { zh: "输入 API 密钥", en: "Enter API Key" },
  "settings.modelName": { zh: "模型名称", en: "Model Name" },
  "settings.dimensions": { zh: "向量维度", en: "Dimensions" },
  "settings.batchSize": { zh: "批处理大小", en: "Batch Size" },
  "settings.chunkSize": { zh: "分块大小", en: "Chunk Size" },
  "settings.chunkOverlap": { zh: "分块重叠", en: "Chunk Overlap" },
  "settings.saveSuccess": { zh: "设置已保存", en: "Settings saved" },
  "settings.saveFailed": { zh: "保存失败", en: "Save failed" },
  "settings.testEmbedding": { zh: "测试", en: "Test" },
  "settings.testing": { zh: "测试中...", en: "Testing..." },
  "settings.testText": { zh: "测试文本", en: "Test Text" },
  "settings.testTextPlaceholder": { zh: "输入要测试的文本内容", en: "Enter text to test embedding" },
  "settings.testResult": { zh: "测试结果", en: "Test Result" },
  "settings.testSuccess": { zh: "测试成功", en: "Test successful" },
  "settings.testFailed": { zh: "测试失败", en: "Test failed" },
  "settings.vectorDimensions": { zh: "向量维度", en: "Vector Dimensions" },
  "settings.responseTime": { zh: "响应时间", en: "Response Time" },
  "settings.vectorPreview": { zh: "向量预览 (前10维)", en: "Vector Preview (first 10 dims)" },

  "settings.contextualRetrieval": { zh: "上下文增强", en: "Contextual Retrieval" },
  "settings.contextualRetrievalDesc": { zh: "使用 AI 聊天模型为每个分块生成上下文摘要，提升检索准确率 35-67%", en: "Use AI chat model to generate context for each chunk, improving retrieval accuracy by 35-67%" },
  "settings.contextualRetrievalNote": { zh: "启用后将使用 AI 聊天模型配置来生成上下文，会增加向量化时间和 API 调用成本", en: "When enabled, uses AI Chat Model settings to generate context. This increases embedding time and API costs." },

  "settings.recallTest": { zh: "召回测试", en: "Recall Test" },
  "settings.recallTestDesc": { zh: "测试向量模型的语义理解能力", en: "Test semantic understanding of the embedding model" },
  "settings.recallQuery": { zh: "查询文本", en: "Query Text" },
  "settings.recallQueryPlaceholder": { zh: "输入查询内容", en: "Enter query text" },
  "settings.candidateTexts": { zh: "候选文本", en: "Candidate Texts" },
  "settings.candidatePlaceholder": { zh: "输入候选文本", en: "Enter candidate text" },
  "settings.addCandidate": { zh: "添加候选", en: "Add Candidate" },
  "settings.removeCandidate": { zh: "移除", en: "Remove" },
  "settings.testRecall": { zh: "测试召回", en: "Test Recall" },
  "settings.recallTesting": { zh: "计算中...", en: "Computing..." },
  "settings.recallTestSuccess": { zh: "召回测试完成", en: "Recall test completed" },
  "settings.recallTestFailed": { zh: "召回测试失败", en: "Recall test failed" },
  "settings.similarity": { zh: "相似度", en: "Similarity" },
  "settings.rank": { zh: "排名", en: "Rank" },
  "settings.minCandidates": { zh: "至少需要1个候选文本", en: "At least 1 candidate text required" },

  "settings.chatModelConfig": { zh: "AI 聊天模型配置", en: "AI Chat Model Configuration" },
  "settings.chatProvider": { zh: "服务提供商", en: "Provider" },
  "settings.chatProvider_openai": { zh: "OpenAI", en: "OpenAI" },
  "settings.chatProvider_anthropic": { zh: "Anthropic", en: "Anthropic" },
  "settings.chatProvider_openai-compatible": { zh: "OpenAI 兼容", en: "OpenAI Compatible" },
  "settings.chatBaseUrl": { zh: "API 地址", en: "API Base URL" },
  "settings.chatApiKey": { zh: "API 密钥", en: "API Key" },
  "settings.chatModelName": { zh: "模型名称", en: "Model Name" },
  "settings.chatMaxTokens": { zh: "最大 Token 数", en: "Max Tokens" },
  "settings.chatTemperature": { zh: "温度 (Temperature)", en: "Temperature" },
  "settings.testChat": { zh: "测试", en: "Test" },
  "settings.testChatting": { zh: "测试中...", en: "Testing..." },
  "settings.testMessage": { zh: "测试消息", en: "Test Message" },
  "settings.testMessagePlaceholder": { zh: "输入要测试的消息内容", en: "Enter message to test" },
  "settings.chatTestSuccess": { zh: "测试成功", en: "Test successful" },
  "settings.chatTestFailed": { zh: "测试失败", en: "Test failed" },
  "settings.chatResponse": { zh: "AI 回复", en: "AI Response" },
  "settings.chatResponseTime": { zh: "响应时间", en: "Response Time" },
  "settings.chatTokenUsage": { zh: "Token 用量", en: "Token Usage" },
  "settings.inputTokens": { zh: "输入", en: "Input" },
  "settings.outputTokens": { zh: "输出", en: "Output" },

  // Common
  "common.loading": { zh: "加载中", en: "Loading" },
  "common.redirecting": { zh: "跳转中", en: "Redirecting" },
  "common.error": { zh: "错误", en: "Error" },
  "common.save": { zh: "保存", en: "Save" },
  "common.saving": { zh: "保存中...", en: "Saving..." },
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.confirm": { zh: "确认", en: "Confirm" },
  "common.delete": { zh: "删除", en: "Delete" },
  "common.edit": { zh: "编辑", en: "Edit" },
  "common.create": { zh: "创建", en: "Create" },
  "common.search": { zh: "搜索", en: "Search" },
  "common.user": { zh: "用户", en: "User" },
  "common.actions": { zh: "操作", en: "Actions" },
  "common.status": { zh: "状态", en: "Status" },
  "common.active": { zh: "已启用", en: "Active" },
  "common.inactive": { zh: "已禁用", en: "Inactive" },
  "common.noData": { zh: "暂无数据", en: "No data" },
  "common.loadMore": { zh: "加载更多", en: "Load more" },
  "common.close": { zh: "关闭", en: "Close" },

  // User Management
  "users.title": { zh: "用户管理", en: "User Management" },
  "users.createUser": { zh: "创建用户", en: "Create User" },
  "users.editUser": { zh: "编辑用户", en: "Edit User" },
  "users.deleteUser": { zh: "删除用户", en: "Delete User" },
  "users.resetPassword": { zh: "重置密码", en: "Reset Password" },
  "users.toggleActive": { zh: "切换状态", en: "Toggle Status" },
  "users.username": { zh: "用户名", en: "Username" },
  "users.displayName": { zh: "显示名称", en: "Display Name" },
  "users.level": { zh: "用户级别", en: "User Level" },
  "users.role": { zh: "角色", en: "Role" },
  "users.lastLogin": { zh: "最后登录", en: "Last Login" },
  "users.createdAt": { zh: "创建时间", en: "Created At" },
  "users.confirmDelete": { zh: "确定要删除此用户吗？此操作无法撤销。", en: "Are you sure you want to delete this user? This action cannot be undone." },
  "users.confirmDisable": { zh: "确定要禁用此用户吗？", en: "Are you sure you want to disable this user?" },
  "users.confirmEnable": { zh: "确定要启用此用户吗？", en: "Are you sure you want to enable this user?" },
  "users.newPassword": { zh: "新密码", en: "New Password" },
  "users.noRole": { zh: "无角色", en: "No Role" },
  "users.noRoleOptional": { zh: "无需角色", en: "No role needed" },
  "users.roleRequired": { zh: "请选择角色", en: "Please select a role" },
  "users.searchPlaceholder": { zh: "搜索用户名或显示名称...", en: "Search username or display name..." },

  // Role Management
  "roles.title": { zh: "角色管理", en: "Role Management" },
  "roles.createRole": { zh: "创建角色", en: "Create Role" },
  "roles.editRole": { zh: "编辑角色", en: "Edit Role" },
  "roles.deleteRole": { zh: "删除角色", en: "Delete Role" },
  "roles.name": { zh: "角色名称", en: "Role Name" },
  "roles.description": { zh: "角色描述", en: "Description" },
  "roles.permissions": { zh: "权限", en: "Permissions" },
  "roles.systemRole": { zh: "系统角色", en: "System Role" },
  "roles.customRole": { zh: "自定义角色", en: "Custom Role" },
  "roles.confirmDelete": { zh: "确定要删除此角色吗？此操作无法撤销。", en: "Are you sure you want to delete this role? This action cannot be undone." },
  "roles.cannotDeleteSystem": { zh: "系统角色无法删除", en: "System roles cannot be deleted" },
  "roles.cannotDeleteInUse": { zh: "该角色正在被使用，无法删除", en: "This role is in use and cannot be deleted" },

  // Permission categories
  "permission.category.users": { zh: "用户管理", en: "User Management" },
  "permission.category.roles": { zh: "角色管理", en: "Role Management" },
  "permission.category.system": { zh: "系统设置", en: "System Settings" },

  // Permission names
  "permission.users.list": { zh: "查看用户列表", en: "View User List" },
  "permission.users.list.desc": { zh: "允许查看所有用户", en: "Allow viewing all users" },
  "permission.users.create": { zh: "创建用户", en: "Create User" },
  "permission.users.create.desc": { zh: "允许创建新用户", en: "Allow creating new users" },
  "permission.users.update": { zh: "编辑用户", en: "Edit User" },
  "permission.users.update.desc": { zh: "允许编辑用户信息", en: "Allow editing user information" },
  "permission.users.delete": { zh: "删除用户", en: "Delete User" },
  "permission.users.delete.desc": { zh: "允许删除用户", en: "Allow deleting users" },
  "permission.users.toggleActive": { zh: "禁用/启用用户", en: "Toggle User Status" },
  "permission.users.toggleActive.desc": { zh: "允许启用或禁用用户账户", en: "Allow enabling or disabling user accounts" },
  "permission.users.resetPassword": { zh: "重置密码", en: "Reset Password" },
  "permission.users.resetPassword.desc": { zh: "允许重置用户密码", en: "Allow resetting user passwords" },
  "permission.roles.list": { zh: "查看角色列表", en: "View Role List" },
  "permission.roles.list.desc": { zh: "允许查看所有角色", en: "Allow viewing all roles" },
  "permission.roles.create": { zh: "创建角色", en: "Create Role" },
  "permission.roles.create.desc": { zh: "允许创建新角色", en: "Allow creating new roles" },
  "permission.roles.update": { zh: "编辑角色", en: "Edit Role" },
  "permission.roles.update.desc": { zh: "允许编辑角色权限", en: "Allow editing role permissions" },
  "permission.roles.delete": { zh: "删除角色", en: "Delete Role" },
  "permission.roles.delete.desc": { zh: "允许删除自定义角色", en: "Allow deleting custom roles" },
  "permission.system.settings": { zh: "系统设置", en: "System Settings" },
  "permission.system.settings.desc": { zh: "允许访问系统设置", en: "Allow access to system settings" },
  "permission.system.logs": { zh: "查看日志", en: "View Logs" },
  "permission.system.logs.desc": { zh: "允许查看系统日志", en: "Allow viewing system logs" },

  // Error messages
  "error.accessDenied": { zh: "访问被拒绝", en: "Access Denied" },
  "error.noPermission": { zh: "您没有权限访问此页面", en: "You don't have permission to access this page" },
  "error.permissionDenied": { zh: "权限不足", en: "Permission denied" },
  "error.userNotFound": { zh: "用户不存在", en: "User not found" },
  "error.roleNotFound": { zh: "角色不存在", en: "Role not found" },
  "error.usernameExists": { zh: "用户名已存在", en: "Username already exists" },
  "error.roleNameExists": { zh: "角色名称已存在", en: "Role name already exists" },
  "error.cannotDeleteSelf": { zh: "无法删除自己的账户", en: "Cannot delete your own account" },
  "error.cannotDisableSelf": { zh: "无法禁用自己的账户", en: "Cannot disable your own account" },
  "error.createUserFailed": { zh: "创建用户失败", en: "Failed to create user" },
  "error.updateUserFailed": { zh: "更新用户失败", en: "Failed to update user" },
  "error.resetPasswordFailed": { zh: "重置密码失败", en: "Failed to reset password" },
  "error.deleteUserFailed": { zh: "删除用户失败", en: "Failed to delete user" },
  "error.createRoleFailed": { zh: "创建角色失败", en: "Failed to create role" },
  "error.updateRoleFailed": { zh: "更新角色失败", en: "Failed to update role" },
  "error.deleteRoleFailed": { zh: "删除角色失败", en: "Failed to delete role" },

  // Validation messages
  "validation.roleNameRequired": { zh: "角色名称不能为空", en: "Role name is required" },

  // Common (additional)
  "common.role": { zh: "角色", en: "Role" },
  "common.optional": { zh: "可选", en: "optional" },
  "common.import": { zh: "导入", en: "Import" },
  "common.export": { zh: "导出", en: "Export" },
  "common.preview": { zh: "预览", en: "Preview" },
  "common.download": { zh: "下载", en: "Download" },
  "common.upload": { zh: "上传", en: "Upload" },
  "common.content": { zh: "内容", en: "Content" },
  "common.title": { zh: "标题", en: "Title" },
  "common.description": { zh: "描述", en: "Description" },
  "common.name": { zh: "名称", en: "Name" },
  "common.type": { zh: "类型", en: "Type" },
  "common.size": { zh: "大小", en: "Size" },
  "common.words": { zh: "字数", en: "Words" },
  "common.chars": { zh: "字符", en: "Characters" },
  "common.back": { zh: "返回", en: "Back" },
  "common.view": { zh: "查看", en: "View" },
  "common.add": { zh: "添加", en: "Add" },
  "common.createdAt": { zh: "创建时间", en: "Created At" },

  // Knowledge Base Management
  "kb.title": { zh: "知识库管理", en: "Knowledge Base Management" },
  "kb.create": { zh: "创建知识库", en: "Create Knowledge Base" },
  "kb.edit": { zh: "编辑知识库", en: "Edit Knowledge Base" },
  "kb.delete": { zh: "删除知识库", en: "Delete Knowledge Base" },
  "kb.name": { zh: "知识库名称", en: "Knowledge Base Name" },
  "kb.description": { zh: "知识库描述", en: "Description" },
  "kb.documentCount": { zh: "文档数量", en: "Document Count" },
  "kb.createdAt": { zh: "创建时间", en: "Created At" },
  "kb.updatedAt": { zh: "更新时间", en: "Updated At" },
  "kb.confirmDelete": { zh: "确定要删除此知识库吗？所有关联文档将被一并删除，此操作无法撤销。", en: "Are you sure you want to delete this knowledge base? All associated documents will be deleted. This action cannot be undone." },
  "kb.noData": { zh: "暂无知识库，点击上方按钮创建", en: "No knowledge bases yet. Click the button above to create one." },
  "kb.namePlaceholder": { zh: "请输入知识库名称", en: "Enter knowledge base name" },
  "kb.descriptionPlaceholder": { zh: "请输入知识库描述（可选）", en: "Enter description (optional)" },
  "kb.viewDocuments": { zh: "查看文档", en: "View Documents" },
  "kb.searchPlaceholder": { zh: "搜索知识库...", en: "Search knowledge bases..." },
  "kb.nameRequired": { zh: "知识库名称不能为空", en: "Knowledge base name is required" },
  "kb.knowledgeBase": { zh: "知识库", en: "knowledge base" },

  // Document Management
  "docs.title": { zh: "文档管理", en: "Document Management" },
  "docs.create": { zh: "添加文档", en: "Add Document" },
  "docs.import": { zh: "导入 Markdown", en: "Import Markdown" },
  "docs.edit": { zh: "编辑文档", en: "Edit Document" },
  "docs.delete": { zh: "删除文档", en: "Delete Document" },
  "docs.preview": { zh: "预览文档", en: "Preview Document" },
  "docs.docTitle": { zh: "文档标题", en: "Document Title" },
  "docs.content": { zh: "文档内容", en: "Document Content" },
  "docs.wordCount": { zh: "字数统计", en: "Word Count" },
  "docs.charCount": { zh: "字符统计", en: "Character Count" },
  "docs.fileType": { zh: "文件类型", en: "File Type" },
  "docs.status": { zh: "状态", en: "Status" },
  "docs.statusActive": { zh: "正常", en: "Active" },
  "docs.statusArchived": { zh: "已归档", en: "Archived" },
  "docs.confirmDelete": { zh: "确定要删除此文档吗？此操作无法撤销。", en: "Are you sure you want to delete this document? This action cannot be undone." },
  "docs.noData": { zh: "暂无文档，点击上方按钮添加", en: "No documents yet. Click the button above to add one." },
  "docs.titlePlaceholder": { zh: "请输入文档标题", en: "Enter document title" },
  "docs.contentPlaceholder": { zh: "请输入 Markdown 内容...", en: "Enter Markdown content..." },
  "docs.backToKb": { zh: "返回知识库", en: "Back to Knowledge Bases" },
  "docs.importSuccess": { zh: "文档导入成功", en: "Document imported successfully" },
  "docs.importError": { zh: "文档导入失败", en: "Failed to import document" },
  "docs.searchPlaceholder": { zh: "搜索文档...", en: "Search documents..." },
  "docs.document": { zh: "文档", en: "Document" },
  "docs.titleRequired": { zh: "文档标题不能为空", en: "Document title is required" },

  // Permission categories (Knowledge Base)
  "permission.category.kb": { zh: "知识库管理", en: "Knowledge Base Management" },
  "permission.category.docs": { zh: "文档管理", en: "Document Management" },

  // Permission names (Knowledge Base)
  "permission.kb.list": { zh: "查看知识库列表", en: "View Knowledge Base List" },
  "permission.kb.list.desc": { zh: "允许查看所有知识库", en: "Allow viewing all knowledge bases" },
  "permission.kb.create": { zh: "创建知识库", en: "Create Knowledge Base" },
  "permission.kb.create.desc": { zh: "允许创建新知识库", en: "Allow creating new knowledge bases" },
  "permission.kb.update": { zh: "编辑知识库", en: "Edit Knowledge Base" },
  "permission.kb.update.desc": { zh: "允许编辑知识库信息", en: "Allow editing knowledge base information" },
  "permission.kb.delete": { zh: "删除知识库", en: "Delete Knowledge Base" },
  "permission.kb.delete.desc": { zh: "允许删除知识库", en: "Allow deleting knowledge bases" },

  // Permission names (Documents)
  "permission.docs.list": { zh: "查看文档列表", en: "View Document List" },
  "permission.docs.list.desc": { zh: "允许查看所有文档", en: "Allow viewing all documents" },
  "permission.docs.create": { zh: "创建文档", en: "Create Document" },
  "permission.docs.create.desc": { zh: "允许创建新文档", en: "Allow creating new documents" },
  "permission.docs.update": { zh: "编辑文档", en: "Edit Document" },
  "permission.docs.update.desc": { zh: "允许编辑文档内容", en: "Allow editing document content" },
  "permission.docs.delete": { zh: "删除文档", en: "Delete Document" },
  "permission.docs.delete.desc": { zh: "允许删除文档", en: "Allow deleting documents" },

  // Error messages (Knowledge Base)
  "error.kbNotFound": { zh: "知识库不存在", en: "Knowledge base not found" },
  "error.docNotFound": { zh: "文档不存在", en: "Document not found" },
  "error.kbNameExists": { zh: "知识库名称已存在", en: "Knowledge base name already exists" },
  "error.createKbFailed": { zh: "创建知识库失败", en: "Failed to create knowledge base" },
  "error.updateKbFailed": { zh: "更新知识库失败", en: "Failed to update knowledge base" },
  "error.deleteKbFailed": { zh: "删除知识库失败", en: "Failed to delete knowledge base" },
  "error.createDocFailed": { zh: "创建文档失败", en: "Failed to create document" },
  "error.updateDocFailed": { zh: "更新文档失败", en: "Failed to update document" },
  "error.deleteDocFailed": { zh: "删除文档失败", en: "Failed to delete document" },
  "error.createFailed": { zh: "创建失败", en: "Failed to create" },
  "error.updateFailed": { zh: "更新失败", en: "Failed to update" },
  "error.deleteFailed": { zh: "删除失败", en: "Failed to delete" },

  // Embedding / Vectorization
  "embedding.title": { zh: "向量化管理", en: "Embedding Management" },
  "embedding.status": { zh: "向量化状态", en: "Embedding Status" },
  "embedding.pending": { zh: "待处理", en: "Pending" },
  "embedding.processing": { zh: "处理中", en: "Processing" },
  "embedding.completed": { zh: "已完成", en: "Completed" },
  "embedding.failed": { zh: "失败", en: "Failed" },
  "embedding.outdated": { zh: "需更新", en: "Outdated" },
  "embedding.embed": { zh: "向量化", en: "Embed" },
  "embedding.embedDocument": { zh: "向量化文档", en: "Embed Document" },
  "embedding.embedAll": { zh: "批量向量化", en: "Embed All" },
  "embedding.deleteEmbedding": { zh: "删除向量", en: "Delete Embedding" },
  "embedding.deleteAllEmbeddings": { zh: "删除所有向量", en: "Delete All Embeddings" },
  "embedding.reEmbed": { zh: "重新向量化", en: "Re-embed" },
  "embedding.confirmDelete": { zh: "确定要删除此文档的向量数据吗？", en: "Are you sure you want to delete the embedding for this document?" },
  "embedding.confirmDeleteAll": { zh: "确定要删除此知识库的所有向量数据吗？", en: "Are you sure you want to delete all embeddings for this knowledge base?" },
  "embedding.embedSuccess": { zh: "向量化成功", en: "Embedding successful" },
  "embedding.embedFailed": { zh: "向量化失败", en: "Embedding failed" },
  "embedding.deleteSuccess": { zh: "删除成功", en: "Delete successful" },
  "embedding.deleteFailed": { zh: "删除失败", en: "Delete failed" },
  "embedding.chunkCount": { zh: "分块数量", en: "Chunk Count" },
  "embedding.totalChunks": { zh: "总分块数", en: "Total Chunks" },
  "embedding.embeddedDocs": { zh: "已向量化文档", en: "Embedded Documents" },
  "embedding.pendingDocs": { zh: "待处理文档", en: "Pending Documents" },
  "embedding.failedDocs": { zh: "失败文档", en: "Failed Documents" },
  "embedding.outdatedDocs": { zh: "需更新文档", en: "Outdated Documents" },
  "embedding.noApiKey": { zh: "未配置 OpenAI API Key", en: "OpenAI API Key not configured" },
  "embedding.processing...": { zh: "向量化处理中...", en: "Processing embeddings..." },

  // Embedding Settings
  "embedding.settings": { zh: "向量化设置", en: "Embedding Settings" },
  "embedding.model": { zh: "嵌入模型", en: "Embedding Model" },
  "embedding.provider": { zh: "服务提供商", en: "Provider" },
  "embedding.dimensions": { zh: "向量维度", en: "Dimensions" },
  "embedding.chunkSize": { zh: "分块大小", en: "Chunk Size" },
  "embedding.chunkOverlap": { zh: "分块重叠", en: "Chunk Overlap" },
  "embedding.tokens": { zh: "tokens", en: "tokens" },

  // Semantic Search
  "search.semantic": { zh: "语义搜索", en: "Semantic Search" },
  "search.placeholder": { zh: "输入搜索内容...", en: "Enter search query..." },
  "search.noResults": { zh: "未找到相关结果", en: "No results found" },
  "search.similarity": { zh: "相似度", en: "Similarity" },
  "search.matchedChunks": { zh: "匹配片段", en: "Matched Chunks" },

  // Permission names (Embedding)
  "permission.category.embedding": { zh: "向量化管理", en: "Embedding Management" },
  "permission.embedding.view": { zh: "查看向量化状态", en: "View Embedding Status" },
  "permission.embedding.view.desc": { zh: "允许查看文档向量化状态", en: "Allow viewing document embedding status" },
  "permission.embedding.manage": { zh: "管理向量化", en: "Manage Embeddings" },
  "permission.embedding.manage.desc": { zh: "允许执行向量化和删除操作", en: "Allow embedding and deletion operations" },
  "permission.embedding.search": { zh: "语义搜索", en: "Semantic Search" },
  "permission.embedding.search.desc": { zh: "允许使用语义搜索功能", en: "Allow using semantic search functionality" },

  // Error messages (Embedding)
  "error.embedFailed": { zh: "向量化失败", en: "Embedding failed" },
  "error.searchFailed": { zh: "搜索失败", en: "Search failed" },
  "error.deleteEmbeddingFailed": { zh: "删除向量失败", en: "Failed to delete embedding" },

  // Document Test
  "docTest.test": { zh: "测试", en: "Test" },
  "docTest.testing": { zh: "测试中...", en: "Testing..." },
  "docTest.send": { zh: "发送", en: "Send" },
  "docTest.queryPlaceholder": { zh: "输入问题来测试文档...", en: "Enter a question to test the document..." },
  "docTest.aiAnswer": { zh: "AI 回答", en: "AI Answer" },
  "docTest.matchedChunks": { zh: "匹配的文档片段", en: "Matched Document Chunks" },
  "docTest.fragment": { zh: "片段", en: "Fragment" },
  "docTest.noChunksFound": { zh: "未找到相关的文档片段", en: "No relevant document chunks found" },
  "docTest.enterQueryHint": { zh: "输入问题并点击发送来测试文档", en: "Enter a question and click send to test the document" },
  "docTest.testFailed": { zh: "测试失败", en: "Test failed" },
  "docTest.streaming": { zh: "生成中...", en: "Generating..." },

  // Task Queue
  "task.title": { zh: "任务队列", en: "Task Queue" },
  "task.noTasks": { zh: "暂无任务", en: "No tasks" },
  "task.cancel": { zh: "取消", en: "Cancel" },
  "task.clearCompleted": { zh: "清除已完成", en: "Clear completed" },
  "task.addedToQueue": { zh: "已添加到任务队列", en: "Added to task queue" },
  "task.status.pending": { zh: "等待中", en: "Pending" },
  "task.status.running": { zh: "执行中", en: "Running" },
  "task.status.completed": { zh: "已完成", en: "Completed" },
  "task.status.failed": { zh: "失败", en: "Failed" },
  "task.status.cancelled": { zh: "已取消", en: "Cancelled" },
  "task.embedDocument": { zh: "向量化文档", en: "Embed document" },
  "task.embedKnowledgeBase": { zh: "批量向量化知识库", en: "Batch embed knowledge base" },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const LOCALE_STORAGE_KEY = "axon_locale";

// Store for locale state
let localeListeners: Array<() => void> = [];
let currentLocale: Locale = "zh";

function getLocaleSnapshot(): Locale {
  return currentLocale;
}

function getLocaleServerSnapshot(): Locale {
  return "zh";
}

function subscribeLocale(callback: () => void): () => void {
  localeListeners.push(callback);
  return () => {
    localeListeners = localeListeners.filter((l) => l !== callback);
  };
}

function setLocaleValue(newLocale: Locale) {
  currentLocale = newLocale;
  if (typeof window !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
  }
  localeListeners.forEach((l) => l());
}

// Initialize from localStorage on client
if (typeof window !== "undefined") {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (stored && (stored === "zh" || stored === "en")) {
    currentLocale = stored;
  }
}

interface I18nProviderProps {
  readonly children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocaleSnapshot,
    getLocaleServerSnapshot
  );

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleValue(newLocale);
  }, []);

  const t = useCallback(
    (key: string): string => {
      const translation = translations[key];
      if (!translation) {
        console.warn(`Missing translation: ${key}`);
        return key;
      }
      return translation[locale];
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}

export function useTranslation() {
  const { t } = useI18n();
  return t;
}
