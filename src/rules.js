// 派工验收闭环规则层（纯逻辑，不读写 DOM / localStorage）
// 所有写操作均为「整次成功或整次失败」：
// 返回 { ok: true,  data } 或 { ok: false, error }，失败时调用方必须保持原状态。

export const DISPATCH_STATUS = {
  active: "进行中",
  accepted: "已验收",
  cancelled: "已取消"
};

export function makeId() {
  return crypto.randomUUID();
}

export function nowText() {
  return new Date().toISOString();
}

// ---- 查询规则 ----

export function getActiveDispatch(state, repairId) {
  return state.dispatches.find((item) => item.repairId === repairId && item.status === "active") || null;
}

export function getDispatchesOfRepair(state, repairId) {
  return state.dispatches
    .filter((item) => item.repairId === repairId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// 未完成事项的预计费用：有进行中派工单按派工报价统计，否则按事项自身预计费用。
export function estimatedCost(repair, state) {
  const active = getActiveDispatch(state, repair.id);
  if (active) return Number(active.quote || 0);
  return Number(repair.cost || 0);
}

// ---- 派工规则 ----
// 每个未完成事项只能有一张进行中派工单；重复派工整次拒绝，原单不变。
// 派工须填施工人与报价；成功后事项转为处理中。
export function dispatchRepair(state, repairId, input) {
  const repair = state.repairs.find((item) => item.id === repairId);
  if (!repair) return { ok: false, error: "维修事项不存在" };
  if (repair.status === "done") return { ok: false, error: "事项已完成，不能再派工" };
  if (getActiveDispatch(state, repairId)) {
    return { ok: false, error: "该事项已有进行中派工单，重复派工被拒绝" };
  }

  const worker = String(input.worker || "").trim();
  if (!worker) return { ok: false, error: "请填写施工人" };

  const quote = readAmount(input.quote);
  if (quote === null || quote < 0) return { ok: false, error: "请填写有效报价（不小于 0 的数字）" };

  const dispatches = state.dispatches.map((item) => ({ ...item }));
  const dispatch = {
    id: makeId(),
    repairId,
    worker,
    quote,
    status: "active",
    createdAt: nowText(),
    acceptedAt: "",
    actualCost: null,
    acceptPhoto: "",
    overReason: ""
  };
  dispatches.push(dispatch);

  const repairs = state.repairs.map((item) =>
    item.id === repairId ? { ...item, status: "doing", previousStatus: item.status } : item
  );

  return { ok: true, data: { repairs, dispatches, dispatch } };
}

// ---- 验收规则 ----
// 验收要交实付费用和验收照片；超报价还须填超支原因；缺任一项整次失败。
export function acceptDispatch(state, dispatchId, input) {
  const dispatch = state.dispatches.find((item) => item.id === dispatchId);
  if (!dispatch) return { ok: false, error: "派工单不存在" };
  if (dispatch.status !== "active") return { ok: false, error: "只有进行中的派工单可以验收" };

  const actualCost = readAmount(input.actualCost);
  if (actualCost === null || actualCost < 0) return { ok: false, error: "请填写实付费用（不小于 0 的数字）" };

  const acceptPhoto = String(input.acceptPhoto || "").trim();
  if (!acceptPhoto) return { ok: false, error: "请提供验收照片链接" };

  const overReason = String(input.overReason || "").trim();
  if (actualCost > Number(dispatch.quote || 0) && !overReason) {
    return { ok: false, error: "实付费用超出报价，请填写超支原因" };
  }

  const dispatches = state.dispatches.map((item) =>
    item.id === dispatchId
      ? { ...item, status: "accepted", acceptedAt: nowText(), actualCost, acceptPhoto, overReason }
      : item
  );

  const repairs = state.repairs.map((item) =>
    item.id === dispatch.repairId ? { ...item, status: "done" } : item
  );

  return { ok: true, data: { repairs, dispatches } };
}

// ---- 取消规则 ----
// 取消未验收派工单后恢复派工前状态，历史单保留（只允许取消进行中的单）。
export function cancelDispatch(state, dispatchId) {
  const dispatch = state.dispatches.find((item) => item.id === dispatchId);
  if (!dispatch) return { ok: false, error: "派工单不存在" };
  if (dispatch.status !== "active") return { ok: false, error: "只能取消进行中的派工单" };

  const dispatches = state.dispatches.map((item) =>
    item.id === dispatchId ? { ...item, status: "cancelled", cancelledAt: nowText() } : item
  );

  const repairs = state.repairs.map((item) =>
    item.id === dispatch.repairId
      ? { ...item, status: item.previousStatus || "todo", previousStatus: "" }
      : item
  );

  return { ok: true, data: { repairs, dispatches } };
}

function readAmount(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
