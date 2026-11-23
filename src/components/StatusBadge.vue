<script setup lang="ts">
import { stateLabel } from '../store'
defineProps<{ state: string }>()
</script>
<template><span class="status-badge" :class="state"><span class="status-dot" />{{ stateLabel(state) }}</span></template>
