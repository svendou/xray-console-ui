<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { AlertTriangle, X } from 'lucide-vue-next'
const props = defineProps<{ open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean }>()
const emit = defineEmits<{ close: []; confirm: [] }>()
const dialog = ref<HTMLDialogElement>()
let previous: HTMLElement | null = null
watch(() => props.open, async value => {
  await nextTick()
  if (value) { previous = document.activeElement as HTMLElement; dialog.value?.showModal() }
  else { dialog.value?.close(); previous?.focus() }
})
</script>
<template>
  <dialog ref="dialog" class="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message" @cancel.prevent="emit('close')" @click="e => { if (e.target === dialog) emit('close') }">
    <div class="dialog-top"><span class="dialog-icon" :class="{ warning: danger }"><AlertTriangle :size="23" /></span><button class="icon-button" aria-label="关闭确认窗口" @click="emit('close')"><X :size="20" /></button></div>
    <h2 id="confirm-title">{{ title }}</h2><p id="confirm-message">{{ message }}</p>
    <div class="dialog-actions"><button class="button secondary" autofocus @click="emit('close')">取消</button><button class="button" :class="danger ? 'danger' : 'primary'" @click="emit('confirm')">{{ confirmLabel || '确认执行' }}</button></div>
  </dialog>
</template>
