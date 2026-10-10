import type { IdentitySummary, DeviceInfo, LinkOffer, LinkStatus, LinkResult, RecoverResult, BlockedIdentity, MyComment, ActivityItem, MyScope, Comment, FeedKind, Id, Mood, Page, Post, RandomMode, ReportCategory, Whisper, PublicIdentity } from '../types';

export interface IdentityService {
  ensureIdentity(): Promise<void>;
  summary(): Promise<IdentitySummary>;
  listDevices(): Promise<DeviceInfo[]>;
  revokeDevice(id: Id): Promise<void>;
  /** New device: create a one-time link code (shown as a QR/link, valid 5 minutes). */
  startLink(siteUrl: string): Promise<LinkOffer>;
  linkStatus(pairingId: Id): Promise<LinkStatus>;
  finishLink(offer: { pairingId: Id; code: string }): Promise<LinkResult>;
  /** Existing device: approve a new device's code. */
  approveLink(pairingId: Id, code: string): Promise<LinkResult>;
  /** Returns the recovery code. It is shown once and never stored in readable form. */
  createRecoveryCode(): Promise<string>;
  recover(code: string): Promise<RecoverResult>;
  purgeThisDevice(): Promise<void>;
  deleteIdentity(): Promise<void>;
}
export interface PostService {
  getFeed(kind: FeedKind, cursor?: string): Promise<Page<Post>>;
  getPost(id: Id): Promise<Post>;
  createPost(input: { body: string; category?: string; mood?: Mood; poll?: { question: string }; fadingHours?: number; commentsEnabled: boolean; allowSharing?: boolean; mediaIds?: Id[] }): Promise<{ id: Id; pendingReview: boolean }>;
  takeMeSomewhere(): Promise<Post>;
  search(q: string, cursor?: string): Promise<Page<Post>>;
  byCategory(category: string, cursor?: string): Promise<Page<Post>>;
  mine(scope: MyScope, cursor?: string): Promise<Page<Post>>;
  remove(id: Id): Promise<void>;
  setSharing(id: Id, on: boolean): Promise<void>;
}
export interface CommentService { list(postId: Id, cursor?: string): Promise<Page<Comment>>; reply(postId: Id, body: string, parentId?: Id, fading?: boolean): Promise<Id> }
export interface ReactionService { react(target: { type: 'post'|'comment'; id: Id }, kind: string): Promise<void>; echo(postId: Id, on: boolean, commentary?: string): Promise<void>; bookmark(postId: Id, on: boolean): Promise<void>; vote(postId: Id, option: 0|1): Promise<{ myVote?: 0|1; votes?: [number, number] }> }
export interface MessageService { sendWhisper(postId: Id, body: string): Promise<void>; listWhispers(): Promise<Page<Whisper>> }
export interface RandomService { join(mode: RandomMode): Promise<{ sessionId: Id; roomToken: string; expiresAt: string }>; next(sessionId: Id): Promise<void>; leave(sessionId: Id): Promise<void>; report(sessionId: Id, category: ReportCategory): Promise<void> }
export interface AiService { send(sessionId: Id | null, text: string, mode?: 'talk'|'vent'|'think'|'journal'|'perspective'|'calm'): Promise<{ sessionId: Id; reply: string; remaining: number }> }
export interface EntitlementService { has(feature: 'dm'|'claimedAlias'): Promise<boolean>; limit(feature: 'aiMessages'|'randomSessions'): Promise<number> }
export interface BillingService { plans(): Promise<{ id: string; price: string; currency: 'USD'|'NGN' }[]>; checkout(planId: string): Promise<{ url: string }> }
export interface ModerationService { report(target: { type: 'post'|'comment'|'whisper'; id: Id }, category: ReportCategory, description?: string): Promise<void> }
export interface ActivityService { myComments(cursor?: string): Promise<Page<MyComment>>; activity(cursor?: string): Promise<Page<ActivityItem>> }
export interface BlockService { block(target: { type: 'post'|'comment'|'whisper'; id: Id }): Promise<void>; list(): Promise<BlockedIdentity[]>; unblock(id: Id): Promise<void> }
export interface DataService { deleteMyContent(): Promise<void> }
