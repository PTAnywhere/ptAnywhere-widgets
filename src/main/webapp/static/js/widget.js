var nodes, edges;


// Utility functions that are transversal to the modules defined.

/**
 * @param defaultSelection It can be an int with the number of the option to be selected or a "null" (for any choice).
 * @return Selected port.
 */
function loadPortsInSelect(ports, selectElement, defaultSelection) {
    var ret = null;
    selectElement.html(""); // Remove everything
    for (var i = 0; i < ports.length; i++) {
        var portName = ports[i].portName;
        var portURL = ports[i].url;
        var htmlAppend = '<option value="' + portURL + '"';
        if (i == defaultSelection) {
            htmlAppend += ' selected';
            ret = ports[i];
        }
        selectElement.append(htmlAppend + '>' + portName + '</option>');
    }
    return ret;
}

// From: http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html
function getURLParameter(sParam) {
    var sPageURL = window.location.search.substring(1);
    var sURLVariables = sPageURL.split('&');
    for (var i = 0; i < sURLVariables.length; i++) {
        var sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] == sParam) {
            return sParameterName[1];
        }
    }
}


var linkDialog = (function () {

    var dialogContentPanelId = "#link-devices";
    var fromDevice, toDevice;
    var linkForm;  // To make more specific selects
    var dialog;
    var oneLoaded;

    function showPanel(classToShow) {
        var classNames = ["loading", "loaded", "error"];
        for (i in classNames) {
            if (classNames[i]==classToShow) {
                $(dialogContentPanelId + " ." + classNames[i]).show();
            } else {
                $(dialogContentPanelId + " ." + classNames[i]).hide();
            }
        }
    }

    function showErrorInPanel(errorMessage) {
        $(".error .error-msg", linkForm).text(errorMessage);
        // TODO find a less error-prone way to refer to the SUBMIT button (not its ordinal position!).
        $("button:first", dialog).attr('disabled','disabled');  // Disables the submit button
        showPanel("error");
    }

    function closeDialog() {
        dialog.dialog( "close" );
    }

    function loadAvailablePorts() {
        oneLoaded = false;
        var afterLoadingSuccess = function(selectPortsEl, ports) {
            // TODO Right now it returns a null, but it would be much logical to return an empty array.
            if (ports==null || ports.length==0) {
                showErrorInPanel("One of the devices you are trying to link has no available interfaces.");
            } else {
                loadPortsInSelect(ports, selectPortsEl, null);
                if (oneLoaded) { // TODO Check race conditions!
                    // Success: both loaded!
                    showPanel("loaded");
                } else {
                    oneLoaded = true;
                }
            }
        };
        var afterLoadingError = function(device, data) {
            console.error("Something went wrong getting this devices' available ports " + device.id + ".")
            showErrorInPanel("Unable to get " + device.label + " device's ports.");
        };
        packetTracer.getAvailablePorts(fromDevice, function(ports) {
                                                        afterLoadingSuccess($("#linkFromInterface", linkForm), ports);
                                                   }, function(errorData) {
                                                        afterLoadingError(fromDevice, errorData);
                                                   }, closeDialog);
        packetTracer.getAvailablePorts(toDevice, function(ports) {
                                                    afterLoadingSuccess($("#linkToInterface", linkForm), ports);
                                                 }, function(errorData) {
                                                    afterLoadingError(toDevice, errorData);
                                                 }, closeDialog);
    }

    function init() {
        showPanel("loading");

        $("#fromDeviceName", linkForm).text(fromDevice.label);
        $("#toDeviceName", linkForm).text(toDevice.label);

        dialog = $(dialogContentPanelId).dialog({
            title: "Connect two devices",
            autoOpen: false, height: 300, width: 400, modal: true, draggable: false,
            buttons: {
                "SUBMIT": function() {
                    var doneCallback = function() {
                        dialog.dialog( "close" );
                    };
                    var successfulCreationCallback = function(edgeId, edgeUrl) {
                        edges.add([{
                            id: edgeId,
                            url: edgeUrl,
                            from: fromDevice.id,
                            to: toDevice.id,
                        }]);
                    };
                    var fromPortURL = $("#linkFromInterface option:selected", linkForm).val();
                    var toPortURL = $("#linkToInterface option:selected", linkForm).val();
                    packetTracer.createLink(fromPortURL, toPortURL, doneCallback, successfulCreationCallback);
                },
                Cancel: function() {
                    $(this).dialog( "close" );
                }
            }
         });
        var form = dialog.find( "form" ).on("submit", function( event ) { event.preventDefault(); });
        dialog.dialog( "open" );
        loadAvailablePorts();
    }

    function createDialog(elementId, fromDeviceId, toDeviceId) {
        dialogContentPanelId = elementId;
        fromDevice = nodes.get(fromDeviceId);
        toDevice = nodes.get(toDeviceId);
        linkForm = $("form[name='link-devices']");
        init();
    }

    return {
        create: createDialog,
    };
})();


