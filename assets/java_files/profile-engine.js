// assets/java_files/profile-engine.js

// 1. INITIALIZE GLOBAL REPO INSTANCES
const supabaseUrl = 'https://ujhfkvoaaebdntuheyqo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaGZrdm9hYWViZG50dWhleXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTQzODYsImV4cCI6MjA5NzQzMDM4Nn0._r6CkysZr5qpV1zKz-otN_FZJfNzKlCJvm6ggO9qTV0';

if (!window.dbClient) {
  window.dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}
window.userFarmId = null;
window.currentFarmTier = 'basic';

// 2. DOM MULTI-PAGE INJECTION ENGINE
async function injectProfileModalContainer() {
  if (document.getElementById('profileModal')) return; // Already loaded on this page
  
  try {
    const response = await fetch('profile-modal.html');
    if (!response.ok) throw new Error('Network file retrieval drop.');
    const htmlText = await response.text();
    document.body.insertAdjacentHTML('beforeend', htmlText);
    console.log("Centralized Profile Modal successfully mounted to Viewport.");
  } catch (err) {
    console.error("Critical Injection Loop Interruption:", err.message);
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
  ['profile', 'security', 'plans'].forEach(name => {
    const btn = document.getElementById(`tab-btn-${name}`);
    if (btn) btn.className = "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-md text-slate-600 hover:bg-slate-100 transition-colors";
  });
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
  document.getElementById(`tab-${tabName}`).classList.add('block');
  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  if (activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-md bg-blue-50 text-blue-700 transition-colors";
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
  textSpan.innerText = 'Connecting...';
  try {
    const { error } = await window.dbClient.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/vault.html' }
    });
    if (error) throw error;
  } catch (error) {
    console.error("Link error:", error);
    textSpan.innerText = 'Error - Try Again';
    setTimeout(() => { textSpan.innerText = originalText; }, 3000);
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
    const role = document.getElementById('profile-title').value;
    const company = document.getElementById('profile-company').value;
    await window.dbClient.from('profiles').update({ first_name: fName, last_name: lName, role: role }).eq('id', user.id);
    if (window.userFarmId) {
      await window.dbClient.from('farms').update({ name: company }).eq('id', window.userFarmId);
    }
    const initials = (fName.charAt(0) + lName.charAt(0)).toUpperCase() || 'U';
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

async function loadUserProfile(userId) {
  try {
    const { data: { user } } = await window.dbClient.auth.getUser();
    if (!user) return;
    const hasGoogle = user.identities?.some(id => id.provider === 'google');
    const googleBtn = document.getElementById('google-link-btn');
    const googleText = document.getElementById('google-link-text');
    if (hasGoogle && googleBtn) {
      googleBtn.disabled = true;
      googleBtn.classList.replace('hover:bg-slate-50', 'bg-slate-50');
      googleBtn.classList.add('cursor-not-allowed', 'opacity-70');
      googleText.innerText = 'Google Connected';
      googleText.classList.add('text-green-700', 'font-bold');
    }
    document.getElementById('sidebar-user-email').textContent = user.email;
    document.getElementById('profile-email-input').value = user.email;
    const { data: profile, error } = await window.dbClient
      .from('profiles')
      .select('*, farms(id, name, tier, subscription_status)')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    const farm = profile?.farms || null;
    window.userFarmId = profile?.farm_id || farm?.id || null;
    window.currentFarmTier = farm?.tier || 'basic';
    const currentPlanName = document.getElementById('current-plan-name');
    if (currentPlanName) {
      currentPlanName.textContent = window.currentFarmTier.toUpperCase();
    }
    console.log(`[Tier Engine] Logged in as: ${profile?.first_name || 'User'} | Farm Tier: ${window.currentFarmTier}`);
    applyTierRestrictions();

    if (profile) {
      document.getElementById('profile-fname').value = profile.first_name || '';
      document.getElementById('profile-lname').value = profile.last_name || '';
      document.getElementById('profile-title').value = profile.role || '';
      if (profile.avatar_url) {
        document.querySelectorAll('[data-dynamic-profile-img]').forEach(img => {
          img.src = profile.avatar_url;
          img.classList.remove('hidden');
        });
        document.querySelectorAll('[data-dynamic-initials]').forEach(span => span.classList.add('hidden'));
      } else {
        const initial1 = profile.first_name ? profile.first_name.charAt(0).toUpperCase() : '';
        const initial2 = profile.last_name ? profile.last_name.charAt(0).toUpperCase() : '';
        const initials = (initial1 + initial2) || 'U';
        document.querySelectorAll('[data-dynamic-initials]').forEach(el => {
          el.textContent = initials;
          el.classList.remove('hidden');
        });
        document.querySelectorAll('[data-dynamic-profile-img]').forEach(img => img.classList.add('hidden'));
      }
      if (profile.farms) {
        document.getElementById('profile-company').value = profile.farms.name || '';
        const headerClientName = document.querySelector('header.hidden.lg\\:block .text-right p span:first-child');
        if (headerClientName) headerClientName.parentElement.innerHTML = `<span>${profile.first_name}</span> <span>${profile.last_name}</span>`;
      }
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    window.currentFarmTier = 'basic';
    const currentPlanName = document.getElementById('current-plan-name');
    if (currentPlanName) {
      currentPlanName.textContent = window.currentFarmTier.toUpperCase();
    }
    applyTierRestrictions();
  }
}

function applyTierRestrictions() {
  const tier = window.currentFarmTier || 'basic';

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
}

// Paystack Subscription Checkout & Upgrade Trigger
function triggerPaystackUpgrade(planCode, targetTier) {
  console.log(`[Paystack Engine] Initiating upgrade to ${targetTier} with plan ${planCode}`);
  
  const userEmail = document.getElementById('sidebar-user-email')?.textContent || '';

  if (!window.PaystackPop) {
    alert('Paystack SDK failed to load. Please check your internet connection.');
    return;
  }

  try {
    const handler = PaystackPop.setup({
      key: 'pk_live_6e9ead28ba957dc643c949c5dc8164e3d62c0d09',
      email: userEmail,
      plan: planCode,
      currency: 'ZAR',
      callback: function(response) {
        console.log('Paystack transaction successful. Reference:', response.reference);

        if (window.userFarmId) {
          window.dbClient
            .from('farms')
            .update({
              tier: targetTier,
              subscription_status: 'active',
              paystack_subscription_code: response.subscription_code || response.reference
            })
            .eq('id', window.userFarmId)
            .then(({ error }) => {
              if (!error) {
                alert(`Success! Your organization has been upgraded to ${targetTier.toUpperCase()}.`);
                window.location.reload();
              } else {
                console.error('Failed to update farm tier:', error);
              }
            });
        }
      },
      onClose: function() {
        console.log('Paystack checkout popup closed.');
      }
    });

    handler.openIframe();
  } catch (err) {
    console.error('[Paystack Engine] Setup error:', err);
  }
}

// Global delegated click listener
if (!window._paystackDelegatedListenerAdded) {
  window._paystackDelegatedListenerAdded = true;
  document.addEventListener('click', function (evt) {
    const btn = evt.target.closest && evt.target.closest('[data-plan-code]');
    if (!btn) return;
    evt.preventDefault();
    const plan = btn.getAttribute('data-plan-code');
    const targetTier = btn.getAttribute('data-plan-tier') || 'essential';
    if (plan) {
      triggerPaystackUpgrade(plan, targetTier);
    }
  });
}

// 5. HYBRID BOUNCER INTEGRATION LIFECYCLE
document.addEventListener('DOMContentLoaded', async () => {
  await injectProfileModalContainer(); // Mount HTML architecture to frame
  try {
    const { data: { session }, error } = await window.dbClient.auth.getSession();
    if (error) throw error;
    if (!session) {
      window.location.replace('index.html'); 
      return;
    }
    loadUserProfile(session.user.id);
    window.dbClient.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_OUT' || !currentSession) {
        window.location.replace('index.html');
      } else if (event === 'INITIAL_SESSION' && currentSession) {
        loadUserProfile(currentSession.user.id);
      }
    });
  } catch (err) {
    window.location.replace('index.html');
  }
});