/**
 * 将内联 template: `...` 的 .js 组件拆成 .vue（template）+ .js（script src）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function findTemplateEnd(content, start) {
  let i = start
  while (i < content.length) {
    const c = content[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '$' && content[i + 1] === '{') {
      i += 2
      let depth = 1
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++
        else if (content[i] === '}') depth--
        i++
      }
      continue
    }
    if (c === '`') return i
    i++
  }
  return -1
}

function splitFile(relPath) {
  const full = path.join(root, relPath)
  if (!fs.existsSync(full)) {
    console.error('missing:', relPath)
    return
  }
  const content = fs.readFileSync(full, 'utf8')
  const m = content.match(/template:\s*`/)
  if (!m) {
    console.log('skip (no template):', relPath)
    return
  }
  const openIdx = m.index + m[0].length
  const closeIdx = findTemplateEnd(content, openIdx)
  if (closeIdx === -1) {
    console.error('no template end:', relPath)
    return
  }
  const templateBody = content.slice(openIdx, closeIdx)

  let removeStart = m.index
  let p = removeStart - 1
  while (p >= 0 && /[\s\r\n]/.test(content[p])) p--
  if (content[p] === ',') removeStart = p

  let removeEnd = closeIdx + 1
  if (content[removeEnd] === '\r') removeEnd++
  if (content[removeEnd] === '\n') removeEnd++

  const newJs = content.slice(0, removeStart) + content.slice(removeEnd)

  const dir = path.dirname(full)
  const baseName = path.basename(relPath, '.js')
  const vueRel = './' + baseName + '.js'
  const vuePath = path.join(dir, baseName + '.vue')
  const vueContent = `<template>\n${templateBody}\n</template>\n<script src="${vueRel}"></script>\n`

  fs.writeFileSync(vuePath, vueContent, 'utf8')
  fs.writeFileSync(full, newJs, 'utf8')
  console.log('ok:', relPath)
}

const files = [
  'src/App.js',
  'src/components/UnifiedDialogs.js',
  'src/components/WindowControls.js',
  'src/components/LineManagerTopbar.js',
  'src/components/EasterEggManager.js',
  'src/components/Topbar.js',
  'src/components/LineManagerDialog.js',
  'src/components/FolderLineManager.js',
  'src/components/RuntimeLineManager.js',
  'src/components/SettingsPage.js',
  'src/components/LeftRail.js',
  'src/components/AdminApp.js',
  'src/components/FolderLineManagerWindow.js',
  'src/components/SlidePanel.js'
]

for (const f of files) {
  splitFile(f)
}
