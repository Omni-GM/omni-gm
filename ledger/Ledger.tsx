import type { DraftChange, LedgerDraft, LedgerRow, LedgerScene } from "./draft";

type DropProps = {
  dropping: string | null;
  dropError: string | null;
  onDrop: (changeId: string) => void;
};

const columns =
  "@2xl:grid @2xl:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_3.5rem] @2xl:gap-x-3";

const labelColors: Record<LedgerRow["label"], string> = {
  new: "bg-emerald-700",
  change: "bg-sky-700",
  closed: "bg-stone-600",
  link: "bg-violet-700",
  unlink: "bg-rose-700",
};

const basisNames: Record<DraftChange["basis"][number], string> = {
  narrated: "narrated",
  npc_said: "NPC said",
  rumor: "rumor",
  player_guess: "player guess",
  player_plan: "player plan",
  game_master: "game master",
};

export function Ledger({
  value,
  ...dropProps
}: { value: LedgerDraft } & DropProps) {
  const { draft, ledger } = value;
  const changes = new Map(draft.changes.map((c) => [c.id, c]));
  return (
    <main className="@container">
      <header className="border-b border-border-primary px-5 pt-5 pb-3">
        <p className="text-xs font-semibold tracking-wider text-accent uppercase">
          Draft debrief
        </p>
        <p className="mt-1 text-text-secondary">
          {draft.changes.length} changes in {ledger.scenes.length} scenes ·{" "}
          {draft.status}
        </p>
      </header>
      <div className="px-5 py-4">
        <SessionNote lastTime={draft.lastTime} />
        {dropProps.dropError && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-rose-700/40 px-3 py-2 text-rose-700 dark:text-rose-400"
          >
            {dropProps.dropError}
          </p>
        )}
        <div
          className={`${columns} mt-4 hidden border-b border-border-primary pb-1 text-xs font-semibold tracking-wide text-text-secondary uppercase @2xl:grid`}
        >
          <span />
          <span>Subject</span>
          <span>Before → after</span>
          <span>Basis and source</span>
          <span>Why</span>
          <span />
        </div>
        {ledger.scenes.map((scene) => (
          <SceneSection
            key={scene.ordinal}
            scene={scene}
            rows={ledger.rows.filter(
              (row) => changes.get(row.id)?.scene === scene.ordinal,
            )}
            changes={changes}
            canDrop={draft.status === "draft"}
            {...dropProps}
          />
        ))}
      </div>
    </main>
  );
}

function SessionNote({ lastTime }: { lastTime: string }) {
  return (
    <section className="rounded-lg border border-dashed border-accent bg-background-secondary px-4 py-3">
      <h2 className="text-xs font-semibold tracking-wider text-accent uppercase">
        For your session note
      </h2>
      {lastTime ? (
        <p className="mt-1 whitespace-pre-wrap">{lastTime}</p>
      ) : (
        <p className="mt-1 text-text-secondary italic">
          No "what happened last time?" block yet.
        </p>
      )}
    </section>
  );
}

function SceneSection({
  scene,
  rows,
  changes,
  canDrop,
  ...dropProps
}: {
  scene: LedgerScene;
  rows: LedgerRow[];
  changes: Map<string, DraftChange>;
  canDrop: boolean;
} & DropProps) {
  return (
    <section className="mt-4">
      <h3 className="font-semibold text-accent">
        {scene.ordinal}. {scene.title}
        <span className="font-normal text-text-secondary">
          {" "}
          · {scene.place}
        </span>
      </h3>
      {rows.length === 0 ? (
        <p className="py-2 text-text-secondary italic">
          No changes in this scene.
        </p>
      ) : (
        <ul className="divide-y divide-border-primary">
          {rows.map((row) => {
            const change = changes.get(row.id);
            return change ? (
              <ChangeRow
                key={row.id}
                row={row}
                change={change}
                canDrop={canDrop}
                {...dropProps}
              />
            ) : null;
          })}
        </ul>
      )}
    </section>
  );
}

function ChangeRow({
  row,
  change,
  canDrop,
  dropping,
  onDrop,
}: {
  row: LedgerRow;
  change: DraftChange;
  canDrop: boolean;
} & DropProps) {
  return (
    <li className={`${columns} flex flex-col gap-1.5 py-2.5`}>
      <div className="flex items-start justify-between gap-2 @2xl:contents">
        <span
          className={`${labelColors[row.label]} h-fit w-fit rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase`}
        >
          {row.label}
        </span>
        <p className="min-w-0 flex-1 @2xl:col-start-2 @2xl:row-start-1">
          <strong>{row.subject}</strong>
          {row.kind && (
            <span className="text-xs text-text-secondary"> {row.kind}</span>
          )}
        </p>
        {canDrop && (
          <button
            type="button"
            onClick={() => onDrop(row.id)}
            disabled={dropping !== null}
            aria-label={`Drop ${row.label} ${row.subject}`}
            className="h-fit rounded border border-border-primary px-2 py-0.5 text-xs text-text-secondary hover:border-rose-700 hover:text-rose-700 dark:hover:text-rose-400 disabled:cursor-wait disabled:opacity-50 @2xl:col-start-6 @2xl:row-start-1"
          >
            {dropping === row.id ? "Dropping…" : "Drop"}
          </button>
        )}
      </div>
      <BeforeAfter row={row} />
      <Source change={change} />
      <p className="text-text-secondary">{change.why}</p>
    </li>
  );
}

function BeforeAfter({ row }: { row: LedgerRow }) {
  const keys = [
    ...new Set([...Object.keys(row.before), ...Object.keys(row.after)]),
  ];
  if (!keys.length)
    return <p className="hidden text-text-secondary @2xl:block">—</p>;
  return (
    <dl className="min-w-0 space-y-0.5">
      {keys.map((key) => (
        <div key={key}>
          <dt className="inline text-xs text-text-secondary">{key} </dt>
          <dd className="inline">
            {row.before[key] !== undefined && (
              <>
                <s className="text-rose-700 dark:text-rose-400">
                  {row.before[key]}
                </s>
                {" → "}
              </>
            )}
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {row.after[key] ?? "—"}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Source({ change }: { change: DraftChange }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="flex flex-wrap gap-1">
        {change.basis.map((basis) => (
          <span
            key={basis}
            className={`rounded-full border px-1.5 text-[11px] ${
              basis === "player_guess" || basis === "player_plan"
                ? "border-amber-600 text-amber-700 dark:text-amber-400"
                : "border-border-primary text-text-secondary"
            }`}
          >
            {basisNames[basis]}
          </span>
        ))}
      </p>
      {change.sources.map((source) => (
        <blockquote
          key={`${source.at}-${source.quote}`}
          className="font-serif text-text-secondary italic"
        >
          “{source.quote}”
          {source.at && (
            <span className="ml-1 font-mono text-[11px] not-italic">
              {source.at}
            </span>
          )}
        </blockquote>
      ))}
    </div>
  );
}
