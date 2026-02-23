
        // State
        let currentVerse = null;
        let currentTab = 'discover';
        let libraryData = { liked: [], saved: [], collections: [] };
        let settings = {
            darkMode: false,
            fontSize: 'medium',
            animations: true,
            sound: true,
            autoRec: true,
            compact: false,
            notifications: true,
            interval: 60,
            particles: false,
            highContrast: false,
            focusMode: false,
            autoCopyVerse: false,
            keepAwake: false,
            ttsEnabled: false,
            ttsSpeed: 1
        };
        let commentRestriction = { restricted: false, reason: '', expires_at: null };
        let notificationsCache = [];
        let themeAuto = false;
        let lastCommentsSignature = '';
        let lastCommunitySignature = '';
        let activeCommentVerseId = null;
        let activeCommentVerseRef = null;
        let commentVerseLocked = false;
        let wakeLockHandle = null;
        
        // Text to Speech
        const TTS = {
            synth: window.speechSynthesis,
            currentUtterance: null,
            
            speak(text, speed = 1) {
                if (!this.synth) {
                    console.error('TTS not supported');
                    return;
                }
                
                // Cancel any current speech
                this.synth.cancel();
                
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = speed;
                utterance.pitch = 1;
                utterance.volume = 1;
                utterance.lang = 'en-US';
                
                // Try to find a good voice
                const voices = this.synth.getVoices();
                const preferredVoice = voices.find(v => v.name.includes('Google US English')) ||
                                      voices.find(v => v.name.includes('Samantha')) ||
                                      voices.find(v => v.lang === 'en-US' && v.name.includes('Female')) ||
                                      voices[0];
                if (preferredVoice) {
                    utterance.voice = preferredVoice;
                }
                
                this.currentUtterance = utterance;
                this.synth.speak(utterance);
            },
            
            stop() {
                if (this.synth) {
                    this.synth.cancel();
                }
            },
            
            isSpeaking() {
                return this.synth ? this.synth.speaking : false;
            }
        };
        
        // Load voices when available
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = () => {
                TTS.synth.getVoices();
            };
        }
        let autoRecInterval = null;
        let verseCheckInterval = null;
        let presencePingInterval = null;
        let commentsRefreshInterval = null;
        let challengeRefreshInterval = null;
        let challengeCountdownInterval = null;
        let notificationPollInterval = null;
        const VERSE_POLL_INTERVAL_MS = 5000;
        const STATUS_REFRESH_INTERVAL_MS = 15000;
        let verseFetchInFlight = false;
        let lastStatusRefreshAt = 0;
        let lastStatusVerseId = null;
        let initDone = false;
        let latestNotificationId = null;
        let isAdmin = false;
        let favoritesCollection = null;
        let currentCommentsView = 'verse';
        let openReplyKey = null;
        let replyActiveKey = null;
        const replyDrafts = {};
        let aboutSlideIndex = 0;
        let aboutTouchStartX = null;
        let aboutTouchMoved = false;
        let dmSelectedUserId = null;
        let dmSelectedUserName = '';
        let dmSelectedUserDecor = '';
        let dmThreadsSignature = '';
        let dmMessagesSignature = '';
        let dmTypingCooldown = null;
        let currentAvatarDecoration = '';
        const dmThreadsCache = {};
        let aboutIsSliding = false;
        let aboutSyncTimer = null;
        let aboutVideoErrorCount = 0;
        let aboutVolume = 1;
        let aboutProgressTimer = null;
        let countdownTicker = null;
        let countdownBase = 0;
        let countdownTotal = 0;
        let countdownSyncedAt = 0;
        let biblePickState = { picks: [] };
        let bibleReaderState = { books: [], translation: 'web' };
        let readerPages = [];
        let readerPageIndex = 0;
        // Permanent Timer State
        let sessionStartTime = null;
        let timerInterval = null;

        // Drag and Drop State
        let dragState = {
            isDragging: false,
            draggedVerse: null,
            dragTimer: null,
            startX: 0,
            startY: 0,
            hasMoved: false
        };

        // Initialize
        function startVersePolling() {
            if (verseCheckInterval) return;
            fetchVerse();
            verseCheckInterval = setInterval(() => {
                if (document.hidden) return;
                fetchVerse();
            }, VERSE_POLL_INTERVAL_MS);
        }

        function stopVersePolling() {
            if (!verseCheckInterval) return;
            clearInterval(verseCheckInterval);
            verseCheckInterval = null;
        }

        async function init() {
            if (initDone) return;
            initDone = true;
            loadSettings();
            initGlobalFontScaling();
            initPermanentTimer();
            stopVersePolling();
            startVersePolling();
            checkAdminStatus();
            renderAvatarDecorations();
            const profileEl = document.getElementById('profile');
            applyAvatarDecoration(profileEl?.dataset?.userDecor || '');
            
            // Setup textarea auto-resize
            setupTextarea('commentInput');
            setupTextarea('communityInput');
            
            // Initialize new features
            initDailyChallenge();
            await loadBibleBooks();
            await loadBiblePicks(true);
            loadVerseOfDay();
            renderRecHistory();
            updateXpDisplay();
            updateOnlineUsers();
            updateTabThemeClass(currentTab);
            switchCommentsView('verse');
            updateRestrictionUI();
            setInterval(updateRestrictionUI, 60000);
            setupAboutSliderGestures();
            initAboutVideoEvents();
            initAboutVolumeControl();
            setAboutSlide(aboutSlideIndex);
            setupGlobalShortcuts();
            pingPresence();
            if (presencePingInterval) clearInterval(presencePingInterval);
            presencePingInterval = setInterval(pingPresence, 45000);
            pollNotifications();
            if (notificationPollInterval) clearInterval(notificationPollInterval);
            notificationPollInterval = setInterval(pollNotifications, 30000);
            handleDeepLinkParams();
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) stopVersePolling();
                else startVersePolling();
            });
            const verseContainer = document.querySelector('.verse-container');
            if (verseContainer) {
                verseContainer.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleLike();
                });
            }
        }

        function setupTextarea(id) {
            const el = document.getElementById(id);
            if (!el) return;
            
            el.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });
            
            el.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (id === 'commentInput') postComment();
                    else if (id === 'communityInput') postCommunityMessage();
                }
            });
        }

        function getFontScaleValue(size) {
            if (size === 'small') return 0.9;
            if (size === 'large') return 1.14;
            return 1;
        }

        function applyFontScaleToNode(node) {
            if (!node || node.nodeType !== 1) return;
            const scale = getFontScaleValue(settings.fontSize || 'medium');
            const targets = [node, ...node.querySelectorAll('*')];
            targets.forEach(el => {
                const computed = window.getComputedStyle(el);
                const currentPx = parseFloat(computed.fontSize);
                if (!Number.isFinite(currentPx) || currentPx <= 0) return;
                if (!el.dataset.baseFontPx) {
                    el.dataset.baseFontPx = (currentPx / scale).toString();
                }
                const base = parseFloat(el.dataset.baseFontPx);
                if (Number.isFinite(base) && base > 0) {
                    el.style.fontSize = `${(base * scale).toFixed(2)}px`;
                }
            });
        }

        function applyGlobalFontScale() {
            applyFontScaleToNode(document.body);
        }

        function initGlobalFontScaling() {
            applyGlobalFontScale();
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(m => {
                    m.addedNodes.forEach(n => applyFontScaleToNode(n));
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // Permanent Timer Functions
        function initPermanentTimer() {
            // Check if we have a stored start time
            const storedStart = localStorage.getItem('bibleAppStartTime');
            const storedIsAdmin = localStorage.getItem('bibleAppIsAdmin');
            
            if (storedStart) {
                sessionStartTime = parseInt(storedStart);
            } else {
                sessionStartTime = Date.now();
                localStorage.setItem('bibleAppStartTime', sessionStartTime);
            }
            
            if (storedIsAdmin === 'true') {
                isAdmin = true;
                updateAdminUI();
            }
            
            // Update every second
            updateTimeOnSite();
            timerInterval = setInterval(updateTimeOnSite, 1000);
        }

        function updateTimeOnSite() {
            const now = Date.now();
            const elapsed = Math.floor((now - sessionStartTime) / 1000); // in seconds
            
            const hours = Math.floor(elapsed / 3600);
            const mins = Math.floor((elapsed % 3600) / 60);
            const secs = elapsed % 60;
            
            let timeText = '';
            if (hours > 0) {
                timeText = `${hours}h ${mins}m ${secs}s`;
            } else if (mins > 0) {
                timeText = `${mins}m ${secs}s`;
            } else {
                timeText = `${secs}s`;
            }
            
            const el = document.getElementById('timeOnSite');
            if (el) el.textContent = timeText;
        }

        // Admin Functions
        let userRole = 'user';
        
        function rolePriority(role) {
            const map = { user: 0, host: 1, mod: 2, co_owner: 3, owner: 4 };
            return map[String(role || 'user')] ?? 0;
        }

        function pickHigherRole(a, b) {
            return rolePriority(b) > rolePriority(a) ? b : a;
        }

        function applyRoleGatedUI() {
            const role = userRole || 'user';
            document.querySelectorAll('.role-gated').forEach(el => {
                const minRole = el.dataset.minRole || 'user';
                const show = rolePriority(role) >= rolePriority(minRole);
                const display = el.dataset.display || (el.classList.contains('setting-item') ? 'flex' : 'block');
                el.style.display = show ? display : 'none';
            });
        }

        async function checkAdminStatus() {
            try {
                const res = await fetch('/api/user_info');
                const data = await res.json();
                const userInfoRole = data.role || 'user';
                let effectiveRole = userInfoRole;
                let adminSessionRole = null;
                try {
                    const adminRes = await fetch('/admin/api/check-session');
                    if (adminRes.ok) {
                        const adminData = await adminRes.json();
                        if (adminData && adminData.role) adminSessionRole = adminData.role;
                    }
                } catch (_) {}
                if (adminSessionRole) {
                    effectiveRole = pickHigherRole(effectiveRole, adminSessionRole);
                }
                userRole = effectiveRole;
                
                if (data.is_admin || data.session_admin || adminSessionRole) {
                    isAdmin = true;
                    localStorage.setItem('bibleAppIsAdmin', 'true');
                    localStorage.setItem('bibleAppRole', effectiveRole);
                    updateAdminUI(effectiveRole);
                }
                
                // Always update role badge
                updateRoleBadge(effectiveRole);
                applyRoleGatedUI();
            } catch (e) {
                console.error('Admin check failed:', e);
            }
        }
        
        function updateRoleBadge(role) {
            const badge = document.getElementById('roleBadge');
            const adminBadge = document.getElementById('adminBadge');
            const roleTag = document.getElementById('roleTag');
            
            if (!badge) return;
            
            // Hide admin badge, show role badge instead
            adminBadge.style.display = 'none';
            
            const roleDisplay = role.replace('_', ' ').toUpperCase();
            badge.textContent = roleDisplay;
            badge.className = 'role-badge role-' + role + ' show';
            
            // Update profile tag
            if (roleTag) {
                roleTag.textContent = roleDisplay;
                roleTag.style.color = getRoleColor(role);
                roleTag.style.display = 'block';
            }
        }
        
        function getRoleColor(role) {
            const colors = {
                'user': '#666',
                'host': '#30D158',
                'mod': '#FF9F0A',
                'co_owner': '#BF5AF2',
                'owner': '#FF375F'
            };
            return colors[role] || '#666';
        }

        function updateAdminUI(roleOverride = null) {
            // Show role badge
            const storedRole = roleOverride || localStorage.getItem('bibleAppRole') || 'user';
            updateRoleBadge(storedRole);
            
            // Show admin-only settings
            document.getElementById('adminIntervalSetting').classList.add('show');
            document.getElementById('adminDashboardLink').classList.add('show');
            
            // Hide unlock button
            const unlockBtn = document.getElementById('adminPanelBtn');
            if (unlockBtn) unlockBtn.style.display = 'none';
            
            // Show delete buttons on existing comments
            document.querySelectorAll('.delete-comment-btn').forEach(btn => {
                btn.classList.add('show');
            });
        }

        let brandClickCount = 0;
        let brandClickTimer = null;
        let selectedRole = null;

        function handleBrandClick() {
            brandClickCount++;
            
            if (brandClickCount === 1) {
                brandClickTimer = setTimeout(() => {
                    brandClickCount = 0;
                }, 1000);
            }
            
            if (brandClickCount >= 3) {
                clearTimeout(brandClickTimer);
                brandClickCount = 0;
                openAdminUnlock();
            }
        }

        function selectRole(role) {
            selectedRole = role;
            
            // Update UI
            document.querySelectorAll('.role-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            document.querySelector(`.role-btn[data-role="${role}"]`).classList.add('selected');
            
            // Enable unlock button
            document.getElementById('unlockBtn').disabled = false;
            
            // Update placeholder
            const roleNames = {
                'host': 'Host',
                'mod': 'Moderator',
                'co_owner': 'Co-Owner',
                'owner': 'Owner'
            };
            document.getElementById('adminCodeInput').placeholder = `Enter ${roleNames[role]} code...`;
            document.getElementById('adminCodeInput').focus();
        }

        function openAdminUnlock() {
            if (isAdmin) return;
            selectedRole = null;
            document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('selected'));
            document.getElementById('unlockBtn').disabled = true;
            document.getElementById('adminCodeInput').placeholder = 'Enter code for selected role...';
            document.getElementById('adminCodeInput').value = '';
            document.getElementById('adminUnlockModal').classList.add('active');
        }

        function closeAdminUnlock(e) {
            if (!e || e.target.id === 'adminUnlockModal') {
                document.getElementById('adminUnlockModal').classList.remove('active');
                document.getElementById('adminCodeInput').value = '';
                selectedRole = null;
                document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('selected'));
                document.getElementById('unlockBtn').disabled = true;
            }
        }

        async function verifyRoleCode() {
            const code = document.getElementById('adminCodeInput').value.trim();
            
            if (!selectedRole) {
                showToast('Please select a role first', 'error');
                return;
            }
            
            if (!code) {
                showToast('Please enter a code', 'error');
                return;
            }
            
            try {
                const res = await fetch('/api/verify_role_code', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({code: code, role: selectedRole})
                });
                
                const data = await res.json();
                
                if (data.success) {
                    isAdmin = true;
                    userRole = data.role;
                    localStorage.setItem('bibleAppIsAdmin', 'true');
                    localStorage.setItem('bibleAppRole', data.role);
                    updateAdminUI();
                    closeAdminUnlock();
                    showToast(`Role unlocked: ${data.role_display}! 🔐`, 3000);
                    console.log('Role assigned:', data.role, data.role_display);
                } else {
                    showToast(data.error || 'Invalid code for selected role.', 'error', 5000);
                    document.getElementById('adminCodeInput').value = '';
                    document.getElementById('adminCodeInput').focus();
                }
            } catch (e) {
                showToast('Error verifying code', 'error');
            }
        }

        // Tab Switching
        function switchTab(tab, btn = null) {
            AudioSys.playSwitch();
            const prevTab = currentTab;
            currentTab = tab;
            updateTabThemeClass(tab);
            
            document.querySelectorAll('.tab-view').forEach(v => {
                v.classList.remove('active');
                v.classList.remove('desktop-active');
            });
            document.getElementById(tab).classList.add('active');
            
            if (window.innerWidth >= 1024) {
                document.getElementById(tab).classList.add('desktop-active');
            }
            
            if (btn) {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
            
            document.querySelectorAll('.nav-item').forEach(n => {
                n.classList.remove('active');
                if (n.dataset.tab === tab) n.classList.add('active');
            });
            
            if (tab === 'library') loadLibrary();
            if (tab === 'comments') {
                if (currentCommentsView === 'verse') {
                    if (!activeCommentVerseId && currentVerse) {
                        setActiveCommentVerse(currentVerse);
                    }
                }
                if (currentCommentsView === 'community') loadCommunityMessages();
                else if (currentCommentsView === 'dm') {
                    loadDmThreads(true);
                    loadDmMessages(true);
                } else loadComments();
                startCommentsPolling();
                updateOnlineUsers();
                updateRestrictionUI();
            } else if (prevTab === 'comments') {
                stopCommentsPolling();
            }
            if (tab === 'profile') loadProfileStats();
            if (tab === 'recommendations') loadRecommendations();
            if (prevTab === 'about' && tab !== 'about') {
                pauseAboutPlayback();
                stopAboutProgressTicker();
            }
            if (tab === 'about') {
                setAboutSlide(aboutSlideIndex);
                startAboutProgressTicker();
            }
        }

        async function pingPresence() {
            try {
                await fetch('/api/presence/ping', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: window.location.pathname + '#' + currentTab })
                });
            } catch (_) {}
        }

        async function pollNotifications() {
            try {
                const res = await fetch('/api/notifications');
                if (!res.ok) return;
                const rows = await res.json();
                if (!Array.isArray(rows)) return;
                notificationsCache = rows;
                renderNotificationPanels(rows);
                if (!rows.length) return;
                const unread = rows.filter(n => !n.is_read);
                const newest = unread[0] || rows[0];
                if (!newest) return;
                if (latestNotificationId === null) {
                    latestNotificationId = newest.id;
                    return;
                }
                if (newest.id !== latestNotificationId && unread.length && settings.notifications) {
                    showToast(`${newest.title || 'Notification'}: ${newest.message || ''}`);
                    latestNotificationId = newest.id;
                }
            } catch (_) {}
        }

        function formatNotificationTime(value) {
            if (!value) return '';
            const dt = new Date(value);
            if (Number.isNaN(dt.getTime())) return '';
            return dt.toLocaleString();
        }

        function renderNotificationPanels(rows) {
            const announcementList = document.getElementById('announcementList');
            const inboxList = document.getElementById('inboxList');
            if (!announcementList && !inboxList) return;
            const announcements = rows.filter(r => (r.type || '') === 'announcement' || (r.type || '') === 'push');
            const messages = rows.filter(r => (r.type || '') === 'direct_message');

            if (announcementList) {
                if (!announcements.length) {
                    announcementList.innerHTML = '<div class="notice-empty">No announcements yet.</div>';
                } else {
                    announcementList.innerHTML = announcements.map(a => `
                        <div class="notice-item">
                            <div class="notice-item-title">${escapeHtml(a.title || 'Announcement')}</div>
                            <div>${escapeHtml(a.message || '')}</div>
                            <div class="notice-item-meta">${formatNotificationTime(a.created_at)}</div>
                        </div>
                    `).join('');
                }
            }

            if (inboxList) {
                if (!messages.length) {
                    inboxList.innerHTML = '<div class="notice-empty">No messages yet.</div>';
                } else {
                    inboxList.innerHTML = messages.map(m => `
                        <div class="notice-item">
                            <div class="notice-item-title">${escapeHtml(m.title || 'Message')}</div>
                            <div>${escapeHtml(m.message || '')}</div>
                            <div class="notice-item-meta">${formatNotificationTime(m.created_at)}</div>
                        </div>
                    `).join('');
                }
            }
        }

        async function markNotificationsRead() {
            try {
                await fetch('/api/notifications/read', { method: 'POST' });
                pollNotifications();
            } catch (_) {}
        }

        // Verse Handling
        function syncCountdown(remainingSeconds, totalSeconds) {
            const remain = Math.max(0, parseInt(remainingSeconds || 0, 10));
            const total = Math.max(1, parseInt(totalSeconds || 0, 10));
            countdownBase = remain;
            countdownTotal = total;
            countdownSyncedAt = Date.now();
            updateCountdownUi();
            if (!countdownTicker) {
                countdownTicker = setInterval(updateCountdownUi, 1000);
            }
        }

        function syncIntervalSetting(intervalValue) {
            const nextInterval = parseInt(intervalValue || 0, 10);
            if (!Number.isFinite(nextInterval) || nextInterval <= 0) return;
            if (settings.interval === nextInterval) return;
            settings.interval = nextInterval;
            saveSettings();
            const select = document.getElementById('intervalSelect');
            if (select && String(select.value) !== String(nextInterval)) {
                select.value = String(nextInterval);
            }
            if (isAdmin && settings.notifications) {
                showToast(`Interval synced: ${nextInterval}s`);
            }
        }

        function updateCountdownUi() {
            if (!countdownSyncedAt) return;
            const elapsed = Math.floor((Date.now() - countdownSyncedAt) / 1000);
            const remaining = Math.max(0, countdownBase - elapsed);
            const pct = countdownTotal ? (remaining / countdownTotal) * 100 : 0;
            const bar = document.getElementById('timerBar');
            const text = document.getElementById('timerText');
            if (bar) bar.style.width = `${pct}%`;
            if (text) text.textContent = formatCountdown(remaining);
        }

        async function fetchVerse() {
            if (verseFetchInFlight) return;
            verseFetchInFlight = true;
            try {
                const res = await fetch('/api/current');
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.error) {
                    if (data.error === 'banned') {
                        showAccountLock('Account Banned', data.message || 'Your account has been banned.', data.reason || '');
                        stopVersePolling();
                    } else if (data.error === 'maintenance') {
                        showAccountLock('Maintenance', data.message || 'Site is under maintenance.');
                    }
                    return;
                }
                
                if (data.verse) {
                    const nextVerseKey = String(data.verse.id || `${data.verse.ref || ''}|${data.verse.text || ''}`);
                    const currentVerseKey = currentVerse ? String(currentVerse.id || `${currentVerse.ref || ''}|${currentVerse.text || ''}`) : null;
                    const isNew = !!currentVerse && nextVerseKey !== currentVerseKey;
                    currentVerse = data.verse;
                    
                    document.getElementById('verseText').textContent = data.verse.text;
                    document.getElementById('verseRef').textContent = data.verse.ref;
                    document.getElementById('verseSource').textContent = data.verse.source;
                    document.getElementById('fullscreenText').textContent = `"${data.verse.text}"\n\n— ${data.verse.ref}`;
                    if (!commentVerseLocked) {
                        setActiveCommentVerse(data.verse);
                    }
                    
                    syncCountdown(data.countdown, data.interval);
                    syncIntervalSetting(data.interval);
                    
                    if (isNew) {
                        animateVerseReveal();
                        // Speak the new verse if TTS is enabled
                        speakVerse(data.verse.text, data.verse.ref);

                        if (settings.autoCopyVerse && navigator.clipboard) {
                            const verseLine = `"${data.verse.text}" — ${data.verse.ref}`;
                            navigator.clipboard.writeText(verseLine).catch(() => {});
                        }
                        
                        // Add to history
                        addToVerseHistory(data.verse);
                        
                        // Track daily challenge - view
                        trackDailyAction('view', nextVerseKey);
                        
                        if (settings.notifications) {
                            showToast('New verse discovered!');
                        }
                        if (currentTab === 'comments') loadComments();
                    }
                    
                    const now = Date.now();
                    const verseId = data.verse.id;
                    const shouldRefreshStatus = (
                        isNew ||
                        verseId !== lastStatusVerseId ||
                        (now - lastStatusRefreshAt) >= STATUS_REFRESH_INTERVAL_MS
                    );
                    if (shouldRefreshStatus) {
                        await checkStatus(verseId);
                        lastStatusRefreshAt = now;
                        lastStatusVerseId = verseId;
                    }
                }
            } catch (e) {
                console.error('Fetch error:', e);
            } finally {
                verseFetchInFlight = false;
            }
        }

        function formatCountdown(totalSeconds) {
            const safe = Math.max(0, parseInt(totalSeconds || 0, 10));
            const mins = Math.floor(safe / 60);
            const secs = safe % 60;
            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }

        function setActiveCommentVerse(verse) {
            if (!verse) return;
            activeCommentVerseId = verse.id;
            activeCommentVerseRef = verse.ref || 'Current Verse';
            const refEl = document.getElementById('commentVerseRef');
            if (refEl) refEl.textContent = activeCommentVerseRef;
        }

        function syncCommentVerse() {
            if (!currentVerse) return;
            commentVerseLocked = false;
            setActiveCommentVerse(currentVerse);
            loadComments(true);
        }

        async function checkStatus(verseId) {
            const [likeRes, saveRes] = await Promise.all([
                fetch(`/api/check_like/${verseId}`),
                fetch(`/api/check_save/${verseId}`)
            ]);
            const likeData = await likeRes.json();
            const saveData = await saveRes.json();
            
            updateLikeUI(likeData.liked);
            updateSaveUI(saveData.saved);
        }

        function updateLikeUI(liked) {
            const icon = document.getElementById('likeIcon');
            icon.innerHTML = liked ? '&#9829;' : '&#9825;';
            icon.style.color = liked ? 'var(--danger)' : '';
        }

        function updateSaveUI(saved) {
            const icon = document.getElementById('saveIcon');
            icon.innerHTML = saved ? '&#128209;' : '&#128278;';
            icon.style.color = saved ? 'var(--warning)' : '';
        }

        async function toggleLike() {
            if (!currentVerse) return;
            const res = await fetch('/api/like', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    verse_id: currentVerse.id,
                    verse: {
                        reference: currentVerse.ref,
                        text: currentVerse.text,
                        translation: currentVerse.trans,
                        source: currentVerse.source,
                        book: currentVerse.book
                    }
                })
            });
            const data = await res.json();
            updateLikeUI(data.liked);
            animateActionFeedback('likeIcon', data.liked ? '❤️' : '');
            if (settings.notifications) showToast(data.liked ? 'Added to likes' : 'Removed from likes');
            
            if (data.recommendation && settings.autoRec) {
                showRecommendation(data.recommendation);
            }
            if (currentTab === 'library') loadLibrary();
            
            // Track daily challenge
            if (data.liked) {
                trackDailyAction('like');
                awardXP(50, 'like');
            }
        }

        async function toggleSave() {
            if (!currentVerse) return;
            const res = await fetch('/api/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    verse_id: currentVerse.id,
                    verse: {
                        reference: currentVerse.ref,
                        text: currentVerse.text,
                        translation: currentVerse.trans,
                        source: currentVerse.source,
                        book: currentVerse.book
                    }
                })
            });
            const data = await res.json();
            updateSaveUI(data.saved);
            animateActionFeedback('saveIcon', data.saved ? '🔖' : '');
            
            // Track daily challenge
            if (data.saved) {
                trackDailyAction('save');
                awardXP(50, 'save');
            }
            if (settings.notifications) showToast(data.saved ? 'Verse saved' : 'Removed from saved');
            if (currentTab === 'library') loadLibrary();
        }

        // Copy & Share
        async function copyVerse() {
            if (!currentVerse) return;
            const text = `"${currentVerse.text}" — ${currentVerse.ref}`;
            await navigator.clipboard.writeText(text);
            if (settings.notifications) showToast('Copied to clipboard!');
        }

        async function shareVerse() {
            if (!currentVerse) return;
            const text = `"${currentVerse.text}" — ${currentVerse.ref}`;
            
            try {
                if (navigator.share) {
                    await navigator.share({ title: 'Bible AI Verse', text: text, url: window.location.href });
                    trackShare();
                } else {
                    await navigator.clipboard.writeText(text);
                    trackShare();
                    if (settings.notifications) showToast('Verse copied for sharing!');
                }
            } catch (e) {
                console.log('Share cancelled');
            }
        }

        // Fullscreen
        function toggleFullscreen(verse = null) {
            const fs = document.getElementById('fullscreen');
            const v = verse || currentVerse;
            
            if (v) {
                document.getElementById('fullscreenText').textContent = `"${v.text}"\n\n— ${v.ref}`;
                updateFullscreenButtons(v.id);
                fs.classList.add('active');
                AudioSys.playModal();
            }
        }

        function closeFullscreenOverlay(e) {
            if (e.target.id === 'fullscreen') {
                document.getElementById('fullscreen').classList.remove('active');
                AudioSys.playModal();
            }
        }

        async function updateFullscreenButtons(verseId = null) {
            const id = verseId || (currentVerse ? currentVerse.id : null);
            if (!id) return;
            
            const [likeRes, saveRes] = await Promise.all([
                fetch(`/api/check_like/${id}`),
                fetch(`/api/check_save/${id}`)
            ]);
            const likeData = await likeRes.json();
            const saveData = await saveRes.json();
            
            document.getElementById('fsLikeIcon').innerHTML = likeData.liked ? '&#9829;' : '&#9825;';
            document.getElementById('fsSaveIcon').innerHTML = saveData.saved ? '&#128209;' : '&#128278;';
        }

        // Recommendations
        function setupAutoRecommendations() {
            if (autoRecInterval) clearInterval(autoRecInterval);
            autoRecInterval = setInterval(async () => {
                if (settings.autoRec && currentTab === 'recommendations') {
                    await generateRec(true);
                }
            }, 60000);
        }

        function toggleAutoRec() {
            settings.autoRec = !settings.autoRec;
            document.getElementById('autoRecToggle').classList.toggle('active');
            saveSettings();
            if (settings.notifications) showToast(settings.autoRec ? 'Auto-recommendations ON' : 'Auto-recommendations OFF');
        }

        async function loadRecommendations() {
            const res = await fetch('/api/recommendations');
            const data = await res.json();
            
            if (data.recommendations.length > 0) {
                displayRecommendations(data.recommendations);
            }
        }

        async function generateRec(silent = false) {
            const btn = document.querySelector('.gen-btn');
            btn.style.transform = 'scale(0.97)';
            setTimeout(() => btn.style.transform = '', 100);
            
            const excludeIds = getRecentRecIds(20);
            const res = await fetch('/api/generate-recommendation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exclude_ids: excludeIds })
            });
            const data = await res.json();
            
            if (data.success) {
                let recommendation = data.recommendation;
                if (isDuplicateRec(recommendation)) {
                    excludeIds.push(recommendation.id);
                    const retry = await fetch('/api/generate-recommendation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ exclude_ids: excludeIds })
                    });
                    const retryData = await retry.json();
                    if (retryData.success) recommendation = retryData.recommendation;
                }
                showRecommendation(recommendation);
                addToRecHistory(recommendation);
                if (!silent && settings.notifications) showToast('New recommendation!');
            }
        }

        function isDuplicateRec(rec) {
            const history = JSON.parse(localStorage.getItem('recHistory') || '[]');
            return !!history.find(item => item && rec && item.id === rec.id);
        }

        function showRecommendation(rec) {
            const list = document.getElementById('recList');
            const card = createRecCard(rec);
            list.innerHTML = '';
            list.appendChild(card);
        }

        function displayRecommendations(recs) {
            const list = document.getElementById('recList');
            list.innerHTML = '';
            if (recs && recs.length > 0) {
                list.appendChild(createRecCard(recs[0]));
            }
        }

        function createRecCard(rec) {
            const div = document.createElement('div');
            div.className = 'rec-card';
            div.dataset.rec = JSON.stringify(rec || {});
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--primary);">
                    <span>&#10024;</span>
                    <span>${rec.reason}</span>
                </div>
                <div style="font-size: 15px; line-height: 1.5; margin-bottom: 10px;">${rec.text}</div>
                <div style="font-size: 13px; opacity: 0.7; font-weight: 600; margin-bottom: 12px;">${rec.ref}</div>
                <div style="display: flex; gap: 8px;">
                    <button class="verse-card-btn" style="flex: 1;" onclick="recLike(${rec.id}, this)">&#9825; Like</button>
                    <button class="verse-card-btn" style="flex: 1;" onclick="recSave(${rec.id}, this)">&#128278; Save</button>
                </div>
            `;
            return div;
        }

        async function recLike(id, btn) {
            let payload = { verse_id: id };
            try {
                const raw = btn?.closest('.rec-card')?.dataset?.rec;
                if (raw) {
                    const rec = JSON.parse(raw);
                    payload.verse = {
                        reference: rec.ref || rec.reference,
                        text: rec.text,
                        translation: rec.translation || rec.trans,
                        source: rec.source,
                        book: rec.book
                    };
                }
            } catch (_) {}
            await fetch('/api/like', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            btn.innerHTML = '&#9829; Liked';
            btn.classList.add('liked');
            btn.classList.add('pop-success');
            setTimeout(() => btn.classList.remove('pop-success'), 420);
            trackDailyAction('like');
        }

        async function recSave(id, btn) {
            let payload = { verse_id: id };
            try {
                const raw = btn?.closest('.rec-card')?.dataset?.rec;
                if (raw) {
                    const rec = JSON.parse(raw);
                    payload.verse = {
                        reference: rec.ref || rec.reference,
                        text: rec.text,
                        translation: rec.translation || rec.trans,
                        source: rec.source,
                        book: rec.book
                    };
                }
            } catch (_) {}
            await fetch('/api/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            btn.innerHTML = '&#128209; Saved';
            btn.classList.add('saved');
            btn.classList.add('pop-success');
            setTimeout(() => btn.classList.remove('pop-success'), 420);
            trackDailyAction('save');
        }

        // Library - Simplified with Favorites
        async function loadLibrary() {
            const res = await fetch('/api/library');
            libraryData = await res.json();
            
            // Find or create favorites collection
            favoritesCollection = libraryData.collections.find(c => c.name === 'Favorites');
            
            // Update favorites drop zone count
            const favCount = favoritesCollection ? favoritesCollection.verses.length : 0;
            const likedCount = Array.isArray(libraryData.liked) ? libraryData.liked.length : 0;
            const savedCount = Array.isArray(libraryData.saved) ? libraryData.saved.length : 0;
            document.getElementById('favoritesCount').textContent = `${favCount} verses`;
            document.getElementById('favoritesCountDrop').textContent = String(favCount);
            document.getElementById('likedCount').textContent = `${likedCount} verses`;
            document.getElementById('savedCount').textContent = `${savedCount} verses`;
            
            // Render combined liked and saved verses
            renderLibraryVerses();
        }

        function renderLibraryVerses() {
            const list = document.getElementById('libraryVersesList');
            
            // Combine liked and saved, remove duplicates
            const allVerses = [...libraryData.liked, ...libraryData.saved];
            const seen = new Set();
            const uniqueVerses = allVerses.filter(v => {
                if (seen.has(v.id)) return false;
                seen.add(v.id);
                return true;
            });
            
            if (uniqueVerses.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">&#9825;</div>
                        <div class="empty-state-text">No verses yet. Start liking and saving!</div>
                    </div>
                `;
                return;
            }
            
            list.innerHTML = uniqueVerses.map(v => `
                <div class="verse-card" 
                     draggable="true"
                     data-verse-id="${v.id}"
                     data-verse='${JSON.stringify(v).replace(/'/g, "&#39;")}'
                     onmousedown="handleMouseDown(event, this)"
                     onmouseup="handleMouseUp(event, this)"
                     onmouseleave="handleMouseLeave(event, this)"
                     ontouchstart="handleTouchStart(event, this)"
                     ontouchend="handleTouchEnd(event, this)"
                     ondragstart="handleDragStart(event, this)">
                    <div class="verse-card-text">${v.text}</div>
                    <div class="verse-card-ref">${v.ref}</div>
                    <div class="verse-card-actions">
                        <button class="verse-card-btn ${v.liked_at ? 'liked' : ''}" onclick="event.stopPropagation(); libraryLike(${v.id})">
                            ${v.liked_at ? '&#9829; Liked' : '&#9825; Like'}
                        </button>
                        <button class="verse-card-btn ${v.saved_at ? 'saved' : ''}" onclick="event.stopPropagation(); librarySave(${v.id})">
                            ${v.saved_at ? '&#128209; Saved' : '&#128278; Save'}
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Drag and Drop Handlers
        function handleMouseDown(e, el) {
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            dragState.hasMoved = false;
            dragState.draggedVerse = JSON.parse(el.dataset.verse);
            
            dragState.dragTimer = setTimeout(() => {
                dragState.isDragging = true;
                el.classList.add('dragging');
            }, 300);
        }

        function handleMouseUp(e, el) {
            clearTimeout(dragState.dragTimer);
            
            const dx = Math.abs(e.clientX - dragState.startX);
            const dy = Math.abs(e.clientY - dragState.startY);
            
            if (!dragState.isDragging && dx < 5 && dy < 5) {
                const verse = JSON.parse(el.dataset.verse);
                toggleFullscreen(verse);
            }
            
            setTimeout(() => {
                dragState.isDragging = false;
                dragState.draggedVerse = null;
                el.classList.remove('dragging');
            }, 50);
        }

        function handleMouseLeave(e, el) {
            clearTimeout(dragState.dragTimer);
            if (!dragState.isDragging) {
                dragState.draggedVerse = null;
            }
        }

        function handleTouchStart(e, el) {
            const touch = e.touches[0];
            dragState.startX = touch.clientX;
            dragState.startY = touch.clientY;
            dragState.hasMoved = false;
            dragState.draggedVerse = JSON.parse(el.dataset.verse);
            
            dragState.dragTimer = setTimeout(() => {
                dragState.isDragging = true;
                el.classList.add('dragging');
            }, 400);
        }

        function handleTouchEnd(e, el) {
            clearTimeout(dragState.dragTimer);
            
            const touch = e.changedTouches[0];
            const dx = Math.abs(touch.clientX - dragState.startX);
            const dy = Math.abs(touch.clientY - dragState.startY);
            
            if (!dragState.isDragging && dx < 10 && dy < 10) {
                const verse = JSON.parse(el.dataset.verse);
                toggleFullscreen(verse);
            }
            
            setTimeout(() => {
                dragState.isDragging = false;
                dragState.draggedVerse = null;
                el.classList.remove('dragging');
            }, 50);
        }

        function handleDragStart(e, el) {
            if (!dragState.isDragging && dragState.draggedVerse) {
                dragState.isDragging = true;
                dragState.draggedVerse = JSON.parse(el.dataset.verse);
            }
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', el.dataset.verseId);
        }

        function handleDragOver(e) {
            e.preventDefault();
            document.getElementById('favoritesDropZone').classList.add('drag-over');
        }

        function handleDragLeave(e) {
            document.getElementById('favoritesDropZone').classList.remove('drag-over');
        }

        async function handleDrop(e) {
            e.preventDefault();
            document.getElementById('favoritesDropZone').classList.remove('drag-over');
            
            const verseId = dragState.draggedVerse ? dragState.draggedVerse.id : parseInt(e.dataTransfer.getData('text/plain'));
            if (!verseId) return;
            
            // Create favorites collection if doesn't exist, then add verse
            try {
                let collectionId = favoritesCollection ? favoritesCollection.id : null;
                
                if (!collectionId) {
                    // Create favorites collection
                    const createRes = await fetch('/api/collections/create', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: 'Favorites', color: '#FF375F'})
                    });
                    const createData = await createRes.json();
                    collectionId = createData.id;
                    favoritesCollection = createData;
                }
                
                const res = await fetch('/api/collections/add', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({collection_id: collectionId, verse_id: verseId})
                });
                
                const data = await res.json();
                if (data.success) {
                    if (settings.notifications) showToast('Added to Favorites!');
                    loadLibrary();
                } else {
                    if (settings.notifications) showToast('Already in Favorites');
                }
            } catch (e) {
                console.error('Drop error:', e);
            }
            
            dragState.isDragging = false;
            dragState.draggedVerse = null;
            document.querySelectorAll('.verse-card.dragging').forEach(el => el.classList.remove('dragging'));
        }

        async function libraryLike(id) {
            await fetch('/api/like', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({verse_id: id})
            });
            loadLibrary();
            if (currentVerse && currentVerse.id === id) checkStatus(id);
        }

        async function librarySave(id) {
            await fetch('/api/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({verse_id: id})
            });
            loadLibrary();
            if (currentVerse && currentVerse.id === id) checkStatus(id);
        }

        // Comments
        async function loadComments(force = false) {
            const verseForComments = activeCommentVerseId || (currentVerse ? currentVerse.id : null);
            if (!verseForComments) return;
            if (!force && isCommentsInputActive()) return;
            captureActiveReplyDraft();
            const res = await fetch(`/api/comments/${verseForComments}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ([]));
            if (!res.ok || data.error) {
                if (data.error === 'banned') {
                    showAccountLock('Account Banned', data.message || 'Your account has been banned.', data.reason || '');
                    stopVersePolling();
                }
                return;
            }
            const comments = data;
            const signature = buildCommentSignature(comments);
            if (!force && signature && signature === lastCommentsSignature) {
                return;
            }
            lastCommentsSignature = signature;
            
            const list = document.getElementById('commentsList');
            if (comments.length === 0) {
                list.innerHTML = '<div class="empty-state"><div class="empty-state-text">No comments yet. Share your thoughts!</div></div>';
            } else {
                list.innerHTML = comments.map(c => renderCommentItem(c, 'comment')).join('');
            }
            if (openReplyKey) {
                restoreActiveReplyDraft();
            }
            
            // Show delete buttons if admin
            if (isAdmin) {
                document.querySelectorAll('.delete-comment-btn').forEach(btn => btn.classList.add('show'));
            }
            applyRestrictionState();
        }

        async function postComment() {
            const input = document.getElementById('commentInput');
            const text = input.value.trim();
            if (!text) return;
            const verseId = activeCommentVerseId || (currentVerse ? currentVerse.id : null);
            if (!verseId) return;
            commentVerseLocked = true;
            if (commentRestriction.restricted) {
                showToast(commentRestriction.reason ? `Chat disabled: ${commentRestriction.reason}` : 'Chat disabled');
                return;
            }
            
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({verse_id: verseId, text: text})
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.message || data.error || 'Comment failed');
                if (data.error === 'restricted') updateRestrictionUI();
                return;
            }
            input.value = '';
            input.style.height = 'auto';
            loadComments(true);
            loadProfileStats();
            if (settings.notifications) showToast('Comment posted!');
            trackDailyAction('comment');
            awardXP(100, 'comment');
        }

        // Community Chat
        async function loadCommunityMessages(force = false) {
            if (!force && isCommentsInputActive()) return;
            captureActiveReplyDraft();
            const res = await fetch('/api/community', { cache: 'no-store' });
            const data = await res.json().catch(() => ([]));
            if (!res.ok || data.error) {
                if (data.error === 'banned') {
                    showAccountLock('Account Banned', data.message || 'Your account has been banned.', data.reason || '');
                    stopVersePolling();
                }
                return;
            }
            const messages = data;
            const filtered = currentCommunityFilter === 'all'
                ? messages
                : messages.filter(m => String(m.text || '').toLowerCase().includes('#' + currentCommunityFilter.toLowerCase()));
            const signature = buildCommentSignature(filtered);
            if (!force && signature && signature === lastCommunitySignature) {
                return;
            }
            lastCommunitySignature = signature;
            
            const list = document.getElementById('communityList');
            if (filtered.length === 0) {
                list.innerHTML = '<div class="empty-state"><div class="empty-state-text">Start a conversation about life, faith, or support!</div></div>';
            } else {
                list.innerHTML = filtered.map(m => renderCommentItem(m, 'community')).join('');
            }
            if (openReplyKey) {
                restoreActiveReplyDraft();
            }
            
            if (isAdmin) {
                document.querySelectorAll('.delete-comment-btn').forEach(btn => btn.classList.add('show'));
            }
            applyRestrictionState();
        }

        async function postCommunityMessage() {
            const input = document.getElementById('communityInput');
            const text = input.value.trim();
            if (!text) return;
            if (commentRestriction.restricted) {
                showToast(commentRestriction.reason ? `Chat disabled: ${commentRestriction.reason}` : 'Chat disabled');
                return;
            }
            
            const res = await fetch('/api/community', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: text})
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.message || data.error || 'Message failed');
                if (data.error === 'restricted') updateRestrictionUI();
                return;
            }
            input.value = '';
            input.style.height = 'auto';
            loadCommunityMessages(true);
            if (settings.notifications) showToast('Message posted!');
        }

        // ===== Direct Messages =====
        function buildDmThreadsSignature(threads) {
            if (!Array.isArray(threads)) return '';
            return threads.map(t => [
                t.user_id,
                (t.last_message || '').length,
                t.last_at || '',
                t.unread || 0,
                t.picture || '',
                t.avatar_decoration || ''
            ].join(':')).join('|');
        }

        function buildDmMessagesSignature(messages) {
            if (!Array.isArray(messages)) return '';
            return messages.map(m => `${m.id}:${m.sender_id}:${(m.message || '').length}`).join('|');
        }

        function renderDmThreads(threads) {
            const list = document.getElementById('dmThreadList');
            if (!list) return;
            if (!threads.length) {
                list.innerHTML = '<div class="empty-state"><div class="empty-state-text">No conversations yet.</div></div>';
                const suggested = document.getElementById('dmSuggestedList');
                if (suggested) {
                    suggested.innerHTML = '<div class="empty-state"><div class="empty-state-text">Suggestions loading…</div></div>';
                }
                loadDmSuggestions();
                return;
            }
            threads.forEach(t => { dmThreadsCache[t.user_id] = t; });
            list.innerHTML = threads.map(t => {
                const active = dmSelectedUserId === t.user_id ? 'active' : '';
                const unread = t.unread ? ` • ${t.unread} new` : '';
                const avatarHtml = renderAvatarMarkup(t.picture || '', t.name || 'User', t.avatar_decoration || '', 'dm-thread-avatar');
                return `
                    <div class="dm-thread ${active}" onclick="openDmThread(${t.user_id})">
                        ${avatarHtml}
                        <div>
                            <div class="dm-thread-name">${escapeHtml(t.name || 'User')}</div>
                            <div class="dm-thread-last">${escapeHtml(t.last_message || 'No messages yet')}</div>
                        </div>
                        ${t.unread ? `<span class="dm-unread">${t.unread}</span>` : ''}
                    </div>
                `;
            }).join('');
        }

        async function loadDmSuggestions() {
            const suggested = document.getElementById('dmSuggestedList');
            if (!suggested) return;
            try {
                const res = await fetch('/api/users/recent?limit=6', { cache: 'no-store' });
                const data = await res.json().catch(() => ([]));
                if (!res.ok || data.error || !data.length) {
                    suggested.innerHTML = '';
                    return;
                }
                suggested.innerHTML = data.map(u => {
                    const avatarHtml = renderAvatarMarkup(u.picture || '', u.name || 'User', u.avatar_decoration || '', 'dm-thread-avatar');
                    return `
                    <div class="dm-thread" onclick="openDmThread(${u.id}, ${JSON.stringify(u.name || 'User')}, ${JSON.stringify(u.picture || '')}, ${JSON.stringify(u.avatar_decoration || '')})">
                        ${avatarHtml}
                        <div>
                            <div class="dm-thread-name">${escapeHtml(u.name || 'User')}</div>
                            <div class="dm-thread-last">Suggested • ${escapeHtml(u.role || 'user')}</div>
                        </div>
                    </div>
                    `;
                }).join('');
            } catch (_) {
                suggested.innerHTML = '';
            }
        }

        function renderDmMessages(messages) {
            const box = document.getElementById('dmMessages');
            if (!box) return;
            if (!messages.length) {
                box.innerHTML = '<div class="empty-state"><div class="empty-state-text">No messages yet.</div></div>';
                return;
            }
            box.innerHTML = messages.map(m => {
                const self = m.sender_id === {{ user.id }};
                return `
                    <div class="dm-message ${self ? 'self' : ''}">
                        ${escapeHtml(m.message || '')}
                        <div class="dm-time">${formatLocalTimestamp(m.created_at)}</div>
                    </div>
                `;
            }).join('');
            box.scrollTop = box.scrollHeight;
        }

        async function loadDmThreads(force = false) {
            if (!force && isCommentsInputActive()) return;
            try {
                const res = await fetch('/api/dm/threads', { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok || data.error) return;
                let list = Array.isArray(data) ? data : [];
                if (dmSelectedUserId && !list.some(t => t.user_id === dmSelectedUserId)) {
                    const fallback = dmThreadsCache[dmSelectedUserId] || {
                        user_id: dmSelectedUserId,
                        name: dmSelectedUserName || `User #${dmSelectedUserId}`,
                        picture: '',
                        avatar_decoration: dmSelectedUserDecor || '',
                        last_message: 'Start a conversation',
                        unread: 0
                    };
                    list = [fallback, ...list];
                }
                const signature = buildDmThreadsSignature(data);
                if (!force && signature === dmThreadsSignature) return;
                dmThreadsSignature = signature;
                renderDmThreads(list);
            } catch (_) {}
        }

        async function loadDmMessages(force = false) {
            if (!dmSelectedUserId) return;
            if (!force && isCommentsInputActive()) return;
            try {
                const res = await fetch(`/api/dm/messages/${dmSelectedUserId}`, { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok || data.error) return;
                const signature = buildDmMessagesSignature(data);
                if (!force && signature === dmMessagesSignature) return;
                dmMessagesSignature = signature;
                renderDmMessages(data);
                updateDmTyping();
            } catch (_) {}
        }

        function openDmThread(userId, userName = '', userPicture = '', userDecor = '') {
            if (!userId) return;
            if (currentTab !== 'comments') switchTab('comments');
            if (currentCommentsView !== 'dm') switchCommentsView('dm');
            dmSelectedUserId = userId;
            if (userName) dmSelectedUserName = userName;
            if (userDecor) dmSelectedUserDecor = userDecor;
            dmMessagesSignature = '';
            if (!dmThreadsCache[userId]) {
                dmThreadsCache[userId] = {
                    user_id: userId,
                    name: userName || dmSelectedUserName || `User #${userId}`,
                    picture: userPicture || '',
                    avatar_decoration: userDecor || '',
                    last_message: 'Start a conversation',
                    unread: 0
                };
            }
            const label = document.getElementById('dmHeaderLabel');
            if (label) {
                const thread = dmThreadsCache[userId];
                const name = thread && thread.name ? thread.name : `#${userId}`;
                label.textContent = `Conversation with ${name}`;
            }
            const results = document.getElementById('dmSearchResults');
            if (results) {
                results.style.display = 'none';
                results.innerHTML = '';
            }
            renderDmThreads(Object.values(dmThreadsCache));
            loadDmThreads(true);
            loadDmMessages(true);
        }

        async function sendDm() {
            if (!dmSelectedUserId) {
                showToast('Pick a user first');
                return;
            }
            const input = document.getElementById('dmInput');
            const message = (input.value || '').trim();
            if (!message) return;
            const res = await fetch('/api/dm/send', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ recipient_id: dmSelectedUserId, message })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.message || data.error || 'Message failed');
                return;
            }
            input.value = '';
            loadDmMessages(true);
            loadDmThreads(true);
        }

        async function deleteDmThread() {
            if (!dmSelectedUserId) {
                showToast('Pick a conversation first');
                return;
            }
            if (!confirm('Delete this conversation?')) return;
            const res = await fetch(`/api/dm/thread/${dmSelectedUserId}/delete`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.error || 'Delete failed');
                return;
            }
            dmSelectedUserId = null;
            dmMessagesSignature = '';
            const label = document.getElementById('dmHeaderLabel');
            if (label) label.textContent = 'No conversation selected';
            const box = document.getElementById('dmMessages');
            if (box) box.innerHTML = '<div class="empty-state"><div class="empty-state-text">Select a conversation to start chatting.</div></div>';
            loadDmThreads(true);
        }

        function scheduleTypingPing() {
            if (!dmSelectedUserId) return;
            if (dmTypingCooldown) return;
            dmTypingCooldown = setTimeout(async () => {
                dmTypingCooldown = null;
                try {
                    await fetch('/api/dm/typing', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ other_id: dmSelectedUserId })
                    });
                } catch (_) {}
            }, 600);
        }

        async function updateDmTyping() {
            if (!dmSelectedUserId) return;
            const indicator = document.getElementById('dmTypingIndicator');
            if (!indicator) return;
            try {
                const res = await fetch(`/api/dm/typing/${dmSelectedUserId}`);
                const data = await res.json().catch(() => ({}));
                indicator.textContent = data.typing ? 'Typing…' : '';
            } catch (_) {
                indicator.textContent = '';
            }
        }

        async function searchDmUsers() {
            const input = document.getElementById('dmSearchInput');
            const q = (input.value || '').trim();
            const isIdSearch = /^\d+$/.test(q);
            if (q.length < 2 && !isIdSearch) {
                showToast('Type at least 2 characters');
                return;
            }
            const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
            const data = await res.json().catch(() => ([]));
            const results = document.getElementById('dmSearchResults');
            if (!res.ok || data.error) {
                results.style.display = 'block';
                results.innerHTML = '<div class="empty-state"><div class="empty-state-text">Search failed.</div></div>';
                return;
            }
            if (!data.length) {
                results.style.display = 'block';
                results.innerHTML = '<div class="empty-state"><div class="empty-state-text">No users found.</div></div>';
                return;
            }
            results.style.display = 'block';
            results.innerHTML = data.map(u => {
                const meta = [];
                if (u.role) meta.push(u.role);
                meta.push(`ID:${u.id}`);
                if (u.email) meta.push(u.email);
                const avatarHtml = renderAvatarMarkup(u.picture || '', u.name || 'User', u.avatar_decoration || '', 'dm-thread-avatar');
                return `
                <div class="dm-thread" onclick="openDmThread(${u.id}, ${JSON.stringify(u.name || 'User')}, ${JSON.stringify(u.picture || '')}, ${JSON.stringify(u.avatar_decoration || '')})">
                    ${avatarHtml}
                    <div>
                        <div class="dm-thread-name">${escapeHtml(u.name || 'User')}</div>
                        <div class="dm-thread-last">${escapeHtml(meta.join(' • '))}</div>
                    </div>
                </div>
                `;
            }).join('');
        }

        function openDmFromComment(userId, userName = '', userPicture = '', userDecor = '') {
            if (!userId) return;
            switchTab('comments');
            switchCommentsView('dm');
            openDmThread(userId, userName, userPicture, userDecor);
        }

        function formatLocalTimestamp(ts, options) {
            if (!ts) return '';
            const raw = String(ts).trim();
            if (!raw) return '';
            const hasZone = /Z|[+-]\d{2}:?\d{2}$/.test(raw);
            const normalized = hasZone ? raw : `${raw}Z`;
            const date = new Date(normalized);
            if (Number.isNaN(date.getTime())) return raw;
            return date.toLocaleString([], options || {});
        }

        function buildReactionsSignature(reactions) {
            if (!reactions || typeof reactions !== 'object') return '';
            const keys = Object.keys(reactions).sort();
            return keys.map(k => `${k}:${reactions[k] || 0}`).join(',');
        }

        function buildCommentSignature(items) {
            if (!Array.isArray(items)) return '';
            return items.map(c => {
                const replies = Array.isArray(c.replies) ? c.replies : [];
                const replyIds = replies.map(r => `${r.id}:${r.avatar_decoration || ''}:${r.user_picture || ''}`).join(',');
                return [
                    c.id,
                    (c.text || '').length,
                    c.reply_count || replies.length || 0,
                    buildReactionsSignature(c.reactions),
                    replyIds,
                    c.user_picture || '',
                    c.avatar_decoration || ''
                ].join('|');
            }).join('||');
        }

        function trackReplyDraft(key, value) {
            if (!key) return;
            replyDrafts[key] = value || '';
            replyActiveKey = key;
        }

        function setReplyEditing(key, isEditing) {
            if (!key) return;
            if (isEditing) {
                replyActiveKey = key;
                return;
            }
            if (replyActiveKey === key) replyActiveKey = null;
        }

        function captureActiveReplyDraft() {
            const active = document.activeElement;
            if (!active || !active.id || !active.id.startsWith('reply-input-')) return;
            const key = active.id.replace('reply-input-', '');
            replyDrafts[key] = active.value || '';
            replyActiveKey = key;
        }

        function restoreActiveReplyDraft() {
            if (!replyActiveKey) return;
            const input = document.getElementById(`reply-input-${replyActiveKey}`);
            if (!input) return;
            input.value = replyDrafts[replyActiveKey] || '';
            input.focus();
            const len = input.value.length;
            try { input.setSelectionRange(len, len); } catch (_) {}
        }

        function renderCommentItem(c, type) {
            const isOwner = c.user_id === parseInt('{{ user.id }}');
            const reactions = c.reactions || { 'heart': 0, 'pray': 0, 'cross': 0 };
            const replies = Array.isArray(c.replies) ? c.replies : [];
            const role = (c.user_role || 'user').toLowerCase();
            const roleDisplay = role.replace('_', ' ');
            const replyDisabled = commentRestriction.restricted ? 'disabled' : '';
            const replyKey = `${type}-${c.id}`;
            const replyOpen = openReplyKey === replyKey;
            const replyDraft = replyDrafts[replyKey] || '';
            const canDm = c.user_id && !isOwner;
            const avatarHtml = renderAvatarMarkup(c.user_picture, c.user_name, c.avatar_decoration, 'comment-avatar');
            
            return `
                <div class="comment-item" id="${type}-${c.id}">
                    <button class="delete-comment-btn" onclick="deleteComment(${c.id}, '${type}')" title="Delete (Admin only)">&#10005;</button>
                    <div class="comment-header">
                        ${c.user_id ? `
                            <a class="comment-user-link" href="/u/${c.user_id}">
                                ${avatarHtml}
                            </a>
                        ` : avatarHtml}
                        <div class="comment-meta">
                            <div class="comment-name-row">
                                ${c.user_id ? `
                                    <a class="comment-user-link comment-name" href="/u/${c.user_id}">${c.user_name}</a>
                                ` : `
                                    <div class="comment-name">${c.user_name}</div>
                                `}
                                <span class="comment-role-badge comment-role-${role}">${escapeHtml(roleDisplay)}</span>
                            </div>
                            <div class="comment-time">${formatLocalTimestamp(c.timestamp)}</div>
                        </div>
                    </div>

                    <div class="comment-text">${escapeHtml(c.text)}</div>
                    <div class="reaction-bar">
                        <button class="reaction-btn" onclick="addReaction(${c.id}, '${type}', 'heart', this)">❤️ ${reactions['heart'] || 0}</button>
                        <button class="reaction-btn" onclick="addReaction(${c.id}, '${type}', 'pray', this)">🙏 ${reactions['pray'] || 0}</button>
                        <button class="reaction-btn" onclick="addReaction(${c.id}, '${type}', 'cross', this)">✝️ ${reactions['cross'] || 0}</button>
                        <button class="reply-btn" ${replyDisabled} onclick="showReplyBox(${c.id}, '${type}')">Reply (${c.reply_count || replies.length || 0})</button>
                        ${canDm ? `<button class="reply-btn" onclick="openDmFromComment(${c.user_id}, ${JSON.stringify(c.user_name || 'User')}, ${JSON.stringify(c.user_picture || '')}, ${JSON.stringify(c.avatar_decoration || '')})">DM</button>` : ''}
                    </div>
                    <div class="comment-replies" id="replies-${type}-${c.id}">${renderReplies(replies)}</div>
                    <div class="reply-input-area" id="reply-box-${type}-${c.id}" style="display: ${replyOpen ? 'flex' : 'none'};">
                        <input type="text" class="comment-input" name="reply_text" autocomplete="off" data-form-type="other" placeholder="Write a reply..." id="reply-input-${type}-${c.id}" value="${escapeHtml(replyDraft)}" ${replyDisabled} oninput="trackReplyDraft('${replyKey}', this.value)" onfocus="setReplyEditing('${replyKey}', true)" onblur="setReplyEditing('${replyKey}', false)" onkeydown="if(event.key==='Enter')postReply(${c.id}, '${type}')">
                        <button class="send-btn" ${replyDisabled} onclick="postReply(${c.id}, '${type}')">Send</button>
                    </div>
                </div>
            `;
        }

        function renderReplies(replies) {
            if (!Array.isArray(replies) || !replies.length) return '';
            return replies.map(r => {
                const role = String(r.user_role || 'user').toLowerCase();
                const roleDisplay = role.replace('_', ' ');
                const avatarHtml = renderAvatarMarkup(r.user_picture || '', r.user_name || 'User', r.avatar_decoration || '', 'comment-avatar');
                return `
                    <div class="comment-item" style="margin-left: 26px; margin-top: 8px; border-left: 2px solid rgba(255,255,255,0.12);">
                        <div class="comment-header">
                            ${r.user_id ? `
                                <a class="comment-user-link" href="/u/${r.user_id}">
                                    ${avatarHtml}
                                </a>
                            ` : avatarHtml}
                            <div class="comment-meta">
                                <div class="comment-name-row">
                                    ${r.user_id ? `
                                        <a class="comment-user-link comment-name" href="/u/${r.user_id}">${escapeHtml(r.user_name || 'Anonymous')}</a>
                                    ` : `
                                        <div class="comment-name">${escapeHtml(r.user_name || 'Anonymous')}</div>
                                    `}
                                    <span class="comment-role-badge comment-role-${role}">${escapeHtml(roleDisplay)}</span>
                                </div>
                                <div class="comment-time">${r.timestamp ? formatLocalTimestamp(r.timestamp) : ''}</div>
                            </div>
                        </div>
                        <div class="comment-text">${escapeHtml(r.text || '')}</div>
                    </div>
                `;
            }).join('');
        }

        async function deleteComment(id, type) {
            if (!isAdmin) return;
            
            if (!confirm('Delete this ' + (type === 'comment' ? 'comment' : 'message') + '?')) return;
            
            try {
                const endpoint = type === 'comment' ? `/api/admin/delete_comment/${id}` : `/api/admin/delete_community/${id}`;
                const res = await fetch(endpoint, {method: 'DELETE'});
                
                if (res.ok) {
                    const row = document.getElementById(`${type}-${id}`);
                    if (row) row.remove();
                    showToast('Deleted successfully');
                    if (type === 'community') {
                        loadCommunityMessages();
                    } else {
                        loadComments();
                    }
                    loadProfileStats();
                }
            } catch (e) {
                showToast('Failed to delete');
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function renderAvatarMarkup(url, name, decor, imgClass) {
            const safeName = name || 'User';
            const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=random`;
            const avatarUrl = url || '';
            const decorAnim = (typeof DECOR_ANIMATIONS === 'object' && DECOR_ANIMATIONS[decor]) ? ` ${DECOR_ANIMATIONS[decor]}` : '';
            const decorImg = decor ? `<img class="avatar-decor${decorAnim}" src="${decor}" alt="">` : '';
            return `
                <span class="avatar-wrap">
                    <img src="${avatarUrl}" class="${imgClass}" onerror="this.src='${fallback}'">
                    ${decorImg}
                </span>
            `;
        }

        // Profile Stats
        function parseCreatedAt(value) {
            if (!value) return null;
            if (typeof value === 'number') {
                const ms = value > 1e12 ? value : value * 1000;
                const d = new Date(ms);
                return Number.isNaN(d.getTime()) ? null : d;
            }
            const str = String(value).trim();
            if (!str) return null;
            const lowered = str.toLowerCase();
            if (lowered === 'none' || lowered === 'null' || lowered === 'undefined') return null;
            if (/^\d+$/.test(str)) {
                const num = Number(str);
                const ms = num > 1e12 ? num : num * 1000;
                const d = new Date(ms);
                return Number.isNaN(d.getTime()) ? null : d;
            }
            let d = new Date(str);
            if (Number.isNaN(d.getTime())) {
                let candidate = str.replace(' ', 'T');
                candidate = candidate.replace(' UTC', 'Z');
                d = new Date(candidate);
            }
            if (Number.isNaN(d.getTime())) return null;
            return d;
        }

        async function loadProfileStats() {
            let stats = null;
            try {
                const res = await fetch('/api/stats');
                if (res.ok) {
                    stats = await res.json();
                }
            } catch (_) {}

            const safeStats = stats || { total_verses: 0, liked: 0, saved: 0, comments: 0, replies: 0 };
            document.getElementById('statVerses').textContent = safeStats.total_verses ?? 0;
            document.getElementById('statLiked').textContent = safeStats.liked ?? 0;
            document.getElementById('statSaved').textContent = safeStats.saved ?? 0;
            document.getElementById('statComments').textContent = safeStats.comments ?? 0;
            if (document.getElementById('statReplies')) {
                document.getElementById('statReplies').textContent = safeStats.replies || 0;
            }
            
            let userData = {};
            try {
                const userRes = await fetch('/api/user_info');
                if (userRes.ok) {
                    userData = await userRes.json();
                }
            } catch (_) {}
            const profileEl = document.getElementById('profile');
            const fallbackCreated = profileEl?.dataset?.createdAt || '';
            const fallbackName = profileEl?.dataset?.userName || '';
            const fallbackEmail = profileEl?.dataset?.userEmail || '';
            const fallbackPicture = profileEl?.dataset?.userPicture || '';
            const fallbackUserId = profileEl?.dataset?.userId || '';
            const effectiveName = userData.name || fallbackName || 'User';
            const effectiveEmail = userData.email || fallbackEmail || '';
            const effectivePicture = userData.picture || fallbackPicture || '';
            const effectiveDecor = userData.avatar_decoration || profileEl?.dataset?.userDecor || '';
            if (profileEl) profileEl.dataset.userDecor = effectiveDecor || '';
            const nameEl = document.getElementById('profileUserName');
            if (nameEl) nameEl.textContent = effectiveName;
            const emailEl = document.getElementById('profileEmail');
            if (emailEl) emailEl.textContent = effectiveEmail;
            const avatarEl = document.getElementById('profileAvatar');
            if (avatarEl && effectivePicture) avatarEl.src = effectivePicture;
            updateHeaderAvatar(effectivePicture);
            applyAvatarDecoration(effectiveDecor);
            renderAvatarDecorations();
            const idEl = document.getElementById('profileUserId');
            if (idEl) {
                const idVal = userData.id || fallbackUserId;
                idEl.textContent = idVal ? `ID: ${idVal}` : 'ID: —';
            }
            
            const memberEl = document.getElementById('memberSince');
            if (memberEl) {
                const rawCreated = userData.created_at || fallbackCreated || '';
                const date = parseCreatedAt(rawCreated);
                if (date) {
                    memberEl.textContent = date.toLocaleDateString();
                } else {
                    const match = String(rawCreated).match(/\d{4}-\d{2}-\d{2}/);
                    memberEl.textContent = match ? match[0] : '—';
                }
            }

            const roleTag = document.getElementById('roleTag');
            if (roleTag) {
                const baseRole = String(userData.role || 'user');
                const effectiveRole = pickHigherRole(baseRole, userRole || baseRole);
                if (effectiveRole && effectiveRole !== 'user') {
                    roleTag.style.display = 'inline-block';
                    roleTag.textContent = effectiveRole.replace('_', ' ').toUpperCase();
                } else {
                    roleTag.style.display = 'none';
                }
            }
            
            // Load new profile features
            loadStreak();
            loadAchievements(safeStats);
            loadFavoriteBooks();
            loadVerseHistory();
            updateXpDisplay();
            
            // Load profile customizations from shop
            loadProfileCustomization();
        }
        
        async function loadProfileCustomization() {
            try {
                const userId = document.getElementById('profile')?.dataset?.userId;
                if (!userId) return;
                
                const res = await fetch(`/api/shop/profile/${userId}`);
                if (!res.ok) return;
                
                const data = await res.json();
                
                // Apply frame
                const frameEl = document.getElementById('profileFrame');
                if (frameEl && data.frame) {
                    const effects = data.frame.effects || {};
                    frameEl.className = 'profile-frame';
                    if (effects.frame_color === '#FFD700') frameEl.classList.add('gold');
                    else if (effects.frame_color === '#C0C0C0') frameEl.classList.add('silver');
                    else if (effects.frame_style === 'wings') frameEl.classList.add('angel');
                }
                
                // Apply name color
                const nameEl = document.getElementById('profileUserName');
                if (nameEl && data.name_color) {
                    const effects = data.name_color.effects || {};
                    nameEl.className = '';
                    if (effects.gradient) nameEl.classList.add('profile-name', 'rainbow');
                    else if (effects.color === '#FFD700') nameEl.classList.add('profile-name', 'gold');
                    else if (effects.color === '#39FF14') nameEl.classList.add('profile-name', 'neon');
                    else if (effects.color) nameEl.style.color = effects.color;
                }
                
                // Apply title
                const titleEl = document.getElementById('profileTitle');
                if (titleEl && data.title) {
                    const effects = data.title.effects || {};
                    titleEl.textContent = effects.title || '';
                } else if (titleEl) {
                    titleEl.textContent = '';
                }
                
                // Apply badges
                const badgesEl = document.getElementById('profileBadges');
                if (badgesEl && data.badges && data.badges.length > 0) {
                    badgesEl.innerHTML = data.badges.map(b => {
                        const effects = b.effects || {};
                        return `<span class="profile-badge" style="background: ${effects.color || 'var(--primary)'}" title="${b.name}">${b.icon}</span>`;
                    }).join('');
                } else if (badgesEl) {
                    badgesEl.innerHTML = '';
                }
                
                // Apply profile background
                const profileCard = document.getElementById('profileCard');
                if (profileCard && data.profile_bg) {
                    const effects = data.profile_bg.effects || {};
                    if (effects.bg_style === 'gradient' && effects.colors) {
                        profileCard.style.background = `linear-gradient(135deg, ${effects.colors.join(', ')})`;
                    }
                }
            } catch (e) {
                console.error('Error loading profile customization:', e);
            }
        }

        const AVATAR_DECORATIONS = [
            { name: 'Halo', url: '/static/images/decorations/halo.svg' },
            { name: 'Radiant', url: '/static/images/decorations/radiant.svg' },
            { name: 'Laurel', url: '/static/images/decorations/laurel.svg' },
            { name: 'Crown', url: '/static/images/decorations/crown.svg' },
            { name: 'Sparkle', url: '/static/images/decorations/sparkle.svg' },
            { name: 'Sunburst', url: '/static/images/decorations/sunburst.svg' },
            { name: 'Wings', url: '/static/images/decorations/wings.svg' },
            { name: 'Flame', url: '/static/images/decorations/flame.svg' },
            { name: 'Electric', url: '/static/images/decorations/electric.svg' },
            { name: 'Ice', url: '/static/images/decorations/ice.svg' },
            { name: 'Rose', url: '/static/images/decorations/rose.svg' },
            { name: 'Shield', url: '/static/images/decorations/shield.svg' },
            { name: 'Orbit', url: '/static/images/decorations/orbit.svg' },
            { name: 'Royal Frame', url: 'https://openclipart.org/image/800px/354763' },
            { name: 'Golden Laurel', url: 'https://openclipart.org/image/800px/227363' },
            { name: 'Laurel Classic', url: 'https://openclipart.org/image/800px/282511' },
            { name: 'Floral Wreath', url: 'https://openclipart.org/image/800px/253120' },
            { name: 'Winged Frame', url: 'https://openclipart.org/image/800px/352754' },
            { name: 'Winged Heart', url: 'https://openclipart.org/image/800px/228243' },
            { name: 'Doodle Wings', url: 'https://openclipart.org/image/800px/292258' }
        ];

        const DECOR_ANIMATIONS = {
            '/static/images/decorations/orbit.svg': 'spin',
            '/static/images/decorations/electric.svg': 'pulse',
            'https://openclipart.org/image/800px/354763': 'spin',
            'https://openclipart.org/image/800px/253120': 'pulse'
        };

        function updateHeaderAvatar(url) {
            const headerImg = document.getElementById('headerAvatarImg');
            if (headerImg && url) headerImg.src = url;
        }

        function applyAvatarDecoration(url) {
            currentAvatarDecoration = url || '';
            const headerDecor = document.getElementById('headerAvatarDecor');
            const profileDecor = document.getElementById('profileAvatarDecor');
            const onlineDecor = document.getElementById('onlineAvatarDecor');
            [headerDecor, profileDecor, onlineDecor].forEach(el => {
                if (!el) return;
                el.classList.remove('spin', 'pulse');
                if (!currentAvatarDecoration) {
                    el.classList.add('hidden');
                    el.removeAttribute('src');
                } else {
                    el.src = currentAvatarDecoration;
                    el.classList.remove('hidden');
                    if (DECOR_ANIMATIONS[currentAvatarDecoration]) {
                        el.classList.add(DECOR_ANIMATIONS[currentAvatarDecoration]);
                    }
                }
            });
        }

        function renderAvatarDecorations() {
            const grid = document.getElementById('avatarDecorPresets');
            if (!grid) return;
            if (!AVATAR_DECORATIONS.length) {
                grid.innerHTML = '<div class="shop-note">No presets yet. Upload a decoration or paste a GIF URL.</div>';
                return;
            }
            grid.innerHTML = AVATAR_DECORATIONS.map(d => `
                <div class="decor-option ${currentAvatarDecoration === d.url ? 'active' : ''}" onclick="setAvatarDecorationPreset('${d.url}')">
                    <img src="${d.url}" alt="${escapeHtml(d.name || '')}">
                    <div style="font-size:11px; text-align:center;">${escapeHtml(d.name || 'Decoration')}</div>
                </div>
            `).join('');
        }

        function setAvatarDecorationPreset(url) {
            if (!url) return;
            saveAvatarDecorationUrl(url);
        }

        async function saveProfilePictureUrl() {
            const input = document.getElementById('avatarUrlInput');
            const url = (input?.value || '').trim();
            if (!url) return;
            const res = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ kind: 'picture', url })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.error || 'Update failed');
                return;
            }
            updateHeaderAvatar(data.picture);
            const profileAvatar = document.getElementById('profileAvatar');
            if (profileAvatar && data.picture) profileAvatar.src = data.picture;
            const profileEl = document.getElementById('profile');
            if (profileEl && data.picture) profileEl.dataset.userPicture = data.picture;
            showToast('Profile picture updated');
        }

        async function resetProfilePicture() {
            const res = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ kind: 'picture', reset: true })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.error || 'Reset failed');
                return;
            }
            updateHeaderAvatar(data.picture);
            const profileAvatar = document.getElementById('profileAvatar');
            if (profileAvatar && data.picture) profileAvatar.src = data.picture;
            const profileEl = document.getElementById('profile');
            if (profileEl && data.picture) profileEl.dataset.userPicture = data.picture;
            showToast('Profile picture reset');
        }

        async function saveAvatarDecorationUrl(urlOverride = '') {
            const input = document.getElementById('decorUrlInput');
            const url = (urlOverride || input?.value || '').trim();
            if (!url) return;
            const res = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ kind: 'decoration', url })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.error || 'Update failed');
                return;
            }
            applyAvatarDecoration(data.avatar_decoration);
            renderAvatarDecorations();
            showToast('Decoration applied');
        }

        async function clearAvatarDecoration() {
            const res = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ kind: 'decoration', reset: true })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.error || 'Clear failed');
                return;
            }
            applyAvatarDecoration('');
            renderAvatarDecorations();
            showToast('Decoration cleared');
        }

        async function uploadAvatar(kind) {
            const input = kind === 'decoration' ? document.getElementById('decorUploadInput') : document.getElementById('avatarUploadInput');
            const file = input?.files?.[0];
            if (!file) {
                showToast('Select a file first');
                return;
            }
            const form = new FormData();
            form.append('file', file);
            form.append('kind', kind);
            if (kind === 'picture') {
                const removeBg = document.getElementById('avatarRemoveBgToggle');
                form.append('remove_bg', removeBg && removeBg.checked ? '1' : '0');
            }
            const res = await fetch('/api/user/avatar-upload', { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                showToast(data.error || 'Upload failed');
                return;
            }
            if (kind === 'picture') {
                updateHeaderAvatar(data.picture);
                const profileAvatar = document.getElementById('profileAvatar');
                if (profileAvatar && data.picture) profileAvatar.src = data.picture;
                const profileEl = document.getElementById('profile');
                if (profileEl && data.picture) profileEl.dataset.userPicture = data.picture;
                showToast(data.warning ? `Uploaded (note: ${data.warning})` : 'Profile picture uploaded');
            } else {
                applyAvatarDecoration(data.avatar_decoration);
                renderAvatarDecorations();
                showToast('Decoration uploaded');
            }
        }

        // === PROFILE ADD-ONS ===

        // 1. READING STREAK
        function loadStreak() {
            const streakData = JSON.parse(localStorage.getItem('verseStreak') || '{}');
            const today = new Date().toDateString();
            const lastVisit = streakData.lastVisit;
            let streak = streakData.streak || 0;
            
            // Check if this is a new day
            if (lastVisit !== today) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                
                if (lastVisit === yesterday.toDateString()) {
                    streak++;
                } else if (lastVisit !== today) {
                    streak = 1;
                }
                
                streakData.streak = streak;
                streakData.lastVisit = today;
                localStorage.setItem('verseStreak', JSON.stringify(streakData));
            }
            
            // Update UI
            document.getElementById('streakBadge').textContent = streak + (streak === 1 ? ' DAY' : ' DAYS');
            
            const messages = [
                "Start your streak today! 🔥",
                "Keep it going! You're on fire! 🔥",
                "3 days! Building a habit! 💪",
                "4 days! Consistency is key! 🗝️",
                "5 days! Halfway to a week! ⭐",
                "6 days! Almost there! 🚀",
                "1 WEEK! Incredible dedication! 🏆",
                "Over a week! You're unstoppable! 💯"
            ];
            document.getElementById('streakMessage').textContent = 
                messages[Math.min(streak - 1, messages.length - 1)] || `${streak} days! Amazing discipline! 🙏`;
            
            // Generate calendar (last 14 days)
            const calendar = document.getElementById('streakCalendar');
            calendar.innerHTML = '';
            
            for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayStr = d.toDateString();
                
                const dayEl = document.createElement('div');
                dayEl.className = 'streak-day';
                dayEl.textContent = ['S','M','T','W','T','F','S'][d.getDay()];
                
                if (i === 0) {
                    dayEl.classList.add('today', 'active');
                } else if (i < streak && streakData.lastVisit === today) {
                    dayEl.classList.add('active');
                } else {
                    dayEl.classList.add('inactive');
                }
                
                calendar.appendChild(dayEl);
            }
        }

        // 2. ACHIEVEMENT BADGES
function getSharedVerseCount() {
    return (localStorage.getItem('sharedVerses') || '').split(',').filter(x => x).length;
}

function getStreakCount() {
    const s = JSON.parse(localStorage.getItem('verseStreak') || '{}');
    return s.streak || 0;
}

const ACHIEVEMENTS = [
    // Like Achievements
    { id: 'first_like', icon: '❤️', name: 'First Love', desc: 'Like your first verse', goal: 1, progress: (d) => d.liked, check: (d) => d.liked >= 1 },
    { id: 'liker_50', icon: '💖', name: 'Appreciator', desc: 'Like 50 verses', goal: 50, progress: (d) => d.liked, check: (d) => d.liked >= 50 },
    { id: 'liker_200', icon: '💞', name: 'Enthusiast', desc: 'Like 200 verses', goal: 200, progress: (d) => d.liked, check: (d) => d.liked >= 200 },
    { id: 'liker_500', icon: '💘', name: 'Devoted', desc: 'Like 500 verses', goal: 500, progress: (d) => d.liked, check: (d) => d.liked >= 500 },
    { id: 'liker_1000', icon: '💎', name: 'Beloved', desc: 'Like 1000 verses', goal: 1000, progress: (d) => d.liked, check: (d) => d.liked >= 1000 },

    // Save Achievements
    { id: 'collector', icon: '🔖', name: 'Collector', desc: 'Save 10 verses', goal: 10, progress: (d) => d.saved, check: (d) => d.saved >= 10 },
    { id: 'librarian', icon: '📚', name: 'Librarian', desc: 'Save 50 verses', goal: 50, progress: (d) => d.saved, check: (d) => d.saved >= 50 },
    { id: 'archivist', icon: '🗄️', name: 'Archivist', desc: 'Save 150 verses', goal: 150, progress: (d) => d.saved, check: (d) => d.saved >= 150 },
    { id: 'curator', icon: '🏛️', name: 'Curator', desc: 'Save 300 verses', goal: 300, progress: (d) => d.saved, check: (d) => d.saved >= 300 },
    { id: 'vault_keeper', icon: '🔐', name: 'Vault Keeper', desc: 'Save 500 verses', goal: 500, progress: (d) => d.saved, check: (d) => d.saved >= 500 },

    // Comment Achievements
    { id: 'first_comment', icon: '💬', name: 'Voice', desc: 'Post a comment', goal: 1, progress: (d) => d.comments, check: (d) => d.comments >= 1 },
    { id: 'conversationalist', icon: '🗣️', name: 'Chatty', desc: 'Post 25 comments', goal: 25, progress: (d) => d.comments, check: (d) => d.comments >= 25 },
    { id: 'storyteller', icon: '📜', name: 'Storyteller', desc: 'Post 75 comments', goal: 75, progress: (d) => d.comments, check: (d) => d.comments >= 75 },
    { id: 'oracle', icon: '🔮', name: 'Oracle', desc: 'Post 150 comments', goal: 150, progress: (d) => d.comments, check: (d) => d.comments >= 150 },
    { id: 'scribe', icon: '✍️', name: 'Scribe', desc: 'Post 300 comments', goal: 300, progress: (d) => d.comments, check: (d) => d.comments >= 300 },

    // Reply Achievements
    { id: 'first_reply', icon: '💡', name: 'Responder', desc: 'Post your first reply', goal: 1, progress: (d) => d.replies, check: (d) => d.replies >= 1 },
    { id: 'helper', icon: '🤝', name: 'Helper', desc: 'Post 10 replies', goal: 10, progress: (d) => d.replies, check: (d) => d.replies >= 10 },
    { id: 'encourager', icon: '🌟', name: 'Encourager', desc: 'Post 50 replies', goal: 50, progress: (d) => d.replies, check: (d) => d.replies >= 50 },
    { id: 'counselor', icon: '🕊️', name: 'Counselor', desc: 'Post 150 replies', goal: 150, progress: (d) => d.replies, check: (d) => d.replies >= 150 },

    // View/Explorer Achievements
    { id: 'explorer', icon: '🧭', name: 'Explorer', desc: 'View 100 verses', goal: 100, progress: (d) => d.total_verses, check: (d) => d.total_verses >= 100 },
    { id: 'scholar', icon: '🎓', name: 'Scholar', desc: 'View 500 verses', goal: 500, progress: (d) => d.total_verses, check: (d) => d.total_verses >= 500 },
    { id: 'sage', icon: '🧠', name: 'Sage', desc: 'View 1000 verses', goal: 1000, progress: (d) => d.total_verses, check: (d) => d.total_verses >= 1000 },
    { id: 'master', icon: '👑', name: 'Master', desc: 'View 2500 verses', goal: 2500, progress: (d) => d.total_verses, check: (d) => d.total_verses >= 2500 },
    { id: 'pilgrim', icon: '🥾', name: 'Pilgrim', desc: 'View 5000 verses', goal: 5000, progress: (d) => d.total_verses, check: (d) => d.total_verses >= 5000 },

    // Streak Achievements
    { id: 'three_day_streak', icon: '🔥', name: 'On Fire', desc: '3 day streak', goal: 3, progress: () => getStreakCount(), check: () => getStreakCount() >= 3 },
    { id: 'week_warrior', icon: '🛡️', name: 'Warrior', desc: '7 day streak', goal: 7, progress: () => getStreakCount(), check: () => getStreakCount() >= 7 },
    { id: 'fortnight', icon: '⚔️', name: 'Unstoppable', desc: '14 day streak', goal: 14, progress: () => getStreakCount(), check: () => getStreakCount() >= 14 },
    { id: 'month_master', icon: '🏆', name: 'Month Master', desc: '30 day streak', goal: 30, progress: () => getStreakCount(), check: () => getStreakCount() >= 30 },

    // Share Achievements
    { id: 'share_the_word', icon: '📢', name: 'Evangelist', desc: 'Share 5 verses', goal: 5, progress: () => getSharedVerseCount(), check: () => getSharedVerseCount() >= 5 },
    { id: 'spreader', icon: '🌍', name: 'Spreader', desc: 'Share 20 verses', goal: 20, progress: () => getSharedVerseCount(), check: () => getSharedVerseCount() >= 20 },
    { id: 'missionary', icon: '✨', name: 'Missionary', desc: 'Share 50 verses', goal: 50, progress: () => getSharedVerseCount(), check: () => getSharedVerseCount() >= 50 },

    // Time-based Achievements
    { id: 'night_owl', icon: '🌙', name: 'Night Owl', desc: 'Visit after midnight', goal: 1, progress: () => (new Date().getHours() < 5 ? 1 : 0), check: () => new Date().getHours() < 5 },
    { id: 'early_bird', icon: '🌅', name: 'Early Bird', desc: 'Visit before 6am', goal: 1, progress: () => (new Date().getHours() < 6 && new Date().getHours() >= 4 ? 1 : 0), check: () => new Date().getHours() < 6 && new Date().getHours() >= 4 }
];

function getAchievementProgress(ach, stats, isUnlocked) {
    const goal = Math.max(1, Number(ach.goal || 1));
    let current = 0;
    if (typeof ach.progress === 'function') {
        current = Number(ach.progress(stats)) || 0;
    } else if (typeof ach.check === 'function') {
        current = ach.check(stats) ? goal : 0;
    }
    if (isUnlocked) current = Math.max(current, goal);
    const pct = Math.max(0, Math.min(100, (current / goal) * 100));
    const label = goal > 1 ? `${Math.min(current, goal)}/${goal}` : (isUnlocked ? 'Complete' : 'Locked');
    return { pct, label };
}

function loadAchievements(stats) {
            const unlocked = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
            const grid = document.getElementById('achievementGrid');
            grid.innerHTML = '';
            
            // Check for new unlocks
            ACHIEVEMENTS.forEach(ach => {
                if (!unlocked.includes(ach.id) && ach.check(stats)) {
                    unlocked.push(ach.id);
                    const awarded = awardXp(ACHIEVEMENT_XP, 'achievement', ach.id);
                    if (settings.notifications) {
                        showToast(`🏆 Unlocked: ${ach.name}! +${ACHIEVEMENT_XP} XP`);
                    }
                    if (awarded) AudioSys.playSuccess();
                }
            });
            localStorage.setItem('unlockedAchievements', JSON.stringify(unlocked));
            
            // Create tooltip element
            let tooltip = document.getElementById('achievementTooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'achievementTooltip';
                tooltip.className = 'achievement-tooltip';
                document.body.appendChild(tooltip);
            }
            
            ACHIEVEMENTS.forEach(ach => {
                const isUnlocked = unlocked.includes(ach.id);
                const badge = document.createElement('div');
                badge.className = `achievement-badge ${isUnlocked ? 'unlocked' : 'locked'}`;
                badge.innerHTML = `
                    <div class="achievement-icon">${ach.icon}</div>
                    <div class="achievement-name">${ach.name}</div>
                `;
                
                // Tooltip events
                badge.addEventListener('mouseenter', (e) => {
                    const progress = getAchievementProgress(ach, stats, isUnlocked);
                    tooltip.innerHTML = `
                        <div>${ach.name}: ${ach.desc}${isUnlocked ? ' ?' : ' (Locked)'}</div>
                        <div class="achievement-progress">
                            <div class="achievement-progress-fill" style="width: ${progress.pct}%"></div>
                        </div>
                        <div class="achievement-progress-label">${progress.label}</div>
                    `;
                    const rect = badge.getBoundingClientRect();
                    tooltip.style.left = (rect.left + rect.width/2) + 'px';
                    tooltip.style.top = (rect.top - 36) + 'px';
                    tooltip.style.transform = 'translateX(-50%)';
                    tooltip.classList.add('visible');
                });
                badge.addEventListener('mouseleave', () => {
                    tooltip.classList.remove('visible');
                });
                
                grid.appendChild(badge);
            });
        }

        // 3. FAVORITE BOOKS CHART
        async function loadFavoriteBooks() {
            const container = document.getElementById('favoriteBooksChart');
            container.innerHTML = '';
            
            try {
                // Get liked and saved verses
                const [likedRes, savedRes] = await Promise.all([
                    fetch('/api/liked_verses'),
                    fetch('/api/saved_verses')
                ]);
                const liked = await likedRes.json();
                const saved = await savedRes.json();
                
                // Count by book
                const bookCounts = {};
                [...liked, ...saved].forEach(v => {
                    const book = v.book || v.ref?.split(' ')[0] || 'Unknown';
                    bookCounts[book] = (bookCounts[book] || 0) + 1;
                });
                
                // Sort and get top 5
                const sorted = Object.entries(bookCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                
                if (sorted.length === 0) {
                    container.innerHTML = '<div style="text-align: center; opacity: 0.6; padding: 20px;">Start liking verses to see your favorites!</div>';
                    return;
                }
                
                const maxCount = sorted[0][1];
                const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'];
                
                sorted.forEach(([book, count], i) => {
                    const bar = document.createElement('div');
                    bar.className = 'book-bar';
                    const pct = (count / maxCount) * 100;
                    bar.innerHTML = `
                        <div class="book-name">${book}</div>
                        <div class="book-progress">
                            <div class="book-fill" style="width: ${pct}%; background: linear-gradient(90deg, ${colors[i]}, ${colors[i]}88);">${pct > 30 ? count : ''}</div>
                        </div>
                        <div class="book-count">${count}</div>
                    `;
                    container.appendChild(bar);
                });
            } catch (e) {
                container.innerHTML = '<div style="text-align: center; opacity: 0.6;">Unable to load favorites</div>';
            }
        }

        // 4. VERSE HISTORY
        function loadVerseHistory() {
            const container = document.getElementById('verseHistory');
            const history = JSON.parse(localStorage.getItem('verseHistory') || '[]');
            const today = new Date().toDateString();
            
            // Filter to today's verses only
            const todayVerses = history.filter(v => new Date(v.timestamp).toDateString() === today);
            
            if (todayVerses.length === 0) {
                container.innerHTML = '<div style="text-align: center; opacity: 0.6; padding: 20px;">Verses you see today will appear here!</div>';
                return;
            }
            
            container.innerHTML = '';
            todayVerses.slice().reverse().forEach(v => {
                const item = document.createElement('div');
                item.className = 'verse-history-item';
                const time = new Date(v.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                item.innerHTML = `
                    <div>
                        <div class="verse-history-ref">${v.ref}</div>
                    </div>
                    <div class="verse-history-time">${time}</div>
                `;
                container.appendChild(item);
            });
        }

        // Save verse to history when fetched
        function addToVerseHistory(verse) {
            if (!verse || !verse.ref) return;
            const history = JSON.parse(localStorage.getItem('verseHistory') || '[]');
            history.push({
                ref: verse.ref,
                id: verse.id,
                timestamp: Date.now()
            });
            // Keep last 100
            if (history.length > 100) history.shift();
            localStorage.setItem('verseHistory', JSON.stringify(history));
        }

        // Track shares for achievement
        function trackShare() {
            const shared = (localStorage.getItem('sharedVerses') || '').split(',').filter(x => x);
            shared.push(Date.now());
            localStorage.setItem('sharedVerses', shared.join(','));
            trackDailyAction('share');
        }

        // === DISCOVER TAB FEATURES ===
        
        // Daily Challenge + XP System
        const DAILY_CHALLENGE_TOAST_KEY = 'dailyChallengeCompleteDate';
        const DAILY_CHALLENGE_COMPLETED_AT_PREFIX = 'dailyChallengeCompletedAt:';
        const XP_STORAGE_KEY = 'bibleXpState';
        const ACHIEVEMENT_XP = 750;

        function getXpState() {
            try {
                const saved = JSON.parse(localStorage.getItem(XP_STORAGE_KEY) || '{}');
                return {
                    xp: Number(saved.xp || 0),
                    claimedChallenges: saved.claimedChallenges || {},
                    claimedAchievements: saved.claimedAchievements || {}
                };
            } catch (_) {
                return { xp: 0, claimedChallenges: {}, claimedAchievements: {} };
            }
        }

        function saveXpState(state) {
            localStorage.setItem(XP_STORAGE_KEY, JSON.stringify(state));
        }

        function getLevelFromXp(xp) {
            const level = Math.floor(xp / 1000) + 1;
            return { level };
        }

        function updateXpDisplay() {
            const state = getXpState();
            const xpEl = document.getElementById('profileXp');
            const levelEl = document.getElementById('profileLevel');
            const { level } = getLevelFromXp(state.xp);
            if (xpEl) xpEl.textContent = `${state.xp} XP`;
            if (levelEl) levelEl.textContent = `Level ${level}`;
        }

        function awardXp(amount, type, key) {
            const state = getXpState();
            if (type === 'challenge') {
                if (state.claimedChallenges[key]) return false;
                state.claimedChallenges[key] = true;
            } else if (type === 'achievement') {
                if (state.claimedAchievements[key]) return false;
                state.claimedAchievements[key] = true;
            }
            state.xp += Math.max(0, Number(amount || 0));
            saveXpState(state);
            updateXpDisplay();
            return true;
        }

        function trackDailyAction(action, verseId) {
            // Keep signature for existing call sites; server tracks action progress.
            updateChallengeProgress();
        }

        async function initDailyChallenge() {
            const challengeEl = document.getElementById('dailyChallenge');
            if (!challengeEl) return;
            challengeEl.style.display = 'block';
            await updateChallengeProgress();
            if (challengeRefreshInterval) clearInterval(challengeRefreshInterval);
            challengeRefreshInterval = setInterval(updateChallengeProgress, 60000);
        }

        async function updateChallengeProgress() {
            try {
                const res = await fetch('/api/daily_challenge');
                const data = await res.json();
                if (!res.ok || data.error) return;

                const challengeEl = document.getElementById('dailyChallenge');
                if (data.hide_at) {
                    const hideAt = new Date(data.hide_at);
                    if (!Number.isNaN(hideAt.getTime()) && Date.now() >= hideAt.getTime()) {
                        if (challengeEl) challengeEl.style.display = 'none';
                        return;
                    }
                }
                if (challengeEl) challengeEl.style.display = 'block';

                const xpReward = Number(data.xp_reward || 0);
                const challengeText = data.text || 'Save 2 verses to your library';
                document.getElementById('challengeText').textContent = xpReward
                    ? `${challengeText} • ${xpReward} XP`
                    : challengeText;
                document.getElementById('challengeGoal').textContent = data.goal || 2;
                const progress = Math.max(0, Number(data.progress || 0));
                const goal = Math.max(1, Number(data.goal || 2));
                const pct = Math.min(100, (progress / goal) * 100);

                const fillEl = document.getElementById('challengeFill');
                const progressEl = document.getElementById('challengeProgress');
                if (fillEl) fillEl.style.width = pct + '%';
                if (progressEl) progressEl.textContent = String(Math.min(progress, goal));

                const progressBarEl = document.getElementById('challengeProgressBar');
                const progressTextEl = document.getElementById('challengeProgressText');
                const cooldownEl = document.getElementById('challengeCooldown');

                if (data.completed) {
                    document.getElementById('challengeText').textContent = 'Challenge complete!';
                    if (challengeEl) challengeEl.classList.add('complete');
                    const periodKey = String(data.challenge_id || data.date || new Date().toISOString().slice(0, 13));
                    const completedKey = `${DAILY_CHALLENGE_COMPLETED_AT_PREFIX}${periodKey}`;
                    let completedAt = Number(localStorage.getItem(completedKey) || 0);
                    if (!completedAt) {
                        completedAt = Date.now();
                        localStorage.setItem(completedKey, String(completedAt));
                    }
                    const twoHoursMs = 2 * 60 * 60 * 1000;
                    if (Date.now() - completedAt > twoHoursMs) {
                        if (challengeEl) challengeEl.style.display = 'none';
                        return;
                    }
                    if (localStorage.getItem(DAILY_CHALLENGE_TOAST_KEY) !== periodKey) {
                        localStorage.setItem(DAILY_CHALLENGE_TOAST_KEY, periodKey);
                        const awarded = awardXp(xpReward || 100, 'challenge', periodKey);
                        if (awarded) {
                            showToast(`🎯 Challenge Complete! +${xpReward || 100} XP`);
                            AudioSys.playSuccess();
                        }
                    }
                    if (progressBarEl) progressBarEl.style.display = 'none';
                    if (progressTextEl) progressTextEl.style.display = 'none';
                    if (cooldownEl) {
                        cooldownEl.style.display = 'block';
                        const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
                        const updateCooldown = () => {
                            if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
                                cooldownEl.textContent = 'Next challenge starting soon...';
                                return;
                            }
                            const now = new Date();
                            const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
                            const totalMins = Math.ceil(remainingMs / 60000);
                            const hours = Math.floor(totalMins / 60);
                            const mins = totalMins % 60;
                            if (remainingMs > 0) {
                                cooldownEl.textContent = hours > 0
                                    ? `Next challenge in ${hours}h ${mins}m`
                                    : `Next challenge in ${mins}m`;
                                return;
                            }
                            cooldownEl.textContent = 'Next challenge starting soon...';
                            if (challengeCountdownInterval) {
                                clearInterval(challengeCountdownInterval);
                                challengeCountdownInterval = null;
                            }
                            updateChallengeProgress();
                        };
                        updateCooldown();
                        if (challengeCountdownInterval) clearInterval(challengeCountdownInterval);
                        challengeCountdownInterval = setInterval(updateCooldown, 1000);
                    }
                } else {
                    if (challengeEl) challengeEl.classList.remove('complete');
                    if (progressBarEl) progressBarEl.style.display = 'block';
                    if (progressTextEl) progressTextEl.style.display = 'block';
                    if (cooldownEl) cooldownEl.style.display = 'none';
                    if (challengeCountdownInterval) {
                        clearInterval(challengeCountdownInterval);
                        challengeCountdownInterval = null;
                    }
                }
            } catch (_) {
                // Keep UI stable if endpoint temporarily fails.
            }
        }

        async function loadBiblePicks(popularOnly = false) {
            const selectEl = document.getElementById('biblePickSelect');
            const metaEl = document.getElementById('biblePickMeta');
            if (!selectEl || !metaEl) return;

            metaEl.textContent = 'OpenAI is picking popular Bible selections...';

            try {
                const url = '/api/bible/picks';
                const res = await fetch(url);
                const data = await res.json();
                if (!res.ok || data.error) {
                    metaEl.textContent = 'Unable to load selections.';
                    return;
                }

                const picks = Array.isArray(data.picks) ? data.picks : [];
                renderBiblePicks(picks);
                const total = biblePickState.picks.length;
                metaEl.textContent = total
                    ? `${total} selections ready.`
                    : 'No selections found.';
            } catch (_) {
                metaEl.textContent = 'Network error while loading selections.';
            }
        }

        function renderBiblePicks(picks) {
            const selectEl = document.getElementById('biblePickSelect');
            if (!selectEl) return;

            const sourcePicks = Array.isArray(picks) ? picks : [];
            const books = Array.isArray(bibleReaderState.books) ? bibleReaderState.books : [];
            const combined = [];
            const used = new Set();

            if (books.length) {
                books.forEach(book => {
                    const bookName = String(book.name || book.id || '').trim();
                    if (!bookName) return;
                    let found = null;
                    for (let i = 0; i < sourcePicks.length; i++) {
                        if (used.has(i)) continue;
                        const ref = String(sourcePicks[i].reference || sourcePicks[i].ref || '').trim();
                        const parsed = parsePickReference(ref);
                        const pickBook = parsed ? parsed.book : ref.split(' ')[0];
                        if (bookMatchesName(pickBook, bookName)) {
                            found = sourcePicks[i];
                            used.add(i);
                            break;
                        }
                    }
                    if (found) {
                        combined.push(found);
                    } else {
                        combined.push({ reference: `${bookName} 1`, title: 'Chapter 1', reason: 'Start here' });
                    }
                });
            } else {
                combined.push(...sourcePicks);
            }

            biblePickState.picks = combined;
            selectEl.innerHTML = '<option value=\"\">Select a popular reading...</option>';

            biblePickState.picks.forEach((p, idx) => {
                const ref = (p.reference || p.ref || '').trim();
                if (!ref) return;
                const title = (p.title || '').trim();
                const label = title ? `${ref} — ${title}` : ref;
                const opt = document.createElement('option');
                opt.value = String(idx);
                opt.textContent = label;
                selectEl.appendChild(opt);
            });
        }

        function onBiblePickSelect() {
            const selectEl = document.getElementById('biblePickSelect');
            if (!selectEl) return;
            const idx = parseInt(selectEl.value, 10);
            if (!Number.isFinite(idx) || !biblePickState.picks[idx]) {
                return;
            }

            const pick = biblePickState.picks[idx];
            applyPickToReader(pick);
        }

        function parsePickReference(ref) {
            if (!ref) return null;
            const match = ref.match(/^(.+?)\\s+(\\d+)(?:\\s*[-–]\\s*(\\d+))?$/);
            if (!match) return null;
            return {
                book: match[1].trim(),
                chapter: parseInt(match[2], 10) || 1
            };
        }

        function normalizeBookName(name) {
            return String(name || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        }

        function bookMatchesName(a, b) {
            const left = normalizeBookName(a);
            const right = normalizeBookName(b);
            if (!left || !right) return false;
            if (left === right) return true;
            if (left.endsWith('s') && left.slice(0, -1) === right) return true;
            if (right.endsWith('s') && right.slice(0, -1) === left) return true;
            return left.includes(right) || right.includes(left);
        }

        function applyPickToReader(pick) {
            if (!pick) return;
            const ref = (pick.reference || pick.ref || '').trim();
            const parsed = parsePickReference(ref);
            if (!parsed) return;

            const selectEl = document.getElementById('readerBookSelect');
            const chapterEl = document.getElementById('readerChapterInput');
            const metaEl = document.getElementById('readerMeta');
            if (chapterEl) {
                chapterEl.value = String(parsed.chapter || 1);
            }
            if (selectEl) {
                const bookLower = parsed.book.toLowerCase();
                const match = bibleReaderState.books.find(b => {
                    const name = String(b.name || '').toLowerCase();
                    const id = String(b.id || '').toLowerCase();
                    return (
                        name === bookLower ||
                        id === bookLower ||
                        name.includes(bookLower) ||
                        bookLower.includes(name)
                    );
                });
                if (match) {
                    selectEl.value = match.name || match.id;
                } else {
                    let opt = Array.from(selectEl.options).find(o => o.value === parsed.book);
                    if (!opt) {
                        opt = document.createElement('option');
                        opt.value = parsed.book;
                        opt.textContent = parsed.book;
                        selectEl.prepend(opt);
                    }
                    selectEl.value = parsed.book;
                }
            }

            loadBibleChapter();
            if (metaEl) metaEl.textContent = `Selected: ${ref}`;
        }

        function buildReaderPages(verses) {
            const pages = [];
            if (!Array.isArray(verses) || !verses.length) return pages;
            const maxChars = 1400;
            const maxVerses = 12;
            let current = [];
            let charCount = 0;
            verses.forEach(v => {
                const text = String(v.text || '');
                const nextChars = charCount + text.length;
                if (current.length >= maxVerses || (nextChars > maxChars && current.length)) {
                    pages.push(current);
                    current = [];
                    charCount = 0;
                }
                current.push(v);
                charCount += text.length;
            });
            if (current.length) pages.push(current);
            return pages;
        }

        function renderReaderPage() {
            const contentEl = document.getElementById('readerContent');
            const fsContentEl = document.getElementById('readerFullscreenContent');
            const indicatorEl = document.getElementById('readerPageIndicator');
            const fsIndicatorEl = document.getElementById('readerFullscreenPageIndicator');
            const fsNextPageBtn = document.getElementById('readerFullscreenNextPageBtn');
            const fsNextChapterBtn = document.getElementById('readerFullscreenNextChapterBtn');
            const total = readerPages.length;
            const idx = Math.min(readerPageIndex, Math.max(0, total - 1));
            readerPageIndex = idx;
            const page = total ? readerPages[idx] : [];
            const html = page.length
                ? page.map(v => `<div class="reader-verse"><span>${v.verse}</span>${escapeHtml(v.text || '')}</div>`).join('')
                : `<div style="opacity: 0.7;">No verses found.</div>`;
            if (contentEl) contentEl.innerHTML = html;
            if (fsContentEl) fsContentEl.innerHTML = html;
            const label = total ? `Page ${idx + 1}/${total}` : 'Page 0/0';
            if (indicatorEl) indicatorEl.textContent = label;
            if (fsIndicatorEl) fsIndicatorEl.textContent = label;
            if (fsNextPageBtn && fsNextChapterBtn) {
                const isFullscreen = document.body.classList.contains('reader-fullscreen-open');
                if (!isFullscreen) {
                    fsNextChapterBtn.style.display = 'none';
                    fsNextPageBtn.style.display = '';
                } else if (total && idx >= total - 1) {
                    fsNextPageBtn.style.display = 'none';
                    fsNextChapterBtn.style.display = 'inline-flex';
                } else {
                    fsNextPageBtn.style.display = 'inline-flex';
                    fsNextChapterBtn.style.display = 'none';
                }
            }
        }

        function prevReaderPage() {
            if (readerPageIndex <= 0) return;
            readerPageIndex -= 1;
            renderReaderPage();
            AudioSys.playPage();
        }

        function nextReaderPage() {
            if (readerPageIndex >= readerPages.length - 1) return;
            readerPageIndex += 1;
            renderReaderPage();
            AudioSys.playPage();
        }

        function toggleReaderFullscreen() {
            const overlay = document.getElementById('readerFullscreen');
            if (!overlay) return;
            const active = overlay.classList.toggle('active');
            document.body.classList.toggle('reader-fullscreen-open', active);
            AudioSys.playModal();
            const chapter = document.getElementById('readerCurrentChapter');
            const fsChapter = document.getElementById('readerFullscreenChapter');
            if (fsChapter && chapter) fsChapter.textContent = chapter.textContent;
            renderReaderPage();
        }

        function closeReaderFullscreen(e) {
            if (!e || e.target.id !== 'readerFullscreen') return;
            toggleReaderFullscreen();
        }


        async function loadBibleBooks() {
            const selectEl = document.getElementById('readerBookSelect');
            const metaEl = document.getElementById('readerMeta');
            if (!selectEl) return;

            if (metaEl) metaEl.textContent = 'Loading Bible books...';
            try {
                const res = await fetch('/api/bible/books');
                const data = await res.json();
                if (!res.ok || data.error) {
                    if (metaEl) metaEl.textContent = 'Unable to load Bible books.';
                    return;
                }

                bibleReaderState.books = Array.isArray(data.books) ? data.books : [];
                bibleReaderState.translation = data.translation_id || data.translation || 'web';
                selectEl.innerHTML = '';
                bibleReaderState.books.forEach(book => {
                    const opt = document.createElement('option');
                    opt.value = book.name || book.id;
                    opt.textContent = book.name || book.id;
                    selectEl.appendChild(opt);
                });
                if (selectEl.options.length) {
                    selectEl.selectedIndex = 0;
                }
                if (metaEl) metaEl.textContent = `Loaded ${selectEl.options.length} books.`;
                if (biblePickState.picks.length) {
                    renderBiblePicks(biblePickState.picks);
                }
            } catch (_) {
                if (metaEl) metaEl.textContent = 'Network error while loading books.';
            }
        }

        async function loadBibleChapter() {
            const selectEl = document.getElementById('readerBookSelect');
            const chapterEl = document.getElementById('readerChapterInput');
            const metaEl = document.getElementById('readerMeta');
            const contentEl = document.getElementById('readerContent');
            const labelEl = document.getElementById('readerCurrentChapter');
            if (!selectEl || !chapterEl || !contentEl) return;

            const book = selectEl.value;
            let chapter = parseInt(chapterEl.value || '1', 10);
            if (!Number.isFinite(chapter) || chapter < 1) chapter = 1;
            chapterEl.value = String(chapter);

            if (metaEl) metaEl.textContent = `Loading ${book} ${chapter}...`;
            try {
                const translation = bibleReaderState.translation || 'web';
                const url = `/api/bible/chapter?book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(chapter)}&translation=${encodeURIComponent(translation)}`;
                const res = await fetch(url);
                const data = await res.json();
                if (!res.ok || data.error) {
                    contentEl.innerHTML = `<div style="opacity: 0.7;">Unable to load chapter.</div>`;
                    if (metaEl) metaEl.textContent = data.error || 'Unable to load chapter.';
                    readerPages = [];
                    readerPageIndex = 0;
                    renderReaderPage();
                    return;
                }

                const reference = data.reference || `${book} ${chapter}`;
                if (labelEl) labelEl.textContent = `Chapter: ${reference}`;
                const fsLabel = document.getElementById('readerFullscreenChapter');
                if (fsLabel) fsLabel.textContent = `Chapter: ${reference}`;
                readerPages = buildReaderPages(Array.isArray(data.verses) ? data.verses : []);
                readerPageIndex = 0;
                renderReaderPage();
                if (metaEl) {
                    const translationLabel = data.translation || data.translation_id || translation;
                    metaEl.textContent = `${translationLabel} • ${data.verses ? data.verses.length : 0} verses`;
                }
                contentEl.scrollTop = 0;
            } catch (_) {
                contentEl.innerHTML = `<div style="opacity: 0.7;">Network error.</div>`;
                if (metaEl) metaEl.textContent = 'Network error while loading chapter.';
                readerPages = [];
                readerPageIndex = 0;
                renderReaderPage();
            }
        }

        function renderBibleChapter(data) {
            const verses = Array.isArray(data.verses) ? data.verses : [];
            readerPages = buildReaderPages(verses);
            readerPageIndex = 0;
            renderReaderPage();
        }

        function prevBibleChapter() {
            const chapterEl = document.getElementById('readerChapterInput');
            if (!chapterEl) return;
            let chapter = parseInt(chapterEl.value || '1', 10);
            if (!Number.isFinite(chapter) || chapter <= 1) return;
            chapter -= 1;
            chapterEl.value = String(chapter);
            loadBibleChapter();
        }

        function nextBibleChapter() {
            const chapterEl = document.getElementById('readerChapterInput');
            if (!chapterEl) return;
            let chapter = parseInt(chapterEl.value || '1', 10);
            if (!Number.isFinite(chapter)) chapter = 1;
            chapter += 1;
            chapterEl.value = String(chapter);
            loadBibleChapter();
        }

        // Quick Filters for Discover
        let currentFilter = 'all';
        function filterDiscover(type) {
            currentFilter = type;
            document.querySelectorAll('.quick-filters .filter-chip').forEach(chip => {
                chip.classList.remove('active');
                if (chip.textContent.toLowerCase().includes(type === 'all' ? 'all' : type)) {
                    chip.classList.add('active');
                }
            });
            showToast(`Filtered: ${type.charAt(0).toUpperCase() + type.slice(1)}`);
        }

        // Verse of the Day
        function loadVerseOfDay() {
            const verses = [
                { ref: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
                { ref: 'Philippians 4:13', text: 'I can do all things through Christ which strengtheneth me.' },
                { ref: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
                { ref: 'Romans 8:28', text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
                { ref: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' },
                { ref: 'Isaiah 41:10', text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.' },
                { ref: 'Matthew 11:28', text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.' }
            ];
            const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
            const verse = verses[dayOfYear % verses.length];
            
            document.getElementById('verseOfDayContent').textContent = `"${verse.text}"`;
            document.getElementById('verseOfDayRef').textContent = `— ${verse.ref}`;
            document.getElementById('vodDate').textContent = new Date().toLocaleDateString();
        }

        // === RECOMMENDATIONS TAB FEATURES ===

        let currentRecFilter = 'all';
        function filterRecs(type) {
            currentRecFilter = type;
            document.querySelectorAll('.rec-category').forEach(cat => cat.classList.remove('active'));
            event.target.classList.add('active');
            showToast(`Recommendations: ${type.charAt(0).toUpperCase() + type.slice(1)}`);
        }

        async function getMoodVerse(mood) {
            try {
                const excludeIds = getRecentRecIds(20);
                const url = excludeIds.length
                    ? `/api/mood/${encodeURIComponent(mood)}?exclude=${excludeIds.join(',')}`
                    : `/api/mood/${encodeURIComponent(mood)}`;
                const res = await fetch(url, { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok || data.error) {
                    throw new Error(data.error || 'Failed to load verse');
                }
                const verse = { ref: data.ref, text: data.text, id: data.id };
                
                addToRecHistory({ ...verse, reason: `For when you're feeling ${mood}` });
                
                const recList = document.getElementById('recList');
                recList.innerHTML = `
                    <div class="rec-card" style="animation: slideIn 0.3s ease;">
                        <div class="rec-reason">💭 ${mood.charAt(0).toUpperCase() + mood.slice(1)}</div>
                        <div style="font-style: italic; margin-bottom: 8px;">${verse.text}</div>
                        <div style="font-weight: 700; color: var(--primary);">${verse.ref}</div>
                    </div>
                `;
                
                showToast(`Verses for when you're feeling ${mood}`);
            } catch (e) {
                showToast('Unable to fetch a new verse. Try again.');
            }
        }

        function addToRecHistory(verse) {
            const history = JSON.parse(localStorage.getItem('recHistory') || '[]')
                .filter(item => item && item.id !== verse.id);
            history.unshift({ ...verse, timestamp: Date.now() });
            if (history.length > 20) history.pop();
            localStorage.setItem('recHistory', JSON.stringify(history));
            renderRecHistory();
        }

        function getRecentRecIds(limit = 15) {
            const history = JSON.parse(localStorage.getItem('recHistory') || '[]');
            const ids = [];
            history.forEach(item => {
                if (item && item.id && !ids.includes(item.id)) ids.push(item.id);
            });
            return ids.slice(0, limit);
        }

        function renderRecHistory() {
            const history = JSON.parse(localStorage.getItem('recHistory') || '[]');
            const container = document.getElementById('recHistoryList');
            
            if (history.length === 0) {
                container.innerHTML = '<div style="opacity: 0.6; text-align: center; padding: 20px;">Your recommendations will appear here</div>';
                return;
            }
            
            container.innerHTML = history.map(v => `
                <div class="rec-card" style="opacity: 0.8;">
                    <div class="rec-reason">${v.reason || 'Recommended'}</div>
                    <div style="font-size: 13px; font-style: italic; margin-bottom: 4px;">${v.text.substring(0, 80)}...</div>
                    <div style="font-size: 12px; font-weight: 600; color: var(--primary);">${v.ref}</div>
                </div>
            `).join('');
        }

        // === LIBRARY TAB FEATURES ===

        let currentLibraryTab = 'all';
        function switchLibraryTab(tab) {
            currentLibraryTab = tab;
            document.querySelectorAll('.library-tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            
            document.getElementById('collectionsView').style.display = tab === 'collections' ? 'block' : 'none';
            document.getElementById('favoritesDropZone').style.display = tab === 'favorites' ? 'block' : 'none';
            document.getElementById('versesListCard').style.display = 'block';
            document.getElementById('librarySearch').style.display = tab === 'collections' ? 'none' : 'block';
            
            if (tab === 'all') loadLibrary();
        }

        function showCollection(type) {
            showToast(`Showing ${type} collection`);
            switchLibraryTab('all');
        }

        function createNewCollection() {
            const name = prompt('Enter collection name:');
            if (name) {
                showToast(`Created collection: ${name}`);
            }
        }

        function searchLibrary() {
            const query = document.getElementById('librarySearch').value.toLowerCase();
            const cards = document.querySelectorAll('.verse-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? 'block' : 'none';
            });
        }

        function sortLibrary() {
            const sort = document.getElementById('sortSelect').value;
            showToast(`Sorted by: ${sort}`);
            loadLibrary();
        }

        // === COMMENTS TAB FEATURES ===

        function addEmoji(emoji) {
            const input = document.getElementById('commentInput');
            input.value += emoji;
            input.focus();
        }

        function handleCommentKey(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                postComment();
            }
        }

        function handleCommunityKey(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                postCommunityMessage();
            }
        }

        function handleDeepLinkParams() {
            try {
                const params = new URLSearchParams(window.location.search);
                const dmUser = parseInt(params.get('dmUser') || '0', 10);
                if (dmUser) {
                    switchTab('comments');
                    switchCommentsView('dm');
                    openDmThread(dmUser);
                    params.delete('dmUser');
                    const next = params.toString();
                    const newUrl = window.location.pathname + (next ? `?${next}` : '') + window.location.hash;
                    window.history.replaceState({}, '', newUrl);
                }
            } catch (_) {}
        }

        function isCommentsInputActive() {
            if (replyActiveKey) return true;
            const active = document.activeElement;
            if (!active) return false;
            const id = active.id || '';
            if (id === 'commentInput' || id === 'communityInput') return true;
            if (id === 'dmInput' || id === 'dmSearchInput') return true;
            if (id.startsWith('reply-input-')) return true;
            return active.closest && active.closest('.reply-input-area');
        }

        let currentCommunityFilter = 'all';
        function filterCommunity(tag) {
            currentCommunityFilter = tag;
            showToast(`Filtered by: #${tag}`);
            loadCommunityMessages();
        }

        function renderCommentWithReactions(comment) {
            const reactions = comment.reactions || { '❤️': 0, '🙏': 0, '✝️': 0, '💪': 0 };
            return `
                <div class="comment" data-comment-id="${comment.id}">
                    <div class="comment-header">
                        <strong>${escapeHtml(comment.google_name || 'Anonymous')}</strong>
                        <span>${formatLocalTimestamp(comment.timestamp, {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div class="comment-text">${escapeHtml(comment.text)}</div>
                    <div class="reaction-bar">
                        ${Object.entries(reactions).map(([emoji, count]) => `
                            <button class="reaction-btn ${count > 0 ? 'active' : ''}" onclick="addReaction(${comment.id}, '${emoji}', undefined, this)">
                                ${emoji} ${count > 0 ? count : ''}
                            </button>
                        `).join('')}
                        <button class="reply-btn" onclick="showReplyBox(${comment.id})">Reply</button>
                    </div>
                    <div class="comment-replies" id="replies-${comment.id}"></div>
                    <div class="reply-input-area" id="reply-box-${comment.id}" style="display: none;">
                            <input type="text" class="comment-input" name="reply_text" autocomplete="off" data-form-type="other" placeholder="Write a reply..." id="reply-input-${comment.id}">
                        <button class="send-btn" onclick="postReply(${comment.id})">➤</button>
                    </div>
                </div>
            `;
        }

        function animateVerseReveal() {
            const el = document.querySelector('.verse-container');
            if (!el) return;
            el.classList.remove('verse-reveal');
            void el.offsetWidth;
            el.classList.add('verse-reveal');
        }

        function animateActionFeedback(iconId, burstEmoji = '') {
            const icon = document.getElementById(iconId);
            const btn = icon ? icon.closest('.action-btn') : null;
            if (icon) {
                icon.classList.remove('spark');
                void icon.offsetWidth;
                icon.classList.add('spark');
                setTimeout(() => icon.classList.remove('spark'), 520);
            }
            if (btn) {
                btn.classList.add('pop-success');
                setTimeout(() => btn.classList.remove('pop-success'), 420);
                if (burstEmoji) spawnReactionBurst(btn, burstEmoji, 7);
            }
        }

        function spawnReactionBurst(targetEl, emoji = '✨', count = 6) {
            if (!targetEl || document.body.classList.contains('no-animations')) return;
            const rect = targetEl.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            for (let i = 0; i < count; i++) {
                const chip = document.createElement('span');
                chip.className = 'reaction-burst';
                chip.textContent = emoji;
                chip.style.left = `${cx + (Math.random() * 22 - 11)}px`;
                chip.style.top = `${cy + (Math.random() * 8 - 4)}px`;
                chip.style.setProperty('--dx', `${(Math.random() * 30 - 15).toFixed(1)}px`);
                document.body.appendChild(chip);
                setTimeout(() => chip.remove(), 700);
            }
        }

        async function addReaction(commentId, type, emoji, btnEl = null) {
            try {
                if (emoji === undefined) {
                    emoji = type;
                    type = 'comment';
                }
                const normalizedReaction = ({ '❤️': 'heart', '🙏': 'pray', '✝️': 'cross' }[emoji] || emoji || '').toLowerCase();
                const itemType = type === 'community' ? 'community' : 'comment';
                const res = await fetch('/api/comments/reaction', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ item_id: commentId, item_type: itemType, reaction: normalizedReaction })
                });
                const data = await res.json();
                if (!res.ok || data.error) {
                    showToast(data.error || 'Reaction failed');
                    return;
                }
                const burstMap = { heart: '❤️', pray: '🙏', cross: '✝️' };
                const burstEmoji = burstMap[normalizedReaction] || '✨';
                spawnReactionBurst(btnEl || document.body, burstEmoji, 5);
                if (itemType === 'community') {
                    loadCommunityMessages();
                } else {
                    loadComments();
                }
            } catch (e) {
                showToast('Reaction failed');
            }
        }

        function showReplyBox(commentId, type = 'comment') {
            const box = document.getElementById(`reply-box-${type}-${commentId}`) || document.getElementById(`reply-box-${commentId}`);
            if (!box) return;
            const key = `${type}-${commentId}`;
            const isOpen = openReplyKey === key;
            openReplyKey = isOpen ? null : key;
            replyActiveKey = openReplyKey;
            if (type === 'comment') {
                commentVerseLocked = true;
            }
            document.querySelectorAll('.reply-input-area').forEach(el => {
                el.style.display = 'none';
            });
            if (!isOpen) {
                box.style.display = 'flex';
                const input = document.getElementById(`reply-input-${type}-${commentId}`) || document.getElementById(`reply-input-${commentId}`);
                if (input) {
                    if (replyDrafts[key]) input.value = replyDrafts[key];
                    input.focus();
                }
            }
        }

        async function postReply(commentId, type = 'comment') {
            const input = document.getElementById(`reply-input-${type}-${commentId}`) || document.getElementById(`reply-input-${commentId}`);
            if (!input) return;
            if (!input.value.trim()) return;
            if (commentRestriction.restricted) {
                showToast(commentRestriction.reason ? `Chat disabled: ${commentRestriction.reason}` : 'Chat disabled');
                return;
            }
            try {
                const parentType = type === 'community' ? 'community' : 'comment';
                const res = await fetch('/api/comments/replies', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        parent_type: parentType,
                        parent_id: commentId,
                        text: input.value.trim()
                    })
                });
                const data = await res.json();
                if (!res.ok || data.error) {
                    showToast(data.message || data.error || 'Reply failed');
                    return;
                }
                input.value = '';
                const draftKey = `${type}-${commentId}`;
                delete replyDrafts[draftKey];
                openReplyKey = null;
                replyActiveKey = null;
                if (parentType === 'community') loadCommunityMessages(true);
                else loadComments(true);
                loadProfileStats();
                showToast('Reply posted!');
            } catch (e) {
                showToast('Reply failed');
            }
        }

        async function updateRestrictionUI() {
            try {
                const res = await fetch('/api/restriction_status');
                if (!res.ok) return;
                const data = await res.json();
                commentRestriction = {
                    restricted: !!data.restricted,
                    reason: data.reason || '',
                    expires_at: data.expires_at || null
                };
                applyRestrictionState();
            } catch (_) {}
        }

        function applyRestrictionState() {
            const banner = document.getElementById('commentRestrictionBanner');
            const commBanner = document.getElementById('communityRestrictionBanner');
            const commentInput = document.getElementById('commentInput');
            const commentSend = document.getElementById('commentSendBtn');
            const commentArea = document.getElementById('commentInputArea');
            const communityInput = document.getElementById('communityInput');
            const communitySend = document.getElementById('communitySendBtn');
            const communityArea = document.getElementById('communityInputArea');
            const dmInput = document.getElementById('dmInput');

            const restricted = !!commentRestriction.restricted;
            const reason = (commentRestriction.reason || 'policy').trim();
            const expires = commentRestriction.expires_at ? new Date(commentRestriction.expires_at) : null;
            const untilText = expires && !Number.isNaN(expires.getTime())
                ? ` until ${expires.toLocaleString()}`
                : '';
            const message = `Chat disabled: ${reason}${untilText}.`;

            if (banner) {
                banner.textContent = restricted ? message : '';
                banner.style.display = restricted ? 'block' : 'none';
            }
            if (commBanner) {
                commBanner.textContent = restricted ? message : '';
                commBanner.style.display = restricted ? 'block' : 'none';
            }
            if (commentInput) commentInput.disabled = restricted;
            if (commentSend) commentSend.disabled = restricted;
            if (commentArea) commentArea.classList.toggle('is-disabled', restricted);
            if (communityInput) communityInput.disabled = restricted;
            if (communitySend) communitySend.disabled = restricted;
            if (communityArea) communityArea.classList.toggle('is-disabled', restricted);
            if (dmInput) dmInput.disabled = restricted;

            document.querySelectorAll('.reply-btn').forEach(btn => { btn.disabled = restricted; });
            document.querySelectorAll('.reply-input-area .comment-input').forEach(inp => { inp.disabled = restricted; });
            document.querySelectorAll('.reply-input-area .send-btn').forEach(btn => { btn.disabled = restricted; });
        }

        function switchCommentsView(view) {
            currentCommentsView = view === 'community' ? 'community' : (view === 'dm' ? 'dm' : 'verse');
            openReplyKey = null;
            replyActiveKey = null;
            const verseSection = document.getElementById('verseCommentsSection');
            const communitySection = document.getElementById('communityCommentsSection');
            const dmSection = document.getElementById('dmCommentsSection');
            const verseBtn = document.getElementById('commentsViewVerseBtn');
            const communityBtn = document.getElementById('commentsViewCommunityBtn');
            const dmBtn = document.getElementById('commentsViewDmBtn');
            if (verseSection) verseSection.style.display = currentCommentsView === 'verse' ? 'block' : 'none';
            if (communitySection) communitySection.style.display = currentCommentsView === 'community' ? 'block' : 'none';
            if (dmSection) dmSection.style.display = currentCommentsView === 'dm' ? 'block' : 'none';
            if (verseBtn) verseBtn.classList.toggle('active', currentCommentsView === 'verse');
            if (communityBtn) communityBtn.classList.toggle('active', currentCommentsView === 'community');
            if (dmBtn) dmBtn.classList.toggle('active', currentCommentsView === 'dm');
            if (currentCommentsView === 'community') {
                loadCommunityMessages();
            } else if (currentCommentsView === 'dm') {
                loadDmThreads(true);
                loadDmMessages(true);
            } else {
                if (!activeCommentVerseId && currentVerse) {
                    setActiveCommentVerse(currentVerse);
                }
                loadComments();
            }
            applyRestrictionState();
        }

        function setAboutSlide(index) {
            const track = document.getElementById('aboutSliderTrack');
            if (!track || aboutIsSliding) return;
            const total = getAboutVideos().length || 1;
            aboutIsSliding = true;
            aboutSlideIndex = ((index % total) + total) % total;
            updateAboutDots();
            track.style.transform = `translateX(-${aboutSlideIndex * 100}%)`;
            updateAboutProgressBars();
            updateAboutNowPlaying();
            if (aboutSyncTimer) clearTimeout(aboutSyncTimer);
            aboutSyncTimer = setTimeout(() => {
                syncAboutVideoPlayback();
            }, 180);
            setTimeout(() => { aboutIsSliding = false; }, 360);
        }

        function aboutPrev() {
            setAboutSlide(aboutSlideIndex - 1);
        }

        function aboutNext() {
            setAboutSlide(aboutSlideIndex + 1);
        }

        function syncAboutVideoPlayback() {
            const videos = getAboutVideos();
            if (currentTab !== 'about') {
                videos.forEach(v => {
                    v.muted = true;
                    if (!v.paused) v.pause();
                });
                updateAboutPausedOverlay();
                return;
            }
            videos.forEach((v, i) => {
                if (i === aboutSlideIndex) {
                    v.muted = false;
                    v.volume = aboutVolume;
                    if (v.readyState < 2) v.load();
                    const p = v.play();
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                } else {
                    v.muted = true;
                    if (!v.paused) v.pause();
                }
            });
            updateAboutPausedOverlay();
        }

        function pauseAboutPlayback() {
            getAboutVideos().forEach(v => {
                v.muted = true;
                if (!v.paused) v.pause();
            });
            updateAboutPausedOverlay();
            updateAboutProgressBars();
            updateAboutNowPlaying();
        }

        function toggleAboutPlayback() {
            if (aboutTouchMoved) {
                aboutTouchMoved = false;
                return;
            }
            const activeVideo = getAboutVideos()[aboutSlideIndex];
            if (!activeVideo) return;
            if (activeVideo.paused) {
                activeVideo.muted = false;
                activeVideo.volume = aboutVolume;
                const p = activeVideo.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } else {
                activeVideo.pause();
            }
            updateAboutPausedOverlay();
            updateAboutNowPlaying();
        }

        function updateAboutPausedOverlay() {
            const videos = getAboutVideos();
            videos.forEach((video, idx) => {
                const frame = document.getElementById(`aboutFrame${idx}`);
                if (frame) frame.classList.toggle('paused', !!video.paused);
            });
            updateAboutNowPlaying();
        }

        function initAboutVideoEvents() {
            const videos = getAboutVideos();
            aboutVideoErrorCount = 0;
            videos.forEach((v, idx) => {
                v.volume = aboutVolume;
                if (currentTab !== 'about') v.muted = true;
                v.addEventListener('play', updateAboutPausedOverlay);
                v.addEventListener('pause', updateAboutPausedOverlay);
                v.addEventListener('ended', updateAboutPausedOverlay);
                v.addEventListener('timeupdate', updateAboutProgressBars);
                v.addEventListener('loadedmetadata', updateAboutProgressBars);
                v.addEventListener('error', () => {
                    const frame = document.getElementById(`aboutFrame${idx}`);
                    if (!frame) return;
                    const label = frame.querySelector('.about-paused-indicator');
                    frame.classList.add('paused');
                    if (label) label.textContent = 'Video format not supported';
                    aboutVideoErrorCount += 1;
                    if (aboutVideoErrorCount >= videos.length) {
                        const activeFrame = document.getElementById(`aboutFrame${aboutSlideIndex}`) || frame;
                        const activeLabel = activeFrame ? activeFrame.querySelector('.about-paused-indicator') : null;
                        if (activeFrame) activeFrame.classList.add('paused');
                        if (activeLabel) activeLabel.textContent = 'Video files missing on server';
                    }
                });
            });
            updateAboutPausedOverlay();
            updateAboutProgressBars();
            updateAboutNowPlaying();
        }

        function getAboutVideos() {
            return Array.from(document.querySelectorAll('.about-video'));
        }

        function initAboutVolumeControl() {
            const slider = document.getElementById('aboutVolumeSlider');
            const saved = localStorage.getItem('aboutVideoVolume');
            const initial = saved !== null ? Number(saved) : 1;
            if (!Number.isNaN(initial)) {
                aboutVolume = Math.max(0, Math.min(1, initial));
            }
            if (slider) slider.value = String(aboutVolume);
            setAboutVolume(aboutVolume);
        }

        function setAboutVolume(value) {
            const n = Math.max(0, Math.min(1, Number(value)));
            if (Number.isNaN(n)) return;
            aboutVolume = n;
            getAboutVideos().forEach(v => { v.volume = aboutVolume; });
            localStorage.setItem('aboutVideoVolume', String(aboutVolume));
            updateAboutNowPlaying();
        }

        function updateAboutDots() {
            const dots = Array.from(document.querySelectorAll('#aboutDots .about-dot'));
            dots.forEach((dot, idx) => dot.classList.toggle('active', idx === aboutSlideIndex));
        }

        function updateAboutProgressBars() {
            const videos = getAboutVideos();
            videos.forEach((v, idx) => {
                const fill = document.getElementById(`aboutProgressFill${idx}`);
                if (!fill) return;
                if (idx < aboutSlideIndex) {
                    fill.style.width = '100%';
                    return;
                }
                if (idx > aboutSlideIndex) {
                    fill.style.width = '0%';
                    return;
                }
                const duration = Number(v.duration || 0);
                const current = Number(v.currentTime || 0);
                const pct = duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : (v.paused ? 0 : 5);
                fill.style.width = `${pct}%`;
            });
        }

        function updateAboutNowPlaying() {
            const label = document.getElementById('aboutNowPlaying');
            const videos = getAboutVideos();
            const total = videos.length || 2;
            const active = videos[aboutSlideIndex];
            const state = active && !active.paused ? 'Playing' : 'Paused';
            const volPct = Math.round((aboutVolume || 0) * 100);
            if (label) {
                label.textContent = `Slide ${aboutSlideIndex + 1}/${total} • ${state} • Vol ${volPct}%`;
            }
        }

        function startAboutProgressTicker() {
            if (aboutProgressTimer) return;
            aboutProgressTimer = setInterval(updateAboutProgressBars, 120);
        }

        function stopAboutProgressTicker() {
            if (!aboutProgressTimer) return;
            clearInterval(aboutProgressTimer);
            aboutProgressTimer = null;
        }

        function updateTabThemeClass(tab) {
            const classes = ['tab-discover', 'tab-recommendations', 'tab-library', 'tab-comments', 'tab-profile', 'tab-about'];
            classes.forEach(c => document.body.classList.remove(c));
            document.body.classList.add(`tab-${tab}`);
        }

        function setupGlobalShortcuts() {
            document.addEventListener('keydown', (e) => {
                if (currentTab !== 'about') return;
                const activeEl = document.activeElement;
                const tag = activeEl && activeEl.tagName ? activeEl.tagName.toLowerCase() : '';
                if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    aboutPrev();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    aboutNext();
                } else if (e.key === ' ') {
                    e.preventDefault();
                    toggleAboutPlayback();
                }
            });
        }

        function setupAboutSliderGestures() {
            const wrap = document.querySelector('.about-slider-wrap');
            if (!wrap) return;
            wrap.addEventListener('touchstart', (e) => {
                if (!e.touches || !e.touches.length) return;
                aboutTouchStartX = e.touches[0].clientX;
                aboutTouchMoved = false;
            }, { passive: true });
            wrap.addEventListener('touchmove', (e) => {
                if (aboutTouchStartX === null || !e.touches || !e.touches.length) return;
                const deltaX = e.touches[0].clientX - aboutTouchStartX;
                if (Math.abs(deltaX) > 8) aboutTouchMoved = true;
            }, { passive: true });
            wrap.addEventListener('touchend', (e) => {
                if (aboutTouchStartX === null || !e.changedTouches || !e.changedTouches.length) return;
                const deltaX = e.changedTouches[0].clientX - aboutTouchStartX;
                aboutTouchStartX = null;
                if (Math.abs(deltaX) < 40) return;
                if (deltaX < 0) aboutNext();
                else aboutPrev();
            }, { passive: true });
        }

        function updateOnlineUsers() {
            fetch('/api/presence/online')
                .then(res => res.json())
                .then(data => {
                    const count = Number(data.count || 0);
                    const el = document.getElementById('onlineCount');
                    if (el) el.textContent = String(Math.max(1, count));
                })
                .catch(() => {});
        }

        function startCommentsPolling() {
            if (commentsRefreshInterval) clearInterval(commentsRefreshInterval);
            commentsRefreshInterval = setInterval(() => {
                if (currentTab !== 'comments') return;
                if (!isCommentsInputActive()) {
                    if (currentCommentsView === 'community') loadCommunityMessages();
                    else if (currentCommentsView === 'dm') {
                        loadDmThreads();
                        loadDmMessages();
                    } else loadComments();
                }
                updateOnlineUsers();
            }, 3000);
        }

        function stopCommentsPolling() {
            if (commentsRefreshInterval) {
                clearInterval(commentsRefreshInterval);
                commentsRefreshInterval = null;
            }
        }

        // Simulate online users updating
        setInterval(updateOnlineUsers, 30000);

        // Settings
        function openSettings() {
            document.getElementById('settingsModal').classList.add('active');
            AudioSys.playModal();
        }

        function closeSettings(e) {
            if (!e || e.target.id === 'settingsModal') {
                document.getElementById('settingsModal').classList.remove('active');
                AudioSys.playModal();
            }
        }

        // ===== AUDIO SYSTEM =====
        const AudioSys = {
            ctx: null,
            master: null,
            noiseBuffer: null,
            lastPlay: 0,
            init() {
                if (!this.ctx) {
                    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                    this.master = this.ctx.createGain();
                    this.master.gain.value = 0.26;
                    this.master.connect(this.ctx.destination);
                    this.noiseBuffer = this._createNoiseBuffer();
                }
            },
            _createNoiseBuffer() {
                const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < data.length; i++) {
                    data[i] = (Math.random() * 2 - 1) * 0.7;
                }
                return buffer;
            },
            _allow() {
                if (!settings.sound) return false;
                this.init();
                if (this.ctx.state === 'suspended') this.ctx.resume();
                const now = performance.now();
                if (now - this.lastPlay < 50) return false;
                this.lastPlay = now;
                return true;
            },
            _playOsc({freq, type = 'sine', dur = 0.12, gain = 0.2, attack = 0.002, decay = 0.08, detune = 0, filter} = {}) {
                const osc = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                osc.type = type;
                osc.frequency.value = freq;
                osc.detune.value = detune;
                g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
                g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + attack);
                g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur + decay);
                let node = osc;
                if (filter) {
                    const f = this.ctx.createBiquadFilter();
                    f.type = filter.type || 'lowpass';
                    f.frequency.value = filter.freq || 1200;
                    f.Q.value = filter.q || 0.7;
                    node.connect(f);
                    node = f;
                }
                node.connect(g);
                g.connect(this.master);
                osc.start();
                osc.stop(this.ctx.currentTime + dur + decay);
            },
            _playNoise({dur = 0.08, gain = 0.08, freq = 1200, q = 0.8, type = 'bandpass'} = {}) {
                const source = this.ctx.createBufferSource();
                source.buffer = this.noiseBuffer;
                const filter = this.ctx.createBiquadFilter();
                filter.type = type;
                filter.frequency.value = freq;
                filter.Q.value = q;
                const g = this.ctx.createGain();
                g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
                g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
                source.connect(filter);
                filter.connect(g);
                g.connect(this.master);
                source.start();
                source.stop(this.ctx.currentTime + dur);
            },
            playTap() {
                if (!this._allow()) return;
                this._playOsc({freq: 420, type: 'triangle', dur: 0.05, gain: 0.18, filter: {type: 'lowpass', freq: 1800}});
                this._playNoise({dur: 0.035, gain: 0.06, freq: 1600});
            },
            playClick() {
                this.playTap();
            },
            playSwitch() {
                if (!this._allow()) return;
                this._playOsc({freq: 520, type: 'sine', dur: 0.06, gain: 0.16});
                setTimeout(() => this._playOsc({freq: 760, type: 'sine', dur: 0.07, gain: 0.14}), 40);
            },
            playPage() {
                if (!this._allow()) return;
                this._playNoise({dur: 0.08, gain: 0.06, freq: 900, q: 0.6});
                this._playOsc({freq: 300, type: 'triangle', dur: 0.08, gain: 0.06});
            },
            playSuccess() {
                if (!this._allow()) return;
                this._playOsc({freq: 520, type: 'sine', dur: 0.08, gain: 0.12});
                setTimeout(() => this._playOsc({freq: 660, type: 'sine', dur: 0.12, gain: 0.12}), 60);
                setTimeout(() => this._playOsc({freq: 820, type: 'sine', dur: 0.14, gain: 0.1}), 120);
            },
            playError() {
                if (!this._allow()) return;
                this._playOsc({freq: 140, type: 'sawtooth', dur: 0.18, gain: 0.12, filter: {type: 'lowpass', freq: 600}});
                this._playNoise({dur: 0.12, gain: 0.05, freq: 400});
            },
            playNotification() {
                if (!this._allow()) return;
                this._playOsc({freq: 880, type: 'sine', dur: 0.1, gain: 0.12});
                setTimeout(() => this._playOsc({freq: 1320, type: 'sine', dur: 0.14, gain: 0.1}), 80);
            },
            playModal() {
                if (!this._allow()) return;
                this._playOsc({freq: 360, type: 'triangle', dur: 0.1, gain: 0.09});
            }
        };

        document.addEventListener('pointerdown', (e) => {
            if (!settings.sound) return;
            const target = e.target.closest('button, .btn, .action-btn, .tab-btn, .nav-item, .icon-btn, .send-btn, .bible-reader-btn, .toggle, .segment-btn');
            if (target) AudioSys.playTap();
        });

        function applyTheme() {
            document.documentElement.setAttribute('data-theme', settings.darkMode ? 'dark' : 'light');
            const toggle = document.getElementById('darkToggle');
            if (toggle) toggle.classList.toggle('active', settings.darkMode);
            document.body.classList.toggle('noir-mode', settings.darkMode);
        }

        function toggleTheme() {
            themeAuto = false;
            settings.darkMode = !settings.darkMode;
            applyTheme();
            AudioSys.playClick();
            saveSettings();
        }

        function setFontSize(size, btn = null) {
            settings.fontSize = size;
            // Remove old font size classes from both html and body
            document.documentElement.classList.remove('font-small', 'font-medium', 'font-large');
            document.body.classList.remove('font-small', 'font-medium', 'font-large');
            // Add new font size class to both
            document.documentElement.classList.add('font-' + size);
            document.body.classList.add('font-' + size);
            applyGlobalFontScale();
            
            // Update button states
            document.querySelectorAll('#fontSizeSegment .segment-btn').forEach(b => b.classList.remove('active'));
            if (btn) {
                btn.classList.add('active');
            } else {
                const fontSizeMap = {small: 0, medium: 1, large: 2};
                const fontBtns = document.querySelectorAll('#fontSizeSegment .segment-btn');
                if (fontBtns[fontSizeMap[size]]) fontBtns[fontSizeMap[size]].classList.add('active');
            }
            
            AudioSys.playClick();
            saveSettings();
            showToast(`Font size: ${size}`);
        }

        function toggleAnimations() {
            settings.animations = !settings.animations;
            document.body.classList.toggle('no-animations', !settings.animations);
            document.getElementById('animToggle').classList.toggle('active');
            
            // Pause/resume ambient orbs
            document.querySelectorAll('.ambient-orb').forEach(orb => {
                orb.style.animationPlayState = settings.animations ? 'running' : 'paused';
            });
            
            AudioSys.playClick();
            saveSettings();
            showToast(settings.animations ? 'Animations ON' : 'Animations OFF');
        }

        function toggleSound() {
            settings.sound = !settings.sound;
            document.getElementById('soundToggle').classList.toggle('active');
            if (settings.sound) AudioSys.playSuccess();
            saveSettings();
            showToast(settings.sound ? 'Sound ON 🔊' : 'Sound OFF 🔇');
        }

        function toggleCompact() {
            settings.compact = !settings.compact;
            document.body.classList.toggle('compact-mode', settings.compact);
            document.getElementById('compactToggle').classList.toggle('active');
            AudioSys.playClick();
            saveSettings();
            showToast(settings.compact ? 'Compact mode ON' : 'Compact mode OFF');
        }

        function toggleNotifications() {
            settings.notifications = !settings.notifications;
            document.getElementById('notificationToggle').classList.toggle('active');
            AudioSys.playClick();
            saveSettings();
            showToast(settings.notifications ? 'Notifications ON 🔔' : 'Notifications OFF 🔕');
        }
        
        function toggleParticles() {
            settings.particles = !settings.particles;
            document.body.classList.toggle('particles-on', settings.particles);
            document.getElementById('particlesToggle').classList.toggle('active');
            
            if (settings.particles) {
                createParticles();
            } else {
                document.querySelectorAll('.particle').forEach(p => p.remove());
            }
            
            AudioSys.playClick();
            saveSettings();
            showToast(settings.particles ? 'Crosses ON ✝️' : 'Crosses OFF');
        }
        
        function toggleHighContrast() {
            settings.highContrast = !settings.highContrast;
            document.body.classList.toggle('high-contrast', settings.highContrast);
            document.getElementById('contrastToggle').classList.toggle('active');
            AudioSys.playClick();
            saveSettings();
            showToast(settings.highContrast ? 'High contrast ON' : 'High contrast OFF');
        }

        function toggleFocusMode() {
            settings.focusMode = !settings.focusMode;
            document.body.classList.toggle('focus-mode', settings.focusMode);
            document.getElementById('focusModeToggle').classList.toggle('active');
            AudioSys.playClick();
            saveSettings();
            showToast(settings.focusMode ? 'Focus mode ON' : 'Focus mode OFF');
        }

        function toggleAutoCopy() {
            settings.autoCopyVerse = !settings.autoCopyVerse;
            document.getElementById('autoCopyToggle').classList.toggle('active');
            AudioSys.playClick();
            saveSettings();
            showToast(settings.autoCopyVerse ? 'Auto-copy ON' : 'Auto-copy OFF');
        }

        async function requestWakeLock() {
            if (!('wakeLock' in navigator)) return false;
            try {
                wakeLockHandle = await navigator.wakeLock.request('screen');
                wakeLockHandle.addEventListener('release', () => {
                    wakeLockHandle = null;
                    if (settings.keepAwake) {
                        setTimeout(() => requestWakeLock(), 300);
                    }
                });
                return true;
            } catch (e) {
                console.error('Wake lock failed:', e);
                return false;
            }
        }

        async function toggleWakeLock() {
            settings.keepAwake = !settings.keepAwake;
            document.getElementById('wakeLockToggle').classList.toggle('active');
            saveSettings();

            if (settings.keepAwake) {
                const ok = await requestWakeLock();
                showToast(ok ? 'Screen awake ON' : 'Wake lock unavailable');
            } else {
                if (wakeLockHandle) {
                    try { await wakeLockHandle.release(); } catch (_) {}
                    wakeLockHandle = null;
                }
                showToast('Screen awake OFF');
            }
        }

        async function changeUsername() {
            const input = document.getElementById('usernameInput');
            const newName = (input?.value || '').trim();
            if (!newName) {
                showToast('Enter a username');
                return;
            }

            try {
                const res = await fetch('/api/user/update-name', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    showToast(data.error || 'Name update failed');
                    return;
                }

                const profileName = document.getElementById('profileUserName');
                if (profileName) profileName.textContent = data.name;
                showToast('Username updated');
            } catch (e) {
                showToast('Error updating username');
            }
        }
        
        // Text to Speech Functions
        function toggleTTS() {
            settings.ttsEnabled = !settings.ttsEnabled;
            document.getElementById('ttsToggle').classList.toggle('active');
            
            if (!settings.ttsEnabled) {
                TTS.stop();
            }
            
            AudioSys.playClick();
            saveSettings();
            showToast(settings.ttsEnabled ? '🔊 Auto-speak ON' : '🔇 Auto-speak OFF');
        }
        
        function changeTTSSpeed(speed) {
            settings.ttsSpeed = parseFloat(speed);
            saveSettings();
            showToast(`Speech speed: ${speed}x`);
        }
        
        function testTTS() {
            const testText = "For God so loved the world, that he gave his only begotten Son.";
            TTS.speak(testText, settings.ttsSpeed);
            showToast('🔊 Playing test...');
        }
        
        function speakVerse(verseText, verseRef) {
            if (settings.ttsEnabled && verseText) {
                const textToSpeak = `${verseText}. ${verseRef}.`;
                TTS.speak(textToSpeak, settings.ttsSpeed);
            }
        }

        async function changeInterval(val) {
            if (!isAdmin) {
                showToast('Admin access required');
                return;
            }
            
            settings.interval = parseInt(val);
            saveSettings();
            
            const res = await fetch('/api/set_interval', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({interval: settings.interval})
            });
            
            if (res.ok) {
                if (settings.notifications) showToast(`Interval set to ${val}s`);
            } else {
                showToast('Failed to update interval');
            }
        }

        function saveSettings() {
            localStorage.setItem('bibleSettings', JSON.stringify(settings));
        }

        function loadSettings() {
            // Default settings with new options
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const defaults = {
                darkMode: false,
                fontSize: 'medium',
                animations: true,
                sound: true,
                autoRec: true,
                compact: false,
                notifications: true,
                interval: 60,
                particles: false,
                highContrast: false,
                focusMode: false,
                autoCopyVerse: false,
                keepAwake: false,
                reducedMotion: false,
                ttsEnabled: false,
                ttsSpeed: 1
            };
            
            const saved = localStorage.getItem('bibleSettings');
            if (saved) {
                settings = {...defaults, ...JSON.parse(saved)};
                themeAuto = false;
            } else {
                settings = {...defaults, darkMode: !!prefersDark};
                themeAuto = true;
            }
            
            // Apply theme (sync to system when auto)
            applyTheme();
            const schemeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
            if (schemeMedia && themeAuto) {
                schemeMedia.addEventListener('change', (e) => {
                    if (!themeAuto) return;
                    settings.darkMode = e.matches;
                    applyTheme();
                });
            }
            
            // Apply font size class to both html and body
            document.documentElement.classList.add('font-' + settings.fontSize);
            document.body.classList.add('font-' + settings.fontSize);
            applyGlobalFontScale();
            
            // Update font size button states
            const fontSizeMap = {small: 0, medium: 1, large: 2};
            const fontBtns = document.querySelectorAll('#fontSizeSegment .segment-btn');
            if (fontBtns[fontSizeMap[settings.fontSize]]) {
                fontBtns.forEach(b => b.classList.remove('active'));
                fontBtns[fontSizeMap[settings.fontSize]].classList.add('active');
            }
            
            // Apply animations
            if (!settings.animations) {
                document.body.classList.add('no-animations');
                document.getElementById('animToggle').classList.remove('active');
                document.querySelectorAll('.ambient-orb').forEach(orb => {
                    orb.style.animationPlayState = 'paused';
                });
            }
            
            // Apply sound
            if (!settings.sound) document.getElementById('soundToggle').classList.remove('active');
            
            // Apply auto recommendations
            if (!settings.autoRec) document.getElementById('autoRecToggle').classList.remove('active');
            
            // Apply compact mode
            if (settings.compact) {
                document.body.classList.add('compact-mode');
                document.getElementById('compactToggle').classList.add('active');
            }
            
            // Apply notifications
            if (!settings.notifications) document.getElementById('notificationToggle').classList.remove('active');
            
            // Apply particles
            if (settings.particles) {
                document.body.classList.add('particles-on');
                document.getElementById('particlesToggle').classList.add('active');
                createParticles();
            }
            
            // Apply high contrast
            if (settings.highContrast) {
                document.body.classList.add('high-contrast');
                document.getElementById('contrastToggle').classList.add('active');
            }

            if (settings.focusMode) {
                document.body.classList.add('focus-mode');
                document.getElementById('focusModeToggle').classList.add('active');
            }

            if (settings.autoCopyVerse) {
                document.getElementById('autoCopyToggle').classList.add('active');
            }

            if (settings.keepAwake) {
                document.getElementById('wakeLockToggle').classList.add('active');
                requestWakeLock();
            }
            
            // Apply TTS settings
            if (settings.ttsEnabled) {
                document.getElementById('ttsToggle').classList.add('active');
            }
            if (settings.ttsSpeed) {
                document.getElementById('ttsSpeedSelect').value = settings.ttsSpeed;
            }
            
            // Apply interval
            if (settings.interval) document.getElementById('intervalSelect').value = settings.interval;
            
            setupAutoRecommendations();

            fetch('/api/user_info')
                .then(r => r.json())
                .then(data => {
                    if (data && data.name) {
                        const input = document.getElementById('usernameInput');
                        if (input) input.value = data.name;
                        const profileName = document.getElementById('profileUserName');
                        if (profileName) profileName.textContent = data.name;
                    }
                })
                .catch(() => {});
        }
        
        // Create floating particles
        function createParticles() {
            const container = document.querySelector('.particles');
            if (!container) return;
            
            container.innerHTML = '';
            for (let i = 0; i < 18; i++) {
                const p = document.createElement('div');
                p.className = 'particle';
                p.style.left = Math.random() * 100 + '%';
                p.style.animationDuration = (10 + Math.random() * 18) + 's';
                p.style.animationDelay = Math.random() * 16 + 's';
                p.style.opacity = 0.18 + Math.random() * 0.25;
                container.appendChild(p);
            }

            for (let i = 0; i < 18; i++) {
                const s = document.createElement('div');
                s.className = 'particle cross-image';
                s.style.left = Math.random() * 100 + '%';
                s.style.animationDuration = (18 + Math.random() * 22) + 's';
                s.style.animationDelay = Math.random() * 18 + 's';
                s.style.opacity = 0.65 + Math.random() * 0.3;
                const size = 70 + Math.random() * 60;
                s.style.width = `${size}px`;
                s.style.height = `${size}px`;
                s.style.transform = `translateY(100vh) rotate(${Math.random() * 40 - 20}deg)`;
                container.appendChild(s);
            }
        }

        // Toast with sound
        function showAccountLock(title, message, reason) {
            if (document.querySelector('.account-lock')) return;
            const overlay = document.createElement('div');
            overlay.className = 'account-lock';
            overlay.innerHTML = `
                <div class="account-lock-card">
                    <h2>${escapeHtml(title || 'Access blocked')}</h2>
                    <p>${escapeHtml(message || 'Your access has been blocked.')}</p>
                    ${reason ? `<div style="margin-top:12px; padding:10px; border-radius:12px; background: rgba(255,255,255,0.08);">${escapeHtml(reason)}</div>` : ''}
                    <div style="margin-top:16px;">
                        <button class="bible-reader-btn" onclick="window.location.href='/logout'">Logout</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        function showToast(msg, type = 'info', duration = 2800) {
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.className = 'toast';
            toast.classList.add('show');
            
            // Play appropriate sound
            if (settings.sound) {
                if (type === 'success' || msg.includes('success') || msg.includes('✓') || msg.includes('ON')) {
                    AudioSys.playSuccess();
                } else if (type === 'error' || msg.includes('error') || msg.includes('❌') || msg.includes('OFF')) {
                    AudioSys.playError();
                } else {
                    AudioSys.playNotification();
                }
            }
            
            setTimeout(() => toast.classList.remove('show'), duration);
        }

        function logout() {
            // Clear timer on logout
            localStorage.removeItem('bibleAppStartTime');
            localStorage.removeItem('bibleAppIsAdmin');
            window.location.href = '/logout';
        }

        function showUser() {
            switchTab('profile');
        }

        // Responsive handler
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 1024) {
                document.querySelectorAll('.tab-view.active').forEach(el => el.classList.add('desktop-active'));
            } else {
                document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('desktop-active'));
            }
        });

        // ===== SHOP SYSTEM =====
        let shopItems = [];
        let userInventory = [];
        let userXP = { xp: 0, level: 1 };
        let currentShopTab = 'shop';
        let currentCategory = 'all';
        
        async function loadShopData() {
            try {
                // Load shop items
                const itemsRes = await fetch('/api/shop/items');
                const itemsData = await itemsRes.json();
                if (itemsData.items) shopItems = itemsData.items;
                
                // Load user XP
                const xpRes = await fetch('/api/shop/xp');
                const xpData = await xpRes.json();
                if (xpData.xp !== undefined) {
                    userXP = xpData;
                    updateShopXPDisplay();
                }
                
                // Load inventory
                await loadInventory();
                
                renderShopItems();
            } catch (e) {
                console.error('Error loading shop:', e);
            }
        }
        
        async function loadInventory() {
            try {
                const res = await fetch('/api/shop/inventory');
                const data = await res.json();
                if (data.inventory) userInventory = data.inventory;
            } catch (e) {
                console.error('Error loading inventory:', e);
            }
        }
        
        function updateShopXPDisplay() {
            const xpEl = document.getElementById('shopXpAmount');
            const levelEl = document.getElementById('shopLevel');
            if (xpEl) xpEl.textContent = `${userXP.xp} XP`;
            if (levelEl) levelEl.textContent = `Level ${userXP.level}`;
        }
        
        function switchShopTab(tab) {
            currentShopTab = tab;
            document.querySelectorAll('.shop-tab-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            document.getElementById('shopItems').classList.toggle('hidden', tab !== 'shop');
            document.getElementById('inventoryItems').classList.toggle('hidden', tab !== 'inventory');
            
            if (tab === 'shop') renderShopItems();
            else renderInventory();
        }
        
        function filterShop(category) {
            currentCategory = category;
            document.querySelectorAll('.shop-category-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            renderShopItems();
        }
        
        function renderShopItems() {
            const container = document.getElementById('shopItems');
            let items = shopItems;
            
            if (currentCategory !== 'all') {
                items = items.filter(item => item.category === currentCategory);
            }
            
            if (items.length === 0) {
                container.innerHTML = `
                    <div class="shop-empty">
                        <div class="shop-empty-icon">📭</div>
                        <p>No items found in this category</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = items.map(item => {
                const owned = userInventory.find(i => i.item_id === item.item_id);
                const rarityClass = item.rarity || 'common';
                
                return `
                    <div class="shop-item ${rarityClass} ${owned ? 'owned' : ''}" data-item-id="${item.item_id}">
                        <span class="shop-item-icon">${item.icon || '📦'}</span>
                        <div class="shop-item-name">${item.name}</div>
                        <div class="shop-item-desc">${item.description}</div>
                        <span class="shop-item-rarity ${rarityClass}">${item.rarity}</span>
                        <div class="shop-item-price ${owned ? 'owned' : ''}">
                            ${owned ? '✓ Owned' : `⚡ ${item.price} XP`}
                        </div>
                        <button class="shop-item-btn" ${owned ? 'disabled' : ''} onclick="purchaseItem('${item.item_id}', ${item.price})">
                            ${owned ? 'Owned' : 'Buy'}
                        </button>
                    </div>
                `;
            }).join('');
        }
        
        function renderInventory() {
            const container = document.getElementById('inventoryItems');
            
            if (userInventory.length === 0) {
                container.innerHTML = `
                    <div class="shop-empty">
                        <div class="shop-empty-icon">🎒</div>
                        <p>Your inventory is empty</p>
                        <p style="font-size: 13px; margin-top: 8px;">Visit the shop to buy items!</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = userInventory.map(item => {
                const rarityClass = item.rarity || 'common';
                const isEquipped = item.equipped;
                
                return `
                    <div class="shop-item ${rarityClass} ${isEquipped ? 'equipped' : ''}" data-item-id="${item.item_id}">
                        <span class="shop-item-icon">${item.icon || '📦'}</span>
                        <div class="shop-item-name">${item.name}</div>
                        <div class="shop-item-desc">${item.description}</div>
                        <span class="shop-item-rarity ${rarityClass}">${item.rarity}</span>
                        <div class="shop-item-price owned">${isEquipped ? '✓ Equipped' : 'Owned'}</div>
                        <button class="shop-item-btn ${isEquipped ? 'unequip' : 'equip'}" onclick="toggleEquipItem('${item.item_id}', ${!isEquipped})">
                            ${isEquipped ? 'Unequip' : 'Equip'}
                        </button>
                    </div>
                `;
            }).join('');
        }
        
        async function purchaseItem(itemId, price) {
            if (userXP.xp < price) {
                showToast('❌ Not enough XP!');
                return;
            }
            
            try {
                const res = await fetch('/api/shop/purchase', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ item_id: itemId })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    userXP.xp = data.remaining_xp;
                    updateShopXPDisplay();
                    await loadInventory();
                    renderShopItems();
                    showToast(`✅ Purchased ${data.name}!`);
                    AudioSys.playSuccess();
                } else {
                    showToast(`❌ ${data.error || 'Purchase failed'}`);
                }
            } catch (e) {
                console.error('Purchase error:', e);
                showToast('❌ Purchase failed');
            }
        }
        
        async function toggleEquipItem(itemId, equip) {
            try {
                const res = await fetch('/api/shop/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ item_id: itemId, equip: equip })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await loadInventory();
                    renderInventory();
                    showToast(equip ? '✅ Item equipped!' : 'Item unequipped');
                } else {
                    showToast(`❌ ${data.error || 'Failed'}`);
                }
            } catch (e) {
                console.error('Equip error:', e);
            }
        }
        
        // Load shop data when shop tab is opened
        const originalSwitchTab = switchTab;
        switchTab = function(tab, btn = null) {
            originalSwitchTab(tab, btn);
            if (tab === 'shop') {
                loadShopData();
            }
        };
        
        // Award XP for actions
        async function awardXP(amount, action) {
            try {
                const res = await fetch('/api/xp/award', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: amount, action: action })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    // Update local XP display if on shop tab
                    userXP.xp = data.new_total;
                    userXP.level = data.level;
                    updateShopXPDisplay();
                    
                    if (data.leveled_up) {
                        showToast(`🎉 Level Up! You're now level ${data.level}!`);
                        AudioSys.playSuccess();
                    }
                    
                    return data;
                }
            } catch (e) {
                console.error('Award XP error:', e);
            }
        }

        // Start
        init();
    