<!--
  板块详情页（/block/:id）

  Elk 无边框信息流 + 紧凑管理面板：
    - 顶栏板块信息改为通栏分割头，低频/危险操作收口至 AppDropdown
    - 帖子流改为 1px 分割线流（FeedSkeleton 骨架加载）
    - 管理面板改用 AppTabs（reka-ui Tabs）、MemberItem（AppDropdown）、
      PermissionEditor（AppDialog + AppSwitch）、AppSelect（转让目标）
    - 全部 7 处原生 window.confirm 替换为全局 ConfirmDialog
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import PostCard from "../components/post/PostCard.vue";
import MemberItem from "../components/block/MemberItem.vue";
import JoinRequestItem from "../components/block/JoinRequestItem.vue";
import PermissionEditor from "../components/block/PermissionEditor.vue";
import AppDropdown, { type DropdownItem } from "../components/common/AppDropdown.vue";
import AppSelect, { type SelectOptionItem } from "../components/common/AppSelect.vue";
import AppTabs, { type TabOption } from "../components/common/AppTabs.vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import UserAvatar from "../components/user/UserAvatar.vue";
import {
  addToBlacklist,
  approveJoin,
  deleteBlock,
  getBlockBlacklist,
  getBlockDetail,
  getBlockMembers,
  getBlockPosts,
  getJoinRequests,
  getMyPendingRequests,
  joinBlock,
  leaveBlock,
  lockBlock,
  rejectJoin,
  removeFromBlacklist,
  removeMember,
  transferOwnership,
  unlockBlock,
  updateMemberPermissions,
} from "../api/block";
import type {
  BlockBlacklistEntry,
  BlockJoinRequestInfo,
  BlockMemberInfo,
} from "../api/block";
import { showToast } from "../utils/toast";
import { confirmAction } from "../composables/useConfirm";
import { getMyPermissions } from "../utils/myPermissions";
import {
  BLOCK_PERM_CREATE_POST,
  BLOCK_PERM_DELETE,
  BLOCK_PERM_MANAGE_MEMBER,
  PERM_MANAGE_BLOCK,
  hasPermission,
} from "../utils/permission";
import type { BlockDetailInfo, PostAuthor } from "../types";

interface BlockPostItem {
  id: string;
  title: string | null;
  content: string;
  author?: PostAuthor | null;
  createdAt: string;
  likeCount?: number;
  commentCount?: number;
  isPinned?: boolean;
  liked?: boolean;
}

const route = useRoute();
const router = useRouter();
const blockId = route.params.id as string;

const PAGE_SIZE = 20;

const loading = shallowRef(true);
const error = shallowRef(false);
const block = ref<BlockDetailInfo | null>(null);

const globalPerms = shallowRef("0");
const applied = shallowRef(false);
const applying = shallowRef(false);
const actionBusy = shallowRef(false);

const posts = ref<BlockPostItem[]>([]);
const postsLoading = shallowRef(true);
const postsError = shallowRef(false);
const loadingMore = shallowRef(false);
const noMore = shallowRef(false);

const sentinelEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const viewMode = shallowRef<"posts" | "manage">("posts");
const manageTab = shallowRef<"members" | "requests" | "blacklist" | "settings">("members");

const members = ref<BlockMemberInfo[]>([]);
const membersLoading = shallowRef(false);
const requests = ref<BlockJoinRequestInfo[]>([]);
const requestsLoading = shallowRef(false);
const blacklist = ref<BlockBlacklistEntry[]>([]);
const blacklistLoading = shallowRef(false);

const permEditorVisible = shallowRef(false);
const permEditorTarget = ref<BlockMemberInfo | null>(null);
const permSaving = shallowRef(false);

const transferTargetId = shallowRef("");
const manageBusy = shallowRef(false);

const isOwner = computed(() => block.value?.myRole === "owner");
const hasGlobalManage = computed(() => hasPermission(globalPerms.value, PERM_MANAGE_BLOCK));

const canManage = computed(() => {
  if (!block.value) return false;
  return (
    isOwner.value ||
    hasGlobalManage.value ||
    (block.value.myPermissions !== null &&
      hasPermission(block.value.myPermissions, BLOCK_PERM_MANAGE_MEMBER))
  );
});

