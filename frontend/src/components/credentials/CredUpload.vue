<template>
  <div class="panel-embedded">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-base font-semibold app-text-strong">上传凭证</h3>
          <p class="text-sm app-text-muted">支持 `.json` 与 `.zip`，后端会自动解包 ZIP 内 JSON。</p>
        </div>
        <div class="flex gap-2">
          <n-button secondary @click="upload.clear">
            <template #icon><app-icon name="reset" /></template>
            清空
          </n-button>
          <n-button type="primary" :loading="upload.uploading" @click="submit">
            <template #icon><app-icon name="upload" /></template>
            开始上传
          </n-button>
        </div>
      </div>

      <n-upload
        :file-list="upload.fileList"
        multiple
        directory-dnd
        :default-upload="false"
        accept=".json,.zip"
        :on-before-upload="handleBeforeUpload"
        @update:file-list="upload.setFileList"
      >
        <n-upload-dragger>
          <div class="py-6">
            <p class="text-base font-medium app-text-strong">拖拽文件到这里，或点击选择</p>
            <p class="mt-2 text-sm app-text-muted">最多 500 个文件，建议分批上传。</p>
          </div>
        </n-upload-dragger>
      </n-upload>

      <n-progress
        v-if="upload.uploading || upload.progress > 0"
        type="line"
        :percentage="upload.progress"
        :indicator-placement="'inside'"
        processing
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton, NProgress, NUpload, NUploadDragger, type UploadFileInfo } from "naive-ui";

import AppIcon from "@/components/common/AppIcon.vue";
import { message } from "@/utils/feedback";

const props = defineProps<{
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
  (event: "success"): void;
}>();

function handleBeforeUpload(data: { file: UploadFileInfo }) {
  if (props.upload.acceptFile(data.file)) {
    return true;
  }
  message.error(`文件 ${data.file.name} 格式不支持`);
  return false;
}

async function submit() {
  const result = await props.upload.submit();
  if (result) {
    const info = result as { uploaded_count?: number; total_count?: number; message?: string };
    message.success(info.message || `成功上传 ${info.uploaded_count}/${info.total_count} 个文件`);
    emit("success");
  } else {
    message.warning("请先选择文件");
  }
}
</script>
