const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;

const RESOURCE_SEED = [
  { resource_key: 'users', label: 'Users' },
  { resource_key: 'projects', label: 'Projects' },
  { resource_key: 'billing', label: 'Billing' },
  { resource_key: 'reports', label: 'Reports' },
  { resource_key: 'settings', label: 'Settings' }
];

const PERMISSION_SEED = [
  { permission_key: 'view', label: 'View', risk_level: 'low' },
  { permission_key: 'create', label: 'Create', risk_level: 'medium' },
  { permission_key: 'update', label: 'Update', risk_level: 'medium' },
  { permission_key: 'delete', label: 'Delete', risk_level: 'high' },
  { permission_key: 'assign', label: 'Assign', risk_level: 'high' },
  { permission_key: 'approve', label: 'Approve', risk_level: 'critical' }
];

const ROLE_PRESETS = [
  {
    name: 'Owner',
    description: 'Full control over all resources.',
    priority: 100,
    is_system: 1,
    rules: {
      '*': ['view', 'create', 'update', 'delete', 'assign', 'approve']
    }
  },
  {
    name: 'Security Admin',
    description: 'Manages identities, role assignments, and security settings.',
    priority: 90,
    is_system: 1,
    rules: {
      users: ['view', 'create', 'update', 'assign'],
      settings: ['view', 'update'],
      reports: ['view']
    }
  },
  {
    name: 'Finance Manager',
    description: 'Handles billing workflows and finance reports.',
    priority: 70,
    is_system: 1,
    rules: {
      billing: ['view', 'update', 'approve'],
      reports: ['view', 'create'],
      projects: ['view']
    }
  },
  {
    name: 'Support Operator',
    description: 'Supports users and operational incidents.',
    priority: 50,
    is_system: 1,
    rules: {
      users: ['view', 'update'],
      projects: ['view', 'update'],
      reports: ['view']
    }
  },
  {
    name: 'Auditor',
    description: 'Read-only access for compliance checks.',
    priority: 30,
    is_system: 1,
    rules: {
      '*': ['view']
    }
  }
];

const GROUP_SEED = [
  { name: 'Finance Team', description: 'Finance department operators.' },
  { name: 'Support Desk', description: 'Customer and internal support.' }
];

const USER_SEED = [
  { name: 'Iryna Kovalenko', email: 'iryna.kovalenko@example.com', status: 'active' },
  { name: 'Taras Melnyk', email: 'taras.melnyk@example.com', status: 'active' },
  { name: 'Sofiia Danylenko', email: 'sofiia.danylenko@example.com', status: 'active' },
  { name: 'Oleh Bondar', email: 'oleh.bondar@example.com', status: 'suspended' }
];

function safeJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'serialization_failed' });
  }
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsvRows(content) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizePage(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function logAudit(actor, action, entityType, entityId, beforeData, afterData) {
  db.prepare(`
    INSERT INTO audit_logs (actor, action, entity_type, entity_id, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    actor || 'system',
    action,
    entityType,
    entityId == null ? null : String(entityId),
    safeJson(beforeData),
    safeJson(afterData)
  );
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function createSchema() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS groups_tbl (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      permission_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'low'
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      resource_id INTEGER NOT NULL,
      permission_key TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (role_id, resource_id, permission_key),
      FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY(permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      assigned_by TEXT,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_groups (
      user_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      assigned_by TEXT,
      PRIMARY KEY (user_id, group_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(group_id) REFERENCES groups_tbl(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS group_roles (
      group_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      assigned_by TEXT,
      PRIMARY KEY (group_id, role_id),
      FOREIGN KEY(group_id) REFERENCES groups_tbl(id) ON DELETE CASCADE,
      FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
  `);
}

function isAllowedByRules(rules, resourceKey, permissionKey) {
  const globalRules = rules['*'] || [];
  const scopedRules = rules[resourceKey] || [];
  return globalRules.includes(permissionKey) || scopedRules.includes(permissionKey);
}

function seedReferenceData() {
  const insertResource = db.prepare('INSERT OR IGNORE INTO resources (resource_key, label) VALUES (?, ?)');
  const insertPermission = db.prepare('INSERT OR IGNORE INTO permissions (permission_key, label, risk_level) VALUES (?, ?, ?)');
  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles (name, description, priority, is_system)
    VALUES (?, ?, ?, ?)
  `);

  for (const resource of RESOURCE_SEED) {
    insertResource.run(resource.resource_key, resource.label);
  }

  for (const permission of PERMISSION_SEED) {
    insertPermission.run(permission.permission_key, permission.label, permission.risk_level);
  }

  for (const role of ROLE_PRESETS) {
    insertRole.run(role.name, role.description, role.priority, role.is_system);
    if (role.is_system) {
      db.prepare(`
        UPDATE roles
        SET description = ?, priority = ?, is_system = ?, updated_at = datetime('now')
        WHERE name = ?
      `).run(role.description, role.priority, role.is_system, role.name);
    }
  }

  const roleRows = db.prepare('SELECT id, name FROM roles').all();
  const resourceRows = db.prepare('SELECT id, resource_key FROM resources').all();
  const roleIdByName = Object.fromEntries(roleRows.map((item) => [item.name, item.id]));
  const upsertPermission = db.prepare(`
    INSERT INTO role_permissions (role_id, resource_id, permission_key, allowed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(role_id, resource_id, permission_key)
    DO UPDATE SET allowed = excluded.allowed
  `);

  for (const role of ROLE_PRESETS) {
    const roleId = roleIdByName[role.name];
    if (!roleId) continue;
    for (const resource of resourceRows) {
      for (const permission of PERMISSION_SEED) {
        const allowed = isAllowedByRules(role.rules, resource.resource_key, permission.permission_key) ? 1 : 0;
        upsertPermission.run(roleId, resource.id, permission.permission_key, allowed);
      }
    }
  }

  const insertGroup = db.prepare('INSERT OR IGNORE INTO groups_tbl (name, description) VALUES (?, ?)');
  for (const group of GROUP_SEED) {
    insertGroup.run(group.name, group.description);
  }

  const insertUser = db.prepare('INSERT OR IGNORE INTO users (name, email, status) VALUES (?, ?, ?)');
  for (const user of USER_SEED) {
    insertUser.run(user.name, user.email, user.status);
  }

  const userIdByEmail = Object.fromEntries(
    db.prepare('SELECT id, email FROM users').all().map((item) => [item.email, item.id])
  );
  const groupIdByName = Object.fromEntries(
    db.prepare('SELECT id, name FROM groups_tbl').all().map((item) => [item.name, item.id])
  );

  const assignUserRole = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)');
  const assignUserGroup = db.prepare('INSERT OR IGNORE INTO user_groups (user_id, group_id, assigned_by) VALUES (?, ?, ?)');
  const assignGroupRole = db.prepare('INSERT OR IGNORE INTO group_roles (group_id, role_id, assigned_by) VALUES (?, ?, ?)');

  assignUserRole.run(userIdByEmail['iryna.kovalenko@example.com'], roleIdByName.Owner, 'seed');
  assignUserRole.run(userIdByEmail['taras.melnyk@example.com'], roleIdByName.Auditor, 'seed');
  assignUserRole.run(userIdByEmail['sofiia.danylenko@example.com'], roleIdByName['Support Operator'], 'seed');

  assignGroupRole.run(groupIdByName['Finance Team'], roleIdByName['Finance Manager'], 'seed');
  assignGroupRole.run(groupIdByName['Support Desk'], roleIdByName['Support Operator'], 'seed');

  assignUserGroup.run(userIdByEmail['taras.melnyk@example.com'], groupIdByName['Finance Team'], 'seed');
  assignUserGroup.run(userIdByEmail['sofiia.danylenko@example.com'], groupIdByName['Support Desk'], 'seed');
}

function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'app.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema();
  seedReferenceData();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 700,
    title: 'Access Control & RBAC Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

function listRoleNamesForUser(userId) {
  return db
    .prepare(`
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY r.priority DESC, r.name ASC
    `)
    .all(userId)
    .map((item) => item.name);
}

function listGroupNamesForUser(userId) {
  return db
    .prepare(`
      SELECT g.name
      FROM user_groups ug
      JOIN groups_tbl g ON g.id = ug.group_id
      WHERE ug.user_id = ?
      ORDER BY g.name ASC
    `)
    .all(userId)
    .map((item) => item.name);
}

function listRoleNamesForGroup(groupId) {
  return db
    .prepare(`
      SELECT r.name
      FROM group_roles gr
      JOIN roles r ON r.id = gr.role_id
      WHERE gr.group_id = ?
      ORDER BY r.priority DESC, r.name ASC
    `)
    .all(groupId)
    .map((item) => item.name);
}

function detectWarnings(effectiveByResource) {
  const warnings = [];
  const highRiskKeys = new Set(['delete', 'assign', 'approve']);

  let totalGrants = 0;
  let highRiskGrants = 0;

  for (const permissions of Object.values(effectiveByResource)) {
    totalGrants += permissions.length;
    highRiskGrants += permissions.filter((permission) => highRiskKeys.has(permission)).length;
  }

  if (totalGrants >= 18) {
    warnings.push({
      severity: 'high',
      type: 'excessive',
      message: `User has ${totalGrants} permission grants. Review least-privilege boundaries.`
    });
  }

  if (highRiskGrants >= 7) {
    warnings.push({
      severity: 'high',
      type: 'high-risk',
      message: `High-risk grants count is ${highRiskGrants}. Consider splitting duties.`
    });
  }

  for (const [resourceKey, permissions] of Object.entries(effectiveByResource)) {
    if (permissions.includes('delete') && !permissions.includes('view')) {
      warnings.push({
        severity: 'medium',
        type: 'conflict',
        message: `${resourceKey}: delete without view can produce unsafe blind actions.`
      });
    }
  }

  const usersPerms = effectiveByResource.users || [];
  if (usersPerms.includes('assign') && usersPerms.includes('delete')) {
    warnings.push({
      severity: 'high',
      type: 'conflict',
      message: 'Users resource has both assign and delete. Consider two-person control.'
    });
  }

  const billingPerms = effectiveByResource.billing || [];
  if (billingPerms.includes('approve') && billingPerms.includes('delete')) {
    warnings.push({
      severity: 'high',
      type: 'conflict',
      message: 'Billing approvals and deletions are combined in one access profile.'
    });
  }

  return {
    warnings,
    totals: {
      totalGrants,
      highRiskGrants
    }
  };
}

function getEffectivePermissions(userId) {
  const user = db.prepare('SELECT id, name, email, status FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const directRoles = db.prepare(`
    SELECT r.id, r.name, r.priority
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ?
    ORDER BY r.priority DESC, r.name ASC
  `).all(userId);

  const groupRoles = db.prepare(`
    SELECT DISTINCT r.id, r.name, r.priority, g.id AS group_id, g.name AS group_name
    FROM user_groups ug
    JOIN group_roles gr ON gr.group_id = ug.group_id
    JOIN roles r ON r.id = gr.role_id
    JOIN groups_tbl g ON g.id = ug.group_id
    WHERE ug.user_id = ?
    ORDER BY r.priority DESC, r.name ASC
  `).all(userId);

  const roleIdSet = new Set([...directRoles.map((item) => item.id), ...groupRoles.map((item) => item.id)]);
  const roleIds = [...roleIdSet];

  const effectiveByResource = {};

  if (roleIds.length > 0) {
    const placeholders = roleIds.map(() => '?').join(', ');
    const permissionRows = db.prepare(`
      SELECT rs.resource_key, rs.label AS resource_label, rp.permission_key
      FROM role_permissions rp
      JOIN resources rs ON rs.id = rp.resource_id
      WHERE rp.allowed = 1
        AND rp.role_id IN (${placeholders})
      ORDER BY rs.label ASC, rp.permission_key ASC
    `).all(...roleIds);

    for (const row of permissionRows) {
      if (!effectiveByResource[row.resource_key]) {
        effectiveByResource[row.resource_key] = [];
      }
      if (!effectiveByResource[row.resource_key].includes(row.permission_key)) {
        effectiveByResource[row.resource_key].push(row.permission_key);
      }
    }
  }

  const resourceLabelByKey = Object.fromEntries(RESOURCE_SEED.map((item) => [item.resource_key, item.label]));
  const effective = Object.entries(effectiveByResource).map(([resourceKey, permissions]) => ({
    resourceKey,
    resourceLabel: resourceLabelByKey[resourceKey] || resourceKey,
    permissions: permissions.sort()
  }));

  const warningResult = detectWarnings(effectiveByResource);

  return {
    user,
    directRoles,
    groupRoles,
    effective,
    warnings: warningResult.warnings,
    totals: warningResult.totals
  };
}

function getRoleWarnings() {
  const rows = db.prepare(`
    SELECT rp.role_id, rs.resource_key, rp.permission_key
    FROM role_permissions rp
    JOIN resources rs ON rs.id = rp.resource_id
    WHERE rp.allowed = 1
  `).all();

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.role_id)) map.set(row.role_id, {});
    const byResource = map.get(row.role_id);
    if (!byResource[row.resource_key]) byResource[row.resource_key] = [];
    byResource[row.resource_key].push(row.permission_key);
  }

  const output = [];
  for (const [roleId, byResource] of map.entries()) {
    const warningResult = detectWarnings(byResource);
    output.push({ roleId, warnings: warningResult.warnings, totals: warningResult.totals });
  }
  return output;
}

function registerIpcHandlers() {
  ipcMain.handle('rbac/getOverview', async () => {
    const usersCount = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
    const rolesCount = db.prepare('SELECT COUNT(*) AS total FROM roles').get().total;
    const groupsCount = db.prepare('SELECT COUNT(*) AS total FROM groups_tbl').get().total;
    const audit24h = db.prepare(`
      SELECT COUNT(*) AS total
      FROM audit_logs
      WHERE created_at >= datetime('now', '-1 day')
    `).get().total;

    const highRiskRules = db.prepare(`
      SELECT COUNT(*) AS total
      FROM role_permissions
      WHERE allowed = 1 AND permission_key IN ('delete', 'assign', 'approve')
    `).get().total;

    const userRows = db.prepare('SELECT id FROM users').all();
    let warningUsers = 0;
    for (const user of userRows) {
      const preview = getEffectivePermissions(user.id);
      if (preview.warnings.length > 0) warningUsers += 1;
    }

    const recentAudit = db.prepare(`
      SELECT id, actor, action, entity_type, entity_id, created_at
      FROM audit_logs
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 8
    `).all();

    return {
      metrics: {
        usersCount,
        rolesCount,
        groupsCount,
        audit24h,
        highRiskRules,
        warningUsers
      },
      recentAudit
    };
  });

  ipcMain.handle('rbac/getCatalogs', async () => {
    const roles = db.prepare('SELECT id, name, description, priority FROM roles ORDER BY priority DESC, name ASC').all();
    const groups = db.prepare('SELECT id, name, description FROM groups_tbl ORDER BY name ASC').all();
    const users = db.prepare('SELECT id, name, email, status FROM users ORDER BY name ASC').all();
    return { roles, groups, users };
  });

  ipcMain.handle('rbac/getUsers', async (_event, query = {}) => {
    const page = normalizePage(query.page, 1);
    const pageSize = normalizePage(query.pageSize, 8);
    const search = (query.search || '').trim();
    const status = query.status || 'all';

    const sortMap = {
      name: 'u.name',
      email: 'u.email',
      status: 'u.status',
      created_at: 'u.created_at'
    };

    const sortBy = sortMap[query.sortBy] || sortMap.created_at;
    const sortDir = query.sortDir === 'asc' ? 'ASC' : 'DESC';

    const where = [];
    const params = {};

    if (search) {
      where.push('(u.name LIKE @search OR u.email LIKE @search)');
      params.search = `%${search}%`;
    }

    if (status !== 'all') {
      where.push('u.status = @status');
      params.status = status;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) AS total FROM users u ${whereSql}`).get(params).total;

    const rows = db.prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.status,
        u.created_at,
        COALESCE((SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id = u.id), 0) AS direct_roles_count,
        COALESCE((SELECT COUNT(*) FROM user_groups ug WHERE ug.user_id = u.id), 0) AS groups_count
      FROM users u
      ${whereSql}
      ORDER BY ${sortBy} ${sortDir}, u.id DESC
      LIMIT @limit OFFSET @offset
    `).all({
      ...params,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    return {
      rows,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
  });

  ipcMain.handle('rbac/upsertUser', async (_event, payload = {}) => {
    const actor = payload.actor || 'admin';
    const user = payload.user || {};
    const name = (user.name || '').trim();
    const email = (user.email || '').trim().toLowerCase();
    const status = user.status === 'suspended' ? 'suspended' : 'active';

    if (!name) throw new Error('Name is required');
    if (!validateEmail(email)) throw new Error('Email format is invalid');

    try {
      if (user.id) {
        const before = db.prepare('SELECT id, name, email, status FROM users WHERE id = ?').get(user.id);
        if (!before) throw new Error('User not found');

        db.prepare(`
          UPDATE users
          SET name = ?, email = ?, status = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(name, email, status, user.id);

        const after = db.prepare('SELECT id, name, email, status FROM users WHERE id = ?').get(user.id);
        logAudit(actor, 'UPDATE_USER', 'user', user.id, before, after);
        return after;
      }

      const info = db.prepare(`
        INSERT INTO users (name, email, status)
        VALUES (?, ?, ?)
      `).run(name, email, status);

      const created = db.prepare('SELECT id, name, email, status FROM users WHERE id = ?').get(info.lastInsertRowid);
      logAudit(actor, 'CREATE_USER', 'user', info.lastInsertRowid, null, created);
      return created;
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        throw new Error('Email must be unique');
      }
      throw error;
    }
  });

  ipcMain.handle('rbac/deleteUser', async (_event, payload = {}) => {
    const userId = Number(payload.userId);
    const actor = payload.actor || 'admin';
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const before = db.prepare('SELECT id, name, email, status FROM users WHERE id = ?').get(userId);
    if (!before) throw new Error('User not found');

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logAudit(actor, 'DELETE_USER', 'user', userId, before, null);
    return { ok: true };
  });

  ipcMain.handle('rbac/getUserAssignments', async (_event, payload = {}) => {
    const userId = Number(payload.userId);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const roleIds = db.prepare('SELECT role_id FROM user_roles WHERE user_id = ?').all(userId).map((item) => item.role_id);
    const groupIds = db.prepare('SELECT group_id FROM user_groups WHERE user_id = ?').all(userId).map((item) => item.group_id);

    return { roleIds, groupIds };
  });

  ipcMain.handle('rbac/updateUserRoles', async (_event, payload = {}) => {
    const userId = Number(payload.userId);
    const actor = payload.actor || 'admin';
    const roleIds = [...new Set((payload.roleIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const before = listRoleNamesForUser(userId);

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
      const insert = db.prepare('INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)');
      for (const roleId of roleIds) {
        insert.run(userId, roleId, actor);
      }
    });

    tx();

    const after = listRoleNamesForUser(userId);
    logAudit(actor, 'ASSIGN_USER_ROLES', 'user', userId, { roles: before }, { roles: after });

    return { ok: true, roles: after };
  });

  ipcMain.handle('rbac/updateUserGroups', async (_event, payload = {}) => {
    const userId = Number(payload.userId);
    const actor = payload.actor || 'admin';
    const groupIds = [...new Set((payload.groupIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const before = listGroupNamesForUser(userId);

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM user_groups WHERE user_id = ?').run(userId);
      const insert = db.prepare('INSERT INTO user_groups (user_id, group_id, assigned_by) VALUES (?, ?, ?)');
      for (const groupId of groupIds) {
        insert.run(userId, groupId, actor);
      }
    });

    tx();

    const after = listGroupNamesForUser(userId);
    logAudit(actor, 'ASSIGN_USER_GROUPS', 'user', userId, { groups: before }, { groups: after });

    return { ok: true, groups: after };
  });

  ipcMain.handle('rbac/previewEffectivePermissions', async (_event, payload = {}) => {
    const userId = Number(payload.userId);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');
    return getEffectivePermissions(userId);
  });

  ipcMain.handle('rbac/getRoles', async () => {
    return db.prepare(`
      SELECT
        r.id,
        r.name,
        r.description,
        r.priority,
        r.is_system,
        COALESCE((SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id), 0) AS direct_users,
        COALESCE((SELECT COUNT(*) FROM group_roles gr WHERE gr.role_id = r.id), 0) AS groups_count
      FROM roles r
      ORDER BY r.priority DESC, r.name ASC
    `).all();
  });

  ipcMain.handle('rbac/upsertRole', async (_event, payload = {}) => {
    const actor = payload.actor || 'admin';
    const role = payload.role || {};

    const name = (role.name || '').trim();
    const description = (role.description || '').trim();
    const priority = Number.isFinite(Number(role.priority)) ? Number(role.priority) : 0;

    if (!name) throw new Error('Role name is required');

    try {
      if (role.id) {
        const before = db.prepare('SELECT id, name, description, priority FROM roles WHERE id = ?').get(role.id);
        if (!before) throw new Error('Role not found');

        db.prepare(`
          UPDATE roles
          SET name = ?, description = ?, priority = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(name, description, priority, role.id);

        const after = db.prepare('SELECT id, name, description, priority FROM roles WHERE id = ?').get(role.id);
        logAudit(actor, 'UPDATE_ROLE', 'role', role.id, before, after);
        return after;
      }

      const info = db.prepare(`
        INSERT INTO roles (name, description, priority, is_system)
        VALUES (?, ?, ?, 0)
      `).run(name, description, priority);

      const created = db.prepare('SELECT id, name, description, priority FROM roles WHERE id = ?').get(info.lastInsertRowid);

      const resourceRows = db.prepare('SELECT id FROM resources').all();
      const permissionRows = db.prepare('SELECT permission_key FROM permissions').all();
      const insert = db.prepare(`
        INSERT INTO role_permissions (role_id, resource_id, permission_key, allowed)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(role_id, resource_id, permission_key) DO NOTHING
      `);

      for (const resource of resourceRows) {
        for (const permission of permissionRows) {
          insert.run(info.lastInsertRowid, resource.id, permission.permission_key);
        }
      }

      logAudit(actor, 'CREATE_ROLE', 'role', info.lastInsertRowid, null, created);
      return created;
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        throw new Error('Role name must be unique');
      }
      throw error;
    }
  });

  ipcMain.handle('rbac/getGroups', async () => {
    return db.prepare(`
      SELECT
        g.id,
        g.name,
        g.description,
        COALESCE((SELECT COUNT(*) FROM user_groups ug WHERE ug.group_id = g.id), 0) AS users_count,
        COALESCE((SELECT COUNT(*) FROM group_roles gr WHERE gr.group_id = g.id), 0) AS roles_count
      FROM groups_tbl g
      ORDER BY g.name ASC
    `).all();
  });

  ipcMain.handle('rbac/upsertGroup', async (_event, payload = {}) => {
    const actor = payload.actor || 'admin';
    const group = payload.group || {};

    const name = (group.name || '').trim();
    const description = (group.description || '').trim();

    if (!name) throw new Error('Group name is required');

    try {
      if (group.id) {
        const before = db.prepare('SELECT id, name, description FROM groups_tbl WHERE id = ?').get(group.id);
        if (!before) throw new Error('Group not found');

        db.prepare(`
          UPDATE groups_tbl
          SET name = ?, description = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(name, description, group.id);

        const after = db.prepare('SELECT id, name, description FROM groups_tbl WHERE id = ?').get(group.id);
        logAudit(actor, 'UPDATE_GROUP', 'group', group.id, before, after);
        return after;
      }

      const info = db.prepare(`
        INSERT INTO groups_tbl (name, description)
        VALUES (?, ?)
      `).run(name, description);

      const created = db.prepare('SELECT id, name, description FROM groups_tbl WHERE id = ?').get(info.lastInsertRowid);
      logAudit(actor, 'CREATE_GROUP', 'group', info.lastInsertRowid, null, created);
      return created;
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        throw new Error('Group name must be unique');
      }
      throw error;
    }
  });

  ipcMain.handle('rbac/getGroupAssignments', async (_event, payload = {}) => {
    const groupId = Number(payload.groupId);
    if (!Number.isFinite(groupId)) throw new Error('Invalid group id');

    const roleIds = db.prepare('SELECT role_id FROM group_roles WHERE group_id = ?').all(groupId).map((item) => item.role_id);
    const userIds = db.prepare('SELECT user_id FROM user_groups WHERE group_id = ?').all(groupId).map((item) => item.user_id);
    return { roleIds, userIds };
  });

  ipcMain.handle('rbac/updateGroupRoles', async (_event, payload = {}) => {
    const groupId = Number(payload.groupId);
    const actor = payload.actor || 'admin';
    const roleIds = [...new Set((payload.roleIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (!Number.isFinite(groupId)) throw new Error('Invalid group id');

    const before = listRoleNamesForGroup(groupId);

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM group_roles WHERE group_id = ?').run(groupId);
      const insert = db.prepare('INSERT INTO group_roles (group_id, role_id, assigned_by) VALUES (?, ?, ?)');
      for (const roleId of roleIds) {
        insert.run(groupId, roleId, actor);
      }
    });

    tx();

    const after = listRoleNamesForGroup(groupId);
    logAudit(actor, 'ASSIGN_GROUP_ROLES', 'group', groupId, { roles: before }, { roles: after });

    return { ok: true, roles: after };
  });

  ipcMain.handle('rbac/updateGroupMembers', async (_event, payload = {}) => {
    const groupId = Number(payload.groupId);
    const actor = payload.actor || 'admin';
    const userIds = [...new Set((payload.userIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (!Number.isFinite(groupId)) throw new Error('Invalid group id');

    const before = db.prepare(`
      SELECT u.name
      FROM user_groups ug
      JOIN users u ON u.id = ug.user_id
      WHERE ug.group_id = ?
      ORDER BY u.name ASC
    `).all(groupId).map((item) => item.name);

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM user_groups WHERE group_id = ?').run(groupId);
      const insert = db.prepare('INSERT INTO user_groups (user_id, group_id, assigned_by) VALUES (?, ?, ?)');
      for (const userId of userIds) {
        insert.run(userId, groupId, actor);
      }
    });

    tx();

    const after = db.prepare(`
      SELECT u.name
      FROM user_groups ug
      JOIN users u ON u.id = ug.user_id
      WHERE ug.group_id = ?
      ORDER BY u.name ASC
    `).all(groupId).map((item) => item.name);

    logAudit(actor, 'ASSIGN_GROUP_MEMBERS', 'group', groupId, { users: before }, { users: after });

    return { ok: true, users: after };
  });

  ipcMain.handle('rbac/getMatrixData', async () => {
    const roles = db.prepare(`
      SELECT id, name, description, priority
      FROM roles
      ORDER BY priority DESC, name ASC
    `).all();

    const resources = db.prepare('SELECT id, resource_key, label FROM resources ORDER BY id ASC').all();
    const permissions = db.prepare('SELECT permission_key, label, risk_level FROM permissions ORDER BY id ASC').all();

    const cells = db.prepare(`
      SELECT role_id, resource_id, permission_key, allowed
      FROM role_permissions
    `).all();

    return {
      roles,
      resources,
      permissions,
      cells,
      roleWarnings: getRoleWarnings()
    };
  });

  ipcMain.handle('rbac/updateRoleResourcePermissions', async (_event, payload = {}) => {
    const roleId = Number(payload.roleId);
    const resourceId = Number(payload.resourceId);
    const actor = payload.actor || 'admin';
    const permissionKeys = [...new Set((payload.permissionKeys || []).map((item) => String(item)))];

    if (!Number.isFinite(roleId) || !Number.isFinite(resourceId)) {
      throw new Error('Role and resource are required');
    }

    const validPermissionKeys = new Set(
      db.prepare('SELECT permission_key FROM permissions').all().map((item) => item.permission_key)
    );

    for (const key of permissionKeys) {
      if (!validPermissionKeys.has(key)) {
        throw new Error(`Unknown permission: ${key}`);
      }
    }

    const before = db.prepare(`
      SELECT permission_key
      FROM role_permissions
      WHERE role_id = ? AND resource_id = ? AND allowed = 1
      ORDER BY permission_key ASC
    `).all(roleId, resourceId).map((item) => item.permission_key);

    const tx = db.transaction(() => {
      const upsert = db.prepare(`
        INSERT INTO role_permissions (role_id, resource_id, permission_key, allowed)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(role_id, resource_id, permission_key)
        DO UPDATE SET allowed = excluded.allowed
      `);

      for (const permission of validPermissionKeys) {
        upsert.run(roleId, resourceId, permission, permissionKeys.includes(permission) ? 1 : 0);
      }
    });

    tx();

    const after = db.prepare(`
      SELECT permission_key
      FROM role_permissions
      WHERE role_id = ? AND resource_id = ? AND allowed = 1
      ORDER BY permission_key ASC
    `).all(roleId, resourceId).map((item) => item.permission_key);

    const role = db.prepare('SELECT name FROM roles WHERE id = ?').get(roleId);
    const resource = db.prepare('SELECT label FROM resources WHERE id = ?').get(resourceId);

    logAudit(actor, 'UPDATE_ROLE_RESOURCE_PERMISSIONS', 'role_permission', `${roleId}:${resourceId}`, {
      role: role ? role.name : String(roleId),
      resource: resource ? resource.label : String(resourceId),
      permissions: before
    }, {
      role: role ? role.name : String(roleId),
      resource: resource ? resource.label : String(resourceId),
      permissions: after
    });

    return { ok: true, permissions: after };
  });

  ipcMain.handle('rbac/getAuditLogs', async (_event, query = {}) => {
    const page = normalizePage(query.page, 1);
    const pageSize = normalizePage(query.pageSize, 10);
    const search = (query.search || '').trim();
    const action = query.action || 'all';
    const entityType = query.entityType || 'all';
    const sortDir = query.sortDir === 'asc' ? 'ASC' : 'DESC';

    const where = [];
    const params = {};

    if (search) {
      where.push('(actor LIKE @search OR action LIKE @search OR entity_type LIKE @search OR IFNULL(entity_id, "") LIKE @search)');
      params.search = `%${search}%`;
    }

    if (action !== 'all') {
      where.push('action = @action');
      params.action = action;
    }

    if (entityType !== 'all') {
      where.push('entity_type = @entityType');
      params.entityType = entityType;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`).get(params).total;

    const rows = db.prepare(`
      SELECT id, actor, action, entity_type, entity_id, before_json, after_json, created_at
      FROM audit_logs
      ${whereSql}
      ORDER BY datetime(created_at) ${sortDir}, id ${sortDir}
      LIMIT @limit OFFSET @offset
    `).all({
      ...params,
      limit: pageSize,
      offset: (page - 1) * pageSize
    }).map((row) => ({
      ...row,
      before: parseJson(row.before_json),
      after: parseJson(row.after_json)
    }));

    const actionOptions = db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC').all().map((item) => item.action);
    const entityOptions = db.prepare('SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type ASC').all().map((item) => item.entity_type);

    return {
      rows,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filters: {
        actions: actionOptions,
        entityTypes: entityOptions
      }
    };
  });

  ipcMain.handle('rbac/exportAuditLogs', async (_event, payload = {}) => {
    const actor = payload.actor || 'admin';

    const rows = db.prepare(`
      SELECT id, actor, action, entity_type, entity_id, before_json, after_json, created_at
      FROM audit_logs
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 5000
    `).all();

    const defaultName = `rbac-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    const saveResult = await dialog.showSaveDialog({
      title: 'Export Audit Log',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    const header = ['id', 'created_at', 'actor', 'action', 'entity_type', 'entity_id', 'before_json', 'after_json'];
    const lines = [header.map(csvEscape).join(',')];

    for (const row of rows) {
      lines.push([
        row.id,
        row.created_at,
        row.actor,
        row.action,
        row.entity_type,
        row.entity_id,
        row.before_json,
        row.after_json
      ].map(csvEscape).join(','));
    }

    fs.writeFileSync(saveResult.filePath, `${lines.join('\n')}\n`, 'utf8');

    logAudit(actor, 'EXPORT_AUDIT_LOG', 'audit_log', null, { row_count: rows.length }, { file_path: saveResult.filePath });

    return {
      canceled: false,
      filePath: saveResult.filePath,
      rowCount: rows.length
    };
  });

  ipcMain.handle('rbac/exportUsersCsv', async (_event, payload = {}) => {
    const actor = payload.actor || 'admin';

    const rows = db.prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.status,
        u.created_at,
        u.updated_at,
        COALESCE((
          SELECT GROUP_CONCAT(r.name, '; ')
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id
        ), '') AS direct_roles,
        COALESCE((
          SELECT GROUP_CONCAT(g.name, '; ')
          FROM user_groups ug
          JOIN groups_tbl g ON g.id = ug.group_id
          WHERE ug.user_id = u.id
        ), '') AS groups
      FROM users u
      ORDER BY u.name ASC, u.id ASC
    `).all();

    const defaultName = `rbac-users-${new Date().toISOString().slice(0, 10)}.csv`;
    const saveResult = await dialog.showSaveDialog({
      title: 'Export Users CSV',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    const header = ['id', 'name', 'email', 'status', 'created_at', 'updated_at', 'direct_roles', 'groups'];
    const lines = [header.map(csvEscape).join(',')];

    for (const row of rows) {
      lines.push([
        row.id,
        row.name,
        row.email,
        row.status,
        row.created_at,
        row.updated_at,
        row.direct_roles,
        row.groups
      ].map(csvEscape).join(','));
    }

    fs.writeFileSync(saveResult.filePath, `${lines.join('\n')}\n`, 'utf8');

    logAudit(actor, 'EXPORT_USERS_CSV', 'user', null, { row_count: rows.length }, { file_path: saveResult.filePath });

    return {
      canceled: false,
      filePath: saveResult.filePath,
      rowCount: rows.length
    };
  });

  ipcMain.handle('rbac/importUsersCsv', async (_event, payload = {}) => {
    const actor = payload.actor || 'admin';

    const openResult = await dialog.showOpenDialog({
      title: 'Import Users CSV',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (openResult.canceled || !openResult.filePaths || openResult.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = openResult.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    const rows = parseCsvRows(content).filter((row) => row.some((cell) => String(cell || '').trim()));

    if (rows.length === 0) {
      throw new Error('CSV is empty');
    }

    const header = rows[0].map((cell) => String(cell || '').trim().toLowerCase());
    const dataRows = rows.slice(1);

    const indexByName = Object.fromEntries(header.map((name, index) => [name, index]));
    const emailIndex = indexByName.email;
    const nameIndex = indexByName.name;
    const statusIndex = indexByName.status;

    if (!Number.isInteger(emailIndex)) {
      throw new Error('CSV must include column "email"');
    }

    const selectByEmail = db.prepare('SELECT id, name, email, status FROM users WHERE email = ?');
    const insertUser = db.prepare('INSERT INTO users (name, email, status) VALUES (?, ?, ?)');
    const updateUser = db.prepare(`
      UPDATE users
      SET name = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    const summary = {
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
      errors: []
    };

    const runImport = db.transaction(() => {
      dataRows.forEach((row, rowIndex) => {
        const lineNo = rowIndex + 2;
        const email = String(row[emailIndex] || '').trim().toLowerCase();
        const fallbackName = email.includes('@') ? email.split('@')[0] : '';
        const name = String(row[nameIndex] || '').trim() || fallbackName;
        const rawStatus = String(row[statusIndex] || '').trim().toLowerCase();
        const status = rawStatus === 'suspended' ? 'suspended' : 'active';

        if (!email || !validateEmail(email)) {
          summary.invalid += 1;
          if (summary.errors.length < 15) {
            summary.errors.push(`Line ${lineNo}: invalid email`);
          }
          return;
        }

        if (!name) {
          summary.invalid += 1;
          if (summary.errors.length < 15) {
            summary.errors.push(`Line ${lineNo}: missing name`);
          }
          return;
        }

        const existing = selectByEmail.get(email);
        if (existing) {
          if (existing.name === name && existing.status === status) {
            summary.skipped += 1;
            return;
          }

          const before = { ...existing };
          updateUser.run(name, status, existing.id);
          const after = selectByEmail.get(email);
          summary.updated += 1;
          logAudit(actor, 'IMPORT_UPDATE_USER', 'user', existing.id, before, after);
          return;
        }

        const info = insertUser.run(name, email, status);
        const created = db.prepare('SELECT id, name, email, status FROM users WHERE id = ?').get(info.lastInsertRowid);
        summary.created += 1;
        logAudit(actor, 'IMPORT_CREATE_USER', 'user', info.lastInsertRowid, null, created);
      });
    });

    runImport();

    logAudit(actor, 'IMPORT_USERS_CSV', 'user', null, {
      file_path: filePath,
      rows: dataRows.length
    }, {
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      invalid: summary.invalid
    });

    return {
      canceled: false,
      filePath,
      rowCount: dataRows.length,
      ...summary
    };
  });

  ipcMain.handle('native/notify', async (_event, payload = {}) => {
    const title = payload.title || 'RBAC Manager';
    const body = payload.body || '';

    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
      return { ok: true, supported: true };
    }

    return { ok: false, supported: false };
  });
}

app.whenReady().then(() => {
  initDB();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});
