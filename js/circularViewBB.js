//		circular protein crosslink view
//
//		Martin Graham, Colin Combe, Rappsilber Laboratory, 2015


    var CLMSUI = CLMSUI || {};
    
    
    CLMSUI.circleLayout = function  (nodeArr, linkArr, featureArrs, range, options) {

        var defaults = {
            gap: 5,
            linkParse: function(link) { return {
                fromPos: link.fromPos, fromNodeID: link.fromNodeID, toPos: link.toPos, toNodeID: link.toNodeID
            }; },
            featureParse: function (feature, node) {
                return {
                    fromPos: feature.start - 1, 
                    toPos: feature.end// - 1
                };
            },
        };
        var _options = _.extend(defaults, options);

        var totalLength = nodeArr.reduce (function (total, interactor) {
            return total + interactor.size;    
        }, 0);


        var realRange = range[1] - range[0];
        var noOfGaps = nodeArr.length;
        // Fix so gaps never take more than a quarter the display circle in total
        _options.gap = Math.min ((realRange / 4) / noOfGaps, _options.gap);

        // work out the length a gap needs to be in the domain to make a _options.gap length in the range
        var ratio = totalLength / (realRange - (_options.gap * noOfGaps));
        var dgap = _options.gap * ratio;
        totalLength += dgap * noOfGaps;

        var scale = d3.scale.linear().domain([0,totalLength]).range(range);


        var nodeCoordMap = d3.map();
        var total = dgap / 2;   // start with half gap, so gap at top is symmetrical (like a double top)
        nodeArr.forEach (function (node) {
            var size = node.size;
            // start ... end goes from scale (0 ... size), 1 bigger than 1-indexed size
            nodeCoordMap.set (node.id, {id: node.id, name: node.name, rawStart: total, start: scale(total), end: scale(total + size), size: size});
            total += size + dgap;
            //console.log ("prot", nodeCoordMap.get(node.id));
        });
        

        var featureCoords = [];
        featureArrs.forEach (function (farr, i) {
            var nodeID = nodeArr[i].id;
            var nodeCoord = nodeCoordMap.get (nodeID);
            farr.forEach (function (feature) {
                var tofrom = _options.featureParse (feature, nodeID);
                //console.log ("nc", nodeCoord, tofrom.fromPos, tofrom.toPos, feature);
                featureCoords.push ({
                    id: feature.name,
                    nodeID: nodeID,
                    fstart: tofrom.fromPos + 1,
                    fend: tofrom.toPos,
                    start: scale (tofrom.fromPos + nodeCoord.rawStart),
                    end: scale (tofrom.toPos + nodeCoord.rawStart),
                });
            });   
        });
        
        var linkCoords = [];
        linkArr.forEach (function (link) {
            var tofrom = _options.linkParse (link);
            linkCoords.push ({
                id: link.id, 
                start: scale (0.5 + tofrom.fromPos + nodeCoordMap.get(tofrom.fromNodeID).rawStart), 
                end: scale (0.5 + tofrom.toPos + nodeCoordMap.get(tofrom.toNodeID).rawStart),
            });
        });
        
        // End result
        // 0...1...2...3...4...5...6...7...8...9...10 - node start - end range for protein length 10 (1-indexed)
        // ..1...2...3...4...5...6...7...8...9...10.. - link positions set to 1-indexed link pos minus 0.5
        // 0...2...............5..................... - feature range [2..5] starts at node start -1 to node end to cover approporiate links

        return { nodes: nodeCoordMap.values(), links: linkCoords, features: featureCoords};
    };
    
    CLMSUI.CircularViewBB = CLMSUI.utils.BaseFrameView.extend ({
        events: function() {
          var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
          if(_.isFunction(parentEvents)){
              parentEvents = parentEvents();
          }
          return _.extend({},parentEvents,{});
        },

        initialize: function (viewOptions) {
            CLMSUI.CircularViewBB.__super__.initialize.apply (this, arguments);
            
            var self = this;
            var defaultOptions = {
                nodeWidth: 10,  // this is a percentage measure
                tickWidth: 23,
                gap: 5,
                linkParse: function (link) { 
                    // turn toPos and fromPos to zero-based index
                    return {fromPos: link.fromResidue - 1, fromNodeID: link.fromProtein.id, 
                            toPos: link.toResidue - 1, toNodeID: link.toProtein.id};
                },
                featureParse: function (feature, nodeid) {  
                    // feature.start and .end are 1-indexed, and so are the returned convStart and convEnd values
                    var convStart = feature.start;
                    var convEnd = feature.end;
                    var alignModel = self.model.get("alignColl").get(nodeid);
                    if (alignModel) {
                        convStart = alignModel.mapToSearch ("Canonical", feature.start);
                        convEnd = alignModel.mapToSearch ("Canonical", feature.end);
                        if (convStart <= 0) { convStart = -convStart; }   // <= 0 indicates no equal index match, do the - to find nearest index
                        if (convEnd <= 0) { convEnd = -convEnd; }         // <= 0 indicates no equal index match, do the - to find nearest index
                    }
                    convStart = Math.max (0, convStart - 1);    // subtract one, but don't have negative values
                    //convEnd--;    // commented out as convEnd must extend by 1 so length of displayed range is (end-start) + 1
                    // e.g. a feature that starts/stops at some point has length of 1, not 0
                    
                    console.log ("convStart", feature.start, convStart, "convEnd", feature.end, convEnd);
                    return {fromPos: convStart, toPos: convEnd};
                },
            };
            this.options = _.extend(defaultOptions, viewOptions.myOptions);

            this.displayEventName = viewOptions.displayEventName;

            // this.el is the dom element this should be getting added to, replaces targetDiv
            var mainDivSel = d3.select(this.el);
            // defs to store path definitions for curved text, two nested g's, one for translating, then one for rotating
            var template = _.template ("<DIV style='height:40px'><button class='<%= buttonClass %>'><%= buttonLabel %></button></DIV>"+
                                       "<DIV class='panelInner circleDiv' style='height:calc(100% - 40px)'><svg class='<%= svgClass %>'><defs></defs><g><g></g></g></svg></DIV>");
            mainDivSel.append("div")
                .attr ("class", "panelInner")
                .html(
                    template ({
                        svgClass: "circularView", 
                        buttonClass: "btn btn-1 btn-1a downloadButton", 
                        buttonLabel: "Export SVG",
                    })
                )
            ;
            
            var degToRad = Math.PI / 180;
            
            // Lets user rotate diagram
            var drag = d3.behavior.drag();
            drag.on ("dragstart", function() {
                var curTheta = d3.transform (svg.select("g g").attr("transform")).rotate * degToRad;
                var mc = d3.mouse(this);
                var dragStartTheta = Math.atan2 (mc[1] - self.radius, mc[0] - self.radius);
                drag.offTheta = curTheta - dragStartTheta;
            })
            .on ("drag", function() {
                var dmc = d3.mouse(this);
                var theta = Math.atan2 (dmc[1] - self.radius, dmc[0] - self.radius);
                theta += drag.offTheta;
                svg.select("g g").attr("transform", "rotate("+(theta / degToRad)+")");
            });
            
            var svg = mainDivSel.select("svg")
                .call (drag)
            ;       
 
            // Cycle colours through features
            this.color = d3.scale.ordinal()
                .domain([0,2])
                .range(["#beb", "#ebb" , "#bbe"])
            ;
            
            this.line = d3.svg.line.radial()
                .interpolate("bundle")
                .tension(0.45)
                .radius(function(d) { return d.rad; })
                .angle(function(d) { return d.ang * degToRad; })
            ;
            
            var arcs = ["arc", "textArc", "featureArc"];
            arcs.forEach (function(arc) {
                this[arc] = d3.svg.arc()
                    .innerRadius(90)
                    .outerRadius(100)
                    .startAngle(function(d) { return d.start * degToRad; }) // remembering to convert from degs to radians
                    .endAngle(function(d) { return d.end * degToRad; })
                ;
            }, this);
                           
            this.clearTip = function () {
                self.model.get("tooltipModel").set("contents", null);
            };
                
            this.nodeTip = function (d) {
                var interactor = self.model.get("clmsModel").get("interactors").get(d.id);
                self.model.get("tooltipModel")
                    .set("header", interactor.name.replace("_", " "))
                    .set("contents", [
                        ["ID", interactor.id], ["Accession", interactor.accession],["Size", interactor.size]
                    ])
                    .set("location", {pageX: d3.event.pageX, pageY: d3.event.pageY})
                ;
            };
                
            this.linkTip = function (d) {
                var xlink = self.model.get("clmsModel").get("crossLinks").get(d.id);
                self.model.get("tooltipModel")
                    .set("header", "Cross Link")
                    .set("contents", [
                        ["From", xlink.fromResidue, xlink.fromProtein.name],
                        ["To", xlink.toResidue, xlink.toProtein.name],
                        ["Current<br>Matches", xlink.filteredMatches.length]
                    ])
                    .set("location", {pageX: d3.event.pageX, pageY: d3.event.pageY})
                ;
            };
            
            this.featureTip = function (d) {
                self.model.get("tooltipModel")
                    //.set("header", d.id.replace("_", " "))
                    .set("header", "Feature")  
                    .set("contents", [
                        ["Name", d.id],
                        ["Start", d.fstart],
                        ["End", d.fend]
                    ])
                    .set("location", {pageX: d3.event.pageX, pageY: d3.event.pageY})
                ;
            };
                
            // listen to custom filteringDone event from model    
            this.listenTo (this.model, "filteringDone", function () { this.render ({changed : d3.set(["links"]), }); });  
            //this.listenTo (this.model.get("rangeModel"), "change:scale", this.relayout); 
            this.listenTo (this.model, "change:selection", this.showSelected); 
            this.listenTo (this.model, "change:highlights", this.showHighlighted); 
            this.listenTo (this.model.get("alignColl"), "change:compAlignments", function (alignModel, alignColl) { 
                console.log ("CIRCULAR VIEW AWARE OF ALIGN CHANGES", arguments); 
                this.render ({changed : d3.set(["features"]), });   
            });
            this.listenTo (this.model, "change:linkColourAssignment", function () { this.render ({changed : d3.set(["links"]), }); });
            
            return this;
        },
        
        idFunc: function (d) { return d.id; },
        
        showSelected: function () {
            var selectedIDs = this.model.get("selection").map((function(xlink) { return xlink.id; }));
            var idset = d3.set (selectedIDs);
            var thickLinks = d3.select(this.el).selectAll(".circleGhostLink");
            thickLinks.classed ("selectedCircleLink", function(d) { return idset.has(d.id); });
            return this;
        },
        
        showHighlighted: function () {
           var highlights = this.model.get("highlights");
           if (highlights) {
                var highlightedIDs = highlights.map((function(xlink) { return xlink.id; }));
                var idset = d3.set (highlightedIDs);
                var thickLinks = d3.select(this.el).selectAll(".circleGhostLink");
                thickLinks.classed ("highlightedCircleLink", function(d) { return idset.has(d.id); });
           }
            return this;
        },
        
        actionNodeLinks: function (nodeId, actionType, startPos, endPos) {
            var crossLinks = this.model.get("clmsModel").get("crossLinks");
            var filteredCrossLinks = this.filterCrossLinks (crossLinks);
            var anyPos = startPos == undefined && endPos == undefined;
            startPos = startPos || 0;
            endPos = endPos || 100000;
            var matchLinks = filteredCrossLinks.filter (function(link) {
                return (link.fromProtein.id === nodeId && (anyPos || (link.fromResidue >= startPos && endPos >= link.fromResidue))) ||
                        (link.toProtein.id === nodeId && (anyPos || (link.toResidue >= startPos && endPos >= link.toResidue)));
            });
            this.model.set (actionType, matchLinks);
        },
        
        convertLinks: function (links, rad1, rad2) {
            var xlinks = this.model.get("clmsModel").get("crossLinks");
            var newLinks = links.map (function (link) {
                var xlink = xlinks.get (link.id);
                var homom = CLMSUI.modelUtils.linkHasHomomultimerMatch (xlink);
                var rad = homom ? rad2 : rad1;
                var bowRadius = homom ? rad2 * 1.3 : 0;
                return {id: link.id, coords: [{ang: link.start, rad: rad},{ang: (link.start + link.end) / 2, rad: bowRadius}, {ang: link.end, rad: rad}] };
            });
            return newLinks;
        },
	
        getMaxRadius: function (d3sel) {
            var zelem = $(d3sel.node());
            return Math.min (zelem.width(), zelem.height()) / 2;
        },
        
        filterInteractors: function (interactors) {
            var filteredInteractors = [];
            interactors.forEach (function (value) {
                if (!value.isDecoy()) {
                    filteredInteractors.push (value);
                }
            });
            return filteredInteractors;
        },
        
        filterCrossLinks: function (crossLinks) {
            var filteredCrossLinks = [];
            crossLinks.forEach (function (value) {
                if (value.filteredMatches && value.filteredMatches.length > 0 && !value.fromProtein.isDecoy() && !value.toProtein.isDecoy()) {
                    filteredCrossLinks.push (value);
                }
            });
            return filteredCrossLinks;
        },
        
        filterFeatures: function (features) {
            return features ? features.filter (function (f) { return f.category === "DOMAIN"; }) : [];
        },

        render: function (options) {
            console.log ("render args", arguments);
            var changed = options ? options.changed : undefined;
            
            if (CLMSUI.utils.isZeptoDOMElemVisible (this.$el)) {

                console.log ("re-rendering circular view");
                
                var interactors = this.model.get("clmsModel").get("interactors");
                var crossLinks = this.model.get("clmsModel").get("crossLinks");
                //console.log ("model", this.model);
                
                var filteredInteractors = this.filterInteractors (interactors);
                var filteredCrossLinks = this.filterCrossLinks (crossLinks);
                var filteredFeatures = filteredInteractors.map (function (inter) {
                    return this.filterFeatures (inter.uniprotFeatures);
                }, this);
                
                //console.log ("filteredFeatures", filteredFeatures);
                var layout = CLMSUI.circleLayout (filteredInteractors, filteredCrossLinks, filteredFeatures, [0,360], this.options);
                //console.log ("layout", layout);

                var svg = d3.select(this.el).select("svg");
                this.radius = this.getMaxRadius (svg);
                var tickRadius = this.radius - this.options.tickWidth;
                var innerNodeRadius = tickRadius * ((100 - this.options.nodeWidth) / 100);
                var innerFeatureRadius = tickRadius * ((100 - (this.options.nodeWidth* 0.7)) / 100);
                var textRadius = (tickRadius + innerNodeRadius) / 2;
                
                this.arc.innerRadius(innerNodeRadius).outerRadius(tickRadius);
                this.featureArc.innerRadius(innerFeatureRadius).outerRadius(tickRadius);
                this.textArc.innerRadius(textRadius).outerRadius(textRadius); // both radii same for textArc
                
                var nodes = layout.nodes;
                var links = layout.links;
                var features = layout.features;
                // turns link end & start angles into something d3.svg.arc can use
                var linkCoords = this.convertLinks (links, innerNodeRadius, tickRadius);    
                //console.log ("linkCoords", linkCoords);
                
                var gTrans = svg.select("g");
                gTrans.attr("transform", "translate(" + this.radius + "," + this.radius + ")");
                var gRot = gTrans.select("g");
                //gRot.attr("transform", "rotate(0)");  
                
                // draw links
                if (!changed || changed.has("links")) {
                    this.drawLinks (gRot, linkCoords);
                }
                if (!changed) {
                    // draw nodes (around edge)
                    this.drawNodes (gRot, nodes);
                    // draw scales on nodes - adapted from http://bl.ocks.org/mbostock/4062006
                    this.drawNodeTicks (gRot, nodes, tickRadius);
                }
                if (!changed || changed.has("features")) {
                     // draw features
                    this.drawFeatures (gRot, features);
                }
                if (!changed) {
                    // draw names on nodes
                    this.drawNodeText (gRot, nodes);
                }
            }

            return this;
        },
        
        drawLinks: function (g, links) {
            
            var self = this;
            var crossLinks = this.model.get("clmsModel").get("crossLinks");
            var colourScheme = this.model.get("linkColourAssignment");
            
            // draw thin links
            var linkJoin = g.selectAll(".circleLink").data(links, self.idFunc);
            linkJoin.exit().remove();
            linkJoin.enter()
                .append("path")
                    .attr("class", "circleLink")
            ;
            linkJoin
                .attr("d", function(d) { return self.line(d.coords); })
                .style("stroke", function(d) { return colourScheme (crossLinks.get(d.id)); })
            ;

            // draw thick, invisible links (used for highlighting and mouse event capture)
            var ghostLinkJoin = g.selectAll(".circleGhostLink").data(links, self.idFunc);
            ghostLinkJoin.exit().remove();
            ghostLinkJoin.enter()
                .append("path")
                    .attr("class", "circleGhostLink")
                    .on ("mouseenter", function(d) {
                        self.linkTip (d);
                        self.model.set ("highlights", [crossLinks.get(d.id)]);
                    })
                    .on ("mouseleave", function() {
                        self.clearTip ();
                        self.model.set ("highlights", []);
                    })
                    .on ("click", function (d) {
                        self.model.set ("selection", [crossLinks.get(d.id)]);
                    })
            ;
            ghostLinkJoin
                .attr("d", function(d) { return self.line(d.coords); })
            ;
        },
        
        drawNodes: function (g, nodes) {
            var self = this;
            var nodeJoin = g.selectAll(".circleNode").data(nodes, self.idFunc);

            nodeJoin.exit().remove();

            nodeJoin.enter()
                .append('path')
                    .attr("class", "circleNode")
                    .on("mouseenter", function(d) {
                        self.nodeTip (d);
                        self.actionNodeLinks (d.id, "highlights");
                    })
                    .on("mouseleave", function() {
                        self.clearTip (); 
                        self.model.set ("highlights", []);
                    })
                    .on("click", function(d) {
                        self.actionNodeLinks (d.id, "selection");
                    })
            ;

            nodeJoin
                .attr("d", this.arc)
            ;    
            
            return this;
        },
        
        drawNodeTicks: function (g, nodes, radius) {
            var self = this;
            var tot = nodes.reduce (function (total, node) {
                return total + node.size;    
            }, 0);
           
            var tickGap = Math.ceil ((tot / 360) * 5 / 20) * 20;
            
            var groupTicks = function (d) {
              var k = (d.end - d.start) / d.size;
              var tRange = d3.range(0, d.size, tickGap);
              tRange[0] = 1;
              tRange[tRange.length-1] = d.size;
              return tRange.map(function(v, i) {
                return {
                  angle: (((v-1) + 0.5) * k) + d.start, // -1 cos we want 1 to be at the zero pos angle, +0.5 cos we want it to be a tick in the middle
                  label: i % 5 && i < tRange.length - 1 ? null : v,
                };
              });
            };

            var groupTickJoin = g.selectAll("g.tickGroups")
                .data(nodes, self.idFunc)
            ;

            groupTickJoin.exit().remove();

            groupTickJoin.enter()
                .append("g")
                .attr ("class", "tickGroups")
            ;


            var indTickJoin = groupTickJoin.selectAll("g.tick")
                .data(groupTicks)
            ;

            indTickJoin.exit().remove();

            var newTicks = indTickJoin.enter()
                .append("g")
                .attr("class", "tick")
            ;

            var llength = Math.min (this.options.tickWidth, 5);
            newTicks.append("line")
                .attr("x1", 1)
                .attr("y1", 0)
                .attr("x2", llength)
                .attr("y2", 0)
            ;

            newTicks.append("text")
                .attr("x", 8)
                .attr("dy", ".35em")
                .classed ("justifyTick", function(d) { return d.angle > 180; })
                .text(function(d) { return d.label; })
            ;

            indTickJoin
                .attr("transform", function(d) {
                    return "rotate(" + (d.angle - 90) + ")" + "translate(" + radius + ",0)";
                })
            ;
            
            return this;
        },
        
        drawNodeText: function (g, nodes) {
            var self = this;
            
            var defs = d3.select(this.el).select("svg defs");
            var pathId = function (d) { return self.el.id + d.id; };
            
            // only add names to nodes with 10 degrees of display or more
            var tNodes = nodes.filter (function(d) { return (d.end - d.start) > 10; });
            
            var pathJoin = defs.selectAll("path").data (tNodes, self.idFunc);
            pathJoin.exit().remove();
            pathJoin.enter().append("path")
                .attr("id", pathId)
            ;
            pathJoin
                .attr("d", function(d) {
                    var pathd = self.textArc (d);
                    // console.log ("pathd", pathd);
                    // only want one curve, not solid arc shape, so chop path string
                    var cutoff = pathd.indexOf("L");
                    if (cutoff >= 0) {
                        var midAng = (d.start + d.end) / 2;
                        // use second curve in arc for labels on bottom of circle to make sure text is left-to-right + chop off end 'Z',
                        // use first curve otherwise
                        pathd = (midAng > 90 && midAng < 270) ? 
                            "M" + pathd.substring (cutoff + 1, pathd.length - 1) : pathd.substring (0, cutoff);
                    }
                    return pathd;
                })
            ;
            
            var textJoin = g.selectAll("text.circularNodeLabel")
                .data (tNodes, self.idFunc)
            ;
            textJoin.exit().remove();
            textJoin.enter()
                .append("text")
                .attr ("class", "circularNodeLabel")
                    .attr ("dy", "0.3em")
                    .append("textPath")
                        .attr("startOffset", "50%")
                        .attr("xlink:href", function(d) { return "#" + pathId(d); })  
                        .text (function(d) { return d.name.replace("_", " "); })
            ;
            
            return this;
        },
        
        drawFeatures : function (g, features) {
            var self = this;
            var featureJoin = g.selectAll(".circleFeature").data(features, self.idFunc);

            featureJoin.exit().remove();

            featureJoin.enter()
                .append('path')
                    .attr("class", "circleFeature")
                    .on("mouseenter", function(d) {
                        self.featureTip (d);
                        self.actionNodeLinks (d.nodeID, "highlights", d.fstart, d.fend);
                    })
                    .on ("mouseleave", function() {
                        self.clearTip ();
                        self.model.set ("highlights", []);
                    })
                    .on("click", function(d) {
                        self.actionNodeLinks (d.nodeID, "selection", d.fstart, d.fend);
                    })
            ;
            

            featureJoin
                .attr("d", this.featureArc)
                .style("fill", function(d,i) { return self.color(i); })
            ;    
            
            return this;
        },
        
        relayout: function () {
            this.render();
            return this;     
        },

        // removes view
        // not really needed unless we want to do something extra on top of the prototype remove function (like destroy c3 view just to be sure)
        remove: function () {
            CLMSUI.CircularViewBB.__super__.remove.apply (this, arguments);    
        }
    });