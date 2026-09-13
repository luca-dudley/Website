// assets/java_files/profile-engine.js

// 1. INITIALIZE GLOBAL REPO INSTANCES
const supabaseUrl = 'https://ujhfkvoaaebdntuheyqo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaGZrdm9hYWViZG50dWhleXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTQzODYsImV4cCI6MjA5NzQzMDM4Nn0._r6CkysZr5qpV1zKz-otN_FZJfNzKlCJvm6ggO9qTV0';

if (!window.dbClient) {
  window.dbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}
window.userCompanyId = null;
window.currentCompanyTier = 'basic';
window.currentCompanyData = null; // full `companies` row incl. sponsored_crop_packs / purchased_crop_packs

// ============================================================================
// CROP-PACK STACKING ARCHITECTURE — shared helpers (Layer 2 / Layer 3)
// Used by vault.html, module.html, sop.html to gate + co-brand crop content.
//
// VERIFIED live schema (from Supabase schema export):
//   companies.sponsored_crop_packs: text[]   e.g. {"Macadamia","Banana"} — just crop names, NOT objects.
//   companies.purchased_crop_packs: text[]   e.g. {"Banana"}             — self-funded bolt-ons, never co-branded.
//   companies.partner_grower_codes: text[]   e.g. {"MM-TEST-01"}         — claimed grower codes, for audit/display.
// Because sponsored_crop_packs is a flat text[] of crop names, it can carry
// gating data but NOT partner attribution (name/logo) — there's nowhere on
// that array to hang a partner_name. Partner attribution is derived
// separately, at read time, via a join: partner_grower_registry
// (claimed_by_company_id = this company) → corporate_partners (partner_id).
// See fetchCompanySponsorPartners() below. window.currentCompanySponsors
// holds the resolved [{crop, partner_name, partner_logo_url, grower_code}]
// list for the signed-in company; getSponsorEntry() reads from it.
// ============================================================================

// Layer 1 (Universal Farm Core): neutral, never crop-gated, never co-branded.
const CORE_NEUTRAL_SUBTAGS = ['general safety', 'machinery & workshop', 'pumping & irrigation'];

// Layer 2 (Specialized Crop Packs): sub_tags containing these keywords belong to a crop pack.
const CROP_PACK_KEYWORDS = ['Macadamia', 'Banana'];

// The single active Paystack plan code for the 25%-off Corporate-Subsidized
// Enterprise tier (R337.50/mo). Companies on this plan code - or explicitly
// flagged is_subsidized: true - are pack-restricted; every other Enterprise
// company paid full price and gets the whole catalog.
const SUBSIDIZED_ENTERPRISE_PLAN_CODE = 'PLN_v8iouh4li43y60u';

window.currentCompanySponsors = []; // [{crop, partner_name, partner_logo_url, grower_code}]

// True only for companies actually on the subsidized program.
function isCompanySubsidized(companyObj) {
  if (!companyObj) return false;
  if (companyObj.is_subsidized === true) return true;
  if (companyObj.paystack_subscription_code === SUBSIDIZED_ENTERPRISE_PLAN_CODE) return true;
  return false;
}

// Resolves a video/SOP sub_tag to its parent crop pack name, or null if it's Layer 1 core.
function getCropFromSubTag(subTag) {
  const tag = (subTag || '').trim();
  if (!tag) return null;
  const tagLower = tag.toLowerCase();
  if (CORE_NEUTRAL_SUBTAGS.includes(tagLower)) return null;
  const match = CROP_PACK_KEYWORDS.find(crop => tagLower.includes(crop.toLowerCase()));
  return match || null;
}

// Queries the partner join for the signed-in company and caches it on
// window.currentCompanySponsors. Call after every claim, and once on load.
// Safe to call with a null companyId (resolves to an empty list).
async function fetchCompanySponsorPartners(companyId) {
  if (!companyId || !window.dbClient) {
    window.currentCompanySponsors = [];
    return window.currentCompanySponsors;
  }
  const { data, error } = await window.dbClient
    .from('partner_grower_registry')
    .select('grower_code, corporate_partners(name, logo_url, sponsored_crop_pack)')
    .eq('claimed_by_company_id', companyId);

  if (error) {
    console.error('[ProfileEngine] fetchCompanySponsorPartners failed:', error.message);
    window.currentCompanySponsors = [];
    return window.currentCompanySponsors;
  }

  window.currentCompanySponsors = (data || [])
    .filter(row => row.corporate_partners)
    .map(row => ({
      crop: row.corporate_partners.sponsored_crop_pack,
      partner_name: row.corporate_partners.name,
      partner_logo_url: row.corporate_partners.logo_url,
      grower_code: row.grower_code
    }));
  return window.currentCompanySponsors;
}

