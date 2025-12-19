export interface InboundOrder {
  id: string;
  order_no: string;
  client_id: string;
  inbound_type: 'RETURN' | 'NEW' | 'AFTER_SALES' | 'BLIND';
  tracking_no?: string;
  expected_date?: string;
  remark?: string;
  status: 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED' | 'COUNTED' | 'INSPECTING' | 'COMPLETED';
  carrier?: string;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface InboundItem {
  id: string;
  order_id: string;
  sku: string;
  expected_qty: number;
  received_qty: number;
  passed_qty: number;
  failed_qty: number;
  created_at: string;
  product_name?: string;
  specs?: any;
}

export interface Package {
  id: string;
  tracking_no: string;
  client: string;
  carrier: string;
  status: 'PENDING' | 'WAIT_INSPECT' | 'COMPLETED';
  location?: string;
  inbound_order_id?: string;
  created_at: string;
  receipt?: string;
}

export interface PackageItem {
  id: string;
  package_id: string;
  tracking_no: string;
  sku: string;
  lpn?: string;
  qty: number;
  remark?: string;
  return_type: 'NEW' | 'INSPECT';
  created_at: string;
}

export interface InboundLpn {
  id: string;
  order_id: string; // Optional if LPN is global, but usually tied to inbound context
  lpn: string;
  sku?: string;
  status: 'PENDING' | 'PASSED' | 'FAILED';
  level?: string; // e.g. 'A', 'B', 'C'
  attributes?: any; // JSON: model, color, etc.
  received_qty: number;
  received_at: string;
  operator: string;
}

export interface OutboundOrder {
  id: string;
  order_no: string;
  client: string;
  carrier: string;
  status: 'PENDING' | 'WAIT_LABEL_DATA' | 'WAIT_CLIENT_LABEL' | 'PROCESSING' | 'SHIPPED';
  service_type: 'STANDARD' | 'RELABEL';
  remark?: string;
  attachments?: string[];
  packing_data?: any[]; // [{box_no, sku, qty, weight, dim}]
  label_files?: string[];
  created_at: string;
  shipped_at?: string;
}

export interface OutboundItem {
  id: string;
  order_id: string;
  sku: string;
  qty: number;
  new_fnsku?: string;
}