var deviceCreationDialog = (function () {
    function addDeviceWithName(label, type, x, y, callback) {
        return packetTracer.addDevice({
            "label": label,
            "group": type,
            "x": x,
            "y": y
        }, function(data) { nodes.add(data); })
        .always(callback);
    }

    function createDialog(x, y) {
        var dialog = $("#create-device").dialog({
            title: "Create new device",
            autoOpen: false, height: 300, width: 400, modal: true, draggable: false,
            buttons: {
                "SUBMIT": function() {
                    var callback = function() {
                        dialog.dialog( "close" );
                    };
                    name = document.forms["create-device"]["name"].value;
                    type = document.forms["create-device"]["type"].value;
                    addDeviceWithName(name, type, x, y, callback);
                },
                Cancel:function() {
                    $(this).dialog( "close" );
                }
            }, close: function() { /*console.log("Closing dialog...");*/ }
         });
        dialog.parent().attr("id", "create-dialog");
        var form = dialog.find( "form" ).on("submit", function( event ) { event.preventDefault(); });
        $("#device-type").iconselectmenu().iconselectmenu("menuWidget").addClass("ui-menu-icons customicons");
        dialog.dialog( "open" );
    }

    return {
        create: createDialog,
    };

})();


var deviceModificationDialog = (function () {
    var selectedDevice;
    var modForm;  // Not yet checked, but this should improve selectors performance.

    function showLoadingPanel(loading) {
        if (loading) {
            $("#tabs-2>.loading").hide();
            $("#tabs-2>.loaded").show();
        } else {
            $("#tabs-2>.loading").show();
            $("#tabs-2>.loaded").hide();
        }
    }

    function updateInterfaceInformation(port) {
        if (port.hasOwnProperty('portIpAddress') && port.hasOwnProperty('portSubnetMask')) {
            $('#ifaceDetails', modForm).show();
            $('#noIfaceDetails', modForm).hide();
            $('input[name="ipAddress"]', modForm).val(port.portIpAddress);
            $('input[name="subnetMask"]', modForm).val(port.portSubnetMask);
        } else {
            $('#ifaceDetails', modForm).hide();
            $('#noIfaceDetails', modForm).show();
        }
    }

    function loadPortsForInterface(ports) {
        var selectedPort = loadPortsInSelect(ports, $("#interface"), 0);
        if (selectedPort!=null) {
            updateInterfaceInformation(selectedPort);
            showLoadingPanel(true);
        }
        $("#interface", modForm).change(function () {
            $("option:selected", this).each(function(index, element) { // There is only one selection
                var selectedIFace = $(element).text();
                for (var i = 0; i < ports.length; i++) {  // Instead of getting its info again (we save one request)
                    if ( selectedIFace == ports[i].portName ) {
                        updateInterfaceInformation(ports[i]);
                        break;
                    }
                }
            });
        });
    }

    function updateEditForm() {
        showLoadingPanel(false);

        $("input[name='deviceId']", modForm).val(selectedDevice.id);
        $("input[name='displayName']", modForm).val(selectedDevice.label);
        if (selectedDevice.hasOwnProperty('defaultGateway')) {
            $("input[name='defaultGateway']", modForm).val(selectedDevice.defaultGateway);
            $("#defaultGw", modForm).show();
        } else {
            $("input[name='defaultGateway']", modForm).val("");
            $("#defaultGw", modForm).hide();
        }

        packetTracer.getAllPorts(selectedDevice, loadPortsForInterface);
    }

    function handleModificationSubmit(callback) {
        // Check the tab
        var selectedTab = $("li.ui-state-active", modForm).attr("aria-controls");
        if (selectedTab=="tabs-1") { // General settings
            var deviceId = $("input[name='deviceId']", modForm).val();
            var deviceLabel = $("input[name='displayName']", modForm).val();
            var defaultGateway = $("input[name='defaultGateway']", modForm).val();
            packetTracer.modifyDevice(nodes.get(deviceId), deviceLabel, defaultGateway, function(result) {
                                            nodes.update(result);
                                        }).always(callback);
        } else if (selectedTab=="tabs-2") { // Interfaces
            var portURL = $("#interface", modForm).val();
            var portIpAddress = $("input[name='ipAddress']", modForm).val();
            var portSubnetMask = $("input[name='subnetMask']", modForm).val();
            // Room for improvement: the following request could be avoided when nothing has changed
            packetTracer.modifyPort(portURL, portIpAddress, portSubnetMask, callback);  // In case just the port details are modified...
        } else {
            console.error("ERROR. Selected tab unknown.");
        }
    }

    function openDialog() {
        $("#modify-dialog-tabs").tabs();
        var dialog = $("#modify-device").dialog({
            title: "Modify device",
            height: 350, width: 450,
            autoOpen: false, modal: true, draggable: false,
            buttons: {
                "SUBMIT": function() {
                    var dialog = $(this);
                    var callback = function() {
                        dialog.dialog( "close" );
                    };
                    handleModificationSubmit(callback);
                },
                Cancel: function() {
                    $(this).dialog( "close" );
                }
            }, close: function() { /*console.log("Closing dialog...");*/ }
         });
        dialog.parent().attr("id", "modify-dialog");
        var form = dialog.find( "form" ).on("submit", function( event ) { event.preventDefault(); });
        dialog.dialog( "open" );
    }

    function createDialog(deviceId) {
        selectedDevice = nodes.get(deviceId);
        modForm = $("form[name='modify-device']");
        updateEditForm();
        openDialog();
    }

    return {
        create: createDialog,
    };
})();