// Returns the sponsor entry ({crop, partner_name, partner_logo_url}) for a
// crop, or null. Reads window.currentCompanySponsors (see above) rather than
// companyObj.sponsored_crop_packs, since that column can't hold partner
// attribution (it's a flat text[] of crop names).
function getSponsorEntry(companyObj, cropName) {
  if (!cropName) return null;
  const list = Array.isArray(window.currentCompanySponsors) ? window.currentCompanySponsors : [];
  return list.find(entry => (entry?.crop || '').toLowerCase() === cropName.toLowerCase()) || null;
}

// Fast boolean gating check against the flat text[] column directly — used
// by isCropUnlocked() so a gating decision never has to wait on the partner
// join above (only badge rendering needs that).
function isCropSponsored(companyObj, cropName) {
  if (!companyObj || !cropName) return false;
  const list = Array.isArray(companyObj.sponsored_crop_packs) ? companyObj.sponsored_crop_packs : [];
  return list.some(c => (c || '').toLowerCase() === cropName.toLowerCase());
}

// Self-funded bolt-on packs (R80/mo) — unlocked but never co-branded.
function isCropPurchased(companyObj, cropName) {
  if (!companyObj || !cropName) return false;
  const list = Array.isArray(companyObj.purchased_crop_packs) ? companyObj.purchased_crop_packs : [];
  return list.some(c => (c || '').toLowerCase() === cropName.toLowerCase());
}

// A crop is unlocked if:
//  - it's Layer 1 core (cropName is null - handled by the caller before this
//    is ever invoked, but guarded here too),
//  - the company is a Trial Farm / Custom Override (unlock_all_crops, or a
//    private branded library - opts.hasCustomLibrary, detected by the caller
//    from videos.company_id / sops.company_id === the viewer's company id),
//  - the company is Retail Enterprise (full price, NOT on the subsidized
//    plan/flag) - unrestricted access to every current and future crop pack,
//  - or, for every other tier (including Subsidized Corporate Enterprise),
//    the specific crop is sponsored by a processor or self-funded as a
//    bolt-on.
//
// opts.hasCustomLibrary: pass true when the caller has already established
// (via its own videos/sops query) that this company has a private branded
// catalog - e.g. Elliott Farm, Doveton, Outlook Farm.
function isCropUnlocked(companyObj, cropName, opts = {}) {
  if (!cropName) return true;
  if (!companyObj) return false;

  if (companyObj.unlock_all_crops === true || opts.hasCustomLibrary === true) {
    return true;
  }

  if ((companyObj.tier || '').toLowerCase() === 'enterprise' && !isCompanySubsidized(companyObj)) {
    return true;
  }

  return isCropSponsored(companyObj, cropName) || isCropPurchased(companyObj, cropName);
}

// Layer 3: renders "Industry Compliance Partners: X, Y × Simple Solutions"
// into a footer element. Reads window.currentCompanySponsors (populated by
// fetchCompanySponsorPartners) rather than companyObj — see note above.
function renderPartnerFooterChain(companyObj, elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const list = Array.isArray(window.currentCompanySponsors) ? window.currentCompanySponsors : [];
  const partnerNames = [...new Set(list.map(e => e?.partner_name).filter(Boolean))];
  if (partnerNames.length === 0) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = `Industry Compliance Partners: ${partnerNames.join(', ')} × Simple Solutions`;
  el.classList.remove('hidden');
}

