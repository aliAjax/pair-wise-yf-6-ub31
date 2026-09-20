import "./styles.css";
import { loadState } from "./migrate.js";
import {
  ITEM_STATUS,
  ORDER_STATUS,
  acceptDispatch,
  cancelDispatch,
  createDispatch,
  estimateOf,
  getActiveOrder,
  getHistoryOrders,
  summarize
} from "./rules.js";

const STORAGE_KEY = "zfl-14-repairs";

const statusLabels = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

const orderStatusLabels = {
  [ORDER_STATUS.ACTIVE]: "进行中",
  [ORDER_STATUS.ACCEPTED]: "已验收",
  [ORDER_STATUS.CANCELLED]: "已取消"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState({
  getItem: () => localStorage.getItem(STORAGE_KEY)
});

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 仅界面态：提示条与内联表单，不入本地数据
let notice = null; // { type: "error" | "success", text }
let inlinePanel = null; // { repairId, kind: "dispatch" | "accept" }

const app = document.querySelector("#app");

function render() {
  const repairs = filteredRepairs();
  const summary = summarize(state);

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${summary.unfinishedCount}</strong></div>
          <div class="stat"><span>处理中</span><strong>${summary.doingCount}</strong></div>
          <div class="stat"><span>预计费用</span><strong>¥${formatMoney(summary.estimatedCost)}</strong></div>
        </section>
      </header>

      ${renderNotice()}

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statusLabels)
              .map(
                ([value, label]) =>
                  `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`
              )
              .join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前状态下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderNotice() {
  if (!notice) return "";
  return `<div class="notice ${notice.type}" data-notice>${escapeHtml(notice.text)}</div>`;
}

function renderRepair(repair) {
  const activeOrder = getActiveOrder(state, repair.id);
  const history = getHistoryOrders(state, repair.id);
  const panel = inlinePanel?.repairId === repair.id ? inlinePanel.kind : null;

  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statusLabels[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">${activeOrder ? "派工报价" : "预估"} ¥${formatMoney(estimateOf(state, repair))}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        ${activeOrder ? renderActiveOrder(activeOrder, panel) : ""}
        ${panel === "dispatch" && !activeOrder ? renderDispatchForm(repair.id) : ""}
        ${history.length ? renderHistory(history) : ""}
        <div class="actions">
          ${renderRepairActions(repair, activeOrder, panel)}
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderRepairActions(repair, activeOrder, panel) {
  if (repair.status === ITEM_STATUS.DONE) return "";
  if (activeOrder) {
    // 验收表单展开时隐藏入口按钮，取消表单则可重新打开
    return panel === "accept" ? "" : `<button class="primary small" data-accept="${activeOrder.id}">验收</button>`;
  }
  return panel === "dispatch" ? "" : `<button class="primary small" data-dispatch="${repair.id}">派工</button>`;
}

function renderActiveOrder(order, panel) {
  return `
    <div class="order-card">
      <div class="row">
        <span class="order-status ${order.status}">${orderStatusLabels[order.status]}派工单</span>
        <span class="chip">施工人：${escapeHtml(order.worker)}</span>
        <span class="chip">报价 ¥${formatMoney(order.quote)}</span>
        <span class="chip">派工于 ${formatTime(order.dispatchedAt)}</span>
        <button class="danger small" type="button" data-cancel-order="${order.id}">取消派工</button>
      </div>
      ${panel === "accept" ? renderAcceptForm(order) : ""}
    </div>
  `;
}

function renderDispatchForm(repairId) {
  return `
    <form class="inline-form" data-dispatch-form="${repairId}">
      <div class="grid-two">
        <label>施工人<input name="worker" required placeholder="例如王师傅"></label>
        <label>报价（元）<input name="quote" type="number" min="0" step="1" required placeholder="派工报价"></label>
      </div>
      <div class="actions">
        <button class="primary small" type="submit">确认派工</button>
        <button class="ghost small" type="button" data-cancel-panel="${repairId}">放弃</button>
      </div>
    </form>
  `;
}

function renderAcceptForm(order) {
  return `
    <form class="inline-form" data-accept-form="${order.id}">
      <div class="grid-two">
        <label>实付费用（元）<input name="paidCost" type="number" min="0" step="1" required placeholder="实际支付金额"></label>
        <label>验收照片<input name="acceptPhoto" type="url" required placeholder="粘贴验收照片链接"></label>
      </div>
      <label data-over-wrap hidden>超支原因<textarea name="overReason" placeholder="实付超过报价时必填"></textarea></label>
      <div class="actions">
        <button class="primary small" type="submit">提交验收</button>
        <button class="ghost small" type="button" data-cancel-panel="${order.repairId}">放弃</button>
      </div>
    </form>
  `;
}

function renderHistory(history) {
  return `
    <div class="history">
      <p class="history-title">历史派工单（${history.length}）</p>
      ${history.map(renderHistoryOrder).join("")}
    </div>
  `;
}

function renderHistoryOrder(order) {
  const over =
    order.status === ORDER_STATUS.ACCEPTED && order.paidCost > order.quote
      ? `<span class="chip over">超支：${escapeHtml(order.overReason)}</span>`
      : "";
  const photo =
    order.status === ORDER_STATUS.ACCEPTED && order.acceptPhoto
      ? `<a class="thumb" href="${escapeHtml(order.acceptPhoto)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(order.acceptPhoto)}" alt="验收照片"></a>`
      : "";
  const endedAt =
    order.status === ORDER_STATUS.ACCEPTED
      ? `验收于 ${formatTime(order.acceptedAt)}`
      : `取消于 ${formatTime(order.cancelledAt)}`;
  return `
    <div class="history-item">
      <span class="order-status ${order.status}">${orderStatusLabels[order.status]}</span>
      <span class="chip">施工人：${escapeHtml(order.worker)}</span>
      <span class="chip">报价 ¥${formatMoney(order.quote)}</span>
      ${order.status === ORDER_STATUS.ACCEPTED ? `<span class="chip">实付 ¥${formatMoney(order.paidCost)}</span>` : ""}
      ${over}
      <span class="chip">${escapeHtml(endedAt)}</span>
      ${photo}
    </div>
  `;
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.repairs.unshift({
      id: crypto.randomUUID(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: ITEM_STATUS.TODO,
      photo: data.photo.trim(),
      note: data.note.trim()
    });
    notice = { type: "success", text: "维修事项已保存，可在待处理状态下派工。" };
    saveState();
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const repairId = button.dataset.delete;
      state.repairs = state.repairs.filter((repair) => repair.id !== repairId);
      state.orders = state.orders.filter((order) => order.repairId !== repairId);
      if (inlinePanel?.repairId === repairId) inlinePanel = null;
      notice = { type: "success", text: "事项及其派工单已删除。" };
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-dispatch]").forEach((button) => {
    button.addEventListener("click", () => {
      inlinePanel = { repairId: button.dataset.dispatch, kind: "dispatch" };
      notice = null;
      render();
    });
  });

  document.querySelectorAll("[data-accept]").forEach((button) => {
    button.addEventListener("click", () => {
      const order = state.orders.find((item) => item.id === button.dataset.accept);
      inlinePanel = { repairId: order.repairId, kind: "accept" };
      notice = null;
      render();
    });
  });

  document.querySelectorAll("[data-cancel-order]").forEach((button) => {
    button.addEventListener("click", () => {
      const order = state.orders.find((item) => item.id === button.dataset.cancelOrder);
      if (
        !window.confirm(
          `确认取消「施工人：${order.worker}」的进行中派工单？取消后事项恢复派工前状态，派工单保留在历史中。`
        )
      ) {
        return;
      }
      const repairId = order.repairId;
      const result = cancelDispatch(state, order.id);
      applyResult(result, "派工单已取消，事项恢复派工前状态。", result.ok ? repairId : null);
    });
  });

  document.querySelectorAll("[data-cancel-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      inlinePanel = null;
      notice = null;
      render();
    });
  });

  document.querySelectorAll("[data-dispatch-form]").forEach((form) => {
    const repairId = form.dataset.dispatchForm;
    const quoteInput = form.elements.quote;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const result = createDispatch(state, repairId, data);
      // 失败不重渲染：保留表单输入与焦点，只更新提示
      if (!result.ok) {
        notice = { type: "error", text: result.error };
        renderNoticeOnly();
        return;
      }
      inlinePanel = null;
      notice = { type: "success", text: "派工成功，事项已转为处理中。" };
      saveState();
      render();
    });
    quoteInput.addEventListener("invalid", () => {
      quoteInput.setCustomValidity("请填写不小于 0 的报价。");
    });
    quoteInput.addEventListener("input", () => quoteInput.setCustomValidity(""));
  });

  document.querySelectorAll("[data-accept-form]").forEach((form) => {
    const orderId = form.dataset.acceptForm;
    const order = state.orders.find((item) => item.id === orderId);
    const paidInput = form.elements.paidCost;
    const photoInput = form.elements.acceptPhoto;
    const overWrap = form.querySelector("[data-over-wrap]");
    const overInput = form.elements.overReason;

    const syncOver = () => {
      const over = Number(paidInput.value) > order.quote;
      overWrap.hidden = !over;
      overInput.required = over;
    };
    paidInput.addEventListener("input", syncOver);
    syncOver();

    paidInput.addEventListener("invalid", () => paidInput.setCustomValidity("请填写不小于 0 的实付费用。"));
    paidInput.addEventListener("input", () => paidInput.setCustomValidity(""));
    photoInput.addEventListener("invalid", () => photoInput.setCustomValidity("请粘贴验收照片链接。"));
    photoInput.addEventListener("input", () => photoInput.setCustomValidity(""));
    overInput.addEventListener("invalid", () => overInput.setCustomValidity("实付超过报价，必须填写超支原因。"));
    overInput.addEventListener("input", () => overInput.setCustomValidity(""));

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const result = acceptDispatch(state, orderId, data);
      if (!result.ok) {
        notice = { type: "error", text: result.error };
        renderNoticeOnly();
        return;
      }
      inlinePanel = null;
      notice = { type: "success", text: "验收完成，事项已标记为已完成。" };
      saveState();
      render();
    });
  });
}

function applyResult(result, successText, repairId) {
  if (!result.ok) {
    notice = { type: "error", text: result.error };
    renderNoticeOnly();
    return;
  }
  if (repairId && inlinePanel?.repairId === repairId) inlinePanel = null;
  notice = { type: "success", text: successText };
  saveState();
  render();
}

// 只刷新顶部提示条：校验失败时保留内联表单里已输入的内容
function renderNoticeOnly() {
  const existing = document.querySelector("[data-notice]");
  const markup = renderNotice();
  if (existing) {
    if (markup) existing.outerHTML = markup;
    else existing.remove();
  } else if (markup) {
    document.querySelector(".header").insertAdjacentHTML("afterend", markup);
  }
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]
  );
}

render();
