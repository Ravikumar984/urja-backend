/**
 * UrjaAudit Core Frontend Application Controller
 */

// Application State
const state = {
  sessionId: localStorage.getItem('urja_session_id') || null,
  activeScreen: 'screen-dashboard',
  summary: null,
  appliances: [],
  tariffs: []
};

// Colors for category legends
const PALETTE = ['#059669', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

// Screen Navigation
function switchScreen(screenId) {
  state.activeScreen = screenId;
  document.querySelectorAll('.screen-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const targetPanel = document.getElementById(screenId);
  if (targetPanel) targetPanel.classList.add('active');

  const targetTab = document.querySelector(`[data-screen="${screenId}"]`);
  if (targetTab) targetTab.classList.add('active');

  if (screenId === 'screen-simulator') {
    populateSimulatorApplianceDropdown();
  }
}

// -------------------------------------------------------------
// Initialization & Session Management
// -------------------------------------------------------------
async function initApp() {
  setupEventListeners();

  if (!state.sessionId) {
    await createNewSession();
  } else {
    try {
      await refreshAllData();
    } catch {
      await createNewSession();
    }
  }
}

async function createNewSession() {
  try {
    const res = await fetch('/api/session/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_name: 'Household (Bihar)',
        property_type: 'Household',
        state_region: 'Bihar',
        sanctioned_load_kw: 2.0
      })
    });
    const data = await res.json();
    state.sessionId = data.sessionId;
    localStorage.setItem('urja_session_id', state.sessionId);
    await refreshAllData();
  } catch (err) {
    console.error('Session init error:', err);
  }
}

async function refreshAllData() {
  if (!state.sessionId) return;

  const [summaryRes, appliancesRes, billRes, tariffsRes] = await Promise.all([
    fetch(`/api/audit-summary/${state.sessionId}`),
    fetch(`/api/appliances/${state.sessionId}`),
    fetch(`/api/bill/${state.sessionId}`),
    fetch(`/api/tariffs`)
  ]);

  state.summary = await summaryRes.json();
  state.appliances = await appliancesRes.json();
  const billData = await billRes.json();
  state.tariffs = await tariffsRes.json();

  if (billData) {
    document.getElementById('actual-units').value = billData.actual_units_kwh;
    document.getElementById('actual-amount').value = billData.actual_bill_amount;
    document.getElementById('bill-month').value = billData.billing_month || 'Current Month';
  }

  renderDashboard();
  renderTariffBreakdown();
  renderAppliancesTable();
  renderReport();
}

// -------------------------------------------------------------
// Render Screen 1: Dashboard
// -------------------------------------------------------------
function renderDashboard() {
  if (!state.summary || !state.summary.metrics) return;

  const m = state.summary.metrics;

  document.getElementById('kpi-calc-kwh').innerHTML = `${m.totalCalculatedMonthlyKwh.toFixed(1)} <span class="unit">kWh</span>`;
  document.getElementById('kpi-calc-daily').textContent = `${m.totalCalculatedDailyKwh.toFixed(2)} kWh/day`;

  document.getElementById('kpi-bill-kwh').innerHTML = `${m.actualUnitsKwh.toFixed(1)} <span class="unit">kWh</span>`;
  document.getElementById('kpi-bill-cost').textContent = `₹${m.actualBillAmount.toFixed(2)}`;

  document.getElementById('kpi-drain-kwh').innerHTML = `${m.unaccountedUnits.toFixed(1)} <span class="unit">kWh</span>`;
  document.getElementById('kpi-drain-cost').textContent = `₹${m.unaccountedCost.toFixed(2)}/mo`;

  document.getElementById('kpi-savings-cost').innerHTML = `₹${m.totalPotentialSavingsMonthly.toFixed(2)} <span class="unit">/mo</span>`;
  document.getElementById('kpi-savings-annual').textContent = `₹${(m.totalPotentialSavingsMonthly * 12).toFixed(2)}/yr`;

  // Render Top Appliances Pareto List
  const topListContainer = document.getElementById('top-appliances-list');
  topListContainer.innerHTML = '';

  const breakdown = state.summary.applianceBreakdown || [];
  breakdown.slice(0, 4).forEach(app => {
    const item = document.createElement('div');
    item.className = 'top-app-item';
    item.innerHTML = `
      <div class="top-app-meta">
        <span>${app.appliance_name} (${app.quantity}x @ ${app.wattage}W)</span>
        <span>${app.monthlyKwh} kWh (${app.percentageShare}%)</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width: ${Math.min(100, app.percentageShare)}%"></div>
      </div>
    `;
    topListContainer.appendChild(item);
  });

  // Render Category Donut Chart
  const categoryData = (state.summary.categoryBreakdown || []).map(cat => ({
    label: cat.category,
    value: cat.monthlyKwh
  }));
  renderDonutChart('category-chart-container', categoryData);

  // Render Category Legend
  const legendContainer = document.getElementById('category-legend');
  legendContainer.innerHTML = '';
  categoryData.forEach((cat, idx) => {
    const leg = document.createElement('div');
    leg.className = 'legend-item';
    leg.innerHTML = `
      <div>
        <span class="legend-color-dot" style="background-color: ${PALETTE[idx % PALETTE.length]}"></span>
        <strong>${cat.label}</strong>
      </div>
      <span>${cat.value.toFixed(1)} kWh</span>
    `;
    legendContainer.appendChild(leg);
  });

  // Render Recommendations Cards
  renderRecommendationsList('dashboard-recommendations-list', state.summary.recommendations || []);
}

