const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const srcPath = path.join(__dirname, 'PhysicBot.user.js');
const distPath = path.join(__dirname, 'PhysicBot.protected.user.js');

console.log('⚡ Building protected PhysicBot for distribution...');
const rawCode = fs.readFileSync(srcPath, 'utf8');

// Separate Userscript metadata block from main code
const match = rawCode.match(/^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*)/);
let header = '';
let body = rawCode;

if (match) {
    header = match[1];
    body = rawCode.substring(header.length);
}

console.log('🔒 Obfuscating botnet core & security locks...');
const obfuscated = JavaScriptObfuscator.obfuscate(body, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'mangled',
    numbersToExpressions: false,
    renameGlobals: false,
    simplify: true,
    splitStrings: false,
    stringArray: false,
    transformObjectKeys: false,
    unicodeEscapeSequence: false
}).getObfuscatedCode();

const finalCode = header + '\n/* eslint-disable */\n' + obfuscated;
fs.writeFileSync(distPath, finalCode, 'utf8');

console.log('✅ Successfully created PhysicBot.protected.user.js (' + (finalCode.length / 1024).toFixed(1) + ' KB)');
