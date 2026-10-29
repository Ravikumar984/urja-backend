const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./database/db');
const { calculateApplianceEnergy, calculateTariffCost, calculateRetrofitROI } = require('./services/calculator');
const { generateAuditRecommendations } = require('./services/recommendations');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to retrieve active slabs (Updated for MySQL)
async function getActiveTariffSlabs() {
  const [rows] = await db.execute('SELECT * FROM tariff_slabs ORDER BY min_units ASC');
  return rows;
}

// -------------------------------------------------------------
// 1. Session & Overview APIs
// -------------------------------------------------------------
app.post('/api/session/init', async (req, res) => {
  try {
    const { property_name = 'My Home', property_type = 'Household', state_region = 'Bihar', sanctioned_load_kw = 2.0 } = req.body;
    const sessionId = crypto.randomUUID();

    await db.execute(`
      INSERT INTO audit_sessions (id, property_name, property_type, state_region, sanctioned_load_kw)
      VALUES (?, ?, ?, ?, ?)
    `, [sessionId, property_name, property_type, state_region, sanctioned_load_kw]);

    const defaultAppliances = [
      { name: 'LED Bulbs', category: 'Lighting', qty: 5, wattage: 9, hours: 6 },
      { name: 'Ceiling Fans', category: 'Cooling', qty: 3, wattage: 75, hours: 10 },
      { name: 'Television', category: 'Entertainment', qty: 1, wattage: 100, hours: 4 },
      { name: 'Refrigerator (Frost-Free)', category: 'Refrigeration', qty: 1, wattage: 150, hours: 8 }
    ];

    for (const app of defaultAppliances) {
      await db.execute(`
        INSERT INTO appliances (session_id, appliance_name, category, quantity, wattage, daily_hours, days_per_month)
        VALUES (?, ?, ?, ?, ?, ?, 30)
      `, [sessionId, app.name, app.category, app.qty, app.wattage, app.hours]);
    }

    await db.execute(`
      INSERT INTO bill_records (session_id, billing_month, actual_units_kwh, actual_bill_amount)
      VALUES (?, 'Current Month', 145.0, 1160.0)
    `, [sessionId]);

    res.json({ success: true, sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. Bill Management APIs
// -------------------------------------------------------------
app.get('/api/bill/:sessionId', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM bill_records WHERE session_id = ? ORDER BY id DESC LIMIT 1', [req.params.sessionId]);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bill/:sessionId', async (req, res) => {
  try {
    const { billing_month, actual_units_kwh, actual_bill_amount } = req.body;
    const sessionId = req.params.sessionId;

    const [existing] = await db.execute('SELECT id FROM bill_records WHERE session_id = ?', [sessionId]);

    if (existing.length > 0) {
      await db.execute(`
        UPDATE bill_records 
        SET billing_month = ?, actual_units_kwh = ?, actual_bill_amount = ?
        WHERE session_id = ?
      `, [billing_month || 'Current Month', Number(actual_units_kwh), Number(actual_bill_amount), sessionId]);
    } else {
      await db.execute(`
        INSERT INTO bill_records (session_id, billing_month, actual_units_kwh, actual_bill_amount)
        VALUES (?, ?, ?, ?)
      `, [sessionId, billing_month || 'Current Month', Number(actual_units_kwh), Number(actual_bill_amount)]);
    }

    res.json({ success: true, message: 'Bill record updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. Appliance Inventory APIs
// -------------------------------------------------------------
app.get('/api/appliances/:sessionId', async (req, res) => {
  try {
    const [appliances] = await db.execute('SELECT * FROM appliances WHERE session_id = ? ORDER BY id ASC', [req.params.sessionId]);
    const enriched = appliances.map(app => {
      const energy = calculateApplianceEnergy(app);
      return { ...app, ...energy };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appliances/:sessionId', async (req, res) => {
  try {
    const { appliance_name, category, quantity, wattage, daily_hours, days_per_month = 30 } = req.body;
    const [result] = await db.execute(`
      INSERT INTO appliances (session_id, appliance_name, category, quantity, wattage, daily_hours, days_per_month)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [req.params.sessionId, appliance_name, category, Number(quantity), Number(wattage), Number(daily_hours), Number(days_per_month)]);

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/appliances/:id', async (req, res) => {
  try {
    const { appliance_name, category, quantity, wattage, daily_hours, days_per_month = 30 } = req.body;
    await db.execute(`
      UPDATE appliances 
      SET appliance_name = ?, category = ?, quantity = ?, wattage = ?, daily_hours = ?, days_per_month = ?
      WHERE id = ?
    `, [appliance_name, category, Number(quantity), Number(wattage), Number(daily_hours), Number(days_per_month), req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/appliances/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM appliances WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. Audit Engine & Dashboard Summary API
// -------------------------------------------------------------
app.get('/api/audit-summary/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const [sessionRows] = await db.execute('SELECT * FROM audit_sessions WHERE id = ?', [sessionId]);
    const session = sessionRows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const [appliances] = await db.execute('SELECT * FROM appliances WHERE session_id = ?', [sessionId]);
    const [billRows] = await db.execute('SELECT * FROM bill_records WHERE session_id = ? ORDER BY id DESC LIMIT 1', [sessionId]);
    const billRecord = billRows[0];
    
    const slabs = await getActiveTariffSlabs();

    let totalCalculatedDailyKwh = 0;
    let totalCalculatedMonthlyKwh = 0;

    const enrichedAppliances = appliances.map(app => {
      const calc = calculateApplianceEnergy(app);
      totalCalculatedDailyKwh += calc.totalDailyKwh;
      totalCalculatedMonthlyKwh += calc.monthlyKwh;
      return { ...app, ...calc };
    });

    const applianceBreakdown = enrichedAppliances.map(app => ({
      ...app,
      percentageShare: totalCalculatedMonthlyKwh > 0 
        ? Number(((app.monthlyKwh / totalCalculatedMonthlyKwh) * 100).toFixed(1))
        : 0
    })).sort((a, b) => b.monthlyKwh - a.monthlyKwh);

    const categoryBreakdown = {};
    applianceBreakdown.forEach(app => {
      if (!categoryBreakdown[app.category]) {
        categoryBreakdown[app.category] = { category: app.category, monthlyKwh: 0, percentage: 0 };
      }
      categoryBreakdown[app.category].monthlyKwh += app.monthlyKwh;
    });

    Object.keys(categoryBreakdown).forEach(cat => {
      categoryBreakdown[cat].monthlyKwh = Number(categoryBreakdown[cat].monthlyKwh.toFixed(2));
      categoryBreakdown[cat].percentage = totalCalculatedMonthlyKwh > 0
        ? Number(((categoryBreakdown[cat].monthlyKwh / totalCalculatedMonthlyKwh) * 100).toFixed(1))
        : 0;
    });

    // NULL-SAFE BILLING CALCULATIONS
    const calculatedBillTariff = calculateTariffCost(totalCalculatedMonthlyKwh, slabs, session.sanctioned_load_kw);
    
    const actualUnits = (billRecord && billRecord.actual_units_kwh !== null) 
      ? Number(billRecord.actual_units_kwh) 
      : totalCalculatedMonthlyKwh;
      
    const actualBillTariff = calculateTariffCost(actualUnits, slabs, session.sanctioned_load_kw);

    const unaccountedUnits = Number(Math.max(0, actualUnits - totalCalculatedMonthlyKwh).toFixed(2));
    const unaccountedCost = Number((unaccountedUnits * (calculatedBillTariff.marginalRatePerUnit || 0)).toFixed(2));

    const recommendations = generateAuditRecommendations({
      appliances: enrichedAppliances,
      billRecord,
      tariffBreakdown: calculatedBillTariff,
      calculatedTotalUnits: totalCalculatedMonthlyKwh
    });

    const totalPotentialSavingsMonthly = recommendations.reduce((sum, r) => sum + (r.estimatedMonthlySavings || 0), 0);
    
    const finalActualBillAmount = (billRecord && billRecord.actual_bill_amount !== null) 
      ? Number(billRecord.actual_bill_amount) 
      : actualBillTariff.totalEstimatedBill;

    res.json({
      session,
      metrics: {
        totalCalculatedDailyKwh: Number(totalCalculatedDailyKwh.toFixed(3)),
        totalCalculatedMonthlyKwh: Number(totalCalculatedMonthlyKwh.toFixed(2)),
        actualUnitsKwh: actualUnits,
        actualBillAmount: finalActualBillAmount || 0,
        estimatedCalculatedBill: calculatedBillTariff.totalEstimatedBill || 0,
        unaccountedUnits,
        unaccountedCost,
        totalPotentialSavingsMonthly: Number(totalPotentialSavingsMonthly.toFixed(2)),
        marginalRate: calculatedBillTariff.marginalRatePerUnit || 0,
        averageRate: calculatedBillTariff.averageRatePerUnit || 0
      },
      tariffDetails: calculatedBillTariff,
      applianceBreakdown,
      categoryBreakdown: Object.values(categoryBreakdown),
      recommendations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. Savings Simulator & Retrofit Calculator APIs
// -------------------------------------------------------------
app.post('/api/simulator/calculate', (req, res) => {
  try {
    const { existingWattage, newWattage, quantity, dailyHours, capitalCost, tariffRate = 8.0 } = req.body;
    const result = calculateRetrofitROI(
      Number(existingWattage),
      Number(newWattage),
      Number(quantity),
      Number(dailyHours),
      Number(capitalCost),
      Number(tariffRate)
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. Tariffs Metadata API
// -------------------------------------------------------------
app.get('/api/tariffs', async (req, res) => {
  try {
    const slabs = await getActiveTariffSlabs();
    res.json(slabs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`⚡ UrjaAudit Energy Assistant Server Running`);
  console.log(`🌐 Local Web Portal: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});