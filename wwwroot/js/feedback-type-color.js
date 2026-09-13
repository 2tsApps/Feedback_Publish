function updateCircleColor() {
  var type = document.getElementById('Type');
  var circle = document.getElementById('feedback-type-circle');
  //console.log('type', type);
  //console.log('circle', circle);

  if (!type || !circle) return;
  var colors = {
    0: '#90cdf4', // Suggestion
    1: '#f56565', // Bug
    2: '#68d391'  // Question
  };
  circle.style.background = colors[type.value] || 'transparent';
}

window.addEventListener('DOMContentLoaded', function() {
  //console.log('loaded');
  var type = document.getElementById('Type');
  //console.log('type', type);
  if (type) {
    type.addEventListener('change', updateCircleColor);
    updateCircleColor();
  }
});