const canCreatePost = computed(() => {
  if (!block.value || !block.value.isMember || block.value.isLocked) return false;
  return (
    block.value.myPermissions !== null &&
    hasPermission(block.value.myPermissions, BLOCK_PERM_CREATE_POST)
  );
});

const canLock = computed(() => hasGlobalManage.value);

const canDelete = computed(() => {
  if (!block.value) return false;
  return (
    hasGlobalManage.value ||
    (block.value.myPermissions !== null &&
      hasPermission(block.value.myPermissions, BLOCK_PERM_DELETE))
  );
});

const blockMoreMenu = computed<DropdownItem[]>(() => {
  if (!block.value) return [];
  const items: DropdownItem[] = [];
  if (canLock.value) {
    items.push({
      key: "lock",
      label: block.value.isLocked ? "解锁板块" : "锁定板块",
      icon: "lock",
      disabled: actionBusy.value,
    });
  }
  if (block.value.isMember && !isOwner.value) {
    items.push({
      key: "leave",
      label: "退出板块",
      icon: "logout",
      disabled: actionBusy.value,
      separatorBefore: items.length > 0,
    });
  }
  if (canDelete.value) {
    items.push({
      key: "delete",
      label: "删除板块",
      icon: "trash",
      danger: true,
      disabled: actionBusy.value,
      separatorBefore: items.length > 0,
    });
  }
  return items;
});

const manageTabItems = computed<TabOption[]>(() => [
  { value: "members", label: "成员", count: members.value.length || undefined },
  { value: "requests", label: "申请", count: requests.value.length || undefined },
  { value: "blacklist", label: "黑名单", count: blacklist.value.length || undefined },
  { value: "settings", label: "设置" },
]);

const transferOptions = computed<SelectOptionItem[]>(() =>
  members.value
    .filter((m) => m.role !== "owner")
    .map((m) => ({ value: m.userId, label: m.username }))
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    block.value = await getBlockDetail(blockId);
    const [, pending] = await Promise.all([
      getMyPermissions().then((p) => {
        globalPerms.value = p;
      }),
      getMyPendingRequests().catch(() => [] as string[]),
    ]);
    applied.value = pending.includes(blockId);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadPosts(): Promise<void> {
  postsLoading.value = true;
  postsError.value = false;
  noMore.value = false;
  try {
    const data = await getBlockPosts<BlockPostItem>(blockId, PAGE_SIZE, 0);
    posts.value = data.posts;
    noMore.value = data.posts.length < PAGE_SIZE;
  } catch {
    postsError.value = true;
  } finally {
    postsLoading.value = false;
  }
}

async function loadMorePosts(): Promise<void> {
  if (loadingMore.value || noMore.value || postsError.value) return;
  loadingMore.value = true;
  try {
    const data = await getBlockPosts<BlockPostItem>(blockId, PAGE_SIZE, posts.value.length);
    posts.value.push(...data.posts);
    if (data.posts.length < PAGE_SIZE) noMore.value = true;
  } catch {
    // 静默停止
  } finally {
    loadingMore.value = false;
  }
}

function setupObserver(): void {
  if (!sentinelEl.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMorePosts();
      }
    },
    { rootMargin: "200px 0px" }
  );
  observer.observe(sentinelEl.value);
}

