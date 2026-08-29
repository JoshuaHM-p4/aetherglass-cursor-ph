// Scripted wake. The LLM is not asked for these two beats — it can skip or fail.

export const INTRO_ENTITY_ID = 'fountain_00';

export const INTRO_BEATS = [
  {
    id: 'story',
    text:
      "Hey. I'm the Aetherglass — the cracked shard on your shoulder. I talk, I judge, and I used to be a whole window. " +
      "The fountain is the safe room. North is a hole: caves, locked doors, and a heart at the bottom that brass keys bounce off. " +
      "I'll tell you when a plan is stupid.",
  },
  {
    id: 'controls',
    text:
      "Arrows or WASD to walk. Space to swing. Enter to talk to whatever you're standing next to. " +
      "Tab is the bag. 1, 2, and 3 are the hotbar. Go north when you're done staring. I'm not drawing a map.",
  },
] as const;
