---
name: transcribe
description: Turn the game master's session recording, or a transcript from another tool, into an Omni-GM transcript file on their machine.
---

Turn what the game master brings from the table into a UTF-8 file of `[HH:MM:SS] Speaker: text` lines that the debrief can upload. Game masters bring a phone recording of the whole table, a recording in several parts, one track per player from a Discord bot, a call recording, or a transcript another tool already made.

Transcription is local: it runs on the game master's machine, and the recording stays there. Send audio to a cloud transcription service only when the game master asks for one by name. Leave the originals untouched. Put intermediate files, such as converted audio and engine output, in a new work folder, and offer to delete it at the end.

## 1. Find out what you have

This procedure needs a shell on the game master's own machine, where the recording is. Without one, say in one or two sentences that this client cannot transcribe. Offer two ways on: run this in Claude Code, or use a transcription tool that can export exactly the line format from step 4. Most tools export SRT or VTT, and the upload refuses those until Claude Code converts them. Show the line format and stop here.

With a shell, ask for the path of the recording or transcript if you do not have it. Inspect it before asking anything else: the file type, and for audio or video the duration and channel count with `ffprobe` when it is installed. Read only the first lines of a text file. Then ask only what inspection cannot tell you, in one message:

- For audio: is it one recording of the whole table, several parts of one recording in order, or one file per person? Which person is on which file? For a 2-channel recording, does each channel hold one person? Which language was spoken? With several languages, the engine gets the main one, and lines in the others come out less accurate.
- For a transcript with generic labels such as `SPEAKER_00`: who is at the table, so labels can become people's names later.

A 2-channel recording counts as one file per person only when the game master says each channel holds one person; split it with `ffmpeg` (`channelsplit`) in step 3. Otherwise it is one mixed recording.

This step is done when you know the input kind (one mixed recording, parts in order, one file per person, or an existing transcript), and for audio the language and the person on each per-person file.

## 2. Convert an existing transcript

For SRT, VTT, Whisper JSON, or text with timestamps from another tool, write a small local script that reads the file and writes the Omni-GM file from step 4, keeping the original timestamps. Run it file to file, so the transcript never passes through the conversation. Speakers follow step 3's rules: named speakers keep their names, generic labels such as `SPEAKER_00` get the sample-and-ask treatment, and a transcript with no speakers is labeled `Table`. Then go to step 4.

A transcript without timestamps cannot be used, because the debrief cites every fact by timestamp. Say so and ask whether the audio exists. With audio, go to step 3; without it, stop here.

## 3. Transcribe the audio

Pick the speech-to-text engine:

1. Use one that is already installed. Check for `whisper-cli` or `main` (whisper.cpp), `mlx_whisper` (Apple Silicon), `whisper` (openai-whisper), `whisper-ctranslate2` (faster-whisper) and `whisperx`, and read its `--help` for the exact flags.
2. When none is installed, propose one by machine: `mlx-whisper` on Apple Silicon, `whisperx` with an NVIDIA GPU, otherwise whisper.cpp or `whisper-ctranslate2`. For one mixed recording, also offer `whisperx` as the engine that separates speakers, slower without an NVIDIA GPU. Name every install in one question, `ffmpeg` included when it is missing. Install Python engines in isolation with `uv tool` or `pipx`, and `ffmpeg` and whisper.cpp with the system package manager, such as `brew`, `apt` or `winget`. Give the model download size, often more than a gigabyte. Install only after the game master agrees.

Join parts in order into one file in the work folder with `ffmpeg` (`concat`), and treat it as one mixed recording from here on. Use the `large-v3-turbo` model unless the game master asks for `large-v3` accuracy or a smaller model for speed. Convert audio with `ffmpeg` when the engine needs another format; phone recordings are often `.m4a`. Pass the language from step 1. Before the full run, transcribe a 60-second clip, then tell the game master the estimated total time. Run the full transcription in the background and report progress. Ask the engine for segment timestamps, as JSON, SRT or VTT.

Speakers come from the input kind:

- **One file per person.** Check with `ffprobe` that the tracks have about the same length; when they differ, ask how they line up. Turn on the engine's voice-activity filter, such as `--vad_filter True` in whisper-ctranslate2, since mostly silent tracks otherwise collect invented text. Label every segment with that file's person.
- **One mixed recording.** Offer speaker separation when the engine supports it, such as `whisperx --diarize`. It needs a free Hugging Face token and accepting the pyannote model terms. The game master signs in with `hf auth login` themselves, or `uvx --from huggingface_hub hf auth login` when `hf` is not installed, so the token stays out of the conversation. Show two or three lines per separated speaker and ask who each one is. A label they cannot place stays `Speaker 1`, `Speaker 2`. Without speaker separation, label every line `Table`, and tell the game master that the debrief then guesses who spoke from what was said, which is less accurate.

This step is done when every segment has a start time, a speaker and text.

## 4. Write the transcript file

Write the file next to the recording as `<recording name>.omni-gm.txt`; for several files, name it after their folder. Pick a new name rather than overwriting an existing file. Each utterance is one line:

```text
[00:01:10] GM: The causeway runs out across the salt marsh.
[00:02:20] Sam: I bet she works for the raiders.
```

- Timestamps are hours, minutes and seconds from the start of the session, never decreasing from one line to the next. Merge the segments of all files into one list sorted by start time.
- Speakers are people: `GM` or the game master's name, and the players by name, never their characters. A speaker name holds no colon.
- Join consecutive segments of the same speaker while the gap stays under 2 seconds and the joined line covers under 30 seconds.
- Stay within the upload limits: under 8,000,000 bytes, at most 20,000 lines, and each utterance under 32,000 bytes.

Check the file with a script: every line matches `[HH:MM:SS] Speaker: text`, timestamps never decrease, and the limits hold. Show the game master the line count, the speakers with their line counts, the first three lines and the file path.

This step is done when the check passes and the game master has seen that summary.

## 5. Hand over to the debrief

Continue the debrief with the new file; load skill debrief first when it is not loaded yet.
