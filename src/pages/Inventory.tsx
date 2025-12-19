import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase'; // 引入 Supabase 工具
import { useTranslation } from '../lib/i18n'; // 引入翻译工具
import { Warehouse, Search, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Inventory() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  
  const [filter, setFilter] = useState(''); // Restored
  const [filterNew, setFilterNew] = useState(false); // Filter: New Arrivals
  const [filterQuality, setFilterQuality] = useState(''); // Filter: Quality

  // React Query Implementation
  const { data: inventory = [], isLoading, isError } = useQuery({
    queryKey: ['inventory', user?.username, user?.role],
    queryFn: async () => {
      let q = supabase
        .from('inventory')
        .select('*')
        .limit(200) // Increased limit
        .order('last_inbound_at', { ascending: false }); // Sort by inbound time

      // Data Isolation for Client
      if (user?.role === 'client') {
         q = q.eq('client', user.username);
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user, // Only run if user is loaded
  });

  // 纯前端过滤
  const filtered = inventory.filter(i => {
    const matchText = (i.sku||'').toLowerCase().includes(filter.toLowerCase()) || 
                      (i.client||'').toLowerCase().includes(filter.toLowerCase()) || 
                      (i.location||'').toLowerCase().includes(filter.toLowerCase());
    
    // Filter New: Inbound within 30 days
    let matchNew = true;
    if (filterNew && i.last_inbound_at) {
        const inboundDate = new Date(i.last_inbound_at);
        const diffDays = (new Date().getTime() - inboundDate.getTime()) / (1000 * 3600 * 24);
        matchNew = diffDays <= 30;
    } else if (filterNew && !i.last_inbound_at) {
        matchNew = false;
    }

    // Filter Quality
    let matchQuality = true;
    if (filterQuality) {
        matchQuality = i.quality_status === filterQuality;
    }

    return matchText && matchNew && matchQuality;
  });

  const formatDate = (ts: string) => {
      if (!ts) return '-';
      return new Date(ts).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <Loader2 className="animate-spin mr-2" /> Loading Inventory...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        Failed to load inventory. Please try again.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
       {/* 顶部搜索栏 */}
       <div className="bg-white p-4 rounded-xl shadow-sm mb-4 flex flex-col gap-4">
          <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
                  <Warehouse size={24}/>
                </div>
                <h2 className="font-bold text-xl text-gray-800">{t('inv_total')}</h2>
              </div>
              
              <div className="flex items-center gap-2">
                  {/* Filters */}
                  <button 
                    onClick={() => setFilterNew(!filterNew)}
                    className={`px-3 py-1 rounded-lg text-sm font-bold border transition-colors ${filterNew ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                  >
                    🌱 30天新品
                  </button>
                  <select 
                    className="border p-1 rounded-lg text-sm bg-gray-50 outline-none"
                    value={filterQuality}
                    onChange={e => setFilterQuality(e.target.value)}
                  >
                      <option value="">所有状态</option>
                      <option value="Good">✅ 合格 (Good)</option>
                      <option value="Pending">⏳ 待检 (Pending)</option>
                      <option value="Defective">❌ 不合格 (Defective)</option>
                  </select>
              </div>
          </div>

          <div className="relative w-full">
            <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
            <input 
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 ring-orange-200 outline-none transition-all" 
              placeholder={t('inv_search_ph')}
              value={filter}
              onChange={e=>setFilter(e.target.value)}
            />
          </div>
       </div>

       {/* 数据列表 */}
       <div className="bg-white rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col">
         <div className="overflow-y-auto flex-1">
           <table className="w-full text-left">
             <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
               <tr>
                 <th className="p-4 text-sm font-bold text-gray-500 uppercase">{t('inv_sku')}</th>
                 <th className="p-4 text-sm font-bold text-gray-500 uppercase">{t('inv_client')}</th>
                 <th className="p-4 text-sm font-bold text-gray-500 uppercase">{t('inv_location')}</th>
                 <th className="p-4 text-sm font-bold text-gray-500 uppercase">状态</th>
                 <th className="p-4 text-sm font-bold text-gray-500 uppercase">入库时间</th>
                 <th className="p-4 text-sm font-bold text-gray-500 uppercase text-right">{t('inv_qty')}</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
               {filtered.map(item => (
                 <tr key={item.id} className="hover:bg-orange-50 transition-colors group">
                   <td className="p-4 font-mono font-bold text-gray-800">{item.sku}</td>
                   <td className="p-4">
                     <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold group-hover:bg-blue-200 transition-colors">
                       {item.client}
                     </span>
                   </td>
                   <td className="p-4 font-bold text-gray-600">{item.location || '-'}</td>
                   <td className="p-4">
                        {item.quality_status === 'Good' && <span className="text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded">合格</span>}
                        {item.quality_status === 'Pending' && <span className="text-yellow-600 font-bold text-xs bg-yellow-50 px-2 py-1 rounded">待检</span>}
                        {item.quality_status === 'Defective' && <span className="text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded">不合格</span>}
                        {!item.quality_status && <span className="text-gray-400 text-xs">-</span>}
                   </td>
                   <td className="p-4 text-sm text-gray-500 font-mono">
                       {formatDate(item.last_inbound_at)}
                   </td>
                   <td className="p-4 text-right">
                     <span className="font-bold text-lg text-orange-600">{item.qty}</span>
                   </td>
                 </tr>
               ))}
               {filtered.length === 0 && (
                 <tr>
                   <td colSpan={6} className="p-10 text-center text-gray-400 flex flex-col items-center gap-2">
                     <Search size={32} className="text-gray-200"/>
                     {t('not_found')}
                   </td>
                 </tr>
               )}
             </tbody>
           </table>
         </div>
         <div className="p-2 bg-gray-50 border-t text-xs text-gray-400 text-center">
            显示最近 {filtered.length} 条记录 (实时同步中)
         </div>
       </div>
    </div>
  );
}