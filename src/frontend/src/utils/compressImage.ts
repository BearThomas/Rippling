/**
 * 图片前端压缩（canvas）
 *
 * 头像上传前先压缩到 2MB 以内（后端上限），
 * 避免大文件直传 B2 被拒。
 */

/** 加载图片元素（用于 canvas 绘制） */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}

/** canvas 编码为 Blob */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片编码失败"))),
      "image/jpeg",
      quality
    );
  });
}

/**
 * 压缩图片到目标大小以内
 *
 * 策略：先按最长边缩放到 1600px，再逐步降低 JPEG 质量（0.9 → 0.3），
 * 仍超限时按 0.75 倍继续缩小尺寸，最多循环 6 轮。
 * 原图已小于上限时原样返回（保留原格式）。
 *
 * @param file     原始图片文件
 * @param maxBytes 目标大小上限（默认 2MB）
 */
export async function compressImage(
  file: File,
  maxBytes = 2 * 1024 * 1024
): Promise<File> {
  if (file.size <= maxBytes) return file;

  const img = await loadImage(file);

  // 最长边上限：头像场景 1600px 足够清晰
  const maxSide = 1600;
  let scale = Math.min(1, maxSide / Math.max(img.width, img.height));

  for (let round = 0; round < 6; round++) {
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前环境不支持 canvas");

    // 白底填充：JPEG 不支持透明，避免透明区域变黑
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // 本轮内逐步降质量
    for (const quality of [0.9, 0.7, 0.5, 0.3]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= maxBytes) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
        });
      }
    }

    // 质量已到底仍超限 → 缩小尺寸再来一轮
    scale *= 0.75;
  }

  throw new Error("图片压缩失败，请换一张试试");
}
