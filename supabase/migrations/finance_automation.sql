-- Finance Automation Migration
-- This script sets up the triggers and functions for automated billing
-- Run this in your Supabase SQL Editor

-- 1. Ensure Finance Tables exist (from previous step, just safety check)
CREATE TABLE IF NOT EXISTS finance_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id TEXT REFERENCES clients(name),
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    balance_after NUMERIC NOT NULL,
    description TEXT,
    operator TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client TEXT NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'EUR',
    status TEXT DEFAULT 'pending', -- pending, paid
    remark TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ref_id TEXT -- Reference to package_id or inbound_order_id
);

-- 2. Function: Process Inbound Billing
-- Triggered when inbound_orders.status changes to 'RECEIVED'
CREATE OR REPLACE FUNCTION process_inbound_billing()
RETURNS TRIGGER AS $$
DECLARE
    rule_price NUMERIC;
    client_balance NUMERIC;
    bill_amount NUMERIC;
BEGIN
    -- Only trigger when status changes to RECEIVED
    IF NEW.status = 'RECEIVED' AND (OLD.status IS NULL OR OLD.status != 'RECEIVED') THEN
        
        -- A. Find applicable rule (Priority: Client Specific > Global)
        SELECT price INTO rule_price 
        FROM finance_rules 
        WHERE type = 'RECEIVING' 
          AND (client_id = NEW.client_id OR client_id IS NULL)
        ORDER BY client_id NULLS LAST -- Specific client rule comes first
        LIMIT 1;

        -- If no rule found, skip billing (or use default 0)
        IF rule_price IS NULL THEN
            RETURN NEW;
        END IF;

        -- Calculate Amount (For Inbound Order, usually per order fee or per item? Let's assume Per Order for now based on 'RECEIVING' rule)
        -- If unit is 'per_item', we might need to count items, but at RECEIVED stage items might not be counted yet.
        -- Let's assume 'RECEIVING' rule is a fixed handling fee per Inbound Order.
        bill_amount := rule_price;

        -- B. Create Billing Record
        INSERT INTO billing_records (client, type, amount, status, remark, ref_id)
        VALUES (NEW.client_id, 'inbound', bill_amount, 'paid', 'Auto-deducted for Inbound: ' || NEW.order_no, NEW.id);

        -- C. Deduct from Balance (Transaction)
        -- Get current balance
        SELECT balance INTO client_balance FROM finance_accounts WHERE client_id = NEW.client_id;
        
        -- If account doesn't exist, maybe create it or fail? Let's assume it exists or ignore.
        IF client_balance IS NOT NULL THEN
            UPDATE finance_accounts 
            SET balance = balance - bill_amount, updated_at = NOW() 
            WHERE client_id = NEW.client_id;

            -- Log Transaction
            INSERT INTO finance_transactions (client_id, type, amount, balance_after, description, operator)
            VALUES (NEW.client_id, 'DEDUCTION', -bill_amount, client_balance - bill_amount, 'Inbound Fee: ' || NEW.order_no, 'system');
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger: Bind to Inbound Orders
DROP TRIGGER IF EXISTS trg_inbound_billing ON inbound_orders;
CREATE TRIGGER trg_inbound_billing
AFTER UPDATE ON inbound_orders
FOR EACH ROW
EXECUTE FUNCTION process_inbound_billing();

-- 4. Function: Process Storage Billing (Daily Job placeholder)
-- This function is meant to be called by pg_cron or Supabase Schedule
CREATE OR REPLACE FUNCTION calculate_daily_storage()
RETURNS VOID AS $$
DECLARE
    client_rec RECORD;
    item_count INT;
    storage_price NUMERIC;
    cost NUMERIC;
BEGIN
    -- Loop through all clients with active inventory
    FOR client_rec IN SELECT DISTINCT client FROM inventory LOOP
        
        -- Count items
        SELECT SUM(qty) INTO item_count FROM inventory WHERE client = client_rec.client;
        
        IF item_count > 0 THEN
             -- Find Storage Rule
            SELECT price INTO storage_price 
            FROM finance_rules 
            WHERE type = 'STORAGE' AND (client_id = client_rec.client OR client_id IS NULL)
            ORDER BY client_id NULLS LAST
            LIMIT 1;

            IF storage_price IS NOT NULL THEN
                cost := item_count * storage_price;
                
                -- Insert Billing Record
                INSERT INTO billing_records (client, type, amount, status, remark)
                VALUES (client_rec.client, 'storage', cost, 'pending', 'Daily Storage: ' || item_count || ' items');
                
                -- Note: We usually don't deduct storage daily immediately, maybe monthly. 
                -- But for this MVP, we just record it.
            END IF;
        END IF;
        
    END LOOP;
END;
$$ LANGUAGE plpgsql;
