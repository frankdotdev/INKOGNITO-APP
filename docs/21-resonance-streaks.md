# Resonance and streaks
Both are private to the person. Nobody else sees them, and nothing in the app compares people.
- **Resonance** grows when others react to (+1), comment on (+2) or Echo (+3) what you wrote. Anti-farming: no points from yourself, one award per person per item (toggling a reaction doesn't re-award), at most 5 points a day from one person to another and 50 a day to one person, nothing from banned, suspended or high-risk identities. Levels (New here, Finding your voice, A regular, Trusted) at 20, 100 and 300 points also raise the internal `trust_level` the admin app shows.
- **Streaks** count consecutive days (UTC) in which you wrote something (a post, comment, Echo or Whisper). Opening the app earns nothing. A lapsed streak shows as 0 and restarts at 1. You can hide it. No notification mentions it.
- **Where:** a quiet card at the top of My Inkognito. `my_standing()` returns only the caller's own numbers.
- **Tested:** SQL suite (all rules above, including date handling for streaks).
