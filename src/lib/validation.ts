import type {
  ArmTemplate,
  Joint,
  Link,
  Magnet,
  MagnetDB,
  Servo,
  ServoDB,
} from '../types/arm';
import { gravityAxisFactor } from './kinematics';

const SERVO_CLEARANCE_DEFAULT = 0.2;
const WALL_MIN_DEFAULT = 1.5;

// True iff the given servo's body cavity (sized + clearance) fits within the
// parent link's envelope at the joint's location and axis. Phase 1 covers
// only the two axis cases used by our default template (turret in cylinder,
// elbow in box); other cases conservatively return true so the visualizer
// does not flash a false warning while we extend coverage.
export const checkServoFit = (
  servo: Servo,
  joint: Joint,
  link: Link,
  servoClearance = SERVO_CLEARANCE_DEFAULT,
): boolean => {
  const reqA = servo.dimensions.x + 2 * servoClearance;
  const reqB = servo.dimensions.y + 2 * servoClearance;
  const reqC = servo.dimensions.z + 2 * servoClearance;
  const isZ = Math.abs(joint.axis[2]) > 0.99;
  const isY = Math.abs(joint.axis[1]) > 0.99;
  if (link.shape === 'cylinder' && isZ) {
    return (
      link.dimensions.diameter >= reqA && link.dimensions.length >= reqC
    );
  }
  if (link.shape === 'box' && isY) {
    return (
      link.dimensions.length >= reqA &&
      link.dimensions.thickness >= reqB &&
      link.dimensions.width >= reqC
    );
  }
  return true;
};

export const checkMagnetFit = (
  magnet: Magnet,
  link: Link,
  wallMin = WALL_MIN_DEFAULT,
): boolean => {
  if (link.shape !== 'box') return true;
  if (!link.endEffector || link.endEffector.type !== 'magnet') return true;
  return (
    link.dimensions.thickness >= magnet.thicknessMm + wallMin &&
    link.dimensions.length >= magnet.diameterMm
  );
};

// PLA solid density. Real prints with 15-30% infill weigh less, so this
// over-estimates mass — which biases torque checks toward safety.
const PLA_DENSITY_G_PER_MM3 = 0.00124;

// Worst-case payload assumption: a double-clip (~5g).
const PAYLOAD_G = 5;

const SAFETY_FRACTION = 0.6;

const linkVolumeMm3 = (link: Link): number => {
  if (link.shape === 'cylinder') {
    const r = link.dimensions.diameter / 2;
    return Math.PI * r * r * link.dimensions.length;
  }
  const { length, width, thickness } = link.dimensions;
  return length * width * thickness;
};

export const linkMassG = (link: Link): number =>
  linkVolumeMm3(link) * PLA_DENSITY_G_PER_MM3;

const resolveMagnet = (link: Link, magnets: MagnetDB): Magnet | null => {
  if (!link.endEffector || link.endEffector.type !== 'magnet') return null;
  const id = link.endEffector.ref.replace(/^magnet-db:/, '');
  return magnets[id] ?? null;
};

const resolveServoForJoint = (
  joint: Joint,
  template: ArmTemplate,
  servos: ServoDB,
): Servo | null => {
  const slot = joint.servo ? template.servos[joint.servo] : undefined;
  if (!slot) return null;
  const id = slot.ref.replace(/^servo-db:/, '');
  return servos[id] ?? null;
};

// Build base→tip ordered chain of joints. Phase 1 templates are open serial.
const orderedChain = (template: ArmTemplate): Joint[] => {
  const result: Joint[] = [];
  let parent = template.rootLink;
  for (;;) {
    const joint = template.joints.find((j) => j.parent === parent);
    if (!joint) break;
    result.push(joint);
    parent = joint.child;
  }
  return result;
};

export interface JointTorqueReport {
  joint: Joint;
  servo: Servo | null;
  requiredKgcm: number;
  maxKgcm: number;
  utilization: number;
  level: 'ok' | 'warn' | 'over';
}

