import { zipSync, strToU8 } from 'fflate';
import { useArmStore } from '../store/armStore';
import { buildUrdf } from '../lib/urdf';
import { buildStl } from '../lib/stl';
import { downloadBlob, downloadText } from '../lib/download';

export function ExportPanel() {
  const template = useArmStore((s) => s.template);
  const servos = useArmStore((s) => s.servos);

  const handleUrdf = () => {
    const xml = buildUrdf(template, servos);
    downloadText(xml, `${template.id}.urdf`, 'application/xml');
  };

  const handleStlZip = () => {
    const files: Record<string, Uint8Array> = {};
    files[`${template.id}.urdf`] = strToU8(buildUrdf(template, servos));
    for (const link of template.links) {
      files[`stl/${link.id}.stl`] = strToU8(buildStl(link));
    }
    const zipped = zipSync(files);
    downloadBlob(
      new Blob([zipped as BlobPart], { type: 'application/zip' }),
      `${template.id}.zip`,
    );
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
        <button type="button" className="btn-primary" onClick={handleStlZip}>
          STL + URDF を ZIP でダウンロード
        </button>
      </div>
    </section>
  );
}
