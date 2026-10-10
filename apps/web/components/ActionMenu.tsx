'use client';
import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { ReportCategory } from '@inkognito/core';
import { friendlyError } from '../lib/postService';
const cats: [ReportCategory, string][] = [['harassment','Harassment'],['threat','Threat'],['sexual','Sexual content'],['childSafety','Child safety'],['spam','Spam'],['scam','Scam'],['hate','Hate or abuse'],['selfHarm','Someone may be at risk'],['illegal','Illegal content'],['other','Something else']];
export function ActionMenu({ mine, onDelete, onReport }: { mine: boolean; onDelete?: () => Promise<void>; onReport: (c: ReportCategory) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<'menu' | 'report' | 'done'>('menu'); const [err, setErr] = useState('');
  const run = async (f: () => Promise<void>, next?: 'done') => { setErr(''); try { await f(); if (next) setStep(next); else ref.current?.close(); } catch (e) { setErr(friendlyError(e)); } };
  return (<>
    <button className="act" aria-label="More actions" onClick={() => { setStep(mine ? 'menu' : 'report'); setErr(''); ref.current?.showModal(); }}><MoreHorizontal size={20} /></button>
    <dialog ref={ref} className="sheet" onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      {step === 'done' ? <><h2>Thanks. We'll review it.</h2><button className="sheetbtn" onClick={() => ref.current?.close()}>Close</button></>
        : step === 'menu' ? <><button className="sheetbtn" onClick={() => run(onDelete!)}>Let it disappear</button><button className="sheetbtn" onClick={() => ref.current?.close()}>Cancel</button></>
        : <><h2>Why are you reporting this?</h2>{cats.map(([c, l]) => <button key={c} className="sheetbtn" onClick={() => run(() => onReport(c), 'done')}>{l}</button>)}</>}
      {err && <p role="alert" style={{ color: 'var(--danger)', padding: 12 }}>{err}</p>}
    </dialog>
  </>);
}
