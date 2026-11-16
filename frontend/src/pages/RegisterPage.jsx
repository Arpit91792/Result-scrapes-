import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function RegisterPage() {
      const { register } = useAuth();
      const navigate = useNavigate();
      const [form, setForm] = useState({
            username: '', email: '', password: '', confirmPassword: '',
            collegeCode: '', collegeName: '',
      });
      const [loading, setLoading] = useState(false);

      const handleSubmit = async (e) => {
            e.preventDefault();
            if (form.password !== form.confirmPassword) {
                  toast.error('Passwords do not match');
                  return;
            }
            setLoading(true);
            try {
                  await register(form);
                  toast.success('Account created successfully!');
                  navigate('/dashboard');
            } catch (err) {
                  const msg = err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Registration failed';
                  toast.error(msg);
            } finally {
                  setLoading(false);
            }
      };

      const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

      return (
            <div className="min-h-screen bg-gradient-to-br from-navy-700 to-navy-900 flex items-center justify-center p-4">
                  <div className="w-full max-w-lg">
                        <div className="text-center mb-8">
                              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
                                    <GraduationCap className="w-8 h-8 text-white" />
                              </div>
                              <h1 className="text-2xl font-bold text-white">Create Account</h1>
                              <p className="text-white/60 text-sm mt-1">Register your college on RGPV Smart Result Manager</p>
                        </div>

                        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl">
                              <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                          <div>
                                                <label className="label">Username</label>
                                                <input type="text" className="input" placeholder="johndoe" value={form.username} onChange={set('username')} required minLength={3} />
                                          </div>
                                          <div>
                                                <label className="label">Email</label>
                                                <input type="email" className="input" placeholder="email@college.com" value={form.email} onChange={set('email')} required />
                                          </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                          <div>
                                                <label className="label">College Code</label>
                                                <input type="text" className="input" placeholder="0133" value={form.collegeCode} onChange={set('collegeCode')} />
                                          </div>
                                          <div>
                                                <label className="label">College Name</label>
                                                <input type="text" className="input" placeholder="SIRT, Bhopal" value={form.collegeName} onChange={set('collegeName')} />
                                          </div>
                                    </div>

                                    <div>
                                          <label className="label">Password</label>
                                          <input type="password" className="input" placeholder="Minimum 6 characters" value={form.password} onChange={set('password')} required minLength={6} />
                                    </div>

                                    <div>
                                          <label className="label">Confirm Password</label>
                                          <input type="password" className="input" placeholder="Re-enter password" value={form.confirmPassword} onChange={set('confirmPassword')} required />
                                    </div>

                                    <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
                                          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</> : 'Create Account'}
                                    </button>
                              </form>

                              <p className="text-center text-sm text-gray-500 mt-6">
                                    Already have an account?{' '}
                                    <Link to="/login" className="text-primary-600 font-medium hover:underline">Sign in</Link>
                              </p>
                        </div>
                  </div>
            </div>
      );
}
