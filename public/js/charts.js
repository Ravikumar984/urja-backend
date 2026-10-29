/**
 * UrjaAudit Lightweight Native SVG Visualization Engine
 */

function renderDonutChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;font-size:12px;">No load recorded</div>';
    return;
  }

  const colors = ['#059669', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];
  let cumulativeAngle = 0;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  data.forEach((slice, index) => {
    const fraction = slice.value / total;
    const angle = fraction * 360;

    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const x1 = 50 + 40 * Math.cos(Math.PI * (startAngle - 90) / 180);
    const y1 = 50 + 40 * Math.sin(Math.PI * (startAngle - 90) / 180);
    const x2 = 50 + 40 * Math.cos(Math.PI * (endAngle - 90) / 180);
    const y2 = 50 + 40 * Math.sin(Math.PI * (endAngle - 90) / 180);

    const largeArcFlag = angle > 180 ? 1 : 0;
    const pathData = fraction >= 0.999
      ? `M 50 10 A 40 40 0 1 1 49.99 10 Z`
      : `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', colors[index % colors.length]);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '1.5');

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${slice.label}: ${slice.value.toFixed(1)} kWh (${((slice.value / total) * 100).toFixed(1)}%)`;
    path.appendChild(title);

    svg.appendChild(path);
  });

  // Inner cutout for Donut hole
  const innerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  innerCircle.setAttribute('cx', '50');
  innerCircle.setAttribute('cy', '50');
  innerCircle.setAttribute('r', '24');
  innerCircle.setAttribute('fill', '#ffffff');
  svg.appendChild(innerCircle);

  container.appendChild(svg);
}