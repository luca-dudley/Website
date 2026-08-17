// assets/java_files/profile-engine.js

// 1. INITIALIZE GLOBAL REPO INSTANCES
const supabaseUrl = 'https://ujhfkvoaaebdntuheyqo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaGZrdm9hYWViZG50dWhleXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTQzODYsImV4cCI6MjA5NzQzMDM4Nn0._r6CkysZr5qpV1zKz-otN_FZJfNzKlCJvm6ggO9qTV0';

if (!window.dbClient) {
  window.dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}
window.userCompanyId = null;
window.currentCompanyTier = 'basic';

// 2. DOM MULTI-PAGE INJECTION ENGINE
async function injectProfileModalContainer() {
  if (document.getElementById('profileModal')) {
    console.log('[ProfileEngine] #profileModal already present, skipping injection.');
    return true;
  }

  try {
    const response = await fetch('profile-modal.html');
    if (!response.ok) throw new Error(`Fetch failed with status ${response.status} (${response.statusText}) for profile-modal.html`);
    const htmlText = await response.text();
    document.body.insertAdjacentHTML('beforeend', htmlText);

    // Verify the injection actually landed before anything downstream trusts it.
    if (!document.getElementById('profileModal')) {
      throw new Error('profile-modal.html was fetched successfully but #profileModal was not found in the DOM after injection - check the file markup for a stray wrapper or missing id.');
    }
    console.log('[ProfileEngine] Profile modal mounted successfully.');
    return true;
  } catch (err) {
    console.error('[ProfileEngine] CRITICAL: Modal injection failed -', err.message);
    return false;
  }
}

// 3. UI TAB & ANIMATION TRIGGERS
function openProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

function switchProfileTab(tabName) {
  document.querySelectorAll('.profile-tab-content').forEach(tab => {
    tab.classList.add('hidden');
    tab.classList.remove('block');
  });
  ['profile', 'security', 'plans', 'team'].forEach(name => {
    const btn = document.getElementById(`tab-btn-${name}`);
    if (btn) btn.className = "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-md text-slate-600 hover:bg-slate-100 transition-colors";
  });
  
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) {
    targetTab.classList.remove('hidden');
    targetTab.classList.add('block');
  }

  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  if (activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-md bg-blue-50 text-blue-700 transition-colors";

  // Trigger team roster fetch when switching to team tab
  if (tabName === 'team') {
    fetchCompanyTeamMembers();
  }
}

// 4. BACKEND SUPABASE OPERATION LOGICS
async function handleSignOut() {
  await window.dbClient.auth.signOut();
  window.location.replace('index.html');
}

async function linkGoogleAccount() {
  const btn = document.getElementById('google-link-btn');
  if (btn.disabled) return;
  const textSpan = document.getElementById('google-link-text');
  const originalText = textSpan.innerText;
  textSpan.innerText = 'Connecting to Google...';
  try {
    const { data, error } = await window.dbClient.auth.linkIdentity({
      provider: 'google',
      options: { 
        redirectTo: window.location.origin + '/vault.html'
      }
    });
    if (error) throw error;
    if (data?.url) {
      window.location.href = data.url; // Navigate to Google OAuth screen
    }
  } catch (error) {
    console.error("Google Link error:", error);
    // If the account is already linked
    if (error.message && error.message.toLowerCase().includes('already')) {
      textSpan.innerText = 'Google Already Linked';
      btn.disabled = true;
      btn.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
      textSpan.innerText = 'Error - Try Again';
      setTimeout(() => { textSpan.innerText = originalText; }, 3000);
    }
  }
}

async function handlePasswordReset() {
  const btn = document.getElementById('reset-pwd-btn');
  const email = document.getElementById('profile-email-input').value;
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Sending...';
  try {
    const { error } = await window.dbClient.auth.resetPasswordForEmail(email);
    if (error) throw error;
    btn.innerHTML = 'Check your Email!';
    btn.classList.replace('text-slate-700', 'text-green-700');
  } catch (error) {
    console.error("Reset error:", error);
    btn.innerHTML = 'Error - Try Again';
  }
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.classList.replace('text-green-700', 'text-slate-700');
  }, 4000);
}

