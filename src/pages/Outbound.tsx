import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { Truck, Plus, CheckCircle, Trash, Paperclip, FileText, FileSpreadsheet, Download, Upload, AlertCircle } from 'lucide-react';
import OutboundProcess from '../components/OutboundProcess';
import type { OutboundOrder } from '../types';

export default function Outbound() {
  const { t } = useTranslation();
  const user = JSON.parse(localStorage.getItem('wh_user') || '{}');
  const isClient = user.role === 'client';
  
  const [view, setView] = useState('list');
  const [orders, setOrders] = useState<OutboundOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OutboundOrder | null>(null);
  
  // 表单状态
  const [form, setForm] = useState({ 
    orderNo: '', 
    client: '', 
    carrier: '', 
    remark: '',
    service_type: 'STANDARD', // 'STANDARD' | 'RELABEL'
    attachments: [] as File[] 
  });
  const [items, setItems] = useState<{sku:string, qty:number, new_fnsku?:string}[]>([]); // Added new_fnsku
  const [skuInput, setSkuInput] = useState('');
  const [qtyInput, setQtyInput] = useState(1);
  const [newFnskuInput, setNewFnskuInput] = useState(''); // New input for FNSKU
  const [clients, setClients] = useState<string[]>([]);

  // 批量导入状态
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchPreview, setBatchPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  
  useEffect(() => {
    fetchOrders();
    if(!isClient) loadClients();
    else setForm(f => ({...f, client: user.username}));
  }, []);

  const fetchOrders = async () => {
    let q = supabase.from('outbound_orders').select('*').order('created_at', { ascending: false });
    if (isClient) q = q.eq('client', user.username);
    const { data } = await q;
    if(data) setOrders(data);
  };

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('name').eq('type', 'client');
    if(data) setClients(data.map(d=>d.name));
  };

  // 附件处理
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      // 校验
      const validFiles = files.filter(f => {
         const isZip = f.name.endsWith('.zip') || f.name.endsWith('.rar');
         const isSizeOk = f.size <= 5 * 1024 * 1024; // 5MB
         return isZip && isSizeOk;
      });
      
      if (validFiles.length !== files.length) {
        alert('部分文件不符合要求：仅支持 .zip/.rar 且小于 5MB');
      }

      if (form.attachments.length + validFiles.length > 3) {
        alert('最多上传 3 个附件');
        return;
      }

      setForm(prev => ({ ...prev, attachments: [...prev.attachments, ...validFiles] }));
    }
  };

  // 添加商品 + 库存校验 (单条添加)
  const addItem = async () => {
    if(!skuInput) return;
    
    // 如果是换标服务，必须填新标签
    if (form.service_type === 'RELABEL' && !newFnskuInput) {
        alert('换标服务必须填写新的 FNSKU / 标签号');
        return;
    }

    // 校验库存
    const { data: stockData } = await supabase
      .from('inventory')
      .select('qty')
      .eq('client', form.client) // 必须查该客户的库存
      .eq('sku', skuInput);
      
    const totalStock = stockData?.reduce((sum, row) => sum + row.qty, 0) || 0;
    const currentAdded = items.find(i=>i.sku===skuInput)?.qty || 0;
    
    if (totalStock < (currentAdded + qtyInput)) {
      alert(`${t('out_stock_fail')} ${totalStock}`);
      return;
    }

    const existing = items.find(i=>i.sku===skuInput);
    if(existing) {
      setItems(items.map(i=>i.sku===skuInput ? {...i, qty: i.qty+qtyInput, new_fnsku: newFnskuInput || i.new_fnsku} : i));
    } else {
      setItems([...items, { sku: skuInput, qty: qtyInput, new_fnsku: newFnskuInput }]);
    }
    setSkuInput(''); setQtyInput(1); setNewFnskuInput('');
  };

  // --- 批量导入逻辑 ---
  const downloadTemplate = () => {
    const headers = "SKU,Quantity";
    const example = "SKU001,10";
    const blob = new Blob([`\uFEFF${headers}\n${example}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'outbound_template.csv';
    link.click();
  };

  const parseBatch = async () => {
    if (!batchText.trim()) return;
    if (!form.client) return alert(t('out_select_client'));
    
    setImporting(true);
    const rows = batchText.trim().split('\n').map(r => r.trim()).filter(r => r);
    const parsed = [];

    // 预加载该客户的所有库存 (一次性查询优化性能)
    // 注意：如果是超大客户，可能需要分批或改为单条查。这里假设 SKU 数量可控。
    const { data: allStock } = await supabase
        .from('inventory')
        .select('sku, qty')
        .eq('client', form.client);
    
    const stockMap = new Map();
    if (allStock) {
        allStock.forEach(s => {
            stockMap.set(s.sku, (stockMap.get(s.sku) || 0) + s.qty);
        });
    }

    // 检查已添加列表中的占用
    const currentItemsMap = new Map();
    items.forEach(i => {
        currentItemsMap.set(i.sku, (currentItemsMap.get(i.sku) || 0) + i.qty);
    });

    for (let row of rows) {
        const cols = row.includes('\t') ? row.split('\t') : row.split(',');
        const sku = cols[0]?.trim();
        const qty = parseInt(cols[1]?.trim() || '0');
        
        let status = 'valid';
        let msg = 'Ready';

        if (!sku) {
            status = 'invalid';
            msg = 'Missing SKU';
        } else if (isNaN(qty) || qty <= 0) {
            status = 'error';
            msg = 'Invalid Qty';
        } else {
            // 校验库存
            const available = stockMap.get(sku) || 0;
            const currentUsed = currentItemsMap.get(sku) || 0;
            if (available < (currentUsed + qty)) {
                status = 'error';
                msg = `Stock Low: ${available} (Used: ${currentUsed})`;
            } else {
                // 预占用库存，防止同批次后续校验失败
                currentItemsMap.set(sku, currentUsed + qty);
            }
        }

        parsed.push({ sku, qty, status, msg });
    }
    
    setBatchPreview(parsed);
    setImporting(false);
  };

  const confirmBatchImport = () => {
      const validRows = batchPreview.filter(r => r.status === 'valid');
      if (validRows.length === 0) return;

      const newItems = [...items];
      validRows.forEach(r => {
          const existing = newItems.find(i => i.sku === r.sku);
          if (existing) {
              existing.qty += r.qty;
          } else {
              newItems.push({ sku: r.sku, qty: r.qty });
          }
      });

      setItems(newItems);
      setIsBatchMode(false);
      setBatchText('');
      setBatchPreview([]);
      alert(`成功导入 ${validRows.length} 条明细`);
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'WAIT_LABEL_DATA': return 'bg-orange-100 text-orange-700';
          case 'WAIT_CLIENT_LABEL': return 'bg-yellow-100 text-yellow-700';
          case 'PROCESSING': return 'bg-blue-100 text-blue-700';
          case 'SHIPPED': return 'bg-green-100 text-green-700';
          default: return 'bg-gray-100 text-gray-700';
      }
  };

  const submit = async () => {
    if(!form.orderNo || !form.client || items.length === 0) return alert(t('required'));
    
    try {
      // 1. 上传附件 (Mock: 假设上传到了 Storage 并返回 URL)
      // 真实环境需要 supabase.storage.from('...').upload(...)
      const attachmentUrls = form.attachments.map(f => `https://mock-storage.com/${form.orderNo}/${f.name}`);

      // 2. 创建订单
      const { data: order, error } = await supabase.from('outbound_orders').insert([{
        order_no: form.orderNo,
        client: form.client,
        carrier: form.carrier,
        status: form.service_type === 'RELABEL' ? 'WAIT_LABEL_DATA' : 'PROCESSING', // Standard -> PROCESSING (Wait for ship)
        service_type: form.service_type, 
        remark: form.remark,
        attachments: attachmentUrls,
        shipped_at: null 
      }]).select().single();
      
      if(error) throw error;

      // 3. 插入明细
      await supabase.from('outbound_items').insert(items.map(i => ({ 
          order_id: order.id, 
          sku: i.sku, 
          qty: i.qty,
          new_fnsku: i.new_fnsku 
      })));

      // 4. 库存扣减逻辑移至 Confirm Ship (OutboundProcess)
      // Standard 订单现在也需要操作员点击 "Confirm Ship" 才能扣减库存

      alert(t('msg_success'));
      setView('list'); setItems([]); setForm({ orderNo:'', client:'', carrier:'', remark:'', attachments: [], service_type: 'STANDARD' }); fetchOrders();
    } catch(e: any) {
      alert(t('msg_error') + e.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col">
      {view === 'list' && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
              <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Truck size={24}/></div> 
              {t('out_title')}
            </h2>
            <button onClick={()=>setView('create')} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2">
              <Plus size={20}/> {t('out_create')}
            </button>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
             <table className="w-full text-left">
               <thead className="bg-gray-50 border-b">
                 <tr>
                   <th className="p-4">{t('out_order_no')}</th>
                   <th className="p-4">{t('out_select_client')}</th>
                   <th className="p-4">Status</th>
                   <th className="p-4">Remark</th>
                   <th className="p-4 text-right">Date</th>
                 </tr>
               </thead>
               <tbody className="divide-y">
                 {orders.map(o => (
                   <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedOrder(o)}>
                     <td className="p-4 font-bold font-mono text-blue-600">{o.order_no}</td>
                     <td className="p-4"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-bold">{o.client}</span></td>
                     <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${getStatusColor(o.status || '')}`}>{o.status}</span>
                        {o.service_type === 'RELABEL' && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1 rounded font-bold">换标</span>}
                     </td>
                     <td className="p-4 text-sm text-gray-500 max-w-xs truncate">{o.remark}</td>
                     <td className="p-4 text-right text-sm text-gray-500">{new Date(o.created_at || '').toLocaleDateString()}</td>
                   </tr>
                   ))}
               </tbody>
             </table>
          </div>
        </>
      )}

      {selectedOrder && (
          <OutboundProcess 
            order={selectedOrder} 
            onClose={() => setSelectedOrder(null)} 
            onUpdate={() => {
                setSelectedOrder(null);
                fetchOrders();
            }}
            userRole={user.role}
          />
      )}

      {view === 'create' && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col h-full overflow-hidden">
           <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-700">{t('out_create')}</h3>
              <button onClick={()=>setView('list')} className="text-gray-400 hover:text-gray-800 px-4">{t('btn_cancel')}</button>
           </div>
           
           <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1">{t('out_order_no')}</label>
                   <input className="w-full border-2 p-3 rounded-xl outline-blue-500" value={form.orderNo} onChange={e=>setForm({...form, orderNo:e.target.value})} placeholder="SO-2025-001" />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1">{t('out_select_client')}</label>
                   {isClient ? (
                     <div className="w-full border-2 p-3 rounded-xl bg-gray-100 text-gray-500 font-bold">{user.username}</div>
                   ) : (
                     <select className="w-full border-2 p-3 rounded-xl bg-white outline-blue-500" value={form.client} onChange={e=>setForm({...form, client:e.target.value})}>
                        <option value="">-- Select --</option>
                        {clients.map(c=><option key={c} value={c}>{c}</option>)}
                     </select>
                   )}
                 </div>
              </div>

              {/* Service Type Selection */}
              <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">出库服务类型</label>
                  <div className="flex gap-4">
                      <button 
                          onClick={() => setForm({...form, service_type: 'STANDARD'})}
                          className={`flex-1 p-4 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${
                              form.service_type === 'STANDARD' ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'border-gray-200 text-gray-500'
                          }`}
                      >
                          <Truck size={20}/> 标准出库 (直接发货)
                      </button>
                      <button 
                          onClick={() => setForm({...form, service_type: 'RELABEL'})}
                          className={`flex-1 p-4 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${
                              form.service_type === 'RELABEL' ? 'border-purple-500 bg-purple-50 text-purple-700 font-bold' : 'border-gray-200 text-gray-500'
                          }`}
                      >
                          <FileText size={20}/> 换标服务 (需回传标签)
                      </button>
                  </div>
              </div>

              {/* 备注字段 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">备注 (Max 500 chars)</label>
                <textarea 
                  className="w-full border-2 p-3 rounded-xl outline-blue-500 h-20 resize-none" 
                  value={form.remark}
                  maxLength={500}
                  onChange={e=>setForm({...form, remark:e.target.value})}
                  placeholder="请输入出库备注..."
                />
                <div className="text-right text-xs text-gray-400">{form.remark.length}/500</div>
              </div>

              {/* 附件上传 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">附件 (.zip/.rar, Max 5MB, Limit 3)</label>
                <div className="border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center bg-gray-50">
                  <input type="file" id="file-upload" multiple accept=".zip,.rar" onChange={handleFileChange} className="hidden" />
                  <label htmlFor="file-upload" className="cursor-pointer bg-white border px-4 py-2 rounded shadow-sm text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                    <Paperclip size={16}/> 选择文件
                  </label>
                  <div className="mt-3 space-y-2 w-full">
                    {form.attachments.map((f, i) => (
                      <div key={i} className="flex justify-between items-center text-sm bg-white p-2 rounded border">
                        <span className="truncate flex items-center gap-2"><FileText size={14}/> {f.name}</span>
                        <button onClick={()=>setForm(prev => ({...prev, attachments: prev.attachments.filter((_, idx)=>idx!==i)}))} className="text-red-400"><Trash size={14}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {form.client && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                   {/* 切换模式按钮 */}
                   <div className="flex justify-end mb-2">
                        <button 
                            onClick={() => setIsBatchMode(!isBatchMode)}
                            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                            {isBatchMode ? <Plus size={14}/> : <FileSpreadsheet size={14}/>}
                            {isBatchMode ? "切换回单条添加" : "切换到批量导入"}
                        </button>
                   </div>

                   {!isBatchMode ? (
                       <div className="flex flex-col gap-2">
                           <div className="flex gap-2 items-end">
                              <div className="flex-1">
                                <label className="block text-xs font-bold text-blue-600 mb-1">SKU</label>
                                <input className="w-full border p-2 rounded-lg" value={skuInput} onChange={e=>setSkuInput(e.target.value)} placeholder="Scan SKU" />
                              </div>
                              <div className="w-24">
                                <label className="block text-xs font-bold text-blue-600 mb-1">Qty</label>
                                <input type="number" className="w-full border p-2 rounded-lg" value={qtyInput} onChange={e=>setQtyInput(Number(e.target.value))} />
                              </div>
                              <button onClick={addItem} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700">{t('btn_add')}</button>
                           </div>
                           
                           {/* New FNSKU Input for Relabeling */}
                           {form.service_type === 'RELABEL' && (
                               <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 animate-fadeIn">
                                   <label className="block text-xs font-bold text-purple-700 mb-1">目标 FNSKU (New Label)</label>
                                   <input 
                                     className="w-full border p-2 rounded-lg font-mono text-purple-800" 
                                     value={newFnskuInput} 
                                     onChange={e=>setNewFnskuInput(e.target.value)} 
                                     placeholder="输入新的 FNSKU / 标签号"
                                   />
                               </div>
                           )}
                       </div>
                   ) : (
                       // 批量导入界面 (保持与Products.tsx一致的风格)
                       <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs text-gray-500">
                                <p>请从Excel复制并粘贴。列格式：<b>SKU, 数量</b></p>
                                <button onClick={downloadTemplate} className="text-blue-600 font-bold hover:underline flex items-center gap-1">
                                    <Download size={14}/> 下载模板
                                </button>
                            </div>
                            <textarea 
                                className="w-full h-24 border-2 border-dashed border-blue-200 rounded-lg p-3 font-mono text-xs focus:border-blue-500 outline-none"
                                placeholder={`粘贴Excel数据...\n示例:\nSKU001\t10`}
                                value={batchText}
                                onChange={e => setBatchText(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button onClick={parseBatch} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-700 flex items-center gap-2">
                                    <FileSpreadsheet size={14}/> 预览并校验库存
                                </button>
                                {batchPreview.length > 0 && (
                                    <button 
                                        onClick={confirmBatchImport} 
                                        disabled={importing}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700 flex items-center gap-2"
                                    >
                                        <Upload size={14}/> 确认导入 ({batchPreview.filter(x=>x.status==='valid').length})
                                    </button>
                                )}
                            </div>
                            {/* 预览结果 */}
                            {batchPreview.length > 0 && (
                                <div className="max-h-40 overflow-y-auto border rounded bg-white">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr><th className="p-2">状态</th><th className="p-2">SKU</th><th className="p-2">数量</th><th className="p-2">信息</th></tr>
                                        </thead>
                                        <tbody>
                                            {batchPreview.map((row, idx) => (
                                                <tr key={idx} className={`border-b ${row.status==='error'?'bg-red-50':''}`}>
                                                    <td className="p-2">
                                                        {row.status==='valid' ? <CheckCircle size={14} className="text-green-600"/> : <AlertCircle size={14} className="text-red-600"/>}
                                                    </td>
                                                    <td className="p-2 font-bold">{row.sku}</td>
                                                    <td className="p-2">{row.qty}</td>
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
              )}

              <div>
                 <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                       <thead className="bg-gray-100">
                           <tr>
                               <th className="p-3">SKU</th>
                               {form.service_type === 'RELABEL' && <th className="p-3">新标签 (FNSKU)</th>}
                               <th className="p-3 text-right">Qty</th>
                               <th className="p-3 w-10"></th>
                           </tr>
                       </thead>
                       <tbody className="divide-y">
                          {items.map((it, idx) => (
                             <tr key={idx}>
                               <td className="p-3 font-mono font-bold">{it.sku}</td>
                               {form.service_type === 'RELABEL' && <td className="p-3 font-mono text-purple-700">{it.new_fnsku || '-'}</td>}
                               <td className="p-3 text-right font-bold">{it.qty}</td>
                               <td className="p-3"><button onClick={()=>setItems(items.filter((_,i)=>i!==idx))} className="text-red-400"><Trash size={16}/></button></td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>

           <div className="p-4 border-t bg-gray-50">
              <button onClick={submit} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all flex justify-center gap-2">
                 <CheckCircle/> {t('out_btn_ship')}
              </button>
           </div>
        </div>
      )}
    </div>
  );
}
