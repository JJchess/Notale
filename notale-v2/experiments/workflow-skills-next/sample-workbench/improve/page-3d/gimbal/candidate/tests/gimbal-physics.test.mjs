import assert from 'node:assert/strict';
import RAPIER from '../pages/assets/lib/rapier3d-deterministic/dist/rapier.mjs';
import {
  ANALYTIC,
  GimbalPhysics,
  MODEL,
  PHYSICS,
  ROTOR_PARTS
} from '../pages/media/gimbal-physics.mjs';

await RAPIER.init();

const degrees = radians => radians * 180 / Math.PI;
const close = (actual, expected, tolerance, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, received ${actual}`
  );
};
const assertFiniteTree = (value, path = 'result') => {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} must be finite`);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteTree(entry, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertFiniteTree(entry, `${path}.${key}`);
  }
};

function solve() {
  const simulation = new GimbalPhysics(RAPIER);
  const preTorque = simulation.runToStep(PHYSICS.torqueStartStep);
  const torqueEnd = simulation.runToStep(PHYSICS.torqueEndStep);
  const final = simulation.runToStep(PHYSICS.finalStep);
  const validation = simulation.validationState();
  const bodyCount = simulation.world.bodies.len();
  const jointCount = simulation.world.impulseJoints.len();
  simulation.dispose();
  return { preTorque, torqueEnd, final, validation, bodyCount, jointCount };
}

const first = solve();

assert.ok(Object.isFrozen(ROTOR_PARTS), 'rotor parts collection must be immutable');
for (const [name, part] of Object.entries(ROTOR_PARTS)) {
  assert.ok(Object.isFrozen(part), `${name} rotor part must be immutable`);
}
assert.throws(() => { ROTOR_PARTS.rim.mass = 99; }, TypeError, 'frozen rotor mass rejects mutation');

assert.equal(first.bodyCount, PHYSICS.visibleBodyCount + PHYSICS.probeBodyCount, 'rigid-body count');
assert.equal(first.jointCount, PHYSICS.revoluteJointCount, 'joint count');
close(first.validation.probeMass, MODEL.rotor.mass, 1e-6, 'probe mass');
close(first.validation.probeInertia[0], MODEL.rotor.inertia.x, 1e-5, 'rotor axial inertia');
close(first.validation.probeInertia[1], MODEL.rotor.inertia.y, 1e-5, 'rotor transverse inertia Y');
close(first.validation.probeInertia[2], MODEL.rotor.inertia.z, 1e-5, 'rotor transverse inertia Z');

close(
  degrees(first.torqueEnd.metrics.spinningDriftRadians),
  degrees(ANALYTIC.spinningDriftRadians),
  0.1,
  'spinning probe vs angular-impulse estimate'
);
close(
  degrees(first.torqueEnd.metrics.stillDriftRadians),
  degrees(ANALYTIC.stillDriftRadians),
  1,
  'still probe vs constant-angular-acceleration estimate'
);
assert.ok(
  degrees(first.preTorque.metrics.mainDriftRadians) < 0.1,
  'main rotor must retain its world direction before the disturbance'
);
close(
  degrees(first.final.metrics.mainDriftRadians),
  degrees(first.final.metrics.spinningDriftRadians),
  0.2,
  'jointed main rotor vs free spinning probe'
);
close(degrees(first.final.metrics.housingAngleRadians), 45, 0.1, 'housing target attitude');
assert.equal(first.final.stepIndex, PHYSICS.finalStep, 'integer final step');
assert.equal(first.final.time, PHYSICS.finalStep * PHYSICS.timestep, 'canonical simulation time');
assert.deepEqual(first.final.metrics.spinningDriftRadians, first.torqueEnd.metrics.spinningDriftRadians);
assert.deepEqual(first.final.metrics.stillDriftRadians, first.torqueEnd.metrics.stillDriftRadians);
assertFiniteTree(first);

// Deterministic-compat must produce bit-identical primitive snapshots on independent runs.
const second = solve();
const third = solve();
assert.deepEqual(second, first, 'second deterministic solve');
assert.deepEqual(third, first, 'third deterministic solve');

console.log(JSON.stringify({
  status: 'PASS',
  engine: 'Rapier 3D deterministic-compat 0.20.0',
  timestepHz: 1 / PHYSICS.timestep,
  bodies: first.bodyCount,
  joints: first.jointCount,
  rotorInertia: first.validation.probeInertia,
  analyticalDegrees: {
    spinning: degrees(ANALYTIC.spinningDriftRadians),
    still: degrees(ANALYTIC.stillDriftRadians)
  },
  simulatedDegrees: {
    spinning: degrees(first.torqueEnd.metrics.spinningDriftRadians),
    still: degrees(first.torqueEnd.metrics.stillDriftRadians),
    mainFinal: degrees(first.final.metrics.mainDriftRadians),
    housingFinal: degrees(first.final.metrics.housingAngleRadians)
  },
  repeatedSolves: 3
}, null, 2));
