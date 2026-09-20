// 本地数据迁移：独立于业务规则与界面交互维护。
// 升级原则：只增不破坏，迁移失败时退回当前版本默认数据。

const CURRENT_VERSION = 2;

function defaultData() {
  return {
    version: CURRENT_VERSION,
    filter: "all",
    repairs: [
      {
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        photo: "",
        note: "先检查软管接口"
      }
    ],
    orders: []
  };
}

// v1 -> v2：新增派工单列表；历史事项不补派工单，状态保持原样
function migrateV1ToV2(data) {
  return {
    ...data,
    version: 2,
    orders: Array.isArray(data.orders) ? data.orders : []
  };
}

export function loadState(storage) {
  let data;
  try {
    const saved = storage.getItem();
    data = saved ? JSON.parse(saved) : defaultData();
  } catch {
    return defaultData();
  }

  if (!data || typeof data !== "object" || !Array.isArray(data.repairs)) {
    return defaultData();
  }
  if (data.version === undefined || data.version === 1) data = migrateV1ToV2(data);
  if (data.version !== CURRENT_VERSION) return defaultData();

  // 数据自洽：清掉无主派工单
  const repairIds = new Set(data.repairs.map((repair) => repair.id));
  data.orders = data.orders.filter((order) => repairIds.has(order.repairId));
  if (typeof data.filter !== "string") data.filter = "all";
  return data;
}

export { CURRENT_VERSION };
