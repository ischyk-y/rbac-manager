const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  rbac: {
    getOverview: () => ipcRenderer.invoke('rbac/getOverview'),
    getCatalogs: () => ipcRenderer.invoke('rbac/getCatalogs'),

    getUsers: (query) => ipcRenderer.invoke('rbac/getUsers', query),
    upsertUser: (payload) => ipcRenderer.invoke('rbac/upsertUser', payload),
    deleteUser: (payload) => ipcRenderer.invoke('rbac/deleteUser', payload),
    getUserAssignments: (payload) => ipcRenderer.invoke('rbac/getUserAssignments', payload),
    updateUserRoles: (payload) => ipcRenderer.invoke('rbac/updateUserRoles', payload),
    updateUserGroups: (payload) => ipcRenderer.invoke('rbac/updateUserGroups', payload),
    previewEffectivePermissions: (payload) => ipcRenderer.invoke('rbac/previewEffectivePermissions', payload),

    getRoles: () => ipcRenderer.invoke('rbac/getRoles'),
    upsertRole: (payload) => ipcRenderer.invoke('rbac/upsertRole', payload),

    getGroups: () => ipcRenderer.invoke('rbac/getGroups'),
    upsertGroup: (payload) => ipcRenderer.invoke('rbac/upsertGroup', payload),
    getGroupAssignments: (payload) => ipcRenderer.invoke('rbac/getGroupAssignments', payload),
    updateGroupRoles: (payload) => ipcRenderer.invoke('rbac/updateGroupRoles', payload),
    updateGroupMembers: (payload) => ipcRenderer.invoke('rbac/updateGroupMembers', payload),

    getMatrixData: () => ipcRenderer.invoke('rbac/getMatrixData'),
    updateRoleResourcePermissions: (payload) => ipcRenderer.invoke('rbac/updateRoleResourcePermissions', payload),

    getAuditLogs: (query) => ipcRenderer.invoke('rbac/getAuditLogs', query),
    exportAuditLogs: (payload) => ipcRenderer.invoke('rbac/exportAuditLogs', payload)
  },
  native: {
    notify: (payload) => ipcRenderer.invoke('native/notify', payload)
  }
});
