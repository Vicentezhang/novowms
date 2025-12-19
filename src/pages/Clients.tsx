import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { Tag, Truck, Layers, Smartphone, Plus, Trash } from 'lucide-react';

const TABS = [
  { key: 'client', label: 'config_client', icon: <Tag size={16}/> },
  { key: 'carrier', label: 'config_carrier', icon: <Truck size={16}/> },
  { key: 'category', label: 'config_cat', icon: <Layers size={16}/> },
  { key: 'brand', label: 'config_brand', icon: <Smartphone size={16}/> },
];

export default function Clients() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('client');
  const [list, setList] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [defLoc, setDefLoc] = useState('');

  const fetchList = async () => {
    let query = supabase.from('clients').select('*');
    // 兼容逻辑：如果是 client，查 type='client' 或 null
    if (activeTab === 'client') query = query.in('type', ['client', null]);
    else query = query.eq('type', activeTab);
    
    const { data } = await query;
    if (data) setList(data.sort((a,b)=>(a.name||'').localeCompare(b.name||'')));
  };

  useEffect(() => { fetchList(); }, [activeTab]);

  const add = async () => {
    if(!newName.trim()) return;
    await supabase.from('clients').insert([{ 
      type: activeTab, 
      name: newName.trim(), 
      default_location: defLoc.trim() 
    }]);
    setNewName(''); setDefLoc('');
    fetchList();
  };

  const del = async (id: string) => { 
    if(confirm(t('confirm_del'))) {
      await supabase.from('clients').delete().eq('id', id);
      fetchList();
    }
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto">
      {/* 顶部标签页 */}
      <div className="flex overflow-x-auto bg-white border rounded-xl p-2 gap-2 mb-4 shadow-sm">
        {TABS.map(tab => (
          <button 
            key={tab.key} 
            onClick={() => setActiveTab(tab.key)} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
              activeTab === tab.key 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {tab.icon} {t(tab.label)}
          </button>
        ))}
      </div>

      {/* 添加区域 */}
      <div className="bg-white p-4 rounded-xl shadow-sm mb-4 flex gap-3 items-center">
         <input 
           value={newName} 
           onChange={e=>setNewName(e.target.value)} 
           placeholder={t('config_name')} 
           className="flex-1 border-2 border-gray-200 p-2 rounded-lg outline-none focus:border-blue-500 transition-colors"
         />
         {activeTab === 'client' && (
           <input 
             value={defLoc} 
             onChange={e=>setDefLoc(e.target.value)} 
             placeholder={t('config_def_loc')} 
             className="w-32 border-2 border-gray-200 p-2 rounded-lg outline-none focus:border-blue-500 transition-colors"
           />
         )}
         <button 
           onClick={add} 
           className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-green-700 flex items-center gap-2 shadow-lg active:scale-95 transition-all"
         >
           <Plus size={18}/> {t('config_add')}
         </button>
      </div>

      {/* 列表区域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pb-10">
          {list.map(item => (
            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-transparent hover:border-blue-200 hover:shadow-md transition-all flex justify-between items-center group">
              <div>
                <div className="font-bold text-gray-800 text-lg">{item.name}</div>
                {item.default_location && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded mt-1 inline-block font-mono">
                    📍 {item.default_location}
                  </span>
                )}
              </div>
              <button 
                onClick={()=>del(item.id)} 
                className="text-gray-300 hover:text-red-500 p-2 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash size={18}/>
              </button>
            </div>
          ))}
          {list.length === 0 && (
            <div className="col-span-full text-center text-gray-400 py-10">暂无数据</div>
          )}
      </div>
    </div>
  );
}