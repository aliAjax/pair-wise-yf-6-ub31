// 本地数据迁移层：只负责 localStorage 读写与版本升级，与规则、交互解耦。

const STORAGE_KEY = "zfl-14-repairs";
export const STORAGE_VERSION = 2;

export function defaultState() {
  return {
    version: STORAGE_VERSION,
    filter: "all",
    repairs: [
      {
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        previousStatus: "",
        photo: "",
        note: "先检查软管接口"
      }
    ],
    dispatches: []
  };
}

export function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultState();

  let state;
  try {
    state = JSON.parse(saved);
  } catch {
    return defaultState();
  }
  if (!state || typeof state !== "object" || !Array.isArray(state.repairs)) return defaultState();

  return migrate(state);
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function migrate(state) {
  const version = Number(state.version) || 1;

  // v1 -> v2：新增派工单列表；事项记录派工前状态，已完成事项不保留进行中派工单。
  if (version < 2) {
    state.dispatches = Array.isArray(state.dispatches) ? state.dispatches : [];
    state.repairs = state.repairs.map((repair) => ({
      ...repair,
      previousStatus: repair.previousStatus || ""
    }));
    state.version = 2;
  }

  state.filter = state.filter || "all";
  return state;
}
