document.addEventListener('DOMContentLoaded', function () {
  var grid = document.querySelector('#applications-masonry');
  if (!grid || !window.Masonry) return;

  var msnry = Masonry.data(grid);
  if (!msnry) return;

  // Bootstrap collapse event
  grid.addEventListener('shown.bs.collapse', function () {
    msnry.layout();
  });
  grid.addEventListener('hidden.bs.collapse', function () {
    msnry.layout();
  });
});