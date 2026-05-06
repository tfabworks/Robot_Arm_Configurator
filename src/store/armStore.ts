import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ArmTemplate, ServoDB, MagnetDB, Link } from '../types/arm';
import magnetArmTemplate from '../templates/magnet-arm.json';
import servosData from '../data/servos.json';
import magnetsData from '../data/magnets.json';

export type BoxDimensionKey = 'length' | 'width' | 'thickness';
export type CylinderDimensionKey = 'diameter' | 'length';
export type DimensionKey = BoxDimensionKey | CylinderDimensionKey;

interface ArmState {
  template: ArmTemplate;
  servos: ServoDB;
  magnets: MagnetDB;
  jointAngles: Record<string, number>;
  setJointAngle: (jointId: string, angleDeg: number) => void;
  resetToHome: () => void;
  setLinkDimension: (linkId: string, key: DimensionKey, value: number) => void;
  resetTemplate: () => void;
  loadTemplate: (template: ArmTemplate) => void;
}

const cloneTemplate = (t: ArmTemplate): ArmTemplate =>
  JSON.parse(JSON.stringify(t)) as ArmTemplate;

const initialAngles = (template: ArmTemplate): Record<string, number> => {
  const angles: Record<string, number> = {};
  for (const j of template.joints) {
    angles[j.id] = j.home ?? 0;
  }
  return angles;
};

const baseTemplate = magnetArmTemplate as unknown as ArmTemplate;

// Convention: child-joint origin sits at the "tip" of its parent link along
// the parent's longitudinal axis. Box parents extend along local +X; cylinder
// parents extend along local +Z.
const tipOffsetForParent = (link: Link): [number, number, number] => {
  if (link.shape === 'cylinder') return [0, 0, link.dimensions.length];
  return [link.dimensions.length, 0, 0];
};

const syncJointOriginsFromParent = (template: ArmTemplate, parentId: string) => {
  const parent = template.links.find((l) => l.id === parentId);
  if (!parent) return;
  const tip = tipOffsetForParent(parent);
  for (const joint of template.joints) {
    if (joint.parent === parentId) {
      joint.origin.xyz = tip;
    }
  }
};

export const useArmStore = create<ArmState>()(
  persist(
    (set) => ({
      template: cloneTemplate(baseTemplate),
      servos: servosData as unknown as ServoDB,
      magnets: magnetsData as unknown as MagnetDB,
      jointAngles: initialAngles(baseTemplate),
      setJointAngle: (jointId, angleDeg) =>
        set((state) => ({
          jointAngles: { ...state.jointAngles, [jointId]: angleDeg },
        })),
      resetToHome: () =>
        set((state) => ({ jointAngles: initialAngles(state.template) })),
      setLinkDimension: (linkId, key, value) =>
        set((state) => {
          const next = cloneTemplate(state.template);
          const link = next.links.find((l) => l.id === linkId);
          if (!link) return {};
          if (link.shape === 'box') {
            if (key === 'length' || key === 'width' || key === 'thickness') {
              link.dimensions[key] = value;
            }
          } else {
            if (key === 'diameter' || key === 'length') {
              link.dimensions[key] = value;
            }
          }
          if (key === 'length') {
            syncJointOriginsFromParent(next, linkId);
          }
          return { template: next };
        }),
      resetTemplate: () =>
        set(() => {
          const next = cloneTemplate(baseTemplate);
          return { template: next, jointAngles: initialAngles(next) };
        }),
      loadTemplate: (template) =>
        set(() => {
          const next = cloneTemplate(template);
          return { template: next, jointAngles: initialAngles(next) };
        }),
    }),
    {
      name: 'robot-arm-cad',
      // Bumped to 2 when shoulder became a continuous Z-axis turret driven by
      // FS90R. Old persisted templates carry the FT90B revolute shoulder and
      // would render a broken arm — version mismatch drops them.
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Only the user-editable design state is persisted. Static DBs come
      // from imported JSON every load so updates ship via deploys.
      partialize: (state) => ({
        template: state.template,
        jointAngles: state.jointAngles,
      }),
    },
  ),
);
