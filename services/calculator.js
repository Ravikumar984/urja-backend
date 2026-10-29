/**
 * UrjaAudit Core Math & Tariff Calculation Engine
 */

/**
 * Computes energy consumption for an appliance
 * Daily kWh = (Power (W) * Quantity * Daily Hours) / 1000
 * Monthly kWh = Daily kWh * Days in Month
 */
function calculateApplianceEnergy(appliance) {
  const wattage = Number(appliance.wattage) || 0;
  const quantity = Number(appliance.quantity) || 1;
  const dailyHours = Number(appliance.daily_hours) || 0;
  const daysPerMonth = Number(appliance.days_per_month) || 30;
  const standbyWattage = Number(appliance.standby_wattage) || 0;

  // Active energy
  const activeDailyKwh = (wattage * quantity * dailyHours) / 1000;
  // Standby vampire energy (for the remaining hours of the day)
  const standbyHours = Math.max(0, 24 - dailyHours);
  const standbyDailyKwh = (standbyWattage * quantity * standbyHours) / 1000;

  const totalDailyKwh = activeDailyKwh + standbyDailyKwh;
  const monthlyKwh = totalDailyKwh * daysPerMonth;

  return {
    activeDailyKwh: Number(activeDailyKwh.toFixed(3)),
    standbyDailyKwh: Number(standbyDailyKwh.toFixed(3)),
    totalDailyKwh: Number(totalDailyKwh.toFixed(3)),
    monthlyKwh: Number(monthlyKwh.toFixed(2))
  };
}

/**
 * Calculates Discom tiered bill amount based on unit consumption and official slabs
 */
function calculateTariffCost(totalUnits, slabs, sanctionedLoadKw = 2.0) {
  let remainingUnits = totalUnits;
  let energyCharges = 0;
  const slabBreakdown = [];

  for (const slab of slabs) {
    if (remainingUnits <= 0) break;

    const slabCapacity = slab.max_units !== null ? (slab.max_units - slab.min_units + (slab.min_units === 0 ? 0 : 1)) : Infinity;
    const unitsInThisSlab = Math.min(remainingUnits, slabCapacity);
    const costForSlab = unitsInThisSlab * slab.rate_per_kwh;

    energyCharges += costForSlab;
    slabBreakdown.push({
      range: slab.max_units ? `${slab.min_units}-${slab.max_units} units` : `Above ${slab.min_units} units`,
      rate: slab.rate_per_kwh,
      units: Number(unitsInThisSlab.toFixed(2)),
      cost: Number(costForSlab.toFixed(2))
    });

    remainingUnits -= unitsInThisSlab;
  }

  // Fixed charges (e.g. ₹50/kW of sanctioned load)
  const baseFixedCharge = slabs.length > 0 ? slabs[0].fixed_charge_monthly : 50;
  const fixedCharges = baseFixedCharge * sanctionedLoadKw;

  // Electricity Duty (default 6% on energy charges)
  const dutyRate = slabs.length > 0 ? (slabs[0].duty_tax_percentage / 100) : 0.06;
  const electricityDuty = energyCharges * dutyRate;

  const totalBillEstimated = energyCharges + fixedCharges + electricityDuty;

  // Marginal Tariff (rate of the highest slab reached)
  const marginalTariff = slabBreakdown.length > 0 ? slabBreakdown[slabBreakdown.length - 1].rate : 7.5;

  return {
    totalUnits: Number(totalUnits.toFixed(2)),
    energyCharges: Number(energyCharges.toFixed(2)),
    fixedCharges: Number(fixedCharges.toFixed(2)),
    electricityDuty: Number(electricityDuty.toFixed(2)),
    totalEstimatedBill: Number(totalBillEstimated.toFixed(2)),
    marginalRatePerUnit: marginalTariff,
    averageRatePerUnit: totalUnits > 0 ? Number((totalBillEstimated / totalUnits).toFixed(2)) : 0,
    slabBreakdown
  };
}

/**
 * Calculates Retrofit ROI and Payback period
 */
function calculateRetrofitROI(existingWattage, newWattage, quantity, dailyHours, capitalCostTotal, tariffPerUnit) {
  const oldMonthlyUnits = (existingWattage * quantity * dailyHours * 30) / 1000;
  const newMonthlyUnits = (newWattage * quantity * dailyHours * 30) / 1000;
  const unitsSavedMonthly = Math.max(0, oldMonthlyUnits - newMonthlyUnits);

  const monthlySavingsInr = unitsSavedMonthly * tariffPerUnit;
  const annualSavingsInr = monthlySavingsInr * 12;

  const paybackMonths = monthlySavingsInr > 0 ? Number((capitalCostTotal / monthlySavingsInr).toFixed(1)) : 0;

  return {
    oldMonthlyUnits: Number(oldMonthlyUnits.toFixed(2)),
    newMonthlyUnits: Number(newMonthlyUnits.toFixed(2)),
    unitsSavedMonthly: Number(unitsSavedMonthly.toFixed(2)),
    monthlySavingsInr: Number(monthlySavingsInr.toFixed(2)),
    annualSavingsInr: Number(annualSavingsInr.toFixed(2)),
    paybackMonths,
    paybackYears: Number((paybackMonths / 12).toFixed(2))
  };
}

module.exports = {
  calculateApplianceEnergy,
  calculateTariffCost,
  calculateRetrofitROI
};