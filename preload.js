const { contextBridge, ipcRenderer } = require('electron');

const rawDebugDelay = Number(process.env.DEBUG_DELAY_MS || 0);
const DEBUG_DELAY_MS = Number.isFinite(rawDebugDelay) && rawDebugDelay > 0 ? rawDebugDelay : 0;
const DEBUG_FORCE_ERROR = String(process.env.DEBUG_FORCE_ERROR || '') === '1';
const DEBUG_FORCE_ERROR_CHANNELS = new Set(
  String(process.env.DEBUG_FORCE_ERROR_CHANNELS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const invoke = async (...args) => {
  const channel = String(args[0] || '');
  const shouldForceError = DEBUG_FORCE_ERROR || DEBUG_FORCE_ERROR_CHANNELS.has(channel);
  if (shouldForceError) {
    throw new Error(`Debug forced IPC error: ${channel || 'unknown-channel'}`);
  }
  if (DEBUG_DELAY_MS > 0) await wait(DEBUG_DELAY_MS);
  return ipcRenderer.invoke(...args);
};

contextBridge.exposeInMainWorld('api', {
  rbac: {
    getOverview: () => invoke('rbac/getOverview'),
    getCatalogs: () => invoke('rbac/getCatalogs'),

    getUsers: (query) => invoke('rbac/getUsers', query),
    upsertUser: (payload) => invoke('rbac/upsertUser', payload),
    deleteUser: (payload) => invoke('rbac/deleteUser', payload),
    getUserAssignments: (payload) => invoke('rbac/getUserAssignments', payload),
    updateUserRoles: (payload) => invoke('rbac/updateUserRoles', payload),
    updateUserGroups: (payload) => invoke('rbac/updateUserGroups', payload),
    previewEffectivePermissions: (payload) => invoke('rbac/previewEffectivePermissions', payload),

    getRoles: () => invoke('rbac/getRoles'),
    upsertRole: (payload) => invoke('rbac/upsertRole', payload),

    getGroups: () => invoke('rbac/getGroups'),
    upsertGroup: (payload) => invoke('rbac/upsertGroup', payload),
    getGroupAssignments: (payload) => invoke('rbac/getGroupAssignments', payload),
    updateGroupRoles: (payload) => invoke('rbac/updateGroupRoles', payload),
    updateGroupMembers: (payload) => invoke('rbac/updateGroupMembers', payload),

    getMatrixData: () => invoke('rbac/getMatrixData'),
    updateRoleResourcePermissions: (payload) => invoke('rbac/updateRoleResourcePermissions', payload),

    getAuditLogs: (query) => invoke('rbac/getAuditLogs', query),
    exportAuditLogs: (payload) => invoke('rbac/exportAuditLogs', payload),
    exportUsersCsv: (payload) => invoke('rbac/exportUsersCsv', payload),
    importUsersCsv: (payload) => invoke('rbac/importUsersCsv', payload)
  },
  native: {
    notify: (payload) => invoke('native/notify', payload)
  }
});
