// vim: set ts=2 sw=2 tw=99 et:
function ChartController(app)
{
  this.app = app;
  this.activeHover = null;
  this.data = {};
}

ChartController.prototype.clear = function()
{
  this.removeHover();
  
  // Clear callbacks for XHR.
  for (var key in this.data) {
    var state = this.data[key];
    if (state.callbacks)
      state.callbacks = [];
  }

  $("#viewport").empty();
}

ChartController.prototype.removeHover = function()
{
  if (!this.activeHover)
    return;
  this.activeHover.remove();
  this.activeHover = null;
}

ChartController.prototype.prepareChartDiv = function (id, title, width, height)
{
  var elt = $('<div/>', {
    id: id,
    width: width,
    height: height
  });
  $('#viewport').append(
    $('<h4></h4>').text(title)
  );
  $('#viewport').append(elt);
  $('#viewport').append($('<br>'));
  $('#viewport').append($('<br>'));
  return elt;
}

ChartController.prototype.drawPieChart = function (elt, data)
{
  data.sort(function(a, b) {
    return b.data - a.data;
  });
  var percentages = {};
  var total = 0;
  for (var i = 0; i < data.length; i++)
    total += data[i].data;
  for (var i = 0; i < data.length; i++)
    percentages[data[i].label] = ((data[i].data / total) * 100).toFixed(1);

  $.plot(elt, data, {
    series: {
      pie: {
        show: true,
        label: {
          show: false,
        },
      },
    },
    legend: {
      show: true,
      labelFormatter: function(label, series) {
        return label + ' - ' + percentages[label] + '%';
      },
    },
    grid: {
      hoverable: true,
      clickable: true,
    },
  });
  elt.bind('plothover', (function (event, pos, obj) {
    if (!obj) {
      this.removeHover();
      return;
    }
    if (this.activeHover) {
      if (this.activeHover.id == event.target && this.activeHover.label == obj.seriesIndex)
        return;
      this.removeHover();
    }

    var label = data[obj.seriesIndex].label;
    var text = label + " - " + percentages[label] + "% (" + data[obj.seriesIndex].data + " sessions)";

    this.activeHover = new ToolTip(event.target, obj.seriesIndex, text);
    this.activeHover.draw(pos.pageX, pos.pageY);
  }).bind(this));
}

ChartController.prototype.drawTable = function(selector, devices)
{
  var GetDeviceName = function(device) {
    if (device in PCIDeviceMap)
      return PCIDeviceMap[device];
    var parts = device.split('/');
    if (parts.length == 2)
      return LookupVendor(parts[0]) + ' ' + parts[1];
    return device;
  }

  var device_list = [];
  var total = 0;
  for (var device in devices) {
    total += devices[device];
    device_list.push({
      name: GetDeviceName(device),
      count: devices[device]
    });
  }
  device_list.sort(function(a, b) {
    return b.count - a.count;
  });

  var table = $('<table></table>');
  for (var i = 0; i < device_list.length; i++) {
    var row = $('<tr></tr>');
    row.append($('<td>' + device_list[i].name + '</td>'));
    row.append($('<td>' + ((device_list[i].count / total) * 100).toFixed(2) + '%</td>'));
    row.append($('<td>(' + device_list[i].count + ')</td>'));
    table.append(row);
  }
  $(selector).append(table);
}

ChartController.prototype.ensureData = function (key, callback)
{
  if (key in this.data && this.data[key].obj)
    return this.data[key].obj;

  var state = this.data[key];
  if (!state) {
    state = {
      callbacks: [],
      obj: null,
    };
    this.data[key] = state;
  }

  state.callbacks.push(callback);

  $.ajax({
    url: 'data/' + key,
    dataType: 'json',
  }).done(function (data) {
    state.obj = (typeof data == 'string')
                ? JSON.parse(data)
                : data;

    var callbacks = state.callbacks;
    state.callbacks = null;

    for (var i = 0; i < callbacks.length; i++)
      callbacks[i](state.obj);
  });
}

// Combine unknown keys into one key, aggregating it.
ChartController.prototype.reduce = function (data, combineKey, threshold, callback)
{
  var total = 0;
  for (var key in data)
    total += data[key];

  var copy = {};
  if (combineKey in data)
    copy[combineKey] = data[combineKey];

  for (var key in data) {
    if ((!callback || callback(key)) && (data[key] / total >= threshold))
      copy[key] = data[key];
    else if (key != combineKey)
      copy[combineKey] = (copy[combineKey] | 0) + data[key];
  }
  return copy;
}

