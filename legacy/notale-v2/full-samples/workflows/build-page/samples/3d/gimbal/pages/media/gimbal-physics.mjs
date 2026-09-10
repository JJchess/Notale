/**
 * Deterministic, renderer-independent rigid-body model for the gimbal page.
 *
 * The bodies have no colliders because this is an ideal, centred mechanism:
 * gravity is zero, every centre of mass is at the common pivot, the bearings
 * are frictionless, and all four constraints are revolute joints. Rapier still
 * solves the complete coupled 3D rotational dynamics; the two detached probe
 * bodies provide a controlled comparison for the same world-space impulse.
 */

const { freeze } = Object;

export const PHYSICS = freeze({
  timestep: 1 / 240,
  rotorSpin: 52,
  disturbanceTorque: 10,
  housingStartStep: 180,
  housingEndStep: 660,
  torqueStartStep: 840,
  torqueEndStep: 1008,
  finalStep: 1128,
  visibleBodyCount: 5,
  probeBodyCount: 2,
  revoluteJointCount: 4
});

const RINGS = freeze({
  outer: { mass: 2.4, radius: 2.62, normal: 'z' },
  middle: { mass: 2.0, radius: 2.16, normal: 'x' },
  inner: { mass: 1.7, radius: 1.70, normal: 'y' }
});

export const ROTOR_PARTS = freeze({
  rim: freeze({ mass: 4.4, majorRadius: 1.08, tubeRadius: 0.18 }),
  spokes: freeze({ count: 4, massEach: 0.1, x: 0.12, y: 1.84, z: 0.08 }),
  hub: freeze({ mass: 0.7, radius: 0.29, length: 0.62 }),
  shaft: freeze({ mass: 0.5, radius: 0.075, length: 4.05 })
});

const VISIBLE_BODY_KEYS = freeze(['housing', 'outer', 'middle', 'inner', 'rotor']);
const ZERO = freeze({ x: 0, y: 0, z: 0 });
const IDENTITY = freeze({ x: 0, y: 0, z: 0, w: 1 });
const AXIS = freeze({
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 }
});

function thinRingInertia({ mass, radius, normal }) {
  const normalMoment = mass * radius * radius;
  const diameterMoment = normalMoment / 2;
  const inertia = { x: diameterMoment, y: diameterMoment, z: diameterMoment };
  inertia[normal] = normalMoment;
  return freeze(inertia);
}

function cylinderInertia(mass, radius, length) {
  return { axial: 0.5 * mass * radius ** 2, transverse: mass * (3 * radius ** 2 + length ** 2) / 12 };
}

/** Derive the rotor tensor from the exact primitives drawn by gimbal-sim.mjs. */
export function deriveRotorModel(parts = ROTOR_PARTS) {
  const { rim, spokes, hub, shaft } = parts;
  const rimAxial = rim.mass * (
    rim.majorRadius * rim.majorRadius + 0.75 * rim.tubeRadius * rim.tubeRadius
  );
  const rimTransverse = rim.mass * (
    0.5 * rim.majorRadius * rim.majorRadius + 0.625 * rim.tubeRadius * rim.tubeRadius
  );

  const spokeIx = spokes.massEach * (spokes.y * spokes.y + spokes.z * spokes.z) / 12;
  const spokeIy = spokes.massEach * (spokes.x * spokes.x + spokes.z * spokes.z) / 12;
  const spokeIz = spokes.massEach * (spokes.x * spokes.x + spokes.y * spokes.y) / 12;
  // Four bars are evenly distributed around X, so their summed Y/Z moments match.
  const spokeTransverse = spokes.count * (spokeIy + spokeIz) / 2;
  const hubI = cylinderInertia(hub.mass, hub.radius, hub.length);
  const shaftI = cylinderInertia(shaft.mass, shaft.radius, shaft.length);

  const mass = rim.mass + spokes.count * spokes.massEach + hub.mass + shaft.mass;
  const axial = rimAxial + spokes.count * spokeIx + hubI.axial + shaftI.axial;
  const transverse = rimTransverse + spokeTransverse + hubI.transverse + shaftI.transverse;
  return freeze({ mass, inertia: freeze({ x: axial, y: transverse, z: transverse }) });
}

function ringModel(spec) {
  return freeze({ mass: spec.mass, radius: spec.radius, inertia: thinRingInertia(spec) });
}

export const MODEL = freeze({
  rings: freeze({
    outer: ringModel(RINGS.outer),
    middle: ringModel(RINGS.middle),
    inner: ringModel(RINGS.inner)
  }),
  rotor: deriveRotorModel()
});

