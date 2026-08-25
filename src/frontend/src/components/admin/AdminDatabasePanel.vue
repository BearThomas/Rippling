<!--
  管理面板 — 数据库子面板

  - 表列表（GET /database/tables）：点击表名查看前 100 行（横向滚动表格）
  - SQL 查询（edit_database 权限）：仅允许 SELECT / WITH，
    结果最多 500 行，超出截断并提示
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../common/LoadingSpinner.vue";
import ErrorState from "../common/ErrorState.vue";
import {
  listDatabaseTables,
  getTableData,
  executeSql,
} from "../../api/admin";
import type { DatabaseTableInfo } from "../../api/admin";
import { showToast } from "../../utils/toast";

/** 是否具备 edit_database（决定是否显示 SQL 查询框） */
const props = defineProps<{ canQuery: boolean }>();

// ---------- 表列表与表数据 ----------
const tablesLoading = ref(true);
const tablesError = ref(false);
const tables = ref<DatabaseTableInfo[]>([]);

/** 当前查看的表名（null = 未选表） */
const activeTable = ref<string | null>(null);
const tableRows = ref<Record<string, unknown>[]>([]);
const tableLoading = ref(false);

/** 结果列名（从首行字段推断） */
const tableColumns = ref<string[]>([]);

// ---------- SQL 查询 ----------
const sqlInput = ref("");
const sqlRunning = ref(false);
const sqlColumns = ref<string[]>([]);
const sqlRows = ref<Record<string, unknown>[]>([]);
/** 结果元信息 */
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

/** 点击表名：拉取前 100 行 */
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

/** 执行只读 SQL（前端先做 SELECT / WITH 预检，后端二次校验） */
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
    // 错误 Toast 由 client 层统一处理
  } finally {
    sqlRunning.value = false;
  }
}

/** 单元格值格式化：null → NULL；对象 → JSON */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

onMounted(loadTables);
</script>

<template>
  <div class="space-y-4">
    <!-- SQL 查询（仅 edit_database） -->
    <div v-if="props.canQuery" class="card-base">
      <h3 class="mb-1 text-sm font-semibold text-ink-soft">SQL 查询</h3>
      <p class="mb-2 rounded-lg bg-page px-2 py-1.5 text-xs text-red-500">
        ⚠ 仅允许 SELECT / WITH 只读查询，禁止分号多语句；最多返回 500 行，每次执行将写入管理日志
      </p>
      <textarea
        v-model="sqlInput"
        rows="3"
        class="input-base w-full resize-y font-mono text-xs"
        placeholder="SELECT * FROM user_profile LIMIT 10"
      ></textarea>
      <button
        type="button"
        class="btn-primary mt-2 w-full"
        :disabled="sqlRunning"
        @click="runSql"
      >
        {{ sqlRunning ? "执行中…" : "执行查询" }}
      </button>

      <!-- SQL 结果表格（横向滚动） -->
      <template v-if="sqlMeta">
        <p class="mt-3 text-xs text-ink-soft">
          共 {{ sqlMeta.rowCount }} 行{{ sqlMeta.truncated ? "（超过 500 行，已截断）" : "" }}
        </p>
        <div class="mt-1 overflow-x-auto rounded-lg border border-line">
          <table class="w-full min-w-max text-left text-xs">
            <thead class="bg-page text-ink-soft">
              <tr>
                <th v-for="col in sqlColumns" :key="col" class="whitespace-nowrap px-2 py-1.5 font-medium">
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in sqlRows" :key="i" class="border-t border-line">
                <td
                  v-for="col in sqlColumns"
                  :key="col"
                  class="max-w-64 truncate whitespace-nowrap px-2 py-1.5"
                >
                  {{ cellText(row[col]) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="sqlRows.length === 0" class="px-2 py-3 text-center text-xs text-ink-soft">
            查询无结果
          </p>
        </div>
      </template>
    </div>

    <!-- 表列表 -->
    <div>
      <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">数据表</h3>
      <LoadingSpinner v-if="tablesLoading" />
      <ErrorState v-else-if="tablesError" @retry="loadTables" />
      <div v-else class="card-base !p-0 divide-y divide-line">
        <button
          v-for="table in tables"
          :key="table.name"
          type="button"
          class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-opacity active:opacity-70"
          :class="activeTable === table.name ? 'text-primary' : ''"
          @click="openTable(table.name)"
        >
          <span class="font-mono">{{ table.name }}</span>
          <span class="text-xs text-ink-soft">查看前 100 行</span>
        </button>
      </div>
    </div>

    <!-- 表数据（横向滚动） -->
    <div v-if="activeTable">
      <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">
        {{ activeTable }} 数据
      </h3>
      <LoadingSpinner v-if="tableLoading" />
      <div v-else-if="tableRows.length === 0" class="card-base text-center text-sm text-ink-soft">
        空表
      </div>
      <div v-else class="overflow-x-auto rounded-lg border border-line bg-surface">
        <table class="w-full min-w-max text-left text-xs">
          <thead class="bg-page text-ink-soft">
            <tr>
              <th v-for="col in tableColumns" :key="col" class="whitespace-nowrap px-2 py-1.5 font-medium">
                {{ col }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in tableRows" :key="i" class="border-t border-line">
              <td
                v-for="col in tableColumns"
                :key="col"
                class="max-w-64 truncate whitespace-nowrap px-2 py-1.5"
              >
                {{ cellText(row[col]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
