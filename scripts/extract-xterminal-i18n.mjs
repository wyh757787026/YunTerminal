import { readFileSync } from 'fs'

const s = readFileSync('E:/YunTerminal/.xterminal-ref/dist/main/index.js', 'utf8')

function decode(str) {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

const idxZhSsh = s.indexOf('modalTitle:"\\u7F16\\u8F91 SSH')
console.log('ZH SSH edit at', idxZhSsh)
if (idxZhSsh >= 0) console.log(decode(s.slice(idxZhSsh - 3500, idxZhSsh + 500)))
