/* eslint-disable no-console */
/**
 * 验证 src/**.js 中的 runtime template(`...`) 是否能被 Vue 编译器正确解析。
 * 用于定位 “compiler-23” 这类仅在运行时编译时报错的问题。
 */
const fs = require('fs')
const path = require('path')

// Vue 3 编译器（随 vue 依赖安装）
let compile
try {
  ;({ compile } = require('@vue/compiler-dom'))
} catch (e) {
  // vue 也可能内置路径可用
  try {
    ;({ compile } = require('vue/compiler-dom'))
  } catch (e2) {
    console.error('❌ 未找到 @vue/compiler-dom，请先 npm install')
    process.exit(2)
  }
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (ent.isFile() && p.endsWith('.js')) out.push(p)
  }
  return out
}

function extractTemplates(fileText) {
  // 仅粗略匹配 template: ` ... `
  // 约束：项目里模板基本不含反引号嵌套；若未来出现，请改成更严格的 JS AST 解析。
  const results = []
  const re = /template\s*:\s*`([\s\S]*?)`\s*[,\n}]/g
  let m
  while ((m = re.exec(fileText))) {
    results.push({ template: m[1], index: m.index })
  }
  return results
}

function toLineCol(text, idx) {
  const upTo = text.slice(0, idx)
  const lines = upTo.split(/\r?\n/)
  return { line: lines.length, col: lines[lines.length - 1].length + 1 }
}

function pad(n, w = 4) {
  const s = String(n)
  return s.length >= w ? s : ' '.repeat(w - s.length) + s
}

function printContext(template, errLoc, contextLines = 3) {
  if (!errLoc || typeof errLoc.line !== 'number') return
  const lines = template.split(/\r?\n/)
  const start = Math.max(1, errLoc.line - contextLines)
  const end = Math.min(lines.length, errLoc.line + contextLines)
  for (let i = start; i <= end; i++) {
    const prefix = i === errLoc.line ? '>' : ' '
    console.log(`${prefix}${pad(i)}|${lines[i - 1]}`)
    if (i === errLoc.line && errLoc.column) {
      console.log(` ${' '.repeat(4)}|${' '.repeat(Math.max(0, errLoc.column - 1))}^`)
    }
  }
}

function validateFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const templates = extractTemplates(text)
  if (!templates.length) return { checked: 0, errors: 0 }

  let errors = 0
  for (let i = 0; i < templates.length; i++) {
    const { template, index } = templates[i]

    // 如果模板里出现 JS 插值（${...}），运行时才会替换；这里无法静态得到最终模板，跳过并提示
    if (/\$\{[\s\S]*?\}/.test(template)) {
      continue
    }

    const filePos = toLineCol(text, index)
    const localErrors = []
    try {
      compile(template, {
        onError: (e) => localErrors.push(e),
        comments: true
      })
    } catch (e) {
      localErrors.push(e)
    }

    if (localErrors.length) {
      errors += localErrors.length
      console.log('\n' + '='.repeat(80))
      console.log(`❌ 模板编译失败: ${filePath}`)
      console.log(`   template: \`...\` 起始位置: ${filePos.line}:${filePos.col}`)
      for (const err of localErrors) {
        const msg = err && err.message ? err.message : String(err)
        console.log(`\n- 错误: ${msg}`)
        if (err.loc && err.loc.start) {
          console.log(`  位置: template ${err.loc.start.line}:${err.loc.start.column}`)
          printContext(template, { line: err.loc.start.line, column: err.loc.start.column })
        }
      }
    }
  }

  return { checked: templates.length, errors }
}

function main() {
  const root = path.resolve(__dirname, '..')
  const srcDir = path.join(root, 'src')
  const files = walk(srcDir)
  let checkedFiles = 0
  let checkedTemplates = 0
  let totalErrors = 0

  for (const f of files) {
    const res = validateFile(f)
    if (res.checked > 0) checkedFiles++
    checkedTemplates += res.checked
    totalErrors += res.errors
  }

  console.log('\n' + '-'.repeat(80))
  console.log(`检查完成：文件=${checkedFiles}，template=${checkedTemplates}，错误=${totalErrors}`)
  if (totalErrors > 0) process.exit(1)
}

main()

