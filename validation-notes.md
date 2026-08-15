# Validation Notes

## Recitation teaching loop

The desktop preview renders the restored **Study** workspace with the `Listen. Repeat. Review.` teaching sequence, full reciter control, learner-recording control, stage indicators, and ayah navigation. The selected ayah updates correctly in both the teaching workspace and the right-hand listening panel. Clicking **Hear the reciter** updated both visible controls to the playing state, confirming the playback state changes as expected.

The browser’s microphone denial path was also exercised. When access was not granted, the interface gave the user a specific and actionable permission message instead of creating a failed assessment. The sandbox browser has no permitted microphone, so recording capture, transcription, and assessment still require a real device with microphone access.

Automated validation has passed: Vitest, TypeScript type checking, and the production build all completed successfully after the full-stack upgrade.

## Leveled learning workspace

The live preview now renders a separate **Learn** workspace rather than treating early learning as a reduced version of the Quran reader. It exposes clear **Starter**, **Reading**, and **Advanced** level controls, and the Starter experience renders the full 28-letter Arabic alphabet, a selected-letter focus, vowel forms, English spoken lesson guidance, and an explicit teacher-confirmation boundary for articulation.

The **Reading** level was verified to present a linear route through short vowels, joining letters, and first-ayah practice. The **Advanced** level was verified to describe the proper workflow of real reciter audio, AI word-recall review, and teacher-confirmed tajwid, with a direct route into guided recitation.

The Advanced call-to-action was exercised in the live preview and opened the guided recitation workspace at the first ayah, confirming the intended curriculum hand-off works.

The mobile reader was also checked after adding the fourth **Learn** tab. The mode selector remains readable and the existing reading hierarchy is retained at a 375-pixel viewport.

## Curriculum progress controls

The refreshed Starter workspace was opened in the live preview. It displays the full alphabet, a visible `0 / 28 practised` counter, and a deliberate **Mark practised** action for the selected letter. The Reading path is wired to use the same local progress model for its three learner-controlled milestones.

The first live attempt to mark Alif as practised did not change the visible counter, so the progress-control interaction requires investigation before it can be treated as validated.

Follow-up inspection confirmed that the action did update the live React state: the selected letter’s action label changed to **Practised**. The earlier screenshot was captured before the client state settled. A reload-persistence check remains appropriate before closing the progress-control task.

The page was reloaded and the Starter path then displayed **1 / 28 practised**, **4% complete**, and the **Practised** action label for Alif. This confirms the Starter completion state is saved and restored locally.

The Reading path was also exercised in the live preview. Marking **Short vowels** complete updated the path to **1 / 3 steps** and the level card to **33% complete**, confirming the curriculum progress controls are visually responsive.

The Starter recognition exercise was tested with the correct answer for Alif. It immediately displayed a supportive confirmation and preserved the explicit instruction to verify spoken articulation with a qualified teacher.

The Reading short-vowel exercise was tested with **Bi** for the letter form `بِ`. It immediately confirmed the answer and explained that the kasra below the letter produces the short i sound.

Both retry paths were also exercised. Choosing **Ba** for `بِ` correctly explained that kasra gives the short i sound and invited the learner to try again. Choosing **Baa** for Alif similarly offered a constructive prompt to inspect the letter shape and replay the lesson guidance.

## Recitation pipeline smoke test

A controlled end-to-end test used the public Alafasy reciter clip at `https://audio.qurancdn.com/Alafasy/mp3/001001.mp3` to exercise app upload, signed storage, speech-to-text, assessment, coaching, and the tRPC response. The speech service returned an English translation rather than Arabic words despite the explicit Arabic language parameter. The app now detects this condition and returns `wordReviewAvailable: false`, neutral score display, an honest unavailable-review message, and safe spoken guidance instead of presenting a misleading zero-score correction.

In the live published app, a synthetic browser audio stream successfully entered the **Your turn** recording state, displayed the live-word-guide fallback, stopped through **Stop & review**, and moved into the asynchronous **Reviewing…** submission state. The review response was still pending at the time of this capture.

The same live submission then completed and rendered the correction panel with an Arabic transcript, zero matched words, AI spoken-guidance control, per-word review rows, retry control, and the qualified-teacher limitation. This validates the actual browser recording → upload → review → feedback cycle without requiring a physical microphone in the sandbox.

