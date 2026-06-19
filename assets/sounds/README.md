# Sound Assets

## Horror scream

The app looks for this optional file:

```text
assets/sounds/female-scream-pixabay-41894.mp3
```

Source selected for the asset:

- Title: `Loud Female Scream`
- Author: `Yin_Yang_Jake007 (Freesound)` via Pixabay
- URL: `https://pixabay.com/sound-effects/people-loud-female-scream-41894/`
- License: Pixabay Content License
- License summary: `https://pixabay.com/service/license-summary/`

Pixabay page says the sound effect is free for use under the Pixabay Content License. The local sandbox could not reliably download the binary file automatically because the CDN connection was reset. If the MP3 is added at the path above, horror premieres will play the real scream. If the file is absent or fails to play, the app falls back to a synthesized scream-like WebAudio effect.

## Action gunshots

The action premiere first tries to play this local sound effect:

```text
assets/sounds/action-gunshots.mp3
```

Use a short, licensed sound effect with two or three dry gunshots and a brief room tail. The effect should be a recording, not an excerpt from a film or game. If this optional file is absent or cannot be played, the action premiere keeps only a quiet VHS mechanism sound and does not imitate gunfire.

The current local asset contains two shots and drives the two consecutive glass impacts in the action premiere.
