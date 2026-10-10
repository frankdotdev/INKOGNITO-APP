# Design system
- Dark only, seven themes via semantic tokens (`packages/core/src/theme`). Components never use raw hex.
- Default: Obsidian. Red appears only where it matters: primary action, selected state, Echo, warnings.
- One icon set (Lucide). No emoji icons, no profile photos, no follower counts, no fake stats.
- Content is the hero. Identity is a small abstract mark plus a contextual name.
- Touch targets >= 44px. Respect reduced motion. Bottom sheets for contextual actions on mobile.
- Brand language ("Release", "Echo", "Whisper") used sparingly; buttons stay plain and clear.
