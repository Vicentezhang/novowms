import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, Download, AlertTriangle, CheckCircle, FileSpreadsheet, X } from 'lucide-react';

interface BatchItem {
  inbound_type: string;
  warehouse_code?: string; // Optional, defaults to current context if not provided
  reference_no: string; // Used for grouping (e.g. tracking_no)
  expected_date: string;
  sku: string;
  qty: number;
  remark?: string;
}

interface ValidationResult {
  row: number;
  error?: string;
  data?: BatchItem;
}

interface BatchInboundProps {
  onClose: () => void;
  onSuccess: () => void;
  user: any;
}

const MAX_ROWS = 500;
const MAX_ORDERS = 20;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export default function BatchInbound({ onClose, onSuccess, user }: BatchInboundProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationSummary, setValidationSummary] = useState<{ total: number, valid: number, invalid: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const headers = ['入库类型(必填)', '参考号/跟踪号(必填)', '预计日期(YYYY-MM-DD)', 'SKU(必填)', '数量(必填)', '备注'];
    const example = ['RETURN', 'TRACK123', '2024-01-01', 'SKU001', '10', 'Sample Remark'];
    const csvContent = "\uFEFF" + [headers, example].map(e => e.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'batch_inbound_template.csv';
    link.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
      alert(`文件大小不能超过 2MB`);
      return;
    }

    setFile(selectedFile);
    setPreviewData([]);
    setValidationSummary(null);
    validateFile(selectedFile);
  };

  const validateFile = async (file: File) => {
    setIsValidating(true);
    const text = await file.text();
    const rows = text.split('\n').map(r => r.trim()).filter(r => r);
    
    if (rows.length > MAX_ROWS + 1) { // +1 for header
        setPreviewData([{ row: 0, error: `文件行数超过限制 (最大 ${MAX_ROWS} 行)` }]);
        setIsValidating(false);
        return;
    }

    const results: ValidationResult[] = [];
    let validCount = 0;
    
    // Skip header
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(',').map(c => c.trim());
        const rowNum = i + 1;
        
        if (cols.length < 5) {
            results.push({ row: rowNum, error: '列数不足，请检查模板格式' });
            continue;
        }

        const [type, ref, date, sku, qtyStr, remark] = cols;
        const qty = parseInt(qtyStr);
        
        // Basic Validation
        if (!['RETURN', 'NEW', 'AFTER_SALES'].includes(type)) {
            results.push({ row: rowNum, error: '无效的入库类型 (允许值: RETURN, NEW, AFTER_SALES)' });
            continue;
        }
        if (!ref) {
             results.push({ row: rowNum, error: '参考号/跟踪号不能为空' });
             continue;
        }
        if (!sku) {
             results.push({ row: rowNum, error: 'SKU不能为空' });
             continue;
        }
        if (isNaN(qty) || qty <= 0) {
             results.push({ row: rowNum, error: '数量必须为正整数' });
             continue;
        }
        
        // Date Validation
        const dateReg = /^\d{4}-\d{2}-\d{2}$/;
        if (!date && !dateReg.test(date)) {
             results.push({ row: rowNum, error: '日期格式错误 (需为 YYYY-MM-DD)' });
             continue;
        }

        validCount++;
        results.push({
            row: rowNum,
            data: {
                inbound_type: type,
                reference_no: ref,
                expected_date: date || new Date().toISOString().split('T')[0],
                sku,
                qty,
                remark
            }
        });
    }

    setPreviewData(results);
    setValidationSummary({
        total: results.length,
        valid: validCount,
        invalid: results.length - validCount
    });
    setIsValidating(false);
  };

  const handleSubmit = async () => {
    if (!validationSummary || validationSummary.invalid > 0) {
        alert('请修正所有错误后再提交');
        return;
    }
    
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
        // Group by reference_no to create orders
        const ordersMap = new Map<string, BatchItem[]>();
        previewData.forEach(item => {
            if (item.data) {
                const key = `${item.data.inbound_type}_${item.data.reference_no}`;
                if (!ordersMap.has(key)) {
                    ordersMap.set(key, []);
                }
                ordersMap.get(key)?.push(item.data);
            }
        });

        if (ordersMap.size > MAX_ORDERS) {
            throw new Error(`合并后订单数超过限制 (最大 ${MAX_ORDERS} 单, 当前 ${ordersMap.size} 单)`);
        }

        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        let successCount = 0;

        for (const [, items] of ordersMap) {
            const first = items[0];
            const random = Math.floor(Math.random() * 10000).toString().padStart(5, '0');
            const orderNo = `R${timestamp}${random}`; // Simple generation, ideally check unique

            // Create Order
            const { data: order, error: orderError } = await supabase.from('inbound_orders').insert([{
                order_no: orderNo,
                client_id: user.role === 'admin' ? '' : user.username, // If admin, maybe need to specify client in CSV? Assuming self for now or need logic
                inbound_type: first.inbound_type,
                tracking_no: first.reference_no,
                expected_date: first.expected_date,
                remark: `Batch Import: ${first.remark || ''}`,
                created_by: user.username,
                status: 'IN_TRANSIT',
                updated_at: new Date()
            }]).select().single();

            if (orderError) throw orderError;

            // Create Items
            const { error: itemsError } = await supabase.from('inbound_items').insert(
                items.map(i => ({
                    order_id: order.id,
                    sku: i.sku,
                    expected_qty: i.qty
                }))
            );

            if (itemsError) throw itemsError;
            successCount++;
        }

        // Log
        await supabase.from('operation_logs').insert([{
             target_table: 'inbound_orders',
             action: 'BATCH_IMPORT',
             operator: user.username,
             details: { 
                 file_name: file?.name,
                 total_orders: successCount,
                 total_rows: previewData.length
             }
        }]);

        alert(`成功导入 ${successCount} 个入库单`);
        onSuccess();
        onClose();

    } catch (e: any) {
        console.error(e);
        alert(`导入失败: ${e.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <FileSpreadsheet className="text-green-600"/> 批量新增预报
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={24}/>
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
            {/* Step 1: Upload */}
            <div className="mb-8">
                <div className="flex gap-4 mb-4">
                    <button 
                        onClick={downloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm font-bold text-gray-600"
                    >
                        <Download size={16}/> 下载模板
                    </button>
                    <div className="flex-1">
                        <input 
                            type="file" 
                            accept=".csv"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 text-sm font-bold"
                        >
                            <Upload size={16}/> 上传文件 (CSV)
                        </button>
                        <span className="ml-3 text-sm text-gray-500">
                            {file ? file.name : '未选择文件'}
                        </span>
                    </div>
                </div>
                
                <div className="text-xs text-gray-400 space-y-1">
                    <p>• 单次限制 20 单 / 500 行 / 2MB</p>
                    <p>• 相同“入库类型+跟踪号”将自动合并为同一订单</p>
                </div>
            </div>

            {/* Step 2: Validation Results */}
            {isValidating && (
                <div className="text-center py-8 text-gray-500">正在校验数据...</div>
            )}

            {!isValidating && validationSummary && (
                <div className="space-y-4">
                    <div className="flex gap-4 text-sm font-bold">
                        <span className="text-gray-600">总行数: {validationSummary.total}</span>
                        <span className="text-green-600">有效: {validationSummary.valid}</span>
                        {validationSummary.invalid > 0 && (
                            <span className="text-red-600">错误: {validationSummary.invalid}</span>
                        )}
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="p-3 w-16">行号</th>
                                    <th className="p-3">状态</th>
                                    <th className="p-3">内容摘要</th>
                                    <th className="p-3">详情/原因</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {previewData.map((res, idx) => (
                                    <tr key={idx} className={res.error ? 'bg-red-50' : 'hover:bg-gray-50'}>
                                        <td className="p-3 text-gray-500">{res.row}</td>
                                        <td className="p-3">
                                            {res.error ? (
                                                <AlertTriangle size={16} className="text-red-500"/>
                                            ) : (
                                                <CheckCircle size={16} className="text-green-500"/>
                                            )}
                                        </td>
                                        <td className="p-3 font-mono text-xs">
                                            {res.data ? `${res.data.reference_no} | ${res.data.sku} x${res.data.qty}` : '-'}
                                        </td>
                                        <td className="p-3 text-red-600 font-medium">
                                            {res.error || <span className="text-gray-400">OK</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
            <button 
                onClick={onClose}
                className="px-6 py-2 border rounded-lg font-bold text-gray-600 hover:bg-white"
            >
                取消
            </button>
            <button 
                onClick={handleSubmit}
                disabled={!validationSummary || validationSummary.invalid > 0 || isSubmitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
                {isSubmitting ? '提交中...' : '确认导入'}
            </button>
        </div>
      </div>
    </div>
  );
}
