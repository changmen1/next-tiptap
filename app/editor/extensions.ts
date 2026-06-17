import StarterKit from '@tiptap/starter-kit';
// 下划线：支持 editor.chain().toggleUnderline()
import Underline from '@tiptap/extension-underline';

// 下标：例如 H₂O 里的 ₂
import Subscript from '@tiptap/extension-subscript';

// 上标：例如 x²、参考文献[1] 里的 ² / [1]
import Superscript from '@tiptap/extension-superscript';

// 文本样式基础扩展：字体、字号、颜色等很多样式都依赖它
import { TextStyle } from '@tiptap/extension-text-style';

// 文字颜色：支持设置字体颜色，例如红色、蓝色
import Color from '@tiptap/extension-color';

// 字体族：支持设置宋体、黑体、Times New Roman 等字体
import FontFamily from '@tiptap/extension-font-family';

// 高亮：支持给文字添加背景高亮色
import Highlight from '@tiptap/extension-highlight';

// 文本对齐：支持左对齐、居中、右对齐、两端对齐
import TextAlign from '@tiptap/extension-text-align';

// 超链接：支持给文字添加链接地址
import Link from '@tiptap/extension-link';

// 图片：支持在编辑器中插入图片
import Image from '@tiptap/extension-image';

// 占位提示：编辑器为空时显示提示文字，例如“请输入内容...”
import Placeholder from '@tiptap/extension-placeholder';

// 排版优化：自动处理引号、破折号、省略号等英文排版符号
import Typography from '@tiptap/extension-typography';

// 任务列表：支持 Todo List / 勾选列表
import TaskList from '@tiptap/extension-task-list';

// 任务项：任务列表中的每一项，通常和 TaskList 一起使用
import TaskItem from '@tiptap/extension-task-item';

// 表格行：表格中的一行，通常需要和 Table、TableCell、TableHeader 一起使用
import TableRow from '@tiptap/extension-table-row';

import TableOfContents from '@tiptap/extension-table-of-contents';
import UniqueID from '@tiptap/extension-unique-id';
// 目录扩展需要知道编辑区滚动容器；这里通过自定义扩展在运行时绑定。
import { OutlineScrollParentBinder, getBoundOutlineScrollParent } from './extensions/OutlineScrollParentBinder';

import { ClipboardClean } from './extensions/ClipboardClean';
import { FontSize } from './extensions/FontSize';
import { LineHeight } from './extensions/LineHeight';
import { PageBreak } from './extensions/PageBreak';
import { Pagination } from './extensions/Pagination';
import { ParagraphIndent } from './extensions/ParagraphIndent';
import { TableSelectAll } from './extensions/TableSelectAll';
import { StyledTable, StyledTableCell, StyledTableHeader } from './extensions/TableStyled';

export function buildExtensions() {
  return [
    // StarterKit 提供段落、标题、列表、粗斜体、代码块、引用等基础节点/标记。
    // 这里显式配置标题层级，并给代码块/分割线加 class，方便 CSS 统一控制。
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      codeBlock: { HTMLAttributes: { class: 'code-block' } },
      horizontalRule: { HTMLAttributes: { class: 'hr' } }
    }),
    // 给 heading 节点生成稳定 ID；目录、滚动定位和锚点跳转都依赖这个 ID。
    UniqueID.configure({ types: ['heading'] }),
    // Tiptap 的目录扩展会扫描 heading，并在 editor.storage.tableOfContents 中维护目录项。
    TableOfContents.configure({
      anchorTypes: ['heading'],
      scrollParent: () => getBoundOutlineScrollParent() ?? window
    }),
    OutlineScrollParentBinder,
    // 下面是文字级格式扩展：下划线、上下标、字体、字号、颜色、高亮等。
    Underline,
    Subscript,
    Superscript,
    TextStyle,
    Color.configure({ types: ['textStyle'] }),
    FontFamily.configure({ types: ['textStyle'] }),
    FontSize,
    LineHeight,
    ParagraphIndent,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    // Link 关闭 openOnClick，避免编辑时误点链接跳走；导出时仍保留 target/rel 属性。
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }
    }),
    // 图片允许 base64，便于本地上传图片直接嵌入文档 HTML。
    Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'we-image' } }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : 'Start typing your document…')
    }),
    Typography,
    TaskList,
    TaskItem.configure({ nested: true }),
    // 表格使用自定义 StyledTable 系列，主要是为了保留 Word/Excel 粘贴来的样式属性。
    StyledTable.configure({
      resizable: true,
      lastColumnResizable: true,
      allowTableNodeSelection: true,
      HTMLAttributes: { class: 'we-table' }
    }),
    TableRow,
    StyledTableHeader,
    StyledTableCell,
    // 自定义分页、剪贴板清理、表格全选按钮等插件放在最后，确保能看到前面扩展生成的 DOM。
    PageBreak,
    Pagination,
    ClipboardClean,
    TableSelectAll
  ];
}
