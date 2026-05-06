import { create } from 'zustand';
import type { ArmTemplate, ServoDB, MagnetDB } from '../types/arm';
import magnetArmTemplate from '../templates/magnet-arm.json';
import servosData from '../data/servos.json';
import magnetsData from '../data/magnets.json';

interface ArmState {
  template: ArmTemplate;
  servos: ServoDB;
  magnets: MagnetDB;
  jointAngles: Record<string, number>;
  setJointAngle: (jointId: string, angleDeg: number) => void;
  resetToHome: () => void;
}

const initialAngles = (template: ArmTemplate): Record<string, number> => {
  const angles: Record<string, number> = {};
  for (const j of template.joints) {
    angles[j.id] = j.home ?? 0;
  }
  return angles;
};

const initialTemplate = magnetArmTemplate as unknown as ArmTemplate;

export const useArmStore = create<ArmState>((set) => ({
  template: initialTemplate,
  servos: servosData as unknown as ServoDB,
  magnets: magnetsData as unknown as MagnetDB,
  jointAngles: initialAngles(initialTemplate),
  setJointAngle: (jointId, angleDeg) =>
    set((state) => ({
      jointAngles: { ...state.jointAngles, [jointId]: angleDeg },
    })),
  resetToHome: () =>
    set((state) => ({ jointAngles: initialAngles(state.template) })),
}));
