const fs = require('fs');
const src = fs.readFileSync('PhysicBot.user.js', 'utf8');
const lines = src.split('\n');

const fixed = lines.map(line => {
    const trimmed = line.trimStart();
    // leave comment lines and CSS template literal lines untouched
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return line;
    if (trimmed.includes('{') && trimmed.includes(':') && trimmed.includes(';')) return line; // CSS
    // collapse 2+ spaces between code tokens down to 1
    return line.replace(/([^\s'"/])  +([^\s])/g, (_, a, b) => a + ' ' + b);
});

fs.writeFileSync('PhysicBot.user.js', fixed.join('\n'));
console.log('Done — multi-spaces fixed');
