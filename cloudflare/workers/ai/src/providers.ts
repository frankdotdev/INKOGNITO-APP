import type { Env } from './env';
export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
export interface Result { text: string; tokensIn: number; tokensOut: number; provider: 'groq' | 'gemini' }
export class ProviderError extends Error { constructor(msg: string, public started: boolean) { super(msg); } }
const MAX_TOKENS = 600, TIMEOUT_MS = 25_000;
const est = (s: string) => Math.ceil(s.length / 4);

/** Groq (OpenAI-compatible) with streaming. Throws ProviderError(started=false) if nothing was sent to the user yet. */
export async function streamGroq(env: Env, msgs: Msg[], onToken: (t: string) => Promise<void>): Promise<Result> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let started = false, text = '', usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
  try {
    const candidateModels = Array.from(new Set([
      env.AI_GROQ_MODEL,
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'allam-2-7b'
    ].filter(Boolean)));
    let res: Response | null = null;
    let lastErrTxt = '';
    for (const m of candidateModels) {
      const r = await fetch(`${env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1'}/chat/completions`, {
        method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, messages: msgs, stream: true, stream_options: { include_usage: true }, max_tokens: MAX_TOKENS, temperature: 0.7 }),
      });
      if (r.ok) { res = r; break; }
      lastErrTxt = await r.text().catch(() => '');
      if (r.status !== 404) {
        throw new ProviderError(`groq ${r.status}: ${lastErrTxt.slice(0, 140)}`, false);
      }
    }
    if (!res || !res.body) {
      throw new ProviderError(`groq 404: ${lastErrTxt.slice(0, 140) || 'no model accessible with key'}`, false);
    }
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim(); if (data === '[DONE]') continue;
        let j: any; try { j = JSON.parse(data); } catch { continue; }
        const t: string | undefined = j.choices?.[0]?.delta?.content;
        if (t) { started = true; text += t; await onToken(t); }
        usage = j.usage ?? j.x_groq?.usage ?? usage;
      }
    }
    if (!text) throw new ProviderError('groq empty', false);
    return { text, tokensIn: usage?.prompt_tokens ?? est(msgs.map(m => m.content).join(' ')), tokensOut: usage?.completion_tokens ?? est(text), provider: 'groq' };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (started) return { text, tokensIn: est(msgs.map(m => m.content).join(' ')), tokensOut: est(text), provider: 'groq' };
    throw new ProviderError('groq failed', false);
  } finally { clearTimeout(timer); }
}

/** Gemini fallback (not streamed). Sampling parameters are omitted because Google has deprecated them. */
export async function geminiComplete(env: Env, msgs: Msg[]): Promise<Result> {
  const system = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const cleanModel = (env.AI_GEMINI_MODEL || 'gemini-1.5-flash').replace(/^models\//, '');
  const base = env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com';

  const tryCall = async (version: 'v1beta' | 'v1', m: string) => {
    return fetch(`${base}/${version}/models/${m}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: MAX_TOKENS } }),
    });
  };

  try {
    let res = await tryCall('v1beta', cleanModel);
    if (!res.ok) res = await tryCall('v1beta', 'gemini-2.5-flash');
    if (!res.ok) res = await tryCall('v1beta', 'gemini-2.5-flash-lite');
    if (!res.ok) res = await tryCall('v1beta', 'gemini-flash-latest');
    if (!res.ok) res = await tryCall('v1', cleanModel);
    if (!res.ok) res = await tryCall('v1', 'gemini-2.5-flash');

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new ProviderError(`gemini ${res.status}: ${txt.slice(0, 160)}`, false);
    }
    const j: any = await res.json();
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
    if (!text) throw new ProviderError('gemini empty', false);
    return { text, tokensIn: j.usageMetadata?.promptTokenCount ?? est(system), tokensOut: j.usageMetadata?.candidatesTokenCount ?? est(text), provider: 'gemini' };
  } catch (e) { throw e instanceof ProviderError ? e : new ProviderError('gemini failed', false); } finally { clearTimeout(timer); }
}
