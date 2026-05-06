import { useArmStore } from '../store/armStore';
import type { DimensionKey } from '../store/armStore';
import type { Link } from '../types/arm';

const LABELS: Record<DimensionKey, string> = {
  length: '長さ',
  width: '幅',
  thickness: '厚さ',
  diameter: '直径',
};

interface Field {
  key: DimensionKey;
  current: number;
  min: number;
  max: number;
}

const fieldsForLink = (link: Link): Field[] => {
  if (link.shape === 'cylinder') {
    const c = link.constraints ?? {};
    return [
      {
        key: 'diameter',
        current: link.dimensions.diameter,
        min: c.diameter?.min ?? link.dimensions.diameter * 0.6,
        max: c.diameter?.max ?? link.dimensions.diameter * 1.5,
      },
      {
        key: 'length',
        current: link.dimensions.length,
        min: c.length?.min ?? link.dimensions.length * 0.6,
        max: c.length?.max ?? link.dimensions.length * 1.5,
      },
    ];
  }
  const c = link.constraints ?? {};
  return [
    {
      key: 'length',
      current: link.dimensions.length,
      min: c.length?.min ?? link.dimensions.length * 0.6,
      max: c.length?.max ?? link.dimensions.length * 1.5,
    },
    {
      key: 'width',
      current: link.dimensions.width,
      min: c.width?.min ?? link.dimensions.width * 0.6,
      max: c.width?.max ?? link.dimensions.width * 1.5,
    },
    {
      key: 'thickness',
      current: link.dimensions.thickness,
      min: c.thickness?.min ?? link.dimensions.thickness * 0.6,
      max: c.thickness?.max ?? link.dimensions.thickness * 1.5,
    },
  ];
};

const linkLabel = (id: string): string => {
  if (id === 'base') return 'ベース';
  if (id === 'upper_arm') return '上腕';
  if (id === 'forearm') return '前腕';
  return id;
};

export function DimensionSliders() {
  const template = useArmStore((s) => s.template);
  const setLinkDimension = useArmStore((s) => s.setLinkDimension);
  const resetTemplate = useArmStore((s) => s.resetTemplate);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>寸法 (mm)</h2>
        <button type="button" className="btn-ghost" onClick={resetTemplate}>
          既定値に戻す
        </button>
      </div>
      <div className="panel-body">
        {template.links.map((link) => {
          const fields = fieldsForLink(link);
          return (
            <div key={link.id} className="link-block">
              <div className="link-name">{linkLabel(link.id)}</div>
              {fields.map((f) => (
                <div key={f.key} className="slider-row">
                  <div className="slider-label">
                    <span className="slider-name">{LABELS[f.key]}</span>
                    <span className="slider-value">{f.current.toFixed(0)}</span>
                  </div>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={1}
                    value={f.current}
                    onChange={(e) =>
                      setLinkDimension(link.id, f.key, Number(e.target.value))
                    }
                  />
                  <div className="slider-range">
                    <span>{f.min.toFixed(0)}</span>
                    <span>{f.max.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
