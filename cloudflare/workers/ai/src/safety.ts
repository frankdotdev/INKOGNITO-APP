export type Crisis = 'self_harm' | 'violence' | 'abuse' | null;
// A cheap pre-check so help is shown immediately, in addition to the model's own judgement. Deliberately broad: a false alarm only adds a caring note.
const SELF_HARM = /\b(kill(ing)? myself|end(ing)? (my|it all)|end my life|take my own life|want to die|wanna die|wish i (was|were) dead|suicid\w*|don'?t want to (live|be here|exist)|no reason to live|better off (dead|without me)|(hurt|harm|cut|cutting) myself|self[- ]?harm|overdose on purpose)\b/i;
const VIOLENCE = /\b((going|want|plan(ning)?|about) to (kill|shoot|stab|hurt|murder) (him|her|them|my|someone|everyone|people)|i('| wi)ll kill (him|her|them|you)|bring a (gun|knife) to)\b/i;
const ABUSE = /\b((he|she|they|my \w+) (beats?|hits?|abuses?|molests?|rapes?|touches? me)\b|being (abused|beaten|molested|raped|trafficked)|i('| a)m (being )?(abused|assaulted)|was (raped|molested|assaulted))/i;
export function detectCrisis(text: string): Crisis {
  if (SELF_HARM.test(text)) return 'self_harm';
  if (VIOLENCE.test(text)) return 'violence';
  if (ABUSE.test(text)) return 'abuse';
  return null;
}
