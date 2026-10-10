import type { Safety } from '../lib/aiClient';
/** Fixed, human-written help text. Shown whenever a message looks like distress or danger, in addition to the AI's reply. */
export function CrisisCard({ kind }: { kind: NonNullable<Safety> }) {
  const link = { style: { color: 'var(--accent)', textDecoration: 'underline' }, target: '_blank', rel: 'noopener noreferrer' } as const;
  return (<div className="card" role="note" style={{ borderColor: 'var(--accent)' }}>
    <div className="name">You're not alone</div>
    <p style={{ lineHeight: 1.5, marginTop: 8 }}>{kind === 'self_harm' ? 'If you are in danger or thinking about ending your life, please contact your local emergency services now.' : kind === 'abuse' ? 'If you are being hurt or you are afraid, please contact your local emergency services or a support service near you.' : 'If someone could be hurt, please contact your local emergency services now.'}
      {' '}In the United States and Canada you can call or text <a href="tel:988" {...link}>988</a>. In the United Kingdom, Samaritans is <a href="tel:116123" {...link}>116 123</a>. In Nigeria, contact <a href="https://www.mentallyaware.org" {...link}>Mentally Aware Nigeria</a> or local emergency services.
      {' '}You can find free, confidential helplines in your country at <a href="https://findahelpline.com" {...link}>findahelpline.com</a> or <a href="https://www.befrienders.org" {...link}>befrienders.org</a>. If you can, tell someone you trust.</p>
    <p className="meta" style={{ marginTop: 8 }}>The companion is an AI. It can't call anyone for you.</p></div>);
}
