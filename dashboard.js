const API_URL = "https://term-paper-n4kl.onrender.com";
let currentUser = null;
let appSettings = {theme: 'system', fontSize: 16, notifications: true};
let isGenerating = false;
let recognition = null;
let isRecording = false;
let activeChatHistory = [];
let latestResultText = "";
let activePaperProjectId = null;
let activeTocCode = null;
let activePromptCode = null;
let tocGenerated = false;
let activeSectionOrder = 0;
let workflowArabicPage = 1;
let workflowBusy = false;
let projectMerged = false;
let activePreliminaryPageCount = 1;

// Clean model text before rendering
function cleanPaperText(text){
  if(!text) return "";
  return text
    .replace(/\u200b/g,'')
    .replace(/\ufeff/g,'')
    .replace(/^\s*\.{2,}\s*$/gm,'')
    .replace(/^\s*\-{3,}\s*$/gm,'')
    .replace(/^\s*\*{3,}\s*$/gm,'')
    .replace(/(\w+)-\s*\n\s*(\w+)/g,'$1$2')
    .replace(/(\w+)-\s+(\w+)/g,'$1$2')
    .replace(/^\s*\*\*\s*([0-9A-Za-z\.\-\,\s\(\)\"\'\’\“]+?)\s*\*\*\s*$/gm, '### $1')
    .replace(/^\s*\*\*\s*(.+?)\s*\*\*\s*$/gm, '### $1')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

// Improved markdown -> HTML
function markdownToHTML(markdown) {
  if (!markdown) return "";
  const richMarker = "[[TEMPAPER_RICH_HTML]]";
  if (String(markdown).startsWith(richMarker)) return String(markdown).slice(richMarker.length);
  const lines = String(markdown).replace(/\r/g, "").split("\n");
  const out = [];
  let paragraph = [], listItems = [], listType = null;
  const esc = value => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const inline = value => esc(value)
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/`(.+?)`/g,"<code>$1</code>");
  const flushParagraph = () => {
    if (paragraph.length) { out.push(`<p>${inline(paragraph.join(" ").trim())}</p>`); paragraph=[]; }
  };
  const flushList = () => {
    if (listItems.length) {
      out.push(`<${listType || "ul"}>${listItems.map(item=>`<li>${inline(item)}</li>`).join("")}</${listType || "ul"}>`);
      listItems=[]; listType=null;
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); flushList(); continue; }

    let m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      flushParagraph();
      flushList();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      continue;
    }

    m = line.match(/^\*\*\s*(\d+\.\d+(?:\.\d+)?\s+.+?)\s*\*\*$/);
    if (m) {
      flushParagraph();
      flushList();
      out.push(`<h3>${inline(m[1])}</h3>`);
      continue;
    }

    m = line.match(/^(\d+\.\d+(?:\.\d+)?)[.)]?\s+(.+)$/);
    if (m && (m[2].length < 160) && !/^\*\*/.test(m[2])) {
      flushParagraph();
      flushList();
      out.push(`<h3>${inline(m[1] + " " + m[2])}</h3>`);
      continue;
    }

    if (/^chapter\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(line)) {
      flushParagraph();
      flushList();
      out.push(`<h1>${inline(line.replace(/^\*\*|\*\*$/g, ""))}</h1>`);
      continue;
    }

    m = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (m || /^[-*+]\s+/.test(line)) {
      flushParagraph();
      const type = m ? "ol" : "ul";
      if (listType && listType !== type) flushList();
      listType = type;
      listItems.push(m ? m[2] : line.replace(/^[-*+]\s+/, ""));
      continue;
    }

    flushList();
    paragraph.push(line.replace(/^>\s?/, ""));
  }

  flushParagraph();
  flushList();
  return out.join("\n");
}

