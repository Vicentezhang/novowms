import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { useFinanceStore } from '../store/financeStore';
import { X, CheckCircle, Package, Truck, Printer, Box, Layers, Tag } from 'lucide-react';
import type { OutboundOrder } from '../types';

interface Props {
  order: OutboundOrder;
  onClose: () => void;
  onUpdate: () => void;
  userRole: string;
}

export default function OutboundProcess({ order, onClose, onUpdate, userRole }: Props) {
  const { t } = useTranslation();
  const { calculateFee, createTransaction } = useFinanceStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // 增值服务状态
  const [vasData, setVasData] = useState({
      material_type: 'carton_m', // 'carton_s', 'carton_m', 'bubble_wrap'
      material_qty: 1,
      pallet_qty: 0,
      label_count: 0
  });

  // Steps: 1. Pick -> 2. Pack (VAS) -> 3. Ship
  
  const handleNext = async () => {
    setLoading(true);
    try {
      if (step === 1) {
          // Picking Confirm
          // Update Status -> PACKING
          await supabase.from('outbound_orders').update({ status: 'PACKING' }).eq('id', order.id);
          
          // Calculate Picking Fee
          // Mock item count: 10 items
          const fee = await calculateFee('outbound_picking', 10); 
          if (fee > 0) await createTransaction(order.client!, 'DEDUCTION', fee, `Picking Fee: ${order.order_no}`);
          
          setStep(2);
      } else if (step === 2) {
          // Packing Confirm (VAS Billing)
          let totalVas = 0;
          let vasDesc = [];

          // 1. Material Fee
          const matFee = await calculateFee('material', vasData.material_qty, vasData.material_type);
          if (matFee > 0) { totalVas += matFee; vasDesc.push(`Material x${vasData.material_qty}`); }

          // 2. Pallet Fee
          if (vasData.pallet_qty > 0) {
              const palFee = await calculateFee('pallet_fee', vasData.pallet_qty);
              if (palFee > 0) { totalVas += palFee; vasDesc.push(`Pallet x${vasData.pallet_qty}`); }
          }

          // 3. Labeling Fee
          if (order.service_type === 'RELABEL' && vasData.label_count > 0) {
              const lblFee = await calculateFee('labeling', vasData.label_count);
              if (lblFee > 0) { totalVas += lblFee; vasDesc.push(`Labeling x${vasData.label_count}`); }
          }
          
          if (totalVas > 0) {
              await createTransaction(order.client!, 'DEDUCTION', totalVas, `VAS (${vasDesc.join(', ')}): ${order.order_no}`);
              alert(`✅ 已扣除增值服务费: $${totalVas.toFixed(2)}`);
          }

          await supabase.from('outbound_orders').update({ status: 'WAIT_SHIP' }).eq('id', order.id);
          setStep(3);
      } else {
          // Ship Confirm
          // Deduct Inventory
          const { data: items } = await supabase.from('outbound_items').select('*').eq('order_id', order.id);
          if (items) {
             for (let item of items) {
                 // Simple deduction logic (needs robust implementation in real app)
                 // Find inventory record
                 const { data: inv } = await supabase.from('inventory').select('id, qty').eq('sku', item.sku).eq('client', order.client).limit(1).single();
                 if (inv) {
                     await supabase.from('inventory').update({ qty: inv.qty - item.qty }).eq('id', inv.id);
                 }
             }
          }

          await supabase.from('outbound_orders').update({ 
              status: 'SHIPPED', 
              shipped_at: new Date().toISOString() 
          }).eq('id', order.id);
          
          onUpdate();
      }
    } catch (e: any) {
        alert(e.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
            <div>
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    {step===1 && <Package size={24} className="text-blue-600"/>}
                    {step===2 && <Box size={24} className="text-orange-600"/>}
                    {step===3 && <Truck size={24} className="text-green-600"/>}
                    {t('out_process')} - {order.order_no}
                </h3>
                <p className="text-xs text-gray-500 font-bold mt-1">Step {step}/3: {step===1?'Picking':step===2?'Packing & VAS':'Shipping'}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto flex-1">
            {step === 1 && (
                <div className="text-center space-y-6">
                    <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600">
                        <Package size={48}/>
                    </div>
                    <h4 className="text-2xl font-bold text-gray-800">开始拣货 (Start Picking)</h4>
                    <p className="text-gray-500">请前往货架拣选商品。确认后将自动扣除拣货费。</p>
                    <div className="bg-yellow-50 p-4 rounded-xl text-yellow-800 text-sm font-bold border border-yellow-100">
                        ⚠️ 系统将根据 SKU 数量自动计算操作费
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-4 border-b">
                        <div className="bg-orange-100 p-3 rounded-xl text-orange-600"><Box size={24}/></div>
                        <div>
                            <h4 className="text-lg font-bold">打包与增值服务 (VAS)</h4>
                            <p className="text-xs text-gray-400">请如实登记使用的耗材与服务</p>
                        </div>
                    </div>

                    {/* 1. 耗材选择 */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Layers size={16}/> 耗材使用 (Materials)</label>
                        <div className="flex gap-2">
                            <select 
                                className="flex-1 border p-2 rounded-lg text-sm"
                                value={vasData.material_type}
                                onChange={e=>setVasData({...vasData, material_type: e.target.value})}
                            >
                                <option value="carton_s">小纸箱 (S)</option>
                                <option value="carton_m">中纸箱 (M)</option>
                                <option value="carton_l">大纸箱 (L)</option>
                                <option value="bubble_wrap">气泡袋</option>
                            </select>
                            <input 
                                type="number" 
                                className="w-20 border p-2 rounded-lg text-sm" 
                                value={vasData.material_qty}
                                min={1}
                                onChange={e=>setVasData({...vasData, material_qty: Number(e.target.value)})}
                            />
                        </div>
                    </div>

                    {/* 2. 打托服务 */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Layers size={16}/> 打托服务 (Palletizing)</label>
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-gray-500">托盘数量:</span>
                            <div className="flex items-center gap-2">
                                <button onClick={()=>setVasData({...vasData, pallet_qty: Math.max(0, vasData.pallet_qty-1)})} className="w-8 h-8 bg-white border rounded shadow-sm font-bold">-</button>
                                <span className="font-bold w-8 text-center">{vasData.pallet_qty}</span>
                                <button onClick={()=>setVasData({...vasData, pallet_qty: vasData.pallet_qty+1})} className="w-8 h-8 bg-white border rounded shadow-sm font-bold">+</button>
                            </div>
                        </div>
                    </div>

                    {/* 3. 换标服务 (Conditional) */}
                    {order.service_type === 'RELABEL' && (
                        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-3">
                             <label className="text-sm font-bold text-purple-700 flex items-center gap-2"><Tag size={16}/> 换标数量 (Relabel Count)</label>
                             <input 
                                type="number" 
                                className="w-full border p-2 rounded-lg"
                                placeholder="输入实际换标数量"
                                value={vasData.label_count}
                                onChange={e=>setVasData({...vasData, label_count: Number(e.target.value)})}
                             />
                        </div>
                    )}
                </div>
            )}

            {step === 3 && (
                <div className="text-center space-y-6">
                    <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-600">
                        <Truck size={48}/>
                    </div>
                    <h4 className="text-2xl font-bold text-gray-800">准备发货 (Ready to Ship)</h4>
                    <p className="text-gray-500">点击确认将扣减库存并标记订单为已发货。</p>
                    
                    <button className="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 mx-auto hover:bg-gray-700">
                        <Printer size={18}/> 打印面单 (Print Label)
                    </button>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
            <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200">Cancel</button>
            <button 
                onClick={handleNext} 
                disabled={loading}
                className="px-8 py-3 rounded-xl font-bold bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"
            >
                {loading ? 'Processing...' : step === 3 ? 'Confirm Ship' : 'Next Step'} <CheckCircle size={18}/>
            </button>
        </div>
      </div>
    </div>
  );
}