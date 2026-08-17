"use strict";

document.addEventListener("DOMContentLoaded", () => {
  initCountdown();
  initScrollAnimations();
  initGallery();
  initBackToTop();
  initRsvpForm();
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
  const links = Array.from(document.querySelectorAll(".gallery-lightbox"));
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

  const success = form.querySelector("#success");
  const error = form.querySelector("#error");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const guest = form.elements.guest.value;
    const isValidPhone = /^1\d{10}$/.test(phone);

    success.style.display = "none";
    error.style.display = "none";

    if (!name || !isValidPhone || !guest) {
      error.textContent = "请填写姓名、11 位手机号和出席人数。";
      error.style.display = "block";
      return;
    }

    error.textContent = "登记提交功能尚未接入，请稍后再试。";
    error.style.display = "block";
  });
}