export interface ManufacturingIssue {
  linkId: string;
  message: string;
}

export interface ValidationReport {
  joints: JointTorqueReport[];
  voltage: {
    supplyV: number;
    minV: number;
    maxV: number;
    inRange: boolean;
  } | null;
  totalMassG: number;
  payloadG: number;
  manufacturing: ManufacturingIssue[];
}

// Walk inward from tip, accumulating torque about each joint at the
// worst-case fully-extended-horizontal pose (gravity perpendicular to arm).
//
// State carried between iterations:
//   distalMass — total mass of everything attached at or beyond the tip of
//     the link about to be processed.
//   distalMomentAboutChildTip — moment of that mass measured about that tip.
//
// On entry for joint J_i with child link L_i (length len_i):
//   1. Shift to J_i: moment_about_J_i_of_distal = distalMomentAboutChildTip
//                                                + distalMass * len_i
//   2. Add L_i's own CoM contribution: m_link * (len_i / 2)
//   The sum is the torque J_i's servo must overcome.
//
// For the next iteration (J_{i-1}, child L_{i-1}, whose tip IS J_i):
//   distalMomentAboutChildTip becomes the moment we just computed about J_i
//     (since J_i = tip of L_{i-1}, the reference points coincide).
//   distalMass picks up L_i's mass plus the servo body that sits at J_i.
export const computeValidation = (
  template: ArmTemplate,
  servos: ServoDB,
  magnets: MagnetDB,
  supplyV: number,
): ValidationReport => {
  const linkById = new Map(template.links.map((l) => [l.id, l]));
  const chain = orderedChain(template);

  let distalMass = 0;
  let distalMomentAboutChildTip = 0;
  let payloadAdded = 0;

  const tipLinkId = chain[chain.length - 1]?.child;
  const tipLink = tipLinkId ? linkById.get(tipLinkId) : undefined;
  if (tipLink) {
    const magnet = resolveMagnet(tipLink, magnets);
    if (magnet) {
      distalMass += magnet.weightG + PAYLOAD_G;
      payloadAdded = magnet.weightG + PAYLOAD_G;
      // Magnet + payload sit AT the tip → zero moment about that tip.
    }
  }

  const reports: JointTorqueReport[] = [];

  for (let i = chain.length - 1; i >= 0; i--) {
    const joint = chain[i];
    const child = linkById.get(joint.child);
    if (!child) continue;
    const childLen = child.dimensions.length;
    const childMass = linkMassG(child);

    const distalMomentAboutJoint = distalMomentAboutChildTip + distalMass * childLen;
    const linkMomentAboutJoint = childMass * (childLen / 2);
    const totalMomentAboutJoint = distalMomentAboutJoint + linkMomentAboutJoint;
    // Project the gravity-induced moment onto the joint's rotation axis. A
    // turret (axis parallel to gravity) sees no static-load torque.
    const axisFactor = gravityAxisFactor(joint.axis);
    const requiredKgcm = (totalMomentAboutJoint / 10000) * axisFactor;

    const servo = resolveServoForJoint(joint, template, servos);
    const maxKgcm = servo?.torqueKgcm ?? 0;
    const utilization = maxKgcm > 0 ? requiredKgcm / maxKgcm : Infinity;
    const level: JointTorqueReport['level'] =
      utilization > 1 ? 'over' : utilization > SAFETY_FRACTION ? 'warn' : 'ok';
    reports.push({ joint, servo, requiredKgcm, maxKgcm, utilization, level });

    distalMomentAboutChildTip = totalMomentAboutJoint;
    distalMass += childMass + (servo?.weightG ?? 0);
  }

  reports.reverse();

  const linksMass = template.links.reduce((sum, l) => sum + linkMassG(l), 0);
  const servosMass = chain.reduce((sum, j) => {
    const s = resolveServoForJoint(j, template, servos);
    return sum + (s?.weightG ?? 0);
  }, 0);
  const totalMassG = linksMass + servosMass + payloadAdded;

  const firstServo = reports.map((r) => r.servo).find((s) => s) ?? null;
  const voltage = firstServo
    ? {
        supplyV,
        minV: firstServo.voltage.min,
        maxV: firstServo.voltage.max,
        inRange:
          supplyV >= firstServo.voltage.min &&
          supplyV <= firstServo.voltage.max,
      }
    : null;

  return {
    joints: reports,
    voltage,
    totalMassG,
    payloadG: PAYLOAD_G,
    manufacturing: collectManufacturingIssues(template, servos, magnets),
  };
};

