import { useMemo } from 'react';
import * as THREE from 'three';
import type { Link, Joint, ArmTemplate, MagnetDB, Magnet } from '../types/arm';
import { useArmStore } from '../store/armStore';

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

function MagnetMarker({ link, magnet }: { link: Link; magnet: Magnet }) {
  if (link.shape !== 'box') return null;
  if (!link.endEffector || link.endEffector.type !== 'magnet') return null;
  const { length, thickness } = link.dimensions;
  const { diameterMm, thicknessMm } = magnet;
  return (
    <mesh
      position={[length, 0, -(thickness / 2 + thicknessMm / 2)]}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <cylinderGeometry args={[diameterMm / 2, diameterMm / 2, thicknessMm, 24]} />
      <meshStandardMaterial color="#dc2626" metalness={0.6} roughness={0.3} />
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

function buildLinkTree(
  template: ArmTemplate,
  jointAngles: Record<string, number>,
  magnets: MagnetDB,
  linkId: string,
): React.ReactNode {
  const link = template.links.find((l) => l.id === linkId);
  if (!link) return null;
  const childJoints = template.joints.filter((j) => j.parent === linkId);
  const magnet = resolveMagnet(link, magnets);
  return (
    <group key={linkId}>
      <LinkMesh link={link} />
      {magnet && <MagnetMarker link={link} magnet={magnet} />}
      {childJoints.map((j) => (
        <JointGroup key={j.id} joint={j} angleDeg={jointAngles[j.id] ?? 0}>
          {buildLinkTree(template, jointAngles, magnets, j.child)}
        </JointGroup>
      ))}
    </group>
  );
}

export function ArmModel() {
  const template = useArmStore((s) => s.template);
  const angles = useArmStore((s) => s.jointAngles);
  const magnets = useArmStore((s) => s.magnets);
  return <>{buildLinkTree(template, angles, magnets, template.rootLink)}</>;
}
