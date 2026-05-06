import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { ArmModel } from './ArmModel';

export function ArmViewer() {
  return (
    <Canvas
      camera={{ position: [350, -300, 250], up: [0, 0, 1], fov: 45, near: 1, far: 5000 }}
      style={{ background: '#1a1a1a', width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[200, 200, 400]} intensity={1.2} />
      <directionalLight position={[-200, -100, 200]} intensity={0.4} />
      <Grid
        args={[600, 600]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#333333"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#666666"
        rotation={[Math.PI / 2, 0, 0]}
        infiniteGrid={false}
        fadeDistance={1500}
      />
      <ArmModel />
      <OrbitControls target={[60, 0, 60]} makeDefault />
    </Canvas>
  );
}
