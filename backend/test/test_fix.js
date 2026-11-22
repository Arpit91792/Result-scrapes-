const line = '116 0133EC203D04 Birendra Kumar Vishwkarma, S/D/W/O Chhotelal VishwakarmaEC601 [T] 22 7 6 3 3 4 D';

// Test 1: pre-separating lowercase-uppercase boundary before subject code
const preProcessed = line.replace(/([a-z])([A-Z]{2,4}\s*\d{3,4}[A-Z]?\s*\[[TP]\])/gi, '$1 $2');
console.log('Preprocessed line:', preProcessed);
const regex1 = /\b([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s*\[([TP])\]/i;
const m1 = preProcessed.match(regex1);
console.log('Match with pre-separation:', m1[1], m1[2]);

// What if the glued text was VishwakarmaEC601 without case, but we have master catalog?
// Or subject codes always start with 2 uppercase letters and 3 digits:
const GLUED_SUBJECT_REGEX = /([a-z0-9,.\-\/])([A-Z]{2,4}\s*\d{3,4}[A-Z]?\s*\[[TP]\])/g;
console.log('Replace all glued:', line.replace(GLUED_SUBJECT_REGEX, '$1 $2'));