const torqueSteps = PHYSICS.torqueEndStep - PHYSICS.torqueStartStep;
const torqueDuration = torqueSteps * PHYSICS.timestep;
const angularImpulse = PHYSICS.disturbanceTorque * torqueDuration;
export const ANALYTIC = freeze({
  angularImpulse,
  torqueDuration,
  spinningDriftRadians: Math.atan(angularImpulse / (MODEL.rotor.inertia.x * PHYSICS.rotorSpin)),
  stillDriftRadians: 0.5 * PHYSICS.disturbanceTorque * torqueDuration ** 2 / MODEL.rotor.inertia.z
});

export function quaternionFromEulerXYZ(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return freeze({
    x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3
  });
}

export const HOUSING_TARGET = quaternionFromEulerXYZ(0.48, -0.34, 0.62);

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function slerpIdentityInto(target, t, out) {
  const cosHalfTheta = clamp(target.w, -1, 1);
  const halfTheta = Math.acos(cosHalfTheta);
  if (halfTheta < 1e-12) {
    out.x = 0; out.y = 0; out.z = 0; out.w = 1;
    return out;
  }
  const sinHalfTheta = Math.sin(halfTheta);
  const targetScale = Math.sin(t * halfTheta) / sinHalfTheta;
  out.x = target.x * targetScale;
  out.y = target.y * targetScale;
  out.z = target.z * targetScale;
  out.w = Math.sin((1 - t) * halfTheta) / sinHalfTheta + target.w * targetScale;
  return out;
}

function axisXFromQuaternion(rotation, out) {
  const { x, y, z, w } = rotation;
  out.x = 1 - 2 * (y * y + z * z);
  out.y = 2 * (x * y + w * z);
  out.z = 2 * (x * z - w * y);
  return out;
}

function axisDriftRadians(body, scratchAxis) {
  axisXFromQuaternion(body.rotation(), scratchAxis);
  return Math.acos(clamp(scratchAxis.x, -1, 1));
}

function quaternionAngleRadians(rotation) { return 2 * Math.acos(clamp(Math.abs(rotation.w), -1, 1)); }

function primitiveTransform(body) {
  const p = body.translation();
  const q = body.rotation();
  return { position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w] };
}

function bodyDescription(desc, mass, inertia, angularVelocity = null) {
  desc.setAdditionalMassProperties(mass, ZERO, inertia, IDENTITY).setAngularDamping(0);
  if (angularVelocity) desc.setAngvel(angularVelocity);
  return desc;
}

export class GimbalPhysics {
  constructor(RAPIER) {
    if (!RAPIER || !RAPIER.World) throw new TypeError('A ready Rapier module is required.');
    this.RAPIER = RAPIER;
    this.world = null;
    this.bodies = null;
    this.joints = [];
    this.stepIndex = 0;
    this._housingRotation = { x: 0, y: 0, z: 0, w: 1 };
    this._torqueImpulse = { x: 0, y: 0, z: PHYSICS.disturbanceTorque * PHYSICS.timestep };
    this._scratchAxis = { x: 1, y: 0, z: 0 };
    this._comparison = null;
    this.reset();
  }

  reset() {
    this.disposeWorld();
    const RAPIER = this.RAPIER;
    const world = new RAPIER.World(ZERO);
    world.timestep = PHYSICS.timestep;
    if (world.integrationParameters && 'numSolverIterations' in world.integrationParameters) {
      world.integrationParameters.numSolverIterations = 32;
    }

    const dynamicBody = (model, angularVelocity = null, x = 0) => world.createRigidBody(
      bodyDescription(RAPIER.RigidBodyDesc.dynamic(), model.mass, model.inertia, angularVelocity)
        .setTranslation(x, 0, 0)
    );
    const housing = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const outer = dynamicBody(MODEL.rings.outer);
    const middle = dynamicBody(MODEL.rings.middle);
    const inner = dynamicBody(MODEL.rings.inner);
    const initialSpin = { x: PHYSICS.rotorSpin, y: 0, z: 0 };
    const rotor = dynamicBody(MODEL.rotor, initialSpin);
    const spinProbe = dynamicBody(MODEL.rotor, initialSpin, 30);
    const stillProbe = dynamicBody(MODEL.rotor, null, 60);

    this.joints = [
      world.createImpulseJoint(RAPIER.JointData.revolute(ZERO, ZERO, AXIS.x), housing, outer, true),
      world.createImpulseJoint(RAPIER.JointData.revolute(ZERO, ZERO, AXIS.y), outer, middle, true),
      world.createImpulseJoint(RAPIER.JointData.revolute(ZERO, ZERO, AXIS.z), middle, inner, true),
      world.createImpulseJoint(RAPIER.JointData.revolute(ZERO, ZERO, AXIS.x), inner, rotor, true)
    ];
    this.world = world;
    this.bodies = { housing, outer, middle, inner, rotor, spinProbe, stillProbe };
    this.stepIndex = 0;
    this._comparison = null;
    return this;
  }

