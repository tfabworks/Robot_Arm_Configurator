export type Vec3 = [number, number, number];

export interface Range {
  min: number;
  max: number;
}

export interface BoxDimensions {
  length: number;
  width: number;
  thickness: number;
}

export interface CylinderDimensions {
  diameter: number;
  length: number;
}

export interface BoxConstraints {
  length?: Range;
  width?: Range;
  thickness?: Range;
}

export interface CylinderConstraints {
  diameter?: Range;
  length?: Range;
}

export interface EndEffector {
  type: 'magnet';
  ref: string;
  mountPosition: 'tip';
  orientation: 'down' | 'up' | 'forward';
  fitTolerance?: number;
  // Tilt threshold in degrees from gravity-down. When the magnet face tilts
  // beyond this angle, a passive gravity-actuated separator is assumed to
  // slide between the magnet and the held clip, releasing it.
  releaseAngleDeg?: number;
}

export interface BoxLink {
  id: string;
  shape: 'box';
  dimensions: BoxDimensions;
  color?: string;
  constraints?: BoxConstraints;
  endEffector?: EndEffector;
  notes?: string;
}

export interface CylinderLink {
  id: string;
  shape: 'cylinder';
  dimensions: CylinderDimensions;
  color?: string;
  constraints?: CylinderConstraints;
  endEffector?: EndEffector;
  notes?: string;
}

export type Link = BoxLink | CylinderLink;

export type JointType = 'revolute' | 'continuous' | 'fixed';

export interface Joint {
  id: string;
  type: JointType;
  parent: string;
  child: string;
  origin: { xyz: Vec3; rpy: Vec3 };
  axis: Vec3;
  limit?: { lower: number; upper: number };
  home?: number;
  servo?: string;
}

export interface ArmTemplate {
  version: string;
  id: string;
  name: string;
  description?: string;
  rootLink: string;
  units: { length: string; angle: string; mass?: string };
  axisConvention?: { linkLocal: string; world: string };
  links: Link[];
  joints: Joint[];
  servos: Record<string, { ref: string }>;
  magnetOptions?: string[];
  manufacturing?: {
    material?: string;
    wallMinMm?: number;
    servoHoleClearanceMm?: number;
    magnetHoleClearanceMm?: number;
  };
}

export interface Servo {
  id: string;
  name: string;
  manufacturer: string;
  controlType: 'positional' | 'continuous';
  voltage: { min: number; max: number; nominal: number };
  torqueKgcm: number;
  stallCurrentA: number;
  noLoadCurrentA?: number;
  speedSecPer60deg: number;
  weightG: number;
  dimensions: { x: number; y: number; z: number };
  horn: { type: string; shaftDiameter: number; teeth?: number };
  mountingHoles: Array<{ x: number; y: number; z: number; diameter: number }>;
  shaft: { x: number; y: number; z: number };
  operatingRangeDeg?: { lower: number; upper: number };
  notes?: string;
}

export interface Magnet {
  id: string;
  name: string;
  shape: 'cylinder';
  diameterMm: number;
  thicknessMm: number;
  grade: string;
  pullForceKg: number;
  weightG: number;
}

export type ServoDB = Record<string, Servo>;
export type MagnetDB = Record<string, Magnet>;