window.getCropFromSubTag = getCropFromSubTag;
window.fetchCompanySponsorPartners = fetchCompanySponsorPartners;
window.getSponsorEntry = getSponsorEntry;
window.isCropSponsored = isCropSponsored;
window.isCropPurchased = isCropPurchased;
window.isCropUnlocked = isCropUnlocked;
window.isCompanySubsidized = isCompanySubsidized;
window.renderPartnerFooterChain = renderPartnerFooterChain;

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
  ['profile', 'company', 'security', 'plans', 'team'].forEach(name => {
    const btn = document.getElementById(`tab-btn-${name}`);
    if (btn) btn.className = "w-auto min-w-max sm:w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-2.5 text-sm font-medium rounded-md text-slate-600 hover:bg-slate-100 transition-colors";
  });
  
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) {
    targetTab.classList.remove('hidden');
    targetTab.classList.add('block');
  }

  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  if (activeBtn) activeBtn.className = "w-auto min-w-max sm:w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-2.5 text-sm font-medium rounded-md bg-blue-50 text-blue-700 transition-colors";

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

    await window.dbClient.from('profiles').update({
      first_name: fName,
      last_name: lName,
      role: jobTitle
    }).eq('id', user.id);

    const initials = ((fName.charAt(0) || '') + (lName.charAt(0) || '')).toUpperCase() || 'U';
    document.querySelectorAll('[data-dynamic-initials]').forEach(el => el.textContent = initials);

    const topName = document.getElementById('topbar-user-name');
    if (topName) topName.textContent = `${fName} ${lName}`.trim() || 'User';

    saveBtn.innerText = 'Saved!';
    setTimeout(() => { saveBtn.innerText = originalText; }, 2000);
  } catch (error) {
    console.error('Error saving profile:', error);
    saveBtn.innerText = 'Error';
    setTimeout(() => { saveBtn.innerText = originalText; }, 2000);
  }
}

async function saveCompanyProfile() {
  const saveBtn = document.getElementById('save-company-btn');
  const originalText = saveBtn ? saveBtn.innerText : 'Save';
  if (saveBtn) saveBtn.innerText = 'Saving...';

  try {
    if (!window.userCompanyId) {
      // Fallback: Attempt to resolve company_id directly from session
      const { data: { user } } = await window.dbClient.auth.getUser();
      const { data: profile } = await window.dbClient
        .from('profiles')
        .select('company_id')
        .eq('id', user?.id)
        .single();

      window.userCompanyId = profile?.company_id || null;
    }

    if (!window.userCompanyId) {
      throw new Error("No organization ID associated with your account.");
    }

    const companyName = document.getElementById('profile-company-name')?.value?.trim() || '';
    const companyVat = document.getElementById('profile-company-vat')?.value?.trim() || '';
    const companyPhone = document.getElementById('profile-company-phone')?.value?.trim() || '';
    const companyAddress = document.getElementById('profile-company-address')?.value?.trim() || '';
    const companyEmail = document.getElementById('profile-company-email')?.value?.trim() || '';

    const { error } = await window.dbClient
      .from('companies')
      .update({ 
        name: companyName,
        vat_number: companyVat,
        phone: companyPhone,
        postal_address: companyAddress,
        contact_email: companyEmail
      })
      .eq('id', window.userCompanyId);

    if (error) {
      console.error('[ProfileEngine] Supabase update error:', error);
      throw error;
    }

    // Update topbar instantly
    const topCompany = document.getElementById('topbar-company-name');
    if (topCompany && companyName) topCompany.textContent = companyName;

    if (saveBtn) {
      saveBtn.innerText = 'Saved!';
      setTimeout(() => { saveBtn.innerText = originalText; }, 2000);
    }
  } catch (error) {
    console.error('Error saving organization profile:', error);
    alert(`Failed to save organization details: ${error.message || 'Check console for details'}`);
    if (saveBtn) {
      saveBtn.innerText = 'Error';
      setTimeout(() => { saveBtn.innerText = originalText; }, 2000);
    }
  }
}