// Re-aggregate a dictionary based on a key transformation.
ChartController.prototype.mapToKeyedAgg = function (data, keyfn, labelfn)
{
  var out = {};
  for (var key in data) {
    var new_key = keyfn(key);
    if (new_key in out)
      out[new_key].count += data[key];
    else
      out[new_key] = { count: data[key], label: labelfn(key) };
  }
  return out;
}

// Reduce a keyed aggregation based on a threshold.
ChartController.prototype.reduceAgg = function (data, threshold, combineKey, combineLabel)
{
  var total = 0;
  for (var key in data)
    total += data[key].count;

  var out = {};
  for (var key in data) {
    if (data[key].count / total < threshold) {
      if (combineKey in out) {
        out[combineKey].count += data[key].count;
      } else {
        out[combineKey] = {
          count: data[key].count,
          label: combineLabel,
        };
      }
    } else {
      out[key] = data[key];
    }
  }
  return out;
}

ChartController.prototype.aggToSeries = function (data)
{
  var series = [];
  for (var key in data) {
    series.push({
      key: key,
      label: data[key].label,
      data: data[key].count,
    });
  }
  return series;
}

ChartController.prototype.createOptionList = function (map, namer)
{
  var list = [];
  for (var key in map)
    list.push([key, namer ? namer(key) : key]);
  list.sort(function (item1, item2) {
    var a = item1[1];
    var b = item2[1];
    if (a < b)
      return -1;
    if (a > b)
      return 1;
    return 0;
  });

  var options = [];
  for (var i = 0; i < list.length; i++) {
    options.push({
      value: list[i][0],
      text: list[i][1],
    });
  }
  return options;
}

ChartController.prototype.listToSeries = function (input, namer)
{
  var series = [];
  for (var i = 0; i < input.length; i++) {
    series.push({
      label: namer(i),
      data: input[i],
    });
  }
  return series;
};

ChartController.prototype.mapToSeries = function (input, namer)
{
  var series = [];
  for (var key in input) {
    series.push({
      label: namer ? namer(key) : key,
      data: input[key],
    });
  }
  return series;
};

ChartController.prototype.toPercent = function (val)
{
  return parseFloat((val * 100).toFixed(2));
}

ChartController.prototype.drawSampleInfo = function (obj)
{
  var count = obj.sessions.count;
  var days = obj.sessions.days;
  var fraction = obj.sessions.fraction;
  var channels = obj.sessions.channels
                 ? (Array.isArray(obj.sessions.channels)
                    ? (obj.sessions.channels.join(', ') + ' channels')
                    : obj.sessions.channels)
                 : 'all channels';

  var sourceText = channels + ", " +
                   parseFloat((fraction * 100).toFixed(2)) + "% sample rate, " + 
                   "over " + days + " days, taken on " + 
                   (new Date(obj.sessions.timestamp * 1000)).toLocaleDateString();


  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Sample size: ")
      ).append(
        $("<span></span>").text(count + " sessions")
      ),
      $("<p></p>").append(
        $("<strong></strong>").text("Sample source: ")
      ).append(
        $("<span></span>").text(sourceText)
      )
  );
};

