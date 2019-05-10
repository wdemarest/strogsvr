(function() {

	class DbMemory {
		constructor(serial) {
			this.serial = serial;
			this.collectionHash = {};
			this.table = null;
			this.reset();
		}
		get data() {
			return this.collectionHash[this.table];
		}
		set data(value) {
			return this.collectionHash[this.table] = value;
		}
		collection(table) {
			this.table = table;
			this.collectionHash[table] = this.collectionHash[table] || {};
			return this;
		}
		filterSplit(filter) {
			let field = Object.keys(filter)[0];
			console.assert(field);
			let value = Object.values(filter)[0];
			console.assert(typeof value !== undefined);
			return { field: field, value: value };
		}
		deleteOne(filter) {
			let id = this.filterSplit(filter);
			this.data[id.value] = null;
			this.table = null;
		}
		deleteMany(filter) {
			console.assert( Object.keys(filter).length == 0 );
			this.data = {}
			this.table = null;
		}
		updateOne(filter,action,options) {
			console.assert( options.upsert );
			let id = this.filterSplit(filter);
			let a  = this.filterSplit(action);
			console.assert( Object.keys(action)[0] == '$set' );
			this.data[id.value] = action['$set'];
		}
		find(filter) {
			console.assert(this.table);
			let id = this.filterSplit(filter);
			let selection = [];

			Object.forEach( this.data, (value,key)=> {
				if( value[id.field] == id.value ) {
					selection.push(value);
				}
			});
			return {
				toArray: (fn) => {
					fn.call(this,null,selection);
				}
			}
		}
	}

	module.exports = DbMemory;

})();