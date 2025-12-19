import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { FinanceRule, FinanceAccount, FinanceTransaction } from '../types';

interface FinanceState {
  // Data
  wallets: FinanceAccount[];
  transactions: FinanceTransaction[];
  rules: FinanceRule[];
  stats: {
      totalRevenue: number;
      totalDebtors: number;
      totalBalance: number;
  };
  isLoading: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  fetchDashboardData: (role: string, userId: string) => Promise<void>;
  
  // Billing Operations
  chargeCustomer: (clientId: string, feeType: string, quantity: number, referenceId?: string, condition?: string) => Promise<void>;
  topUp: (clientId: string, amount: number) => Promise<void>;
  
  // Rule Management
  fetchRules: () => Promise<void>;
  updateRule: (rule: Partial<FinanceRule>) => Promise<void>;
}

// Mock Data for Demo
const MOCK_WALLETS: FinanceAccount[] = [
    { client_id: 'YUNJI/YJ002', client_name: 'YunJi Corp', balance: 5420.50, credit_limit: 10000, currency: 'USD', status: 'active', updated_at: new Date().toISOString() },
    { client_id: 'TECH_INC', client_name: 'Tech Innovation', balance: -150.00, credit_limit: 5000, currency: 'USD', status: 'overdue', updated_at: new Date().toISOString() },
    { client_id: 'GLOBAL_TRADE', client_name: 'Global Trading', balance: 12000.00, credit_limit: 20000, currency: 'USD', status: 'active', updated_at: new Date().toISOString() },
    { client_id: 'STARTUP_X', client_name: 'Startup X', balance: 50.00, credit_limit: 1000, currency: 'USD', status: 'active', updated_at: new Date().toISOString() }
];

export const useFinanceStore = create<FinanceState>((set, get) => ({
  wallets: [],
  transactions: [],
  rules: [],
  stats: { totalRevenue: 0, totalDebtors: 0, totalBalance: 0 },
  isLoading: false,

  initialize: async () => {
      // Load rules initially
      await get().fetchRules();
  },

  fetchRules: async () => {
      const { data } = await supabase.from('finance_rules').select('*');
      // If DB is empty, use some defaults? For now just set empty or data
      if (data) set({ rules: data as FinanceRule[] });
  },

  updateRule: async (rule) => {
      if (rule.id) {
          await supabase.from('finance_rules').update(rule).eq('id', rule.id);
      } else {
          await supabase.from('finance_rules').insert([rule]);
      }
      get().fetchRules();
  },

  fetchDashboardData: async (role: string, userId: string) => {
    set({ isLoading: true });
    
    // 1. Wallets
    // In real app, fetch from DB. For Demo, we use MOCK if DB is empty, or mix.
    const { data: dbWallets } = await supabase.from('finance_accounts').select('*');
    
    let targetWallets = dbWallets && dbWallets.length > 0 ? dbWallets : MOCK_WALLETS;

    // Filter for Client
    if (role === 'client') {
        targetWallets = targetWallets.filter(w => w.client_id === userId);
    }
    
    // 2. Transactions
    let q = supabase.from('finance_transactions').select('*').order('created_at', { ascending: false }).limit(100);
    if (role === 'client') {
        q = q.eq('client_id', userId);
    }
    const { data: txs } = await q;

    // 3. Calc Stats (Admin Only)
    let stats = { totalRevenue: 0, totalDebtors: 0, totalBalance: 0 };
    if (role === 'admin') {
        stats.totalBalance = targetWallets.reduce((sum, w) => sum + (w.balance || 0), 0);
        stats.totalDebtors = targetWallets.filter(w => (w.balance || 0) < 0).length;
        // Mock revenue calc from transactions (RECHARGEs)
        // stats.totalRevenue = (txs || []).filter(t => t.type === 'RECHARGE').reduce((sum, t) => sum + t.amount, 0);
        stats.totalRevenue = 25800; // Mock fixed number for demo
    }

    set({ 
        wallets: targetWallets as FinanceAccount[], 
        transactions: (txs || []) as FinanceTransaction[],
        stats,
        isLoading: false 
    });
  },

  chargeCustomer: async (clientId, feeType, quantity, referenceId, condition) => {
      const { rules, wallets } = get();
      
      // 1. Find Rule
      // Priority: Specific Condition > General
      let rule = rules.find(r => r.type === feeType && r.condition === condition && (r.client_id === clientId || !r.client_id));
      if (!rule) {
           rule = rules.find(r => r.type === feeType && !r.condition && (r.client_id === clientId || !r.client_id));
      }
      
      if (!rule) {
          console.warn(`No billing rule found for ${feeType}`);
          return; 
      }

      const amount = rule.price * quantity;
      if (amount <= 0) return;

      // 2. Optimistic Update Local Wallet
      const walletIdx = wallets.findIndex(w => w.client_id === clientId);
      let currentBal = 0;
      if (walletIdx >= 0) {
          currentBal = wallets[walletIdx].balance;
          // Update local state immediately for UI response
          const newWallets = [...wallets];
          newWallets[walletIdx] = { ...newWallets[walletIdx], balance: currentBal - amount };
          set({ wallets: newWallets });
      }

      // 3. DB Operations
      try {
          // A. Insert Transaction
          const { error: txError } = await supabase.from('finance_transactions').insert([{
              client_id: clientId,
              type: 'DEDUCTION',
              amount: amount,
              balance_after: currentBal - amount,
              description: `${rule.name} x${quantity}`,
              reference_id: referenceId,
              operator: 'system'
          }]);
          if (txError) throw txError;

          // B. Update Account
          // If account doesn't exist in DB (using Mock), this will fail silently or need upsert.
          // For demo safety, we try update.
          await supabase.from('finance_accounts').update({ 
              balance: currentBal - amount,
              updated_at: new Date()
          }).eq('client_id', clientId);

      } catch (e) {
          console.error("Billing Failed:", e);
          // Revert local state if needed (omitted for brevity)
      }
  },

  topUp: async (clientId, amount) => {
      // Similar to charge but Type = RECHARGE, Balance +
      const { wallets } = get();
      const wallet = wallets.find(w => w.client_id === clientId);
      if (!wallet) return;

      const newBal = wallet.balance + amount;
      
      // Local Update
      const newWallets = wallets.map(w => w.client_id === clientId ? { ...w, balance: newBal } : w);
      set({ wallets: newWallets });

      // DB Update
      await supabase.from('finance_transactions').insert([{
          client_id: clientId, type: 'RECHARGE', amount, balance_after: newBal, description: 'Manual Top Up', operator: 'admin'
      }]);
      await supabase.from('finance_accounts').update({ balance: newBal }).eq('client_id', clientId);
  }
}));
