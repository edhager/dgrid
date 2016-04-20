define([
	'./List',
	'./_StoreMixin',
	'dojo/_base/declare',
	'dojo/_base/lang',
	'dojo/dom-construct',
	'dojo/on',
	'dojo/when',
	'../util/misc',
	'./hyperscript'
], function (List, _StoreMixin, declare, lang, domConstruct, on, when, miscUtil, h) {

	return declare([ List, _StoreMixin ], {
		// summary:
		//		Extends List to include virtual scrolling functionality, querying a
		//		dojo/store instance for the appropriate range when the user scrolls.

		// rowsPerPage: Integer
		//		The number of rows to request at one time.
		rowsPerPage: 25,

		// bufferRows: Integer
		//	  The number of rows to keep ready on each side of the viewport area so that the user can
		//	  perform local scrolling without seeing the grid being built. Increasing this number can
		//	  improve perceived performance when the data is being retrieved over a slow network.
		bufferRows: 10,

		// pagingMethod: String
		//		Method (from dgrid/util/misc) to use to either throttle or debounce
		//		requests.  Default is "debounce" which will cause the grid to wait until
		//		the user pauses scrolling before firing any requests; can be set to
		//		"throttleDelayed" instead to progressively request as the user scrolls,
		//		which generally incurs more overhead but might appear more responsive.
		pagingMethod: 'debounce',

		// pagingDelay: Integer
		//		Indicates the delay (in milliseconds) imposed upon pagingMethod, to wait
		//		before paging in more data on scroll events. This can be increased to
		//		reduce client-side overhead or the number of requests sent to a server.
		pagingDelay: miscUtil.defaultDelay,

		// keepScrollPosition: Boolean
		//		When refreshing the list, controls whether the scroll position is
		//		preserved, or reset to the top.  This can also be overridden for
		//		specific calls to refresh.
		keepScrollPosition: false,

		// rowHeight: Number
		//		Average row height, computed in renderQuery during the rendering of
		//		the first range of data.
		rowHeight: 0,

		postCreate: function () {
			this.inherited(arguments);

			this._debouncedProcessScroll = miscUtil[this.pagingMethod](function (event) {
				this._processScroll(event);
			}, this, this.pagingDelay);
		},

		_scrollHandler: function (event) {
			var grid = event.target.grid;
			grid.inherited(arguments);
			grid._debouncedProcessScroll(event);
		},

		refresh: function (options) {
			// summary:
			//		Refreshes the contents of the grid.
			// options: Object?
			//		Optional object, supporting the following parameters:
			//		* keepScrollPosition: like the keepScrollPosition instance property;
			//			specifying it in the options here will override the instance
			//			property's value for this specific refresh call only.

			var keep = (options && options.keepScrollPosition);

			// Fall back to instance property if option is not defined
			if (typeof keep === 'undefined') {
				keep = this.keepScrollPosition;
			}

			// Store scroll position to be restored after new total is received
			if (keep) {
				this._previousScrollPosition = this.getScrollPosition();
			}

			this.inherited(arguments);
			if (this._renderedCollection) {
				// render the query

				// renderQuery calls _trackError internally
				return this._processScroll();
			}
		},

		resize: function () {
			this.inherited(arguments);
			if (!this.rowHeight) {
				this._calcAverageRowHeight(
					this.contentNode.domNode ? this.contentNode.domNode.getElementsByClassName('dgrid-row') : []
				);
			}
			this._processScroll();
		},

		cleanup: function () {
			this.inherited(arguments);
			this.preload = null;
		},

		_getFirstRowSibling: function (container) {
			// summary:
			//		Returns the DOM node that a new row should be inserted before
			//		when there are no other rows in the current result set.
			//		In the case of OnDemandList, this will always be the last child
			//		of the container (which will be a trailing preload node).
			return container.lastChild;
		},

		_calcRowHeight: function (rowElement) {
			// summary:
			//		Calculate the height of a row. This is a method so it can be overriden for
			//		plugins that add connected elements to a row, like the tree

			var sibling = rowElement.nextSibling;

			// If a next row exists, compare the top of this row with the
			// next one (in case "rows" are actually rendering side-by-side).
			// If no next row exists, this is either the last or only row,
			// in which case we count its own height.
			if (sibling && !/\bdgrid-preload\b/.test(sibling.className)) {
				return sibling.offsetTop - rowElement.offsetTop;
			}

			return rowElement.offsetHeight;
		},

		_calcAverageRowHeight: function (rowElements) {
			// summary:
			//		Sets this.rowHeight based on the average from heights of the provided row elements.

			var count = rowElements.length;
			var height = 0;
			for (var i = 0; i < count; i++) {
				height += this._calcRowHeight(rowElements[i]);
			}
			// only update rowHeight if elements were passed and are in flow
			if (count && height) {
				this.rowHeight = height / count;
			}
		},

		_processScroll: function (evt) {
			// summary:
			//		Checks to make sure that everything in the viewable area has been fetched,
			//		triggering a request for the necessary data if needed.

			if (!this.bodyNode.domNode || !this.contentNode.domNode) {
				this._startingIndex = 0;
				this._end = this.rowsPerPage;
				return this.renderRange(0, this.rowsPerPage);
			} else if (!this.rowHeight) {
				this._calcAverageRowHeight(
					this.contentNode.domNode ? this.contentNode.domNode.getElementsByClassName('dgrid-row') : []
				);
			}

			var visibleTop = (evt && evt.scrollTop) || this.getScrollPosition().y;
			var count = Math.ceil((this.bodyNode.domNode.offsetHeight/this.rowHeight)) + 1;
			var startingIndex = Math.floor(visibleTop/this.rowHeight);
			var end = startingIndex + count;
			if (this._startingIndex < startingIndex && this._end > end) {
				return when();
			}

			count = Math.max(count, this.rowsPerPage);
			end = startingIndex + count + this.bufferRows;
			startingIndex = Math.max(0, startingIndex - this.bufferRows);
			if (this._total) {
				startingIndex = Math.min(startingIndex, this._total - count);
			}

			return this.renderRange(startingIndex, end);
		},

		renderRange: function(startingIndex, end) {
			if (!this._renderedCollection) {
				return;
			}

			var results = this._renderedCollection.fetchRange({
				start: startingIndex,
				end: end
			});
			var self = this;
			return results.totalLength.then(function (length) {
				self._startingIndex = startingIndex;
				self._end = end;
				self._total = length;
				return results.then(function (data) {
					self.renderArray(data);
				});
			});
		},

		renderData: function() {
			this.inherited(arguments);
			if (this._total) {
				var rowHeight = this.rowHeight || 20;
				this.contentNode.children.unshift(
					h('div', {
						key: 'before-node',
						style: 'height: ' + (this._startingIndex * rowHeight) + 'px;'
					})
				);

				this.contentNode.children.push(
					h('div', {
						key: 'after-node',
						style: 'height: ' + ((this._total - this._end) * rowHeight) + 'px;'
					})
				);

			}
		}
	});

});