async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  const btn = document.getElementById('upload-avatar-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Uploading...';
  try {
    const { data: { user } } = await window.dbClient.auth.getUser();
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${fileExt}`;
    const { error: uploadError } = await window.dbClient.storage.from('avatars').upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data } = window.dbClient.storage.from('avatars').getPublicUrl(filePath);
    const avatarUrl = data.publicUrl + '?t=' + Date.now();
    await window.dbClient.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
    document.querySelectorAll('[data-dynamic-profile-img]').forEach(img => {
      img.src = avatarUrl;
      img.classList.remove('hidden');
    });
    document.querySelectorAll('[data-dynamic-initials]').forEach(span => span.classList.add('hidden'));
    btn.innerHTML = 'Uploaded!';
  } catch (error) {
    console.error("Upload error:", error);
    btn.innerHTML = 'Upload Failed';
  }
  setTimeout(() => { btn.innerHTML = originalText; }, 3000);
}

async function saveUserProfile() {
  const saveBtn = document.getElementById('save-profile-btn');
  const originalText = saveBtn.innerText;
  saveBtn.innerText = 'Saving...';
  try {
    const { data: { user } } = await window.dbClient.auth.getUser();
    const fName = document.getElementById('profile-fname').value;
    const lName = document.getElementById('profile-lname').value;
    const jobTitle = document.getElementById('profile-title').value;
    const companyName = document.getElementById('profile-company').value;

    // 1. Update Profile (saving job title to role or job_title column)
    await window.dbClient.from('profiles').update({
      first_name: fName,
      last_name: lName,
      role: jobTitle
    }).eq('id', user.id);

    // 2. Update Company Name
    if (window.userCompanyId) {
      await window.dbClient.from('companies').update({ name: companyName }).eq('id', window.userCompanyId);
    }

    const initials = ((fName.charAt(0) || '') + (lName.charAt(0) || '')).toUpperCase() || 'U';
    document.querySelectorAll('[data-dynamic-initials]').forEach(el => el.textContent = initials);

    const headerClientName = document.querySelector('header.hidden.lg\\:block .text-right p span:first-child');
    if (headerClientName) headerClientName.parentElement.innerHTML = `<span>${fName}</span> <span>${lName}</span>`;

    saveBtn.innerText = 'Saved!';
    setTimeout(() => { saveBtn.innerText = originalText; }, 2000);
  } catch (error) {
    console.error('Error saving profile:', error);
    saveBtn.innerText = 'Error';
    setTimeout(() => { saveBtn.innerText = originalText; }, 2000);
  }
}

// 4b. PROFILE LOADER
// Split into: (a) resolve the auth user & email fields, (b) resolve profile+company
// data with a fallback path, (c) populate the DOM. Steps (b) and (c) are decoupled
// on purpose - a company/tier resolution failure should never blank out fields that
// only depend on the profiles row itself.
async function loadUserProfile(userId) {
  console.groupCollapsed('[ProfileEngine] loadUserProfile');
  try {
    const { data: { user }, error: userError } = await window.dbClient.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      console.warn('[ProfileEngine] No authenticated user found - aborting.');
      console.groupEnd();
      return;
    }
    console.log('[ProfileEngine] Auth user resolved:', user.id, user.email);

    checkNotificationReadStatus(user.id);

    // Auto-link pending invite from Google OAuth
    const pendingCompanyId = localStorage.getItem('pending_invite_company_id');
    const pendingTier = localStorage.getItem('pending_invite_tier') || 'essential';

    if (pendingCompanyId) {
      localStorage.removeItem('pending_invite_company_id');
      localStorage.removeItem('pending_invite_tier');

      const userMeta = user.user_metadata || {};
      const fullName = userMeta.full_name || userMeta.name || '';
      const nameParts = fullName.split(' ');
      const firstName = userMeta.first_name || nameParts[0] || '';
      const lastName = userMeta.last_name || nameParts.slice(1).join(' ') || '';
      const avatarUrl = userMeta.avatar_url || userMeta.picture || null;

      await window.dbClient.from('profiles').upsert([{
        id: user.id,
        company_id: pendingCompanyId,
        first_name: firstName,
        last_name: lastName,
        role: 'Manager',
        tier: pendingTier,
        avatar_url: avatarUrl
      }], { onConflict: 'id' });
    }

    // Check if Google Identity is already attached
    const hasGoogle = user.identities?.some(id => id.provider === 'google') || user.app_metadata?.provider === 'google';
    const googleBtn = document.getElementById('google-link-btn');
    const googleText = document.getElementById('google-link-text');
    if (hasGoogle && googleBtn && googleText) {
      googleBtn.disabled = true;
      googleBtn.classList.replace('hover:bg-slate-50', 'bg-slate-50');
      googleBtn.classList.add('cursor-not-allowed', 'opacity-70');
      googleText.innerText = 'Google Connected';
      googleText.classList.add('text-green-700', 'font-bold');
    }

    // Email fields - independent of the queries below, fill them immediately.
    const sidebarEmail = document.getElementById('sidebar-user-email');
    const emailInput = document.getElementById('profile-email-input');
    if (sidebarEmail) sidebarEmail.textContent = user.email;
    else console.warn('[ProfileEngine] #sidebar-user-email not found in DOM.');
    if (emailInput) emailInput.value = user.email;
    else console.warn('[ProfileEngine] #profile-email-input not found in DOM.');

    // --- Resolve profile + company ---------------------------------------
    // companies:company_id(*) gives PostgREST an explicit FK hint instead of
    // making it guess the relationship from companies(*) alone. After a table
    // rename this is the single most common source of a hard query failure -
    // either the schema cache hasn't been reloaded, or the relationship is now
    // ambiguous. If it still fails (e.g. an RLS policy on profiles/companies
    // still references the old farm_id/farms names), we fall back to two plain
    // queries so the UI degrades gracefully instead of going fully blank.
    let profile = null;
    let companyObj = null;

    const { data: joinedProfile, error: joinedError } = await window.dbClient
      .from('profiles')
      .select('*, companies:company_id(*)')
      .eq('id', user.id)
      .maybeSingle();

    if (joinedError) {
      console.error('[ProfileEngine] Joined profile+company query failed:', joinedError.message, joinedError);
      console.warn('[ProfileEngine] Falling back to a two-step fetch (profile, then company by id).');

      const { data: plainProfile, error: plainError } = await window.dbClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (plainError) {
        console.error('[ProfileEngine] Fallback profile fetch also failed:', plainError.message, plainError);
        throw plainError;
      }
      profile = plainProfile;

      if (profile?.company_id) {
        const { data: companyRow, error: companyError } = await window.dbClient
          .from('companies')
          .select('*')
          .eq('id', profile.company_id)
          .maybeSingle();
        if (companyError) {
          console.error('[ProfileEngine] Fallback company fetch also failed:', companyError.message, companyError);
        } else {
          companyObj = companyRow;
        }
      }
    } else {
      profile = joinedProfile;
      companyObj = Array.isArray(profile?.companies) ? profile.companies[0] : profile?.companies;
    }

    if (!profile) {
      console.error('[ProfileEngine] No profile row resolved for user', user.id, '- check that profiles.id matches this auth.users.id.');
      window.currentCompanyTier = 'basic';
      applyTierRestrictions();
      console.groupEnd();
      return;
    }

    console.log('[ProfileEngine] Resolved profile row:', profile);
    console.log('[ProfileEngine] Resolved company row:', companyObj);

    // --- SUSPENSION & GRACE PERIOD BOUNCER ---
    const subStatus = (companyObj?.subscription_status || 'active').toLowerCase();
    const isAdmin = (profile.role || '').toLowerCase().includes('admin');

    if (subStatus === 'suspended') {
      document.body.innerHTML = `
        <div class="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div class="max-w-lg w-full bg-slate-800 border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl">
            <div class="w-16 h-16 rounded-full bg-red-500/10 text-red-400 mx-auto flex items-center justify-center mb-5">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h2 class="text-2xl font-serif font-bold text-white mb-2">Organization Access Suspended</h2>
            <p class="text-sm text-slate-400 mb-6">
              Your organization's subscription payment could not be processed after the grace period. <strong>All training records and worker data remain safely saved.</strong>
            </p>
            ${isAdmin ? `
              <button onclick="triggerPaystackUpgrade('PLN_glbt6ice9adjj45', 'essential', 'Essential Vault', 22000)" class="w-full bg-primary py-3 rounded-md font-medium text-white hover:bg-primary/90 transition-colors shadow-lg mb-3">
                Reactivate & Update Card Details 💳
              </button>
            ` : `
              <div class="p-3 bg-slate-700/50 rounded-lg text-xs text-slate-300 mb-4">
                Please notify your primary administrator to reactivate your company portal.
              </div>
            `}
            <button onclick="handleSignOut()" class="text-xs text-slate-400 hover:text-white underline">
              Sign Out
            </button>
          </div>
        </div>
      `;
      console.groupEnd();
      return;
    }

    // Check if user is Primary Admin vs Manager
    const userRole = (profile.role || '').toLowerCase();
    const isPlanAdmin = userRole === 'master admin' || userRole === 'admin';

    const managerNotice = document.getElementById('manager-plan-notice');
    const billingActions = document.getElementById('admin-billing-actions');
    const planButtons = document.querySelectorAll('.plan-upgrade-btn');

    if (!isPlanAdmin) {
      if (managerNotice) managerNotice.classList.remove('hidden');
      if (billingActions) billingActions.classList.add('hidden');
      planButtons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-40', 'cursor-not-allowed');
        btn.setAttribute('title', 'Only Primary Administrators can change subscription plans.');
      });
    } else {
      if (managerNotice) managerNotice.classList.add('hidden');
      if (billingActions) billingActions.classList.remove('hidden');
      planButtons.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('opacity-40', 'cursor-not-allowed');
      });
    }

    // --- Resolve company id & tier ----------------------------------------
window.userCompanyId = profile.company_id || companyObj?.id || null;
    window.currentCompanyTier = (companyObj?.tier || profile.tier || 'basic').toLowerCase();
    console.log('[ProfileEngine] Resolved tier:', window.currentCompanyTier, '| companyId:', window.userCompanyId);

    const currentPlanName = document.getElementById('current-plan-name');
    if (currentPlanName) currentPlanName.textContent = window.currentCompanyTier.toUpperCase();
    else console.warn('[ProfileEngine] #current-plan-name not found in DOM.');

    // Update the button labels (Upgrade vs Downgrade vs Current Plan)
    updatePlanActionButtons(window.currentCompanyTier);

    applyTierRestrictions();

    // --- Populate input fields ---------------------------------------------
    // Runs regardless of whether the company embed succeeded above, so a broken
    // company relationship can no longer blank out name/title too.
    const fnameEl = document.getElementById('profile-fname');
    const lnameEl = document.getElementById('profile-lname');
    const titleEl = document.getElementById('profile-title');
    const companyEl = document.getElementById('profile-company');

    if (!fnameEl || !lnameEl || !titleEl || !companyEl) {
      console.error('[ProfileEngine] One or more profile input elements are missing from the DOM - injection likely failed or ran after this point.', {
        fnameEl: !!fnameEl, lnameEl: !!lnameEl, titleEl: !!titleEl, companyEl: !!companyEl
      });
    }

    if (fnameEl) fnameEl.value = profile.first_name || '';
    if (lnameEl) lnameEl.value = profile.last_name || '';
    if (titleEl) titleEl.value = profile.role || '';
    if (companyEl) companyEl.value = companyObj?.name || '';

    const fName = profile.first_name || '';
    const lName = profile.last_name || '';
    const initials = ((fName.charAt(0) || '') + (lName.charAt(0) || '')).toUpperCase() || 'U';

    if (profile.avatar_url) {
      document.querySelectorAll('[data-dynamic-profile-img]').forEach(img => {
        img.src = profile.avatar_url;
        img.classList.remove('hidden');
      });
      document.querySelectorAll('[data-dynamic-initials]').forEach(span => span.classList.add('hidden'));
    } else {
      document.querySelectorAll('[data-dynamic-initials]').forEach(el => {
        el.textContent = initials;
        el.classList.remove('hidden');
      });
      document.querySelectorAll('[data-dynamic-profile-img]').forEach(img => img.classList.add('hidden'));
    }

    // Sync Modern Top Bar Data
    const topName = document.getElementById('topbar-user-name');
    const topRole = document.getElementById('topbar-user-role');
    const topCompany = document.getElementById('topbar-company-name');
    const topTier = document.getElementById('topbar-tier-tag');

    if (topName) topName.textContent = `${fName} ${lName}`.trim() || 'User';
    if (topRole) topRole.textContent = profile.role || (isPlanAdmin ? 'Primary Admin' : 'Manager');
    if (topCompany) topCompany.textContent = companyObj?.name || 'Simple Solutions';
    if (topTier) topTier.textContent = window.currentCompanyTier.toUpperCase();

    // Legacy fallback selector (if present)
    const headerClientName = document.querySelector('header.hidden.lg\\:block .text-right p span:first-child');
    if (headerClientName && (fName || lName)) {
      headerClientName.parentElement.innerHTML = `<span>${fName}</span> <span>${lName}</span>`;
    }

    console.log('[ProfileEngine] Profile UI population complete.');
  } catch (error) {
    console.error('[ProfileEngine] Unrecoverable error in loadUserProfile:', error);
    window.currentCompanyTier = 'basic';
    applyTierRestrictions();
  }
  console.groupEnd();
}

function applyTierRestrictions() {
  const tier = window.currentCompanyTier || 'basic';

  // 1. Sidebar Protection for Training Records
  const recordsNavBtn = document.querySelector('a[href="records.html"]');
  if (recordsNavBtn) {
    if (tier === 'basic') {
      recordsNavBtn.classList.add('opacity-50', 'pointer-events-none');
      recordsNavBtn.setAttribute('title', 'Upgrade to Essential to unlock Training Records');
    } else {
      recordsNavBtn.classList.remove('opacity-50', 'pointer-events-none');
      recordsNavBtn.removeAttribute('title');
    }
  }

  // 2. Direct URL Protection for records.html
  if (window.location.pathname.includes('records.html') && tier === 'basic') {
    alert('Training Records and worker compliance tracking are available on the Essential plan and above.');
    window.location.replace('vault.html');
    return;
  }

  // 3. Direct ID Target for Module Compliance Card
  const complianceContainer = document.getElementById('compliance-card-container');

  if (complianceContainer && tier === 'basic') {
    complianceContainer.innerHTML = `
      <span class="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 mb-3">
        Essential Feature
      </span>
      <h3 class="font-serif text-2xl text-foreground mb-2">Compliance Registration Locked</h3>
      <p class="text-slate-500 mb-6 max-w-md mx-auto">
        Worker tracking and Tally registrations are available on the Essential (R220/mo) tier.
      </p>
      <button onclick="openProfileModal(); switchProfileTab('plans');" class="inline-block bg-primary text-white font-medium py-3 px-8 rounded-md hover:bg-primary/90 transition-colors shadow-sm">
        Upgrade to Essential &rarr;
      </button>
    `;
  }

  if (typeof updatePdfQuotaUI === 'function') updatePdfQuotaUI();
}

// DYNAMIC PLAN BUTTON LABELS & DISABLED STATES
function updatePlanActionButtons(currentTier) {
  const tierRanks = { basic: 1, essential: 2, enterprise: 3 };
  const currentRank = tierRanks[currentTier] || 1;

  const btnConfigs = [
    { id: 'plan-btn-basic', tier: 'basic', rank: 1, name: 'Basic' },
    { id: 'plan-btn-essential', tier: 'essential', rank: 2, name: 'Essential' },
    { id: 'plan-btn-enterprise', tier: 'enterprise', rank: 3, name: 'Enterprise' }
  ];

  btnConfigs.forEach(cfg => {
    const btn = document.getElementById(cfg.id);
    if (!btn) return;

    if (cfg.rank === currentRank) {
      // Current active tier: Disable button so they cannot re-purchase
      btn.disabled = true;
      btn.textContent = 'Current Plan';
      btn.className = 'plan-upgrade-btn mt-6 w-full py-2 px-3 border border-slate-300 bg-slate-100 text-slate-400 text-xs font-semibold rounded-md cursor-not-allowed';
    } else if (cfg.rank < currentRank) {
      // Lower tier: Downgrade button
      btn.disabled = false;
      btn.textContent = `Downgrade to ${cfg.name}`;
      btn.className = 'plan-upgrade-btn mt-6 w-full py-2 px-3 border border-slate-300 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors rounded-md';
    } else {
      // Higher tier: Upgrade button
      btn.disabled = false;
      btn.textContent = `Upgrade to ${cfg.name}`;
      if (cfg.tier === 'essential') {
        btn.className = 'plan-upgrade-btn mt-6 w-full py-2 px-3 bg-primary text-white text-xs font-medium rounded-md hover:bg-primary/90 transition-colors shadow-sm';
      } else {
        btn.className = 'plan-upgrade-btn mt-6 w-full py-2 px-3 border border-slate-300 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors rounded-md';
      }
    }
  });
}

// 1. STATE FOR IN-VAULT UPGRADE SELECTION
let pendingVaultUpgrade = {
  planCode: 'PLN_glbt6ice9adjj45',
  targetTier: 'essential',
  tierDisplayName: 'Essential Vault',
  amountInCents: 22000
};

function triggerPaystackUpgrade(planCode, targetTier, tierDisplayName, amountInCents) {
  pendingVaultUpgrade = { planCode, targetTier, tierDisplayName, amountInCents };

  const tierRanks = { basic: 1, essential: 2, enterprise: 3 };
  const currentTier = (window.currentCompanyTier || 'basic').toLowerCase();
  const isDowngrade = (tierRanks[targetTier] || 1) < (tierRanks[currentTier] || 1);

  // Set description helper text based on target tier
  let desc = '1 Admin Seat • Full Video Vault';
  if (targetTier === 'essential') desc = '4 Total Seats • Training Records Dashboard';
  if (targetTier === 'enterprise') desc = '8 Manager Seats • Priority Support • ClickUp Sync';

  const modalTitle = document.getElementById('vault-upgrade-modal-title');
  const nameEl = document.getElementById('vault-upgrade-tier-name');
  const priceEl = document.getElementById('vault-upgrade-tier-price');
  const descEl = document.getElementById('vault-upgrade-tier-desc');
  const modal = document.getElementById('vaultUpgradeReviewModal');

  if (modalTitle) modalTitle.textContent = isDowngrade ? 'Confirm Plan Downgrade' : 'Confirm Plan Upgrade';
  if (nameEl) nameEl.textContent = tierDisplayName;
  if (priceEl) priceEl.textContent = `R${amountInCents / 100} /mo`;
  if (descEl) descEl.textContent = desc;

  if (modal) modal.classList.remove('hidden');
}

function closeVaultUpgradeReviewModal() {
  const modal = document.getElementById('vaultUpgradeReviewModal');
  if (modal) modal.classList.add('hidden');
}

function executeVaultPaystackUpgrade() {
  closeVaultUpgradeReviewModal();

  const userEmail = document.getElementById('sidebar-user-email')?.textContent || '';
  const fName = document.getElementById('profile-fname')?.value || '';
  const lName = document.getElementById('profile-lname')?.value || '';
  const companyName = document.getElementById('profile-company')?.value || '';

  if (!window.PaystackPop) {
    alert('Paystack SDK is loading or blocked. Please refresh your browser.');
    return;
  }

  if (!window.userCompanyId) {
    alert('Unable to identify your organization account. Please contact support.');
    return;
  }

  try {
    const popup = new PaystackPop();
    popup.newTransaction({
      key: 'pk_live_6e9ead28ba957dc643c949c5dc8164e3d62c0d09',
      email: userEmail,
      amount: pendingVaultUpgrade.amountInCents,
      plan: pendingVaultUpgrade.planCode,
      currency: 'ZAR',
      metadata: {
        custom_fields: [
          { display_name: "Customer Name", variable_name: "customer_name", value: `${fName} ${lName}`.trim() },
          { display_name: "Company Name", variable_name: "company_name", value: companyName },
          { display_name: "Target Tier", variable_name: "target_tier", value: pendingVaultUpgrade.targetTier }
        ]
      },
      onSuccess: (transaction) => {
        console.log('[Paystack Engine] Payment success. Reference:', transaction.reference);

        // Instant Supabase Company Activation
        window.dbClient
          .from('companies')
          .update({
            tier: pendingVaultUpgrade.targetTier,
            subscription_status: 'active',
            paystack_subscription_code: transaction.subscription_code || transaction.reference
          })
          .eq('id', window.userCompanyId)
          .then(({ error }) => {
            if (!error) {
              alert(`Success! Your organization has been upgraded to ${pendingVaultUpgrade.targetTier.toUpperCase()}.`);
              window.location.reload();
            } else {
              console.error('Failed updating tier in Supabase:', error);
            }
          });
      },
      onCancel: () => {
        console.log('[Paystack Engine] Checkout modal closed by user.');
      }
    });
  } catch (err) {
    console.error('[Paystack Engine] Launch error:', err);
  }
}

// Handler for direct subscription cancellation
async function handleSubscriptionCancellation() {
  const confirmCancel = confirm("Are you sure you want to cancel your active subscription? Your organization will revert to the Basic tier at the end of the current billing cycle.");
  if (!confirmCancel) return;

  try {
    if (!window.userCompanyId) {
      alert("Unable to resolve organization details. Please contact support.");
      return;
    }

    // 1. Revert company tier to 'basic' and mark status in Supabase
    const { error } = await window.dbClient
      .from('companies')
      .update({
        tier: 'basic',
        subscription_status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', window.userCompanyId);

    if (error) throw error;

    alert("Your subscription cancellation request has been logged. Your tier has been updated to Basic.");
    window.location.reload();

  } catch (err) {
    console.error("Cancellation error:", err);
    alert("There was an issue processing your cancellation. Please submit a quick billing request using the Manage Billing link.");
  }
}

// FETCH ACTIVE TEAM MEMBERS UNDER COMPANY WITH TIER LOCKS
async function fetchCompanyTeamMembers() {
  const container = document.getElementById('team-members-list');
  const seatsBadge = document.getElementById('occupied-seats-badge');
  const inviteContainer = document.getElementById('invite-form-container');
  if (!container || !window.userCompanyId) return;

  const tier = (window.currentCompanyTier || 'basic').toLowerCase();

  // 1. Paywall Lock for Basic Tier
  if (tier === 'basic') {
    if (seatsBadge) seatsBadge.textContent = '1 / 1 Seat';
    if (inviteContainer) {
      inviteContainer.innerHTML = `
        <div class="w-full text-center py-4 bg-slate-50 border border-amber-200 rounded-lg p-4">
          <span class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 mb-2">
            Essential Feature
          </span>
          <h4 class="font-semibold text-slate-800 text-sm mb-1">Manager Seats Locked</h4>
          <p class="text-xs text-slate-500 mb-3 max-w-sm mx-auto">
            Sub-manager accounts and multi-user delegation are available on the Essential (4 seats) and Enterprise tiers.
          </p>
          <button onclick="switchProfileTab('plans')" class="bg-primary text-white text-xs font-medium py-2 px-4 rounded-md hover:bg-primary/90 transition-colors shadow-sm">
            Upgrade to Unlock Seats &rarr;
          </button>
        </div>
      `;
    }
  }

  try {
    // 2. Query all profiles under company
    const { data: team, error } = await window.dbClient
      .from('profiles')
      .select('id, first_name, last_name, role')
      .eq('company_id', window.userCompanyId);

    if (error) throw error;

    const { data: company } = await window.dbClient
      .from('companies')
      .select('tier, seat_limit, max_supervisors')
      .eq('id', window.userCompanyId)
      .maybeSingle();

    const currentCount = team?.length || 0;
    
    // Seat Capacity Definition
    let maxSeats = 1;
    if (tier === 'essential') maxSeats = 4;
    if (tier === 'enterprise') maxSeats = company?.seat_limit || 8;

    if (seatsBadge) {
      seatsBadge.textContent = `${currentCount} / ${maxSeats} Seats`;
    }

    // 3. Seat Cap Enforcement for Essential / Enterprise
    if (tier !== 'basic' && inviteContainer && currentCount >= maxSeats) {
      inviteContainer.innerHTML = `
        <div class="w-full text-center py-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h4 class="font-semibold text-slate-800 text-sm mb-1">Seat Limit Reached (${currentCount}/${maxSeats})</h4>
          <p class="text-xs text-slate-500 mb-3">
            Your organization has filled all active team seats. Upgrade your subscription or contact support to add more manager seats.
          </p>
          <button onclick="switchProfileTab('plans')" class="border border-slate-300 text-slate-700 bg-white text-xs font-medium py-2 px-4 rounded-md hover:bg-slate-50 transition-colors shadow-sm">
            View Upgrade Plans
          </button>
        </div>
      `;
    }

    if (!team || team.length === 0) {
      container.innerHTML = '<p class="text-xs text-muted">No registered team members found.</p>';
      return;
    }

    // 4. Render Roster Cards
    container.innerHTML = team.map(member => {
      const isPrimaryAdmin = member.role === 'Master Admin' || member.role === 'admin' || member.role === 'Primary Admin';
      const fullName = `${member.first_name || 'User'} ${member.last_name || ''}`.trim();
      
      return `
        <div class="flex items-center justify-between p-3.5 border border-slate-200 bg-white rounded-lg text-sm shadow-sm">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full ${isPrimaryAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} flex items-center justify-center font-bold text-xs uppercase">
              ${(member.first_name?.charAt(0) || '') + (member.last_name?.charAt(0) || '') || 'U'}
            </div>
            <div>
              <p class="font-semibold text-foreground leading-snug">${fullName}</p>
              <p class="text-xs text-muted">${member.role || 'Manager'}</p>
            </div>
          </div>
          <span class="inline-flex items-center rounded-full ${isPrimaryAdmin ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'} px-2.5 py-0.5 text-xs font-semibold">
            ${isPrimaryAdmin ? 'Primary Admin' : 'Manager'}
          </span>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('[ProfileEngine] Failed fetching team members:', err);
    container.innerHTML = '<p class="text-xs text-red-500">Failed to load team list.</p>';
  }
}

