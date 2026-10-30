// 在浏览器里识别照片上的 6 位号码（不需要密钥，也不会把照片上传到任何服务器）。
// 识别组件（Tesseract）只在第一次使用时下载，之后浏览器会缓存。

type Worker = {
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  recognize: (img: Blob) => Promise<{ data: { text: string } }>;
};

let workerPromise: Promise<Worker> | null = null;

async function getWorker(onStatus: (s: string) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      onStatus('正在加载识别组件（第一次需要下载几兆，请稍等）…');
      const { createWorker } = await import('tesseract.js');
      const w = await createWorker('eng', 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') onStatus(`正在识别… ${Math.round(m.progress * 100)}%`);
        },
      });
      return w as unknown as Worker;
    })();
    workerPromise.catch(() => {
      workerPromise = null; // 加载失败后允许重试
    });
  }
  return workerPromise;
}

// 把照片缩放到合适大小、转成灰度并拉开对比度，提高数字识别率
async function preprocess(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const longSide = Math.max(bmp.width, bmp.height);
  const scale = longSide > 2400 ? 2400 / longSide : longSide < 1600 ? 1600 / longSide : 1;
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持图片处理');
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Array(256).fill(0) as number[];
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g]++;
  }
  // 取 2% ~ 98% 分位做对比度拉伸
  const total = w * h;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= total * 0.02) {
      lo = i;
      break;
    }
  }
  for (let acc = 0, i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= total * 0.02) {
      hi = i;
      break;
    }
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片处理失败'))), 'image/png'),
  );
}

// 从识别文字里取出所有"恰好6位"的数字
export function extractSixDigits(text: string): string[] {
  return (text.match(/\d+/g) ?? []).filter((x) => x.length === 6);
}

export async function recognizeTickets(file: File, onStatus: (s: string) => void): Promise<string[]> {
  const blob = await preprocess(file);
  const worker = await getWorker(onStatus);
  const found: string[] = [];
  // 用两种版面分析方式各识别一遍，合并结果，减少漏认
  for (const psm of ['11', '6']) {
    await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(blob);
    for (const n of extractSixDigits(data.text)) if (!found.includes(n)) found.push(n);
  }
  return found;
}
