<script lang="ts">
  import { errorText } from "#lib/errorText";
  import { formatLocaleNumber } from "#lib/format";
  import { t } from "#lib/i18n.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import StartRoutineButton from "#lib/components/routines/StartRoutineButton.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import { buildShareData, buildShareUrl, ShareLinkError } from "#lib/imports/shareLink";
  import { settings } from "#lib/settings.svelte";
  import { getExercisesByIds } from "#lib/storage/exercises";
  import { localizeExercises } from "#lib/catalog/localize";
  import { getProgram, getRoutine, listRoutinesGrouped } from "#lib/storage/routines";
  import { toast } from "#lib/ui/toast.svelte";
  import { displayWeight } from "#lib/units";
  import type { PrescribedSet, Program, Routine } from "#lib/types";

  let routine = $state<Routine>();
  let program = $state<Program>();
  let names = $state<Record<string, string>>({});
  let loaded = $state(false);
  let failed = $state(false);

  onMount(async () => {
    try {
      const r = await getRoutine(page.params.id ?? "");
      if (r) {
        const [p, exercises] = await Promise.all([
          r.programId ? getProgram(r.programId) : undefined,
          getExercisesByIds(r.exercises.map((e) => e.exerciseId)),
        ]);
        program = p;
        names = Object.fromEntries(localizeExercises(exercises).map((e) => [e.id, e.name]));
        routine = r;
      }
    } catch {
      failed = true;
    } finally {
      loaded = true;
    }
  });

  const unit = $derived(settings.weightUnit);
  const back = { href: resolve("/routines"), label: t("rt.title") };
  const typeLabel = (type: PrescribedSet["type"]) => t(`rt.kind.${type}`);

  function setText(s: PrescribedSet) {
    const parts: string[] = [];
    if (s.repRange) parts.push(s.repRange[0] === s.repRange[1] ? t("rt.repsExact", { n: s.repRange[0] }) : t("rt.repsRange", { from: s.repRange[0], to: s.repRange[1] }));
    if (s.targetWeight !== undefined) parts.push(`${formatLocaleNumber(displayWeight(s.targetWeight, unit))} ${unit}`);
    if (s.targetDurationSeconds !== undefined) parts.push(`${s.targetDurationSeconds} s`);
    if (s.targetDistance !== undefined) parts.push(`${s.targetDistance} m`);
    if (s.targetRpe !== undefined) parts.push(`RPE ${s.targetRpe}`);
    if (s.targetRir !== undefined) parts.push(`${s.targetRir} RIR`);
    return parts.join(" · ") || "—";
  }

  let sharing = $state(false);
  let shareError = $state<string>();
  let longLink = $state(false);

  /** Shares the whole program when the routine belongs to one, otherwise just this routine. The plan travels in the URL fragment only. */
  async function share() {
    if (!routine || sharing) return;
    sharing = true;
    shareError = undefined;
    longLink = false;
    try {
      const members = program
        ? ((await listRoutinesGrouped()).programs.find((p) => p.program.id === program!.id)?.routines ?? [routine])
        : [routine];
      const exercises = await getExercisesByIds(members.flatMap((r) => r.exercises.map((e) => e.exerciseId)));
      const data = buildShareData(members, new Map(exercises.map((e) => [e.id, e])), program);
      const importUrl = new URL(resolve("/routines/import"), location.origin).href;
      const { url, tooLong } = await buildShareUrl(data, importUrl);
      longLink = tooLong;
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ url, title: data.program.name });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // Sharing failed for another reason; copying below still gets the link out.
        }
      }
      await navigator.clipboard.writeText(url);
      toast(t("rt.linkCopied"));
    } catch (err) {
      shareError = err instanceof ShareLinkError ? errorText(err.message) : t("rt.shareFailed");
    } finally {
      sharing = false;
    }
  }

  const isSuperset = (i: number) => {
    const g = routine?.exercises[i].supersetGroupId;
    return g !== undefined && routine!.exercises.some((e, j) => j !== i && e.supersetGroupId === g);
  };
</script>

{#if failed}
  <PageHeader title={t("rt.detail.title")} {back} />
  <EmptyState icon="alert-triangle" title={t("rt.detail.loadFailed")} body={t("history.reloadHint")} />
{:else if !loaded}
  <PageHeader title={t("rt.detail.title")} {back} />
{:else if !routine}
  <PageHeader title={t("rt.detail.title")} {back} />
  <EmptyState icon="list" title={t("rt.detail.notFound")} body={t("rt.detail.notFoundBody")}>
    {#snippet action()}<Button variant="primary" href={resolve("/routines")}>{t("rt.detail.backTo")}</Button>{/snippet}
  </EmptyState>
{:else}
  <PageHeader title={routine.name} subtitle={program?.name} {back}>
    {#snippet actions()}
      <Button variant="secondary" size="md" icon="edit" href={resolve(`/routines/${routine!.id}/edit` as "/")}>{t("rt.edit")}</Button>
      <StartRoutineButton routine={routine!} variant="primary" size="md">{t("rt.start")}</StartRoutineButton>
    {/snippet}
  </PageHeader>
  <div class="share">
    <Button variant="secondary" size="md" icon="share" loading={sharing} onclick={share}>
      {program ? t("rt.shareProgram") : t("rt.share")}
    </Button>
  </div>
  {#if shareError}
    <Banner variant="danger" title={t("rt.shareFailedTitle")}>{shareError}</Banner>
  {:else if longLink}
    <Banner variant="warning" title={t("rt.longLinkTitle")}>
      {t("rt.longLink")}
    </Banner>
  {/if}
  {#if routine.description}<p class="desc">{routine.description}</p>{/if}
  {#if routine.exercises.length === 0}
    <EmptyState icon="list" title={t("rt.noExercises")} body={t("rt.noExercisesBody")} />
  {:else}
    <ol class="list">
      {#each routine.exercises as ex, i (ex.id)}
        <li>
          <Card>
            <div class="head">
              <h2>{names[ex.exerciseId] ?? t("summary.unknown")}</h2>
              {#if isSuperset(i)}<Badge variant="info">{t("rt.superset")}</Badge>{/if}
            </div>
            {#if ex.restSeconds !== undefined}<p class="meta">{t("rt.rest", { n: ex.restSeconds })}</p>{/if}
            <ul class="sets" aria-label={t("rt.prescribed")}>
              {#each ex.prescribedSets as s, si (s.id)}
                <li><span class="kind">{si + 1}. {typeLabel(s.type)}</span><span>{setText(s)}</span></li>
              {/each}
            </ul>
            {#if ex.notes}<p class="meta">{ex.notes}</p>{/if}
          </Card>
        </li>
      {/each}
    </ol>
  {/if}
{/if}

<style>
  .desc,
  .meta {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    margin: var(--space-2) 0 0;
  }
  .share {
    margin-block: var(--space-3);
  }
  .list {
    list-style: none;
    margin: var(--space-4) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
  .sets {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
  }
  .sets li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block: var(--space-1);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .kind {
    color: var(--color-text-muted);
  }
</style>
