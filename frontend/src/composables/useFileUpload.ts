import { computed, ref } from "vue";
import type { UploadFileInfo } from "naive-ui";

import { uploadCredentials } from "@/api/credentials";
import type { CredMode } from "@/api/types";

export function useFileUpload(mode: CredMode, onDone: () => Promise<void>) {
  const fileList = ref<UploadFileInfo[]>([]);
  const uploading = ref(false);
  const progress = ref(0);

  const rawFiles = computed(() =>
    fileList.value
      .map((item) => item.file)
      .filter((file): file is File => Boolean(file)),
  );

  function acceptFile(info: UploadFileInfo) {
    const filename = info.name.toLowerCase();
    return filename.endsWith(".json") || filename.endsWith(".zip");
  }

  function clear() {
    fileList.value = [];
    progress.value = 0;
  }

  function setFileList(list: UploadFileInfo[]) {
    fileList.value = list.filter(acceptFile).slice(0, 500);
  }

  async function submit() {
    if (rawFiles.value.length === 0) {
      return null;
    }

    uploading.value = true;
    try {
      const result = await uploadCredentials(mode, rawFiles.value, (percent) => {
        progress.value = percent;
      });
      await onDone();
      clear();
      return result;
    } finally {
      uploading.value = false;
    }
  }

  return {
    fileList,
    uploading,
    progress,
    rawFiles,
    acceptFile,
    setFileList,
    clear,
    submit,
  };
}
