// HOLLOW SIGNAL — entry point. The shell is five modules with one job each:
// context (singletons + state), pilots (identity), combat (damage), flow (the
// run state machine), loop (the frame). This file only boots them in order.

import { $ } from "./context.js";
import { autoSignIn } from "./pilots.js";
import { menu } from "./flow.js";
import { frame } from "./loop.js";
import { initAudio, resumeAudio } from "./audio.js";

document.addEventListener("click", () => resumeAudio(), { once: true });
document.addEventListener("touchstart", () => { initAudio(); resumeAudio(); }, { once: true });

// Sign the last pilot back in automatically. Retyping initials every session is
// friction for nothing, and this browser has already proved it is theirs.
autoSignIn();

// go
$("#boot").classList.add("hidden");
menu();
requestAnimationFrame(frame);
