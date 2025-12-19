import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';
import { useFinanceStore } from '../store/financeStore';
import { DollarSign, CreditCard, TrendingUp, Settings, FileText, Edit, Trash, Plus, Search } from 'lucide-react';
import { FinanceRule, FinanceTransaction } from '../types';

export default function Finance() {
  const { t } = useTranslation();
  const user = JSON.parse(localStorage.getItem('wh_user') || '{}');
  const isClient = user.role === 'client';
  
  const { rules, wallet, fetchRules, fetchWallet, createTransaction } = useFinanceStore();
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [view, setView] = useState(isClient ? 'wallet' : 'dashboard');
  
  // Admin State
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  
  // Rule Edit State
  const [isEditingRule, setIsEditingRule] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<FinanceRule>>({});

  useEffect(() => {
    fetchRules();
    if (isClient) {
        fetchWallet(user.username);
        fetchTransactions(user.username);
    } else {
        loadClients();
    }
  }, []);

  const loadClients = async () => {
      const { data } = await supabase.from('finance_accounts').select('*');
      if(data) setClients(data);
  };

  const fetchTransactions = async (clientId: string) => {
      const { data } = await supabase.from('finance_transactions')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50);
      if(data) setTransactions(data as FinanceTransaction[]);
  };

  const handleTopUp = async () => {
      if (!wallet) return;
      const amount = prompt("请输入充值金额 (模拟):", "100");
      if (amount && !isNaN(Number(amount))) {
          await createTransaction(user.username, 'RECHARGE', Number(amount), '用户自助充值');
          fetchTransactions(user.username); // Refresh list
          alert("充值成功！");
      }
  };

  const saveRule = async () => {
      if (!editingRule.name || !editingRule.price) return alert("请填写完整");
      
      const payload = {
          name: editingRule.name,
          type: editingRule.type,
          price: Number(editingRule.price),
          unit: editingRule.unit,
          condition: editingRule.condition
      };

      if (editingRule.id) {
          await supabase.from('finance_rules').update(payload).eq('id', editingRule.id);
      } else {
          await supabase.from('finance_rules').insert([payload]);
      }
      setIsEditingRule(false);
      fetchRules();
  };

  // --- Render Views ---

  const ClientView = () => (
      <div className="space-y-6">
          {/* Wallet Card */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-8 text-white shadow-xl">
              <div className="flex justify-between items-start">
                  <div>
                      <p className="text-blue-200 font-bold mb-1">当前余额 (Balance)</p>
                      <h1 className="text-5xl font-bold flex items-baseline gap-2">
                          <span className="text-2xl">$</span>
                          {wallet?.balance?.toFixed(2) || '0.00'}
                      </h1>
                  </div>
                  <button 
                    onClick={handleTopUp}
                    className="bg-white text-blue-700 px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-50 transition-all flex items-center gap-2"
                  >
                      <CreditCard size={20}/> 立即充值
                  </button>
              </div>
              <div className="mt-8 flex gap-8 text-sm text-blue-100">
                  <div>
                      <p className="opacity-70">信用额度</p>
                      <p className="font-bold text-lg">${wallet?.credit_limit || 0}</p>
                  </div>
                  <div>
                      <p className="opacity-70">本月消费</p>
                      <p className="font-bold text-lg">$0.00</p>
                  </div>
              </div>
          </div>

          {/* Transaction List */}
          <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
              <div className="p-4 border-b bg-gray-50 font-bold text-gray-700 flex items-center gap-2">
                  <FileText size={18}/> 交易明细 (Recent Transactions)
              </div>
              <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                      <tr>
                          <th className="p-4">时间</th>
                          <th className="p-4">类型</th>
                          <th className="p-4">描述</th>
                          <th className="p-4 text-right">金额</th>
                          <th className="p-4 text-right">变动后余额</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y">
                      {transactions.map(tx => (
                          <tr key={tx.id} className="hover:bg-gray-50">
                              <td className="p-4 text-gray-500">{new Date(tx.created_at).toLocaleString()}</td>
                              <td className="p-4">
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                                      tx.type === 'RECHARGE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                      {tx.type}
                                  </span>
                              </td>
                              <td className="p-4">{tx.description}</td>
                              <td className={`p-4 text-right font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                              </td>
                              <td className="p-4 text-right font-mono text-gray-600">${tx.balance_after.toFixed(2)}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
  );

  const AdminView = () => (
      <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                 <h3 className="text-gray-500 text-sm font-bold mb-2">总客户数</h3>
                 <p className="text-3xl font-bold text-gray-800">{clients.length}</p>
             </div>
             <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                 <h3 className="text-gray-500 text-sm font-bold mb-2">活跃计费规则</h3>
                 <p className="text-3xl font-bold text-blue-600">{rules.length}</p>
             </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-gray-100">
              <div className="p-4 border-b flex justify-between items-center">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2">
                      <Settings size={18}/> 计费规则配置 (Global Rules)
                  </h3>
                  <button 
                    onClick={() => { setEditingRule({}); setIsEditingRule(true); }}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center gap-1"
                  >
                      <Plus size={16}/> 新增规则
                  </button>
              </div>
              <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50">
                      <tr>
                          <th className="p-4">规则名称</th>
                          <th className="p-4">类型 (Fee Type)</th>
                          <th className="p-4">条件 (Condition)</th>
                          <th className="p-4">单价 (Price)</th>
                          <th className="p-4">单位 (Unit)</th>
                          <th className="p-4 text-right">操作</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y">
                      {rules.map(rule => (
                          <tr key={rule.id}>
                              <td className="p-4 font-bold">{rule.name}</td>
                              <td className="p-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-600">{rule.type}</span></td>
                              <td className="p-4 text-gray-500">{rule.condition || '-'}</td>
                              <td className="p-4 font-bold text-green-600">${rule.price}</td>
                              <td className="p-4 text-gray-500">{rule.unit}</td>
                              <td className="p-4 text-right flex justify-end gap-2">
                                  <button onClick={()=>{setEditingRule(rule); setIsEditingRule(true)}} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit size={16}/></button>
                                  <button onClick={async ()=>{
                                      if(confirm('Delete?')) {
                                          await supabase.from('finance_rules').delete().eq('id', rule.id);
                                          fetchRules();
                                      }
                                  }} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>

          {/* Rule Edit Modal */}
          {isEditingRule && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
                      <h3 className="font-bold text-lg mb-4">{editingRule.id ? '编辑规则' : '新增规则'}</h3>
                      <div className="space-y-3">
                          <input className="w-full border p-2 rounded" placeholder="规则名称 (e.g. 贴标费)" value={editingRule.name || ''} onChange={e=>setEditingRule({...editingRule, name:e.target.value})}/>
                          <select className="w-full border p-2 rounded" value={editingRule.type || 'storage'} onChange={e=>setEditingRule({...editingRule, type:e.target.value as any})}>
                              <option value="storage">仓储费 (Storage)</option>
                              <option value="inbound_handling">入库操作费 (Inbound)</option>
                              <option value="outbound_picking">出库拣货费 (Picking)</option>
                              <option value="labeling">贴标费 (Labeling)</option>
                              <option value="material">耗材费 (Material)</option>
                              <option value="inspection">质检费 (Inspection)</option>
                              <option value="pallet_fee">打托费 (Pallet)</option>
                          </select>
                          <input className="w-full border p-2 rounded" placeholder="条件 (e.g. standard/complex)" value={editingRule.condition || ''} onChange={e=>setEditingRule({...editingRule, condition:e.target.value})}/>
                          <div className="flex gap-2">
                              <input type="number" className="w-full border p-2 rounded" placeholder="单价" value={editingRule.price || ''} onChange={e=>setEditingRule({...editingRule, price:Number(e.target.value)})}/>
                              <select className="w-full border p-2 rounded" value={editingRule.unit || 'per_item'} onChange={e=>setEditingRule({...editingRule, unit:e.target.value as any})}>
                                  <option value="per_item">Per Item</option>
                                  <option value="per_order">Per Order</option>
                                  <option value="per_carton">Per Carton</option>
                                  <option value="per_pallet">Per Pallet</option>
                              </select>
                          </div>
                      </div>
                      <div className="mt-6 flex justify-end gap-2">
                          <button onClick={()=>setIsEditingRule(false)} className="px-4 py-2 text-gray-500 font-bold">Cancel</button>
                          <button onClick={saveRule} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Save</button>
                      </div>
                  </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="max-w-6xl mx-auto h-full p-4">
       <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <DollarSign className="text-green-600"/> 财务中心 (Finance)
          </h2>
          {!isClient && (
              <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button onClick={()=>setView('dashboard')} className={`px-4 py-1 rounded-md text-sm font-bold ${view==='dashboard'?'bg-white shadow text-blue-600':''}`}>Dashboard</button>
                  <button onClick={()=>setView('accounts')} className={`px-4 py-1 rounded-md text-sm font-bold ${view==='accounts'?'bg-white shadow text-blue-600':''}`}>Client Accounts</button>
              </div>
          )}
       </div>

       {isClient ? <ClientView/> : <AdminView/>}
    </div>
  );
}