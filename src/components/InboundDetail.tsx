import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Printer, Download, Clock, User, Box, FileText, Activity, CheckCircle, AlertTriangle, Package as PackageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { InboundOrder } from '../types';

interface InboundDetailProps {
  order: InboundOrder;
  onClose: () => void;
}

export default function InboundDetail({ order, onClose }: InboundDetailProps) {
  const [items, setItems] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [pkgItems, setPkgItems] = useState<any[]>([]); // Detailed items from packages
  const [loading, setLoading] = useState(true);

  // Status Stepper
  const steps = [
      { id: 'IN_TRANSIT', label: '在途', icon: <Clock size={16}/> },
      { id: 'RECEIVED', label: '已收货', icon: <PackageIcon size={16}/> },
      { id: 'COUNTED', label: '已清点', icon: <CheckCircle size={16}/> },
      { id: 'INSPECTING', label: '质检中', icon: <Activity size={16}/> },
      { id: 'COMPLETED', label: '已完成', icon: <FileText size={16}/> }
  ];
  
  const currentStepIdx = steps.findIndex(s => s.id === order.status);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 1. Fetch Items with Product Info
      // Note: Supabase join syntax depends on foreign key setup. 
      // Assuming 'sku' in inbound_items maps to 'sku' in products (which might not be a direct FK).
      // If no FK, we fetch items then fetch products. Let's do simple fetch first.
      const { data: orderItems } = await supabase
        .from('inbound_items')
        .select('*')
        .eq('order_id', order.id);

      if (orderItems && orderItems.length > 0) {
          const skus = orderItems.map(i => i.sku);
          const { data: products } = await supabase.from('products').select('sku, name, attributes').in('sku', skus);
          
          const merged = orderItems.map(item => {
              const prod = products?.find(p => p.sku === item.sku);
              return {
                  ...item,
                  product_name: prod?.name || '-',
                  specs: prod?.attributes || {}
              };
          });
          setItems(merged);
      } else {
          setItems([]);
      }

      // 2. Fetch Detailed Package Items (SKU + LPN)
      // Note: Wrap in try-catch to handle potential schema cache issues gracefully
      try {
          // Explicitly select columns. REMOVED 'created_at' because database reports it does not exist.
          // Using 'id' and 'tracking_no' and 'status' only to be safe.
          const { data: pkgs, error: pkgError } = await supabase.from('packages').select('id, tracking_no, status').eq('inbound_order_id', order.id);
          
          if (pkgError) {
             console.error("Error fetching packages:", pkgError);
             setPkgItems([]); 
          } else if (pkgs && pkgs.length > 0) {
             const pkgIds = pkgs.map(p => p.id);
             const { data: pItems } = await supabase.from('items').select('*').in('package_id', pkgIds);
             
             // Fetch Inspection Data
             const itemIds = pItems?.map(i => i.id) || [];
             let inspections: any[] = [];
             if (itemIds.length > 0) {
                 const { data: inspData } = await supabase.from('inspections').select('*').in('target_item_id', itemIds);
                 inspections = inspData || [];
             }

             const merged = (pItems || []).map(pi => {
                const pkg = pkgs.find(p => p.id === pi.package_id);
                const insp = inspections.find(i => i.target_item_id === pi.id);
                return { 
                    ...pi, 
                    pkg_tracking: pkg?.tracking_no, 
                    pkg_status: pkg?.status, 
                    pkg_time: (pkg as any)?.created_at, // Use 'any' cast if created_at is dynamic
                    inspection: insp ? {
                        status: insp.status,
                        grade: insp.grade,
                        faults: insp.faults,
                        imei: insp.imei,
                        inspector: insp.inspector,
                        inspected_at: insp.inspected_at
                    } : null
                };
             });
             setPkgItems(merged);
          } else {
             setPkgItems([]);
          }
      } catch (err) {
          console.error("Unexpected error fetching packages:", err);
          setPkgItems([]);
      }

      // 3. Fetch Logs
      const { data: opLogs } = await supabase
        .from('operation_logs')
        .select('*')
        .eq('target_table', 'inbound_orders')
        .eq('target_id', order.id)
        .order('created_at', { ascending: false });
      
      setLogs(opLogs || []);
      
      setLoading(false);
    };

    fetchData();
  }, [order.id]);

  const exportDetailExcel = () => {
      const data = items.map(i => ({
          "SKU": i.sku,
          "产品名称": i.product_name,
          "预期数量": i.expected_qty,
          "实际数量": i.received_qty || 0,
          "规格": JSON.stringify(i.specs),
          "更新时间": new Date(i.created_at).toLocaleString()
      }));
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Order Details");
      XLSX.writeFile(wb, `Inbound_Detail_${order.order_no}.xlsx`);
  };

  const exportPkgItemsExcel = () => {
      const data = pkgItems.map(p => ({
          "SKU": p.sku,
          "LPN": p.lpn || '-',
          "数量": p.qty,
          "入库时间": p.pkg_time ? new Date(p.pkg_time).toLocaleString() : '-',
          "包裹状态": p.pkg_status,
          "质检状态": p.return_type === 'INSPECT' ? '待质检' : '新品',
          "备注": p.remark
      }));
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Package Items");
      XLSX.writeFile(wb, `Items_Detail_${order.order_no}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-fadeIn">
        
        {/* Header */}
        <div className="p-6 border-b bg-gray-50 rounded-t-2xl">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl font-bold text-gray-800">{order.order_no}</h2>
                        <span className={`px-3 py-1 rounded-full text-sm font-bold 
                            ${order.status === 'IN_TRANSIT' ? 'bg-yellow-100 text-yellow-700' : ''}
                            ${order.status === 'RECEIVED' ? 'bg-blue-100 text-blue-700' : ''}
                            ${order.status === 'COUNTED' ? 'bg-indigo-100 text-indigo-700' : ''}
                            ${order.status === 'INSPECTING' ? 'bg-purple-100 text-purple-700' : ''}
                            ${order.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : ''}
                        `}>
                            {order.status}
                        </span>
                    </div>
                    <div className="flex gap-6 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><User size={14}/> {order.created_by}</span>
                        <span className="flex items-center gap-1"><Clock size={14}/> {new Date(order.created_at || '').toLocaleString()}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg" title="Print">
                        <Printer size={20}/>
                    </button>
                    <button onClick={exportDetailExcel} className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg" title="Export">
                        <Download size={20}/>
                    </button>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:bg-red-100 hover:text-red-500 rounded-lg">
                        <X size={24}/>
                    </button>
                </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-between px-10">
                {steps.map((step, idx) => {
                    const isCompleted = idx <= currentStepIdx;
                    const isCurrent = idx === currentStepIdx;
                    return (
                        <div key={step.id} className="flex flex-col items-center relative z-10">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all duration-500
                                ${isCompleted ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-gray-200 text-gray-400'}
                            `}>
                                {step.icon}
                            </div>
                            <span className={`text-xs font-bold ${isCurrent ? 'text-blue-600' : 'text-gray-500'}`}>{step.label}</span>
                            {/* Connecting Line */}
                            {idx < steps.length - 1 && (
                                <div className={`absolute top-5 left-1/2 w-[calc(100%_+_20px)] h-1 -z-10
                                    ${idx < currentStepIdx ? 'bg-blue-600' : 'bg-gray-200'}
                                `} style={{ width: '200%', left: '50%' }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {/* 1. Basic Info */}
            <section>
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <FileText size={18} className="text-blue-600"/> 基础信息
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div>
                        <label className="text-xs text-gray-400 font-bold uppercase">客户</label>
                        <div className="font-medium">{order.client_id}</div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 font-bold uppercase">入库类型</label>
                        <div className="font-medium">{order.inbound_type}</div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 font-bold uppercase">跟踪号</label>
                        <div className="font-mono font-medium">{order.tracking_no || '-'}</div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 font-bold uppercase">预计日期</label>
                        <div className="font-medium">{order.expected_date}</div>
                    </div>
                    <div className="col-span-2">
                        <label className="text-xs text-gray-400 font-bold uppercase">备注</label>
                        <div className="font-medium text-gray-600">{order.remark || '-'}</div>
                    </div>
                </div>
            </section>

            {/* 2. Product List */}
            <section>
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Box size={18} className="text-blue-600"/> 产品清单 ({items.length})
                </h3>
                <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-3">SKU</th>
                                <th className="p-3">产品名称</th>
                                <th className="p-3 text-right">预期</th>
                                <th className="p-3 text-right">实收</th>
                                <th className="p-3 text-right">良品/不良</th>
                                <th className="p-3">规格/属性</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Loading...</td></tr>
                            ) : items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="p-3 font-mono font-bold">{item.sku}</td>
                                    <td className="p-3">{item.product_name}</td>
                                    <td className="p-3 text-right font-bold text-gray-500">{item.expected_qty}</td>
                                    <td className="p-3 text-right font-bold text-blue-600">{item.received_qty || 0}</td>
                                    <td className="p-3 text-right">
                                        {(item.passed_qty > 0 || item.failed_qty > 0) ? (
                                            <div className="flex justify-end gap-2 text-xs">
                                                <span className="text-green-600 bg-green-50 px-1.5 rounded">{item.passed_qty} OK</span>
                                                {item.failed_qty > 0 && <span className="text-red-600 bg-red-50 px-1.5 rounded">{item.failed_qty} NG</span>}
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className="p-3 text-xs text-gray-500">
                                        {item.specs ? JSON.stringify(item.specs) : '-'}
                                    </td>
                                </tr>
                            ))}
                            {!loading && items.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">暂无明细数据</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 3. Detailed Package Items (SKU/LPN) */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <PackageIcon size={18} className="text-blue-600"/> 关联包裹明细 ({pkgItems.length})
                    </h3>
                    {pkgItems.length > 0 && (
                        <button onClick={exportPkgItemsExcel} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <Download size={12}/> 导出明细
                        </button>
                    )}
                </div>
                <div className="border rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b sticky top-0 z-10">
                            <tr>
                                <th className="p-3">SKU</th>
                                <th className="p-3">LPN</th>
                                <th className="p-3 text-right">数量</th>
                                <th className="p-3">入库时间</th>
                                <th className="p-3">包裹状态</th>
                                <th className="p-3">质检详情</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {pkgItems.map((item, idx) => (
                                <tr key={idx} className={`hover:bg-gray-50 ${item.return_type === 'INSPECT' ? 'bg-orange-50/50' : ''}`}>
                                    <td className="p-3 font-mono font-bold text-gray-700">{item.sku}</td>
                                    <td className="p-3 font-mono">
                                        {item.lpn ? (
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.return_type === 'INSPECT' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {item.lpn}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td className="p-3 text-right font-bold">{item.qty}</td>
                                    <td className="p-3 text-gray-500 text-xs">{item.pkg_time ? new Date(item.pkg_time).toLocaleString() : '-'}</td>
                                    <td className="p-3 text-xs">
                                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.pkg_status}</span>
                                    </td>
                                    <td className="p-3">
                                        {item.return_type === 'INSPECT' ? (
                                            item.inspection ? (
                                                <div className="text-xs">
                                                    <div className="flex items-center gap-1 font-bold">
                                                        {item.inspection.status === 'PASS' 
                                                            ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12}/> PASS ({item.inspection.grade})</span>
                                                            : <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12}/> {item.inspection.status}</span>
                                                        }
                                                    </div>
                                                    {item.inspection.imei && <div className="text-gray-500 mt-0.5">IMEI: {item.inspection.imei}</div>}
                                                    {item.inspection.faults && item.inspection.faults.length > 0 && (
                                                        <div className="text-red-400 mt-0.5 max-w-[150px] truncate" title={item.inspection.faults.join(', ')}>
                                                            {item.inspection.faults.join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-orange-500 font-bold flex items-center gap-1 text-xs">
                                                    <Clock size={12}/> 待质检
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-green-600 font-bold text-xs">新品</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {!loading && pkgItems.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">暂无包裹明细数据</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 4. Operation Logs */}
            <section>
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-blue-600"/> 操作记录
                </h3>
                <div className="space-y-4">
                    {logs.map((log, idx) => (
                        <div key={idx} className="flex gap-4 items-start">
                            <div className="min-w-[150px] text-xs text-gray-400 pt-1">
                                {new Date(log.created_at).toLocaleString()}
                            </div>
                            <div className="flex-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div className="font-bold text-sm text-gray-700 flex items-center gap-2">
                                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{log.action}</span>
                                    {log.operator}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 font-mono break-all">
                                    {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                                </div>
                            </div>
                        </div>
                    ))}
                    {!loading && logs.length === 0 && (
                        <div className="text-gray-400 text-sm italic">暂无操作记录</div>
                    )}
                </div>
            </section>
        </div>
      </div>
    </div>
  );
}
