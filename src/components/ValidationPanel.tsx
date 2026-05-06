import { useArmStore } from '../store/armStore';
import {
  computeValidation,
  SAFETY_FRACTION_PCT,
  type JointTorqueReport,
} from '../lib/validation';
import { computeReleaseStatus } from '../lib/kinematics';

const DEFAULT_SUPPLY_V = 5.0;

const levelClass = (level: JointTorqueReport['level']) =>
  level === 'over' ? 'bar over' : level === 'warn' ? 'bar warn' : 'bar ok';

const levelText = (level: JointTorqueReport['level']) =>
  level === 'over' ? 'トルク不足' : level === 'warn' ? '余裕少' : 'OK';

export function ValidationPanel() {
  const template = useArmStore((s) => s.template);
  const servos = useArmStore((s) => s.servos);
  const magnets = useArmStore((s) => s.magnets);
  const angles = useArmStore((s) => s.jointAngles);

  const report = computeValidation(template, servos, magnets, DEFAULT_SUPPLY_V);
  const release = computeReleaseStatus(template, angles);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>検証</h2>
        <span className="muted">
          安全率 {SAFETY_FRACTION_PCT}% / 想定積載 {report.payloadG}g
        </span>
      </div>
      <div className="panel-body">
        <div className="validation-meta">
          <div>
            総重量: <strong>{report.totalMassG.toFixed(1)} g</strong>
          </div>
          {report.voltage && (
            <div>
              電源: {report.voltage.supplyV.toFixed(1)} V (許容{' '}
              {report.voltage.minV}–{report.voltage.maxV} V){' '}
              <span className={report.voltage.inRange ? 'ok-text' : 'over-text'}>
                {report.voltage.inRange ? 'OK' : '範囲外'}
              </span>
            </div>
          )}
          {release && (
            <div>
              磁石: 傾き {release.tiltAngleDeg.toFixed(0)}° / しきい値{' '}
              {release.thresholdDeg}°{' '}
              <span className={release.released ? 'over-text' : 'ok-text'}>
                {release.released ? 'リリース' : '保持中'}
              </span>
            </div>
          )}
        </div>
        {report.manufacturing.length > 0 && (
          <div className="mfg-issues">
            <div className="mfg-head">取付け制約:</div>
            {report.manufacturing.map((iss, i) => (
              <div key={i} className="mfg-issue">
                <span className="mfg-link">{iss.linkId}</span>: {iss.message}
              </div>
            ))}
          </div>
        )}
        {report.joints.map((r) => {
          const pct = Math.min(100, r.utilization * 100);
          return (
            <div key={r.joint.id} className="torque-row">
              <div className="torque-label">
                <span className="slider-name">{r.joint.id}</span>
                <span className="slider-value">
                  {r.requiredKgcm.toFixed(2)} / {r.maxKgcm.toFixed(2)} kg·cm
                </span>
              </div>
              <div className="bar-track">
                <div
                  className={levelClass(r.level)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="torque-foot">
                <span className={`status ${r.level}`}>{levelText(r.level)}</span>
                <span className="muted">{(r.utilization * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