var commandLine = (function () {
    function getCommandLineURL(nodeId) {
        return "../console?endpoint="+ nodes.get(nodeId).consoleEndpoint;
    }

    function openIFrame() {
        var selected = networkMap.getSelected();
        if (selected!=null) { // Only if just one is selected
            var dialog = $("#command-line").dialog({
                autoOpen: false, height: 400, width: 600, modal: true, draggable: false,
                close: function() { dialog.html(""); }
            });
            console.log(getCommandLineURL(selected));
            dialog.html('<div class="iframeWrapper"><iframe class="terminal" src="' + getCommandLineURL(selected) + '"></iframe></div>');
            dialog.dialog( "open" );
        }
    }

    // Reveal public pointers to
    // private functions and properties
    return {
        open: openIFrame,
    };
})();

// The Revealing Module Pattern
// http://addyosmani.com/resources/essentialjsdesignpatterns/book/#revealingmodulepatternjavascript
var networkMap = (function () {

    //var nodes = null; // To replace in the future with null
    //var edges = null; // To replace in the future with null
    var network;

    function drawTopology(responseData) {
        // Initialize data sets if needed
        if (nodes==null) {
            nodes = new vis.DataSet();
        }
        if (edges==null) {
            edges = new vis.DataSet();
        }

        // Load data
        if (responseData.devices!=null) {
            nodes.clear();
            nodes.add(responseData.devices);
        }
        if (responseData.edges!=null) {
            edges.clear();
            edges.add(responseData.edges);
        }

        // Create network element if needed (only the first time)
        if (network==null) {
            // create a network
            var visData = { nodes : nodes, edges : edges };
            var iconsPath = '../../static/images/';
            var options = {
                nodes:{
                    physics: false,
                    font: '14px verdana black',
                },
                edges: {
                    width: 3,
                    selectionWidth: 1.4,
                    color: {
                        color:'#606060',
                        highlight:'#000000',
                        hover: '#000000'
                    }
                 },
                groups : {
                    // TODO room for improvement, static URL vs relative URL
                    cloudDevice : {
                        shape : 'image',
                        image : iconsPath + 'cloud.png',
                        size: 50,
                    },
                    routerDevice : {
                        shape : 'image',
                        image : iconsPath + 'router.png',
                        size: 45,
                    },
                    switchDevice : {
                        shape : 'image',
                        image : iconsPath + 'switch.png',
                        size: 35,
                    },
                    pcDevice : {
                        shape : 'image',
                        image : iconsPath + 'PC.png',
                        size: 45,
                    }
                },
                manipulation: {
                    initiallyActive: true,
                    addNode: function(data, callback) {
                                deviceCreationDialog.create(data.x, data.y);
                             },
                    addEdge: function(data, callback) {
                                linkDialog.create("#link-devices", data.from, data.to);
                             },
                    editNode: function(data, callback) {
                                deviceModificationDialog.create(data.id);
                                callback(data);
                              },
                    editEdge: false,
                    deleteNode: function(data, callback) {
                                    // Always (data.nodes.length>0) && (data.edges.length==0)
                                    // FIXME There might be more than a node selected...
                                    packetTracer.removeDevice(nodes.get(data.nodes[0]));
                                    // This callback is important, otherwise it received 3 consecutive onDelete events.
                                    callback(data);
                                },
                    deleteEdge: function(data, callback) {
                                    // Always (data.nodes.length==0) && (data.edges.length>0)
                                    // FIXME There might be more than an edge selected...
                                    var edgeId = data.edges[0]; // Var created just to enhance readability
                                    packetTracer.removeLink( edges.get(edgeId).url );
                                    // This callback is important, otherwise it received 3 consecutive onDelete events.
                                    callback(data);
                                },
                }
            };

            var container = $('#network').get(0);
            network = new vis.Network(container, visData, options);
            network.on('doubleClick', commandLine.open);
        }
    }

    /**
     * Canvas' (0,0) does not correspond with the network map's DOM (0,0) position.
     *   @arg x DOM X coordinate relative to the canvas element.
     *   @arg y DOM Y coordinate relative to the canvas element.
     *   @return Coordinates on the canvas with form {x:Number, y:Number}.
     */
    function toNetworkMapCoordinate(x, y) {
        return network.DOMtoCanvas({x: x, y: y});
    }

    /**
     * @arg callback If it is null, it is simply ignored.
     */
    function loadTopology(callback) {
        var draw = drawTopology;
        packetTracer.getNetwork(function(data) {
            draw(data);
            if (callback!=null)
                callback();
        });
    }

    function getSelection() {
        var selected = network.getSelection();
        if (selected.nodes.length!=1) { // Only if just one is selected
            console.log("Only one device is supposed to be selected. Instead " + selected.nodes.length + " are selected.");
            return null;
        }
        return selected.nodes[0];
    }

    // Reveal public pointers to
    // private functions and properties
   return {
        load: loadTopology,
        getSelected: getSelection,
        getCoordinate: toNetworkMapCoordinate,
   };

})();

