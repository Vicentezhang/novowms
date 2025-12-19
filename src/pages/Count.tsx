import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { Package, Trash, Check, Search } from 'lucide-react';
import type { InboundOrder } from '../types';
import BarcodeScanner from '../components/BarcodeScanner';
import ScanInput from '../components/ScanInput';

export default function Count() {
  const { t } = useTranslation();
  const user = JSON.parse(localStorage.getItem('wh_user') || '{}');
  const [scanningTarget, setScanningTarget] = useState<'tracking' | 'sku' | 'lpn' | 'loc' | 'receipt' | null>(null);
  
  // 状态管理
  const [trackingNo, setTrackingNo] = useState('');
  const [pkg, setPkg] = useState<any>(null); // 当前扫描到的包裹
  const [inboundOrder, setInboundOrder] = useState<InboundOrder | null>(null);
  const [items, setItems] = useState<any[]>([]); // 包裹内的商品列表
  const [location, setLocation] = useState(''); // 上架库位

  // SKU 表单
  const [skuData, setSkuData] = useState({ sku:'', lpn: '', qty:1, remark:'', returnType: 'NEW' }); 
  
  // 小票登记 (简化: 仅记录条码)
  const [receiptNumber, setReceiptNumber] = useState('');

  // Unforecasted Product Modal State
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductForm, setNewProductForm] = useState({ sku: '', name: '', category: '', client: '' });

  // 🟢 Scanner Modal (Rendered at Root Level to avoid View Switching Issues)
  const scannerModal = scanningTarget ? (
      <BarcodeScanner
          onScan={(val) => {
              if(scanningTarget === 'tracking') setTrackingNo(val);
              if(scanningTarget === 'sku') handleScanInput(val, 'sku');
              if(scanningTarget === 'lpn') handleScanInput(val, 'lpn');
              if(scanningTarget === 'loc') setLocation(val);
              if(scanningTarget === 'receipt') setReceiptNumber(val);
          }}
          onClose={()=>setScanningTarget(null)}
      />
  ) : null;

  // 1. 扫描包裹
  const scanPkg = async () => {
    const cleanTracking = trackingNo.trim();
    if(!cleanTracking) return;
    
    // A. Try to find in 'packages' table first
    const { data, error } = await supabase.from('packages').select('*').eq('tracking_no', cleanTracking).maybeSingle();
    
    if(error || !data) {
        console.log(`[Count] Package not found for ${cleanTracking}, checking Inbound Orders...`);
        // 🟢 B. Fallback: Check 'inbound_orders' for orphaned records (Blind Receipt case)
        // Fix: Use .order() and .limit(1) to handle potential duplicates (pick the latest one)
        const { data: orderData } = await supabase
            .from('inbound_orders')
            .select('*')
            .eq('tracking_no', cleanTracking)
            .order('created_at', { ascending: false }) // Pick the most recent attempt
            .limit(1)
            .maybeSingle();
        
        if (orderData) {
             console.log(`[Count] Found orphaned order ${orderData.order_no}, attempting auto-recovery...`);
             // 🛠️ AUTO RECOVERY: Create the missing package record
             const { data: newPkg, error: recoveryError } = await supabase.from('packages').insert([{
                 tracking_no: orderData.tracking_no,
                 client: orderData.client_id, // Assuming client_id maps to package client name
                 carrier: orderData.carrier || 'Unknown',
                 status: 'PENDING',
                 inbound_order_id: orderData.id,
                 type: 'box', // Default type
                 operator: user.username || 'system_recovery'
             }]).select().single();

             if (recoveryError) {
                 console.error("[Count] Recovery Failed:", recoveryError);
                 alert(`❌ 自动修复失败 (v1.7.2): ${recoveryError.message}`);
                 return;
             }

             // 📝 Log the recovery
             await supabase.from('operation_logs').insert([{
                 target_table: 'packages',
                 target_id: newPkg.id,
                 action: 'DATA_RECOVERY',
                 operator: user.username || 'system',
                 details: { 
                     reason: 'Missing package record', 
                     linked_order: orderData.order_no,
                     original_tracking: cleanTracking,
                     version: '1.7.2'
                 }
             }]);

             // ✅ Success Feedback & State Update
             alert(`✅ [v1.7.2] 异常数据已自动修复！\n已关联入库单: ${orderData.order_no}\n请继续清点。`);
             setPkg(newPkg);
             setInboundOrder(orderData);
             
             // Load items if any (unlikely for new recovery, but safe to check)
             const { data: its } = await supabase.from('items').select('*').eq('package_id', newPkg.id);
             if(its) setItems(its);
             
             // Restore location preference
             if(newPkg.client) {
                const { data: clientData } = await supabase.from('clients').select('default_location').eq('name', newPkg.client).maybeSingle();
                if(clientData?.default_location) setLocation(clientData.default_location);
             }
             return;

        } else {
             alert(t('not_found'));
        }
        return;
    }
    
    // 如果包裹已经处理过 (不是 PENDING)，提示一下但允许查看
    if (data.status !== 'PENDING') {
      if(!confirm(`⚠️ 这个包裹状态是 ${data.status}，确定要重新清点吗？`)) return;
    }

    setPkg(data);
    
    // 加载已有商品
    const { data: its } = await supabase.from('items').select('*').eq('package_id', data.id);
    if(its) setItems(its);

    // 尝试获取关联的入库单
    if (data.inbound_order_id) {
      const { data: order } = await supabase.from('inbound_orders').select('*').eq('id', data.inbound_order_id).maybeSingle();
      if (order) setInboundOrder(order);
    } else {
      setInboundOrder(null);
    }

    // 🟢 Restore Receipt Number if exists
    if (data.receipt) {
        setReceiptNumber(data.receipt);
    } else {
        setReceiptNumber('');
    }

    // 尝试获取该货主的默认库位
    if(data.client) {
      const { data: clientData } = await supabase.from('clients').select('default_location').eq('name', data.client).maybeSingle();
      if(clientData?.default_location) setLocation(clientData.default_location);
    }
  };

  // Helper: Handle Scan Logic (Detect LPN)
  const handleScanInput = async (val: string, type: 'sku' | 'lpn') => {
      // 1. Strict LPN Check: Starts with LPN and length >= 10 (usually 18 but let's be safe)
      if (val.toUpperCase().startsWith('LPN')) {
          setSkuData(prev => ({ ...prev, lpn: val, sku: 'Pending_QC', returnType: 'INSPECT' }));
          
          // Auto-create Pending_QC SKU if not exists
          const { data: exist } = await supabase.from('products').select('id').eq('sku', 'Pending_QC').eq('client', pkg.client).maybeSingle();
          if (!exist) {
              await supabase.from('products').insert([{
                  sku: 'Pending_QC',
                  name: 'Pending QC Item',
                  category: 'Unsorted',
                  client: pkg.client,
                  attributes: { is_pending: true }
              }]);
          }
      } else {
          // It's a SKU
          if (type === 'sku') setSkuData(prev => ({ ...prev, sku: val }));
          if (type === 'lpn') {
             // If user tried to scan SKU in LPN field, warn or just set it?
             // Requirement says "LPN field for LPN".
             // But if they manually type, allow it.
             setSkuData(prev => ({ ...prev, lpn: val }));
          }
      }
  };

  // 2. 添加商品 (SKU)
  const addItem = async () => {
    if(!skuData.sku && !skuData.lpn) return alert(t('required'));
    
    // If SKU is present, check if it exists in Products table
    if (skuData.sku) {
        const { data: prod } = await supabase.from('products').select('id').eq('sku', skuData.sku).eq('client', pkg.client).maybeSingle();
        if (!prod) {
            // Product not found -> Open Quick Entry Modal
            setNewProductForm({ sku: skuData.sku, name: '', category: '', client: pkg.client });
            setShowNewProduct(true);
            return;
        }
    }

    // Insert Item
    const { data, error } = await supabase.from('items').insert([{
      package_id: pkg.id,
      tracking_no: pkg.tracking_no,
      sku: skuData.sku,
      lpn: skuData.lpn || null,
      qty: skuData.qty,
      remark: skuData.remark,
      return_type: skuData.lpn ? 'INSPECT' : skuData.returnType // Enforce INSPECT for LPN
    }]).select().single();

    if(error) {
        console.error("Add Item Error:", error);
        if (error.message.includes('lpn') || error.code === '42703') {
             alert("⚠️ 系统错误: 数据库缺少 'lpn' 字段。请联系管理员运行 'fix_lpn_column.sql'。");
        } else {
             alert(error.message);
        }
        return;
    }

    // 🟢 Log Operation (LPN-SKU Mapping)
    if (skuData.lpn) {
        await supabase.from('operation_logs').insert([{
            target_table: 'inbound_lpns',
            target_id: skuData.lpn,
            action: 'MAP_SKU',
            operator: 'current_user', // Replace with real user
            details: { sku: skuData.sku, pkg: pkg.tracking_no }
        }]);
    }
    
    setItems([...items, data]);
    setSkuData({ sku:'', lpn: '', qty:1, remark:'', returnType: 'NEW' }); 
  };

  // 3. 删除商品
  const deleteItem = async (id: string) => {
    if(!confirm(t('confirm_del'))) return;
    await supabase.from('items').delete().eq('id', id);
    setItems(items.filter(i => i.id !== id));
  };

  // 4. 提交完成 (最关键的一步：更新库存)
  const finish = async () => {
    if (!pkg) return;
    try {
      // A. 更新包裹状态
      await supabase.from('packages').update({
        status: 'WAIT_INSPECT', 
        location: location || 'N/A', 
        counted_at: new Date(),
        receipt: receiptNumber || null
      }).eq('id', pkg.id);

      // B. 更新入库单状态 & 同步收货数量 (Sync SKU Qty)
      if (pkg.inbound_order_id) {
        // Sync Receipt to Order Remark (Requirement: Sync receipt info to inbound order)
        // Since we cannot easily add a column, we append to remark.
        let newRemark = undefined;
        if (receiptNumber && inboundOrder) {
             const currentRemark = inboundOrder.remark || '';
             // Avoid duplicate appending
             if (!currentRemark.includes(`Receipt: ${receiptNumber}`)) {
                 newRemark = currentRemark ? `${currentRemark} | Receipt: ${receiptNumber}` : `Receipt: ${receiptNumber}`;
             }
        }

        await supabase.from('inbound_orders').update({
          status: 'COUNTED',
          updated_at: new Date(),
          ...(newRemark ? { remark: newRemark } : {})
        }).eq('id', pkg.inbound_order_id);

        // Update inbound_items received_qty
        for (const item of items) {
            // Find existing item in order
            const { data: existItem } = await supabase.from('inbound_items')
                .select('id, received_qty')
                .eq('order_id', pkg.inbound_order_id)
                .eq('sku', item.sku)
                .maybeSingle();
            
            if (existItem) {
                // Accumulate qty
                await supabase.from('inbound_items').update({
                    received_qty: (existItem.received_qty || 0) + item.qty
                }).eq('id', existItem.id);
            } else {
                // If item wasn't forecasted, maybe insert it? 
                // For now, let's assume strict forecasting or just log it.
                // Or create a new inbound_item with expected_qty=0
                await supabase.from('inbound_items').insert([{
                    order_id: pkg.inbound_order_id,
                    sku: item.sku,
                    expected_qty: 0,
                    received_qty: item.qty
                }]);
            }
        }
      }

      // C. 自动入库 (Upsert Inventory)
      const finalLocation = location || 'N/A';
      
      // 🟢 Log Finish Operation
      await supabase.from('operation_logs').insert([{
        target_table: 'packages',
        target_id: pkg.id,
        action: 'FINISH_COUNT',
        operator: 'current_user',
        details: { items_count: items.length, location: finalLocation }
      }]);
      
      for (const item of items) {
        // 生成唯一库存ID: CLIENT_SKU_LOCATION
        const invId = `${pkg.client}_${item.sku}_${finalLocation}`.replace(/\s+/g, '_');
        
        // 先查一下现有的
        const { data: existing } = await supabase.from('inventory').select('qty').eq('id', invId).maybeSingle();
        const oldQty = existing?.qty || 0;
        const newQty = oldQty + item.qty;

        // Upsert
        await supabase.from('inventory').upsert({
          id: invId,
          client: pkg.client,
          sku: item.sku,
          location: finalLocation,
          qty: newQty,
          updated_at: new Date()
        });
      }

      alert(t('msg_success'));
      // 重置所有状态，准备下一个
      setPkg(null); setTrackingNo(''); setItems([]); setLocation(''); setInboundOrder(null);
      setReceiptNumber('');
    } catch(e: any) { alert("Error: " + e.message); }
  };

  const saveNewProduct = async () => {
      if (!newProductForm.name || !newProductForm.category) return alert("Name and Category are required");
      
      const { error } = await supabase.from('products').insert([{
          sku: newProductForm.sku,
          name: newProductForm.name,
          category: newProductForm.category,
          client: newProductForm.client,
          attributes: { is_temp: true, created_via: 'count_modal' }, // 🟢 Mark as Temp
          created_at: new Date()
      }]);

      if (error) {
          alert("Create Product Error: " + error.message);
      } else {
          // 🟢 Log Operation
          await supabase.from('operation_logs').insert([{
            target_table: 'products',
            target_id: newProductForm.sku,
            action: 'CREATE_TEMP',
            operator: 'current_user',
            details: newProductForm
          }]);

          alert("Product Created!");
          setShowNewProduct(false);
          // Auto-submit the item after creation
          addItem(); 
      }
  };

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto">
      {/* New Product Modal */}
      {showNewProduct && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                  <h3 className="text-xl font-bold mb-4">🆕 New Product Entry</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-gray-500 mb-1">SKU</label>
                          <input className="w-full border p-2 rounded bg-gray-100" value={newProductForm.sku} disabled />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-gray-500 mb-1">Product Name *</label>
                          <input className="w-full border p-2 rounded" value={newProductForm.name} onChange={e=>setNewProductForm({...newProductForm, name: e.target.value})} autoFocus />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-gray-500 mb-1">Category *</label>
                          <input className="w-full border p-2 rounded" value={newProductForm.category} onChange={e=>setNewProductForm({...newProductForm, category: e.target.value})} placeholder="e.g. Electronics" />
                      </div>
                      <div className="flex gap-2 pt-2">
                          <button onClick={()=>setShowNewProduct(false)} className="flex-1 py-2 border rounded font-bold text-gray-500">Cancel</button>
                          <button onClick={saveNewProduct} className="flex-1 py-2 bg-blue-600 text-white rounded font-bold">Save & Add</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {!pkg ? (
         // --- 视图 A: 扫描包裹 ---
         <div className="max-w-xl mx-auto w-full mt-10 p-8 bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6 mx-auto text-blue-600">
              <Package size={32}/>
            </div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">{t('count_scan_pkg')}</h2>
            
            <ScanInput 
              label={t('recv_tracking')} 
              value={trackingNo} 
              onChange={setTrackingNo} 
              onEnter={scanPkg} 
              onScanClick={()=>setScanningTarget('tracking')}
              placeholder={t('recv_scan_ph')} 
            />
            
            <button 
              onClick={scanPkg} 
              className="w-full mt-4 bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95"
            >
              {t('btn_scan')}
            </button>
         </div>
      ) : (
        // --- 视图 B: 清点详情 (左右分栏) ---
        <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
          
          {/* 左侧：操作区 */}
          <div className="lg:w-1/3 flex flex-col gap-4 bg-white p-5 rounded-2xl shadow-lg border border-gray-100 h-full overflow-y-auto">
             {/* 包裹信息卡片 */}
             <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
               <div className="text-xs font-bold text-gray-400 uppercase mb-1">{t('count_pkg_info')}</div>
               <div className="font-mono font-bold text-xl text-gray-800 break-all">{pkg.tracking_no}</div>
               <div className="flex gap-2 mt-2 flex-wrap">
                 <span className="bg-blue-200 text-blue-800 text-xs px-2 py-1 rounded font-bold">{pkg.client}</span>
                 <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded font-bold">{pkg.carrier}</span>
                 {inboundOrder && (
                   <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                     <Search size={10}/> 预报单: {inboundOrder.order_no}
                   </span>
                 )}
               </div>
             </div>

             {/* 小票登记 (简化版) */}
             <div className="p-3 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
               <ScanInput 
                  label={t('count_receipt_optional')} 
                  value={receiptNumber} 
                  onChange={setReceiptNumber} 
                  onScanClick={()=>setScanningTarget('receipt')}
                  placeholder="扫描小票条码..."
                  autoFocus={false}
               />
             </div>

             <div className="border-t pt-4">
                <h3 className="font-bold text-lg mb-3">{t('count_add_sku')}</h3>
                
                {/* 类型切换 */}
                <div className="flex gap-2 mb-4">
                  <button onClick={()=>setSkuData({...skuData, returnType: 'NEW'})} className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-all ${skuData.returnType==='NEW'?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-400 border-gray-200'}`}>🔵 {t('count_new')}</button>
                  <button onClick={()=>setSkuData({...skuData, returnType: 'INSPECT'})} className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-all ${skuData.returnType==='INSPECT'?'bg-orange-500 text-white border-orange-500':'bg-white text-gray-400 border-gray-200'}`}>🟠 {t('count_inspect')}</button>
                </div>
                
                <ScanInput 
                  label="SKU / Barcode" 
                  value={skuData.sku} 
                  onChange={(v:string)=>handleScanInput(v, 'sku')} 
                  onScanClick={()=>setScanningTarget('sku')}
                  placeholder="Scan SKU..."
                />

                <ScanInput 
                  label="LPN (Optional)" 
                  value={skuData.lpn} 
                  onChange={(v:string)=>handleScanInput(v, 'lpn')} 
                  onScanClick={()=>setScanningTarget('lpn')}
                  placeholder="Scan LPN..."
                  autoFocus={false}
                />
                
                <div className="flex gap-3 mb-4">
                   <div className="w-1/3">
                      <label className="text-xs font-bold text-gray-500 mb-1 block">{t('count_qty')}</label>
                      <input type="number" className="w-full border-2 p-3 rounded-lg font-bold text-center" value={skuData.qty} onChange={e=>setSkuData({...skuData,qty:Number(e.target.value)})} />
                   </div>
                   <div className="flex-1">
                      <label className="text-xs font-bold text-gray-500 mb-1 block">{t('count_remark')}</label>
                      <input className="w-full border-2 p-3 rounded-lg" value={skuData.remark} onChange={e=>setSkuData({...skuData,remark:e.target.value})} />
                   </div>
                </div>
                
                <button onClick={addItem} className="w-full bg-gray-800 text-white py-3 rounded-xl font-bold shadow hover:bg-black transition-all">
                  {t('btn_add')}
                </button>
             </div>

             <div className="border-t pt-4 mt-auto">
               <ScanInput 
                  label={t('count_loc')} 
                  value={location} 
                  onChange={setLocation} 
                  onScanClick={()=>setScanningTarget('loc')}
                  placeholder="Scan Loc..." 
                  autoFocus={false} 
               />
               <button onClick={finish} className="w-full mt-2 bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                 <Check size={20}/> {t('btn_submit')}
               </button>
             </div>
          </div>

          {/* 右侧：清单列表 */}
          <div className="lg:w-2/3 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">
             <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
               <h3 className="font-bold text-gray-700 flex items-center gap-2">
                 {t('count_list')} 
                 <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs">{items.length}</span>
               </h3>
               <button onClick={()=>{setPkg(null);setItems([])}} className="text-gray-400 hover:text-red-500 text-sm font-bold px-3 py-1 rounded hover:bg-red-50 transition-colors">
                 {t('btn_cancel')}
               </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-0">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100 text-gray-500 sticky top-0 z-10">
                    <tr>
                      <th className="p-4">SKU / LPN</th>
                      <th className="p-4">Type</th>
                      <th className="p-4 text-center">Qty</th>
                      <th className="p-4">Remark</th>
                      <th className="p-4 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map(it => (
                      <tr key={it.id} className="hover:bg-blue-50 transition-colors">
                        <td className="p-4">
                            <div className="font-mono font-bold text-gray-800">{it.sku}</div>
                            {it.lpn && <div className="text-xs text-indigo-600 font-mono mt-1">LPN: {it.lpn}</div>}
                        </td>
                        <td className="p-4">
                          {it.return_type==='NEW' 
                            ? <span className="text-blue-600 font-bold text-xs bg-blue-100 px-2 py-1 rounded">NEW</span> 
                            : <span className="text-orange-600 font-bold text-xs bg-orange-100 px-2 py-1 rounded">INSPECT</span>
                          }
                        </td>
                        <td className="p-4 text-center font-bold text-lg">x{it.qty}</td>
                        <td className="p-4 text-gray-500 italic">{it.remark || '-'}</td>
                        <td className="p-4">
                          <button onClick={()=>deleteItem(it.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all">
                            <Trash size={16}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                       <tr>
                         <td colSpan={5} className="p-10 text-center text-gray-300">
                           暂无商品，请在左侧扫描添加
                         </td>
                       </tr>
                    )}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {/* Render Scanner Modal at the very end of component */}
      {scannerModal}
    </div>
  );
}
