if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

    if (isLocalHost) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const hadController = !!navigator.serviceWorker.controller;
        let unregisteredAny = false;

        for (const registration of registrations) {
          const unregistered = await registration.unregister();
          unregisteredAny = unregisteredAny || unregistered;
        }

        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }

        if ((hadController || unregisteredAny) && sessionStorage.getItem('localhost-sw-cleanup-done') !== '1') {
          sessionStorage.setItem('localhost-sw-cleanup-done', '1');
          window.location.reload();
        }
      } catch (error) {
        console.log('Service Worker cleanup failed: ', error);
      }

      return;
    }

    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        //console.log('Service Worker registrace úspěšná: ', registration);
      })
      .catch((error) => {
        console.log('Service Worker registration failed: ', error);
      });
  });
}

function ensureBackgroundTarget(form) {
  try {
    const targetName = 'feedback-background-submit-target';
    let frame = document.getElementById(targetName);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = targetName;
      frame.name = targetName;
      frame.style.display = 'none';
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);
    }

    form.target = targetName;
  } catch { }
}

// Global loading overlay (spinner + message)
(() => {
  const overlay = document.getElementById('global-loading-overlay');
  const overlayText = document.getElementById('global-loading-overlay-text');
  const overlayContinue = document.getElementById('global-loading-overlay-continue');

  function setVisible(visible) {
    if (!overlay) return;
    overlay.classList.toggle('is-visible', visible);
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function setContinue(enabled, href) {
    if (!overlayContinue) return;
    if (enabled) {
      overlayContinue.style.display = '';
      if (href) overlayContinue.setAttribute('href', href);
    } else {
      overlayContinue.style.display = 'none';
    }
  }

  window.FeedbackUi = window.FeedbackUi || {};

  window.FeedbackUi.loading = {
    show: (message) => {
      if (overlayText && typeof message === 'string' && message.trim().length > 0) {
        try {
          const msgEl = overlayText.querySelector('#global-loading-overlay-message');
          if (msgEl) msgEl.textContent = message;
          else overlayText.textContent = message; // fallback
        } catch {
          overlayText.textContent = message;
        }
      }
      setVisible(true);
    },
    hide: () => {
      try {
        stopJobPolling();
      } catch { }
      try {
        const container = document.getElementById('queueCountContainer');
        const num = document.getElementById('queueCountNumber');
        if (num) num.textContent = '—';
        if (container) container.style.display = 'none';
      } catch { }
      setContinue(false);
      setVisible(false);
    },
    setQueueCount: (v) => {
      try {
        const container = document.getElementById('queueCountContainer');
        const num = document.getElementById('queueCountNumber');
        if (!container || !num) return;
        if (v === null || v === undefined) {
          num.textContent = '—';
          container.style.display = 'none';
        } else {
          num.textContent = String(v);
          container.style.display = '';
        }
      } catch { }
    },
    setContinue
  };

  // If the user navigates back (bfcache), ensure we don't keep the overlay visible.
  window.addEventListener('pageshow', () => {
    setContinue(false);
    setVisible(false);
  });
})();

// Prevent accidental multiple submits (double-click / rapid clicks)
(() => {
  const SUBMIT_GUARD_ATTR = 'data-submit-guarded';
  const SUBMITTED_ATTR = 'data-submitted';
  const LOADING_ATTR = 'data-loading-overlay';
  const LOADING_MESSAGE_ATTR = 'data-loading-message';

  function disableSubmitControls(form) {
    const controls = form.querySelectorAll('button[type="submit"], input[type="submit"]');
    controls.forEach((el) => {
      if (el.disabled) return;
      el.setAttribute('data-submit-guard-disabled', '1');
      el.disabled = true;

      const busyText = el.getAttribute('data-busy-text');
      if (busyText && el.tagName === 'BUTTON') {
        el.setAttribute('data-original-text', el.textContent ?? '');
        el.textContent = busyText;
      }
    });
  }

  function showLoadingOverlay(form) {
    const enabled = (form.getAttribute(LOADING_ATTR) ?? 'true').toLowerCase();
    if (enabled === 'false') return;

    const allowContinue = (form.getAttribute('data-loading-allow-continue') ?? 'false').toLowerCase() === 'true';
    const continueUrl = form.getAttribute('data-loading-continue-url') || '/Feedback/MyFeedback';

    window.FeedbackUi?.loading?.setContinue(allowContinue, continueUrl);

    const msg = form.getAttribute(LOADING_MESSAGE_ATTR);
    window.FeedbackUi?.loading?.show(msg);
  }

  function ensureGuarded(form) {
    if (form.hasAttribute(SUBMIT_GUARD_ATTR)) return;
    form.setAttribute(SUBMIT_GUARD_ATTR, '1');

    form.addEventListener('submit', async (e) => {
      if (form.hasAttribute(SUBMITTED_ATTR)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();

      const allowContinue = (form.getAttribute('data-loading-allow-continue') ?? 'false').toLowerCase() === 'true';
      if (allowContinue) {
        ensureBackgroundTarget(form);
      }

      form.setAttribute(SUBMITTED_ATTR, '1');
      showLoadingOverlay(form);
      disableSubmitControls(form);

      // Give the browser a chance to paint the overlay before we do the optional enqueue call.
      await new Promise((resolve) => setTimeout(resolve, 0));

      let shouldSubmit = true;

      // If the form requests client-side LLM enqueueing, do it after the overlay is visible.
      try {
        const doEnqueue = (form.getAttribute('data-enqueue-llm') ?? 'false').toLowerCase() === 'true';
        if (doEnqueue) {
          const enqueueUrl = form.getAttribute('data-enqueue-url') || '/api/llm/enqueue';
          const questionSelector = form.getAttribute('data-enqueue-question-selector') || '#Body';
          const profileSelector = form.getAttribute('data-enqueue-profile-selector');
          const applicationSelector = form.getAttribute('data-enqueue-application-selector') || '#ApplicationId';

          let question = '';
          try {
            if (window.tinymce && typeof window.tinymce.get === 'function') {
              const ed = window.tinymce.get((questionSelector || '#Body').replace(/^#/, ''));
              if (ed) question = ed.getContent({ format: 'text' }) || '';
            }
          } catch { }

          if (!question) {
            const qEl = document.querySelector(questionSelector);
            question = qEl ? (qEl.value || qEl.textContent || '') : '';
          }

          const profileEl = profileSelector ? document.querySelector(profileSelector) : null;
          const profile = profileEl ? (profileEl.value || '') : (form.getAttribute('data-enqueue-profile') || 'balanced');

          const appEl = document.querySelector(applicationSelector);
          const applicationId = appEl ? (appEl.value || '') : '';

          if (question && enqueueUrl) {
            try {
              const body = new URLSearchParams();
              body.append('question', question);
              body.append('ragProfile', profile || 'balanced');
              if (applicationId) body.append('applicationId', applicationId);

              // keep the main submit alive even if the user clicks Continue on the overlay
              ensureBackgroundTarget(form);

              const resp = await fetch(enqueueUrl, { method: 'POST', body });
              if (resp.ok) {
                const j = await resp.json();
                // Set queue count
                const ahead = (j.queuedAhead ?? 0) + (j.active ?? 0);
                window.FeedbackUi?.loading?.setQueueCount(ahead);
                // Store job id in a hidden input so server can correlate and avoid duplicate work
                try {
                  let hid = form.querySelector('input[name="ClientLlmJobId"]');
                  if (!hid) {
                    hid = document.createElement('input');
                    hid.type = 'hidden';
                    hid.name = 'ClientLlmJobId';
                    form.appendChild(hid);
                  }
                  hid.value = j.jobId || '';
                  // start polling status for this job so queue count updates while overlay is visible
                  startJobPolling(hid.value);
                } catch { }
              }
            } catch (ex) {
              // ignore enqueue failures; proceed normally
              console.warn('LLM enqueue failed', ex);
            }
          }
        }
      } catch (ex) {
        // ignore
      }

      if (shouldSubmit) {
        try {
          form.submit();
        } catch (ex) {
          console.warn('Form submit failed', ex);
        }
      }
    }, true);
  }

  // Job status polling helpers — update queueCount while overlay is visible
  let _jobPollTimer = null;
  const _jobPollInterval = 1500;

  function stopJobPolling() {
    try {
      if (_jobPollTimer) {
        clearInterval(_jobPollTimer);
        _jobPollTimer = null;
      }
    } catch { }
  }

  function startJobPolling(jobId) {
    try {
      stopJobPolling();
      if (!jobId) return;
      _jobPollTimer = setInterval(async () => {
        try {
          const resp = await fetch('/api/llm/status/' + jobId);
          if (!resp.ok) return;
          const st = await resp.json();
          if (!st) return;
          const status = (st.status || '').toString();
          if (status === 'Running') {
            window.FeedbackUi?.loading?.setQueueCount(0);
          } else if (status === 'Succeeded' || status === 'Failed' || status === 'Canceled') {
            window.FeedbackUi?.loading?.setQueueCount(null);
            stopJobPolling();
          } else {
            // queued or other
            const ahead = (st.queuedAhead ?? st.queuedAhead) || 0;
            const active = (st.active ?? 0);
            window.FeedbackUi?.loading?.setQueueCount((ahead ?? 0) + (active ?? 0));
          }
        } catch { }
      }, _jobPollInterval);
    } catch { }
  }

  function guardAllForms() {
    document.querySelectorAll('form').forEach(ensureGuarded);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guardAllForms);
  } else {
    guardAllForms();
  }

  // In case some forms are added dynamically
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.tagName === 'FORM') ensureGuarded(node);
        node.querySelectorAll?.('form')?.forEach(ensureGuarded);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
