// Synchronous DOM Interaction Bridge for Loki4Agent Rhai WASM Sandbox

export function loki_sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait
  }
  return true;
}

export function loki_element_exists(selector) {
  return document.querySelector(selector) !== null;
}

export function loki_click(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.click();
    return true;
  }
  return false;
}

function focusEditable(el) {
  el.focus();
  const isContentEditable = el.hasAttribute('contenteditable') || el.getAttribute('contenteditable') === 'true' || el.contentEditable === 'true';
  if (isContentEditable) {
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false); // collapse to end
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      console.warn("Failed to set contenteditable selection range:", e);
    }
  }
}

export function loki_type_text(selector, text) {
  const el = document.querySelector(selector);
  if (el) {
    const isContentEditable = el.hasAttribute('contenteditable') || el.getAttribute('contenteditable') === 'true' || el.contentEditable === 'true';
    const hasValue = 'value' in el;

    if (hasValue) {
      el.focus();
      el.value = '';
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } else if (isContentEditable) {
      focusEditable(el);
      // Select all content and delete it first
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      // Insert the text using browser native command so DraftJS/React registers it
      document.execCommand('insertText', false, text);
      return true;
    }
  }
  return false;
}

export function loki_type_as_human(selector, text) {
  const el = document.querySelector(selector);
  if (!el) {
    return false;
  }

  const isContentEditable = el.hasAttribute('contenteditable') || el.getAttribute('contenteditable') === 'true' || el.contentEditable === 'true';
  const hasValue = 'value' in el;

  if (!hasValue && !isContentEditable) {
    return false;
  }

  if (hasValue) {
    el.focus();
    el.value = '';
  } else {
    focusEditable(el);
    // Clear contenteditable content first
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Dispatch Keydown event
    const keydownEvent = new KeyboardEvent('keydown', {
      key: char,
      code: `Key${char.toUpperCase()}`,
      bubbles: true,
      cancelable: true
    });
    el.dispatchEvent(keydownEvent);

    if (hasValue) {
      el.value += char;
      // Dispatch Input event (notifies frameworks of state changes for standard inputs)
      const inputEvent = new Event('input', { bubbles: true });
      el.dispatchEvent(inputEvent);
    } else {
      // Use document.execCommand to insert the character natively so DraftJS handles state updates
      document.execCommand('insertText', false, char);
    }

    // Dispatch Keyup event
    const keyupEvent = new KeyboardEvent('keyup', {
      key: char,
      code: `Key${char.toUpperCase()}`,
      bubbles: true,
      cancelable: true
    });
    el.dispatchEvent(keyupEvent);

    // Simulate human typing speed (random 40ms - 120ms delay per keypress)
    const typingDelay = Math.floor(Math.random() * 80) + 40;
    loki_sleep(typingDelay);
  }

  // Dispatch final Change event to lock in state
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function loki_get_text(selector) {
  const el = document.querySelector(selector);
  return el ? (el.textContent || el.innerText || "") : "";
}

export function loki_get_value(selector) {
  const el = document.querySelector(selector);
  return el ? (('value' in el) ? el.value : "") : "";
}

export function loki_get_attribute(selector, attr) {
  const el = document.querySelector(selector);
  return el ? (el.getAttribute(attr) || "") : "";
}

export function loki_scroll_to(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.scrollIntoView({ behavior: 'auto', block: 'center' });
    return true;
  }
  return false;
}

export function loki_get_loki_data(dom_selector) {
  const root = document.querySelector(dom_selector);
  if (!root) return `Error: Container ${dom_selector} not found`;
  const lokiNodes = root.querySelectorAll('[data-loki]');
  let result = `# Container: ${dom_selector}\n`;
  lokiNodes.forEach((node) => {
    const tagName = node.tagName.toLowerCase();
    const dataLoki = node.getAttribute('data-loki');
    const cssPath = getUniqueSelector(node);
    result += `- [${tagName}] css: "${cssPath}" | data-loki: "${dataLoki}"\n`;
  });
  return result;
}

function getUniqueSelector(el) {
  if (el.id) return `#${el.id}`;
  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.className) {
      const firstClass = el.className.trim().split(/\s+/)[0];
      if (firstClass && !firstClass.includes(':')) {
        selector += `.${firstClass}`;
      }
    }
    let siblings = Array.from(el.parentNode ? el.parentNode.children : []);
    if (siblings.filter(s => s.nodeName === el.nodeName).length > 1) {
      let index = siblings.indexOf(el) + 1;
      selector += `:nth-child(${index})`;
    }
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(' > ');
}

export function loki_dom_to_string() {
  function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.trim();
      return text ? document.createTextNode(text) : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tagName = node.tagName.toLowerCase();
    const ignoredTags = ['script', 'style', 'noscript', 'iframe', 'svg', 'path', 'head', 'link', 'meta'];
    if (ignoredTags.includes(tagName)) return null;

    const dataLoki = node.getAttribute('data-loki');
    const isInteractive = ['button', 'input', 'select', 'textarea', 'a'].includes(tagName);
    const hasId = node.id;
    
    const cleanedChildren = [];
    node.childNodes.forEach((child) => {
      const cleaned = cleanNode(child);
      if (cleaned) cleanedChildren.push(cleaned);
    });

    if (dataLoki || isInteractive || hasId || cleanedChildren.length > 0) {
      const cloned = document.createElement(tagName);
      const preservedAttrs = ['id', 'data-loki', 'name', 'type', 'placeholder', 'value', 'href', 'disabled', 'checked', 'required'];
      preservedAttrs.forEach((attr) => {
        const val = node.getAttribute(attr);
        if (val !== null) cloned.setAttribute(attr, val);
      });

      cleanedChildren.forEach(child => cloned.appendChild(child));
      return cloned;
    }
    return null;
  }

  const cleanedRoot = cleanNode(document.body);
  return cleanedRoot ? cleanedRoot.outerHTML : "";
}