const collectManufacturingIssues = (
  template: ArmTemplate,
  servos: ServoDB,
  magnets: MagnetDB,
): ManufacturingIssue[] => {
  const issues: ManufacturingIssue[] = [];
  const c = template.manufacturing?.servoHoleClearanceMm ?? 0.2;

  for (const link of template.links) {
    for (const joint of template.joints) {
      if (joint.parent !== link.id) continue;
      const slot = joint.servo ? template.servos[joint.servo] : undefined;
      if (!slot) continue;
      const id = slot.ref.replace(/^servo-db:/, '');
      const servo = servos[id];
      if (!servo) continue;

      const axis = joint.axis;
      const isZ = Math.abs(axis[2]) > 0.99;
      const isY = Math.abs(axis[1]) > 0.99;
      const reqAcrossA = servo.dimensions.x + 2 * c;
      const reqAcrossB = servo.dimensions.y + 2 * c;
      const reqDepth = servo.dimensions.z + 2 * c + 1;

      if (link.shape === 'cylinder' && isZ) {
        if (link.dimensions.diameter < reqAcrossA) {
          issues.push({
            linkId: link.id,
            message: `直径 ${link.dimensions.diameter}mm < 必要 ${reqAcrossA.toFixed(1)}mm（${servo.id} 取付幅）`,
          });
        }
        if (link.dimensions.length < reqDepth) {
          issues.push({
            linkId: link.id,
            message: `長さ ${link.dimensions.length}mm < 必要 ${reqDepth.toFixed(1)}mm（${servo.id} 本体深さ + ホーン）`,
          });
        }
      } else if (link.shape === 'box' && isY) {
        if (link.dimensions.length < reqAcrossA) {
          issues.push({
            linkId: link.id,
            message: `長さ ${link.dimensions.length}mm < 必要 ${reqAcrossA.toFixed(1)}mm（${servo.id} 取付幅）`,
          });
        }
        if (link.dimensions.thickness < reqAcrossB) {
          issues.push({
            linkId: link.id,
            message: `厚さ ${link.dimensions.thickness}mm < 必要 ${reqAcrossB.toFixed(1)}mm（${servo.id} 本体厚）`,
          });
        }
        if (link.dimensions.width < reqDepth) {
          issues.push({
            linkId: link.id,
            message: `幅 ${link.dimensions.width}mm < 必要 ${reqDepth.toFixed(1)}mm（${servo.id} 本体深さ）`,
          });
        }
      }
    }

    if (link.endEffector?.type === 'magnet' && link.shape === 'box') {
      const id = link.endEffector.ref.replace(/^magnet-db:/, '');
      const magnet = magnets[id];
      if (magnet) {
        const wallMin = template.manufacturing?.wallMinMm ?? 1.5;
        const reqThickness = magnet.thicknessMm + wallMin;
        if (link.dimensions.thickness < reqThickness) {
          issues.push({
            linkId: link.id,
            message: `厚さ ${link.dimensions.thickness}mm < 必要 ${reqThickness.toFixed(1)}mm（磁石ポケット ${magnet.thicknessMm}mm + 上壁 ${wallMin}mm）`,
          });
        }
      }
    }
  }
  return issues;
};

export const SAFETY_FRACTION_PCT = SAFETY_FRACTION * 100;
