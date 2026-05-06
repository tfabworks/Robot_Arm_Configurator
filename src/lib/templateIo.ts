import type { ArmTemplate, Joint, Link } from '../types/arm';

export class TemplateValidationError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const validateLink = (raw: unknown, idx: number): Link => {
  if (!isObj(raw)) {
    throw new TemplateValidationError(`links[${idx}] is not an object`);
  }
  if (typeof raw.id !== 'string') {
    throw new TemplateValidationError(`links[${idx}].id missing`);
  }
  if (raw.shape !== 'box' && raw.shape !== 'cylinder') {
    throw new TemplateValidationError(`links[${idx}].shape invalid`);
  }
  if (!isObj(raw.dimensions)) {
    throw new TemplateValidationError(`links[${idx}].dimensions missing`);
  }
  const d = raw.dimensions;
  if (raw.shape === 'box') {
    if (
      typeof d.length !== 'number' ||
      typeof d.width !== 'number' ||
      typeof d.thickness !== 'number'
    ) {
      throw new TemplateValidationError(
        `links[${idx}].dimensions: box needs {length,width,thickness}`,
      );
    }
  } else {
    if (typeof d.diameter !== 'number' || typeof d.length !== 'number') {
      throw new TemplateValidationError(
        `links[${idx}].dimensions: cylinder needs {diameter,length}`,
      );
    }
  }
  return raw as unknown as Link;
};

const validateJoint = (
  raw: unknown,
  idx: number,
  linkIds: Set<string>,
): Joint => {
  if (!isObj(raw)) {
    throw new TemplateValidationError(`joints[${idx}] is not an object`);
  }
  if (typeof raw.id !== 'string') {
    throw new TemplateValidationError(`joints[${idx}].id missing`);
  }
  if (raw.type !== 'revolute' && raw.type !== 'continuous' && raw.type !== 'fixed') {
    throw new TemplateValidationError(`joints[${idx}].type invalid`);
  }
  if (typeof raw.parent !== 'string' || !linkIds.has(raw.parent)) {
    throw new TemplateValidationError(`joints[${idx}].parent unknown`);
  }
  if (typeof raw.child !== 'string' || !linkIds.has(raw.child)) {
    throw new TemplateValidationError(`joints[${idx}].child unknown`);
  }
  if (!isObj(raw.origin) || !Array.isArray(raw.origin.xyz) || !Array.isArray(raw.origin.rpy)) {
    throw new TemplateValidationError(`joints[${idx}].origin invalid`);
  }
  if (!Array.isArray(raw.axis) || raw.axis.length !== 3) {
    throw new TemplateValidationError(`joints[${idx}].axis invalid`);
  }
  return raw as unknown as Joint;
};

export const parseTemplate = (text: string): ArmTemplate => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new TemplateValidationError(
      `JSON のパースに失敗: ${(e as Error).message}`,
    );
  }
  if (!isObj(raw)) {
    throw new TemplateValidationError('テンプレートはオブジェクトである必要があります');
  }
  if (typeof raw.version !== 'string') {
    throw new TemplateValidationError('version フィールドが必要です');
  }
  if (typeof raw.id !== 'string') {
    throw new TemplateValidationError('id フィールドが必要です');
  }
  if (typeof raw.rootLink !== 'string') {
    throw new TemplateValidationError('rootLink フィールドが必要です');
  }
  if (!Array.isArray(raw.links) || raw.links.length === 0) {
    throw new TemplateValidationError('links 配列が必要です');
  }
  if (!Array.isArray(raw.joints)) {
    throw new TemplateValidationError('joints 配列が必要です');
  }
  const links = raw.links.map((l, i) => validateLink(l, i));
  const linkIds = new Set(links.map((l) => l.id));
  if (!linkIds.has(raw.rootLink)) {
    throw new TemplateValidationError(`rootLink "${raw.rootLink}" が links に存在しません`);
  }
  raw.joints.map((j, i) => validateJoint(j, i, linkIds));
  return raw as unknown as ArmTemplate;
};

export const serializeTemplate = (template: ArmTemplate): string =>
  JSON.stringify(template, null, 2);
