(function() {
/*
You can use Serial to serialize data. For saving to disk, give it an array of fields
you want to save as Serial.Save.myClass = ['...'] and be sure that the FIRST element is the index.

For serializing to a client, set up Serial.Client the same way.

register('myClassName',{
		save: {},		// Array specifies what serializes to persistent storage
		client: {},		// Array specifies what serializes to client as game state, or if missing, .Save is used.
		idKey: {},		// Specifies what field is to be used as the _id key.
		make: {},		// Used to create new classes, really intended for the server side.
		table: {},		// The database table that will be storing this kind of record.
		version: {}		// The file format version. Increment when there is no backward compatibility.
	};

*/

	class Serial {
		constructor() {
			this.meta = {};
		}
		register(className,data) {
			console.assert(className);
			console.assert(data);
			console.assert(!this.meta[className]);
			data.className = className;
			this.meta[className] = data;
		}
		getClassName(obj) {
			return typeof obj == 'object' && obj !== null && !Array.isArray(obj) ? obj.constructor.name : null;
		}
		getMeta(className) {
			console.assert(className);
			return this.meta[className];
		}
		deduceMeta(obj) {
			let className = this.getClassName(obj);
			return this.getMeta(className);
		}
		distill(obj,methodList) {
			console.assert(methodList);
			let className = this.getClassName(obj)
			if( className ) {
				let meta = this.getMeta(className) || {};
				console.logSerial('making from',className,'is',meta.make?'custom':className);
				let roster;
				methodList.forEach( method => roster = roster || meta[method] );
				roster = roster || Object.keys(obj);
				let result = meta.make ? { _c: className } : {};
				if( meta.version ) {
					result._version = meta.version;
				}
				roster.forEach( key => {
					if( typeof obj[key] === 'function' ) {
						console.logSerial('skipping fn',key);
					}
					else {
						console.logSerial('key',key);
						result[key] = this.distill(obj[key],methodList);
					}
				});
				return result;
			}
			if( Array.isArray(obj) ) {
				console.logSerial('making array, length',obj.length);
				let result = [];
				obj.forEach( value => {
					if( typeof value !== 'function' ) {
						result.push( this.distill(value,methodList) );
					}
				});
				return result;
			}
			return obj;
		}
		inject(target,data) {
			if( typeof data == 'object' && !Array.isArray(data) && data !== null ) {
				let meta = data._c ? this.meta[data._c] : {};
				// Discard any data that is in too old a version format.
				if( data._version && data._c && meta.version && meta.version > data._version ) {
					return;
				}
				// Check that a .Make exists for this data type.
				if( data._c && !meta.make ) {
					throw 'No make for '+data._c;
				}
				// Create the class instance.
				target = (data._c ? meta.make(data) : null) || target || {};
				for( let key in data ) {
					if( key == '_c' || key == '_id' || key == '_version' ) continue;
					target[key] = this.inject(target[key],data[key]);
				}
				return target;
			}
			if( Array.isArray(data) ) {
				target = [];
				for( let i=0 ; i<data.length ; ++i ) {
					target[i] = this.inject(null,data[i]);
				}
				target.length = data.length;
				return target;
			}
			return data;
		}
	}

	module.exports = Serial;

})();
