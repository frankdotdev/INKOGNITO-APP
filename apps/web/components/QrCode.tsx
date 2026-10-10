'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
export function QrCode({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(value, { margin: 2, width: 260, color: { dark: '#000000', light: '#ffffff' } }).then(setSrc); }, [value]);
  return src ? <img src={src} width={260} height={260} alt={label} style={{ borderRadius: 12, background: '#fff' }} /> : <div className="skel" style={{ width: 260, height: 260 }} />;
}
