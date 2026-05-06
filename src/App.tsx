import { ArmViewer } from './components/ArmViewer';
import { useArmStore } from './store/armStore';
import './App.css';

function App() {
  const template = useArmStore((s) => s.template);
  const angles = useArmStore((s) => s.jointAngles);

  return (
    <div className="app">
      <header className="app-header">
        <h1>{template.name}</h1>
        <span className="muted">{template.id} / v{template.version}</span>
      </header>
      <div className="viewer-wrap">
        <ArmViewer />
      </div>
      <footer className="app-footer">
        {template.joints.map((j) => (
          <span key={j.id} className="joint-readout">
            {j.id}: {(angles[j.id] ?? 0).toFixed(0)}°
          </span>
        ))}
      </footer>
    </div>
  );
}

export default App;
