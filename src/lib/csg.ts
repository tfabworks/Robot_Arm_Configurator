import Module from 'manifold-3d';
import type {
  ArmTemplate,
  Joint,
  Link,
  Magnet,
  MagnetDB,
  Servo,
  ServoDB,
} from '../types/arm';

type ManifoldNS = Awaited<ReturnType<typeof Module>>;
type ManifoldClass = ManifoldNS['Manifold'];
type ManifoldInstance = InstanceType<ManifoldClass>;

let envPromise: Promise<ManifoldNS> | null = null;
const getEnv = (): Promise<ManifoldNS> => {
  if (!envPromise) {
    envPromise = (async () => {
      const m = await Module();
      m.setup();
      return m;
    })();
  }
  return envPromise;
};

// Radial clearance added to M2 screw holes on top of the diameter recorded
// in the servo DB (which is the screw's nominal size).
const SCREW_CLEARANCE_MM = 0.2;
// Extra room above the servo body for the horn boss / shaft to clear the
// link's mounting surface.
const HORN_CLEARANCE_TOP_MM = 1;
// Clearance pad added under the magnet pocket so the part presses fully home.
const MAGNET_POCKET_DEPTH_PAD_MM = 0.4;
// Length of clearance hole drilled along the screw axis. Long enough to
// punch through any reasonable wall + leave the screw seated.
const SCREW_HOLE_LEN_MM = 30;

// Map an axis-aligned joint axis to Euler degrees (manifold rotates X→Y→Z
// in the global frame) such that the servo's +Z (shaft) lands on that axis.
const eulerForAxis = (
  axis: readonly [number, number, number],
): [number, number, number] => {
  const [x, y, z] = axis;
  if (z > 0.99) return [0, 0, 0];
  if (z < -0.99) return [180, 0, 0];
  if (y > 0.99) return [-90, 0, 0];
  if (y < -0.99) return [90, 0, 0];
  if (x > 0.99) return [0, 90, 0];
  if (x < -0.99) return [0, -90, 0];
  return [0, 0, 0];
};

const buildLinkEnvelope = (M: ManifoldClass, link: Link): ManifoldInstance => {
  if (link.shape === 'cylinder') {
    return M.cylinder(
      link.dimensions.length,
      link.dimensions.diameter / 2,
      undefined,
      64,
      false,
    );
  }
  const { length, width, thickness } = link.dimensions;
  return M.cube([length, width, thickness], false).translate([
    0,
    -width / 2,
    -thickness / 2,
  ]);
};

const buildServoCavity = (
  M: ManifoldClass,
  servo: Servo,
  joint: Joint,
  servoClearance: number,
): ManifoldInstance => {
  // Servo local frame: +Z = shaft, body extends from z=0 (tab plane) to
  // z=-bodyZ. X is the tab span direction, Y is the short side.
  const cx = servo.dimensions.x + 2 * servoClearance;
  const cy = servo.dimensions.y + 2 * servoClearance;
  const cz = servo.dimensions.z + 2 * servoClearance + HORN_CLEARANCE_TOP_MM;
  let cavity = M.cube([cx, cy, cz], false).translate([
    -cx / 2,
    -cy / 2,
    -(cz - HORN_CLEARANCE_TOP_MM),
  ]);
  cavity = cavity.rotate(eulerForAxis(joint.axis));
  cavity = cavity.translate(joint.origin.xyz);
  return cavity;
};

const buildScrewHoles = (
  M: ManifoldClass,
  servo: Servo,
  joint: Joint,
): ManifoldInstance | null => {
  const holes = servo.mountingHoles;
  if (holes.length === 0) return null;
  let combined: ManifoldInstance | null = null;
  for (const h of holes) {
    let hc = M.cylinder(
      SCREW_HOLE_LEN_MM,
      h.diameter / 2 + SCREW_CLEARANCE_MM,
      undefined,
      24,
      true,
    );
    hc = hc.translate([h.x, h.y, h.z]);
    hc = hc.rotate(eulerForAxis(joint.axis));
    hc = hc.translate(joint.origin.xyz);
    combined = combined ? combined.add(hc) : hc;
  }
  return combined;
};

const buildMagnetPocket = (
  M: ManifoldClass,
  magnet: Magnet,
  link: Link,
  clearanceMm: number,
): ManifoldInstance | null => {
  if (link.shape !== 'box') return null;
  if (!link.endEffector || link.endEffector.type !== 'magnet') return null;
  // Negative clearance for an interference fit — but if the diameter ends
  // up non-positive, skip rather than crash CSG.
  const r = magnet.diameterMm / 2 + clearanceMm;
  if (r <= 0.1) return null;
  const h = magnet.thicknessMm + MAGNET_POCKET_DEPTH_PAD_MM;
  const tip = link.dimensions.length;
  const t = link.dimensions.thickness;
  let pocket = M.cylinder(h, r, undefined, 32, false);
  switch (link.endEffector.orientation) {
    case 'down':
      pocket = pocket.translate([tip, 0, -t / 2]);
      break;
    case 'up':
      pocket = pocket.translate([tip, 0, t / 2 - h]);
      break;
    case 'forward':
      pocket = pocket.rotate([0, 90, 0]).translate([tip - h, 0, 0]);
      break;
  }
  return pocket;
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

const resolveMagnetForLink = (link: Link, magnets: MagnetDB): Magnet | null => {
  if (!link.endEffector || link.endEffector.type !== 'magnet') return null;
  const id = link.endEffector.ref.replace(/^magnet-db:/, '');
  return magnets[id] ?? null;
};

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export const buildLinkMesh = async (
  template: ArmTemplate,
  link: Link,
  servos: ServoDB,
  magnets: MagnetDB,
): Promise<MeshData> => {
  const env = await getEnv();
  const Manifold = env.Manifold;

  let body = buildLinkEnvelope(Manifold, link);

  const servoClearance = template.manufacturing?.servoHoleClearanceMm ?? 0.2;
  const magnetClearance = template.manufacturing?.magnetHoleClearanceMm ?? -0.1;

  for (const joint of template.joints) {
    if (joint.parent !== link.id) continue;
    const servo = resolveServoForJoint(joint, template, servos);
    if (!servo) continue;
    const cavity = buildServoCavity(Manifold, servo, joint, servoClearance);
    const next = body.subtract(cavity);
    body.delete();
    cavity.delete();
    body = next;
    const screws = buildScrewHoles(Manifold, servo, joint);
    if (screws) {
      const next2 = body.subtract(screws);
      body.delete();
      screws.delete();
      body = next2;
    }
  }

  if (link.endEffector?.type === 'magnet') {
    const magnet = resolveMagnetForLink(link, magnets);
    if (magnet) {
      const pocket = buildMagnetPocket(Manifold, magnet, link, magnetClearance);
      if (pocket) {
        const next = body.subtract(pocket);
        body.delete();
        pocket.delete();
        body = next;
      }
    }
  }

  const mesh = body.getMesh();
  body.delete();

  const numProp = mesh.numProp;
  const vertCount = mesh.vertProperties.length / numProp;
  const positions = new Float32Array(vertCount * 3);
  for (let i = 0, j = 0; i < vertCount; i++, j += 3) {
    const o = i * numProp;
    positions[j] = mesh.vertProperties[o];
    positions[j + 1] = mesh.vertProperties[o + 1];
    positions[j + 2] = mesh.vertProperties[o + 2];
  }
  return {
    positions,
    indices: new Uint32Array(mesh.triVerts),
  };
};
