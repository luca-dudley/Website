document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
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

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      const isClosed = sidebar.classList.contains('-translate-y-full');
      sidebar.classList.toggle('-translate-y-full', !isClosed);
      sidebar.classList.toggle('opacity-0', !isClosed);
      sidebar.classList.toggle('pointer-events-none', !isClosed);
      mobileMenuBtn.setAttribute('aria-expanded', String(isClosed));
    });
  }

  if (sidebarNavButtons.length > 0 && sidebar && mobileMenuBtn) {
    sidebarNavButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (window.innerWidth < 1024) {
          sidebar.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none');
          mobileMenuBtn.setAttribute('aria-expanded', 'false');
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
      mainContent.style.marginLeft = isCollapsed ? '5rem' : '16rem';
      sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
      sidebarToggle.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    });
  }
});