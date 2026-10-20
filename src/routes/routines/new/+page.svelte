<script lang="ts">
  import RoutineEditor from "#lib/components/routines/RoutineEditor.svelte";
  import { newRoutine } from "#lib/routines/edit";

  const initial = newRoutine("");
</script>

<RoutineEditor {initial} isNew />
