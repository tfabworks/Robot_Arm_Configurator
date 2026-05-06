import { useArmStore } from '../store/armStore';

export function JointSliders() {
  const template = useArmStore((s) => s.template);
  const angles = useArmStore((s) => s.jointAngles);
  const setJointAngle = useArmStore((s) => s.setJointAngle);
  const resetToHome = useArmStore((s) => s.resetToHome);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>関節</h2>
        <button type="button" className="btn-ghost" onClick={resetToHome}>
          ホーム位置に戻す
        </button>
      </div>
      <div className="panel-body">
        {template.joints.map((j) => {
          const value = angles[j.id] ?? j.home ?? 0;
          const lower = j.limit?.lower ?? -180;
          const upper = j.limit?.upper ?? 180;
          return (
            <div key={j.id} className="slider-row">
              <div className="slider-label">
                <span className="slider-name">{j.id}</span>
                <span className="slider-value">{value.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min={lower}
                max={upper}
                step={1}
                value={value}
                onChange={(e) => setJointAngle(j.id, Number(e.target.value))}
              />
              <div className="slider-range">
                <span>{lower}°</span>
                <span>{upper}°</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