// GENERATE INVITATION LINK WITH STRICT CAP VALIDATION
async function handleGenerateManagerInvite() {
  const emailInput = document.getElementById('invite-manager-email');
  const email = emailInput?.value?.trim();

  if (!email || !email.includes('@')) {
    alert("Please enter a valid email address for the manager.");
    return;
  }

  if (!window.userCompanyId) {
    alert("Unable to resolve company details. Please contact support.");
    return;
  }

  const { count, error } = await window.dbClient
    .from('profiles')
    .select('id', { count: 'exact' })
    .eq('company_id', window.userCompanyId);

  const tier = (window.currentCompanyTier || 'basic').toLowerCase();
  let maxSeats = 1;
  if (tier === 'essential') maxSeats = 4;
  if (tier === 'enterprise') maxSeats = 8;

  if (tier === 'basic') {
    alert("The Basic tier only allows 1 admin seat. Upgrade to Essential to invite up to 3 sub-managers.");
    return;
  } else if (count >= maxSeats) {
    alert(`You have reached the maximum limit of ${maxSeats} seats on the ${tier.toUpperCase()} plan.`);
    return;
  }

  const inviteUrl = `${window.location.origin}/invite.html?company=${encodeURIComponent(window.userCompanyId)}&email=${encodeURIComponent(email)}`;
  document.getElementById('generated-invite-url').value = inviteUrl;
  
  const emailSubject = encodeURIComponent("Join our organization's Vault portal");
  const emailBody = encodeURIComponent(
`Hi,

You have been invited to join your team in the Simple Solutions Vault — our centralized training & operational compliance portal.

Please click the link below to activate your Manager account and access your team modules:
${inviteUrl}

Best regards,
Simple Solutions Team`
  );
  document.getElementById('share-gmail-btn').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${emailSubject}&body=${emailBody}`;
  
  const waText = encodeURIComponent(
`*Simple Solutions Vault | Team Invitation*

Hi! You have been invited to join your team in the Simple Solutions Vault.

Set up your Manager Account and gain access using the secure link below:
🔗 ${inviteUrl}`
  );
  document.getElementById('share-whatsapp-btn').href = `https://api.whatsapp.com/send?text=${waText}`;

  document.getElementById('invite-form-container').classList.add('hidden');
  document.getElementById('invite-result-container').classList.remove('hidden');
}

