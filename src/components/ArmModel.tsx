import { useMemo } from 'react';
import * as THREE from 'three';
import type {
  Link,
  Joint,
  ArmTemplate,
  MagnetDB,
  Magnet,
  Servo,
  ServoDB,
} from '../types/arm';
import { useArmStore } from '../store/armStore';
import {
  computeReleaseStatus,
  eulerForAxisRad,
  magnetCenterInLink,
} from '../lib/kinematics';
import { checkServoFit, checkMagnetFit } from '../lib/validation';

const FIT_COLOR = '#22c55e';
const OVERFLOW_COLOR = '#ef4444';
const OVERLAY_OPACITY = 0.45;

function LinkMesh({ link }: { link: Link }) {
  if (link.shape === 'cylinder') {
    const { diameter, length } = link.dimensions;
    return (
      <mesh position={[0, 0, length / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[diameter / 2, diameter / 2, length, 32]} />
        <meshStandardMaterial color={link.color ?? '#888888'} />
      </mesh>
    );
  }
  const { length, width, thickness } = link.dimensions;
  return (
    <mesh position={[length / 2, 0, 0]}>
      <boxGeometry args={[length, width, thickness]} />
      <meshStandardMaterial color={link.color ?? '#3b82f6'} />
    </mesh>
  );
}

function MagnetMarker({
  link,
  magnet,
  released,
}: {
  link: Link;
  magnet: Magnet;
  released: boolean;
}) {
  const center = magnetCenterInLink(link, magnet);
  if (!center) return null;
  if (link.shape !== 'box') return null;
  const [cx, cy, cz] = center;
  const t = link.dimensions.thickness;
  const { diameterMm, thicknessMm } = magnet;
  const color = released ? '#6b7280' : '#dc2626';
  return (
    <group>
      <mesh
        position={[cx, cy, cz]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry
          args={[diameterMm / 2, diameterMm / 2, thicknessMm, 24]}
        />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
      {!released && (
        <mesh
          position={[cx, cy, -t / 2 - 0.6]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <boxGeometry args={[14, 1.2, 6]} />
          <meshStandardMaterial color="#a1a1aa" metalness={0.4} roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}

// Translucent box marking where the servo body would sit relative to its
// parent link. The body is positioned in the parent's frame at the joint
// origin and oriented so the box's local +Z runs along the joint axis. The
// material is depth-test-disabled so the body stays visible even when
// inside the link mesh — a green ghost when it fits, red when it pokes
// past the link envelope.
function ServoBodyOverlay({
  servo,
  joint,
  fits,
}: {
  servo: Servo;
  joint: Joint;
  fits: boolean;
}) {
  const eu = eulerForAxisRad(joint.axis);
  const color = fits ? FIT_COLOR : OVERFLOW_COLOR;
  const { x, y, z } = servo.dimensions;
  return (
    <group position={joint.origin.xyz} rotation={joint.origin.rpy as [number, number, number]}>
      <group rotation={eu}>
        <mesh position={[0, 0, -z / 2]} renderOrder={2}>
          <boxGeometry args={[x, y, z]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={OVERLAY_OPACITY}
            depthTest={false}
          />
        </mesh>
      </group>
    </group>
  );
}

// Translucent cylinder showing the magnet pocket. Depth-test stays enabled
// here so the overlay only becomes visible when it pokes past the link
// envelope, leaving the actual magnet (and its hold/release color) free of
// occlusion when the pocket fits cleanly inside the link.
function MagnetPocketOverlay({
  link,
  magnet,
  fits,
}: {
  link: Link;
  magnet: Magnet;
  fits: boolean;
}) {
  const center = magnetCenterInLink(link, magnet);
  if (!center) return null;
  if (fits) return null;
  const [cx, cy, cz] = center;
  return (
    <mesh
      position={[cx, cy, cz]}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <cylinderGeometry
        args={[magnet.diameterMm / 2, magnet.diameterMm / 2, magnet.thicknessMm + 0.4, 32]}
      />
      <meshStandardMaterial
        color={OVERFLOW_COLOR}
        transparent
        opacity={OVERLAY_OPACITY}
      />
    </mesh>
  );
}

interface JointGroupProps {
  joint: Joint;
  angleDeg: number;
  children: React.ReactNode;
}

function JointGroup({ joint, angleDeg, children }: JointGroupProps) {
  const { xyz, rpy } = joint.origin;
  const quat = useMemo(() => {
    const rad = (angleDeg * Math.PI) / 180;
    const axisVec = new THREE.Vector3(...joint.axis).normalize();
    return new THREE.Quaternion().setFromAxisAngle(axisVec, rad);
  }, [angleDeg, joint.axis]);
  return (
    <group position={xyz} rotation={[rpy[0], rpy[1], rpy[2]]}>
      <group quaternion={quat}>{children}</group>
    </group>
  );
}

function resolveMagnet(link: Link, magnets: MagnetDB): Magnet | null {
  if (!link.endEffector || link.endEffector.type !== 'magnet') return null;
  const id = link.endEffector.ref.replace(/^magnet-db:/, '');
  return magnets[id] ?? null;
}

function resolveServo(
  joint: Joint,
  template: ArmTemplate,
  servos: ServoDB,
): Servo | null {
  const slot = joint.servo ? template.servos[joint.servo] : undefined;
  if (!slot) return null;
  const id = slot.ref.replace(/^servo-db:/, '');
  return servos[id] ?? null;
}

function buildLinkTree(
  template: ArmTemplate,
  jointAngles: Record<string, number>,
  servos: ServoDB,
  magnets: MagnetDB,
  linkId: string,
  magnetReleased: boolean,
): React.ReactNode {
  const link = template.links.find((l) => l.id === linkId);
  if (!link) return null;
  const childJoints = template.joints.filter((j) => j.parent === linkId);
  const magnet = resolveMagnet(link, magnets);
  return (
    <group key={linkId}>
      <LinkMesh link={link} />
      {magnet && (
        <MagnetMarker link={link} magnet={magnet} released={magnetReleased} />
      )}
      {magnet && (
        <MagnetPocketOverlay
          link={link}
          magnet={magnet}
          fits={checkMagnetFit(magnet, link)}
        />
      )}
      {childJoints.map((j) => {
        const servo = resolveServo(j, template, servos);
        if (!servo) return null;
        return (
          <ServoBodyOverlay
            key={`servo-${j.id}`}
            servo={servo}
            joint={j}
            fits={checkServoFit(servo, j, link)}
          />
        );
      })}
      {childJoints.map((j) => (
        <JointGroup key={j.id} joint={j} angleDeg={jointAngles[j.id] ?? 0}>
          {buildLinkTree(template, jointAngles, servos, magnets, j.child, magnetReleased)}
        </JointGroup>
      ))}
    </group>
  );
}

export function ArmModel() {
  const template = useArmStore((s) => s.template);
  const angles = useArmStore((s) => s.jointAngles);
  const servos = useArmStore((s) => s.servos);
  const magnets = useArmStore((s) => s.magnets);
  const release = computeReleaseStatus(template, angles);
  const released = release?.released ?? false;
  return (
    <>
      {buildLinkTree(
        template,
        angles,
        servos,
        magnets,
        template.rootLink,
        released,
      )}
    </>
  );
}
