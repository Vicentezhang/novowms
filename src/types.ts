export interface User {
  username: string;
  role: 'admin' | 'operator' | 'client';
  created_at?: string;
}

export interface Product {
  id: string;
  client: string;
  sku: string;
  name?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  client: string;
  sku: string;
  location: string;
  qty: number;
  updated_at: string;
}

export interface InboundRecord {
  id: string;
  tracking_no: string;
  client: string;
  status: string;
  created_at: string;
}

// --- Finance Module Types ---

export interface FinanceRule {
  id: string;
  name: string;
  type: 'storage' | 'inbound' | 'outbound' | 'labeling' | 'material' | 'inspection' | 'pallet_fee';
  condition?: string; 
  price: number;
  unit: 'per_item' | 'per_order' | 'per_carton' | 'per_pallet';
  client_id?: string; 
  created_at: string;
}

export interface FinanceAccount {
  client_id: string;
  client_name?: string; // New
  balance: number;
  frozen_amount?: number; // New
  credit_limit: number;
  currency: string;
  status?: 'active' | 'frozen' | 'overdue'; // New
  updated_at: string;
}

export interface FinanceTransaction {
  id: string;
  client_id: string;
  type: 'RECHARGE' | 'DEDUCTION' | 'REFUND' | 'ADJUSTMENT';
  amount: number;
  balance_after: number;
  description?: string;
  reference_id?: string; // New
  operator?: string;
  created_at: string;
}

export interface FinanceQuote {
  id: string;
  client_id: string;
  service_type: string;
  sku?: string;
  price: number;
  unit: string;
  version: number;
  created_at: string;
}

export interface InboundOrder {
  id?: string;
  order_no?: string;
  client_id?: string;
  inbound_type?: string;
  tracking_no?: string;
  status?: string;
  expected_date?: string;
  created_at?: string;
  updated_at?: string;
  remark?: string;
  created_by?: string;
  carrier?: string;
}

export interface PackingDetail {
  sku: string;
  qty: number;
  carton_no?: string;
  weight?: number;
  dims?: string;
}

export interface OutboundOrder {
  id?: string;
  order_no?: string;
  client?: string;
  carrier?: string;
  status?: string;
  remark?: string;
  created_at?: string;
  service_type?: string;
  shipped_at?: string;
  attachments?: string[];
  packing_data?: PackingDetail[];
  label_files?: string[];
}

export interface BillingRecord {
  id: string;
  client: string;
  type: 'inbound' | 'storage' | 'outbound' | 'extra';
  amount: number;
  currency: string;
  status: 'pending' | 'paid';
  remark?: string;
  created_at: string;
}