function copyInviteLink() {
  const input = document.getElementById('generated-invite-url');
  const copyBtn = document.getElementById('copy-invite-btn');
  input.select();
  navigator.clipboard.writeText(input.value);
  
  copyBtn.innerText = "Copied!";
  copyBtn.classList.replace('bg-primary', 'bg-green-600');
  setTimeout(() => {
    copyBtn.innerText = "Copy";
    copyBtn.classList.replace('bg-green-600', 'bg-primary');
  }, 2000);
}

function resetInviteForm() {
  document.getElementById('invite-manager-email').value = '';
  document.getElementById('invite-result-container').classList.add('hidden');
  document.getElementById('invite-form-container').classList.remove('hidden');
}

// TOPBAR NOTIFICATION TOGGLE & PERSISTENCE
function toggleNotificationDropdown(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('notification-dropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
}

function markAllNotificationsRead() {
  const dot = document.getElementById('bell-unread-dot');
  if (dot) dot.classList.add('hidden');

  // Persist read state in browser storage
  const userId = window.currentUserId || 'guest';
  localStorage.setItem(`vault_notifications_read_${userId}`, 'true');
}

function checkNotificationReadStatus(userId) {
  window.currentUserId = userId;
  const isRead = localStorage.getItem(`vault_notifications_read_${userId}`) === 'true';
  const dot = document.getElementById('bell-unread-dot');
  
  if (isRead && dot) {
    dot.classList.add('hidden');
  } else if (!isRead && dot) {
    dot.classList.remove('hidden');
  }
}

// Global click listener to close dropdown on outside clicks
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notification-dropdown');
  const bellBtn = document.getElementById('notification-bell-btn');
  if (dropdown && !dropdown.classList.contains('hidden') && !bellBtn?.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// 5. HYBRID BOUNCER INTEGRATION LIFECYCLE
document.addEventListener('DOMContentLoaded', async () => {
  const injected = await injectProfileModalContainer(); // Wait for HTML to land in DOM first!
  if (!injected) {
    console.error('[ProfileEngine] Continuing without the profile modal - profile fields and tier badge will be unavailable until injection is fixed.');
  }
  try {
    const { data: { session }, error } = await window.dbClient.auth.getSession();
    if (error) throw error;
    if (!session) {
      window.location.replace('index.html');
      return;
    }
    await loadUserProfile(session.user.id);
    window.dbClient.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_OUT' || !currentSession) {
        window.location.replace('index.html');
      } else if (event === 'INITIAL_SESSION' && currentSession) {
        loadUserProfile(currentSession.user.id);
      }
    });
  } catch (err) {
    console.error('[ProfileEngine] Session bootstrap failed:', err);
    window.location.replace('index.html');
  }
});