// 4a-i. PROCESSOR GROWER CODE LINKING (Subsidy Stacking, Layer 2/3)
// Lets an existing active user claim an *additional* processor's grower code
// so a farm delivering to multiple processors (e.g. Macadamias to Processor A,
// Bananas to Packhouse B) can stack sponsorships. Runs entirely through the
// claim_additional_grower_subsidy RPC (SECURITY DEFINER) - never writes to
// companies.sponsored_crop_packs directly from the client, since that would
// let anyone self-grant a subsidized crop pack by editing the request body.
async function handleClaimGrowerCode() {
  const input = document.getElementById('grower-code-input');
  const statusEl = document.getElementById('grower-code-status');
  const btn = document.getElementById('claim-grower-code-btn');
  const code = input?.value?.trim();

  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden', 'text-red-600', 'text-green-700');
    statusEl.classList.add(isError ? 'text-red-600' : 'text-green-700');
  };

  if (!code) {
    setStatus('Enter the grower code your processor gave you.', true);
    return;
  }
  if (!window.userCompanyId) {
    setStatus('Unable to resolve your organization. Please refresh and try again.', true);
    return;
  }

  const originalText = btn ? btn.innerText : 'Link Code';
  if (btn) { btn.disabled = true; btn.innerText = 'Verifying...'; }

  try {
    const { data, error } = await window.dbClient.rpc('claim_additional_grower_subsidy', {
      p_grower_code: code
    });

    if (error) throw error;
    if (!data || data.success !== true) {
      throw new Error(data?.message || 'That grower code could not be verified.');
    }

    // sponsored_crop_packs is a flat text[] of crop names on companies — the
    // RPC's return doesn't include a full updated array (nothing to merge in
    // that shape), so just make sure the crop is present locally, and
    // re-fetch the partner join for attribution/badges.
    if (window.currentCompanyData) {
      const current = Array.isArray(window.currentCompanyData.sponsored_crop_packs)
        ? window.currentCompanyData.sponsored_crop_packs
        : [];
      if (data.crop && !current.some(c => (c || '').toLowerCase() === data.crop.toLowerCase())) {
        window.currentCompanyData.sponsored_crop_packs = [...current, data.crop];
      }
    }
    await fetchCompanySponsorPartners(window.userCompanyId);

    setStatus(`✓ Linked! ${data.partner_name ? data.partner_name + ' now sponsors your ' + data.crop + ' pack.' : 'Your account has been updated.'}`, false);
    if (input) input.value = '';

    renderLinkedGrowerCodes(window.currentCompanyData);
    if (typeof renderPartnerFooterChain === 'function') {
      renderPartnerFooterChain(window.currentCompanyData, 'partnerChainStrip');
    }
  } catch (err) {
    console.error('[ProfileEngine] claim_additional_grower_subsidy failed:', err);
    setStatus(err.message || 'Failed to link that grower code. Please check it and try again.', true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = originalText; }
  }
}

// Renders the "linked sponsor chain" list inside the Organization/Plans tab
// (distinct from the public footer chain - this one shows per-crop detail
// for the account holder, e.g. which processor sponsors which crop). Reads
// window.currentCompanySponsors (the partner join) rather than
// companyObj.sponsored_crop_packs, which is just a flat text[] of crop names
// with no partner attribution on it.
function renderLinkedGrowerCodes(companyObj) {
  const list = document.getElementById('linked-grower-codes-list');
  if (!list) return;
  const sponsored = Array.isArray(window.currentCompanySponsors) ? window.currentCompanySponsors : [];

  if (sponsored.length === 0) {
    list.innerHTML = `<p class="text-xs text-slate-400 italic">No processor-sponsored crop packs linked yet.</p>`;
    return;
  }

  list.innerHTML = sponsored.map(entry => `
    <div class="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs">
      <div class="flex items-center gap-2">
        ${entry.partner_logo_url ? `<img src="${entry.partner_logo_url}" alt="${entry.partner_name || ''}" class="w-5 h-5 rounded-full object-contain bg-white">` : ''}
        <span class="font-medium text-slate-700">${entry.crop || 'Crop'}</span>
      </div>
      <span class="text-slate-500">sponsored by <strong class="text-slate-700">${entry.partner_name || 'Unknown Partner'}</strong></span>
    </div>
  `).join('');
}

