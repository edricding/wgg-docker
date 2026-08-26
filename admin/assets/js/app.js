(function () {
    "use strict";

    // 演示数据。接入服务端时，只需把 loadMessages() 改为请求 /api/messages。
    const demoMessages = [
        { id: "WG-20260826-001", name: "王雨桐", phone: "138 **** 9521", attendance: "yes", guestCount: 2, message: "祝你们新婚快乐！我们两个人都会准时到场。", submittedAt: "2026-08-26 10:32", read: false },
        { id: "WG-20260826-002", name: "李明轩", phone: "186 **** 1038", attendance: "yes", guestCount: 1, message: "收到邀请啦，期待在天津见到你们。", submittedAt: "2026-08-26 09:48", read: false },
        { id: "WG-20260825-003", name: "张若溪", phone: "135 **** 7720", attendance: "no", guestCount: 0, message: "当天在外地出差，很遗憾不能到场，先送上最真挚的祝福。", submittedAt: "2026-08-25 22:16", read: true },
        { id: "WG-20260825-004", name: "陈宇航", phone: "159 **** 3416", attendance: "yes", guestCount: 3, message: "一家三口出席，小朋友也会一起过来。", submittedAt: "2026-08-25 20:05", read: true },
        { id: "WG-20260825-005", name: "赵子涵", phone: "137 **** 8864", attendance: "pending", guestCount: 0, message: "行程还在确认，确定后第一时间告诉你们。", submittedAt: "2026-08-25 18:42", read: false },
        { id: "WG-20260825-006", name: "周可欣", phone: "152 **** 4169", attendance: "yes", guestCount: 2, message: "终于等到这一天啦，婚礼见！", submittedAt: "2026-08-25 16:27", read: true },
        { id: "WG-20260824-007", name: "刘泽远", phone: "181 **** 6307", attendance: "yes", guestCount: 1, message: "会准时参加，祝百年好合。", submittedAt: "2026-08-24 23:11", read: true },
        { id: "WG-20260824-008", name: "孙嘉怡", phone: "133 **** 2085", attendance: "no", guestCount: 0, message: "虽然无法到场，但心意一定送到。祝永远幸福！", submittedAt: "2026-08-24 19:36", read: true },
        { id: "WG-20260824-009", name: "吴启航", phone: "136 **** 5472", attendance: "yes", guestCount: 2, message: "两位新人要一直甜甜蜜蜜，我们现场见。", submittedAt: "2026-08-24 14:02", read: true },
        { id: "WG-20260823-010", name: "郑思源", phone: "188 **** 9193", attendance: "pending", guestCount: 0, message: "先登记一下，人数稍后确认。", submittedAt: "2026-08-23 21:54", read: false },
        { id: "WG-20260823-011", name: "马书瑶", phone: "150 **** 6618", attendance: "yes", guestCount: 1, message: "期待见证你们最重要的一天。", submittedAt: "2026-08-23 17:20", read: true },
        { id: "WG-20260822-012", name: "郭景川", phone: "139 **** 3074", attendance: "yes", guestCount: 2, message: "我和爱人一起过去，酒店见。", submittedAt: "2026-08-22 11:08", read: true }
    ];

    const state = { messages: [], query: "", attendance: "all", read: "all", page: 1, pageSize: 8 };
    const attendanceMeta = {
        yes: { label: "确认出席", className: "badge-yes" },
        no: { label: "无法出席", className: "badge-no" },
        pending: { label: "尚未确认", className: "badge-pending" }
    };
    const elements = {};
    let toastTimer;

    function loadMessages() {
        state.messages = demoMessages.map((item) => ({ ...item }));
    }

    function cacheElements() {
        ["messageRows", "mobileList", "emptyState", "filteredCount", "totalCount", "attendingCount", "attendingGuests", "declinedCount", "unreadCount", "unreadNavCount", "searchInput", "attendanceFilter", "readFilter", "rangeText", "pageNumbers", "previousPage", "nextPage", "detailDialog", "toast"].forEach((id) => {
            elements[id] = document.getElementById(id);
        });
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
    }

    function filteredMessages() {
        const query = state.query.trim().toLocaleLowerCase("zh-CN");
        return state.messages.filter((item) => {
            const searchable = `${item.name} ${item.phone} ${item.message} ${item.id}`.toLocaleLowerCase("zh-CN");
            return (!query || searchable.includes(query))
                && (state.attendance === "all" || item.attendance === state.attendance)
                && (state.read === "all" || (state.read === "read" ? item.read : !item.read));
        });
    }

    function renderStats() {
        const attending = state.messages.filter((item) => item.attendance === "yes");
        const declined = state.messages.filter((item) => item.attendance === "no");
        const unread = state.messages.filter((item) => !item.read);
        elements.totalCount.textContent = state.messages.length;
        elements.attendingCount.textContent = attending.length;
        elements.attendingGuests.textContent = `共 ${attending.reduce((sum, item) => sum + item.guestCount, 0)} 位宾客`;
        elements.declinedCount.textContent = declined.length;
        elements.unreadCount.textContent = unread.length;
        elements.unreadNavCount.textContent = unread.length;
    }

    function badgeMarkup(attendance) {
        const meta = attendanceMeta[attendance] || attendanceMeta.pending;
        return `<span class="badge ${meta.className}">${meta.label}</span>`;
    }

    function guestMarkup(item) {
        return `<div class="guest-cell"><span class="avatar">${escapeHtml(item.name.slice(0, 1))}</span><div><strong>${escapeHtml(item.name)}${item.read ? "" : '<i class="new-dot" title="尚未查看"></i>'}</strong><small>${escapeHtml(item.id)}</small></div></div>`;
    }

    function rowMarkup(item) {
        const guestText = item.guestCount ? `${item.guestCount} 人` : "待确认";
        return `<tr class="${item.read ? "" : "is-unread"}">
            <td>${guestMarkup(item)}</td>
            <td><a class="phone-link" href="tel:${escapeHtml(item.phone.replace(/\s/g, ""))}">${escapeHtml(item.phone)}</a></td>
            <td>${badgeMarkup(item.attendance)}</td>
            <td><span class="guest-count"><svg><use href="#icon-users"/></svg>${guestText}</span></td>
            <td><p class="message-preview" title="${escapeHtml(item.message)}">${escapeHtml(item.message || "暂无留言")}</p></td>
            <td><time class="time-cell">${escapeHtml(item.submittedAt)}</time></td>
            <td><button class="view-button" type="button" data-view-id="${escapeHtml(item.id)}" aria-label="查看 ${escapeHtml(item.name)} 的提交详情"><svg><use href="#icon-eye"/></svg></button></td>
        </tr>`;
    }

    function mobileCardMarkup(item) {
        const guestText = item.guestCount ? `${item.guestCount} 人` : "待确认";
        return `<article class="mobile-card ${item.read ? "" : "is-unread"}">
            <div class="mobile-card-head">${guestMarkup(item)}${badgeMarkup(item.attendance)}</div>
            <div class="mobile-card-grid"><div><span>手机号</span><a class="phone-link" href="tel:${escapeHtml(item.phone.replace(/\s/g, ""))}">${escapeHtml(item.phone)}</a></div><div><span>出席人数</span><strong>${guestText}</strong></div></div>
            <p class="mobile-message">${escapeHtml(item.message || "暂无留言")}</p>
            <div class="mobile-card-foot"><time>${escapeHtml(item.submittedAt)}</time><button class="button button-light mobile-view" type="button" data-view-id="${escapeHtml(item.id)}"><svg><use href="#icon-eye"/></svg>查看详情</button></div>
        </article>`;
    }

    function renderPagination(total) {
        const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
        if (state.page > pageCount) state.page = pageCount;
        elements.previousPage.disabled = state.page === 1 || total === 0;
        elements.nextPage.disabled = state.page === pageCount || total === 0;
        elements.pageNumbers.innerHTML = Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => `<button type="button" data-page="${page}" class="${page === state.page ? "is-active" : ""}" aria-label="第 ${page} 页" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`).join("");
    }

    function renderList() {
        const filtered = filteredMessages();
        const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
        state.page = Math.min(state.page, pageCount);
        const start = (state.page - 1) * state.pageSize;
        const pageItems = filtered.slice(start, start + state.pageSize);
        elements.filteredCount.textContent = filtered.length;
        elements.messageRows.innerHTML = pageItems.map(rowMarkup).join("");
        elements.mobileList.innerHTML = pageItems.map(mobileCardMarkup).join("");
        elements.emptyState.hidden = filtered.length > 0;
        elements.messageRows.closest(".table-wrap").hidden = filtered.length === 0;
        elements.mobileList.hidden = filtered.length === 0;
        elements.rangeText.textContent = filtered.length ? `显示 ${start + 1}–${Math.min(start + state.pageSize, filtered.length)} 条，共 ${filtered.length} 条` : "显示 0–0 条，共 0 条";
        renderPagination(filtered.length);
    }

    function render() {
        renderStats();
        renderList();
    }

    function showToast(message) {
        window.clearTimeout(toastTimer);
        elements.toast.textContent = message;
        elements.toast.classList.add("is-visible");
        toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
    }

    function showDetail(id) {
        const item = state.messages.find((message) => message.id === id);
        if (!item) return;
        item.read = true;
        const meta = attendanceMeta[item.attendance] || attendanceMeta.pending;
        document.getElementById("detailAvatar").textContent = item.name.slice(0, 1);
        document.getElementById("detailName").textContent = item.name;
        document.getElementById("detailId").textContent = item.id;
        document.getElementById("detailPhone").textContent = item.phone;
        document.getElementById("detailPhone").href = `tel:${item.phone.replace(/\s/g, "")}`;
        document.getElementById("detailGuests").textContent = item.guestCount ? `${item.guestCount} 人` : "尚未确认";
        document.getElementById("detailTime").textContent = item.submittedAt;
        document.getElementById("detailRead").textContent = "已经查看";
        document.getElementById("detailMessage").textContent = item.message || "暂无留言";
        const detailBadge = document.getElementById("detailBadge");
        detailBadge.textContent = meta.label;
        detailBadge.className = `badge ${meta.className}`;
        render();
        elements.detailDialog.showModal();
    }

    function resetFilters() {
        Object.assign(state, { query: "", attendance: "all", read: "all", page: 1 });
        elements.searchInput.value = "";
        elements.attendanceFilter.value = "all";
        elements.readFilter.value = "all";
        renderList();
    }

    function exportCsv() {
        const records = filteredMessages();
        const rows = [["编号", "姓名", "手机号", "出席状态", "人数", "留言", "提交时间", "查看状态"], ...records.map((item) => [item.id, item.name, item.phone, attendanceMeta[item.attendance].label, item.guestCount || "待确认", item.message, item.submittedAt, item.read ? "已查看" : "未查看"])];
        const csv = "\ufeff" + rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `wagaga-messages-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast(`已导出 ${records.length} 条记录`);
    }

    function bindEvents() {
        elements.searchInput.addEventListener("input", (event) => { state.query = event.target.value; state.page = 1; renderList(); });
        elements.attendanceFilter.addEventListener("change", (event) => { state.attendance = event.target.value; state.page = 1; renderList(); });
        elements.readFilter.addEventListener("change", (event) => { state.read = event.target.value; state.page = 1; renderList(); });
        document.getElementById("clearFiltersButton").addEventListener("click", resetFilters);
        document.getElementById("refreshButton").addEventListener("click", () => { render(); showToast("列表已刷新"); });
        document.getElementById("exportButton").addEventListener("click", exportCsv);
        elements.previousPage.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; renderList(); } });
        elements.nextPage.addEventListener("click", () => { state.page += 1; renderList(); });
        elements.pageNumbers.addEventListener("click", (event) => { const button = event.target.closest("[data-page]"); if (button) { state.page = Number(button.dataset.page); renderList(); } });
        document.addEventListener("click", (event) => { const button = event.target.closest("[data-view-id]"); if (button) showDetail(button.dataset.viewId); });
        document.getElementById("dialogCloseButton").addEventListener("click", () => elements.detailDialog.close());
        elements.detailDialog.addEventListener("click", (event) => { if (event.target === elements.detailDialog) elements.detailDialog.close(); });

        const menuButton = document.getElementById("menuButton");
        const closeSidebar = () => { document.body.classList.remove("sidebar-open"); menuButton.setAttribute("aria-expanded", "false"); };
        menuButton.addEventListener("click", () => { const open = document.body.classList.toggle("sidebar-open"); menuButton.setAttribute("aria-expanded", String(open)); });
        document.getElementById("sidebarBackdrop").addEventListener("click", closeSidebar);
        window.addEventListener("resize", () => { if (window.innerWidth > 920) closeSidebar(); });
    }

    function init() {
        cacheElements();
        loadMessages();
        bindEvents();
        render();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