var DraggableDevice = function(el, canvasEl, deviceType) {
    this.el = el;
    this.originalPosition = {
        'left': el.css('left'),
        'top': el.css('top')
    };
    this.canvas = canvasEl;
    // FIXME too many callbacks here, it's too confusing
    this.creationCallback = function(elementOffset, callback) {
                                var x = elementOffset.left;
                                var y = elementOffset.top;
                                var position = networkMap.getCoordinate(x, y);
                                // We don't use the return
                                packetTracer.addDevice({
                                    "group": deviceType,
                                    "x": position.x,
                                    "y": position.y
                                }, callback);
                            };
    this.init();
}

// Source: http://stackoverflow.com/questions/5419134/how-to-detect-if-two-divs-touch-with-jquery
DraggableDevice.prototype.collisionsWithCanvas = function(draggingEl) {
    var x1 = this.canvas.offset().left;
    var y1 = this.canvas.offset().top;
    var h1 = this.canvas.outerHeight(true);
    var w1 = this.canvas.outerWidth(true);
    var b1 = y1 + h1;
    var r1 = x1 + w1;
    var x2 = draggingEl.offset().left;
    var y2 = draggingEl.offset().top;
    var h2 = draggingEl.outerHeight(true);
    var w2 = draggingEl.outerWidth(true);
    var b2 = y2 + h2;
    var r2 = x2 + w2;

    if (b1 < y2 || y1 > b2 || r1 < x2 || x1 > r2) return false;
    return true;
}

