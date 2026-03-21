<template>
  <n-modal
    :show="show"
    to="body"
    display-directive="show"
    :block-scroll="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="app-modal-panel panel-shell upload-modal-shell">
      <div class="upload-modal-shell__header">
        <div class="upload-modal-shell__hero">
          <p class="upload-modal-shell__eyebrow">Credential Import</p>
          <h3 class="upload-modal-shell__title">导入凭证</h3>
          <p class="upload-modal-shell__desc">
            支持拖拽或批量选择 `.json` 与 `.zip` 文件，上传完成后会自动刷新当前列表。
          </p>
        </div>
        <button type="button" class="app-modal-close upload-modal-shell__close" @click="emit('update:show', false)">
          关闭
        </button>
      </div>

      <div class="upload-modal-shell__content">
        <cred-upload :upload="upload" @success="emit('update:show', false)" />
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { NModal, type UploadFileInfo } from "naive-ui";

import CredUpload from "@/components/credentials/CredUpload.vue";

defineProps<{
  show: boolean;
  upload: {
    fileList: UploadFileInfo[];
    uploading: boolean;
    progress: number;
    acceptFile: (info: UploadFileInfo) => boolean;
    setFileList: (list: UploadFileInfo[]) => void;
    clear: () => void;
    submit: () => Promise<unknown>;
  };
}>();

const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
}>();
</script>

<style scoped>
.upload-modal-shell {
  width: min(780px, calc(100vw - 1.5rem));
}

.upload-modal-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.upload-modal-shell__hero {
  min-width: 0;
  flex: 1;
}

.upload-modal-shell__eyebrow {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.upload-modal-shell__title {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.4;
  font-weight: 700;
  color: var(--strong-text);
}

.upload-modal-shell__desc {
  margin: 10px 0 0;
  max-width: 620px;
  font-size: 0.92rem;
  line-height: 1.72;
  color: var(--muted-text);
}

.upload-modal-shell__close {
  flex: 0 0 auto;
  min-width: 92px;
}

.upload-modal-shell__content {
  min-width: 0;
}

.upload-modal-shell__content :deep(.panel-embedded) {
  border-radius: 24px;
}

@media (max-width: 640px) {
  .upload-modal-shell {
    width: min(100vw - 1rem, 100%);
  }

  .upload-modal-shell__header {
    flex-direction: column;
    align-items: stretch;
  }

  .upload-modal-shell__close {
    width: 100%;
  }
}
</style>
