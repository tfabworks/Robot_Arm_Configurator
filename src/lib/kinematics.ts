import * as THREE from 'three';
import type { ArmTemplate, Joint, Link, Magnet } from '../types/arm';

// Walk root → leaf along parent/child links to find the joint chain.
const chainTo = (template: ArmTemplate, leafLinkId: string): Joint[] => {
  const result: Joint[] = [];
  let target = leafLinkId;
  while (target !== template.rootLink) {
    const j = template.joints.find((j) => j.child === target);
    if (!j) return [];
    result.unshift(j);
    target = j.parent;
  }
  return result;
};

const orientationToLocal = (
  o: 'down' | 'up' | 'forward',
): [number, number, number] => {
  switch (o) {
    case 'up':
      return [0, 0, 1];
    case 'forward':
      return [1, 0, 0];
    case 'down':
    default:
      return [0, 0, -1];
  }
};

const linkRotationFromAngles = (
  template: ArmTemplate,
  jointAngles: Record<string, number>,
  leafLinkId: string,
): THREE.Quaternion => {
  const chain = chainTo(template, leafLinkId);
  const accum = new THREE.Quaternion();
  for (const joint of chain) {
    const angleRad =
      ((jointAngles[joint.id] ?? joint.home ?? 0) * Math.PI) / 180;
    const axis = new THREE.Vector3(...joint.axis).normalize();
    const jointQ = new THREE.Quaternion().setFromAxisAngle(axis, angleRad);
    // Each joint's transform applies in its parent's frame, post-multiplying
    // the chain's accumulated rotation. RPY is assumed zero for our templates.
    accum.multiply(jointQ);
  }
  return accum;
};

const findMagnetLink = (template: ArmTemplate): Link | null =>
  template.links.find(
    (l) => l.endEffector && l.endEffector.type === 'magnet',
  ) ?? null;

export interface ReleaseStatus {
  tiltAngleDeg: number;
  thresholdDeg: number;
  released: boolean;
}

export const computeReleaseStatus = (
  template: ArmTemplate,
  jointAngles: Record<string, number>,
): ReleaseStatus | null => {
  const link = findMagnetLink(template);
  if (!link?.endEffector || link.endEffector.type !== 'magnet') return null;
  const threshold = link.endEffector.releaseAngleDeg;
  if (threshold === undefined) return null;

  const faceLocal = orientationToLocal(link.endEffector.orientation);
  const linkQuat = linkRotationFromAngles(template, jointAngles, link.id);
  const faceWorld = new THREE.Vector3(...faceLocal).applyQuaternion(linkQuat);

  // Tilt = angle between the magnet face direction and gravity-down (-Z).
  const cos = Math.max(-1, Math.min(1, faceWorld.dot(new THREE.Vector3(0, 0, -1))));
  const tiltAngleDeg = (Math.acos(cos) * 180) / Math.PI;
  return {
    tiltAngleDeg,
    thresholdDeg: threshold,
    released: tiltAngleDeg > threshold,
  };
};

// How much of a gravity-induced moment maps onto a joint's rotation axis.
// 1 for an axis perpendicular to gravity (e.g. [0,1,0]), 0 for one parallel
// to gravity (e.g. [0,0,1] turret). Used to keep the static-pose torque
// budget honest when joint axes are not all horizontal.
export const gravityAxisFactor = (axis: [number, number, number]): number => {
  const horiz = Math.hypot(axis[0], axis[1]);
  const total = Math.hypot(axis[0], axis[1], axis[2]);
  return total > 0 ? horiz / total : 0;
};

// Center of the magnet pocket / visualization within a box link's local
// frame. Positioned just back from the tip so the pocket fits fully inside
// the link in X, with the magnet's bottom face flush with the link's
// bottom face. Returns null if the link is not a magnet-bearing box.
export const magnetCenterInLink = (
  link: Link,
  magnet: Magnet,
): [number, number, number] | null => {
  if (link.shape !== 'box') return null;
  if (!link.endEffector || link.endEffector.type !== 'magnet') return null;
  const tip = link.dimensions.length;
  const t = link.dimensions.thickness;
  const r = magnet.diameterMm / 2;
  // Inset by radius + 1mm from the tip; clamp so it stays at least r+1 from
  // the origin in case the user shrinks the link below the magnet diameter.
  const x = Math.max(r + 1, tip - r - 1);
  return [x, 0, -t / 2 + magnet.thicknessMm / 2];
};

// Map an axis-aligned joint axis to Three.js Euler angles (radians, XYZ
// order) such that the servo's local +Z (shaft) lands on that axis.
export const eulerForAxisRad = (
  axis: readonly [number, number, number],
): [number, number, number] => {
  const [x, y, z] = axis;
  const H = Math.PI / 2;
  if (z > 0.99) return [0, 0, 0];
  if (z < -0.99) return [Math.PI, 0, 0];
  if (y > 0.99) return [-H, 0, 0];
  if (y < -0.99) return [H, 0, 0];
  if (x > 0.99) return [0, H, 0];
  if (x < -0.99) return [0, -H, 0];
  return [0, 0, 0];
};
