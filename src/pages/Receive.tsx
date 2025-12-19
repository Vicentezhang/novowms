import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { Check, Camera, AlertTriangle } from 'lucide-react';
import type { InboundOrder } from '../types';
import BarcodeScanner from '../components/BarcodeScanner';
import ScanInput from '../components/ScanInput';

export default function Receive() {
  const { t } = useTranslation();
  const user = JSON.parse(localStorage.getItem('wh_user') || '{}');
  const [showScanner, setShowScanner] = useState(false);
  
  // 表单状态
  const [form, setForm] = useState({ 
    trackingNo:'', 
    client:'', 
    carrier:'', 
    type:'box', 
    isAbnormal:false, 
    reason:'', 
    receipt: '',
    inbound_order_id: '' 
  });

  const [matchedOrder, setMatchedOrder] = useState<InboundOrder | null>(null);
  const [isBlind, setIsBlind] = useState(false); // 是否盲收
  
  // 下拉菜单数据
  const [clients, setClients] = useState<string[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);

  // 加载配置数据
  useEffect(() => {
    const loadConfig = async (type: string, setter: any) => {
      const q = supabase.from('clients').select('name');
      const { data } = await (type === 'client' ? q.in('type', ['client', null]) : q.eq('type', type));
      if (data) setter(data.map(d => d.name));
    };
    loadConfig('client', setClients);
    loadConfig('carrier', setCarriers);
  }, []);

  // 扫描跟踪号处理
  const handleTrackingScan = async () => {
    if (!form.trackingNo) return;
    
    // 1. 查找是否存在对应的预报单
    const { data: order } = await supabase
      .from('inbound_orders')
      .select('*')
      .eq('tracking_no', form.trackingNo)
      .maybeSingle();

    if (order) {
      setMatchedOrder(order);
      setIsBlind(false);
      // 自动填充信息
      setForm(prev => ({
        ...prev,
        client: order.client_id, // 假设 client_id 存的是 name，如果存的是 uuid 需要 lookup
        carrier: order.carrier || '',
        inbound_order_id: order.id
      }));
      // 播放成功提示音 (mock)
    } else {
      setMatchedOrder(null);
      setIsBlind(true);
      // 清空关联信息，准备盲收
      setForm(prev => ({ ...prev, client: '', carrier: '', inbound_order_id: '' }));
    }
  };

  const submit = async () => {
    const cleanTracking = form.trackingNo.trim();
    if(!cleanTracking) return alert(`❌ ${t('required')}`);
    
    // 盲收必须填客户和物流商
    if (isBlind && (!form.client || !form.carrier)) {
      return alert('无预报包裹，请手动选择客户和物流商');
    }
    
    try {
      // 🟢 1. Duplicate Check (Packages)
      const { data: existingPkg } = await supabase
        .from('packages')
        .select('id, status')
        .eq('tracking_no', cleanTracking)
        .maybeSingle();

      if (existingPkg) {
         return alert(`❌ 重复扫描: 该包裹已入库 (Status: ${existingPkg.status})`);
      }

      // 🟢 2. Duplicate Check (Inbound Orders - Orphaned Prevention)
      // Prevent creating multiple RB orders for same tracking number if previous step failed
      if (isBlind) {
          const { data: existingOrder } = await supabase
            .from('inbound_orders')
            .select('order_no, status')
            .eq('tracking_no', cleanTracking)
            .limit(1)
            .maybeSingle();
          
          if (existingOrder) {
              return alert(`⚠️ 该单号已存在入库单 (${existingOrder.order_no}) 但未生成包裹记录。\n请直接前往【开箱清点】页面扫描该单号，系统将自动修复数据。`);
          }
      }

      let inboundOrderId = form.inbound_order_id;

      // 如果是盲收，先创建临时入库单
      if (isBlind) {
        const orderNo = `RB${new Date().toISOString().slice(0,10).replace(/-/g,'')}${Math.floor(Math.random()*1000)}`;
        const { data: newOrder, error: createError } = await supabase.from('inbound_orders').insert([{
          order_no: orderNo,
          client_id: form.client,
          inbound_type: 'BLIND',
          tracking_no: cleanTracking,
          carrier: form.carrier,
          status: 'RECEIVED', // 直接设为已收到
          created_by: user.username
        }]).select().single();

        if (createError) throw createError;
        inboundOrderId = newOrder.id;
      } else {
        // 如果是预报，更新入库单状态
        if (matchedOrder && matchedOrder.status === 'IN_TRANSIT') {
           await supabase.from('inbound_orders').update({
             status: 'RECEIVED',
             carrier: form.carrier || matchedOrder.carrier || undefined // 如果补录了物流商则更新
           }).eq('id', matchedOrder.id);
        }
      }

      // 创建 Package 记录
      const { error } = await supabase.from('packages').insert([{
        tracking_no: cleanTracking,
        client: form.client,
        carrier: form.carrier,
        type: form.type,
        is_abnormal: form.isAbnormal,
        reason: form.reason,
        receipt: form.receipt,
        operator: user.username || 'unknown',
        status: 'PENDING',
        inbound_order_id: inboundOrderId || null // Ensure we send null, not empty string
      }]).select().single();

      if(error) throw error;

      alert(`✅ ${t('msg_success')}`);
      // 重置表单
      setForm({ 
        trackingNo:'', client:'', carrier:'', type:'box', isAbnormal:false, reason:'', receipt: '', inbound_order_id: '' 
      });
      setMatchedOrder(null);
      setIsBlind(false);

    } catch (e: any) {
      console.error("Receive Submit Error:", e);
      alert(`Error: ${e.message}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        {/* 单号扫描 */}
        <ScanInput 
          label={t('recv_tracking')} 
          value={form.trackingNo} 
          onChange={(v:string)=>setForm({...form,trackingNo:v})} 
          onEnter={handleTrackingScan}
          onScanClick={()=>setShowScanner(true)}
          placeholder={t('recv_scan_ph')} 
        />

        {showScanner && (
            <BarcodeScanner 
                onScan={(val) => {
                    setForm(prev => ({...prev, trackingNo: val}));
                    // Auto trigger lookup?
                    // Better wait for user confirmation or manually trigger? 
                    // Let's set it and user can hit Enter or we can trigger it in useEffect.
                    // But simpler to just set value. User sees it and can modify or press Enter.
                    // Actually, for better UX, we can try to auto-scan.
                    // But ScanInput onEnter handles it. Let's try to just set it.
                }} 
                onClose={()=>setShowScanner(false)} 
            />
        )}

        {/* 预报状态提示 */}
        {form.trackingNo && (
          <div className={`p-3 rounded-lg text-sm font-bold flex items-center gap-2 
            ${matchedOrder ? 'bg-green-100 text-green-700' : (isBlind ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500')}
          `}>
            {matchedOrder ? (
              <><Check size={16}/> 已找到预报单: {matchedOrder.order_no}</>
            ) : (
              isBlind ? <><AlertTriangle size={16}/> 无预报 (盲收模式)</> : '请按回车查询预报...'
            )}
          </div>
        )}
        
        {/* 必填选择项 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block font-bold mb-2 text-sm text-gray-600">{t('recv_client')} <span className="text-red-500">*</span></label>
            <select 
              value={form.client} 
              onChange={e=>setForm({...form,client:e.target.value})} 
              disabled={!!matchedOrder} // 有预报则锁定
              className={`w-full p-3 rounded-xl border-2 outline-none transition-all ${!!matchedOrder ? 'bg-gray-100 border-gray-200' : 'bg-white focus:border-blue-500'}`}
            >
              <option value="">-- Select --</option>
              {clients.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-bold mb-2 text-sm text-gray-600">{t('recv_carrier')} <span className="text-red-500">*</span></label>
            <select 
              value={form.carrier} 
              onChange={e=>setForm({...form,carrier:e.target.value})} 
              className="w-full p-3 rounded-xl border-2 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-all"
            >
              <option value="">-- Select --</option>
              {carriers.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* 类型选择 */}
        <div>
          <label className="block font-bold mb-2 text-sm text-gray-600">{t('recv_type')}</label>
          <div className="flex gap-4">
            {['box', 'pallet'].map(type => (
              <button 
                key={type}
                onClick={()=>setForm({...form, type})} 
                className={`flex-1 p-4 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2 ${
                  form.type===type 
                    ? 'bg-blue-50 border-blue-600 text-blue-700' 
                    : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300'
                }`}
              >
                {type === 'box' ? t('recv_box') : t('recv_pallet')}
                {form.type===type && <Check size={18}/>}
              </button>
            ))}
          </div>
        </div>

        {/* 异常处理 */}
        <div className={`p-4 rounded-xl border-2 transition-all ${form.isAbnormal ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <div className="flex justify-between items-center" onClick={()=>setForm({...form,isAbnormal:!form.isAbnormal})}>
            <span className={`font-bold flex items-center gap-2 ${form.isAbnormal?'text-red-600':'text-gray-700'}`}>
              ⚠️ {t('recv_abnormal')}
            </span>
            <div className={`w-12 h-6 rounded-full p-1 transition-colors ${form.isAbnormal?'bg-red-500':'bg-gray-200'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${form.isAbnormal?'translate-x-6':''}`}/>
            </div>
          </div>
          
          {form.isAbnormal && (
            <div className="mt-4 animate-fadeIn space-y-4">
              <input 
                placeholder={t('recv_reason')} 
                value={form.reason} 
                onChange={e=>setForm({...form,reason:e.target.value})} 
                className="w-full p-3 border rounded-lg border-red-200 focus:border-red-500 outline-none" 
              />
              <div className="flex gap-4">
                <button className="flex-1 h-24 border-2 border-dashed border-red-200 rounded-lg flex flex-col items-center justify-center bg-white text-red-400">
                  <Camera size={24} className="mb-1"/>
                  <span className="text-xs">{t('recv_photo_app')}</span>
                </button>
                <button className="flex-1 h-24 border-2 border-dashed border-red-200 rounded-lg flex flex-col items-center justify-center bg-white text-red-400">
                  <Camera size={24} className="mb-1"/>
                  <span className="text-xs">{t('recv_photo_wgt')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 提交按钮 */}
        <button 
          onClick={submit} 
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold text-xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all active:scale-95"
        >
          {t('btn_submit')}
        </button>
      </div>
    </div>
  );
}
