export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const downloadText = (
  text: string,
  filename: string,
  mime = 'text/plain',
): void => {
  downloadBlob(new Blob([text], { type: mime }), filename);
};
