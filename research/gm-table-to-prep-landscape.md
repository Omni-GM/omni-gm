# How GMs keep table play and prep connected

Research for [How do GMs and tools keep table and prep connected?](https://github.com/Omni-GM/omni-gm/issues/4), accessed 10 October 2026.

Held back from grilling until the problem statement ticket closes.

## Answer

The surveyed approaches connect play to prep through a repeating process: record what changed, update the affected people and threats, then choose what matters for the next session. Lazy DM prep narrows the next-session material; fronts and clocks carry consequences and offscreen activity forward; node design preserves routes through a changing scenario. Campaign managers store and connect the records. AI tools attempt to turn recordings into those records and help retrieve or draft material.

This is a synthesis of the sources below, not a measured claim about all GMs. The recurring gap is the work between recording an event and deciding its consequences. A readable recap does not by itself decide which threat changed, what a player now knows, or what belongs in next session's prep.

## Evidence and limits

- Rules and product behavior come from their authors, official documentation, or source texts. Product pages establish advertised capabilities, not demonstrated reliability.
- GM reports come from firsthand forum posts, a published campaign account, and vendor reports of user surveys. These establish specific experiences, not prevalence. Historical complaints are dated and are not proof that a current version has the same defect.
- Admin costs describe tasks the workflow requires. They are qualitative analysis, not timed comparisons. No product was installed or tested, and no price ranking or recommendation was attempted.
- No private campaign material or prior prototype code informed this report. Public sources' campaign examples are not reproduced.

## Comparison

| Approach | Problem it addresses | Work the GM retains | Reported or documented weak point |
| --- | --- | --- | --- |
| Lazy DM prep | Prepare enough usable material to improvise next session | Review characters, choose material, track revealed clues, discard stale prep | Secrets can feel disconnected; unused material can accumulate |
| Dungeon World fronts | Keep threats and their consequences moving across sessions | Interpret play, revise dangers and portents, show changes to players | Turning session events into portents is difficult; several fronts become complex |
| Blades faction clocks | Track competing long-term goals during downtime | Select relevant factions, advance clocks, narrate consequences | Tracking every faction creates unnecessary work; cadence and visibility require judgment |
| Daggerheart countdowns | Make extended effort and approaching consequences legible | Set effect and starting value, choose advancement rules, retain unfinished state | GMs report arbitrary-feeling duration and uncertainty about dynamic countdowns |
| Node-based design | Preserve player choice and avoid single-clue bottlenecks | Prepare leads, track discoveries, update affected nodes | Large networks become difficult to manage at the table |
| Obsidian vaults | Keep searchable, linked prep and history in local files | Choose structure, maintain links and notes, arrange sharing | Overbuilt structure can force duplicate writing or excessive setup |
| Kanka | Connect campaign entities, journals, time, and player access | Update entities and journals, configure permissions | Its user survey reported editing friction and lost content or formatting |
| LegendKeeper | Connect maps, wiki pages, and collaborative campaign notes | Maintain pages, reveal discoveries, coordinate player notes | Template discipline and export/migration work remain; offline access has conditions |
| World Anvil | Combine campaign history, world articles, and presentation | Write reports, link appearances, maintain articles and access | GMs report interface overload and pressure to polish material |
| AI recap tools | Reduce live note-taking and produce searchable session records | Capture usable audio, correct extraction, approve changes and sharing | Correction work, speaker attribution, and integrations remain problems |
| AI GM assistants | Retrieve context and draft ideas during prep or play | Supply context, constrain requests, verify answers, select drafts | Answers may be wrong or expand beyond the requested help |

The detail and citations for every row follow.

## Prep and world-state techniques

### Lazy DM prep

Mike Shea's eight steps cover reviewing characters, a strong start, possible scenes, secrets and clues, locations, NPCs, monsters, and rewards. They prepare material for improvisation rather than a mandatory sequence of events. The steps are modular, so a GM can omit what the session does not need. [Shea's eight-step review](https://slyflourish.com/eight_steps_2023.html).

The connection back to play is explicit in clue reuse: review the last session, check what was revealed, and carry forward only undiscovered material that remains relevant. This reduces rewriting, but the GM still decides what is true and useful now. Shea warns that a large backlog becomes a burden. [Reusing secrets and clues](https://slyflourish.com/reusing_secrets_and_clues.html).

Admin cost is low when the GM keeps short notes and uses only needed steps. It grows when the checklist becomes a completion target or unused ideas become an archive to inspect every week. This is a workflow inference from the two articles, not a measured prep-time saving.

A GM in a February 2023 discussion reports that secrets feel disconnected from an ongoing mystery and that fresh information becomes difficult to invent. Replies identify a misunderstanding: ten secrets do not mean ten routes to one answer. The method's flexible delivery still requires the GM to make the information relevant to the current game. [Firsthand report and responses](https://www.reddit.com/r/DMAcademy/comments/1129uxy/).

### Dungeon World fronts and grim portents

Fronts group dangers, their motivations, possible escalating events, and an impending doom. The rules distinguish an adventure front from a campaign front and tell the GM to create fronts after the first session. Their purpose is to organize opposition already emerging in play. The GM marks portents when events occur, revises them when circumstances change, and considers the aftermath when a danger ends. [Original author-maintained fronts text](https://github.com/Sagelt/Dungeon-World/blob/master/text/Fronts.xml), [readable SRD](https://www.dungeonworldsrd.com/gamemastering/fronts/).

Admin cost comes from converting events into changes to threats, checking effects on other dangers, and communicating those effects. The rules recommend limiting active detail and warn that several simultaneous fronts can become overwhelming. This is a GM-run process; the written sequence is conditional on what happens, not a fixed plot to execute. [Fronts SRD](https://www.dungeonworldsrd.com/gamemastering/fronts/).

In an October 2020 thread, a GM reports having plenty of material from play but not knowing how to turn it into grim portents. A respondent says fronts did not help their own GMing and describes replacing prewritten portents with more open clocks. The breakdown is the translation step, even when the table produces useful ideas. [How to set up fronts](https://www.reddit.com/r/DungeonWorld/comments/jie6rm/).

### Blades in the Dark faction clocks

Clocks track progress against obstacles or toward trouble. Faction clocks connect a group's long-term goals to downtime and to the crew's actions. The rules say the clock reflects the fictional situation, and simple obstacles need no clock. [Official progress clocks](https://bladesinthedark.com/progress-clocks).

For NPC downtime, the GM advances projects and chooses maneuvers for factions currently of interest. A fortune roll can determine uncertain progress. Ignored factions can receive catch-up progress later, and known activity reaches players through contacts and rumors. This is a direct route from offscreen change to possible future scores. [Official NPC and faction downtime](https://bladesinthedark.com/downtime-activities-play).

Admin cost is selecting relevant factions, judging how play helped or blocked their goals, and describing what completion means. The rules explicitly avoid requiring a full simulation of every faction. A numeric tick still needs a fictional consequence before it becomes useful prep.

An April 2022 GM asks which factions to advance and when, noting that advancing all of them seems overwhelming. Respondents describe limiting attention to relevant factions. One explains that a clock needs a clear connection to the fiction players encounter. [How to use faction clocks](https://www.reddit.com/r/bladesinthedark/comments/tvoo6x/).

### Daggerheart countdowns

The current official SRD is version 2.0, dated August 2026. Countdowns decrease toward an effect at zero. Standard countdowns advance on action rolls; dynamic progress and consequence countdowns use different advancement based on the outcome. Long-term countdowns can advance after rests. The SRD also includes optional faction objective countdowns with weekly advancement and changes based on events. [Official SRD and changelog](https://www.daggerheart.com/srd/), [SRD 2.0, countdowns p. 90 and faction objectives p. 189](https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf).

Admin cost is choosing a starting value, defining the effect, applying the appropriate trigger, and retaining unfinished countdowns between sessions. The counter records remaining progress or time, but the GM must supply what changes in the world. This is analysis of the mechanic, not a reported defect.

A 2026 discussion asks what countdown-based prep should contain and how to avoid making multiple rolls feel artificially prolonged. The GM also reports uncertainty about the swinginess of dynamic countdowns. Replies describe preparing possible triggers and consequences, which is more work than drawing a counter. [Firsthand prep questions and responses](https://www.reddit.com/r/daggerheart/comments/1rg3d6r/how_do_you_prep_countdownbased_scenes/).

### Node-based scenario design

Justin Alexander connects locations, people, events, or other scenario elements through leads. This addresses the fragility of a fixed scene sequence when players miss information or choose another direction. Redundant clues and available leads help keep an investigation moving. This structure concerns access and discovery; it does not automatically advance an offscreen faction. [The plotted approach](https://thealexandrian.net/wordpress/7949/roleplaying-games/node-based-scenario-design-part-1-the-plotted-approach), [inverting the Three Clue Rule](https://thealexandrian.net/wordpress/7985/roleplaying-games/node-based-scenario-design-part-3-inverting-the-three-clue-rule).

Admin cost is preparing connections, tracking what players discovered, and checking which leads remain valid as the situation changes. Combining it with fronts or clocks can make both navigation and changing threats visible, but that combination is a research inference, not a requirement of the method.

The author reports that large networks become difficult to design and manage in real time and describes breaking a larger network into major nodes and subnodes. In the first article's comments, a reader also struggles to combine nodes with situation-based prep. These are separate problems: managing scale and understanding how to apply the structure. [Alexander's management experience](https://thealexandrian.net/wordpress/8197/roleplaying-games/advanced-node-based-design-part-4-the-second-track), [reader question and author response](https://thealexandrian.net/wordpress/7949/roleplaying-games/node-based-scenario-design-part-1-the-plotted-approach#comments).

## Campaign managers

### Obsidian vaults

Obsidian provides internal links among notes. Shea's firsthand GM setup uses local Markdown files, session notes, character and NPC references, and extra pages only when needed. His setup uses one template plugin rather than a large plugin collection. That makes the same material available during play and later prep without requiring a hosted campaign database. [Official internal-link documentation](https://help.obsidian.md/Linking+notes+and+files/Internal+links), [Shea's campaign setup](https://slyflourish.com/obsidian.html).

Admin cost depends on the chosen structure. The GM writes and updates notes, creates useful links, and arranges any cross-device or player-sharing workflow. A basic vault has little schema work; a plugin-heavy setup adds configuration and maintenance. This is workflow analysis, not a claim that plugins are necessary.

A June 2025 GM reports that separate location, character, lore, and session folders did not fit a compact mystery. They ended up keeping the useful material in one note and wanted to avoid writing the same information in multiple places. Replies recommend letting structure emerge from use. A separate 2026 thread reports daunting plugin setup. [Note architecture report](https://www.reddit.com/r/ObsidianMD/comments/1lmjv0x/), [plugin setup report](https://www.reddit.com/r/ObsidianMD/comments/1rcks2g/obsidian_appears_super_daunting_to_setup_with/).

### Kanka

Kanka connects characters, locations, quests, calendars, timelines, and other entities. Journals explicitly support both session prep and recaps. Mentions and relationships can connect a session record to its affected entities, while permissions separate player knowledge from GM material. [Official feature overview](https://kanka.io/features), [journals](https://docs.kanka.io/en/latest/entries/journals.html), [permissions](https://docs.kanka.io/en/latest/features/permissions.html).

Admin cost is creating and updating entity records, linking relevant events, and setting access. The permission system includes campaign roles, entry permissions, and permissions on attached elements, so sharing requires configuration. The data model helps organize consequences after the GM identifies them; it does not make those judgments for the GM.

Kanka's September 2025 report of a user survey identifies mixed confidence in the editor, unexpected loss of content or formatting, and requests for better mentions, tables, and mobile editing. This is a vendor-mediated report of user experiences, not an independent test. It supports editing friction as a historical failure point; it does not establish the current incidence after later releases. [Kanka's editor survey](https://blog.kanka.io/2025/09/05/survey-results-the-future-of-kankas-text-editor/).

### LegendKeeper

LegendKeeper combines a wiki, maps, collaborative editing, permissions, search, and export. A published firsthand West Marches account describes players maintaining session logs and location pages while the GM used private tabs for prep and revealed previously hidden locations during play. That gives both groups responsibility for keeping the shared record current. The account is hosted by the vendor. [Official features](https://www.legendkeeper.com/features/), [campaign account](https://www.legendkeeper.com/how-to-run-a-west-marches-campaign/).

Admin cost is page and map upkeep, private/public separation, and agreeing who updates shared notes. The campaign author reports that templates helped but could not be required of players. Collaboration reduces the GM's writing load only if others actually maintain the records. [Campaign account](https://www.legendkeeper.com/how-to-run-a-west-marches-campaign/).

An April 2025 user wants to move a large rules collection to Obsidian because of layout and external-integration limits, but intends to keep campaign management in LegendKeeper. Their concern about online dependency needs qualification: the official feature page documents offline editing, with browser-storage constraints. Clearing browser data before synchronization loses offline changes; incognito is unsupported. Exports also do not establish a lossless migration into another editor. [User's migration question](https://www.reddit.com/r/ObsidianMD/comments/1k3h3ya/), [documented offline conditions](https://www.legendkeeper.com/features/).

### World Anvil

World Anvil distinguishes planned material from session reports of actual play. Its report guide recommends capturing improvised details, player choices, and player enthusiasm, then linking NPC and other appearances. Timelines can place those events alongside earlier and later ones. The broader workflow includes campaign, world, and chronology tools. [Official session-report guide](https://www.worldanvil.com/learn/article-templates/report), [GM workflow](https://www.worldanvil.com/learn/workflows/gm-workflow), [Chronicles documentation](https://www.worldanvil.com/learn/chronicles).

Admin cost is live capture, report writing, links, and updates to related articles. The official guide permits bullet points, so polished prose is optional. Maintaining a richly presented player wiki nevertheless adds work if the GM chooses that scope.

A February 2022 discussion includes GMs who found the interface overwhelming, returned to simpler notes, or became slower because they felt obliged to finish and polish articles. Other participants found links and timelines useful and kept using the tool. The evidence supports a fit problem between lightweight prep and extensive world presentation, not a claim that World Anvil cannot run campaigns. [Firsthand experiences](https://www.reddit.com/r/mattcolville/comments/sy7h8a/).

## AI tools

### Session recaps and campaign records

These products attempt to reduce the work of recording play and turning it into reusable notes. Their advertised scope varies:

| Example | Documented input and output | GM admin that remains |
| --- | --- | --- |
| [Archivist AI](https://www.myarchivist.ai/dnd-session-recap) | Audio, transcripts, raw notes, Discord, or play-by-post become recap text, timeline beats, entities, quest updates, and searchable campaign memory | Import or record the session, review and edit the record, then save or share it |
| [GM Assistant](https://gmassistant.app/docs/faq/index.html) | Uploaded audio becomes narrative notes with extracted characters, locations, and items; supports exports and speaker labels from separate tracks | Record usable audio, provide campaign names, correct misses, review and export |
| [Tavern Scribe](https://tavernscribe.com/session-recap) | Audio or video becomes recaps and linked campaign records; advertises event links to recording timestamps | Supply the recording, review claims against it, and manage sharing and processing credits |
| [Quest Portal Session Stories](https://www.questportal.com/documentation/uyVpk2QkHv/session-stories) | Automatically logs attendance, scenes, duration, and activity in campaign notes | Check usefulness and visibility; the documented activity log does not establish a transcription of everything said |

These are capabilities reported by the products, not results from a comparative test. Quest Portal's activity log is included as a useful boundary case: automatically recording platform activity is different from interpreting a whole conversation.

The strongest failure evidence here comes from GM Assistant itself. Its April 2026 user-survey report names analysis quality and integrations as major frustrations, and says correcting generated notes was the most common pain point addressed by Smart Edit. Its FAQ still asks users to review misses and says campaign names improve detection. [Survey and correction-work report](https://gmassistant.app/blog/dev-update-april-2026-smart-edit-and-survey/index.html), [FAQ](https://gmassistant.app/docs/faq/index.html).

A firsthand DM report from 2025 describes abandoning unhelpful live transcription, obtaining a transcript through another service, and still doing editing and synopsis work. The discussion raises speaker attribution and comfort with recording. This is category-level evidence about capture overhead, not a finding against any named product above. [Transcription workflow report](https://www.reddit.com/r/DnD/comments/1p41j4b/does_anyone_know_of_any_transcription_services/).

The GM therefore exchanges some live note-taking and recap drafting for recording setup and verification. Whether that is a saving depends on the table and output quality. This research found no trustworthy independent measurement of the net time saved. Nor does it establish that any listed tool reliably distinguishes player speculation, an accepted fact, and an abandoned GM plan.

### GM assistants for retrieval and drafting

Quest Portal's AI Notes drafts characters, locations, quests, encounters, and other material using campaign and current-note context. Its stated use cases include getting started and responding when players change direction. This addresses blank-page work and improvisation support. [Official AI Notes description](https://www.questportal.com/blog/introducing-ai-notes-homebrewing-just-got-better).

Archivist also advertises an assistant for recalling campaign lore and decisions from stored records. This serves a different need from inventing new content: finding the established answer during play or prep. The quality of the underlying record remains part of that dependency. [Official Archivist product description](https://www.myarchivist.ai/).

Admin cost is supplying current context, choosing the request, reviewing the answer, and deciding what becomes campaign fact. Quest Portal's own explanation acknowledges wrong answers to rules and lore questions and describes retrieval from licensed sources as its approach. That documents an attempted mitigation, not a guarantee of accuracy. [Quest Portal's explanation of retrieval and hallucinations](https://www.questportal.com/blog/ai-in-ttrpgs).

A late-2025 Quest Portal user reports that small requests started producing extensive session planning and that the assistant felt as though it was taking over their story. A team reply suggests either a bug or use of the Campaign Creator assistant. The cause is unresolved in the cited exchange, so the finding is a reported mismatch of scope rather than a confirmed permanent product behavior. [User report and vendor response](https://www.reddit.com/r/QuestPortal/comments/1pdb0j0/anyone_else_facing_problems_with_the_new_qp/).

## Findings to carry into the brainstorm

These are research hypotheses to consider after the problem statement closes. They are not decisions about Michael's needs or the first version.

1. Capture and consequence need separate treatment. A session log can remember an event; the GM still decides which people, threats, clues, and goals it changes. Fronts, faction downtime, and AI review flows all make that second step visible.
2. The next prep pass benefits from a limited active set. Shea carries forward relevant clues, Blades selects relevant factions, and Alexander breaks large networks into manageable groups. Preserving history need not mean reviewing all of it every session.
3. World movement needs a trigger and an observable effect. Downtime, rests, in-game weeks, and events are distinct advancement rules. A counter without a defined outcome does not tell the GM what to show players.
4. Facts, possibilities, and player knowledge need to remain distinguishable. Planned scenes may never occur; clues may be true but unrevealed; player theories may be mistaken. A summary or wiki that collapses those distinctions increases correction work.
5. Reviewable automation is a better-supported premise than unattended canon updates. The surveyed AI workflows explicitly preserve editing, and vendor feedback identifies corrections as real work. Links to evidence and proposed changes are worth testing; their benefit is not yet measured here.
6. Shared notes distribute work but do not remove it. LegendKeeper's campaign account demonstrates a player-maintained record, while also reporting limits on template discipline. The useful question is who will maintain which information.

## Remaining uncertainty

The sources do not answer which part of this process is painful for Michael, how much detail his prep requires, whether his table wants recordings, or whether software would outperform a small ritual or template. Those belong to the problem statement and subsequent live decisions. The research resolves the survey question and offers evidence for the later brainstorm without choosing a solution.
