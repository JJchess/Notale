/** Let the browser encode bytes without a synchronous JS binary-string loop. */
export function assetBase64(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.includes(',')) {
        reject(new Error('资源编码失败，请重试'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('资源读取失败，请重试'));
    reader.onabort = () => reject(new Error('资源读取已取消'));
    // Snapshot the byte view, including its offset, before asynchronous reading.
    reader.readAsDataURL(new Blob([new Uint8Array(bytes).buffer]));
  });
}
