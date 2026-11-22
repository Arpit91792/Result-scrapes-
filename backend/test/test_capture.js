const regex = /(?:^|[\s,;:\-]|[a-z])([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s*\[([TP])\]/i;
const line = '116 0133EC203D04 Birendra Kumar Vishwkarma, S/D/W/O Chhotelal VishwakarmaEC601 [T] 22 7 6 3 3 4 D';
const m = line.match(regex);
console.log('Match full:', m[0]);
console.log('Capture 1 (code):', m[1]);
console.log('Capture 2 (type):', m[2]);
