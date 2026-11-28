<!--
  管理面板 — 数据库子面板（克制工具页：只读 SQL 查询 + 无边框表列表 + 紧凑数据表）

  - SQL 查询（edit_database 权限）：仅允许 SELECT / WITH，最多返回 500 行
  - 表列表（GET /database/tables）：点击表名查看前 100 行（横向滚动表格）
-->
<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import FeedSkeleton from "../common/FeedSkeleton.vue";
import EmptyState from "../common/EmptyState.vue";
import ErrorState from "../common/ErrorState.vue";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { listDatabaseTables, getTableData, executeSql } from "../../api/admin";
import type { DatabaseTableInfo } from "../../api/admin";
import { showToast } from "../../utils/toast";

const props = defineProps<{ canQuery: boolean }>();

const tablesLoading = shallowRef(true);
const tablesError = shallowRef(false);
const tables = ref<DatabaseTableInfo[]>([]);

const activeTable = shallowRef<string | null>(null);
const tableRows = ref<Record<string, unknown>[]>([]);
const tableLoading = shallowRef(false);
const tableColumns = ref<string[]>([]);

const sqlInput = shallowRef("");
const sqlRunning = shallowRef(false);
const sqlColumns = ref<string[]>([]);
const sqlRows = ref<Record<string, unknown>[]>([]);
const sqlMeta = ref<{ rowCount: number; truncated: boolean } | null>(null);

async function loadTables(): Promise<void> {
  tablesLoading.value = true;
  tablesError.value = false;
  try {
    tables.value = await listDatabaseTables();
  } catch {
    tablesError.value = true;
  } finally {
    tablesLoading.value = false;
  }
}

async function openTable(name: string): Promise<void> {
  if (tableLoading.value) return;
  activeTable.value = name;
  tableLoading.value = true;
  tableRows.value = [];
  tableColumns.value = [];
  try {
    const rows = await getTableData(name);
    tableRows.value = rows;
    tableColumns.value = rows.length > 0 ? Object.keys(rows[0]) : [];
  } catch {
    activeTable.value = null;
  } finally {
    tableLoading.value = false;
  }
}

async function runSql(): Promise<void> {
  const sql = sqlInput.value.trim();
  if (!sql) {
    showToast("请输入 SQL 语句", "error");
    return;
  }
  if (!/^(SELECT|WITH)\b/i.test(sql)) {
    showToast("仅允许 SELECT / WITH 只读查询", "error");
    return;
  }

  sqlRunning.value = true;
  try {
    const result = await executeSql(sql);
    sqlColumns.value = result.columns;
    sqlRows.value = result.rows;
    sqlMeta.value = { rowCount: result.rowCount, truncated: result.truncated };
  } catch {
    // client.ts 已自动 Toast
  } finally {
    sqlRunning.value = false;
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

onMounted(() => {
  void loadTables();
});
</script>

<template>
  <div class="divide-y divide-[var(--border-subtle)]">
    <!-- 只读 SQL 查询（仅 edit_database 权限） -->
    <section v-if="props.canQuery" class="space-y-3 px-4 py-5 sm:px-5">
      <div class="flex items-center justify-between gap-2">
        <label for="admin-sql-input" class="text-sm font-semibold text-ink">SQL 查询</label>
        <span class="text-xs text-ink-muted">最多 500 行</span>
      </div>

      <p class="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
        <AppSvgIcon name="alertTriangle" :size="14" class="mt-0.5 shrink-0" />
        <span>仅允许 SELECT / WITH 只读查询，禁止分号多语句；每次执行都会写入公开管理日志。</span>
      </p>

      <textarea
        id="admin-sql-input"
        v-model="sqlInput"
        rows="3"
        spellcheck="false"
        class="input-base resize-y font-mono text-xs"
        placeholder="SELECT * FROM user_profile LIMIT 10"
      />

      <button
        type="button"
        class="btn-primary w-full"
        :disabled="sqlRunning"
        @click="runSql"
      >
        {{ sqlRunning ? "执行中…" : "执行查询" }}
      </button>

      <!-- SQL 结果表格 -->
      <div v-if="sqlMeta" class="space-y-2 pt-1">
        <p class="text-xs tabular-nums text-ink-muted">
          共 {{ sqlMeta.rowCount }} 行{{ sqlMeta.truncated ? "（超过 500 行，已截断）" : "" }}
        </p>
        <div class="overflow-x-auto rounded-xl border border-subtle bg-surface">
          <table class="w-full min-w-max border-collapse text-left text-xs">
            <thead class="border-b border-subtle bg-canvas-soft text-ink-secondary">
              <tr>
                <th
                  v-for="col in sqlColumns"
                  :key="col"
                  scope="col"
                  class="whitespace-nowrap px-3 py-2 font-mono font-medium"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--border-subtle)]">
              <tr v-for="(row, i) in sqlRows" :key="i" class="hover:bg-hover">
                <td
                  v-for="col in sqlColumns"
                  :key="col"
                  class="max-w-64 truncate whitespace-nowrap px-3 py-2 font-mono text-ink"
                >
                  {{ cellText(row[col]) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="sqlRows.length === 0" class="px-3 py-4 text-center text-xs text-ink-muted">
            查询无结果
          </p>
        </div>
      </div>
    </section>

    <!-- 数据表列表 -->
    <section>
      <div class="border-b border-subtle bg-canvas-soft px-4 py-2 text-xs font-medium text-ink-muted sm:px-5">
        数据表（只读浏览前 100 行）
      </div>

      <FeedSkeleton v-if="tablesLoading" variant="elk" :count="5" />
      <div v-else-if="tablesError" class="px-4 py-6">
        <ErrorState @retry="loadTables" />
      </div>

      <ul v-else role="list" class="divide-y divide-[var(--border-subtle)]">
        <li v-for="table in tables" :key="table.name">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-hover pressable sm:px-5"
            :class="activeTable === table.name ? 'bg-accent-soft text-primary' : 'text-ink'"
            @click="openTable(table.name)"
          >
            <span class="truncate font-mono text-xs font-medium">{{ table.name }}</span>
            <span class="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted">
              <span>查看</span>
              <AppSvgIcon name="chevronRight" :size="14" />
            </span>
          </button>
        </li>
      </ul>
    </section>

    <!-- 表数据（横向滚动） -->
    <section v-if="activeTable" class="px-4 py-5 sm:px-5">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="truncate font-mono text-sm font-semibold text-ink">
          {{ activeTable }}
        </h2>
        <span v-if="!tableLoading" class="shrink-0 text-xs tabular-nums text-ink-muted">
          {{ tableRows.length }} 行
        </span>
      </div>

      <FeedSkeleton v-if="tableLoading" variant="elk" :count="3" />
      <EmptyState v-else-if="tableRows.length === 0" text="当前数据表为空" icon="file" />

      <div v-else class="overflow-x-auto rounded-xl border border-subtle bg-surface">
        <table class="w-full min-w-max border-collapse text-left text-xs">
          <thead class="border-b border-subtle bg-canvas-soft text-ink-secondary">
            <tr>
              <th
                v-for="col in tableColumns"
                :key="col"
                scope="col"
                class="whitespace-nowrap px-3 py-2 font-mono font-medium"
              >
                {{ col }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border-subtle)]">
            <tr v-for="(row, i) in tableRows" :key="i" class="hover:bg-hover">
              <td
                v-for="col in tableColumns"
                :key="col"
                class="max-w-64 truncate whitespace-nowrap px-3 py-2 font-mono text-ink"
              >
                {{ cellText(row[col]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
