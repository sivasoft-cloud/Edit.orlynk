document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('token')) {
    sessionStorage.setItem('adminToken', urlParams.get('token'));
  }
  let adminToken = sessionStorage.getItem('adminToken');
  let allKeys = [];
  let currentStatusFilter = 'all';

  // Canvas background
  const canvas = document.getElementById('bgCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.5 + 0.5
      });
    }

    function render() {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(0, 34, 255, 0.22)';
      for (let p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(render);
    }
    render();
  }

  // DOM Elements
  const loginModal = document.getElementById('loginModal');
  const loginCard = document.getElementById('loginCard');
  const loginForm = document.getElementById('loginForm');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  const statTotalKeys = document.getElementById('statTotalKeys');
  const statActiveKeys = document.getElementById('statActiveKeys');
  const statRedeemed = document.getElementById('statRedeemed');
  const statRevoked = document.getElementById('statRevoked');

  const genForm = document.getElementById('genForm');
  const genCount = document.getElementById('genCount');
  const genDuration = document.getElementById('genDuration');
  const genMaxRedemptions = document.getElementById('genMaxRedemptions');
  const genTag = document.getElementById('genTag');
  const generateBtn = document.getElementById('generateBtn');

  // Release Form Elements
  const releaseForm = document.getElementById('releaseForm');
  const relVersion = document.getElementById('relVersion');
  const relTitle = document.getElementById('relTitle');
  const relUrl = document.getElementById('relUrl');
  const relNotes = document.getElementById('relNotes');
  const currentReleaseBadge = document.getElementById('currentReleaseBadge');
  const releaseUploadBox = document.getElementById('releaseUploadBox');
  const releaseFileInput = document.getElementById('releaseFileInput');
  const uploadLabelMain = document.getElementById('uploadLabelMain');
  const uploadLabelSub = document.getElementById('uploadLabelSub');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const uploadProgressFill = document.getElementById('uploadProgressFill');

  const searchFilter = document.getElementById('searchFilter');
  const filterChips = document.querySelectorAll('.filter-chip');
  const countAll = document.getElementById('countAll');
  const countActive = document.getElementById('countActive');
  const countRedeemed = document.getElementById('countRedeemed');
  const countRevoked = document.getElementById('countRevoked');

  const keysTableBody = document.getElementById('keysTableBody');
  const refreshBtn = document.getElementById('refreshBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportTxtBtn = document.getElementById('exportTxtBtn');
  const toast = document.getElementById('toast');

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // Animated Number Counter
  function animateValue(element, start, end, duration = 800) {
    if (!element) return;
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (end - start) * easeProgress);
      element.textContent = current.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = end.toLocaleString();
      }
    }
    requestAnimationFrame(update);
  }

  // Auth Handling
  function checkAuth() {
    if (!adminToken) {
      loginModal.style.display = 'flex';
      adminPasswordInput.focus();
    } else {
      loginModal.style.display = 'none';
      loadDashboard();
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    const pwd = adminPasswordInput.value.trim();
    if (!pwd) return;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Invalid admin credentials');
      }

      adminToken = data.token;
      sessionStorage.setItem('adminToken', adminToken);
      loginModal.style.display = 'none';
      adminPasswordInput.value = '';
      loadDashboard();
      showToast('Authenticated as Master Admin');
    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = 'block';
      if (loginCard) {
        loginCard.classList.remove('shake');
        void loginCard.offsetWidth; // trigger reflow
        loginCard.classList.add('shake');
      }
    }
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('adminToken');
    adminToken = null;
    location.reload();
  });

  async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(endpoint, options);
    if (res.status === 401) {
      sessionStorage.removeItem('adminToken');
      adminToken = null;
      checkAuth();
      throw new Error('Session expired. Please log in again.');
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  // Dashboard Loader
  async function loadDashboard() {
    try {
      const data = await apiCall('/api/admin/keys');
      allKeys = data.keys || [];
      renderStats();
      renderTable();
      loadReleases();
      loadSiteConfig();
    } catch (err) {
      if (adminToken) {
        showToast('Error loading keys: ' + err.message);
      }
    }
  }

  const releasesTableBody = document.getElementById('releasesTableBody');
  const releaseArchiveCount = document.getElementById('releaseArchiveCount');

  async function loadReleases() {
    try {
      const data = await apiCall('/api/admin/releases');
      if (data) {
        if (data.active) {
          const r = data.active;
          if (relVersion) relVersion.value = r.version || '1.0.0';
          if (relTitle) relTitle.value = r.title || '';
          if (relUrl) relUrl.value = r.downloadUrl || '';
          if (relNotes) relNotes.value = r.notes || '';
          if (currentReleaseBadge) currentReleaseBadge.textContent = `Active: v${r.version || '1.0.0'}`;
        }
        renderReleasesTable(data.releases || [], data.active);
      }
    } catch (e) {
      console.error('Failed to load releases', e);
    }
  }

  function renderReleasesTable(releases, activeRelease) {
    if (!releasesTableBody) return;
    if (releaseArchiveCount) releaseArchiveCount.textContent = `${releases.length} build${releases.length === 1 ? '' : 's'}`;

    if (!releases.length) {
      releasesTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
            No releases archived yet. Upload a build above to get started.
          </td>
        </tr>
      `;
      return;
    }

    releasesTableBody.innerHTML = releases.map(rel => {
      const isActive = rel.active || (activeRelease && activeRelease.version === rel.version);
      const sizeMB = rel.size ? (rel.size / (1024 * 1024)).toFixed(1) + ' MB' : '—';
      const dateStr = rel.publishedAt ? new Date(rel.publishedAt).toLocaleDateString() : '—';
      const fileName = rel.filename || (rel.downloadUrl ? rel.downloadUrl.split('/').pop().split('?')[0] : 'release.zip');

      return `
        <tr style="${isActive ? 'background: rgba(59, 130, 246, 0.08);' : ''}">
          <td>
            <span style="font-weight: 700; color: #60a5fa; font-family: monospace;">v${escapeHtml(rel.version)}</span>
          </td>
          <td>
            <div style="font-weight: 600; color: #fff;">${escapeHtml(rel.title || 'Edit.or.lynx')}</div>
            <div style="font-size: 11px; color: var(--text-secondary); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(rel.notes || '')}</div>
          </td>
          <td>
            <a href="${escapeHtml(rel.downloadUrl)}" target="_blank" style="color: #93c5fd; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
              <span>📁 ${escapeHtml(fileName)}</span>
            </a>
          </td>
          <td style="color: var(--text-secondary); font-size: 12px;">${sizeMB}</td>
          <td style="color: var(--text-secondary); font-size: 11.5px;">${dateStr}</td>
          <td>
            ${isActive ? 
              `<span style="padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3);">Active Release</span>` :
              `<span style="padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; background: rgba(255, 255, 255, 0.06); color: var(--text-secondary); border: 1px solid rgba(255, 255, 255, 0.1);">Archived</span>`
            }
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px;">
              ${!isActive ? `
                <button type="button" class="btn btn-secondary btn-sm activate-release-btn" data-version="${escapeHtml(rel.version)}" style="padding: 4px 10px; font-size: 11.5px; color: #60a5fa;">
                  ★ Make Active
                </button>
              ` : ''}
              <button type="button" class="btn btn-danger btn-sm delete-release-btn" data-version="${escapeHtml(rel.version)}" style="padding: 4px 8px; font-size: 11.5px;" title="Delete this release">
                🗑
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach listeners
    releasesTableBody.querySelectorAll('.activate-release-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const ver = e.currentTarget.dataset.version;
        if (!ver) return;
        try {
          await apiCall('/api/admin/release/activate', 'POST', { version: ver });
          showToast(`✓ Release v${ver} is now Active!`);
          await loadReleases();
        } catch (err) {
          alert('Failed to activate release: ' + err.message);
        }
      });
    });

    releasesTableBody.querySelectorAll('.delete-release-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const ver = e.currentTarget.dataset.version;
        if (!ver) return;
        if (!confirm(`Are you sure you want to delete Release v${ver}?`)) return;
        try {
          await apiCall('/api/admin/release/delete', 'POST', { version: ver });
          showToast(`✓ Release v${ver} deleted`);
          await loadReleases();
        } catch (err) {
          alert('Failed to delete release: ' + err.message);
        }
      });
    });
  }

  if (releaseForm) {
    releaseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const publishRelBtn = document.getElementById('publishRelBtn');
      if (publishRelBtn) publishRelBtn.disabled = true;

      try {
        const data = await apiCall('/api/admin/release', 'POST', {
          version: relVersion.value.trim(),
          title: relTitle.value.trim(),
          downloadUrl: relUrl.value.trim(),
          notes: relNotes.value.trim()
        });
        showToast(`🚀 Published Release v${data.release.version} successfully!`);
        if (currentReleaseBadge) currentReleaseBadge.textContent = `Active: v${data.release.version}`;
        await loadReleases();
      } catch (err) {
        alert('Failed to publish release: ' + err.message);
      } finally {
        if (publishRelBtn) publishRelBtn.disabled = false;
      }
    });
  }

  if (releaseUploadBox && releaseFileInput) {
    releaseUploadBox.addEventListener('click', () => releaseFileInput.click());

    releaseUploadBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      releaseUploadBox.style.borderColor = '#3b82f6';
      releaseUploadBox.style.background = 'rgba(59, 130, 246, 0.12)';
    });

    releaseUploadBox.addEventListener('dragleave', () => {
      releaseUploadBox.style.borderColor = 'rgba(59, 130, 246, 0.45)';
      releaseUploadBox.style.background = 'rgba(59, 130, 246, 0.04)';
    });

    releaseUploadBox.addEventListener('drop', (e) => {
      e.preventDefault();
      releaseUploadBox.style.borderColor = 'rgba(59, 130, 246, 0.45)';
      releaseUploadBox.style.background = 'rgba(59, 130, 246, 0.04)';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleBuildFileUpload(e.dataTransfer.files[0]);
      }
    });

    releaseFileInput.addEventListener('change', () => {
      if (releaseFileInput.files && releaseFileInput.files.length > 0) {
        handleBuildFileUpload(releaseFileInput.files[0]);
      }
    });
  }

  async function handleBuildFileUpload(file) {
    if (!file) return;
    const token = getAuthToken();
    if (uploadProgressBar) uploadProgressBar.style.display = 'block';
    if (uploadProgressFill) uploadProgressFill.style.width = '20%';
    if (uploadLabelMain) uploadLabelMain.textContent = `Uploading ${file.name}…`;
    if (uploadLabelSub) uploadLabelSub.textContent = `Size: ${(file.size / (1024 * 1024)).toFixed(1)} MB`;

    try {
      if (uploadProgressFill) uploadProgressFill.style.width = '60%';
      const res = await fetch(`/api/admin/release/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-filename': encodeURIComponent(file.name)
        },
        body: file
      });
      if (uploadProgressFill) uploadProgressFill.style.width = '100%';
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Upload failed');

      if (relUrl) relUrl.value = data.downloadUrl;
      if (uploadLabelMain) uploadLabelMain.textContent = `✓ Uploaded: ${data.filename}`;
      if (uploadLabelSub) uploadLabelSub.textContent = `Ready at ${data.downloadUrl} • ${(data.size / (1024 * 1024)).toFixed(1)} MB`;

      const verMatch = file.name.match(/v?(\d+\.\d+\.\d+)/i);
      if (verMatch && verMatch[1] && relVersion) {
        relVersion.value = verMatch[1];
        if (relTitle) relTitle.value = `Edit.or.lynx v${verMatch[1]} Release`;
      }

      showToast(`✓ Release build ${data.filename} uploaded!`);
      await loadReleases();
    } catch (err) {
      if (uploadLabelMain) uploadLabelMain.textContent = 'Upload failed';
      if (uploadLabelSub) uploadLabelSub.textContent = err.message;
      alert('Build upload error: ' + err.message);
    } finally {
      setTimeout(() => {
        if (uploadProgressBar) uploadProgressBar.style.display = 'none';
        if (uploadProgressFill) uploadProgressFill.style.width = '0%';
      }, 3000);
    }
  }

  function renderStats() {
    const total = allKeys.length;
    const active = allKeys.filter(k => k.status === 'active' && (k.redemptions || 0) < (k.maxRedemptions || 1)).length;
    const redeemed = allKeys.filter(k => (k.redemptions || 0) >= (k.maxRedemptions || 1) && k.status !== 'revoked').length;
    const revoked = allKeys.filter(k => k.status === 'revoked').length;

    animateValue(statTotalKeys, parseInt(statTotalKeys.textContent.replace(/,/g, '') || 0), total);
    animateValue(statActiveKeys, parseInt(statActiveKeys.textContent.replace(/,/g, '') || 0), active);
    animateValue(statRedeemed, parseInt(statRedeemed.textContent.replace(/,/g, '') || 0), redeemed);
    animateValue(statRevoked, parseInt(statRevoked.textContent.replace(/,/g, '') || 0), revoked);

    countAll.textContent = total;
    countActive.textContent = active;
    countRedeemed.textContent = redeemed;
    countRevoked.textContent = revoked;
  }

  // Filter Chips
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStatusFilter = chip.getAttribute('data-status');
      renderTable();
    });
  });

  searchFilter.addEventListener('input', () => {
    renderTable();
  });

  function getFilteredKeys() {
    const query = searchFilter.value.trim().toLowerCase();
    return allKeys.filter(k => {
      // Status filter
      if (currentStatusFilter === 'active') {
        if (k.status !== 'active' || (k.redemptions || 0) >= (k.maxRedemptions || 1)) return false;
      } else if (currentStatusFilter === 'redeemed') {
        if ((k.redemptions || 0) < (k.maxRedemptions || 1) || k.status === 'revoked') return false;
      } else if (currentStatusFilter === 'revoked') {
        if (k.status !== 'revoked') return false;
      }

      // Search query
      if (query) {
        const text = `${k.key} ${k.tag || ''} ${k.note || ''} ${k.plan || ''}`.toLowerCase();
        return text.includes(query);
      }
      return true;
    });
  }

  function renderTable() {
    const filtered = getFilteredKeys();

    if (filtered.length === 0) {
      keysTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">
            No keys match the current filter.
          </td>
        </tr>
      `;
      return;
    }

    keysTableBody.innerHTML = filtered.map(k => {
      const isRedeemed = (k.redemptions || 0) >= (k.maxRedemptions || 1) && k.status !== 'revoked';
      const isRevoked = k.status === 'revoked';
      let statusClass = 'status-active';
      let statusLabel = 'Active';

      if (isRevoked) {
        statusClass = 'status-revoked';
        statusLabel = 'Revoked';
      } else if (isRedeemed) {
        statusClass = 'status-redeemed';
        statusLabel = 'Redeemed';
      }

      const expiryStr = k.expiresAt && k.expiresAt > 4000000000 ? 'Lifetime (2100)' :
        k.expiresAt ? new Date(k.expiresAt * 1000).toLocaleDateString() : 'Lifetime';

      const createdDate = k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—';

      return `
        <tr data-key="${k.key}">
          <td>
            <span class="key-code" title="Click to copy key" onclick="window.copyKeyText('${k.key}')">
              ${k.key}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </span>
          </td>
          <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
          <td><span style="font-weight: 600; text-transform: uppercase;">${k.plan || 'PRO'}</span> &middot; <span style="color: var(--text-secondary);">${expiryStr}</span></td>
          <td>${k.redemptions || 0} / ${k.maxRedemptions || 1} Mac</td>
          <td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span title="${k.note || k.tag || ''}">${k.note || k.tag || 'Standard Key'}</span>
          </td>
          <td style="color: var(--text-muted); font-size: 12px;">${createdDate}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="window.copyKeyLink('${k.key}')" title="Copy Direct Activation Link">
                URL
              </button>
              ${k.status === 'active' ? `
                <button class="btn btn-danger btn-sm" onclick="window.revokeKey('${k.key}')" title="Revoke Key">
                  Revoke
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm" onclick="window.reactivateKey('${k.key}')" title="Reactivate Key">
                  Reactivate
                </button>
              `}
              <button class="btn btn-secondary btn-sm" style="color: var(--text-muted);" onclick="window.deleteKey('${k.key}')" title="Delete Key">
                &times;
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Global window helpers for inline action buttons
  window.copyKeyText = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      showToast('Copied: ' + key);
    } catch {
      showToast('Key: ' + key);
    }
  };

  window.copyKeyLink = async (key) => {
    const link = `pounce://activate?key=${encodeURIComponent(key)}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Copied 1-click activation link for Edit.or.lynx!');
    } catch {
      showToast('Activation URL: ' + link);
    }
  };

  window.revokeKey = async (key) => {
    if (!confirm(`Are you sure you want to REVOKE key ${key}? Devices using this key will lose Pro access.`)) return;
    try {
      await apiCall('/api/admin/keys/revoke', 'POST', { key });
      showToast(`Key ${key} revoked`);
      loadDashboard();
    } catch (err) {
      alert('Error revoking key: ' + err.message);
    }
  };

  window.reactivateKey = async (key) => {
    try {
      await apiCall('/api/admin/keys/reactivate', 'POST', { key });
      showToast(`Key ${key} reactivated`);
      loadDashboard();
    } catch (err) {
      alert('Error reactivating key: ' + err.message);
    }
  };

  window.deleteKey = async (key) => {
    if (!confirm(`Permanently DELETE key ${key} from the database?`)) return;
    try {
      await apiCall('/api/admin/keys', 'DELETE', { key });
      showToast(`Key ${key} deleted`);
      loadDashboard();
    } catch (err) {
      alert('Error deleting key: ' + err.message);
    }
  };

  // Generate Form
  genForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const count = parseInt(genCount.value, 10);
    const duration = genDuration.value;
    const maxRedemptions = parseInt(genMaxRedemptions.value, 10);
    const tag = genTag.value.trim();

    generateBtn.disabled = true;
    generateBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
      <span>Generating ${count} Key(s)...</span>
    `;

    try {
      const data = await apiCall('/api/admin/keys/generate', 'POST', {
        count,
        duration,
        maxRedemptions,
        tag
      });

      showToast(`🎉 Generated ${data.keys.length} new Pro Key(s)!`);
      loadDashboard();
    } catch (err) {
      alert('Failed to generate keys: ' + err.message);
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Generate Pro Keys Now</span>
      `;
    }
  });

  refreshBtn.addEventListener('click', () => {
    loadDashboard();
    showToast('Database refreshed');
  });

  // Export CSV
  exportCsvBtn.addEventListener('click', () => {
    if (allKeys.length === 0) return alert('No keys to export.');
    const headers = ['Key', 'Plan', 'Status', 'ExpiresAt', 'Redemptions', 'MaxRedemptions', 'Tag', 'Note', 'CreatedAt'];
    const rows = allKeys.map(k => [
      k.key,
      k.plan || 'pro',
      k.status || 'active',
      k.expiresAt || '',
      k.redemptions || 0,
      k.maxRedemptions || 1,
      `"${(k.tag || '').replace(/"/g, '""')}"`,
      `"${(k.note || '').replace(/"/g, '""')}"`,
      k.createdAt || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `editorlynx-pro-keys-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Export TXT
  exportTxtBtn.addEventListener('click', () => {
    if (allKeys.length === 0) return alert('No keys to export.');
    const txtContent = 'data:text/plain;charset=utf-8,' + encodeURIComponent(allKeys.map(k => k.key).join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', txtContent);
    link.setAttribute('download', `editorlynx-keys-list-${new Date().toISOString().slice(0, 10)}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Website CMS Logic
  const cmsForm = document.getElementById('cmsForm');
  const reloadCmsBtn = document.getElementById('reloadCmsBtn');
  const cmsShowHero = document.getElementById('cmsShowHero');
  const cmsShowStats = document.getElementById('cmsShowStats');
  const cmsShowSuperpowers = document.getElementById('cmsShowSuperpowers');
  const cmsShowProKey = document.getElementById('cmsShowProKey');
  const cmsShowQuickStart = document.getElementById('cmsShowQuickStart');
  const cmsShowFaq = document.getElementById('cmsShowFaq');
  const cmsShowFinalCta = document.getElementById('cmsShowFinalCta');

  const cmsHeroHeadline = document.getElementById('cmsHeroHeadline');
  const cmsHeroSubtitle = document.getElementById('cmsHeroSubtitle');
  const cmsHeroKicker = document.getElementById('cmsHeroKicker');
  const cmsInstagramHandle = document.getElementById('cmsInstagramHandle');
  const cmsInstagramUrl = document.getElementById('cmsInstagramUrl');
  const cmsDownloadBtnText = document.getElementById('cmsDownloadBtnText');

  async function loadSiteConfig() {
    try {
      const config = await apiCall('/api/site-config');
      if (!config) return;
      if (cmsShowHero) cmsShowHero.checked = config.showHero !== false;
      if (cmsShowStats) cmsShowStats.checked = config.showStats !== false;
      if (cmsShowSuperpowers) cmsShowSuperpowers.checked = config.showSuperpowers !== false;
      if (cmsShowProKey) cmsShowProKey.checked = config.showProKey !== false;
      if (cmsShowQuickStart) cmsShowQuickStart.checked = config.showQuickStart !== false;
      if (cmsShowFaq) cmsShowFaq.checked = config.showFaq !== false;
      if (cmsShowFinalCta) cmsShowFinalCta.checked = config.showFinalCta !== false;

      if (cmsHeroHeadline) cmsHeroHeadline.value = config.heroHeadline || '';
      if (cmsHeroSubtitle) cmsHeroSubtitle.value = config.heroSubtitle || '';
      if (cmsHeroKicker) cmsHeroKicker.value = config.heroKicker || '';
      if (cmsInstagramHandle) cmsInstagramHandle.value = config.instagramHandle || '';
      if (cmsInstagramUrl) cmsInstagramUrl.value = config.instagramUrl || '';
      if (cmsDownloadBtnText) cmsDownloadBtnText.value = config.downloadButtonText || '';
    } catch (e) {
      console.error('Failed to load site config', e);
    }
  }

  if (reloadCmsBtn) {
    reloadCmsBtn.addEventListener('click', () => {
      loadSiteConfig();
      showToast('Site configuration reloaded');
    });
  }

  if (cmsForm) {
    cmsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        showHero: cmsShowHero ? cmsShowHero.checked : true,
        showStats: cmsShowStats ? cmsShowStats.checked : true,
        showSuperpowers: cmsShowSuperpowers ? cmsShowSuperpowers.checked : true,
        showDesktopCompanion: false,
        showProKey: cmsShowProKey ? cmsShowProKey.checked : true,
        showQuickStart: cmsShowQuickStart ? cmsShowQuickStart.checked : true,
        showFaq: cmsShowFaq ? cmsShowFaq.checked : true,
        showFinalCta: cmsShowFinalCta ? cmsShowFinalCta.checked : true,
        heroHeadline: cmsHeroHeadline ? cmsHeroHeadline.value : undefined,
        heroSubtitle: cmsHeroSubtitle ? cmsHeroSubtitle.value : undefined,
        heroKicker: cmsHeroKicker ? cmsHeroKicker.value : undefined,
        instagramHandle: cmsInstagramHandle ? cmsInstagramHandle.value : undefined,
        instagramUrl: cmsInstagramUrl ? cmsInstagramUrl.value : undefined,
        downloadButtonText: cmsDownloadBtnText ? cmsDownloadBtnText.value : undefined
      };

      try {
        const res = await apiCall('/api/admin/site-config', 'POST', payload);
        if (res && res.success) {
          showToast('✓ Website configuration updated and saved!');
        } else {
          showToast('Failed to save config: ' + (res?.error || 'Unknown'));
        }
      } catch (err) {
        showToast('Error saving site config: ' + err.message);
      }
    });
  }

  // Initial Auth Check
  checkAuth();
});
