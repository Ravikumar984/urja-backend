-- 1. Discom & Tariff Tier Configurations
CREATE TABLE IF NOT EXISTS tariff_slabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discom_name VARCHAR(100) NOT NULL DEFAULT 'SBPDCL (Domestic Rural/Urban)',
    consumer_category VARCHAR(50) NOT NULL DEFAULT 'DS-II (Domestic Urban)',
    min_units INTEGER NOT NULL,
    max_units INTEGER, -- NULL means infinity / upper bracket
    rate_per_kwh DECIMAL(6, 2) NOT NULL,
    fixed_charge_monthly DECIMAL(8, 2) NOT NULL DEFAULT 50.00,
    duty_tax_percentage DECIMAL(4, 2) NOT NULL DEFAULT 6.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Standard Realistic Bihar / Indian Discom Domestic Slabs
INSERT INTO tariff_slabs (discom_name, consumer_category, min_units, max_units, rate_per_kwh, fixed_charge_monthly, duty_tax_percentage) VALUES
('SBPDCL / NBPDCL', 'DS-II Domestic', 0, 50, 6.10, 40.00, 6.00),
('SBPDCL / NBPDCL', 'DS-II Domestic', 51, 100, 6.95, 40.00, 6.00),
('SBPDCL / NBPDCL', 'DS-II Domestic', 101, 200, 8.05, 60.00, 6.00),
('SBPDCL / NBPDCL', 'DS-II Domestic', 201, 300, 9.15, 80.00, 6.00),
('SBPDCL / NBPDCL', 'DS-II Domestic', 301, NULL, 10.00, 100.00, 6.00);

-- 2. User & Audit Sessions
CREATE TABLE IF NOT EXISTS audit_sessions (
    id VARCHAR(36) PRIMARY KEY,
    property_name VARCHAR(100) NOT NULL,
    property_type VARCHAR(50) NOT NULL, -- 'Household', 'Shop', 'Hostel', 'Small Business'
    state_region VARCHAR(50) DEFAULT 'Bihar',
    sanctioned_load_kw DECIMAL(5, 2) DEFAULT 2.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Utility Bill Records
CREATE TABLE IF NOT EXISTS bill_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id VARCHAR(36) NOT NULL,
    billing_month VARCHAR(20) NOT NULL,
    actual_units_kwh DECIMAL(10, 2) NOT NULL,
    actual_bill_amount DECIMAL(10, 2) NOT NULL,
    meter_reading_date DATE,
    FOREIGN KEY (session_id) REFERENCES audit_sessions(id) ON DELETE CASCADE
);

-- 4. Appliance Inventory
CREATE TABLE IF NOT EXISTS appliances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id VARCHAR(36) NOT NULL,
    appliance_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'Lighting', 'Cooling', 'Refrigeration', 'Entertainment', 'Heavy Motor', 'Other'
    quantity INTEGER NOT NULL DEFAULT 1,
    wattage DECIMAL(8, 2) NOT NULL,
    daily_hours DECIMAL(4, 2) NOT NULL,
    days_per_month INTEGER NOT NULL DEFAULT 30,
    standby_wattage DECIMAL(6, 2) DEFAULT 0.0,
    FOREIGN KEY (session_id) REFERENCES audit_sessions(id) ON DELETE CASCADE
);

-- 5. Saved Simulation & Retrofit Scenarios
CREATE TABLE IF NOT EXISTS retrofit_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id VARCHAR(36) NOT NULL,
    appliance_id INTEGER NOT NULL,
    existing_wattage DECIMAL(8, 2) NOT NULL,
    proposed_wattage DECIMAL(8, 2) NOT NULL,
    retrofit_title VARCHAR(100) NOT NULL,
    unit_cost_inr DECIMAL(10, 2) NOT NULL,
    reduced_hours DECIMAL(4, 2) NOT NULL,
    projected_savings_inr DECIMAL(10, 2) NOT NULL,
    payback_months DECIMAL(6, 1) NOT NULL,
    FOREIGN KEY (session_id) REFERENCES audit_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (appliance_id) REFERENCES appliances(id) ON DELETE CASCADE
);