A second live-browser fixture replaced the recorder payload with the public reference reciter clip. The app again entered recording, stopped, and submitted through **Reviewing…**, preparing a deterministic test of the translated-transcript unavailable-review state.

The fixture submission on the public domain initially displayed the prior correction behavior because the translated-transcript safeguard had been validated locally but had not yet been published in that browser session. The local end-to-end smoke test confirms the updated server now returns `wordReviewAvailable: false` for this exact translated output. The next checkpoint deploys that correction to the public domain for the final browser pass.

After publishing version `c0277c92`, the public Study workspace reloaded successfully with the reciter-led teacher loop ready for the final deterministic fixture submission.

The public app accepted the deterministic reference-reciter fixture, entered the learner recording state, and reached **Reviewing…** after submission. The next inspection records the deployed unavailable-review rendering.

The first public inspection completed before the deployment confirmation arrived and therefore reflected the previous server response. The public app was reloaded after deployment confirmation, ready for the final post-deploy check.

After reload, a direct tRPC call from the active browser session using the same reference reciter clip returned HTTP 200 with `wordReviewAvailable: false`, the English translated transcript, and the safe unavailable-review spoken guidance. This confirms the deployed public server is serving the safeguard; prior rendered feedback was from the browser session that began before the deployment completed.

The frontend was then freshly loaded, entered the Study workspace, and submitted the same fixture through its own recording controls. It reached the review-pending state, enabling direct confirmation of the current UI branch.

The freshly loaded public frontend rendered the expected safety branch: **Word review unavailable**, neutral score display, translated-transcript explanation, English spoken-guidance control, qualified-reciter retry guidance, and no misleading word-level error rows. This completes browser validation of the recording-to-feedback flow for both recognised Arabic output and translated speech-to-text output.

The unmodified sandbox browser reported `NotFoundError: Requested device not found` for a native microphone request. The actual hardware-dependent portion cannot run in this environment; the next check confirms that the app presents a clear recovery message rather than failing silently.

The native recording control was exercised without any fixture. The Study workspace displayed: **“Microphone access was not granted. Allow it in your browser settings, then try again.”** This confirms the browser-specific no-device path is handled visibly and returns the learner safely to the repeat stage.

After restarting the local development service, it started cleanly and logged `Server running on http://localhost:3000/`. The final automated suite passed with **9 tests** across server recitation/auth/transcription coverage and the client learning-progress utility; TypeScript checking and the production build also passed. The local end-to-end recitation smoke test returned `wordReviewAvailable: false` for the translated reference clip together with the intended honest spoken guidance and no word score.

For the final retry-control check, the published app was reloaded and the previously validated deterministic Alafasy fixture was installed in the active browser session. The fixture is ready to reopen the completed unavailable-review panel without depending on unavailable sandbox microphone hardware.

The fixture was started and stopped through the public Study controls. It entered the asynchronous **Reviewing…** state, confirming the recording and submission portion of the retry validation is active.

The completed unavailable-review panel then rendered its **Listen and try again** action. Selecting it removed the feedback panel, returned the teacher loop to stage 01 (Listen), started the reciter at the slower guided pace, and displayed the expected cue: “Listen slowly. Notice each word, then repeat it back.”

For autonomous device-level validation, the published browser was prepared with a genuine `MediaStream` audio track created from the reciter clip via the native Web Audio API. The original browser `MediaRecorder` implementation remains in use; only the unavailable microphone source is replaced with this native virtual input stream.

The public Study workspace successfully entered recording with that native media track, exposed **Stop & review**, and submitted the resulting browser-generated recording into **Reviewing…**. This covers the native audio-track and `MediaRecorder` capture path, rather than a recorder mock.

The native recording reached the same honest **Word review unavailable** state after transcription, including the neutral score, saved-recording warning, qualified-reciter retry guidance, spoken-guidance control, and retry control. The **Play guidance** control was invoked from this completed native-media review.

The native-media review’s **Listen and try again** action was selected and returned the published lesson to stage 01 (Listen), with slower reciter playback and the expected listen-first guidance. The complete record → stop → AI review → spoken-guidance → retry sequence has therefore been exercised autonomously using genuine browser Web Audio, `MediaStream`, and `MediaRecorder` APIs. A physical microphone was unavailable in the sandbox, but the application’s native media handling and its no-device recovery path were both verified.

The final post-validation automated run passed: all 9 Vitest checks passed, TypeScript completed with no errors, and the production build completed successfully.
