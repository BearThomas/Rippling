<!--
  板块详情页（/block/:id）

  功能：
    1. 板块信息：名称 / 描述 / 锁定提示
    2. 按权限显示的操作按钮区：
       - 成员：发帖（block_create_post）、退出板块（owner 不可退出）
       - 非成员：申请加入（已申请则显示待审核状态）
       - owner / manage_block：管理入口
       - manage_block：锁定 / 解锁；block_delete 或 manage_block：删除板块
    3. 板块帖子流：GET /api/block/posts，offset 分页 + IntersectionObserver 无限滚动
    4. 管理面板（页面内 tab 切换）：成员 / 申请 / 黑名单 / 设置
       （转让板块、删除板块在"设置"tab；成员权限编辑使用 PermissionEditor 弹窗）

  锁定板块：普通成员仍可访问，但发帖等写操作按钮禁用并提示。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import PostCard from "../components/post/PostCard.vue";
import MemberItem from "../components/block/MemberItem.vue";
import JoinRequestItem from "../components/block/JoinRequestItem.vue";
import PermissionEditor from "../components/block/PermissionEditor.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
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
import { getMyPermissions } from "../utils/myPermissions";
import {
  BLOCK_PERM_CREATE_POST,
  BLOCK_PERM_DELETE,
  BLOCK_PERM_MANAGE_MEMBER,
  PERM_MANAGE_BLOCK,
  hasPermission,
} from "../utils/permission";
import type { BlockDetailInfo, PostAuthor } from "../types";

/** 板块帖子流条目的最小数据结构（与 PostCard 兼容） */
interface BlockPostItem {
  id: string;
  title: string | null;
  content: string;
  /** 匿名时为 null */
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

/** 每页帖子数 */
const PAGE_SIZE = 20;

// ------------------------------------------------------------
//  板块信息状态
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);
const block = ref<BlockDetailInfo | null>(null);

/** 当前用户全站权限掩码（十进制字符串） */
const globalPerms = ref("0");
/** 是否已提交过本板块的加入申请（待审核） */
const applied = ref(false);
/** 申请进行中 */
const applying = ref(false);
/** 操作按钮进行中（锁定 / 解锁等） */
const actionBusy = ref(false);

// ------------------------------------------------------------
//  帖子流状态
// ------------------------------------------------------------

const posts = ref<BlockPostItem[]>([]);
const postsError = ref(false);
const loadingMore = ref(false);
const noMore = ref(false);

/** 底部哨兵元素（IntersectionObserver 监听目标） */
const sentinelEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

// ------------------------------------------------------------
//  管理面板状态
// ------------------------------------------------------------

/** 页面视图：帖子流 / 管理面板 */
const viewMode = ref<"posts" | "manage">("posts");
/** 管理面板当前 tab */
const manageTab = ref<"members" | "requests" | "blacklist" | "settings">("members");

const members = ref<BlockMemberInfo[]>([]);
const membersLoading = ref(false);
const requests = ref<BlockJoinRequestInfo[]>([]);
const requestsLoading = ref(false);
const blacklist = ref<BlockBlacklistEntry[]>([]);
const blacklistLoading = ref(false);

/** 权限编辑弹窗状态 */
const permEditorVisible = ref(false);
const permEditorTarget = ref<BlockMemberInfo | null>(null);
const permSaving = ref(false);

/** 转让板块选择的新 owner */
const transferTargetId = ref("");
/** 管理操作进行中（移除 / 审批 / 黑名单 / 转让） */
const manageBusy = ref(false);

// ------------------------------------------------------------
//  权限计算
// ------------------------------------------------------------

/** 是否为板块长 */
const isOwner = computed(() => block.value?.myRole === "owner");

/** 全站 manage_block 权限 */
const hasGlobalManage = computed(() => hasPermission(globalPerms.value, PERM_MANAGE_BLOCK));

/** 是否显示管理入口（owner / 全站 manage_block / 板块级成员管理权限） */
const canManage = computed(() => {
  if (!block.value) return false;
  return (
    isOwner.value ||
    hasGlobalManage.value ||
    (block.value.myPermissions !== null &&
      hasPermission(block.value.myPermissions, BLOCK_PERM_MANAGE_MEMBER))
  );
});

/** 是否可发帖（成员 + 板块发帖权限 + 板块未锁定） */
const canCreatePost = computed(() => {
  if (!block.value || !block.value.isMember || block.value.isLocked) return false;
  return (
    block.value.myPermissions !== null &&
    hasPermission(block.value.myPermissions, BLOCK_PERM_CREATE_POST)
  );
});

