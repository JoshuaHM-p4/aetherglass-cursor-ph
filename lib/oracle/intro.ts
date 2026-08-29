// Scripted wake. The LLM is not asked for these two beats — it can skip or fail.

export const INTRO_ENTITY_ID = 'fountain_00';

export const INTRO_BEATS = [
  {
    id: 'story',
    text:
      "You're awake. I'm the shard at your shoulder — what's left of the old pane. " +
      'I remember a keep that stood, and a surface that forgot. Below us the caves hoard ' +
      'what daylight abandoned. A locked heart waits deeper still, and it will not open for a common key.',
  },
  {
    id: 'controls',
    text:
      'Arrows or WASD, you walk. Space, you swing. Enter, you speak to whatever you are standing beside. ' +
      'Tab is the bag. 1, 2, and 3 are the hotbar. When you are ready, the north opening is the only way down.',
  },
] as const;