// FIXED: no double append
function paginateContent(html) {
  const measureWrapper = document.createElement('div');
  measureWrapper.style.position = 'absolute';
  measureWrapper.style.left = '-99999px';
  measureWrapper.style.top = '-99999px';
  document.body.appendChild(measureWrapper);

  const measurePage = document.createElement('div');
  measurePage.style.width = '794px';
  measurePage.style.boxSizing = 'border-box';
  measurePage.style.fontFamily = "'Merriweather', serif";
  measurePage.style.fontSize = '15px';
  measurePage.style.lineHeight = '1.82';
  measurePage.style.padding = '0';

  const measureBody = document.createElement('div');
  measureBody.style.height = `${1056 - 140}px`;
  measureBody.style.overflow = 'hidden';
  measureBody.style.boxSizing = 'border-box';

  const measureContent = document.createElement('div');
  measureContent.style.width = '100%';
  measureContent.style.boxSizing = 'border-box';
  measureContent.style.fontFamily = "'Merriweather', serif";
  measureContent.style.fontSize = '15px';
  measureContent.style.lineHeight = '1.82';

  measureBody.appendChild(measureContent);
  measurePage.appendChild(measureBody);
  measureWrapper.appendChild(measurePage);

  const temp = document.createElement('div');
  temp.innerHTML = html;
  const blocks = Array.from(temp.children).map(n => n.cloneNode(true));
  const pages = [];
  measureContent.innerHTML = '';

  const fits = () => measureContent.scrollHeight <= measureBody.clientHeight + 0.5;

  const testAppend = node => {
    measureContent.appendChild(node);
    const ok = fits();
    if (!ok) measureContent.removeChild(node);
    return ok;
  };

  for (let i = 0; i < blocks.length; i++) {
    let node = blocks[i];

    if (node.nodeType === 3) {
      if (!node.textContent.trim()) continue;
      const p = document.createElement('p');
      p.innerHTML = node.textContent.trim();
      node = p;
    }

    const clone = node.cloneNode(true);
    const headingLabel = (clone.textContent || "").trim();

    const isMajorPageHeading =
      /^\s*(certification|declaration|dedication|acknowledg(?:e)?ments?|abstract|table of contents|contents|chapter\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b|references|appendices)/i
      .test(headingLabel);

    if (isMajorPageHeading && measureContent.childNodes.length > 0) {
      pages.push(Array.from(measureContent.childNodes).map(n => n.cloneNode(true)));
      measureContent.innerHTML = '';
    }

    const isSectionHeading = /^H[1-3]$/.test(clone.tagName || "");

    if (isSectionHeading && i + 1 < blocks.length) {
      const nextBlock = blocks[i + 1].cloneNode(true);
      const pair = document.createDocumentFragment();

      pair.appendChild(clone.cloneNode(true));
      pair.appendChild(nextBlock);
      measureContent.appendChild(pair);

      if (fits()) {
        i++;
        continue;
      }

      measureContent.removeChild(measureContent.lastChild);
      measureContent.removeChild(measureContent.lastChild);

      if (measureContent.childNodes.length > 0) {
        pages.push(Array.from(measureContent.childNodes).map(n => n.cloneNode(true)));
        measureContent.innerHTML = '';
      }

      const retryPair = document.createDocumentFragment();
      retryPair.appendChild(clone.cloneNode(true));
      retryPair.appendChild(nextBlock.cloneNode(true));
      measureContent.appendChild(retryPair);

      if (fits()) {
        i++;
        continue;
      }

      measureContent.removeChild(measureContent.lastChild);
      measureContent.removeChild(measureContent.lastChild);
    }

    if (testAppend(clone.cloneNode(true))) {
      continue;
    }

    if (measureContent.childNodes.length > 0) {
      pages.push(Array.from(measureContent.childNodes).map(n => n.cloneNode(true)));
      measureContent.innerHTML = '';
    }

    if (testAppend(clone.cloneNode(true))) {
      continue;
    }

    const text = (clone.textContent || '').trim();
    if (!text) continue;

    const words = text.split(/\s+/);
    let buffer = '';

    for (let w = 0; w < words.length; w++) {
      const tryText = buffer ? (buffer + ' ' + words[w]) : words[w];
      const testP = document.createElement('p');
      testP.textContent = tryText;

      if (testAppend(testP.cloneNode(true))) {
        buffer = tryText;
      } else {
        if (buffer) {
          const toAppend = document.createElement('p');
          toAppend.textContent = buffer;
          measureContent.appendChild(toAppend);
        } else {
          const forced = document.createElement('p');
          forced.textContent = words[w];
          measureContent.appendChild(forced);
          w++;
        }

        buffer = '';
      }
    }

    if (buffer) {
      const finalP = document.createElement('p');
      finalP.textContent = buffer;
      measureContent.appendChild(finalP);
    }
  }

  if (measureContent.childNodes.length > 0) {
    pages.push(Array.from(measureContent.childNodes).map(n => n.cloneNode(true)));
  }

  measureWrapper.remove();

  return pages.map((page, index) => {
    const pageElement = document.createElement('div');
    pageElement.className = 'paper-page';
    pageElement.dataset.page = String(index + 1);

    const contentElement = document.createElement('div');
    contentElement.className = 'paper-page-content';

    page.forEach(node => contentElement.appendChild(node.cloneNode(true)));

    const pageNumber = document.createElement('div');
    pageNumber.className = 'paper-page-number';
    pageNumber.textContent = String(index + 1);

    pageElement.appendChild(contentElement);
    pageElement.appendChild(pageNumber);

    return pageElement;
  });
}