/** 是否可锁定 / 解锁（后端要求全站 manage_block） */
const canLock = computed(() => hasGlobalManage.value);

/** 是否可删除板块（全站 manage_block 或板块级 block_delete） */
const canDelete = computed(() => {
  if (!block.value) return false;
  return (
    hasGlobalManage.value ||
    (block.value.myPermissions !== null &&
      hasPermission(block.value.myPermissions, BLOCK_PERM_DELETE))
  );
});

/** 可转让对象：非 owner 的成员列表 */
const transferCandidates = computed(() => members.value.filter((m) => m.role !== "owner"));

// ------------------------------------------------------------
//  数据加载
// ------------------------------------------------------------

/** 加载板块详情 + 全站权限 + 申请状态 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    block.value = await getBlockDetail(blockId);
    // 全站权限与待审申请并发拉取（失败不阻塞主流程）
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

/** 拉取第一页帖子 */
async function loadPosts(): Promise<void> {
  postsError.value = false;
  noMore.value = false;
  try {
    const data = await getBlockPosts<BlockPostItem>(blockId, PAGE_SIZE, 0);
    posts.value = data.posts;
    noMore.value = data.posts.length < PAGE_SIZE;
  } catch {
    postsError.value = true;
  }
}

/** 加载下一页帖子（offset 分页，防重复触发） */
async function loadMorePosts(): Promise<void> {
  if (loadingMore.value || noMore.value || postsError.value) return;
  loadingMore.value = true;
  try {
    const data = await getBlockPosts<BlockPostItem>(blockId, PAGE_SIZE, posts.value.length);
    posts.value.push(...data.posts);
    if (data.posts.length < PAGE_SIZE) noMore.value = true;
  } catch {
    // silentError 已设置，这里仅停止加载（重试入口见模板）
  } finally {
    loadingMore.value = false;
  }
}

/** 无限滚动观察器 */
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

// ------------------------------------------------------------
//  板块操作
// ------------------------------------------------------------

/** 申请加入板块 */
async function handleJoin(): Promise<void> {
  if (applying.value || applied.value) return;
  applying.value = true;
  try {
    await joinBlock(blockId);
    applied.value = true;
    showToast("申请已提交，等待审核", "success");
  } catch {
    // client.ts 已自动 Toast（黑名单 / 已是成员由后端 404 兜底）
  } finally {
    applying.value = false;
  }
}

