/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/array",
    "firebug/chrome/reps",
    "firebug/chrome/menu",
],
function(Obj, Firebug, FBTrace, Events, Locale, Dom, Domplate, Arr, FirebugReps, Menu) {

// ********************************************************************************************* //
// EventMonitor Module

var EventMonitor = Obj.extend(Firebug.Module,
{
    dispatchName: "eventMonitor",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);
        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Firebug.unregisterUIListener(this);
        Firebug.Module.shutdown.apply(this, arguments);
    },

    destroyContext: function(context, persistedState)
    {
        // Clean up all existing monitors.
        var monitoredEvents = context.monitoredEvents;
        if (monitoredEvents)
        {
            for (var i=0; i<monitoredEvents.length; ++i)
            {
                var m = monitoredEvents[i];

                if (!m.type)
                    Events.detachAllListeners(m.object, context.onMonitorEvent, context);
                else
                    Events.removeEventListener(m.object, m.type, context.onMonitorEvent, false);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Monitor

    toggleMonitorEvents: function(object, types, monitor, context)
    {
        if (monitor)
            this.monitorEvents(object, types, context);
        else
            this.unmonitorEvents(object, types, context);
    },

    monitorEvents: function(object, types, context)
    {
        if (object && object.addEventListener)
        {
            if (!context.onMonitorEvent)
            {
                var self = this;
                context.onMonitorEvent = function(event) {
                    self.onMonitorEvent(event, context);
                };
            }

            if (!context.monitoredEvents)
                context.monitoredEvents = new Map();

            var monitoredEvents = context.monitoredEvents;
            var eventTypes = getMonitoredEventTypes(types);

            if (FBTrace.DBG_EVENTS)
                FBTrace.sysout("EventMonitor.monitorEvents", eventTypes);

            if (!context.monitoredEvents.has(object))
                context.monitoredEvents.set(object, new Set());

            var monitoredEventTypes = monitoredEvents.get(object);
            for (var i = 0, len = eventTypes.length; i < len; ++i)
            {
                if (!this.areEventsMonitored(object, eventTypes[i], context))
                {
                    Events.addEventListener(object, eventTypes[i], context.onMonitorEvent, false);
                    monitoredEventTypes.add(eventTypes[i]);
                }
            }
        }
    },

    unmonitorEvents: function(object, types, context)
    {
        var monitoredEvents = context.monitoredEvents;

        if (!monitoredEvents)
            return;

        var eventTypes = getMonitoredEventTypes(types);

        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("EventMonitor.unmonitorEvents", eventTypes);

        if (object)
        {
            if (monitoredEvents.has(object))
            {
                var monitoredObjectEvents = monitoredEvents.get(object);
                for (var i = 0, len = eventTypes.length; i < len; ++i)
                {
                     if (monitoredObjectEvents.has(eventTypes[i]))
                     {
                        Events.removeEventListener(object, eventTypes[i],
                            context.onMonitorEvent, false);
                        monitoredObjectEvents["delete"](eventTypes[i]);
                     }
                }
            }
        }
    },

    areEventsMonitored: function(object, types, context, allMonitored)
    {
        var monitoredEvents = context.monitoredEvents;
        if (!monitoredEvents)
        {
            if (FBTrace.DBG_EVENTS)
                FBTrace.sysout("EventMonitor.areEventsMonitored - No events monitored", object);

            return false;
        }

        var eventTypes = getMonitoredEventTypes(types);
        var monitoredObjectEvents = monitoredEvents.get(object);
        if (!monitoredObjectEvents)
            return;

        if (typeof allMonitored == "undefined")
            allMonitored = true;

        for (var i = 0, len = eventTypes.length; i < len; ++i)
        {
            var monitored = monitoredObjectEvents.has(eventTypes[i]);

            if (!monitored)
            {
                if (FBTrace.DBG_EVENTS)
                {
                    FBTrace.sysout("EventMonitor.areEventsMonitored - Events not monitored for '" +
                        eventTypes[i] + "'");
                }

                if (allMonitored)
                    return false;
            }
            else
            {
                if (FBTrace.DBG_EVENTS)
                {
                    FBTrace.sysout("EventMonitor.areEventsMonitored - Events monitored for '" +
                        eventTypes[i] + "'");
                }

                if (!allMonitored)
                    return true;
            }
        }

        return allMonitored;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Logging

    onMonitorEvent: function(event, context)
    {
        var obj = new EventLog(event);
        Firebug.Console.log(obj, context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (panel.name != "html")
            return;

        var before = popup.querySelector("#fbScrollIntoView");
        if (!before)
            return [];

        var elt = object;

        // Create sub-menu-items for "Log Event"
        var logEventItems = [];
        var eventFamilies = Events.getEventFamilies();
        for (var i=0, count=eventFamilies.length; i<count; ++i)
        {
            logEventItems.push({
                label: eventFamilies[i],
                tooltiptext: "Monitor " + eventFamilies[i] + " events",
                id: "monitor" + eventFamilies[i] + "Events",
                type: "checkbox",
                checked: this.areEventsMonitored(elt, eventFamilies[i], context),
                command: Obj.bind(this.onToggleMonitorEvents, this, elt,
                    eventFamilies[i], context)
            });
        }

        var item = {
            label: "ShowEventsInConsole",
            tooltiptext: "html.tip.Show_Events_In_Console",
            id: "fbShowEventsInConsole",
            type: "checkbox",
            checked: this.areEventsMonitored(elt, null, context, false),
            command: Obj.bind(function(evt)
            {
                var checked = evt.target.getAttribute("checked") == "true";
                EventMonitor.toggleMonitorEvents(elt, null, !checked, context);
            }, elt),
            items: logEventItems
        };

        var logEventsItem = Menu.createMenuItem(popup, item, before);
        var separator = Menu.createMenuItem(popup, "-", before);

        return [];
    },

    onToggleMonitorEvents: function(event, elt, type, context)
    {
        var checked = event.target.getAttribute("checked") == "true";
        this.toggleMonitorEvents(elt, type, checked, context);

        Events.cancelEvent(event);

        // Toggle the main "Log Events" option depending on whether all events are monitored  
        var doc = event.target.ownerDocument;
        var logEvents = doc.getElementById("fbShowEventsInConsole");
        logEvents.setAttribute("checked", this.areEventsMonitored(elt, null, context, false));
    },
});

// ********************************************************************************************* //
// Helpers

function getMonitoredEventTypes(types)
{
    var eventTypes = [];
    if (!types)
    {
        eventTypes = Events.getEventTypes();
    }
    else
    {
        if (typeof types == "string")
        {
            eventTypes = Events.isEventFamily(types) ? Events.getEventTypes(types) : [types];
        }
        else
        {
            for (var i = 0; i < types.length; ++i)
            {
                if (Events.isEventFamily(types[i]))
                {
                    var familyEventTypes = Events.getEventTypes(types[i]);
                    for (var j = 0; j < familyEventTypes.length; ++j)
                        eventTypes.push(familyEventTypes[j]);
                }
                else
                {
                    eventTypes.push(types[i]);
                }
            }
        }
    }

    return eventTypes;
}

// ********************************************************************************************* //
// Rep Object

var EventLog = function(event)
{
    this.event = event;
};

// ********************************************************************************************* //
// Rep Template

with (Domplate) {
var EventLogRep = domplate(FirebugReps.Event,
{
    className: "eventLog",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    tag:
        TAG("$copyEventTag", {object: "$object|copyEvent"}),

    copyEventTag:
        SPAN(
            FirebugReps.OBJECTLINK("$object|summarizeEvent"),
            SPAN("&nbsp"),
            SPAN("&#187;"),
            SPAN("&nbsp"),
            TAG("$object|getTargetTag", {object: "$object|getTarget"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    copyEvent: function(log)
    {
        return new Dom.EventCopy(log.event);
    },

    getTarget: function(event)
    {
        return event.target;
    },

    getTargetTag: function(event)
    {
        var rep = Firebug.getRep(event.target);
        return rep.shortTag ? rep.shortTag : rep.tag;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return object instanceof EventLog;
    },
})};

// ********************************************************************************************* //
// CommandLine Support

function monitorEvents(context, args)
{
    var object = args[0];
    var types = args[1];

    EventMonitor.monitorEvents(object, types, context);
    return Firebug.Console.getDefaultReturnValue(context.window);
}

function unmonitorEvents(context, args)
{
    var object = args[0];
    var types = args[1];

    EventMonitor.unmonitorEvents(object, types, context);
    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(EventMonitor);
Firebug.registerRep(EventLogRep);

Firebug.registerCommand("monitorEvents", {
    handler: monitorEvents.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/monitorEvents",
    description: Locale.$STR("console.cmd.help.monitorEvents")
});

Firebug.registerCommand("unmonitorEvents", {
    handler: unmonitorEvents.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/unmonitorEvents",
    description: Locale.$STR("console.cmd.help.unmonitorEvents")
});

return EventMonitor;

// ********************************************************************************************* //
});
