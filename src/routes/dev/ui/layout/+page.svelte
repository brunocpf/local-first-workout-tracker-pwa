<svelte:head><title>Layout · UI style guide · Workouts</title></svelte:head>

<script lang="ts">
  import Badge from "#lib/components/ui/Badge.svelte";
  import Banner from "#lib/components/ui/Banner.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";
  import Spinner from "#lib/components/ui/Spinner.svelte";

  const variants = ["info", "success", "warning", "danger"] as const;
  let clicks = $state(0);
</script>

<PageHeader title="Layout primitives" subtitle="Header, rows, cards, banners" back={{ href: "/dev/ui", label: "UI style guide" }}>
  {#snippet actions()}<Badge variant="accent" icon="star">PR</Badge>{/snippet}
</PageHeader>

<h2>Banner</h2>
<div class="stack">
  {#each variants as variant (variant)}
    <Banner {variant} title="{variant} banner" dismissible action={{ label: "Action", onclick: () => clicks++ }}>
      Message text for the {variant} variant. Actions clicked: {clicks}.
    </Banner>
  {/each}
</div>

<h2>List rows</h2>
<Card padding="none">
  <ul class="list">
    <li><ListRow title="Link row" subtitle="Renders an anchor" href="/dev/ui" /></li>
    <li><ListRow title="Button row" onclick={() => clicks++} /></li>
    <li><ListRow title="Selected row" subtitle="With check" selected onclick={() => clicks++} /></li>
    <li>
      <ListRow title="Static row" subtitle="With trailing badge">
        {#snippet trailing()}<Badge variant="success" icon="check">Matched</Badge>{/snippet}
      </ListRow>
    </li>
  </ul>
</Card>

<h2>Card</h2>
<Card as="section">
  {#snippet header()}Card header{/snippet}
  Card body content.
</Card>

<h2>Empty state</h2>
<Card>
  <EmptyState icon="dumbbell" title="No workouts yet" body="Finished workouts appear here. Start one from Home." />
</Card>

<h2>Badge</h2>
<p class="row">
  <Badge>Neutral</Badge>
  <Badge variant="accent" icon="star">PR</Badge>
  <Badge variant="success" icon="check">Matched</Badge>
  <Badge variant="warning" icon="alert-triangle">Suggested</Badge>
  <Badge variant="danger" icon="x">Unresolved</Badge>
  <Badge variant="info" icon="info">Info</Badge>
</p>

<h2>Spinner</h2>
<Spinner label="Loading workouts" size="1.5em" />

<style>
  .stack {
    display: grid;
    gap: var(--space-3);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .list > li + li {
    border-block-start: var(--border-w) solid var(--color-border);
    margin-inline-start: var(--space-4);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
