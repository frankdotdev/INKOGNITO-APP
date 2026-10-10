const rules: [string, string][] = [
  ['Respect people', 'Disagree without attacking. No harassment, hate or bullying.'],
  ["Don't threaten", 'No threats of violence, and no encouraging anyone to hurt themselves.'],
  ["Don't exploit", 'No sexual content involving anyone without their consent, and no blackmail.'],
  ["Don't impersonate", 'Do not pretend to be another person or organization.'],
  ["Don't spam", 'No repeated posts, scams, or advertising.'],
  ["Don't share illegal material", 'Anything illegal to share is removed and may be reported to the authorities.'],
  ['Protect minors', 'No sexual or exploitative content involving anyone under 18. This is always removed.'],
];
export default function Rules() {
  return (<div className="prose"><h1 style={{ fontSize: 28, letterSpacing: '-.02em', color: 'var(--text-primary)' }}>Community rules</h1>
    <p>Anonymous doesn't mean anything goes. Say what you can't say elsewhere, honestly, without hurting others.</p>
    {rules.map(([t, d]) => <div key={t}><h2>{t}</h2><p>{d}</p></div>)}
    <p>See something that breaks these rules? Use Report on any post, comment or Whisper.</p></div>);
}
