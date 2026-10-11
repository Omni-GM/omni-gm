# PROTOTYPE: debrief and frame talk dry run

Throwaway. This folder lives only on the `prototype/debrief-dry-run` branch and never merges to `main`.
It answers [Prototype: does the debrief and frame talk work on a real session?](https://github.com/Omni-GM/omni-gm/issues/7).

The prototype is a procedure, not code: two prompts the game master runs in their own AI client, with no server and no database.

| File | What it is |
| --- | --- |
| [`debrief.md`](debrief.md) | The prompt that turns one session's transcript into a draft of story-state changes, scene by scene. |
| [`story-state-changes.md`](story-state-changes.md) | The change format and the field list for each story-state kind. |
| [`frame-talk.md`](frame-talk.md) | The prompt for the frame talk at the start of prep, where the AI asks and the game master writes the adventure frame. |
| [`prep-sparring.md`](prep-sparring.md) | The prompt for the rest of prep: the AI brings facts and structure along the game master's own checklist; the game master creates. |

## How to run it

1. Start a fresh conversation in an AI client that can read files.
2. Give it `debrief.md`, `story-state-changes.md`, the session transcript, and the story state before the session. Without a store, the story state before the session is the previous session note.
3. Review the draft scene by scene and correct it by talking to the AI. Then call it committed.
4. In the same or a new conversation, give it `frame-talk.md` and the committed debrief, and answer its questions.
5. Give it `prep-sparring.md` and your session-note template, and prep the session with it. It ends with your session note, assembled from your own decisions.

Real session material and the drafts it produces stay in the game master's private notes, never in this repository.