ChartController.prototype.drawGeneral = function ()
{
  var obj = this.ensureData('general-statistics.json', this.drawGeneral.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var elt = this.prepareChartDiv('os-share', 'Operating System Usage', 600, 300);
  var oses = obj['os'];
  this.drawPieChart(elt, [
      { label: "Windows", data: parseInt(oses['Windows']) },
      { label: "Linux", data: parseInt(oses['Linux']) },
      { label: "OS X", data: parseInt(oses['Darwin']) },
  ]);

  var vendors = this.reduce(obj['vendors'], 'Unknown', 0, function(key) {
    return key in VendorMap;
  });

  var elt = this.prepareChartDiv('fx-share', 'Firefox Version Usage', 600, 300);
  var fx_series = [];
  for (var fxversion in obj['firefox']) {
    fx_series.push({
      label: 'Firefox ' + fxversion,
      data: obj['firefox'][fxversion],
    });
  }
  this.drawPieChart(elt, fx_series);

  var elt = this.prepareChartDiv('vendor-share', 'Device Vendor Usage', 600, 300);
  var vendor_series = [];
  for (var vendor in vendors) {
    vendor_series.push({
      label: LookupVendor(vendor),
      data: vendors[vendor],
    });
  }
  this.drawPieChart(elt, vendor_series);

  var windows = this.reduce(obj['windows'], 'Other', 0.005, function(key) {
    return WindowsVersionName(key) != 'Unknown';
  });
  var elt = this.prepareChartDiv('winver-share', 'Windows Usage', 700, 500);
  var winver_series = this.mapToSeries(windows, function (key) {
    if (key == 'Other')
      return key;
    return WindowsVersionName(key);
  });
  this.drawPieChart(elt, winver_series);

  var DeviceView = function(parent, data, prop, title) {
    this.parent = parent;
    this.prop = prop;
    this.source = data;
    this.data = parent.mapToKeyedAgg(this.source,
      function (key) { return DeviceKeyToPropKey(key, prop); },
      function (key) { return DeviceKeyToPropLabel(key, prop); }
    );
    this.data = parent.reduceAgg(this.data, 0.005, 'other', 'Other');
    this.series = parent.aggToSeries(this.data);
    this.current = this.series;
    this.elt = parent.prepareChartDiv('device-' + prop, title, 1000, 600);
  };
  DeviceView.prototype.aggToSeries = function (data) {
  };
  DeviceView.prototype.render = (function() {
    this.elt.unbind('plothover');
    this.elt.unbind('plotclick');
    this.parent.drawPieChart(this.elt, this.current);
    this.elt.bind('plotclick', (function (event, pos, obj) {
      if (!obj)
        this.unzoom();
      else if (this.series == this.current)
        this.zoom(obj);
      this.render();
    }).bind(this));
  });
  DeviceView.prototype.zoom = (function (obj) {
    var zoom_key = this.series[obj.seriesIndex].key;

    var map = {};
    for (device_key in this.source) {
      var xkey = DeviceKeyToPropKey(device_key, this.prop);
      if (zoom_key == 'other') {
        if (xkey in this.data)
          continue;
      } else {
        if (xkey != zoom_key)
          continue;
      }
      map[device_key] = this.source[device_key];
    }
    map = this.parent.reduce(map, 'Other', 0.005);
    this.current = this.parent.mapToSeries(map, function (key) {
      return GetDeviceName(key);
    });
  });
  DeviceView.prototype.unzoom = (function () {
    this.current = this.series;
  });

  var dev_gen = new DeviceView(this, obj.devices, 'gen', 'Device Generations');
  var dev_chipsets = new DeviceView(this, obj.devices, 'chipset', 'Device Chipsets');
  dev_gen.render();
  dev_chipsets.render();
}

ChartController.prototype.drawCrashReports = function (inReports)
{
  var reports = [];
  for (var i = 0; i < inReports.length; i++) {
    if (!inReports[i].date)
      continue;
    if (!inReports[i].timestamp)
      inReports[i].timestamp = Date.parse(inReports[i].date);
    reports.push(inReports[i]);
  }
  reports.sort(function (a, b) {
    return b.timestamp - a.timestamp;
  });

  $('#viewport').append(
    $("<h2></h2>").text("Crash Reports")
  );

  for (var i = 0; i < reports.length; i++) {
    var report = reports[i];
    var date = new Date(report.date);
    $('#viewport').append(
      $("<p></p>").append(
        $("<strong></strong>").text("Date: "),
        $("<span></span>").text(date.toLocaleDateString())
      )
    );

    var ul = $('<ul></ul>');

    var ostext = (report.os.name in OSMap
                 ? OSMap[report.os.name]
                 : report.os.name);
    if (report.os.version) {
      ostext += " " + report.os.version;
      if (report.os.servicePack)
        ostext += " (SP " + report.os.servicePack + ")";
    } else {
      ostext += " (unknown version)";
    }
    ul.append($('<li></li>').text("Operating System: " + ostext));

    var build = $('<li></li>').text("Build:");
    build.append(
      $('<ul></ul>').append(
        $('<li></li>').text('Version: ' + report.build.version),
        $('<li></li>').text('Revision: ').append(
          $('<a>').text(report.build.revision)
                  .attr('href', report.build.revision)
        )
      )
    );
    ul.append(build);

    var adapter = $('<ul></ul>');
    var vendorText = report.adapter.vendorID;
    if (report.adapter.vendorID in VendorMap)
      vendorText += " (" + VendorMap[report.adapter.vendorID] + ")";
    else
      vendorText += " (unknown vendor)";
    var deviceText = report.adapter.deviceID;
    var fullDeviceID = report.adapter.vendorID + "/" + report.adapter.deviceID;
    if (fullDeviceID in PCIDeviceMap)
      deviceText += " (" + PCIDeviceMap[fullDeviceID] + ")";
    else
      deviceText += " (not in PCI database)";

    adapter.append(
      $('<li></li>').text('Description: ' + report.adapter.description),
      $('<li></li>').text('Vendor: ' + vendorText),
      $('<li></li>').text('Device: ' + deviceText),
      $('<li></li>').text('Driver: ' +
                           report.adapter.driverVersion +
                           ' (date: ' + report.adapter.driverDate + ')'),
      $('<li></li>').text('Subsystem ID: ' + report.adapter.subsysID),
      $('<li></li>').text('RAM: ' + (report.adapter.RAM ? report.adapter.RAM : "unknown"))
    );
    ul.append($('<li></li>').text('Adapter:').append(adapter));

    $('#viewport').append(ul);
  }
};

ChartController.prototype.drawMonitors = function ()
{
  var obj = this.ensureData('monitor-statistics.json', this.drawMonitors.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var counts = this.reduce(obj.counts, 'Other', 0.005);
  var refreshRates = this.reduce(obj.refreshRates, 'Other', 0.01);
  var resolutions = this.reduce(obj.resolutions, 'Other', 0.01);

  var largest_width = 0;
  var largest_height = 0;
  var largest_total = 0, largest_total_str;
  for (var resolution in resolutions) {
    var tuple = resolution.split('x');
    if (tuple.length != 2)
      continue;
    if (parseInt(tuple[0]) > largest_width)
      largest_width = parseInt(tuple[0]);
    if (parseInt(tuple[1]) > largest_height)
      largest_height = parseInt(tuple[1]);
    var pixels = parseInt(tuple[0]) * parseInt(tuple[1]);
    if (pixels > largest_total) {
      largest_total = pixels;
      largest_total_str = resolution;
    }
  }

  var res_text = largest_total_str + " " +
                 "(largest width: " + largest_width + ", " +
                 "largest height: " + largest_height + ")";

  $('#viewport').append(
    $("<p></p>").append(
      $("<strong></strong>").text("Largest resolution "),
      $("<span></span>").text(res_text)
    )
  );

  var elt = this.prepareChartDiv('monitor-counts', 'Number of Monitors', 600, 300);
  var series = this.mapToSeries(counts,
    function (key) {
      if (parseInt(key))
        return key + " monitor" + ((key > 1) ? "s" : "");
      return key;
    }
  );
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv('refresh-rates', 'Refresh Rates', 600, 300);
  var series = this.mapToSeries(refreshRates,
    function (key) {
      if (parseInt(key))
        return key + 'hz';
      return key;
    }
  );
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv('resolutions', 'Resolutions', 600, 300);
  var series = this.mapToSeries(resolutions,
    function (key) {
      return key;
    }
  );
  this.drawPieChart(elt, series);
};

ChartController.prototype.drawWindowsFeatures = function ()
{
  var obj = this.ensureData('windows-features.json', this.drawWindowsFeatures.bind(this));
  if (!obj)
    return;

  var options = this.createOptionList(obj.byVersion, WindowsVersionName);
  options.unshift({
    value: 'all',
    text: 'All',
  });
  var filter = this.app.addFilter(
    'winver',
    'Windows Version',
    options,
    this.app.refresh.bind(this.app),
    'all');

  this.drawSampleInfo(obj);

  var source;
  if (filter.val() == 'all') {
    source = obj.all;

    // When there is no filter, draw a general Windows breakdown for this
    // data set to help users narrow down the filter further.
    var elt = this.prepareChartDiv(
      'windows-versions',
      'Windows Versions',
      600, 300);

    var winvers = {};
    for (var key in obj.byVersion)
      winvers[key] = obj.byVersion[key].count;
    winvers = this.reduce(winvers, 'Other', 0.01, function(key) {
      return WindowsVersionName(key) != 'Unknown';
    });

    var series = this.mapToSeries(winvers, WindowsVersionName);
    this.drawPieChart(elt, series);
  } else {
    source = obj.byVersion[filter.val()];

    var info_leader = WindowsVersionName(filter.val()) + " sessions:";
    var info_text = " " + source.count +
                    " (" +
                    this.toPercent(source.count / obj.sessions.count) + "% of sessions)";

    $('#viewport').append(
      $("<p></p>").append(
        $("<strong></strong>").text(info_leader),
        $("<span></span>").text(info_text)
      )
    );
  }

  var elt = this.prepareChartDiv(
    'compositors',
    'Compositor Usage',
    600, 300);
  var series = this.mapToSeries(source.compositors,
    function (key) {
      return key;
    });
  this.drawPieChart(elt, series);

  // Everything else is Windows Vista+.
  if (!('d3d11' in source))
    return;

  // We don't care about the 'unused' status.
  delete source.d3d11['unused'];

  var elt = this.prepareChartDiv(
    'd3d11-breakdown',
    'Direct3D11 Support',
    600, 300);
  var series = this.mapToSeries(source.d3d11,
    function (key) {
      if (key in D3D11StatusCode)
        return D3D11StatusCode[key];
      return key.charAt(0).toUpperCase() + key.substring(1);
    });
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv(
    'd2d-breakdown',
    'Direct2D Support',
    600, 300);
  var series = this.mapToSeries(source.d2d,
    function (key) {
      if (key in D2DStatusCode)
        return D2DStatusCode[key];
      return key.charAt(0).toUpperCase() + key.substring(1);
    });
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv(
    'texture-sharing-breakdown',
    'Direct3D11 Texture Sharing',
    600, 300);
  var series = this.mapToSeries(source.textureSharing,
    function (key) {
      return (key == "true") ? "Works" : "Doesn't work";
    });
  this.drawPieChart(elt, series);
}

ChartController.prototype.drawStartupData = function ()
{
  var obj = this.ensureData('startup-test-statistics.json', this.drawStartupData.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var sanityTestInfoText =
    obj.startupTestPings + " (" +
    this.toPercent(obj.startupTestPings / obj.sessions.count) + "% " +
    "of sessions)";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sessions with startup guards: ")
      ).append(
        $("<span></span>").text(sanityTestInfoText)
      )
  );

  var elt = this.prepareChartDiv(
    'startup-test-results',
    'Sanity test results',
    600, 300);
  var series = this.listToSeries(obj.results,
    function (index) {
      return StartupTestCode[index];
    }
  );
  this.drawPieChart(elt, series);

  this.drawCrashReports(obj.reports);
}

ChartController.prototype.drawTestCrashes = function ()
{
  var obj = this.ensureData('sanity-test-crash-reports.json', this.drawTestCrashes.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var sanityTestInfoText =
    obj.sanityTestPings + " (" +
    this.toPercent(obj.sanityTestPings / obj.sessions.count) + "% " +
    "of sessions)";
  var crashInfoText =
    obj.reports.length + " (" +
    this.toPercent(obj.reports.length / obj.sanityTestPings) + "% " +
    "of sanity test runs)";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sanity tests attempted: ")
      ).append(
        $("<span></span>").text(sanityTestInfoText)
      ),
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sanity test crashes: ")
      ).append(
        $("<span></span>").text(crashInfoText)
      )
  );

  this.drawCrashReports(obj.reports);
}

