define([
	'dgrid/test/data/createAsyncStore',
	'dgrid/test/data/createSyncStore'
], function (createAsyncStore, createSyncStore) {
	var useAsync = location.search.indexOf('async') > -1;
	var createStore = useAsync ? createAsyncStore : createSyncStore;

	// Variables for modifyItem
	var toModify = 0;
	var offset = 20000;

	return {
		makeColumnDef: function (fieldCount) {
			var columns = {
				id: 'ID'
			};
			for (var n = 0 ; n < fieldCount; n++) {
				columns['field' + n] = 'Field ' + n;
			}
			return columns;
		},

		makeData: function (itemCount, fieldCount) {
			var data = [];
			for (var i = 0; i < itemCount; i++) {
				var item = data[i] = { id: i };
				for (var n = 0; n < fieldCount; n++) {
					item['field' + n] = 'Data ' + n + ' - ' + i;
				}
			}
			return data;
		},

		makeStore: function (args) {
			return createStore(args);
		},

		modifyItem: function (store) {
			return store.get(toModify).then(function (item) {
				item.field0 = 'XXX ' + offset;
				offset++;
				toModify = (toModify + 1) % 3;
				return store.put(item);
			});
		}
	};
});
