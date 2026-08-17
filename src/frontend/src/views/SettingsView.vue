<!--
  设置页（骨架实现）

  当前仅展示修改密码入口与占位项，具体设置项后续任务完善。
-->
<script setup lang="ts">
import { ref } from "vue";
import { changePassword } from "../api/auth";
import { showToast } from "../utils/toast";

const currentPassword = ref("");
const newPassword = ref("");
const submitting = ref(false);

/** 修改密码 */
async function handleChangePassword(): Promise<void> {
  if (submitting.value) return;
  if (!currentPassword.value || newPassword.value.length < 8) {
    showToast("新密码至少 8 位", "error");
    return;
  }

  submitting.value = true;
  try {
    await changePassword(currentPassword.value, newPassword.value);
    showToast("密码修改成功", "success");
    currentPassword.value = "";
    newPassword.value = "";
  } catch (err) {
    showToast(err instanceof Error ? err.message : "修改失败", "error");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-3 px-3 pt-3">
    <!-- 修改密码 -->
    <section class="card-base">
      <h3 class="mb-3 font-semibold">修改密码</h3>
      <form class="space-y-3" @submit.prevent="handleChangePassword">
        <input
          v-model="currentPassword"
          type="password"
          class="input-base"
          placeholder="当前密码"
          autocomplete="current-password"
        />
        <input
          v-model="newPassword"
          type="password"
          class="input-base"
          placeholder="新密码（至少 8 位）"
          autocomplete="new-password"
        />
        <button type="submit" class="btn-primary w-full" :disabled="submitting">
          {{ submitting ? "提交中…" : "确认修改" }}
        </button>
      </form>
    </section>

    <!-- 占位项 -->
    <section class="card-base text-sm text-ink-soft">
      <p>用户名修改、昵称徽章、提问箱开关、账号注销等设置将在后续版本开放。</p>
    </section>
  </div>
</template>
