// Scripted wake. The LLM is not asked for these two beats — it can skip or fail.

export const INTRO_ENTITY_ID = 'fountain_00';

export const INTRO_BEATS = [
  {
    id: 'story',
    text:
      'You wake under the aether fountain. The glass at your shoulder is a shard of the old pane — ' +
      'it remembers a keep that stood, and a surface that forgot. The caves below hoard what the ' +
      'daylight abandoned. A locked heart waits deeper still, and it will not open for a common key.',
  },
  {
    id: 'controls',
    text:
      'Arrows or WASD to walk. Space to swing. Enter to speak to what you are standing beside. ' +
      'Tab opens the bag. 1, 2, and 3 are the hotbar. When you are ready, the north opening is the only way down.',
  },
] as const;
