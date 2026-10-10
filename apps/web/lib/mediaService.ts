import { supabase, ensureSession } from './supabase';
const MEDIA = process.env.NEXT_PUBLIC_MEDIA_URL?.replace(/\/$/, '');
export const mediaEnabled = !!MEDIA;
export type UploadedImage = { id: string; url: string; width: number; height: number; preview: string };
const MAX_BYTES = 1_800_000, MAX_SIDE = 1600;
/** Re-encodes in the browser: fixes rotation, limits size, and drops all metadata (location, camera info). */
export async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('unsupported');
  let bmp: ImageBitmap; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('unsupported'); }
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, side / Math.max(bmp.width, bmp.height)); const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('unsupported'); ctx.drawImage(bmp, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.58]) {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', q));
      if (blob && blob.type === 'image/webp' && blob.size <= MAX_BYTES) { bmp.close(); return { blob, width: w, height: h }; }
      const jpg = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', q));
      if (jpg && jpg.size <= MAX_BYTES) { bmp.close(); return { blob: jpg, width: w, height: h }; }
    }
    side = Math.round(side * 0.7);
  }
  bmp.close(); throw new Error('too_large');
}
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!MEDIA) throw new Error('disabled');
  const { blob, width, height } = await compressImage(file);
  await ensureSession();
  const { data } = await supabase.auth.getSession(); const token = data.session?.access_token; if (!token) throw new Error('auth');
  const r = await fetch(`${MEDIA}/upload`, { method: 'POST', body: blob, headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type, 'X-Width': String(width), 'X-Height': String(height) } });
  if (r.status === 422) throw new Error('rejected');
  if (r.status === 429) throw new Error('rate_limited');
  if (!r.ok) throw new Error('upload_failed');
  const j = (await r.json()) as { id: string; key: string };
  return { id: j.id, url: `${MEDIA}/m/${j.key}`, width, height, preview: URL.createObjectURL(blob) };
}
export const imageError = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  return m === 'unsupported' ? 'That file type is not supported. Use a JPEG, PNG or WebP image.' : m === 'too_large' ? 'That image is too large even after shrinking.' : m === 'rejected' ? "That image can't be used. It was stopped by our safety checks." : m === 'rate_limited' ? "You're uploading too fast. Try again later." : "Couldn't upload the image. Check your connection and try again.";
};
