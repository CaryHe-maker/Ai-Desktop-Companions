// Audit the index by default, or review pending edits without staging them. Never print matched values.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const workingTree=process.argv.includes('--working-tree');
const files=[...new Set(execFileSync('git',workingTree?['ls-files','--cached','--others','--exclude-standard','-z']:['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))].filter(file=>!workingTree||fs.existsSync(file));
const problems=[];
const forbidden=/(^|\/)(?:data|dist|artifacts|\.cache|node_modules|Partitions|\.aws|\.ssh|\.codex|\.agents|\.vscode|\.idea)(\/|$)|(^|\/)(?:\.env(?:\..*)?|\.npmrc|credentials[^/]*\.json|secrets[^/]*\.json|settings\.json|host\.json|chatgpt-registration\.json|history-[^/]*\.json|sessions?-[^/]*\.json|web-agents\.json|Cookies[^/]*|Login Data[^/]*|Local State)$|^assets\/(source|v2)\/|^Camera_XHS_|\.(?:pem|key|p12|pfx)$/i;
const patterns=[
 ['API key',/\bsk-[A-Za-z0-9_-]{20,}\b/],
 ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
 ['AWS key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['local user path',/(?:[A-Za-z]:[\\/]+Users[\\/]+|\/Users\/|\/home\/)[A-Za-z0-9_.-]+/],
 ['literal credential',/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client_secret)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_+\/.=-]{30,}["']/i]
];
for(const file of files){
 if(forbidden.test(file)&&file!=='.env.example')problems.push(`${file}: private/local file`);
 const buf=workingTree?fs.readFileSync(file):execFileSync('git',['show',':'+file],{maxBuffer:100*1024*1024});
 if(buf.length>25*1024*1024)problems.push(`${file}: unexpectedly large release file`);
 if(!/\.(?:c?js|cs|manifest|json|md|yml|yaml|html|css|ps1|cmd|py|txt)$/.test(file)&&!['.gitignore','.gitattributes','LICENSE'].includes(file))continue;
 const text=buf.toString('utf8');for(const [kind,re] of patterns)if(re.test(text))problems.push(`${file}: ${kind}`);
}
if(!files.length)problems.push('No tracked files to audit. Stage the intended release first.');
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}
else console.log(`PASS: ${files.length} ${workingTree?'working-tree':'indexed'} files; no blocked local files or known credential patterns found. Manual review is still required.`);
