(function () {
  'use strict';

  function showCopiedFeedback(el) {
    var copiedLabel = document.body.getAttribute('data-copied-label') || '✔️ Zkopírováno';
    var original = el.innerHTML;
    el.innerHTML = '✔️ ' + copiedLabel;
    setTimeout(function () {
      el.innerHTML = original;
    }, 1500);
  }

  document.addEventListener('click', function (e) {
    var target = e.target;

    if (target.classList.contains('clipboard-number')) {
      var text = target.textContent.trim();
      navigator.clipboard.writeText(text).then(function () {
        showCopiedFeedback(target);
      });
      return;
    }

    if (target.classList.contains('clipboard-url')) {
      var url = target.getAttribute('data-url') || window.location.href;
      navigator.clipboard.writeText(url).then(function () {
        showCopiedFeedback(target);
      });
    }
  });
})();
