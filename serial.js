(function() {
/*
You can use Serial to serialize data. For saving to disk, give it an array of fields
you want to save as Serial.save.myClass = ['...'] and be sure that the FIRST element is the index.

For serializing to a client, set up Serial.Client the same way.

Remember that everything in an object will be 

register('myClassName',{
		save: [],		// Array specifies what serializes to persistent storage, like ['myvar', 'other']
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
		// DISTILL
		// This compiles all the data together into a new object, ready for saving or whatever use
		distill(obj,filterList,depth=0) {
			console.assert(filterList);
			let className = this.getClassName(obj)
			if( className ) {
				let meta = this.getMeta(className) || {};
				console.logSerial('making from',className,'is',meta.make?'custom':className, 'filterList:',filterList);
				//console.logSerial('meta=',meta);
				// Assemble the roster of all fields that should be kept. For example, meta might
				// have meta.save that specifies a bunch of members to keep, but also maybe meta.client
				// which are the members to save only on the client.
				let roster = [];
				filterList.forEach( filter => {
					if( meta[filter] ) {
						console.assert( Array.isArray(meta[filter]) );
						roster.push( ...meta[filter] );
					}
				});
				// If no fields are specified to be saved, then default to saving all fields. Note
				// that this will save any field with the value 'undefined'.
				if( roster.length <= 0 ) {
					roster = Object.keys(obj);
				}
				// If there is a data making function, annotate it with the class name
				let result = meta.make ? { _c: className } : {};
				// If the object is trying to control its own _id, let it do so.
				if( obj._id ) {
					result._id = obj._id;
				}
				// also annotate with the version, before saving. Let the object
				// control its own version if it needs to. Otherwise, assume it is
				// the latest version.
				if( obj._version ) {
					result._version = obj._version;
					console.logSerial('_version taken from object=',result._version);
				}
				else
				if( meta.version ) {
					result._version = meta.version;
					console.logSerial('_version added=',result._version);
				}
				let stableDate = null;
				if( depth==0 && meta._created && !obj._created ) {
					stableDate = stableDate || new Date().toISOString();
					result._created = stableDate;
					console.logSerial('_created=',result._created);
				}
				if( depth==0 && meta._updated ) {
					stableDate = stableDate || new Date().toISOString();
					result._updated = stableDate;
					console.logSerial('_updated=',result._updated);
				}
				roster.forEach( key => {
					if( typeof obj[key] === 'function' ) {
						console.logSerial(depth,'skipping fn',key);
					}
					else {
						console.logSerial(depth,'key',key);
						// NOTE: The filterList is actually references to the meta data, like ['save']. So, since
						// each class gets its own save filter, you must Serial.register each one. Unless you
						// just want all the members saved which will be the default behavior if there is no registered
						// class for the object.
						result[key] = this.distill(obj[key],filterList,depth+1);
					}
				});
				if( depth==0 ) {
					console.logSerial('Final result=',result);
				}
				return result;
			}
			if( Array.isArray(obj) ) {
				console.logSerial('making array, length',obj.length);
				let result = [];
				obj.forEach( value => {
					if( typeof value !== 'function' ) {
						result.push( this.distill(value,filterList,depth+1) );
					}
				});
				if( depth==0 ) {
					console.logSerial('Final array=',result);
				}
				return result;
			}
			if( depth==0 ) {
				console.logSerial('Final obj=',obj);
			}
			return obj;
		}
		inject(target,data) {
			// If it is an object then fill it by key/value
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
				// Create the class instance. Although make() can fill it with data, that data will be
				// over-written below as the keys are iterated. Not totally sure why I did it this way.
				// Possibly to allow the make() function to be lazy? PROBABLY to allow the make function
				// to just return the correct TYPE, but filled with blanks. Which I think I fail to do properly.
				target = (data._c ? meta.make(data) : null) || target || {};
				for( let key in data ) {
					// Note that not all automated fields get excluded.
					if( key == '_c' || key == '_id' || key == '_version' ) continue;
					target[key] = this.inject(target[key],data[key]);
				}
				return target;
			}
			// If it is an array fill it by index
			if( Array.isArray(data) ) {
				target = [];
				for( let i=0 ; i<data.length ; ++i ) {
					target[i] = this.inject(null,data[i]);
				}
				target.length = data.length;
				return target;
			}
			// This data was not iterable, so just return its value to be assigned into the target.
			return data;
		}
	}

	module.exports = Serial;

})();
