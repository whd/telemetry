// vim: set ts=2 sw=2 tw=99 et:
function Controller()
{
  this.lastHash = null;
  this.queryParams = {};
  this.view = null;
  this.charts = new ChartController(this);
  this.ignoreHashChange = false;
  this.queryHooks = {};
  this.filters = [];
}

Controller.prototype.startup = function ()
{
  $('#viewChooser').change((function () {
    this.changeView($('#viewChooser').val());
    this.updateHash('view', $('#viewChooser').val());
  }).bind(this));

  $(window).hashchange(this.onHashChange.bind(this));
  this.onHashChange();
}

// Invoke the callback when the given key is changed in the URL hash.
Controller.prototype.registerParam = function (key, callback)
{
  this.queryHooks[key] = callback;
}

// Add a filter dropdown box.
Controller.prototype.addFilter = function (id, title, options, callback, defaultValue)
{
  var elt = $('<span></span>');
  elt.append($('<strong></strong>').text(title + ':'));

  var chooser = $('<select></select>', { id: id });
  elt.append(chooser);

  for (var i = 0; i < options.length; i++) {
    chooser.append($('<option></option>', {
      value: options[i].value
    }).text(options[i].text));
  }

  this.registerParam(id, function () {
    callback(chooser);
  });

  chooser.val(this.getParam(id, defaultValue));

  this.filters.push({
    elt: elt,
    id: id,
  });
}

// Invoked when the URL changes.
Controller.prototype.onHashChange = function ()
{
  if (this.lastHash == window.location.hash)
    return;
  if (this.ignoreHashChange)
    return;

  var query = window.location.hash.substring(1);
  var items = query.split('&');
  this.queryParams = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i].split('=');
    if (item.length <= 1)
      continue;
    this.queryParams[item[0]] = item[1];
  }

  var view = this.getParam('view', 'general');
  this.changeView(view);
}

// Update the hash URL based on local parameters.
Controller.prototype.updateHash = function (key, val)
{
  this.ignoreHashChange = true;
  try {
    if (key)
      this.queryParams[key] = val;
    var items = [];
    for (var key in this.queryParams)
      items.push(key + '=' + encodeURIComponent(this.queryParams[key]));
    window.location.hash = items.join('&');
  } catch (e) {
  } finally {
    this.ignoreHashChange = false;
  }
}

// Change the top-level view of the page.
Controller.prototype.changeView = function (view)
{
  if (this.view == view)
    return;

  $("#viewChooser").val(view);
  $("#viewport").empty();
  this.charts.clear();
  this.queryHooks = {};

  // Clear filters.
  for (var i = 0; i < this.filters.length; i++)
    this.filters[i].elt.remove();
  this.filters = [];

  this.view = view;

  switch (this.view) {
    case 'general':
      this.charts.drawGeneral();
      break;
    case 'tdrs':
      this.charts.drawTDRs();
      break;
  }
}

// Return a parameter, or if not set, return a default value.
Controller.prototype.getParam = function (key, defaultValue)
{
  if (key in this.queryParams)
    return this.queryParams[key];
  return defaultValue;
}

function Startup()
{
  var controller = new Controller();
  controller.startup();
}
