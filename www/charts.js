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

  for (var key in data) {
    if (callback(key) && (data[key] / total >= threshold))
      continue;
    data[combineKey] = (data[combineKey] | 0) + data[key];
    delete data[key];
  }
}

ChartController.prototype.createOptionList = function (elt, map, namer)
{
  var list = [];
  for (var key in map)
    list.push(namer ? namer(key) : key);
  list.sort(function (a, b) {
    if (a < b)
      return -1;
    if (a > b)
      return 1;
    return 0;
  });

  for (var i = 0; i < list.length; i++) {
    elt.append($('<option></option>', {
      value: list[i],
    }).text(list[i]));
  }
}

ChartController.prototype.getGeneralData = function (callback)
{
  var ready = this.ensureData('general-statistics.json', (function (obj) {
    this.reduce(obj['vendors'], 'Unknown', 0, function(key) {
      return key in VendorMap;
    });
    this.reduce(obj['windows'], 'Other', 0.005, function(key) {
      return WindowsVersionName(key) != 'Unknown';
    });

    // Setup the filter lists.
    //this.createOptionList(this.app.getFilter('fx'), obj['firefox']);
    //this.createOptionList(this.app.getFilter('win'), obj['windows'], WindowsVersionName);
    //this.app.getFilter('fx').val(this.app.getParam('fx', '*'));
    //this.app.getFilter('win').val(this.app.getParam('win', '*'));
    callback();
  }).bind(this));

  return ready;
}

ChartController.prototype.drawGeneral = function ()
{
  var obj = this.getGeneralData(this.drawGeneral.bind(this));
  if (!obj)
    return;

  var samplePercent = (obj.pingFraction * 100).toFixed(1);
  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Sample size: ")
      ).append(
        $("<span></span>").text(obj.validPings + " sessions (uniform " + samplePercent + "% of all sessions)")
      )
  );

  var elt = this.prepareChartDiv('os-share', 'Operating System Usage', 600, 300);
  var oses = obj['os'];
  this.drawPieChart(elt, [
      { label: "Windows", data: parseInt(oses['Windows']) },
      { label: "Linux", data: parseInt(oses['Linux']) },
      { label: "OS X", data: parseInt(oses['Darwin']) },
  ]);

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
  for (var vendor in obj['vendors']) {
    vendor_series.push({
      label: LookupVendor(vendor),
      data: obj['vendors'][vendor],
    });
  }
  this.drawPieChart(elt, vendor_series);

  var elt = this.prepareChartDiv('winver-share', 'Windows Usage', 700, 500);
  var winver_series = [];
  for (var winver in obj['windows']) {
    winver_series.push({
      label: WindowsVersionName(winver),
      data: obj['windows'][winver],
    });
  }
  this.drawPieChart(elt, winver_series);

  var devices_copy = {};
  for (var key in obj['devices'])
    devices_copy[key] = obj['devices'][key];
  this.reduce(devices_copy, 'Other', 0.005, function (key) {
    return key in PCIDeviceMap;
  });

  var elt = this.prepareChartDiv('device-share', 'Devices', 1000, 600);
  var device_series = [];
  for (var device in devices_copy) {
    device_series.push({
      label: PCIDeviceMap[device] || "Other",
      data: devices_copy[device],
    });
  }
  this.drawPieChart(elt, device_series);
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
}

ChartController.prototype.mapToSeries = function (input, namer)
{
  var series = [];
  for (var key in input) {
    series.push({
      label: namer(key),
      data: input[key],
    });
  }
  return series;
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
}

ChartController.prototype.drawStartupData = function ()
{
  var obj = this.ensureData('startup-test-statistics.json', this.drawStartupData.bind(this));
  if (!obj)
    return;

  var sampleInfo = "uniform " +
                   (obj.fraction * 100).toFixed(2) + "% of " +
                   "all pings covering " +
                   obj.timeWindow + " days, " +
                   "for each of Firefox 41 and 42";
  var sanityTestInfoText =
    obj.startupTestPings + " (" +
    ((obj.startupTestPings / obj.totalSessions) * 100).toFixed(2) + "% " +
    "of sessions)";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Sample size: ")
      ).append(
        $("<span></span>").text(obj.totalSessions + " sessions (" + sampleInfo + ")")
      ),
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

  var sampleInfo = "uniform " +
                   (obj.fraction * 100).toFixed(2) + "% of " +
                   "all pings covering " +
                   obj.timeWindow + " days, " +
                   "for each of Firefox 41 and 42";
  var sanityTestInfoText =
    obj.sanityTestPings + " (" +
    ((obj.sanityTestPings / obj.totalSessions) * 100).toFixed(2) + "% " +
    "of sessions)";
  var crashInfoText =
    obj.reports.length + " (" +
    ((obj.reports.length / obj.sanityTestPings) * 100).toFixed(2) + "% " +
    "of sanity test runs)";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Sample size: ")
      ).append(
        $("<span></span>").text(obj.totalSessions + " sessions (" + sampleInfo + ")")
      ),
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

  var sampleInfo = "uniform " +
                   (obj.fraction * 100).toFixed(2) + "% of " +
                   "all pings covering " +
                   obj.timeWindow + " days, " +
                   "for each of Firefox 41 and 42";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Sample size: ")
      ).append(
        $("<span></span>").text(obj.totalSessions + " sessions (" + sampleInfo + ")")
      ),
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sanity tests attempted: ")
      ).append(
        $("<span></span>").text(obj.sanityTestPings)
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

  var totalTDRs = 0;
  for (var i = 0; i < obj.results.length; i++)
    totalTDRs += obj.results[i];

  var avgUsers = ((obj['tdrPings'] / obj['windowsPings']) * 100).toFixed(2);
  var avgTDRs = (totalTDRs / obj['tdrPings']).toFixed(1);

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Sample size: ")
      ).append(
        $("<span></span>").text(obj.windowsPings + " sessions")
      ),
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
