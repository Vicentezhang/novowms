import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { UserPlus, Trash, Shield, User, Briefcase, Phone } from 'lucide-react';

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<any[]>([]);
  const [isClientMode, setIsClientMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const VALID_ROLES = ['admin', 'operator', 'client'];

  const [form, setForm] = useState({ 
    username: '', 
    password: '', 
                                                                                                                        role: 'operator',
    contact: '',
    default_location: '' // New field
  });

  const fetchUsers = async () => {
    // 🟢 修改：从 'app_users' 获取列表
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) console.error("Fetch Users Error:", error);
    if (data) setUsers(data);
  };

  useEffect(() => { fetchUsers(); }, []);

  const addUser = async () => {
    if (!form.username || !form.password) return alert(t('required'));
    
    // 1. Create User
    let finalRole = isClientMode ? 'client' : form.role;
    
    // 🛡️ Defensive Check: Ensure role is a valid string
    if (typeof finalRole !== 'string' || !['admin', 'operator', 'client'].includes(finalRole)) {
        console.warn(`[Debug] Invalid role detected: ${JSON.stringify(finalRole)}. Type: ${typeof finalRole}. Forcing to 'operator'.`);
        finalRole = 'operator';
    }

    const payload: any = {
      username: form.username,
      password: form.password,
      role: finalRole
    };

    // Client-side Validation
    if (!VALID_ROLES.includes(payload.role)) {
       alert(`Error: Role '${payload.role}' is not allowed. Allowed values: ${VALID_ROLES.join(', ')}.`);
       return;
    }
    
    if (form.contact) payload.contact_info = form.contact;

    setLoading(true);
    console.log("Submitting user creation payload:", payload);

    try {
      // 🟢 修改：检查 'app_users'
      const { data: exist } = await supabase.from('app_users').select('username').eq('username', form.username).maybeSingle();
      if (exist) {
          alert("User already exists / 用户已存在");
          setLoading(false);
          return;
      }

      // 🟢 修改：插入到 'app_users'
      const { error } = await supabase.from('app_users').insert([payload]);
      
      if (error) {
        console.error("User creation error:", error);
        // 🟢 修改：放宽错误匹配，400错误也提示可能是缓存问题
        if (error.message.includes("violates check constraint")) {
           alert(`Error: Database rejected role '${payload.role}'. Full Error: ${JSON.stringify(error)}`);
        } else if (error.code === 'PGRST204' || error.message.includes("schema cache") || error.code === '400') {
           alert("Error: Database schema cache is out of sync. Please try restarting the project in Supabase Dashboard (Settings -> General -> Restart project).");
        } else if (error.message && error.message.includes("No API key found in request")) {
            // 🟢 处理 API Key 丢失的情况
           alert("Error: No API key found. Please check your Supabase configuration in src/lib/supabase.ts.");
        } else {
           alert("Error creating user: " + error.message);
        }
        return;
      }

      // 2. If Client, also create Client Entity
      if (isClientMode || form.role === 'client') {
        const { error: clientError } = await supabase.from('clients').insert([{
          type: 'client',
          name: form.username,
          contact_info: form.contact, // Try to save here too if schema supports
          default_location: form.default_location // Added
        }]);
        
        if (clientError) {
          console.warn("Client entity creation failed (might already exist):", clientError.message);
        } else {
          alert(t('msg_client_created'));
        }
      } else {
          alert(t('msg_success'));
      }

      setForm({ username: '', password: '', role: 'operator', contact: '', default_location: '' });
      setIsClientMode(false);
      fetchUsers();
    } catch (e) {
       console.error("Unexpected error during user creation:", e);
       alert("Unexpected error occurred.");
     } finally {
       setLoading(false);
     }
   };

  const delUser = async (u: string) => {
    if (u === 'admin') return alert("不能删除管理员账号");
    if (!confirm(t('confirm_del'))) return;
    
    // 🟢 修改：从 'app_users' 删除
    const { error } = await supabase.from('app_users').delete().eq('username', u);
    if (error) alert("Error: " + error.message);
    else fetchUsers();
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 顶部切换 */}
      <div className="flex justify-end mb-4">
        <button 
          onClick={() => { setIsClientMode(!isClientMode); setForm({...form, role: !isClientMode ? 'client' : 'operator'}); }}
          className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${
            isClientMode ? 'bg-green-600 text-white shadow-lg' : 'bg-white text-gray-600 border'
          }`}
        >
          {isClientMode ? <UserPlus size={18}/> : <Briefcase size={18}/>}
          {isClientMode ? t('user_add') : t('user_create_client')}
        </button>
      </div>

      {/* 添加卡片 */}
      <div className={`p-6 rounded-2xl shadow-sm border border-gray-100 mb-6 transition-colors ${isClientMode ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
        <h3 className={`font-bold mb-4 flex items-center gap-2 ${isClientMode ? 'text-green-800' : 'text-gray-800'}`}>
          <div className={`p-2 rounded-lg ${isClientMode ? 'bg-green-200 text-green-700' : 'bg-blue-100 text-blue-600'}`}>
            {isClientMode ? <Briefcase size={20}/> : <UserPlus size={20}/>}
          </div>
          {isClientMode ? t('user_create_client') : t('user_add')}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input 
            className="border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-500 transition-colors" 
            placeholder={t('user_name')} 
            value={form.username} 
            onChange={e=>setForm({...form, username:e.target.value})} 
          />
          <input 
            className="border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-500 transition-colors" 
            placeholder={t('user_pass')} 
            value={form.password} 
            onChange={e=>setForm({...form, password:e.target.value})} 
          />
          
          {isClientMode ? (
             <>
                 <div className="relative">
                    <input 
                      className="w-full border-2 border-gray-200 p-3 pl-10 rounded-xl outline-none focus:border-green-500 transition-colors" 
                      placeholder={t('user_contact')} 
                      value={form.contact} 
                      onChange={e=>setForm({...form, contact:e.target.value})} 
                    />
                    <Phone className="absolute left-3 top-3.5 text-gray-400" size={18}/>
                 </div>
                 <div className="relative">
                    <input 
                      className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-green-500 transition-colors" 
                      placeholder={t('user_def_loc') || 'Default Loc'} 
                      value={form.default_location} 
                      onChange={e=>setForm({...form, default_location:e.target.value})} 
                    />
                 </div>
             </>
          ) : (
            <select 
              className="border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-500 bg-white" 
              value={form.role} 
              onChange={e=>setForm({...form, role:e.target.value})}
            >
              <option value="operator">{t('user_role_operator')}</option>
              <option value="admin">{t('user_role_admin')}</option>
            </select>
          )}

          <button 
            onClick={addUser} 
            disabled={loading}
            className={`text-white px-4 py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${
                loading ? 'bg-gray-400 cursor-not-allowed' : (isClientMode ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700')
            }`}
          >
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>}
            {loading ? "Saving..." : t('config_add')}
          </button>
        </div>
        {isClientMode && <p className="text-xs text-green-600 mt-2 ml-1">* {t('msg_client_created')}</p>}
      </div>

      {/* 用户列表 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-4 text-sm font-bold text-gray-500 uppercase">{t('user_name')}</th>
              <th className="p-4 text-sm font-bold text-gray-500 uppercase">{t('user_role')}</th>
              <th className="p-4 text-sm font-bold text-gray-500 uppercase">{t('user_contact')}</th>
              <th className="p-4 text-right text-sm font-bold text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.username} className="hover:bg-gray-50 transition-colors group">
                <td className="p-4 font-bold flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      u.role==='admin'?'bg-purple-100 text-purple-600': 
                      u.role==='client'?'bg-green-100 text-green-600':'bg-blue-100 text-blue-600'
                  }`}>
                    {u.role==='admin' ? <Shield size={16}/> : u.role==='client' ? <Briefcase size={16}/> : <User size={16}/>}
                  </div>
                  {u.username}
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                      u.role==='admin'?'bg-purple-100 text-purple-700':
                      u.role==='client'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'
                  }`}>
                    {u.role === 'admin' ? t('user_role_admin') : u.role === 'client' ? t('user_role_client') : t('user_role_operator')}
                  </span>
                </td>
                <td className="p-4 text-gray-500 text-sm">
                    {u.contact_info || '-'}
                </td>
                <td className="p-4 text-right">
                  {u.username !== 'admin' && (
                    <button 
                      onClick={()=>delUser(u.username)} 
                      className="text-gray-300 hover:text-red-500 p-2 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash size={18}/>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
