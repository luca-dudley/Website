document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const mainContent = document.getElementById('mainContent');
  const sidebarNavButtons = document.querySelectorAll('.sidebar-nav-btn');
  const sidebarFilterButtons = document.querySelectorAll('.sidebar-filter-btn');

const setActiveSidebarButton = (buttons, activeButton) => {
    buttons.forEach((button) => {
      button.classList.remove('bg-primary', 'text-white', 'shadow-sm', 'font-semibold');
      button.classList.add('text-slate-600', 'font-medium', 'hover:bg-slate-200/60');
      // Dim inactive icons
      const svg = button.querySelector('svg');
      if (svg) svg.classList.add('text-slate-400');
    });

    activeButton.classList.add('bg-primary', 'text-white', 'shadow-sm', 'font-semibold');
    activeButton.classList.remove('text-slate-600', 'hover:bg-slate-200/60');
    // Highlight active icon
    const activeSvg = activeButton.querySelector('svg');
    if (activeSvg) activeSvg.classList.remove('text-slate-400');
  };

  const currentPage = window.location.pathname.split('/').pop() || 'vault.html';
  if (sidebarNavButtons.length > 0) {
    sidebarNavButtons.forEach((button) => {
      const href = button.getAttribute('href');
      if (href && href === currentPage) {
        setActiveSidebarButton(sidebarNavButtons, button);
      }
    });

    sidebarNavButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        const href = button.getAttribute('href');
        const isRealRoute = href && href !== '#';

        if (!isRealRoute) {
          event.preventDefault();
          setActiveSidebarButton(sidebarNavButtons, button);
        }
      });
    });
  }

  if (sidebarFilterButtons.length > 0) {
    sidebarFilterButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setActiveSidebarButton(sidebarFilterButtons, button);
      });
    });
  }

  const closeMobileSidebar = () => {
    if (!sidebar || window.innerWidth >= 1024) return;
    sidebar.classList.add('-translate-x-full');
    sidebarBackdrop?.classList.add('hidden');
    mobileMenuBtn?.setAttribute('aria-expanded', 'false');
  };

  const openMobileSidebar = () => {
    if (!sidebar || window.innerWidth >= 1024) return;
    sidebar.classList.remove('-translate-x-full');
    sidebarBackdrop?.classList.remove('hidden');
    mobileMenuBtn?.setAttribute('aria-expanded', 'true');
  };

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      if (sidebar.classList.contains('-translate-x-full')) {
        openMobileSidebar();
      } else {
        closeMobileSidebar();
      }
    });
  }

  sidebarBackdrop?.addEventListener('click', closeMobileSidebar);

  if (sidebarNavButtons.length > 0 && sidebar && mobileMenuBtn) {
    sidebarNavButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (window.innerWidth < 1024) {
          closeMobileSidebar();
        }
      });
    });
  }

if (sidebarToggle && sidebar && mainContent) {
    sidebarToggle.addEventListener('click', () => {
      if (window.innerWidth < 1024) {
        return;
      }

      const isCollapsed = sidebar.classList.toggle('collapsed');
      mainContent.classList.toggle('lg:ml-20', isCollapsed);
      mainContent.classList.toggle('lg:ml-64', !isCollapsed);
      mainContent.style.marginLeft = '';
      sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
      sidebarToggle.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    });
  }
});