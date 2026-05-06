import { useArmStore } from '../store/armStore';
import { buildUrdf } from '../lib/urdf';
import { downloadText } from '../lib/download';

export function ExportPanel() {
  const template = useArmStore((s) => s.template);
  const servos = useArmStore((s) => s.servos);

  const handleUrdf = () => {
    const xml = buildUrdf(template, servos);
    downloadText(xml, `${template.id}.urdf`, 'application/xml');
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>エクスポート</h2>
      </div>
      <div className="panel-body export-body">
        <button type="button" className="btn-primary" onClick={handleUrdf}>
          URDF をダウンロード
        </button>
      </div>
    </section>
  );
}
