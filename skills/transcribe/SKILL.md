---
name: transcribe
description: Turn the game master's session recording, or a transcript from another tool, into an Omni-GM transcript file on their machine.
---

Turn what the game master brings from the table into a UTF-8 file of `[HH:MM:SS] Speaker: text` lines that the debrief can upload. Every game master records differently: a phone recording of the whole table, one track per player from a Discord bot, a video call recording, or a transcript another tool already made. Assume nothing about the recording; look at it and ask.

Transcription is local: it runs on the game master's machine, and the recording stays there. Send audio to a cloud transcription service only when the game master asks for one by name. Leave the original recording untouched and write only new files.

## 1. Find out what you have

Without a shell, say in one or two sentences that this client cannot transcribe. Offer two ways on: run this in Claude Code, or use any transcription tool that writes timestamps and speakers, then debrief with that file. Show the line format from step 4 and stop here.

With a shell, ask for the path of the recording or transcript if you do not have it. Inspect it before asking anything else: the file type, and for audio or video the duration and channel count with `ffprobe` when it is installed. Read only the first lines of a text file. Then ask only what inspection cannot tell you, in one message:

- Is this one recording of the whole table, or one file per person? For several files, which person is on which file?
- Which language or languages were spoken?

This step is done when you know the input kind (one mixed recording, one file per person, or an existing transcript), the language, and for per-person files the person on each file.

## 2. Convert an existing transcript

For SRT, VTT, Whisper JSON, or text with timestamps from another tool, write a small local script that reads the file and writes the Omni-GM file from step 4, keeping the original timestamps and speaker names. Run it file to file, so the transcript never passes through the conversation.

A transcript without timestamps cannot be used: the debrief cites every fact by timestamp. Say so and ask whether the audio exists to transcribe instead. Then go to step 4.

## 3. Transcribe the audio

Pick the speech-to-text engine:

1. Use one that is already installed. Check for `whisper-cli` (whisper.cpp), `mlx_whisper` (Apple Silicon), `whisper` (openai-whisper), `whisper-ctranslate2` (faster-whisper) and `whisperx`, and read its `--help` for the exact flags.
2. When none is installed, propose the one that fits the machine, with its install command and the size of the model download, which is often more than a gigabyte. Install only after the game master agrees.

Convert the audio with `ffmpeg` when the engine needs another format; phone recordings are often `.m4a`. Pass the language from step 1, and use a large model for best accuracy unless the game master prefers speed. A four-hour session can take hours on a laptop CPU, so run the engine in the background and report progress while it runs. Ask the engine for segment timestamps, as JSON, SRT or VTT.

Speakers come from the input kind:

- **One file per person.** Transcribe each file and label every segment with that file's person.
- **One mixed recording.** Offer speaker separation when the engine supports it, such as `whisperx --diarize`. It needs a free Hugging Face token and accepting the pyannote model terms, so explain that before setting it up. Show two or three lines per separated speaker and ask the game master who each one is; keep a label they cannot place as `Speaker 1`, `Speaker 2`. Without speaker separation, label every line `Table`; the debrief then works out who spoke from what was said, and its review questions show where that stayed unclear.

This step is done when every segment has a start time, a speaker and text.

## 4. Write the transcript file

Write the file next to the recording as `<recording name>.omni-gm.txt`. Each utterance is one line:

```text
[00:01:10] GM: The causeway runs out across the salt marsh.
[00:02:20] Rowan: I bet she works for the raiders.
```

- Timestamps are hours, minutes and seconds from the start of the recording, never decreasing from one line to the next. Merge the segments of all files into one list sorted by start time.
- A speaker name holds no colon. Use the names the game master gave you.
- Join consecutive segments of the same speaker into one line while the gap between them stays under a few seconds.
- Stay within the upload limits: at most 8 MB, 20,000 lines, and 32 KB per line. Join more segments when the line count is over the limit.

Check the file with a script: every line matches `[HH:MM:SS] Speaker: text`, timestamps never decrease, and the limits hold. Show the game master the line count, the speakers with their line counts, the first three lines and the file path.

This step is done when the check passes and the game master has seen that summary.

## 5. Hand over to the debrief

Load skill debrief and debrief the session with the new file. It uploads the file straight from disk.
