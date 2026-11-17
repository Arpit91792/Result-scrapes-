import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
      const { login } = useAuth();
      const navigate = useNavigate();
      const [form, setForm] = useState({ email: '', password: '' });
      const [showPass, setShowPass] = useState(false);
      const [loading, setLoading] = useState(false);

      const handleSubmit = async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
                  await login(form.email, form.password);
                  toast.success('Welcome back!');
                  navigate('/dashboard');
            } catch (err) {
                  toast.error(err.response?.data?.error || 'Login failed');
            } finally {
                  setLoading(false);
            }
      };

      return (
            <div className="min-h-screen bg-gradient-to-br from-navy-700 to-navy-900 flex items-center justify-center p-4">
                  <div className="w-full max-w-md">
                        {/* Logo */}
                        <div className="text-center mb-8">
                              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4 p-2">
                                    <img src="/sirt_logo.png" alt="SIRT Logo" className="w-12 h-12 object-contain" />
                              </div>
                              <h1 className="text-2xl font-bold text-white">SIRT Smart Result Manager</h1>
                              <p className="text-white/60 text-sm mt-1">Authorized College Portal</p>
                        </div>

                        {/* Form */}
                        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl">
                              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-6">Sign In</h2>

                              <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                          <label className="label">Email Address</label>
                                          <input
                                                type="email"
                                                className="input"
                                                placeholder="college@example.com"
                                                value={form.email}
                                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                                required
                                          />
                                    </div>

                                    <div>
                                          <label className="label">Password</label>
                                          <div className="relative">
                                                <input
                                                      type={showPass ? 'text' : 'password'}
                                                      className="input pr-10"
                                                      placeholder="Enter your password"
                                                      value={form.password}
                                                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                                      required
                                                />
                                                <button
                                                      type="button"
                                                      onClick={() => setShowPass(s => !s)}
                                                      className="absolute right-3 top-2.5 text-gray-400"
                                                >
                                                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                          </div>
                                    </div>

                                    <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                                          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : 'Sign In'}
                                    </button>
                              </form>

                              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
                                    Don't have an account?{' '}
                                    <Link to="/register" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                                          Register here
                                    </Link>
                              </p>
                        </div>

                        <p className="text-center text-white/40 text-xs mt-6">
                              For authorized college use only. All data is protected.
                        </p>
                  </div>
            </div>
      );
}