/** 退出板块（owner 不显示此按钮） */
async function handleLeave(): Promise<void> {
  if (!window.confirm("确定退出该板块吗？")) return;
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

/** 锁定 / 解锁板块 */
async function handleToggleLock(): Promise<void> {
  if (!block.value) return;
  const willLock = !block.value.isLocked;
  if (!window.confirm(willLock ? "确定锁定该板块吗？锁定后非成员不可见。" : "确定解锁该板块吗？"))
    return;
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

/** 删除板块（二次确认，成功后跳回列表） */
async function handleDelete(): Promise<void> {
  if (!window.confirm("确定删除该板块吗？删除后不可恢复。")) return;
  actionBusy.value = true;
  try {
    await deleteBlock(blockId);
    showToast("板块已删除", "success");
    router.replace({ name: "blocks" });
  } catch {
    actionBusy.value = false;
  }
}

/** 跳转发帖页 */
function goCreatePost(): void {
  if (block.value?.isLocked) {
    showToast("板块已锁定，无法发帖", "error");
    return;
  }
  router.push({ name: "post-create", query: { blockId } });
}

/** 进入 / 退出管理面板 */
function enterManage(): void {
  viewMode.value = "manage";
  void loadMembers();
  void loadRequests();
}

function exitManage(): void {
  viewMode.value = "posts";
}

// ------------------------------------------------------------
//  管理面板：数据加载
// ------------------------------------------------------------

async function loadMembers(): Promise<void> {
  membersLoading.value = true;
  try {
    members.value = await getBlockMembers(blockId);
  } catch {
    // 无权限时后端 404，client 已 Toast
  } finally {
    membersLoading.value = false;
  }
}

async function loadRequests(): Promise<void> {
  requestsLoading.value = true;
  try {
    requests.value = await getJoinRequests(blockId);
  } catch {
    // 无权限时后端 404
  } finally {
    requestsLoading.value = false;
  }
}

async function loadBlacklist(): Promise<void> {
  blacklistLoading.value = true;
  try {
    blacklist.value = await getBlockBlacklist(blockId);
  } catch {
    // 无权限时后端 404
  } finally {
    blacklistLoading.value = false;
  }
}

/** 切换管理 tab（黑名单 / 设置 tab 首次进入时懒加载） */
function switchManageTab(tab: typeof manageTab.value): void {
  manageTab.value = tab;
  if (tab === "blacklist") void loadBlacklist();
  if (tab === "settings" && members.value.length === 0) void loadMembers();
}

// ------------------------------------------------------------
//  管理面板：成员操作
// ------------------------------------------------------------

/** 打开权限编辑弹窗 */
function openPermEditor(member: BlockMemberInfo): void {
  permEditorTarget.value = member;
  permEditorVisible.value = true;
}

/** 保存成员权限 */
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

/** 移除成员 */
async function handleRemoveMember(member: BlockMemberInfo): Promise<void> {
  if (!window.confirm(`确定移除成员「${member.username}」吗？`)) return;
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

/** 将成员加入黑名单（会同时移除其成员身份） */
async function handleBlacklistMember(member: BlockMemberInfo): Promise<void> {
  if (!window.confirm(`确定将「${member.username}」加入黑名单吗？该用户将无法再申请加入。`)) return;
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

// ------------------------------------------------------------
//  管理面板：申请审批
// ------------------------------------------------------------

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

// ------------------------------------------------------------
//  管理面板：黑名单
// ------------------------------------------------------------

async function handleRemoveBlacklist(entry: BlockBlacklistEntry): Promise<void> {
  if (!window.confirm(`确定将「${entry.username ?? "该用户"}」移出黑名单吗？`)) return;
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

// ------------------------------------------------------------
//  管理面板：转让板块
// ------------------------------------------------------------

async function handleTransfer(): Promise<void> {
  const target = members.value.find((m) => m.userId === transferTargetId.value);
  if (!target) {
    showToast("请选择新板块长", "error");
    return;
  }
  if (!window.confirm(`确定将板块转让给「${target.username}」吗？转让后你将变为普通成员。`))
    return;
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
  <div class="px-3 pb-10 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="板块不存在或无权访问" @retry="load" />

    <template v-else-if="block">
      <!-- ==================== 板块信息 ==================== -->
      <div class="card-base mb-3">
        <div class="flex items-center gap-2">
          <h2 class="min-w-0 flex-1 truncate text-lg font-bold">{{ block.name }}</h2>
          <span
            v-if="block.isLocked"
            class="flex shrink-0 items-center gap-0.5 rounded bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] px-1.5 py-0.5 text-[10px] text-accent"
          >
            <AppSvgIcon name="lock" :size="10" />
            已锁定
          </span>
        </div>
        <p v-if="block.description" class="mt-2 text-sm leading-relaxed text-ink-soft">
          {{ block.description }}
        </p>
        <p v-if="block.isLocked" class="mt-2 text-xs text-ink-soft">
          板块已锁定，发帖等写操作暂不可用
        </p>

        <!-- 操作按钮区 -->
        <div class="mt-3 flex flex-wrap gap-2">
          <!-- 已加入：发帖 -->
          <button
            v-if="block.isMember"
            type="button"
            class="btn-primary !px-4 !py-2 text-sm disabled:opacity-50"
            :disabled="!canCreatePost || actionBusy"
            :title="!canCreatePost && block.isLocked ? '板块已锁定' : undefined"
            @click="goCreatePost"
          >
            发帖
          </button>

          <!-- 已加入：退出板块（owner 不可退出） -->
          <button
            v-if="block.isMember && !isOwner"
            type="button"
            class="btn-secondary !px-4 !py-2 text-sm"
            :disabled="actionBusy"
            @click="handleLeave"
          >
            退出板块
          </button>

          <!-- 未加入：申请加入 -->
          <button
            v-if="!block.isMember"
            type="button"
            class="btn-primary !px-4 !py-2 text-sm disabled:opacity-50"
            :disabled="applied || applying"
            @click="handleJoin"
          >
            {{ applying ? "申请中…" : applied ? "已申请，待审核" : "申请加入" }}
          </button>

          <!-- 管理入口（owner / manage_block / 成员管理权限） -->
          <button
            v-if="canManage && viewMode === 'posts'"
            type="button"
            class="btn-secondary !px-4 !py-2 text-sm"
            @click="enterManage"
          >
            管理
          </button>
          <button
            v-if="canManage && viewMode === 'manage'"
            type="button"
            class="btn-secondary !px-4 !py-2 text-sm"
            @click="exitManage"
          >
            返回帖子
          </button>

          <!-- 锁定 / 解锁（manage_block） -->
          <button
            v-if="canLock"
            type="button"
            class="btn-secondary !px-4 !py-2 text-sm"
            :disabled="actionBusy"
            @click="handleToggleLock"
          >
            {{ block.isLocked ? "解锁" : "锁定" }}
          </button>

          <!-- 删除板块（block_delete / manage_block） -->
          <button
            v-if="canDelete"
            type="button"
            class="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-500 transition-opacity active:opacity-80 disabled:opacity-50"
            :disabled="actionBusy"
            @click="handleDelete"
          >
            删除板块
          </button>
        </div>
      </div>

      <!-- ==================== 帖子流视图 ==================== -->
      <template v-if="viewMode === 'posts'">
        <div v-if="posts.length > 0" class="space-y-3">
          <PostCard v-for="post in posts" :key="post.id" :post="post" />
        </div>
        <EmptyState v-else-if="!postsError" icon="file" text="板块里还没有帖子" />
        <ErrorState v-if="postsError" message="帖子加载失败" @retry="loadPosts" />

        <!-- 底部哨兵 + 加载状态 -->
        <div ref="sentinelEl" class="py-4">
          <div v-if="loadingMore" class="text-center text-xs text-ink-soft">加载中…</div>
          <div v-else-if="noMore && posts.length > 0" class="text-center text-xs text-ink-soft">
            已经到底啦
          </div>
        </div>
      </template>

      <!-- ==================== 管理面板视图 ==================== -->
      <template v-if="viewMode === 'manage'">
        <!-- tab 切换 -->
        <div class="mb-3 flex gap-1 rounded-xl bg-line/60 p-1">
          <button
            v-for="tab in (['members', 'requests', 'blacklist', 'settings'] as const)"
            :key="tab"
            type="button"
            class="flex-1 rounded-lg py-1.5 text-sm transition-colors"
            :class="manageTab === tab ? 'bg-surface font-semibold text-primary' : 'text-ink-soft'"
            @click="switchManageTab(tab)"
          >
            {{ tab === "members" ? "成员" : tab === "requests" ? "申请" : tab === "blacklist" ? "黑名单" : "设置" }}
          </button>
        </div>

        <!-- 成员列表 -->
        <section v-if="manageTab === 'members'">
          <LoadingSpinner v-if="membersLoading" />
          <div v-else-if="members.length > 0" class="space-y-2">
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

        <!-- 申请列表 -->
        <section v-if="manageTab === 'requests'">
          <LoadingSpinner v-if="requestsLoading" />
          <div v-else-if="requests.length > 0" class="space-y-2">
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

        <!-- 黑名单列表 -->
        <section v-if="manageTab === 'blacklist'">
          <LoadingSpinner v-if="blacklistLoading" />
          <div v-else-if="blacklist.length > 0" class="space-y-2">
            <div
              v-for="entry in blacklist"
              :key="entry.id"
              class="card-base flex items-center gap-2 !py-3"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line text-sm font-semibold text-ink-soft"
              >
                {{ (entry.username || "?").slice(0, 1) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ entry.username || "未知用户" }}</p>
                <p v-if="entry.reason" class="mt-0.5 truncate text-xs text-ink-soft">
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
        <section v-if="manageTab === 'settings'" class="space-y-3">
          <div v-if="isOwner" class="card-base">
            <h3 class="mb-2 text-sm font-semibold">转让板块</h3>
            <p class="mb-2 text-xs text-ink-soft">从成员中选择新的板块长，转让后你将变为普通成员。</p>
            <select v-model="transferTargetId" class="input-base mb-2">
              <option value="" disabled>选择新板块长…</option>
              <option v-for="m in transferCandidates" :key="m.userId" :value="m.userId">
                {{ m.username }}
              </option>
            </select>
            <button
              type="button"
              class="btn-primary w-full !py-2 text-sm"
              :disabled="manageBusy || !transferTargetId"
              @click="handleTransfer"
            >
              确认转让
            </button>
          </div>
          <p v-else class="px-1 text-xs text-ink-soft">仅板块长可转让板块。</p>
        </section>
      </template>

      <!-- 权限编辑弹窗 -->
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
