'use client';
import { useState } from 'react';
import { dataService } from '../../../../lib/settingsServices';
export default function Privacy() {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const wipe = async () => {
    if (!confirm("Delete all your posts and comments, and remove your reactions, Echoes, saves, votes and sent Whispers? This can't be undone.")) return;
    setBusy(true); setMsg('');
    try { await dataService.deleteMyContent(); setMsg('Your content has been deleted.'); } catch { setMsg("Couldn't delete your content. Try again."); }
    setBusy(false);
  };
  return (<div className="prose"><h1 style={{ fontSize: 28, letterSpacing: '-.02em', color: 'var(--text-primary)' }}>Privacy and your data</h1>
    <p>Inkognito is designed to minimize identity data. You don't need a name, email address or phone number to take part. The full <a href="/legal/privacy" style={{ color: 'var(--accent)' }}>Privacy Policy</a> and <a href="/legal/terms" style={{ color: 'var(--accent)' }}>Terms of Service</a> apply.</p>
    <h2>What other people see</h2><p>A name that is generated for each thread, like "Quiet Static". The same person gets a different name in a different thread. Nobody sees a profile, follower count or photo.</p>
    <h2>What we keep</h2><p>Your posts and comments are stored against an internal anonymous identity so we can enforce the community rules and stop abuse. Other users never see it. Reports you send are kept for moderation.</p>
    <h2>Content that disappears</h2><p>Whispers are removed after 24 hours. Posts and comments you mark as fading are removed when they expire. Anyone could still have taken a screenshot before then, so don't share anything you'd be unsafe having copied.</p>
    <h2>Random chat</h2><p>Random chats aren't recorded and messages aren't stored. The last 30 messages are held only while the chat is open, so that if you report someone, moderators can see the context. They are erased when the chat ends. Reporting or blocking someone also stops you being matched with them again.</p>
    <h2>Images</h2><p>Location and camera details are removed from photos before they are uploaded. Images may be checked by an automated safety service before they appear, and a moderator may look at them. Images that are removed or expire are deleted from storage.</p>
    <h2>Private chats</h2><p>Starting a private chat needs Plus; anyone can reply. Messages are stored encrypted and deleted after 90 days, but they are not end-to-end encrypted: our servers can decrypt them. We only do that when you report a conversation, and then moderators see the last 20 messages. Reporting or blocking someone ends the chat for you.</p>
    <h2>AI Companion</h2><p>Your companion conversations are private to you: other people on Inkognito never see them. To write replies, your messages are sent to an AI service provider, so don't share anything you wouldn't want an AI provider to process. Conversations are stored encrypted, deleted after 90 days, and you can delete them any time from the AI Companion page. Deleting your identity deletes them too. If a message looks like distress or danger, we show helpline information, and we record only that this happened, never what you wrote.</p>
    <h2>Delete my content</h2><p>Deletes everything you have posted and removes your reactions, Echoes, saves, votes and sent Whispers. It doesn't remove your anonymous identity.</p>
    {msg && <p role="status" style={{ color: 'var(--text-primary)' }}>{msg}</p>}
    <button className="btn" style={{ background: 'var(--danger)' }} disabled={busy} onClick={wipe}>{busy ? 'Deleting…' : 'Delete my content'}</button></div>);
}
