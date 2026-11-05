const test = require("node:test");
const assert = require("node:assert/strict");
const { firstCylinderHit } = require("../lib/cylinder-goals");
const target = { id: "a", x: 10, y: 0, radius: 0.5 };

test("detects entry and crossing a narrow target between ticks", () => {
  assert.equal(firstCylinderHit({ x: 8, y: 0 }, { x: 10, y: 0 }, [target]), target);
  assert.equal(firstCylinderHit({ x: 8, y: 0 }, { x: 12, y: 0 }, [target]), target);
});

test("passing beside a target or moving away does not score", () => {
  assert.equal(firstCylinderHit({ x: 8, y: 0.6 }, { x: 12, y: 0.6 }, [target]), null);
  assert.equal(firstCylinderHit({ x: 8, y: 0 }, { x: 6, y: 0 }, [target]), null);
});

test("stationary contact counts, but stationary empty space does not", () => {
  assert.equal(firstCylinderHit({ x: 10, y: 0 }, { x: 10, y: 0 }, [target]), target);
  assert.equal(firstCylinderHit({ x: 0, y: 0 }, { x: 0, y: 0 }, [target]), null);
});

test("selects the first target reached regardless of array order", () => {
  const farther = { id: "b", x: 14, y: 0, radius: 1 };
  assert.equal(firstCylinderHit({ x: 0, y: 0 }, { x: 20, y: 0 }, [farther, target]), target);
});
