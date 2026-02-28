import React, { useEffect, useMemo, useState } from 'react';

const PAGE_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles & Matrix' },
  { id: 'groups', label: 'Groups' },
  { id: 'audit', label: 'Audit Log' }
];

const PERMISSION_ORDER = ['view', 'create', 'update', 'delete', 'assign', 'approve'];

function formatDate(value) {
  if (!value) return 'n/a';
  return new Date(value).toLocaleString();
}

function jsonDiffSummary(before, after) {
  if (!before && !after) return 'No payload';
  const asText = (value) => {
    if (!value) return '{}';
    const text = JSON.stringify(value);
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  };
  return `${asText(before)} -> ${asText(after)}`;
}

function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored != null ? stored : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue];
}

function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

function Pagination({ page, totalPages, onChange }) {
  return (
    <div className="pagination-row">
      <button className="btn ghost" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
        Previous
      </button>
      <span className="page-caption">Page {page} / {Math.max(1, totalPages)}</span>
      <button
        className="btn ghost"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  );
}

function StatusPill({ value }) {
  return <span className={`pill ${value === 'active' ? 'ok' : 'warn'}`}>{value}</span>;
}

function SectionCard({ title, subtitle, actions, children }) {
  return (
    <section className="card reveal">
      <div className="card-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="card-actions">{actions}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function LoadingState() {
  return <div className="state loading">Loading…</div>;
}

function EmptyState({ text }) {
  return <div className="state empty">{text}</div>;
}

function ErrorState({ text, onRetry }) {
  return (
    <div className="state error">
      <div>{text}</div>
      <button className="btn" onClick={onRetry}>Retry</button>
    </div>
  );
}

function App() {
  const [page, setPage] = useState('overview');
  const [theme, setTheme] = usePersistedState('rbac_theme', 'light');
  const [actor, setActor] = usePersistedState('rbac_actor', 'admin.local');
  const [refreshToken, setRefreshToken] = useState(0);
  const [flash, setFlash] = useState(null);

  const hasApi = Boolean(window.api && window.api.rbac);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!flash) return;
    const timeout = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timeout);
  }, [flash]);

  const notify = (message, type = 'info') => {
    setFlash({ id: Date.now(), message, type });
  };

  if (!hasApi) {
    return (
      <div className="unsupported">
        <h1>Electron preload API not found</h1>
        <p>Run the app with `npm run dev` and open it in Electron, not only in browser.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Access Control</strong>
          <span>RBAC Manager</span>
        </div>

        <nav className="nav-list">
          {PAGE_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="theme-switcher">
          <label>Theme</label>
          <div className="segmented">
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
          </div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div>
            <div className="crumbs">Home / {PAGE_ITEMS.find((item) => item.id === page)?.label}</div>
            <h1>{PAGE_ITEMS.find((item) => item.id === page)?.label}</h1>
          </div>
          <div className="actor-box">
            <label>Acting as</label>
            <input value={actor} onChange={(event) => setActor(event.target.value)} />
          </div>
        </header>

        {flash ? <div className={`flash ${flash.type}`}>{flash.message}</div> : null}

        <main className="page">
          {page === 'overview' ? (
            <OverviewPage refreshToken={refreshToken} />
          ) : null}

          {page === 'users' ? (
            <UsersPage
              actor={actor}
              onDataChanged={() => {
                setRefreshToken((value) => value + 1);
              }}
              onNotify={notify}
            />
          ) : null}

          {page === 'roles' ? (
            <RolesPage
              actor={actor}
              onDataChanged={() => {
                setRefreshToken((value) => value + 1);
              }}
              onNotify={notify}
            />
          ) : null}

          {page === 'groups' ? (
            <GroupsPage
              actor={actor}
              onDataChanged={() => {
                setRefreshToken((value) => value + 1);
              }}
              onNotify={notify}
            />
          ) : null}

          {page === 'audit' ? (
            <AuditPage actor={actor} onNotify={notify} refreshToken={refreshToken} />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function OverviewPage({ refreshToken }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getOverview();
      setState({ loading: false, error: '', data });
    } catch (error) {
      setState({ loading: false, error: error.message || 'Failed to load', data: null });
    }
  };

  useEffect(() => {
    load();
  }, [refreshToken]);

  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState text={state.error} onRetry={load} />;

  const metrics = state.data.metrics;

  return (
    <div className="grid-2">
      <SectionCard title="System Snapshot" subtitle="Current access model health">
        <div className="metrics-grid">
          <div className="metric">
            <span>Users</span>
            <strong>{metrics.usersCount}</strong>
          </div>
          <div className="metric">
            <span>Roles</span>
            <strong>{metrics.rolesCount}</strong>
          </div>
          <div className="metric">
            <span>Groups</span>
            <strong>{metrics.groupsCount}</strong>
          </div>
          <div className="metric">
            <span>Audit 24h</span>
            <strong>{metrics.audit24h}</strong>
          </div>
          <div className="metric">
            <span>High-Risk Rules</span>
            <strong>{metrics.highRiskRules}</strong>
          </div>
          <div className="metric">
            <span>Users With Warnings</span>
            <strong>{metrics.warningUsers}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Recent Audit Events" subtitle="Who changed what and when">
        {state.data.recentAudit.length === 0 ? (
          <EmptyState text="No audit events yet" />
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {state.data.recentAudit.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.actor}</td>
                  <td>{row.action}</td>
                  <td>{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="UX Guardrails" subtitle="How this interface avoids admin mistakes">
        <ul className="plain-list">
          <li>Permissions matrix uses progressive disclosure: count in grid, full edit in side panel.</li>
          <li>Role/group assignments require explicit confirmation before apply.</li>
          <li>User deletion is delayed by 5 seconds with Undo to reduce accidental loss.</li>
          <li>Effective permissions preview reveals real access after direct and group inheritance.</li>
        </ul>
      </SectionCard>

      <SectionCard title="State Communication" subtitle="How async states are shown">
        <ul className="plain-list">
          <li>Loading placeholders appear while fetching data.</li>
          <li>Empty states are explicit so admins know data is truly absent.</li>
          <li>Error states include Retry to recover without leaving the screen.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

function UsersPage({ actor, onDataChanged, onNotify }) {
  const [query, setQuery] = useState({
    search: '',
    status: 'all',
    sortBy: 'created_at',
    sortDir: 'desc',
    page: 1,
    pageSize: 8
  });
  const debouncedSearch = useDebounced(query.search, 240);

  const [usersState, setUsersState] = useState({ loading: true, error: '', data: null });
  const [catalogsState, setCatalogsState] = useState({ loading: true, error: '', data: null });

  const [editor, setEditor] = useState({ id: null, name: '', email: '', status: 'active' });
  const [editorErrors, setEditorErrors] = useState({});
  const [savingUser, setSavingUser] = useState(false);

  const [assignmentUser, setAssignmentUser] = useState(null);
  const [assignmentRoleIds, setAssignmentRoleIds] = useState([]);
  const [assignmentGroupIds, setAssignmentGroupIds] = useState([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  const [previewState, setPreviewState] = useState({ loading: false, error: '', data: null });

  const [pendingDelete, setPendingDelete] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const fetchUsers = async () => {
    setUsersState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getUsers({ ...query, search: debouncedSearch });
      setUsersState({ loading: false, error: '', data });
    } catch (error) {
      setUsersState({ loading: false, error: error.message || 'Failed to load users', data: null });
    }
  };

  const fetchCatalogs = async () => {
    setCatalogsState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getCatalogs();
      setCatalogsState({ loading: false, error: '', data });
    } catch (error) {
      setCatalogsState({ loading: false, error: error.message || 'Failed to load catalogs', data: null });
    }
  };

  useEffect(() => {
    fetchCatalogs();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [query.page, query.pageSize, query.status, query.sortBy, query.sortDir, debouncedSearch]);

  useEffect(() => {
    if (!pendingDelete) return;
    const interval = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(interval);
  }, [pendingDelete]);

  useEffect(() => {
    return () => {
      if (pendingDelete?.timeoutId) {
        clearTimeout(pendingDelete.timeoutId);
      }
    };
  }, [pendingDelete]);

  const totalPages = usersState.data?.totalPages || 1;

  const setSort = (nextSortBy) => {
    setQuery((prev) => {
      if (prev.sortBy === nextSortBy) {
        return {
          ...prev,
          sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc',
          page: 1
        };
      }
      return { ...prev, sortBy: nextSortBy, sortDir: 'asc', page: 1 };
    });
  };

  const validateUser = (candidate) => {
    const errors = {};

    if (!candidate.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!candidate.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email.trim())) {
      errors.email = 'Email format is invalid';
    }

    return errors;
  };

  const saveUser = async (event) => {
    event.preventDefault();
    const errors = validateUser(editor);
    setEditorErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingUser(true);
    try {
      await window.api.rbac.upsertUser({ actor, user: editor });
      onDataChanged();
      setEditor({ id: null, name: '', email: '', status: 'active' });
      setEditorErrors({});
      await fetchUsers();
      await fetchCatalogs();
      onNotify(editor.id ? 'User updated' : 'User created', 'success');
    } catch (error) {
      onNotify(error.message || 'Could not save user', 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const openAssignments = async (user) => {
    setAssignmentUser(user);
    setAssignmentLoading(true);
    try {
      const assignment = await window.api.rbac.getUserAssignments({ userId: user.id });
      setAssignmentRoleIds(assignment.roleIds);
      setAssignmentGroupIds(assignment.groupIds);
    } catch (error) {
      onNotify(error.message || 'Failed to load assignments', 'error');
    } finally {
      setAssignmentLoading(false);
    }
  };

  const saveAssignments = async () => {
    if (!assignmentUser) return;

    const confirmed = window.confirm(
      `Apply role/group assignment for ${assignmentUser.name}? This action will be logged.`
    );

    if (!confirmed) return;

    setAssignmentLoading(true);
    try {
      await window.api.rbac.updateUserRoles({
        actor,
        userId: assignmentUser.id,
        roleIds: assignmentRoleIds
      });

      await window.api.rbac.updateUserGroups({
        actor,
        userId: assignmentUser.id,
        groupIds: assignmentGroupIds
      });

      await window.api.native.notify({
        title: 'RBAC change applied',
        body: `${assignmentUser.name} assignments were updated.`
      });

      onDataChanged();
      await fetchUsers();
      setAssignmentUser(null);
      onNotify('Assignments updated', 'success');
    } catch (error) {
      onNotify(error.message || 'Failed to update assignments', 'error');
    } finally {
      setAssignmentLoading(false);
    }
  };

  const loadPreview = async (user) => {
    setPreviewState({ loading: true, error: '', data: null });
    try {
      const data = await window.api.rbac.previewEffectivePermissions({ userId: user.id });
      setPreviewState({ loading: false, error: '', data });
    } catch (error) {
      setPreviewState({ loading: false, error: error.message || 'Failed to load preview', data: null });
    }
  };

  const queueDelete = (user) => {
    if (pendingDelete?.timeoutId) {
      clearTimeout(pendingDelete.timeoutId);
    }

    const timeoutId = setTimeout(async () => {
      try {
        await window.api.rbac.deleteUser({ actor, userId: user.id });
        onDataChanged();
        await fetchUsers();
        await fetchCatalogs();
        onNotify(`User ${user.name} deleted`, 'success');
      } catch (error) {
        onNotify(error.message || 'Delete failed', 'error');
      } finally {
        setPendingDelete(null);
      }
    }, 5000);

    setPendingDelete({
      user,
      timeoutId,
      deadline: Date.now() + 5000
    });
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timeoutId);
    setPendingDelete(null);
    onNotify('Delete cancelled', 'info');
  };

  const deleteCountdown = pendingDelete ? Math.max(0, Math.ceil((pendingDelete.deadline - nowTick) / 1000)) : 0;

  return (
    <div className="stack">
      <SectionCard
        title="User Directory"
        subtitle="Search, filter, sort, and page through identities"
        actions={
          <button
            className="btn ghost"
            onClick={() => setEditor({ id: null, name: '', email: '', status: 'active' })}
          >
            New User
          </button>
        }
      >
        <div className="filters-row">
          <input
            placeholder="Search by name or email"
            value={query.search}
            onChange={(event) => setQuery((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
          />
          <select
            value={query.status}
            onChange={(event) => setQuery((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            value={query.pageSize}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                pageSize: Number(event.target.value),
                page: 1
              }))
            }
          >
            <option value={6}>6 / page</option>
            <option value={8}>8 / page</option>
            <option value={12}>12 / page</option>
          </select>
        </div>

        {usersState.loading ? <LoadingState /> : null}
        {usersState.error ? <ErrorState text={usersState.error} onRetry={fetchUsers} /> : null}

        {!usersState.loading && !usersState.error && usersState.data?.rows.length === 0 ? (
          <EmptyState text="No users matched current filters" />
        ) : null}

        {!usersState.loading && !usersState.error && usersState.data?.rows.length > 0 ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <button className="sort-btn" onClick={() => setSort('name')}>
                      Name {query.sortBy === 'name' ? (query.sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th>
                    <button className="sort-btn" onClick={() => setSort('email')}>
                      Email {query.sortBy === 'email' ? (query.sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Groups</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersState.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.email}</td>
                    <td><StatusPill value={row.status} /></td>
                    <td>{row.direct_roles_count}</td>
                    <td>{row.groups_count}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn tiny" onClick={() => setEditor(row)}>Edit</button>
                        <button className="btn tiny ghost" onClick={() => openAssignments(row)}>Assign</button>
                        <button className="btn tiny ghost" onClick={() => loadPreview(row)}>Preview</button>
                        <button className="btn tiny danger" onClick={() => queueDelete(row)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={query.page}
              totalPages={totalPages}
              onChange={(nextPage) => setQuery((prev) => ({ ...prev, page: nextPage }))}
            />
          </>
        ) : null}
      </SectionCard>

      {pendingDelete ? (
        <div className="undo-banner">
          <span>
            Deleting <strong>{pendingDelete.user.name}</strong> in {deleteCountdown}s
          </span>
          <button className="btn" onClick={undoDelete}>Undo</button>
        </div>
      ) : null}

      <div className="grid-2">
        <SectionCard title={editor.id ? 'Edit User' : 'Create User'} subtitle="Primary identity fields first, status second">
          <form className="form" onSubmit={saveUser}>
            <label>
              Name
              <input
                value={editor.name}
                onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. Hanna Prokopenko"
              />
              {editorErrors.name ? <span className="field-error">{editorErrors.name}</span> : null}
            </label>

            <label>
              Email
              <input
                value={editor.email}
                onChange={(event) => setEditor((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="name@example.com"
              />
              {editorErrors.email ? <span className="field-error">{editorErrors.email}</span> : null}
            </label>

            <label>
              Status
              <select
                value={editor.status}
                onChange={(event) => setEditor((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>

            <div className="form-actions">
              <button className="btn" type="submit" disabled={savingUser}>
                {savingUser ? 'Saving…' : editor.id ? 'Update User' : 'Create User'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setEditor({ id: null, name: '', email: '', status: 'active' });
                  setEditorErrors({});
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Assign Roles & Groups" subtitle="Changes require confirmation and are audited">
          {catalogsState.loading ? <LoadingState /> : null}
          {catalogsState.error ? <ErrorState text={catalogsState.error} onRetry={fetchCatalogs} /> : null}

          {!catalogsState.loading && !catalogsState.error ? (
            assignmentUser ? (
              <div className="stack gap-sm">
                <p>
                  Target user: <strong>{assignmentUser.name}</strong>
                </p>

                <div className="chips-grid">
                  {catalogsState.data.roles.map((role) => (
                    <label key={role.id} className="chip-check">
                      <input
                        type="checkbox"
                        checked={assignmentRoleIds.includes(role.id)}
                        onChange={(event) => {
                          setAssignmentRoleIds((prev) =>
                            event.target.checked
                              ? [...prev, role.id]
                              : prev.filter((id) => id !== role.id)
                          );
                        }}
                      />
                      <span>{role.name}</span>
                    </label>
                  ))}
                </div>

                <h4>Group membership</h4>
                <div className="chips-grid">
                  {catalogsState.data.groups.map((group) => (
                    <label key={group.id} className="chip-check">
                      <input
                        type="checkbox"
                        checked={assignmentGroupIds.includes(group.id)}
                        onChange={(event) => {
                          setAssignmentGroupIds((prev) =>
                            event.target.checked
                              ? [...prev, group.id]
                              : prev.filter((id) => id !== group.id)
                          );
                        }}
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                </div>

                <div className="form-actions">
                  <button className="btn" onClick={saveAssignments} disabled={assignmentLoading}>
                    {assignmentLoading ? 'Applying…' : 'Confirm & Apply'}
                  </button>
                  <button className="btn ghost" onClick={() => setAssignmentUser(null)}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState text="Open a user row and click Assign" />
            )
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Preview Effective Permissions" subtitle="Real access after direct roles + inherited group roles">
        {previewState.loading ? <LoadingState /> : null}
        {previewState.error ? (
          <ErrorState text={previewState.error} onRetry={() => previewState.data?.user?.id && loadPreview(previewState.data.user)} />
        ) : null}

        {!previewState.loading && !previewState.error && !previewState.data ? (
          <EmptyState text="Select a user and click Preview" />
        ) : null}

        {!previewState.loading && !previewState.error && previewState.data ? (
          <div className="stack gap-sm">
            <p>
              User: <strong>{previewState.data.user.name}</strong> ({previewState.data.user.email})
            </p>
            <p>
              Direct roles: {previewState.data.directRoles.map((role) => role.name).join(', ') || 'none'}
            </p>
            <p>
              Group inherited roles: {previewState.data.groupRoles.map((role) => `${role.name} via ${role.group_name}`).join(', ') || 'none'}
            </p>

            {previewState.data.warnings.length > 0 ? (
              <div className="warnings">
                {previewState.data.warnings.map((warning, index) => (
                  <div key={`${warning.type}-${index}`} className={`warning ${warning.severity}`}>
                    {warning.message}
                  </div>
                ))}
              </div>
            ) : (
              <div className="state ok">No major risk warning detected.</div>
            )}

            <div className="chips-grid">
              {previewState.data.effective.map((resource) => (
                <div key={resource.resourceKey} className="resource-chip">
                  <strong>{resource.resourceLabel}</strong>
                  <span>{resource.permissions.join(', ') || 'none'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function RolesPage({ actor, onDataChanged, onNotify }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [roleEditor, setRoleEditor] = useState({ id: null, name: '', description: '', priority: 10 });
  const [roleErrors, setRoleErrors] = useState({});
  const [savingRole, setSavingRole] = useState(false);

  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState([]);
  const [savingCell, setSavingCell] = useState(false);

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getMatrixData();
      setState({ loading: false, error: '', data });
    } catch (error) {
      setState({ loading: false, error: error.message || 'Failed to load matrix', data: null });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const matrixMap = useMemo(() => {
    const map = new Map();
    if (!state.data) return map;

    for (const cell of state.data.cells) {
      const key = `${cell.role_id}:${cell.resource_id}`;
      if (!map.has(key)) map.set(key, []);
      if (cell.allowed) {
        map.get(key).push(cell.permission_key);
      }
    }

    return map;
  }, [state.data]);

  const roleWarnings = useMemo(() => {
    const map = new Map();
    if (!state.data) return map;
    for (const row of state.data.roleWarnings) {
      map.set(row.roleId, row);
    }
    return map;
  }, [state.data]);

  const cellPermissions = (roleId, resourceId) => matrixMap.get(`${roleId}:${resourceId}`) || [];

  const openCell = (role, resource) => {
    const currentPermissions = cellPermissions(role.id, resource.id);
    setSelectedCell({ role, resource });
    setSelectedPermissionKeys([...currentPermissions]);
  };

  const togglePermission = (permissionKey) => {
    setSelectedPermissionKeys((prev) =>
      prev.includes(permissionKey)
        ? prev.filter((value) => value !== permissionKey)
        : [...prev, permissionKey]
    );
  };

  const saveCell = async () => {
    if (!selectedCell) return;

    const confirmed = window.confirm(
      `Confirm permission update for role "${selectedCell.role.name}" on resource "${selectedCell.resource.label}"?`
    );

    if (!confirmed) return;

    setSavingCell(true);
    try {
      await window.api.rbac.updateRoleResourcePermissions({
        actor,
        roleId: selectedCell.role.id,
        resourceId: selectedCell.resource.id,
        permissionKeys: selectedPermissionKeys
      });

      await window.api.native.notify({
        title: 'Permission matrix updated',
        body: `${selectedCell.role.name} / ${selectedCell.resource.label}`
      });

      await load();
      onDataChanged();
      onNotify('Permissions updated', 'success');
      setSelectedCell(null);
    } catch (error) {
      onNotify(error.message || 'Failed to update permissions', 'error');
    } finally {
      setSavingCell(false);
    }
  };

  const validateRole = () => {
    const errors = {};
    if (!roleEditor.name.trim()) {
      errors.name = 'Role name is required';
    }
    if (!Number.isFinite(Number(roleEditor.priority))) {
      errors.priority = 'Priority must be numeric';
    }
    return errors;
  };

  const saveRole = async (event) => {
    event.preventDefault();
    const errors = validateRole();
    setRoleErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingRole(true);
    try {
      await window.api.rbac.upsertRole({
        actor,
        role: {
          id: roleEditor.id,
          name: roleEditor.name,
          description: roleEditor.description,
          priority: Number(roleEditor.priority)
        }
      });
      await load();
      onDataChanged();
      onNotify(roleEditor.id ? 'Role updated' : 'Role created', 'success');
      setRoleEditor({ id: null, name: '', description: '', priority: 10 });
      setRoleErrors({});
    } catch (error) {
      onNotify(error.message || 'Failed to save role', 'error');
    } finally {
      setSavingRole(false);
    }
  };

  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState text={state.error} onRetry={load} />;

  return (
    <div className="stack">
      <SectionCard title="Permissions Matrix" subtitle="Roles x Resources with side-panel editing to reduce visual overload">
        <div className="matrix-wrapper">
          <table className="table matrix-table">
            <thead>
              <tr>
                <th>Role</th>
                {state.data.resources.map((resource) => (
                  <th key={resource.id}>{resource.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.data.roles.map((role) => (
                <tr key={role.id}>
                  <td>
                    <button
                      className="link-btn"
                      onClick={() => setRoleEditor({
                        id: role.id,
                        name: role.name,
                        description: role.description || '',
                        priority: role.priority
                      })}
                    >
                      {role.name}
                    </button>
                    <div className="muted">Priority {role.priority}</div>
                  </td>
                  {state.data.resources.map((resource) => {
                    const permissions = cellPermissions(role.id, resource.id).sort(
                      (a, b) => PERMISSION_ORDER.indexOf(a) - PERMISSION_ORDER.indexOf(b)
                    );
                    const hasCritical = permissions.includes('delete') || permissions.includes('approve') || permissions.includes('assign');
                    return (
                      <td key={`${role.id}-${resource.id}`}>
                        <button
                          className={`matrix-cell ${hasCritical ? 'critical' : ''}`}
                          onClick={() => openCell(role, resource)}
                        >
                          <strong>{permissions.length}</strong>
                          <span>{permissions.join(', ') || 'none'}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedCell ? (
          <div className="side-panel">
            <h4>Edit Cell</h4>
            <p>
              <strong>{selectedCell.role.name}</strong> / <strong>{selectedCell.resource.label}</strong>
            </p>

            <div className="chips-grid">
              {state.data.permissions.map((permission) => (
                <label key={permission.permission_key} className="chip-check">
                  <input
                    type="checkbox"
                    checked={selectedPermissionKeys.includes(permission.permission_key)}
                    onChange={() => togglePermission(permission.permission_key)}
                  />
                  <span>
                    {permission.label}
                    <em className={`risk ${permission.risk_level}`}>{permission.risk_level}</em>
                  </span>
                </label>
              ))}
            </div>

            <div className="form-actions">
              <button className="btn" onClick={saveCell} disabled={savingCell}>
                {savingCell ? 'Saving…' : 'Save Permissions'}
              </button>
              <button className="btn ghost" onClick={() => setSelectedCell(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <div className="grid-2">
        <SectionCard title={roleEditor.id ? 'Edit Role' : 'Create Role'} subtitle="Identity first, metadata second">
          <form className="form" onSubmit={saveRole}>
            <label>
              Role name
              <input
                value={roleEditor.name}
                onChange={(event) => setRoleEditor((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. Project Supervisor"
              />
              {roleErrors.name ? <span className="field-error">{roleErrors.name}</span> : null}
            </label>

            <label>
              Description
              <textarea
                rows={3}
                value={roleEditor.description}
                onChange={(event) => setRoleEditor((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <label>
              Priority
              <input
                type="number"
                value={roleEditor.priority}
                onChange={(event) => setRoleEditor((prev) => ({ ...prev, priority: event.target.value }))}
              />
              {roleErrors.priority ? <span className="field-error">{roleErrors.priority}</span> : null}
            </label>

            <div className="form-actions">
              <button className="btn" type="submit" disabled={savingRole}>
                {savingRole ? 'Saving…' : roleEditor.id ? 'Update Role' : 'Create Role'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setRoleEditor({ id: null, name: '', description: '', priority: 10 });
                  setRoleErrors({});
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Risk Hints" subtitle="Conflict and excessive-rights heuristics">
          <div className="stack gap-sm">
            {state.data.roleWarnings.filter((item) => item.warnings.length > 0).length === 0 ? (
              <div className="state ok">No role-level warnings currently triggered.</div>
            ) : (
              state.data.roleWarnings
                .filter((item) => item.warnings.length > 0)
                .map((item) => {
                  const role = state.data.roles.find((candidate) => candidate.id === item.roleId);
                  return (
                    <div className="warning-block" key={item.roleId}>
                      <strong>{role ? role.name : `Role #${item.roleId}`}</strong>
                      <ul className="plain-list">
                        {item.warnings.map((warning, index) => (
                          <li key={`${item.roleId}-${index}`}>{warning.message}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function GroupsPage({ actor, onDataChanged, onNotify }) {
  const [groupsState, setGroupsState] = useState({ loading: true, error: '', data: null });
  const [catalogsState, setCatalogsState] = useState({ loading: true, error: '', data: null });

  const [groupEditor, setGroupEditor] = useState({ id: null, name: '', description: '' });
  const [groupErrors, setGroupErrors] = useState({});
  const [savingGroup, setSavingGroup] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  const loadGroups = async () => {
    setGroupsState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getGroups();
      setGroupsState({ loading: false, error: '', data });
    } catch (error) {
      setGroupsState({ loading: false, error: error.message || 'Failed to load groups', data: null });
    }
  };

  const loadCatalogs = async () => {
    setCatalogsState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getCatalogs();
      setCatalogsState({ loading: false, error: '', data });
    } catch (error) {
      setCatalogsState({ loading: false, error: error.message || 'Failed to load catalogs', data: null });
    }
  };

  useEffect(() => {
    loadGroups();
    loadCatalogs();
  }, []);

  const openAssignments = async (group) => {
    setSelectedGroupId(group.id);
    setAssignmentLoading(true);
    try {
      const data = await window.api.rbac.getGroupAssignments({ groupId: group.id });
      setSelectedRoleIds(data.roleIds);
      setSelectedUserIds(data.userIds);
    } catch (error) {
      onNotify(error.message || 'Failed to load group assignments', 'error');
    } finally {
      setAssignmentLoading(false);
    }
  };

  const validateGroup = () => {
    const errors = {};
    if (!groupEditor.name.trim()) errors.name = 'Group name is required';
    return errors;
  };

  const saveGroup = async (event) => {
    event.preventDefault();
    const errors = validateGroup();
    setGroupErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingGroup(true);
    try {
      await window.api.rbac.upsertGroup({ actor, group: groupEditor });
      setGroupEditor({ id: null, name: '', description: '' });
      setGroupErrors({});
      onDataChanged();
      await loadGroups();
      await loadCatalogs();
      onNotify(groupEditor.id ? 'Group updated' : 'Group created', 'success');
    } catch (error) {
      onNotify(error.message || 'Failed to save group', 'error');
    } finally {
      setSavingGroup(false);
    }
  };

  const saveAssignments = async () => {
    if (!selectedGroupId) return;

    const group = groupsState.data.find((item) => item.id === selectedGroupId);
    const confirmed = window.confirm(`Apply assignments for group "${group?.name || selectedGroupId}"?`);
    if (!confirmed) return;

    setAssignmentLoading(true);
    try {
      await window.api.rbac.updateGroupRoles({
        actor,
        groupId: selectedGroupId,
        roleIds: selectedRoleIds
      });

      await window.api.rbac.updateGroupMembers({
        actor,
        groupId: selectedGroupId,
        userIds: selectedUserIds
      });

      onDataChanged();
      await loadGroups();
      await loadCatalogs();
      onNotify('Group assignments updated', 'success');
    } catch (error) {
      onNotify(error.message || 'Failed to update group assignments', 'error');
    } finally {
      setAssignmentLoading(false);
    }
  };

  if (groupsState.loading || catalogsState.loading) return <LoadingState />;
  if (groupsState.error) return <ErrorState text={groupsState.error} onRetry={loadGroups} />;
  if (catalogsState.error) return <ErrorState text={catalogsState.error} onRetry={loadCatalogs} />;

  const selectedGroup = groupsState.data.find((item) => item.id === selectedGroupId);

  return (
    <div className="stack">
      <div className="grid-2">
        <SectionCard title="Groups" subtitle="Role bundles for easier assignment">
          {groupsState.data.length === 0 ? (
            <EmptyState text="No groups found" />
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Users</th>
                  <th>Roles</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupsState.data.map((group) => (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td>{group.users_count}</td>
                    <td>{group.roles_count}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn tiny" onClick={() => setGroupEditor(group)}>Edit</button>
                        <button className="btn tiny ghost" onClick={() => openAssignments(group)}>Manage</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title={groupEditor.id ? 'Edit Group' : 'Create Group'} subtitle="Group identity before permissions">
          <form className="form" onSubmit={saveGroup}>
            <label>
              Group name
              <input
                value={groupEditor.name}
                onChange={(event) => setGroupEditor((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. Incident Response"
              />
              {groupErrors.name ? <span className="field-error">{groupErrors.name}</span> : null}
            </label>

            <label>
              Description
              <textarea
                rows={3}
                value={groupEditor.description || ''}
                onChange={(event) => setGroupEditor((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <div className="form-actions">
              <button className="btn" type="submit" disabled={savingGroup}>
                {savingGroup ? 'Saving…' : groupEditor.id ? 'Update Group' : 'Create Group'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setGroupEditor({ id: null, name: '', description: '' });
                  setGroupErrors({});
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="Group Assignments" subtitle="Attach roles and members to selected group">
        {!selectedGroup ? (
          <EmptyState text="Choose a group and click Manage" />
        ) : (
          <div className="grid-2">
            <div className="stack gap-sm">
              <h4>Roles for {selectedGroup.name}</h4>
              <div className="chips-grid">
                {catalogsState.data.roles.map((role) => (
                  <label key={role.id} className="chip-check">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(role.id)}
                      onChange={(event) => {
                        setSelectedRoleIds((prev) =>
                          event.target.checked
                            ? [...prev, role.id]
                            : prev.filter((id) => id !== role.id)
                        );
                      }}
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="stack gap-sm">
              <h4>Members</h4>
              <div className="chips-grid">
                {catalogsState.data.users.map((user) => (
                  <label key={user.id} className="chip-check">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={(event) => {
                        setSelectedUserIds((prev) =>
                          event.target.checked
                            ? [...prev, user.id]
                            : prev.filter((id) => id !== user.id)
                        );
                      }}
                    />
                    <span>{user.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-actions span-2">
              <button className="btn" onClick={saveAssignments} disabled={assignmentLoading}>
                {assignmentLoading ? 'Applying…' : 'Confirm & Apply'}
              </button>
              <button className="btn ghost" onClick={() => setSelectedGroupId(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function AuditPage({ actor, onNotify, refreshToken }) {
  const [query, setQuery] = useState({
    search: '',
    action: 'all',
    entityType: 'all',
    sortDir: 'desc',
    page: 1,
    pageSize: 10
  });

  const debouncedSearch = useDebounced(query.search, 260);
  const [state, setState] = useState({ loading: true, error: '', data: null });

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getAuditLogs({ ...query, search: debouncedSearch });
      setState({ loading: false, error: '', data });
    } catch (error) {
      setState({ loading: false, error: error.message || 'Failed to load audit log', data: null });
    }
  };

  useEffect(() => {
    load();
  }, [query.page, query.pageSize, query.action, query.entityType, query.sortDir, debouncedSearch, refreshToken]);

  const exportLog = async () => {
    try {
      const result = await window.api.rbac.exportAuditLogs({ actor });
      if (result.canceled) {
        onNotify('Export cancelled', 'info');
        return;
      }

      await window.api.native.notify({
        title: 'Audit log exported',
        body: `${result.rowCount} rows saved` 
      });

      onNotify(`Exported to ${result.filePath}`, 'success');
      await load();
    } catch (error) {
      onNotify(error.message || 'Export failed', 'error');
    }
  };

  return (
    <SectionCard
      title="Audit Log"
      subtitle="Track who changed permissions, roles, and assignments"
      actions={<button className="btn" onClick={exportLog}>Export CSV</button>}
    >
      <div className="filters-row">
        <input
          placeholder="Search actor/action/entity"
          value={query.search}
          onChange={(event) => setQuery((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
        />

        <select
          value={query.action}
          onChange={(event) => setQuery((prev) => ({ ...prev, action: event.target.value, page: 1 }))}
        >
          <option value="all">All actions</option>
          {(state.data?.filters.actions || []).map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>

        <select
          value={query.entityType}
          onChange={(event) => setQuery((prev) => ({ ...prev, entityType: event.target.value, page: 1 }))}
        >
          <option value="all">All entities</option>
          {(state.data?.filters.entityTypes || []).map((entityType) => (
            <option key={entityType} value={entityType}>{entityType}</option>
          ))}
        </select>

        <select
          value={query.sortDir}
          onChange={(event) => setQuery((prev) => ({ ...prev, sortDir: event.target.value, page: 1 }))}
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>

      {state.loading ? <LoadingState /> : null}
      {state.error ? <ErrorState text={state.error} onRetry={load} /> : null}

      {!state.loading && !state.error && state.data?.rows.length === 0 ? (
        <EmptyState text="No audit events for the selected filters" />
      ) : null}

      {!state.loading && !state.error && state.data?.rows.length > 0 ? (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {state.data.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.actor}</td>
                  <td>{row.action}</td>
                  <td>{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</td>
                  <td className="mono">{jsonDiffSummary(row.before, row.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination
            page={query.page}
            totalPages={state.data.totalPages}
            onChange={(nextPage) => setQuery((prev) => ({ ...prev, page: nextPage }))}
          />
        </>
      ) : null}
    </SectionCard>
  );
}

export default App;