  step() {
    if (!this.world) throw new Error('The physics world has been disposed.');
    const housingProgress = smoothstep(
      (this.stepIndex + 1 - PHYSICS.housingStartStep) /
      (PHYSICS.housingEndStep - PHYSICS.housingStartStep)
    );
    const rotation = slerpIdentityInto(HOUSING_TARGET, housingProgress, this._housingRotation);
    this.bodies.housing.setNextKinematicRotation(rotation);

    // Apply exactly 168 fixed-step impulses: 10 N·m × (1/240 s) = 7 N·m·s total.
    if (this.stepIndex >= PHYSICS.torqueStartStep && this.stepIndex < PHYSICS.torqueEndStep) {
      this.bodies.rotor.applyTorqueImpulse(this._torqueImpulse, true);
      this.bodies.spinProbe.applyTorqueImpulse(this._torqueImpulse, true);
      this.bodies.stillProbe.applyTorqueImpulse(this._torqueImpulse, true);
    }
    this.world.step();
    this.stepIndex += 1;
    if (this.stepIndex === PHYSICS.torqueEndStep) {
      this._comparison = {
        spinningDriftRadians: axisDriftRadians(this.bodies.spinProbe, this._scratchAxis),
        stillDriftRadians: axisDriftRadians(this.bodies.stillProbe, this._scratchAxis)
      };
    }
    return this.stepIndex;
  }

  runToStep(targetStep) {
    const numericTarget = Number(targetStep);
    const target = Number.isFinite(numericTarget)
      ? clamp(Math.round(numericTarget), 0, PHYSICS.finalStep)
      : 0;
    while (this.stepIndex < target) this.step();
    return this.snapshot();
  }

  metrics() {
    const { housing, rotor, spinProbe, stillProbe } = this.bodies;
    const rotorRotation = rotor.rotation();
    axisXFromQuaternion(rotorRotation, this._scratchAxis);
    const angularVelocity = rotor.angvel();
    const axialRadiansPerSecond =
      angularVelocity.x * this._scratchAxis.x +
      angularVelocity.y * this._scratchAxis.y +
      angularVelocity.z * this._scratchAxis.z;
    const comparison = this._comparison || {
      spinningDriftRadians: axisDriftRadians(spinProbe, this._scratchAxis),
      stillDriftRadians: axisDriftRadians(stillProbe, this._scratchAxis)
    };
    return {
      housingAngleRadians: quaternionAngleRadians(housing.rotation()),
      mainDriftRadians: axisDriftRadians(rotor, this._scratchAxis),
      spinningDriftRadians: comparison.spinningDriftRadians,
      stillDriftRadians: comparison.stillDriftRadians,
      rotorRpm: Math.abs(axialRadiansPerSecond) * 60 / (2 * Math.PI)
    };
  }

  snapshot() {
    const transforms = {};
    for (const key of VISIBLE_BODY_KEYS) transforms[key] = primitiveTransform(this.bodies[key]);
    const rotorAngularVelocity = this.bodies.rotor.angvel();
    return {
      stepIndex: this.stepIndex,
      time: this.stepIndex * PHYSICS.timestep,
      transforms,
      metrics: this.metrics(),
      rotorAngularVelocity: [rotorAngularVelocity.x, rotorAngularVelocity.y, rotorAngularVelocity.z]
    };
  }

  validationState() {
    const probeInertia = this.bodies.spinProbe.principalInertia();
    return {
      stepIndex: this.stepIndex,
      probeMass: this.bodies.spinProbe.mass(),
      probeInertia: [probeInertia.x, probeInertia.y, probeInertia.z],
      snapshot: this.snapshot()
    };
  }

  disposeWorld() {
    this.world?.free?.();
    this.world = null;
    this.bodies = null;
    this.joints = [];
  }

  dispose() { this.disposeWorld(); }
}
