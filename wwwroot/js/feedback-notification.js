// SignalR client for Feedback notifications
const llmDiagEnabled = (() => {
  try {
    return localStorage.getItem('llm.signalr.diagnostics') === '1';
  } catch {
    return false;
  }
})();

function llmDiagLog(scope, message, payload) {
  if (!llmDiagEnabled) return;
  const ts = new Date().toISOString();
  if (payload === undefined) {
    console.info(`[LLM-DIAG][${ts}][${scope}] ${message}`);
    return;
  }
  console.info(`[LLM-DIAG][${ts}][${scope}] ${message}`, payload);
}

const connection = new signalR.HubConnectionBuilder()
  .withUrl("/feedbackNotificationHub")
  .withAutomaticReconnect()
  .build();


connection.on("FeedbackUpdate", function () {
  //// Get appId from query string if present
  //const urlParams = new URLSearchParams(window.location.search);
  //const appId = urlParams.get("appId");
  let url = "/Feedback/GetFeedbackCounts";
  //if (appId) url += `?appId=${encodeURIComponent(appId)}`;

  fetch(url, { credentials: 'same-origin' })
    .then(response => response.json())
    .then(data => {
      const types = ["Suggestion", "Bug", "Question"];
      const keys = ["suggestions", "bugs", "questions"];
      for (let i = 0; i < types.length; i++) {
        const badge = document.querySelector(`.btn-group [data-feedback-type="${types[i]}"]`);
        if (badge) {
          const val = data[keys[i]];
          badge.textContent = val > 0 ? val : "";
        }
      }
    });
});

connection.on("FeedbackResolvedUpdate", function () {
  //console.log('FeedbackResolvedUpdate');
  fetch("/Feedback/GetResolvedCounts", { credentials: 'same-origin' })
    .then(response => response.json())
    .then(data => {
      const badge = document.querySelector('.btn-group [data-feedback-type="Resolved"]');
      const group = document.getElementById('resolved-feedback-group');
      if (badge) {
        badge.textContent = data.resolved > 0 ? data.resolved : "";
      }
      if (group) {
        // show group only when there is a positive resolved count
        group.style.display = (data && data.resolved && data.resolved > 0) ? '' : 'none';
      }
    });

  refreshAutoAnswerBadge();
});

// Handler pro notifikaci o vyresen feedbacku
connection.on("FeedbackResolved", function (feedbackId, status, resolvedAt, applicationId) {
  const feedbackRoot = document.querySelector(`[data-feedback-id="${feedbackId}"]`);

  // Aktualizace statusu v tabulkach (Details, List, MyFeedback)
  const statusBadge = feedbackRoot ? feedbackRoot.querySelector('.status-badge') : null;
  if (statusBadge) {
    statusBadge.textContent = status === "Resolved" ? "Vyřešeno" : "Nové";
    statusBadge.classList.remove('bg-success', 'bg-info');
    statusBadge.classList.add(status === "Resolved" ? 'bg-success' : 'bg-info');
  }

  // Aktualizace pole Resolved v detailech
  const resolvedField = feedbackRoot ? feedbackRoot.querySelector('.resolved-field') : null;
  if (resolvedField) {
    if (resolvedAt) {
      const date = new Date(resolvedAt);
      resolvedField.textContent = date.toLocaleString('cs-CZ');
    } else {
      resolvedField.textContent = '-';
    }
  }

  // Skryti/zobrazeni tlacitka "Vyresit"
  const resolveBtn = feedbackRoot ? feedbackRoot.querySelector('.resolve-btn') : null;
  if (resolveBtn) {
    resolveBtn.style.display = status === "Resolved" ? "none" : "";
  }

  // Existing nav counters
  updateFeedbackCounts();

  // Ensure resolved badge group refreshes immediately
  fetch("/Feedback/GetResolvedCounts", { credentials: 'same-origin' })
    .then(response => response.json())
    .then(data => {
      const badge = document.querySelector('.btn-group [data-feedback-type="Resolved"]');
      const group = document.getElementById('resolved-feedback-group');
      if (badge) badge.textContent = data.resolved > 0 ? data.resolved : "";
      if (group) group.style.display = (data && data.resolved && data.resolved > 0) ? '' : 'none';
    })
    .catch(() => { });

  // Bez reloadu stranky: aktualizujeme jen notifikacni prvky v menu a dostupne badge v aktualnim DOM.

});

// Handler pro notifikaci o pridani odpovedi
connection.on("ResponseAdded", function (feedbackId, responseId, responseText, resolverAlias, resolvedAt) {
  const feedbackRoot = document.querySelector(`[data-feedback-id="${feedbackId}"]`);

  // Pridani nove odpovedi do seznamu
  const responsesList = feedbackRoot ? feedbackRoot.querySelector('.responses-list') : null;
  if (responsesList) {
    const newResponseHtml = `<div class="response-item" data-response-id="${responseId}">
      <strong>${resolverAlias}:</strong> ${responseText}
    </div>`;
    responsesList.insertAdjacentHTML('beforeend', newResponseHtml);
  }

  // Aktualizace statusu
  const statusBadge = feedbackRoot ? feedbackRoot.querySelector('.status-badge') : null;
  if (statusBadge) {
    statusBadge.textContent = "Vyřešeno";
    statusBadge.classList.remove('bg-info');
    statusBadge.classList.add('bg-success');
  }

  // Aktualizace pole Resolved
  const resolvedField = feedbackRoot ? feedbackRoot.querySelector('.resolved-field') : null;
  if (resolvedField && resolvedAt) {
    const date = new Date(resolvedAt);
    resolvedField.textContent = date.toLocaleString('cs-CZ');
  }

  // Bez reloadu stranky.

});

