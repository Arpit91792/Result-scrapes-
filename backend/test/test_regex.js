const line = '116 0133EC203D04 Birendra Kumar Vishwkarma, S/D/W/O Chhotelal VishwakarmaEC601 [T] 22 7 6 3 3 4 D';
const SUBJ_CODE_PATTERN = /\b([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s*\[([TP])\]/i;
console.log('Match with \\b:', line.match(SUBJ_CODE_PATTERN));

// If we look for 2-4 uppercase letters preceding digits and [T/P]
const SUBJ_CODE_PATTERN_FIXED = /(?:^|[^A-Z0-9])([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s*\[([TP])\]/i;
console.log('Match with (?:^|[^A-Z0-9]):', line.match(SUBJ_CODE_PATTERN_FIXED));

// Or if we check how VishwakarmaEC601 happened:
// The name was 'Vishwakarma' and the subject was 'EC601 [T]'
// In PDF item transforms, sometimes 'Vishwakarma' and 'EC601' touch without a space!
const GLUED_SUBJ = /([a-z])([A-Z]{2,4}\d{3,4}\s*\[[TP]\])/;
console.log('Glued test:', line.replace(GLUED_SUBJ, '$1 $2'));
