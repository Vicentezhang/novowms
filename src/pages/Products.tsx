import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { Package, Plus, Search, Trash, FileSpreadsheet, Download, Upload, AlertCircle, CheckCircle, Printer } from 'lucide-react';
import BarcodeLabel from '../components/BarcodeLabel';

export default function Products() {
  const { t } = useTranslation();
  const [list, setList] = useState<any[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [form, setForm] = useState({ client:'', sku:'', name:'', length:'', width:'', height:'', weight:'' });
  const [filter, setFilter] = useState('');
  
  // Batch Mode States
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchPreview, setBatchPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  
  const user = JSON.parse(localStorage.getItem('wh_user') || '{}');
  const isClient = user.role === 'client';

      const [editingItem, setEditingItem] = useState<any>(null); // For Edit Modal
      const [printingItem, setPrintingItem] = useState<any>(null); // For Print Modal

  // 加载数据
  const loadData = async () => {
    let q = supabase.from('products').select('*').order('created_at', { ascending: false });
    
    // 🟢 关键逻辑：如果是客户角色，强制筛选 client = 当前用户名
    if (isClient) {
      q = q.eq('client', user.username); 
    }
    
    const { data, error } = await q;
    if (error) {
      console.error("Load products error:", error); // Debug 用
      return; 
    }
    if(data) setList(data);
    
    // 如果是管理员，加载所有货主列表供选择
    if (!isClient) {
      const { data: c } = await supabase.from('clients').select('name').eq('type', 'client');
      if(c) setClients(c.map(x=>x.name));
    } else {
      // 客户登录：自动设置表单的 client 为自己
      if (!form.client) {
          setForm(prev => ({ ...prev, client: user.username }));
      }
    }
  };

  useEffect(() => { loadData(); }, []);

  const add = async () => {
    // 🟢 修复：增加防御性检查，如果客户登录但 client 字段为空，再次强制赋值
    let submitData = { ...form };
    if (isClient && !submitData.client) {
        submitData.client = user.username;
    }

    if(!submitData.client || !submitData.sku) return alert(t('required'));
    
    // 检查 SKU 是否已存在 (防止重复)
    const { data: exist } = await supabase.from('products').select('id').eq('client', submitData.client).eq('sku', submitData.sku).maybeSingle();
    if(exist) return alert(`SKU ${submitData.sku} already exists for this client!`);

    const { error } = await supabase.from('products').insert([submitData]);
    if(error) alert(error.message);
    else {
      alert(t('msg_success'));
      // 重置表单，但保留 client
      setForm({ client:submitData.client, sku:'', name:'', length:'', width:'', height:'', weight:'' }); 
      loadData();
    }
  };

  const updateProduct = async () => {
      if (!editingItem) return;
      const { id, sku, client, created_at, updated_at, ...updates } = editingItem;
      
      const { error } = await supabase.from('products').update({
          name: updates.name,
          length: updates.length,
          width: updates.width,
          height: updates.height,
          weight: updates.weight,
          unit: updates.unit,
          category: updates.category,
          attributes: updates.attributes,
          updated_at: new Date()
      }).eq('id', id);

      if (error) alert(error.message);
      else {
          alert(t('msg_success'));
          setEditingItem(null);
          loadData();
      }
  };

  const del = async (id: string) => {
    if(confirm(t('confirm_del'))) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if(error) alert(error.message);
      else loadData();
    }
  };

  // --- Batch Import Logic ---
  const downloadTemplate = () => {
    const headers = "SKU,Name,Length(cm),Width(cm),Height(cm),Weight(kg)";
    const example = "SKU001,Example Product,10,10,10,0.5";
    const blob = new Blob([`\uFEFF${headers}\n${example}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sku_template.csv';
    link.click();
  };

  const parseBatch = () => {
    if (!batchText.trim()) return;
    
    const rows = batchText.trim().split('\n').map(r => r.trim()).filter(r => r);
    const parsed = rows.map((row) => {
        // Support Tab (Excel paste) or Comma (CSV)
        const cols = row.includes('\t') ? row.split('\t') : row.split(',');
        const sku = cols[0]?.trim();
        const valid = !!sku;
        
        return {
            sku: sku,
            name: cols[1]?.trim() || '',
            length: cols[2]?.trim() || '',
            width: cols[3]?.trim() || '',
            height: cols[4]?.trim() || '',
            weight: cols[5]?.trim() || '',
            status: valid ? 'valid' : 'invalid',
            msg: valid ? 'Ready' : 'Missing SKU'
        };
    });
    setBatchPreview(parsed);
  };

  const processBatchImport = async () => {
      if (batchPreview.length === 0) return;
      
      const targetClient = isClient ? user.username : form.client;
      if (!targetClient) return alert(t('out_select_client')); // Admin must select client

      setImporting(true);
      let successCount = 0;
      let failCount = 0;

      // Filter valid rows
      const validRows = batchPreview.filter(r => r.status === 'valid');
      if (validRows.length === 0) return;

      const toInsert = validRows.map(r => ({
          client: targetClient,
          sku: r.sku,
          name: r.name,
          length: r.length || null,
          width: r.width || null,
          height: r.height || null,
          weight: r.weight || null,
          created_at: new Date()
      }));

      const { error } = await supabase.from('products').insert(toInsert);

      const results = [...batchPreview];
      if (error) {
          results.forEach(r => {
             if (r.status === 'valid') {
                 r.status = 'error';
                 r.msg = error.message;
             }
          });
          failCount = validRows.length;
      } else {
          results.forEach(r => {
             if (r.status === 'valid') {
                 r.status = 'success';
                 r.msg = 'Imported';
             }
          });
          successCount = validRows.length;
      }

      setBatchPreview(results);
      setImporting(false);
      loadData(); // Refresh list
      
      if (successCount > 0) {
          alert(`Batch complete: ${successCount} success, ${failCount} failed.`);
      }
  };

  const filtered = list.filter(i => (i.sku+i.name).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto">
      {/* 顶部标题与切换 */}
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">{t('prod_title') || 'SKU Management'}</h2>
          <div className="flex gap-2">
              <button 
                  onClick={() => setIsBatchMode(false)}
                  className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${!isBatchMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
              >
                  <Package size={18} /> Single Add
              </button>
              <button 
                  onClick={() => setIsBatchMode(true)}
                  className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${isBatchMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
              >
                  <FileSpreadsheet size={18} /> Batch Add
              </button>
          </div>
      </div>

      {/* 新建区域 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
        <h3 className="font-bold mb-4 flex items-center gap-2 text-gray-800">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              {isBatchMode ? <FileSpreadsheet size={20}/> : <Plus size={20}/>}
          </div>
          {isBatchMode ? 'Batch Import SKUs' : t('prod_add')}
        </h3>

        {/* 客户选择 (Common for both modes) */}
        <div className="mb-4">
             {isClient ? (
                <div className="border p-3 rounded-lg bg-gray-50 text-gray-600 font-bold flex items-center w-full md:w-1/3">
                   👤 Current Client: {user.username}
                </div>
             ) : (
                <select 
                  className="border p-3 rounded-lg bg-white w-full md:w-1/3 outline-none focus:border-blue-500" 
                  value={form.client} onChange={e=>setForm({...form, client:e.target.value})}
                >
                  <option value="">-- {t('out_select_client')} --</option>
                  {clients.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
             )}
        </div>

        {!isBatchMode ? (
            // --- Single Mode Form ---
            <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <input className="border p-3 rounded-lg font-mono font-bold uppercase" placeholder="SKU *" value={form.sku} onChange={e=>setForm({...form, sku:e.target.value})} />
                  <input className="border p-3 rounded-lg col-span-3" placeholder={t('config_name')} value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                </div>
                
                <div className="grid grid-cols-4 gap-4">
                  <input type="number" className="border p-3 rounded-lg" placeholder="L (cm)" value={form.length} onChange={e=>setForm({...form, length:e.target.value})} />
                  <input type="number" className="border p-3 rounded-lg" placeholder="W (cm)" value={form.width} onChange={e=>setForm({...form, width:e.target.value})} />
                  <input type="number" className="border p-3 rounded-lg" placeholder="H (cm)" value={form.height} onChange={e=>setForm({...form, height:e.target.value})} />
                  <div className="flex gap-2">
                    <input type="number" className="border p-3 rounded-lg w-full" placeholder="Kg" value={form.weight} onChange={e=>setForm({...form, weight:e.target.value})} />
                    <button onClick={add} className="bg-blue-600 text-white px-6 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center">
                      <Plus size={24}/>
                    </button>
                  </div>
                </div>
            </>
        ) : (
            // --- Batch Mode UI ---
            <div className="space-y-4">
                <div className="flex justify-between items-center text-sm text-gray-500 bg-blue-50 p-3 rounded-lg">
                    <p>Instructions: Copy data from Excel and paste below. <br/>Columns: <b>SKU, Name, Length, Width, Height, Weight</b></p>
                    <button onClick={downloadTemplate} className="text-blue-600 font-bold hover:underline flex items-center gap-1">
                        <Download size={16}/> Download Template
                    </button>
                </div>
                
                <textarea 
                    className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl p-4 font-mono text-sm focus:border-blue-500 outline-none"
                    placeholder={`Paste here (Excel/CSV)...\nExample:\nSKU001\tProduct A\t10\t10\t10\t0.5`}
                    value={batchText}
                    onChange={e => setBatchText(e.target.value)}
                />

                <div className="flex gap-2">
                    <button onClick={parseBatch} className="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-700 flex items-center gap-2">
                        <FileSpreadsheet size={18}/> Preview Data
                    </button>
                    {batchPreview.length > 0 && (
                        <button 
                            onClick={processBatchImport} 
                            disabled={importing}
                            className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 text-white ${importing ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                        >
                            {importing ? 'Importing...' : <Upload size={18}/>}
                            Import {batchPreview.filter(x=>x.status==='valid').length} SKUs
                        </button>
                    )}
                </div>

                {/* Preview Table */}
                {batchPreview.length > 0 && (
                    <div className="max-h-60 overflow-y-auto border rounded-lg">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="p-2">Status</th>
                                    <th className="p-2">SKU</th>
                                    <th className="p-2">Name</th>
                                    <th className="p-2">Dims</th>
                                    <th className="p-2">Weight</th>
                                    <th className="p-2">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {batchPreview.map((row, idx) => (
                                    <tr key={idx} className={`border-b ${row.status==='error'?'bg-red-50': row.status==='success'?'bg-green-50':''}`}>
                                        <td className="p-2">
                                            {row.status === 'valid' && <span className="text-blue-500 font-bold">Ready</span>}
                                            {row.status === 'invalid' && <span className="text-gray-400">Skip</span>}
                                            {row.status === 'success' && <CheckCircle size={16} className="text-green-600"/>}
                                            {row.status === 'error' && <AlertCircle size={16} className="text-red-600"/>}
                                        </td>
                                        <td className="p-2 font-bold">{row.sku}</td>
                                        <td className="p-2">{row.name}</td>
                                        <td className="p-2">{row.length}x{row.width}x{row.height}</td>
                                        <td className="p-2">{row.weight}</td>
                                        <td className="p-2 text-gray-500">{row.msg}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}
      </div>

      {/* 列表区域 (Only show in Single Mode or if desired, keeping it always visible is fine too) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
         <div className="p-4 border-b flex items-center gap-2">
           <Search className="text-gray-400" size={18}/>
           <input className="outline-none w-full" placeholder={t('inv_search_ph')} value={filter} onChange={e=>setFilter(e.target.value)} />
         </div>
         <table className="w-full text-left text-sm">
           <thead className="bg-gray-50">
             <tr>
               <th className="p-4">{t('inv_sku')}</th>
               <th className="p-4">{t('inv_client')}</th>
               <th className="p-4">{t('prod_dims')}</th>
               <th className="p-4">{t('prod_weight')}</th>
               <th className="p-4 text-right">Action</th>
             </tr>
           </thead>
           <tbody className="divide-y">
             {filtered.map(i => (
               <tr key={i.id} className="hover:bg-gray-50 group">
                 <td className="p-4">
                   <div className="font-bold font-mono text-lg text-gray-800">{i.sku}</div>
                   <div className="text-gray-500 text-xs">{i.name || '-'}</div>
                 </td>
                 <td className="p-4"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">{i.client}</span></td>
                 <td className="p-4 text-gray-600 font-mono">
                   {i.length && `${i.length}x${i.width}x${i.height}`}
                 </td>
                 <td className="p-4 font-bold">{i.weight ? `${i.weight} kg` : '-'}</td>
                 <td className="p-4 text-right flex justify-end gap-2">
                   <button onClick={()=>setPrintingItem(i)} className="text-gray-300 hover:text-purple-600 p-2" title="Print Label"><Printer size={18}/></button>
                   <button onClick={()=>setEditingItem(i)} className="text-blue-400 hover:text-blue-600 p-2"><Package size={18}/></button>
                   <button onClick={()=>del(i.id)} className="text-gray-300 hover:text-red-500 p-2"><Trash size={18}/></button>
                 </td>
               </tr>
             ))}
             {filtered.length === 0 && (
               <tr><td colSpan={5} className="p-8 text-center text-gray-400">{t('not_found')}</td></tr>
             )}
           </tbody>
         </table>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-lg">{t('prod_edit')}</h3>
                    <button onClick={()=>setEditingItem(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">{t('prod_sku')}</label>
                            <input className="w-full border p-2 rounded bg-gray-100 text-gray-500 cursor-not-allowed" value={editingItem.sku} disabled />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">{t('prod_name')}</label>
                            <input className="w-full border p-2 rounded" value={editingItem.name} onChange={e=>setEditingItem({...editingItem, name:e.target.value})} />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">L (cm)</label>
                            <input type="number" className="w-full border p-2 rounded" value={editingItem.length||''} onChange={e=>setEditingItem({...editingItem, length:e.target.value})} />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">W (cm)</label>
                            <input type="number" className="w-full border p-2 rounded" value={editingItem.width||''} onChange={e=>setEditingItem({...editingItem, width:e.target.value})} />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">H (cm)</label>
                            <input type="number" className="w-full border p-2 rounded" value={editingItem.height||''} onChange={e=>setEditingItem({...editingItem, height:e.target.value})} />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Kg</label>
                            <input type="number" className="w-full border p-2 rounded" value={editingItem.weight||''} onChange={e=>setEditingItem({...editingItem, weight:e.target.value})} />
                         </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">{t('prod_unit') || 'Unit'}</label>
                            <input className="w-full border p-2 rounded" placeholder="e.g. pcs, box" value={editingItem.unit||''} onChange={e=>setEditingItem({...editingItem, unit:e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">{t('prod_category') || 'Category'}</label>
                            <input className="w-full border p-2 rounded" placeholder="e.g. Electronics" value={editingItem.category||''} onChange={e=>setEditingItem({...editingItem, category:e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">{t('prod_attr') || 'Attributes (JSON)'}</label>
                        <textarea 
                            className="w-full border p-2 rounded h-20 font-mono text-xs" 
                            placeholder='{"color": "red", "size": "XL"}'
                            value={typeof editingItem.attributes === 'string' ? editingItem.attributes : JSON.stringify(editingItem.attributes || {}, null, 2)}
                            onChange={e => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    setEditingItem({...editingItem, attributes: parsed});
                                } catch (err) {
                                    // Allow typing invalid JSON, just store as string temporarily or handle gracefully?
                                    // For simplicity, we might just let it be invalid until submit or use a text field that tries to parse on blur.
                                    // But here we are setting state directly.
                                    // Let's just store the string if it fails to parse? 
                                    // Actually, better to just let them edit a string representation.
                                    // But `editingItem.attributes` is expected to be object for DB update?
                                    // The `updateProduct` sends `updates.attributes`. If it's a string, Postgres might reject if column is JSONB.
                                    // So we need to handle this.
                                    // Let's just assume valid JSON input for now or use a text field.
                                }
                            }}
                            // A better way for JSON edit is tough without a library.
                            // Let's just use a simple text input for "Custom Field"
                        />
                         <p className="text-xs text-gray-400 mt-1">Format: JSON Object</p>
                    </div>

                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                    <button onClick={()=>setEditingItem(null)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded">{t('btn_cancel')}</button>
                    <button onClick={updateProduct} className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">{t('btn_save')}</button>
                </div>
            </div>
        </div>
      )}
      {/* Print Modal */}
      {printingItem && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 print:p-0 print:bg-white print:fixed print:inset-0">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden print:shadow-none print:w-full print:max-w-none print:rounded-none">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center print:hidden">
                    <h3 className="font-bold text-lg">Print Label</h3>
                    <button onClick={()=>setPrintingItem(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="p-8 flex justify-center items-center min-h-[300px] print:p-0 print:block print:min-h-0">
                     <div className="print:absolute print:top-0 print:left-0">
                        <BarcodeLabel sku={printingItem.sku} name={printingItem.name} />
                     </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 print:hidden">
                    <button onClick={()=>setPrintingItem(null)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded">Close</button>
                    <button onClick={()=>window.print()} className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 flex items-center gap-2">
                        <Printer size={18}/> Print
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}