import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Shield, Loader2, User, Lock } from 'lucide-react';
import { useTranslation } from '../lib/i18n';
import { useAuthStore } from '../store/authStore';
import { User as UserType } from '../types';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) return alert(t('required') || 'Username and password required');
    setLoading(true);

    try {
      // Query 'app_users' table
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (error) {
        console.error("Supabase Query Error:", error);
        alert("Database Error: " + error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        alert("User not found / 用户不存在");
        setLoading(false);
        return;
      }

      // Verify password
      if (data.password === password) {
        // Update Store
        const userData: UserType = {
          username: data.username,
          role: data.role as 'admin' | 'operator' | 'client',
          created_at: data.created_at
        };
        
        setUser(userData);
        localStorage.setItem('wh_user', JSON.stringify(data));
        
        // Redirect
        const from = (location.state as any)?.from?.pathname;
        if (from) {
          navigate(from, { replace: true });
        } else {
          // Role based default routes
          if (data.role === 'client') {
              navigate('/inventory');
          } else {
              navigate('/receive');
          }
        }
      } else {
        alert("Invalid password / 密码错误");
      }
    } catch (e: any) {
      console.error("System Error:", e);
      alert("System Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-fadeIn">
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
            <Shield size={32}/>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{t('app_title') || 'WMS System'}</h1>
          <p className="text-gray-500 text-sm mt-1">Supabase V2.2 (Warehouse Users)</p>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                <User size={14} />
                {t('user_name') || 'Username'}
            </label>
            <div className="relative">
                <input 
                  className="w-full border-2 border-gray-200 rounded-lg p-3 pl-10 outline-none focus:border-blue-500 transition-colors" 
                  value={username} onChange={e=>setUsername(e.target.value)} 
                  aria-label={t('user_name') || 'Username'}
                />
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                <Lock size={14} />
                {t('user_pass') || 'Password'}
            </label>
            <div className="relative">
                <input 
                  type="password"
                  className="w-full border-2 border-gray-200 rounded-lg p-3 pl-10 outline-none focus:border-blue-500 transition-colors" 
                  value={password} onChange={e=>setPassword(e.target.value)} 
                  onKeyDown={e=>e.key==='Enter' && handleLogin()}
                  aria-label={t('user_pass') || 'Password'}
                />
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <button 
            onClick={handleLogin} 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-2"
          >
            {loading && <Loader2 className="animate-spin" size={20}/>}
            {loading ? "Logging in..." : (t('login_btn') || "登 录")}
          </button>
        </div>
      </div>
    </div>
  );
}