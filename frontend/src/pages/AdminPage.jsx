import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertCircle, Loader2, UserPlus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function AdminPage() {
      const { user, login, logout } = useAuth();
      const navigate = useNavigate();
      const [loginForm, setLoginForm] = useState({ username: '', password: '' });
      const [newUser, setNewUser] = useState({ email: '', password: '' });
      const [loginLoading, setLoginLoading] = useState(false);
      const [creatingUser, setCreatingUser] = useState(false);
      const [users, setUsers] = useState([]);
      const [usersLoading, setUsersLoading] = useState(false);
      const [updatingUserId, setUpdatingUserId] = useState(null);
      const [deletingUserId, setDeletingUserId] = useState(null);
      const [editingUserId, setEditingUserId] = useState(null);
      const [savingUserId, setSavingUserId] = useState(null);
      const [editForm, setEditForm] = useState({ username: '', email: '', password: '' });

      useEffect(() => {
            if (user?.role !== 'admin') return undefined;

            let active = true;
            setUsersLoading(true);
            api.get('/auth/admin/users')
                  .then(res => {
                        if (active) setUsers(res.data.users);
                  })
                  .catch(err => {
                        if (active) toast.error(err.response?.data?.error || 'Could not load users');
                  })
                  .finally(() => {
                        if (active) setUsersLoading(false);
                  });

            return () => { active = false; };
      }, [user?.role]);

      const handleAdminLogin = async (e) => {
            e.preventDefault();
            setLoginLoading(true);
            try {
                  const signedInUser = await login(loginForm.username, loginForm.password);
                  if (signedInUser.role !== 'admin') {
                        logout();
                        toast.error('Admin access required');
                        return;
                  }
                  toast.success('Admin signed in');
                  navigate('/admin', { replace: true });
            } catch (err) {
                  toast.error(err.response?.data?.error || 'Admin login failed');
            } finally {
                  setLoginLoading(false);
            }
      };

      const handleAddUser = async (e) => {
            e.preventDefault();
            setCreatingUser(true);
            try {
                  const res = await api.post('/auth/admin/users', newUser);
                  setUsers(currentUsers => [res.data.user, ...currentUsers]);
                  toast.success('User added. They can now sign in with this email and password.');
                  setNewUser({ email: '', password: '' });
            } catch (err) {
                  const message = err.response?.data?.error
                        || err.response?.data?.errors?.[0]?.msg
                        || 'Could not add user';
                  toast.error(message);
            } finally {
                  setCreatingUser(false);
            }
      };

      const handleToggleUser = async (targetUser) => {
            const isActive = !targetUser.isActive;
            setUpdatingUserId(targetUser._id);
            try {
                  const res = await api.patch(`/auth/admin/users/${targetUser._id}/status`, { isActive });
                  setUsers(currentUsers => currentUsers.map(item => (
                        item._id === targetUser._id ? res.data.user : item
                  )));
                  toast.success(isActive ? 'User unblocked' : 'User blocked');
            } catch (err) {
                  toast.error(err.response?.data?.error || 'Could not update user status');
            } finally {
                  setUpdatingUserId(null);
            }
      };

      const handleDeleteUser = async (targetUser) => {
            const confirmed = window.confirm(
                  `Permanently delete ${targetUser.email} and all their fetch jobs, student results, and download history?`
            );
            if (!confirmed) return;

            setDeletingUserId(targetUser._id);
            try {
                  await api.delete(`/auth/admin/users/${targetUser._id}`);
                  setUsers(currentUsers => currentUsers.filter(item => item._id !== targetUser._id));
                  toast.success('User and associated data deleted');
            } catch (err) {
                  toast.error(err.response?.data?.error || 'Could not delete user');
            } finally {
                  setDeletingUserId(null);
            }
      };

      const handleStartEditing = (targetUser) => {
            setEditingUserId(targetUser._id);
            setEditForm({ username: targetUser.username, email: targetUser.email, password: '' });
      };

      const handleUpdateUser = async (e, targetUser) => {
            e.preventDefault();
            setSavingUserId(targetUser._id);
            const updates = {
                  username: editForm.username,
                  email: editForm.email,
                  ...(editForm.password && { password: editForm.password }),
            };
            try {
                  const res = await api.patch(`/auth/admin/users/${targetUser._id}`, updates);
                  setUsers(currentUsers => currentUsers.map(item => (
                        item._id === targetUser._id ? res.data.user : item
                  )));
                  setEditingUserId(null);
                  toast.success('User details updated');
            } catch (err) {
                  const message = err.response?.data?.error
                        || err.response?.data?.errors?.[0]?.msg
                        || 'Could not update user';
                  toast.error(message);
            } finally {
                  setSavingUserId(null);
            }
      };

      if (!user) {
            return (
                  <div className="min-h-screen bg-gradient-to-br from-navy-700 to-navy-900 flex items-center justify-center p-4">
                        <div className="w-full max-w-md">
                              <div className="text-center mb-8">
                                    <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
                                          <Shield className="w-9 h-9 text-white" />
                                    </div>
                                    <h1 className="text-2xl font-bold text-white">Admin Sign In</h1>
                                    <p className="text-white/60 text-sm mt-1">Sign in to manage user accounts</p>
                              </div>

                              <form onSubmit={handleAdminLogin} className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl space-y-4">
                                    <div>
                                          <label className="label">Username</label>
                                          <input
                                                type="text"
                                                className="input"
                                                autoComplete="username"
                                                value={loginForm.username}
                                                onChange={e => setLoginForm(form => ({ ...form, username: e.target.value }))}
                                                required
                                          />
                                    </div>
                                    <div>
                                          <label className="label">Password</label>
                                          <input
                                                type="password"
                                                className="input"
                                                autoComplete="current-password"
                                                value={loginForm.password}
                                                onChange={e => setLoginForm(form => ({ ...form, password: e.target.value }))}
                                                required
                                          />
                                    </div>
                                    <button type="submit" disabled={loginLoading} className="btn-primary w-full justify-center py-2.5">
                                          {loginLoading
                                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
                                                : 'Sign In'}
                                    </button>
                              </form>
                        </div>
                  </div>
            );
      }

      if (user.role !== 'admin') {
            return (
                  <div className="max-w-xl mx-auto mt-20 text-center">
                        <div className="card">
                              <Shield className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                              <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Admin Access Required</h1>
                              <p className="text-gray-400 text-sm mt-2">This page is restricted to administrators only.</p>
                        </div>
                  </div>
            );
      }

      return (
            <div className="max-w-3xl mx-auto space-y-5">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Shield className="w-6 h-6 text-primary-500" /> Admin Panel
                  </h1>

                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Admin Account</h2>
                        <p className="text-sm text-gray-500">Username: <strong>{user.username}</strong></p>
                        <p className="text-sm text-gray-500">Email: <strong>{user.email}</strong></p>
                  </div>

                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                              <UserPlus className="w-5 h-5 text-primary-500" /> Add User
                        </h2>
                        <form onSubmit={handleAddUser} className="space-y-4">
                              <div>
                                    <label className="label">Email</label>
                                    <input
                                          type="email"
                                          className="input"
                                          autoComplete="email"
                                          value={newUser.email}
                                          onChange={e => setNewUser(form => ({ ...form, email: e.target.value }))}
                                          required
                                    />
                              </div>
                              <div>
                                    <label className="label">Password</label>
                                    <input
                                          type="password"
                                          className="input"
                                          autoComplete="new-password"
                                          minLength={6}
                                          value={newUser.password}
                                          onChange={e => setNewUser(form => ({ ...form, password: e.target.value }))}
                                          required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">At least 6 characters. The user can sign in at the regular login page using this email and password.</p>
                              </div>
                              <button type="submit" disabled={creatingUser} className="btn-primary py-2">
                                    {creatingUser
                                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding user...</>
                                          : <><UserPlus className="w-4 h-4" /> Add User</>}
                              </button>
                        </form>
                  </div>

                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Users</h2>
                        {usersLoading ? (
                              <div className="flex justify-center py-6">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                              </div>
                        ) : users.length === 0 ? (
                              <p className="text-sm text-gray-500">No users have been added yet.</p>
                        ) : (
                              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {users.map(item => (
                                          <div key={item._id} className="py-3 space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                      <div className="min-w-0">
                                                            <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{item.email}</p>
                                                            <p className="text-xs text-gray-500">
                                                                  Username: {item.username}
                                                                  {' · '}
                                                                  <span className={item.isActive ? 'text-green-600' : 'text-red-600'}>
                                                                        {item.isActive ? 'Active' : 'Blocked'}
                                                                  </span>
                                                            </p>
                                                      </div>
                                                      <div className="flex items-center gap-2">
                                                            <button
                                                                  type="button"
                                                                  onClick={() => handleStartEditing(item)}
                                                                  disabled={deletingUserId === item._id || savingUserId === item._id}
                                                                  className="btn-secondary text-xs py-1.5"
                                                            >
                                                                  Edit
                                                            </button>
                                                            <button
                                                                  type="button"
                                                                  onClick={() => handleToggleUser(item)}
                                                                  disabled={updatingUserId === item._id || deletingUserId === item._id || savingUserId === item._id}
                                                                  className={item.isActive
                                                                        ? 'btn-danger text-xs py-1.5'
                                                                        : 'btn-secondary text-xs py-1.5'}
                                                            >
                                                                  {updatingUserId === item._id
                                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                        : item.isActive ? 'Block User' : 'Unblock User'}
                                                            </button>
                                                            <button
                                                                  type="button"
                                                                  onClick={() => handleDeleteUser(item)}
                                                                  disabled={updatingUserId === item._id || deletingUserId === item._id || savingUserId === item._id}
                                                                  className="btn-danger text-xs py-1.5"
                                                            >
                                                                  {deletingUserId === item._id
                                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                        : <><Trash2 className="w-3.5 h-3.5" /> Delete</>}
                                                            </button>
                                                      </div>
                                                </div>
                                                {editingUserId === item._id && (
                                                      <form onSubmit={e => handleUpdateUser(e, item)} className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                                                            <div>
                                                                  <label className="label text-xs">Username</label>
                                                                  <input
                                                                        type="text"
                                                                        className="input"
                                                                        minLength={3}
                                                                        maxLength={50}
                                                                        value={editForm.username}
                                                                        onChange={e => setEditForm(form => ({ ...form, username: e.target.value }))}
                                                                        required
                                                                  />
                                                            </div>
                                                            <div>
                                                                  <label className="label text-xs">Email</label>
                                                                  <input
                                                                        type="email"
                                                                        className="input"
                                                                        value={editForm.email}
                                                                        onChange={e => setEditForm(form => ({ ...form, email: e.target.value }))}
                                                                        required
                                                                  />
                                                            </div>
                                                            <div>
                                                                  <label className="label text-xs">New password</label>
                                                                  <input
                                                                        type="password"
                                                                        className="input"
                                                                        minLength={6}
                                                                        placeholder="Leave blank to keep current"
                                                                        value={editForm.password}
                                                                        onChange={e => setEditForm(form => ({ ...form, password: e.target.value }))}
                                                                  />
                                                            </div>
                                                            <div className="md:col-span-3 flex gap-2">
                                                                  <button type="submit" disabled={savingUserId === item._id} className="btn-primary text-xs py-1.5">
                                                                        {savingUserId === item._id
                                                                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                              : 'Save Changes'}
                                                                  </button>
                                                                  <button type="button" onClick={() => setEditingUserId(null)} className="btn-secondary text-xs py-1.5">
                                                                        Cancel
                                                                  </button>
                                                            </div>
                                                      </form>
                                                )}
                                          </div>
                                    ))}
                              </div>
                        )}
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                              User accounts are stored in the database with hashed passwords and remain available after the backend restarts.
                        </p>
                  </div>
            </div>
      );
}
