(function() {

	Math.unsafeRandom = Math.random;
	Math.unsafeRandInt = (n)=>Math.floor(Math.unsafeRandom()*n);

	Math.uid = (function() {
		let codes = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		let counter = 0;

		return function() {
			counter = (counter+1)%100000;	// assumes we won't make more than n items in the same millisecond
			let n = Math.floor(Date.now()/1000)*100000 + counter;
			let uid = '';
			while( n > 0 ) {
				let q = n - Math.floor(n/codes.length)*codes.length;
				n = Math.floor(n/codes.length);
				uid += codes.charAt(q);
			}
			return uid;
		}
	})();

	Object.forEach = (obj,fn) => {
		for( let key in obj ) {
			if(!obj.hasOwnProperty(key)) continue;
			fn(obj[key],key);
		}
		return obj;
	};

	Date.prototype.addHours = function(h) {
		this.setTime(this.getTime() + (h*60*60*1000));
		return this;
	}
	Date.standard = function(dateTime = new Date()) {
		let m = dateTime;
		let dateString =
			m.getFullYear() + "-" +
			("0" + (m.getMonth()+1)).slice(-2) + "-" +
			("0" + m.getDate()).slice(-2) + " " +
			("0" + m.getHours()).slice(-2) + ":" +
			("0" + m.getMinutes()).slice(-2) + ":" +
			("0" + m.getSeconds()).slice(-2);
		return dateString;
	}

	let consoleLog = console.log;
	console.logPrior = consoleLog;
	console.log = function(...args) {
		let dateTime = Date.standard();
		return consoleLog('['+dateTime+']',...args);
	}

})();