import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { useFinanceStore } from '../store/financeStore';
import { Smartphone, Monitor, Check, AlertCircle, Info, FileText, Play, RotateCcw, Search, ShieldCheck, Wrench, Trash2, ArrowRight, BarChart3, PieChart, Download } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import ScanInput from '../components/ScanInput';

// 静态字典
const QUALITY_STANDARDS = {
    'apparel': { label: '服装标准 (Apparel)', rule_type: 'inspection', condition: 'apparel' },
    'electronics': { label: '电子产品 (Electronics)', rule_type: 'inspection', condition: 'electronics' },
    'general': { label: '普通百货 (General)', rule_type: 'inspection', condition: 'general' }
};

export default function Inspect() {
  const { t } = useTranslation();
  const user = JSON.parse(localStorage.getItem('wh_user') || '{}');
  const { calculateFee, createTransaction } = useFinanceStore();
  
  // Inspection Session State
  const [inspectStandard, setInspectStandard] = useState('general'); // Selected Standard
  const [estimatedFee, setEstimatedFee] = useState(0);

  // ... (Existing State) ...
  const [view, setView] = useState('list'); 
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  
  // ... (Existing Fetch Logic) ...
  useEffect(() => { fetchPackages(); }, []);

  const fetchPackages = async () => {
      const { data } = await supabase.from('packages').select('*').in('status', ['RECEIVED', 'INSPECTING']);
      if(data) setPackages(data);
  };
  
  // Update Fee Estimation when Standard or Quantity changes
  useEffect(() => {
      if (!selectedPkg || items.length === 0) return;
      const totalQty = items.reduce((sum, it) => sum + (it.qty || 0), 0);
      
      const calc = async () => {
          const fee = await calculateFee('inspection', totalQty, inspectStandard);
          setEstimatedFee(fee);
      };
      calc();
  }, [inspectStandard, items]);

  const submitInspection = async () => {
      if (!confirm(`确认提交质检结果？\n\n预计将产生质检费: $${estimatedFee.toFixed(2)}`)) return;
      
      try {
          // 1. Update Package Status
          await supabase.from('packages').update({ 
              status: 'INSPECTED',
              updated_at: new Date()
          }).eq('id', selectedPkg.id);

          // 2. Deduct Fee
          if (estimatedFee > 0) {
              await createTransaction(
                  selectedPkg.client, 
                  'DEDUCTION', 
                  estimatedFee, 
                  `Inspection Fee (${inspectStandard}): ${selectedPkg.tracking_no}`
              );
          }

          alert(`✅ 质检完成！费用已扣除: $${estimatedFee.toFixed(2)}`);
          setView('list');
          setSelectedPkg(null);
          setItems([]);
          fetchPackages();
      } catch (e: any) {
          alert(e.message);
      }
  };

  // ... (Rest of UI) ...
  
  // 在质检操作区域渲染标准选择器
  const StandardSelector = () => (
      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6">
          <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-blue-800 flex items-center gap-2"><ShieldCheck size={18}/> 质检标准与计费</h3>
              <div className="text-xl font-bold text-blue-600">${estimatedFee.toFixed(2)}</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
              {Object.entries(QUALITY_STANDARDS).map(([key, conf]) => (
                  <button
                      key={key}
                      onClick={() => setInspectStandard(key)}
                      className={`p-3 rounded-lg border text-sm font-bold transition-all ${
                          inspectStandard === key 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                  >
                      {conf.label}
                  </button>
              ))}
          </div>
      </div>
  );

  return (
    <div className="h-full flex flex-col">
       {/* List View ... */}
       {view === 'list' && (
           <div className="p-4">
               {/* Existing List UI */}
               <h2 className="text-2xl font-bold mb-4">质检任务列表</h2>
               <div className="grid gap-4">
                   {packages.map(p => (
                       <div key={p.id} onClick={()=>{setSelectedPkg(p); setView('detail');}} className="bg-white p-4 rounded-xl shadow cursor-pointer hover:bg-gray-50">
                           <div className="font-bold">{p.tracking_no}</div>
                           <div className="text-sm text-gray-500">{p.client}</div>
                       </div>
                   ))}
               </div>
           </div>
       )}

       {/* Detail View */}
       {view === 'detail' && selectedPkg && (
           <div className="p-4 flex flex-col h-full">
               <div className="flex justify-between items-center mb-4">
                   <h2 className="text-xl font-bold">{selectedPkg.tracking_no}</h2>
                   <button onClick={()=>setView('list')} className="text-gray-500">Back</button>
               </div>
               
               {/* Insert Standard Selector Here */}
               <StandardSelector />
               
               {/* Mock Items List for Demo */}
               <div className="flex-1 bg-white rounded-xl border p-4 mb-4">
                   <div className="flex justify-between mb-4">
                       <h3 className="font-bold">商品明细</h3>
                       <button onClick={()=>setItems([...items, {sku:'TEST', qty:10}])} className="text-xs bg-gray-100 px-2 rounded">+ Mock Item</button>
                   </div>
                   {items.map((it, idx) => (
                       <div key={idx} className="flex justify-between py-2 border-b">
                           <span>{it.sku}</span>
                           <span>x{it.qty}</span>
                       </div>
                   ))}
               </div>

               <button onClick={submitInspection} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg">
                   提交质检结果 (Submit)
               </button>
           </div>
       )}
    </div>
  );
}
