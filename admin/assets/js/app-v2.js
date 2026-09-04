(function () {
    "use strict";

    const state = {
        messages: [],
        query: "",
        attendance: "all",
        confirmation: "all",
        page: 1,
        pageSize: 8,
        selectedId: null,
        user: null
    };
    const attendanceMeta = {
        yes: { label: "确认出席", className: "badge-yes" },
        no: { label: "无法出席", className: "badge-no" },
        pending: { label: "尚未确定", className: "badge-pending" }
    };
    const elements = {};
    let toastTimer;

    function cacheElements() {
        ["messageRows", "mobileList", "emptyState", "filteredCount", "totalCount", "attendingCount", "attendingGuests", "declinedCount", "unconfirmedCount", "unconfirmedNavCount", "searchInput", "attendanceFilter", "confirmationFilter", "rangeText", "pageNumbers", "previousPage", "nextPage", "detailDialog", "confirmationButton", "refreshButton", "toast", "loginView", "adminApp", "loginForm", "loginUsername", "loginPassword", "loginButton", "loginError", "logoutButton", "operatorName", "operatorAvatar"].forEach((id) => {
            elements[id] = document.getElementById(id);
        });
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
    }

    function formatTime(value) {
        return String(value || "—").replace("T", " ").slice(0, 16);
    }

    function normalizeSubmission(item) {
        return {
            ...item,
            id: String(item.id),
            displayId: item.displayId || String(item.id),
            guestCount: Number(item.guestCount) >= 1 ? Number(item.guestCount) : 1,
            confirmed: Boolean(item.confirmed),
            message: item.message || "",
            submittedAt: formatTime(item.submittedAt)
        };
    }

    async function parseResponse(response) {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(payload.error || (response.status === 429 ? "尝试次数过多，请稍后再试。" : "服务器暂时无法处理请求。"));
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    function showLogin(message = "") {
        state.user = null;
        state.messages = [];
        document.body.classList.remove("sidebar-open");
        if (elements.detailDialog.open) elements.detailDialog.close();
        elements.adminApp.hidden = true;
        elements.loginView.hidden = false;
        elements.loginError.textContent = message;
        window.setTimeout(() => elements.loginPassword.focus(), 0);
    }

    function showAdmin(user) {
        state.user = user;
        const username = String(user?.username || "admin");
        elements.operatorName.textContent = username;
        elements.operatorAvatar.textContent = username.slice(0, 2).toUpperCase();
        elements.loginView.hidden = true;
        elements.adminApp.hidden = false;
        elements.loginError.textContent = "";
    }

    async function loadMessages(showSuccess = false) {
        elements.refreshButton.disabled = true;
        try {
            const response = await fetch("/api/submissions", { headers: { Accept: "application/json" }, cache: "no-store" });
            const payload = await parseResponse(response);
            state.messages = Array.isArray(payload.submissions) ? payload.submissions.map(normalizeSubmission) : [];
            render();
            if (showSuccess) showToast("列表已同步");
        } catch (error) {
            if (error.status === 401) return showLogin("登录已过期，请重新登录。");
            showToast(error.message || "读取提交信息失败。", true);
        } finally {
            elements.refreshButton.disabled = false;
        }
    }

    function filteredMessages() {
        const query = state.query.trim().toLocaleLowerCase("zh-CN");
        return state.messages.filter((item) => {
            const searchable = `${item.name} ${item.phone} ${item.message} ${item.displayId}`.toLocaleLowerCase("zh-CN");
            const confirmationMatches = state.confirmation === "all"
                || (state.confirmation === "confirmed" ? item.confirmed : !item.confirmed);
            return (!query || searchable.includes(query))
                && (state.attendance === "all" || item.attendance === state.attendance)
                && confirmationMatches;
        });
    }

    function renderStats() {
        const attending = state.messages.filter((item) => item.attendance === "yes");
        const declined = state.messages.filter((item) => item.attendance === "no");
        const unconfirmed = state.messages.filter((item) => !item.confirmed);
        elements.totalCount.textContent = state.messages.length;
        elements.attendingCount.textContent = attending.length;
        elements.attendingGuests.textContent = `共 ${attending.reduce((sum, item) => sum + item.guestCount, 0)} 位宾客`;
        elements.declinedCount.textContent = declined.length;
        elements.unconfirmedCount.textContent = unconfirmed.length;
        elements.unconfirmedNavCount.textContent = unconfirmed.length;
    }

    function attendanceBadgeMarkup(attendance) {
        const meta = attendanceMeta[attendance] || attendanceMeta.pending;
        return `<span class="badge ${meta.className}">${meta.label}</span>`;
    }

    function confirmationBadgeMarkup(confirmed) {
        return confirmed
            ? '<span class="badge badge-confirmed">已经确认</span>'
            : '<span class="badge badge-unconfirmed">尚未确认</span>';
    }

    function guestMarkup(item) {
        const marker = item.confirmed ? "" : '<i class="new-dot" title="尚未确认"></i>';
        return `<div class="guest-cell"><span class="avatar">${escapeHtml(item.name.slice(0, 1))}</span><div><strong>${escapeHtml(item.name)}${marker}</strong><small>${escapeHtml(item.displayId)}</small></div></div>`;
    }

    function rowMarkup(item) {
        return `<tr class="${item.confirmed ? "" : "is-unconfirmed"}">
            <td>${guestMarkup(item)}</td>
            <td><a class="phone-link" href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></td>
            <td>${attendanceBadgeMarkup(item.attendance)}</td>
            <td><span class="guest-count"><svg><use href="#icon-users"/></svg>${item.guestCount} 人</span></td>
            <td><p class="message-preview" title="${escapeHtml(item.message)}">${escapeHtml(item.message || "暂无留言")}</p></td>
            <td>${confirmationBadgeMarkup(item.confirmed)}</td>
            <td><time class="time-cell">${escapeHtml(item.submittedAt)}</time></td>
            <td><button class="view-button" type="button" data-view-id="${escapeHtml(item.id)}" aria-label="查看 ${escapeHtml(item.name)} 的提交详情"><svg><use href="#icon-eye"/></svg></button></td>
        </tr>`;
    }

    function mobileCardMarkup(item) {
        return `<article class="mobile-card ${item.confirmed ? "" : "is-unconfirmed"}">
            <div class="mobile-card-head">${guestMarkup(item)}${attendanceBadgeMarkup(item.attendance)}</div>
            <div class="mobile-card-grid"><div><span>手机号</span><a class="phone-link" href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></div><div><span>出席人数</span><strong>${item.guestCount} 人</strong></div></div>
            <div>${confirmationBadgeMarkup(item.confirmed)}</div>
            <p class="mobile-message">${escapeHtml(item.message || "暂无留言")}</p>
            <div class="mobile-card-foot"><time>${escapeHtml(item.submittedAt)}</time><button class="button button-light mobile-view" type="button" data-view-id="${escapeHtml(item.id)}"><svg><use href="#icon-eye"/></svg>查看详情</button></div>
        </article>`;
    }

    function renderPagination(total) {
        const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
        if (state.page > pageCount) state.page = pageCount;
        elements.previousPage.disabled = state.page === 1 || total === 0;
        elements.nextPage.disabled = state.page === pageCount || total === 0;
        elements.pageNumbers.innerHTML = Array.from({ length: pageCount }, (_, index) => index + 1)
            .map((page) => `<button type="button" data-page="${page}" class="${page === state.page ? "is-active" : ""}" aria-label="第 ${page} 页" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`).join("");
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

    function showToast(message, isError = false) {
        window.clearTimeout(toastTimer);
        elements.toast.textContent = message;
        elements.toast.classList.toggle("is-error", isError);
        elements.toast.classList.add("is-visible");
        toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
    }

    function renderDetail(item) {
        const meta = attendanceMeta[item.attendance] || attendanceMeta.pending;
        document.getElementById("detailAvatar").textContent = item.name.slice(0, 1);
        document.getElementById("detailName").textContent = item.name;
        document.getElementById("detailId").textContent = item.displayId;
        document.getElementById("detailPhone").textContent = item.phone;
        document.getElementById("detailPhone").href = `tel:${item.phone}`;
        document.getElementById("detailGuests").textContent = `${item.guestCount} 人`;
        document.getElementById("detailTime").textContent = item.submittedAt;
        document.getElementById("detailConfirmation").textContent = item.confirmed ? "已经确认" : "尚未确认";
        document.getElementById("detailMessage").textContent = item.message || "暂无留言";
        const detailBadge = document.getElementById("detailBadge");
        detailBadge.textContent = meta.label;
        detailBadge.className = `badge ${meta.className}`;
        elements.confirmationButton.classList.toggle("is-cancel", item.confirmed);
        elements.confirmationButton.querySelector("span").textContent = item.confirmed ? "取消确认" : "确认记录";
        elements.confirmationButton.setAttribute("aria-pressed", String(item.confirmed));
    }

    function showDetail(id) {
        const item = state.messages.find((message) => message.id === String(id));
        if (!item) return;
        state.selectedId = item.id;
        renderDetail(item);
        elements.detailDialog.showModal();
    }

    async function toggleConfirmation() {
        const item = state.messages.find((message) => message.id === state.selectedId);
        if (!item) return;
        const nextConfirmed = !item.confirmed;
        elements.confirmationButton.disabled = true;
        try {
            const response = await fetch(`/api/submissions/${encodeURIComponent(item.id)}/confirmation`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ confirmed: nextConfirmed })
            });
            const payload = await parseResponse(response);
            const updated = normalizeSubmission(payload.submission);
            const index = state.messages.findIndex((message) => message.id === item.id);
            state.messages.splice(index, 1, updated);
            render();
            renderDetail(updated);
            showToast(nextConfirmed ? "已确认这条记录" : "已取消确认");
        } catch (error) {
            if (error.status === 401) return showLogin("登录已过期，请重新登录。");
            showToast(error.message || "状态保存失败。", true);
        } finally {
            elements.confirmationButton.disabled = false;
        }
    }

    function resetFilters() {
        Object.assign(state, { query: "", attendance: "all", confirmation: "all", page: 1 });
        elements.searchInput.value = "";
        elements.attendanceFilter.value = "all";
        elements.confirmationFilter.value = "all";
        renderList();
    }

    function exportCsv() {
        const records = filteredMessages();
        const rows = [["编号", "姓名", "手机号", "出席状态", "人数", "留言", "提交时间", "确认状态"], ...records.map((item) => [item.displayId, item.name, item.phone, (attendanceMeta[item.attendance] || attendanceMeta.pending).label, item.guestCount, item.message, item.submittedAt, item.confirmed ? "已经确认" : "尚未确认"])];
        const csv = "\ufeff" + rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `wagaga-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast(`已导出 ${records.length} 条记录`);
    }

    async function handleLogin(event) {
        event.preventDefault();
        const username = elements.loginUsername.value.trim();
        const password = elements.loginPassword.value;
        elements.loginButton.disabled = true;
        elements.loginButton.querySelector("span").textContent = "正在登录…";
        elements.loginError.textContent = "";
        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ username, password })
            });
            const payload = await parseResponse(response);
            elements.loginPassword.value = "";
            showAdmin(payload.user);
            await loadMessages();
        } catch (error) {
            elements.loginError.textContent = error.message || "登录失败，请稍后重试。";
            elements.loginPassword.select();
        } finally {
            elements.loginButton.disabled = false;
            elements.loginButton.querySelector("span").textContent = "登录";
        }
    }

    async function logout() {
        elements.logoutButton.disabled = true;
        try {
            const response = await fetch("/api/logout", { method: "POST", headers: { Accept: "application/json" } });
            await parseResponse(response);
            elements.loginPassword.value = "";
            showLogin();
        } catch (error) {
            showToast(error.message || "退出登录失败，请稍后重试。", true);
        } finally {
            elements.logoutButton.disabled = false;
        }
    }

    async function restoreSession() {
        try {
            const response = await fetch("/api/session", { headers: { Accept: "application/json" }, cache: "no-store" });
            if (response.status === 401) return showLogin();
            const payload = await parseResponse(response);
            showAdmin(payload.user);
            await loadMessages();
        } catch (error) {
            showLogin(error.message || "暂时无法连接服务器，请稍后重试。");
        }
    }

    function bindEvents() {
        elements.loginForm.addEventListener("submit", handleLogin);
        elements.logoutButton.addEventListener("click", logout);
        elements.searchInput.addEventListener("input", (event) => { state.query = event.target.value; state.page = 1; renderList(); });
        elements.attendanceFilter.addEventListener("change", (event) => { state.attendance = event.target.value; state.page = 1; renderList(); });
        elements.confirmationFilter.addEventListener("change", (event) => { state.confirmation = event.target.value; state.page = 1; renderList(); });
        document.getElementById("clearFiltersButton").addEventListener("click", resetFilters);
        elements.refreshButton.addEventListener("click", () => loadMessages(true));
        document.getElementById("exportButton").addEventListener("click", exportCsv);
        elements.confirmationButton.addEventListener("click", toggleConfirmation);
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
        bindEvents();
        render();
        restoreSession();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
