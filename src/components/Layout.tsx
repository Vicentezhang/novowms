import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';
import { 
  Box, ClipboardList, Check, Warehouse, Truck, Package, 
  Settings, Users, LogOut, Globe,
  FileText, Menu, X, DollarSign // Added DollarSign
} from 'lucide-react';

export default function Layout() {
  const { t, lang, changeLang } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem('wh_user') || '{}');
  // Normalize 'almacen' role to 'operator' for menu visibility
  const rawRole = user.role || 'operator';
  const role = rawRole === 'almacen' ? 'operator' : rawRole;

  // 🟢 权限配置表
  // Admin: 拥有所有权限
  // Operator: 只能操作仓库流程 (收/点/查/发/检)
  // Client: 只能看库存、管理自己的SKU、下出库单
  const MENU_ITEMS = [
    { path: '/inbound', label: 'menu_inbound', icon: <FileText size={20} />, roles: ['admin', 'client'] }, // 🟢 预报
    { path: '/receive', label: 'menu_receive', icon: <Box size={20} />, roles: ['admin', 'operator'] },
    { path: '/count', label: 'menu_count', icon: <ClipboardList size={20} />, roles: ['admin', 'operator'] },
    { path: '/inspect', label: 'menu_inspect', icon: <Check size={20} />, roles: ['admin', 'operator', 'client'] },
    { path: '/inventory', label: 'menu_inventory', icon: <Warehouse size={20} />, roles: ['admin', 'operator', 'client'] },
    { path: '/products', label: 'menu_products', icon: <Package size={20} />, roles: ['admin', 'client'] }, 
    { path: '/outbound', label: 'menu_outbound', icon: <Truck size={20} />, roles: ['admin', 'client', 'operator'] },
    { path: '/finance', label: 'menu_finance', icon: <DollarSign size={20} />, roles: ['admin'] },
    { path: '/users', label: 'menu_users', icon: <Users size={20} />, roles: ['admin'] },
    { path: '/clients', label: 'menu_config', icon: <Settings size={20} />, roles: ['admin'] },
  ];

  const handleLogout = () => {
    localStorage.removeItem('wh_user');
    navigate('/login');
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false); // Close menu on mobile after navigation
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* 移动端顶部栏 */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-1 hover:bg-slate-800 rounded">
            <Menu size={24} />
          </button>
          <span className="font-bold text-lg">{t('app_title')}</span>
        </div>
        <div className="flex gap-3">
           <button onClick={()=>changeLang(lang==='zh'?'es':'zh')}><Globe size={20}/></button>
        </div>
      </div>

      {/* 移动端遮罩层 */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏 (PC固定, 移动端抽屉) */}
      <aside className={`
        fixed md:sticky top-0 left-0 h-screen w-64 bg-slate-900 text-white shadow-xl z-50 transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h1 className="font-bold text-xl tracking-wider">NOVO WMS</h1>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span>V2.5</span>
              <span className={`px-2 rounded text-white font-bold text-[10px] uppercase ${role==='admin'?'bg-purple-600': role==='client'?'bg-green-600':'bg-blue-600'}`}>
                {role}
              </span>
            </div>
          </div>
          {/* 移动端关闭按钮 */}
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {MENU_ITEMS.filter(m => m.roles.includes(role)).map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavigation(item.path)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                location.pathname === item.path 
                  ? 'bg-blue-600 text-white shadow-lg translate-x-1' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="font-medium">{t(item.label)}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700 bg-slate-800">
          {/* 语言切换 (PC端显示在这里, 移动端在顶部) */}
          <div className="hidden md:flex bg-slate-700 rounded p-1 mb-4">
            <button onClick={()=>changeLang('zh')} className={`flex-1 py-1 text-xs font-bold rounded ${lang==='zh'?'bg-blue-500 text-white':'text-slate-400'}`}>中文</button>
            <button onClick={()=>changeLang('es')} className={`flex-1 py-1 text-xs font-bold rounded ${lang==='es'?'bg-blue-500 text-white':'text-slate-400'}`}>ES</button>
          </div>

          <div className="mb-3 px-2 flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center font-bold text-sm">
               {user.username?.[0]?.toUpperCase()}
             </div>
             <div>
                <div className="font-bold text-sm">{user.username}</div>
                <div className="text-xs text-slate-400 capitalize">{role}</div>
             </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 bg-red-600/10 text-red-400 p-2 rounded hover:bg-red-600 hover:text-white transition-colors">
            <LogOut size={16}/> {t('logout')}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto h-[calc(100vh-64px)] md:h-screen p-4">
        <Outlet />
      </main>
    </div>
  );
}
