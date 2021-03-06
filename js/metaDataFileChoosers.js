//		Backbone view and controller for NGL 3D viewer
//
//		Martin Graham, Colin Combe, Rappsilber Laboratory, Alex Rose, PDB
//
//		js/PDBFileChooser.js

    var CLMSUI = CLMSUI || {};

	CLMSUI.AbstractMetaDataFileChooserBB = CLMSUI.utils.BaseFrameView.extend ({
		
		events: function() {
            var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
            if (_.isFunction (parentEvents)) {
                parentEvents = parentEvents();
            }
            return _.extend ({}, parentEvents, {
                "change .selectMetaDataFileButton": "selectMetaDataFile",
            });
        },
		
		defaultOptions: {
           	expandTheseKeys: d3.set (["example"]),
			removeTheseKeys: d3.set (["sectionName", "id"]),
		},
		
		initialize: function (viewOptions) {
            CLMSUI.AbstractMetaDataFileChooserBB.__super__.initialize.apply (this, arguments);

			var self = this;
			
            // this.el is the dom element this should be getting added to, replaces targetDiv
            var mainDivSel = d3.select(this.el);

            var wrapperPanel = mainDivSel.append("div")
                .attr ("class", "panelInner")
            ;
            
            var toolbar = wrapperPanel.append("div").attr("class", "toolbar");
            
            toolbar.append("label")
                .attr("class", "btn btn-1 btn-1a fakeButton")
                .append("span")
                    .text(self.options.buttonText)
                    .append("input")
                        .attr({type: "file", accept: "text/csv,.csv", class: "selectMetaDataFileButton"})
            ;
            
            wrapperPanel.append("div").attr("class", "messagebar").style("display", "none");
			
			var formatPanel = wrapperPanel.append("div").attr("class", "expectedFormatPanel");
			
			var sectionData = [this.options.expectedFormat];
			sectionData[0].id = "ExpectedFormat";
			sectionData[0].sectionName = "Expected CSV Format";

			var headerFunc = function(d) { return d.sectionName; };
			var rowFilterFunc = function(d) { 
				var rows = d3.entries(d);
				var badKeys = self.options.removeTheseKeys;
				return rows.filter (function (row) {
					return !badKeys || !badKeys.has(row.key); 
				});
			};
			var cellFunc = function (d) { d3.select(this).html (d.value); };

			CLMSUI.utils.sectionTable.call (this, formatPanel, sectionData, mainDivSel.attr("id"), ["Row Type", "Format"], headerFunc, rowFilterFunc, cellFunc, []);
			
            this.listenTo (CLMSUI.vent, self.options.loadedEventName, function (metaMetaData) {
				var columns = metaMetaData.columns;
				var matchedItemCount = metaMetaData.matchedItemCount;
				var success = columns && columns.length && matchedItemCount ? true : false;
				var msg1 = _.template(this.options.parseMsgTemplate)({attrCount: columns ? columns.length : 0, itemCount: matchedItemCount});
                self.setStatusText ("File "+this.lastFileName+":<br>"+(success ? "" : "Error! ") + msg1, success); 
            });
        },
        
        setStatusText : function (msg, success) {
			var mbar = d3.select(this.el).select(".messagebar").style("display", null);
			var t = mbar.html(msg).transition().delay(0).duration(1000).style("color", (success === false ? "red" : (success ? "blue" : null)));
			if (success !== undefined) {
				t.transition().duration(5000).style("color", "#091d42");
			}
        },
        
        selectMetaDataFile: function (evt) {
            var fileObj = evt.target.files[0];
            this.setStatusText ("Please Wait...");
            this.lastFileName = fileObj.name;
			var onLoadFunc = this.onLoadFunction.bind (this);
            CLMSUI.modelUtils.loadUserFile (fileObj, onLoadFunc);    
        },
        
        identifier: "An Abstract MetaData File Chooser",
	});

	CLMSUI.ProteinMetaDataFileChooserBB = CLMSUI.AbstractMetaDataFileChooserBB.extend ({

        initialize: function (viewOptions) {
			var myDefaults = {
				buttonText: "Select Protein MetaData CSV File",
				loadedEventName: "proteinMetadataUpdated",
				parseMsgTemplate: "Parsed <%= attrCount %> MetaData Attributes across <%= itemCount %> Identified Proteins",
				expectedFormat: {
					header: "Accession,{MetaData1 Name}*,{MetaData2 Name} etc",
					data: "{Protein Accession Number},{number or string},{number or string}",
					example: [
						{"csv file": ["Accession", "Name", "Value"]},
						{csv: ["P02768-A,Human Protein,0.79"]}, 
						{csv: ["G3RE98,Gorilla Protein,0.58"]},
					],
					notes: "*If a MetaData column name is 'Name' it will change displayed protein names"
				}
			};
			viewOptions.myOptions = _.extend (myDefaults, viewOptions.myOptions);
            CLMSUI.ProteinMetaDataFileChooserBB.__super__.initialize.apply (this, arguments);
        },
		
		onLoadFunction: function (fileContents) {
			var clmsModel = this.model.get("clmsModel");
			CLMSUI.modelUtils.updateProteinMetadata (fileContents, clmsModel);
		},
        
        identifier: "Protein MetaData File Chooser",
    });


	CLMSUI.LinkMetaDataFileChooserBB = CLMSUI.AbstractMetaDataFileChooserBB.extend ({

        initialize: function (viewOptions) {
			var myDefaults = {
				buttonText: "Select Cross-Link MetaData CSV File",
				loadedEventName: "linkMetadataUpdated",
				parseMsgTemplate: "Parsed <%= attrCount %> MetaData Attributes across <%= itemCount %> Identified Cross-Links",
				expectedFormat: {
					header: "LinkID, or all of Protein 1,SeqPos 1,Protein 2,SeqPos 2, then {MetaData1 Name},{MetaData2 Name} etc",
					rows: "{ProteinID}_{SeqPos1}-{ProteinID}_{SeqPos2}, or {Accession|Name|ProteinID},{SeqPos1},{Accession|Name|ProteinID},{SeqPos2}, then {number or #color} etc",
					example: [
						{"csv file": ["Protein 1", "SeqPos 1","Protein 2","SeqPos 2","Quantitation", "Fixed Colour"]}, 
						{csv: ["sp|P02768-A|ALBU_HUMAN","107","sp|P02768-A|ALBU_HUMAN","466", "57.07","#FF8800"]},
						{csv: ["sp|P02768-A|ALBU_HUMAN","126","sp|P02768-A|ALBU_HUMAN","426", "52.04","#FFaa00"]}
					],
					notes: "Protein 1 and Protein 2 fields will be split by | and the individual parts parsed to find a name or accession number"
				}
			};
			viewOptions.myOptions = _.extend (myDefaults, viewOptions.myOptions);
            CLMSUI.LinkMetaDataFileChooserBB.__super__.initialize.apply (this, arguments);
        },
		
		onLoadFunction: function (fileContents) {
			var clmsModel = this.model.get("clmsModel");
			CLMSUI.modelUtils.updateLinkMetadata (fileContents, clmsModel);
		},
        
        identifier: "Cross-Link MetaData File Chooser",
    });
