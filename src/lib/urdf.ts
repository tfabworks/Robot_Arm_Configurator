import type {
  ArmTemplate,
  Joint,
  Link,
  Servo,
  ServoDB,
} from '../types/arm';

const MM_TO_M = 0.001;
const KGCM_TO_NM = 0.0980665;
const DEG_TO_RAD = Math.PI / 180;

const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (n: number, digits = 6): string => {
  const r = Number(n.toFixed(digits));
  return Object.is(r, -0) ? '0' : String(r);
};

const fmtVec3 = (v: [number, number, number], digits = 6): string =>
  v.map((n) => fmt(n, digits)).join(' ');

const hexToRgba = (hex: string | undefined): string => {
  if (!hex) return '0.5 0.5 0.5 1';
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '0.5 0.5 0.5 1';
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return `${fmt(r, 3)} ${fmt(g, 3)} ${fmt(b, 3)} 1`;
};

interface VisualGeometry {
  originXyz: [number, number, number];
  originRpy: [number, number, number];
  geometry: string;
}

const visualForLink = (link: Link): VisualGeometry => {
  if (link.shape === 'cylinder') {
    const r = (link.dimensions.diameter / 2) * MM_TO_M;
    const h = link.dimensions.length * MM_TO_M;
    // URDF cylinder is along its local Z; our cylinder extends along local +Z
    // from the link origin. Center the visual at the half-length.
    return {
      originXyz: [0, 0, h / 2],
      originRpy: [0, 0, 0],
      geometry: `<cylinder radius="${fmt(r)}" length="${fmt(h)}"/>`,
    };
  }
  const l = link.dimensions.length * MM_TO_M;
  const w = link.dimensions.width * MM_TO_M;
  const t = link.dimensions.thickness * MM_TO_M;
  // Box link extends along local +X. URDF box is centered on link origin.
  return {
    originXyz: [l / 2, 0, 0],
    originRpy: [0, 0, 0],
    geometry: `<box size="${fmt(l)} ${fmt(w)} ${fmt(t)}"/>`,
  };
};

const linkXml = (link: Link): string => {
  const v = visualForLink(link);
  const matName = `${link.id}_mat`;
  return [
    `  <link name="${xmlEscape(link.id)}">`,
    `    <visual>`,
    `      <origin xyz="${fmtVec3(v.originXyz)}" rpy="${fmtVec3(v.originRpy)}"/>`,
    `      <geometry>${v.geometry}</geometry>`,
    `      <material name="${xmlEscape(matName)}">`,
    `        <color rgba="${hexToRgba(link.color)}"/>`,
    `      </material>`,
    `    </visual>`,
    `    <collision>`,
    `      <origin xyz="${fmtVec3(v.originXyz)}" rpy="${fmtVec3(v.originRpy)}"/>`,
    `      <geometry>${v.geometry}</geometry>`,
    `    </collision>`,
    `  </link>`,
  ].join('\n');
};

const jointEffortNm = (servo: Servo | null): number =>
  servo ? servo.torqueKgcm * KGCM_TO_NM : 0;

const jointVelocityRadS = (servo: Servo | null): number => {
  if (!servo || servo.speedSecPer60deg <= 0) return 0;
  // 60° in `speedSecPer60deg` seconds → rad/s
  return (60 * DEG_TO_RAD) / servo.speedSecPer60deg;
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

const jointXml = (
  joint: Joint,
  template: ArmTemplate,
  servos: ServoDB,
): string => {
  const xyzM: [number, number, number] = [
    joint.origin.xyz[0] * MM_TO_M,
    joint.origin.xyz[1] * MM_TO_M,
    joint.origin.xyz[2] * MM_TO_M,
  ];
  const servo = resolveServoForJoint(joint, template, servos);
  const lines = [
    `  <joint name="${xmlEscape(joint.id)}" type="${joint.type}">`,
    `    <origin xyz="${fmtVec3(xyzM)}" rpy="${fmtVec3(joint.origin.rpy)}"/>`,
    `    <parent link="${xmlEscape(joint.parent)}"/>`,
    `    <child link="${xmlEscape(joint.child)}"/>`,
    `    <axis xyz="${fmtVec3(joint.axis)}"/>`,
  ];
  if (joint.type !== 'fixed') {
    const effort = jointEffortNm(servo);
    const velocity = jointVelocityRadS(servo);
    if (joint.type === 'revolute' && joint.limit) {
      lines.push(
        `    <limit lower="${fmt(joint.limit.lower * DEG_TO_RAD)}" upper="${fmt(joint.limit.upper * DEG_TO_RAD)}" effort="${fmt(effort)}" velocity="${fmt(velocity)}"/>`,
      );
    } else {
      lines.push(
        `    <limit effort="${fmt(effort)}" velocity="${fmt(velocity)}"/>`,
      );
    }
  }
  lines.push(`  </joint>`);
  return lines.join('\n');
};

export const buildUrdf = (
  template: ArmTemplate,
  servos: ServoDB,
): string => {
  const head = [
    `<?xml version="1.0"?>`,
    `<robot name="${xmlEscape(template.id)}">`,
  ];
  const body: string[] = [];
  for (const link of template.links) body.push(linkXml(link));
  for (const joint of template.joints) body.push(jointXml(joint, template, servos));
  return [...head, ...body, `</robot>`, ''].join('\n');
};
