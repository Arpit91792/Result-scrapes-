const line = '116 0133EC203D04 Birendra Kumar Vishwkarma, S/D/W/O Chhotelal VishwakarmaEC601 [T] 22 7 6 3 3 4 D';

// Test with master catalog or known branch prefixes:
const knownPrefixes = ['CS', 'CE', 'EC', 'EX', 'ME', 'IT', 'BT', 'CH', 'CM', 'EE', 'FT', 'AU', 'TX'];
const prefixRegex = new RegExp(`([a-z0-9,.\\-\\/])(${knownPrefixes.join('|')})\\s*(\\d{3,4}[A-Z]?\\s*\\[[TP]\\])`, 'gi');
console.log('Known prefix separation:', line.replace(prefixRegex, '$1 $2$3'));

// Test general uppercase word followed by 2-letter prefix + digits:
// In VishwakarmaEC601:
// Vishwakarma ends in 'arma' or 'a'. EC601 is two uppercase letters + 3 digits.
const generalGlued = /([a-z])([A-Z]{2,4}\d{3,4}[A-Z]?\s*\[[TP]\])/g;
console.log('General glued:', line.replace(generalGlued, '$1 $2'));

const match = line.replace(generalGlued, '$1 $2').match(/\b([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s*\[([TP])\]/i);
console.log('Matched subject code:', match[1], 'type:', match[2]);
