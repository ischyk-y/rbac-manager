import React, { useEffect, useMemo, useState } from 'react';
import SectionCard from '../components/SectionCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { PERMISSION_ORDER } from '../utils/constants';

export default function RolesPage({ actor, onDataChanged, onNotify, askConfirm, refreshToken }) {
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
      setState({ loading: false, error: error.message || 'Не вдалося завантажити матрицю', data: null });
    }
  };

  useEffect(() => {
    load();
  }, [refreshToken]);

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
    askConfirm({
      title: 'Підтвердити зміну прав',
      message: `Оновити права для ролі «${selectedCell.role.name}» на ресурсі «${selectedCell.resource.label}»?`,
      onConfirm: async () => {
        setSavingCell(true);
        try {
          await window.api.rbac.updateRoleResourcePermissions({
            actor,
            roleId: selectedCell.role.id,
            resourceId: selectedCell.resource.id,
            permissionKeys: selectedPermissionKeys
          });

          await window.api.native.notify({
            title: 'Матрицю прав оновлено',
            body: `${selectedCell.role.name} / ${selectedCell.resource.label}`
          });

          await load();
          onDataChanged();
          onNotify('Права оновлено', 'success');
          setSelectedCell(null);
        } catch (error) {
          onNotify(error.message || 'Не вдалося оновити права', 'error');
        } finally {
          setSavingCell(false);
        }
      }
    });
  };

  const validateRole = () => {
    const errors = {};
    if (!roleEditor.name.trim()) {
      errors.name = 'Назва ролі є обов’язковою';
    }
    if (!Number.isFinite(Number(roleEditor.priority))) {
      errors.priority = 'Пріоритет має бути числом';
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
      onNotify(roleEditor.id ? 'Роль оновлено' : 'Роль створено', 'success');
      setRoleEditor({ id: null, name: '', description: '', priority: 10 });
      setRoleErrors({});
    } catch (error) {
      onNotify(error.message || 'Не вдалося зберегти роль', 'error');
    } finally {
      setSavingRole(false);
    }
  };

  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState text={state.error} onRetry={load} />;

  return (
    <div className="stack">
      <SectionCard title="Матриця прав" subtitle="Ролі × ресурси з редагуванням у боковій панелі">
        <div className="matrix-wrapper">
          <table className="table matrix-table">
            <thead>
              <tr>
                <th>Роль</th>
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
                    <div className="muted">Пріоритет {role.priority}</div>
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
                          <span>{permissions.join(', ') || 'немає'}</span>
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
            <h4>Редагування комірки</h4>
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
                {savingCell ? 'Збереження…' : 'Зберегти права'}
              </button>
              <button className="btn ghost" onClick={() => setSelectedCell(null)}>
                Скасувати
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <div className="grid-2">
        <SectionCard title={roleEditor.id ? 'Редагувати роль' : 'Створити роль'} subtitle="Спочатку ідентифікація, потім метадані">
          <form className="form" onSubmit={saveRole}>
            <label>
              Назва ролі
              <input
                value={roleEditor.name}
                onChange={(event) => setRoleEditor((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="наприклад, Керівник проєкту"
              />
              {roleErrors.name ? <span className="field-error">{roleErrors.name}</span> : null}
            </label>

            <label>
              Опис
              <textarea
                rows={3}
                value={roleEditor.description}
                onChange={(event) => setRoleEditor((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <label>
              Пріоритет
              <input
                type="number"
                value={roleEditor.priority}
                onChange={(event) => setRoleEditor((prev) => ({ ...prev, priority: event.target.value }))}
              />
              {roleErrors.priority ? <span className="field-error">{roleErrors.priority}</span> : null}
            </label>

            <div className="form-actions">
              <button className="btn" type="submit" disabled={savingRole}>
                {savingRole ? 'Збереження…' : roleEditor.id ? 'Оновити роль' : 'Створити роль'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setRoleEditor({ id: null, name: '', description: '', priority: 10 });
                  setRoleErrors({});
                }}
              >
                Очистити
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Підказки ризиків" subtitle="Евристики конфліктів і надлишкових прав">
          <div className="stack gap-sm">
            {state.data.roleWarnings.filter((item) => item.warnings.length > 0).length === 0 ? (
              <div className="state ok">Наразі немає попереджень на рівні ролей.</div>
            ) : (
              state.data.roleWarnings
                .filter((item) => item.warnings.length > 0)
                .map((item) => {
                  const role = state.data.roles.find((candidate) => candidate.id === item.roleId);
                  return (
                    <div className="warning-block" key={item.roleId}>
                      <strong>{role ? role.name : `Роль #${item.roleId}`}</strong>
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
