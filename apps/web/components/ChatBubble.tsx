export function ChatBubble({ mine, text }: { mine: boolean; text: string }) {
  return <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
    <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6, background: mine ? 'var(--accent)' : 'var(--surface-raised)', color: mine ? '#fff' : 'var(--text-primary)', lineHeight: 1.45, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{text}</div></div>;
}