function renderRecommendationsList(containerId, recs) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (recs.length === 0) {
    container.innerHTML = '<p style="color:#64748b;font-size:14px;">No immediate critical issues detected. Your usage pattern matches expected load.</p>';
    return;
  }

  recs.forEach(rec => {
    const card = document.createElement('div');
    card.className = `rec-card rec-${rec.priority}`;
    card.innerHTML = `
      <div class="rec-card-header">
        <span class="rec-title">${rec.title}</span>
        <span class="rec-savings-pill">Save ₹${rec.estimatedMonthlySavings.toFixed(2)}/mo</span>
      </div>
      <p class="rec-desc">${rec.description}</p>
      <div class="rec-reason"><strong>Why:</strong> ${rec.reason}</div>
      <ul class="rec-actions-list">
        ${rec.actionItems.map(a => `<li>${a}</li>`).join('')}
      </ul>
    `;
    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// Render Screen 2: Tariff Breakdown Table
// -------------------------------------------------------------
function renderTariffBreakdown() {
  if (!state.summary || !state.summary.tariffDetails) return;

  const t = state.summary.tariffDetails;
  const tbody = document.getElementById('tariff-slabs-tbody');
  tbody.innerHTML = '';

  (t.slabBreakdown || []).forEach(slab => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${slab.range}</strong></td>
      <td>₹${slab.rate.toFixed(2)}</td>
      <td>${slab.units.toFixed(1)} kWh</td>
      <td>₹${slab.cost.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('tariff-summary-box').innerHTML = `
    <div class="summary-row"><span>Energy Charges Subtotal:</span><strong>₹${t.energyCharges.toFixed(2)}</strong></div>
    <div class="summary-row"><span>Fixed Monthly Meter Charges:</span><strong>₹${t.fixedCharges.toFixed(2)}</strong></div>
    <div class="summary-row"><span>Electricity Duty & Surcharge (6%):</span><strong>₹${t.electricityDuty.toFixed(2)}</strong></div>
    <div class="summary-row total-row"><span>Total Estimated Bill:</span><span>₹${t.totalEstimatedBill.toFixed(2)}</span></div>
  `;
}

// -------------------------------------------------------------
// Render Screen 3: Appliances Table
// -------------------------------------------------------------
function renderAppliancesTable() {
  const tbody = document.getElementById('appliances-tbody');
  const tfoot = document.getElementById('appliances-tfoot');
  tbody.innerHTML = '';

  const marginalRate = state.summary ? state.summary.metrics.marginalRate : 8.0;
  let totalMonthlyKwh = 0;

  state.appliances.forEach(app => {
    totalMonthlyKwh += app.monthlyKwh;
    const estCost = app.monthlyKwh * marginalRate;
    const percentShare = state.summary && state.summary.metrics.totalCalculatedMonthlyKwh > 0
      ? ((app.monthlyKwh / state.summary.metrics.totalCalculatedMonthlyKwh) * 100).toFixed(1)
      : '0.0';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${app.appliance_name}</strong></td>
      <td><span class="panel-tag">${app.category}</span></td>
      <td>${app.quantity}</td>
      <td>${app.wattage} W</td>
      <td>${app.daily_hours} hrs/day</td>
      <td>${app.totalDailyKwh} kWh</td>
      <td><strong>${app.monthlyKwh} kWh</strong></td>
      <td>${percentShare}%</td>
      <td>₹${estCost.toFixed(2)}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteAppliance(${app.id})">🗑 Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tfoot.innerHTML = `
    <tr>
      <td colspan="6"><strong>Total Calculated Inventory Load</strong></td>
      <td><strong>${totalMonthlyKwh.toFixed(1)} kWh</strong></td>
      <td>100%</td>
      <td><strong>₹${(totalMonthlyKwh * marginalRate).toFixed(2)}</strong></td>
      <td></td>
    </tr>
  `;
}

// -------------------------------------------------------------
// Render Screen 4: Simulator Helper
// -------------------------------------------------------------
function populateSimulatorApplianceDropdown() {
  const select = document.getElementById('sim-appliance-select');
  select.innerHTML = '';

  state.appliances.forEach(app => {
    const opt = document.createElement('option');
    opt.value = app.id;
    opt.textContent = `${app.appliance_name} (${app.quantity}x @ ${app.wattage}W, currently ${app.daily_hours} hrs/d)`;
    select.appendChild(opt);
  });

  triggerUsageSimulation();
}

function triggerUsageSimulation() {
  const select = document.getElementById('sim-appliance-select');
  const slider = document.getElementById('sim-hours-slider');
  const applianceId = Number(select.value);

  const app = state.appliances.find(a => a.id === applianceId);
  if (!app) return;

  const origHours = app.daily_hours;
  const newHours = Number(slider.value);
  const marginalRate = state.summary ? state.summary.metrics.marginalRate : 8.0;

  document.getElementById('sim-orig-hours').textContent = origHours;
  document.getElementById('sim-new-hours-val').textContent = newHours;

  const origKwh = (app.wattage * app.quantity * origHours * 30) / 1000;
  const newKwh = (app.wattage * app.quantity * newHours * 30) / 1000;
  const savedKwh = Math.max(0, origKwh - newKwh);

  const origCost = origKwh * marginalRate;
  const newCost = newKwh * marginalRate;
  const savedCost = savedKwh * marginalRate;

  document.getElementById('sim-res-orig-kwh').textContent = `${origKwh.toFixed(1)} kWh`;
  document.getElementById('sim-res-orig-cost').textContent = `₹${origCost.toFixed(2)} / month`;

  document.getElementById('sim-res-new-kwh').textContent = `${newKwh.toFixed(1)} kWh`;
  document.getElementById('sim-res-new-cost').textContent = `₹${newCost.toFixed(2)} / month`;

  document.getElementById('sim-res-saved-kwh').textContent = `${savedKwh.toFixed(1)} kWh`;
  document.getElementById('sim-res-saved-cost').textContent = `₹${savedCost.toFixed(2)} / month`;
}

// -------------------------------------------------------------
// Render Screen 5: Audit Report
// -------------------------------------------------------------
function renderReport() {
  if (!state.summary) return;

  const m = state.summary.metrics;
  document.getElementById('rep-actual-kwh').textContent = `${m.actualUnitsKwh.toFixed(1)} kWh`;
  document.getElementById('rep-actual-cost').textContent = `₹${m.actualBillAmount.toFixed(2)}`;

  document.getElementById('rep-calc-kwh').textContent = `${m.totalCalculatedMonthlyKwh.toFixed(1)} kWh`;
  document.getElementById('rep-calc-cost').textContent = `₹${m.estimatedCalculatedBill.toFixed(2)}`;

  document.getElementById('rep-drain-kwh').textContent = `${m.unaccountedUnits.toFixed(1)} kWh`;
  document.getElementById('rep-drain-cost').textContent = `₹${m.unaccountedCost.toFixed(2)}/mo`;

  document.getElementById('rep-savings-kwh').textContent = `₹${m.totalPotentialSavingsMonthly.toFixed(2)}`;

  // Table
  const tbody = document.getElementById('report-appliances-tbody');
  tbody.innerHTML = '';
  const marginalRate = m.marginalRate || 8.0;

  state.appliances.forEach(app => {
    const cost = app.monthlyKwh * marginalRate;
    const share = m.totalCalculatedMonthlyKwh > 0 ? ((app.monthlyKwh / m.totalCalculatedMonthlyKwh) * 100).toFixed(1) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${app.appliance_name}</strong></td>
      <td>${app.category}</td>
      <td>${app.quantity}</td>
      <td>${app.wattage}W</td>
      <td>${app.daily_hours} hrs</td>
      <td>${app.monthlyKwh} kWh</td>
      <td>${share}%</td>
      <td>₹${cost.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Action list
  const recContainer = document.getElementById('report-recommendations-list');
  recContainer.innerHTML = '';
  (state.summary.recommendations || []).forEach(r => {
    const div = document.createElement('div');
    div.className = 'report-rec-item';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <strong>${r.title}</strong>
        <span style="color:#059669;font-weight:700;">Est. Savings: ₹${r.estimatedMonthlySavings}/mo</span>
      </div>
      <p style="font-size:13px;color:#475569;margin-bottom:6px;">${r.description}</p>
      <div style="font-size:12px;color:#64748b;"><em>Action: ${r.actionItems.join(' | ')}</em></div>
    `;
    recContainer.appendChild(div);
  });
}

// -------------------------------------------------------------
// Event Handlers & Mutations
// -------------------------------------------------------------
function setupEventListeners() {
  // Tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchScreen(tab.dataset.screen));
  });

  // Recalculate Button
  document.getElementById('btn-refresh-dashboard')?.addEventListener('click', refreshAllData);

  // Bill Form Submission
  document.getElementById('form-bill')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      billing_month: document.getElementById('bill-month').value,
      actual_units_kwh: Number(document.getElementById('actual-units').value),
      actual_bill_amount: Number(document.getElementById('actual-amount').value)
    };
    await fetch(`/api/bill/${state.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await refreshAllData();
    switchScreen('screen-dashboard');
  });

  // Add Appliance Form Submission
  document.getElementById('form-add-appliance')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      appliance_name: document.getElementById('app-name').value,
      category: document.getElementById('app-category').value,
      quantity: Number(document.getElementById('app-qty').value),
      wattage: Number(document.getElementById('app-wattage').value),
      daily_hours: Number(document.getElementById('app-hours').value),
      days_per_month: 30
    };
    await fetch(`/api/appliances/${state.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    document.getElementById('form-add-appliance').reset();
    await refreshAllData();
  });

  // Simulator controls
  document.getElementById('sim-appliance-select')?.addEventListener('change', (e) => {
    const app = state.appliances.find(a => a.id === Number(e.target.value));
    if (app) {
      document.getElementById('sim-hours-slider').value = Math.max(0, app.daily_hours - 2);
    }
    triggerUsageSimulation();
  });

  document.getElementById('sim-hours-slider')?.addEventListener('input', triggerUsageSimulation);

  // ROI Calculator
  document.getElementById('btn-run-roi')?.addEventListener('click', async () => {
    const payload = {
      existingWattage: document.getElementById('roi-old-w').value,
      newWattage: document.getElementById('roi-new-w').value,
      quantity: document.getElementById('roi-qty').value,
      dailyHours: document.getElementById('roi-hours').value,
      capitalCost: document.getElementById('roi-cost').value,
      tariffRate: document.getElementById('roi-tariff').value
    };

    const res = await fetch('/api/simulator/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    document.getElementById('roi-res-energy').textContent = `${data.unitsSavedMonthly} kWh`;
    document.getElementById('roi-res-savings').textContent = `₹${data.monthlySavingsInr}`;
    document.getElementById('roi-res-payback').textContent = `${data.paybackMonths} Months`;
  });

  // Preset Bihar Household Example
  document.getElementById('btn-load-bihar-example')?.addEventListener('click', async () => {
    await createNewSession();
  });
}

async function deleteAppliance(id) {
  if (!confirm('Remove this appliance from inventory?')) return;
  await fetch(`/api/appliances/${id}`, { method: 'DELETE' });
  await refreshAllData();
}

// Start Application on Load
document.addEventListener('DOMContentLoaded', initApp);