connection.on("LlmJobUpdated", function (job) {
  llmDiagLog('hub', 'Received LlmJobUpdated', {
    id: job && job.id,
    status: job && job.status,
    canCancel: job && job.canCancel
  });

  document.dispatchEvent(new CustomEvent("llm-job-updated", {
    detail: job || {}
  }));

  llmDiagLog('hub', 'Dispatched llm-job-updated DOM event', {
    id: job && job.id,
    status: job && job.status
  });
});

// Handler pro notifikaci o zmene poctu feedbacku
connection.on("CountsUpdated", function (applicationId, suggestionCount, bugCount, questionCount) {
  if (applicationId === 0) {
    // Globalni pocty - aktualizace nav menu
    updateGlobalFeedbackCounts();
  } else {
    // Pocty pro konkretni aplikaci
    updateApplicationFeedbackCounts(applicationId, suggestionCount, bugCount, questionCount);
  }
});

function updateGlobalFeedbackCounts() {
  fetch("/Feedback/GetFeedbackCounts", { credentials: 'same-origin' })
    .then(response => response.json())
    .then(data => {
      const types = ["Suggestion", "Bug", "Question"];
      const keys = ["suggestions", "bugs", "questions"];
      for (let i = 0; i < types.length; i++) {
        const badge = document.querySelector(`.btn-group [data-feedback-type="${types[i]}"]`);
        if (badge) {
          const val = data[keys[i]];
          badge.textContent = val > 0 ? val : "";
        }
      }
    })
    .catch(() => { });
}

function updateApplicationFeedbackCounts(applicationId, suggestionCount, bugCount, questionCount) {
  // Aktualizace poctu v tabulce Applications/Index
  const suggestionCell = document.querySelector(`[data-app-id="${applicationId}"] [data-feedback-type="Suggestion"] .count-value`);
  const bugCell = document.querySelector(`[data-app-id="${applicationId}"] [data-feedback-type="Bug"] .count-value`);
  const questionCell = document.querySelector(`[data-app-id="${applicationId}"] [data-feedback-type="Question"] .count-value`);

  if (suggestionCell) suggestionCell.textContent = suggestionCount;
  if (bugCell) bugCell.textContent = bugCount;
  if (questionCell) questionCell.textContent = questionCount;
}

function updateFeedbackCounts() {
  fetch("/Feedback/GetFeedbackCounts", { credentials: 'same-origin' })
    .then(response => response.json())
    .then(data => {
      const types = ["Suggestion", "Bug", "Question"];
      const keys = ["suggestions", "bugs", "questions"];
      for (let i = 0; i < types.length; i++) {
        const badge = document.querySelector(`.btn-group [data-feedback-type="${types[i]}"]`);
        if (badge) {
          const val = data[keys[i]];
          badge.textContent = val > 0 ? val : "";
        }
      }
    })
    .catch(() => { });
}


function refreshAutoAnswerBadge() {
  fetch("/Feedback/GetPendingAutoAnswerCount", { credentials: 'same-origin' })
    .then(response => response.json())
    .then(data => {
      const badge = document.getElementById('my-feedback-autoanswer-badge');
      if (!badge) return;

      const count = data && typeof data.count === 'number' ? data.count : 0;
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = '';
      } else {
        badge.textContent = '';
        badge.style.display = 'none';
      }
    })
    .catch(() => { });
}

connection.onreconnecting(function (err) {
  llmDiagLog('hub', 'SignalR reconnecting', err ? (err.message || err) : null);
});

connection.onreconnected(function (connectionId) {
  llmDiagLog('hub', 'SignalR reconnected', connectionId || '(no connectionId)');
});

connection.onclose(function (err) {
  llmDiagLog('hub', 'SignalR connection closed', err ? (err.message || err) : null);
});

connection.start()
  .then(function () {
    llmDiagLog('hub', 'SignalR connection started', connection.connectionId || '(no connectionId)');
  })
  .catch(function (err) {
    console.error("SignalR connection error:", err);
    llmDiagLog('hub', 'SignalR connection start failed', err ? (err.message || err) : null);
  });

// initial load: fetch resolved count and show/hide the resolved group accordingly
document.addEventListener('DOMContentLoaded', function () {
  fetch("/Feedback/GetResolvedCounts", { credentials: 'same-origin' })
    .then(response => response.json())
    .then(data => {
      const badge = document.querySelector('.btn-group [data-feedback-type="Resolved"]');
      const group = document.getElementById('resolved-feedback-group');
      if (badge) badge.textContent = data.resolved > 0 ? data.resolved : "";
      if (group) group.style.display = (data && data.resolved && data.resolved > 0) ? '' : 'none';
    })
    .catch(() => { /* ignore errors on initial fetch */ });

  refreshAutoAnswerBadge();
});
