// 派工验收闭环的业务规则：纯函数，不碰 DOM 与 localStorage。
// 所有写操作遵循“先整体校验，后整体落库”：校验不过直接返回错误，原状态不变。

export const ITEM_STATUS = {
  TODO: "todo",
  DOING: "doing",
  DONE: "done"
};

export const ORDER_STATUS = {
  ACTIVE: "active", // 进行中（未验收）
  ACCEPTED: "accepted", // 已验收
  CANCELLED: "cancelled" // 已取消（未验收取消，恢复派工前状态）
};

export function getOrders(state, repairId) {
  return (state.orders || []).filter((order) => order.repairId === repairId);
}

export function getActiveOrder(state, repairId) {
  return getOrders(state, repairId).find((order) => order.status === ORDER_STATUS.ACTIVE) || null;
}

export function getHistoryOrders(state, repairId) {
  const endedAt = (order) => order.acceptedAt || order.cancelledAt || "";
  return getOrders(state, repairId)
    .filter((order) => order.status !== ORDER_STATUS.ACTIVE)
    .sort((a, b) => endedAt(b).localeCompare(endedAt(a)));
}

function textOf(value) {
  return String(value ?? "").trim();
}

function moneyOf(value) {
  if (value === "" || value === null || value === undefined) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

function nowIso() {
  return new Date().toISOString();
}

// 派工：每个未完成事项至多一张进行中派工单；须填施工人与报价；成功后事项转为处理中。
export function createDispatch(state, repairId, input) {
  const repair = state.repairs.find((item) => item.id === repairId);
  if (!repair) return { ok: false, error: "维修事项不存在，派工失败。" };
  if (repair.status === ITEM_STATUS.DONE) {
    return { ok: false, error: "已完成事项无需派工。" };
  }
  if (getActiveOrder(state, repairId)) {
    // 重复派工整次拒绝，原单不变
    return { ok: false, error: "该事项已有进行中的派工单，不能重复派工。" };
  }

  const worker = textOf(input.worker);
  const quote = moneyOf(input.quote);
  const errors = [];
  if (!worker) errors.push("施工人");
  if (quote === null) errors.push("报价");
  if (errors.length) return { ok: false, error: `派工单缺少${errors.join("、")}，整次派工未提交。` };

  const previousStatus = repair.status === ITEM_STATUS.DOING ? ITEM_STATUS.DOING : ITEM_STATUS.TODO;
  const order = {
    id: crypto.randomUUID(),
    repairId,
    worker,
    quote,
    status: ORDER_STATUS.ACTIVE,
    dispatchedAt: nowIso(),
    previousStatus, // 记录派工前状态，取消时恢复
    acceptedAt: null,
    paidCost: null,
    overReason: "",
    acceptPhoto: "",
    cancelledAt: null
  };

  state.orders = state.orders || [];
  state.orders.push(order);
  repair.status = ITEM_STATUS.DOING;
  return { ok: true, order };
}

// 验收：实付费用、验收照片必填；实付超过报价时超支原因必填。缺任一项整次失败。
export function acceptDispatch(state, orderId, input) {
  const order = (state.orders || []).find((item) => item.id === orderId);
  if (!order) return { ok: false, error: "派工单不存在，验收失败。" };
  if (order.status !== ORDER_STATUS.ACTIVE) {
    return { ok: false, error: "该派工单已结束，不能重复验收。" };
  }

  const paidCost = moneyOf(input.paidCost);
  const acceptPhoto = textOf(input.acceptPhoto);
  const overReason = textOf(input.overReason);
  const errors = [];
  if (paidCost === null) errors.push("实付费用");
  if (!acceptPhoto) errors.push("验收照片");
  if (paidCost !== null && paidCost > order.quote && !overReason) errors.push("超支原因");
  if (errors.length) return { ok: false, error: `验收缺少${errors.join("、")}，整次验收未提交。` };

  order.status = ORDER_STATUS.ACCEPTED;
  order.paidCost = paidCost;
  order.acceptPhoto = acceptPhoto;
  order.overReason = paidCost > order.quote ? overReason : "";
  order.acceptedAt = nowIso();

  const repair = state.repairs.find((item) => item.id === order.repairId);
  if (repair) repair.status = ITEM_STATUS.DONE;
  return { ok: true, order };
}

// 取消未验收派工单：恢复派工前状态，派工单转入历史保留。
export function cancelDispatch(state, orderId) {
  const order = (state.orders || []).find((item) => item.id === orderId);
  if (!order) return { ok: false, error: "派工单不存在，取消失败。" };
  if (order.status !== ORDER_STATUS.ACTIVE) {
    return { ok: false, error: "只有进行中的派工单可以取消。" };
  }

  order.status = ORDER_STATUS.CANCELLED;
  order.cancelledAt = nowIso();

  // 仅当该事项没有其他进行中派工单时才回退状态（规则上不会有，这里保证数据自洽）
  const repair = state.repairs.find((item) => item.id === order.repairId);
  if (repair && !getActiveOrder(state, order.repairId)) {
    repair.status = order.previousStatus || ITEM_STATUS.TODO;
  }
  return { ok: true, order };
}

// 预计费用：有进行中派工单按报价统计，否则按事项预估费用统计
export function estimateOf(state, repair) {
  const active = getActiveOrder(state, repair.id);
  return active ? active.quote : Number(repair.cost || 0);
}

export function summarize(state) {
  const unfinished = state.repairs.filter((repair) => repair.status !== ITEM_STATUS.DONE);
  const doing = state.repairs.filter((repair) => repair.status === ITEM_STATUS.DOING).length;
  const estimatedCost = unfinished.reduce((total, repair) => total + estimateOf(state, repair), 0);
  return { unfinishedCount: unfinished.length, doingCount: doing, estimatedCost };
}