DraggableDevice.prototype.moveToStartingPosition = function() {
    var obj = this;
    this.el.animate({'opacity':'1'}, 1000, function() {
        obj.el.css({ // would be great with an animation too, but it doesn't work
            'left': obj.originalPosition.left,
            'top': obj.originalPosition.top
        });
    });
}

DraggableDevice.prototype.init = function() {
    var originalObj = this;
    this.el.draggable({
        helper: "clone",
        opacity: 0.4,
        /*revert: true, // It interferes with the position I want to capture in the 'stop' event
        revertDuration: 2000,*/
        start: function(event, ui) {
            $(this).css({'opacity':'0.7'});
        },
        /*drag: function(event, ui ) {
            console.log(event);
        },*/
        stop: function(event, ui) {
            if (originalObj.collisionsWithCanvas(ui.helper)) {
                var image = $('<img alt="Temporary image" src="' + ui.helper.attr("src") + '">');
                image.css("width", ui.helper.css("width"));
                var warning = $('<div class="text-in-image"><span>Creating...</span></div>');
                warning.prepend(image);
                $("body").append(warning);
                warning.css({'position': 'absolute',
                             'left': ui.offset.left,
                             'top': ui.offset.top});
                originalObj.creationCallback(ui.offset, function() {
                    originalObj.moveToStartingPosition();
                    warning.remove();
                });
            } else {
                originalObj.moveToStartingPosition();
            }
        }
    });
}

$(function() {
    var debugMode = getURLParameter('debug');
    if (debugMode!=null) {
        $.getScript("debug.js", function() {
            console.log("DEBUG MODE ON.");
        });
    }
    if (location.port==8000) {
        // If the page is deployed in the port 8000, it assumes that the python simple server is running
        // and the API is working in a different server.
        api_url = "http://localhost:8080/ptAnywhere/api";
        console.log("Using an API deployed in a different HTTP server: " + api_url)
    }

    $.widget( "custom.iconselectmenu", $.ui.selectmenu, {
        _renderItem: function( ul, item ) {
            var li = $( "<li>", { text: item.label } );
            if ( item.disabled ) {
                li.addClass( "ui-state-disabled" );
            }
            $( "<span>", {
                style: item.element.attr( "data-style" ),
                "class": "ui-icon " + item.element.attr( "data-class" )
             }).appendTo( li );
             return li.appendTo( ul );
        }
    });

    // Better with CSS?
    $("#create-device").hide();
    $("#modify-device").hide();
    $("#link-devices").hide();

    var networkCanvas = $("#network");
    var draggableCloud = new DraggableDevice($("#cloud"), networkCanvas, "cloud");
    var draggableRouter = new DraggableDevice($("#router"), networkCanvas, "router");
    var draggableSwitch = new DraggableDevice($("#switch"), networkCanvas, "switch");
    var draggablePc = new DraggableDevice($("#pc"), networkCanvas, "pc");

    networkMap.load();
});
