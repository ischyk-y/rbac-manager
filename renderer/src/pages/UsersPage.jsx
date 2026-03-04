import React, { useEffect, useState } from 'react';
import SectionCard from '../components/SectionCard';
import Pagination from '../components/Pagination';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import StatusPill from '../components/StatusPill';
import useDebounced from '../hooks/useDebounced';

export default function UsersPage({ actor, onDataChanged, onNotify, askConfirm, refreshToken }) {
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
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  const [previewState, setPreviewState] = useState({ loading: false, error: '', data: null });

  const [pendingDelete, setPendingDelete] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [csvBusy, setCsvBusy] = useState({ importing: false, exporting: false });

  const fetchUsers = async () => {
    setUsersState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getUsers({ ...query, search: debouncedSearch });
      setUsersState({ loading: false, error: '', data });
    } catch (error) {
      setUsersState({ loading: false, error: error.message || 'Не вдалося завантажити користувачів', data: null });
    }
  };

  const fetchCatalogs = async () => {
    setCatalogsState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getCatalogs();
      setCatalogsState({ loading: false, error: '', data });
    } catch (error) {
      setCatalogsState({ loading: false, error: error.message || 'Не вдалося завантажити довідники', data: null });
    }
  };

  useEffect(() => {
    fetchCatalogs();
  }, [refreshToken]);

  useEffect(() => {
    fetchUsers();
  }, [query.page, query.pageSize, query.status, query.sortBy, query.sortDir, debouncedSearch, refreshToken]);

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
      errors.name = 'Ім’я є обов’язковим';
    }

    if (!candidate.email.trim()) {
      errors.email = 'Ел. пошта є обов’язковою';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email.trim())) {
      errors.email = 'Невірний формат ел. пошти';
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
      onNotify(editor.id ? 'Користувача оновлено' : 'Користувача створено', 'success');
    } catch (error) {
      onNotify(error.message || 'Не вдалося зберегти користувача', 'error');
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
    } catch (error) {
      onNotify(error.message || 'Не вдалося завантажити призначення', 'error');
    } finally {
      setAssignmentLoading(false);
    }
  };

  const saveAssignments = async () => {
    if (!assignmentUser) return;

    askConfirm({
      title: 'Підтвердити призначення ролей',
      message: `Застосувати ролі для ${assignmentUser.name}? Зміна буде зафіксована в журналі.`,
      onConfirm: async () => {
        setAssignmentLoading(true);
        try {
          await window.api.rbac.updateUserRoles({
            actor,
            userId: assignmentUser.id,
            roleIds: assignmentRoleIds
          });

          await window.api.native.notify({
            title: 'Зміни RBAC застосовано',
            body: `Ролі користувача ${assignmentUser.name} оновлено.`
          });

          onDataChanged();
          await fetchUsers();
          setAssignmentUser(null);
          onNotify('Призначення ролей оновлено', 'success');
        } catch (error) {
          onNotify(error.message || 'Не вдалося оновити призначення', 'error');
        } finally {
          setAssignmentLoading(false);
        }
      }
    });
  };

  const loadPreview = async (user) => {
    setPreviewState({ loading: true, error: '', data: null });
    try {
      const data = await window.api.rbac.previewEffectivePermissions({ userId: user.id });
      setPreviewState({ loading: false, error: '', data });
    } catch (error) {
      setPreviewState({ loading: false, error: error.message || 'Не вдалося завантажити перегляд', data: null });
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
        onNotify(`Користувача ${user.name} видалено`, 'success');
      } catch (error) {
        onNotify(error.message || 'Не вдалося видалити', 'error');
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
    onNotify('Видалення скасовано', 'info');
  };

  const exportUsersCsv = async () => {
    setCsvBusy((prev) => ({ ...prev, exporting: true }));
    try {
      const result = await window.api.rbac.exportUsersCsv({ actor });
      if (result.canceled) {
        onNotify('Експорт користувачів скасовано', 'info');
        return;
      }

      await window.api.native.notify({
        title: 'Користувачів експортовано',
        body: `Збережено рядків: ${result.rowCount}`
      });

      onNotify(`Експортовано до ${result.filePath}`, 'success');
    } catch (error) {
      onNotify(error.message || 'Не вдалося експортувати CSV', 'error');
    } finally {
      setCsvBusy((prev) => ({ ...prev, exporting: false }));
    }
  };

  const importUsersCsv = async () => {
    setCsvBusy((prev) => ({ ...prev, importing: true }));
    try {
      const result = await window.api.rbac.importUsersCsv({ actor });
      if (result.canceled) {
        onNotify('Імпорт користувачів скасовано', 'info');
        return;
      }

      await fetchUsers();
      await fetchCatalogs();
      onDataChanged();

      const summary = `Імпорт: +${result.created}, оновлено ${result.updated}, пропущено ${result.skipped}, невалідних ${result.invalid}`;
      onNotify(summary, result.invalid > 0 ? 'info' : 'success');

      if (result.invalid > 0) {
        const body = (result.errors || []).slice(0, 2).join(' | ') || 'Перевірте CSV формат.';
        await window.api.native.notify({
          title: 'Імпорт завершено з попередженнями',
          body
        });
      } else {
        await window.api.native.notify({
          title: 'Імпорт користувачів завершено',
          body: summary
        });
      }
    } catch (error) {
      onNotify(error.message || 'Не вдалося імпортувати CSV', 'error');
    } finally {
      setCsvBusy((prev) => ({ ...prev, importing: false }));
    }
  };

  const deleteCountdown = pendingDelete ? Math.max(0, Math.ceil((pendingDelete.deadline - nowTick) / 1000)) : 0;

  return (
    <div className="stack">
      <SectionCard
        title="Довідник користувачів"
        subtitle="Пошук, фільтри, сортування та пагінація користувачів"
        actions={
          <div className="row-actions">
            <button className="btn ghost" onClick={exportUsersCsv} disabled={csvBusy.exporting || csvBusy.importing}>
              {csvBusy.exporting ? 'Експорт…' : 'Експорт CSV'}
            </button>
            <button className="btn ghost" onClick={importUsersCsv} disabled={csvBusy.exporting || csvBusy.importing}>
              {csvBusy.importing ? 'Імпорт…' : 'Імпорт CSV'}
            </button>
            <button
              className="btn ghost"
              onClick={() => setEditor({ id: null, name: '', email: '', status: 'active' })}
              disabled={csvBusy.exporting || csvBusy.importing}
            >
              Новий користувач
            </button>
          </div>
        }
      >
        <div className="filters-row">
          <input
            placeholder="Пошук за ім’ям або ел. поштою"
            value={query.search}
            onChange={(event) => setQuery((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
          />
          <select
            value={query.status}
            onChange={(event) => setQuery((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
          >
            <option value="all">Усі статуси</option>
            <option value="active">Активний</option>
            <option value="suspended">Призупинений</option>
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
            <option value={6}>6 / стор.</option>
            <option value={8}>8 / стор.</option>
            <option value={12}>12 / стор.</option>
          </select>
        </div>

        {usersState.loading ? <LoadingState /> : null}
        {usersState.error ? <ErrorState text={usersState.error} onRetry={fetchUsers} /> : null}

        {!usersState.loading && !usersState.error && usersState.data?.rows.length === 0 ? (
          <EmptyState text="Немає користувачів за цими фільтрами" />
        ) : null}

        {!usersState.loading && !usersState.error && usersState.data?.rows.length > 0 ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <button className="sort-btn" onClick={() => setSort('name')}>
                      Ім’я {query.sortBy === 'name' ? (query.sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th>
                    <button className="sort-btn" onClick={() => setSort('email')}>
                      Ел. пошта {query.sortBy === 'email' ? (query.sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th>Статус</th>
                  <th>Ролі</th>
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {usersState.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.email}</td>
                    <td><StatusPill value={row.status} /></td>
                    <td>{row.direct_roles_count}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn tiny" onClick={() => setEditor(row)}>Редагувати</button>
                        <button className="btn tiny ghost" onClick={() => openAssignments(row)}>Призначити</button>
                        <button className="btn tiny ghost" onClick={() => loadPreview(row)}>Перегляд</button>
                        <button className="btn tiny danger" onClick={() => queueDelete(row)}>Видалити</button>
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
            Видалення <strong>{pendingDelete.user.name}</strong> через {deleteCountdown} c
          </span>
          <button className="btn" onClick={undoDelete}>Скасувати</button>
        </div>
      ) : null}

      <div className="grid-2">
      <SectionCard title={editor.id ? 'Редагувати користувача' : 'Створити користувача'} subtitle="Спочатку основні поля, потім статус">
          <form className="form" onSubmit={saveUser}>
            <label>
              Ім’я
              <input
                value={editor.name}
                onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="наприклад, Ганна Прокопенко"
              />
              {editorErrors.name ? <span className="field-error">{editorErrors.name}</span> : null}
            </label>

            <label>
              Ел. пошта
              <input
                value={editor.email}
                onChange={(event) => setEditor((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="name@example.com"
              />
              {editorErrors.email ? <span className="field-error">{editorErrors.email}</span> : null}
            </label>

            <label>
              Статус
              <select
                value={editor.status}
                onChange={(event) => setEditor((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="active">Активний</option>
                <option value="suspended">Призупинений</option>
              </select>
            </label>

            <div className="form-actions">
              <button className="btn" type="submit" disabled={savingUser}>
                {savingUser ? 'Збереження…' : editor.id ? 'Оновити користувача' : 'Створити користувача'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setEditor({ id: null, name: '', email: '', status: 'active' });
                  setEditorErrors({});
                }}
              >
                Очистити
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Призначення ролей" subtitle="Зміни потребують підтвердження та фіксуються у журналі">
          {catalogsState.loading ? <LoadingState /> : null}
          {catalogsState.error ? <ErrorState text={catalogsState.error} onRetry={fetchCatalogs} /> : null}

          {!catalogsState.loading && !catalogsState.error ? (
            assignmentUser ? (
              <div className="stack gap-sm">
                <p>
                  Цільовий користувач: <strong>{assignmentUser.name}</strong>
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

                <div className="form-actions">
                  <button className="btn" onClick={saveAssignments} disabled={assignmentLoading}>
                    {assignmentLoading ? 'Застосування…' : 'Підтвердити й застосувати'}
                  </button>
                  <button className="btn ghost" onClick={() => setAssignmentUser(null)}>
                    Закрити
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState text="Оберіть користувача й натисніть «Призначити»" />
            )
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Перегляд ефективних прав" subtitle="Реальний доступ після прямих ролей">
        {previewState.loading ? <LoadingState /> : null}
        {previewState.error ? (
          <ErrorState text={previewState.error} onRetry={() => previewState.data?.user?.id && loadPreview(previewState.data.user)} />
        ) : null}

        {!previewState.loading && !previewState.error && !previewState.data ? (
          <EmptyState text="Оберіть користувача й натисніть «Перегляд»" />
        ) : null}

        {!previewState.loading && !previewState.error && previewState.data ? (
          <div className="stack gap-sm">
            <p>
              Користувач: <strong>{previewState.data.user.name}</strong> ({previewState.data.user.email})
            </p>
            <p>
              Прямі ролі: {previewState.data.directRoles.map((role) => role.name).join(', ') || 'немає'}
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
              <div className="state ok">Суттєвих ризиків не виявлено.</div>
            )}

            <div className="chips-grid">
              {previewState.data.effective.map((resource) => (
                <div key={resource.resourceKey} className="resource-chip">
                  <strong>{resource.resourceLabel}</strong>
                  <span>{resource.permissions.join(', ') || 'немає'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