window.handleClaimGrowerCode = handleClaimGrowerCode;
window.renderLinkedGrowerCodes = renderLinkedGrowerCodes;

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
    // -----------------------------------------------------------------------
    // ROOT CAUSE OF THE company_id WIPE BUG:
    // This block used to run unconditionally whenever *any* string sat in
    // localStorage.pending_invite_company_id, with zero validation and zero
    // knowledge of whether the signed-in user already had an established
    // profile. Two independent failure paths fed it bad data:
    //   1. A leftover/stale key - e.g. an invite flow was started, abandoned,
    //      and the browser/profile was later reused (or shared) by an
    //      already-onboarded user - would still be truthy and would fire.
    //   2. Anywhere upstream that ever did
    //      `localStorage.setItem('pending_invite_company_id', someVar)` with
    //      someVar === null/undefined would silently coerce to the *string*
    //      "null"/"undefined", which is also truthy.
    // Because the upsert always included `company_id: pendingCompanyId` and
    // the call's result was never checked for `error`, an already-linked
    // Master Admin logging in on such a browser would have their real
    // profiles.company_id row silently overwritten (with a stale id, or with
    // the literal string "null") with no error ever surfacing in the UI.
    //
    // FIX: (a) strictly validate the value is a real UUID before trusting it
    // at all, (b) always clear the localStorage keys once read so a bad value
    // is never retried, and (c) look up the user's *existing* profile first -
    // if they already have a company_id, the pending invite is stale and MUST
    // be ignored rather than applied.
    // -----------------------------------------------------------------------
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rawPendingCompanyId = localStorage.getItem('pending_invite_company_id');
    const pendingTier = localStorage.getItem('pending_invite_tier') || 'essential';
    const pendingCompanyId = (rawPendingCompanyId && UUID_RE.test(rawPendingCompanyId))
      ? rawPendingCompanyId
      : null;

    if (rawPendingCompanyId !== null) {
      // Consume the keys unconditionally - valid or not - so a bad/stale
      // value is never re-evaluated on a future login.
      localStorage.removeItem('pending_invite_company_id');
      localStorage.removeItem('pending_invite_tier');
      if (!pendingCompanyId) {
        console.warn('[ProfileEngine] Discarding invalid pending_invite_company_id value:', JSON.stringify(rawPendingCompanyId));
      }
    }

    if (pendingCompanyId) {
      const { data: existingProfileCheck, error: existingProfileCheckError } = await window.dbClient
        .from('profiles')
        .select('id, company_id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfileCheckError) {
        // We couldn't verify whether this user already belongs to a company -
        // safest option is to skip the auto-link entirely rather than risk
        // clobbering an existing, established profile.
        console.error('[ProfileEngine] Could not verify existing profile before invite auto-link - skipping link to avoid data loss:', existingProfileCheckError.message);
      } else if (existingProfileCheck && existingProfileCheck.company_id) {
        // This user is already established at a company. A stale pending
        // invite must NEVER be allowed to overwrite it.
        console.warn('[ProfileEngine] Ignoring stale pending_invite_company_id - profile already belongs to company', existingProfileCheck.company_id);
      } else {
        // Genuinely a brand-new user (no profile row yet, or a profile row
        // whose company_id is still null) - safe to complete the invite link.
        const userMeta = user.user_metadata || {};
        const fullName = userMeta.full_name || userMeta.name || '';
        const nameParts = fullName.split(' ');
        const firstName = userMeta.first_name || nameParts[0] || '';
        const lastName = userMeta.last_name || nameParts.slice(1).join(' ') || '';
        const avatarUrl = userMeta.avatar_url || userMeta.picture || null;

        const { error: inviteUpsertError } = await window.dbClient.from('profiles').upsert([{
          id: user.id,
          company_id: pendingCompanyId,
          first_name: firstName,
          last_name: lastName,
          role: 'Manager',
          tier: pendingTier,
          avatar_url: avatarUrl
        }], { onConflict: 'id' });

        if (inviteUpsertError) {
          console.error('[ProfileEngine] Invite auto-link upsert failed:', inviteUpsertError.message);
        } else {
          console.log('[ProfileEngine] Linked new user to company via pending invite:', pendingCompanyId);
        }
      }
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

    // --- SUSPENSION & GRACE PERIOD BOUNCER --- //
    const subStatus = (companyObj?.subscription_status || 'active').toLowerCase();
    const isAdmin = (profile.role || '').toLowerCase().includes('admin');

    if (subStatus === 'suspended' || subStatus === 'cancelled' || subStatus === 'deactivated') {
      document.body.innerHTML = `
        <div class="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div class="max-w-lg w-full bg-slate-800 border border-slate-700/60 rounded-2xl p-8 text-center shadow-2xl">
            <div class="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center mb-5">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h2 class="text-2xl font-serif font-bold text-white mb-2">Organization Workspace Deactivated</h2>
            <p class="text-sm text-slate-400 mb-6">
              Your organization's active subscription was cancelled. <strong>All training records, employee completions, and worker logs remain safely archived in our database.</strong>
            </p>
            ${isAdmin ? `
              <button onclick="triggerPaystackUpgrade('PLN_glbt6ice9adjj45', 'essential', 'Essential Vault', 28000)" class="w-full bg-primary py-3 rounded-md font-medium text-white hover:bg-primary/90 transition-colors shadow-lg mb-3">
                Reactivate Workspace (Choose Plan) 💳
              </button>
            ` : `
              <div class="p-3 bg-slate-700/50 rounded-lg text-xs text-slate-300 mb-4">
                Please notify your primary administrator to reactivate your organization's portal.
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

    // === NEW: Lock Organization Tab for Managers ===
    const managerCompanyNotice = document.getElementById('manager-company-notice');
    const saveCompanyBtn = document.getElementById('save-company-btn');
    const companyInputs = [
      'profile-company-name', 'profile-company-vat', 'profile-company-phone',
      'profile-company-address', 'profile-company-email'
    ].map(id => document.getElementById(id));

    if (!isPlanAdmin) {
      if (managerCompanyNotice) managerCompanyNotice.classList.remove('hidden');
      if (saveCompanyBtn) saveCompanyBtn.classList.add('hidden');
      companyInputs.forEach(input => {
        if (input) {
          input.readOnly = true;
          input.classList.add('bg-slate-50', 'text-slate-500');
        }
      });
    } else {
      if (managerCompanyNotice) managerCompanyNotice.classList.add('hidden');
      if (saveCompanyBtn) saveCompanyBtn.classList.remove('hidden');
      companyInputs.forEach(input => {
        if (input) {
          input.readOnly = false;
          input.classList.remove('bg-slate-50', 'text-slate-500');
        }
      });
    }

    // --- Resolve company id & tier ----------------------------------------
    window.userCompanyId = profile.company_id || companyObj?.id || null;
    window.currentCompanyTier = (companyObj?.tier || profile.tier || 'basic').toLowerCase();
    window.currentCompanyData = companyObj || null;
    console.log('[ProfileEngine] Resolved tier:', window.currentCompanyTier, '| companyId:', window.userCompanyId);

    await fetchCompanySponsorPartners(window.userCompanyId);
    renderLinkedGrowerCodes(companyObj);
    renderPartnerFooterChain(companyObj, 'partnerChainStrip');

    const currentPlanName = document.getElementById('current-plan-name');
    if (currentPlanName) currentPlanName.textContent = window.currentCompanyTier.toUpperCase();
    else console.warn('[ProfileEngine] #current-plan-name not found in DOM.');

    // Update the button labels (Upgrade vs Downgrade vs Current Plan)
    updatePlanActionButtons(window.currentCompanyTier);

    applyTierRestrictions();

    // --- Populate input fields --- //
    const fnameEl = document.getElementById('profile-fname');
    const lnameEl = document.getElementById('profile-lname');
    const titleEl = document.getElementById('profile-title');

    // Company Tab Fields
    const companyNameEl = document.getElementById('profile-company-name');
    const vatEl = document.getElementById('profile-company-vat');
    const phoneEl = document.getElementById('profile-company-phone');
    const addressEl = document.getElementById('profile-company-address');
    const emailEl = document.getElementById('profile-company-email');

    if (fnameEl) fnameEl.value = profile.first_name || '';
    if (lnameEl) lnameEl.value = profile.last_name || '';
    if (titleEl) titleEl.value = profile.role || '';
    
    if (companyNameEl) companyNameEl.value = companyObj?.name || '';
    if (vatEl) vatEl.value = companyObj?.vat_number || '';
    if (phoneEl) phoneEl.value = companyObj?.phone || '';
    if (addressEl) addressEl.value = companyObj?.postal_address || '';
    if (emailEl) emailEl.value = companyObj?.contact_email || '';

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

  // 1. Sidebar Visual Indicators (Keep clickable, show badge/tooltip)
  const recordsNavBtn = document.querySelector('a[href="records.html"]');
  if (recordsNavBtn) {
    if (tier === 'basic') {
      recordsNavBtn.classList.add('opacity-80');
      recordsNavBtn.setAttribute('title', 'Essential Plan Feature');
    } else {
      recordsNavBtn.classList.remove('opacity-80');
      recordsNavBtn.removeAttribute('title');
    }
  }

  const sopNavBtn = document.querySelector('a[href="sop.html"]');
  if (sopNavBtn) {
    if (tier !== 'enterprise') {
      sopNavBtn.classList.add('opacity-80');
      sopNavBtn.setAttribute('title', 'Enterprise Plan Feature');
    } else {
      sopNavBtn.classList.remove('opacity-80');
      sopNavBtn.removeAttribute('title');
    }
  }

  // 2. Check in-page paywall gates if present on active page
  if (typeof checkPageTierGating === 'function') {
    checkPageTierGating(tier);
  }

  // 3. Module page compliance card lock
  const complianceContainer = document.getElementById('compliance-card-container');
  if (complianceContainer && tier === 'basic') {
    complianceContainer.innerHTML = `
      <span class="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 mb-3">
        Essential Feature
      </span>
      <h3 class="font-serif text-2xl text-foreground mb-2">Compliance Registration Locked</h3>
      <p class="text-slate-500 mb-6 max-w-md mx-auto">
        Worker tracking and Tally registrations are available on the Essential (R280/mo) tier.
      </p>
      <button onclick="openProfileModal(); switchProfileTab('plans');" class="inline-block bg-primary text-white font-medium py-3 px-8 rounded-md hover:bg-primary/90 transition-colors shadow-sm">
        Upgrade to Essential &rarr;
      </button>
    `;
  }

  if (typeof updatePdfQuotaUI === 'function') updatePdfQuotaUI();
  if (typeof fetchAndRenderVault === 'function') fetchAndRenderVault();
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
  amountInCents: 28000
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

// Handler for direct subscription cancellation (Soft Delete & Workspace Deactivation)
async function handleSubscriptionCancellation() {
  const confirmCancel = confirm(
    "Are you sure you want to deactivate your organization's Vault account?\n\n" +
    "• Access to training modules and compliance tools will be suspended.\n" +
    "• All historical employee training records and certificates will remain safely archived.\n" +
    "• Your organization can be reactivated at any time by updating billing details."
  );
  
  if (!confirmCancel) return;

  try {
    if (!window.userCompanyId) {
      alert("Unable to resolve organization details. Please contact support.");
      return;
    }

    // 1. Soft-deactivate company in Supabase (Keep data intact, flag as suspended)
    const { error } = await window.dbClient
      .from('companies')
      .update({
        subscription_status: 'suspended',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', window.userCompanyId);

    if (error) throw error;

    alert("Your organization's account has been deactivated. Historical records remain archived.");
    
    // 2. Reload to trigger the Account Suspended & Reactivation screen
    window.location.reload();

  } catch (err) {
    console.error("Cancellation error:", err);
    alert("There was an issue deactivating your subscription. Please contact support.");
  }
}

// FETCH ACTIVE TEAM MEMBERS UNDER COMPANY WITH TIER LOCKS & REMOVAL CONTROLS
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
    const { data: { user } } = await window.dbClient.auth.getUser();
    
    // 2. Query all profiles under company
    const { data: team, error } = await window.dbClient
      .from('profiles')
      .select('id, first_name, last_name, role')
      .eq('company_id', window.userCompanyId);

    if (error) throw error;

    const { data: company } = await window.dbClient
      .from('companies')
      .select('tier, seat_limit')
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
            Your organization has filled all active team seats. Upgrade your subscription or remove an inactive manager to reopen a seat.
          </p>
          <button onclick="switchProfileTab('plans')" class="border border-slate-300 text-slate-700 bg-white text-xs font-medium py-2 px-4 rounded-md hover:bg-slate-50 transition-colors shadow-sm">
            View Upgrade Plans
          </button>
        </div>
      `;
    } else if (tier !== 'basic' && inviteContainer && currentCount < maxSeats) {
      // Re-enable default invite form if a seat was recently freed
      const inviteEmailInput = document.getElementById('invite-manager-email');
      if (!inviteEmailInput) {
        inviteContainer.innerHTML = `
          <input type="email" id="invite-manager-email" placeholder="manager@yourcompany.com" class="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-primary">
          <button onclick="handleGenerateManagerInvite()" class="px-5 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90 transition-colors shadow-sm whitespace-nowrap">
            Generate Invite Link
          </button>
        `;
      }
    }

    if (!team || team.length === 0) {
      container.innerHTML = '<p class="text-xs text-muted">No registered team members found.</p>';
      return;
    }

    // Resolve current user's role to determine if delete button should be displayed
    const currentUserProfile = team.find(m => m.id === user?.id);
    const isCurrentAdmin = (currentUserProfile?.role || '').toLowerCase().includes('admin');

    // 4. Render Roster Cards with Revoke Access Trigger (Safe escaping & data-attributes)
    const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
    ));

    container.innerHTML = team.map(member => {
      const isPrimaryAdmin = member.role === 'Master Admin' || member.role === 'admin' || member.role === 'Primary Admin';
      const isSelf = member.id === user?.id;
      const fullName = `${member.first_name || 'User'} ${member.last_name || ''}`.trim();
      const safeFullName = escapeHtml(fullName);
      
      return `
        <div class="flex items-center justify-between p-3.5 border border-slate-200 bg-white rounded-lg text-sm shadow-sm transition-all hover:border-slate-300">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full ${isPrimaryAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} flex items-center justify-center font-bold text-xs uppercase">
              ${escapeHtml((member.first_name?.charAt(0) || '') + (member.last_name?.charAt(0) || '') || 'U')}
            </div>
            <div>
              <p class="font-semibold text-foreground leading-snug">${safeFullName} ${isSelf ? '<span class="text-xs text-slate-400 font-normal">(You)</span>' : ''}</p>
              <p class="text-xs text-muted">${escapeHtml(member.role || 'Manager')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2.5">
            <span class="inline-flex items-center rounded-full ${isPrimaryAdmin ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'} px-2.5 py-0.5 text-xs font-semibold">
              ${isPrimaryAdmin ? 'Primary Admin' : 'Manager'}
            </span>
            ${(isCurrentAdmin && !isSelf && !isPrimaryAdmin) ? `
              <button 
                type="button" 
                data-user-id="${escapeHtml(member.id)}"
                data-user-name="${safeFullName}"
                class="team-remove-btn p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                title="Revoke Manager Access">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.team-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        handleRemoveTeamMember(btn.dataset.userId, btn.dataset.userName);
      });
    });

  } catch (err) {
    console.error('[ProfileEngine] Failed fetching team members:', err);
    container.innerHTML = '<p class="text-xs text-red-500">Failed to load team list.</p>';
  }
}

/// REMOVE / DEACTIVATE SUB-MANAGER PROFILE & REOPEN SEAT
async function handleRemoveTeamMember(targetUserId, targetUserName) {
  const confirmed = confirm(
    `Are you sure you want to remove ${targetUserName} from your organization's workspace?\n\n` +
    `Their login access will be revoked immediately and one team seat will reopen.`
  );
  if (!confirmed) return;

  try {
    if (!window.userCompanyId) {
      alert("Unable to identify active company ID. Please refresh.");
      return;
    }

    // Delegated to a SECURITY DEFINER RPC (see remove_team_member_migration.sql).
    // A plain client-side .update() on profiles will always return 0 rows here:
    // the profiles UPDATE policy only allows a row to be updated by its owner
    // (id = auth.uid()), and there's no safe way to widen that to "any admin,
    // any row in their company" from the client side - a policy written that
    // way has to subquery profiles to check the caller's own role, which
    // re-triggers RLS on profiles and causes infinite recursion (42P17).
    // The RPC runs server-side, authenticates + authorizes the caller itself,
    // and performs the disassociation in one atomic step.
    const { data, error } = await window.dbClient.rpc('remove_team_member', {
      p_target_user_id: targetUserId
    });

    if (error) {
      console.error('[ProfileEngine] Supabase error during removal:', error);
      throw error;
    }

    if (!data || data.success !== true) {
      console.warn('[ProfileEngine] remove_team_member did not report success:', data);
      alert("Removal did not complete. Please refresh and try again.");
      return;
    }

    console.log('[ProfileEngine] Successfully disassociated user profile:', data);
    alert(`${targetUserName} has been removed. One seat has been reopened.`);

    // Refresh the roster and seat badge count immediately
    await fetchCompanyTeamMembers();

  } catch (err) {
    console.error('[ProfileEngine] Error removing manager:', err);
    // Errors raised inside the RPC (insufficient privileges, cross-company
    // target, self-removal, etc.) surface here in err.message and are
    // already written to be admin-readable - show them directly.
    alert(`Failed to remove team member: ${err.message || 'Unknown error'}`);
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

  if (error) {
    console.error('[ProfileEngine] Seat count query failed:', error);
    alert('Unable to verify seat availability right now. Please try again.');
    return;
  }

  const { data: companyRow } = await window.dbClient
    .from('companies')
    .select('seat_limit')
    .eq('id', window.userCompanyId)
    .maybeSingle();

  const tier = (window.currentCompanyTier || 'basic').toLowerCase();
  let maxSeats = 1;
  if (tier === 'essential') maxSeats = 4;
  if (tier === 'enterprise') maxSeats = companyRow?.seat_limit || 8;

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
      } else if (event === 'SIGNED_IN' && currentSession?.user?.id !== session.user.id) {
        loadUserProfile(currentSession.user.id);
      }
    });
  } catch (err) {
    console.error('[ProfileEngine] Session bootstrap failed:', err);
    window.location.replace('index.html');
  }
});