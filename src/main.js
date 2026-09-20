import "./styles.css";
import { loadState, saveState } from "./migration.js";
import {
  DISPATCH_STATUS,
  acceptDispatch,
  cancelDispatch,
  dispatchRepair,
  estimatedCost,
  getActiveDispatch,
  getDispatchesOfRepair,
  makeId
} from "./rules.js";

const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();
// 卡片内表单的错误提示仅为界面临时信息，不写入本地数据。
const formErrors = {};

const app = document.querySelector("#app");

function render() {
  const repairs = filteredRepairs();
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const totalCost = unfinished.reduce((total, repair) => total + estimatedCost(repair, state), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>预计费用</span><strong>¥${totalCost}</strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo")}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
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

function renderRepair(repair) {
  const active = getActiveDispatch(state, repair.id);
  const history = getDispatchesOfRepair(state, repair.id).filter((item) => item.status !== "active");
  const error = formErrors[repair.id];

  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">${active ? "派工报价" : "预计"} ¥${estimatedCost(repair, state)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>

        ${active ? renderActiveDispatch(repair, active) : repair.status !== "done" ? renderDispatchForm(repair) : ""}
        ${history.length ? renderDispatchHistory(history) : ""}
        ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}

        <div class="actions">
          <select data-status="${repair.id}" ${active ? "disabled" : ""}>${renderStatusOptions(repair.status)}</select>
          ${active ? `<span class="hint">闭环进行中，状态随验收或取消自动更新</span>` : ""}
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderDispatchForm(repair) {
  return `
    <form class="dispatch-form" data-dispatch-form="${repair.id}">
      <div class="form-line">
        <label>施工人<input name="worker" required placeholder="例如王师傅"></label>
        <label>报价（元）<input name="quote" type="number" min="0" step="1" required placeholder="派工报价"></label>
        <button class="primary small" type="submit">派工</button>
      </div>
    </form>
  `;
}

function renderActiveDispatch(repair, dispatch) {
  return `
    <div class="dispatch-box">
      <div class="row">
        <span class="dispatch-tag">${DISPATCH_STATUS.active}</span>
        <span class="chip">施工人：${escapeHtml(dispatch.worker)}</span>
        <span class="chip">报价 ¥${Number(dispatch.quote || 0)}</span>
        <span class="chip">派工时间 ${formatTime(dispatch.createdAt)}</span>
      </div>
      <form class="accept-form" data-accept-form="${dispatch.id}" data-repair="${repair.id}">
        <div class="form-line">
          <label>实付费用（元）<input name="actualCost" type="number" min="0" step="1" required placeholder="验收实付"></label>
          <label>验收照片链接<input name="acceptPhoto" type="url" required placeholder="必填，粘贴图片地址"></label>
        </div>
        <label class="over-reason">超支原因<input name="overReason" placeholder="仅当实付费用超出报价时必填"></label>
        <div class="form-line end">
          <button class="primary small" type="submit">验收完成</button>
          <button class="ghost danger" type="button" data-cancel-dispatch="${dispatch.id}" data-repair="${repair.id}">取消派工</button>
        </div>
      </form>
    </div>
  `;
}

function renderDispatchHistory(history) {
  return `
    <div class="history">
      <p class="history-title">派工历史（${history.length}）</p>
      ${history
        .map((item) => {
          const over =
            item.status === "accepted" && Number(item.actualCost || 0) > Number(item.quote || 0)
              ? `<span class="chip over">超支：${escapeHtml(item.overReason || "未填原因")}</span>`
              : "";
          const accepted =
            item.status === "accepted"
              ? `<span class="chip">实付 ¥${Number(item.actualCost || 0)}</span>
                 <a class="chip link" href="${escapeHtml(item.acceptPhoto)}" target="_blank" rel="noreferrer">验收照片</a>
                 ${over}`
              : `<span class="chip">取消于 ${formatTime(item.cancelledAt)}</span>`;
          return `
            <div class="history-item">
              <span class="dispatch-tag ${item.status}">${DISPATCH_STATUS[item.status]}</span>
              <span class="chip">${escapeHtml(item.worker)}</span>
              <span class="chip">报价 ¥${Number(item.quote || 0)}</span>
              ${accepted}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderStatusOptions(selected) {
  return Object.entries(statuses)
    .filter(([value]) => value !== "all")
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
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
      id: makeId(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: data.status,
      previousStatus: "",
      photo: data.photo.trim(),
      note: data.note.trim()
    });
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

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      if (select.disabled) return;
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      if (!repair || getActiveDispatch(state, repair.id)) return;
      repair.status = select.value;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const repairId = button.dataset.delete;
      // 事项与其派工单一并删除；取消派工场景的历史单保留不受此影响。
      state.repairs = state.repairs.filter((repair) => repair.id !== repairId);
      state.dispatches = state.dispatches.filter((dispatch) => dispatch.repairId !== repairId);
      delete formErrors[repairId];
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-dispatch-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repairId = form.dataset.dispatchForm;
      const data = Object.fromEntries(new FormData(form));
      const result = dispatchRepair(state, repairId, data);
      if (!applyResult(result, repairId)) return;
      form.reset();
    });
  });

  document.querySelectorAll("[data-accept-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repairId = form.dataset.repair;
      const data = Object.fromEntries(new FormData(form));
      applyResult(acceptDispatch(state, form.dataset.acceptForm, data), repairId);
    });
  });

  document.querySelectorAll("[data-cancel-dispatch]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("确定取消这张未验收的派工单？取消后事项恢复派工前状态，历史单仍保留。")) return;
      applyResult(cancelDispatch(state, button.dataset.cancelDispatch), button.dataset.repair);
    });
  });
}

// 统一落地规则层结果：失败时不改任何数据，仅在卡片上提示；成功才保存并重绘。
function applyResult(result, repairId) {
  if (!result.ok) {
    formErrors[repairId] = result.error;
    render();
    return false;
  }
  state.repairs = result.data.repairs;
  state.dispatches = result.data.dispatches;
  delete formErrors[repairId];
  saveState();
  render();
  return true;
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
