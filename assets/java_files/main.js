document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mainContent = document.getElementById('mainContent');
  const sidebarNavButtons = document.querySelectorAll('.sidebar-nav-btn');
  const sidebarFilterButtons = document.querySelectorAll('.sidebar-filter-btn');

  const setActiveSidebarButton = (buttons, activeButton) => {
    buttons.forEach((button) => {
      button.classList.remove('bg-black/5', 'text-black', 'font-medium');
      button.classList.add('text-muted');
    });

    activeButton.classList.add('bg-black/5', 'text-black', 'font-medium');
    activeButton.classList.remove('text-muted');
  };

  const currentPage = window.location.pathname.split('/').pop();
  if (sidebarNavButtons.length > 0) {
    sidebarNavButtons.forEach((button) => {
      const href = button.getAttribute('href');
      if (href && href !== '#' && href === currentPage) {
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
      sidebarToggle.textContent = isCollapsed ? '>>' : '<<';
      sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
      sidebarToggle.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    });
  }

  const hydrateMemberProfile = async () => {
    try {
      const memberstack = window.$memberstackDom;
      if (!memberstack) {
        return;
      }

      const { data: member } = await memberstack.getCurrentMember();
      if (!member) {
        return;
      }

      const fName = member.customFields?.['first-name'] || '';
      const lName = member.customFields?.['last-name'] || '';
      const initials = `${fName.charAt(0)}${lName.charAt(0)}`.toUpperCase() || 'U';

      document.querySelectorAll('[data-dynamic-initials]').forEach((initialsEl) => {
        initialsEl.textContent = initials;
      });

      if (member.profileImage) {
        document.querySelectorAll('[data-dynamic-profile-img]').forEach((imgEl) => {
          imgEl.src = member.profileImage;
          imgEl.classList.remove('hidden');
        });
      }
    } catch (error) {
      console.error('Memberstack initialization pending.');
    }
  };

  hydrateMemberProfile();
});
