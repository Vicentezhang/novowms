import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { Plus, Search, FileText, Trash, Edit, Clipboard, FileSpreadsheet, Download, Filter } from 'lucide-react';
import type { InboundOrder } from '../types';
import * as XLSX from 'xlsx';

import BatchInbound from '../components/BatchInbound';
import InboundDetail from '../components/InboundDetail';

export default function Inbound() {
  const { t } = useTranslation();
  const user = JSON.parse(localStorage.getItem('wh_user') || '{}');
  const isAdmin = user.role === 'admin' || user.role === 'operator';
  const isClient = user.role === 'client';

  const [view, setView] = useState<'list' | 'create'>('list');
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [orders, setOrders] = useState<InboundOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<InboundOrder | null>(null);

  // Advanced Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);

  // Form
  const [form, setForm] = useState({
    inbound_type: 'RETURN',
    tracking_no: '',
    expected_date: '',
    remark: '',
    client_id: isClient ? user.username : ''
  });
  
  // Batch Items
  const [batchMode, setBatchMode] = useState(false);
  const [items, setItems] = useState<{sku: string, qty: number, name?: string}[]>([{sku: '', qty: 1}]);
  const [batchText, setBatchText] = useState('');
  const [skuValidation, setSkuValidation] = useState<{[key: number]: {valid: boolean, name?: string}}>({});

  const [clients, setClients] = useState<string[]>([]);

  // SKU Auto-complete Debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
        if (batchMode) return;
        
        const newValidation = { ...skuValidation };
        let changed = false;

        for (let i = 0; i < items.length; i++) {
            const sku = items[i].sku;
            if (!sku) continue;
            
            // Skip if already validated
            if (newValidation[i]?.name && items[i].sku === items[i].sku /* Wait, we need to track if it changed */) {
                // Simplified: Just re-validate active ones or use a smarter diff
            }

            // Perform check
            // Use current user client or selected client
            const client = isAdmin ? form.client_id : user.username;
            if (!client) continue;

            const { data } = await supabase.from('products').select('name').eq('sku', sku).eq('client', client).maybeSingle();
            
            if (data) {
                if (!newValidation[i]?.valid || newValidation[i].name !== data.name) {
                    newValidation[i] = { valid: true, name: data.name };
                    changed = true;
                }
            } else {
                 if (newValidation[i]?.valid !== false) {
                    newValidation[i] = { valid: false };
                    changed = true;
                 }
            }
        }

        if (changed) setSkuValidation(newValidation);

    }, 500);

    return () => clearTimeout(timer);
  }, [items, form.client_id, batchMode]);

  const handleSkuChange = (idx: number, val: string) => {
      const newItems = [...items];
      newItems[idx].sku = val;
      // Reset validation for this index immediately
      setSkuValidation(prev => {
          const next = { ...prev };
          delete next[idx];
          return next;
      });
      setItems(newItems);
  };

  useEffect(() => {
    // Default to this week
    const today = new Date();
    const first = today.getDate() - today.getDay() + 1; // Monday
    const last = first + 6; // Sunday
    
    const monday = new Date(today.setDate(first));
    const sunday = new Date(today.setDate(last));
    
    // Format YYYY-MM-DD
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    // setDateRange({ start: fmt(monday), end: fmt(sunday) });
    // Keep empty initially or strictly follow requirement "Default load this week"
    // Let's set it if user hasn't touched it, but for now allow empty to show all or set default in query.
    // Requirement: "Default load this week data"
    setDateRange({ start: fmt(monday), end: fmt(sunday) });
  }, []);

  useEffect(() => {
    if (dateRange.start && dateRange.end) {
        fetchOrders();
    }
    if (isAdmin) loadClients();
  }, [search, filterStatus, dateRange]);

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('name').eq('type', 'client');
    if (data) setClients(data.map(d => d.name));
  };

  const fetchOrders = async () => {
    setLoading(true);
    let query = supabase
      .from('inbound_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (isClient) {
      query = query.eq('client_id', user.username);
    }
    
    if (search) {
      query = query.or(`order_no.ilike.%${search}%,tracking_no.ilike.%${search}%`);
    }

    if (filterStatus) {
      query = query.eq('status', filterStatus);
    }

    if (dateRange.start) {
        query = query.gte('created_at', `${dateRange.start}T00:00:00`);
    }
    if (dateRange.end) {
        query = query.lte('created_at', `${dateRange.end}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) {
        console.error("Fetch Inbound Error:", error);
    } else {
        setOrders(data || []);
    }
    setLoading(false);
  };

  const exportExcel = async () => {
      if (!orders.length) return alert("暂无数据可导出");
      setLoading(true);
      try {
          // 1. Fetch Packages and Items for these orders
          const orderIds = orders.map(o => o.id);
          const { data: packages, error: pkgError } = await supabase
            .from('packages')
            .select('*, items(*)')
            .in('inbound_order_id', orderIds);
          
          if (pkgError) throw pkgError;

          const exportData: any[] = [];

          for (const order of orders) {
              const orderPkgs = packages?.filter(p => p.inbound_order_id === order.id) || [];
              
              if (orderPkgs.length === 0) {
                  // No packages, just export order info
                  exportData.push({
                      "入库单号": order.order_no,
                      "客户": order.client_id,
                      "类型": order.inbound_type,
                      "跟踪号": order.tracking_no,
                      "状态": order.status,
                      "预计日期": order.expected_date,
                      "包裹跟踪号": "-",
                      "小票编号": "-",
                      "SKU信息": "-",
                      "总数量": 0,
                      "创建时间": new Date(order.created_at || '').toLocaleString(),
                  });
              } else {
                  // One row per package
                  for (const pkg of orderPkgs) {
                      const items = pkg.items || [];
                      // Merge SKUs
                      // Format: SKU1 (Qty: 5, LPN: xxx) | SKU2 (Qty: 2)
                      const skuInfo = items.map((it: any) => {
                          let info = `${it.sku} * ${it.qty}`;
                          if (it.lpn) info += ` (LPN: ${it.lpn})`;
                          if (it.remark) info += ` [${it.remark}]`;
                          // Check for other attributes if any
                          return info;
                      }).join(' | ');

                      exportData.push({
                          "入库单号": order.order_no,
                          "客户": order.client_id,
                          "类型": order.inbound_type,
                          "跟踪号": order.tracking_no, 
                          "状态": order.status,
                          "预计日期": order.expected_date,
                          
                          // Package Info
                          "包裹跟踪号": pkg.tracking_no,
                          "小票编号": pkg.receipt || '-',
                          "SKU信息": skuInfo || '(空包裹)',
                          "总数量": items.reduce((sum: number, i: any) => sum + i.qty, 0),
                          
                          "创建时间": new Date(order.created_at || '').toLocaleString(),
                      });
                  }
              }
          }

          const ws = XLSX.utils.json_to_sheet(exportData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Inbound Details");
          XLSX.writeFile(wb, `Inbound_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
      } catch (e: any) {
          console.error(e);
          alert("Export Error: " + e.message);
      } finally {
          setLoading(false);
      }
  };

  const generateOrderNo = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(5, '0');
    return `R${date}${random}`;
  };

  const parseBatchText = () => {
    const rows = batchText.trim().split('\n');
    const newItems: {sku: string, qty: number}[] = [];
    
    rows.forEach(row => {
       // Support Tab or Comma separated
       const parts = row.split(/[\t,]+/);
       if (parts.length >= 2) {
         const sku = parts[0].trim();
         const qty = parseInt(parts[1].trim());
         if (sku && !isNaN(qty) && qty > 0) {
           newItems.push({ sku, qty });
         }
       }
    });

    if (newItems.length > 0) {
      setItems(newItems);
      setBatchMode(false); // Switch back to list view
      alert(`Parsed ${newItems.length} items successfully.`);
    } else {
      alert('Failed to parse items. Please check format: SKU [TAB] Qty');
    }
  };

  const handleSubmit = async () => {
    // 🟢 Optimization: Tracking No is now optional
    if (!form.expected_date) {
      return alert(t('required'));
    }
    if (isAdmin && !form.client_id) return alert('请选择客户');
    
    const validItems = items.filter(i => i.sku && i.qty > 0);
    if (validItems.length === 0) return alert('请至少添加一个商品');

    // 🟢 Validation: Check if any SKU is invalid
    const invalidSkus = validItems.filter((_, idx) => skuValidation[idx]?.valid === false);
    if (invalidSkus.length > 0) {
        return alert('请先维护所有SKU基础信息 (E4001)');
    }

    const orderNo = editingId ? orders.find(o => o.id === editingId)?.order_no : generateOrderNo();
    
    try {
      // 1. Check uniqueness ONLY if tracking_no is provided AND it changed (or new)
      if (form.tracking_no) {
          let q = supabase.from('inbound_orders').select('id').eq('tracking_no', form.tracking_no);
          if (editingId) q = q.neq('id', editingId); // Exclude self
          const { data: exist } = await q.maybeSingle();
          if (exist) return alert('跟踪号已存在');
      }

      const payload = {
        order_no: orderNo,
        client_id: form.client_id,
        inbound_type: form.inbound_type,
        tracking_no: form.tracking_no || null,
        expected_date: form.expected_date,
        remark: form.remark,
        created_by: user.username,
        status: 'IN_TRANSIT',
        updated_at: new Date()
      };

      let orderId = editingId;

      if (editingId) {
          // UPDATE
          const { error: updateError } = await supabase.from('inbound_orders').update(payload).eq('id', editingId);
          if (updateError) throw updateError;

          // Log Operation
          await supabase.from('operation_logs').insert([{
              target_table: 'inbound_orders',
              target_id: editingId,
              action: 'UPDATE',
              operator: user.username,
              details: { form, items: validItems }
          }]);

          // Clear old items to replace with new ones
          await supabase.from('inbound_items').delete().eq('order_id', editingId);
      } else {
          // INSERT
          const { data: order, error: orderError } = await supabase.from('inbound_orders').insert([payload]).select().single();
          if (orderError) throw orderError;
          orderId = order.id;

           // Log Operation
           await supabase.from('operation_logs').insert([{
              target_table: 'inbound_orders',
              target_id: orderId,
              action: 'CREATE',
              operator: user.username,
              details: { form, items: validItems }
          }]);
      }

      // 3. Create Items (For both create and update)
      if (orderId) {
          const { error: itemError } = await supabase.from('inbound_items').insert(
            validItems.map(i => ({
              order_id: orderId,
              sku: i.sku,
              expected_qty: i.qty
            }))
          );
          if (itemError) throw itemError;
      }

      alert(t('msg_success'));
      setView('list');
      setForm({ ...form, tracking_no: '', remark: '' });
      setItems([{sku: '', qty: 1}]);
      setEditingId(null);
      fetchOrders();

    } catch (e: any) {
      console.error("Submit Error:", e);
      alert('Error: ' + e.message);
    }
  };

  const handleEdit = async (order: any) => {
      if (order.status !== 'IN_TRANSIT') {
          return alert("只能修改 '在途 (IN_TRANSIT)' 状态的入库单");
      }
      
      setEditingId(order.id);
      setForm({
          inbound_type: order.inbound_type,
          tracking_no: order.tracking_no || '',
          expected_date: order.expected_date,
          remark: order.remark || '',
          client_id: order.client_id
      });
      
      // Fetch items
      const { data: itemsData } = await supabase.from('inbound_items').select('sku, expected_qty').eq('order_id', order.id);
      if (itemsData) {
          setItems(itemsData.map(i => ({ sku: i.sku, qty: i.expected_qty })));
      } else {
          setItems([{sku: '', qty: 1}]);
      }

      setView('create');
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_del'))) return;
    await supabase.from('inbound_orders').delete().eq('id', id);
    fetchOrders();
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      {showBatchImport && (
          <BatchInbound 
              onClose={() => setShowBatchImport(false)} 
              onSuccess={() => {
                  fetchOrders();
                  setShowBatchImport(false);
              }}
              user={user}
          />
      )}
      {selectedOrder && (
        <InboundDetail 
            order={selectedOrder} 
            onClose={() => setSelectedOrder(null)} 
        />
      )}
      {view === 'list' ? (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="text-blue-600" /> {t('inbound_title')}
            </h1>
            <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchImport(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"
                >
                  <FileSpreadsheet size={18} /> 批量新增预报
                </button>
                <button
                  onClick={() => setView('create')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
                >
                  <Plus size={18} /> {t('inbound_create')}
                </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
                placeholder="搜索单号 / 跟踪号"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg border flex items-center gap-2 ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white text-gray-600'}`}
            >
                <Filter size={18}/> 筛选
            </button>
            
            <button 
                onClick={exportExcel}
                className="px-4 py-2 rounded-lg border bg-white text-gray-600 flex items-center gap-2 hover:bg-gray-50"
            >
                <Download size={18}/> 导出
            </button>
          </div>

          {showFilters && (
            <div className="bg-gray-50 p-4 rounded-xl mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 animate-fadeIn">
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">状态</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2 bg-white"
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value)}
                    >
                      <option value="">{t('opt_all_status') || '所有状态'}</option>
                      <option value="IN_TRANSIT">{t('status_in_transit')}</option>
                      <option value="ARRIVED">{t('status_arrived')}</option>
                      <option value="RECEIVED">{t('status_received')}</option>
                      <option value="INSPECTING">{t('status_inspecting')}</option>
                      <option value="COMPLETED">{t('status_completed')}</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">开始日期</label>
                    <input 
                        type="date" 
                        className="w-full border rounded-lg px-3 py-2"
                        value={dateRange.start}
                        onChange={e => setDateRange({...dateRange, start: e.target.value})}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">结束日期</label>
                    <input 
                        type="date" 
                        className="w-full border rounded-lg px-3 py-2"
                        value={dateRange.end}
                        onChange={e => setDateRange({...dateRange, end: e.target.value})}
                    />
                 </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-4">{t('lbl_inbound_no')}</th>
                  <th className="p-4">{t('config_client')}</th>
                  <th className="p-4">{t('lbl_inbound_type')}</th>
                  <th className="p-4">{t('lbl_tracking')}</th>
                  <th className="p-4">{t('lbl_expected_date')}</th>
                  <th className="p-4">{t('lbl_created_at')}</th>
                  <th className="p-4">{t('lbl_status')}</th>
                  <th className="p-4 text-right">{t('lbl_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="p-4 font-mono font-bold text-blue-600">
                        <button onClick={() => setSelectedOrder(order)} className="hover:underline text-left">
                            {order.order_no}
                        </button>
                        <div className="text-xs text-gray-400 font-normal">{new Date(order.created_at || '').toLocaleDateString()}</div>
                    </td>
                    <td className="p-4">{order.client_id}</td>
                    <td className="p-4 text-sm">
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
                        {order.inbound_type === 'RETURN' && t('type_return')}
                        {order.inbound_type === 'NEW' && t('type_new')}
                        {order.inbound_type === 'AFTER_SALES' && t('type_after_sales')}
                        {order.inbound_type === 'BLIND' && t('type_blind')}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-sm">{order.tracking_no || '-'}</td>
                    <td className="p-4 text-sm">{order.expected_date}</td>
                    <td className="p-4 text-sm text-gray-500">
                        {order.updated_at ? new Date(order.updated_at).toLocaleString() : '-'}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold 
                        ${order.status === 'IN_TRANSIT' ? 'bg-yellow-100 text-yellow-700' : ''}
                        ${order.status === 'ARRIVED' ? 'bg-orange-100 text-orange-700' : ''}
                        ${order.status === 'RECEIVED' ? 'bg-blue-100 text-blue-700' : ''}
                        ${order.status === 'INSPECTING' ? 'bg-purple-100 text-purple-700' : ''}
                        ${order.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : ''}
                      `}>
                        {order.status === 'IN_TRANSIT' && t('status_in_transit')}
                        {order.status === 'ARRIVED' && t('status_arrived')}
                        {order.status === 'RECEIVED' && t('status_received')}
                        {order.status === 'INSPECTING' && t('status_inspecting')}
                        {order.status === 'COMPLETED' && t('status_completed')}
                        {!['IN_TRANSIT','ARRIVED','RECEIVED','INSPECTING','COMPLETED'].includes(order.status || '') && order.status}
                      </span>
                    </td>
                    <td className="p-4 text-right flex gap-2 justify-end">
                      {/* Admin can edit almost anything, Client restricted */}
                      {(isAdmin || (isClient && order.status === 'IN_TRANSIT')) && (
                        <>
                          <button onClick={() => handleEdit(order)} className="text-blue-500 hover:bg-blue-50 p-2 rounded" title="编辑">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => handleDelete(order.id!)} className="text-red-500 hover:bg-red-50 p-2 rounded" title="删除">
                            <Trash size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && !loading && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Plus className="text-blue-600" /> {editingId ? t('inbound_edit_title') : t('inbound_create')}
          </h2>
          
          <div className="space-y-6">
            {/* Top Form */}
            <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">入库类型</label>
                 <select 
                   className="w-full border p-2 rounded-lg"
                   value={form.inbound_type}
                   onChange={e => setForm({...form, inbound_type: e.target.value})}
                 >
                   <option value="RETURN">买家退货</option>
                   <option value="NEW">亚马逊新品</option>
                   <option value="AFTER_SALES">亚马逊售后</option>
                 </select>
               </div>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">预计发货时间</label>
                 <input 
                   type="date"
                   className="w-full border p-2 rounded-lg"
                   value={form.expected_date}
                   onChange={e => setForm({...form, expected_date: e.target.value})}
                 />
               </div>
            </div>

            {isAdmin && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">{t('config_client')}</label>
                <select 
                  className="w-full border p-2 rounded-lg"
                  value={form.client_id}
                  onChange={e => setForm({...form, client_id: e.target.value})}
                >
                  <option value="">-- 选择客户 --</option>
                  {clients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">跟踪号 (Tracking No)</label>
              <input 
                className="w-full border p-2 rounded-lg font-mono"
                placeholder="扫描或输入"
                value={form.tracking_no}
                onChange={e => setForm({...form, tracking_no: e.target.value})}
              />
            </div>

            {/* Items Section */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
               <div className="flex justify-between items-center mb-3">
                 <h3 className="font-bold text-sm text-gray-500 uppercase">预报商品信息</h3>
                 <button 
                   onClick={() => setBatchMode(!batchMode)}
                   className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold flex items-center gap-1"
                 >
                   <Clipboard size={12}/> {batchMode ? '手动输入' : t('inbound_batch')}
                 </button>
               </div>
               
               {batchMode ? (
                 <div className="animate-fadeIn">
                   <textarea 
                     className="w-full border p-2 rounded-lg h-32 font-mono text-sm"
                     placeholder={t('inbound_batch_ph')}
                     value={batchText}
                     onChange={e => setBatchText(e.target.value)}
                   />
                   <button 
                     onClick={parseBatchText}
                     className="mt-2 w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-blue-700"
                   >
                     {t('inbound_import_excel')}
                   </button>
                 </div>
               ) : (
                 <div className="space-y-2">
                   {items.map((item, idx) => (
                     <div key={idx} className="flex flex-col gap-1 mb-2">
                        <div className="flex gap-2">
                       <input 
                         className={`flex-1 border p-2 rounded-lg ${skuValidation[idx]?.valid === false ? 'border-red-500 bg-red-50' : ''}`}
                         placeholder="SKU"
                         value={item.sku}
                         onChange={e => handleSkuChange(idx, e.target.value)}
                       />
                       <input 
                         type="number"
                         className="w-24 border p-2 rounded-lg text-center"
                         value={item.qty}
                         onChange={e => {
                           const newItems = [...items];
                           newItems[idx].qty = parseInt(e.target.value) || 0;
                           setItems(newItems);
                         }}
                       />
                       <button 
                         onClick={() => {
                           if (items.length > 1) setItems(items.filter((_, i) => i !== idx));
                         }}
                         className="p-2 text-gray-400 hover:text-red-500"
                       >
                         <Trash size={16}/>
                       </button>
                       </div>
                       {skuValidation[idx]?.valid && (
                           <div className="text-xs text-green-600 font-bold px-1">✓ {skuValidation[idx].name}</div>
                       )}
                       {skuValidation[idx]?.valid === false && (
                           <div className="text-xs text-red-500 font-bold px-1 flex items-center gap-2">
                               <span>⚠️ SKU未维护 (E4001)</span>
                               <a href="/products" target="_blank" className="underline hover:text-red-700">去维护</a>
                           </div>
                       )}
                     </div>
                   ))}
                   <button 
                     onClick={() => setItems([...items, {sku: '', qty: 1}])}
                     className="w-full py-2 border-2 border-dashed rounded-lg text-gray-400 hover:text-blue-500 hover:border-blue-200 text-sm font-bold flex items-center justify-center gap-2"
                   >
                     <Plus size={14}/> {t('btn_add')}
                   </button>
                 </div>
               )}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t('lbl_remark')}</label>
              <textarea 
                className="w-full border p-2 rounded-lg h-24"
                value={form.remark}
                onChange={e => setForm({...form, remark: e.target.value})}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                onClick={() => { setView('list'); setEditingId(null); setForm({ ...form, tracking_no: '', remark: '' }); setItems([{sku: '', qty: 1}]); }}
                className="flex-1 py-3 border rounded-lg text-gray-500 font-bold hover:bg-gray-50"
              >
                {t('btn_cancel')}
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700"
              >
                {editingId ? t('btn_save_changes') : t('btn_submit_inbound')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