ChartController.prototype.drawSanityTests = function ()
{
  var obj = this.ensureData('sanity-test-statistics.json', this.drawSanityTests.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var infoText = obj.sanityTestPings + " (" +
                 this.toPercent(obj.sanityTestPings / obj.sessions.count) + "% of sessions)";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sanity tests attempted: ")
      ).append(
        $("<span></span>").text(infoText)
      )
  );

  var elt = this.prepareChartDiv(
    'sanity-test-results',
    'Sanity test results',
    600, 300);
  var series = this.listToSeries(obj.results,
    function (index) {
      return SanityTestCode[index];
    }
  );
  this.drawPieChart(elt, series);

  for (var i = 0; i < obj.byOS.length; i++) {
    var key = obj.byOS[i][0];
    var data = obj.byOS[i][1];
    var elt = this.prepareChartDiv(
      'sanity-test-by-os-' + key,
      SanityTestCode[key] + ', by Operating System',
      600, 300);
    var series = this.mapToSeries(data,
      function (key) {
        return WindowsVersionName(key);
      });
    this.drawPieChart(elt, series);
  }

  for (var i = 0; i < obj.byVendor.length; i++) {
    var key = obj.byVendor[i][0];
    var data = obj.byVendor[i][1];
    var elt = this.prepareChartDiv(
      'sanity-test-by-vendor-' + key,
      SanityTestCode[key] + ', by Graphics Vendor',
      600, 300);
    var series = this.mapToSeries(data,
      function (key) {
        return GetVendorName(key);
      });
    this.drawPieChart(elt, series);
  }

  for (var i = 0; i < obj.byDevice.length; i++) {
    var key = obj.byDevice[i][0];
    var data = obj.byDevice[i][1];
    var elt = this.prepareChartDiv(
      'sanity-test-by-device-' + key,
      SanityTestCode[key] + ', by Graphics Device',
      800, 300);
    var series = this.mapToSeries(data,
      function (key) {
        return GetDeviceName(key);
      });
    this.drawPieChart(elt, series);
  }

  for (var i = 0; i < obj.byDriver.length; i++) {
    var key = obj.byDriver[i][0];
    var data = obj.byDriver[i][1];
    var elt = this.prepareChartDiv(
      'sanity-test-by-driver-' + key,
      SanityTestCode[key] + ', by Graphics Driver',
      600, 300);
    var series = this.mapToSeries(data,
      function (key) {
        return GetDriverName(key);
      });
    this.drawPieChart(elt, series);
  }
}

