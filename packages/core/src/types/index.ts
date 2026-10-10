export type Id = string;
export type ContentStatus = 'active' | 'deleted' | 'moderated' | 'expired';
export type Mood = 'relieved'|'hopeful'|'lost'|'angry'|'peaceful'|'confused'|'heartbroken'|'excited'|'numb'|'grateful'|'anxious'|'proud'|'lonely'|'guilty'|'heavy';

/** What the UI sees of an author. Never contains the real identity id. */
export interface PublicIdentity { contextId: Id; name: string; mark: number; claimedAlias?: string }

export interface Post {
  id: Id; author: PublicIdentity; body: string; category?: string; mood?: Mood;
  media: { url: string; width: number; height: number }[];
  poll?: { question: string; options: [string,string]; votes?: [number,number]; myVote?: 0|1; expiresAt?: string };
  counts: { reactions: number; comments: number; echoes: number };
  mine: boolean; saved: boolean; reacted: boolean; echoed: boolean; shareable: boolean; status: ContentStatus; commentsEnabled: boolean; createdAt: string;
}
export interface Comment { id: Id; postId: Id; parentId?: Id; author: PublicIdentity; body: string; expiresAt?: string; status: ContentStatus; createdAt: string; mine: boolean }
export interface Whisper { mine: boolean; id: Id; postId: Id; from: PublicIdentity; body: string; expiresAt?: string; createdAt: string }
export type FeedKind = 'forYou'|'fresh'|'trending'|'questions'|'polls'|'deep'|'echoed'|'random';
export type RandomMode = 'text'|'audio'|'video';
export type ReportCategory = 'harassment'|'threat'|'sexual'|'childSafety'|'spam'|'scam'|'hate'|'selfHarm'|'illegal'|'other';
export interface Page<T> { items: T[]; cursor?: string }
export interface MyComment { id: Id; postId: Id; body: string; postExcerpt?: string; expiresAt?: string; createdAt: string }
export type ActivityKind = 'comment' | 'reaction' | 'echo' | 'whisper';
export interface ActivityItem { kind: ActivityKind; postId: Id; postExcerpt: string; actorName?: string; createdAt: string }
export type MyScope = 'mine' | 'saved' | 'echoes';
export interface BlockedIdentity { id: Id; label: string; blockedAt: string }
export interface IdentitySummary { createdAt: string; deviceCount: number; hasRecovery: boolean; recoveryCreatedAt?: string }
export interface DeviceInfo { id: Id; label: string; platform?: string; createdAt: string; lastSeenAt: string; current: boolean }
export interface LinkOffer { pairingId: Id; code: string; url: string; expiresAt: string }
export type LinkStatus = 'pending' | 'approved' | 'completed' | 'expired' | 'invalid';
export type LinkResult = 'ok' | 'invalid' | 'expired' | 'device_has_content';
export type RecoverResult = 'ok' | 'invalid' | 'rate_limited' | 'device_has_content';
