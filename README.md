# next + Tiptap

## 安装依赖

```bash
p i @tiptap/react @tiptap/pm @tiptap/starter-kit
p i @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header
p i @tiptap/extension-task-list @tiptap/extension-task-item
p i @tiptap/extension-unique-id @tiptap/extension-table-of-contents
p i @tiptap/extension-underline @tiptap/extension-subscript @tiptap/extension-superscript @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-font-family @tiptap/extension-highlight @tiptap/extension-text-align @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder @tiptap/extension-typography
```

```bash
p i file-saver --save
p i @types/file-saver --save-dev
```

> FileSaver.js 是用于在客户端保存文件的解决方案，非常适合在客户端生成文件的 Web 应用程序。但是，如果文件来自服务器，我们建议您首先尝试使用 Content-Disposition 附件响应标头，因为它具有更好的跨浏览器兼容性。

```bash
p i mammoth
```

> Mammoth 旨在将 .docx 文档（例如 Microsoft Word、Google Docs 和 LibreOffice 创建的文档）转换为 HTML。Mammoth 的目标是利用文档中的语义信息并忽略其他细节，从而生成简洁清晰的 HTML 代码。例如，Mammoth 会将所有样式为 Heading 1 段落转换为 h1 元素，而不是试图完全复制标题的样式（字体、字号、颜色等）

```bash
p i html2canvas
```

> 该脚本允许您直接在用户浏览器上截取网页或其部分内容的“屏幕截图”。由于截图基于 DOM，因此可能无法 100% 精确地还原网页的真实面貌，因为它并非实际截取屏幕截图，而是根据页面上的可用信息构建的。

```bash
p i jspdf
```

> JavaScript 中生成 PDF 的库。

```bash
p i docx
```

> 使用 JS/TS 轻松生成和修改.docx 文件。支持 Node 和浏览器环境。

```bash
p i markdown-it
p i --save-dev @types/markdown-it
```
