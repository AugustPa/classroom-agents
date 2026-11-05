// Return the first cylinder touched along the entire movement step, including
// fast steps whose endpoints both lie outside a narrow cylinder.
function firstCylinderHit(start, end, cylinders) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const a = dx * dx + dy * dy;
  let first = null;
  let firstTime = Infinity;
  for (const cylinder of cylinders) {
    const ox = start.x - cylinder.x;
    const oy = start.y - cylinder.y;
    const c = ox * ox + oy * oy - cylinder.radius * cylinder.radius;
    let t = 0;
    if (c > 0) {
      if (a === 0) continue;
      const b = 2 * (ox * dx + oy * dy);
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) continue;
      t = (-b - Math.sqrt(discriminant)) / (2 * a);
      if (t < 0 || t > 1) continue;
    }
    if (t < firstTime) {
      first = cylinder;
      firstTime = t;
    }
  }
  return first;
}

module.exports = { firstCylinderHit };
