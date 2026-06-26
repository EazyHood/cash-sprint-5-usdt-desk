document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

document.querySelectorAll("[data-scroll-to]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.getAttribute("data-scroll-to"));
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
