import { useRef, useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import { useArmStore } from '../store/armStore';
import { buildUrdf } from '../lib/urdf';
import { buildStl } from '../lib/stl';
import { downloadBlob, downloadText } from '../lib/download';
import {
  parseTemplate,
  serializeTemplate,
  TemplateValidationError,
} from '../lib/templateIo';

export function ExportPanel() {
  const template = useArmStore((s) => s.template);
  const servos = useArmStore((s) => s.servos);
  const loadTemplate = useArmStore((s) => s.loadTemplate);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleUrdf = () => {
    const xml = buildUrdf(template, servos);
    downloadText(xml, `${template.id}.urdf`, 'application/xml');
  };

  const handleJson = () => {
    const text = serializeTemplate(template);
    downloadText(text, `${template.id}.json`, 'application/json');
  };

  const handleStlZip = () => {
    const files: Record<string, Uint8Array> = {};
    files[`${template.id}.urdf`] = strToU8(buildUrdf(template, servos));
    files[`${template.id}.json`] = strToU8(serializeTemplate(template));
    for (const link of template.links) {
      files[`stl/${link.id}.stl`] = strToU8(buildStl(link));
    }
    const zipped = zipSync(files);
    downloadBlob(
      new Blob([zipped as BlobPart], { type: 'application/zip' }),
      `${template.id}.zip`,
    );
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseTemplate(text);
      loadTemplate(parsed);
      setImportError(null);
    } catch (err) {
      const msg =
        err instanceof TemplateValidationError
          ? err.message
          : `読み込み失敗: ${(err as Error).message}`;
      setImportError(msg);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>エクスポート / インポート</h2>
      </div>
      <div className="panel-body export-body">
        <button type="button" className="btn-primary" onClick={handleStlZip}>
          STL + URDF + JSON を ZIP でダウンロード
        </button>
        <button type="button" className="btn-ghost" onClick={handleUrdf}>
          URDF のみダウンロード
        </button>
        <button type="button" className="btn-ghost" onClick={handleJson}>
          JSON のみダウンロード
        </button>
        <button type="button" className="btn-ghost" onClick={handleImportClick}>
          JSON から読み込み
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        {importError && <div className="import-error">{importError}</div>}
      </div>
    </section>
  );
}
