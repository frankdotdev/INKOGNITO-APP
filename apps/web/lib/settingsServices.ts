import type { BlockService, DataService } from '@inkognito/core';
import { rpc } from './postService';
export const blockService: BlockService = {
  async block(t) { await rpc('block_author', { p_type: t.type, p_id: t.id }); },
  async list() { const rows = await rpc<any[]>('list_blocked'); return rows.map(r => ({ id: r.id, label: r.label, blockedAt: r.created_at })); },
  async unblock(id) { await rpc('unblock', { p_id: id }); },
};
export const dataService: DataService = { async deleteMyContent() { await rpc('delete_my_content'); } };