onMounted(async () => {
  await load();
  if (block.value) {
    await loadPosts();
    setupObserver();
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

async function handleJoin(): Promise<void> {
  if (applying.value || applied.value) return;
  applying.value = true;
  try {
    await joinBlock(blockId);
    applied.value = true;
    showToast("申请已提交，等待审核", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    applying.value = false;
  }
}

async function handleLeave(): Promise<void> {
  const confirmed = await confirmAction({
    title: "确定退出该板块吗？",
    description: "退出后将失去成员权限，锁定板块需重新申请才能进入。",
    confirmText: "退出板块",
    variant: "danger",
  });
  if (!confirmed) return;

  actionBusy.value = true;
  try {
    await leaveBlock(blockId);
    showToast("已退出板块", "success");
    await load();
    await loadPosts();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    actionBusy.value = false;
  }
}

async function handleToggleLock(): Promise<void> {
  if (!block.value) return;
  const willLock = !block.value.isLocked;
  const confirmed = await confirmAction({
    title: willLock ? "确定锁定该板块吗？" : "确定解锁该板块吗？",
    description: willLock
      ? "锁定后非成员不可见，且暂停发帖等写操作。"
      : "解锁后将恢复板块正常访问与发帖。",
    confirmText: willLock ? "锁定" : "解锁",
  });
  if (!confirmed) return;

  actionBusy.value = true;
  try {
    if (willLock) {
      await lockBlock(blockId);
      showToast("板块已锁定", "success");
    } else {
      await unlockBlock(blockId);
      showToast("板块已解锁", "success");
    }
    await load();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    actionBusy.value = false;
  }
}

async function handleDelete(): Promise<void> {
  const confirmed = await confirmAction({
    title: "确定删除该板块吗？",
    description: "此操作不可恢复，请谨慎确认。",
    confirmText: "删除板块",
    variant: "danger",
  });
  if (!confirmed) return;

  actionBusy.value = true;
  try {
    await deleteBlock(blockId);
    showToast("板块已删除", "success");
    void router.replace({ name: "blocks" });
  } catch {
    actionBusy.value = false;
  }
}

function onSelectBlockAction(key: string): void {
  if (key === "lock") void handleToggleLock();
  else if (key === "leave") void handleLeave();
  else if (key === "delete") void handleDelete();
}

function goCreatePost(): void {
  if (block.value?.isLocked) {
    showToast("板块已锁定，无法发帖", "error");
    return;
  }
  void router.push({ name: "post-create", query: { blockId } });
}

function enterManage(): void {
  viewMode.value = "manage";
  void loadMembers();
  void loadRequests();
}

function exitManage(): void {
  viewMode.value = "posts";
}

async function loadMembers(): Promise<void> {
  membersLoading.value = true;
  try {
    members.value = await getBlockMembers(blockId);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    membersLoading.value = false;
  }
}

async function loadRequests(): Promise<void> {
  requestsLoading.value = true;
  try {
    requests.value = await getJoinRequests(blockId);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    requestsLoading.value = false;
  }
}

async function loadBlacklist(): Promise<void> {
  blacklistLoading.value = true;
  try {
    blacklist.value = await getBlockBlacklist(blockId);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    blacklistLoading.value = false;
  }
}

function switchManageTab(tab: string): void {
  const next = tab as "members" | "requests" | "blacklist" | "settings";
  manageTab.value = next;
  if (next === "blacklist") void loadBlacklist();
  if (next === "settings" && members.value.length === 0) void loadMembers();
}

function openPermEditor(member: BlockMemberInfo): void {
  permEditorTarget.value = member;
  permEditorVisible.value = true;
}

async function savePermissions(permissions: string): Promise<void> {
  const target = permEditorTarget.value;
  if (!target) return;
  permSaving.value = true;
  try {
    await updateMemberPermissions(blockId, target.userId, permissions);
    showToast("权限已更新", "success");
    permEditorVisible.value = false;
    await loadMembers();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    permSaving.value = false;
  }
}

async function handleRemoveMember(member: BlockMemberInfo): Promise<void> {
  const confirmed = await confirmAction({
    title: `移除成员「${member.username}」？`,
    description: "移除后对方将不再是该板块成员。",
    confirmText: "移除",
    variant: "danger",
  });
  if (!confirmed) return;

  manageBusy.value = true;
  try {
    await removeMember(blockId, member.userId);
    showToast("已移除成员", "success");
    await loadMembers();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    manageBusy.value = false;
  }
}

async function handleBlacklistMember(member: BlockMemberInfo): Promise<void> {
  const confirmed = await confirmAction({
    title: `将「${member.username}」加入黑名单？`,
    description: "该用户将被移除成员身份且无法再申请加入本板块。",
    confirmText: "加入黑名单",
    variant: "danger",
  });
  if (!confirmed) return;

  manageBusy.value = true;
  try {
    await addToBlacklist(blockId, member.userId);
    showToast("已加入黑名单", "success");
    await Promise.all([loadMembers(), loadBlacklist()]);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    manageBusy.value = false;
  }
}

async function handleApprove(request: BlockJoinRequestInfo): Promise<void> {
  manageBusy.value = true;
  try {
    await approveJoin(blockId, request.userId);
    showToast("已批准加入", "success");
    requests.value = requests.value.filter((r) => r.id !== request.id);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    manageBusy.value = false;
  }
}

async function handleReject(request: BlockJoinRequestInfo): Promise<void> {
  manageBusy.value = true;
  try {
    await rejectJoin(blockId, request.userId);
    showToast("已拒绝申请", "success");
    requests.value = requests.value.filter((r) => r.id !== request.id);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    manageBusy.value = false;
  }
}

async function handleRemoveBlacklist(entry: BlockBlacklistEntry): Promise<void> {
  const confirmed = await confirmAction({
    title: `将「${entry.username ?? "该用户"}」移出黑名单？`,
    confirmText: "移出黑名单",
  });
  if (!confirmed) return;

  manageBusy.value = true;
  try {
    await removeFromBlacklist(blockId, entry.userId);
    showToast("已移出黑名单", "success");
    blacklist.value = blacklist.value.filter((b) => b.id !== entry.id);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    manageBusy.value = false;
  }
}

async function handleTransfer(): Promise<void> {
  const target = members.value.find((m) => m.userId === transferTargetId.value);
  if (!target) {
    showToast("请选择新板块长", "error");
    return;
  }
  const confirmed = await confirmAction({
    title: `将板块转让给「${target.username}」？`,
    description: "转让后你将变为普通成员，不再拥有板块长权限。",
    confirmText: "确认转让",
    variant: "danger",
  });
  if (!confirmed) return;

  manageBusy.value = true;
  try {
    await transferOwnership(blockId, target.userId);
    showToast("板块已转让", "success");
    transferTargetId.value = "";
    await Promise.all([load(), loadMembers()]);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    manageBusy.value = false;
  }
}
</script>

<template>
  <div class="pb-10">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="板块不存在或无权访问" @retry="load" />

    <template v-else-if="block">
      <!-- 板块通栏头 -->
      <header class="border-b border-subtle px-4 py-4 sm:px-6">
        <div class="flex items-start gap-3">
          <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canvas-soft text-primary"
          >
            <AppSvgIcon name="blocks" :size="20" />
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-xl font-bold leading-7 text-ink">
                {{ block.name }}
              </h2>
              <span v-if="block.isLocked" class="tag-pill">
                <AppSvgIcon name="lock" :size="11" />
                已锁定
              </span>
            </div>
            <p v-if="block.description" class="mt-1 text-sm leading-relaxed text-ink-secondary">
              {{ block.description }}
            </p>
            <p v-if="block.isLocked" class="mt-1.5 text-xs text-ink-muted">
              板块已锁定，发帖等写操作暂不可用
            </p>
          </div>
        </div>

        <!-- 主操作与更多菜单 -->
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            v-if="block.isMember"
            type="button"
            class="btn-primary !px-4 !py-2 text-sm"
            :disabled="!canCreatePost || actionBusy"
            :title="!canCreatePost && block.isLocked ? '板块已锁定' : undefined"
            @click="goCreatePost"
          >
            <AppSvgIcon name="penLine" :size="15" />
            发帖
          </button>

          <button
            v-else
            type="button"
            class="btn-primary !px-4 !py-2 text-sm"
            :disabled="applied || applying"
            @click="handleJoin"
          >
            {{ applying ? "申请中…" : applied ? "已申请，待审核" : "申请加入" }}
          </button>

          <button
            v-if="canManage && viewMode === 'posts'"
            type="button"
            class="btn-secondary !px-3.5 !py-2 text-sm"
            @click="enterManage"
          >
            <AppSvgIcon name="sliders" :size="15" />
            管理板块
          </button>

          <button
            v-if="canManage && viewMode === 'manage'"
            type="button"
            class="btn-secondary !px-3.5 !py-2 text-sm"
            @click="exitManage"
          >
            <AppSvgIcon name="back" :size="15" />
            返回帖子
          </button>

          <div v-if="blockMoreMenu.length > 0" class="ml-auto">
            <AppDropdown
              :items="blockMoreMenu"
              trigger-label="板块更多操作"
              @select="onSelectBlockAction"
            />
          </div>
        </div>
      </header>

      <!-- 帖子流视图 -->
      <template v-if="viewMode === 'posts'">
        <FeedSkeleton v-if="postsLoading" variant="elk" :count="4" />
        <template v-else>
          <div v-if="posts.length > 0">
            <PostCard v-for="post in posts" :key="post.id" :post="post" />
          </div>
          <EmptyState
            v-else-if="!postsError"
            icon="file"
            text="板块里还没有帖子"
            description="成为第一个在这个板块发声的人吧。"
          />
          <ErrorState v-if="postsError" message="帖子加载失败" @retry="loadPosts" />

          <div ref="sentinelEl" class="py-5 text-center">
            <div v-if="loadingMore" class="text-xs text-ink-muted">加载中…</div>
            <div v-else-if="noMore && posts.length > 0" class="text-xs text-ink-muted">
              已经到底啦
            </div>
          </div>
        </template>
      </template>

      <!-- 管理面板视图 -->
      <template v-else>
        <AppTabs
          :model-value="manageTab"
          :items="manageTabItems"
          variant="underline"
          stretch
          aria-label="板块管理分类"
          @update:model-value="switchManageTab"
        />

        <!-- 成员 -->
        <section v-if="manageTab === 'members'">
          <LoadingSpinner v-if="membersLoading" />
          <div v-else-if="members.length > 0">
            <MemberItem
              v-for="member in members"
              :key="member.userId"
              :member="member"
              @edit-permissions="openPermEditor(member)"
              @remove="handleRemoveMember(member)"
              @blacklist="handleBlacklistMember(member)"
            />
          </div>
          <EmptyState v-else icon="users" text="暂无成员" />
        </section>

        <!-- 申请 -->
        <section v-if="manageTab === 'requests'">
          <LoadingSpinner v-if="requestsLoading" />
          <div v-else-if="requests.length > 0">
            <JoinRequestItem
              v-for="request in requests"
              :key="request.id"
              :request="request"
              :busy="manageBusy"
              @approve="handleApprove(request)"
              @reject="handleReject(request)"
            />
          </div>
          <EmptyState v-else icon="inbox" text="暂无待审核的申请" />
        </section>

        <!-- 黑名单 -->
        <section v-if="manageTab === 'blacklist'">
          <LoadingSpinner v-if="blacklistLoading" />
          <div v-else-if="blacklist.length > 0">
            <div
              v-for="entry in blacklist"
              :key="entry.id"
              class="flex items-center gap-3 border-b border-subtle px-4 py-3 sm:px-5"
            >
              <UserAvatar :name="entry.username || '?'" size="md" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">
                  {{ entry.username || "未知用户" }}
                </p>
                <p v-if="entry.reason" class="mt-0.5 truncate text-xs text-ink-muted">
                  原因：{{ entry.reason }}
                </p>
              </div>
              <button
                type="button"
                class="btn-secondary shrink-0 !px-3 !py-1.5 text-xs"
                :disabled="manageBusy"
                @click="handleRemoveBlacklist(entry)"
              >
                移出黑名单
              </button>
            </div>
          </div>
          <EmptyState v-else icon="shield" text="黑名单为空" />
        </section>

        <!-- 设置：转让板块 -->
        <section v-if="manageTab === 'settings'" class="px-4 py-4 sm:px-6">
          <div v-if="isOwner" class="card-base space-y-3">
            <div>
              <h3 class="text-sm font-semibold text-ink">转让板块</h3>
              <p class="mt-1 text-xs text-ink-muted">
                从成员中选择新的板块长，转让后你将变为普通成员。
              </p>
            </div>
            <AppSelect
              v-model="transferTargetId"
              :options="transferOptions"
              placeholder="选择新板块长…"
              aria-label="选择新板块长"
            />
            <button
              type="button"
              class="btn-primary w-full !py-2 text-sm"
              :disabled="manageBusy || !transferTargetId"
              @click="handleTransfer"
            >
              确认转让
            </button>
          </div>
          <EmptyState
            v-else
            icon="shield"
            text="仅板块长可转让板块"
            description="如需移交权限，请联系当前板块长操作。"
          />
        </section>
      </template>

      <!-- 权限编辑弹窗（AppDialog + AppSwitch） -->
      <PermissionEditor
        :visible="permEditorVisible"
        :username="permEditorTarget?.username ?? ''"
        :permissions="permEditorTarget?.permissions ?? '0'"
        :saving="permSaving"
        @save="savePermissions"
        @close="permEditorVisible = false"
      />
    </template>
  </div>
</template>
