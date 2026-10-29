/**
 * UrjaAudit Explainable Recommendation Engine
 */

function generateAuditRecommendations(auditData) {
  const { appliances, billRecord, tariffBreakdown, calculatedTotalUnits } = auditData;
  const recommendations = [];

  const actualUnits = billRecord ? billRecord.actual_units_kwh : calculatedTotalUnits;
  const marginalRate = tariffBreakdown.marginalRatePerUnit || 8.0;

  // 1. Unaccounted Phantom Energy Drain Analysis
  if (billRecord && actualUnits > calculatedTotalUnits) {
    const drainUnits = actualUnits - calculatedTotalUnits;
    const drainPercentage = ((drainUnits / actualUnits) * 100).toFixed(1);

    if (drainUnits > 15) {
      recommendations.push({
        id: 'REC_PHANTOM_DRAIN',
        category: 'Leakage & Standby',
        priority: drainPercentage > 25 ? 'CRITICAL' : 'HIGH',
        title: `Unexplained Discrepancy: ${drainUnits.toFixed(1)} kWh/mo (${drainPercentage}% of bill)`,
        description: `Your recorded utility bill (${actualUnits} kWh) is substantially higher than the calculated appliance inventory (${calculatedTotalUnits.toFixed(1)} kWh).`,
        reason: 'This indicates vampire standby draw from plugged-in adapters, aging wiring insulation loss, inaccurate sub-meters, or unlisted high-draw devices like geysers or water pumps.',
        estimatedMonthlySavings: Number((drainUnits * marginalRate).toFixed(2)),
        actionItems: [
          'Unplug microwave, TV set-top boxes, and laptop chargers when not in use (eliminates up to 15-30W continuous standby).',
          'Conduct an electrical insulation resistance test on distribution wiring.',
          'Verify if water immersion rods or domestic water booster pumps were omitted from this audit.'
        ]
      });
    }
  }

  // 2. Ceiling Fans Optimization (BLDC Retrofit)
  const fans = appliances.filter(a => a.appliance_name.toLowerCase().includes('fan') || a.category === 'Cooling');
  const heavyFans = fans.filter(f => f.wattage >= 65);

  if (heavyFans.length > 0) {
    const totalFanQty = heavyFans.reduce((sum, f) => sum + f.quantity, 0);
    const avgHours = heavyFans.reduce((sum, f) => sum + f.daily_hours, 0) / heavyFans.length;
    // Retrofit 75W Fan with 28W BLDC Fan
    const savedWatts = 75 - 28;
    const savedUnits = (savedWatts * totalFanQty * avgHours * 30) / 1000;
    const monthlySavings = savedUnits * marginalRate;
    const capitalCost = totalFanQty * 2400; // ~₹2400 per 5-star BLDC Fan

    recommendations.push({
      id: 'REC_BLDC_FAN',
      category: 'Appliance Upgrade',
      priority: avgHours >= 8 ? 'HIGH' : 'MEDIUM',
      title: `Retrofit ${totalFanQty}x Conventional Fans to 5-Star BLDC Fans`,
      description: `Replacing 75W induction fans with 28W Brushless DC (BLDC) motor fans preserves airflow while cutting electricity consumption by 62%.`,
      reason: `Fans run for ${avgHours.toFixed(1)} hours/day. Because cooling is a high-duty-cycle load, wattage reductions translate directly into fast ROI.`,
      estimatedMonthlySavings: Number(monthlySavings.toFixed(2)),
      estimatedPaybackMonths: Number((capitalCost / monthlySavings).toFixed(1)),
      actionItems: [
        `Replace ${totalFanQty} conventional induction fan(s) with BEE 5-Star rated BLDC fans (e.g., Atomberg, Crompton Energion, Havells Stealth).`,
        `Estimated upfront cost: ₹${capitalCost}. Payback period: ~${(capitalCost / monthlySavings).toFixed(1)} months.`
      ]
    });
  }

  // 3. Lighting Efficiency (CFL/Incandescent/Fluorescent Tube to LED)
  const legacyLighting = appliances.filter(a =>
    a.category === 'Lighting' &&
    (a.wattage >= 20 || a.appliance_name.toLowerCase().includes('tube') || a.appliance_name.toLowerCase().includes('cfl'))
  );

  if (legacyLighting.length > 0) {
    const qty = legacyLighting.reduce((s, l) => s + l.quantity, 0);
    const avgWatts = legacyLighting.reduce((s, l) => s + l.wattage, 0) / legacyLighting.length;
    const ledWatts = 9;
    const avgHrs = legacyLighting.reduce((s, l) => s + l.daily_hours, 0) / legacyLighting.length;

    const savedUnits = ((avgWatts - ledWatts) * qty * avgHrs * 30) / 1000;
    const monthlySavings = savedUnits * marginalRate;
    const capitalCost = qty * 100; // ~₹100 per 9W LED bulb

    recommendations.push({
      id: 'REC_LED_UPGRADE',
      category: 'Lighting Retrofit',
      priority: 'HIGH',
      title: `Upgrade ${qty} Legacy Light Fixtures to 9W High-Lumen LEDs`,
      description: `Replace remaining ${Math.round(avgWatts)}W tube lights or CFLs with 9W/10W LED bulbs (100+ lumens/watt).`,
      reason: `Solid-state LED lighting provides equal or superior illumination (800+ lumens) at an 80% reduction in thermal dissipation and wattage.`,
      estimatedMonthlySavings: Number(monthlySavings.toFixed(2)),
      estimatedPaybackMonths: Number((capitalCost / monthlySavings).toFixed(1)),
      actionItems: [
        `Purchase ${qty} units of 9W BEE 5-Star LED bulbs.`,
        `Payback is typically achieved in less than ${Math.max(1, Math.round(capitalCost / monthlySavings))} months.`
      ]
    });
  }

  // 4. Air Conditioning Thermostat Tuning & Service Check
  const acs = appliances.filter(a => a.appliance_name.toLowerCase().includes('ac') || a.appliance_name.toLowerCase().includes('air conditioner') || a.wattage >= 1200);
  if (acs.length > 0) {
    const totalAcHours = acs.reduce((s, a) => s + (a.daily_hours * a.quantity), 0);
    // Setting AC from 20C to 24C saves ~24% (6% per deg C as per Bureau of Energy Efficiency India)
    const estimatedAcUnits = acs.reduce((s, a) => s + ((a.wattage * a.quantity * a.daily_hours * 30) / 1000), 0);
    const potentialSavingsUnits = estimatedAcUnits * 0.24;
    const monthlySavings = potentialSavingsUnits * marginalRate;

    recommendations.push({
      id: 'REC_AC_OPTIMIZATION',
      category: 'Behavioral Optimization',
      priority: 'HIGH',
      title: 'Optimize Air Conditioning Thermostat to 24°C',
      description: 'According to BEE (Bureau of Energy Efficiency), every 1°C increase in AC temperature setting saves approximately 6% electricity.',
      reason: 'Setting the temperature to 18°C-20°C keeps the compressor running continuously without improving human thermal comfort index.',
      estimatedMonthlySavings: Number(monthlySavings.toFixed(2)),
      actionItems: [
        'Set default AC thermostat to 24°C or 25°C and utilize ceiling fans at low speed for gentle air circulation.',
        'Clean condenser and evaporator filters every 15 days (a clogged filter increases compressor load by up to 15%).'
      ]
    });
  }

  // 5. Refrigeration Maintenance
  const fridges = appliances.filter(a => a.category === 'Refrigeration' || a.appliance_name.toLowerCase().includes('fridge') || a.appliance_name.toLowerCase().includes('refrigerator'));
  if (fridges.length > 0) {
    recommendations.push({
      id: 'REC_REFRIGERATION_EFFICIENCY',
      category: 'Preventative Maintenance',
      priority: 'MEDIUM',
      title: 'Refrigerator Coil & Door Gasket Optimization',
      description: 'Ensure rear condenser coils have 4-6 inches of ventilation space and clean magnetic door seals.',
      reason: 'Heat trapping behind poorly ventilated refrigerators forces compressor duty cycles to jump from 40% to over 70%.',
      estimatedMonthlySavings: Number((15 * marginalRate).toFixed(2)),
      actionItems: [
        'Maintain a 10 cm air gap between the refrigerator rear and wall.',
        'Perform the paper dollar bill test on the rubber door gasket to ensure an airtight seal.'
      ]
    });
  }

  return recommendations;
}

module.exports = {
  generateAuditRecommendations
};