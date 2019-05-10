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

})();