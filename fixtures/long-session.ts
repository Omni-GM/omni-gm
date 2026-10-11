export type TranscriptLine = {
  at: string;
  seconds: number;
  speaker: string;
  text: string;
};
export function longSession(marker = "Marker"): {
  text: string;
  utterances: TranscriptLine[];
} {
  const speakers = ["GM", "Rowan", "Mira", "GM as Sera", "Tarin"];
  const dialogue = [
    "The lantern gate opens onto a road of pale stones. Rain drips from the arch.",
    "I ask Sera whether anyone has crossed the causeway since the last bell.",
    "There are fresh cart tracks here. I follow them as far as the bridge.",
    "Mind the stones, dear. The water rises when the northern bell rings.",
    "We should mark this turning so we can find the ferry again after dark.",
    "The old tower comes into view. One window glows above the river.",
    "Could that light belong to the missing keeper? I cannot tell from here.",
    "I call across the water and wait. My voice echoes under the bridge.",
    "A traveler left a red cord on my ferry. I have not seen them return.",
    "I leave the cord tied to the post and tell the others what Sera said.",
    "At the market, the watch asks who has been walking the causeway tonight.",
    "I explain that we came from the ferry and are looking for the keeper.",
    "Maybe the watch knows the traveler. That is only a guess for now.",
    "The last bell has not rung yet. There is still time to reach the gate.",
    "We head back together. I keep watching for the lamp in the tower.",
  ];
  const utterances = Array.from({ length: 4801 }, (_, i): TranscriptLine => {
    const elapsed = i * 3;
    const at = [
      Math.floor(elapsed / 3600),
      Math.floor(elapsed / 60) % 60,
      elapsed % 60,
    ]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
    const text =
      i === 4800
        ? "The party returns to the lantern gate at dawn."
        : `${dialogue[i % dialogue.length]} ${marker} ${i}.${i % 53 === 0 ? "\nA pause while the group checks the road." : ""}`;
    return {
      at,
      seconds: elapsed,
      speaker: speakers[i % speakers.length],
      text,
    };
  });
  return {
    text:
      utterances.map((u) => `[${u.at}] ${u.speaker}: ${u.text}`).join("\r\n") +
      "\r\n",
    utterances,
  };
}
