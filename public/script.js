// ─── Scroll Reveal ──────────────────────────────────────────────────────────
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// ─── Navbar Scroll ──────────────────────────────────────────────────────────
const navbar = document.getElementById('navbar');
const heroSection = document.getElementById('hero');

function updateNavbar() {
  if (!heroSection || !navbar) return;
  const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
  navbar.classList.toggle('scrolled', window.scrollY > heroBottom - 80);
}

window.addEventListener('scroll', updateNavbar, { passive: true });
updateNavbar();

// ─── FAQ Accordion ──────────────────────────────────────────────────────────
document.querySelectorAll('.faq-question').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-answer');
    const isOpen = item.classList.contains('open');

    // Close all
    document.querySelectorAll('.faq-item.open').forEach((openItem) => {
      openItem.classList.remove('open');
      openItem.querySelector('.faq-answer').style.maxHeight = '0';
    });

    // Open clicked (if it was closed)
    if (!isOpen) {
      item.classList.add('open');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }
  });
});

// ─── Smooth Scroll for Anchor Links ─────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