ChartController.prototype.drawTDRs = function ()
{
  var obj = this.ensureData('tdr-statistics.json', this.drawTDRs.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var totalTDRs = 0;
  for (var i = 0; i < obj.results.length; i++)
    totalTDRs += obj.results[i];

  var avgUsers = ((obj['tdrPings'] / obj.sessions.count) * 100).toFixed(2);
  var avgTDRs = (totalTDRs / obj['tdrPings']).toFixed(1);

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Percentage of sessions with TDRs: ")
      ).append(
        $("<span></span>").text(avgUsers + '%')
      ),
      $("<p></p>").append(
        $("<strong></strong>").text("Average number of TDRs per TDR-affected user: ")
      ).append(
        $("<span></span>").text(avgTDRs)
      )
  );

  var elt = this.prepareChartDiv('tdr-reasons', 'TDR Reason Breakdown', 600, 300);
  var series = this.listToSeries(obj.results,
    function (reason) {
      return DeviceResetReason[reason];
    });
  this.drawPieChart(elt, series);

  // Combine the TDR breakdown into a single map of vendor => count.
  var combinedMap = {};
  for (var i = 0; i < obj.reasonToVendor.length; i++) {
    var item = obj.reasonToVendor[i];
    var reason = item[0];
    var map = item[1];

    if (!reason || reason > DeviceResetReason.length)
      continue;

    for (var key in map) {
      if (key in combinedMap)
        combinedMap[key] += map[key];
      else
        combinedMap[key] = map[key];
    }
  }

  // Draw the pie chart for the above analysis.
  var elt = this.prepareChartDiv('tdr-vendors', 'TDRs by Vendor', 600, 300);
  var tdrs = [];
  for (var vendor in map) {
    if (!(vendor in VendorMap))
      continue;
    var vendorName = (vendor in VendorMap)
                     ? VendorMap[vendor]
                     : "Unknown vendor " + vendor;
    tdrs.push({
      label: vendorName,
      data: map[vendor],
    });
  }
  this.drawPieChart(elt, tdrs);

  // Draw the vendor -> reason charts.
  for (var i = 0; i < obj.vendorToReason.length; i++) {
    var vendor = obj.vendorToReason[i][0];
    if (!IsMajorVendor(vendor))
      continue;

    var elt = this.prepareChartDiv('tdr-reason-' + vendor, 'TDR Reasons for ' + LookupVendor(vendor), 600, 300);
    var tdrs = [];
    var map = obj.vendorToReason[i][1];
    for (var reason in map) {
      if (!map[reason])
        continue;

      tdrs.push({
        label: DeviceResetReason[reason],
        data: map[reason],
      });
    }
    this.drawPieChart(elt, tdrs);
  }

  // Draw a vendor pie chart for each TDR reason.
  for (var i = 0; i < obj.reasonToVendor.length; i++) {
    var item = obj.reasonToVendor[i];
    var reason = item[0];
    var map = item[1];

    if (!reason || reason > DeviceResetReason.length)
      continue;
    if (Object.keys(map).length == 0)
      continue;

    var elt = this.prepareChartDiv(
        'tdr-reason-' + reason,
        'TDR Reason: ' + DeviceResetReason[reason],
        600, 300);
    var tdrs = [];
    for (var vendor in map) {
      if (!(vendor in VendorMap))
        continue;
      var vendorName = (vendor in VendorMap)
                       ? VendorMap[vendor]
                       : "Unknown vendor " + vendor;
      tdrs.push({
        label: vendorName,
        data: map[vendor],
      });
    }
    this.drawPieChart(elt, tdrs);
  }
}
