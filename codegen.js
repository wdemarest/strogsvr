console.log( "This app generates valid codes for users to substitute for payment." );
console.log( "Copy the codes into the codes.json file." );
console.log("{");
var list = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
var j = 0;
var taken = {};
var jMax = 100;
for( j=0 ; j<jMax ; ++j ) {
	do {
		var s = '';
		var i=0;
		for( i=0 ; i<4 ; ++i ) {
			let index = Math.floor(Math.random()*list.length);
			s += list.substr(index,1);
		}
	} while( taken[s] );
	taken[s] = true;
	console.log( "\t\""+s+"\": 1"+((j===jMax-1)?'':',') );
}
console.log("}");
