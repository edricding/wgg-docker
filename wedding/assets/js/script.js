"use strict";

document.addEventListener("DOMContentLoaded", () => {
  initCountdown();
  initScrollAnimations();
  initGallery();
  initBackToTop();
  initRsvpForm();
  initCopyText();
});

window.addEventListener("load", () => {
  const preloader = document.querySelector(".preloader");
  if (preloader) {
    preloader.classList.add("is-hidden");
    window.setTimeout(() => preloader.remove(), 350);
  }
});

function initCountdown() {
  const clock = document.querySelector("#clock");
  if (!clock) return;

  const weddingDate = new Date(clock.dataset.date);
  if (Number.isNaN(weddingDate.getTime())) return;

  const units = [
    ["days", "天"],
    ["hours", "时"],
    ["minutes", "分"],
    ["seconds", "秒"],
  ];

  clock.innerHTML = units
    .map(([name, label]) => `<div class="box"><div><div class="time ${name}">0</div><span>${label}</span></div></div>`)
    .join("");

  const fields = Object.fromEntries(
    units.map(([name]) => [name, clock.querySelector(`.${name}`)]),
  );

  let timer;
  const update = () => {
    const remaining = Math.max(0, weddingDate.getTime() - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);

    fields.days.textContent = String(Math.floor(totalSeconds / 86400)).padStart(2, "0");
    fields.hours.textContent = String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, "0");
    fields.minutes.textContent = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    fields.seconds.textContent = String(totalSeconds % 60).padStart(2, "0");

    if (remaining === 0 && timer) window.clearInterval(timer);
  };

  update();
  timer = window.setInterval(update, 1000);
}

function initScrollAnimations() {
  const elements = document.querySelectorAll(".wow");
  if (!elements.length) return;

  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15 },
  );

  elements.forEach((element) => observer.observe(element));
}

function initGallery() {
  const links = document.querySelectorAll(".gallery-lightbox");
  if (!links.length) return;

  const lightbox = document.createElement("div");
  lightbox.className = "gallery-modal";
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "照片预览");
  lightbox.innerHTML = `
    <button type="button" class="gallery-modal__close" aria-label="关闭照片预览">&times;</button>
    <img class="gallery-modal__image" alt="婚礼照片预览">
  `;
  document.body.appendChild(lightbox);

  const image = lightbox.querySelector(".gallery-modal__image");
  const closeButton = lightbox.querySelector(".gallery-modal__close");

  const close = () => {
    lightbox.classList.remove("is-open");
    document.body.classList.remove("gallery-open");
  };

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      image.src = link.href;
      lightbox.classList.add("is-open");
      document.body.classList.add("gallery-open");
      closeButton.focus();
    });
  });

  closeButton.addEventListener("click", close);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("is-open")) close();
  });
}

function initBackToTop() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "back-to-top";
  button.setAttribute("aria-label", "返回顶部");
  button.innerHTML = '<span aria-hidden="true">↑</span>';
  document.body.appendChild(button);

  const update = () => button.classList.toggle("is-visible", window.scrollY > 500);
  window.addEventListener("scroll", update, { passive: true });
  update();

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function initRsvpForm() {
  const form = document.querySelector("#contact-form-main");
  if (!form) return;

  const error = form.querySelector("#error");

  const submitButton = form.querySelector("button[type='submit']");
  const setFeedback = (message, type = "error") => {
    error.textContent = message;
    error.classList.toggle("is-success", type === "success");
    error.style.display = "block";
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const attendance = form.elements["radio-group"].value || "yes";
    const guestCount = Number.parseInt(form.elements.guest.value, 10) || 1;
    const isValidPhone = /^1\d{10}$/.test(phone);

    error.style.display = "none";
    error.classList.remove("is-success");

    if (!name || !isValidPhone) {
      setFeedback("请填写姓名和正确的 11 位手机号。");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "提交中…";

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, phone, attendance, guestCount }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "提交失败，请稍后重试。");

      form.reset();
      form.elements.guest.value = "1";
      form.querySelector("#attend").checked = true;
      setFeedback("登记成功，感谢您的回复！", "success");
    } catch (submitError) {
      setFeedback(submitError.message || "网络有些问题，请稍后重试。");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "登记";
    }
  });
}

function initCopyText() {
  const triggers = document.querySelectorAll("[data-copy-text]");
  if (!triggers.length) return;

  const toast = document.createElement("div");
  toast.className = "copy-toast font-smiley";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("aria-atomic", "true");
  document.body.appendChild(toast);

  let hideTimer;
  const showToast = (message, isError = false) => {
    window.clearTimeout(hideTimer);
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.classList.add("is-visible");
    hideTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  };

  const fallbackCopy = (text) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy command failed");
  };

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back for browsers that expose the API but deny clipboard access.
      }
    }
    fallbackCopy(text);
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", async () => {
      try {
        await copyText(trigger.dataset.copyText);
        showToast("复制成功");
      } catch {
        showToast("复制失败，请长按文字复制", true);
      }
    });
  });
}
