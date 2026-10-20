<svelte:head><title>Charts · UI style guide · Workouts</title></svelte:head>

<script lang="ts">
  import LineChart, { type ChartPoint } from "#lib/components/charts/LineChart.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeader from "#lib/components/ui/PageHeader.svelte";

  const many: ChartPoint[] = [
    ["2026-07-06", 100],
    ["2026-07-20", 102.5],
    ["2026-08-03", 102.5],
    ["2026-08-24", 105],
    ["2026-09-07", 104],
    ["2026-09-28", 108.5],
    ["2026-10-12", 112.5],
  ].map(([date, value]) => ({ date: date as string, value: value as number }));
</script>

<PageHeader title="Charts" subtitle="Hand-rolled SVG line chart" back={{ href: "/dev/ui", label: "UI style guide" }} />

<h2>Several points</h2>
<Card><LineChart points={many} label="Estimated 1RM for Bench Press" unit="kg" /></Card>

<h2>Flat series</h2>
<Card>
  <LineChart
    points={[
      { date: "2026-09-01", value: 60 },
      { date: "2026-09-15", value: 60 },
    ]}
    label="Max weight for Squat"
    unit="kg"
  />
</Card>

<h2>Single point</h2>
<Card><LineChart points={[{ date: "2026-10-12", value: 112.5 }]} label="Estimated 1RM for Bench Press" unit="kg" /></Card>

<h2>Empty</h2>
<Card><LineChart points={[]} label="Estimated 1RM for Bench Press" unit="kg" /></Card>
