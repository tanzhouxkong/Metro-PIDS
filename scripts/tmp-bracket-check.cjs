const fs = require('fs');
const s = fs.readFileSync(process.argv[2] || 'main.js', 'utf8');
const stack = [];
let state = 'code';
let line = 1;
let col = 0;
for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  if (ch === '\n') { line++; col = 0; } else { col++; }
  if (state === 'code') {
    if (ch === '"') { state = 'dquote'; continue; }
    if (ch === "'") { state = 'squote'; continue; }
    if (ch === '`') { state = 'bquote'; continue; }
    if (ch === '/' && i + 1 < s.length) {
      const n = s[i + 1];
      if (n === '/') { state = 'linecomment'; i++; col++; continue; }
      if (n === '*') { state = 'blockcomment'; i++; col++; continue; }
    }
    if ('({['.includes(ch)) stack.push({ ch, line, col });
    else if (')}]'.includes(ch)) {
      if (!stack.length) {
        console.log(`EXTRA_CLOSE ${ch} at ${line}:${col}`);
        process.exit(0);
      }
      const top = stack[stack.length - 1];
      const ok = (top.ch === '(' && ch === ')') || (top.ch === '{' && ch === '}') || (top.ch === '[' && ch === ']');
      if (!ok) {
        console.log(`MISMATCH open ${top.ch} at ${top.line}:${top.col} close ${ch} at ${line}:${col}`);
        process.exit(0);
      }
      stack.pop();
    }
  } else if (state === 'dquote') {
    if (ch === '\\') { i++; if (i < s.length) { if (s[i] === '\n') { line++; col = 0; } else { col++; } } continue; }
    if (ch === '"') state = 'code';
  } else if (state === 'squote') {
    if (ch === '\\') { i++; if (i < s.length) { if (s[i] === '\n') { line++; col = 0; } else { col++; } } continue; }
    if (ch === "'") state = 'code';
  } else if (state === 'bquote') {
    if (ch === '\\') { i++; if (i < s.length) { if (s[i] === '\n') { line++; col = 0; } else { col++; } } continue; }
    if (ch === '`') state = 'code';
  } else if (state === 'linecomment') {
    if (ch === '\n') state = 'code';
  } else if (state === 'blockcomment') {
    if (ch === '*' && i + 1 < s.length && s[i + 1] === '/') { state = 'code'; i++; col++; }
  }
}
console.log('UNCLOSED_COUNT=' + stack.length);
for (const item of stack.slice(-30)) {
  console.log(`OPEN ${item.ch} at ${item.line}:${item.col}`);
}
